import { useState, useEffect } from 'react';
import { semanticMappingService } from '../../lib/api/dataset';

type MappingStatus = 'auto_accepted' | 'flagged' | 'unclassified';

type MappingProposal = {
    column: string;
    role: string;
    evidence: string;
    confidence: number;
    status: MappingStatus;
};

type MappingReviewProps = {
    datasetId: string;
    versionId: string;
    onConfirm: () => void;
};

const ROLE_LABELS: Record<string, { label: string; description: string }> = {
    // Temporal
    date: { label: "Date", description: "Dates, Timestamps, or Periods" },
    datetime: { label: "DateTime", description: "Date + time values" },
    year_month: { label: "Year-Month", description: "Monthly periods or year-month strings" },
    fiscal_period: { label: "Fiscal Period", description: "Fiscal quarter/period labels" },

    // Dimensions
    category: { label: "Category", description: "Segments, products, or categories" },
    sub_category: { label: "Sub-category", description: "More granular category level" },
    geography: { label: "Geography", description: "Location, region, country, city" },
    entity_id: { label: "Entity ID", description: "Entity identifier used for filtering" },
    boolean_flag: { label: "Boolean Flag", description: "True/False or binary indicator" },

    // Measures
    revenue: { label: "Revenue", description: "Income, sales, or total amount" },
    cost: { label: "Cost", description: "Spending, COGS, or outflow" },
    quantity: { label: "Quantity", description: "Units, counts, volume" },
    count: { label: "Count", description: "Aggregated counts" },
    ratio_pct: { label: "Ratio %", description: "Derived percentage or ratio metric" },
    score: { label: "Score", description: "Scores or rating values" },
    duration_seconds: { label: "Duration (s)", description: "Time duration in seconds" },

    // Identity
    primary_key: { label: "Primary Key", description: "Unique identifier for rows" },
    foreign_key: { label: "Foreign Key", description: "Reference to another entity" },
    name_label: { label: "Name/Label", description: "Human-readable label or name" },

    // Fallback
    unclassified: { label: "Unclassified", description: "No clear business role identified" },
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

export default function MappingReviewPanel({ datasetId, versionId, onConfirm }: MappingReviewProps) {
    const [proposals, setProposals] = useState<MappingProposal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        async function fetchProposals() {
            try {
                setIsLoading(true);
                const data = await semanticMappingService.proposeMapping(datasetId, versionId);

                if (data?.proposal?.error) {
                    throw new Error(data.proposal.error);
                }

                const proposalsRaw = data?.proposal?.metadata?.proposals || [];
                if (!Array.isArray(proposalsRaw) || proposalsRaw.length === 0) {
                    throw new Error('No semantic mapping proposals were returned by the server');
                }

                const proposedList: MappingProposal[] = proposalsRaw.map((item: any) => ({
                    column: item.column_name,
                    role: item.role,
                    evidence: item.evidence,
                    confidence: item.confidence,
                    status: item.status || (item.confidence >= 0.9 ? 'auto_accepted' : item.confidence >= 0.65 ? 'flagged' : 'unclassified')
                }));

                setProposals(proposedList);
            } catch (err: any) {
                const detail = err?.response?.data?.detail || err?.message || String(err);
                setError(detail);
            } finally {
                setIsLoading(false);
            }
        }
        fetchProposals();
    }, [datasetId, versionId]);

    const handleConfirm = async () => {
        try {
            const finalMap: Record<string, string> = {};
            proposals.forEach(p => {
                finalMap[p.role] = p.column;
            });
            await semanticMappingService.confirmMapping(datasetId, versionId, finalMap);
            onConfirm();
        } catch (err: any) {
            const message = err?.response?.data?.detail || err?.message || 'Unknown error';
            alert('Error confirming mappings: ' + message);
        }
    };

    const unresolvedCount = proposals.filter(p => p.role === 'unclassified' || p.status === 'unclassified').length;
    const visibleProposals = showAll ? proposals : proposals.filter(p => p.status !== 'auto_accepted');

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className="flex flex-col items-center gap-4">
                    <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                    <p className="font-sans text-sm font-medium text-on-surface-variant">Analyzing dataset semantics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className="bg-surface-container-lowest dark:bg-surface p-8 rounded-xl border border-red-200 dark:border-red-900/30 text-center max-w-md">
                    <span className="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
                    <h3 className="text-lg font-bold mb-2">Analysis Failed</h3>
                    <p className="text-sm text-gray-500 mb-6">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-primary text-white rounded-lg text-xs font-bold uppercase">Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-xl flex items-center justify-center z-50 p-6">
            <div className="bg-surface-container-lowest dark:bg-surface p-8 rounded-3xl shadow-2xl max-w-5xl w-full border border-outline-variant/20 dark:border-outline-variant/50 flex flex-col max-h-[90vh]">
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-on-surface mb-2">Dataset Intelligence Audit</h2>
                        <p className="text-sm text-on-surface-variant font-body leading-relaxed max-w-2xl">
                            Our AI has analyzed your data distribution and proposed a semantic map.
                            Please review these business roles to unlock professional-grade dashboards.
                        </p>
                        <div className="mt-3 text-xs text-on-surface-variant">
                            <span className="font-semibold text-on-surface">{proposals.length - unresolvedCount}</span> auto-classified •
                            <span className="font-semibold text-on-surface"> {unresolvedCount}</span> require review
                        </div>
                    </div>
                    <div className="hidden lg:block p-3 bg-primary/10 rounded-2xl border border-primary/20">
                        <span className="material-symbols-outlined text-primary text-3xl">psychology</span>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                    <div className="text-xs text-on-surface-variant">
                        Showing {showAll ? 'all columns' : 'flagged + unclassified only'}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAll(!showAll)}
                        className="text-xs font-bold uppercase tracking-widest text-primary hover:underline"
                    >
                        {showAll ? 'Show Uncertain Only' : 'Show All Columns'}
                    </button>
                </div>

                <div className="flex-1 overflow-auto rounded-2xl border border-outline-variant/30 dark:border-outline-variant/20 bg-surface-container-highest/30 dark:bg-surface-container-lowest/30">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-surface-container-lowest dark:bg-surface z-10">
                            <tr className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                                <th className="p-4">Column Name</th>
                                <th className="p-4">Proposed Business Role</th>
                                <th className="p-4">Analyst Reasoning</th>
                                <th className="p-4 text-right">Confidence</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                            {visibleProposals.map((p, idx) => {
                                const roleInfo = ROLE_LABELS[p.role] || ROLE_LABELS.unclassified;
                                const confidenceColor = p.confidence > 0.8 ? 'text-green-500' : p.confidence > 0.5 ? 'text-amber-500' : 'text-red-400';
                                const rowHighlight = p.status === 'unclassified' ? 'bg-red-50/40 dark:bg-red-900/10' : p.status === 'flagged' ? 'bg-amber-50/40 dark:bg-amber-900/10' : '';

                                return (
                                    <tr key={`${p.column}-${idx}`} className={`hover:bg-surface-container-lowest dark:hover:bg-surface-container transition-colors group ${rowHighlight}`}>
                                        <td className="p-4 font-mono text-xs font-medium text-on-surface">
                                            {p.column}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <select
                                                    value={p.role}
                                                    onChange={(e) => {
                                                        const newProposals = [...proposals];
                                                        const targetIndex = newProposals.findIndex(item => item.column === p.column);
                                                        if (targetIndex !== -1) {
                                                            newProposals[targetIndex].role = e.target.value;
                                                            newProposals[targetIndex].status = e.target.value === 'unclassified' ? 'unclassified' : 'flagged';
                                                            setProposals(newProposals);
                                                        }
                                                    }}
                                                    className="bg-transparent border border-outline-variant/30 rounded-lg px-2 py-1 text-sm font-bold text-primary focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                >
                                                    {ROLE_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{ROLE_LABELS[opt].label}</option>
                                                    ))}
                                                </select>
                                                <span className="text-[10px] text-on-surface-variant opacity-60">{roleInfo.description}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-xs text-on-surface-variant italic leading-relaxed max-w-md">
                                            "{p.evidence}"
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`text-xs font-bold ${confidenceColor}`}>
                                                {Math.round(p.confidence * 100)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 flex items-center justify-between">
                    <p className="text-xs text-on-surface-variant italic opacity-70">
                        Tip: Roles marked as "Unclassified" may result in fewer charts.
                    </p>
                    <button
                        onClick={() => handleConfirm()}
                        disabled={unresolvedCount > 0}
                        className={`px-10 py-4 font-label text-sm font-bold uppercase tracking-widest rounded-2xl shadow-xl transition-all active:scale-95 ${
                            unresolvedCount > 0
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-primary text-on-primary shadow-primary/30 hover:brightness-110 hover:scale-[1.02]'
                        }`}
                    >
                        Confirm & Generate Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
