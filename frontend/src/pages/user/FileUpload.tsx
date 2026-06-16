import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload as UploadIcon, Sparkles } from "lucide-react";
import { datasetService, uploadService, semanticMappingService } from "../../lib/api/dataset";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, PanelHeader, BtnSecondary, BtnPrimary } from "@/components/ui/primitive";

// ── Types ──────────────────────────────────────────────────────────────────────

type StageKey =
  | 'create_dataset'
  | 'upload_file'
  | 'ingesting'
  | 'semantic_audit'
  | 'dashboard_gen'
  | 'duckdb_build'
  | 'apply_mappings'
  | 'ready';

type StageStatus = 'pending' | 'active' | 'completed' | 'failed';

interface PipelineStage {
  key: StageKey;
  label: string;
  detail: string;
  status: StageStatus;
  activatedAt: number | null;  // Date.now() when this stage became active
  elapsedMs: number | null;    // computed on completion
}

const DUCKDB_POLL_INTERVAL_MS = 2000;
const DUCKDB_MAX_POLLS = 30;

// ── Pipeline definition (all stages visible upfront) ───────────────────────────

const PIPELINE_DEFINITION: { key: StageKey; label: string; detail: string }[] = [
  { key: 'create_dataset', label: 'Creating dataset', detail: 'Dataset record created' },
  { key: 'upload_file', label: 'Uploading file', detail: '' },  // detail filled dynamically
  { key: 'ingesting', label: 'Parsing data', detail: 'Schema inferred' },
  { key: 'semantic_audit', label: 'Classifying columns with AI', detail: '' },
  { key: 'dashboard_gen', label: 'Generating preview dashboard', detail: '' },
  { key: 'duckdb_build', label: 'Building analytics index', detail: '' },
  { key: 'apply_mappings', label: 'Applying AI mappings', detail: '' },
  { key: 'ready', label: 'Ready', detail: 'Dataset ready to explore' },
];

function makeInitialPipeline(): PipelineStage[] {
  return PIPELINE_DEFINITION.map((def) => ({
    ...def,
    status: 'pending' as StageStatus,
    activatedAt: null,
    elapsedMs: null,
  }));
}

function updateStage(
  pipeline: PipelineStage[],
  key: StageKey,
  overrides: Partial<Pick<PipelineStage, 'status' | 'detail' | 'elapsedMs'>>,
): PipelineStage[] {
  return pipeline.map((s) =>
    s.key === key
      ? {
          ...s,
          ...overrides,
          activatedAt:
            overrides.status === 'active' && !s.activatedAt
              ? Date.now()
              : s.activatedAt,
        }
      : s,
  );
}

/**
 * Activate a stage and complete all stages before it (if they're still active).
 * This handles the case where a batch of stages completes at once (e.g. after the
 * upload POST returns) — we snap all previous non-completed stages to completed
 * and activate the target.
 */
function advanceTo(
  pipeline: PipelineStage[],
  key: StageKey,
  detailOverrides?: Record<string, string>,
): PipelineStage[] {
  let found = false;
  return pipeline.map((s) => {
    if (s.key === key) {
      found = true;
      return {
        ...s,
        status: 'active' as StageStatus,
        activatedAt: s.activatedAt ?? Date.now(),
        detail: detailOverrides?.[s.key] ?? s.detail,
      };
    }
    // Everything before the target that isn't already completed → mark completed
    if (!found && s.status !== 'completed') {
      return {
        ...s,
        status: 'completed' as StageStatus,
        elapsedMs: s.activatedAt ? Date.now() - s.activatedAt : 0,
        detail: detailOverrides?.[s.key] ?? s.detail,
      };
    }
    return s;
  });
}

/**
 * Complete the currently-active stage and advance to the next pending stage.
 */
function completeCurrent(pipeline: PipelineStage[]): PipelineStage[] {
  const activeIdx = pipeline.findIndex((s) => s.status === 'active');
  if (activeIdx === -1) return pipeline;

  const now = Date.now();
  return pipeline.map((s, i) => {
    if (i === activeIdx) {
      return { ...s, status: 'completed' as StageStatus, elapsedMs: now - (s.activatedAt ?? now) };
    }
    // Activate the next one if it's pending
    if (i === activeIdx + 1 && s.status === 'pending') {
      return { ...s, status: 'active' as StageStatus, activatedAt: now };
    }
    return s;
  });
}

/**
 * Collect all "completed" stages and those before the target into completed,
 * and mark everything after the target as completed too (for finalisation).
 */
function completeUpTo(
  pipeline: PipelineStage[],
  targetKey: StageKey,
  detailOverrides?: Record<string, string>,
): PipelineStage[] {
  const now = Date.now();
  let passedTarget = false;
  return pipeline.map((s) => {
    if (s.key === targetKey) {
      passedTarget = true;
      return {
        ...s,
        status: 'completed' as StageStatus,
        elapsedMs: s.activatedAt ? now - s.activatedAt : 0,
        detail: detailOverrides?.[s.key] ?? s.detail,
      };
    }
    if (!passedTarget) {
      return {
        ...s,
        status: 'completed' as StageStatus,
        elapsedMs: s.activatedAt ? now - s.activatedAt : 0,
        detail: detailOverrides?.[s.key] ?? s.detail,
      };
    }
    return s;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatElapsed(ms: number | null): string {
  if (ms === null || ms === undefined) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fileSizeMB(file: File): string {
  return (file.size / 1024 / 1024).toFixed(2);
}

// ── Status icon per stage ──────────────────────────────────────────────────────

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (status === 'active') {
    return (
      <span className="relative grid h-4 w-4 place-items-center">
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        <span className="relative h-2 w-2 rounded-full bg-primary" />
      </span>
    );
  }
  if (status === 'failed') {
    return <AlertTriangle className="h-4 w-4 text-destructive" />;
  }
  // pending
  return <span className="h-2 w-2 rounded-full bg-surface-3" />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>(makeInitialPipeline);
  const [isUploading, setIsUploading] = useState(false);
  const [failureMessage, setFailureMessage] = useState("");
  const [uploadedDatasetId, setUploadedDatasetId] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [expandedStage, setExpandedStage] = useState<StageKey | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const navigate = useNavigate();

  // Elapsed-time ticker for the active stage
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const active = pipeline.find((s) => s.status === 'active');
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [pipeline]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const resetUpload = () => {
    setFile(null);
    setPipeline(makeInitialPipeline());
    setFailureMessage("");
    setUploadedDatasetId(null);
    setRedirectCountdown(null);
    setExpandedStage(null);
    setRowCount(null);
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
      try { return JSON.stringify(raw); } catch { return String(raw); }
    }
    return String(raw);
  };

  // ── Poll DuckDB readiness ────────────────────────────────────────────────────

  const pollDuckdb = useCallback(async (datasetId: string) => {
    // Stage 6 (duckdb_build) should already be active
    for (let attempt = 1; attempt <= DUCKDB_MAX_POLLS; attempt++) {
      if (!isMountedRef.current) return null;

      try {
        const status = await datasetService.getDuckdbStatus(datasetId);
        if (!isMountedRef.current) return null;

        if (status.status === "ready" || status.ready) {
          return status; // success — caller handles stage transitions
        }

        if (status.status === "failed" || status.status === "error") {
          setFailureMessage(
            status.error
              ? `Analytics index build failed: ${normalizeBackendError(status.error)}`
              : "Analytics index build failed.",
          );
          return null; // failure
        }
      } catch {
        // Transient — keep polling
      }

      await new Promise((r) => setTimeout(r, DUCKDB_POLL_INTERVAL_MS));
    }

    // Timed out
    setFailureMessage("Analytics index build timed out. The dataset is ready but advanced analytics may be limited.");
    return null;
  }, []);

  // ── Main upload flow ─────────────────────────────────────────────────────────

  const startUpload = async (selectedFile: File) => {
    setFile(selectedFile);
    setFailureMessage("");
    setUploadedDatasetId(null);
    setRedirectCountdown(null);
    setRowCount(null);
    setExpandedStage(null);
    setIsUploading(true);

    // Reset pipeline and start
    const initial = makeInitialPipeline();
    setPipeline(advanceTo(initial, 'upload_file', { upload_file: `${fileSizeMB(selectedFile)} MB to upload` }));

    try {
      // Single combined API call — backend creates dataset + ingests + generates dashboard
      const result = await uploadService.uploadNewDataset(
        selectedFile,
        selectedFile.name.replace(/\.[^.]+$/, ''), // name without extension
      );

      if (!isMountedRef.current) return;

      const datasetId = result.dataset_id;
      const versionId = result.version_id;
      setUploadedDatasetId(datasetId);
      sessionStorage.setItem("vizzy.dashboard.selectedDatasetId", datasetId);

      // Collect dynamic details from the response
      const cols = result.schema?.length ?? 0;
      const rows = result.row_count ?? 0;
      setRowCount(rows);

      // Stages 1-5 are now complete
      let p = pipeline;
      p = completeUpTo(p, 'dashboard_gen', {
        upload_file: `${fileSizeMB(selectedFile)} MB uploaded`,
        ingesting: `${cols} columns detected`,
        semantic_audit: `${cols} columns classified`,
        dashboard_gen: `Dashboard generated for ${rows.toLocaleString()} rows`,
      });
      // Activate DuckDB build stage
      p = advanceTo(p, 'duckdb_build', {
        duckdb_build: `Indexing ${rows.toLocaleString()} rows`,
      });
      setPipeline(p);

      // Poll for DuckDB readiness
      const duckStatus = await pollDuckdb(datasetId);

      if (!isMountedRef.current) return;

      if (duckStatus && duckStatus.status === "ready") {
        // DuckDB ready — complete build stage
        p = completeCurrent(pipeline);
        // Activate apply_mappings
        p = advanceTo(p, 'apply_mappings');
        setPipeline(p);

        // Apply AI mappings
        try {
          const mappingRes = await semanticMappingService.proposeMapping(datasetId, versionId);
          const proposals = mappingRes?.proposal?.metadata?.proposals || [];
          const finalMap: Record<string, string> = {};
          proposals.forEach((p: any) => { finalMap[p.column_name] = p.role; });
          await semanticMappingService.confirmMapping(datasetId, versionId, finalMap, []);

          p = completeUpTo(pipeline, 'apply_mappings', {
            apply_mappings: `${Object.keys(finalMap).length} mappings confirmed`,
          });
        } catch {
          p = completeUpTo(pipeline, 'apply_mappings', {
            apply_mappings: 'Auto-mapping skipped',
          });
        }

        // Final: ready
        p = completeUpTo(p, 'ready');
        setPipeline(p);

        // Countdown to dashboard
        let count = 3;
        setRedirectCountdown(count);
        const interval = setInterval(() => {
          count -= 1;
          if (isMountedRef.current) setRedirectCountdown(count);
          if (count <= 0) {
            clearInterval(interval);
            if (isMountedRef.current) navigate("/user/dashboard");
          }
        }, 1000);
      } else {
        // DuckDB failed or timed out — dataset is still usable
        p = updateStage(pipeline, 'duckdb_build', {
          status: 'failed',
          detail: failureMessage || 'Analytics index build failed',
        });
        setPipeline(p);
      }
    } catch (error: any) {
      if (!isMountedRef.current) return;
      console.error("Upload failed:", error);
      const errDetail = error?.response?.data?.detail || error?.response?.data || error?.message;
      const msg = errDetail
        ? `Upload failed: ${normalizeBackendError(errDetail)}`
        : "Upload failed. Please retry the upload. If this persists, check file format or size.";
      setFailureMessage(msg);

      // Mark the currently-active stage as failed
      setPipeline((prev) =>
        updateStage(prev, prev.find((s) => s.status === 'active')?.key ?? 'upload_file', {
          status: 'failed',
          detail: msg,
        }),
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ── Helpers for drag-and-drop ─────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) startUpload(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) startUpload(e.target.files[0]);
  };

  // ── Helpers for stage detail ──────────────────────────────────────────────────

  const toggleDetail = (key: StageKey) => {
    setExpandedStage((prev) => (prev === key ? null : key));
  };

  const activeStage = pipeline.find((s) => s.status === 'active');
  const failedStage = pipeline.find((s) => s.status === 'failed');
  const isComplete = pipeline[pipeline.length - 1]?.status === 'completed';

  // ── Render ────────────────────────────────────────────────────────────────────

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
            subtitle={file ? `Processing ${file.name}` : "Upload a file to begin"}
            icon={<UploadIcon className="h-3.5 w-3.5" />}
          />
          <div className="p-6">

            {/* ── Drop zone (idle) ──────────────────────────────────────── */}
            {!file && !isUploading && !isComplete && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative grid cursor-pointer place-items-center rounded-lg border-2 border-dashed p-12 text-center transition ${
                  isDragging
                    ? "border-accent bg-accent/5"
                    : "border-border bg-surface-2/40 hover:bg-surface-2/60"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-3">
                  <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-3 text-[14px] font-semibold">Drop your dataset here</h3>
                <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
                  We'll ingest into DuckDB, build indexes, and run AI semantic auditing automatically.
                </p>
                <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <BtnPrimary onClick={() => fileInputRef.current?.click()}>
                    <UploadIcon className="h-3 w-3" />Browse files
                  </BtnPrimary>
                </div>
              </div>
            )}

            {/* ── Timeline panel (uploading, building, ready) ──────────── */}
            {(file || isUploading || isComplete || failedStage) && (
              <div className="animate-fade-in">
                {/* Timeline itself */}
                <div className="relative pl-6">
                  {/* Vertical connector line spanning all stages */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/60" />

                  {pipeline.map((stage, idx) => {
                    const isExpanded = expandedStage === stage.key;
                    const elapsed =
                      stage.status === 'active' && stage.activatedAt
                        ? now - stage.activatedAt
                        : stage.elapsedMs;

                    return (
                      <div key={stage.key} className="relative pb-5 last:pb-0">
                        {/* Connection dot */}
                        <div className="absolute -left-[22px] top-0.5 grid place-items-center">
                          <StageIcon status={stage.status} />
                        </div>

                        {/* Stage row */}
                        <div
                          onClick={() => toggleDetail(stage.key)}
                          className={`
                            group flex items-center justify-between rounded-md px-3 py-2
                            transition-all cursor-pointer
                            ${stage.status === 'active' ? 'bg-primary/5 -mx-1 px-4' : ''}
                            ${stage.status === 'failed' ? 'bg-destructive/5 -mx-1 px-4' : ''}
                            ${stage.status === 'pending' ? 'opacity-40' : ''}
                            ${stage.status === 'completed' ? 'hover:bg-surface-2/50' : ''}
                          `}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`
                              text-[12.5px] font-medium truncate
                              ${stage.status === 'active' ? 'text-primary' : ''}
                              ${stage.status === 'failed' ? 'text-destructive' : ''}
                              ${stage.status === 'completed' ? 'text-foreground' : ''}
                              ${stage.status === 'pending' ? 'text-muted-foreground' : ''}
                            `}>
                              {stage.label}
                            </span>
                            {isExpanded && stage.detail && (
                              <span className="text-[11px] text-muted-foreground/70 hidden sm:inline truncate max-w-[200px]">
                                {stage.detail}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`
                              font-mono text-[10px] tabular-nums
                              ${stage.status === 'active' ? 'text-primary' : 'text-muted-foreground'}
                            `}>
                              {stage.status === 'pending' ? '\u2014' : `${formatElapsed(elapsed)}`}
                            </span>
                          </div>
                        </div>

                        {/* Expanded detail line */}
                        {isExpanded && stage.detail && (
                          <div className="ml-3 mt-1 text-[11px] text-muted-foreground/70 leading-relaxed">
                            {stage.detail}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* File info */}
                {file && (
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border pt-4">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">{file.name}</span>
                    <span className="text-muted-foreground/50">({fileSizeMB(file)} MB)</span>
                    {rowCount !== null && (
                      <>
                        <span className="text-muted-foreground/30">·</span>
                        <span>{rowCount.toLocaleString()} rows</span>
                      </>
                    )}
                  </div>
                )}

                {/* ── Footer actions ──────────────────────────────────── */}
                <div className="mt-6 flex items-center gap-3">

                  {/* Idle / uploading → Cancel */}
                  {isUploading && (
                    <BtnSecondary onClick={resetUpload}>
                      Cancel
                    </BtnSecondary>
                  )}

                  {/* Failure: dataset IS usable (stages 6-8 failed) → Continue or Retry */}
                  {failedStage && uploadedDatasetId && (
                    <>
                      <BtnPrimary onClick={() => navigate("/user/dashboard")}>
                        Continue to Dashboard
                      </BtnPrimary>
                      <BtnSecondary onClick={resetUpload}>
                        Try Again
                      </BtnSecondary>
                    </>
                  )}

                  {/* Failure: dataset NOT created (stages 1-5 failed) → Retry only */}
                  {failedStage && !uploadedDatasetId && (
                    <BtnPrimary onClick={resetUpload}>
                      Try Again
                    </BtnPrimary>
                  )}

                  {/* Success → Go to Dashboard */}
                  {isComplete && (
                    <div className="w-full flex flex-col items-center gap-2">
                      <BtnPrimary onClick={() => navigate("/user/dashboard")} className="px-6 py-2">
                        Go to Dashboard
                      </BtnPrimary>
                      {redirectCountdown !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          Opening dashboard in {redirectCountdown}s...
                        </span>
                      )}
                    </div>
                  )}

                </div>

                {/* Failure detail box */}
                {failedStage && failureMessage && (
                  <div className="mt-4 w-full rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left font-mono text-[10.5px] leading-relaxed text-foreground/90 break-all max-h-28 overflow-auto">
                    {failureMessage}
                  </div>
                )}
              </div>
            )}

          </div>
        </Panel>
      </div>
    </div>
  );
}
