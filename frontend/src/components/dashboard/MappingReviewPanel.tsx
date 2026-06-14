import { useState, useEffect } from 'react';
import { semanticMappingService } from '../../lib/api/dataset';
import type { ColumnProfileData } from '../../lib/api/dataset';

type MappingStatus = 'auto_accepted' | 'flagged' | 'unclassified';

type MappingProposal = {
    column: string;
    role: string;
    evidence: string;
    confidence: number;
    status: MappingStatus;
    profile?: ColumnProfileData | null;
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
    profit: { label: "Profit", description: "Net profit, margin, or earnings" },
    quantity: { label: "Quantity", description: "Units, counts, volume" },
    count: { label: "Count", description: "Aggregated counts" },
    ratio_pct: { label: "Ratio %", description: "Derived percentage or ratio metric" },
    score: { label: "Score", description: "Scores or rating values" },
    duration_seconds: { label: "Duration (s)", description: "Time duration in seconds" },
    tenure: { label: "Tenure", description: "Numeric duration — tenure months, years of service, age" },

    // Identity
    primary_key: { label: "Primary Key", description: "Unique identifier for rows" },
    foreign_key: { label: "Foreign Key", description: "Reference to another entity" },
    name_label: { label: "Name/Label", description: "Human-readable label or name" },

    // Flag
    target: { label: "Target", description: "Goal metric, churn status, conversion flag" },

    // Fallback
    unclassified: { label: "Unclassified", description: "No clear business role identified" },
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

export default function MappingReviewPanel({ datasetId, versionId, onConfirm }: MappingReviewProps) {
    const [proposals, setProposals] = useState<MappingProposal[]>([]);
    const [originalProposals, setOriginalProposals] = useState<MappingProposal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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

                const proposedList: MappingProposal[] = proposalsRaw.map((item: any) => {
                    let status: MappingStatus = 'unclassified';
                    if (item.status) {
                        status = item.status;
                    } else if (item.confidence >= 0.9) {
                        status = 'auto_accepted';
                    } else if (item.role && item.role !== 'unclassified') {
                        status = 'flagged';
                    }
                    return {
                        column: item.column_name,
                        role: item.role,
                        evidence: item.evidence,
                        confidence: item.confidence,
                        status: status,
                        profile: item.profile || null
                    };
                });

                setProposals(proposedList);
                setOriginalProposals(JSON.parse(JSON.stringify(proposedList)));
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
            const corrections: { column: string, proposed_role: string, corrected_role: string }[] = [];
            
            proposals.forEach(p => {
                finalMap[p.column] = p.role;
                
                const original = originalProposals.find(o => o.column === p.column);
                // Track correction if user changed it from the original AI proposal
                if (original && original.role !== 'unclassified' && original.role !== p.role) {
                    corrections.push({
                        column: p.column,
                        proposed_role: original.role,
                        corrected_role: p.role
                    });
                }
            });
            await semanticMappingService.confirmMapping(datasetId, versionId, finalMap, corrections);
            onConfirm();
        } catch (err: any) {
            const message = err?.response?.data?.detail || err?.message || 'Unknown error';
            alert('Error confirming mappings: ' + message);
        }
    };

    const unresolvedCount = proposals.filter(p => p.role === 'unclassified' || p.status === 'unclassified').length;
    const visibleProposals = showAll ? proposals : proposals.filter(p => p.status !== 'auto_accepted');
    const filteredProposals = visibleProposals.filter(p =>
        p.column.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.role.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const ROLE_GROUPS: Record<string, { label: string; icon: string; roles: string[] }> = {
        temporal: { label: 'Temporal', icon: '📅', roles: ['date', 'datetime', 'year_month', 'fiscal_period'] },
        dimension: { label: 'Dimensions', icon: '📊', roles: ['category', 'sub_category', 'geography'] },
        measure: { label: 'Measures', icon: '📈', roles: ['revenue', 'cost', 'profit', 'quantity', 'count', 'score', 'ratio_pct', 'duration_seconds', 'tenure'] },
        identity: { label: 'Identity', icon: '🔑', roles: ['entity_id', 'primary_key', 'foreign_key', 'name_label'] },
        flag: { label: 'Flags & Targets', icon: '🎯', roles: ['boolean_flag', 'target'] },
        unclassified: { label: '⚠ Needs Review', icon: '⚠️', roles: ['unclassified'] },
    };

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

                {/* Search Bar */}
                <div className="px-8 py-3 bg-white dark:bg-[#000000] mr-divider">
                    <input
                        type="text"
                        placeholder="Search columns..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 text-xs bg-neutral-50 dark:bg-white/[0.02] rounded-lg border border-neutral-200 dark:border-white/10 font-['Inter'] placeholder:text-neutral-400 focus:outline-none focus:border-neutral-300 dark:focus:border-white/20"
                    />
                </div>

                {/* Table Body (Card Layout grouped by roles) */}
                <div className="flex-1 overflow-y-auto scrollbar-hide p-8 bg-[#FDFBF7] dark:bg-[#0A0A0A] space-y-8 max-h-[600px]">
                    {Object.entries(ROLE_GROUPS).map(([groupKey, group]) => {
                        const groupProposals = filteredProposals.filter(p => group.roles.includes(p.role));
                        if (groupProposals.length === 0) return null;

                        return (
                            <div key={groupKey} className="space-y-4">
                                <h3 className="text-sm font-bold font-['Manrope'] text-[#1B1C1C] dark:text-white border-b border-[#E5E2DE] dark:border-white/10 pb-2 flex items-center gap-2">
                                    <span>{group.icon}</span> {group.label} <span className="text-xs font-normal text-[#5E5E5C] dark:text-neutral-500">({groupProposals.length} columns)</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {groupProposals.map((p, idx) => {
                                        const isUnclassified = p.role === 'unclassified';
                                        
                                        const selectExtraClass = isUnclassified ? 'mr-select-muted' : '';
                                        const selectColorClass = isUnclassified
                                            ? 'bg-white text-neutral-400 dark:bg-[#121212] dark:text-neutral-500'
                                            : 'bg-white text-[#1B1C1C] dark:bg-[#121212] dark:text-white';

                                        const isGreen = p.confidence >= 0.7;
                                        const confidenceColor = isGreen
                                            ? 'text-[#469446] dark:text-[#10B981]'
                                            : 'text-[#BA1A1A] dark:text-[#EF4444]';

                                        const cardHighlight = p.status === 'unclassified'
                                            ? 'border-[#BA1A1A]/30 dark:border-[#EF4444]/30 bg-[#BA1A1A]/[0.02] dark:bg-[#EF4444]/[0.02]'
                                            : p.status === 'flagged'
                                            ? 'border-amber-500/30 dark:border-amber-500/30 bg-amber-500/[0.02] dark:bg-amber-500/[0.02]'
                                            : 'border-[#E5E2DE] dark:border-white/10 bg-white dark:bg-[#121212]';

                                        return (
                                            <div
                                                key={`${p.column}-${idx}`}
                                                className={`p-4 rounded-xl border ${cardHighlight} shadow-sm transition-all duration-200`}
                                            >
                                                {/* Row 1: Column name + Role dropdown + Confidence */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-xs font-semibold text-[#1B1C1C] dark:text-white font-['JetBrains_Mono'] truncate max-w-[140px]" title={p.column}>
                                                        {p.column}
                                                    </span>
                                                    
                                                    <div className="relative flex-1 max-w-[180px]">
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
                                                            className={`mr-select ${selectExtraClass} w-full text-xs font-semibold rounded-lg pl-2 pr-6 py-1.5 appearance-none transition-all duration-200 cursor-pointer font-['Inter'] ${selectColorClass}`}
                                                        >
                                                            {ROLE_OPTIONS.map(opt => (
                                                                <option key={opt} value={opt} className="bg-white dark:bg-[#121212] text-[#1B1C1C] dark:text-white font-medium">
                                                                    {ROLE_LABELS[opt].label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                                            <svg className={`w-3 h-3 ${isUnclassified ? 'text-neutral-300 dark:text-neutral-500' : 'text-[#5E5E5C] dark:text-white/60'}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                                <path d="M19 9l-7 7-7-7"></path>
                                                            </svg>
                                                        </div>
                                                    </div>

                                                     <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                         {p.confidence < 0.65 && (
                                                             <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                                                                 Low Confidence
                                                             </span>
                                                         )}
                                                         <span className={`text-[10px] font-bold tabular-nums ${confidenceColor} font-['JetBrains_Mono']`}>
                                                             {Math.round(p.confidence * 100)}%
                                                         </span>
                                                     </div>
                                                </div>

                                                {/* Row 2: Type badge + Sample values */}
                                                {p.profile && (
                                                    <div className="flex items-center gap-2 mt-3">
                                                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-white/5 font-mono text-[#5E5E5C] dark:text-neutral-400">
                                                            {p.profile.dtype}
                                                        </span>
                                                        <div className="flex gap-1 flex-wrap overflow-hidden h-5">
                                                            {p.profile.samples?.slice(0, 4).map((s: any, i: number) => (
                                                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-50 dark:bg-white/[0.03] font-mono text-neutral-500 truncate max-w-[80px]" title={String(s)}>
                                                                    {String(s)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Row 3: Stats (numeric) or Cardinality (categorical) */}
                                                {p.profile && p.profile.is_numeric && (
                                                    <div className="text-[10px] text-neutral-400 mt-2 font-mono flex gap-2">
                                                        <span>min: {p.profile.min ?? '—'}</span>
                                                        <span>·</span>
                                                        <span>mean: {p.profile.mean ?? '—'}</span>
                                                        <span>·</span>
                                                        <span>max: {p.profile.max ?? '—'}</span>
                                                    </div>
                                                )}
                                                {p.profile && !p.profile.is_numeric && typeof p.profile.unique_count === 'number' && (
                                                    <div className="text-[10px] text-neutral-400 mt-2 font-['Inter']">
                                                        {p.profile.unique_count} unique values {p.profile.cardinality !== null ? `· cardinality: ${p.profile.cardinality?.toFixed(2)}` : ''}
                                                    </div>
                                                )}

                                                {/* Row 4: Evidence */}
                                                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 italic font-['Inter'] line-clamp-2" title={p.evidence}>
                                                    "{p.evidence}"
                                                </p>
                                            </div>
                                        );
                                    })}
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
