import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, Sparkles, Play, Database, Loader2, Info,
  ArrowRight, CornerDownRight, Trash2, Edit3, Clock, ChevronLeft,
  Activity, Table, Eye, Check, ChevronDown
} from "lucide-react";
import { ArcElement, Chart as ChartJS, Tooltip as ChartTooltip, type ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { AxiosError } from "axios";
import { datasetService, type Dataset, type DatasetVersionSummary } from "../../lib/api/dataset";
import { cleaningService, type Recommendation, type HealthScore } from "../../services/cleaningService";
import type { InspectionReport } from "../../services/cleaningService";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, PanelHeader, Pill, BtnSecondary, BtnPrimary, BtnAccent } from "@/components/ui/primitive";

const EMPTY_ARRAY: any[] = [];

ChartJS.register(ArcElement, ChartTooltip);

const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof AxiosError) {
        const detail = error.response?.data?.detail;
        if (typeof detail === "string" && detail.trim()) {
            return detail;
        }
    }
    return fallback;
};

export default function DataCleaning() {
    const navigate = useNavigate();
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [executionReport, setExecutionReport] = useState<any | null>(null);
    const [lastCleanedVersionId, setLastCleanedVersionId] = useState<string | null>(null);
    const [selectedDatasetId, setSelectedDatasetId] = useState("");
    const [inspection, setInspection] = useState<InspectionReport | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorState, setErrorState] = useState<string | null>(null);
    const inspectionRequestId = useRef(0);

    const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(new Set());
    const [selectedStrategies, setSelectedStrategies] = useState<Record<string, string>>({});
    
    // Already Cleaned Gate States
    const [activeVersion, setActiveVersion] = useState<DatasetVersionSummary | null>(null);
    const [showCleanedGate, setShowCleanedGate] = useState(false);
    const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
    const [blockedModalMessage, setBlockedModalMessage] = useState("");

    // Custom dropdown states
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const datasetDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (datasetDropdownRef.current && !datasetDropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Live Preview States
    const [previewData, setPreviewData] = useState<any | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"grid" | "analytics" | "pipeline">("grid");

    const originalRef = useRef<HTMLDivElement>(null);
    const cleanedRef = useRef<HTMLDivElement>(null);

    const handleOriginalScroll = () => {
        if (originalRef.current && cleanedRef.current) {
            cleanedRef.current.scrollTop = originalRef.current.scrollTop;
            cleanedRef.current.scrollLeft = originalRef.current.scrollLeft;
        }
    };

    const handleCleanedScroll = () => {
        if (originalRef.current && cleanedRef.current) {
            originalRef.current.scrollTop = cleanedRef.current.scrollTop;
            originalRef.current.scrollLeft = cleanedRef.current.scrollLeft;
        }
    };

    useEffect(() => {
        loadDatasets();
    }, []);

    useEffect(() => {
        if (selectedDatasetId) {
            loadInspection(selectedDatasetId);
        } else {
            inspectionRequestId.current += 1;
            setInspection(null);
            setPreviewData(null);
            setIsLoading(false);
            setErrorState(null);
        }
    }, [selectedDatasetId]);

    const loadDatasets = async () => {
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
        } catch (error) {
            console.error("Failed to load datasets:", error);
            toast.error("Failed to load datasets");
        }
    };

    const loadInspection = async (id: string, forceRescan = false, overrideVersionId?: string) => {
        const requestId = ++inspectionRequestId.current;
        const dataset = datasets.find(d => d.id === id);
        if (!dataset || !dataset.current_version_id) {
            setErrorState("Dataset or version not found.");
            return;
        }

        const versionId = overrideVersionId || dataset.current_version_id;
        setIsLoading(true);
        setInspection(null);
        setPreviewData(null);
        setErrorState(null);

        try {
            let latestVersion: DatasetVersionSummary | null = null;
            if (overrideVersionId) {
                const versions = await datasetService.listVersionsForDataset(id);
                latestVersion = versions.find((v: DatasetVersionSummary) => v.id === overrideVersionId) || null;
            } else {
                latestVersion = await datasetService.getLatestVersion(id);
            }
            setActiveVersion(latestVersion);

            if (!overrideVersionId && latestVersion && latestVersion.source_type === 'CLEAN') {
                setShowCleanedGate(true);
            } else {
                setShowCleanedGate(false);
            }

            const inspectionVersionId = latestVersion?.id || versionId;
            let newReport: InspectionReport | null = null;
            if (!forceRescan) {
                try {
                    newReport = await cleaningService.getInspection(inspectionVersionId);
                } catch {
                    // fallthrough to runInspection
                }
            }

            if (!newReport) {
                newReport = await cleaningService.runInspection(inspectionVersionId);
            }
            if (requestId !== inspectionRequestId.current) return;
            setInspection(newReport);

            // Initialize selections
            const recs = newReport?.issues_detected?.recommendations || [];
            setSelectedRecIds(new Set(recs.map((r: Recommendation) => r.id)));
            
            const initialStrategies: Record<string, string> = {};
            recs.forEach((r: Recommendation) => {
                initialStrategies[r.id] = r.strategy;
            });
            setSelectedStrategies(initialStrategies);

        } catch (error) {
            if (requestId !== inspectionRequestId.current) return;
            console.error("Failed to inspect dataset:", error);
            setErrorState(getApiErrorMessage(
                error,
                "Failed to run quality inspection. The dataset might be too large or the service is temporarily unavailable."
            ));
        } finally {
            if (requestId === inspectionRequestId.current) {
                setIsLoading(false);
            }
        }
    };

    // Trigger preview load whenever recommendations or strategies change
    useEffect(() => {
        if (inspection && inspection.dataset_version_id) {
            const delayDebounceFn = setTimeout(() => {
                loadPreview(inspection.dataset_version_id, selectedRecIds, selectedStrategies);
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setPreviewData(null);
        }
    }, [selectedRecIds, selectedStrategies, inspection]);

    const loadPreview = async (versionId: string, recIds: Set<string>, strategies: Record<string, string>) => {
        if (recIds.size === 0) {
            setPreviewData(null);
            return;
        }
        setIsPreviewLoading(true);
        try {
            const actions: Record<string, any> = {
                fill_missing: [],
                drop_rows: [],
                remove_duplicates: false,
                cap_outliers: [],
                remove_outliers: [],
            };

            const allRecs = inspection?.issues_detected?.recommendations || [];
            const selectedRecs = allRecs.filter((r: Recommendation) => recIds.has(r.id));

            for (const rec of selectedRecs) {
                const effectiveStrategy = strategies[rec.id] || rec.strategy;

                if (rec.issue_type === "missing_values") {
                    if (effectiveStrategy === "fill_mean") {
                        actions.fill_missing.push({ column: rec.column, method: "mean" });
                    } else if (effectiveStrategy === "fill_median") {
                        actions.fill_missing.push({ column: rec.column, method: "median" });
                    } else if (effectiveStrategy === "drop_rows") {
                        if (rec.column) actions.drop_rows.push(rec.column);
                    }
                } else if (rec.issue_type === "duplicates") {
                    if (effectiveStrategy === "remove_duplicates") {
                        actions.remove_duplicates = true;
                    }
                } else if (rec.issue_type === "outliers") {
                    if (effectiveStrategy === "cap_outliers") {
                        if (rec.column) actions.cap_outliers.push(rec.column);
                    } else if (effectiveStrategy === "remove_outliers") {
                        if (rec.column) actions.remove_outliers.push(rec.column);
                    }
                }
            }

            const data = await cleaningService.previewPlan(versionId, actions);
            setPreviewData(data);
        } catch (error) {
            console.error("Failed to load preview:", error);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedRecIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedRecIds(newSelected);
    };

    const selectAll = () => {
        const recs = inspection?.issues_detected?.recommendations || [];
        if (selectedRecIds.size === recs.length) {
            setSelectedRecIds(new Set());
        } else {
            setSelectedRecIds(new Set(recs.map((r: Recommendation) => r.id)));
        }
    };

    const handleExecuteCleaning = async () => {
        if (!selectedDatasetId || !inspection) return;

        const dataset = datasets.find(d => d.id === selectedDatasetId);
        if (!dataset || !dataset.current_version_id) {
            toast.error("Dataset version not found");
            return;
        }

        let versionId = dataset.current_version_id;
        try {
            const latestVersion = await datasetService.getLatestVersion(selectedDatasetId);
            versionId = latestVersion?.id || versionId;
        } catch {
            // Use the version id already present in the dataset list.
        }

        if (selectedRecIds.size === 0) {
            toast("Please select at least one recommendation to apply.", { icon: "i" });
            return;
        }

        setIsProcessing(true);
        try {
            const actions: Record<string, any> = {
                fill_missing: [],
                drop_rows: [],
                remove_duplicates: false,
                cap_outliers: [],
                remove_outliers: [],
            };

            const allRecs = inspection.issues_detected.recommendations || [];
            const selectedRecs = allRecs.filter((r: Recommendation) => selectedRecIds.has(r.id));

            for (const rec of selectedRecs) {
                const effectiveStrategy = selectedStrategies[rec.id] || rec.strategy;

                if (rec.issue_type === "missing_values") {
                    if (effectiveStrategy === "fill_mean") {
                        actions.fill_missing.push({ column: rec.column, method: "mean" });
                    } else if (effectiveStrategy === "fill_median") {
                        actions.fill_missing.push({ column: rec.column, method: "median" });
                    } else if (effectiveStrategy === "drop_rows") {
                        if (rec.column) actions.drop_rows.push(rec.column);
                    }
                } else if (rec.issue_type === "duplicates") {
                    if (effectiveStrategy === "remove_duplicates") {
                        actions.remove_duplicates = true;
                    }
                } else if (rec.issue_type === "outliers") {
                    if (effectiveStrategy === "cap_outliers") {
                        if (rec.column) actions.cap_outliers.push(rec.column);
                    } else if (effectiveStrategy === "remove_outliers") {
                        if (rec.column) actions.remove_outliers.push(rec.column);
                    }
                }
            }

            let plan;
            try {
                plan = await cleaningService.createPlan(versionId, actions);
            } catch (err: any) {
                if (err?.response?.status === 409) {
                    plan = await cleaningService.getPlan(versionId);
                } else {
                    throw err;
                }
            }

            if (!plan.approved) {
                plan = await cleaningService.approvePlan(versionId, plan.id);
            }

            const result = await cleaningService.executePlan(versionId, plan.id);

            toast.success(
                `Cleaned successfully. ${result.rows_before} to ${result.rows_after} rows`
            );

            setLastCleanedVersionId(result.version_id || versionId);
            setExecutionReport(result);
        } catch (error: any) {
            console.error("Failed to execute cleaning:", error);
            const detail = error?.response?.data?.detail;
            let errMsg = typeof detail === "string" ? detail : "";
            if (errMsg.includes("': ")) {
                errMsg = errMsg.split("': ")[1];
            }
            if (error?.response?.status === 409) {
                const finalMsg = errMsg || "A cleaned version of this dataset already exists.";
                setBlockedModalMessage(finalMsg);
                setIsBlockedModalOpen(true);
            } else {
                const finalMsg = errMsg || "Failed to execute cleaning plan";
                toast.error(finalMsg);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const recommendationsList: Recommendation[] = inspection?.issues_detected?.recommendations || EMPTY_ARRAY;
    const healthScoreObj: HealthScore | undefined = inspection?.issues_detected?.health_score;
    const currentDataset = datasets.find(d => d.id === selectedDatasetId);
    
    const baseScore = healthScoreObj?.score ?? 100;
    const improvedScore = Math.min(100, baseScore + selectedRecIds.size * 2);

    const originalRecords = previewData?.original_data || [];
    const cleanedRecords = previewData?.cleaned_data || [];
    const headers = originalRecords.length > 0 ? Object.keys(originalRecords[0]).filter(k => k !== "_vizzy_row_idx") : [];

    // Helper to identify cell change state
    const getCellChange = (rowIdx: number, column: string, originalVal: any) => {
        if (!previewData || !previewData.changes) return { modified: false, cleanValue: originalVal, isNull: originalVal === null };
        const change = previewData.changes.find((c: any) => c.row === rowIdx && c.column === column);
        if (change) {
            return {
                modified: true,
                cleanValue: change.cleaned,
                isNull: originalVal === null || originalVal === undefined
            };
        }
        return {
            modified: false,
            cleanValue: originalVal,
            isNull: originalVal === null || originalVal === undefined
        };
    };

    if (executionReport) {
        const changesList = executionReport.changes || [];
        const formatTime = (isoString: string) => {
            if (!isoString) return "N/A";
            try {
                return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch {
                return isoString;
            }
        };

        return (
            <div className="bg-noise min-h-screen flex flex-col text-foreground font-sans">
                <PageHeader
                    breadcrumb={["Datasets", "Cleaning", "Report"]}
                    title="Cleaning report"
                    description={`Successfully processed ${currentDataset?.name || "dataset"}`}
                    actions={(
                        <>
                            <BtnSecondary onClick={() => {
                                setExecutionReport(null);
                                if (selectedDatasetId) {
                                    loadInspection(selectedDatasetId, true);
                                }
                            }} className="bg-surface border-border text-muted-foreground hover:text-foreground rounded-none">
                                <ChevronLeft className="h-3 w-3" />
                                Clean another dataset
                            </BtnSecondary>
                            <BtnPrimary onClick={() => {
                                if (selectedDatasetId) {
                                    sessionStorage.setItem('vizzy.dashboard.selectedDatasetId', selectedDatasetId);
                                }
                                if (lastCleanedVersionId) {
                                    sessionStorage.setItem('vizzy.dashboard.selectedVersionId', lastCleanedVersionId);
                                }
                                sessionStorage.removeItem('vizzy.dashboard.analyticsCache.v2');
                                navigate("/user/dashboard");
                            }} className="bg-accent text-accent-foreground hover:opacity-90 rounded-none">
                                Go to Dashboard
                                <ArrowRight className="h-3 w-3" />
                            </BtnPrimary>
                        </>
                    )}
                />

                <div className="grid grid-cols-12 gap-px border-b border-border bg-border">
                    <div className="col-span-12 md:col-span-3 bg-surface px-5 py-5 border-r border-border">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">Original size</div>
                        <div className="num mt-1.5 text-display text-[22px] font-semibold text-foreground">{executionReport.rows_before} rows</div>
                    </div>
                    <div className="col-span-12 md:col-span-3 bg-surface px-5 py-5 border-r border-border">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">Cleaned size</div>
                        <div className="num mt-1.5 text-display text-[22px] font-semibold text-success">{executionReport.rows_after} rows</div>
                    </div>
                    <div className="col-span-12 md:col-span-3 bg-surface px-5 py-5 border-r border-border">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">Rows dropped</div>
                        <div className={`num mt-1.5 text-display text-[22px] font-semibold ${executionReport.rows_dropped > 0 ? "text-warning" : "text-muted-foreground"}`}>{executionReport.rows_dropped} rows</div>
                    </div>
                    <div className="col-span-12 md:col-span-3 bg-surface px-5 py-5">
                        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">Values fixed</div>
                        <div className={`num mt-1.5 text-display text-[22px] font-semibold ${executionReport.cells_modified > 0 ? "text-accent" : "text-muted-foreground"}`}>{executionReport.cells_modified} values</div>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-4 px-5 py-4 flex-1">
                    <Panel className="col-span-12 lg:col-span-8 flex flex-col max-h-[calc(100vh-220px)] border-border bg-surface rounded-none">
                        <PanelHeader
                            title="Side-by-side transparency log"
                            subtitle={`Detailed diff showing ${changesList.length} fixed values`}
                            icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
                        />
                        
                        {changesList.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center p-12">
                                <div className="text-center space-y-3">
                                    <div className="w-10 h-10 bg-success/10 border border-success/20 rounded-none flex items-center justify-center mx-auto mb-2">
                                        <CheckCircle2 className="h-5 w-5 text-success" />
                                    </div>
                                    <h4 className="text-sm font-medium text-foreground">Cleaned successfully</h4>
                                    <p className="text-[12.5px] text-muted-foreground">All rules ran but no cells needed modifying (e.g. no missing values found to fill).</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar font-sans">
                                <table className="w-full text-[12.5px]">
                                    <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">
                                        <tr>
                                            <th className="px-3 py-2.5 text-left font-medium">Column</th>
                                            <th className="px-3 py-2.5 text-left font-medium">Row Index</th>
                                            <th className="px-3 py-2.5 text-left font-medium">Original Value</th>
                                            <th className="px-3 py-2.5 text-center font-medium w-8"></th>
                                            <th className="px-3 py-2.5 text-left font-medium">Fixed Value</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-mono">
                                        {changesList.map((ch: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-surface-2/60 transition">
                                                <td className="px-3 py-2.5 text-[12px] font-semibold text-foreground/80 font-mono">{ch.column}</td>
                                                <td className="px-3 py-2.5 text-[11px] text-muted-foreground font-sans">{ch.row}</td>
                                                <td className="px-3 py-2.5 text-destructive line-through bg-destructive/10 max-w-[180px] truncate" title={ch.original ?? "null"}>
                                                    {ch.original ?? <span className="italic opacity-60">null</span>}
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                                                </td>
                                                <td className="px-3 py-2.5 text-success bg-success/10 max-w-[180px] truncate font-semibold font-mono" title={ch.cleaned ?? "null"}>
                                                    {ch.cleaned ?? <span className="italic opacity-60">null</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    <div className="col-span-12 lg:col-span-4 space-y-4">
                        <Panel className="border-border bg-surface rounded-none shadow-sm">
                            <PanelHeader title="System execution details" icon={<Clock className="h-3.5 w-3.5 text-accent" />} />
                            <div className="p-4 space-y-4 text-[12.5px]">
                                <div className="space-y-2.5">
                                    <div className="flex justify-between border-b border-border pb-2">
                                        <span className="text-muted-foreground font-sans">Steps executed</span>
                                        <span className="font-semibold text-foreground font-mono">{executionReport.steps_executed} rules</span>
                                    </div>
                                    <div className="flex justify-between border-b border-border pb-2 font-sans">
                                        <span className="text-muted-foreground">Started at</span>
                                        <span className="font-mono text-[11px] text-foreground">{formatTime(executionReport.started_at)}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-border pb-2 font-sans">
                                        <span className="text-muted-foreground">Completed at</span>
                                        <span className="font-mono text-[11px] text-foreground">{formatTime(executionReport.completed_at)}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-border pb-2 font-sans">
                                        <span className="text-muted-foreground">Status</span>
                                        <span className="text-success font-semibold flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> SUCCESS
                                        </span>
                                    </div>
                                </div>

                                <BtnAccent className="w-full justify-center rounded-none bg-accent text-accent-foreground hover:opacity-90" onClick={() => {
                                    if (selectedDatasetId) {
                                        sessionStorage.setItem('vizzy.dashboard.selectedDatasetId', selectedDatasetId);
                                    }
                                    if (lastCleanedVersionId) {
                                        sessionStorage.setItem('vizzy.dashboard.selectedVersionId', lastCleanedVersionId);
                                    }
                                    sessionStorage.removeItem('vizzy.dashboard.analyticsCache.v2');
                                    navigate("/user/dashboard");
                                }}>
                                    View on dashboard
                                    <ArrowRight className="h-3 w-3" />
                                </BtnAccent>
                            </div>
                        </Panel>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-noise min-h-screen flex flex-col text-foreground font-sans select-none">
            <PageHeader
                breadcrumb={["Datasets", "Cleaning"]}
                title="Data health studio"
                description={currentDataset ? `${currentDataset.name} · ${recommendationsList.length} findings` : "Select a dataset to audit"}
                actions={(
                    <>
                        <div className="relative inline-block text-left" ref={datasetDropdownRef}>
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                disabled={isLoading || isProcessing}
                                className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border text-muted-foreground hover:text-foreground text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed select-none min-w-[150px] justify-between transition-all duration-150"
                            >
                                <span className="flex items-center gap-2 truncate">
                                    <Database className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                        {currentDataset ? currentDataset.name : 'Select dataset'}
                                    </span>
                                </span>
                                <ChevronDown className={`h-3 w-3 transition-transform duration-200 shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-1 w-56 rounded-none border border-border bg-surface shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                                    <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1">
                                        Select Dataset
                                    </div>
                                    {datasets.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                            No datasets found
                                        </div>
                                    ) : (
                                        datasets.map(ds => {
                                            const isSelected = ds.id === selectedDatasetId;
                                            return (
                                                <button
                                                    key={ds.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedDatasetId(ds.id);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors duration-150 ${
                                                        isSelected
                                                            ? 'bg-accent/10 text-accent font-semibold'
                                                            : 'text-foreground hover:bg-[#f4f5f6] dark:hover:bg-[#202227]'
                                                    }`}
                                                >
                                                    <span className="truncate pr-2">{ds.name}</span>
                                                    {isSelected && <Check className="h-3 w-3 text-accent shrink-0" />}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                        <BtnPrimary onClick={handleExecuteCleaning} disabled={isProcessing || selectedRecIds.size === 0 || !inspection} className="bg-accent text-accent-foreground hover:opacity-90 rounded-none">
                            {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            Execute Cleaning Plan ({selectedRecIds.size})
                        </BtnPrimary>
                    </>
                )}
            />

            {inspection && (
                <div className="grid grid-cols-12 gap-px border-b border-border bg-border">
                    <HealthScoreWidget score={baseScore} riskLevel={inspection.risk_level} />
                    <HealthMetric label="Completeness" value={`${Math.max(0, 100 - (healthScoreObj?.breakdown?.missing_values_penalty || 0)).toFixed(1)}%`} tone={(healthScoreObj?.breakdown?.missing_values_penalty || 0) > 5 ? "warning" : "success"} />
                    <HealthMetric label="Validity" value={`${Math.max(0, 100 - (healthScoreObj?.breakdown?.other_penalty || 0)).toFixed(1)}%`} tone={(healthScoreObj?.breakdown?.other_penalty || 0) > 5 ? "warning" : "success"} />
                    <HealthMetric label="Uniqueness" value={`${Math.max(0, 100 - (healthScoreObj?.breakdown?.duplicates_penalty || 0)).toFixed(1)}%`} tone={(healthScoreObj?.breakdown?.duplicates_penalty || 0) > 5 ? "warning" : "success"} />
                </div>
            )}

            {activeVersion?.source_type === 'CLEAN' && !showCleanedGate && (
                <div className="mx-5 mt-4 p-3 bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-400 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-sky-500" />
                        <span>This dataset was cleaned on {activeVersion?.created_at ? new Date((activeVersion as any).created_at).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                    </div>
                    <button 
                        onClick={() => setShowCleanedGate(true)}
                        className="underline hover:text-sky-500 font-semibold"
                    >
                        Change actions (Re-run / Modify / Reset)
                    </button>
                </div>
            )}

            <div className="flex flex-row flex-1 p-5 gap-5 overflow-hidden">
                {!selectedDatasetId ? (
                    <div className="flex-1 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md mx-auto space-y-4">
                            <div className="w-12 h-12 bg-surface border border-border rounded-none flex items-center justify-center mx-auto mb-2 shadow-sm">
                                <Database className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <h3 className="text-base font-medium text-foreground">No dataset selected</h3>
                            <p className="text-[13px] text-muted-foreground leading-relaxed">
                                Choose a dataset from the top menu to run a quality inspection and generate a cleaning plan.
                            </p>
                        </div>
                    </div>
                ) : showCleanedGate ? (
                    <div className="flex-1 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-2xl mx-auto space-y-6 p-8 border border-sky-500/20 bg-sky-500/5 backdrop-blur-sm shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-sky-500" />
                            
                            <div className="w-14 h-14 bg-sky-500/10 border border-sky-500/20 rounded-none flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="h-6 w-6 text-sky-500" />
                            </div>
                            
                            <div className="space-y-2">
                                <h3 className="text-lg font-semibold text-foreground uppercase tracking-wider font-mono">Dataset Already Cleaned</h3>
                                <p className="text-[13px] text-muted-foreground leading-relaxed max-w-md mx-auto">
                                    This dataset version was already cleaned on{" "}
                                    <span className="text-foreground font-semibold font-mono">
                                        {activeVersion?.created_at ? new Date((activeVersion as any).created_at).toLocaleDateString() : new Date().toLocaleDateString()}
                                    </span>.
                                    Re-running cleaning directly on a cleaned dataset may cause unexpected results.
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-4 pt-4 max-w-lg mx-auto">
                                <button
                                    onClick={async () => {
                                        setShowCleanedGate(false);
                                        toast.success("Proceeding to re-run on current version");
                                    }}
                                    className="flex flex-col items-center justify-center p-4 bg-surface hover:bg-sky-500/5 border border-border hover:border-sky-500 transition-all group"
                                >
                                    <Play className="h-5 w-5 text-muted-foreground group-hover:text-sky-500 mb-2" />
                                    <span className="text-xs font-semibold text-foreground font-mono">Re-run</span>
                                    <span className="text-[10px] text-muted-foreground mt-1 text-center font-sans">Run cleaning on this version</span>
                                </button>

                                <button
                                    onClick={async () => {
                                        if (activeVersion?.parent_version_id) {
                                            await loadInspection(selectedDatasetId, false, activeVersion.parent_version_id);
                                            toast.success("Loaded parent version for modification");
                                        } else {
                                            setShowCleanedGate(false);
                                            toast("No parent version found. Modifying current version.", { icon: "i" });
                                        }
                                    }}
                                    className="flex flex-col items-center justify-center p-4 bg-surface hover:bg-sky-500/5 border border-border hover:border-sky-500 transition-all group"
                                >
                                    <Edit3 className="h-5 w-5 text-muted-foreground group-hover:text-sky-500 mb-2" />
                                    <span className="text-xs font-semibold text-foreground font-mono">Modify</span>
                                    <span className="text-[10px] text-muted-foreground mt-1 text-center font-sans">Edit original recommendations</span>
                                </button>

                                <button
                                    onClick={async () => {
                                        if (activeVersion?.parent_version_id) {
                                            await loadInspection(selectedDatasetId, true, activeVersion.parent_version_id);
                                            setSelectedRecIds(new Set());
                                            toast.success("Reset to original raw version");
                                        } else {
                                            setSelectedRecIds(new Set());
                                            setShowCleanedGate(false);
                                            toast.success("Cleared all selections");
                                        }
                                    }}
                                    className="flex flex-col items-center justify-center p-4 bg-surface hover:bg-sky-500/5 border border-border hover:border-sky-500 transition-all group"
                                >
                                    <Trash2 className="h-5 w-5 text-muted-foreground group-hover:text-sky-500 mb-2" />
                                    <span className="text-xs font-semibold text-foreground font-mono">Reset</span>
                                    <span className="text-[10px] text-muted-foreground mt-1 text-center font-sans">Discard cleaning, start fresh</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="flex-1 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md mx-auto space-y-4">
                            <Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" />
                            <h3 className="text-base font-medium text-foreground font-mono">Running deep inspection</h3>
                            <p className="text-[13px] text-muted-foreground leading-relaxed">
                                Analyzing {currentDataset?.name} for missing values, outliers, and consistency issues. This might take a moment.
                            </p>
                        </div>
                    </div>
                ) : errorState ? (
                    <div className="flex-1 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md mx-auto space-y-4 p-6 bg-destructive/5 border border-destructive/20 rounded-none">
                            <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
                            <h3 className="text-base font-medium text-destructive font-mono">Inspection Failed</h3>
                            <p className="text-[13px] text-destructive/80 leading-relaxed">
                                {errorState}
                            </p>
                            <BtnSecondary onClick={() => loadInspection(selectedDatasetId, true)} className="mt-2 bg-surface border-border rounded-none text-muted-foreground hover:text-foreground">
                                Try again
                            </BtnSecondary>
                        </div>
                    </div>
                ) : inspection ? (
                    <>
                        {/* LEFT COLUMN: Recommendations Studio */}
                        <div className="w-1/3 flex flex-col max-h-[calc(100vh-220px)] border border-border bg-surface-2">
                            <PanelHeader
                                title="Recommendations Hub"
                                subtitle={`${recommendationsList.length} anomalies detected`}
                                icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
                                actions={
                                    <BtnSecondary onClick={selectAll} className="text-muted-foreground hover:text-foreground border-border bg-surface rounded-none py-1 text-[11px]">
                                        {selectedRecIds.size === recommendationsList.length ? 'Deselect all' : 'Select all'}
                                    </BtnSecondary>
                                }
                            />
                            
                            {recommendationsList.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center p-12 bg-surface">
                                    <div className="text-center space-y-3">
                                        <div className="w-10 h-10 bg-success/10 border border-success/20 rounded-none flex items-center justify-center mx-auto mb-2">
                                            <CheckCircle2 className="h-5 w-5 text-success" />
                                        </div>
                                        <h4 className="text-sm font-medium text-foreground">Dataset is healthy</h4>
                                        <p className="text-[12.5px] text-muted-foreground">No critical issues were found during the inspection.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-3 space-y-3 bg-surface">
                                    {recommendationsList.map((r) => {
                                        const isSelected = selectedRecIds.has(r.id);
                                        const severityColor = r.severity === "high" ? "border-destructive/30 bg-destructive/10 text-destructive" : r.severity === "medium" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface-2 text-muted-foreground";
                                        return (
                                            <div 
                                                key={r.id} 
                                                onClick={() => toggleSelection(r.id)}
                                                className={`p-3.5 border transition cursor-pointer relative group ${isSelected ? "border-accent bg-accent/5 shadow-sm" : "border-border bg-surface-2/40 hover:border-border-strong"}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`grid h-4 w-4 place-items-center rounded-none border ${isSelected ? "border-accent bg-accent" : "border-border-strong bg-surface"}`}>
                                                            {isSelected && <Check className="h-3 w-3 text-accent-foreground stroke-[3]" />}
                                                        </div>
                                                        <span className="font-mono text-xs font-semibold text-foreground">
                                                            {r.column || "Dataset-wide"}
                                                        </span>
                                                    </div>
                                                    <Pill className={`font-mono text-[9px] px-2 py-0.5 border ${severityColor} uppercase rounded-none`}>
                                                        {r.severity}
                                                    </Pill>
                                                </div>

                                                <div className="mt-2.5">
                                                    <div className="text-[12.5px] font-medium text-foreground capitalize">{r.issue_type.replace(/_/g, ' ')}</div>
                                                    <div className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">{r.description}</div>
                                                </div>

                                                <div className="mt-3 flex items-center justify-between gap-4 pt-2.5 border-t border-border/60">
                                                    <span className="text-[11px] text-muted-foreground font-mono">{r.impact}</span>
                                                    <div onClick={e => e.stopPropagation()}>
                                                        <select 
                                                            className="h-7 border border-border bg-surface text-foreground px-2 text-[11px] font-mono outline-none focus:border-accent rounded-none w-full max-w-[125px]" 
                                                            value={selectedStrategies[r.id] || r.strategy}
                                                            onChange={(e) => setSelectedStrategies(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                        >
                                                            {r.strategy_options.map(opt => (
                                                                <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Enterprise Workspace Tabs */}
                        <div className="w-2/3 flex flex-col max-h-[calc(100vh-220px)] border border-border bg-surface-2">
                            {/* Tab Bar */}
                            <div className="flex border-b border-border bg-surface-2 text-[12px] font-mono select-none">
                                <button 
                                    onClick={() => setActiveTab("grid")}
                                    className={`flex items-center gap-2 px-5 py-3 border-r border-border transition ${activeTab === "grid" ? "bg-surface text-accent border-b-2 border-b-accent font-semibold" : "text-muted-foreground hover:bg-surface-3/50"}`}
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                    Live View Diff
                                </button>
                                <button 
                                    onClick={() => setActiveTab("analytics")}
                                    className={`flex items-center gap-2 px-5 py-3 border-r border-border transition ${activeTab === "analytics" ? "bg-surface text-accent border-b-2 border-b-accent font-semibold" : "text-muted-foreground hover:bg-surface-3/50"}`}
                                >
                                    <Activity className="h-3.5 w-3.5" />
                                    Impact Metrics
                                </button>
                                <button 
                                    onClick={() => setActiveTab("pipeline")}
                                    className={`flex items-center gap-2 px-5 py-3 transition ${activeTab === "pipeline" ? "bg-surface text-accent border-b-2 border-b-accent font-semibold" : "text-muted-foreground hover:bg-surface-3/50"}`}
                                >
                                    <Clock className="h-3.5 w-3.5" />
                                    Execution Chain
                                </button>
                            </div>

                            {/* Tab Body */}
                            <div className="flex-1 min-h-0 bg-surface flex flex-col">
                                {activeTab === "grid" && (
                                    <>
                                        {selectedRecIds.size === 0 ? (
                                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
                                                <Database className="h-8 w-8 text-muted-foreground/60 mb-2" />
                                                <p className="text-sm font-medium">Select recommendations on the left to see live fixes</p>
                                                <p className="text-xs text-muted-foreground/60 mt-1">Changes are highlighted cell-by-cell in real-time</p>
                                            </div>
                                        ) : isPreviewLoading ? (
                                            <div className="flex-1 flex flex-col items-center justify-center p-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-accent mb-2" />
                                                <p className="text-xs text-muted-foreground font-mono">Running quick preview simulation...</p>
                                            </div>
                                        ) : previewData ? (
                                            <div className="flex-1 flex flex-col min-h-0">
                                                {/* Preview Summary Bar */}
                                                {(() => {
                                                    // Calculate deltas
                                                    const numericCols = headers.filter(h => {
                                                        return originalRecords.some((r: any) => typeof r[h] === 'number' && r[h] !== null);
                                                    });

                                                    const shifts: Array<{ column: string; originalMean: number; cleanedMean: number; pctShift: number }> = [];
                                                    numericCols.forEach(col => {
                                                        let origSum = 0;
                                                        let origCount = 0;
                                                        let cleanSum = 0;
                                                        let cleanCount = 0;

                                                        originalRecords.forEach((r: any) => {
                                                            const val = r[col];
                                                            if (typeof val === 'number' && !isNaN(val)) {
                                                                origSum += val;
                                                                origCount++;
                                                            }
                                                        });

                                                        cleanedRecords.forEach((r: any) => {
                                                            const val = r[col];
                                                            if (typeof val === 'number' && !isNaN(val)) {
                                                                cleanSum += val;
                                                                cleanCount++;
                                                            }
                                                        });

                                                        const origMean = origCount > 0 ? origSum / origCount : 0;
                                                        const cleanMean = cleanCount > 0 ? cleanSum / cleanCount : 0;
                                                        const diff = cleanMean - origMean;
                                                        if (Math.abs(diff) > 0.0001 && origMean !== 0) {
                                                            shifts.push({
                                                                column: col,
                                                                originalMean: origMean,
                                                                cleanedMean: cleanMean,
                                                                pctShift: (diff / origMean) * 100
                                                            });
                                                        }
                                                    });

                                                    let originalNulls = 0;
                                                    let cleanedNulls = 0;
                                                    originalRecords.forEach((r: any) => {
                                                        headers.forEach(h => {
                                                            if (r[h] === null || r[h] === undefined) originalNulls++;
                                                        });
                                                    });
                                                    cleanedRecords.forEach((r: any) => {
                                                        headers.forEach(h => {
                                                            if (r[h] === null || r[h] === undefined) cleanedNulls++;
                                                        });
                                                    });
                                                    const nullReduction = originalNulls - cleanedNulls;

                                                    return (
                                                        <div className="px-4 py-3 border-b border-border bg-sky-500/5 divide-y divide-border/40 text-[11.5px] font-mono">
                                                            <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
                                                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                                                    <span className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider text-sky-600">Impact Stats</span>
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="text-muted-foreground">Rows Dropped:</span>
                                                                        <span className={`font-semibold ${previewData.rows_dropped > 0 ? 'text-rose-500 font-bold' : 'text-foreground'}`}>
                                                                            {previewData.rows_dropped}
                                                                        </span>
                                                                    </span>
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="text-muted-foreground">Null Reduction:</span>
                                                                        <span className={`font-semibold ${nullReduction > 0 ? 'text-emerald-500 font-bold' : 'text-foreground'}`}>
                                                                            {nullReduction} ({originalNulls} → {cleanedNulls})
                                                                        </span>
                                                                    </span>
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="text-muted-foreground">Cells Modified/Imputed:</span>
                                                                        <span className={`font-semibold ${previewData.cells_modified > 0 ? 'text-sky-500 font-bold' : 'text-foreground'}`}>
                                                                            {previewData.cells_modified}
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                                <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                                                                    Sample: {originalRecords.length} rows
                                                                </div>
                                                            </div>
                                                            
                                                            {shifts.length > 0 && (
                                                                <div className="flex items-center gap-3 pt-2 flex-wrap">
                                                                    <span className="text-muted-foreground uppercase text-[9px] font-bold tracking-wider text-sky-600">Mean Shifts:</span>
                                                                    {shifts.slice(0, 4).map(shift => (
                                                                        <span key={shift.column} className="px-2 py-0.5 bg-surface border border-border/80 text-[10.5px] rounded-none flex items-center gap-1">
                                                                            <span className="text-muted-foreground font-semibold font-sans">{shift.column}:</span>
                                                                            <span className={shift.pctShift > 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'}>
                                                                                {shift.pctShift > 0 ? '+' : ''}{shift.pctShift.toFixed(2)}%
                                                                            </span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Split Side-by-side Table Container */}
                                                <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-border">
                                                    {/* ORIGINAL GRID */}
                                                    <div className="w-1/2 flex flex-col min-h-0">
                                                        <div className="px-3 py-1.5 bg-surface-2 border-b border-border text-[10px] uppercase font-mono tracking-wider text-destructive font-semibold flex items-center justify-between">
                                                            <span>Original sample</span>
                                                            <Pill tone="danger" className="text-[9px] rounded-none py-0 px-1 border-destructive/30 bg-destructive/10">Raw</Pill>
                                                        </div>
                                                        <div 
                                                            ref={originalRef}
                                                            onScroll={handleOriginalScroll}
                                                            className="flex-1 overflow-auto custom-scrollbar select-text text-xs"
                                                        >
                                                            <table className="w-full border-collapse">
                                                                <thead className="sticky top-0 bg-surface z-20 border-b border-border">
                                                                    <tr className="font-mono text-muted-foreground text-[10px] bg-surface">
                                                                        <th className="px-2 py-2 border-r border-b border-border text-center w-8">#</th>
                                                                        {headers.map(h => (
                                                                            <th key={h} className="px-2 py-2 border-r border-b border-border text-left font-medium">{h}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {originalRecords.map((row: any, idx: number) => (
                                                                        <tr key={idx} className="hover:bg-surface-2/40 border-b border-border/60 font-mono text-foreground">
                                                                            <td className="px-2 py-1.5 border-r border-border text-muted-foreground text-center bg-surface-2/30 text-[9px]">{idx}</td>
                                                                            {headers.map(col => {
                                                                                const { modified, isNull } = getCellChange(idx, col, row[col]);
                                                                                return (
                                                                                    <td 
                                                                                        key={col} 
                                                                                        className={`px-2 py-1.5 border-r border-border max-w-[120px] truncate ${modified ? "bg-destructive/10 text-destructive line-through font-semibold" : isNull ? "italic text-muted-foreground/60" : ""}`}
                                                                                    >
                                                                                        {row[col] === null || row[col] === undefined ? "null" : String(row[col])}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {/* CLEANED PREVIEW GRID */}
                                                    <div className="w-1/2 flex flex-col min-h-0">
                                                        <div className="px-3 py-1.5 bg-surface-2 border-b border-border text-[10px] uppercase font-mono tracking-wider text-success font-semibold flex items-center justify-between">
                                                            <span>Cleaned preview</span>
                                                            <Pill tone="success" className="text-[9px] rounded-none py-0 px-1 border-success/30 bg-success/10">Simulated</Pill>
                                                        </div>
                                                        <div 
                                                            ref={cleanedRef}
                                                            onScroll={handleCleanedScroll}
                                                            className="flex-1 overflow-auto custom-scrollbar select-text text-xs"
                                                        >
                                                            <table className="w-full border-collapse">
                                                                <thead className="sticky top-0 bg-surface z-20 border-b border-border">
                                                                    <tr className="font-mono text-muted-foreground text-[10px] bg-surface">
                                                                        <th className="px-2 py-2 border-r border-b border-border text-center w-8">#</th>
                                                                        {headers.map(h => (
                                                                            <th key={h} className="px-2 py-2 border-r border-b border-border text-left font-medium">{h}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {cleanedRecords.map((row: any, idx: number) => (
                                                                        <tr key={idx} className="hover:bg-surface-2/40 border-b border-border/60 font-mono text-foreground">
                                                                            <td className="px-2 py-1.5 border-r border-border text-muted-foreground text-center bg-surface-2/30 text-[9px]">{idx}</td>
                                                                            {headers.map(col => {
                                                                                // Lookup change details to highlight new values
                                                                                const originalRowVal = originalRecords[idx] ? originalRecords[idx][col] : null;
                                                                                const { modified, isNull } = getCellChange(idx, col, originalRowVal);
                                                                                
                                                                                let cellClass = "px-2 py-1.5 border-r border-border max-w-[120px] truncate ";
                                                                                if (modified) {
                                                                                    if (isNull) {
                                                                                        cellClass += "cell-imputed bg-emerald-500/10 text-emerald-600 font-semibold";
                                                                                    } else {
                                                                                        cellClass += "cell-modified bg-sky-500/10 text-sky-600 border border-sky-500/20 font-semibold";
                                                                                    }
                                                                                } else if (row[col] === null || row[col] === undefined) {
                                                                                    cellClass += "italic text-muted-foreground/60";
                                                                                }
                                                                                
                                                                                return (
                                                                                    <td key={col} className={cellClass}>
                                                                                        {row[col] === null || row[col] === undefined ? "null" : String(row[col])}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
                                                <Database className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                                <p className="text-sm font-medium">Select recommendations to trigger preview generator</p>
                                            </div>
                                        )}
                                    </>
                                )}

                                {activeTab === "analytics" && (
                                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Score change card */}
                                            <div className="p-4 border border-border bg-surface-2/40">
                                                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Projected Health Score</span>
                                                <div className="flex items-baseline gap-3 mt-2">
                                                    <span className="text-4xl font-semibold text-muted-foreground font-mono">{Math.round(baseScore)}</span>
                                                    <span className="text-muted-foreground font-mono">→</span>
                                                    <span className="text-4xl font-semibold text-success font-mono">{Math.round(improvedScore)}</span>
                                                    <span className="text-xs text-muted-foreground font-sans">/ 100</span>
                                                </div>
                                                <div className="mt-3 text-[11.5px] text-muted-foreground">
                                                    Applying selected rules will increase dataset quality index by <span className="text-success font-semibold font-mono">+{Math.round(improvedScore - baseScore)} points</span>.
                                                </div>
                                            </div>

                                            {/* Dataset Size card */}
                                            <div className="p-4 border border-border bg-surface-2/40">
                                                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Dataset Row Impact</span>
                                                {previewData ? (
                                                    <div className="mt-2 space-y-1 font-mono text-foreground">
                                                        <div>ORIGINAL: {previewData.rows_before} rows</div>
                                                        <div>PROJECTED: {previewData.rows_after} rows</div>
                                                        <div className="text-warning text-xs mt-1">({previewData.rows_dropped} duplicate or empty rows excluded)</div>
                                                    </div>
                                                ) : (
                                                    <div className="text-[11.5px] text-muted-foreground mt-2 font-mono">Simulate preview to load exact counts.</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Impact bars */}
                                        <div className="space-y-4 p-4 border border-border bg-surface-2/20">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground font-mono">Detailed metric transitions</h4>
                                            {[
                                                { label: "Completeness", from: Math.max(0, 100 - (healthScoreObj?.breakdown?.missing_values_penalty || 0)), penalty: "missing_values_penalty" },
                                                { label: "Uniqueness", from: Math.max(0, 100 - (healthScoreObj?.breakdown?.duplicates_penalty || 0)), penalty: "duplicates_penalty" },
                                                { label: "Validity", from: Math.max(0, 100 - (healthScoreObj?.breakdown?.other_penalty || 0)), penalty: "other_penalty" },
                                            ].map(item => {
                                                const selectedCount = Array.from(selectedRecIds).filter(id => {
                                                    const rec = recommendationsList.find(r => r.id === id);
                                                    if (!rec) return false;
                                                    if (item.label === "Completeness" && rec.issue_type === "missing_values") return true;
                                                    if (item.label === "Uniqueness" && rec.issue_type === "duplicates") return true;
                                                    if (item.label === "Validity" && rec.issue_type === "outliers") return true;
                                                    return false;
                                                }).length;
                                                
                                                const projected = Math.min(100, item.from + (selectedCount * 5));
                                                return (
                                                    <div key={item.label} className="text-xs">
                                                        <div className="flex justify-between font-mono text-muted-foreground mb-1.5">
                                                            <span>{item.label}</span>
                                                            <span>{item.from.toFixed(1)}% → <span className="text-success font-semibold">{projected.toFixed(1)}%</span></span>
                                                        </div>
                                                        <div className="h-2 bg-surface-2 border border-border">
                                                            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${projected}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "pipeline" && (
                                    <div className="flex-1 overflow-y-auto p-5 space-y-4 font-mono select-text">
                                        <div className="text-xs text-muted-foreground border-b border-border pb-2 uppercase">Scheduled steps queue</div>
                                        {selectedRecIds.size === 0 ? (
                                            <div className="text-xs text-muted-foreground py-4 text-center">No rules selected in the current plan.</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {Array.from(selectedRecIds).map((id, index) => {
                                                    const rec = recommendationsList.find(r => r.id === id);
                                                    if (!rec) return null;
                                                    const ruleMap: Record<string, string> = {
                                                        "fill_mean": "fill_missing_mean",
                                                        "fill_median": "fill_missing_median",
                                                        "drop_rows": "drop_rows_with_nulls",
                                                        "remove_duplicates": "remove_duplicates",
                                                        "cap_outliers": "cap_outliers",
                                                        "remove_outliers": "remove_outliers"
                                                    };
                                                    const selectedStrategy = selectedStrategies[rec.id] || rec.strategy;
                                                    const finalRule = ruleMap[selectedStrategy] || selectedStrategy;

                                                    return (
                                                        <div key={id} className="p-3 border border-border bg-surface-2/40 flex items-start gap-4">
                                                            <span className="text-accent font-bold">STEP {String(index + 1).padStart(2, '0')}</span>
                                                            <div className="space-y-1">
                                                                <div className="text-xs font-semibold text-foreground">{finalRule}</div>
                                                                <div className="text-[11px] text-muted-foreground font-mono">
                                                                    PARAMETERS: {rec.column ? `column='${rec.column}'` : "scope='dataset-wide'"}
                                                                </div>
                                                                <div className="text-[11px] text-muted-foreground italic mt-0.5">
                                                                    "{rec.description}"
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {/* Action Blocked Modal */}
            {isBlockedModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-surface border border-border rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in duration-200 text-center">
                        <div className="flex justify-center mb-4">
                            <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                        </div>
                        <h3 className="text-sm font-bold text-foreground mb-2 font-sans uppercase tracking-wider">
                            Action Blocked
                        </h3>
                        <p className="text-xs text-muted-foreground mb-6 leading-relaxed font-sans px-2">
                            {blockedModalMessage || "A cleaned version of this dataset already exists. To run a new cleaning flow, please delete the existing cleaned version first."}
                        </p>
                        <div className="flex justify-center">
                            <button
                                onClick={() => setIsBlockedModalOpen(false)}
                                className="px-5 py-2 rounded-none text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer border-none"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function HealthScoreWidget({ score, riskLevel }: { score: number, riskLevel: string }) {
    const isGood = score >= 80;
    const isWarning = score >= 60 && score < 80;
    const isDanger = score < 60;
    const clampedScore = Math.max(0, Math.min(100, score));
    const chartColor = isDanger ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981";
    const chartData = {
        labels: ["Health score", "Remaining"],
        datasets: [
            {
                data: [clampedScore, 100 - clampedScore],
                backgroundColor: [chartColor, "rgba(148, 163, 184, 0.08)"],
                borderWidth: 0,
                hoverOffset: 0,
            },
        ],
    };
    const chartOptions: ChartOptions<"doughnut"> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "75%",
        rotation: -90,
        circumference: 360,
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
        },
    };
    
    return (
        <div className="col-span-12 row-span-1 flex items-center justify-between bg-surface px-6 py-5 lg:col-span-3 md:col-span-6 border-r border-border">
            <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Overall health</div>
                <div className="mt-1.5 flex items-baseline gap-2">
                    <span className={`num text-display text-[44px] font-semibold font-mono ${isDanger ? 'text-destructive' : isWarning ? 'text-warning' : 'text-success'}`}>{Math.round(score)}</span>
                    <span className="text-[12px] text-muted-foreground font-mono">/ 100</span>
                    <Pill tone={isDanger ? "danger" : isWarning ? "warning" : "success"} className="rounded-none font-mono text-[9px] uppercase">
                        Risk: {riskLevel}
                    </Pill>
                </div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                    {isGood ? 'Good Quality Index' : isWarning ? 'Needs Attention' : 'Critical Health Deficit'}
                </div>
            </div>
            <div className="h-[90px] w-[90px]">
                <Doughnut data={chartData} options={chartOptions} />
            </div>
        </div>
    );
}

function HealthMetric({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" }) {
    const numValue = parseFloat(value);
    return (
        <div className="col-span-6 bg-surface px-5 py-5 border-r border-border md:col-span-6 lg:col-span-3">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
            <div className={`num mt-1.5 text-display text-[22px] font-semibold font-mono ${tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-success"}`}>{value}</div>
            <div className="mt-2.5 h-1 bg-surface-2 border border-border/40">
                <div className={`h-full ${tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-destructive" : "bg-success"}`} style={{ width: isNaN(numValue) ? '0%' : `${numValue}%` }} />
            </div>
        </div>
    );
}
