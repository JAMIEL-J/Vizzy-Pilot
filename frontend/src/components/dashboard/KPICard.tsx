// @ts-nocheck
/* KPI Card component with compact value formatting and SVG icons.       */

import React from 'react';
import { Pill } from '@/components/ui/primitive';
import Sparkline from './Sparkline';

const KPICard = ({ title, value, icon, trend, trend_label, subtitle, cardColor, index = 0, history }: { title: string; value: string; icon?: string; trend?: number; trend_label?: string; subtitle?: string; cardColor?: string, index?: number, history?: number[] }) => {
    // Map backend icons instantly to SVG nodes to guarantee rendering rather than relying on Web Fonts
    const getSvgIcon = (i?: string, idx = 0) => {
        const icons = [
            /* payments */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm320-80q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-80q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520q17 0 28.5 11.5T520-480q0 17-11.5 28.5T480-400Zm0-80Z" /></svg>,
            /* shopping_cart */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M280-80q-33 0-56.5-23.5T200-160q0-33 23.5-56.5T280-240q33 0 56.5 23.5T360-160q0 33-23.5 56.5T280-80Zm400 0q-33 0-56.5-23.5T600-160q0-33 23.5-56.5T680-240q33 0 56.5 23.5T760-160q0 33-23.5 56.5T680-80ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 32.5 16.5T810-745L692-532q-11 20-29.5 31T622-490H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z" /></svg>,
            /* receipt_long */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80l-80-80v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v640l-80 80-80-80-80 80-80-80-80 80-80-80-80 80Zm0-163 40-40 80 80 80-80 80 80 80-80 80 80 80-80 40 40v-557H240v557Zm-80 43v-600 600Z" /></svg>,
            /* analytics */ <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M280-280h80v-200h-80v200Zm160 0h80v-400h-80v400Zm160 0h80v-120h-80v120ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" /></svg>
        ];

        if (i === 'dollar') return icons[0];
        if (i === 'users' || i === 'group') return <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 -960 960 960" className="w-[120px] h-[120px]"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-240v-32q0-34 17.5-62.5T224-378q92-42 189-42t189 42q29 14 46.5 42.5T666-272v32q0 33-23.5 56.5T586-160H240q-33 0-56.5-23.5T160-240Zm80 0h400v-32q0-11-5.5-20T620-306q-71-34-140-34t-140 34q-10 6-15 14.5t-5 19.5v32Z" /></svg>;
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
    const valueSizeClass = finalValue.length >= 10
        ? 'text-base sm:text-2xl'
        : 'text-lg sm:text-3xl md:text-4xl';

    // Trend logic
    const isPositive = trend !== undefined && trend > 0;
    const isNegative = trend !== undefined && trend < 0;
    const trendIcon = isPositive ? 'trending_up' : isNegative ? 'trending_down' : 'remove';
    const trendText = trend !== undefined ? `${Math.abs(trend)}%` : '';
    const trendCaption = trend_label || subtitle || (trend !== undefined ? 'vs last month' : '');
    // Remove the unicode arrows if backend sends them since we have our own Material Symbol font icon now
    const badgeTextCleaned = (trendText ? `${trendText} ${trendCaption}` : trendCaption).replace(/^[⤵⤴]\s*/, '').trim();

    const safeCardColor = cardColor || '#6366f1';
    const isLightCard = safeCardColor.toLowerCase() === '#f8a010';
    const textColor = isLightCard ? '#111827' : '#ffffff';
    const badgeBg = isLightCard ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const badgeColor = isLightCard ? '#111827' : '#ffffff';
    // Set explicit watermark color to ensure contrast
    const watermarkColor = isLightCard ? 'rgba(17,24,39,0.15)' : 'rgba(255,255,255,0.15)';

    const trendTone = isPositive ? 'success' : isNegative ? 'danger' : 'default';
    const caption = trend_label || subtitle || (trend !== undefined ? 'vs last month' : '');

    return (
        <div className="panel group relative overflow-hidden p-4 transition hover:bg-surface">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: safeCardColor }} />
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {title}
                </span>
                {trend !== undefined && (
                    <Pill tone={trendTone}>
                        <span className="material-symbols-outlined text-[12px]">{trendIcon}</span>
                        {trendText || '0%'}
                    </Pill>
                )}
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
                <div className="flex flex-col">
                    <span className={`num text-display font-semibold leading-none ${valueSizeClass}`}>{finalValue}</span>
                    {caption && <span className="text-[10px] text-muted-foreground mt-1">{caption}</span>}
                </div>
                <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                    <Sparkline data={history || []} color={safeCardColor} />
                </div>
            </div>
        </div>
    );

};

export default KPICard;
