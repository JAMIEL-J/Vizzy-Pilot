// @ts-nocheck
/* Custom tooltip for chart.js charts, themed for dashboard.             */

import React from 'react';
import { VIZZY_THEME } from '../../theme/tokens';

const CHART_COLORS = [
    '#7D9BBA', '#6EA694', '#DF8B70', '#CD7784',
    '#68A3B2', '#9184B7', '#C4A265', '#7E8B99'
];

const ThemedTooltip = ({ active, payload, label, formatter, chartTitle, valueLabel, formatType }: any) => {
    if (!active || !payload?.length) return null;

    const fp = payload[0]?.payload;

    const isCurrencyLabel = (text: string) => {
        const lower = String(text || '').toLowerCase();
        if (lower.startsWith('usd')) return true;
        if (formatType === 'currency') return true;
        return ['revenue', 'cost', 'costs', 'spend', 'budget', 'income', 'sales', 'profit', 'payment',
            'charge', 'charges', 'price', 'amount', 'roi', 'roas',
            'salary', 'wage', 'compensation', 'payroll',
            'daily rate', 'hourly rate', 'monthly rate', 'monthly income',
        ].some((kw) => lower.includes(kw));
    };

    const isPercentLabel = (text: string) => {
        const lower = String(text || '').toLowerCase();
        if (formatType === 'currency' || lower.startsWith('usd')) return false;
        return ['percent', 'percentage', 'pct', 'ctr', 'cvr', 'ratio', 'margin'].some((kw) => lower.includes(kw))
            || (lower.includes('rate') && !['daily', 'hourly', 'monthly', 'annual'].some(p => lower.includes(p)));
    };

    const isCountLabel = (text: string) => {
        const lower = String(text || '').toLowerCase();
        return ['click', 'count', 'record', 'records', 'orders', 'order', 'customers', 'employees',
            'units', 'qty', 'quantity', 'volume', 'visits', 'sessions', 'impressions', 'views',
        ].some((kw) => lower.includes(kw));
    };

    const fmtS = (v: number, lbl: string) => {
        if (formatter) return formatter(v, lbl);
        const lblLower = String(lbl || '').toLowerCase();
        const isTimeVariant = ['tenure', 'age', 'duration', 'months', 'years', 'days', 'miles', 'sessions', 'rating', 'hours'].some(k => lblLower.includes(k));
        const isPct = isPercentLabel(lbl) || String(lbl).includes('%') || (formatType === 'percentage' && !isCountLabel(lbl));
        const isCur = !isPct && (isCurrencyLabel(lbl) || (formatType === 'currency' && !isCountLabel(lbl) && !isTimeVariant));

        if (isCur) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
        if (isPct) return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
        if (isTimeVariant) return Math.round(v).toLocaleString();
        return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    // Paired x/y tooltip (scatter-like)
    if (fp?.xLabel && fp?.yLabel) {
        return (
            <div className="rounded-sm px-4 py-3 border border-border-main backdrop-blur-md min-w-[160px] bg-bg-card/95 dark:bg-black/95 shadow-xl text-themed-main font-serif tracking-wide z-[9999]">
                {chartTitle && <p className="text-[10px] uppercase font-bold tracking-widest mb-2 pb-2 border-b border-border-main opacity-70 leading-tight">{chartTitle}</p>}
                {fp.label && <p className="text-[10px] opacity-60 mb-2 pb-2 border-b border-border-main font-bold uppercase tracking-widest">{fp.label}</p>}
                <div className="space-y-1.5">
                    <p className="text-sm flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: VIZZY_THEME.primary }} /><span className="opacity-70 text-[10px] tracking-widest uppercase">{fp.xLabel}:</span></span>
                        <span className="font-bold text-primary">{fmtS(Number(fp.x), fp.xLabel)}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between gap-4">
                        <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: VIZZY_THEME.secondary }} /><span className="opacity-70 text-[10px] tracking-widest uppercase">{fp.yLabel}:</span></span>
                        <span className="font-bold text-primary">{fmtS(Number(fp.y), fp.yLabel)}</span>
                    </p>
                </div>
            </div>
        );
    }

    // Generic payload
    let metricName = 'Value';
    let dimensionName = 'Category';

    const firstRow = payload?.[0]?.payload || {};
    const hasOrderId = 'order_id' in firstRow || 'orderid' in firstRow || 'order_no' in firstRow;
    const hasCustomerId = 'customer_id' in firstRow || 'customerid' in firstRow;

    if (valueLabel) {
        const lowerValueLabel = String(valueLabel).toLowerCase().trim();
        const lowerTitle = String(chartTitle || '').toLowerCase();
        metricName = lowerValueLabel === 'days' && lowerTitle.includes('age') ? 'Age' : valueLabel;
        if (String(metricName).toLowerCase().includes('count')) {
            if (hasOrderId) metricName = 'Order Count';
            else if (hasCustomerId) metricName = 'Customer Count';
        }
    }

    if (chartTitle) {
        const parts = String(chartTitle).split(/ by | per /i);
        if (parts.length === 2) {
            if (!valueLabel) metricName = parts[0].trim();
            dimensionName = parts[1].trim();
        } else {
            const titleLower = String(chartTitle).toLowerCase();
            const extractDim = (suffix: RegExp) => String(chartTitle).replace(suffix, '').trim() || dimensionName;
            if (titleLower.includes('breakdown')) dimensionName = extractDim(/ breakdown/i);
            else if (titleLower.includes('distribution')) dimensionName = extractDim(/ distribution/i);
            else if (titleLower.includes('overview')) dimensionName = extractDim(/ overview/i);
            else if (!valueLabel) metricName = chartTitle;
        }
    }

    let displayLabel = label;
    let displayPayload = payload;
    if (!displayLabel && payload && payload.length === 1 && typeof payload[0].name === 'string' && payload[0].name !== 'value') {
        displayLabel = payload[0].name;
        displayPayload = [{ ...payload[0], name: metricName }];
    } else if (payload) {
        displayPayload = payload.map((p: any) => ({ ...p, name: (p.name === 'value' || !p.name) ? metricName : p.name }));
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
                {displayPayload.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ background: p.color || p.fill || CHART_COLORS[0] }} />
                            <span className="text-[10px] tracking-widest uppercase opacity-70 whitespace-nowrap">{p.name}:</span>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-themed-main group-hover:text-primary transition-colors">
                            {formatter ? formatter(p.value, p.name) : (typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ThemedTooltip;
