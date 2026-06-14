// @ts-nocheck
/* Dataset selector dropdown.                                            */

import React, { useState, useEffect, useRef } from 'react';

const FilterDropdown = ({
    datasets,
    selectedDatasetId,
    onDatasetChange,
}: {
    datasets: any[];
    selectedDatasetId: string;
    onDatasetChange: (id: string) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = datasets.find(d => d.id === selectedDatasetId);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 bg-surface border border-border rounded-md px-3 py-2 text-[12px] text-foreground hover:bg-surface-2 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className="max-w-[140px] truncate">{selected?.name || 'Select Dataset'}</span>
                <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="py-1">
                        {datasets.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-[#7a7c7c]">No datasets available</p>
                        ) : (
                            datasets.map(ds => (
                                <button
                                    type="button"
                                    key={ds.id}
                                    onClick={() => { onDatasetChange(ds.id); setOpen(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-xs uppercase tracking-widest transition-colors flex items-center gap-2 ${ds.id === selectedDatasetId
                                        ? 'bg-surface-2 text-primary font-bold'
                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
                                >
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                                    </svg>
                                    <span className="truncate">{ds.name}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FilterDropdown;