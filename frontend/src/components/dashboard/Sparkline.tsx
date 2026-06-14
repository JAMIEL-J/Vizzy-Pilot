// @ts-nocheck
/* Simple SVG sparkline for KPI cards.                                   */

import React from 'react';

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
    if (!data || data.length < 2) return null;
    const w = 80, h = 32;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-60">
            <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
        </svg>
    );
};

export default Sparkline;
