import { useEffect, useRef, useState } from "react";
import React from "react";
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { datasetService, type Dataset, type DuckDBStatus, type DatasetVersionSummary } from "../../lib/api/dataset";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, Pill, BtnGhost, BtnSecondary, BtnPrimary } from "@/components/ui/primitive";
import { toast } from "react-hot-toast";

export default function DatasetList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowCountByDataset, setRowCountByDataset] = useState<Record<string, number>>({});
  const [syncStatusByDataset, setSyncStatusByDataset] = useState<Record<string, DuckDBStatus["status"]>>({});
  const [metadataByDataset, setMetadataByDataset] = useState<Record<string, { column_count: number; columns: string[]; raw_size: number }>>({});
  const [latestVersionNumByDataset, setLatestVersionNumByDataset] = useState<Record<string, number>>({});
  
  // Versions view state
  const [expandedDatasets, setExpandedDatasets] = useState<Record<string, boolean>>({});
  const [versionsByDataset, setVersionsByDataset] = useState<Record<string, DatasetVersionSummary[]>>({});
  const [isVersionsLoading, setIsVersionsLoading] = useState<Record<string, boolean>>({});

  // Delete version modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [datasetToDeleteFrom, setDatasetToDeleteFrom] = useState<Dataset | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<DatasetVersionSummary | null>(null);
  const [isDeletingVersion, setIsDeletingVersion] = useState(false);
  
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
      const versionNumMap: Record<string, number> = {};

      const results = await Promise.all(
        datasetList.map(async (dataset) => {
          const [latestVersionResult, duckdbStatusResult, metadataResult] = await Promise.allSettled([
            datasetService.getLatestVersion(dataset.id),
            datasetService.getDuckdbStatus(dataset.id),
            datasetService.getDatasetMetadata(dataset.id),
          ]);

          let rowCount = 0;
          let latestVersionNum = 1;
          if (latestVersionResult.status === "fulfilled") {
            const rawRowCount = Number(latestVersionResult.value?.row_count ?? 0);
            rowCount = Number.isFinite(rawRowCount) ? Math.max(0, rawRowCount) : 0;
            latestVersionNum = Number(latestVersionResult.value?.version_number ?? 1);
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
            latestVersionNum,
          };
        })
      );

      if (controller.signal.aborted) return;

      for (const item of results) {
        rowsMap[item.datasetId] = item.rowCount;
        statusMap[item.datasetId] = item.syncStatus;
        metadataMap[item.datasetId] = item.metaData;
        versionNumMap[item.datasetId] = item.latestVersionNum;
      }

      setRowCountByDataset(rowsMap);
      setSyncStatusByDataset(statusMap);
      setMetadataByDataset(metadataMap);
      setLatestVersionNumByDataset(versionNumMap);
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
        toast.success("Dataset successfully deleted");
      } catch (error) {
        console.error("Failed to delete dataset:", error);
        toast.error("Failed to delete dataset");
      }
    }
  };

  const toggleExpand = async (datasetId: string) => {
    const isCurrentlyExpanded = !!expandedDatasets[datasetId];
    setExpandedDatasets(prev => ({
      ...prev,
      [datasetId]: !isCurrentlyExpanded
    }));

    if (!isCurrentlyExpanded) {
      setIsVersionsLoading(prev => ({ ...prev, [datasetId]: true }));
      try {
        const versions = await datasetService.listVersionsForDataset(datasetId);
        setVersionsByDataset(prev => ({ ...prev, [datasetId]: versions }));
      } catch (err: any) {
        console.error("Failed to load versions:", err);
        toast.error("Failed to load versions for dataset");
      } finally {
        setIsVersionsLoading(prev => ({ ...prev, [datasetId]: false }));
      }
    }
  };

  const refreshDatasetMetrics = async (datasetId: string) => {
    try {
      const [latestVersionResult, duckdbStatusResult, metadataResult] = await Promise.allSettled([
        datasetService.getLatestVersion(datasetId),
        datasetService.getDuckdbStatus(datasetId),
        datasetService.getDatasetMetadata(datasetId),
      ]);

      let rowCount = 0;
      let latestVersionNum = 1;
      if (latestVersionResult.status === "fulfilled") {
        const rawRowCount = Number(latestVersionResult.value?.row_count ?? 0);
        rowCount = Number.isFinite(rawRowCount) ? Math.max(0, rawRowCount) : 0;
        latestVersionNum = Number(latestVersionResult.value?.version_number ?? 1);
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

      setRowCountByDataset(prev => ({ ...prev, [datasetId]: rowCount }));
      setSyncStatusByDataset(prev => ({ ...prev, [datasetId]: syncStatus }));
      setMetadataByDataset(prev => ({ ...prev, [datasetId]: metaData }));
      setLatestVersionNumByDataset(prev => ({ ...prev, [datasetId]: latestVersionNum }));
    } catch (error) {
      console.error("Failed to refresh dataset metrics:", error);
    }
  };

  const openDeleteConfirm = (dataset: Dataset, version: DatasetVersionSummary) => {
    setDatasetToDeleteFrom(dataset);
    setVersionToDelete(version);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setDatasetToDeleteFrom(null);
    setVersionToDelete(null);
  };

  const handleConfirmDeleteVersion = async () => {
    if (!datasetToDeleteFrom || !versionToDelete) return;
    setIsDeletingVersion(true);
    try {
      await datasetService.deleteVersion(datasetToDeleteFrom.id, versionToDelete.id);
      toast.success(`Version v${versionToDelete.version_number} successfully deleted`);
      
      // Update local versions state
      setVersionsByDataset(prev => {
        const datasetId = datasetToDeleteFrom.id;
        const currentVersions = prev[datasetId] || [];
        return {
          ...prev,
          [datasetId]: currentVersions.filter(v => v.id !== versionToDelete.id)
        };
      });

      closeDeleteConfirm();
      await refreshDatasetMetrics(datasetToDeleteFrom.id);
    } catch (err: any) {
      console.error("Failed to delete version:", err);
      toast.error(err.response?.data?.detail || err.message || "Failed to delete version");
    } finally {
      setIsDeletingVersion(false);
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
                    <React.Fragment key={d.id}>
                      <tr className="group hover:bg-surface-2 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {latestVersionNumByDataset[d.id] > 1 ? (
                              <button
                                onClick={() => toggleExpand(d.id)}
                                className="bg-transparent border-none text-themed-muted hover:text-themed-main p-1 cursor-pointer focus:outline-none flex items-center justify-center"
                                title="Toggle versions"
                              >
                                {expandedDatasets[d.id] ? (
                                  <ChevronUp className="h-4 w-4 text-sky-500" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            ) : (
                              <div className="w-6 h-6" />
                            )}
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
                      {expandedDatasets[d.id] && (
                        <tr className="bg-surface-1/40">
                          <td colSpan={9} className="px-8 py-4">
                            <div className="border-l-2 border-sky-500 pl-4 py-2 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-themed-muted font-sans">
                                  Versions History
                                </h4>
                              </div>
                              {isVersionsLoading[d.id] ? (
                                <div className="flex items-center gap-2 py-2 text-themed-muted">
                                  <Clock className="h-3.5 w-3.5 animate-spin" />
                                  <span className="text-[11px] font-mono">Loading versions...</span>
                                </div>
                              ) : !versionsByDataset[d.id] || versionsByDataset[d.id].length === 0 ? (
                                <p className="text-themed-muted text-[11px]">No active versions found for this dataset.</p>
                              ) : (
                                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                                  {versionsByDataset[d.id].map(v => (
                                    <div key={v.id} className="bg-bg-card border border-border-main rounded-xl p-3 flex flex-col justify-between hover:border-sky-500/30 transition-colors">
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <div className="flex items-center gap-2 mb-1.5">
                                            <span className="font-mono text-xs font-bold text-themed-main">v{v.version_number}</span>
                                            <Pill tone={v.source_type === "UPLOAD" ? "info" : "success"} className="text-[9px] px-1.5 py-0.5 uppercase tracking-wider font-semibold">
                                              {v.source_type}
                                            </Pill>
                                          </div>
                                          <div className="text-[10px] text-themed-muted space-y-1">
                                            <div>Rows: <span className="font-mono text-themed-main">{(v.row_count ?? 0).toLocaleString()}</span></div>
                                            <div>Created: <span className="font-mono">{formatUpdatedAt(v.created_at)}</span></div>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => openDeleteConfirm(d, v)}
                                          className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded bg-transparent border-none cursor-pointer flex items-center justify-center"
                                          title="Delete version"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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

      {/* Delete Version Confirmation Modal */}
      {deleteConfirmOpen && datasetToDeleteFrom && versionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg-card border border-border-main rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-sm font-bold text-themed-main mb-2 font-sans">
              Delete dataset version?
            </h3>
            <p className="text-xs text-themed-muted mb-6 leading-relaxed font-sans">
              Are you sure you want to delete version <span className="font-mono font-bold text-themed-main">v{versionToDelete.version_number}</span> ({versionToDelete.source_type}) of <span className="font-semibold text-themed-main">{datasetToDeleteFrom.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeDeleteConfirm}
                disabled={isDeletingVersion}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-themed-muted border border-border-main bg-transparent hover:bg-surface-2 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteVersion}
                disabled={isDeletingVersion}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer border-none flex items-center gap-1.5"
              >
                {isDeletingVersion ? (
                  <>
                    <Clock className="h-3 w-3 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete version</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
