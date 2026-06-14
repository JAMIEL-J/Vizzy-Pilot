import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Upload as UploadIcon, Sparkles, X } from "lucide-react";
import { datasetService, uploadService, semanticMappingService } from "../../lib/api/dataset";
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
    const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
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
        setRedirectCountdown(null);
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
                    const versionId = status.version_id || null;
                    setLatestVersionId(versionId);

                    if (versionId) {
                        try {
                            setStatusMessage("Applying AI semantic mappings...");
                            const mappingRes = await semanticMappingService.proposeMapping(datasetId, versionId);
                            const proposals = mappingRes?.proposal?.metadata?.proposals || [];
                            const finalMap: Record<string, string> = {};
                            proposals.forEach((p: any) => {
                                finalMap[p.column_name] = p.role;
                            });
                            await semanticMappingService.confirmMapping(datasetId, versionId, finalMap, []);
                        } catch (err) {
                            console.error("Auto mapping failed, proceeding anyway:", err);
                        }
                    }
                    setUploadPhase("ready");
                    setStatusMessage("Dataset ingested successfully!");
                    
                    let count = 3;
                    setRedirectCountdown(count);
                    const interval = setInterval(() => {
                        count -= 1;
                        if (isMountedRef.current) {
                            setRedirectCountdown(count);
                        }
                        if (count <= 0) {
                            clearInterval(interval);
                            if (isMountedRef.current) {
                                navigate("/user/dashboard");
                            }
                        }
                    }, 1000);
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
        setStatusMessage("Uploading dataset...");
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

    const radius = 45;
    const strokeWidth = 6;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div>
            <PageHeader
                breadcrumb={["Datasets", "Upload"]}
                title="Upload data"
                description="CSV files"
            />
            <div className="max-w-2xl mx-auto px-5 py-8">
                <Panel className="w-full">
                    <PanelHeader 
                        title="Dataset Ingestion" 
                        subtitle={uploadPhase === "idle" ? "Upload a file to begin" : "Processing your data"} 
                        icon={<UploadIcon className="h-3.5 w-3.5" />} 
                    />
                    <div className="p-6">
                        {uploadPhase === "idle" && (
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
                                    We'll ingest into DuckDB, build indexes, and run AI semantic auditing automatically.
                                </p>
                                <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <BtnPrimary onClick={() => fileInputRef.current?.click()}><UploadIcon className="h-3 w-3" />Browse files</BtnPrimary>
                                </div>
                                <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                                    <Pill>CSV</Pill>
                                </div>
                            </div>
                        )}

                        {(uploadPhase === "uploading" || uploadPhase === "building") && (
                            <div className="flex flex-col items-center justify-center py-8 text-center animate-fade-in">
                                <div className="relative h-36 w-36 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle
                                            cx="72"
                                            cy="72"
                                            r={radius}
                                            className="stroke-surface-3 fill-none"
                                            strokeWidth={strokeWidth}
                                        />
                                        <circle
                                            cx="72"
                                            cy="72"
                                            r={radius}
                                            className="stroke-primary fill-none transition-all duration-300 ease-out"
                                            strokeWidth={strokeWidth}
                                            strokeDasharray={circumference}
                                            strokeDashoffset={strokeDashoffset}
                                            strokeLinecap="round"
                                            style={{
                                                filter: "drop-shadow(0 0 6px var(--color-primary))",
                                            }}
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="font-mono text-2xl font-extrabold text-foreground">{progress}%</span>
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Ingesting</span>
                                    </div>
                                </div>
                                <h3 className="mt-6 text-sm font-semibold text-foreground tracking-wide">{statusMessage}</h3>
                                <p className="mt-1.5 text-xs text-muted-foreground max-w-sm">
                                    File: {file?.name} ({(file ? file.size / 1024 / 1024 : 0).toFixed(2)} MB)
                                </p>
                                <button
                                    onClick={resetUpload}
                                    className="mt-6 text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                                >
                                    Cancel Ingestion
                                </button>
                            </div>
                        )}

                        {uploadPhase === "ready" && (
                            <div className="flex flex-col items-center justify-center py-6 text-center animate-fade-in">
                                <div className="grid h-16 w-16 place-items-center rounded-full bg-success/15 border border-success/30 text-success mb-6 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                                    <CheckCircle2 className="h-8 w-8" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground tracking-wide">Dataset Ready!</h3>
                                <p className="mt-2 text-sm text-muted-foreground max-w-md">
                                    Your file <span className="font-semibold text-foreground">{file?.name}</span> has been uploaded and analyzed.
                                    AI semantic mappings were applied automatically.
                                </p>
                                <div className="mt-8 flex flex-col items-center gap-2">
                                    <BtnPrimary onClick={() => navigate("/user/dashboard")} className="px-6 py-2">
                                        Go to Dashboard
                                    </BtnPrimary>
                                    {redirectCountdown !== null && (
                                        <span className="text-[11px] text-muted-foreground mt-1.5">
                                            Opening dashboard in {redirectCountdown}s...
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {uploadPhase === "failed" && (
                            <div className="flex flex-col items-center justify-center py-6 text-center animate-fade-in">
                                <div className="grid h-16 w-16 place-items-center rounded-full bg-destructive/15 border border-destructive/30 text-destructive mb-6 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                                    <AlertTriangle className="h-8 w-8" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground tracking-wide">Ingestion Failed</h3>
                                <p className="mt-2 text-sm text-muted-foreground max-w-md">
                                    We encountered an error while processing your file.
                                </p>
                                <div className="mt-4 w-full max-w-md rounded-lg border border-border/50 bg-surface-1 p-4 text-left font-mono text-[10.5px] leading-relaxed text-foreground/90 break-all max-h-36 overflow-auto">
                                    {failureMessage || "Unknown error occurred during ingestion."}
                                </div>
                                <div className="mt-8 flex items-center gap-3">
                                    <BtnPrimary onClick={resetUpload}>
                                        Try again
                                    </BtnPrimary>
                                    <BtnSecondary onClick={() => navigate("/user/dashboard")}>
                                        Cancel
                                    </BtnSecondary>
                                </div>
                            </div>
                        )}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
