// FilterBar.tsx — active filters view and drop zone — extracted from CanvasPage.tsx
import React from 'react';
import { Filter, Sliders, ChevronDown, Check, Trash2, ArrowRight } from 'lucide-react';
import type { CustomFilter } from '../types';

interface FilterBarProps {
  customFilters: CustomFilter[];
  setCustomFilters: React.Dispatch<React.SetStateAction<CustomFilter[]>>;
  isDraggingOverFilters: boolean;
  setIsDraggingOverFilters: (v: boolean) => void;
  handleAddColumnAsFilter: (fieldName: string) => Promise<void>;
  addLog: (msg: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  customFilters, setCustomFilters,
  isDraggingOverFilters, setIsDraggingOverFilters,
  handleAddColumnAsFilter, addLog
}) => {
  // Drag and drop events for column filters zone
  const handleFilterDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverFilters(true);
  };

  const handleFilterDragLeave = () => {
    setIsDraggingOverFilters(false);
  };

  const handleFilterDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverFilters(false);
    const fieldName = e.dataTransfer.getData("text/plain");
    if (fieldName) {
      await handleAddColumnAsFilter(fieldName);
    }
  };

  const handleFilterSelectChange = (fieldName: string, value: string | null) => {
    setCustomFilters(prev => prev.map(f => {
      if (f.fieldName === fieldName) {
        return { ...f, selectedValue: value === 'ALL_VALS' ? null : value };
      }
      return f;
    }));
    addLog(`Filter "${fieldName}" changed value selection to: "${value ?? 'All'}"`);
  };

  const handleRemoveFilter = (fieldName: string) => {
    setCustomFilters(prev => prev.filter(f => f.fieldName !== fieldName));
    addLog(`Removed dynamic filter for: "${fieldName}"`);
  };

  return (
    <div 
      className={`border-b px-8 py-3.5 flex flex-wrap items-center gap-3 transition-colors duration-200 z-10 select-none ${
        isDraggingOverFilters 
          ? "bg-accent-custom/10 border-accent-custom/50" 
          : "bg-surface-2/20 border-border-custom"
      }`}
      onDragOver={handleFilterDragOver}
      onDragLeave={handleFilterDragLeave}
      onDrop={handleFilterDrop}
    >
      <div className="flex items-center space-x-2 text-xs font-mono font-bold uppercase tracking-wider text-muted-custom mr-2">
        <Filter className="w-3.5 h-3.5 text-accent-custom" />
        <span>Canvas Filters:</span>
      </div>

      {customFilters.length === 0 ? (
        <div className="text-[11px] text-muted-custom font-mono italic">
          Drag and drop fields here from the left sidebar to apply canvas-wide slicing...
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {customFilters.map((f, i) => (
            <div 
              key={i} 
              className="flex items-center bg-surface border border-border-custom hover:border-border-custom/80 rounded-xl pl-3 pr-1 py-1 text-xs shadow-xs animate-in zoom-in-95 duration-100"
            >
              <span className="font-mono text-muted-custom font-semibold mr-1.5">{f.fieldName}:</span>
              
              <div className="relative group">
                <select
                  value={f.selectedValue || 'ALL_VALS'}
                  onChange={(e) => handleFilterSelectChange(f.fieldName, e.target.value)}
                  className="bg-transparent border-none font-semibold text-text-custom outline-none pr-6 cursor-pointer text-xs appearance-none font-sans"
                >
                  <option value="ALL_VALS" className="bg-surface text-text-custom">All Values</option>
                  {f.options.map((opt, idx) => (
                    <option key={idx} value={opt} className="bg-surface text-text-custom">
                      {opt === '0' ? 'No (0)' : opt === '1' ? 'Yes (1)' : opt}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-1 flex items-center pointer-events-none text-muted-custom">
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveFilter(f.fieldName)}
                className="p-1 text-muted-custom hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer border-none bg-transparent ml-1"
                aria-label={`Remove filter for ${f.fieldName}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
