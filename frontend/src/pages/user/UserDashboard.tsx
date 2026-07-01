// @ts-nocheck
import React from "react";
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { datasetService, type DatasetVersionSummary } from '../../lib/api/dataset';
import { apiClient } from '../../lib/api/client';
import { analyticsService, correlationService, narrativeService, type DashboardAnalytics, type CorrelationMatrix } from '../../lib/api/dashboard';
import { useDashboardStream } from '../../hooks/useDashboardStream';
import { HeaderSkeleton, KPISkeleton, ChartSkeleton } from '../../components/dashboard/DashboardSkeletons';
import VersionDiffModal from '../../components/dashboard/VersionDiffModal';
import GeoMapCard from './GeoMapCard';
import { useFilterStore } from '../../store/useFilterStore';
import RemapModal from '../../components/dashboard/RemapModal';
import { ColumnClassificationPanel } from '../../components/dashboard/ColumnClassificationPanel';
import { InsightModal } from '../../components/dashboard/InsightModal';
import { JoinBuilder } from '../../components/JoinBuilder/JoinBuilder';

import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, BubbleController,
    Title, Tooltip as ChartTooltip, Legend as ChartLegend, Filler
} from 'chart.js';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';
import { PageHeader } from '@/components/layout/TopNav';
import { Panel, PanelHeader, Pill, BtnSecondary, BtnPrimary, BtnGhost, BtnAccent } from '@/components/ui/primitive';
import { GitCompare, RefreshCw, Wand2, Sparkles, Eye, Download, TrendingUp, TrendingDown, AlertCircle, X, ChevronDown } from 'lucide-react';
import { VIZZY_THEME } from '../../theme/tokens';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// Extracted components
import KPICard from '../../components/dashboard/KPICard';
import ChartCard from '../../components/dashboard/ChartCard';
import ChartRenderer from '../../components/dashboard/ChartRenderer';
import FilterDropdown from '../../components/dashboard/FilterDropdown';
import MultiFilterPanel from '../../components/dashboard/MultiFilterPanel';
import CorrelationHeatmapCard from '../../components/dashboard/CorrelationHeatmapCard';
import { getDashboardTitle, normalizeColumnKey, resolveValueAgainstColumnOptions } from '../../components/dashboard/dashboard-helpers';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    RadialLinearScale,
    BubbleController,
    TreemapController,
    TreemapElement,
    Title,
    ChartTooltip,
    ChartLegend,
    Filler
);

type CachedEntry<T> = {
    value: T;
    createdAt: number;
};
const DASHBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
const DASHBOARD_SESSION_CACHE_KEY = 'vizzy.dashboard.analyticsCache.v3';
const DASHBOARD_CACHE_SCHEMA_VERSION = 'v3';
const SHOW_CORRELATION_CHART = false;

const stripHeavyFields = (value: DashboardAnalytics): DashboardAnalytics => {
    if (!value || typeof value !== 'object') return value;
    const { raw_data, ...rest } = value as DashboardAnalytics & { raw_data?: unknown };
    void raw_data;
    return rest as DashboardAnalytics;
};

class BoundedCache<T> {
    private map = new Map<string, CachedEntry<T>>();
    private readonly maxEntries: number;

    constructor(maxEntries: number) {
        this.maxEntries = maxEntries;
    }

    get(key: string): CachedEntry<T> | undefined {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        // Touch for LRU behavior
        this.map.delete(key);
        this.map.set(key, entry);
        return entry;
    }

    set(key: string, value: T): void {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, { value, createdAt: Date.now() });

        if (this.map.size > this.maxEntries) {
            const oldestKey = this.map.keys().next().value;
            if (oldestKey !== undefined) {
                this.map.delete(oldestKey);
            }
        }
    }

    clear(): void {
        this.map.clear();
    }
}

type DashboardCacheBundle = {
    analytics: BoundedCache<DashboardAnalytics>;
    correlation: BoundedCache<CorrelationMatrix>;
    narrative: BoundedCache<string>;
};

const createDashboardCacheBundle = (): DashboardCacheBundle => ({
    analytics: new BoundedCache<DashboardAnalytics>(30),
    correlation: new BoundedCache<CorrelationMatrix>(10),
    narrative: new BoundedCache<string>(30),
});

// Keep dashboard caches alive across route switches (Dashboard <-> Chat) within the same browser session.
let sharedDashboardCacheBundle: DashboardCacheBundle | null = null;

const getDashboardCacheBundle = (): DashboardCacheBundle => {
    if (!sharedDashboardCacheBundle) {
        sharedDashboardCacheBundle = createDashboardCacheBundle();
    }
    return sharedDashboardCacheBundle;
};

const stableSerialize = (value: unknown): string => {
    const seen = new WeakSet<object>();

    const normalize = (input: any): any => {
        if (input === undefined) return { __type: 'undefined' };
        if (typeof input === 'bigint') return { __type: 'bigint', value: input.toString() };
        if (typeof input === 'symbol') return { __type: 'symbol', value: String(input) };
        if (input instanceof Date) return { __type: 'date', value: input.toISOString() };

        if (Array.isArray(input)) {
            return input.map((item) => normalize(item));
        }

        if (input && typeof input === 'object') {
            if (seen.has(input)) return { __type: 'circular' };
            seen.add(input);
            const out: Record<string, any> = {};
            for (const key of Object.keys(input).sort()) {
                out[key] = normalize(input[key]);
            }
            return out;
        }

        return input;
    };

    return JSON.stringify(normalize(value));
};

const isFresh = (createdAt: number) => Date.now() - createdAt < DASHBOARD_CACHE_TTL_MS;

type SessionAnalyticsCacheEntry = {
    createdAt: number;
    value: DashboardAnalytics;
};

const getSessionAnalyticsCache = (): Record<string, SessionAnalyticsCacheEntry> => {
    try {
        const raw = sessionStorage.getItem(DASHBOARD_SESSION_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const getSessionCachedAnalytics = (cacheKey: string): DashboardAnalytics | null => {
    const all = getSessionAnalyticsCache();
    const entry = all[cacheKey];
    if (!entry || !entry.createdAt || !entry.value) return null;
    return isFresh(entry.createdAt) ? entry.value : null;
};

const setSessionCachedAnalytics = (cacheKey: string, value: DashboardAnalytics) => {
    try {
        const all = getSessionAnalyticsCache();
        all[cacheKey] = {
            createdAt: Date.now(),
            value: stripHeavyFields(value),
        };

        // Bound stored keys to avoid unbounded session growth.
        const entries = Object.entries(all).sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0));
        const trimmed = Object.fromEntries(entries.slice(0, 25));
        sessionStorage.setItem(DASHBOARD_SESSION_CACHE_KEY, JSON.stringify(trimmed));
    } catch (err) {
        // Surface quota / serialization failures so the silent-refetch loop is debuggable.
        console.warn('[dashboard-cache] sessionStorage write failed; falling back to in-memory only', err);
        try {
            sessionStorage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
        } catch {
            /* ignore */
        }
    }
};

// â”€â”€â”€ Color Palettes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CHART_COLORS = [
    '#7D9BBA', // Soft Dusty Blue
    '#6EA694', // Soft Sage Green
    '#DF8B70', // Soft Coral/Salmon
    '#CD7784', // Soft Muted Rose
    '#68A3B2', // Soft Aqua/Teal
    '#9184B7', // Soft Lavender/Lilac
    '#C4A265', // Soft Warm Ochre/Gold
    '#7E8B99'  // Soft Slate Gray
];
const KPI_CARD_COLORS = [
    '#4a40e0',
    '#006576',
    '#f8a010',
    '#f74b6d',
    '#4a40e0',
    '#006576',
    '#f8a010',
    '#f74b6d',
];

// (static heatmap grid removed - now driven by real data)

// Legacy SVG watermarks removed. Using Material Symbols instead.

// â”€â”€â”€ Dark Tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function UserDashboard() {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const isDark = theme === 'dark';
    const cacheRef = useRef<DashboardCacheBundle>(getDashboardCacheBundle());
    const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
    const [versionId, setVersionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false); // Only for full data loads (Dataset/Domain/Classification)
    const [isKPILoading, setIsKPILoading] = useState(false); // Only for background KPI refreshes (Filters)
    const [error, setError] = useState<string | null>(null);
    const [selectedDatasetId, setSelectedDatasetId] = useState(() => sessionStorage.getItem('vizzy.dashboard.selectedDatasetId') || '');
    const [datasets, setDatasets] = useState<any[]>([]);

    const {
        active_filters,
        clearFilters,
        setFilterValues,
        toggleFilter,
        chart_overrides,
        setChartOverride,
        classification_overrides,
        selected_domain,
        setDomain,
        chartData,
        setDashboardData,
        syncServerChartData,
        target_value,
        setTargetValue
    } = useFilterStore();

    // filterSlots: 4 slots, each holds the column name assigned by the user (null = unassigned)
    const [filterSlots, setFilterSlots] = useState<(string | null)[]>([null, null, null, null]);

    const { charts: streamedCharts, kpis: streamedKpis, done: streamDone, error: streamError } = useDashboardStream(versionId || '');
    // inline column display removed — use side panel classifier instead
    const totalColumnsCount = analytics?.columns ? (Object.values(analytics.columns).reduce((s: any, arr: any) => s + (Array.isArray(arr) ? arr.length : 0), 0)) : 0;

    // Tab state for Key Insights vs All Columns view
    const [allColumnsTab, setAllColumnsTab] = useState(false);
    const [allColumnsPage, setAllColumnsPage] = useState(0);
    const ALL_COLUMNS_PAGE_SIZE = 6;

    // Dynamic Chart Colors
    const chartColors = {
        grid: isDark ? '#23282B' : '#E4DED4',
        axis: isDark ? '#8E9196' : '#7C725D',
        text: isDark ? '#FCFAF5' : '#1F1C18',
        tooltip: {
            bg: isDark ? '#141719' : '#FCFAF5',
            border: isDark ? '#23282B' : '#E4DED4',
            text: isDark ? '#FCFAF5' : '#1F1C18'
        }
    };

    const [corrMatrix, setCorrMatrix] = useState<CorrelationMatrix | null>(null);
    const [corrLoading, setCorrLoading] = useState(false);

    // Narrative insight state
    const [narrative, setNarrative] = useState<string | null>(null);
    const [narrativeLoading, setNarrativeLoading] = useState(false);
    const [dataQualityOpen, setDataQualityOpen] = useState(false);
    const [quickReactCharts, setQuickReactCharts] = useState(false);
    const quickReactResetRef = useRef<number | null>(null);

    const previousDatasetIdRef = useRef<string>('');
    const [classifierOpen, setClassifierOpen] = useState(false);
    const [isInsightOpen, setIsInsightOpen] = useState(false);
    const [insightNarrative, setInsightNarrative] = useState<string | null>(null);
    const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);



    const [isRemapModalOpen, setIsRemapModalOpen] = useState(false);
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [remapVersionId, setRemapVersionId] = useState<string | null>(null);
    const [remapCurrentMappings, setRemapCurrentMappings] = useState<Record<string, string> | null>(null);
    const [versionDiffData, setVersionDiffData] = useState<{ prev: any[], curr: any[] }>({ prev: [], curr: [] });
    const [isJoinBuilderOpen, setIsJoinBuilderOpen] = useState(false);
    const [versions, setVersions] = useState<DatasetVersionSummary[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const [versionPickerOpen, setVersionPickerOpen] = useState(false);
    const versionPickerRef = useRef<HTMLDivElement>(null);
    
    const [proposals, setProposals] = useState<any[]>([]);
    const [showMappingBanner, setShowMappingBanner] = useState(true);

    const handleGenerateInsight = async () => {
        if (!analytics || !selectedDatasetId) {
            toast.error("No dataset selected to generate insights from.");
            return;
        }

        setNarrativeLoading(true);
        setNarrative(null);

        try {
            const res = await narrativeService.generate(
                selectedDatasetId,
                analytics.kpis,
                analytics.domain,
                analytics.dataset_name,
                analytics.charts
            );
            setNarrative(res);
        } catch (err: any) {
            console.error("Failed to generate insight:", err);
            toast.error(err?.response?.data?.detail || err?.message || "Failed to generate insight");
        } finally {
            setNarrativeLoading(false);
        }
    };


    const handleDeepDive = () => {
        setIsInsightOpen(false);
        const prompt = `Deep dive into the recent insight: ${narrative.substring(0, 50)}...`;
        toast.success("Opening deep dive chat with Vizzy Pilot...");
        navigate('/user/chat', { 
            state: { 
                datasetId: selectedDataset?.dataset_id,
                initialPrompt: prompt
            } 
        });
    };



    const lowConfidenceColumns = useMemo(() => {
        return proposals.filter(p => p.confidence < 0.6);
    }, [proposals]);

    const normalizedActiveFilters = useMemo(() => {
        const rawFilters = Object.entries(active_filters || {}).filter(([, vals]) => Array.isArray(vals) && vals.length > 0);
        const normalized: Record<string, string[]> = {};

        for (const [column, values] of rawFilters) {
            const candidateValues = [
                ...((analytics?.geo_filters?.[column] || []).map((v) => String(v))),
                ...(normalizeColumnKey(String(column)) === normalizeColumnKey(String(analytics?.target_column || ''))
                    ? (analytics?.target_values || []).map((v) => String(v))
                    : []),
            ].filter(Boolean);

            const resolvedValues = Array.from(new Set((values || []).map((value) =>
                resolveValueAgainstColumnOptions(
                    String(value),
                    candidateValues,
                    analytics?.target_column,
                    column,
                )
            )));

            if (resolvedValues.length > 0) {
                normalized[column] = resolvedValues;
            }
        }

        return normalized;
    }, [active_filters, analytics]);

    const normalizedActiveFiltersSignature = useMemo(
        () => stableSerialize(normalizedActiveFilters),
        [normalizedActiveFilters]
    );

    // Chart type is a visual-only client concern. Keep backend refreshes limited
    // to override fields that impact server-computed data (e.g. aggregation).
    const serverChartOverrides = useMemo(() => {
        const next: Record<string, any> = {};
        Object.entries(chart_overrides || {}).forEach(([chartId, override]) => {
            if (!override || typeof override !== 'object') return;
            const { type: _ignoredType, ...rest } = override as Record<string, any>;
            if (Object.keys(rest).length > 0) {
                next[chartId] = rest;
            }
        });
        return next;
    }, [chart_overrides]);

    const serverChartOverridesSignature = useMemo(
        () => stableSerialize(serverChartOverrides),
        [serverChartOverrides]
    );

    const classificationOverridesSignature = useMemo(
        () => stableSerialize(classification_overrides || {}),
        [classification_overrides]
    );

    const triggerQuickChartReact = () => {
        setQuickReactCharts(true);
        if (quickReactResetRef.current) {
            window.clearTimeout(quickReactResetRef.current);
        }
        quickReactResetRef.current = window.setTimeout(() => {
            setQuickReactCharts(false);
            quickReactResetRef.current = null;
        }, 700);
    };

    const handleOpenRemap = async () => {
        try {
            if (!selectedDatasetId) return;
            setIsLoading(true);

            const latestVersion = await datasetService.getLatestVersion(selectedDatasetId);
            const versionDetails = await datasetService.getVersion(latestVersion.id);

            const mappings = JSON.parse(versionDetails.semantic_map_json || '{}');

            setRemapVersionId(latestVersion.id);
            setRemapCurrentMappings(mappings);
            setIsRemapModalOpen(true);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || err?.message || 'Failed to load mappings for remap');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenDiff = () => {
        if (!selectedDatasetId) return;

        if (versions.length < 2) {
            toast('No other versions are available for this dataset.', { icon: 'ℹ️' });
            return;
        }

        const current = versions[0];
        const previous = versions[1];

        const currMap = JSON.parse(current.semantic_map_json || '[]');
        const prevMap = JSON.parse(previous.semantic_map_json || '[]');

        // Normalize to array of {column_name, role}
        const normalize = (map: any) => {
            if (Array.isArray(map)) return map;
            return Object.entries(map).map(([role, col]) => ({ column_name: col, role }));
        };

        setVersionDiffData({
            prev: normalize(prevMap),
            curr: normalize(currMap)
        });
        setIsDiffModalOpen(true);
    };


    useEffect(() => {
        return () => {
            if (quickReactResetRef.current) {
                window.clearTimeout(quickReactResetRef.current);
            }
        };
    }, []);

    // Fetch versions list whenever dataset changes
    useEffect(() => {
        if (!selectedDatasetId) {
            setVersionId(null);
            setVersions([]);
            setSelectedVersionId(null);
            return;
        }
        
        // Immediately reset version states synchronously on dataset switch
        // to prevent debounced load effects from fetching with a stale version ID.
        setVersionId(null);
        setSelectedVersionId(null);
        setVersions([]);

        // Fetch all versions and set default to latest
        Promise.all([
            datasetService.listVersionsForDataset(selectedDatasetId),
            datasetService.getLatestVersion(selectedDatasetId),
        ])
            .then(([allVersions, latest]) => {
                setVersions(allVersions);
                setVersionId(latest.id);
                setSelectedVersionId(latest.id);
                // Trigger auto-render immediately upon selecting a dataset
                triggerAutoRender(latest.id);
            })
            .catch(() => {
                setVersionId(null);
                setVersions([]);
            });
    }, [selectedDatasetId]);

    // Close version picker on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (versionPickerRef.current && !versionPickerRef.current.contains(e.target as Node)) {
                setVersionPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Switch version handler
    const handleVersionSwitch = (newVersionId: string) => {
        setSelectedVersionId(newVersionId);
        setVersionId(newVersionId);
        setVersionPickerOpen(false);
        // Clear previous dashboard state immediately to avoid stale sample data
        setAnalytics(null);
        setDashboardData([], {}, {}, 0, null, selectedDatasetId, newVersionId);
        triggerAutoRender(newVersionId);
    };

    // Active version display helper
    const activeVersion = versions.find(v => v.id === selectedVersionId) || null;
    const activeLabel = activeVersion
        ? (activeVersion.source_type === 'clean' ? 'Cleaned' : 'Raw')
        : '';
    const datasetName = datasets.find(d => d.id === selectedDatasetId)?.name || 'Dataset';

    const triggerAutoRender = async (versionId: string) => {
        try {
            setIsLoading(true);
            const response = await apiClient.get<DashboardAnalytics>(`/analytics/auto-render/${versionId}`);
            const data = response.data;

            // Validate response structure before setting state
            if (!data) {
                throw new Error("Empty response from auto-render");
            }

            setAnalytics(data);
            // Write to cache so subsequent interactive refreshes find the right version
            const cacheKey = stableSerialize({
                schema: DASHBOARD_CACHE_SCHEMA_VERSION,
                datasetId: selectedDatasetId,
                versionId,
                targetValue: 'all',
                selectedDomain: data.domain_confidence ? 'auto' : 'auto',
                filters: {},
                classificationOverrides: {},
            });
            cacheRef.current.analytics.set(cacheKey, { value: data, createdAt: Date.now() });
            setSessionCachedAnalytics(cacheKey, data);

            // Build initial chart data from analytics.charts
            const initial: Record<string, any> = {};
            if (data.charts && typeof data.charts === 'object') {
                Object.entries(data.charts).forEach(([key, chart]: [string, any]) => {
                    if (chart && typeof chart === 'object') {
                        initial[key] = chart.data;
                    }
                });
            }

            // Always call setDashboardData to ensure dashboard state is synced
            setDashboardData(
                data.raw_data || [],
                data.chart_configs || {},
                initial,
                data.total_rows || 0,
                data.target_column || null,
                selectedDatasetId,
                versionId
            );
        } catch (err: any) {
            const errorMsg = err?.response?.data?.detail || err?.message || "Unknown error";
            console.error("Auto-render failed:", err);
            console.error("Error detail:", errorMsg);
            toast.error(`Dashboard generation failed: ${errorMsg}`);
            // Clear dashboard state on failure to avoid showing stale data
            setAnalytics(null);
            setDashboardData([], {}, {}, 0, null, selectedDatasetId, versionId);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadDatasets(); }, []);

    useEffect(() => {
        if (selectedDatasetId) {
            sessionStorage.setItem('vizzy.dashboard.selectedDatasetId', selectedDatasetId);
            const dismissed = sessionStorage.getItem(`vizzy.dashboard.dismissedMappingBanner.${selectedDatasetId}`) === 'true';
            setShowMappingBanner(!dismissed);
        } else {
            setShowMappingBanner(false);
        }
    }, [selectedDatasetId]);

    // Load saved semantic mapping from version metadata (NO LLM call)
    useEffect(() => {
        if (!selectedDatasetId || !versionId) {
            setProposals([]);
            return;
        }
        const versionExists = versions.some(v => v.id === versionId);
        if (!versionExists) {
            setProposals([]);
            return;
        }
        // Read saved mapping from version list instead of calling LLM
        const currentVersion = versions.find(v => v.id === versionId);
        if (currentVersion?.semantic_map_json) {
            try {
                const savedMap = typeof currentVersion.semantic_map_json === 'string'
                    ? JSON.parse(currentVersion.semantic_map_json)
                    : currentVersion.semantic_map_json;
                const proposedList = Object.entries(savedMap).map(([column, role]) => ({
                    column,
                    role: role as string,
                    confidence: 1.0,
                    reasoning: 'Previously confirmed mapping',
                }));
                setProposals(proposedList);
            } catch {
                setProposals([]);
            }
        } else {
            setProposals([]);
        }
    }, [selectedDatasetId, versionId, versions]);

    useEffect(() => {
        const prev = previousDatasetIdRef.current;
        if (prev && prev !== selectedDatasetId) {
            // Recreate caches on dataset switches to avoid stale cross-dataset payloads.
            cacheRef.current = createDashboardCacheBundle();
        }
        previousDatasetIdRef.current = selectedDatasetId;
    }, [selectedDatasetId]);

    // Reset slots + filters when dataset changes
    useEffect(() => {
        setFilterSlots([null, null, null, null]);
        setTargetValue('all');
        clearFilters();
    }, [selectedDatasetId]);

    // Auto-seed slots on first analytics load for this dataset
    useEffect(() => {
        if (!analytics?.geo_filters || !analytics?.columns?.dimensions) return;
        const alreadySeeded = filterSlots.some(s => s !== null);
        if (alreadySeeded) return;

        // Correct priority for filter slot seeding:
        // 1. Domain-priority dimensions (contract_type, region, segment)
        // 2. Low-to-medium cardinality dimensions (2-20 unique values)
        // 3. EXCLUDE identifiers or high-cardinality (>20 unique values)
        const DOMAIN_PRIORITY = ['contract', 'segment', 'category', 'region', 'type', 'status', 'gender'];

        const dimMetadata = Object.keys(analytics.geo_filters).map(col => ({
            col,
            isPriority: DOMAIN_PRIORITY.some(p => col.toLowerCase().includes(p)),
            cardinality: analytics.geo_filters![col].length
        }));

        const filtered = dimMetadata.filter(d =>
            d.cardinality >= 2 && d.cardinality <= 20 // Guard against high cardinality
        );

        const sorted = [
            ...filtered.filter(d => d.isPriority).sort((a, b) => a.cardinality - b.cardinality),
            ...filtered.filter(d => !d.isPriority).sort((a, b) => a.cardinality - b.cardinality),
        ];

        const finalCols = sorted.map(s => s.col);

        // Seed up to 4 slots with top columns
        setFilterSlots(prev => prev.map((_, i) => finalCols[i] ?? null));
    }, [analytics]);

    const abortControllerRef = useRef<AbortController | null>(null);
    const kpiAbortControllerRef = useRef<AbortController | null>(null);

    // Debounce the analytics load
    useEffect(() => {
        if (!selectedDatasetId || !selectedVersionId) return;

        // Ensure the selected version belongs to the current dataset by validating it exists in the versions array
        const versionExists = versions.some(v => v.id === selectedVersionId);
        if (!versionExists) return;

        // Route-switch fast path: restore from in-memory/session cache immediately
        // so Dashboard <-> Upload navigation does not show a full reload.
        const cacheKey = buildDashboardCacheKey();
        const applyCachedAnalytics = (cachedData: DashboardAnalytics) => {
            setAnalytics(cachedData);
            if (cachedData.raw_data && cachedData.chart_configs) {
                const initial: Record<string, any> = {};
                if (cachedData.charts) {
                    Object.entries(cachedData.charts).forEach(([key, chart]: [string, any]) => {
                        initial[key] = chart.data;
                    });
                }
                if (cachedData.all_columns_charts) {
                    Object.entries(cachedData.all_columns_charts).forEach(([key, chart]: [string, any]) => {
                        initial[key] = chart.data;
                    });
                }
                setDashboardData(
                    cachedData.raw_data,
                    cachedData.chart_configs,
                    initial,
                    cachedData.total_rows,
                    cachedData.target_column
                );
            }
        };

        const memoryCached = cacheRef.current.analytics.get(cacheKey);
        if (memoryCached && isFresh(memoryCached.createdAt)) {
            applyCachedAnalytics(memoryCached.value);
            return;
        }

        const sessionCached = getSessionCachedAnalytics(cacheKey);
        if (sessionCached) {
            cacheRef.current.analytics.set(cacheKey, sessionCached);
            applyCachedAnalytics(sessionCached);
            return;
        }

        // 1. Instantly recompute correlation matrix in background if dataset changed
        // (Moved from separate useEffect for cleaner logic)

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const timer = setTimeout(() => {
            loadAnalytics(controller.signal);
        }, 400);

        return () => {
            clearTimeout(timer);
        };
    }, [selectedDatasetId, selectedVersionId, versions, classificationOverridesSignature, selected_domain]);

    const buildDashboardCacheKey = () => {
        return stableSerialize({
            schema: DASHBOARD_CACHE_SCHEMA_VERSION,
            datasetId: selectedDatasetId,
            versionId: selectedVersionId,
            targetValue: target_value || 'all',
            selectedDomain: selected_domain || 'auto',
            filters: normalizedActiveFilters,
            classificationOverrides: classification_overrides || {},
        });
    };

    const loadDatasets = async () => {
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
            if (data.length > 0) {
                const retained = sessionStorage.getItem('vizzy.dashboard.selectedDatasetId') || selectedDatasetId;
                const hasRetainedDataset = !!retained && data.some((d: any) => d.id === retained);
                setSelectedDatasetId(hasRetainedDataset ? retained : data[0].id);
            }
            // If no datasets, ensure loading is false so empty state shows
        } catch {
            setError('Failed to load datasets');
        }
    };

    const loadAnalytics = async (signal?: AbortSignal, forceRefresh = false) => {
        try {
            const cacheKey = buildDashboardCacheKey();
            const cached = cacheRef.current.analytics.get(cacheKey);
            if (!forceRefresh && cached && isFresh(cached.createdAt)) {
                const cachedData = cached.value;
                setAnalytics(cachedData);
                if (cachedData.raw_data && cachedData.chart_configs) {
                    const initial: Record<string, any> = {};
                    if (cachedData.charts) {
                        Object.entries(cachedData.charts).forEach(([key, chart]: [string, any]) => {
                            initial[key] = chart.data;
                        });
                    }
                    setDashboardData(cachedData.raw_data, cachedData.chart_configs, initial, cachedData.total_rows, cachedData.target_column, selectedDatasetId);
                }

                return;
            }

            if (!forceRefresh) {
                const sessionCached = getSessionCachedAnalytics(cacheKey);
                if (sessionCached) {
                    setAnalytics(sessionCached);
                    cacheRef.current.analytics.set(cacheKey, sessionCached);
                    if (sessionCached.raw_data && sessionCached.chart_configs) {
                        const initial: Record<string, any> = {};
                        if (sessionCached.charts) {
                            Object.entries(sessionCached.charts).forEach(([key, chart]: [string, any]) => {
                                initial[key] = chart.data;
                            });
                        }
                        if (sessionCached.all_columns_charts) {
                            Object.entries(sessionCached.all_columns_charts).forEach(([key, chart]: [string, any]) => {
                                initial[key] = chart.data;
                            });
                        }
                        setDashboardData(sessionCached.raw_data, sessionCached.chart_configs, initial, sessionCached.total_rows, sessionCached.target_column, selectedDatasetId);
                    }

                    // The session cache stores only lightweight metadata (raw_data is
                    // stripped to keep payload size sane). Render with what we have
                    // and schedule a background refresh so client-side filter
                    // recomputation becomes available without a hard reload.
                    if (!sessionCached.raw_data) {
                        setTimeout(() => {
                            void loadAnalytics(new AbortController().signal, true);
                        }, 50);
                    }

                    return;
                }
            }

            // If we have rawData already, this is a background KPI refresh
            const isKPIOnly = !!useFilterStore.getState().rawData;

            if (isKPIOnly) setIsKPILoading(true);
            else setIsLoading(true);

            setError(null);
            const data = await analyticsService.getDashboardAnalytics(
                selectedDatasetId,
                target_value,
                normalizedActiveFilters,
                {},
                classification_overrides,
                selected_domain,
                signal,
                true, // Always fetch All Columns data for tab toggle
                selectedVersionId
            );
            setAnalytics(data);
            cacheRef.current.analytics.set(cacheKey, data);
            setSessionCachedAnalytics(cacheKey, data);
            if (data.raw_data && data.chart_configs) {
                console.log(`[Hybrid Engine] Received ${data.raw_data.length} rows for local recomputation. Target: ${data.target_column}`);
                const initial: Record<string, any> = {};
                if (data.charts) {
                    Object.entries(data.charts).forEach(([key, chart]: [string, any]) => {
                        initial[key] = chart.data;
                    });
                }
                if (data.all_columns_charts) {
                    Object.entries(data.all_columns_charts).forEach(([key, chart]: [string, any]) => {
                        initial[key] = chart.data;
                    });
                }
                setDashboardData(data.raw_data, data.chart_configs, initial, data.total_rows, data.target_column, selectedDatasetId);
            } else {
                console.warn('[Hybrid Engine] Missing raw_data or chart_configs. Local filtering disabled.');
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            setError(err.response?.data?.detail || 'Failed to load analytics');
        } finally {
            setIsLoading(false);
            setIsKPILoading(false);
        }
    };

    const loadKpisForInteractiveState = async (signal?: AbortSignal) => {
        try {
            setIsKPILoading(true);
            const data = await analyticsService.getDashboardAnalytics(
                selectedDatasetId,
                target_value,
                normalizedActiveFilters,
                serverChartOverrides,
                classification_overrides,
                selected_domain,
                signal,
                true,
                selectedVersionId
            );

            if (data.charts) {
                const refreshedCharts: Record<string, any> = {};
                Object.entries(data.charts).forEach(([key, chart]: [string, any]) => {
                    refreshedCharts[key] = chart.data;
                });
                if (data.all_columns_charts) {
                    Object.entries(data.all_columns_charts).forEach(([key, chart]: [string, any]) => {
                        refreshedCharts[key] = chart.data;
                    });
                }
                syncServerChartData(refreshedCharts);
            }

            setAnalytics(prev => {
                if (!prev) return data;
                return {
                    ...prev,
                    kpis: data.kpis,
                    charts: data.charts ?? prev.charts,
                    target_column: data.target_column ?? prev.target_column,
                    target_values: data.target_values ?? prev.target_values,
                    all_columns_charts: data.all_columns_charts ?? prev.all_columns_charts,
                    all_columns_count: data.all_columns_count ?? prev.all_columns_count,
                };
            });
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
        } finally {
            setIsKPILoading(false);
        }
    };

    useEffect(() => {
        if (!selectedDatasetId || !selectedVersionId) return;

        // Ensure the selected version belongs to the current dataset by validating it exists in the versions array
        const versionExists = versions.some(v => v.id === selectedVersionId);
        if (!versionExists) return;

        const hasTargetFilter = !!(target_value && target_value.toLowerCase() !== 'all');
        const hasActiveFilters = Object.keys(normalizedActiveFilters).length > 0;
        const hasChartOverrides = Object.keys(serverChartOverrides || {}).length > 0;

        if (!hasTargetFilter && !hasActiveFilters && !hasChartOverrides) {
            const baseKey = stableSerialize({
                schema: DASHBOARD_CACHE_SCHEMA_VERSION,
                datasetId: selectedDatasetId,
                versionId: selectedVersionId,
                targetValue: 'all',
                selectedDomain: selected_domain || 'auto',
                filters: {},
                classificationOverrides: classification_overrides || {},
            });
            const baseCached = cacheRef.current.analytics.get(baseKey);
            if (baseCached && isFresh(baseCached.createdAt)) {
                setAnalytics(baseCached.value);
            }
            return;
        }

        if (kpiAbortControllerRef.current) {
            kpiAbortControllerRef.current.abort();
        }

        const controller = new AbortController();
        kpiAbortControllerRef.current = controller;

        const timer = setTimeout(() => {
            loadKpisForInteractiveState(controller.signal);
        }, quickReactCharts ? 90 : 260);

        return () => {
            clearTimeout(timer);
        };
    }, [selectedDatasetId, selectedVersionId, versions, selected_domain, classificationOverridesSignature, normalizedActiveFiltersSignature, serverChartOverridesSignature, target_value]);

    const handleChartFilterClick = (col: string, val: string) => {
        const rawCol = String(col || '').trim();
        const rawVal = String(val || '').trim();
        if (!rawVal) return;

        const isGeneric = !rawCol || ['name', 'date', 'label'].includes(rawCol.toLowerCase());
        let resolvedCol = rawCol;

        if (isGeneric && analytics?.geo_filters) {
            const candidates = Object.entries(analytics.geo_filters)
                .filter(([, values]) => Array.isArray(values) && values.some(v => String(v).trim().toLowerCase() === rawVal.toLowerCase()))
                .map(([key]) => key);

            if (candidates.length === 1) {
                resolvedCol = candidates[0];
            } else if (candidates.length > 1) {
                const slotPreferred = filterSlots.find(slot => !!slot && candidates.includes(slot));
                resolvedCol = slotPreferred || candidates[0];
            }
        }

        if (!resolvedCol || ['name', 'date', 'label'].includes(resolvedCol.toLowerCase())) return;

        let resolvedVal = rawVal;
        const candidateValues = [
            ...((analytics?.geo_filters?.[resolvedCol] || []).map(v => String(v))),
            ...(resolvedCol === analytics?.target_column ? (analytics?.target_values || []).map(v => String(v)) : []),
        ].filter(Boolean);

        resolvedVal = resolveValueAgainstColumnOptions(
            rawVal,
            candidateValues,
            analytics?.target_column,
            resolvedCol,
        );

        triggerQuickChartReact();
        toggleFilter(resolvedCol, resolvedVal);

        // Ensure chart-driven filter remains visible in the multi-filter slots.
        setFilterSlots(prev => {
            if (!resolvedCol || prev.includes(resolvedCol)) return prev;
            const firstEmpty = prev.findIndex(slot => slot === null);
            if (firstEmpty >= 0) {
                const next = [...prev];
                next[firstEmpty] = resolvedCol;
                return next;
            }
            const next = [...prev];
            next[0] = resolvedCol;
            return next;
        });
    };

    useEffect(() => {
        if (!SHOW_CORRELATION_CHART) return;
        if (!selectedDatasetId) return;
        const cached = cacheRef.current.correlation.get(selectedDatasetId);
        if (cached && isFresh(cached.createdAt)) {
            setCorrMatrix(cached.value);
            setCorrLoading(false);
            return;
        }
        setCorrLoading(true);
        setCorrMatrix(null);
        correlationService.getMatrix(selectedDatasetId)
            .then(m => {
                cacheRef.current.correlation.set(selectedDatasetId, m);
                setCorrMatrix(m);
            })
            .catch(() => setCorrMatrix(null))
            .finally(() => setCorrLoading(false));
    }, [selectedDatasetId]);

    // Fetch narrative when KPIs and charts are loaded
    useEffect(() => {
        if (!analytics?.kpis || !selectedDatasetId) return;
        
        const narrativeKey = stableSerialize({
            datasetId: selectedDatasetId,
            domain: analytics.domain,
            datasetName: analytics.dataset_name,
            kpis: analytics.kpis,
            charts: analytics.charts,
        });
        
        const cached = cacheRef.current.narrative.get(narrativeKey);
        if (cached && isFresh(cached.createdAt)) {
            setNarrative(cached.value);
            setNarrativeLoading(false);
            return;
        }

        let isCancelled = false;
        
        setNarrative(null); // Clear old insight while fetching
        setNarrativeLoading(true);
        
        narrativeService.generate(
            selectedDatasetId,
            analytics.kpis,
            analytics.domain,
            analytics.dataset_name,
            analytics.charts,
        )
            .then(text => {
                if (!isCancelled) {
                    cacheRef.current.narrative.set(narrativeKey, text);
                    setNarrative(text);
                }
            })
            .catch(() => {
                if (!isCancelled) setNarrative(null);
            })
            .finally(() => {
                if (!isCancelled) setNarrativeLoading(false);
            });
            
        return () => {
            isCancelled = true;
        };
    }, [analytics?.kpis, analytics?.charts, selectedDatasetId]);

    const formatValue = (value: any, format = 'number') => {
        if (format === 'text') return String(value);
        if (format === 'percent' || format === 'percentage') return `${value}%`;
        if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);
        return new Intl.NumberFormat('en-US').format(value);
    };

    const kpiEntries = analytics?.kpis ? Object.entries(analytics.kpis) : [];
    const hasInteractiveScope =
        Object.keys(normalizedActiveFilters).length > 0
        || (target_value && target_value.toLowerCase() !== 'all')
        || Object.keys(serverChartOverrides || {}).length > 0;
    const isChurnDashboard = String(analytics?.domain || '').toLowerCase() === 'churn';

    const detectTimeSeries = (data: any) => {
        try {
            if (!Array.isArray(data) || data.length < 3) return false;
            const sample = data[0];
            const candidateKeys = ['x', 'date', 'timestamp', 'ts', 'time', 'created_at', 'dt', 'day', 'month', 'year'];
            if (sample && typeof sample === 'object') {
                const keys = Object.keys(sample).map(k => k.toLowerCase());
                if (keys.some(k => candidateKeys.includes(k))) return true;

                // If any column looks like a date across the sample rows, treat as time-series
                for (const k of Object.keys(sample)) {
                    let parsedCount = 0;
                    for (let i = 0; i < Math.min(6, data.length); i++) {
                        const v = data[i]?.[k];
                        if (v == null) break;
                        if (typeof v === 'number') parsedCount++;
                        else if (!isNaN(Date.parse(String(v)))) parsedCount++;
                    }
                    if (parsedCount >= 3) return true;
                }
            }

            // Array of primitive numbers - long series can be treated as a trend
            if (typeof sample === 'number' && data.length >= 20) return true;
        } catch (e) {
            // best-effort detection only
        }
        return false;
    };

    const chartArrayRaw: ChartItem[] = analytics?.charts ? Object.entries(analytics.charts).map(([id, val]) => {
        const resolvedType = chart_overrides[id]?.type || val.type;
        const chartConfig = analytics?.chart_configs?.[id];
        const resolvedTypeLower = String(resolvedType || '').toLowerCase();
        const explicitIsDate = !!(((val as any).is_date) ?? (chartConfig as any)?.is_date);
        const inferredIsDate = detectTimeSeries((val as any).data || (chartConfig as any)?.data);
        // Disable server data bypass to allow local recomputation for date trends and churn dashboards
        const shouldUseServerData = false;

        const resolvedData = shouldUseServerData
            ? (val as any).data
            : ((hasInteractiveScope ? chartData?.[id] : undefined) || (val as any).data);

        return {
            id,
            ...val,
            dimension: val.dimension ?? chartConfig?.dimension,
            metric: val.metric ?? chartConfig?.metric,
            aggregation: val.aggregation ?? chartConfig?.aggregation,
            data: resolvedData,
            data_without_outliers: (Object.keys(normalizedActiveFilters).length === 0 && String(target_value || 'all').toLowerCase() === 'all')
                ? (val.data_without_outliers || val.data)
                : resolvedData,
            section: val.section || 'Other Insights',
        };
    }) : [];

    console.log('DEBUG: chartArrayRaw sample:', chartArrayRaw.slice(0, 3));

    // Sort: regular charts first, tall hbar charts last so they don't break grid row alignment
    const chartArray: ChartItem[] = [...chartArrayRaw].sort((a, b) => {
        const typeA = chart_overrides[a.id]?.type || a.type;
        const typeB = chart_overrides[b.id]?.type || b.type;
        const aIsHbar = typeA === 'hbar' && a.data?.length >= 8 ? 1 : 0;
        const bIsHbar = typeB === 'hbar' && b.data?.length >= 8 ? 1 : 0;
        return aIsHbar - bIsHbar;
    });

    const chartSections = useMemo(() => {
        const groups: Record<string, ChartItem[]> = {};
        const order: string[] = [];

        for (const chart of chartArray) {
            const section = chart.section || 'Other Insights';
            if (!groups[section]) {
                groups[section] = [];
                order.push(section);
            }
            groups[section].push(chart);
        }

        return order.map(title => ({
            title,
            charts: groups[title],
        }));
    }, [chartArray]);


    const exportChartCSV = (chart: ChartItem) => {
        const rows = chart.data;
        if (!Array.isArray(rows) || rows.length === 0) return;

        const escapeCell = (v: any) => {
            let s = v === null || v === undefined ? '' : String(v);
            s = s.replace(/"/g, '""');
            if (/^[=+\-@]/.test(s)) s = "'" + s;
            return `"${s}"`;
        };

        const keys = Object.keys(rows[0]);
        const headers = keys.map(escapeCell).join(',');
        const body = rows.map((row: any) => keys.map(k => escapeCell(row[k])).join(',')).join('\n');

        const blob = new Blob([headers + '\n' + body], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(chart.title || 'insight').replace(/\s+/g, '_')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportChartHTML = (chart: ChartItem) => {
        try {
            const data = chart.data;
            if (!Array.isArray(data) || data.length === 0) return;

            const currentType = String(chart_overrides[chart.id]?.type || chart.type || 'bar').toLowerCase();
            const isHorizontal = currentType === 'hbar';
            const mapType = chart.geo_meta?.map_type || 'world';

            const firstRow = data[0] || {};
            const labelKey = 'name' in firstRow ? 'name' : Object.keys(firstRow).find(k => typeof firstRow[k] === 'string') || 'name';
            const valueKey = chart.value_label || Object.keys(firstRow).find(k => typeof firstRow[k] === 'number') || 'value';

            let htmlContent = '';
            const safeTitle = (chart.title || 'Vizzy Pilot Export').replace(/</g, '&lt;');
            const reportDate = new Date().toLocaleDateString();

            const safeJSON = (obj: any) => JSON.stringify(obj).replace(/`/g, '\\`').replace(/\$/g, '\\$');

            if (currentType === 'geo_map' || currentType === 'map') {
                const mapData = [['Region', valueKey]];
                data.forEach((d: any) => {
                    const val = Number(d[valueKey]) || 0;
                    mapData.push([String(d[labelKey] || 'Unknown'), val]);
                });

                htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <style>
        body { background-color: #0e1015; color: #f3f4f6; font-family: 'Inter', sans-serif; margin: 0; }
        .glass-panel { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
        .accent-bar { width: 3px; height: 24px; background-color: ${CHART_COLORS[0]}; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-4xl glass-panel p-8 rounded-xl shadow-2xl">
        <div class="flex items-center gap-3 mb-8">
            <div class="accent-bar"></div>
            <h1 class="text-2xl font-light tracking-tight uppercase" style="color:${CHART_COLORS[0]};font-family:'Outfit',sans-serif;">${safeTitle}</h1>
        </div>
        
        <div id="vizzyChart" style="width: 100%; height: 500px;" class="rounded-lg overflow-hidden border border-white/5"></div>

        <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-xs text-white/20 uppercase tracking-widest font-mono">
            <span>Generated by Vizzy Pilot Analytics</span>
            <span>${reportDate}</span>
        </div>
    </div>

    <script type="text/javascript">
      google.charts.load('current', {
        'packages':['geochart'],
      });
      google.charts.setOnLoadCallback(drawRegionsMap);

      function drawRegionsMap() {
        var data = google.visualization.arrayToDataTable(${safeJSON(mapData)});
        var options = {
            colorAxis: {colors: ['#2A2D35', '${CHART_COLORS[0]}']},
            backgroundColor: 'transparent',
            datalessRegionColor: '#16181D',
            defaultColor: '#1a1d24',
            legend: {textStyle: {color: '#f3f4f6', fontName: 'Inter'}}
        };
        
        // Handle US states map specifically
        if ('${mapType}' === 'us_states') {
            options.region = 'US';
            options.resolution = 'provinces';
        }

        var chart = new google.visualization.GeoChart(document.getElementById('vizzyChart'));
        chart.draw(data, options);
      }
    </script>
</body>
</html>`;
            } else {
                let chartJsType = 'bar';
                if (['line', 'area', 'stacked'].includes(currentType)) chartJsType = 'line';
                if (['pie'].includes(currentType)) chartJsType = 'pie';
                if (['donut', 'doughnut'].includes(currentType)) chartJsType = 'doughnut';
                if (['radar'].includes(currentType)) chartJsType = 'radar';
                if (['scatter'].includes(currentType)) chartJsType = 'scatter';
                if (['treemap'].includes(currentType)) chartJsType = 'treemap';

                let scriptInjects = `<script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>`;
                if (chartJsType === 'treemap') {
                    scriptInjects += `\n    <script src="https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js"></script>`;
                }

                let labels = data.map((d: any) => d[labelKey]);
                let datasetsStr = '';
                let optionsExtra = '';

                if (currentType === 'scatter') {
                    labels = [];
                    datasetsStr = `[
                        {
                            label: ${safeJSON(chart.title || 'Scatter')},
                            data: ${safeJSON(data.map((d: any) => ({ x: Number(d.x) || 0, y: Number(d.y) || 0 })))},
                            backgroundColor: '${CHART_COLORS[0]}',
                            borderColor: '${CHART_COLORS[0]}',
                            pointRadius: 6,
                            pointHoverRadius: 8
                        }
                    ]`;
                    optionsExtra = `
                        scales: {
                            x: { type: 'linear', position: 'bottom', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.3)' } },
                            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
                        }
                    `;
                } else if (currentType === 'treemap') {
                    labels = [];
                    datasetsStr = `[{
                        label: ${safeJSON(valueKey)},
                        tree: ${safeJSON(data)},
                        key: 'value',
                        groups: [${safeJSON(labelKey)}],
                        backgroundColor: (ctx) => {
                            const colors = ${JSON.stringify(CHART_COLORS)};
                            return colors[ctx.dataIndex % colors.length] || '${CHART_COLORS[0]}';
                        },
                        labels: { display: true, color: '#0e1015', font: { family: 'Inter', weight: 600 } },
                        borderWidth: 1,
                        borderColor: '#0e1015'
                    }]`;
                } else if (currentType === 'stacked_bar' || currentType === 'stacked') {
                    const categories = chart.categories || ['positive', 'negative'];
                    const colors = CHART_COLORS;
                    const ds = categories.map((cat: string, i: number) => ({
                        label: cat,
                        data: data.map((d: any) => Number(d[cat]) || 0),
                        backgroundColor: colors[i % colors.length],
                        borderColor: colors[i % colors.length],
                        borderWidth: 1,
                        fill: currentType === 'stacked',
                        stack: 'Stack 0'
                    }));
                    datasetsStr = safeJSON(ds);
                    optionsExtra = `
                        scales: {
                            x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.3)' } },
                            y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
                        }
                    `;
                } else {
                    const values = data.map((d: any) => Number(d[valueKey]) || 0);
                    const isRadar = chartJsType === 'radar';
                    const isPie = ['pie', 'doughnut'].includes(chartJsType);

                    let bgStr = isPie
                        ? JSON.stringify(CHART_COLORS)
                        : (isRadar ? '"rgba(108, 99, 255, 0.4)"' : '"rgba(108, 99, 255, 0.8)"');

                    let borderColorStr = isPie ? '"#0e1015"' : `"${CHART_COLORS[0]}"`;
                    let fillStr = (currentType === 'area' || isRadar) ? 'true' : 'false';

                    datasetsStr = `[{
                        label: ${safeJSON(valueKey)},
                        data: ${safeJSON(values)},
                        backgroundColor: ${bgStr},
                        borderColor: ${borderColorStr},
                        borderWidth: ${isPie ? '2' : '1'},
                        fill: ${fillStr},
                        tension: 0.4
                    }]`;

                    if (!isPie && !isRadar) {
                        optionsExtra = `
                            scales: {
                                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.3)' } },
                                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
                            }
                        `;
                    } else if (isRadar) {
                        optionsExtra = `
                            scales: {
                                r: { 
                                    grid: { color: 'rgba(255,255,255,0.1)' }, 
                                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                                    pointLabels: { color: 'rgba(255,255,255,0.5)' },
                                    ticks: { display: false, backdropColor: 'transparent' }
                                }
                            }
                        `;
                    }
                }

                htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    ${scriptInjects}
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body { background-color: #0e1015; color: #f3f4f6; font-family: 'Inter', sans-serif; margin:0; padding:0; }
        .glass-panel { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
        .accent-bar { width: 3px; height: 24px; background-color: ${CHART_COLORS[0]}; }
        canvas { width: 100% !important; height: 100% !important; max-height: 500px; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-4xl glass-panel p-8 rounded-xl shadow-2xl">
        <div class="flex items-center gap-3 mb-8">
            <div class="accent-bar"></div>
            <h1 class="text-2xl font-light tracking-tight uppercase" style="color:${CHART_COLORS[0]};font-family:'Outfit',sans-serif;">${safeTitle}</h1>
        </div>
        
        <div class="relative w-full overflow-hidden" style="height: 500px;">
            <canvas id="vizzyChart"></canvas>
        </div>

        <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-xs text-white/20 uppercase tracking-widest font-mono">
            <span>Generated by Vizzy Pilot Analytics</span>
            <span>${reportDate}</span>
        </div>
    </div>

    <script>
        function initChart() {
            try {
                if (typeof Chart === 'undefined') {
                    setTimeout(initChart, 50);
                    return;
                }
                const ctx = document.getElementById('vizzyChart').getContext('2d');
                const chartType = '${chartJsType}';
                const isRadial = ['pie', 'doughnut', 'radar', 'polarArea'].includes(chartType);
                
                const config = {
                    type: chartType,
                    data: {
                        labels: ${safeJSON(labels)},
                        datasets: ${datasetsStr}
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: isRadial, 
                        aspectRatio: isRadial ? 2 : undefined,
                        animation: { duration: 600 },
                        plugins: {
                            legend: { 
                                display: ${['pie', 'donut', 'doughnut', 'radar', 'stacked_bar', 'stacked'].includes(currentType)}, 
                                position: isRadial ? 'right' : 'top',
                                labels: { 
                                    color: 'rgba(255,255,255,0.7)', 
                                    padding: 20,
                                    font: { family: 'Inter', size: 12 } 
                                } 
                            },
                            tooltip: {
                                backgroundColor: '#16181D',
                                titleColor: '${CHART_COLORS[0]}',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255,255,255,0.1)',
                                borderWidth: 1,
                                padding: 12,
                                displayColors: true,
                                usePointStyle: true
                            }
                        },
                        ${optionsExtra}
                    }
                };

                if (!isRadial) {
                    config.options.maintainAspectRatio = false;
                    config.options.indexAxis = ${isHorizontal} ? 'y' : 'x';
                }

                new Chart(ctx, config);
            } catch (e) {
                console.error("Vizzy Pilot Export Error:", e);
                document.body.innerHTML += '<div style="position:fixed;bottom:20px;left:20px;background:red;color:white;padding:10px;z-index:9999">Render Error: ' + e.message + '</div>';
            }
        }
        // Small delay ensures Tailwind and Glassmorphism layout is fully settled
        window.addEventListener('load', () => setTimeout(initChart, 150));
    </script>
</body>
</html>`;
            }
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${(chart.title || 'insight').replace(/\s+/g, '_')}_interactive.html`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export chart:', error);
        }
    };

    const renderChartActions = (chart: ChartItem) => {
        const isClassificationMismatch = (c: ChartItem) => {
            try {
                const cols = analytics?.columns;
                if (!cols) return false;
                const dims = new Set(cols.dimensions || []);
                const mets = new Set(cols.metrics || []);
                const exc = new Set(cols.excluded || []);
                if (c.metric && dims.has(c.metric)) return true; // metric classified as dimension
                if (c.dimension && mets.has(c.dimension)) return true; // dimension classified as metric
                if (c.metric && exc.has(c.metric)) return true; // metric classified as excluded
            } catch (e) {
                return false;
            }
            return false;
        };
        const currentType = chart_overrides[chart.id]?.type || chart.type;
        const currentAgg = (chart_overrides[chart.id]?.aggregation || chart.aggregation || 'sum').toLowerCase();

        const isNumericMetric = chart.value_label?.toLowerCase()?.includes('count') === false &&
            currentAgg !== 'count';

        const chartRows = Array.isArray(chart?.data) ? chart.data : [];
        const firstRow = chartRows[0] || {};
        const stackedIgnoreKeys = new Set(['name', 'label', 'timestamp', 'date', 'x', 'y', 'r', 'id', 'value']);
        const inferredStackedKeys = Object.keys(firstRow).filter((k) => {
            if (stackedIgnoreKeys.has(String(k).toLowerCase())) return false;
            return Number.isFinite(Number(firstRow[k]));
        });
        const hasStackedData =
            ['stacked_bar', 'stacked'].includes(String(chart?.type || '').toLowerCase())
            || (Array.isArray(chart?.categories) && chart.categories.length > 1)
            || inferredStackedKeys.length >= 2;

        const allTypeOptions = [
            { value: 'bar', label: 'Bar' },
            { value: 'hbar', label: 'H-Bar' },
            { value: 'line', label: 'Line' },
            { value: 'area', label: 'Area' },
            { value: 'pie', label: 'Pie' },
            { value: 'donut', label: 'Donut' },
            { value: 'scatter', label: 'Scatter' },
            { value: 'bubble', label: 'Bubble' },
            { value: 'treemap', label: 'Treemap' },
            { value: 'radar', label: 'Radar' },
            { value: 'polar_area', label: 'Polar Area' },
            { value: 'geo_map', label: 'Map' },
            { value: 'stacked_bar', label: 'Stacked Bar' },
        ];

        const compatibleTypeSet = hasStackedData
            ? new Set(['stacked_bar', 'bar', 'hbar', 'line', 'area'])
            : new Set(allTypeOptions.map((o) => o.value).filter((t) => t !== 'stacked_bar'));

        const chartTypeOptions = allTypeOptions.filter((o) => compatibleTypeSet.has(o.value));
        const safeCurrentType = chartTypeOptions.some((o) => o.value === currentType)
            ? currentType
            : (chartTypeOptions[0]?.value || 'bar');

        const isLowConfidenceChart = (c: ChartItem) => {
            if (lowConfidenceColumns.length === 0) return false;
            const cols = lowConfidenceColumns.map(p => p.column_name || p.column);
            return (c.dimension && cols.includes(c.dimension)) || (c.metric && cols.includes(c.metric));
        };

        const mismatch = isClassificationMismatch(chart);
        const lowConf = isLowConfidenceChart(chart);
        return (
            <div className="flex flex-col items-center gap-1 w-full">
                <div className="flex items-center gap-1.5">
                    {(mismatch || lowConf) && (
                        <button title={mismatch ? "Column classification may be incorrect for this chart. Review columns." : "This chart uses a column detected with low confidence. Review columns."} onClick={() => setClassifierOpen(true)} className="p-1.5 rounded-md bg-yellow-600/10 text-yellow-400 hover:bg-yellow-600/15">
                            <span className="material-symbols-outlined text-sm">warning</span>
                        </button>
                    )}
                    {isNumericMetric && (
                        <select
                            value={currentAgg === 'avg' ? 'mean' : currentAgg}
                            onChange={(e) => setChartOverride(chart.id, { aggregation: e.target.value })}
                            className="text-[12px] font-sans px-2 py-1 rounded-lg border border-transparent outline-none transition-colors bg-surface-container-low dark:bg-white/5 text-on-surface-variant hover:bg-surface-container cursor-pointer"
                            title="Aggregation Method"
                        >
                            <option className="bg-surface-container-lowest dark:bg-[#16181D] text-on-surface" value="sum">Sum</option>
                            <option className="bg-surface-container-lowest dark:bg-[#16181D] text-on-surface" value="mean">Average</option>
                        </select>
                    )}
                    <select
                        value={safeCurrentType}
                        onChange={(e) => setChartOverride(chart.id, { type: e.target.value })}
                        className="text-[12px] font-sans px-2 py-1 rounded-lg border border-transparent outline-none transition-colors bg-surface-container-low dark:bg-white/5 text-on-surface-variant hover:bg-surface-container cursor-pointer"
                        title={hasStackedData ? 'Stacked series supports: Stacked Bar, Bar, H-Bar, Line, Area' : 'Chart Type'}
                    >
                        {chartTypeOptions.map((opt) => (
                            <option key={opt.value} className="bg-surface-container-lowest dark:bg-[#16181D] text-on-surface" value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => exportChartCSV(chart)}
                        className="flex p-1.5 hover:bg-surface-container-low dark:hover:bg-white/5 rounded-lg transition-colors"
                        title="Export CSV"
                    >
                        <span className="material-symbols-outlined text-sm text-on-surface-variant">download</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => exportChartHTML(chart)}
                        className="flex p-1.5 hover:bg-surface-container-low dark:hover:bg-white/5 rounded-lg transition-colors"
                        title="Export Interactive HTML"
                    >
                        <span className="material-symbols-outlined text-sm text-on-surface-variant">ios_share</span>
                    </button>
                </div>
                {hasStackedData && (
                    <p className="text-[10px] leading-none text-[#6b7280] dark:text-[#9aa2b1]">
                        Stacked data supports: Stacked Bar, Bar, H-Bar, Line, Area
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="bg-noise min-h-screen">
            <PageHeader
                breadcrumb={["Workspaces", "Vizzy Pilot", analytics?.dataset_name || "Dashboard"]}
                title={getDashboardTitle(analytics?.domain)}
                description={analytics ? `${(analytics.total_rows || 0).toLocaleString()} rows · ${analytics.domain || 'unknown'} domain` : "Select a dataset to start analytics"}
                actions={(
                    <div className="flex items-center gap-3">
                        <BtnSecondary onClick={() => setIsJoinBuilderOpen(true)}><GitCompare className="h-3 w-3" />Join Builder</BtnSecondary>
                        <BtnSecondary onClick={handleOpenDiff}><GitCompare className="h-3 w-3" />Diff versions</BtnSecondary>
                        <BtnSecondary onClick={handleOpenRemap}><Wand2 className="h-3 w-3" />Remap</BtnSecondary>
                        <BtnSecondary onClick={() => loadAnalytics(undefined, true)}><RefreshCw className="h-3 w-3" />Refresh</BtnSecondary>
                        <BtnPrimary><Sparkles className="h-3 w-3" />Ask Vizzy Pilot</BtnPrimary>
                    </div>

                )}
            />

            <div className="px-5 py-4">
                {!selectedDatasetId && !isLoading && (
                    <div className="rounded-lg border border-border bg-surface p-6 text-center text-muted-foreground">
                        Select a dataset to start analytics.
                    </div>
                )}

                {(isLoading || (!analytics && !!selectedDatasetId && !error)) && (
                    <HeaderSkeleton isDark={isDark} />
                )}

                {!isLoading && error && (
                    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-semibold text-destructive">Error Loading Analytics</h4>
                            <p className="text-sm text-muted-foreground mt-1">{error}</p>
                        </div>
                    </div>
                )}

                {!isLoading && !error && analytics && (
                    <div className="space-y-6">
                        {/* Dataset Selector */}
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div className="flex flex-wrap items-end gap-6">
                                <div>
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold mb-2">Select Dataset</div>
                                    <FilterDropdown datasets={datasets} selectedDatasetId={selectedDatasetId} onDatasetChange={setSelectedDatasetId} />
                                </div>
                                {/* Version Picker Dropdown */}
                                <div ref={versionPickerRef} className="relative">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold mb-2">Data Version</div>
                                    <button
                                        onClick={() => {
                                            if (versions.length <= 1) {
                                                toast('Only one version available for this dataset.', { icon: 'ℹ️' });
                                                return;
                                            }
                                            setVersionPickerOpen(!versionPickerOpen);
                                        }}
                                        className="flex items-center gap-2 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-surface text-foreground hover:border-primary/40 hover:text-foreground transition-all"
                                    >
                                        <span className="grid h-4 w-4 place-items-center rounded bg-primary/10 text-primary text-[9px] font-bold">
                                            {activeVersion?.source_type === 'clean' ? 'C' : 'R'}
                                        </span>
                                        <span>
                                            {activeLabel && `${activeLabel} `}
                                            v{activeVersion?.version_number || '?'}
                                        </span>
                                        <span className="text-muted-foreground/50">·</span>
                                        <span className="text-muted-foreground truncate max-w-[120px]">{datasetName}</span>
                                        {versions.length > 1 && (
                                            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${versionPickerOpen ? 'rotate-180' : ''}`} />
                                        )}
                                    </button>

                                    {versionPickerOpen && versions.length > 1 && (
                                        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-xl border border-border bg-surface shadow-2xl py-1.5 overflow-hidden">
                                            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
                                                Switch Data Version
                                            </div>
                                            {versions.map((v) => {
                                                const isRaw = v.source_type !== 'clean';
                                                const isActive = selectedVersionId === v.id;
                                                const label = isRaw ? 'Raw' : 'Cleaned';
                                                const icon = isRaw ? 'R' : 'C';
                                                return (
                                                    <button
                                                        key={v.id}
                                                        onClick={() => handleVersionSwitch(v.id)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-[12px] transition-all ${
                                                            isActive
                                                                ? 'bg-primary/10 text-foreground font-semibold'
                                                                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                                        }`}
                                                    >
                                                        <span className={`grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold ${
                                                            isActive
                                                                ? 'bg-primary text-primary-foreground'
                                                                : 'bg-surface-3 text-muted-foreground'
                                                        }`}>
                                                            {icon}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span>{label}</span>
                                                                <span className="text-[10px] text-muted-foreground/60">v{v.version_number}</span>
                                                                {isActive && (
                                                                    <span className="ml-auto text-[9px] uppercase tracking-wider text-primary font-bold">Active</span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground/50 truncate">
                                                                {datasetName}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-[11px] text-muted-foreground">Domain:</div>
                                <select
                                    value={selected_domain || 'auto'}
                                    onChange={(e) => setDomain(e.target.value === 'auto' ? null : e.target.value)}
                                    className="bg-surface text-foreground font-medium outline-none border border-border rounded-md px-2 py-1"
                                >
                                    <option value="auto">Auto ({analytics.domain})</option>
                                    <option value="sales">Sales</option>
                                    <option value="churn">Churn</option>
                                    <option value="marketing">Marketing</option>
                                    <option value="finance">Finance</option>
                                    <option value="healthcare">Healthcare</option>
                                    <option value="generic">Generic</option>
                                </select>
                                <Pill tone={analytics.domain_confidence === 'HIGH' ? 'success' : analytics.domain_confidence === 'MEDIUM' ? 'warning' : 'danger'}>
                                    {analytics.domain_confidence} Confidence
                                </Pill>
                            </div>
                        </div>

                        {/* Column Classification quick-check banner */}
                        {showMappingBanner && proposals.length > 0 && (
                            <div className="flex items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-yellow-500/10 text-yellow-500">
                                        <AlertCircle className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground">
                                            Smart Column Mapping Applied
                                        </h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Vizzy Pilot automatically mapped your columns.
                                            {lowConfidenceColumns.length > 0 ? (
                                                <span> We identified <strong className="text-yellow-600 dark:text-yellow-400">{lowConfidenceColumns.length} columns with low confidence</strong>. Please review them.</span>
                                            ) : (
                                                " Everything looks good, but you can adjust them anytime."
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <BtnSecondary onClick={() => setClassifierOpen(true)} className="text-xs">
                                        Review Mappings
                                    </BtnSecondary>
                                    <button
                                        onClick={() => {
                                            setShowMappingBanner(false);
                                            sessionStorage.setItem(`vizzy.dashboard.dismissedMappingBanner.${selectedDatasetId}`, 'true');
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-surface-2 transition text-muted-foreground hover:text-foreground"
                                        title="Dismiss"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}


                        {/* KPI Banner */}
                        <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-5">
                            {kpiEntries.map(([key, kpi], idx) => {
                                const streamedKpi = streamedKpis[key];
                                const resolvedValue = streamedKpi?.data?.value ?? kpi.value;
                                const resolvedTrend = streamedKpi?.data?.trend ?? kpi.trend;

                                const hasTrend = typeof resolvedTrend === 'number';
                                const up = hasTrend ? resolvedTrend >= 0 : false;
                                const delta = hasTrend ? `${resolvedTrend >= 0 ? '+' : ''}${resolvedTrend.toFixed(1)}%` : null;

                                return (
                                    <div key={key} className="group relative bg-background p-4 transition hover:bg-surface">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.title}</span>
                                            {delta && (
                                                <Pill tone={up ? 'success' : 'danger'}>
                                                    {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                                                    {delta}
                                                </Pill>
                                            )}
                                        </div>
                                        <div className="mt-2 flex items-end justify-between gap-3">
                                            <span className="num text-display text-[26px] font-semibold leading-none">{isKPILoading && !streamedKpi ? '...' : formatValue(resolvedValue, kpi.format)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>


                        {/* Filters */}
                        {analytics?.geo_filters && Object.keys(analytics.geo_filters).length > 0 && (
                            <MultiFilterPanel
                                geoFilters={analytics.geo_filters}
                                targetColumn={analytics.target_column}
                                targetValues={analytics.target_values?.map(v => String(v)) || []}
                                filterSlots={filterSlots}
                                activeFilters={active_filters}
                                onSlotChange={(slotIdx, col) => setFilterSlots(prev => prev.map((s, i) => i === slotIdx ? col : s))}
                                onFilterChange={(col, values) => {
                                    triggerQuickChartReact();
                                    setFilterValues(col, values);
                                }}
                                onClearAll={() => {
                                    triggerQuickChartReact();
                                    clearFilters();
                                }}
                            />
                        )}

                        {/* Narrative Insights */}
                        <Panel className="ai-glow">
                            <PanelHeader title="Vizzy Pilot insights" subtitle="Live narrative" icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} actions={<Pill tone="accent">AI</Pill>} />
                            <div className="p-4">
                                {narrativeLoading ? (
                                    <div className="space-y-2">
                                        <div className="h-3 bg-surface-2 rounded w-full animate-pulse" />
                                        <div className="h-3 bg-surface-2 rounded w-5/6 animate-pulse" />
                                        <div className="h-3 bg-surface-2 rounded w-4/6 animate-pulse" />
                                    </div>
                                ) : narrative ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-5">
                                        {narrative.split('\n').filter(line => line.trim()).map((line, i) => {
                                            const cleaned = line.replace(/^\d+\.\s*/, '').trim();
                                            const colonIndex = cleaned.indexOf(':');
                                            const rawHeading = colonIndex > 0 ? cleaned.slice(0, colonIndex).trim() : '';
                                            const description = colonIndex > 0 ? cleaned.slice(colonIndex + 1).trim() : cleaned;
                                            const heading = rawHeading && !/^insight\b/i.test(rawHeading) ? rawHeading : 'Key Insight';
                                            return (
                                                <div key={i} className="flex gap-3 items-start">
                                                    <span className="text-2xl leading-8 font-extrabold text-primary/30">{String(i + 1).padStart(2, '0')}</span>
                                                    <div className="text-sm leading-6 text-muted-foreground">
                                                        <p className="font-semibold text-foreground">{heading}:</p>
                                                        <p>{description}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-6 text-center">
                                        <p className="text-sm text-muted-foreground mb-4 italic">
                                            No insights generated yet. Get a high-level summary of your data.
                                        </p>
                                        <BtnAccent onClick={handleGenerateInsight} className="group">
                                            <Sparkles className="h-3 w-3 mr-2" />
                                            Generate Insight
                                        </BtnAccent>
                                    </div>
                                )}
                            </div>
                        </Panel>

                        {/* Tab Switcher: Key Insights / All Columns */}
                        {chartSections.length > 0 && (
                            <div className="flex items-center gap-1 mb-2 px-1">
                                <button
                                    onClick={() => { setAllColumnsTab(false); setAllColumnsPage(0); }}
                                    className={`px-4 py-1.5 text-[13px] font-semibold rounded-full transition-colors ${!allColumnsTab ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-surface'}`}
                                >
                                    Key Insights
                                </button>
                                <button
                                    onClick={() => { setAllColumnsTab(true); setAllColumnsPage(0); }}
                                    className={`px-4 py-1.5 text-[13px] font-semibold rounded-full transition-colors ${allColumnsTab ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-surface'}`}
                                >
                                    All Columns
                                    {analytics?.all_columns_count ? (
                                        <span className="ml-1.5 text-[11px] opacity-70">({analytics.all_columns_count})</span>
                                    ) : null}
                                </button>
                            </div>
                        )}

                        {/* All Columns View (paginated grid of mini-charts) */}
                        {allColumnsTab && analytics?.all_columns_charts && (
                            <div className="space-y-4">
                                {(() => {
                                    const allColEntries = Object.entries(analytics.all_columns_charts);
                                    const totalPages = Math.max(1, Math.ceil(allColEntries.length / ALL_COLUMNS_PAGE_SIZE));
                                    const safePage = Math.min(allColumnsPage, totalPages - 1);
                                    const pageItems = allColEntries.slice(safePage * ALL_COLUMNS_PAGE_SIZE, (safePage + 1) * ALL_COLUMNS_PAGE_SIZE);
                                    return (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {pageItems.map(([id, chart]: [string, any]) => (
                                                    <Panel key={`${selectedVersionId}-all-${id}`}>
                                                        <PanelHeader title={chart.title || `Column ${id}`} actions={renderChartActions({ ...chart, id })} />
                                                        <div className="p-3">
                                                            <ChartRenderer
                                                                chart={{
                                                                    ...chart,
                                                                    id,
                                                                    data: chartData?.[id] || chart.data,
                                                                    type: chart_overrides[id]?.type || chart.type
                                                                }}
                                                                chartColors={chartColors}
                                                                isDark={isDark}
                                                                onFilterClick={handleChartFilterClick}
                                                                targetColumn={analytics?.target_column}
                                                                quickReact={quickReactCharts}
                                                            />
                                                        </div>
                                                    </Panel>
                                                ))}
                                            </div>
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-center gap-2 pt-2 pb-6">
                                                    <button
                                                        onClick={() => setAllColumnsPage(p => Math.max(0, p - 1))}
                                                        disabled={safePage === 0}
                                                        className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface transition-colors"
                                                    >
                                                        Previous
                                                    </button>
                                                    {Array.from({ length: totalPages }, (_, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setAllColumnsPage(i)}
                                                            className={`w-8 h-8 text-[12px] font-semibold rounded-lg transition-colors ${i === safePage ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-surface'}`}
                                                        >
                                                            {i + 1}
                                                        </button>
                                                    ))}
                                                    <button
                                                        onClick={() => setAllColumnsPage(p => Math.min(totalPages - 1, p + 1))}
                                                        disabled={safePage >= totalPages - 1}
                                                        className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface transition-colors"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Key Insights View (curated domain-specific charts) */}
                        {!allColumnsTab && chartSections.length > 0 && (
                            <div className="space-y-12">
                                {chartSections.map(({ title, charts }, groupIdx) => (
                                    <div key={title} className="space-y-6">
                                        {/* Thematic Group Header */}
                                        <div className="p-4 px-5 rounded-xl bg-bg-card border-l-4 border-themed-main flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-xs border border-border-main">
                                            <div>
                                                <h3 className="font-mono text-xs sm:text-sm font-black tracking-wider text-themed-main uppercase">
                                                    {title}
                                                </h3>
                                                <p className="text-xs text-themed-muted font-sans mt-0.5">
                                                    Thematic visualization insights computed from live telemetry.
                                                </p>
                                            </div>
                                            <span className="text-[10px] font-mono bg-themed-main/10 text-themed-main px-2 py-0.5 rounded font-extrabold self-start sm:self-auto leading-none">
                                                {charts.length} {charts.length === 1 ? 'chart' : 'charts'}
                                            </span>
                                        </div>

                                        {/* Grid mapping for Thematic Charts */}
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 w-full">
                                            {charts.map((chart, chartIdx) => {
                                                const streamedChart = streamedCharts[chart.id];
                                                const resolvedData = (hasInteractiveScope ? undefined : streamedChart?.data) ?? chart.data;
                                                if (!resolvedData && !isLoading) return <div key={chart.id} className="lg:col-span-2 md:col-span-3 col-span-1"><ChartSkeleton isDark={isDark} /></div>;

                                                const spanClass = charts.length === 5
                                                    ? (chartIdx === 0 || chartIdx === 1 ? "lg:col-span-3 md:col-span-3 col-span-1" : chartIdx === 4 ? "lg:col-span-2 md:col-span-6 col-span-1" : "lg:col-span-2 md:col-span-3 col-span-1")
                                                    : charts.length === 1
                                                    ? "lg:col-span-6 md:col-span-6 col-span-1"
                                                    : charts.length === 2
                                                    ? "lg:col-span-3 md:col-span-3 col-span-1"
                                                    : charts.length === 3
                                                    ? "lg:col-span-2 md:col-span-2 col-span-1"
                                                    : charts.length === 4
                                                    ? "lg:col-span-3 md:col-span-3 col-span-1"
                                                    : (chartIdx % 5 === 0 || chartIdx % 5 === 1 ? "lg:col-span-3 md:col-span-3 col-span-1" : chartIdx % 5 === 4 ? "lg:col-span-2 md:col-span-6 col-span-1" : "lg:col-span-2 md:col-span-3 col-span-1");

                                                return (
                                                    <div key={`${selectedVersionId}-insight-${chart.id}`} className={spanClass}>
                                                        <Panel>
                                                            <PanelHeader title={chart.title || `Insight ${chart.id}`} actions={renderChartActions(chart)} />
                                                            <div className="p-4">
                                                                <ChartRenderer
                                                                    chart={{ ...chart, data: resolvedData, type: chart_overrides[chart.id]?.type || chart.type }}
                                                                    chartColors={chartColors}
                                                                    isDark={isDark}
                                                                    onFilterClick={handleChartFilterClick}
                                                                    targetColumn={analytics?.target_column}
                                                                    quickReact={quickReactCharts}
                                                                />
                                                            </div>
                                                        </Panel>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {analytics && (
                <div className="sticky bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-5 py-2.5">
                        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-success" />Schema valid · {totalColumnsCount || 0} columns typed
                            </span>
                            <span className="text-border">·</span>
                            <span>3 inferences pending review</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <BtnGhost onClick={handleOpenRemap}><Wand2 className="h-3 w-3" />Remap values</BtnGhost>
                            <BtnSecondary onClick={() => setClassifierOpen(true)}>Column classifier</BtnSecondary>
                            <BtnAccent onClick={handleGenerateInsight} className="group">
                                <Sparkles className="h-3 w-3 mr-2" />
                                Generate Insight
                            </BtnAccent>
                        </div>
                    </div>
                </div>
            )}

            {isRemapModalOpen && (
                <RemapModal
                    datasetId={selectedDatasetId || ''}
                    versionId={remapVersionId || ''}
                    currentMappings={remapCurrentMappings || {}}
                    onConfirm={handleConfirmRemap}
                    onCancel={() => setIsRemapModalOpen(false)}
                />
            )}
            {isDiffModalOpen && (
                <VersionDiffModal
                    isOpen={isDiffModalOpen}
                    onClose={() => setIsDiffModalOpen(false)}
                    previousMap={versionDiffData.prev}
                    currentMap={versionDiffData.curr}
                />
            )}

            {classifierOpen && analytics?.columns && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
                    onClick={() => setClassifierOpen(false)}
                >
                    <div
                        className="flex w-full max-w-5xl max-h-[90vh] flex-col bg-surface rounded-3xl shadow-2xl border border-border overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b border-border px-6 py-5">
                            <div>
                                <h3 className="text-[18px] font-bold">Column classifier</h3>
                                <p className="mt-1 text-[13px] text-muted-foreground">Auto-typed by Vizzy Pilot · review & override</p>
                            </div>
                            <button onClick={() => setClassifierOpen(false)} className="rounded-full p-2 hover:bg-surface-2 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                            <ColumnClassificationPanel columns={analytics.columns} isDark={isDark} proposals={proposals} />
                        </div>
                    </div>
                </div>
            )}

            {isJoinBuilderOpen && selectedDatasetId && (
                <JoinBuilder
                    datasetId={selectedDatasetId}
                    onClose={() => setIsJoinBuilderOpen(false)}
                    onApplySuccess={() => {
                        setIsJoinBuilderOpen(false);
                        if (versionId) {
                            triggerAutoRender(versionId);
                        }
                    }}
                />
            )}


        </div>
    );
}
