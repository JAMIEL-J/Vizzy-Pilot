import React from 'react';
import { KPICard } from './KPICard';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { VIZZY_CHART_COLORS, VIZZY_THEME } from '../../theme/tokens';


interface ChartRendererProps {
    type: string;
    data: any;
    title?: string;
    currency?: string;
    variant?: 'default' | 'minimal';
}

// Indigo/Cyan palette aligned with redesigned UI theme
const CHART_COLORS = [...VIZZY_CHART_COLORS];
interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    formatValue: (value: any, metricKey?: string) => string;
    getMetricLabel?: (metricKey?: string) => string;
}

const CustomTooltip = ({ active, payload, label, formatValue, getMetricLabel }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        const fullCategoryLabel = String(payload?.[0]?.payload?.fullName || label || '');
        return (
            <div className="rounded-sm px-4 py-3 border border-white/10 backdrop-blur-md min-w-[160px] bg-black/90 shadow-[0_0_15px_rgba(108,99,255,0.15)] text-white font-mono z-[9999]">
                {fullCategoryLabel && <p className="text-[10px] uppercase font-bold tracking-widest mb-2 pb-2 border-b border-white/10 opacity-70 leading-tight">{fullCategoryLabel}</p>}
                <div className="space-y-1">
                    {payload.map((entry: any, index: number) => {
                        const metricKey = String(entry?.dataKey || entry?.name || 'value');
                        const metricLabel = getMetricLabel ? getMetricLabel(metricKey) : metricKey;
                        return (
                            <div key={`${metricKey}-${index}`} className="mb-0">
                                <p className="text-[10px] opacity-50 uppercase tracking-widest mb-0.5">{metricLabel}</p>
                                <p className="text-sm font-bold truncate max-w-[220px] text-primary">
                                    {formatValue(entry?.value ?? 0, metricKey)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

export const ChartRenderer: React.FC<ChartRendererProps> = ({ type, data, title, currency, variant = 'default' }) => {
    const gridColor = '#ffffff10';
    const axisColor = '#6b7280';
    const cursorFill = 'rgba(255,255,255,0.05)';
    const STANDARD_BAR_COLOR = VIZZY_THEME.primary;

    const getBarColorByIndex = (index: number, totalBars: number) => {
        if (totalBars >= 3 && totalBars <= 5) {
            return CHART_COLORS[index % CHART_COLORS.length];
        }
        return STANDARD_BAR_COLOR;
    };

    // ── Explicit Formatting Hints (from Phase 1 Coercion) ──
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

    // Determine if this should be formatted as a percentage
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

    // Determine if this chart should use currency formatting
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

    // Handle NL2SQL wrapper
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
                return {
                    label: metricLabel,
                    value: formattedMetric,
                };
            });

            return (
                <KPICard
                    value={kpiRows[0]?.value || value}
                    label={label}
                    metrics={kpiRows}
                    variant={variant}
                    compact={false}
                />
            );
        }

        return (
            <KPICard
                value={value}
                label={label}
                change={change}
                prefix={data.prefix || (isCurrencyChart ? effectiveCurrency : undefined)}
                suffix={suffix}
                compact={isCurrencyChart}
                variant={variant}
            />
        );
    };

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
                notation: 'compact',
                compactDisplay: 'short',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(val).replace('$', symbol);
        }

        if (isWholeNumberMetric(metricKey || data.value_label || data.metric || title)) {
            return new Intl.NumberFormat('en-US', {
                style: 'decimal',
                notation: 'compact',
                compactDisplay: 'short',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(Math.round(val));
        }

        return new Intl.NumberFormat('en-US', {
            style: 'decimal',
            notation: "compact",
            compactDisplay: "short",
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(val);
    };

    const formatYAxisValue = (val: number, metricKey?: string) => {
        return formatValue(val, metricKey);
    };

    const toHumanLabel = (key?: string) => {
        const raw = String(key || '').trim();
        if (!raw) return 'Value';
        const normalized = raw.toLowerCase();
        const chartContext = `${String(data.metric || '').toLowerCase()} ${String(title || '').toLowerCase()}`;
        if (normalized === 'days' && chartContext.includes('age')) {
            return 'Age';
        }
        return raw
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
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

    const renderBarChart = () => {
        let chartData = [];
        let valueKey = 'value';
        // Handle different data formats including NL2SQL nested data
        if (data.data?.rows) {
            chartData = data.data.rows.map((row: any) => {
                const keys = Object.keys(row);
                valueKey = keys[1] || valueKey;
                return {
                    name: compactCategoryLabel(row[keys[0]]),
                    fullName: String(row[keys[0]] ?? ''),
                    value: row[keys[1]]
                };
            });
        } else if (data.x && data.y) {
            chartData = data.x.map((x: any, i: number) => ({
                name: compactCategoryLabel(x),
                fullName: String(x ?? ''),
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

        const metricLabelForBar = () => toHumanLabel(data.value_label || data.metric || data.y_axis || valueKey);

        if (chartData.length === 0) return <div className="p-4 text-gray-400 text-sm">No chart data available</div>;

        return (
            <div className="h-96 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: axisColor }}
                            axisLine={{ stroke: gridColor }}
                            tickLine={false}
                            tickFormatter={(value: any) => String(value ?? '')}
                            interval={chartData.length > 12 ? Math.ceil(chartData.length / 12) - 1 : 0}
                            angle={0}
                            textAnchor="middle"
                            height={60}
                        />
                        <YAxis
                            tick={{ fontSize: 12, fill: axisColor }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value: any) => formatYAxisValue(Number(value), valueKey)}
                        />
                        <Tooltip content={<CustomTooltip formatValue={formatValue} getMetricLabel={() => metricLabelForBar()} />} cursor={{ fill: cursorFill }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40} fill={STANDARD_BAR_COLOR}>
                            {chartData.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={getBarColorByIndex(index, chartData.length)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
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

        const metricLabelForLine = () => toHumanLabel(data.value_label || data.metric || data.y_axis || valueKey);

        if (chartData.length === 0) return <div className="p-4 text-gray-400 text-sm">No line data available</div>;

        return (
            <div className="h-96 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: axisColor }}
                            axisLine={{ stroke: gridColor }}
                            tickLine={false}
                            interval="preserveStartEnd"
                            angle={0}
                            textAnchor="middle"
                            height={60}
                        />
                        <YAxis
                            tick={{ fontSize: 12, fill: axisColor }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value: any) => formatYAxisValue(Number(value), valueKey)}
                        />
                        <Tooltip content={<CustomTooltip formatValue={formatValue} getMetricLabel={() => metricLabelForLine()} />} />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={VIZZY_THEME.primary}
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6, strokeWidth: 0, fill: VIZZY_THEME.secondary }}
                        />
                    </LineChart>
                </ResponsiveContainer>
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

        return (
            <div className="h-96 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {chartData.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} stroke="#0a0b0f" />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip formatValue={(v) => formatValue(v, valueKey)} getMetricLabel={() => toHumanLabel(data.value_label || data.metric || valueKey)} />} />
                        <Legend
                            layout="horizontal"
                            verticalAlign="bottom"
                            align="center"
                            wrapperStyle={{ paddingTop: '20px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace', textTransform: 'uppercase' }}
                            iconType="circle"
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const renderStackedBarChart = () => {
        const rows = data.data?.rows || data.rows || [];
        if (!Array.isArray(rows) || rows.length === 0) return <div className="p-4 text-gray-400 text-sm">No chart data available</div>;

        const firstRow = rows[0] || {};
        const rowKeys = Object.keys(firstRow);
        const metricKeys = (data.data?.categories || data.categories || rowKeys.filter((k: string) => typeof firstRow[k] === 'number')) as string[];
        const dimensionKey = (data.dimension as string)
            || rowKeys.find((k: string) => !metricKeys.includes(k))
            || rowKeys[0]
            || 'name';

        let chartData = rows.map((row: any) => {
            const fullName = String(row[dimensionKey] ?? '');
            const shaped: any = {
                name: compactCategoryLabel(fullName),
                fullName,
            };
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
                })
                .slice(0, topN);
        }

            const metricLabelForStacked = (metricKey?: string) => toHumanLabel(metricKey);

        return (
            <div className="h-96 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: axisColor }}
                            axisLine={{ stroke: gridColor }}
                            tickLine={false}
                            tickFormatter={(value: any) => String(value ?? '')}
                            interval={chartData.length > 12 ? Math.ceil(chartData.length / 12) - 1 : 0}
                            angle={0}
                            textAnchor="middle"
                            height={60}
                        />
                        <YAxis
                            tick={{ fontSize: 12, fill: axisColor }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value: any) => formatYAxisValue(Number(value), metricKeys[0])}
                        />
                        <Tooltip content={<CustomTooltip formatValue={formatValue} getMetricLabel={metricLabelForStacked} />} cursor={{ fill: cursorFill }} />
                        <Legend />
                        {metricKeys.map((metric: string, idx: number) => (
                            <Bar key={metric} dataKey={metric} stackId="stack" fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={idx === metricKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
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
                                        {typeof row[h] === 'number' && !h.toLowerCase().includes('id') ?
                                            formatValue(row[h], h) :
                                            String(row[h] || '-')
                                        }
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
        // ... (existing logic for multi-widget dashboards)
        const dashboard = data.widgets ? data : data.dashboard;

        if (!dashboard || !dashboard.widgets) return null;

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                {dashboard.widgets.map((widget: any, index: number) => {
                    const colSpan = widget.type === 'kpi' ? 'col-span-1' : 'col-span-1 md:col-span-2';

                    return (
                        <div key={index} className={`${colSpan} bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md p-4 rounded-xl border border-transparent dark:border-white/5 shadow-sm dark:shadow-none transition-all duration-300`}>
                            <h4 className="text-[10px] tracking-widest uppercase font-bold text-gray-700 dark:text-gray-400 mb-3 border-b border-white/10 pb-2">{widget.title}</h4>
                            <ChartRenderer
                                type={widget.type}
                                data={{ data: widget.data }}
                                title={widget.title}
                                currency={effectiveCurrency}
                                variant="minimal"
                            />
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
