// ChartRenderer.tsx — renders the custom SVG or interactive chart visuals — extracted from CanvasPage.tsx
import React from 'react';
import { 
  BarChart3, TrendingUp, HelpCircle, Layers, FileSpreadsheet
} from 'lucide-react';
import type { CanvasWidget } from '../types';
import { CustomGeoMap } from '../../CustomGeoMap';
import { formatKpiValue } from '../../../../lib/api/canvas';
import { beautifyTitle, sanitizeLabel } from '../utils/canvasUtils';

interface ChartRendererProps {
  widget: CanvasWidget;
  isFullScreenCanvas: boolean;
  isPresentMode: boolean;
  geoFilters: Record<string, string[]>;
  setGeoFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  addLog: (msg: string) => void;
  // Callback for cross-filter selector clicks
  onFilterClick?: (fieldName: string, value: string) => void;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  widget,
  isFullScreenCanvas,
  isPresentMode,
  geoFilters,
  setGeoFilters,
  addLog,
  onFilterClick
}) => {
  const isLargeView = isFullScreenCanvas || isPresentMode;

  // Aggregate helpers
  const maxVal = React.useMemo(() => {
    if (!widget.data || widget.data.length === 0) return 1;
    const values = widget.data.map(d => {
      const keys = Object.keys(d);
      const valKey = widget.yAxisKey || keys.find(k => k !== (widget.xAxisKey || 'label')) || 'value';
      return Number(d[valKey]) || 0;
    });
    return Math.max(...values, 1);
  }, [widget.data, widget.yAxisKey, widget.xAxisKey]);

  const totalPieVal = React.useMemo(() => {
    if (widget.type !== 'pie' && widget.type !== 'donut') return 0;
    return widget.data.reduce((sum, item) => sum + (Number(item.val || item.value || 0) || 0), 0);
  }, [widget.data, widget.type]);

  // Render KPIs
  if (widget.type === 'kpi') {
    return (
      <div className="flex flex-col h-full justify-between font-sans relative group/kpi">
        <div className="flex items-center justify-between space-x-2.5">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-custom/75 select-none block">
              {widget.title}
            </span>
            <div className="text-xl sm:text-2xl font-black text-text-custom tracking-tight leading-none">
              {widget.value || '0'}
            </div>
          </div>
        </div>
        {widget.subtext && (
          <div className="text-[10px] text-muted-custom font-medium mt-2 select-none border-t border-border-custom/30 pt-1.5 flex items-center justify-between">
            <span className="truncate pr-2">{widget.subtext}</span>
            {widget.filterOmitted && (
              <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-md font-mono select-none" title="Filter ignored for this KPI">
                Unfiltered
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Render Empty State
  if (!widget.data || widget.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 text-muted-custom border-2 border-dashed border-border-custom/50 rounded-xl bg-surface-2/10">
        <HelpCircle className="w-6 h-6 mb-2 text-muted-custom/60 animate-bounce" />
        <span className="text-[11px] font-mono">No data matches current cross-filters.</span>
      </div>
    );
  }

  // Render Bar & Stacked Bar Charts
  if (widget.type === 'bar' || widget.type === 'stacked_bar') {
    const key = widget.xAxisKey || 'label';
    const valKey = widget.yAxisKey || 'value';
    
    return (
      <div className="flex flex-col h-full justify-between font-sans">
        <div className="flex-1 flex items-end justify-between space-x-2 pt-2 px-1 pb-1">
          {widget.data.map((item: any, idx) => {
            const label = sanitizeLabel(item[key]);
            const val = Number(item[valKey]) || 0;
            const heightPercent = Math.min(100, Math.max(8, (val / maxVal) * 85));

            return (
              <div 
                key={idx} 
                className="flex-1 flex flex-col items-center h-full group relative cursor-pointer"
                onClick={() => onFilterClick && onFilterClick(key, item[key])}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 bg-slate-900 border border-slate-700 text-white rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none text-[10px] shadow-xl whitespace-nowrap">
                  <div className="font-bold">{label}</div>
                  <div className="text-accent-custom mt-0.5 font-mono">
                    {formatKpiValue(val, widget.targetMetricName || valKey, widget.activeAgg, widget.numberFormat)}
                  </div>
                </div>

                <div className="flex-1 w-full flex items-end justify-center rounded-lg overflow-hidden relative">
                  <div 
                    className="w-[75%] rounded-t-md transition-all duration-300 group-hover:opacity-90 relative"
                    style={{ 
                      height: `${heightPercent}%`, 
                      backgroundColor: widget.color || '#0EA5E9' 
                    }}
                  />
                </div>
                <span className="text-[9px] text-muted-custom truncate w-full text-center mt-1 select-none">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render Line Charts
  if (widget.type === 'line') {
    const key = widget.xAxisKey || 'label';
    const valKey = widget.yAxisKey || 'value';

    return (
      <div className="flex flex-col h-full justify-between font-sans relative">
        <div className="flex-1 relative pt-2">
          {/* Render simplified SVG sparkline paths */}
          <svg className="w-full h-[80%] overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`gradient-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={widget.color || '#8B5CF6'} stopOpacity="0.3"/>
                <stop offset="100%" stopColor={widget.color || '#8B5CF6'} stopOpacity="0"/>
              </linearGradient>
            </defs>
            {/* Grid Lines */}
            <line x1="0" y1="15" x2="100" y2="15" stroke="currentColor" className="text-border-custom/30" strokeDasharray="2,2" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" className="text-border-custom/30" strokeDasharray="2,2" strokeWidth="0.5" />
            <line x1="0" y1="85" x2="100" y2="85" stroke="currentColor" className="text-border-custom/30" strokeDasharray="2,2" strokeWidth="0.5" />

            {/* Spark Area */}
            <path
              d={(() => {
                const points = widget.data.map((item: any, idx) => {
                  const x = (idx / (widget.data.length - 1)) * 100;
                  const y = 90 - ((Number(item[valKey]) || 0) / maxVal) * 75;
                  return `${x},${y}`;
                });
                return `M0,100 L${points.join(' L')} L100,100 Z`;
              })()}
              fill={`url(#gradient-${widget.id})`}
            />

            {/* Spark Line */}
            <path
              d={(() => {
                return widget.data.map((item: any, idx) => {
                  const x = (idx / (widget.data.length - 1)) * 100;
                  const y = 90 - ((Number(item[valKey]) || 0) / maxVal) * 75;
                  return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
                }).join(' ');
              })()}
              fill="none"
              stroke={widget.color || '#8B5CF6'}
              strokeWidth="2"
            />
          </svg>
          {/* Axis Labels */}
          <div className="flex justify-between text-[8px] text-muted-custom select-none font-mono mt-1 px-1">
            <span>{sanitizeLabel(widget.data[0][key])}</span>
            <span>{sanitizeLabel(widget.data[widget.data.length - 1][key])}</span>
          </div>
        </div>
      </div>
    );
  }

  // Render Pie & Donut Charts
  if (widget.type === 'pie' || widget.type === 'donut') {
    const isDonut = widget.type === 'donut';
    let currentAngle = 0;

    return (
      <div className="flex h-full items-center justify-around font-sans">
        <div className="relative w-28 h-28 shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 42 42">
            {widget.data.map((item: any, idx) => {
              const val = Number(item.val || item.value || 0) || 0;
              const percent = (val / totalPieVal) * 100;
              const strokeDash = `${percent} ${100 - percent}`;
              const strokeOffset = 100 - currentAngle;
              currentAngle += percent;

              const colors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
              const segmentColor = colors[idx % colors.length];

              return (
                <circle
                  key={idx}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={segmentColor}
                  strokeWidth={isDonut ? "5" : "31.83"}
                  strokeDasharray={strokeDash}
                  strokeDashoffset={strokeOffset}
                  className="transition-all duration-300 hover:opacity-90 cursor-pointer"
                  onClick={() => onFilterClick && onFilterClick(widget.xAxisKey || 'name', item.name || item.label)}
                />
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col space-y-1 overflow-y-auto max-h-24 pr-1 text-[9px] text-muted-custom max-w-[50%]">
          {widget.data.slice(0, 5).map((item: any, idx) => {
            const val = Number(item.val || item.value || 0) || 0;
            const percent = ((val / totalPieVal) * 100).toFixed(0);
            const colors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
            const segmentColor = colors[idx % colors.length];

            return (
              <div key={idx} className="flex items-center space-x-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: segmentColor }} />
                <span className="font-semibold text-text-custom truncate">{sanitizeLabel(item.name || item.label)}</span>
                <span className="font-mono">({percent}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render Maps
  if (widget.type === 'map') {
    return (
      <div className="h-full relative overflow-hidden flex flex-col justify-between">
        <div className="flex-1 w-full bg-slate-950/20 rounded-xl relative overflow-hidden min-h-[140px]">
          <CustomGeoMap 
            data={widget.data as any} 
            color={widget.color}
            targetMetricName={widget.targetMetricName || widget.yAxisKey}
          />
        </div>
      </div>
    );
  }

  // Render Table (Fallback)
  const columns = Object.keys(widget.data[0] || {}).slice(0, 5);
  return (
    <div className="flex flex-col h-full font-mono text-[9px] overflow-hidden select-text">
      <div className="flex-1 overflow-auto border border-border-custom/50 rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border-custom sticky top-0">
              {columns.map((col, idx) => (
                <th key={idx} className="p-1.5 font-bold uppercase text-muted-custom border-r border-border-custom/30 select-none">
                  {beautifyTitle(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widget.data.slice(0, 50).map((row: any, idx) => (
              <tr key={idx} className="hover:bg-surface-2/40 border-b border-border-custom/10 transition-colors">
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="p-1.5 border-r border-border-custom/10 truncate max-w-[120px]">
                    {String(row[col] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
