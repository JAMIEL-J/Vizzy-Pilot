// @ts-nocheck
/* Chart card wrapper with consistent title bar and actions.             */

import React from 'react';

const ChartCard = ({ title, children, className, actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) => (
    <div className={`bg-surface border border-border rounded-[16px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] h-full flex flex-col ${className || ''}`}>
        <div className="flex flex-col items-center gap-2 mb-5 flex-shrink-0 w-full">
            <h4 className="text-[15px] font-semibold text-foreground text-center leading-snug w-full">{title}</h4>
            {actions ? (
                <div className="relative z-10 flex gap-2 items-center justify-center w-full">{actions}</div>
            ) : (
                <div className="flex gap-2 relative z-10 justify-center w-full">
                    <button className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors" title="Refresh"><span className="material-symbols-outlined text-sm text-muted-foreground">refresh</span></button>
                    <button className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors" title="Share"><span className="material-symbols-outlined text-sm text-muted-foreground">ios_share</span></button>
                    <button className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors" title="Download Data"><span className="material-symbols-outlined text-sm text-muted-foreground">download</span></button>
                    <button className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors" title="More"><span className="material-symbols-outlined text-sm text-muted-foreground">more_vert</span></button>
                </div>
            )}
        </div>
        <div className="flex-1 min-h-0 w-full flex flex-col justify-end">
            {children}
        </div>
    </div>
);

export default ChartCard;
