// @ts-nocheck
/* Multi-filter panel — slot-based, user-controlled columns.             */
/* Each of the 4 slots has TWO layers:                                  */
/*   Top:    Column picker  (shows ALL available cols MINUS used slots) */
/*   Bottom: Value picker   (multi-select checkboxes for chosen column) */
/* Picking a column in slot 1 removes it from slots 2/3/4's picker.    */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { BtnGhost } from '@/components/ui/primitive';
import { X } from 'lucide-react';
import { toLabel, normalizeColumnKey, formatTargetTabLabel, formatBooleanLikeLabel } from './dashboard-helpers';

const MultiFilterPanel = ({
    geoFilters,
    targetColumn,
    targetValues,
    filterSlots,
    activeFilters,
    onSlotChange,
    onFilterChange,
    onClearAll,
}: {
    geoFilters: Record<string, string[]>;
    targetColumn?: string | null;
    targetValues?: string[];
    filterSlots: (string | null)[];
    activeFilters: Record<string, string[]>;
    onSlotChange: (slotIdx: number, col: string | null) => void;
    onFilterChange: (col: string, values: string[]) => void;
    onClearAll: () => void;
}) => {
    // openPicker: which slot's column-picker is open
    // openValues: which slot's value-list is open
    const [openPicker, setOpenPicker] = useState<number | null>(null);
    const [openValues, setOpenValues] = useState<number | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const targetRawToSemantic: Record<string, string> = {};
    const targetSemanticToRaw: Record<string, string> = {};
    const isTargetEquivalentColumn = (col?: string | null): boolean => {
        if (!targetColumn || !col) return false;
        return normalizeColumnKey(col) === normalizeColumnKey(targetColumn);
    };

    for (const rawVal of (targetValues || [])) {
        const raw = String(rawVal);
        const semantic = formatTargetTabLabel(raw, targetColumn || undefined);
        targetRawToSemantic[raw] = semantic;
        if (!(semantic in targetSemanticToRaw)) {
            targetSemanticToRaw[semantic] = raw;
        }
    }

    const toRawTargetValue = (col: string, value: string): string => {
        if (!isTargetEquivalentColumn(col)) return value;
        return targetSemanticToRaw[value] ?? value;
    };

    const targetRawValues = Array.from(new Set((targetValues || []).map(v => String(v)).filter(Boolean)));
    const valueOptionsByCol: Record<string, string[]> = { ...geoFilters };
    if (targetColumn && targetRawValues.length > 0) {
        const matchingTargetKey = Object.keys(valueOptionsByCol).find((col) => isTargetEquivalentColumn(col));
        if (matchingTargetKey) {
            valueOptionsByCol[matchingTargetKey] = targetRawValues;
        } else {
            valueOptionsByCol[targetColumn] = targetRawValues;
        }
    }

    const allCols = Object.keys(valueOptionsByCol);
    const totalActive = Object.values(activeFilters).reduce((n, v) => n + v.length, 0);

    // Close all dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpenPicker(null);
                setOpenValues(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleValue = (col: string, val: string) => {
        const rawVal = toRawTargetValue(col, val);
        const current = (activeFilters[col] ?? []).map(v => toRawTargetValue(col, v));
        const next = current.includes(rawVal)
            ? current.filter(v => v !== rawVal)
            : [...current, rawVal];
        onFilterChange(col, next);
    };

    if (allCols.length === 0) return null;

    return (
        <div ref={panelRef} className="mb-6 relative z-30">
            <div className="bg-surface border border-border rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] p-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Filters</span>
                    {totalActive > 0 && (
                        <button
                            type="button"
                            onClick={onClearAll}
                            className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                        >
                            Clear all
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {filterSlots.map((selectedCol, slotIdx) => {
                        // Columns available in THIS slot's picker =
                        // all cols minus those already pinned in OTHER slots
                        const takenByOthers = filterSlots
                            .filter((_, i) => i !== slotIdx)
                            .filter(Boolean) as string[];
                        const availableCols = allCols.filter(c => !takenByOthers.includes(c));

                        const slotValues = selectedCol
                            ? (activeFilters[selectedCol] ?? []).map(v => toRawTargetValue(selectedCol, v))
                            : [];
                        const selectedColOptions = selectedCol ? (valueOptionsByCol[selectedCol] || []) : [];
                        const isPickerOpen = openPicker === slotIdx;
                        const isValuesOpen = openValues === slotIdx;

                        return (
                            <div key={slotIdx} className="flex flex-col gap-2">
                                <div className="relative">
                                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold mb-1.5" style={{ fontFamily: '"Be Vietnam Pro", sans-serif' }}>
                                        {selectedCol ? toLabel(selectedCol) : `Filter ${slotIdx + 1}`}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOpenValues(null);
                                            setOpenPicker(isPickerOpen ? null : slotIdx);
                                        }}
                                        className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-md text-[12px] border border-border transition-all ${selectedCol
                                            ? 'bg-surface-2 text-primary'
                                            : 'bg-surface text-foreground'
                                            }`}
                                    >
                                        <span className="truncate" style={{ fontFamily: '"Be Vietnam Pro", sans-serif', fontWeight: 500 }}>
                                            {selectedCol ? toLabel(selectedCol) : 'Select Filter'}
                                        </span>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {selectedCol && (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onFilterChange(selectedCol, []);
                                                        onSlotChange(slotIdx, null);
                                                    }}
                                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                                    aria-label="Remove filter"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </span>
                                            )}
                                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${isPickerOpen || !!selectedCol ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground'}`}>
                                                <svg className={`w-3 h-3 transition-transform ${isPickerOpen ? 'rotate-180' : ''}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </span>
                                        </div>
                                    </button>

                                    {isPickerOpen && (
                                        <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-surface rounded-xl border border-border shadow-2xl z-50 overflow-hidden">
                                            {selectedCol && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onFilterChange(selectedCol, []);
                                                        onSlotChange(slotIdx, null);
                                                        setOpenPicker(null);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-[12px] text-muted-foreground hover:text-destructive hover:bg-surface-2 transition-colors border-b border-border"
                                                >
                                                    — No filter (clear slot)
                                                </button>
                                            )}
                                            <div className="max-h-48 overflow-y-auto py-1">
                                                {availableCols.map(col => (
                                                    <button
                                                        type="button"
                                                        key={col}
                                                        onClick={() => {
                                                            // Clear old column's values if switching
                                                            if (selectedCol && selectedCol !== col) {
                                                                onFilterChange(selectedCol, []);
                                                            }
                                                            onSlotChange(slotIdx, col);
                                                            setOpenPicker(null);
                                                        }}
                                                        className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${col === selectedCol
                                                            ? 'bg-surface-2 text-primary font-medium'
                                                            : 'text-foreground hover:bg-surface-2'
                                                            }`}
                                                    >
                                                        {toLabel(col)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {selectedCol && (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOpenPicker(null);
                                                setOpenValues(isValuesOpen ? null : slotIdx);
                                            }}
                                            className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-md text-[12px] border border-border transition-all ${slotValues.length > 0
                                                ? 'bg-surface-2 text-primary font-medium'
                                                : 'bg-surface text-foreground'
                                                }`}
                                        >
                                            <span className="truncate">
                                                {slotValues.length === 0
                                                    ? 'All values'
                                                    : slotValues.length === 1
                                                        ? (isTargetEquivalentColumn(selectedCol)
                                                            ? formatTargetTabLabel(String(slotValues[0]), targetColumn || undefined)
                                                            : formatBooleanLikeLabel(slotValues[0]))
                                                        : `${slotValues.length} selected`}
                                            </span>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${isValuesOpen || slotValues.length > 0 ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground'}`}>
                                                    <svg className={`w-3 h-3 transition-transform ${isValuesOpen ? 'rotate-180' : ''}`}
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </span>
                                            </div>
                                        </button>

                                        {isValuesOpen && (
                                            <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-surface-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => onFilterChange(selectedCol, selectedColOptions.map(v => toRawTargetValue(selectedCol, v)))}
                                                        className="text-[11px] uppercase tracking-wider text-primary hover:text-primary/80 font-bold transition-colors"
                                                    >Select all</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onFilterChange(selectedCol, [])}
                                                        className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-destructive font-bold transition-colors"
                                                    >Clear</button>
                                                </div>
                                                <div className="max-h-52 overflow-y-auto py-1">
                                                    {selectedColOptions.map(val => (
                                                        <label
                                                            key={val}
                                                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#f7f8f8] dark:hover:bg-[#1f2127] cursor-pointer transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={slotValues.includes(val)}
                                                                onChange={() => toggleValue(selectedCol, val)}
                                                                className="w-3.5 h-3.5 rounded accent-[#6c63ff]"
                                                            />
                                                            <span className="text-[14px] text-[#2d2f2f] dark:text-[#eceff4] truncate">
                                                                {isTargetEquivalentColumn(selectedCol)
                                                                    ? (targetRawToSemantic[String(val)] || formatTargetTabLabel(String(val), targetColumn || undefined))
                                                                    : formatBooleanLikeLabel(val)}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default MultiFilterPanel;
