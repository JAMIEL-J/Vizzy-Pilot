import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Upload as UploadIcon, Sparkles, X } from "lucide-react";
import { datasetService, uploadService } from "../../lib/api/dataset";
import MappingReviewPanel from "../../components/dashboard/MappingReviewPanel";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, PanelHeader, Pill, BtnSecondary, BtnPrimary } from "@/components/ui/primitive";

const DUCKDB_POLL_INTERVAL_MS = 2000;
const DUCKDB_MAX_POLLS = 30;

type UploadPhase = "idle" | "uploading" | "building" | "ready" | "failed";

export default function FileUpload() {
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [showSchema, setShowSchema] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [failureMessage, setFailureMessage] = useState("");
    const [pollCount, setPollCount] = useState(0);
    const [uploadedDatasetId, setUploadedDatasetId] = useState<string | null>(null);
    const [latestVersionId, setLatestVersionId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isMountedRef = useRef(true);
    const navigate = useNavigate();

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const resetUpload = () => {
        setFile(null);
        setProgress(0);
        setShowSchema(false);
        setUploadPhase("idle");
        setStatusMessage("");
        setFailureMessage("");
        setPollCount(0);
        setUploadedDatasetId(null);
        setLatestVersionId(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const normalizeBackendError = (raw: any): string => {
        if (!raw) return "";

        if (typeof raw === "string") return raw;

        if (typeof raw === "object") {
            const detail = raw.detail ?? raw.message ?? raw.error ?? null;
            const reason = raw.reason ?? null;
            const details = raw.details ?? null;

            const parts = [detail, reason, details]
                .filter((val) => typeof val === "string" && val.trim().length > 0)
                .map((val) => val.trim());

            if (parts.length > 0) return parts.join(" | ");

            try {
                return JSON.stringify(raw);
            } catch {
                return String(raw);
            }
        }

        return String(raw);
    };

    const toActionableFailureMessage = (backendError?: any) => {
        const normalized = normalizeBackendError(backendError).trim();
        const shortError = normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;

        const base = "DuckDB optimization failed. Re-upload the dataset to retry, or continue to Dashboard in limited mode.";
        return shortError ? `${base} Details: ${shortError}` : base;
    };

    const pollDuckdbReadiness = async (datasetId: string) => {
        setUploadPhase("building");
        setStatusMessage("Preparing dataset for analytics...");
        setPollCount(0);

        for (let attempt = 1; attempt <= DUCKDB_MAX_POLLS; attempt++) {
            if (!isMountedRef.current) return;
            setPollCount(attempt);

            try {
                const status = await datasetService.getDuckdbStatus(datasetId);

                if (!isMountedRef.current) return;

                if (status.status === "ready" || status.ready) {
                    setProgress(100);
                    setUploadPhase("ready");
                    setStatusMessage("Dataset is ready for full analytics.");

                    setLatestVersionId(status.version_id || null);

                    setShowSchema(true);
                    return;
                }

                if (status.status === "failed" || status.status === "error") {
                    setUploadPhase("failed");
                    setFailureMessage(toActionableFailureMessage(status.error));
                    setStatusMessage("Optimization failed.");
                    return;
                }

                setProgress(prev => Math.min(prev + 1, 99));
                setStatusMessage("Building analytical index. This usually takes a few seconds...");
            } catch (err: any) {
                setUploadPhase("failed");
                setFailureMessage(toActionableFailureMessage(err?.response?.data?.detail || err?.message));
                setStatusMessage("Status check failed.");
                return;
            }

            await sleep(DUCKDB_POLL_INTERVAL_MS);
        }

        if (!isMountedRef.current) return;
        setUploadPhase("failed");
        setStatusMessage("Optimization timed out.");
        setFailureMessage(
            "DuckDB optimization is taking longer than expected. Re-upload to retry, or continue to Dashboard in limited mode while indexing completes."
        );
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleFile = (selectedFile: File) => {
        setFile(selectedFile);
        startUpload(selectedFile);
    };

    const startUpload = async (selectedFile: File) => {
        setUploadPhase("uploading");
        setStatusMessage("Uploading dataset and creating version...");
        setFailureMessage("");
        setShowSchema(false);
        setUploadedDatasetId(null);
        setPollCount(0);
        setIsUploading(true);
        setProgress(10);
        let progressInterval: ReturnType<typeof setInterval> | null = null;

        try {
            const dataset = await datasetService.createDataset(selectedFile.name, "Uploaded via Web Interface");
            setUploadedDatasetId(dataset.id);
            sessionStorage.setItem("vizzy.dashboard.selectedDatasetId", dataset.id);
            setProgress(30);

            progressInterval = setInterval(() => {
                setProgress(prev => Math.min(prev + 5, 90));
            }, 200);

            await uploadService.uploadFile(dataset.id, selectedFile);

            if (progressInterval) {
                clearInterval(progressInterval);
            }
            setIsUploading(false);
            setProgress(92);
            await pollDuckdbReadiness(dataset.id);
        } catch (error) {
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            console.error("Upload failed:", error);
            const err: any = error;
            const backendDetail = err?.response?.data?.detail || err?.response?.data || err?.message;
            setUploadPhase("failed");
            setFailureMessage(
                backendDetail
                    ? `Upload failed: ${normalizeBackendError(backendDetail)}`
                    : "Upload failed. Please retry the upload. If this persists, check file format or size."
            );
            setStatusMessage("Upload failed.");
            setIsUploading(false);
            setProgress(0);
        }
    };

    const phases: { key: UploadPhase; label: string }[] = [
        { key: "uploading", label: "Uploading" },
        { key: "building", label: "DuckDB ingest" },
        { key: "ready", label: "Schema review" },
    ];

    const phaseIndex = ["uploading", "building", "ready"].indexOf(uploadPhase);

    return (
        <div>
            <PageHeader
                breadcrumb={["Datasets", "Upload"]}
                title="Upload data"
                description="CSV files"
            />
            <div className="grid grid-cols-12 gap-4 px-5 py-4">
                <Panel className="col-span-12 lg:col-span-7">
                    <PanelHeader title="Source file" subtitle="Drag & drop or browse" icon={<UploadIcon className="h-3.5 w-3.5" />} />
                    <div className="p-5">
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative grid cursor-pointer place-items-center rounded-lg border-2 border-dashed p-12 text-center transition ${isDragging ? "border-accent bg-accent/5" : "border-border bg-surface-2/40 hover:bg-surface-2/60"}`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        handleFile(e.target.files[0]);
                                    }
                                }}
                            />
                            <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-3">
                                <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="mt-3 text-[14px] font-semibold">Drop your dataset here</h3>
                            <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
                                We'll ingest into DuckDB, profile columns, and surface schema in under a minute.
                            </p>
                            <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <BtnPrimary onClick={() => fileInputRef.current?.click()}><UploadIcon className="h-3 w-3" />Browse files</BtnPrimary>
                            </div>
                            <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                                <Pill>CSV</Pill>
                            </div>
                        </div>

                        {uploadPhase !== "idle" && (
                            <div className="mt-5 rounded-md border border-border bg-surface-2 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-[12px] font-medium">{file?.name || "No file selected"}</span>
                                        {file && <span className="text-[10.5px] text-muted-foreground">· {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                                    </div>
                                    <button 
                                        onClick={resetUpload} 
                                        className="rounded p-0.5 text-muted-foreground hover:bg-surface-3 transition-colors"
                                        title="Cancel upload"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    {phases.map((p, i) => {
                                        const done = phaseIndex >= i;
                                        return (
                                            <div key={p.key} className="flex flex-1 items-center gap-2">
                                                <div className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${done ? "bg-success text-background" : "bg-surface-3 text-muted-foreground"}`}>
                                                    {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                                                </div>
                                                <span className={`text-[11px] ${done ? "text-foreground" : "text-muted-foreground"}`}>{p.label}</span>
                                                {i < phases.length - 1 && <div className={`h-px flex-1 ${done ? "bg-success" : "bg-border"}`} />}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                                    <div className={`h-full rounded-full ${uploadPhase === 'failed' ? 'bg-destructive' : 'bg-gradient-to-r from-accent to-primary shimmer'}`} style={{ width: `${progress}%` }} />
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted-foreground">
                                    <span>{statusMessage || "Processing..."}</span>
                                    <span className="num">{progress}%</span>
                                </div>

                                {uploadPhase === "failed" && (
                                    <div className="mt-4 overflow-hidden rounded-md border border-destructive/20 bg-destructive/5">
                                        <div className="flex items-center gap-2 border-b border-destructive/10 bg-destructive/10 px-3 py-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                            <span className="text-[12px] font-medium text-destructive">Upload Failed</span>
                                        </div>
                                        <div className="p-3 text-[11.5px] text-muted-foreground">
                                            <div className="mb-2">We encountered an error while processing your file:</div>
                                            <div className="rounded border border-border/50 bg-surface-1 p-2 font-mono text-[10px] leading-relaxed text-foreground/90 break-all">
                                                {failureMessage || "Unknown error occurred during ingestion."}
                                            </div>
                                            <div className="mt-3 flex items-center gap-3">
                                                <button onClick={resetUpload} className="font-medium text-foreground hover:text-accent transition-colors">Try again</button>
                                                <span className="text-border">•</span>
                                                <button onClick={() => navigate("/user/dashboard")} className="font-medium text-foreground hover:text-accent transition-colors">Return to dashboard</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Panel>

                <Panel className="col-span-12 lg:col-span-5">
                    <PanelHeader
                        title="Schema review"
                        subtitle="Confirm types before ingest completes"
                        icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
                        actions={<Pill tone="info">Auto-inferred</Pill>}
                    />
                    <div className="p-4">
                        {showSchema && uploadedDatasetId && latestVersionId ? (
                            <MappingReviewPanel
                                datasetId={uploadedDatasetId}
                                versionId={latestVersionId}
                                onConfirm={() => navigate("/user/dashboard")}
                            />
                        ) : (
                            <div className="text-[12px] text-muted-foreground">
                                Upload a dataset to review inferred schema.
                            </div>
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
