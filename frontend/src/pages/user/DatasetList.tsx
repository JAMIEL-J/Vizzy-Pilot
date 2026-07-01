import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { datasetService, type Dataset, type DuckDBStatus } from "../../lib/api/dataset";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, Pill, BtnGhost, BtnSecondary, BtnPrimary } from "@/components/ui/primitive";

export default function DatasetList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowCountByDataset, setRowCountByDataset] = useState<Record<string, number>>({});
  const [syncStatusByDataset, setSyncStatusByDataset] = useState<Record<string, DuckDBStatus["status"]>>({});
  const [metadataByDataset, setMetadataByDataset] = useState<Record<string, { column_count: number; columns: string[]; raw_size: number }>>({});
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadDatasets();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadDatasets = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const data = await datasetService.listDatasets();
      if (controller.signal.aborted) return;
      setDatasets(data);
      await loadDatasetMetrics(data, controller);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error("Failed to load datasets:", err);
      setError(err.message || "An unexpected error occurred while loading datasets.");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const loadDatasetMetrics = async (datasetList: Dataset[], controller: AbortController) => {
    if (datasetList.length === 0) {
      setRowCountByDataset({});
      setSyncStatusByDataset({});
      setMetadataByDataset({});
      return;
    }

    try {
      const rowsMap: Record<string, number> = {};
      const statusMap: Record<string, DuckDBStatus["status"]> = {};
      const metadataMap: Record<string, { column_count: number; columns: string[]; raw_size: number }> = {};

      const results = await Promise.all(
        datasetList.map(async (dataset) => {
          const [latestVersionResult, duckdbStatusResult, metadataResult] = await Promise.allSettled([
            datasetService.getLatestVersion(dataset.id),
            datasetService.getDuckdbStatus(dataset.id),
            datasetService.getDatasetMetadata(dataset.id),
          ]);

          let rowCount = 0;
          if (latestVersionResult.status === "fulfilled") {
            const rawRowCount = Number(latestVersionResult.value?.row_count ?? 0);
            rowCount = Number.isFinite(rawRowCount) ? Math.max(0, rawRowCount) : 0;
          }

          const syncStatus = duckdbStatusResult.status === "fulfilled"
            ? duckdbStatusResult.value?.status || "unknown"
            : "unknown";

          let metaData = { column_count: 0, columns: [] as string[], raw_size: 0 };
          if (metadataResult.status === "fulfilled") {
            metaData = {
              column_count: metadataResult.value.column_count || 0,
              columns: metadataResult.value.columns || [],
              raw_size: metadataResult.value.raw_size || 0,
            };
          }

          return {
            datasetId: dataset.id,
            rowCount,
            syncStatus,
            metaData,
          };
        })
      );

      if (controller.signal.aborted) return;

      for (const item of results) {
        rowsMap[item.datasetId] = item.rowCount;
        statusMap[item.datasetId] = item.syncStatus;
        metadataMap[item.datasetId] = item.metaData;
      }

      setRowCountByDataset(rowsMap);
      setSyncStatusByDataset(statusMap);
      setMetadataByDataset(metadataMap);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Failed to load dataset metrics:", error);
    }
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return "-";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this dataset?")) {
      try {
        await datasetService.deleteDataset(id);
        setDatasets(datasets.filter(d => d.id !== id));
      } catch (error) {
        console.error("Failed to delete dataset:", error);
        alert("Failed to delete dataset");
      }
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const filteredDatasets = datasets.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredDatasets.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDatasets = filteredDatasets.slice(startIndex, startIndex + itemsPerPage);

  const formatUpdatedAt = (value?: string) => {
    if (!value) return "-";
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return "-";
    const elapsedMs = Date.now() - ts;
    if (elapsedMs < 60_000) return "just now";
    if (elapsedMs < 3_600_000) return `${Math.floor(elapsedMs / 60_000)}m ago`;
    if (elapsedMs < 86_400_000) return `${Math.floor(elapsedMs / 3_600_000)}h ago`;
    return `${Math.floor(elapsedMs / 86_400_000)}d ago`;
  };

  const renderSyncPill = (datasetId: string) => {
    const status = (syncStatusByDataset[datasetId] || "unknown").toLowerCase();
    if (status === "ready") {
      return (
        <Pill tone="success" className="flex items-center gap-1 font-sans">
          <CheckCircle2 className="h-3 w-3" />
          <span>Synced</span>
        </Pill>
      );
    }
    if (status === "building" || status === "converting" || status === "syncing") {
      return (
        <Pill tone="info" className="flex items-center gap-1 font-sans animate-pulse">
          <Clock className="h-3 w-3 animate-spin" />
          <span>Syncing</span>
        </Pill>
      );
    }
    if (status === "failed" || status === "error") {
      return (
        <Pill tone="danger" className="flex items-center gap-1 font-sans">
          <AlertCircle className="h-3 w-3" />
          <span>Failed</span>
        </Pill>
      );
    }
    return <Pill className="font-sans">Unknown</Pill>;
  };

  return (
    <div className="min-h-full py-6 select-none">
      <PageHeader
        breadcrumb={["Workspaces", "Vizzy Pilot", "Datasets"]}
        title="Dataset catalog"
        description={`${filteredDatasets.length} datasets available`}
        actions={(
          <div className="flex gap-2">
            <Link to="/user/upload" className="text-decoration-none">
              <BtnSecondary className="flex items-center gap-1.5">
                <Upload className="h-4 w-4" />
                <span>Upload</span>
              </BtnSecondary>
            </Link>
            <Link to="/user/connect-db" className="text-decoration-none">
              <BtnPrimary className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                <span>Connect source</span>
              </BtnPrimary>
            </Link>
          </div>
        )}
      />

      <div className="px-8 py-6">
        <Panel>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-main px-5 py-4">
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-9 flex-1 max-w-md items-center gap-2 rounded-xl border border-border-main bg-bg-card px-3 focus-within:border-themed-main transition-all">
                <Search className="h-4 w-4 text-themed-muted" />
                <input
                  value={searchTerm}
                  onChange={handleSearchChange}
                  placeholder="Search datasets, owners, tags..."
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-themed-muted/60 text-themed-main border-none font-sans"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-themed-muted">
              <span>{filteredDatasets.length} of {datasets.length} payloads</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border-main bg-surface-2 text-[9px] font-mono font-bold uppercase tracking-widest text-themed-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Dataset</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 text-right font-medium">Rows</th>
                  <th className="px-5 py-3 text-right font-medium">Cols</th>
                  <th className="px-5 py-3 text-right font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Sync</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-main">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Clock className="h-6 w-6 animate-spin text-themed-muted mb-3" />
                        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-themed-muted">Loading datasets...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-700 mb-4 ring-1 ring-rose-200">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <h3 className="text-sm font-sans font-bold text-themed-main mb-1">Failed to load datasets</h3>
                        <p className="text-xs text-themed-muted max-w-xs">{error}</p>
                        <BtnSecondary className="mt-4" onClick={loadDatasets}>Try Again</BtnSecondary>
                      </div>
                    </td>
                  </tr>
                ) : paginatedDatasets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 border border-border-main shadow-sm">
                          <Database className="h-5 w-5 text-themed-muted" />
                        </div>
                        <div>
                          <h3 className="text-sm font-sans font-bold text-themed-main mb-1">No datasets found</h3>
                          <p className="text-xs text-themed-muted max-w-xs mx-auto leading-relaxed">
                            {searchTerm 
                              ? "No datasets match your current search criteria. Try adjusting your filters." 
                              : "You haven't connected any datasets yet. Get started by uploading a file or connecting a database."}
                          </p>
                        </div>
                        {!searchTerm && (
                          <div className="flex items-center justify-center gap-3 pt-2">
                            <Link to="/user/connect-db" className="text-decoration-none">
                              <BtnPrimary className="flex items-center gap-1.5"><Plus className="h-4 w-4" /><span>Connect source</span></BtnPrimary>
                            </Link>
                            <Link to="/user/upload" className="text-decoration-none">
                              <BtnSecondary className="flex items-center gap-1.5"><Upload className="h-4 w-4" /><span>Upload CSV</span></BtnSecondary>
                            </Link>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedDatasets.map(d => (
                    <tr key={d.id} className="group hover:bg-surface-2 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-8 w-8 place-items-center rounded-xl bg-surface-2 border border-border-main text-themed-muted shadow-sm">
                            <FileSpreadsheet className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-themed-main">{d.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill className="font-sans flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          <span>DuckDB</span>
                        </Pill>
                      </td>
                      <td className="font-mono px-5 py-3.5 text-right text-themed-main">{(rowCountByDataset[d.id] || 0).toLocaleString()}</td>
                      <td className="font-mono px-5 py-3.5 text-right cursor-help text-themed-main font-bold" title={metadataByDataset[d.id]?.columns?.join(", ") || "No columns loaded"}>
                        {metadataByDataset[d.id]?.column_count ?? "-"}
                      </td>
                      <td className="font-mono px-5 py-3.5 text-right text-themed-muted">
                        {formatFileSize(metadataByDataset[d.id]?.raw_size)}
                      </td>
                      <td className="px-5 py-3.5">{renderSyncPill(d.id)}</td>
                      <td className="px-5 py-3.5 text-themed-muted font-sans">{formatUpdatedAt(d.updated_at || d.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="grid h-5 w-5 place-items-center rounded-full bg-themed-main text-[9px] font-bold text-primary-foreground">Y</div>
                          <span className="text-themed-muted font-medium">You</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <BtnGhost onClick={() => handleDelete(d.id)} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 flex items-center gap-1 px-2.5 py-1">
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </BtnGhost>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredDatasets.length > 0 && (
            <div className="flex items-center justify-between border-t border-border-main px-5 py-4">
              <div className="text-xs text-themed-muted font-sans">
                Showing <span className="font-semibold text-themed-main">{startIndex + 1}</span> to <span className="font-semibold text-themed-main">{Math.min(startIndex + itemsPerPage, filteredDatasets.length)}</span> of <span className="font-semibold text-themed-main">{filteredDatasets.length}</span> payloads
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-8 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold uppercase tracking-wider text-themed-muted hover:bg-surface-2 hover:text-themed-main disabled:pointer-events-none disabled:opacity-50 transition-colors border-none bg-transparent cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Prev</span>
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`grid h-8 min-w-[32px] place-items-center rounded-xl px-2 text-xs font-mono font-bold transition-all border-none cursor-pointer ${
                        currentPage === i + 1
                          ? "bg-themed-main text-primary-foreground"
                          : "bg-transparent text-themed-muted hover:bg-surface-2 hover:text-themed-main"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-8 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold uppercase tracking-wider text-themed-muted hover:bg-surface-2 hover:text-themed-main disabled:pointer-events-none disabled:opacity-50 transition-colors border-none bg-transparent cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
