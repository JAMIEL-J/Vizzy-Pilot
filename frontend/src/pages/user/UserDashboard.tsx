// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { datasetService } from '../../lib/api/dataset';
import { analyticsService, correlationService, narrativeService, type DashboardAnalytics, type CorrelationMatrix } from '../../lib/api/dashboard';
import GeoMapCard from './GeoMapCard';
import SettingsDropdown from '../../components/common/SettingsDropdown';
import { useFilterStore } from '../../store/useFilterStore';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, BubbleController,
  Title, Tooltip as ChartTooltip, Legend as ChartLegend, Filler
} from 'chart.js';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';
import { Bar, Line, Pie, Scatter, Radar, Bubble, PolarArea, Chart as ReactChart } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, BubbleController, TreemapController, TreemapElement,
  Title, ChartTooltip, ChartLegend, Filler
);
import { ColumnClassificationPanel } from '../../components/dashboard/ColumnClassificationPanel';
import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton';
import { Button } from '@/components/ui/button';
import { VIZZY_THEME } from '../../theme/tokens';

type CachedEntry<T> = {
    value: T;
    createdAt: number;
};

const DASHBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
const DASHBOARD_SESSION_CACHE_KEY = 'vizzy.dashboard.analyticsCache.v2';
const DASHBOARD_CACHE_SCHEMA_VERSION = 'v3';
const SHOW_CORRELATION_CHART = false;

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
            value,
        };

        // Bound stored keys to avoid unbounded session growth.
        const entries = Object.entries(all).sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0));
        const trimmed = Object.fromEntries(entries.slice(0, 25));
        sessionStorage.setItem(DASHBOARD_SESSION_CACHE_KEY, JSON.stringify(trimmed));
    } catch {
        // Best-effort cache only.
    }
};

// ─── Color Palettes ──────────────────────────────────────────────────────────

const CHART_COLORS = ['#f59e0b', '#6366f1', '#10b981', '#f43f5e', '#14b8a6', '#8b5cf6', '#0ea5e9', '#ea580c'];
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

// ─── Dark Tooltip ─────────────────────────────────────────────────────────────

const ThemedTooltip = ({ active, payload, label, formatter, chartTitle, valueLabel, formatType }: any) => {
    if (!active || !payload?.length) return null;

    const fp = payload[0]?.payload;
    if (fp?.xLabel && fp?.yLabel) {
        const isCurrencyLabel = (text: string) => {
            const lower = String(text || '').toLowerCase();
            return ['revenue', 'cost', 'costs', 'spend', 'budget', 'income', 'sales', 'profit', 'payment', 'charge', 'charges', 'price', 'amount', 'roi', 'roas'].some((kw) => lower.includes(kw));
        };

        const isPercentLabel = (text: string) => {
            const lower = String(text || '').toLowerCase();
            return ['rate', 'percent', 'percentage', 'pct', 'ctr', 'cvr', 'ratio', 'margin'].some((kw) => lower.includes(kw));
        };

        const isCountLabel = (text: string) => {
            const lower = String(text || '').toLowerCase();
            return ['click', 'count', 'record', 'records', 'orders', 'order', 'customers', 'units', 'qty', 'quantity', 'volume', 'visits', 'sessions', 'impressions', 'views'].some((kw) => lower.includes(kw));
        };

        const fmtS = (v: number, lbl: string) => {
            if (formatter) return formatter(v, lbl);
            const lblLower = lbl.toLowerCase();
            const isTimeVariant = ['tenure', 'age', 'duration', 'months', 'years', 'days'].some(k => lblLower.includes(k));
            const isPct = isPercentLabel(lbl) || lbl.includes('%') || (formatType === 'percentage' && !isCountLabel(lbl));
            const isCur = !isPct && (isCurrencyLabel(lbl) || (formatType === 'currency' && !isCountLabel(lbl) && !isTimeVariant));

            if (isCur) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
            if (isPct) return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
            if (isTimeVariant) return Math.round(v).toLocaleString();
            return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
        };
        return (
            <div className="rounded-sm px-4 py-3 border border-border-main backdrop-blur-md min-w-[160px] bg-bg-card/95 dark:bg-black/95 shadow-xl text-themed-main font-serif tracking-wide z-[9999]">
                {chartTitle && <p className="text-[10px] uppercase font-bold tracking-widest mb-2 pb-2 border-b border-border-main opacity-70 leading-tight">{chartTitle}</p>}
                {fp.label && <p className="text-[10px] opacity-60 mb-2 pb-2 border-b border-border-main font-bold uppercase tracking-widest">{fp.label}</p>}
                <div className="space-y-1.5">
                    <p className="text-sm flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: VIZZY_THEME.primary }} /><span className="opacity-70 text-[10px] tracking-widest uppercase">{fp.xLabel}:</span></span>
                        <span className="font-bold text-primary">{fmtS(fp.x, fp.xLabel)}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: VIZZY_THEME.secondary }} /><span className="opacity-70 text-[10px] tracking-widest uppercase">{fp.yLabel}:</span></span>
                        <span className="font-bold text-primary">{fmtS(fp.y, fp.yLabel)}</span>
                    </p>
                </div>
            </div>
        );
    }

    let metricName = "Value";
    let dimensionName = "Category";

    // If backend provided an explicit value_label (e.g. "Orders", "Customers"), use it
    if (valueLabel) {
        const lowerValueLabel = String(valueLabel).toLowerCase().trim();
        const lowerTitle = String(chartTitle || '').toLowerCase();
        metricName = lowerValueLabel === 'days' && lowerTitle.includes('age') ? 'Age' : valueLabel;
    }

    if (chartTitle) {
        const parts = chartTitle.split(/ by | per /i);
        if (parts.length === 2) {
            if (!valueLabel) metricName = parts[0].trim();
            dimensionName = parts[1].trim();
        } else {
            const titleLower = chartTitle.toLowerCase();
            // Extract dimension from title patterns like "State Breakdown", "City Distribution"
            const extractDim = (suffix: RegExp) => chartTitle.replace(suffix, '').trim() || dimensionName;

            if (titleLower.includes('breakdown')) {
                dimensionName = extractDim(/ breakdown/i);
            } else if (titleLower.includes('distribution')) {
                dimensionName = extractDim(/ distribution/i);
            } else if (titleLower.includes('overview')) {
                dimensionName = extractDim(/ overview/i);
            } else {
                if (!valueLabel) metricName = chartTitle;
            }
        }
    }

    // Pie/Donut charts do not pass `label` to Tooltip, and they set payload[0].name to the slice name (e.g. "California")
    let displayLabel = label;
    let displayPayload = payload;

    if (!displayLabel && payload && payload.length === 1 && typeof payload[0].name === 'string' && payload[0].name !== 'value') {
        displayLabel = payload[0].name;
        displayPayload = [{ ...payload[0], name: metricName }];
    } else if (payload) {
        displayPayload = payload.map((p: any) => ({
            ...p,
            name: (p.name === 'value' || !p.name) ? metricName : p.name
        }));
    }


    return (
        <div className="rounded-sm px-4 py-3 border border-border-main backdrop-blur-md min-w-[160px] bg-bg-card/95 dark:bg-black/95 shadow-xl text-themed-main z-[9999]" style={{ fontFamily: '"Be Vietnam Pro", sans-serif' }}>
            {chartTitle && <p className="text-[10px] uppercase font-bold tracking-widest mb-2 pb-2 border-b border-border-main opacity-70 leading-tight">{chartTitle}</p>}

            {displayLabel && (
                <div className="mb-2">
                    <p className="text-[10px] opacity-50 uppercase tracking-widest mb-0.5">{dimensionName}</p>
                    <p className="text-sm font-bold truncate max-w-[200px] text-primary">{displayLabel}</p>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {displayPayload.map((p: any, i: number) => {
                    return (
                        <div key={i} className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-sm inline-block shadow-[0_0_5px_currentColor]" style={{ background: p.color || p.fill || CHART_COLORS[0] }} />
                                <span className="text-[10px] tracking-widest uppercase opacity-70 whitespace-nowrap">{p.name}:</span>
                            </div>
                            <span className="text-sm font-bold tabular-nums text-themed-main group-hover:text-primary transition-colors">
                                {formatter
                                    ? formatter(p.value, p.name)
                                    : typeof p.value === 'number'
                                        ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                        : p.value}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KPICard = ({ title, value, icon, trend, trend_label, subtitle, cardColor, index = 0 }: { title: string; value: string; icon?: string; trend?: number; trend_label?: string; subtitle?: string; cardColor: string, index?: number }) => {
    // Map backend icons instantly to SVG nodes to guarantee rendering rather than relying on Web Fonts
    const getSvgIcon = (i?: string, idx = 0) => {
        const icons = [
            /* payments */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm320-80q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-80q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520q17 0 28.5 11.5T520-480q0 17-11.5 28.5T480-400Zm0-80Z"/></svg>,
            /* shopping_cart */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M280-80q-33 0-56.5-23.5T200-160q0-33 23.5-56.5T280-240q33 0 56.5 23.5T360-160q0 33-23.5 56.5T280-80Zm400 0q-33 0-56.5-23.5T600-160q0-33 23.5-56.5T680-240q33 0 56.5 23.5T760-160q0 33-23.5 56.5T680-80ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 32.5 16.5T810-745L692-532q-11 20-29.5 31T622-490H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z"/></svg>,
            /* receipt_long */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80l-80-80v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640l-80 80-80-80-80 80-80-80-80 80-80-80-80 80Zm0-163 40-40 80 80 80-80 80 80 80-80 80 80 80-80 40 40v-557H240v557Zm-80 43v-600 600Z"/></svg>,
            /* analytics */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M280-280h80v-200h-80v200Zm160 0h80v-400h-80v400Zm160 0h80v-120h-80v120ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>
        ];
        
        if (i === 'dollar') return icons[0];
        if (i === 'users' || i === 'group') return <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-240v-32q0-34 17.5-62.5T224-378q92-42 189-42t189 42q29 14 46.5 42.5T666-272v32q0 33-23.5 56.5T586-160H240q-33 0-56.5-23.5T160-240Zm80 0h400v-32q0-11-5.5-20T620-306q-71-34-140-34t-140 34q-10 6-15 14.5t-5 19.5v32Z"/></svg>;
        if (i === 'percent') return icons[3];
        if (i === 'cart') return icons[1];
        if (i === 'receipt') return icons[2];
        return icons[idx % icons.length];
    };
    
    const svgNode = getSvgIcon(icon, index);

    // Compact KPI values by magnitude so cards stay readable on any dataset.
    const formatCompactValue = (valStr: string) => {
        if (!valStr) return '';

        const trimmed = String(valStr).trim();
        if (!trimmed) return '';

        // Preserve already-labeled values such as percentages or preformatted strings.
        if (/[a-zA-Z%]$/.test(trimmed)) return trimmed;

        const isCurrency = trimmed.includes('$');
        const rawNum = parseFloat(trimmed.replace(/[^0-9.-]+/g, ''));
        if (Number.isNaN(rawNum)) return trimmed;

        const absValue = Math.abs(rawNum);
        const sign = rawNum < 0 ? '-' : '';

        const compact = (value: number, divisor: number, suffix: string) => {
            const scaled = value / divisor;
            const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
            const body = String(Number(scaled.toFixed(decimals)));
            return `${sign}${isCurrency ? '$' : ''}${body}${suffix}`;
        };

        if (absValue >= 1_000_000_000_000) return compact(absValue, 1_000_000_000_000, 'T');
        if (absValue >= 1_000_000_000) return compact(absValue, 1_000_000_000, 'B');
        if (absValue >= 1_000_000) return compact(absValue, 1_000_000, 'M');
        if (absValue >= 1_000) return compact(absValue, 1_000, 'K');

        return isCurrency
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(rawNum)
            : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(rawNum);
    };

    const finalValue = formatCompactValue(String(value ?? ''));

    // Dynamic Font Sizing for long numbers (remaining cases)
    const valueSizeClass = finalValue.length >= 13
        ? 'text-2xl'
        : 'text-3xl sm:text-4xl';

    // Trend logic
    const isPositive = trend !== undefined && trend > 0;
    const isNegative = trend !== undefined && trend < 0;
    const trendIcon = isPositive ? 'trending_up' : isNegative ? 'trending_down' : 'remove';
    const trendText = trend !== undefined ? `${Math.abs(trend)}%` : '';
    const trendCaption = trend_label || subtitle || (trend !== undefined ? 'vs last month' : '');
    // Remove the unicode arrows if backend sends them since we have our own Material Symbol font icon now
    const badgeTextCleaned = (trendText ? `${trendText} ${trendCaption}` : trendCaption).replace(/^[⤵⤴]\s*/, '').trim();

    const isLightCard = cardColor.toLowerCase() === '#f8a010';
    const textColor = isLightCard ? '#111827' : '#ffffff';
    const badgeBg = isLightCard ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const badgeColor = isLightCard ? '#111827' : '#ffffff';
    // Set explicit watermark color to ensure contrast
    const watermarkColor = isLightCard ? 'rgba(17,24,39,0.15)' : 'rgba(255,255,255,0.15)';

    return (
        <div className="rounded-xl p-6 relative overflow-hidden group shadow-xl" style={{ background: cardColor, color: textColor, boxShadow: `0 20px 25px -5px ${cardColor}33, 0 8px 10px -6px ${cardColor}33` }}>
            <div className="absolute -right-4 -bottom-4 group-hover:scale-110 transition-transform duration-500" style={{ color: watermarkColor }}>
                {svgNode}
            </div>
            
            <p className="text-xs uppercase tracking-widest font-bold opacity-80 mb-2 relative z-10 font-['DM_Sans',sans-serif]">
                {title}
            </p>
            <h2 className={`${valueSizeClass} font-black mb-4 relative z-10 font-['DM_Sans',sans-serif] whitespace-nowrap tracking-tight`}>
                {finalValue}
            </h2>
            
            { badgeTextCleaned && (
                <div className="relative z-10 flex items-center gap-2 text-xs backdrop-blur w-fit px-2 py-1 rounded-full font-semibold max-w-full font-['Be_Vietnam_Pro',sans-serif]" style={{ background: badgeBg, color: badgeColor }}>
                    {trend !== undefined && <span className="material-symbols-outlined text-[14px] shrink-0">{trendIcon}</span>}
                    <span className="truncate">{badgeTextCleaned}</span>
                </div>
            )}
        </div>
    );
};

// ─── Chart Card Wrapper ───────────────────────────────────────────────────────

const ChartCard = ({ title, children, className, actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) => (
    <div className={`bg-white dark:bg-[#17181b] border border-[#e4e4e7] dark:border-[#2a2d33] rounded-3xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] h-full flex flex-col ${className || ''}`}>
        <div className="flex flex-col items-center gap-2 mb-5 flex-shrink-0 w-full">
            <h4 className="text-[15px] font-semibold text-[#2d2f2f] dark:text-[#eceff4] text-center leading-snug w-full">{title}</h4>
            {actions ? (
                <div className="relative z-10 flex gap-2 items-center justify-center w-full">{actions}</div>
            ) : (
                <div className="flex gap-2 relative z-10 justify-center w-full">
                    <button className="p-1.5 hover:bg-[#f2f3f3] dark:hover:bg-[#262931] rounded-lg transition-colors"><span className="material-symbols-outlined text-sm text-[#5a5c5c] dark:text-[#b9bec9]">refresh</span></button>
                    <button className="p-1.5 hover:bg-[#f2f3f3] dark:hover:bg-[#262931] rounded-lg transition-colors"><span className="material-symbols-outlined text-sm text-[#5a5c5c] dark:text-[#b9bec9]">ios_share</span></button>
                    <button className="p-1.5 hover:bg-[#f2f3f3] dark:hover:bg-[#262931] rounded-lg transition-colors"><span className="material-symbols-outlined text-sm text-[#5a5c5c] dark:text-[#b9bec9]">more_vert</span></button>
                </div>
            )}
        </div>
        <div className="flex-1 min-h-0 w-full flex flex-col justify-end">
            {children}
        </div>
    </div>
);

// (Axis defaults moved inside component for dynamic themes)

// ─── ChartRenderer ────────────────────────────────────────────────────────────

const ChartRenderer = ({
    chart,
    chartColors,
    isDark,
    onFilterClick,
    targetColumn,
    quickReact,
}: {
    chart: any;
    chartColors: any;
    isDark: boolean;
    onFilterClick?: (col: string, val: string) => void;
    targetColumn?: string | null;
    quickReact?: boolean;
}) => {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [showOutliers, setShowOutliers] = useState(true);
    const [treemapTip, setTreemapTip] = useState<{ x: number; y: number; name: string; value: number } | null>(null);
    const treemapRef = useRef<HTMLDivElement>(null);

    const rawChartData = showOutliers ? chart?.data : (chart?.data_without_outliers || chart?.data);

    const gridProps = { stroke: chartColors.grid, strokeDasharray: '2 6' };
    const axisProps = { stroke: chartColors.axis, fontSize: 10, tickLine: false, axisLine: false };
    const textStyle = { fill: chartColors.text };
    const polishedPalette = isDark
        ? ['#f59e0b', '#6366f1', '#10b981', '#f43f5e', '#14b8a6', '#8b5cf6']
        : ['#f59e0b', '#6366f1', '#22c55e', '#f43f5e', '#14b8a6', '#8b5cf6'];
    const chartColorSeed = String(chart?.id ?? chart?.chart_id ?? chart?.title ?? chart?.metric ?? chart?.dimension ?? chart?.type ?? 'chart');
    const safeChartId = chartColorSeed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chart';
    const baseColorIndex = Array.from(chartColorSeed).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 0) % polishedPalette.length;
    const getPaletteColor = (index: number) => polishedPalette[(baseColorIndex + index) % polishedPalette.length];

    if (!rawChartData?.length) {
        return (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-themed-muted dark:text-gray-600">
                <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className="text-sm">No data for current filter</span>
            </div>
        );
    }

    // Currency and rate detection
    const chartTitleLower = (chart.title || '').toLowerCase();
    const formatType = chart?.format_type;
    const isChartExplicitPercent = formatType === 'percentage' || formatType === 'percent';
    const isPercent = isChartExplicitPercent || (!formatType && (chartTitleLower.includes('rate') || chartTitleLower.includes('%')));

    const countLikeMetricTokens = [
        'record', 'records', 'count', 'orders', 'order', 'customers', 'units', 'qty', 'quantity', 'volume',
        'click', 'clicks', 'impression', 'impressions', 'view', 'views', 'session', 'sessions', 'visit', 'visits'
    ];
    const isCountLikeMetric = (label?: string) => {
        const token = String(label || '').toLowerCase();
        return countLikeMetricTokens.some((kw) => token.includes(kw));
    };

    const isCurrencyMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        return ['revenue', 'cost', 'costs', 'spend', 'budget', 'income', 'sales', 'profit', 'payment', 'charge', 'charges', 'price', 'amount', 'roi', 'roas'].some((kw) => token.includes(kw));
    };

    const isPercentMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        return ['rate', 'percent', 'percentage', 'pct', 'ctr', 'cvr', 'ratio', 'margin'].some((kw) => token.includes(kw));
    };

    const isWholeNumberMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        return ['tenure', 'age', 'duration', 'month', 'months', 'year', 'years', 'day', 'days', 'los', 'length of stay', 'lengthofstay']
            .some((kw) => token.includes(kw));
    };

    const compactNumber = (value: number, currency = false) => {
        const absValue = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        const formatCompact = (divisor: number, suffix: string) => {
            const scaled = absValue / divisor;
            const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
            const body = String(Number(scaled.toFixed(decimals)));
            return `${sign}${currency ? '$' : ''}${body}${suffix}`;
        };

        if (absValue >= 1_000_000_000_000) return formatCompact(1_000_000_000_000, 'T');
        if (absValue >= 1_000_000_000) return formatCompact(1_000_000_000, 'B');
        if (absValue >= 1_000_000) return formatCompact(1_000_000, 'M');
        if (absValue >= 1_000) return formatCompact(1_000, 'K');

        return currency
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
            : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
    };

    const formatByLabel = (value: any, metricLabel?: string, fallbackChartLevel = true): string => {
        if (typeof value !== 'number') return String(value ?? '');
        const rawLabel = String(metricLabel || '').trim();
        const label = rawLabel.toLowerCase();
        const chartLevelLabel = String(chart.value_label || chart.metric || chart.title || '').toLowerCase();

        if (isPercentMetricLabel(label) || label.includes('%') || (fallbackChartLevel && (isChartExplicitPercent || (!label && isPercent)))) {
            const pctValue = Math.abs(value) <= 1 ? value * 100 : value;
            return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(pctValue)}%`;
        }

        if (isCurrencyMetricLabel(label) || (!label && fallbackChartLevel && formatType === 'currency')) {
            return compactNumber(value, true);
        }

        if (isWholeNumberMetricLabel(label) || (fallbackChartLevel && isWholeNumberMetricLabel(chartLevelLabel))) {
            return new Intl.NumberFormat('en-US', {
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 0,
            }).format(Math.round(value));
        }

        return compactNumber(value, false);
    };

    const fmtVal = (v: any, metricLabel?: string): string => {
        if (isCountLikeMetric(metricLabel)) {
            return compactNumber(Number(v), false);
        }
        const hasMetricLabel = !!String(metricLabel || '').trim();
        const chartLevelPercentFallback = isPercent
            && !isCurrencyMetricLabel(metricLabel)
            && !isWholeNumberMetricLabel(metricLabel)
            && !isCountLikeMetric(metricLabel);
        return formatByLabel(v, metricLabel, !hasMetricLabel || chartLevelPercentFallback);
    };

    const fmtTick = (v: any, metricLabel?: string): string => {
        if (typeof v !== 'number') return String(v ?? '');
        const hasMetricLabel = !!String(metricLabel || '').trim();
        const chartLevelPercentFallback = isPercent
            && !isCurrencyMetricLabel(metricLabel)
            && !isWholeNumberMetricLabel(metricLabel)
            && !isCountLikeMetric(metricLabel);
        return formatByLabel(v, metricLabel, !hasMetricLabel || chartLevelPercentFallback);
    };

    const formatCenterTotal = (total: number): string => {
        return formatByLabel(total, chart.value_label || chart.metric || chart.title, true);
    };

    const formatMonthYearLabel = (value: any): string => {
        const raw = String(value ?? '').trim();
        if (!raw) return raw;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    // Auto-detect label key from first data row
    const firstRow = rawChartData[0] || {};
    const nameKey = 'name' in firstRow ? 'name'
        : Object.keys(firstRow).find(k => typeof firstRow[k] === 'string') || 'name';
    const dateKey = 'timestamp' in firstRow ? 'timestamp' : ('date' in firstRow ? 'date' : nameKey);

    // The column name this chart represents (for filtering)
    // Often passed by backend as chart.x_axis or chart.dimension
    const filterCol = chart.dimension || chart.x_axis || nameKey;

    const normalizeColumn = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isTargetSemanticChart = !!(
        targetColumn && (
            normalizeColumn(String(filterCol)) === normalizeColumn(String(targetColumn))
            || normalizeColumn(String(chart?.dimension || '')) === normalizeColumn(String(targetColumn))
            || /churned\s*vs\s*retained|exited\s*vs\s*stayed|attrited\s*vs\s*retained/i.test(String(chart?.title || ''))
        )
    );

    const semanticChartData = isTargetSemanticChart
        ? rawChartData.map((row: any) => {
            const rawName = row?.[nameKey];
            if (!isBinaryTargetValue(String(rawName ?? ''))) return row;
            return {
                ...row,
                [nameKey]: formatTargetTabLabel(String(rawName), targetColumn || undefined),
            };
        })
        : rawChartData;

    const seriesIgnoreKeys = new Set(
        [
            String(nameKey || ''),
            String(dateKey || ''),
            'name',
            'label',
            'timestamp',
            'date',
            'x',
            'y',
            'r',
            'id',
            'value',
        ].map((k) => k.toLowerCase())
    );

    const inferStackedSeriesKeys = (rows: any[]): string[] => {
        if (Array.isArray(chart?.categories) && chart.categories.length > 0) {
            return chart.categories.filter((k: any) => typeof k === 'string' && k.trim().length > 0);
        }
        const first = rows.find((r: any) => r && typeof r === 'object') || {};
        return Object.keys(first).filter((k) => {
            if (seriesIgnoreKeys.has(String(k).toLowerCase())) return false;
            return Number.isFinite(Number(first[k]));
        });
    };

    const stackedSeriesKeys = inferStackedSeriesKeys(semanticChartData);

    const normalizeSeriesKey = (value: any): string => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const positiveSeriesTokens = ['positive', 'exited', 'churned', 'attrited', 'left', 'cancelled', 'canceled', 'defaulted'];
    const negativeSeriesTokens = ['negative', 'retained', 'stayed', 'active', 'performing'];

    const getRowNumericSeriesKeys = (row: any): string[] => Object.keys(row || {}).filter((k) => {
        if (seriesIgnoreKeys.has(String(k).toLowerCase())) return false;
        return Number.isFinite(Number(row?.[k]));
    });

    const findSeriesKeyInRow = (row: any, requestedKey: string, seriesIndex: number): string | null => {
        if (!row || typeof row !== 'object') return null;

        if (requestedKey in row) return requestedKey;

        const reqNorm = normalizeSeriesKey(requestedKey);
        const rowKeys = Object.keys(row);

        const caseInsensitive = rowKeys.find((k) => String(k).toLowerCase() === String(requestedKey).toLowerCase());
        if (caseInsensitive) return caseInsensitive;

        const normalizedMatch = rowKeys.find((k) => normalizeSeriesKey(k) === reqNorm);
        if (normalizedMatch) return normalizedMatch;

        const numericKeys = getRowNumericSeriesKeys(row);
        const hasPositiveSemantic = positiveSeriesTokens.some((t) => reqNorm.includes(t));
        const hasNegativeSemantic = negativeSeriesTokens.some((t) => reqNorm.includes(t));

        if (hasPositiveSemantic) {
            const positiveKey = numericKeys.find((k) => positiveSeriesTokens.some((t) => normalizeSeriesKey(k).includes(t)));
            if (positiveKey) return positiveKey;
        }

        if (hasNegativeSemantic) {
            const negativeKey = numericKeys.find((k) => negativeSeriesTokens.some((t) => normalizeSeriesKey(k).includes(t)));
            if (negativeKey) return negativeKey;
        }

        if (seriesIndex >= 0 && seriesIndex < numericKeys.length) {
            return numericKeys[seriesIndex];
        }

        return null;
    };

    const getSeriesValue = (row: any, requestedKey: string, seriesIndex: number): number => {
        const resolvedKey = findSeriesKeyInRow(row, requestedKey, seriesIndex);
        const n = Number(resolvedKey ? row?.[resolvedKey] : undefined);
        return Number.isFinite(n) ? n : 0;
    };

    const chartData = semanticChartData.map((row: any) => {
        const explicitValue = Number(row?.value);
        if (Number.isFinite(explicitValue)) {
            return { ...row, value: explicitValue };
        }

        if (stackedSeriesKeys.length > 0) {
            const stackedTotal = stackedSeriesKeys.reduce((sum, key, idx) => {
                return sum + getSeriesValue(row, key, idx);
            }, 0);
            return { ...row, value: stackedTotal };
        }

        const firstNumericKey = Object.keys(row || {}).find((k) => {
            if (seriesIgnoreKeys.has(String(k).toLowerCase())) return false;
            return Number.isFinite(Number(row?.[k]));
        });

        if (firstNumericKey) {
            return { ...row, value: Number(row[firstNumericKey]) };
        }

        return { ...row, value: 0 };
    });

    const normalizeLabel = (value: any): string => {
        if (value === null || value === undefined || value === '') return 'Unknown';

        const asText = String(value).trim();
        const asNumber = Number(asText);
        const isNumericLabel = Number.isFinite(asNumber);
        const normalizedFilter = normalizeColumn(String(filterCol || ''));

        if (isNumericLabel) {
            if (normalizedFilter.includes('contracttype') || chartTitleLower.includes('contract type')) {
                if (asNumber === 0) return 'Month-to-month';
                if (asNumber === 1) return 'One year';
                if (asNumber === 2) return 'Two year';
            }
            if (normalizedFilter.includes('gender')) {
                if (asNumber === 0) return 'Female';
                if (asNumber === 1) return 'Male';
            }
        }

        const booleanDisplay = formatBooleanLikeLabel(asText);
        if (booleanDisplay !== asText) return booleanDisplay;

        return asText;
    };

    const categoryLabels = chartData.map((d: any) => normalizeLabel(d?.[nameKey] ?? d?.name ?? d?.label));
    const categoryTickInterval = Math.max(1, Math.ceil(Math.max(1, categoryLabels.length) / 6));

    const isLikelyDateLabel = (raw: string): boolean => {
        const value = String(raw || '').trim();
        if (!value) return false;
        if (/\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(value)) return true;
        if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(value)) return true;
        return false;
    };

    const isTemporalXAxis = ['line', 'area', 'stacked'].includes(String(chart.type || '').toLowerCase())
        || /date|time|month|year|week|day/i.test(String(chart.x_axis || chart.dimension || nameKey || ''))
        || categoryLabels.some((label) => isLikelyDateLabel(label));

    const temporalTickInterval = Math.max(1, Math.ceil(Math.max(1, categoryLabels.length) / 5));
    const effectiveCategoryTickInterval = isTemporalXAxis ? temporalTickInterval : categoryTickInterval;

    const formatCategoryTick = (label: string, options?: { truncate?: boolean; temporal?: boolean }): string => {
        const temporal = options?.temporal ?? false;
        const truncate = options?.truncate ?? true;
        if (temporal) return formatMonthYearLabel(label);
        if (!truncate) return label;
        if (label.length <= 18) return label;
        return `${label.slice(0, 18)}...`;
    };

    const axisTickFont = { size: 9, weight: '600', family: '"Be Vietnam Pro", sans-serif' };
    const axisTitleFont = { size: 10, weight: '700', family: '"Be Vietnam Pro", sans-serif' };
    const dimensionAxisLabel = String(chart.x_axis || chart.dimension || nameKey || 'Category').replace(/_/g, ' ');
    const valueAxisLabel = String(chart.y_axis || chart.metric || chart.value_label || 'Value').replace(/_/g, ' ');
    const scatterXAxisLabel = String(chart.x_axis || chart.dimension || nameKey || 'X').replace(/_/g, ' ');
    const scatterYAxisLabel = String(chart.y_axis || chart.metric || chart.value_label || 'Y').replace(/_/g, ' ');

    const numericSeriesValues = chartData
        .map((d: any) => Number(d?.value))
        .filter((v: number) => Number.isFinite(v));

    const scatterXValues = chartData
        .map((d: any) => Number(d?.x))
        .filter((v: number) => Number.isFinite(v));

    const scatterYValues = chartData
        .map((d: any) => Number(d?.y))
        .filter((v: number) => Number.isFinite(v));

    const getNiceTickStep = (values: number[], desiredTicks = 6): number | undefined => {
        if (!values.length) return undefined;

        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = Math.abs(max - min);
        if (!Number.isFinite(range) || range <= 0) return undefined;

        const rough = range / Math.max(2, desiredTicks - 1);
        if (!Number.isFinite(rough) || rough <= 0) return undefined;

        const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
        const normalized = rough / magnitude;

        let multiplier = 1;
        if (normalized > 1 && normalized <= 2) multiplier = 2;
        else if (normalized > 2 && normalized <= 2.5) multiplier = 2.5;
        else if (normalized > 2.5 && normalized <= 5) multiplier = 5;
        else if (normalized > 5) multiplier = 10;

        return multiplier * magnitude;
    };

    const valueAxisStep = getNiceTickStep(numericSeriesValues, 6);
    const scatterXAxisStep = getNiceTickStep(scatterXValues, 6);
    const scatterYAxisStep = getNiceTickStep(scatterYValues, 6);

    const handleSliceClick = (data: any) => {
        if (!onFilterClick || !data) return;

        // Recharts emits different click payload shapes by chart type.
        const payload = data?.payload || data;
        const val = payload?.[nameKey]
            ?? payload?.timestamp
            ?? payload?.name
            ?? payload?.date
            ?? payload?.x
            ?? data?.activeLabel
            ?? data?.label
            ?? data?.name;

        if (val === undefined || val === null || val === '') return;
        onFilterClick(filterCol, String(val));
    };

    const renderOutlierToggle = () => {
        if (!chart.outliers?.count) return null;
        return (
            <div className="flex justify-end mb-2 relative z-10 w-full">
                <Button
                    type="button"
                    onClick={() => setShowOutliers(!showOutliers)}
                    className={`text-[10px] font-medium px-2 py-1 rounded border transition-colors flex items-center gap-1 ${isDark
                        ? (showOutliers ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' : 'bg-gray-800 border-border-main text-themed-muted hover:bg-gray-700')
                        : (showOutliers ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-gray-50 border-gray-200 text-themed-muted hover:bg-gray-100')
                        }`}
                    title={showOutliers ? "Click to exclude extreme outliers" : "Click to include extreme outliers"}
                    variant="ghost"
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {chart.outliers.count} {showOutliers ? 'outliers included' : 'outliers excluded'}
                </Button>
            </div>
        );
    };

    const commonOptions = (isScale: boolean, axisLabel: string, indexAxis: 'x' | 'y' = 'x', isScatter: boolean = false) => {
        const tooltipMetricLabel = String(axisLabel || valueAxisLabel || chart.value_label || 'Value').trim();

        const getTooltipVal = (raw: any, metricLabel = tooltipMetricLabel) => {
            if (raw === null || raw === undefined) return '';
            return fmtVal(raw, metricLabel);
        };

        const tooltipCb = {
            title: (ctxs: any) => {
                const first = ctxs?.[0];
                if (!first) return '';
                const rawLabel = first.label;
                if (rawLabel !== undefined && rawLabel !== null && String(rawLabel).trim() !== '') {
                    return normalizeLabel(rawLabel);
                }
                const rawName = first?.raw?.label ?? first?.raw?.name ?? first?.raw?._data?.name;
                if (rawName !== undefined && rawName !== null && String(rawName).trim() !== '') {
                    return normalizeLabel(rawName);
                }
                return '';
            },
            label: (ctx: any) => {
                if (ctx?.raw && typeof ctx.raw === 'object' && ('x' in ctx.raw || 'y' in ctx.raw)) {
                    const lines: string[] = [];
                    if (ctx.raw.x !== undefined) lines.push(` ${scatterXAxisLabel}: ${fmtTick(ctx.raw.x, scatterXAxisLabel)}`);
                    if (ctx.raw.y !== undefined) lines.push(` ${scatterYAxisLabel}: ${fmtTick(ctx.raw.y, scatterYAxisLabel)}`);
                    return lines;
                }

                const seriesLabel = String(ctx.dataset.label || tooltipMetricLabel || 'Value');
                const chartType = String(chart?.type || '').toLowerCase();
                const isPieLike = chartType === 'pie' || chartType === 'doughnut' || chartType === 'donut';

                if (isPieLike && typeof ctx.raw === 'number') {
                    const lines = [` ${seriesLabel}: ${getTooltipVal(ctx.raw, tooltipMetricLabel)}`];
                    const datasetValues = Array.isArray(ctx.dataset?.data)
                        ? ctx.dataset.data.map((v: any) => Number(v) || 0)
                        : [];
                    const total = datasetValues.reduce((acc: number, val: number) => acc + val, 0);
                    const isMetricAlreadyPercent = isPercentMetricLabel(tooltipMetricLabel) || isChartExplicitPercent;
                    if (!isMetricAlreadyPercent && total > 0) {
                        const share = (Number(ctx.raw) / total) * 100;
                        lines.push(` Share: ${share.toFixed(1)}%`);
                    }
                    return lines;
                }

                return ` ${seriesLabel}: ${getTooltipVal(ctx.raw, tooltipMetricLabel)}`;
            }
        };

        const standardScales = isScale && indexAxis === 'x' && !isScatter ? {
            x: {
                type: 'category',
                grid: { display: false },
                ticks: {
                    color: chartColors.text,
                    autoSkip: false,
                    maxTicksLimit: isTemporalXAxis ? 5 : 7,
                    maxRotation: 0,
                    minRotation: 0,
                    font: axisTickFont,
                    callback: function(val: any, index: number) {
                        if (index % effectiveCategoryTickInterval !== 0 && index !== categoryLabels.length - 1) {
                            return '';
                        }
                        const label = String(this.getLabelForValue(val as number) ?? '');
                        return formatCategoryTick(label, { temporal: isTemporalXAxis, truncate: !isTemporalXAxis });
                    }
                },
                title: {
                    display: true,
                    text: dimensionAxisLabel,
                    color: chartColors.text,
                    font: axisTitleFont,
                }
            },
            y: {
                type: 'linear',
                beginAtZero: true,
                grace: '8%',
                grid: { color: chartColors.grid },
                ticks: {
                    color: chartColors.text,
                    maxTicksLimit: 6,
                    stepSize: valueAxisStep,
                    font: axisTickFont,
                    callback: (v: any) => fmtTick(v, axisLabel)
                },
                title: {
                    display: true,
                    text: valueAxisLabel,
                    color: chartColors.text,
                    font: axisTitleFont,
                }
            }
        } : undefined;

        const hbarScales = isScale && indexAxis === 'y' ? {
            x: {
                type: 'linear',
                beginAtZero: true,
                grace: '8%',
                grid: { color: chartColors.grid },
                ticks: {
                    color: chartColors.text,
                    maxTicksLimit: 6,
                    stepSize: valueAxisStep,
                    font: axisTickFont,
                    callback: (v: any) => fmtTick(v, axisLabel)
                },
                title: {
                    display: true,
                    text: valueAxisLabel,
                    color: chartColors.text,
                    font: axisTitleFont,
                }
            },
            y: {
                type: 'category',
                grid: { display: false },
                ticks: {
                    color: chartColors.text,
                    autoSkip: false,
                    maxRotation: 0,
                    minRotation: 0,
                    font: axisTickFont,
                    padding: 4,
                    callback: function(val: any, index: number) {
                        const label = String(this.getLabelForValue(val as number) ?? '');
                        return formatCategoryTick(label, { truncate: false });
                    }
                },
                title: {
                    display: true,
                    text: dimensionAxisLabel,
                    color: chartColors.text,
                    font: axisTitleFont,
                }
            }
        } : undefined;

        const scatterScales = isScale && isScatter ? {
            x: {
                type: 'linear',
                grid: { display: true, color: chartColors.grid },
                ticks: {
                    color: chartColors.text,
                    maxTicksLimit: 6,
                    stepSize: scatterXAxisStep,
                    font: axisTickFont,
                    callback: (v: any) => fmtTick(v, scatterXAxisLabel)
                },
                title: {
                    display: true,
                    text: scatterXAxisLabel,
                    color: chartColors.text,
                    font: axisTitleFont,
                }
            },
            y: {
                type: 'linear',
                grid: { color: chartColors.grid },
                ticks: {
                    color: chartColors.text,
                    maxTicksLimit: 6,
                    stepSize: scatterYAxisStep,
                    font: axisTickFont,
                    callback: (v: any) => fmtTick(v, scatterYAxisLabel)
                },
                title: {
                    display: true,
                    text: scatterYAxisLabel,
                    color: chartColors.text,
                    font: axisTitleFont,
                }
            }
        } : undefined;

        const baseAnimationDuration = quickReact ? 140 : 950;
        const axisAnimationDuration = quickReact ? 140 : 900;
        const pointAnimationDuration = quickReact ? 120 : 700;

        return {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis,
            interaction: {
                mode: isScatter || !isScale ? 'nearest' : 'index',
                intersect: isScatter || !isScale ? true : false,
                axis: !isScatter && isScale && indexAxis === 'y' ? 'y' : 'x',
            },
            layout: {
                padding: {
                    top: 8,
                    right: 10,
                    bottom: indexAxis === 'x' ? 8 : 2,
                    left: indexAxis === 'y' ? 18 : 6,
                },
            },
            animation: {
                duration: baseAnimationDuration,
                easing: quickReact ? 'linear' : 'easeOutQuart',
            },
            animations: {
                x: {
                    duration: axisAnimationDuration,
                    easing: 'easeOutCubic',
                    delay: (ctx: any) => (quickReact ? 0 : (ctx.type === 'data' ? Math.min(ctx.dataIndex * 30, 240) : 0)),
                },
                y: {
                    duration: axisAnimationDuration,
                    easing: 'easeOutCubic',
                    delay: (ctx: any) => (quickReact ? 0 : (ctx.type === 'data' ? Math.min(ctx.dataIndex * 30, 240) : 0)),
                },
                radius: {
                    duration: pointAnimationDuration,
                    easing: 'easeOutBack',
                }
            },
            onClick: (e: any, elements: any[]) => {
                if (elements.length > 0 && onFilterClick) {
                    const dataIndex = elements[0].index;
                    const value = chartData[dataIndex]?.[nameKey];
                    if (value) onFilterClick(filterCol, String(value));
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                    titleColor: isDark ? '#fff' : '#000',
                    bodyColor: isDark ? '#ccc' : '#333',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    cornerRadius: 10,
                    displayColors: false,
                    caretPadding: 6,
                    padding: 10,
                    bodyFont: { size: 13, family: '"Be Vietnam Pro", sans-serif' },
                    titleFont: { size: 14, weight: 'bold', family: '"Be Vietnam Pro", sans-serif' },
                    callbacks: tooltipCb
                }
            },
            scales: isScale ? (isScatter ? scatterScales : (indexAxis === 'y' ? hbarScales : standardScales)) : undefined
        };
    };


    switch (chart.type) {
        case 'bar':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 192, width: '100%' }}>
                        <Bar
                            key={`bar-${chart?.id || chart?.title || 'chart'}-x`}
                            data={{
                                labels: categoryLabels,
                                datasets: [{
                                    data: chartData.map((d: any) => d.value),
                                    backgroundColor: chartData.map((_: any, i: number) => getPaletteColor(i)),
                                    borderRadius: 6
                                }]
                            }}
                            options={{ ...(commonOptions(true, valueAxisLabel, 'x') as any), indexAxis: 'x' } as any}
                        />
                    </div>
                </div>
            );

        case 'hbar':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: chartData.length >= 8 ? Math.min(chartData.length * 28 + 40, 300) : 192, width: '100%' }}>
                        <Bar
                            key={`bar-${chart?.id || chart?.title || 'chart'}-y`}
                            data={{
                                labels: categoryLabels,
                                datasets: [{
                                    data: chartData.map((d: any) => d.value),
                                    backgroundColor: chartData.map((_: any, i: number) => getPaletteColor(i)),
                                    borderRadius: 6
                                }]
                            }}
                            options={{ ...commonOptions(true, valueAxisLabel, 'y') as any, indexAxis: 'y' } as any} 
                        />
                    </div>
                </div>
            );

        case 'stacked_bar':
            {
            const activeStackKeys = stackedSeriesKeys.length > 0 ? stackedSeriesKeys : ['positive', 'negative'];
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 192, width: '100%' }}>
                        <Bar
                            key={`stacked-${chart?.id || chart?.title || 'chart'}`}
                            data={{
                                labels: categoryLabels,
                                datasets: activeStackKeys.map((key, idx) => ({
                                    label: String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                                    data: chartData.map((d: any) => getSeriesValue(d, key, idx)),
                                    backgroundColor: getPaletteColor(idx),
                                }))
                            }} 
                            options={{
                                ...commonOptions(true, valueAxisLabel),
                                plugins: {
                                    ...(((commonOptions(true, valueAxisLabel) as any).plugins) || {}),
                                    legend: { display: true }
                                },
                                scales: {
                                    x: {
                                        ...((commonOptions(true, valueAxisLabel) as any).scales?.x || {}),
                                        stacked: true,
                                    },
                                    y: {
                                        ...((commonOptions(true, valueAxisLabel) as any).scales?.y || {}),
                                        stacked: true,
                                    }
                                }
                            } as any} 
                        />
                    </div>
                </div>
            );
            }

        case 'pie':
        case 'doughnut':
        case 'donut':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 210, width: '100%' }}>
                        <Pie
                            key={`pie-${chart?.id || chart?.title || 'chart'}-${chart.type}`}
                            data={{
                                labels: chartData.map((d: any) => normalizeLabel(d[nameKey] || d.name)),
                                datasets: [{
                                    data: chartData.map((d: any) => d.value),
                                    backgroundColor: chartData.map((_: any, i: number) => getPaletteColor(i)),
                                    borderWidth: isDark ? 2 : 0,
                                    borderColor: '#1a1d24'
                                }]
                            }} 
                            options={{
                                ...commonOptions(false, valueAxisLabel),
                                cutout: (chart.type === 'donut' || chart.type === 'doughnut') ? '70%' : '0%',
                                plugins: {
                                    ...(((commonOptions(false, valueAxisLabel) as any).plugins) || {}),
                                    legend: {
                                        position: 'bottom',
                                        labels: {
                                            color: chartColors.text,
                                            usePointStyle: true,
                                            font: axisTickFont,
                                        }
                                    }
                                }
                            } as any} 
                        />
                    </div>
                </div>
            );

        case 'polar_area':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 210, width: '100%' }}>
                        <PolarArea
                            key={`polar-${chart?.id || chart?.title || 'chart'}`}
                            data={{
                                labels: chartData.map((d: any) => normalizeLabel(d[nameKey] || d.name)),
                                datasets: [{
                                    data: chartData.map((d: any) => d.value),
                                    backgroundColor: chartData.map((_: any, i: number) => getPaletteColor(i)),
                                }]
                            }}
                            options={{
                                ...commonOptions(false, valueAxisLabel),
                                plugins: {
                                    ...(((commonOptions(false, valueAxisLabel) as any).plugins) || {}),
                                    legend: {
                                        display: true,
                                        position: 'bottom',
                                        labels: { color: chartColors.text, font: axisTickFont }
                                    }
                                },
                                scales: {
                                    r: {
                                        angleLines: { color: chartColors.grid },
                                        grid: { color: chartColors.grid },
                                        pointLabels: { color: chartColors.text, font: axisTickFont },
                                        ticks: {
                                            color: chartColors.text,
                                            font: axisTickFont,
                                            callback: (v: any) => fmtTick(v, valueAxisLabel)
                                        }
                                    }
                                }
                            } as any}
                        />
                    </div>
                </div>
            );

        case 'line':
        case 'area':
        case 'stacked':
            {
            const activeLineStackKeys = stackedSeriesKeys.length > 0 ? stackedSeriesKeys : (chart.categories || []);
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 192, width: '100%' }}>
                        <Line
                            key={`line-${chart?.id || chart?.title || 'chart'}-${chart.type}`}
                            data={{
                                labels: chartData.map((d: any) => d.timestamp || d.date || d[nameKey]),
                                datasets: chart.type === 'stacked' 
                                    ? activeLineStackKeys.map((cat: string, i: number) => ({
                                        label: cat,
                                        data: chartData.map((d: any) => getSeriesValue(d, cat, i)),
                                        backgroundColor: getPaletteColor(i),
                                        borderColor: getPaletteColor(i),
                                        fill: true
                                    }))
                                    : [{
                                        data: chartData.map((d: any) => d.value),
                                        backgroundColor: chart.type === 'line' ? 'transparent' : 'rgba(99, 102, 241, 0.2)',
                                        borderColor: getPaletteColor(0),
                                        fill: chart.type === 'area',
                                        tension: 0.4
                                    }]
                            }} 
                            options={{
                                ...commonOptions(true, valueAxisLabel),
                                scales: chart.type === 'stacked' 
                                    ? {
                                        x: { ...(((commonOptions(true, valueAxisLabel) as any).scales || {}).x || {}), stacked: true },
                                        y: { ...(((commonOptions(true, valueAxisLabel) as any).scales || {}).y || {}), stacked: true }
                                    }
                                    : commonOptions(true, valueAxisLabel).scales
                            } as any} 
                        />
                    </div>
                </div>
            );
            }

        case 'scatter':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 192, width: '100%' }}>
                        <Scatter
                            key={`scatter-${chart?.id || chart?.title || 'chart'}`}
                            data={{
                                datasets: [{
                                    data: chartData.map((d: any) => ({ x: d.x, y: d.y })),
                                    backgroundColor: getPaletteColor(0)
                                }]
                            }} 
                            options={commonOptions(true, scatterYAxisLabel, 'x', true) as any} 
                        />
                    </div>
                </div>
            );

        case 'bubble':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 192, width: '100%' }}>
                        <Bubble
                            key={`bubble-${chart?.id || chart?.title || 'chart'}`}
                            data={{
                                datasets: [{
                                    label: valueAxisLabel,
                                    data: chartData.map((d: any, i: number) => ({
                                        x: Number(d.x ?? i + 1),
                                        y: Number(d.y ?? d.value ?? 0),
                                        r: Math.max(4, Math.min(16, Number(d.r ?? d.size ?? 8))),
                                    })),
                                    backgroundColor: 'rgba(99, 102, 241, 0.55)',
                                    borderColor: getPaletteColor(0),
                                    borderWidth: 1,
                                }]
                            }}
                            options={commonOptions(true, scatterYAxisLabel, 'x', true) as any}
                        />
                    </div>
                </div>
            );
            
        case 'radar':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 210, width: '100%' }}>
                        <Radar
                            key={`radar-${chart?.id || chart?.title || 'chart'}`}
                            data={{
                                labels: categoryLabels,
                                datasets: [{
                                    label: valueAxisLabel,
                                    data: chartData.map((d: any) => d.value),
                                    borderColor: getPaletteColor(0),
                                    backgroundColor: 'rgba(99, 102, 241, 0.24)',
                                    pointBackgroundColor: getPaletteColor(0),
                                    pointBorderColor: getPaletteColor(0),
                                    pointRadius: 3,
                                    fill: true,
                                }]
                            }}
                            options={{
                                ...commonOptions(false, valueAxisLabel),
                                scales: {
                                    r: {
                                        angleLines: { color: chartColors.grid },
                                        grid: { color: chartColors.grid },
                                        pointLabels: {
                                            color: chartColors.text,
                                            font: axisTickFont,
                                            callback: (label: any, index: number) => {
                                                if (index % categoryTickInterval !== 0 && index !== categoryLabels.length - 1) return '';
                                                return formatCategoryTick(String(label || ''));
                                            }
                                        },
                                        ticks: {
                                            color: chartColors.text,
                                            backdropColor: 'transparent',
                                            font: axisTickFont,
                                            callback: (v: any) => fmtTick(v, valueAxisLabel)
                                        }
                                    }
                                },
                                plugins: {
                                    ...((commonOptions(false, valueAxisLabel) as any).plugins || {}),
                                    legend: { display: false }
                                }
                            } as any}
                        />
                    </div>
                </div>
            );

        case 'treemap':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <div style={{ height: 210, width: '100%' }}>
                        <ReactChart
                            type="treemap"
                            key={`treemap-${chart?.id || chart?.title || 'chart'}`}
                            data={{
                                datasets: [{
                                    label: valueAxisLabel,
                                    tree: chartData.map((d: any, i: number) => ({
                                        name: normalizeLabel(d[nameKey] || d.name || `Item ${i + 1}`),
                                        value: Number(d.value || 0),
                                        color: getPaletteColor(i),
                                    })),
                                    key: 'value',
                                    groups: ['name'],
                                    spacing: 1,
                                    borderColor: isDark ? '#0f1115' : '#ffffff',
                                    borderWidth: 1,
                                    backgroundColor: (ctx: any) => ctx?.raw?._data?.color || getPaletteColor(ctx?.dataIndex || 0),
                                    labels: {
                                        display: true,
                                        color: isDark ? '#e5e7eb' : '#0f172a',
                                        font: axisTickFont,
                                        formatter: (ctx: any) => formatCategoryTick(String(ctx?.raw?._data?.name || ''))
                                    }
                                }]
                            }}
                            options={{
                                ...commonOptions(false, valueAxisLabel),
                                parsing: false,
                                onClick: (_e: any, elements: any[]) => {
                                    if (!elements.length || !onFilterClick) return;
                                    const raw = elements[0]?.element?.$context?.raw?._data;
                                    if (raw?.name) onFilterClick(filterCol, String(raw.name));
                                },
                                plugins: {
                                    ...((commonOptions(false, valueAxisLabel) as any).plugins || {}),
                                    legend: { display: false },
                                    tooltip: {
                                        ...(((commonOptions(false, valueAxisLabel) as any).plugins || {}).tooltip || {}),
                                        callbacks: {
                                            title: (items: any) => normalizeLabel(items?.[0]?.raw?._data?.name || items?.[0]?.label || ''),
                                            label: (ctx: any) => ` ${valueAxisLabel}: ${fmtVal(ctx?.raw?._data?.value ?? ctx?.raw?.v ?? ctx?.raw, valueAxisLabel)}`
                                        }
                                    }
                                }
                            } as any}
                        />
                    </div>
                </div>
            );

        case 'geo_map':
        case 'map':
            return (
                <div className="flex flex-col h-full w-full">
                    {renderOutlierToggle()}
                    <GeoMapCard
                        data={chartData}
                        mapType={chart.geo_meta?.map_type ?? 'world'}
                        chartTitle={chart.title}
                        formatType={chart.format_type}
                        isDark={isDark}
                        quickReact={quickReact}
                    />
                </div>
            );

        default:
            return <div className="h-48 flex items-center justify-center text-themed-muted text-sm">Unsupported chart type</div>;
    }
};

const FilterDropdown = ({
    datasets,
    selectedDatasetId,
    onDatasetChange,
}: {
    datasets: any[];
    selectedDatasetId: string;
    onDatasetChange: (id: string) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = datasets.find(d => d.id === selectedDatasetId);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <Button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 bg-white border border-[#d8dada] rounded-2xl px-4 py-2.5 shadow-sm text-[14px] text-[#2d2f2f] hover:bg-[#f8f9f9] transition-colors"
                variant="ghost"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className="max-w-[140px] truncate">{selected?.name || 'Select Dataset'}</span>
                <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </Button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#e5e7e7] rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="py-1">
                        {datasets.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-[#7a7c7c]">No datasets available</p>
                        ) : (
                            datasets.map(ds => (
                                <Button
                                    type="button"
                                    key={ds.id}
                                    onClick={() => { onDatasetChange(ds.id); setOpen(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-xs uppercase tracking-widest transition-colors flex items-center gap-2 ${ds.id === selectedDatasetId
                                        ? 'bg-[#efedff] text-[#6c63ff] font-bold'
                                        : 'text-[#5a5c5c] hover:bg-[#f6f7f7] hover:text-[#2d2f2f]'}`}
                                    variant="ghost"
                                >
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                                    </svg>
                                    <span className="truncate">{ds.name}</span>
                                </Button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Multi-Filter Panel — slot-based, user-controlled columns ─────────────────
//
// Each of the 4 slots has TWO layers:
//   Top:    Column picker  (shows ALL available cols MINUS those used in other slots)
//   Bottom: Value picker   (multi-select checkboxes for the chosen column)
//
// This means picking a column in slot 1 removes it from slots 2/3/4's picker.

const toLabel = (col: string) =>
    col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

const normalizeColumnKey = (value: string) =>
    String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const MultiFilterPanel = ({
    geoFilters,
    targetColumn,
    targetValues,
    filterSlots,
    activeFilters,
    onSlotChange,
    onFilterChange,
    onClearAll,
}: {
    geoFilters: Record<string, string[]>;
    targetColumn?: string | null;
    targetValues?: string[];
    filterSlots: (string | null)[];
    activeFilters: Record<string, string[]>;
    onSlotChange: (slotIdx: number, col: string | null) => void;
    onFilterChange: (col: string, values: string[]) => void;
    onClearAll: () => void;
}) => {
    // openPicker: which slot's column-picker is open
    // openValues: which slot's value-list is open
    const [openPicker, setOpenPicker] = useState<number | null>(null);
    const [openValues, setOpenValues] = useState<number | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const targetRawToSemantic: Record<string, string> = {};
    const targetSemanticToRaw: Record<string, string> = {};
    const isTargetEquivalentColumn = (col?: string | null): boolean => {
        if (!targetColumn || !col) return false;
        return normalizeColumnKey(col) === normalizeColumnKey(targetColumn);
    };

    for (const rawVal of (targetValues || [])) {
        const raw = String(rawVal);
        const semantic = formatTargetTabLabel(raw, targetColumn || undefined);
        targetRawToSemantic[raw] = semantic;
        if (!(semantic in targetSemanticToRaw)) {
            targetSemanticToRaw[semantic] = raw;
        }
    }

    const toRawTargetValue = (col: string, value: string): string => {
        if (!isTargetEquivalentColumn(col)) return value;
        return targetSemanticToRaw[value] ?? value;
    };

    const targetRawValues = Array.from(new Set((targetValues || []).map(v => String(v)).filter(Boolean)));
    const valueOptionsByCol: Record<string, string[]> = { ...geoFilters };
    if (targetColumn && targetRawValues.length > 0) {
        const matchingTargetKey = Object.keys(valueOptionsByCol).find((col) => isTargetEquivalentColumn(col));
        if (matchingTargetKey) {
            valueOptionsByCol[matchingTargetKey] = targetRawValues;
        } else {
            valueOptionsByCol[targetColumn] = targetRawValues;
        }
    }

    const allCols = Object.keys(valueOptionsByCol);
    const totalActive = Object.values(activeFilters).reduce((n, v) => n + v.length, 0);

    // Close all dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpenPicker(null);
                setOpenValues(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleValue = (col: string, val: string) => {
        const rawVal = toRawTargetValue(col, val);
        const current = (activeFilters[col] ?? []).map(v => toRawTargetValue(col, v));
        const next = current.includes(rawVal)
            ? current.filter(v => v !== rawVal)
            : [...current, rawVal];
        onFilterChange(col, next);
    };

    if (allCols.length === 0) return null;

    return (
        <div ref={panelRef} className="mb-6 relative z-30">
            <div className="bg-white dark:bg-[#17181b] border border-[#eceeee] dark:border-[#2a2d33] rounded-[24px] shadow-[0_4px_20px_rgba(32,48,68,0.05)] p-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[#5a5c5c] dark:text-[#a3a8b3] font-semibold">Filters</span>
                    {totalActive > 0 && (
                        <Button
                            type="button"
                            onClick={onClearAll}
                            className="text-[11px] text-[#6c63ff] hover:text-[#3525cd] transition-colors"
                            variant="ghost"
                        >
                            Clear all
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {filterSlots.map((selectedCol, slotIdx) => {
                        // Columns available in THIS slot's picker =
                        // all cols minus those already pinned in OTHER slots
                        const takenByOthers = filterSlots
                            .filter((_, i) => i !== slotIdx)
                            .filter(Boolean) as string[];
                        const availableCols = allCols.filter(c => !takenByOthers.includes(c));

                        const slotValues = selectedCol
                            ? (activeFilters[selectedCol] ?? []).map(v => toRawTargetValue(selectedCol, v))
                            : [];
                        const selectedColOptions = selectedCol ? (valueOptionsByCol[selectedCol] || []) : [];
                        const isPickerOpen = openPicker === slotIdx;
                        const isValuesOpen = openValues === slotIdx;

                        return (
                            <div key={slotIdx} className="flex flex-col gap-2">
                                <div className="relative">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-[#5a5c5c] dark:text-[#a3a8b3] font-semibold mb-1.5" style={{ fontFamily: '"Be Vietnam Pro", sans-serif' }}>
                                        {selectedCol ? toLabel(selectedCol) : `Filter ${slotIdx + 1}`}
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setOpenValues(null);
                                            setOpenPicker(isPickerOpen ? null : slotIdx);
                                        }}
                                        className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-[16px] text-[14px] border border-transparent transition-all ${selectedCol
                                            ? 'bg-[#e8e5ff] text-[#6c63ff]'
                                            : 'bg-[#f0f1f1] text-[#2d2f2f] dark:bg-[#23262d] dark:text-[#eceff4]'
                                            }`}
                                        variant="ghost"
                                    >
                                        <span className="truncate" style={{ fontFamily: '"Be Vietnam Pro", sans-serif', fontWeight: 500 }}>
                                            {selectedCol ? toLabel(selectedCol) : 'Select Filter'}
                                        </span>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {selectedCol && (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onFilterChange(selectedCol, []);
                                                        onSlotChange(slotIdx, null);
                                                    }}
                                                    className="text-[#7a7c7c] hover:text-red-500 transition-colors"
                                                    aria-label="Remove filter"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </span>
                                            )}
                                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${isPickerOpen || !!selectedCol ? 'bg-[#6c63ff] text-white' : 'bg-[#dfe1e1] text-[#5a5c5c] dark:bg-[#2c2f36] dark:text-[#c0c6d0]'}`}>
                                                <svg className={`w-3 h-3 transition-transform ${isPickerOpen ? 'rotate-180' : ''}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </span>
                                        </div>
                                    </Button>

                                    {isPickerOpen && (
                                        <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-white dark:bg-[#17181b] rounded-[16px] border border-[#e5e7e7] dark:border-[#2f333b] shadow-2xl z-50 overflow-hidden">
                                            {selectedCol && (
                                                <Button
                                                    type="button"
                                                    onClick={() => {
                                                        onFilterChange(selectedCol, []);
                                                        onSlotChange(slotIdx, null);
                                                        setOpenPicker(null);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-[13px] text-[#7a7c7c] hover:text-red-500 hover:bg-[#f8f9f9] dark:hover:bg-[#1f2127] transition-colors border-b border-[#eceeee] dark:border-[#2f333b]"
                                                    variant="ghost"
                                                >
                                                    — No filter (clear slot)
                                                </Button>
                                            )}
                                            <div className="max-h-48 overflow-y-auto py-1">
                                                {availableCols.map(col => (
                                                    <Button
                                                        type="button"
                                                        key={col}
                                                        onClick={() => {
                                                            // Clear old column's values if switching
                                                            if (selectedCol && selectedCol !== col) {
                                                                onFilterChange(selectedCol, []);
                                                            }
                                                            onSlotChange(slotIdx, col);
                                                            setOpenPicker(null);
                                                        }}
                                                        className={`w-full text-left px-3 py-2 text-[14px] transition-colors ${col === selectedCol
                                                            ? 'bg-[#efedff] text-[#6c63ff] font-medium'
                                                            : 'text-[#2d2f2f] dark:text-[#eceff4] hover:bg-[#f8f9f9] dark:hover:bg-[#1f2127]'
                                                            }`}
                                                        variant="ghost"
                                                    >
                                                        {toLabel(col)}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {selectedCol && (
                                    <div className="relative">
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                setOpenPicker(null);
                                                setOpenValues(isValuesOpen ? null : slotIdx);
                                            }}
                                            className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-[16px] text-[14px] border border-transparent transition-all ${slotValues.length > 0
                                                ? 'bg-[#e8e5ff] text-[#6c63ff] font-medium'
                                                : 'bg-[#f0f1f1] text-[#2d2f2f] dark:bg-[#23262d] dark:text-[#eceff4]'
                                                }`}
                                            variant="ghost"
                                        >
                                            <span className="truncate">
                                                {slotValues.length === 0
                                                    ? 'All values'
                                                    : slotValues.length === 1
                                                        ? (isTargetEquivalentColumn(selectedCol)
                                                            ? formatTargetTabLabel(String(slotValues[0]), targetColumn || undefined)
                                                            : formatBooleanLikeLabel(slotValues[0]))
                                                        : `${slotValues.length} selected`}
                                            </span>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${isValuesOpen || slotValues.length > 0 ? 'bg-[#6c63ff] text-white' : 'bg-[#dfe1e1] text-[#5a5c5c] dark:bg-[#2c2f36] dark:text-[#c0c6d0]'}`}>
                                                    <svg className={`w-3 h-3 transition-transform ${isValuesOpen ? 'rotate-180' : ''}`}
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </span>
                                            </div>
                                        </Button>

                                        {isValuesOpen && (
                                            <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] bg-white dark:bg-[#17181b] border border-[#e5e7e7] dark:border-[#2f333b] rounded-[16px] shadow-2xl z-50 overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#eceeee] dark:border-[#2f333b] bg-[#f8f9f9] dark:bg-[#1f2127]">
                                                    <Button
                                                        type="button"
                                                        onClick={() => onFilterChange(selectedCol, selectedColOptions.map(v => toRawTargetValue(selectedCol, v)))}
                                                        className="text-[11px] uppercase tracking-wider text-[#6c63ff] hover:text-[#3525cd] font-bold transition-colors"
                                                        variant="ghost"
                                                    >Select all</Button>
                                                    <Button
                                                        type="button"
                                                        onClick={() => onFilterChange(selectedCol, [])}
                                                        className="text-[11px] uppercase tracking-wider text-[#7a7c7c] hover:text-red-500 font-bold transition-colors"
                                                        variant="ghost"
                                                    >Clear</Button>
                                                </div>
                                                <div className="max-h-52 overflow-y-auto py-1">
                                                    {selectedColOptions.map(val => (
                                                        <label
                                                            key={val}
                                                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#f7f8f8] dark:hover:bg-[#1f2127] cursor-pointer transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={slotValues.includes(val)}
                                                                onChange={() => toggleValue(selectedCol, val)}
                                                                className="w-3.5 h-3.5 rounded accent-[#6c63ff]"
                                                            />
                                                            <span className="text-[14px] text-[#2d2f2f] dark:text-[#eceff4] truncate">
                                                                {isTargetEquivalentColumn(selectedCol)
                                                                    ? (targetRawToSemantic[String(val)] || formatTargetTabLabel(String(val), targetColumn || undefined))
                                                                    : formatBooleanLikeLabel(val)}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ─── Correlation Heatmap ──────────────────────────────────────────────────────
// Pearson correlation matrix — diverging blue → white → red color scale

function corrColor(v: number): string {
    const t = (v + 1) / 2;
    if (t < 0.5) {
        const p = t * 2;
        return `rgba(${Math.round(59 + p * 196)},${Math.round(130 + p * 125)},246,${(0.9 - p * 0.3).toFixed(2)})`;
    }
    const p = (t - 0.5) * 2;
    return `rgba(239,${Math.round(255 - p * 187)},${Math.round(255 - p * 187)},${(0.6 + p * 0.3).toFixed(2)})`;
}

const CorrelationHeatmapCard = ({
    corr,
    loading,
    isDark
}: {
    corr: CorrelationMatrix | null;
    loading: boolean;
    isDark: boolean;
}) => {
    const [tip, setTip] = useState<{ x: number; y: number; row: string; col: string; val: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    if (loading) {
        return (
            <ChartCard title="Feature Correlation Matrix">
                <div className="h-48 flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full border-2 border-blue-500/20 border-t-blue-400 animate-spin" />
                </div>
            </ChartCard>
        );
    }

    if (!corr || corr.n < 2) {
        return (
            <ChartCard title="Feature Correlation Matrix">
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-themed-muted">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h4" />
                    </svg>
                    <span className="text-xs">Not enough numeric columns</span>
                </div>
            </ChartCard>
        );
    }

    const n = corr.n;
    const Y_LBL = 52;
    const CELL = Math.max(16, Math.min(34, Math.floor((268 - Y_LBL) / n)));

    return (
        <ChartCard title="Feature Correlation Matrix">
            <div
                ref={ref}
                className="relative overflow-auto select-none"
                style={{ maxHeight: 220 }}
                onMouseLeave={() => setTip(null)}
            >
                {/* X-axis labels */}
                <div className="flex" style={{ marginLeft: Y_LBL, gap: 2, marginBottom: 4 }}>
                    {corr.displayLabels.map((lbl, ci) => (
                        <div
                            key={ci}
                            title={corr.labels[ci]}
                            style={{
                                width: CELL, minWidth: CELL,
                                fontSize: 8, color: isDark ? '#9CA3AF' : '#6B7280',
                                transform: 'rotate(-40deg)',
                                transformOrigin: 'bottom left',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                            }}
                        >
                            {lbl}
                        </div>
                    ))}
                </div>

                {/* Rows */}
                {corr.displayLabels.map((rowLbl, ri) => (
                    <div key={ri} className="flex items-center" style={{ gap: 2, marginBottom: 2 }}>
                        <div
                            title={corr.labels[ri]}
                            style={{
                                width: Y_LBL, minWidth: Y_LBL,
                                fontSize: 8, color: isDark ? '#9CA3AF' : '#6B7280',
                                textAlign: 'right',
                                paddingRight: 4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {rowLbl}
                        </div>

                        {corr.matrix[ri].map((val, ci) => {
                            const diag = ri === ci;
                            return (
                                <div
                                    key={ci}
                                    className="rounded-[2px] cursor-default flex items-center justify-center transition-opacity hover:opacity-80"
                                    style={{
                                        width: CELL, height: CELL,
                                        minWidth: CELL, minHeight: CELL,
                                        background: diag ? 'rgba(99,102,241,0.55)' : corrColor(val),
                                        outline: diag ? '1px solid rgba(129,140,248,0.5)' : undefined,
                                    }}
                                    onMouseEnter={(e) => {
                                        const el = e.currentTarget.getBoundingClientRect();
                                        const par = ref.current!.getBoundingClientRect();
                                        setTip({
                                            x: el.left - par.left + CELL / 2,
                                            y: el.top - par.top - 8,
                                            row: corr.labels[ri],
                                            col: corr.labels[ci],
                                            val,
                                        });
                                    }}
                                >
                                    {CELL >= 26 && (
                                        <span style={{ fontSize: 7, fontWeight: 700, color: Math.abs(val) > 0.55 ? '#fff' : '#9CA3AF', lineHeight: 1 }}>
                                            {diag ? '1' : val.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}

                {/* Tooltip */}
                {tip && (
                    <div
                        className="absolute pointer-events-none z-20 bg-white dark:bg-[#1a1a2e] border border-gray-200 dark:border-border-main rounded-lg px-3 py-2 shadow-2xl text-xs whitespace-nowrap -translate-x-1/2 -translate-y-full transition-colors duration-300"
                        style={{
                            left: tip.x,
                            top: tip.y,
                            color: isDark ? '#F3F4F6' : '#111827'
                        }}
                    >
                        <p className="opacity-60 font-medium mb-0.5">
                            {tip.row === tip.col ? tip.row : `${tip.row} × ${tip.col}`}
                        </p>
                        <p className="font-bold" style={{ color: tip.val >= 0 ? '#F87171' : '#60A5FA' }}>
                            r = {tip.val.toFixed(3)}
                            <span className="ml-1 font-normal opacity-50">
                                ({Math.abs(tip.val) > 0.7 ? 'strong' : Math.abs(tip.val) > 0.4 ? 'moderate' : 'weak'})
                            </span>
                        </p>
                    </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-1.5 mt-2 justify-end">
                    <span className="text-[9px] text-blue-400 font-semibold">-1</span>
                    <div className="h-1.5 w-16 rounded-full" style={{
                        background: 'linear-gradient(to right,rgba(59,130,246,0.9),rgba(255,255,255,0.25),rgba(239,68,68,0.9))'
                    }} />
                    <span className="text-[9px] text-red-400 font-semibold">+1</span>
                </div>
            </div>
        </ChartCard>
    );
};
// ─── Main Dashboard ───────────────────────────────────────────────────────────

/** Professional dashboard titles keyed by detected domain.
 *  Mirrors how enterprise BI tools (Tableau, Power BI, Looker) name views.
 */
const DOMAIN_TITLES: Record<string, string> = {
    sales: 'Revenue Intelligence',
    churn: 'Customer Retention Analytics',
    marketing: 'Campaign Performance',
    finance: 'Financial Overview',
    healthcare: 'Clinical Operations',
    generic: 'Analytics Overview',
};

function getDashboardTitle(domain: string | undefined): string {
    if (!domain) return 'Analytics Overview';
    return DOMAIN_TITLES[domain.toLowerCase()] ?? 'Analytics Overview';
}

function prettifyLabel(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatBooleanLikeLabel(value: any): string {
    const raw = String(value ?? '').trim();
    if (!raw) return 'Unknown';

    const normalized = toNormalized(raw);
    if (['true', '1', '1.0', 'yes', 'y'].includes(normalized)) return 'Yes';
    if (['false', '0', '0.0', 'no', 'n'].includes(normalized)) return 'No';

    return raw;
}

function getTargetSemanticLabels(targetColumn?: string): { positive: string; negative: string; all: string } {
    const rawKey = (targetColumn || '').toLowerCase();
    const key = rawKey.replace(/[_\s-]/g, '');
    const tokenizedKey = rawKey.replace(/[_-]/g, ' ');

    if (key.includes('churn')) return { positive: 'Churned', negative: 'Retained', all: 'All Customers' };
    if (key.includes('exit')) return { positive: 'Exited', negative: 'Stayed', all: 'All Customers' };
    if (key.includes('attrition')) return { positive: 'Attrited', negative: 'Retained', all: 'All Employees' };
    if (/\b(left|leave)\b/i.test(tokenizedKey)) return { positive: 'Left', negative: 'Stayed', all: 'All Population' };
    if (key.includes('cancel')) return { positive: 'Cancelled', negative: 'Active', all: 'All Customers' };

    return { positive: 'Positive', negative: 'Negative', all: `All ${prettifyLabel(targetColumn || 'Target')}` };
}

function isBinaryTargetValue(value: string): boolean {
    const v = value.toLowerCase().trim();
    const known = new Set([
        '0', '1', 'true', 'false', 'yes', 'no', 'y', 'n',
        'retained', 'churned', 'exited', 'attrited', 'left', 'stayed', 'active', 'inactive'
    ]);
    return known.has(v);
}

function isPositiveBinaryValue(value: string): boolean {
    const v = value.toLowerCase().trim();
    const positive = new Set(['1', 'true', 'yes', 'y', 'churned', 'exited', 'attrited', 'left', 'inactive']);
    return positive.has(v);
}

function toNormalized(value: string): string {
    return String(value || '').trim().toLowerCase();
}

function getBinarySemanticBucket(value: string): 'positive' | 'negative' | null {
    const normalized = toNormalized(value);
    if (!normalized) return null;

    if (isPositiveBinaryValue(normalized)) return 'positive';
    if (isBinaryTargetValue(normalized)) return 'negative';
    return null;
}

function resolveValueAgainstColumnOptions(
    rawValue: string,
    candidateValues: string[],
    targetColumn?: string | null,
    selectedColumn?: string | null,
): string {
    const normalizedInput = toNormalized(rawValue);
    if (!normalizedInput || !Array.isArray(candidateValues) || candidateValues.length === 0) {
        return rawValue;
    }

    const direct = candidateValues.find((v) => toNormalized(String(v)) === normalizedInput);
    if (direct) return String(direct);

    const isTargetColumn = !!(
        targetColumn
        && selectedColumn
        && normalizeColumnKey(String(targetColumn)) === normalizeColumnKey(String(selectedColumn))
    );

    if (isTargetColumn) {
        const semanticTargetMatch = candidateValues.find(
            (v) => toNormalized(formatTargetTabLabel(String(v), targetColumn || undefined)) === normalizedInput
        );
        if (semanticTargetMatch) return String(semanticTargetMatch);
    }

    const desiredBucket = getBinarySemanticBucket(normalizedInput);
    if (!desiredBucket) return rawValue;

    const binaryEquivalent = candidateValues.find((v) => getBinarySemanticBucket(String(v)) === desiredBucket);
    return binaryEquivalent ? String(binaryEquivalent) : rawValue;
}

function formatTargetTabLabel(value: string, targetColumn?: string): string {
    const raw = String(value);
    if (!isBinaryTargetValue(raw)) return prettifyLabel(raw);

    const labels = getTargetSemanticLabels(targetColumn);
    return isPositiveBinaryValue(raw) ? labels.positive : labels.negative;
}

interface ChartItem {
    id: string;
    type: string;
    title?: string;
    dimension?: string;
    metric?: string;
    aggregation?: string;
    data: any[];
    data_without_outliers?: any[];
    section: string;
    confidence?: number;
    value_label?: string;
    geo_meta?: {
        map_type?: string;
        [key: string]: any;
    };
    categories?: string[];
    [key: string]: any;
}

export default function UserDashboard() {
    const cacheRef = useRef<DashboardCacheBundle>(getDashboardCacheBundle());
    const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
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
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Dynamic Chart Colors
    const chartColors = {
        grid: isDark ? '#1F2937' : '#E5E7EB',
        axis: isDark ? '#9CA3AF' : '#6B7280',
        text: isDark ? '#D1D5DB' : '#374151',
        tooltip: {
            bg: isDark ? '#111827' : '#FFFFFF',
            border: isDark ? '#374151' : '#E5E7EB',
            text: isDark ? '#F3F4F6' : '#111827'
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

    useEffect(() => {
        return () => {
            if (quickReactResetRef.current) {
                window.clearTimeout(quickReactResetRef.current);
            }
        };
    }, []);

    useEffect(() => { loadDatasets(); }, []);

    useEffect(() => {
        if (selectedDatasetId) {
            sessionStorage.setItem('vizzy.dashboard.selectedDatasetId', selectedDatasetId);
        }
    }, [selectedDatasetId]);

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
        if (!selectedDatasetId) return;

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
    }, [selectedDatasetId, classification_overrides, selected_domain]);

    const buildDashboardCacheKey = () => {
        return stableSerialize({
            schema: DASHBOARD_CACHE_SCHEMA_VERSION,
            datasetId: selectedDatasetId,
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
                    setDashboardData(cachedData.raw_data, cachedData.chart_configs, initial, cachedData.total_rows, cachedData.target_column);
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
                        setDashboardData(sessionCached.raw_data, sessionCached.chart_configs, initial, sessionCached.total_rows, sessionCached.target_column);
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
                signal
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
                setDashboardData(data.raw_data, data.chart_configs, initial, data.total_rows, data.target_column);
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
                signal
            );

            if (data.charts) {
                const refreshedCharts: Record<string, any> = {};
                Object.entries(data.charts).forEach(([key, chart]: [string, any]) => {
                    refreshedCharts[key] = chart.data;
                });
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
                };
            });
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
        } finally {
            setIsKPILoading(false);
        }
    };

    useEffect(() => {
        if (!selectedDatasetId) return;

        const hasTargetFilter = !!(target_value && target_value.toLowerCase() !== 'all');
        const hasActiveFilters = Object.keys(normalizedActiveFilters).length > 0;
        const hasChartOverrides = Object.keys(serverChartOverrides || {}).length > 0;

        if (!hasTargetFilter && !hasActiveFilters && !hasChartOverrides) {
            const baseKey = stableSerialize({
                schema: DASHBOARD_CACHE_SCHEMA_VERSION,
                datasetId: selectedDatasetId,
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
    }, [selectedDatasetId, selected_domain, classification_overrides, normalizedActiveFiltersSignature, serverChartOverridesSignature, target_value]);

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
        setNarrativeLoading(true);
        narrativeService.generate(
            selectedDatasetId,
            analytics.kpis,
            analytics.domain,
            analytics.dataset_name,
            analytics.charts,
        )
            .then(text => {
                cacheRef.current.narrative.set(narrativeKey, text);
                setNarrative(text);
            })
            .catch(() => setNarrative(null))
            .finally(() => setNarrativeLoading(false));
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

    const chartArrayRaw: ChartItem[] = analytics?.charts ? Object.entries(analytics.charts).map(([id, val]) => {
        const resolvedType = chart_overrides[id]?.type || val.type;
        const chartConfig = analytics?.chart_configs?.[id];
        const isDateTrend = ['line', 'area', 'area_bounds', 'area-bounds'].includes(String(resolvedType || '').toLowerCase())
            && !!(val.is_date ?? chartConfig?.is_date);
        const shouldUseServerData = isDateTrend || isChurnDashboard;

        const resolvedData = shouldUseServerData
            ? val.data
            : ((hasInteractiveScope ? chartData?.[id] : undefined) || val.data);

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
            const safeTitle = (chart.title || 'Vizzy Export').replace(/</g, '&lt;');
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
            <span>Generated by Vizzy Analytics</span>
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
            <span>Generated by Vizzy Analytics</span>
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
                console.error("Vizzy Export Error:", e);
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

        return (
            <div className="flex flex-col items-center gap-1 w-full">
                <div className="flex items-center gap-1.5">
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
        <div className="min-h-screen bg-[#f6f6f6] dark:bg-[#111216] text-[#2d2f2f] dark:text-[#eceff4] transition-colors">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>
            <header className="bg-white dark:bg-[#15161a] h-16 sticky top-0 z-50 border-b border-[#eceeee] dark:border-[#272a31] px-6 flex items-center justify-between">
                <div className="flex-1" />
                <h1 className="text-[20px] leading-7 font-extrabold text-[#203044] dark:text-[#eceff4] tracking-tight">{getDashboardTitle(analytics?.domain)}</h1>
                <div className="flex-1 flex justify-end items-center gap-2">
                    <button className="w-8 h-8 rounded-full hover:bg-[#f3f4f4] dark:hover:bg-[#242730] flex items-center justify-center text-[#5a5c5c] dark:text-[#b9bec9]">
                        <span className="material-symbols-outlined text-[18px]">notifications</span>
                    </button>
                    <SettingsDropdown />
                    <div className="w-8 h-8 rounded-full border border-[#d8dada] bg-gradient-to-br from-[#e7e8e8] to-[#c8c9c9] flex items-center justify-center text-[11px] font-bold text-[#5a5c5c]">
                        VX
                    </div>
                </div>
            </header>

            <main className="w-full px-4 md:px-6 xl:px-10 2xl:px-14 py-8 md:py-10">
                {!selectedDatasetId && !isLoading && (
                    <div className="rounded-3xl border border-[#eceeee] dark:border-[#2a2d33] bg-white dark:bg-[#17181b] p-10 text-center text-[#7a7c7c] dark:text-[#a3a8b3]">
                        Select a dataset to start analytics.
                    </div>
                )}

                {(isLoading || (!analytics && !!selectedDatasetId && !error)) && (
                    <DashboardSkeleton isDark={isDark} />
                )}

                {!isLoading && error && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                        <h3 className="font-semibold text-red-800">Error Loading Analytics</h3>
                        <p className="text-sm text-red-600 mt-1">{error}</p>
                    </div>
                )}

                {!isLoading && !error && analytics && (
                    <div className="flex flex-col gap-8">
                        <section className="flex flex-col gap-6">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-[0.08em] text-[#5a5c5c] dark:text-[#a3a8b3] font-semibold mb-2">Select Dataset</div>
                                        <FilterDropdown
                                            datasets={datasets}
                                            selectedDatasetId={selectedDatasetId}
                                            onDatasetChange={setSelectedDatasetId}
                                        />
                                    </div>

                                    <div>
                                        <h2 className="text-[34px] md:text-[48px] leading-[1] font-extrabold tracking-[-0.02em] text-[#2d2f2f] dark:text-[#eceff4]">
                                            {analytics.dataset_name}
                                        </h2>
                                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-[#5a5c5c] dark:text-[#a3a8b3]">
                                            <span>{analytics.total_rows.toLocaleString()} Rows</span>
                                            <div className="flex items-center gap-2">
                                                <span>Domain:</span>
                                                <select
                                                    value={selected_domain || 'auto'}
                                                    onChange={(e) => setDomain(e.target.value === 'auto' ? null : e.target.value)}
                                                    className="bg-transparent text-[#2d2f2f] dark:text-[#eceff4] font-semibold outline-none border border-[#d8dada] dark:border-[#3a3f49] rounded-xl px-2 py-1"
                                                >
                                                    <option value="auto">Auto ({analytics.domain})</option>
                                                    <option value="sales">Sales</option>
                                                    <option value="churn">Churn</option>
                                                    <option value="marketing">Marketing</option>
                                                    <option value="finance">Finance</option>
                                                    <option value="healthcare">Healthcare</option>
                                                    <option value="generic">Generic</option>
                                                </select>
                                            </div>
                                            <span className={`px-2 py-1 rounded-lg text-[10px] uppercase font-bold tracking-wider ${analytics.domain_confidence === 'HIGH' ? 'bg-green-100 text-green-700' : analytics.domain_confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                {analytics.domain_confidence} Confidence
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="button"
                                    onClick={() => loadAnalytics(undefined, true)}
                                    disabled={isLoading}
                                    className="h-10 px-5 rounded-2xl border-0 bg-[#cb5ae875] text-[#100f0f] font-semibold shadow-[0_10px_15px_-3px_rgba(108,99,255,0.25),0_4px_6px_-4px_rgba(108,99,255,0.25)]"
                                    variant="ghost"
                                >
                                    <span className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
                                    Reload
                                </Button>
                            </div>

                            {analytics.columns && (
                                <ColumnClassificationPanel columns={analytics.columns} isDark={isDark} />
                            )}

                            {analytics?.geo_filters && Object.keys(analytics.geo_filters).length > 0 && (
                                <MultiFilterPanel
                                    geoFilters={analytics.geo_filters}
                                    targetColumn={analytics.target_column}
                                    targetValues={analytics.target_values?.map(v => String(v)) || []}
                                    filterSlots={filterSlots}
                                    activeFilters={active_filters}
                                    onSlotChange={(slotIdx, col) =>
                                        setFilterSlots(prev => prev.map((s, i) => i === slotIdx ? col : s))
                                    }
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

                            {analytics.data_quality && analytics.data_quality.length > 0 && (
                                <div className="px-2">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#5a5c5c] dark:text-[#a3a8b3]">
                                            Data Quality Report ({analytics.data_quality.filter(d => d.null_pct > 0).length} columns with nulls)
                                        </span>
                                        <div className="h-px flex-1 bg-[#eceeee] dark:bg-[#2a2d33]" />
                                        <Button
                                            type="button"
                                            onClick={() => setDataQualityOpen(!dataQualityOpen)}
                                            className="text-xs text-[#6c63ff]"
                                            variant="ghost"
                                        >
                                            {dataQualityOpen ? 'Hide' : 'Show'}
                                        </Button>
                                    </div>
                                    {dataQualityOpen && (
                                        <div className="bg-white dark:bg-[#17181b] border border-[#eceeee] dark:border-[#2a2d33] rounded-2xl p-4 overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-[#7a7c7c] dark:text-[#a3a8b3] border-b border-[#eceeee] dark:border-[#2a2d33]">
                                                        <th className="text-left py-2 pr-4">Column</th>
                                                        <th className="text-right py-2 pr-4">Null %</th>
                                                        <th className="text-right py-2 pr-4">Null Count</th>
                                                        <th className="text-left py-2 pr-4">Type</th>
                                                        <th className="text-left py-2">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {analytics.data_quality.map((dq: any) => (
                                                        <tr key={dq.column} className="border-b border-[#f2f3f3] dark:border-[#262931]">
                                                            <td className="py-1.5 pr-4 text-[#2d2f2f] dark:text-[#eceff4]">{dq.column}</td>
                                                            <td className="py-1.5 pr-4 text-right font-semibold">{dq.null_pct}%</td>
                                                            <td className="py-1.5 pr-4 text-right text-[#5a5c5c] dark:text-[#a3a8b3]">{dq.null_count.toLocaleString()}</td>
                                                            <td className="py-1.5 pr-4 text-[#5a5c5c] dark:text-[#a3a8b3]">{dq.dtype}</td>
                                                            <td className="py-1.5 text-[#5a5c5c] dark:text-[#a3a8b3]">{dq.action}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="border border-[#ddd9ff] dark:border-[#2b2763] rounded-2xl p-8 bg-[linear-gradient(155deg,rgba(74,64,224,0.05)_0%,rgba(74,64,224,0)_100%)] dark:bg-[linear-gradient(155deg,rgba(108,99,255,0.12)_0%,rgba(108,99,255,0.03)_100%)]">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3525cd] to-[#9f99ff] flex items-center justify-center shadow-[0_10px_15px_-3px_rgba(108,99,255,0.35)]">
                                        <span className="material-symbols-outlined text-white text-[18px]">auto_awesome</span>
                                    </div>
                                    <span className="text-xl font-extrabold tracking-tight text-[#2d2f2f] dark:text-[#eceff4]">VIZZY INSIGHT</span>
                                </div>
                                {narrativeLoading ? (
                                    <div className="space-y-2">
                                        <div className="h-3 bg-[#f1f2f2] rounded w-full animate-pulse" />
                                        <div className="h-3 bg-[#f1f2f2] rounded w-5/6 animate-pulse" />
                                        <div className="h-3 bg-[#f1f2f2] rounded w-4/6 animate-pulse" />
                                    </div>
                                ) : narrative ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-5">
                                        {narrative.split('\n').filter(line => line.trim()).map((line, i) => {
                                            const cleaned = line.replace(/^\d+\.\s*/, '').trim();
                                            const colonIndex = cleaned.indexOf(':');
                                            const rawHeading = colonIndex > 0 ? cleaned.slice(0, colonIndex).trim() : '';
                                            const description = colonIndex > 0 ? cleaned.slice(colonIndex + 1).trim() : cleaned;
                                            const heading = rawHeading && !/^insight\b/i.test(rawHeading)
                                                ? rawHeading
                                                : 'Key Insight';
                                            return (
                                            <div key={i} className="flex gap-3 items-start">
                                                <span className="text-3xl leading-8 font-extrabold text-[#6c63ff33]">{String(i + 1).padStart(2, '0')}</span>
                                                <div className="text-sm leading-6 text-[#5a5c5c] dark:text-[#c8cdd7]">
                                                    <p className="font-semibold text-[#2d2f2f] dark:text-[#f3f6fb]">{heading}:</p>
                                                    <p>{description}</p>
                                                </div>
                                            </div>
                                        );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-[#7a7c7c] dark:text-[#a3a8b3]">Generating insights...</p>
                                )}
                            </div>
                        </section>

                        <section>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                {kpiEntries.map(([key, kpi], idx) => (
                                    <KPICard
                                        key={key}
                                        index={idx}
                                        title={kpi.title}
                                        value={isKPILoading ? '...' : formatValue(kpi.value, kpi.format)}
                                        icon={kpi.icon || 'default'}
                                        trend={kpi.trend}
                                        trend_label={kpi.trend_label}
                                        subtitle={Object.values(active_filters).some(f => f.length > 0) ? 'Filtered View' : kpi.subtitle}
                                        cardColor={KPI_CARD_COLORS[idx % KPI_CARD_COLORS.length]}
                                    />
                                ))}
                            </div>
                        </section>

                        <section>
                            {isKPILoading && (
                                <div className="mb-3 flex items-center gap-2 text-xs text-[#5a5c5c] dark:text-[#a3a8b3]">
                                    <div className="w-3.5 h-3.5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                    Updating filtered results...
                                </div>
                            )}

                            {chartSections.length > 0 && (
                                <div className="space-y-10">
                                    {chartSections.map(({ title, charts }) => (
                                        <div key={title} className="space-y-4">
                                            {/* Section Header */}
                                            <div className="flex items-center gap-3 px-1">
                                                <h3 className="text-lg font-bold tracking-tight text-[#2d2f2f] dark:text-[#eceff4]">
                                                    {title}
                                                </h3>
                                                <div className="h-px flex-1 bg-[#e4e4e7] dark:bg-[#2a2d33]" />
                                                <span className="text-[10px] uppercase tracking-widest text-[#7a7c7c] dark:text-[#a3a8b3] font-semibold">
                                                    {charts.length} {charts.length === 1 ? 'chart' : 'charts'}
                                                </span>
                                            </div>

                                            {/* Section Charts Grid */}
                                            <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-6">
                                                {charts.map((chart) => (
                                                    <ChartCard
                                                        key={chart.id}
                                                        title={chart.title || `Insight ${chart.id}`}
                                                        actions={renderChartActions(chart)}
                                                    >
                                                        <div data-chart-id={chart.id} className="relative">
                                                            <ChartRenderer
                                                                chart={{ ...chart, type: chart_overrides[chart.id]?.type || chart.type }}
                                                                chartColors={chartColors}
                                                                isDark={isDark}
                                                                onFilterClick={handleChartFilterClick}
                                                                targetColumn={analytics?.target_column}
                                                                quickReact={quickReactCharts}
                                                            />
                                                        </div>
                                                    </ChartCard>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}
