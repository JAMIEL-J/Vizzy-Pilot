// useCanvasWidgets — widget CRUD, undo/redo, persistence — extracted from CanvasPage.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { CanvasWidget, HistoryFrame, FieldDef } from '../types';
import { INITIAL_WIDGETS } from '../constants';

interface UseCanvasWidgetsReturn {
  // Core widget state
  widgets: CanvasWidget[];
  setWidgets: React.Dispatch<React.SetStateAction<CanvasWidget[]>>;

  // Undo/Redo
  past: HistoryFrame[];
  future: HistoryFrame[];
  setPast: React.Dispatch<React.SetStateAction<HistoryFrame[]>>;
  setFuture: React.Dispatch<React.SetStateAction<HistoryFrame[]>>;
  recordHistory: () => void;
  handleUndo: () => void;
  handleRedo: () => void;

  // Refs
  widgetsRef: React.MutableRefObject<CanvasWidget[]>;
  fieldsListRef: React.MutableRefObject<FieldDef[]>;
  checkedFieldsRef: React.MutableRefObject<string[]>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  hasDraggedRef: React.MutableRefObject<boolean>;

  // Computed
  contentWidth: number;
  contentHeight: number;

  // Actions
  handleDeleteWidget: (id: string, name: string, selectedWidgetId: string | null, setSelectedWidgetId: (id: string | null) => void) => void;
  handleClearCanvas: () => void;
  handleOrganizeLayout: () => void;
  updateWidgetBounds: (widgetId: string, updates: { x?: number; y?: number; width?: number; height?: number }) => void;

  // Logs
  logs: string[];
  addLog: (message: string) => void;
}

export function useCanvasWidgets(): UseCanvasWidgetsReturn {
  // Widget state with localStorage initialization
  const [widgets, setWidgets] = useState<CanvasWidget[]>(() => {
    const cached = localStorage.getItem('vizzy_canvas_widgets');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error("Failed to parse cached canvas widgets", e);
      }
    }
    return INITIAL_WIDGETS;
  });

  // Debounced localStorage persistence
  const widgetsPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (widgetsPersistTimerRef.current) {
      clearTimeout(widgetsPersistTimerRef.current);
    }
    widgetsPersistTimerRef.current = setTimeout(() => {
      localStorage.setItem('vizzy_canvas_widgets', JSON.stringify(widgets));
    }, 1500);
    return () => {
      if (widgetsPersistTimerRef.current) {
        clearTimeout(widgetsPersistTimerRef.current);
      }
    };
  }, [widgets]);

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 15));
  }, []);

  // Undo/Redo history
  const [past, setPast] = useState<HistoryFrame[]>([]);
  const [future, setFuture] = useState<HistoryFrame[]>([]);

  // Refs for synchronous access in event handlers
  const widgetsRef = useRef(widgets);
  const fieldsListRef = useRef<FieldDef[]>([]);
  const checkedFieldsRef = useRef<string[]>([]);
  const hasDraggedRef = useRef(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { widgetsRef.current = widgets; }, [widgets]);

  // Computed canvas dimensions
  const { contentWidth, contentHeight } = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    widgets.forEach(w => {
      const wWidth = w.customWidth ?? (w.type === 'kpi' ? 245 : 375);
      const wHeight = w.customHeight ?? (w.type === 'kpi' ? 120 : 230);
      const right = (w.position?.x ?? 20) + wWidth;
      const bottom = (w.position?.y ?? 20) + wHeight;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });
    return {
      contentWidth: Math.max(maxX + 40, 800),
      contentHeight: Math.max(maxY + 40, 600)
    };
  }, [widgets]);

  const recordHistory = useCallback(() => {
    setPast(prev => [
      ...prev,
      {
        widgets: widgetsRef.current,
        fieldsList: fieldsListRef.current,
        checkedFields: checkedFieldsRef.current
      }
    ]);
    setFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    setFuture(prev => [
      {
        widgets: widgetsRef.current,
        fieldsList: fieldsListRef.current,
        checkedFields: checkedFieldsRef.current
      },
      ...prev
    ]);
    
    setPast(newPast);
    setWidgets(previous.widgets);
    
    addLog("Undo executed: reverted workspace change.");
  }, [past, addLog]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    
    const next = future[0];
    const newFuture = future.slice(1);
    
    setPast(prev => [
      ...prev,
      {
        widgets: widgetsRef.current,
        fieldsList: fieldsListRef.current,
        checkedFields: checkedFieldsRef.current
      }
    ]);
    
    setFuture(newFuture);
    setWidgets(next.widgets);
    
    addLog("Redo executed: restored workspace change.");
  }, [future, addLog]);

  const handleDeleteWidget = useCallback((id: string, name: string, selectedWidgetId: string | null, setSelectedWidgetId: (id: string | null) => void) => {
    recordHistory();
    setWidgets(prev => prev.filter(w => w.id !== id));
    addLog(`Removed visual component: "${name}"`);
    if (selectedWidgetId === id) setSelectedWidgetId(null);
  }, [recordHistory, addLog]);

  const handleClearCanvas = useCallback(() => {
    if (!confirm("Are you sure you want to clear the entire canvas?")) return;
    setWidgets([]);
    setPast([]);
    setFuture([]);
    addLog('Canvas cleared.');
  }, [addLog]);

  const handleOrganizeLayout = useCallback(() => {
    recordHistory();
    addLog('Executing layout auto-alignment algorithm...');
    
    const sorted = [...widgets].sort((a, b) => {
      if (a.type === 'kpi' && b.type !== 'kpi') return -1;
      if (a.type !== 'kpi' && b.type === 'kpi') return 1;
      return 0;
    });

    let currentX = 16;
    let currentY = 16;
    let maxRowHeight = 120;

    const balanced = sorted.map((w) => {
      const width = w.type === 'kpi' ? 240 : 380;
      const height = w.type === 'kpi' ? 120 : 230;

      if (currentX + width > 850) {
        currentX = 16;
        currentY += maxRowHeight + 16;
        maxRowHeight = height;
      } else {
        maxRowHeight = Math.max(maxRowHeight, height);
      }

      const assignedPos = { x: currentX, y: currentY };
      currentX += width + 16;

      return {
        ...w,
        width: w.type === 'kpi' ? 'third' as const : 'half' as const,
        position: assignedPos
      };
    });

    setWidgets(balanced);
    addLog('Success: Canvas snapped to mathematical golden ratios.');
  }, [widgets, recordHistory, addLog]);

  const updateWidgetBounds = useCallback((widgetId: string, updates: { x?: number; y?: number; width?: number; height?: number }) => {
    const dragStartWidgets = [...widgetsRef.current];
    let changed = false;

    setWidgets(prev => {
      const nextWidgets = prev.map(w => {
        if (w.id === widgetId) {
          const updated = { ...w };
          if (updates.x !== undefined && (updated.position?.x !== updates.x)) {
            updated.position = { ...(updated.position || { x: 0, y: 0 }), x: Math.max(0, updates.x) };
            changed = true;
          }
          if (updates.y !== undefined && (updated.position?.y !== updates.y)) {
            updated.position = { ...(updated.position || { x: 0, y: 0 }), y: Math.max(0, updates.y) };
            changed = true;
          }
          if (updates.width !== undefined && (updated.customWidth !== updates.width)) {
            updated.customWidth = Math.max(120, updates.width);
            changed = true;
          }
          if (updates.height !== undefined && (updated.customHeight !== updates.height)) {
            updated.customHeight = Math.max(60, updates.height);
            changed = true;
          }
          return updated;
        }
        return w;
      });

      if (changed) {
        setPast(prevPast => [
          ...prevPast,
          {
            widgets: dragStartWidgets,
            fieldsList: fieldsListRef.current,
            checkedFields: checkedFieldsRef.current
          }
        ]);
        setFuture([]);
        
        const wName = dragStartWidgets.find(w => w.id === widgetId)?.title || "Visual";
        addLog(`Fine-tuned bounds for "${wName}" to position (${updates.x ?? 'keep'}, ${updates.y ?? 'keep'}) and dimensions (${updates.width ?? 'keep'}x${updates.height ?? 'keep'}).`);
      }
      return nextWidgets;
    });
  }, [addLog]);

  return {
    widgets, setWidgets,
    past, future, setPast, setFuture,
    recordHistory, handleUndo, handleRedo,
    widgetsRef, fieldsListRef, checkedFieldsRef, canvasContainerRef, hasDraggedRef,
    contentWidth, contentHeight,
    handleDeleteWidget, handleClearCanvas, handleOrganizeLayout, updateWidgetBounds,
    logs, addLog
  };
}
