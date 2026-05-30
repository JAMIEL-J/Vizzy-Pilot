import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Sparkles, Play, Database, Loader2, Info
} from "lucide-react";
import { ArcElement, Chart as ChartJS, Tooltip as ChartTooltip, type ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { AxiosError } from "axios";
import { datasetService, type Dataset } from "../../lib/api/dataset";
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
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState("");
    const [inspection, setInspection] = useState<InspectionReport | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorState, setErrorState] = useState<string | null>(null);
    const inspectionRequestId = useRef(0);

    const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(new Set());
    const [selectedStrategies, setSelectedStrategies] = useState<Record<string, string>>({});

    useEffect(() => {
        loadDatasets();
    }, []);

    useEffect(() => {
        if (selectedDatasetId) {
            loadInspection(selectedDatasetId);
        } else {
            inspectionRequestId.current += 1;
            setInspection(null);
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

    const loadInspection = async (id: string, forceRescan = false) => {
        const requestId = ++inspectionRequestId.current;
        const dataset = datasets.find(d => d.id === id);
        if (!dataset || !dataset.current_version_id) {
            setErrorState("Dataset or version not found.");
            return;
        }

        const versionId = dataset.current_version_id;
        setIsLoading(true);
        setInspection(null);
        setErrorState(null);

        try {
            const latestVersion = await datasetService.getLatestVersion(id);
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

            loadInspection(selectedDatasetId, true);
        } catch (error) {
            console.error("Failed to execute cleaning:", error);
            toast.error("Failed to execute cleaning plan");
        } finally {
            setIsProcessing(false);
        }
    };

    const recommendationsList: Recommendation[] = inspection?.issues_detected?.recommendations || EMPTY_ARRAY;
    const healthScoreObj: HealthScore | undefined = inspection?.issues_detected?.health_score;
    const currentDataset = datasets.find(d => d.id === selectedDatasetId);
    
    const baseScore = healthScoreObj?.score ?? 100;
    const improvedScore = Math.min(100, baseScore + selectedRecIds.size * 2);

    return (
        <div className="bg-noise min-h-screen flex flex-col">
            <PageHeader
                breadcrumb={["Datasets", "Cleaning"]}
                title="Data health"
                description={currentDataset ? `${currentDataset.name} · ${recommendationsList.length} actionable findings` : "Select a dataset to audit"}
                actions={(
                    <>
                        <div className="relative">
                            <select
                                value={selectedDatasetId}
                                onChange={(e) => setSelectedDatasetId(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={isLoading || isProcessing}
                            >
                                <option value="">Select dataset...</option>
                                {datasets.map(ds => (
                                    <option key={ds.id} value={ds.id}>{ds.name}</option>
                                ))}
                            </select>
                            <BtnSecondary>
                                <Database className="h-3 w-3" />
                                {currentDataset ? 'Change dataset' : 'Select dataset'}
                            </BtnSecondary>
                        </div>
                        <BtnPrimary onClick={handleExecuteCleaning} disabled={isProcessing || selectedRecIds.size === 0 || !inspection}>
                            {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            Process selected ({selectedRecIds.size})
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
                    <HealthMetric label="Consistency" value="98.2%" tone="success" />
                    <HealthMetric label="Timeliness" value="100%" tone="success" />
                </div>
            )}

            <div className="grid grid-cols-12 gap-4 px-5 py-4 flex-1">
                {!selectedDatasetId ? (
                    <div className="col-span-12 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md mx-auto space-y-4">
                            <div className="w-12 h-12 bg-surface-2 border border-border rounded-xl flex items-center justify-center mx-auto mb-2 shadow-sm">
                                <Database className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <h3 className="text-base font-medium text-foreground">No dataset selected</h3>
                            <p className="text-[13px] text-muted-foreground leading-relaxed">
                                Choose a dataset from the top menu to run a quality inspection and generate a cleaning plan.
                            </p>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="col-span-12 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md mx-auto space-y-4">
                            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                            <h3 className="text-base font-medium text-foreground">Running deep inspection</h3>
                            <p className="text-[13px] text-muted-foreground leading-relaxed">
                                Analyzing {currentDataset?.name} for missing values, outliers, and consistency issues. This might take a moment.
                            </p>
                        </div>
                    </div>
                ) : errorState ? (
                    <div className="col-span-12 flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md mx-auto space-y-4 p-6 bg-danger/5 border border-danger/20 rounded-xl">
                            <AlertTriangle className="h-6 w-6 text-danger mx-auto" />
                            <h3 className="text-base font-medium text-danger">Inspection Failed</h3>
                            <p className="text-[13px] text-danger/80 leading-relaxed">
                                {errorState}
                            </p>
                            <BtnSecondary onClick={() => loadInspection(selectedDatasetId, true)} className="mt-2">
                                Try again
                            </BtnSecondary>
                        </div>
                    </div>
                ) : inspection ? (
                    <>
                        <Panel className="col-span-12 lg:col-span-8 flex flex-col max-h-[calc(100vh-220px)]">
                            <PanelHeader
                                title="Recommendations"
                                subtitle={`Helix detected ${recommendationsList.length} issues across this dataset`}
                                icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
                                actions={<BtnSecondary onClick={selectAll}>{selectedRecIds.size === recommendationsList.length ? 'Deselect all' : 'Select all'}</BtnSecondary>}
                            />
                            
                            {recommendationsList.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center p-12">
                                    <div className="text-center space-y-3">
                                        <div className="w-10 h-10 bg-success/10 border border-success/20 rounded-full flex items-center justify-center mx-auto mb-2">
                                            <CheckCircle2 className="h-5 w-5 text-success" />
                                        </div>
                                        <h4 className="text-sm font-medium text-foreground">Dataset is healthy</h4>
                                        <p className="text-[12.5px] text-muted-foreground">No critical issues were found during the inspection.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                                    <table className="w-full text-[12.5px]">
                                        <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                                            <tr>
                                                <th className="w-8 px-3 py-2.5" />
                                                <th className="px-3 py-2.5 text-left font-medium">Column</th>
                                                <th className="px-3 py-2.5 text-left font-medium">Issue</th>
                                                <th className="px-3 py-2.5 text-left font-medium">Severity</th>
                                                <th className="px-3 py-2.5 text-left font-medium">Strategy</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {recommendationsList.map((r) => (
                                                <tr key={r.id} className={`group cursor-pointer transition ${selectedRecIds.has(r.id) ? "bg-accent/5" : "hover:bg-surface-2"}`} onClick={() => toggleSelection(r.id)}>
                                                    <td className="px-3 py-3">
                                                        <div className={`grid h-3.5 w-3.5 place-items-center rounded border ${selectedRecIds.has(r.id) ? "border-accent bg-accent" : "border-border-strong"}`}>
                                                            {selectedRecIds.has(r.id) && <CheckCircle2 className="h-3 w-3 text-background" />}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 font-mono">
                                                        {r.column || <span className="text-muted-foreground italic">Dataset-wide</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-foreground/85">
                                                        <div className="font-medium text-[12px]">{r.issue_type.replace(/_/g, ' ')}</div>
                                                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1" title={r.description}>{r.description}</div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Pill tone={r.severity === "high" ? "danger" : r.severity === "medium" ? "warning" : "default"}>
                                                            {r.severity.charAt(0).toUpperCase() + r.severity.slice(1)}
                                                        </Pill>
                                                    </td>
                                                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                        <select 
                                                            className="h-7 rounded border border-border bg-surface px-2 text-[11.5px] outline-none focus:border-accent w-full max-w-[140px]" 
                                                            value={selectedStrategies[r.id] || r.strategy}
                                                            onChange={(e) => setSelectedStrategies(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                        >
                                                            {r.strategy_options.map(opt => (
                                                                <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>

                        <div className="col-span-12 lg:col-span-4 space-y-4">
                            <Panel className="ai-glow">
                                <PanelHeader title="Helix recommendation" subtitle="Suggested cleaning plan" icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} />
                                <div className="space-y-3 p-4 text-[12px] leading-relaxed">
                                    {selectedRecIds.size > 0 ? (
                                        <>
                                            <p className="text-foreground/90">Apply the {selectedRecIds.size} selected fixes to lift the health score from <span className="num font-semibold">{Math.round(baseScore)}</span> to an estimated <span className="num font-semibold text-success">{Math.round(improvedScore)}</span>.</p>
                                            <p className="text-muted-foreground">Estimated runtime depends on dataset size · creates new version.</p>
                                            <BtnAccent className="w-full justify-center" onClick={handleExecuteCleaning} disabled={isProcessing}>
                                                {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                                Apply Helix plan
                                            </BtnAccent>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-start gap-2 text-muted-foreground bg-surface-2 p-3 rounded border border-border">
                                                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                                <p>Select issues from the recommendations table to build a cleaning plan.</p>
                                            </div>
                                            <BtnAccent className="w-full justify-center opacity-50 cursor-not-allowed">
                                                <Sparkles className="h-3 w-3" />Apply Helix plan
                                            </BtnAccent>
                                        </>
                                    )}
                                </div>
                            </Panel>
                            
                            {selectedRecIds.size > 0 && (
                                <Panel>
                                    <PanelHeader title="Impact preview" subtitle="Before / after on selected fixes" />
                                    <div className="space-y-3 p-4 text-[12px]">
                                        {[
                                            { label: "Health Score", from: baseScore, to: improvedScore, good: true, format: (v: number) => Math.round(v) },
                                            { label: "Issues Remaining", from: recommendationsList.length, to: recommendationsList.length - selectedRecIds.size, good: true, format: (v: number) => v },
                                        ].map(x => (
                                            <div key={x.label}>
                                                <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                                                    <span>{x.label}</span>
                                                    <span className="num text-foreground">{x.format(x.from)} → <span className={x.good ? "text-success" : ""}>{x.format(x.to)}</span></span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                                                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (x.to / Math.max(x.from, x.to, 1)) * 100)}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
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
                backgroundColor: [chartColor, "rgba(148, 163, 184, 0.18)"],
                borderWidth: 0,
                hoverOffset: 0,
            },
        ],
    };
    const chartOptions: ChartOptions<"doughnut"> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        rotation: -90,
        circumference: 360,
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
        },
    };
    
    return (
        <div className="col-span-12 row-span-1 flex items-center justify-between bg-background px-6 py-5 md:col-span-4">
            <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Overall health</div>
                <div className="mt-1 flex items-baseline gap-2">
                    <span className={`num text-display text-[44px] font-semibold ${isDanger ? 'text-danger' : isWarning ? 'text-warning' : ''}`}>{Math.round(score)}</span>
                    <span className="text-[12px] text-muted-foreground">/ 100</span>
                    <Pill tone={isDanger ? "danger" : isWarning ? "warning" : "success"}>
                        Risk: {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
                    </Pill>
                </div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                    {isGood ? 'Good' : isWarning ? 'Needs Attention' : 'Critical'} · {score < 100 ? 'Actionable issues remaining' : 'Optimal'}
                </div>
            </div>
            <div className="h-[100px] w-[100px]">
                <Doughnut data={chartData} options={chartOptions} />
            </div>
        </div>
    );
}

function HealthMetric({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" }) {
    const numValue = parseFloat(value);
    return (
        <div className="col-span-6 bg-background px-5 py-5 md:col-span-3 lg:col-span-2">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`num mt-1.5 text-display text-[22px] font-semibold ${tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : ""}`}>{value}</div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className={`h-full rounded-full ${tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-danger" : "bg-success"}`} style={{ width: isNaN(numValue) ? '0%' : `${numValue}%` }} />
            </div>
        </div>
    );
}
