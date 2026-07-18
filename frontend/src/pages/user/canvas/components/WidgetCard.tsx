// WidgetCard.tsx — absolute layout wrapper for widgets — extracted from CanvasPage.tsx
import React from 'react';
import { 
  Trash2, Download, Maximize2, Minimize2, GripVertical, Settings2, Loader2, RefreshCw 
} from 'lucide-react';
import type { CanvasWidget } from '../types';
import { ChartRenderer } from './ChartRenderer';

interface WidgetCardProps {
  widget: CanvasWidget;
  selectedWidgetIds: string[];
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;
  setSelectedWidgetIds: React.Dispatch<React.SetStateAction<string[]>>;
  isResponsive: boolean;
  isFullScreenCanvas: boolean;
  isPresentMode: boolean;
  geoFilters: Record<string, string[]>;
  setGeoFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  addLog: (msg: string) => void;
  handleDragStart: (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => void;
  handleResizeStart: (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => void;
  handleDeleteWidget: (id: string, name: string, selectedWidgetId: string | null, setSelectedWidgetId: (id: string | null) => void) => void;
  onFilterClick?: (fieldName: string, value: string) => void;
  onWidgetRightClick: (e: React.MouseEvent, widgetId: string) => void;
  // Trigger single widget compilation refresh
  onRecompile?: (widgetId: string, fields: string[]) => void;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({
  widget,
  selectedWidgetIds,
  selectedWidgetId,
  setSelectedWidgetId,
  setSelectedWidgetIds,
  isResponsive,
  isFullScreenCanvas,
  isPresentMode,
  geoFilters,
  setGeoFilters,
  addLog,
  handleDragStart,
  handleResizeStart,
  handleDeleteWidget,
  onFilterClick,
  onWidgetRightClick,
  onRecompile
}) => {
  const isSelected = selectedWidgetIds.includes(widget.id);
  const isPrimarySelected = selectedWidgetId === widget.id;

  const defaultWidth = widget.type === 'kpi' ? 245 : 375;
  const defaultHeight = widget.type === 'kpi' ? 120 : 230;

  const width = widget.customWidth ?? defaultWidth;
  const height = widget.customHeight ?? defaultHeight;

  const px = widget.position?.x ?? 16;
  const py = widget.position?.y ?? 16;

  const metrics = widget.targetMetricName ? widget.targetMetricName.split(',').map(s => s.trim()) : [];
  const dims = widget.targetDimName ? widget.targetDimName.split(',').map(s => s.trim()) : [];

  // Render wrapper style based on responsive vs absolute layout
  const style: React.CSSProperties = isResponsive 
    ? {} 
    : {
        position: 'absolute',
        left: `${px}px`,
        top: `${py}px`,
        width: `${width}px`,
        height: `${height}px`,
      };

  return (
    <div
      id={`widget-card-${widget.id}`}
      data-widget-id={widget.id}
      role="region"
      aria-label={`Chart: ${widget.title}`}
      tabIndex={0}
      aria-selected={isSelected}
      onContextMenu={(e) => onWidgetRightClick(e, widget.id)}
      className={`canvas-widget bg-surface border rounded-2xl flex flex-col shadow-xs group/card overflow-hidden select-none outline-none ${
        isResponsive ? 'w-full h-[320px]' : ''
      } ${
        isPrimarySelected 
          ? 'border-accent-custom ring-2 ring-accent-custom/20 shadow-md shadow-accent-custom/5' 
          : isSelected
            ? 'border-accent-custom/60 shadow-md'
            : 'border-border-custom hover:border-border-custom/80 hover:shadow-xs'
      }`}
      style={style}
    >
      {/* Header controls (only when not in present mode) */}
      {!isPresentMode && (
        <div 
          className="px-4 py-2 border-b border-border-custom/50 flex items-center justify-between bg-surface-2/20 cursor-grab active:cursor-grabbing relative select-none"
          onPointerDown={(e) => handleDragStart(e, widget.id)}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            <GripVertical className="w-3 h-3 text-muted-custom/60 shrink-0 select-none pointer-events-none" />
            <span className="text-[11px] font-semibold text-text-custom truncate font-sans">
              {widget.title}
            </span>
          </div>

          <div className="flex items-center space-x-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
            {onRecompile && (
              <button
                type="button"
                onClick={() => onRecompile(widget.id, [...dims, ...metrics])}
                className="p-1 hover:bg-surface rounded-md text-muted-custom hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
                title="Refresh SQL"
                aria-label="Refresh widget query"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDeleteWidget(widget.id, widget.title, selectedWidgetId, setSelectedWidgetId)}
              className="p-1 hover:bg-red-500/10 rounded-md text-muted-custom hover:text-red-500 transition-all cursor-pointer border-none bg-transparent"
              title="Delete widget"
              aria-label="Delete widget"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Render Chart Content Area */}
      <div className="flex-1 p-4 overflow-hidden relative">
        <ChartRenderer 
          widget={widget} 
          isFullScreenCanvas={isFullScreenCanvas} 
          isPresentMode={isPresentMode} 
          geoFilters={geoFilters}
          setGeoFilters={setGeoFilters}
          addLog={addLog}
          onFilterClick={onFilterClick}
        />
      </div>

      {/* Resize grip handle (PowerBI style bottom-right resize, skip when in present/responsive) */}
      {!isPresentMode && !isResponsive && (
        <div 
          className="absolute bottom-1 right-1 w-3.5 h-3.5 flex items-center justify-center cursor-se-resize select-none active:scale-95 text-muted-custom/30 hover:text-muted-custom"
          onPointerDown={(e) => handleResizeStart(e, widget.id)}
          aria-label="Resize widget"
          title="Drag to resize"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" className="fill-current">
            <path d="M6 0v6H0v2h8V0z"/>
          </svg>
        </div>
      )}
    </div>
  );
};
