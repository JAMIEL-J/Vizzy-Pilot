// useCanvasDragDrop — drag, resize, selection box, keyboard nudge — extracted from CanvasPage.tsx
import { useState, useEffect, useRef } from 'react';
import type { CanvasWidget, FieldDef, HistoryFrame } from '../types';

interface UseCanvasDragDropParams {
  widgets: CanvasWidget[];
  setWidgets: React.Dispatch<React.SetStateAction<CanvasWidget[]>>;
  widgetsRef: React.MutableRefObject<CanvasWidget[]>;
  fieldsListRef: React.MutableRefObject<FieldDef[]>;
  checkedFieldsRef: React.MutableRefObject<string[]>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  hasDraggedRef: React.MutableRefObject<boolean>;
  setPast: React.Dispatch<React.SetStateAction<HistoryFrame[]>>;
  setFuture: React.Dispatch<React.SetStateAction<HistoryFrame[]>>;
  addLog: (msg: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  gridSnap: boolean;
  canvasScale: number;
  isResponsive: boolean;
  isFullScreenCanvas: boolean;
  isPresentMode: boolean;
  setIsFullScreenCanvas: (v: boolean) => void;
  setIsPresentMode: (v: boolean) => void;
  setCheckedFields: React.Dispatch<React.SetStateAction<string[]>>;
}

interface UseCanvasDragDropReturn {
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;
  selectedWidgetIds: string[];
  setSelectedWidgetIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWidgetIdsRef: React.MutableRefObject<string[]>;
  selectionBox: { startX: number; startY: number; currentX: number; currentY: number; active: boolean } | null;
  handleDragStart: (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => void;
  handleResizeStart: (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => void;
  handleCanvasPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useCanvasDragDrop(params: UseCanvasDragDropParams): UseCanvasDragDropReturn {
  const {
    widgets, setWidgets, widgetsRef, fieldsListRef, checkedFieldsRef,
    canvasContainerRef, hasDraggedRef,
    setPast, setFuture, addLog,
    handleUndo, handleRedo,
    gridSnap, canvasScale, isResponsive,
    isFullScreenCanvas, isPresentMode, setIsFullScreenCanvas, setIsPresentMode,
    setCheckedFields
  } = params;

  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number; active: boolean } | null>(null);
  const selectedWidgetIdsRef = useRef<string[]>([]);

  useEffect(() => {
    selectedWidgetIdsRef.current = selectedWidgetIds;
  }, [selectedWidgetIds]);

  // Sync fields checklist with selected widget's fields
  useEffect(() => {
    if (selectedWidgetId) {
      const widget = widgets.find(w => w.id === selectedWidgetId);
      if (widget) {
        const metrics = widget.targetMetricName ? widget.targetMetricName.split(',').map(s => s.trim()) : [];
        const dims = widget.targetDimName ? widget.targetDimName.split(',').map(s => s.trim()) : [];
        setCheckedFields([...dims, ...metrics]);
      }
    }
  }, [selectedWidgetId, widgets, setCheckedFields]);

  // Keyboard shortcuts: Ctrl+Z/Y undo/redo, Escape, Arrow nudge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      if (e.key === 'Escape') {
        if (isPresentMode) {
          setIsPresentMode(false);
          addLog("Exited Present Mode via Escape key.");
        } else if (isFullScreenCanvas) {
          setIsFullScreenCanvas(false);
          addLog("Exited Full Screen mode via Escape key.");
        }
      }

      if (modifier && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (modifier && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }

      // Keyboard nudge for selected widgets
      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (isArrow && selectedWidgetIdsRef.current.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 16 : 4;
        let deltaX = 0;
        let deltaY = 0;
        if (e.key === 'ArrowUp') deltaY = -step;
        if (e.key === 'ArrowDown') deltaY = step;
        if (e.key === 'ArrowLeft') deltaX = -step;
        if (e.key === 'ArrowRight') deltaX = step;

        const startWidgets = [...widgetsRef.current];
        
        setWidgets(prev => {
          return prev.map(w => {
            if (selectedWidgetIdsRef.current.includes(w.id)) {
              const width = w.customWidth ?? (w.type === 'kpi' ? 245 : 375);
              const height = w.customHeight ?? (w.type === 'kpi' ? 120 : 230);
              const px = w.position?.x ?? 16;
              const py = w.position?.y ?? 16;
              let newX = px + deltaX;
              let newY = py + deltaY;
              newX = Math.max(0, Math.min(newX, 2400 - width));
              newY = Math.max(0, Math.min(newY, 1600 - height));
              return { ...w, position: { x: newX, y: newY } };
            }
            return w;
          });
        });

        setPast(prev => [
          ...prev,
          {
            widgets: startWidgets,
            fieldsList: fieldsListRef.current,
            checkedFields: checkedFieldsRef.current
          }
        ]);
        setFuture([]);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUndo, handleRedo, isFullScreenCanvas, isPresentMode, addLog, setIsFullScreenCanvas, setIsPresentMode, setWidgets, setPast, setFuture, widgetsRef, fieldsListRef, checkedFieldsRef]);

  // Drag start handler — multi-widget drag with direct DOM manipulation
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('input')) {
      return;
    }
    
    e.preventDefault();
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    let activeIds = [...selectedWidgetIdsRef.current];
    if (!activeIds.includes(widgetId)) {
      if (e.shiftKey) {
        activeIds = [...activeIds, widgetId];
      } else {
        activeIds = [widgetId];
      }
      setSelectedWidgetIds(activeIds);
      setSelectedWidgetId(widgetId);
    }
    
    const dragStartWidgets = [...widgetsRef.current];
    const startX = e.clientX;
    const startY = e.clientY;
    
    const initialPositions = activeIds.map(id => {
      const w = widgetsRef.current.find(item => item.id === id);
      return {
        id,
        initialX: w?.position?.x ?? 16,
        initialY: w?.position?.y ?? 16,
        width: w?.customWidth ?? (w?.type === 'kpi' ? 245 : 375),
        height: w?.customHeight ?? (w?.type === 'kpi' ? 120 : 230)
      };
    });
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      initialPositions.forEach(pos => {
        const el = document.getElementById(`widget-card-${pos.id}`);
        if (el) {
          let newX = pos.initialX + deltaX;
          let newY = pos.initialY + deltaY;
          if (gridSnap) {
            newX = Math.round(newX / 16) * 16;
            newY = Math.round(newY / 16) * 16;
          }
          newX = Math.max(0, Math.min(newX, 2400 - pos.width));
          newY = Math.max(0, Math.min(newY, 1600 - pos.height));
          
          el.style.left = `${newX}px`;
          el.style.top = `${newY}px`;
        }
      });
    };
    
    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      const deltaX = upEvent.clientX - startX;
      const deltaY = upEvent.clientY - startY;

      setWidgets(prev => prev.map(w => {
        if (activeIds.includes(w.id)) {
          const pos = initialPositions.find(p => p.id === w.id);
          if (pos) {
            let newX = pos.initialX + deltaX;
            let newY = pos.initialY + deltaY;
            if (gridSnap) {
              newX = Math.round(newX / 16) * 16;
              newY = Math.round(newY / 16) * 16;
            }
            newX = Math.max(0, Math.min(newX, 2400 - pos.width));
            newY = Math.max(0, Math.min(newY, 1600 - pos.height));
            return {
              ...w,
              position: { x: newX, y: newY }
            };
          }
        }
        return w;
      }));

      const anyMoved = initialPositions.some(() => {
        const deltaXFinal = upEvent.clientX - startX;
        const deltaYFinal = upEvent.clientY - startY;
        return deltaXFinal !== 0 || deltaYFinal !== 0;
      });

      if (anyMoved) {
        setPast(prev => [
          ...prev,
          {
            widgets: dragStartWidgets,
            fieldsList: fieldsListRef.current,
            checkedFields: checkedFieldsRef.current
          }
        ]);
        setFuture([]);
        addLog(`Moved ${activeIds.length} component(s) on the canvas.`);
      }
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Resize handler with direct DOM manipulation
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    const widget = widgetsRef.current.find(w => w.id === widgetId);
    if (!widget) return;
    
    const startWidth = widget.customWidth ?? (widget.type === 'kpi' ? 245 : 375);
    const startHeight = widget.customHeight ?? (widget.type === 'kpi' ? 120 : 230);
    const startX = e.clientX;
    const startY = e.clientY;
    const dragStartWidgets = [...widgetsRef.current];

    const widgetEl = document.querySelector(`[data-widget-id="${widgetId}"]`) as HTMLElement | null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      let nextWidth = Math.max(150, startWidth + deltaX);
      let nextHeight = Math.max(80, startHeight + deltaY);
      
      if (gridSnap) {
        nextWidth = Math.round(nextWidth / 16) * 16;
        nextHeight = Math.round(nextHeight / 16) * 16;
      }
      
      if (widgetEl) {
        widgetEl.style.width = `${nextWidth}px`;
        widgetEl.style.height = `${nextHeight}px`;
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      const deltaX = upEvent.clientX - startX;
      const deltaY = upEvent.clientY - startY;
      let finalWidth = Math.max(150, startWidth + deltaX);
      let finalHeight = Math.max(80, startHeight + deltaY);
      if (gridSnap) {
        finalWidth = Math.round(finalWidth / 16) * 16;
        finalHeight = Math.round(finalHeight / 16) * 16;
      }

      setWidgets(prev => prev.map(w => {
        if (w.id === widgetId) {
          return { ...w, customWidth: finalWidth, customHeight: finalHeight };
        }
        return w;
      }));

      if (startWidth !== finalWidth || startHeight !== finalHeight) {
        setPast(prev => [
          ...prev,
          {
            widgets: dragStartWidgets,
            fieldsList: fieldsListRef.current,
            checkedFields: checkedFieldsRef.current
          }
        ]);
        setFuture([]);
        addLog(`Resized component "${widget.title}" to ${finalWidth}x${finalHeight}px.`);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Selection box on canvas background
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isResponsive) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('.canvas-widget') || target.closest('button') || target.closest('select') || target.closest('input')) {
      return;
    }

    hasDraggedRef.current = false;
    const currentTarget = e.currentTarget;
    currentTarget.setPointerCapture(e.pointerId);

    const rect = currentTarget.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / (canvasScale || 1);
    const startY = (e.clientY - rect.top) / (canvasScale || 1);

    setSelectionBox({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      active: true
    });

    if (!e.shiftKey) {
      setSelectedWidgetIds([]);
      setSelectedWidgetId(null);
      setCheckedFields([]);
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!rect) return;
      const currentX = (moveEvent.clientX - rect.left) / (canvasScale || 1);
      const currentY = (moveEvent.clientY - rect.top) / (canvasScale || 1);

      if (Math.abs(currentX - startX) > 3 || Math.abs(currentY - startY) > 3) {
        hasDraggedRef.current = true;
      }

      setSelectionBox(prev => {
        if (!prev) return null;
        return { ...prev, currentX, currentY };
      });

      const boxStartX = Math.min(startX, currentX);
      const boxEndX = Math.max(startX, currentX);
      const boxStartY = Math.min(startY, currentY);
      const boxEndY = Math.max(startY, currentY);

      const intersectingIds: string[] = [];
      widgetsRef.current.forEach(widget => {
        const w = widget.customWidth ?? (widget.type === 'kpi' ? 245 : 375);
        const h = widget.customHeight ?? (widget.type === 'kpi' ? 120 : 230);
        const wx = widget.position?.x ?? 16;
        const wy = widget.position?.y ?? 16;
        const wEndX = wx + w;
        const wEndY = wy + h;

        const intersects = !(wx > boxEndX || wEndX < boxStartX || wy > boxEndY || wEndY < boxStartY);
        if (intersects) {
          intersectingIds.push(widget.id);
        }
      });

      setSelectedWidgetIds(prev => {
        if (moveEvent.shiftKey) {
          const combined = new Set([...prev, ...intersectingIds]);
          return Array.from(combined);
        }
        return intersectingIds;
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      try {
        currentTarget.releasePointerCapture(upEvent.pointerId);
      } catch (err) {
        console.error("Failed to release pointer capture:", err);
      }
      
      setSelectionBox(null);

      setSelectedWidgetIds(finalIds => {
        if (finalIds.length > 0) {
          setSelectedWidgetId(finalIds[0]);
        }
        return finalIds;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return {
    selectedWidgetId, setSelectedWidgetId,
    selectedWidgetIds, setSelectedWidgetIds,
    selectedWidgetIdsRef,
    selectionBox,
    handleDragStart, handleResizeStart, handleCanvasPointerDown
  };
}
