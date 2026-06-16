import { useEffect, useState } from "react";
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

    useEffect(() => {
        loadDatasets();
    }, []);

    const loadDatasets = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
            await loadDatasetMetrics(data);
        } catch (err: any) {
            console.error("Failed to load datasets:", err);
            setError(err.message || "An unexpected error occurred while loading datasets.");
        } finally {
            setIsLoading(false);
        }
    };

    const loadDatasetMetrics = async (datasetList: Dataset[]) => {
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

            for (const item of results) {
                rowsMap[item.datasetId] = item.rowCount;
                statusMap[item.datasetId] = item.syncStatus;
                metadataMap[item.datasetId] = item.metaData;
            }

            setRowCountByDataset(rowsMap);
            setSyncStatusByDataset(statusMap);
            setMetadataByDataset(metadataMap);
        } catch (error) {
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

    // Filter and reset pagination if search changes
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
                <Pill tone="success">
                    <CheckCircle2 className="h-2.5 w-2.5" />Synced
                </Pill>
            );
        }
        if (status === "building" || status === "converting" || status === "syncing") {
            return (
                <Pill tone="info">
                    <Clock className="h-2.5 w-2.5" />Syncing
                </Pill>
            );
        }
        if (status === "failed" || status === "error") {
            return (
                <Pill tone="danger">
                    <AlertCircle className="h-2.5 w-2.5" />Failed
                </Pill>
            );
        }
        return <Pill>Unknown</Pill>;
    };

    return (
        <div className="bg-noise min-h-full">
            <PageHeader
                breadcrumb={["Workspaces", "Vizzy Pilot", "Datasets"]}
                title="Dataset catalog"
                description={`${filteredDatasets.length} datasets available`}
                actions={(
                    <>
                        <Link to="/user/upload"><BtnSecondary><Upload className="h-3 w-3" />Upload</BtnSecondary></Link>
                        <Link to="/user/connect-db"><BtnPrimary><Plus className="h-3 w-3" />Connect source</BtnPrimary></Link>
                    </>
                )}
            />

            <div className="px-5 py-4">
                <Panel>
                    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                        <div className="flex flex-1 items-center gap-2">
                            <div className="flex h-8 flex-1 max-w-md items-center gap-2 rounded-md border border-border bg-surface px-2.5 focus-within:ring-1 focus-within:ring-ring/30 transition-all">
                                <Search className="h-3 w-3 text-muted-foreground" />
                                <input
                                    value={searchTerm}
                                    onChange={handleSearchChange}
                                    placeholder="Search datasets, owners, tags..."
                                    className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="num">{filteredDatasets.length} of {datasets.length}</span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-border bg-surface-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-2.5 text-left font-medium">Dataset</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Source</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Rows</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Cols</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Size</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Sync</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Owner</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-16">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <Clock className="h-5 w-5 animate-spin text-muted-foreground mb-3" />
                                                <p className="text-xs uppercase tracking-widest text-muted-foreground">Loading datasets...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : error ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-16">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-red-500 mb-4 ring-1 ring-red-500/20">
                                                    <AlertCircle className="h-5 w-5" />
                                                </div>
                                                <h3 className="text-[14px] font-medium text-foreground mb-1">Failed to load datasets</h3>
                                                <p className="text-[13px] text-muted-foreground max-w-[300px]">{error}</p>
                                                <BtnSecondary className="mt-5" onClick={loadDatasets}>Try Again</BtnSecondary>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedDatasets.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-16">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2 border border-border mb-4 shadow-sm">
                                                    <Database className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                                <h3 className="text-[14px] font-medium text-foreground mb-1">No datasets found</h3>
                                                <p className="text-[13px] text-muted-foreground max-w-[320px]">
                                                    {searchTerm 
                                                        ? "No datasets match your current search criteria. Try adjusting your filters." 
                                                        : "You haven't connected any datasets yet. Get started by uploading a file or connecting a database."}
                                                </p>
                                                {!searchTerm && (
                                                    <div className="mt-6 flex items-center justify-center gap-3">
                                                        <Link to="/user/connect-db"><BtnPrimary><Plus className="h-3 w-3" />Connect source</BtnPrimary></Link>
                                                        <Link to="/user/upload"><BtnSecondary><Upload className="h-3 w-3" />Upload CSV</BtnSecondary></Link>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedDatasets.map(d => (
                                        <tr key={d.id} className="group hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="grid h-7 w-7 place-items-center rounded-md bg-surface-3 text-muted-foreground shadow-sm">
                                                        <FileSpreadsheet className="h-3.5 w-3.5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-foreground">{d.name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3"><Pill><Database className="h-2.5 w-2.5" />DuckDB</Pill></td>
                                            <td className="num px-4 py-3 text-right">{(rowCountByDataset[d.id] || 0).toLocaleString()}</td>
                                            <td className="num px-4 py-3 text-right cursor-help text-foreground font-medium" title={metadataByDataset[d.id]?.columns?.join(", ") || "No columns loaded"}>
                                                {metadataByDataset[d.id]?.column_count ?? "-"}
                                            </td>
                                            <td className="num px-4 py-3 text-right text-muted-foreground">
                                                {formatFileSize(metadataByDataset[d.id]?.raw_size)}
                                            </td>
                                            <td className="px-4 py-3">{renderSyncPill(d.id)}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{formatUpdatedAt(d.updated_at || d.created_at)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 text-[9px] font-semibold text-foreground border border-border">U</div>
                                                    <span className="text-muted-foreground">You</span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-3">
                                                <BtnGhost onClick={() => handleDelete(d.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1">
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
                        <div className="flex items-center justify-between border-t border-border px-4 py-3">
                            <div className="text-[11.5px] text-muted-foreground">
                                Showing <span className="font-medium text-foreground">{startIndex + 1}</span> to <span className="font-medium text-foreground">{Math.min(startIndex + itemsPerPage, filteredDatasets.length)}</span> of <span className="font-medium text-foreground">{filteredDatasets.length}</span> datasets
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="flex h-7 items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 transition-colors"
                                >
                                    <ChevronLeft className="h-3 w-3" />
                                    Prev
                                </button>
                                <div className="flex items-center gap-0.5">
                                    {Array.from({ length: totalPages }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setCurrentPage(i + 1)}
                                            className={`grid h-7 min-w-[28px] place-items-center rounded-md px-2 text-[11px] font-medium transition-colors ${
                                                currentPage === i + 1
                                                    ? "bg-surface-3 text-foreground"
                                                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                            }`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="flex h-7 items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 transition-colors"
                                >
                                    Next
                                    <ChevronRight className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}
