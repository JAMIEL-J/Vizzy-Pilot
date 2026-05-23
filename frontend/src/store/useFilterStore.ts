import { create } from 'zustand';

export interface ChartOverride {
    type?: string;
    aggregation?: string;
}

export type ClassificationRole = "Dimension" | "Metric" | "Target" | "Date" | "Excluded";

export interface DashboardState {
    datasetId: string | null;
    rawData: any[] | null;
    chartConfigs: Record<string, any> | null;
    initialChartData: Record<string, any> | null;
    chartData: Record<string, any> | null;
    active_filters: Record<string, string[]>;
    chart_overrides: Record<string, ChartOverride>;
    classification_overrides: Record<string, ClassificationRole>;
    selected_domain: string | null;
    target_column: string | null;
    target_value: string;
    total_records: number;

    setDashboardData: (rawData: any[], chartConfigs: Record<string, any>, initialChartData: Record<string, any>, totalRows: number, targetCol?: string | null, datasetId?: string | null) => void;
    syncServerChartData: (charts: Record<string, any>) => void;
    setTargetValue: (value: string) => void;
    setFilter: (column: string, value: string) => void;
    setFilterValues: (column: string, values: string[]) => void;
    toggleFilter: (column: string, value: string) => void;
    removeFilter: (column: string, value: string) => void;
    clearFilters: () => void;
    setChartOverride: (chartId: string, override: ChartOverride) => void;
    setClassificationOverride: (column: string, role: ClassificationRole) => void;
    setDomain: (domain: string | null) => void;
    resetState: () => void;
}

const getRowValue = (row: any, key: string) => {
    if (key in row) return row[key];
    // Case-insensitive fallback
    const lowerKey = key.toLowerCase();
    const actualKey = Object.keys(row).find(k => k.toLowerCase() === lowerKey);
    if (actualKey) return row[actualKey];

    // Normalized fallback: handles spaces/underscores/casing differences
    const normalizeKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNorm = normalizeKey(String(key));
    const fuzzyKey = Object.keys(row).find(k => normalizeKey(k) === targetNorm);
    return fuzzyKey ? row[fuzzyKey] : undefined;
};

const normalizeScalar = (value: any): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
};

const normalizeKey = (value: string): string => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const POSITIVE_TARGET_VALUES = new Set([
    '1', '1.0', 'yes', 'true', 'y', 'positive', 'churned', 'churn', 'exited', 'attrited', 'left', 'cancelled', 'canceled', 'defaulted', 'inactive'
]);

const NEGATIVE_TARGET_VALUES = new Set([
    '0', '0.0', 'no', 'false', 'n', 'negative', 'retained', 'stayed', 'active', 'performing'
]);

const isPositiveTargetValue = (value: any): boolean => POSITIVE_TARGET_VALUES.has(normalizeScalar(value));

const isNegativeTargetValue = (value: any): boolean => NEGATIVE_TARGET_VALUES.has(normalizeScalar(value));

const isBinarySemanticMatch = (rowValue: any, filterValue: any): boolean => {
    const rowNorm = normalizeScalar(rowValue);
    const filterNorm = normalizeScalar(filterValue);
    if (!rowNorm || !filterNorm) return false;

    if (POSITIVE_TARGET_VALUES.has(rowNorm) && POSITIVE_TARGET_VALUES.has(filterNorm)) return true;
    if (NEGATIVE_TARGET_VALUES.has(rowNorm) && NEGATIVE_TARGET_VALUES.has(filterNorm)) return true;
    return false;
};

const seenUnknownTargetValues = new Set<string>();

const toTargetBinary = (value: any): number | null => {
    if (value === null || value === undefined) {
        return null;
    }

    if (isPositiveTargetValue(value)) return 1;
    if (isNegativeTargetValue(value)) return 0;

    const raw = String(value);
    if (!seenUnknownTargetValues.has(raw)) {
        seenUnknownTargetValues.add(raw);
        console.warn('[Dashboard] Unexpected target value for binary conversion:', raw);
    }
    return null;
};

const getTargetSemanticLabels = (targetColumn?: string | null): { positive: string; negative: string } => {
    const key = normalizeKey(String(targetColumn || ''));

    if (key.includes('churn')) return { positive: 'Churned', negative: 'Retained' };
    if (key.includes('exit')) return { positive: 'Exited', negative: 'Stayed' };
    if (key.includes('attrition')) return { positive: 'Attrited', negative: 'Retained' };
    if (key.includes('left') || key.includes('leave')) return { positive: 'Left', negative: 'Stayed' };
    if (key.includes('cancel')) return { positive: 'Cancelled', negative: 'Active' };
    if (key.includes('default')) return { positive: 'Defaulted', negative: 'Performing' };

    return { positive: 'Positive', negative: 'Negative' };
};

const formatTargetDisplayValue = (value: any, targetColumn?: string | null): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return 'Unknown';

    if (!isPositiveTargetValue(raw) && !isNegativeTargetValue(raw)) return raw;

    const labels = getTargetSemanticLabels(targetColumn);
    return isPositiveTargetValue(raw) ? labels.positive : labels.negative;
};

const percentile = (values: number[], p: number): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const scalarMatches = (rowValue: any, filterValue: any): boolean => {
    const rowRaw = String(rowValue);
    const filterRaw = String(filterValue);
    if (rowRaw === filterRaw) return true;

    const rowNorm = normalizeScalar(rowValue);
    const filterNorm = normalizeScalar(filterValue);
    if (rowNorm === filterNorm) return true;

    const rowNum = Number(rowNorm);
    const filterNum = Number(filterNorm);
    if (!Number.isNaN(rowNum) && !Number.isNaN(filterNum)) {
        return rowNum === filterNum;
    }

    return false;
};

type NumericRange = {
    min: number;
    max: number;
    minInclusive: boolean;
    maxInclusive: boolean;
};

const parseRangeFilter = (value: string): NumericRange | null => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    // Pattern: "... 21-46" or "... 21–46" (supports negatives/decimals, commas, currency signs)
    const dashMatch = raw.match(/(-?\d[\d,]*(?:\.\d+)?)\s*[\u2013\u2014\-]\s*(-?\d[\d,]*(?:\.\d+)?)/);
    if (dashMatch) {
        const min = Number(dashMatch[1].replace(/,/g, ''));
        const max = Number(dashMatch[2].replace(/,/g, ''));
        if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
            return { min, max, minInclusive: true, maxInclusive: true };
        }
    }

    // Pattern: ">= 46"
    const gteMatch = raw.match(/>=\s*(-?\d[\d,]*(?:\.\d+)?)/);
    if (gteMatch) {
        const min = Number(gteMatch[1].replace(/,/g, ''));
        if (Number.isFinite(min)) {
            return { min, max: Number.POSITIVE_INFINITY, minInclusive: true, maxInclusive: true };
        }
    }

    // Pattern: "<= 46"
    const lteMatch = raw.match(/<=\s*(-?\d[\d,]*(?:\.\d+)?)/);
    if (lteMatch) {
        const max = Number(lteMatch[1].replace(/,/g, ''));
        if (Number.isFinite(max)) {
            return { min: Number.NEGATIVE_INFINITY, max, minInclusive: true, maxInclusive: true };
        }
    }

    // Pattern: "< 46"
    const ltMatch = raw.match(/<\s*(-?\d[\d,]*(?:\.\d+)?)/);
    if (ltMatch) {
        const max = Number(ltMatch[1].replace(/,/g, ''));
        if (Number.isFinite(max)) {
            return { min: Number.NEGATIVE_INFINITY, max, minInclusive: true, maxInclusive: false };
        }
    }

    // Pattern: "> 46"
    const gtMatch = raw.match(/>\s*(-?\d[\d,]*(?:\.\d+)?)/);
    if (gtMatch) {
        const min = Number(gtMatch[1].replace(/,/g, ''));
        if (Number.isFinite(min)) {
            return { min, max: Number.POSITIVE_INFINITY, minInclusive: false, maxInclusive: true };
        }
    }

    return null;
};

const numericInRange = (value: any, range: NumericRange): boolean => {
    const n = Number(value);
    if (!Number.isFinite(n)) return false;

    const lowerOk = range.minInclusive ? n >= range.min : n > range.min;
    const upperOk = range.maxInclusive ? n <= range.max : n < range.max;
    return lowerOk && upperOk;
};

const inferDimensionFromChartRows = (rawData: any[], chartRows: any[]): string | null => {
    if (!Array.isArray(rawData) || rawData.length === 0 || !Array.isArray(chartRows) || chartRows.length === 0) {
        return null;
    }

    const labels = new Set(
        chartRows
            .map((r: any) => normalizeScalar(r?.name ?? r?.date ?? r?.label))
            .filter(Boolean)
    );

    if (labels.size === 0) return null;

    const sampleRow = rawData[0] || {};
    const keys = Object.keys(sampleRow);
    if (keys.length === 0) return null;

    const maxScan = Math.min(rawData.length, 2500);
    let bestKey: string | null = null;
    let bestScore = 0;

    for (const key of keys) {
        let score = 0;
        for (let i = 0; i < maxScan; i++) {
            const rowVal = getRowValue(rawData[i], key);
            if (rowVal === undefined || rowVal === null) continue;
            if (labels.has(normalizeScalar(rowVal))) {
                score++;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestKey = key;
        }
    }

    // Require at least a few matches to avoid false positives on short labels.
    return bestScore >= 3 ? bestKey : null;
};

const areStringArraysEqual = (a: string[] = [], b: string[] = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const normalizeFilters = (filters: Record<string, string[]>) => {
    const normalized: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(filters || {})) {
        if (Array.isArray(values) && values.length > 0) {
            normalized[key] = values;
        }
    }
    return normalized;
};

const applyFilters = (data: any[], filters: Record<string, string[]>, targetCol: string | null, targetVal: string) => {
    if (!data) return [];

    const targetValNorm = normalizeScalar(targetVal);

    return data.filter(row => {
        // 1. Apply Target Tab Filter (e.g. Churned Users)
        if (targetCol && targetVal && targetVal.toLowerCase() !== 'all') {
            const rowVal = normalizeScalar(getRowValue(row, targetCol));
            if (POSITIVE_TARGET_VALUES.has(targetValNorm)) {
                if (!isPositiveTargetValue(rowVal)) return false;
            } else if (NEGATIVE_TARGET_VALUES.has(targetValNorm)) {
                if (!isNegativeTargetValue(rowVal)) return false;
            } else {
                if (rowVal !== targetValNorm) return false;
            }
        }

        // 2. Apply Multi-Column Filters
        return Object.entries(filters).every(([key, values]) => {
            if (!values || values.length === 0) return true;
            const rowVal = getRowValue(row, key);
            if (rowVal === undefined || rowVal === null) return false;
            const isTargetFilterKey = !!(targetCol && normalizeKey(key) === normalizeKey(targetCol));

            return values.some(v => {
                if (scalarMatches(rowVal, v)) return true;
                if (isBinarySemanticMatch(rowVal, v)) return true;

                if (isTargetFilterKey) {
                    const filterNorm = normalizeScalar(v);
                    if (POSITIVE_TARGET_VALUES.has(filterNorm)) return isPositiveTargetValue(rowVal);
                    if (NEGATIVE_TARGET_VALUES.has(filterNorm)) return isNegativeTargetValue(rowVal);

                    const displayNorm = normalizeScalar(formatTargetDisplayValue(rowVal, targetCol));
                    if (displayNorm === filterNorm) return true;
                }

                const parsed = parseRangeFilter(String(v));
                if (!parsed) return false;
                return numericInRange(rowVal, parsed);
            });
        });
    });
};

const aggregateValues = (values: any[], method: string, scalingFactor: number = 1) => {
    const methodUpper = (method || 'SUM').toUpperCase();
    if (methodUpper === 'COUNT') return Math.round(values.length * scalingFactor);

    // Convert to numbers and strip NaNs
    const nums = values
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(v => Number(v))
        .filter(v => Number.isFinite(v));
    if (!nums.length) return 0;

    // Averages/Means do not need scaling as the sample is an unbiased estimator
    if (methodUpper === 'AVG' || methodUpper === 'MEAN') return nums.reduce((a, b) => a + b, 0) / nums.length;

    if (methodUpper === 'MIN') return Math.min(...nums);
    if (methodUpper === 'MAX') return Math.max(...nums);

    // Sums must be scaled by the sampling ratio to represent the full dataset
    return (nums.reduce((a, b) => a + b, 0)) * scalingFactor;
};

const recomputeCharts = (
    rawData: any[],
    chartConfigs: Record<string, any>,
    filters: Record<string, string[]>,
    overrides: Record<string, ChartOverride>,
    targetCol: string | null,
    targetVal: string,
    existingCharts: Record<string, any> | null = null,
    targetChartId?: string,
    totalRecords: number = 0,
    initialChartData: Record<string, any> | null = null
) => {
    if (!rawData || !chartConfigs) return existingCharts;
    const filtered = applyFilters(rawData, filters, targetCol, targetVal);

    const hasActiveFilters = Object.keys(filters).length > 0 || normalizeScalar(targetVal) !== 'all';
    const hasNoFilters = Object.keys(filters).length === 0 && targetVal === 'all';

    // Scale unconditionally to match the backend KPI calculations which scan the full un-sampled dataframe.
    const scalingFactor = (totalRecords > 0 && rawData.length > 0)
        ? totalRecords / rawData.length
        : 1;

    // If existingCharts is provided, we merge into it (targeted update).
    // Otherwise we start fresh (full update).
    const charts: Record<string, any> = existingCharts ? { ...existingCharts } : {};

    const configsToProcess = targetChartId
        ? (chartConfigs[targetChartId] ? { [targetChartId]: chartConfigs[targetChartId] } : null)
        : chartConfigs;

    if (!configsToProcess) return charts;

    for (const [slotId, config] of Object.entries(configsToProcess)) {
        const override = overrides[slotId] || {};
        const seedRows = (initialChartData?.[slotId] as any[]) || (existingCharts?.[slotId] as any[]) || [];
        const dimension = config.dimension || inferDimensionFromChartRows(rawData, seedRows);
        const metric = config.metric;
        const aggregation = (override.aggregation || config.aggregation || (metric ? 'SUM' : 'COUNT')).toUpperCase();
        const metricIsTarget = !!(metric && targetCol && normalizeKey(metric) === normalizeKey(targetCol));
        const isRateChart = /rate|%/i.test(String(config.title || ''));
        const isCohortChart = /cohort/i.test(String(config.title || ''));
        const isRangeChart = /range/i.test(String(config.title || ''));
        const isAtRiskChart = /at\s*risk/i.test(String(config.title || ''));

        const shouldIncludeMetricRow = (row: any): boolean => {
            if (!metric) return true;
            if (!isAtRiskChart || !targetCol) return true;
            const rowTarget = getRowValue(row, targetCol);
            return toTargetBinary(rowTarget) === 1;
        };

        // Range charts should preserve backend-provided bins/labels instead of regrouping by raw metric values.
        if (dimension && isRangeChart && seedRows.length > 0) {
            const bins = seedRows
                .map((r: any) => {
                    const label = String(r?.name ?? '');
                    const parsed = parseRangeFilter(label);
                    if (!parsed) return null;
                    return { label, ...parsed };
                })
                .filter((b): b is ({ label: string } & NumericRange) => !!b);

            if (bins.length > 0) {
                const groupedRange: Record<string, any[]> = {};

                for (const row of filtered) {
                    const x = Number(getRowValue(row, dimension));
                    if (!Number.isFinite(x)) continue;

                    const match = bins.find((b) => numericInRange(x, b));
                    if (!match) continue;

                    if (!groupedRange[match.label]) groupedRange[match.label] = [];

                    if (!metric) {
                        groupedRange[match.label].push(1);
                    } else {
                        if (!shouldIncludeMetricRow(row)) continue;
                        const m = getRowValue(row, metric);
                        if (metricIsTarget) {
                            const binary = toTargetBinary(m);
                            if (binary !== null) groupedRange[match.label].push(binary);
                        } else {
                            const n = Number(m);
                            if (Number.isFinite(n)) groupedRange[match.label].push(n);
                        }
                    }
                }

                charts[slotId] = bins.map((b) => {
                    const values = groupedRange[b.label] || [];
                    let value = aggregateValues(values, aggregation, scalingFactor);
                    if (metricIsTarget && (aggregation === 'MEAN' || aggregation === 'AVG' || isRateChart)) {
                        value = value * 100;
                    }
                    return { name: b.label, value };
                });
                continue;
            }
        }

        // Cohort charts should preserve stable bins based on the full raw dataset,
        // then aggregate filtered rows into those fixed bins.
        if (dimension && isCohortChart) {
            const fullVals = (rawData || [])
                .map(r => Number(getRowValue(r, dimension)))
                .filter(v => Number.isFinite(v));

            if (fullVals.length >= 10) {
                const min = Math.min(...fullVals);
                const max = Math.max(...fullVals);
                const q25 = percentile(fullVals, 0.25);
                const q50 = percentile(fullVals, 0.50);
                const q75 = percentile(fullVals, 0.75);

                const rawBins = [min - 1e-9, q25, q50, q75, max + 1e-9];
                const bins = Array.from(new Set(rawBins)).sort((a, b) => a - b);

                if (bins.length < 3) {
                    const fallbackLabel = `All ${dimension.replace(/_/g, ' ')}`;
                    const fallbackValues: any[] = [];

                    for (const row of filtered) {
                        const x = Number(getRowValue(row, dimension));
                        if (!Number.isFinite(x)) continue;

                        if (!metric) {
                            fallbackValues.push(1);
                        } else {
                            if (!shouldIncludeMetricRow(row)) continue;
                            const m = getRowValue(row, metric);
                            if (metricIsTarget) {
                                const binary = toTargetBinary(m);
                                if (binary !== null) fallbackValues.push(binary);
                            } else {
                                const n = Number(m);
                                if (Number.isFinite(n)) fallbackValues.push(n);
                            }
                        }
                    }

                    let fallbackValue = aggregateValues(fallbackValues, aggregation, scalingFactor);
                    if (metricIsTarget && (aggregation === 'MEAN' || aggregation === 'AVG' || isRateChart)) {
                        fallbackValue = fallbackValue * 100;
                    }

                    charts[slotId] = [{ name: fallbackLabel, value: fallbackValue }];
                    continue;
                }

                const cohortLabels = bins.length === 5
                    ? [
                        `Low ${dimension.replace(/_/g, ' ')} (<=${q25.toFixed(0)})`,
                        `Mid-Low (<=${q50.toFixed(0)})`,
                        `Mid-High (<=${q75.toFixed(0)})`,
                        `High ${dimension.replace(/_/g, ' ')} (>${q75.toFixed(0)})`,
                    ]
                    : Array.from({ length: Math.max(1, bins.length - 1) }, (_, i) => `Group ${i + 1}`);

                const bucket = (v: number): string | null => {
                    for (let i = 0; i < bins.length - 1; i++) {
                        const left = bins[i];
                        const right = bins[i + 1];
                        if (v > left && v <= right) return cohortLabels[i] || `Group ${i + 1}`;
                    }
                    return null;
                };

                const groupedCohort: Record<string, any[]> = {};
                for (const row of filtered) {
                    const x = Number(getRowValue(row, dimension));
                    if (!Number.isFinite(x)) continue;
                    const label = bucket(x);
                    if (!label) continue;

                    if (!groupedCohort[label]) groupedCohort[label] = [];

                    if (!metric) {
                        groupedCohort[label].push(1);
                    } else {
                        if (!shouldIncludeMetricRow(row)) continue;
                        const m = getRowValue(row, metric);
                        if (metricIsTarget) {
                            const binary = toTargetBinary(m);
                            if (binary !== null) groupedCohort[label].push(binary);
                        } else {
                            const n = Number(m);
                            if (Number.isFinite(n)) groupedCohort[label].push(n);
                        }
                    }
                }

                const rows = cohortLabels.map((name) => {
                    const values = groupedCohort[name] || [];
                    let value = aggregateValues(values, aggregation, scalingFactor);
                    if (metricIsTarget && (aggregation === 'MEAN' || aggregation === 'AVG' || isRateChart)) {
                        value = value * 100;
                    }
                    return { name, value };
                });

                charts[slotId] = rows;
                continue;
            }
        }

        const chartType = (override.type || config.type || '').toLowerCase();
        const isScatter = chartType === 'scatter';

        if (dimension || isScatter) {
            const originalType = (config.type || '').toLowerCase();
            const isTrend = ['line', 'area', 'area_bounds', 'area-bounds'].includes(chartType) && config.is_date;
            const originalWasTrend = ['line', 'area', 'area_bounds', 'area-bounds'].includes(originalType) && config.is_date;
            const isCountOnly = !metric;

            // PERFORMANCE OPTIMIZATION: Reuse high-fidelity backend data if no filters are active and analytics logic hasn't changed
            const sameAgg = !override.aggregation || override.aggregation.toLowerCase() === (config.aggregation || (isCountOnly ? 'count' : 'sum')).toLowerCase();
            const sameTrend = isTrend === originalWasTrend;

            if (hasNoFilters && initialChartData?.[slotId]) {
                if (sameAgg && sameTrend) {
                    charts[slotId] = initialChartData[slotId];
                    continue;
                }
            }

            // STABILITY FIX: If we are only overriding TYPE (Bar -> H-Bar) and have NO other reason to recompute
            if (!hasActiveFilters && existingCharts?.[slotId]) {
                if (sameAgg && sameTrend) {
                    charts[slotId] = existingCharts[slotId];
                    continue;
                }
            }

            // Scatter charts need point-wise x/y data, not grouped name/value buckets.
            if (isScatter) {
                // Determine which keys to pull from the raw rows. 
                // We prioritize config.dimension/metric but if missing (common in scatter), 
                // we try to use the ones defined in the titles or metadata.
                const xKey = dimension || config.x_column;
                const yKey = metric || config.y_column;

                if (!xKey || !yKey) {
                    // Final fallback: if no keys found, we can't filter locally, keep server data.
                    charts[slotId] = seedRows;
                    continue;
                }

                const scatterPoints = filtered
                    .map((row) => ({
                        x: Number(getRowValue(row, xKey)),
                        y: Number(getRowValue(row, yKey)),
                        xLabel: xKey,
                        yLabel: yKey
                    }))
                    .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));

                // Always take a representative sample but capped for performance
                charts[slotId] = scatterPoints.length > 1000 ? scatterPoints.slice(0, 1000) : scatterPoints;
                continue;
            }

            // Stacked churn/target volume charts require { positive, negative } keys.
            if (chartType === 'stacked_bar') {
                const groupedStacked = filtered.reduce((acc, row) => {
                    const dimVal = getRowValue(row, dimension);
                    const key = dimVal === null || dimVal === undefined ? 'Unknown' : String(dimVal);

                    if (!acc[key]) {
                        acc[key] = { positive: 0, negative: 0 };
                    }

                    const metricSource = metric
                        ? getRowValue(row, metric)
                        : (targetCol ? getRowValue(row, targetCol) : undefined);

                    if (metricSource === undefined || metricSource === null) {
                        return acc;
                    }

                    const binary = toTargetBinary(metricSource);
                    if (binary === null) {
                        return acc;
                    }

                    if (binary === 1) acc[key].positive += 1;
                    else acc[key].negative += 1;

                    return acc;
                }, {} as Record<string, { positive: number; negative: number }>);

                const rows = (Object.entries(groupedStacked) as Array<[string, { positive: number; negative: number }]>)
                    .filter(([name]) => name !== 'Unknown')
                    .map(([name, counts]) => ({
                        name,
                        positive: Math.round(counts.positive * scalingFactor),
                        negative: Math.round(counts.negative * scalingFactor),
                    }))
                    .sort((a, b) => b.positive - a.positive)
                    .slice(0, 10);

                charts[slotId] = rows;
                continue;
            }

            // 1. Calculate Date Binning if needed
            let freq: 'D' | 'W' | 'M' = 'D';
            let maxMonthDay = '';
            if (isTrend || config.granularity === 'ytd' || config.granularity === 'year') {
                if (isTrend) {
                    // Keep client-side filtered trend behavior identical to backend trend aggregation.
                    freq = 'M';
                }

                const dates = filtered.map(r => new Date(getRowValue(r, dimension))).filter(d => !isNaN(d.getTime()));
                if (dates.length > 0) {
                    const times = dates.map(d => d.getTime());
                    const minDate = Math.min(...times);
                    const maxDate = Math.max(...times);
                    const days = (maxDate - minDate) / (1000 * 60 * 60 * 24);
                    if (!isTrend) {
                        if (days > 365) freq = 'M';
                        else if (days > 60) freq = 'W';
                    }

                    if (config.granularity === 'ytd') {
                        const dMax = new Date(maxDate);
                        maxMonthDay = (dMax.getMonth() + 1).toString().padStart(2, '0') + dMax.getDate().toString().padStart(2, '0');
                    }
                }
            }

            // 2. Group by dimension (with date binning & YTD filter)
            const grouped = filtered.reduce((acc, row) => {
                let val = getRowValue(row, dimension);
                let key: string;

                const isYearly = config.granularity === 'year';
                const isYTD = config.granularity === 'ytd';

                if ((isTrend || isYearly || isYTD) && val) {
                    const d = new Date(val);
                    if (isNaN(d.getTime())) {
                        key = 'Unknown';
                    } else if (isYearly) {
                        key = String(d.getFullYear());
                    } else if (isYTD) {
                        // YTD Filter: Only include rows if month/day <= max visible month/day
                        const currentMD = (d.getMonth() + 1).toString().padStart(2, '0') + d.getDate().toString().padStart(2, '0');
                        if (maxMonthDay && currentMD > maxMonthDay) return acc;
                        key = `${d.getFullYear()} YTD`;
                    } else {
                        if (freq === 'M') {
                            d.setDate(1); // First of month
                        } else if (freq === 'W') {
                            const day = d.getDay();
                            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
                            d.setDate(diff);
                        }
                        key = d.toISOString().split('T')[0];
                    }
                } else {
                    if (val === null || val === undefined) {
                        key = 'Unknown';
                    } else if (targetCol && normalizeKey(dimension) === normalizeKey(targetCol)) {
                        key = formatTargetDisplayValue(val, targetCol);
                    } else {
                        key = String(val);
                    }
                }

                if (!acc[key]) acc[key] = [];
                let metricVal: any = metric ? getRowValue(row, metric) : 1;
                if (metric && metricIsTarget) {
                    metricVal = toTargetBinary(metricVal);
                    if (metricVal === null) {
                        return acc;
                    }
                } else if (metric && !shouldIncludeMetricRow(row)) {
                    return acc;
                }
                
                // For target metrics, 'COUNT' means count positive instances (SUM of binary 0/1)
                const shouldPushBinary = metric && metricIsTarget && aggregation === 'COUNT';
                acc[key].push(aggregation === 'COUNT' && !shouldPushBinary ? 1 : metricVal);
                return acc;
            }, {} as Record<string, any[]>);

            let chartData = Object.entries(grouped).map(([name, values]) => {
                const effectiveAggregation = (metricIsTarget && aggregation === 'COUNT') ? 'SUM' : aggregation;
                let computed = aggregateValues(values as any[], effectiveAggregation, scalingFactor);
                if (metricIsTarget && (aggregation === 'MEAN' || aggregation === 'AVG' || isRateChart)) {
                    computed = computed * 100;
                }
                const item: any = { value: computed };
                if (isTrend) {
                    item.timestamp = name;
                    item.date = name;
                } else {
                    item.name = name;
                }
                return item;
            });

            // Map charts should keep full categorical coverage after filtering.
            if (chartType === 'geo_map') {
                chartData = chartData.filter((d) => d.name !== 'Unknown');
                chartData.sort((a, b) => b.value - a.value);
                charts[slotId] = chartData;
                continue;
            }

            const isFullData = chartType === 'scatter' || isTrend || config.granularity === 'year' || config.granularity === 'ytd';

            if (isFullData) {
                if (chartType !== 'scatter') {
                    chartData = chartData.filter(d => (d.date || d.name) !== 'Unknown');
                    // Sort chronologically (handling ISO dates, Year labels, and YTD labels)
                    chartData.sort((a, b) => {
                        const labelA = String(a.date || a.name || '');
                        const labelB = String(b.date || b.name || '');

                        const timeA = new Date(labelA).getTime();
                        const timeB = new Date(labelB).getTime();

                        // If both are valid full dates, use precise timestamp
                        if (!isNaN(timeA) && !isNaN(timeB)) return timeA - timeB;

                        // Fallback: extract year for benchmarking labels (e.g. "2016 YTD")
                        const yearA = parseInt(labelA.slice(0, 4));
                        const yearB = parseInt(labelB.slice(0, 4));
                        if (!isNaN(yearA) && !isNaN(yearB)) return yearA - yearB;

                        // Final fallback to alphabetical
                        return labelA.localeCompare(labelB);
                    });

                }
                charts[slotId] = chartData;
            } else {
                chartData.sort((a, b) => b.value - a.value);
                charts[slotId] = chartData.slice(0, 10);
            }
        }
    }
    return charts;
};

const getStorageKey = (datasetId: string | null) => {
    return datasetId ? `vizzy_dashboard_state_${datasetId}` : 'vizzy_dashboard_state_default';
};

const saveState = (datasetId: string | null, state: any) => {
    if (!datasetId) return;
    try {
        const payload = {
            active_filters: state.active_filters,
            chart_overrides: state.chart_overrides,
            classification_overrides: state.classification_overrides,
            target_value: state.target_value,
            selected_domain: state.selected_domain
        };
        sessionStorage.setItem(getStorageKey(datasetId), JSON.stringify(payload));
    } catch (e) {
        console.error('Error saving dashboard state to sessionStorage:', e);
    }
};

const loadState = (datasetId: string | null) => {
    if (!datasetId) return null;
    try {
        const item = sessionStorage.getItem(getStorageKey(datasetId));
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.error('Error loading dashboard state from sessionStorage:', e);
        return null;
    }
};

export const useFilterStore = create<DashboardState>((set, get) => ({
    datasetId: null,
    rawData: null,
    chartConfigs: null,
    chartData: null,
    active_filters: {},
    chart_overrides: {},
    classification_overrides: {},
    selected_domain: null,
    target_column: null,
    initialChartData: null,
    target_value: 'all',
    total_records: 0,

    setDashboardData: (rawData, chartConfigs, initialChartData, totalRows, targetCol, datasetId) => {
        const state = get();
        const activeDatasetId = datasetId || state.datasetId;
        const finalTargetCol = targetCol || state.target_column;

        // Load stored overrides/filters if any exist for this dataset
        const stored = loadState(activeDatasetId);
        const finalFilters = stored?.active_filters || {};
        const finalOverrides = stored?.chart_overrides || {};
        const finalClassOverrides = stored?.classification_overrides || {};
        const finalTargetVal = stored?.target_value || 'all';
        const finalDomain = stored?.selected_domain || null;

        const computedChartData = recomputeCharts(
            rawData || [],
            chartConfigs || {},
            finalFilters,
            finalOverrides,
            finalTargetCol,
            finalTargetVal,
            initialChartData,
            undefined,
            totalRows,
            initialChartData
        );

        set({
            datasetId: activeDatasetId,
            rawData,
            chartConfigs,
            initialChartData,
            chartData: computedChartData,
            target_column: finalTargetCol,
            total_records: totalRows,
            active_filters: finalFilters,
            chart_overrides: finalOverrides,
            classification_overrides: finalClassOverrides,
            target_value: finalTargetVal,
            selected_domain: finalDomain
        });
    },

    syncServerChartData: (charts) => {
        set({ chartData: charts });
    },

    setTargetValue: (value) => {
        const state = get();
        const nextChartData = recomputeCharts(
            state.rawData || [],
            state.chartConfigs || {},
            state.active_filters,
            state.chart_overrides,
            state.target_column,
            value,
            state.chartData,
            undefined,
            state.total_records,
            state.initialChartData
        );
        const nextState = {
            target_value: value,
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    setFilter: (column, value) => {
        const state = get();
        if (areStringArraysEqual(state.active_filters[column] || [], [value])) return;
        const newFilters = normalizeFilters({ ...state.active_filters, [column]: [value] });
        const nextChartData = recomputeCharts(
            state.rawData || [],
            state.chartConfigs || {},
            newFilters,
            state.chart_overrides,
            state.target_column,
            state.target_value,
            state.chartData,
            undefined,
            state.total_records,
            state.initialChartData
        );
        const nextState = {
            active_filters: newFilters,
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    setFilterValues: (column, values) => {
        const state = get();
        if (areStringArraysEqual(state.active_filters[column] || [], values || [])) return;
        const newFilters = normalizeFilters({ ...state.active_filters, [column]: values });
        const nextChartData = recomputeCharts(
            state.rawData || [],
            state.chartConfigs || {},
            newFilters,
            state.chart_overrides,
            state.target_column,
            state.target_value,
            state.chartData,
            undefined,
            state.total_records,
            state.initialChartData
        );
        const nextState = {
            active_filters: newFilters,
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    toggleFilter: (column, value) => {
        const state = get();
        const current = state.active_filters[column] || [];
        const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
        const newFilters = normalizeFilters({ ...state.active_filters, [column]: next });
        const nextChartData = recomputeCharts(
            state.rawData || [],
            state.chartConfigs || {},
            newFilters,
            state.chart_overrides,
            state.target_column,
            state.target_value,
            state.chartData,
            undefined,
            state.total_records,
            state.initialChartData
        );
        const nextState = {
            active_filters: newFilters,
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    removeFilter: (column, value) => {
        const state = get();
        const next = (state.active_filters[column] || []).filter(v => v !== value);
        const newFilters = normalizeFilters({ ...state.active_filters, [column]: next });
        const nextChartData = recomputeCharts(
            state.rawData || [],
            state.chartConfigs || {},
            newFilters,
            state.chart_overrides,
            state.target_column,
            state.target_value,
            state.chartData,
            undefined,
            state.total_records,
            state.initialChartData
        );
        const nextState = {
            active_filters: newFilters,
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    clearFilters: () => {
        const state = get();
        const nextChartData = recomputeCharts(state.rawData || [], state.chartConfigs || {}, {}, state.chart_overrides, state.target_column, state.target_value, state.chartData, undefined, state.total_records, state.initialChartData);
        const nextState = {
            active_filters: {},
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    setChartOverride: (chartId, override) => {
        const state = get();
        const newOverrides = { ...state.chart_overrides, [chartId]: { ...state.chart_overrides[chartId], ...override } };
        const nextChartData = recomputeCharts(
            state.rawData || [],
            state.chartConfigs || {},
            state.active_filters,
            newOverrides,
            state.target_column,
            state.target_value,
            state.chartData,
            chartId,
            state.total_records,
            state.initialChartData
        );
        const nextState = {
            chart_overrides: newOverrides,
            chartData: nextChartData
        };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    setClassificationOverride: (column, role) => {
        set((state) => {
            const nextClassOverrides = { ...state.classification_overrides, [column]: role };
            const nextState = { classification_overrides: nextClassOverrides };
            saveState(state.datasetId, { ...state, ...nextState });
            return nextState;
        });
    },

    setDomain: (domain) => {
        const state = get();
        const nextState = { selected_domain: domain };
        set(nextState);
        saveState(state.datasetId, { ...state, ...nextState });
    },

    resetState: () => {
        const state = get();
        if (state.datasetId) {
            try {
                sessionStorage.removeItem(getStorageKey(state.datasetId));
            } catch (e) {
                console.error(e);
            }
        }
        set({
            datasetId: null,
            rawData: null,
            chartConfigs: null,
            chartData: null,
            active_filters: {},
            chart_overrides: {},
            classification_overrides: {},
            selected_domain: null,
            target_column: null,
            target_value: 'all'
        });
    }
}));
