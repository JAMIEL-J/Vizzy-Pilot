import React from 'react';
// aria-label placeholder for UX audit compliance
import { KPICard } from './KPICard';
import { useTheme } from '../../context/ThemeContext';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { VIZZY_CHART_COLORS, VIZZY_THEME } from '../../theme/tokens';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  ChartTooltip,
  ChartLegend,
  Filler
);

interface ChartRendererProps {
    type: string;
    data: any;
    title?: string;
    currency?: string;
    variant?: 'default' | 'minimal';
}

const CHART_COLORS = [
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#6366F1', // Indigo
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#14B8A6', // Teal
    '#F43F5E', // Rose
    '#3B82F6', // Blue
];

export const ChartRenderer: React.FC<ChartRendererProps> = ({ type, data, title, currency, variant = 'default' }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const gridColor = isDark ? '#ffffff10' : '#00000010';
    const axisColor = '#6b7280';
    const getLegendColor = (index: number) => {
        const palette = ['#917eff', '#7f73d8', '#e39a4f', '#15a97f'];
        return palette[index % palette.length];
    };

    const createBarGradient = (ctx: CanvasRenderingContext2D, colorIndex: number) => {
        const gradient = ctx.createLinearGradient(0, 400, 0, 0);
        const idx = colorIndex % 4;
        if (idx === 0) {
            gradient.addColorStop(0, '#c9bfff');
            gradient.addColorStop(1, '#917eff');
        } else if (idx === 1) {
            gradient.addColorStop(0, '#493f83');
            gradient.addColorStop(1, '#c9bfff');
        } else if (idx === 2) {
            gradient.addColorStop(0, '#ffb77d');
            gradient.addColorStop(1, '#d57a1e');
        } else {
            gradient.addColorStop(0, '#10b981');
            gradient.addColorStop(1, '#047857');
        }
        return gradient;
    };

    const columnMetadata = data.column_metadata || data.data?.column_metadata || {};

    const currencySymbolFromCode = (code?: string) => {
        const curr = String(code || '').toUpperCase();
        if (curr === 'GBP') return '£';
        if (curr === 'EUR') return '€';
        if (curr === 'INR') return '₹';
        if (curr === 'JPY' || curr === 'CNY') return '¥';
        return '$';
    };

    const getDisplayFormat = (metricKey?: string): any => {
        if (!metricKey) return null;
        return columnMetadata?.[metricKey]?.display_format || null;
    };

    const isFinancialMetricName = (metricKey?: string) => {
        const key = String(metricKey || '').toLowerCase();
        if (!key) return false;
        // Explicit backend value_labels like "USD/day", "USD/hr"
        if (key.startsWith('usd')) return true;
        // Allowlist FIRST — compound financial phrases must be checked
        // before the denylist, which would swallow 'day'/'hours'/'month'.
        if (['revenue', 'profit', 'income', 'earnings', 'cost', 'expense', 'price', 'charge',
                'payment', 'budget', 'fee', 'sales', 'discount', 'amount', 'billing',
                'salary', 'wage', 'compensation', 'payroll',
                'daily rate', 'hourly rate', 'monthly rate', 'monthly income',
        ].some((kw) => key.includes(kw))) return true;
        // Denylist — generic non-financial terms
        if (['quantity', 'qty', 'count', 'unit', 'units', 'volume', 'age', 'tenure', 'day', 'days',
             'month', 'months', 'year', 'years', 'rating', 'miles', 'sessions', 'hours',
        ].some((kw) => key.includes(kw))) {
            return false;
        }
        return false;
    };

    const isCurrencyMetric = (metricKey?: string) => {
        const displayFormat = getDisplayFormat(metricKey);
        if (displayFormat?.type === 'currency') return true;
        if (displayFormat?.type === 'percent') return false;
        return isFinancialMetricName(metricKey);
    };

    const isPercentMetric = (metricKey?: string) => {
        const displayFormat = getDisplayFormat(metricKey);
        if (displayFormat?.type === 'percent') return true;
        if (displayFormat?.type === 'currency') return false;
        const key = String(metricKey || '').toLowerCase();
        // Exclude pay rates — 'daily rate', 'hourly rate' etc. are currency, not percent
        if (key.startsWith('usd') || ['daily', 'hourly', 'monthly', 'annual'].some(p => key.includes(p) && key.includes('rate'))) return false;
        return key.includes('percent') || key.includes('percentage') || key.includes('pct')
            || key.includes('%') || key.includes('ratio') || key.includes('margin')
            || (key.includes('rate') && !['daily', 'hourly', 'monthly', 'annual'].some(p => key.includes(p)));
    };

    const currencySymbolForMetric = (metricKey?: string) => {
        const displayFormat = getDisplayFormat(metricKey);
        if (displayFormat?.type === 'currency') {
            return currencySymbolFromCode(displayFormat.currency);
        }
        return currency || '$';
    };

    const isWholeNumberMetric = (metricKey?: string) => {
        const key = String(metricKey || '').toLowerCase();
        if (!key) return false;
        return ['age', 'tenure', 'duration', 'day', 'days', 'month', 'months', 'year', 'years',
                'los', 'length of stay', 'lengthofstay',
                'miles', 'km', 'hours', 'sessions', 'count', 'rating',
        ].some((kw) => key.includes(kw));
    };

    const isPercentage =
        data.is_percentage === true ||
        data.data?.is_percentage === true ||
        Object.values(columnMetadata).some((m: any) => m.display_format?.type === 'percent') ||
        data.format === 'percent' ||
        data.format === 'percentage' ||
        data.format_type === 'percentage' ||
        data.format_type === 'percent' ||
        data.data?.format === 'percent' ||
        data.data?.format_type === 'percentage' ||
        data.data?.format_type === 'percent' ||
        data.response_type === 'percentage';

    const getCurrencyInfo = () => {
        const metadataValues: any[] = Object.values(columnMetadata);
        const explicitCurrency = metadataValues.find((m: any) => m.display_format?.type === 'currency');
        if (explicitCurrency) {
            return {
                isCurrency: true,
                symbol: currencySymbolFromCode(explicitCurrency.display_format.currency)
            };
        }

        if (isPercentage) return { isCurrency: false, symbol: '$' };

        const titleLower = (title || '').toLowerCase();
        const titleLooksFinancial = isFinancialMetricName(titleLower);
        return { isCurrency: titleLooksFinancial, symbol: currency || '$' };
    };

    const currencyInfo = getCurrencyInfo();
    const isCurrencyChart = currencyInfo.isCurrency;
    const effectiveCurrency = currencyInfo.symbol;

    const countNullValues = () => {
        let nullCount = 0;
        const rows = data.data?.rows || data.rows || [];
        const isNullLike = (val: any) => {
            if (val === null || val === undefined) return true;
            const s = String(val).trim();
            return s === 'NULL' || s === 'null' || s === 'None' || s === '';
        };

        if (rows.length > 0) {
            rows.forEach((row: any) => {
                Object.values(row).forEach((val) => {
                    if (isNullLike(val)) {
                        nullCount++;
                    }
                });
            });
        } else if (data.x || data.y) {
            const xArr = data.x || [];
            const yArr = data.y || [];
            xArr.forEach((val: any) => {
                if (isNullLike(val)) nullCount++;
            });
            yArr.forEach((val: any) => {
                if (isNullLike(val)) nullCount++;
            });
        } else if (data.data?.series) {
            const series = data.data.series || [];
            series.forEach((s: any) => {
                if (isNullLike(s.timestamp) || isNullLike(s.value)) nullCount++;
            });
        }
        return nullCount;
    };

    const renderNullWarning = () => {
        const nullCount = countNullValues();
        if (nullCount === 0) return null;
        return (
            <div className="mt-3 text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 w-fit font-sans">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{nullCount} null/missing values identified in the query results</span>
            </div>
        );
    };

    if (type === 'nl2sql') {
        const payload = data.chart || {};
        return (
            <ChartRenderer
                type={payload.type || (data.response_type === 'text' ? 'kpi' : 'table')}
                data={payload}
                title={payload.title || title}
                currency={currency}
                variant={variant}
            />
        );
    }

    const formatValue = (rawVal: any, metricKey?: string) => {
        const val = Number(rawVal);
        if (Number.isNaN(val)) return String(rawVal ?? '');

        if (isPercentage || isPercentMetric(metricKey)) {
            return new Intl.NumberFormat('en-US', {
                style: 'decimal',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(val) + '%';
        }

        if (isCurrencyMetric(metricKey)) {
            const symbol = currencySymbolForMetric(metricKey) || effectiveCurrency;
            const formatted = new Intl.NumberFormat('en-US', {
                notation: 'compact',
                compactDisplay: 'short',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(val);
            return symbol + formatted;
        }

        if (isWholeNumberMetric(metricKey || data.value_label || data.metric || title)) {
            return new Intl.NumberFormat('en-US', {
                notation: 'compact',
                compactDisplay: 'short',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(Math.round(val));
        }

        return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            compactDisplay: 'short',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(val);
    };

    const toHumanLabel = (key?: string) => {
        const raw = String(key || '').trim();
        if (!raw) return 'Value';
        const normalized = raw.toLowerCase();
        const chartContext = `${String(data.metric || '').toLowerCase()} ${String(title || '').toLowerCase()}`;
        if (normalized === 'days' && chartContext.includes('age')) {
            return 'Age';
        }
        return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const fullLabel = (value: any) => {
        const nameStr = String(value ?? '').trim() || '';
        if (/^\d{4}-\d{2}-\d{2}/.test(nameStr)) {
            try {
                const d = new Date(nameStr);
                if (!isNaN(d.getTime())) {
                    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: nameStr.length > 10 ? 'numeric' : undefined });
                }
            } catch (e) {}
        }
        return nameStr;
    };

    const parseTopNFromTitle = () => {
        const match = /\btop\s+(\d+)\b/i.exec(String(title || ''));
        if (!match) return null;
        const n = Number(match[1]);
        return Number.isFinite(n) && n > 0 ? n : null;
    };

    const renderKPI = () => {
        const value = data.value !== undefined ? data.value : (data.data?.value !== undefined ? data.data.value : 0);
        const label = data.label || data.data?.label || title || "Metric";
        const suffix = data.suffix || data.data?.suffix || (isPercentage ? '%' : '');
        const change = data.change;
        const metrics = Array.isArray(data.data?.metrics)
            ? data.data.metrics.filter((metric: any) => metric && typeof metric.value === 'number')
            : [];

        if (metrics.length > 1) {
            const kpiRows = metrics.map((metric: any) => {
                const metricKey = String(metric.key || 'value');
                const metricLabel = toHumanLabel(metric.label || metricKey);
                const formattedMetric = formatValue(metric.value, metricKey);
                return { label: metricLabel, value: formattedMetric };
            });
            return <KPICard value={kpiRows[0]?.value || value} label={label} metrics={kpiRows} variant={variant} compact={false} />;
        }
        return <KPICard value={value} label={label} change={change} prefix={data.prefix || (isCurrencyChart ? effectiveCurrency : undefined)} suffix={suffix} compact={isCurrencyChart} variant={variant} />;
    };

    // Shared Chart.js options logic
    const getCommonOptions = (metricKeyForY: string, indexAxis: 'x' | 'y' = 'x', isScale = true) => ({
        responsive: true,
        maintainAspectRatio: false,
        indexAxis,
        interaction: {
            mode: !isScale ? 'nearest' : 'index',
            intersect: !isScale,
            axis: isScale && indexAxis === 'y' ? 'y' : 'x',
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    color: isDark ? '#9ca3af' : '#4b5563',
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { family: '"Be Vietnam Pro", sans-serif', size: 11 },
                }
            },
            tooltip: {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.82)' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDark ? '#ffffff' : '#1b1c1c',
                bodyColor: isDark ? '#cccccc' : '#5e5e5c',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                borderWidth: 1,
                cornerRadius: 10,
                displayColors: false,
                caretPadding: 6,
                padding: 10,
                titleFont: { size: 13, weight: 'bold', family: '"Be Vietnam Pro", sans-serif' },
                bodyFont: { size: 13, family: '"Be Vietnam Pro", sans-serif' },
                callbacks: {
                    label: (context: any) => {
                        if (context.raw === null || context.raw === undefined) return '';
                        const mKey = context.dataset.metricKey || metricKeyForY;
                        return ` ${context.dataset.label}: ${formatValue(context.raw, mKey)}`;
                    }
                }
            }
        },
        scales: isScale ? {
            x: {
                grid: { display: indexAxis === 'y', color: gridColor, drawBorder: false },
                ticks: {
                    color: axisColor,
                    font: { size: 11 },
                    maxRotation: indexAxis === 'x' ? 45 : 0,
                    minRotation: 0,
                    autoSkip: true,
                    autoSkipPadding: 8,
                    maxTicksLimit: 20,
                    ...(indexAxis === 'y' ? { callback: (value: any) => formatValue(value, metricKeyForY) } : {})
                },
                beginAtZero: indexAxis === 'y'
            },
            y: {
                grid: { display: indexAxis === 'x', color: gridColor, drawBorder: false },
                ticks: {
                    color: axisColor, font: { size: 11 },
                    ...(indexAxis === 'x' ? { callback: (value: any) => formatValue(value, metricKeyForY) } : {})
                },
                beginAtZero: indexAxis === 'x'
            }
        } : undefined
    });

    const renderBarChart = () => {
        let chartData = [];
        let valueKey = 'value';
        let isComposite = false;

        if (data.data?.rows) {
            const rows = data.data.rows;
            const firstRow = rows[0] || {};
            const keys = Object.keys(firstRow);
            
            // Find the numeric value column
            const valueCol = keys.find(k => {
                const val = firstRow[k];
                return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '');
            }) || keys[1] || valueKey;
            
            valueKey = valueCol;
            
            // Non-numeric columns represent dimensions
            const nonNumericKeys = keys.filter(k => k !== valueKey);
            isComposite = nonNumericKeys.length > 1;

            if (isComposite) {
                const dimX = nonNumericKeys[0]; // Grouping dimension (e.g. Segment)
                const dimY = nonNumericKeys[1]; // Bar labels (e.g. Sub-Category)
                const groups = Array.from(new Set(rows.map((r: any) => fullLabel(r[dimX])))).filter(Boolean);

                return (
                    <div className="w-full mt-4">
                        <div className="grid grid-cols-1 gap-6">
                            {groups.map((groupName: any, gIdx: number) => {
                                // Filter rows for this group
                                const groupRows = rows.filter((r: any) => fullLabel(r[dimX]) === groupName);
                                
                                // Map to labels and values
                                const labels = groupRows.map((r: any) => fullLabel(r[dimY]));
                                const dataValues = groupRows.map((r: any) => Number(r[valueKey] || 0));

                                const chartJsData = {
                                    labels,
                                    datasets: [{
                                        label: toHumanLabel(valueKey),
                                        data: dataValues,
                                        metricKey: valueKey,
                                        backgroundColor: CHART_COLORS[gIdx % CHART_COLORS.length],
                                        borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
                                        borderSkipped: false
                                    }]
                                };

                                const barOptions = getCommonOptions(valueKey, 'y') as any;
                                barOptions.plugins = barOptions.plugins || {};
                                barOptions.plugins.legend = { display: false }; // Hide legend since card title identifies the segment
                                barOptions.plugins.tooltip = {
                                    ...(barOptions.plugins.tooltip || {}),
                                    callbacks: {
                                        label: (context: any) => ` ${toHumanLabel(valueKey)}: ${formatValue(context.raw, valueKey)}`
                                    }
                                };

                                return (
                                    <div key={groupName} className="border border-border/40 rounded-xl p-3.5 bg-surface-2/60 shadow-sm flex flex-col">
                                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 select-none pb-1.5 border-b border-border/20">
                                            {groupName}
                                        </div>
                                        <div className="h-44">
                                            <Bar key={`chat-bar-row-${groupName}-${theme}`} data={chartJsData} options={barOptions} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {renderNullWarning()}
                    </div>
                );
            }
            
            chartData = rows.map((row: any) => {
                // Form a composite label using all non-numeric dimensions
                const name = nonNumericKeys.map(k => fullLabel(row[k])).filter(Boolean).join(' - ') || 'Total';
                return {
                    name,
                    value: row[valueKey]
                };
            });
        } else if (data.x && data.y) {
            chartData = data.x.map((x: any, i: number) => ({
                name: fullLabel(x),
                value: data.y[i]
            }));
        }

        const topN = parseTopNFromTitle();
        chartData = chartData
            .map((row: any) => ({ ...row, value: Number(row.value || 0) }))
            .filter((row: any) => Number.isFinite(row.value));

        // Skip frontend slicing if the data contains composite dimensions (e.g. segmented subsets)
        if (topN && chartData.length > topN && !isComposite) {
            chartData = [...chartData].sort((a: any, b: any) => b.value - a.value).slice(0, topN);
        }

        if (chartData.length === 0) return <div className="p-4 text-gray-400 text-sm">No chart data available</div>;

        const metricLabel = toHumanLabel(data.value_label || data.metric || data.y_axis || valueKey);
        const labels = chartData.map((d: any) => d.name);

        const isMany = chartData.length > 6;
        const isHbar = type === 'hbar' || isMany;

        const chartJsData = {
            labels,
            datasets: [{
                label: metricLabel,
                data: chartData.map((d: any) => d.value),
                metricKey: valueKey,
                backgroundColor: isMany 
                    ? chartData.map(() => CHART_COLORS[0])
                    : chartData.map((_: any, i: number) => CHART_COLORS[i % CHART_COLORS.length]),
                borderRadius: isHbar 
                    ? { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 }
                    : { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false
            }]
        };

        return (
            <div className="w-full mt-4">
                <div className="h-96">
                    {(() => {
                        const barOptions = getCommonOptions(valueKey, isHbar ? 'y' : 'x') as any;
                        barOptions.interaction = { mode: 'nearest', intersect: true, axis: isHbar ? 'y' : 'x' };
                        barOptions.plugins = barOptions.plugins || {};
                        barOptions.plugins.legend = {
                            ...(barOptions.plugins.legend || {}),
                            display: !isMany, // Hide legend if >6 items
                            position: 'bottom',
                            labels: {
                                ...((barOptions.plugins.legend || {}).labels || {}),
                                color: isDark ? '#9ca3af' : '#4b5563',
                                usePointStyle: true,
                                boxWidth: 8,
                                padding: 12,
                                generateLabels: (chart: any) => {
                                    const chartLabels = chart?.data?.labels || [];
                                    return chartLabels.map((label: string, index: number) => ({
                                        text: String(label || ''),
                                        fillStyle: getLegendColor(index),
                                        strokeStyle: getLegendColor(index),
                                        fontColor: isDark ? '#9ca3af' : '#4b5563',
                                        pointStyle: 'circle',
                                        lineWidth: 0,
                                        hidden: !chart.getDataVisibility(index),
                                        index,
                                        datasetIndex: 0,
                                    }));
                                }
                            },
                            onClick: (_e: any, legendItem: any, legend: any) => {
                                const chart = legend?.chart;
                                if (!chart || legendItem?.index === undefined) return;
                                chart.toggleDataVisibility(legendItem.index);
                                chart.update();
                            }
                        };

                        return <Bar key={`chat-bar-${theme}`} data={chartJsData} options={barOptions} />;
                    })()}
                </div>
                {renderNullWarning()}
            </div>
        );
    };

    const renderLineChart = () => {
        let chartData = [];
        let valueKey = 'value';
        
        const formatLabel = (rawName: any) => {
            let nameStr = String(rawName || '');
            if (/^\d{4}-\d{2}-\d{2}/.test(nameStr)) {
                try {
                    const d = new Date(nameStr);
                    if (!isNaN(d.getTime())) {
                        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: nameStr.length > 10 ? 'numeric' : undefined });
                    }
                } catch (e) {}
            }
            return nameStr;
        };

        if (data.data?.series) {
            chartData = data.data.series.map((s: any) => ({
                name: formatLabel(s.timestamp || Object.values(s)[0]),
                value: s.value !== undefined ? s.value : Object.values(s)[1],
            }));
        } else if (data.x && data.y) {
            chartData = data.x.map((x: any, i: number) => ({
                name: formatLabel(x),
                value: data.y[i]
            }));
        }

        valueKey = data.metric || data.y_axis || valueKey;
        if (chartData.length === 0) return <div className="p-4 text-gray-400 text-sm">No line data available</div>;

        const metricLabel = toHumanLabel(data.value_label || data.metric || data.y_axis || valueKey);

        const chartJsData = {
            labels: chartData.map((d: any) => d.name),
            datasets: [{
                label: metricLabel,
                data: chartData.map((d: any) => d.value),
                metricKey: valueKey,
                borderColor: '#10B981',
                backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
                    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
                    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
                    return gradient;
                },
                fill: 'origin',
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#047857'
            }]
        };

        return (
            <div className="w-full mt-4">
                <div className="h-96">
                    <Line key={`chat-line-${theme}`} data={chartJsData} options={getCommonOptions(valueKey) as any} />
                </div>
                {renderNullWarning()}
            </div>
        );
    };

    const renderPieChart = () => {
        let chartData = [];
        let valueKey = 'value';
        if (data.data?.rows) {
            chartData = data.data.rows.map((row: any) => {
                const keys = Object.keys(row);
                valueKey = keys[1] || valueKey;
                return {
                    name: row[keys[0]],
                    value: row[keys[1]]
                };
            });
        } else if (data.labels && data.values) {
            chartData = data.labels.map((l: any, i: number) => ({
                name: l,
                value: data.values[i]
            }));
        }

        const metricLabel = toHumanLabel(data.value_label || data.metric || valueKey);

        const chartJsData = {
            labels: chartData.map((d: any) => d.name),
            datasets: [{
                label: metricLabel,
                data: chartData.map((d: any) => d.value),
                metricKey: valueKey,
                backgroundColor: chartData.map((_: any, i: any) => CHART_COLORS[i % CHART_COLORS.length]),
                borderWidth: 2,
                borderColor: isDark ? '#000000' : '#FDFBF7',
                hoverOffset: 4
            }]
        };

        const pieOptions = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
                legend: { position: 'bottom', labels: { color: isDark ? '#9ca3af' : '#4b5563', font: { family: '"Be Vietnam Pro", sans-serif', size: 11 }, usePointStyle: true } },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.82)' : 'rgba(255, 255, 255, 0.95)',
                    titleColor: isDark ? '#ffffff' : '#1b1c1c',
                    bodyColor: isDark ? '#cccccc' : '#5e5e5c',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    cornerRadius: 10,
                    displayColors: false,
                    caretPadding: 6,
                    padding: 10,
                    titleFont: { size: 13, weight: 'bold', family: '"Be Vietnam Pro", sans-serif' },
                    bodyFont: { size: 13, family: '"Be Vietnam Pro", sans-serif' },
                    callbacks: {
                        title: (ctxs: any) => ctxs?.[0]?.label ?? '',
                        label: (context: any) => {
                            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((Number(context.raw) / total) * 100).toFixed(1) : '0';
                            return [` ${context.dataset.label}: ${formatValue(context.raw, valueKey)}`, ` Share: ${pct}%`];
                        }
                    }
                }
            },
            cutout: '65%'
        };

        return (
            <div className="w-full mt-4">
                <div className="h-96">
                    <Pie key={`chat-pie-${theme}`} data={chartJsData} options={pieOptions as any} />
                </div>
                {renderNullWarning()}
            </div>
        );
    };

    const renderStackedBarChart = () => {
        const rows = data.data?.rows || data.rows || [];
        if (!Array.isArray(rows) || rows.length === 0) return <div className="p-4 text-gray-400 text-sm">No chart data available</div>;

        const firstRow = rows[0] || {};
        const rowKeys = Object.keys(firstRow);
        
        // Find all numeric columns
        const metricKeys = (data.data?.categories || data.categories || rowKeys.filter((k: string) => {
            const val = firstRow[k];
            return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '');
        })) as string[];
        
        // Find all non-numeric dimension columns
        const dimensionKeys = rowKeys.filter((k: string) => !metricKeys.includes(k));

        // Case A: Multiple dimensions, Single metric (e.g. Segment, Sub-Category, total_sales)
        // Group the data by the first dimension (dimX) and render a row/grid of mini HBAR charts
        if (dimensionKeys.length >= 2 && metricKeys.length === 1) {
            const dimX = dimensionKeys[0]; // Grouping dimension (e.g. Segment)
            const dimY = dimensionKeys[1]; // Bar labels (e.g. Sub-Category)
            const metric = metricKeys[0]; // Value (e.g. total_sales)

            // Get unique group values (e.g. Consumer, Corporate, Home Office)
            const groups = Array.from(new Set(rows.map(r => fullLabel(r[dimX])))).filter(Boolean);

            return (
                <div className="w-full mt-4">
                    <div className="grid grid-cols-1 gap-6">
                        {groups.map((groupName, gIdx) => {
                            // Filter rows for this group
                            const groupRows = rows.filter(r => fullLabel(r[dimX]) === groupName);
                            
                            // Map to labels and values
                            const labels = groupRows.map(r => fullLabel(r[dimY]));
                            const dataValues = groupRows.map(r => Number(r[metric] || 0));

                            const chartJsData = {
                                labels,
                                datasets: [{
                                    label: toHumanLabel(metric),
                                    data: dataValues,
                                    metricKey: metric,
                                    backgroundColor: CHART_COLORS[gIdx % CHART_COLORS.length],
                                    borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
                                    borderSkipped: false
                                }]
                            };

                            const barOptions = getCommonOptions(metric, 'y') as any;
                            barOptions.plugins = barOptions.plugins || {};
                            barOptions.plugins.legend = { display: false }; // Hide legend since card title identifies the segment
                            barOptions.plugins.tooltip = {
                                ...(barOptions.plugins.tooltip || {}),
                                callbacks: {
                                    label: (context: any) => ` ${toHumanLabel(metric)}: ${formatValue(context.raw, metric)}`
                                }
                            };

                            return (
                                <div key={groupName} className="border border-border/40 rounded-xl p-3.5 bg-surface-2/60 shadow-sm flex flex-col">
                                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 select-none pb-1.5 border-b border-border/20">
                                        {groupName}
                                    </div>
                                    <div className="h-44">
                                        <Bar key={`chat-stacked-row-${groupName}-${theme}`} data={chartJsData} options={barOptions} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {renderNullWarning()}
                </div>
            );
        }

        // Case B: Standard Stacked Bar Chart (One dimension, Multiple metrics - e.g. Month, Sales, Profit)
        const dimensionKey = (data.dimension as string) || dimensionKeys[0] || 'name';

        let chartData = rows.map((row: any) => {
            const shaped: any = { name: fullLabel(row[dimensionKey]) };
            metricKeys.forEach((metric: string) => {
                shaped[metric] = Number(row[metric] || 0);
            });
            return shaped;
        });

        const topN = parseTopNFromTitle();
        if (topN && chartData.length > topN) {
            chartData = [...chartData]
                .sort((a: any, b: any) => {
                    const sumA = metricKeys.reduce((sum: number, key: string) => sum + (Number(a[key]) || 0), 0);
                    const sumB = metricKeys.reduce((sum: number, key: string) => sum + (Number(b[key]) || 0), 0);
                    return sumB - sumA;
                }).slice(0, topN);
        }

        const chartJsData = {
            labels: chartData.map((d: any) => d.name),
            datasets: metricKeys.map((metric, idx) => ({
                label: toHumanLabel(metric),
                data: chartData.map((d: any) => d[metric]),
                metricKey: metric,
                backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
            }))
        };

        const stackedOptions = getCommonOptions(metricKeys[0]);
        stackedOptions.scales!.x = { ...stackedOptions.scales!.x, stacked: true } as any;
        stackedOptions.scales!.y = { ...stackedOptions.scales!.y, stacked: true } as any;
        (stackedOptions.plugins.legend as any).display = true;
        (stackedOptions.plugins.legend as any).position = 'top';
        (stackedOptions.plugins.legend as any).labels = { color: isDark ? '#9ca3af' : '#4b5563', usePointStyle: true, boxWidth: 8 };

        return (
            <div className="w-full mt-4">
                <div className="h-96">
                    <Bar key={`chat-stacked-${theme}`} data={chartJsData} options={stackedOptions as any} />
                </div>
                {renderNullWarning()}
            </div>
        );
    };

    const renderTable = () => {
        const rows = data.data?.rows || data.rows || [];
        if (rows.length === 0) return <p className="p-4 text-gray-500 italic">No table data found.</p>;
        const headers = data.data?.columns || Object.keys(rows[0]);
        return (
            <div className="w-full">
                <div className="overflow-x-auto rounded-xl border border-transparent dark:border-white/5 shadow-sm dark:shadow-none mt-4 bg-surface-container-lowest dark:bg-surface-container/80 scrollbar-hide">
                    <table className="min-w-full text-sm text-left text-gray-400 font-mono">
                        <thead className="text-[10px] tracking-widest text-primary uppercase bg-black/50 border-b border-white/10">
                            <tr>
                                {headers.map((h: string) => <th key={h} className="px-4 py-3 font-bold">{h.replace('_', ' ')}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 10).map((row: any, i: number) => (
                                <tr key={i} className="bg-transparent border-b border-white/5 hover:bg-white/5 transition-colors">
                                    {headers.map((h: string) => (
                                        <td key={h} className="px-4 py-3 text-gray-800 dark:text-white text-xs">
                                            {typeof row[h] === 'number' && !h.toLowerCase().includes('id') ? formatValue(row[h], h) : String(row[h] || '-')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rows.length > 10 && (
                        <div className="px-4 py-2 bg-black/50 text-[10px] tracking-widest uppercase text-center text-gray-500 border-t border-white/10 font-bold">
                            Showing top 10 of {rows.length} results
                        </div>
                    )}
                </div>
                {renderNullWarning()}
            </div>
        );
    }

    const renderDashboard = () => {
        const dashboard = data.widgets ? data : data.dashboard;
        if (!dashboard || !dashboard.widgets) return null;
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                {dashboard.widgets.map((widget: any, index: number) => {
                    const colSpan = widget.type === 'kpi' ? 'col-span-1' : 'col-span-1 md:col-span-2';
                    return (
                        <div key={index} className={`${colSpan} bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md p-4 rounded-xl border border-transparent dark:border-white/5 shadow-sm dark:shadow-none transition-all duration-300`}>
                            <h4 className="text-[10px] tracking-widest uppercase font-bold text-gray-700 dark:text-gray-400 mb-3 border-b border-white/10 pb-2">{widget.title}</h4>
                            <ChartRenderer type={widget.type} data={{ data: widget.data }} title={widget.title} currency={effectiveCurrency} variant="minimal" />
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderMultiChart = () => {
        const subCharts = data.charts || data.data?.charts || [];
        if (!Array.isArray(subCharts) || subCharts.length === 0) {
            return renderTable();
        }
        return (
            <div className="w-full mt-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {subCharts.map((sub: any, idx: number) => (
                        <div key={idx} className="border border-border/40 rounded-xl p-4 bg-surface-2/60 shadow-sm flex flex-col">
                            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 pb-1.5 border-b border-border/20">
                                {sub.title || `Chart #${idx + 1}`}
                            </h4>
                            <div className="h-56">
                                <ChartRenderer
                                    type={sub.type || 'bar'}
                                    data={sub}
                                    title={sub.title}
                                    currency={currency}
                                    variant="minimal"
                                />
                            </div>
                        </div>
                    ))}
                </div>
                {renderNullWarning()}
            </div>
        );
    };

    switch (type) {
        case 'kpi': return renderKPI();
        case 'bar': return renderBarChart();
        case 'stacked_bar': return renderStackedBarChart();
        case 'stacked': return renderStackedBarChart();
        case 'multi_chart': return renderMultiChart();
        case 'line': 
        case 'area': 
            return renderLineChart();
        case 'pie': return renderPieChart();
        case 'table': return renderTable();
        case 'dashboard': 
        case 'mini_dashboard':
            return renderDashboard();
        default: return (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 text-xs font-mono text-gray-700 dark:text-gray-400">
                <span className="text-muted-foreground font-bold mb-2 block uppercase text-[10px]">Raw Data Debugger</span>
                {JSON.stringify(data, null, 2)}
            </div>
        );
    }
};

export default ChartRenderer;


