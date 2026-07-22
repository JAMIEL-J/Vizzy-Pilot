import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, History, Sparkles, AlertTriangle, Loader2, X } from "lucide-react";
import { datasetService, type Dataset, type DownloadHistoryItem } from "../../lib/api/dataset";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, PanelHeader, Pill, BtnSecondary } from "@/components/ui/primitive";

export default function Downloads() {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metadataMap, setMetadataMap] = useState<Record<string, { raw_size: number; cleaned_size: number | null; row_count: number }>>({});

    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState<DownloadHistoryItem[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        loadDatasets();
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (isHistoryOpen) {
            loadHistory();
        }
    }, [isHistoryOpen]);

    const loadHistory = async () => {
        setIsHistoryLoading(true);
        try {
            const data = await datasetService.getDownloadHistory();
            setHistoryItems(data);
        } catch (e) {
            console.error("Failed to load download history:", e);
            toast.error("Failed to load download history");
        } finally {
            setIsHistoryLoading(false);
        }
    };

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

            const metaMap: Record<string, { raw_size: number; cleaned_size: number | null; row_count: number }> = {};
            const chunkSize = 3;
            for (let i = 0; i < data.length; i += chunkSize) {
                if (controller.signal.aborted) return;
                const chunk = data.slice(i, i + chunkSize);
                await Promise.allSettled(
                    chunk.map(async (ds) => {
                        const [versionResult, metadataResult] = await Promise.allSettled([
                            datasetService.getLatestVersion(ds.id),
                            datasetService.getDatasetMetadata(ds.id),
                        ]);
                        metaMap[ds.id] = {
                            raw_size: metadataResult.status === "fulfilled" ? (metadataResult.value.raw_size || 0) : 0,
                            cleaned_size: metadataResult.status === "fulfilled" ? (metadataResult.value.cleaned_size || null) : null,
                            row_count: versionResult.status === "fulfilled" ? (versionResult.value.row_count || 0) : 0,
                        };
                    })
                );
            }
            if (controller.signal.aborted) return;
            setMetadataMap(metaMap);
        } catch (error) {
            if (controller.signal.aborted) return;
            console.error("Failed to load datasets:", error);
            setError("We encountered an error while trying to fetch your datasets.");
            toast.error("Failed to load datasets");
        } finally {
            if (!controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    };

    const handleDownload = async (datasetId: string, type: "raw" | "cleaned", filename: string) => {
        const toastId = toast.loading(`Downloading ${type} dataset...`);
        try {
            const blob = type === "raw"
                ? await datasetService.downloadRaw(datasetId)
                : await datasetService.downloadCleaned(datasetId);

            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(`Successfully downloaded ${filename}`, { id: toastId });
        } catch (error: any) {
            console.error(`Failed to download ${type} dataset:`, error);
            let errorMessage = `Failed to download ${type} dataset.`;
            
            if (error.response?.status === 429) {
                errorMessage = "Rate limit exceeded (Too Many Requests). Please wait a few seconds before trying again.";
            } else if (error.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const json = JSON.parse(text);
                    if (json.detail) errorMessage = json.detail;
                } catch (_) {}
            } else if (error.response?.data?.detail) {
                errorMessage = error.response.data.detail;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            toast.error(errorMessage, { id: toastId });
        }
    };

    const formatFileSize = (bytes: number | undefined) => {
        if (!bytes) return "Unknown Size";
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    };

    const items = useMemo(() => {
        return datasets.map((ds) => {
            const meta = metadataMap[ds.id] || { raw_size: 0, cleaned_size: null, row_count: 0 };
            const rawSize = formatFileSize(meta.raw_size);
            const cleanedSize = meta.cleaned_size !== null ? formatFileSize(meta.cleaned_size) : "Not Cleaned Yet";
            const hasCleaned = meta.cleaned_size !== null && meta.cleaned_size > 0;
            return {
                id: ds.id,
                name: ds.name,
                raw: rawSize,
                cleaned: cleanedSize,
                rows: meta.row_count,
                hasCleaned,
                version: (ds as any).current_version || "v1",
            };
        });
    }, [datasets, metadataMap]);

    return (
        <div>
            <PageHeader
                breadcrumb={["Exports"]}
                title="Export center"
                description="Download raw uploads or post-transformation snapshots — all formats include schema metadata"
                actions={
                    <BtnSecondary onClick={() => setIsHistoryOpen(true)}>
                        <History className="h-3 w-3" />Download history
                    </BtnSecondary>
                }
            />
            <div className="px-5 py-4">
                <Panel>
                    <PanelHeader title="Datasets" subtitle={`${items.length} datasets available for export`} />
                    <div className="divide-y divide-border">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-4" />
                                <h3 className="text-sm font-medium mb-1">Loading exports...</h3>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
                                    <AlertTriangle className="h-6 w-6" />
                                </div>
                                <h3 className="text-sm font-medium mb-1">Failed to load exports</h3>
                                <p className="text-[13px] text-muted-foreground text-center max-w-sm mb-4">
                                    {error}
                                </p>
                                <BtnSecondary onClick={loadDatasets}>Try Again</BtnSecondary>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground mb-4">
                                    <FileSpreadsheet className="h-6 w-6" />
                                </div>
                                <h3 className="text-sm font-medium mb-1">No exports found</h3>
                                <p className="text-[13px] text-muted-foreground text-center max-w-sm">
                                    Upload and process some datasets to see them available for download here.
                                </p>
                            </div>
                        ) : (
                            items.map((it) => (
                                <div key={it.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                                    <div className="col-span-5 flex items-center gap-3">
                                        <div className="grid h-9 w-9 place-items-center rounded-md bg-surface-3">
                                            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[13px] font-medium">{it.name}</span>
                                                <Pill>{it.version}</Pill>
                                            </div>
                                            <div className="num mt-0.5 text-[10.5px] text-muted-foreground">
                                                {it.rows ? `${Number(it.rows).toLocaleString()} rows` : "Row count unavailable"}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-3">
                                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Raw</div>
                                        <div className="num text-[12.5px] font-medium">{it.raw}</div>
                                    </div>
                                    <div className="col-span-2">
                                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Cleaned</div>
                                        <div className="num text-[12.5px] font-medium text-success">{it.cleaned}</div>
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-1.5">
                                        <BtnSecondary onClick={() => handleDownload(it.id, "raw", `${it.name}_raw.csv`)}>
                                            <Download className="h-3 w-3" />Raw
                                        </BtnSecondary>
                                        <button
                                            onClick={() => handleDownload(it.id, "cleaned", `${it.name}_cleaned.csv`)}
                                            disabled={!it.hasCleaned}
                                            title={it.hasCleaned ? "Download cleaned dataset" : "Dataset has not been cleaned yet"}
                                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                                                it.hasCleaned
                                                    ? "bg-primary text-primary-foreground hover:opacity-90 cursor-pointer shadow-sm"
                                                    : "bg-surface-3 text-muted-foreground opacity-50 cursor-not-allowed border border-border"
                                            }`}
                                        >
                                            <Sparkles className="h-3 w-3" />Cleaned
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Panel>
            </div>

            {isHistoryOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    <div className="bg-surface-container-lowest dark:bg-surface p-6 rounded-3xl shadow-2xl max-w-2xl w-full border border-outline-variant/20 dark:border-outline-variant/50 flex flex-col max-h-[85vh]">
                        <div className="mb-4 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
                                <History className="h-5 w-5 text-muted-foreground" />
                                Download History
                            </h2>
                            <button onClick={() => setIsHistoryOpen(false)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-3">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        
                        <p className="text-xs text-on-surface-variant mb-4">
                            All dataset file exports requested by your account.
                        </p>

                        <div className="flex-1 overflow-auto rounded-2xl border border-outline-variant/30 dark:border-outline-variant/20 bg-surface-container-highest/30 dark:bg-surface-container-lowest/30">
                            {isHistoryLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 px-4">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-4" />
                                    <h3 className="text-xs font-medium">Loading history...</h3>
                                </div>
                            ) : historyItems.length === 0 ? (
                                <div className="py-16 text-center text-on-surface-variant italic text-xs">
                                    No download history found.
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-surface-container-lowest dark:bg-surface z-10">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                                            <th className="p-3">Dataset</th>
                                            <th className="p-3">Version</th>
                                            <th className="p-3">Type</th>
                                            <th className="p-3">Downloaded At</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant/10">
                                        {historyItems.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-surface-container-lowest dark:hover:bg-surface-container transition-colors">
                                                <td className="p-3">
                                                    <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-[#efeded] text-[#1a1a1a] dark:bg-[#2a2a2a] dark:text-[#efeded] font-semibold inline-flex items-center">
                                                        {item.dataset_name}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-[12px] font-medium">
                                                    v{item.version_number}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                                        item.download_type === "cleaned" 
                                                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" 
                                                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                                    }`}>
                                                        {item.download_type}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-[11px] text-muted-foreground">
                                                    {new Date(item.timestamp).toLocaleString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        second: '2-digit'
                                                    })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="mt-4 flex justify-end">
                            <BtnSecondary onClick={() => setIsHistoryOpen(false)}>
                                Close
                            </BtnSecondary>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

