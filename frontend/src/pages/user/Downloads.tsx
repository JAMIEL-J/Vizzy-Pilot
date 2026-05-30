import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileSpreadsheet, History, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { datasetService, type Dataset } from "../../lib/api/dataset";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, PanelHeader, Pill, BtnSecondary } from "@/components/ui/primitive";

export default function Downloads() {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadDatasets();
    }, []);

    const loadDatasets = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
        } catch (error) {
            console.error("Failed to load datasets:", error);
            setError("We encountered an error while trying to fetch your datasets.");
            toast.error("Failed to load datasets");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (datasetId: string, type: "raw" | "cleaned", filename: string) => {
        try {
            const toastId = toast.loading(`Downloading ${type} dataset...`);
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
            const errorMessage = error.response?.data?.detail || `Failed to download ${type} dataset. It may not exist yet.`;
            toast.error(errorMessage);
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
            const rawSize = formatFileSize((ds as any).size);
            const cleanedSize = formatFileSize((ds as any).cleaned_size || (ds as any).size);
            return {
                id: ds.id,
                name: ds.name,
                raw: rawSize,
                cleaned: cleanedSize,
                rows: (ds as any).row_count,
                version: (ds as any).current_version || "v1",
            };
        });
    }, [datasets]);

    return (
        <div>
            <PageHeader
                breadcrumb={["Exports"]}
                title="Export center"
                description="Download raw uploads or post-transformation snapshots — all formats include schema metadata"
                actions={
                    <Link to="/user/history">
                        <BtnSecondary>
                            <History className="h-3 w-3" />Download history
                        </BtnSecondary>
                    </Link>
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
                                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground hover:opacity-90"
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
        </div>
    );
}
