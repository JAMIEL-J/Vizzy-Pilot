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
            // Use column as key (unique) → no data loss for duplicate roles
            const finalMap: Record<string, string> = {};
            proposals.forEach(p => {
                finalMap[p.column] = p.role;
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
            <div className="fixed inset-0 bg-[#FDFBF7]/40 dark:bg-black/60 backdrop-blur-[4px] flex items-center justify-center z-50 p-4">
                <div className="flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 animate-spin text-black dark:text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="font-['Inter'] text-sm font-medium text-[#5E5E5C] dark:text-[#A3A3A3]">Analyzing dataset semantics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-[#FDFBF7]/40 dark:bg-black/60 backdrop-blur-[4px] flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-black p-8 rounded-xl border border-red-200 dark:border-red-900/30 text-center max-w-md shadow-xl">
                    <svg className="w-12 h-12 text-[#BA1A1A] dark:text-[#EF4444] mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 className="text-lg font-bold mb-2 font-['Manrope'] text-[#1B1C1C] dark:text-white">Analysis Failed</h3>
                    <p className="text-sm text-[#5E5E5C] dark:text-[#A3A3A3] mb-6 font-['Inter']">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-bold uppercase font-['Inter']">Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white/40 dark:bg-black/60 backdrop-blur-[2px] dark:backdrop-blur-sm flex items-center justify-center z-50 p-6" style={{ borderColor: 'transparent' }}>
            {/* Reset helix-scope border-color override for the entire modal */}
            <div className="bg-white dark:bg-[#000000] rounded-[16px] flex flex-col max-w-6xl w-full max-h-[90vh] overflow-hidden" style={{ border: '1px solid', borderColor: 'var(--mapping-modal-border)', boxShadow: 'var(--mapping-modal-shadow)', ['--mapping-modal-border' as any]: '', ['--mapping-modal-shadow' as any]: '' }}>
            <style>{`
                .mapping-review-modal,
                .mapping-review-modal * {
                    border-color: transparent;
                }
                .mapping-review-modal {
                    --mapping-border: #E5E2DE;
                    --mapping-border-soft: #E5E2DE;
                    border: 1px solid #E5E2DE !important;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.1) !important;
                }
                :is(.dark) .mapping-review-modal {
                    --mapping-border: #262626;
                    --mapping-border-soft: rgba(255,255,255,0.05);
                    border: 1px solid #262626 !important;
                    box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 25px 50px -12px rgba(0,0,0,0.9) !important;
                }
                .mapping-review-modal .mr-divider {
                    border-bottom: 1px solid #E5E2DE;
                }
                :is(.dark) .mapping-review-modal .mr-divider {
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .mapping-review-modal .mr-divider-strong {
                    border-bottom: 1px solid #E5E2DE;
                }
                :is(.dark) .mapping-review-modal .mr-divider-strong {
                    border-bottom: 1px solid #262626;
                }
                .mapping-review-modal .mr-footer {
                    border-top: 1px solid #E5E2DE;
                }
                :is(.dark) .mapping-review-modal .mr-footer {
                    border-top: 1px solid rgba(255,255,255,0.05);
                }
                .mapping-review-modal .mr-select {
                    border: 1px solid #E5E2DE;
                    outline: none;
                    box-shadow: none;
                }
                .mapping-review-modal .mr-select:focus {
                    border-color: #bbb;
                    outline: none;
                    box-shadow: none;
                    ring: none;
                }
                :is(.dark) .mapping-review-modal .mr-select {
                    border: 1px solid rgba(255,255,255,0.2);
                }
                :is(.dark) .mapping-review-modal .mr-select:focus {
                    border-color: rgba(255,255,255,0.4);
                    outline: none;
                    box-shadow: none;
                }
                :is(.dark) .mapping-review-modal .mr-select-muted {
                    border: 1px solid rgba(255,255,255,0.1);
                }
                :is(.dark) .mapping-review-modal .mr-select-muted:focus {
                    border-color: rgba(255,255,255,0.2);
                    outline: none;
                    box-shadow: none;
                }
                .mapping-review-modal .mr-pill {
                    background: #EFEDED;
                }
                :is(.dark) .mapping-review-modal .mr-pill {
                    background: rgba(255,255,255,0.05);
                }
                .mapping-review-modal .mr-confirm {
                    border: none;
                }
            `}</style>
            <div className="mapping-review-modal bg-white dark:bg-[#000000] rounded-[16px] flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="px-8 py-7 dark:py-6 mr-divider-strong bg-neutral-50/50 dark:bg-white/[0.01]">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold dark:font-semibold text-[#1B1C1C] dark:text-white tracking-tight font-['Manrope'] dark:font-sans">
                                Review Smart Classifications
                            </h2>
                            <p className="text-sm text-[#5E5E5C] dark:text-[#A3A3A3] mt-1 font-['Inter']">
                                Our AI analyst has proposed business roles for your dataset columns.
                            </p>
                        </div>
                        <div className="px-3 py-1 bg-black dark:bg-white/10 text-[10px] dark:text-[11px] font-bold text-white dark:text-white uppercase tracking-widest rounded-md dark:rounded-full font-['Inter']" style={{ border: 'none', borderColor: 'transparent' }}>
                            <span className="hidden dark:inline" style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: '9999px', padding: '4px 12px' }}>AI Insight Active</span>
                            <span className="dark:hidden">AI Insight Active</span>
                        </div>
                    </div>
                </div>

                {/* Column Filter Toggle */}
                <div className="px-8 py-3.5 flex items-center justify-between mr-divider bg-white dark:bg-[#000000]">
                    <div className="text-xs text-[#5E5E5C] dark:text-[#A3A3A3] font-['Inter']">
                        Showing {showAll ? 'all columns' : 'uncertain or flagged columns only'}
                    </div>
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-[11px] font-bold uppercase tracking-widest text-[#1B1C1C] dark:text-white hover:text-opacity-80 transition-colors font-['Inter']"
                    >
                        {showAll ? 'SHOW UNCERTAIN ONLY' : 'SHOW ALL COLUMNS'}
                    </button>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[1.2fr_260px_1.5fr_120px] gap-6 px-8 py-4 bg-[#FDFBF7] dark:bg-white/[0.02] text-[10px] font-bold text-[#5E5E5C] dark:text-[#A3A3A3] uppercase tracking-[0.15em] mr-divider font-['JetBrains_Mono']">
                    <div>Column Name</div>
                    <div>Proposed Business Role</div>
                    <div>Analyst Reasoning</div>
                    <div className="text-right">Confidence</div>
                </div>

                {/* Table Body */}
                <div className="flex-1 overflow-y-auto scrollbar-hide max-h-[500px]">
                    {visibleProposals.map((p, idx) => {
                        const roleInfo = ROLE_LABELS[p.role] || ROLE_LABELS.unclassified;
                        const isUnclassified = p.role === 'unclassified';
                        
                        const selectExtraClass = isUnclassified ? 'mr-select-muted' : '';
                        const selectColorClass = isUnclassified
                            ? 'bg-white text-neutral-400 dark:bg-[#000000] dark:text-neutral-500'
                            : 'bg-white text-[#1B1C1C] dark:bg-[#000000] dark:text-white';

                        const isGreen = p.confidence >= 0.7;
                        const confidenceColor = isGreen
                            ? 'text-[#469446] dark:text-white'
                            : 'text-[#BA1A1A] dark:text-[#EF4444]';

                        const progressBarColor = isGreen
                            ? 'bg-[#469446] dark:bg-[#10B981]'
                            : 'bg-[#BA1A1A] dark:bg-[#EF4444]';

                        const progressBgColor = 'bg-[#EFEDED] dark:bg-white/10';

                        const rowHighlight = p.status === 'unclassified'
                            ? 'bg-[#BA1A1A]/[0.02] dark:bg-[#EF4444]/[0.02]'
                            : p.status === 'flagged'
                            ? 'bg-amber-500/[0.02] dark:bg-amber-500/[0.02]'
                            : '';

                        return (
                            <div
                                key={`${p.column}-${idx}`}
                                className={`grid grid-cols-[1.2fr_260px_1.5fr_120px] gap-6 px-8 py-5 mr-divider items-center hover:bg-[#F9F9F9] dark:hover:bg-white/[0.03] transition-all duration-200 group ${rowHighlight}`}
                            >
                                <div className="mr-pill font-mono text-xs font-semibold text-[#1B1C1C] dark:text-white/90 w-fit px-2 py-1 rounded font-['JetBrains_Mono']">
                                    {p.column}
                                </div>
                                <div>
                                    <div className="relative">
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
                                            className={`mr-select ${selectExtraClass} w-full text-xs font-semibold rounded-lg pl-3 pr-8 py-2.5 appearance-none transition-all duration-200 cursor-pointer font-['Inter'] ${selectColorClass}`}
                                        >
                                            {ROLE_OPTIONS.map(opt => (
                                                <option key={opt} value={opt} className="bg-white dark:bg-[#121212] text-[#1B1C1C] dark:text-white font-medium">
                                                    {ROLE_LABELS[opt].label}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg className={`w-3.5 h-3.5 ${isUnclassified ? 'text-neutral-300 dark:text-neutral-500' : 'text-[#5E5E5C] dark:text-white/60'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <path d="M19 9l-7 7-7-7"></path>
                                            </svg>
                                        </div>
                                    </div>
                                    <p className={`text-[10px] text-[#5E5E5C] dark:text-[#A3A3A3] mt-1.5 pl-1 font-['Inter'] ${isUnclassified ? 'italic font-normal' : 'font-medium'}`}>
                                        {roleInfo.description}
                                    </p>
                                </div>
                                <div className="text-[13px] text-[#5E5E5C] dark:text-neutral-400 leading-relaxed font-normal font-['Inter']">
                                    "{p.evidence}"
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                    <div className={`w-12 ${progressBgColor} h-1 rounded-full overflow-hidden hidden sm:block`} style={{ borderColor: 'transparent' }}>
                                        <div
                                            className={`h-full transition-all duration-500 ${progressBarColor}`}
                                            style={{ width: `${Math.round(p.confidence * 100)}%` }}
                                        ></div>
                                    </div>
                                    <span className={`text-xs font-bold tabular-nums ${confidenceColor} font-['JetBrains_Mono']`} style={{ borderColor: 'transparent' }}>
                                        {Math.round(p.confidence * 100)}%
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Modal Footer */}
                {/* eslint-disable-next-line */}
                <div className="px-8 py-6 bg-neutral-50/50 dark:bg-white/[0.01] mr-footer flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#5E5E5C] dark:text-[#A3A3A3]">
                        <svg className="w-4 h-4 text-[#5E5E5C] dark:text-white/50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p className="text-xs font-medium dark:font-normal italic dark:tracking-wide text-[#5E5E5C] dark:text-[#A3A3A3] font-['Inter']">
                            Tip: Roles marked as "Unclassified" may result in fewer charts.
                        </p>
                    </div>
                    <button
                        onClick={() => handleConfirm()}
                        disabled={unresolvedCount > 0}
                        className={`mr-confirm px-8 py-3 rounded-xl font-bold text-sm tracking-tight transition-all duration-200 font-['Inter'] ${
                            unresolvedCount > 0
                                ? 'bg-[#EFEDED] dark:bg-[#171717] text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                                : 'bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-xl dark:shadow-[0_8px_30px_rgba(255,255,255,0.1)] hover:scale-[1.01] active:scale-[0.98]'
                        }`}
                    >
                        Confirm & Generate Dashboard
                    </button>
                </div>
            </div>
            </div>
        </div>
    );
}
