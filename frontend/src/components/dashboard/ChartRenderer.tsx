// @ts-nocheck
/* Chart renderer — translates backend chart specs into react-chartjs-2. */

import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Bar, Line, Pie, Scatter, Radar, Bubble, PolarArea, Chart as ReactChart } from 'react-chartjs-2';
import { VIZZY_THEME } from '../../theme/tokens';
import ThemedTooltip from './ThemedTooltip';
import ChartCard from './ChartCard';
import { isBinaryTargetValue, formatTargetTabLabel, formatBooleanLikeLabel } from './dashboard-helpers';
import GeoMapCard from '../../pages/user/GeoMapCard';

const CHART_COLORS = [
    '#7D9BBA', '#6EA694', '#DF8B70', '#CD7784',
    '#68A3B2', '#9184B7', '#C4A265', '#7E8B99'
];

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
    const { theme } = useTheme();
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [showOutliers, setShowOutliers] = useState(true);
    const [treemapTip, setTreemapTip] = useState<{ x: number; y: number; name: string; value: number } | null>(null);
    const treemapRef = useRef<HTMLDivElement>(null);

    const rawChartData = showOutliers ? chart?.data : (chart?.data_without_outliers || chart?.data);

    const countNullValues = () => {
        let nullCount = 0;
        const isNullLike = (val: any) => {
            if (val === null || val === undefined) return true;
            const s = String(val).trim();
            return s === 'NULL' || s === 'null' || s === 'None' || s === '';
        };

        if (Array.isArray(rawChartData)) {
            rawChartData.forEach((row: any) => {
                if (!row) return;
                Object.values(row).forEach((val) => {
                    if (isNullLike(val)) {
                        nullCount++;
                    }
                });
            });
        }
        return nullCount;
    };

    const renderNullWarning = () => {
        const nullCount = countNullValues();
        if (nullCount === 0) return null;
        return (
            <div className="mt-3 text-[10px] text-amber-500/90 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1.5 w-fit font-sans">
                <svg className="w-3 h-3 fill-current flex-shrink-0" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{nullCount} null/missing values identified in the query results</span>
            </div>
        );
    };

    const toHumanLabel = (key?: string, chartTitle?: string) => {
        const raw = String(key || '').trim();
        if (!raw) return '';
        const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
        const title = String(chartTitle || '').trim();

        // 1. If we have a chart title, try to extract a specific metric name from it
        if (title) {
            // Check if the title has a separator like "by", "vs", "over", "per"
            const separators = [/\bby\b/i, /\bvs\b/i, /\bover\b/i, /\bper\b/i];
            for (const sep of separators) {
                if (sep.test(title)) {
                    const parts = title.split(sep);
                    const candidate = parts[0].trim();
                    // Make sure the candidate is not empty and is relevant to the key
                    if (candidate.length > 2) {
                        const normCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
                        // If the key is contained in the candidate, or candidate has common keywords, return candidate
                        if (
                            normCandidate.includes(normalized) ||
                            normalized.includes(normCandidate) ||
                            (['revenue', 'profit', 'sales', 'cost', 'spend', 'charges', 'churn', 'count', 'record'].some(kw => normalized.includes(kw)) && normCandidate.includes(normalized))
                        ) {
                            return candidate;
                        }
                    }
                }
            }

            // Fallback: if the title is short and contains the metric keyword, use the title itself
            if (title.length < 30) {
                const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normTitle.includes(normalized)) {
                    return title;
                }
            }
        }

        // 2. Direct dictionary mappings
        if (normalized.includes('revenue') || normalized.includes('salesperorder')) {
            return 'Total Revenue';
        }
        if (normalized.includes('profit')) {
            return 'Total Profit';
        }
        if (normalized.includes('sales')) {
            return 'Total Sales';
        }
        if (normalized.includes('cost') || normalized.includes('spend')) {
            return 'Total Cost';
        }
        if (normalized === 'totalcharges') {
            return 'Total Charges';
        }
        if (normalized === 'monthlycharges') {
            return 'Monthly Charges';
        }
        if (normalized.includes('churn')) {
            return 'Churn Rate';
        }
        if (normalized.includes('tenure')) {
            return 'Tenure (Months)';
        }

        const mappings: Record<string, string> = {
            recordcount: 'Record Count',
            customerid: 'Customer ID',
            paymentmethod: 'Payment Method',
            contracttype: 'Contract Type',
            paperlessbilling: 'Paperless Billing',
            internetservice: 'Internet Service',
            onlinesecurity: 'Online Security',
            deviceprotection: 'Device Protection',
            techsupport: 'Tech Support',
            streamingtv: 'Streaming TV',
            streamingmovies: 'Streaming Movies',
            phoneservice: 'Phone Service',
            multiplelines: 'Multiple Lines',
            seniorcitizen: 'Senior Citizen',
        };

        if (mappings[normalized]) {
            return mappings[normalized];
        }

        // Default title casing: replace underscores and dashes with spaces, and capitalize words
        return raw
            .replace(/[_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const gridProps = { stroke: chartColors.grid, strokeDasharray: '2 6' };
    const axisProps = { stroke: chartColors.axis, fontSize: 10, tickLine: false, axisLine: false };
    const textStyle = { fill: chartColors.text };
    const polishedPalette = isDark
        ? ['#6366f1', '#3b82f6', '#0d9488', '#64748b', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#10b981', '#f43f5e', '#475569', '#94a3b8', '#c084fc', '#fbbf24', '#2dd4bf', '#fb7185']
        : ['#4f46e5', '#2563eb', '#0f766e', '#475569', '#b45309', '#dc2626', '#7c3aed', '#0284c7', '#047857', '#e11d48', '#334155', '#64748b', '#a855f7', '#d97706', '#0d9488', '#f43f5e'];
    const chartColorSeed = String(chart?.id ?? chart?.chart_id ?? chart?.title ?? chart?.metric ?? chart?.dimension ?? chart?.type ?? 'chart');
    const safeChartId = chartColorSeed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chart';
    const baseColorIndex = Array.from(chartColorSeed).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 0) % polishedPalette.length;
    const getPaletteColor = (index: number) => polishedPalette[(baseColorIndex + index) % polishedPalette.length];
    const chartInstanceKey = `${safeChartId}-${String(chart?.type || 'chart')}-${rawChartData?.length ?? 0}-${quickReact ? 'q' : 'n'}-${theme}`;
    const chartRedraw = true;

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

    // Currency and rate detection — trust backend format_type when explicitly set
    const chartTitleLower = (chart.title || '').toLowerCase();
    const formatType = chart?.format_type;
    const isChartExplicitCurrency = formatType === 'currency';
    const isChartExplicitPercent = formatType === 'percentage' || formatType === 'percent';
    // Only infer percent from title if format_type is NOT set to currency
    const isPercent = isChartExplicitPercent || (!formatType && !isChartExplicitCurrency && (chartTitleLower.includes('rate') || chartTitleLower.includes('%')));

    const countLikeMetricTokens = [
        'record', 'records', 'count', 'orders', 'order', 'customers', 'units', 'qty', 'quantity', 'volume',
        'click', 'clicks', 'impression', 'impressions', 'view', 'views', 'session', 'sessions', 'visit', 'visits',
        'employees',
    ];
    const isCountLikeMetric = (label?: string) => {
        const token = String(label || '').toLowerCase();
        return countLikeMetricTokens.some((kw) => token.includes(kw));
    };

    const isCurrencyMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        // Explicit backend currency value_labels: "USD/day", "USD/hr", "USD/mo", "USD"
        if (token.startsWith('usd')) return true;
        // Explicit backend format_type takes priority
        if (isChartExplicitCurrency) return true;
        return ['revenue', 'cost', 'costs', 'spend', 'budget', 'income', 'sales', 'profit', 'payment',
            'charge', 'charges', 'price', 'amount', 'roi', 'roas',
            'salary', 'wage', 'compensation', 'payroll',
            'daily rate', 'hourly rate', 'monthly rate', 'monthly income',
        ].some((kw) => token.includes(kw));
    };

    const isPercentMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        // If backend says it's currency, never treat as percent even if label has 'rate'
        if (isChartExplicitCurrency || token.startsWith('usd')) return false;
        return ['percent', 'percentage', 'pct', 'ctr', 'cvr', 'ratio', 'margin'].some((kw) => token.includes(kw))
            // 'rate' only counts as percent if not a pay rate
            || (token.includes('rate') && !['daily', 'hourly', 'monthly', 'annual'].some(p => token.includes(p)));
    };

    const isWholeNumberMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        return ['tenure', 'age', 'duration', 'month', 'months', 'year', 'years', 'day', 'days',
            'los', 'length of stay', 'lengthofstay',
            'miles', 'km', 'hours', 'sessions', 'count',
            'rating',  // Likert scale: "Rating (1-4)"
        ].some((kw) => token.includes(kw));
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

        // ── Backend format_type is AUTHORITATIVE when set ──
        // This ensures DailyRate shows $, JobSatisfaction shows plain number, etc.
        if (isChartExplicitPercent && !isCurrencyMetricLabel(label)) {
            const pctValue = Math.abs(value) <= 1 ? value * 100 : value;
            return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(pctValue)}%`;
        }
        if (isChartExplicitCurrency && !isPercentMetricLabel(label)) {
            return compactNumber(value, true);
        }

        // ── Label-based detection (fallback when format_type not set) ──
        if (isPercentMetricLabel(label) || label.includes('%') || (fallbackChartLevel && (!label && isPercent))) {
            const pctValue = Math.abs(value) <= 1 ? value * 100 : value;
            return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(pctValue)}%`;
        }

        if (isCurrencyMetricLabel(label) || (!label && fallbackChartLevel && formatType === 'currency')) {
            return compactNumber(value, true);
        }

        // Always check chart.value_label for unit context (Miles, Rating, Sessions, etc.)
        // regardless of fallbackChartLevel — value_label is explicitly set by backend
        if (isWholeNumberMetricLabel(label) || isWholeNumberMetricLabel(chartLevelLabel)) {
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
        // Enable chart-level fallback when backend explicitly set format_type
        const hasExplicitFormat = !!formatType;
        const chartLevelPercentFallback = isPercent
            && !isCurrencyMetricLabel(metricLabel)
            && !isWholeNumberMetricLabel(metricLabel)
            && !isCountLikeMetric(metricLabel);
        return formatByLabel(v, metricLabel, !hasMetricLabel || chartLevelPercentFallback || hasExplicitFormat);
    };

    const fmtTick = (v: any, metricLabel?: string): string => {
        if (typeof v !== 'number') return String(v ?? '');
        const hasMetricLabel = !!String(metricLabel || '').trim();
        const hasExplicitFormat = !!formatType;
        const chartLevelPercentFallback = isPercent
            && !isCurrencyMetricLabel(metricLabel)
            && !isWholeNumberMetricLabel(metricLabel)
            && !isCountLikeMetric(metricLabel);
        return formatByLabel(v, metricLabel, !hasMetricLabel || chartLevelPercentFallback || hasExplicitFormat);
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

    const isTemporalXAxis = (() => {
        const dimStr = String(chart.x_axis || chart.dimension || nameKey || '').toLowerCase();
        // Tenure, age, duration, etc. are numeric lifecycles, not temporal dates
        if (['tenure', 'age', 'duration'].some(kw => dimStr.includes(kw))) {
            return false;
        }

        // If category labels are purely numeric, it's not a temporal axis (e.g. numeric bins)
        const allNumericCategories = categoryLabels.length > 0 && categoryLabels.every(lbl => {
            const trimmed = String(lbl || '').trim();
            return trimmed !== '' && !isNaN(Number(trimmed));
        });
        if (allNumericCategories) {
            return false;
        }

        return ['line', 'area', 'stacked'].includes(String(chart.type || '').toLowerCase())
            || /date|time|timestamp|year_month|fiscal_period/i.test(dimStr)
            || categoryLabels.some((label) => isLikelyDateLabel(label));
    })();

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
    const dimensionAxisLabel = toHumanLabel(chart.x_axis || chart.dimension || nameKey || 'Category', chart.title);

    const valueAxisLabel = (function () {
        const rawMetricLabel = toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title);
        const rawValueLabel = String(chart.value_label || '').trim();

        // 1. Check for explicit count-like indicators in the data or config
        const firstRow = rawChartData[0] || {};
        const hasOrderId = 'order_id' in firstRow || 'orderid' in firstRow || 'order_no' in firstRow;
        const hasCustomerId = 'customer_id' in firstRow || 'customerid' in firstRow;

        if (rawMetricLabel.toLowerCase().includes('count') || rawValueLabel.toLowerCase().includes('count')) {
            if (hasOrderId) return 'Order Count';
            if (hasCustomerId) return 'Customer Count';
        }

        const unitSuffixes = ['usd', 'rating', 'miles', 'km', 'years', 'sessions', 'hours', 'count', '%'];
        const hasUnitSuffix = rawValueLabel && unitSuffixes.some(u => rawValueLabel.toLowerCase().startsWith(u) || rawValueLabel.toLowerCase().includes('('));

        return hasUnitSuffix && rawValueLabel.toLowerCase() !== rawMetricLabel.toLowerCase()
            ? `${rawMetricLabel} (${toHumanLabel(rawValueLabel, chart.title)})`
            : rawMetricLabel;
    })();

    const scatterXAxisLabel = toHumanLabel(chart.x_axis || chart.dimension || nameKey || 'X', chart.title);
    const scatterYAxisLabel = toHumanLabel(chart.y_axis || chart.metric || chart.value_label || 'Y', chart.title);

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
                <button
                    type="button"
                    onClick={() => setShowOutliers(!showOutliers)}
                    className={`text-[10px] font-medium px-2 py-1 rounded border transition-colors flex items-center gap-1 ${isDark
                        ? (showOutliers ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' : 'bg-gray-800 border-border-main text-themed-muted hover:bg-gray-700')
                        : (showOutliers ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-gray-50 border-gray-200 text-themed-muted hover:bg-gray-100')
                        }`}
                    title={showOutliers ? "Click to exclude extreme outliers" : "Click to include extreme outliers"}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {chart.outliers.count} {showOutliers ? 'outliers included' : 'outliers excluded'}
                </button>
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
                let rawValue = '';
                const rawLabel = first.label;
                if (rawLabel !== undefined && rawLabel !== null && String(rawLabel).trim() !== '') {
                    rawValue = normalizeLabel(rawLabel);
                } else {
                    const rawName = first?.raw?.label ?? first?.raw?.name ?? first?.raw?._data?.name;
                    if (rawName !== undefined && rawName !== null && String(rawName).trim() !== '') {
                        rawValue = normalizeLabel(rawName);
                    }
                }
                return rawValue;
            },
            label: (ctx: any) => {
                if (ctx?.raw && typeof ctx.raw === 'object' && ('x' in ctx.raw || 'y' in ctx.raw)) {
                    const xLbl = ctx.raw.xLabel || scatterXAxisLabel;
                    const yLbl = ctx.raw.yLabel || scatterYAxisLabel;
                    const lines: string[] = [];
                    if (ctx.raw.x !== undefined) lines.push(` ${xLbl}: ${fmtTick(ctx.raw.x, xLbl)}`);
                    if (ctx.raw.y !== undefined) lines.push(` ${yLbl}: ${fmtTick(ctx.raw.y, yLbl)}`);
                    return lines;
                }

                const rawSeriesLabel = String(ctx.dataset.label || tooltipMetricLabel || 'Value');
                const seriesLabel = toHumanLabel(rawSeriesLabel, chart.title);
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
                    callback: function (val: any, index: number) {
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
                    callback: function (val: any, index: number) {
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


    const renderChartBody = () => {
        switch (chart.type) {
            case 'bar':
                return (
                    <div className="flex flex-col h-full w-full">
                        {renderOutlierToggle()}
                        <div style={{ height: 192, width: '100%' }}>
                            <Bar
                                key={`${chartInstanceKey}-bar-x`}
                                redraw={chartRedraw}
                                data={{
                                    labels: categoryLabels,
                                    datasets: [{
                                        label: toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title),
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
                                key={`${chartInstanceKey}-bar-y`}
                                redraw={chartRedraw}
                                data={{
                                    labels: categoryLabels,
                                    datasets: [{
                                        label: toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title),
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
                                    key={`${chartInstanceKey}-stacked`}
                                    redraw={chartRedraw}
                                    data={{
                                        labels: categoryLabels,
                                        datasets: activeStackKeys.map((key, idx) => ({
                                            label: toHumanLabel(key, chart.title),
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
                                key={`${chartInstanceKey}-pie`}
                                redraw={chartRedraw}
                                data={{
                                    labels: chartData.map((d: any) => normalizeLabel(d[nameKey] || d.name)),
                                    datasets: [{
                                        label: toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title),
                                        data: chartData.map((d: any) => d.value),
                                        backgroundColor: chartData.map((_: any, i: number) => getPaletteColor(i)),
                                        borderWidth: 2,
                                        borderColor: isDark ? '#000000' : '#FDFBF7'
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
                                key={`${chartInstanceKey}-polar`}
                                redraw={chartRedraw}
                                data={{
                                    labels: chartData.map((d: any) => normalizeLabel(d[nameKey] || d.name)),
                                    datasets: [{
                                        label: toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title),
                                        data: chartData.map((d: any) => d.value),
                                        backgroundColor: chartData.map((_: any, i: number) => getPaletteColor(i)),
                                        borderWidth: 2,
                                        borderColor: isDark ? '#000000' : '#FDFBF7'
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
                                    key={`${chartInstanceKey}-line`}
                                    redraw={chartRedraw}
                                    data={{
                                        labels: chartData.map((d: any) => d.timestamp || d.date || d[nameKey]),
                                        datasets: chart.type === 'stacked'
                                            ? activeLineStackKeys.map((cat: string, i: number) => ({
                                                label: toHumanLabel(cat, chart.title),
                                                data: chartData.map((d: any) => getSeriesValue(d, cat, i)),
                                                backgroundColor: getPaletteColor(i),
                                                borderColor: getPaletteColor(i),
                                                fill: true
                                            }))
                                            : [{
                                                label: toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title),
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
                                key={`${chartInstanceKey}-scatter`}
                                redraw={chartRedraw}
                                data={{
                                    datasets: [{
                                        label: toHumanLabel(chart.y_axis || chart.metric || 'Value', chart.title),
                                        data: chartData.map((d: any) => ({ x: d.x, y: d.y, xLabel: d.xLabel, yLabel: d.yLabel })),
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
                                key={`${chartInstanceKey}-bubble`}
                                redraw={chartRedraw}
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
                                key={`${chartInstanceKey}-radar`}
                                redraw={chartRedraw}
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
                                key={`${chartInstanceKey}-treemap`}
                                redraw={chartRedraw}
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

    return (
        <div className="flex flex-col h-full w-full justify-between">
            {renderChartBody()}
            {renderNullWarning()}
        </div>
    );
};

export default ChartRenderer;
