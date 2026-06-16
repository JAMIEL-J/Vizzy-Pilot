import React, { useState } from 'react';
import { useFilterStore, type ClassificationRole } from '../../store/useFilterStore';
import { Button } from '@/components/ui/button';

interface ColumnClassificationPanelProps {
    columns: {
        dimensions: string[];
        metrics: string[];
        targets: string[];
        dates: string[];
        excluded: string[];
    };
    isDark: boolean;
    proposals?: any[];
}

const ROLES: { label: string; value: ClassificationRole; description: string }[] = [
    { label: 'Dimension', value: 'Dimension', description: 'Categorical grouping column' },
    { label: 'Metric', value: 'Metric', description: 'Numeric column for aggregation' },
    { label: 'Date', value: 'Date', description: 'Time series column' },
    { label: 'Target', value: 'Target', description: 'Prediction / outcome column' },
    { label: 'Excluded', value: 'Excluded', description: 'IDs or noise columns to ignore' },
];

const isNumericNonDateColumn = (columnName: string, rawData: any[] | null): boolean => {
    if (!rawData || rawData.length === 0) return false;
    let numericCount = 0;
    let validDateCount = 0;
    let yearCount = 0;
    let totalCount = 0;

    for (let i = 0; i < Math.min(rawData.length, 100); i++) {
        const val = rawData[i]?.[columnName];
        if (val === null || val === undefined || val === '') continue;
        
        totalCount++;
        const numVal = Number(val);
        const isNum = !isNaN(numVal) && isFinite(numVal);
        
        if (isNum) {
            numericCount++;
            if (Number.isInteger(numVal) && numVal >= 1900 && numVal <= 2100) {
                yearCount++;
            }
        }

        if (typeof val === 'string') {
            const parsedDate = Date.parse(val);
            if (!isNaN(parsedDate)) {
                if (isNaN(Number(val)) || val.includes('-') || val.includes('/') || val.includes(':')) {
                    validDateCount++;
                }
            }
        }
    }

    if (totalCount === 0) return false;
    const isNumeric = (numericCount / totalCount) > 0.8;
    const isYear = (yearCount / totalCount) > 0.8;
    const isDateStr = (validDateCount / totalCount) > 0.4;

    return isNumeric && !isYear && !isDateStr;
};

export const ColumnClassificationPanel: React.FC<ColumnClassificationPanelProps> = ({ columns, proposals = [] }) => {
    const [isOpen, setIsOpen] = useState(true);
    const confidences = React.useMemo(() => {
        const map: Record<string, number> = {};
        proposals.forEach(p => {
            map[p.column_name || p.column] = p.confidence;
        });
        return map;
    }, [proposals]);
    const { classification_overrides, setClassificationOverride, rawData } = useFilterStore();

    // Flatten columns into a unified list [{ name, detectedRole }]
    const allCols: { name: string; detectedRole: ClassificationRole }[] = [];
    columns.dimensions.forEach(c => allCols.push({ name: c, detectedRole: 'Dimension' }));
    columns.metrics.forEach(c => allCols.push({ name: c, detectedRole: 'Metric' }));
    columns.dates.forEach(c => allCols.push({ name: c, detectedRole: 'Date' }));
    columns.targets.forEach(c => allCols.push({ name: c, detectedRole: 'Target' }));
    columns.excluded.forEach(c => allCols.push({ name: c, detectedRole: 'Excluded' }));

    // Sort alphabetically
    allCols.sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="mb-6 rounded-[16px] border border-border overflow-hidden bg-surface relative z-10">
            <Button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-5 flex items-center justify-between text-left transition-colors hover:bg-surface-2"
                variant="ghost"
                size="none"
            >
                <div>
                    <h3 className="text-[18px] font-extrabold text-foreground tracking-tight" style={{ fontFamily: '"Public Sans", sans-serif' }}>
                        Column Classification
                    </h3>
                    <p className="text-[14px] mt-1 text-muted-foreground" style={{ fontFamily: '"Be Vietnam Pro", sans-serif', fontWeight: 400 }}>
                        Review how Vizzy Pilot detected your columns. Override roles if necessary.
                    </p>
                </div>
                <svg
                    className={`w-5 h-5 transition-transform text-muted-foreground ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </Button>

            {isOpen && (
                <div className="p-6 pt-4 border-t border-border text-sm">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                         {allCols.map(col => {
                              const isOverridden = !!classification_overrides[col.name];
                              const currentRole = classification_overrides[col.name] || col.detectedRole;
                              const isNonDateNum = isNumericNonDateColumn(col.name, rawData);
                              const conf = confidences[col.name];
                              const isLowConfidence = typeof conf === 'number' && conf < 0.6;
 
                              return (
                                  <div key={col.name} className="flex flex-col gap-2 p-4 rounded-[12px] border border-border bg-surface-2 shadow-sm">
                                      <div className="flex justify-between items-center gap-1.5 flex-wrap">
                                          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground" style={{ fontFamily: '"Be Vietnam Pro", sans-serif' }}>
                                              {currentRole}
                                          </span>
                                          <div className="flex items-center gap-1.5">
                                              {isLowConfidence && !isOverridden && (
                                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded">
                                                      Low Confidence
                                                  </span>
                                              )}
                                              {isOverridden && (
                                                  <span className="text-[10px] uppercase font-bold text-primary px-1.5 py-0.5 rounded-full bg-surface-3 border border-border">Manual</span>
                                              )}
                                          </div>
                                      </div>
                                     <span className="text-[14px] font-semibold text-foreground truncate" style={{ fontFamily: '"Be Vietnam Pro", sans-serif' }} title={col.name}>
                                         {col.name}
                                     </span>
                                     <select
                                         value={currentRole}
                                         onChange={(e) => setClassificationOverride(col.name, e.target.value as ClassificationRole)}
                                         className="w-full px-2.5 py-2 text-[12px] rounded-[8px] border border-border bg-surface text-foreground focus:ring-1 focus:ring-ring focus:border-border-strong outline-none cursor-pointer"
                                     >
                                         {ROLES.map(r => {
                                             const isDisabled = r.value === 'Date' && isNonDateNum;
                                             return (
                                                 <option key={r.value} value={r.value} disabled={isDisabled}>
                                                     {r.label}{isDisabled ? ' (Not a Date)' : ''}
                                                 </option>
                                             );
                                         })}
                                     </select>
                                 </div>
                             );
                         })}
                    </div>
                </div>
            )}
        </div>
    );
};
