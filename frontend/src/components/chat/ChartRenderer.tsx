import React from 'react';
import { KPICard } from './KPICard';
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

const CHART_COLORS = [...VIZZY_CHART_COLORS];

export const ChartRenderer: React.FC<ChartRendererProps> = ({ type, data, title, currency, variant = 'default' }) => {
    const gridColor = '#ffffff10';
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
        if (['quantity', 'qty', 'count', 'unit', 'units', 'volume', 'age', 'tenure', 'day', 'days', 'month', 'months', 'year', 'years'].some((kw) => key.includes(kw))) {
            return false;
        }
        return ['revenue', 'profit', 'income', 'earnings', 'cost', 'expense', 'price', 'charge', 'payment', 'budget', 'fee', 'sales', 'discount', 'amount', 'billing'].some((kw) => key.includes(kw));
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
        const key = String(metricKey || '').toLowerCase();
        return key.includes('rate') || key.includes('percent') || key.includes('%');
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
        return ['age', 'tenure', 'duration', 'day', 'days', 'month', 'months', 'year', 'years', 'los', 'length of stay', 'lengthofstay']
            .some((kw) => key.includes(kw));
    };

    const isPercentage =
        data.is_percentage === true ||
        data.data?.is_percentage === true ||
        Object.values(columnMetadata).some((m: any) => m.display_format?.type === 'percent') ||
        data.format === 'percent' ||
        data.format === 'percentage' ||
        data.format_type === 'percentage' ||
        data.data?.format === 'percent' ||
        data.data?.format_type === 'percentage' ||
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
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(val).replace('$', symbol);
        }

        if (isWholeNumberMetric(metricKey || data.value_label || data.metric || title)) {
            return new Intl.NumberFormat('en-US', {
                style: 'decimal',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(Math.round(val));
        }

        return new Intl.NumberFormat('en-US', {
            style: 'decimal',
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

    const truncateTick = (value: any, max = 14) => {
        const str = String(value ?? '');
        return str.length > max ? `${str.slice(0, max)}…` : str;
    };

    const compactCategoryLabel = (value: any) => {
        const str = String(value ?? '').trim();
        if (!str) return '';
        const firstWord = str.split(/\s+/)[0] || str;
        if (firstWord.length <= 8 && str.length > firstWord.length) {
            return `${firstWord}...`;
        }
        return truncateTick(str, 10);
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
                    color: '#9ca3af',
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { family: '"Be Vietnam Pro", sans-serif', size: 11 },
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.82)',
                titleColor: '#ffffff',
                bodyColor: '#cccccc',
                borderColor: 'rgba(255,255,255,0.1)',
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
                ticks: { color: axisColor, font: { size: 11 } }
            },
            y: {
                grid: { display: indexAxis === 'x', color: gridColor, drawBorder: false },
                ticks: {
                    color: axisColor, font: { size: 11 },
                    callback: (value: any) => indexAxis === 'x' ? formatValue(value, metricKeyForY) : undefined
                },
                beginAtZero: true
            }
        } : undefined
    });

    const renderBarChart = () => {
        let chartData = [];
        let valueKey = 'value';
        if (data.data?.rows) {
            chartData = data.data.rows.map((row: any) => {
                const keys = Object.keys(row);
                valueKey = keys[1] || valueKey;
                return {
                    name: compactCategoryLabel(row[keys[0]]),
                    value: row[keys[1]]
                };
            });
        } else if (data.x && data.y) {
            chartData = data.x.map((x: any, i: number) => ({
                name: compactCategoryLabel(x),
                value: data.y[i]
            }));
        }

        const topN = parseTopNFromTitle();
        chartData = chartData
            .map((row: any) => ({ ...row, value: Number(row.value || 0) }))
            .filter((row: any) => Number.isFinite(row.value));

        if (topN && chartData.length > topN) {
            chartData = [...chartData].sort((a: any, b: any) => b.value - a.value).slice(0, topN);
        }

        if (chartData.length === 0) return <div className="p-4 text-gray-400 text-sm">No chart data available</div>;

        const metricLabel = toHumanLabel(data.value_label || data.metric || data.y_axis || valueKey);
        const labels = chartData.map((d: any) => d.name);

        const chartJsData = {
            labels,
            datasets: [{
                label: metricLabel,
                data: chartData.map((d: any) => d.value),
                metricKey: valueKey,
                backgroundColor: (context: any) => createBarGradient(context.chart.ctx, context.dataIndex || 0),
                borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false
            }]
        };

        return (
            <div className="h-96 w-full mt-4">
                {(() => {
                    const barOptions = getCommonOptions(valueKey) as any;
                    barOptions.interaction = { mode: 'nearest', intersect: true, axis: 'x' };
                    barOptions.plugins = barOptions.plugins || {};
                    barOptions.plugins.legend = {
                        ...(barOptions.plugins.legend || {}),
                        display: true,
                        position: 'bottom',
                        labels: {
                            ...((barOptions.plugins.legend || {}).labels || {}),
                            color: '#9ca3af',
                            usePointStyle: true,
                            boxWidth: 8,
                            padding: 12,
                            generateLabels: (chart: any) => {
                                const chartLabels = chart?.data?.labels || [];
                                return chartLabels.map((label: string, index: number) => ({
                                    text: String(label || ''),
                                    fillStyle: getLegendColor(index),
                                    strokeStyle: getLegendColor(index),
                                    fontColor: '#9ca3af',
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
                    return <Bar data={chartJsData} options={barOptions} />;
                })()}
            </div>
        );
    };

    const renderLineChart = () => {
        let chartData = [];
        let valueKey = 'value';
        if (data.data?.series) {
            chartData = data.data.series.map((s: any) => ({
                name: s.timestamp || Object.values(s)[0],
                value: s.value !== undefined ? s.value : Object.values(s)[1],
            }));
        } else if (data.x && data.y) {
            chartData = data.x.map((x: any, i: number) => ({
                name: x,
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
                borderColor: VIZZY_THEME.primary,
                backgroundColor: 'transparent',
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: VIZZY_THEME.secondary
            }]
        };

        return (
            <div className="h-96 w-full mt-4">
                <Line data={chartJsData} options={getCommonOptions(valueKey) as any} />
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
                borderColor: '#0a0b0f',
                hoverOffset: 4
            }]
        };

        const pieOptions = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#9ca3af', font: { family: '"Be Vietnam Pro", sans-serif', size: 11 }, usePointStyle: true } },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.82)',
                    titleColor: '#ffffff',
                    bodyColor: '#cccccc',
                    borderColor: 'rgba(255,255,255,0.1)',
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
            <div className="h-96 w-full mt-4">
                <Pie data={chartJsData} options={pieOptions as any} />
            </div>
        );
    };

    const renderStackedBarChart = () => {
        const rows = data.data?.rows || data.rows || [];
        if (!Array.isArray(rows) || rows.length === 0) return <div className="p-4 text-gray-400 text-sm">No chart data available</div>;

        const firstRow = rows[0] || {};
        const rowKeys = Object.keys(firstRow);
        const metricKeys = (data.data?.categories || data.categories || rowKeys.filter((k: string) => typeof firstRow[k] === 'number')) as string[];
        const dimensionKey = (data.dimension as string) || rowKeys.find((k: string) => !metricKeys.includes(k)) || rowKeys[0] || 'name';

        let chartData = rows.map((row: any) => {
            const fullName = String(row[dimensionKey] ?? '');
            const shaped: any = { name: compactCategoryLabel(fullName) };
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
        (stackedOptions.plugins.legend as any).labels = { color: '#9ca3af', usePointStyle: true, boxWidth: 8 };

        return (
            <div className="h-96 w-full mt-4">
                <Bar data={chartJsData} options={stackedOptions as any} />
            </div>
        );
    };

    const renderTable = () => {
        const rows = data.data?.rows || data.rows || [];
        if (rows.length === 0) return <p className="p-4 text-gray-500 italic">No table data found.</p>;
        const headers = data.data?.columns || Object.keys(rows[0]);
        return (
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

    switch (type) {
        case 'kpi': return renderKPI();
        case 'bar': return renderBarChart();
        case 'stacked_bar': return renderStackedBarChart();
        case 'stacked': return renderStackedBarChart();
        case 'line': return renderLineChart();
        case 'pie': return renderPieChart();
        case 'table': return renderTable();
        case 'dashboard': return renderDashboard();
        default: return (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 text-xs font-mono text-gray-700 dark:text-gray-400">
                <span className="text-primary-blue font-bold mb-2 block uppercase text-[10px]">Raw Data Debugger</span>
                {JSON.stringify(data, null, 2)}
            </div>
        );
    }
};

export default ChartRenderer;


