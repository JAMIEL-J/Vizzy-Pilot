// @ts-nocheck
/* Pearson correlation heatmap — diverging blue→white→red color scale.  */

import React, { useState, useRef, useEffect } from 'react';
import ChartCard from './ChartCard';

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
                    <div className="w-7 h-7 rounded-full border-2 border-border-strong/20 border-t-foreground animate-spin" />
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
                        className="absolute pointer-events-none z-20 bg-surface border border-border rounded-lg px-3 py-2 shadow-2xl text-xs whitespace-nowrap -translate-x-1/2 -translate-y-full transition-colors duration-300"
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

export default CorrelationHeatmapCard;
