// useCanvasFilters — cross-filtering, slicer state — extracted from CanvasPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { canvasService, formatKpiValue } from '../../../../lib/api/canvas';
import { toast } from 'react-hot-toast';
import type { CanvasWidget, CustomFilter, FieldDef } from '../types';
import { getColExpr } from '../utils/sqlBuilder';

interface UseCanvasFiltersParams {
  widgets: CanvasWidget[];
  setWidgets: React.Dispatch<React.SetStateAction<CanvasWidget[]>>;
  selectedDatasetId: string;
  selectedVersionId: string;
  fieldsList: FieldDef[];
  addLog: (msg: string) => void;
}

interface UseCanvasFiltersReturn {
  customFilters: CustomFilter[];
  setCustomFilters: React.Dispatch<React.SetStateAction<CustomFilter[]>>;
  isDraggingOverFilters: boolean;
  setIsDraggingOverFilters: (v: boolean) => void;
  geoFilters: Record<string, string[]>;
  setGeoFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  handleAddColumnAsFilter: (fieldName: string) => Promise<void>;
}

export function useCanvasFilters(params: UseCanvasFiltersParams): UseCanvasFiltersReturn {
  const { widgets, setWidgets, selectedDatasetId, selectedVersionId, fieldsList, addLog } = params;

  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [isDraggingOverFilters, setIsDraggingOverFilters] = useState(false);
  const [geoFilters, setGeoFilters] = useState<Record<string, string[]>>({});

  // Cross-filter re-query engine (debounced + abortable)
  const crossFilterAbortRef = useRef<AbortController | null>(null);
  const crossFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedDatasetId) return;

    const updatableWidgets = widgets.filter(w => w.sql);
    if (updatableWidgets.length === 0) return;

    const activeFilters = customFilters.filter(f => f.selectedValue !== null);

    if (crossFilterAbortRef.current) {
      crossFilterAbortRef.current.abort();
    }
    if (crossFilterTimerRef.current) {
      clearTimeout(crossFilterTimerRef.current);
    }

    crossFilterTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      crossFilterAbortRef.current = controller;

      const executeAll = async () => {
        try {
          const promises = updatableWidgets.map(async (w) => {
            if (controller.signal.aborted) return { id: w.id, data: w.data, error: 'Aborted', filterOmitted: true, isKpi: w.type === 'kpi' };
            try {
              const res = await canvasService.executeSql(
                selectedDatasetId, 
                selectedVersionId || '', 
                w.sql || '', 
                activeFilters
              );
              return {
                id: w.id,
                data: res.results,
                error: res.error,
                filterOmitted: res.filter_omitted,
                isKpi: w.type === 'kpi'
              };
            } catch (e) {
              if (controller.signal.aborted) return { id: w.id, data: w.data, error: 'Aborted', filterOmitted: true, isKpi: w.type === 'kpi' };
              console.error(`Failed to requery widget ${w.id}`, e);
              return { id: w.id, data: w.data, error: 'Failed', filterOmitted: true, isKpi: w.type === 'kpi' };
            }
          });

          const updates = await Promise.all(promises);
          if (controller.signal.aborted) return;

          setWidgets(currentWidgets => currentWidgets.map(w => {
            const update = updates.find(u => u.id === w.id);
            if (update && !update.error) {
              let updatedData = update.data || [];

              if (w.type === 'pie' || w.type === 'donut') {
                updatedData = updatedData.map((r: any) => ({ name: r.label || r.name, val: r.value || r.val }));
              }

              const titleText = String(w.title || '').toLowerCase();
              const topMatch = titleText.match(/\btop\s*(\d+)\b/);
              const titleLimit = topMatch ? parseInt(topMatch[1]) : null;
              const limit = titleLimit ?? w.limit;

              if (limit && updatedData.length > limit) {
                updatedData = updatedData.slice(0, limit);
              }

              const newWidget = {
                ...w,
                data: updatedData,
                filterOmitted: update.filterOmitted
              };
              if (update.isKpi && update.data && update.data.length > 0) {
                const firstRow = update.data[0];
                const numericKey = Object.keys(firstRow).find(k => typeof firstRow[k] === 'number');
                if (numericKey) {
                   const rawValue = firstRow[numericKey];
                   const metricLabel = w.targetMetricName || w.yAxisKey || numericKey;
                   newWidget.value = formatKpiValue(rawValue, metricLabel, w.activeAgg || 'SUM', w.numberFormat);
                }
              }
              return newWidget;
            }
            return w;
          }));
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error('Cross-filter re-query failed', err);
          }
        }
      };

      executeAll();
    }, 300);

    return () => {
      if (crossFilterTimerRef.current) clearTimeout(crossFilterTimerRef.current);
      if (crossFilterAbortRef.current) crossFilterAbortRef.current.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFilters, selectedDatasetId, selectedVersionId]);

  const handleAddColumnAsFilter = useCallback(async (fieldName: string) => {
    if (customFilters.some(f => f.fieldName === fieldName)) {
      addLog(`Filter for column "${fieldName}" is already present on the canvas.`);
      return;
    }
    
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    const fieldObj = fieldsList.find(f => f.name === fieldName);
    
    const newFilter: CustomFilter = {
      fieldName,
      category: fieldObj?.category || 'Dimensions',
      options: ['Loading...'],
      selectedValue: null
    };
    
    setCustomFilters(prev => [...prev, newFilter]);
    addLog(`Registering dynamic slicer filter for: "${fieldName}"...`);

    try {
      const fieldExpr = getColExpr(fieldName, fieldsList);
      const sql = `SELECT DISTINCT ${fieldExpr} AS val FROM data WHERE ${fieldExpr} IS NOT NULL ORDER BY val ASC LIMIT 100`;
      const sqlResult = await canvasService.executeSql(selectedDatasetId, selectedVersionId || '', sql);
      
      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        const vals = queryData.map((row: any) => {
          const val = row.val ?? row.VAL ?? '';
          return String(val);
        }).filter((v: string) => v.trim() !== '');
        
        setCustomFilters(prev => prev.map(f => {
          if (f.fieldName === fieldName) {
            return { ...f, options: vals.length > 0 ? vals : ['(Empty)'] };
          }
          return f;
        }));
        
        addLog(`SUCCESS: Loaded ${vals.length} slicer options for column: "${fieldName}"`);
      } else {
        throw new Error(sqlResult?.error || "SQL execution failed");
      }
    } catch (err: any) {
      console.error("Failed to load slicer filter options:", err);
      addLog(`WARNING: Failed to fetch filter options from database. Reverting to custom categories.`);
      setCustomFilters(prev => prev.map(f => {
        if (f.fieldName === fieldName) {
          return { ...f, options: ['High', 'Medium', 'Low'] };
        }
        return f;
      }));
    }
  }, [customFilters, selectedDatasetId, selectedVersionId, fieldsList, addLog]);

  return {
    customFilters, setCustomFilters,
    isDraggingOverFilters, setIsDraggingOverFilters,
    geoFilters, setGeoFilters,
    handleAddColumnAsFilter
  };
}
