// ChartRenderer.tsx — renders the custom SVG or interactive chart visuals — extracted from CanvasPage.tsx
import React from 'react';
import { 
  BarChart3, TrendingUp, HelpCircle, Layers, FileSpreadsheet
} from 'lucide-react';
import type { CanvasWidget, CustomFilter } from '../types';
import { CustomGeoMap } from '../../CustomGeoMap';
import { formatKpiValue } from '../../../../lib/api/canvas';
import { beautifyTitle, sanitizeLabel, getKpiIcon, getDisplayKPI } from '../utils/canvasUtils';
import { prettifyLabel } from '../../../../components/dashboard/dashboard-helpers';

interface ChartRendererProps {
  widget: CanvasWidget;
  isFullScreenCanvas: boolean;
  isPresentMode: boolean;
  geoFilters: Record<string, string[]>;
  setGeoFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  addLog: (msg: string) => void;
  // Callback for cross-filter selector clicks
  onFilterClick?: (fieldName: string, value: string) => void;
  customFilters?: CustomFilter[];
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  widget,
  isFullScreenCanvas,
  isPresentMode,
  geoFilters,
  setGeoFilters,
  addLog,
  onFilterClick,
  customFilters = []
}) => {
  const isLargeView = isFullScreenCanvas || isPresentMode;
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  // Safely extract chartData array from widget.data (handles both flat array and object { rows: [...] })
  const chartData = React.useMemo(() => {
    if (!widget.data) return [];
    if (Array.isArray(widget.data)) return widget.data;
    if (Array.isArray((widget.data as any).rows)) return (widget.data as any).rows;
    return [];
  }, [widget.data]);

  // Aggregate helpers
  const maxVal = React.useMemo(() => {
    if (chartData.length === 0) return 1;
    const values = chartData.map((d: any) => {
      const keys = Object.keys(d);
      const valKey = widget.yAxisKey || keys.find(k => k !== (widget.xAxisKey || 'label')) || 'value';
      return Number(d[valKey]) || 0;
    });
    return Math.max(...values, 1);
  }, [chartData, widget.yAxisKey, widget.xAxisKey]);

  const totalPieVal = React.useMemo(() => {
    if (widget.type !== 'pie' && widget.type !== 'donut') return 0;
    return chartData.reduce((sum: number, item: any) => sum + (Number(item.val || item.value || 0) || 0), 0);
  }, [chartData, widget.type]);

  // Render KPIs
  if (widget.type === 'kpi') {
    const kpiData = getDisplayKPI(widget, customFilters);
    const defaultWidth = widget.type === 'kpi' ? 245 : 375;
    const defaultHeight = widget.type === 'kpi' ? 120 : 230;
    const width = widget.customWidth ?? defaultWidth;
    const height = widget.customHeight ?? defaultHeight;

    return (
      <div className="flex-1 flex flex-col justify-between min-h-0 mt-0.5 text-left relative overflow-hidden transition-all duration-300 group/kpi">
        {/* Glowing background circle for premium visual depth */}
        <div 
          className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full blur-2xl opacity-15 pointer-events-none transition-transform duration-500 group-hover/kpi:scale-125"
          style={{ backgroundColor: widget.color }}
        />
        
        <div className="flex items-start justify-between gap-3 w-full">
          <div className="flex flex-col space-y-0.5 min-w-0">
            {/* Subtitle / Meta */}
            <span className="text-[8.5px] font-mono text-muted-custom uppercase tracking-wider truncate max-w-[150px]">
              {widget.targetMetricName ? prettifyLabel(widget.targetMetricName.split(',')[0]) : 'Metric Value'}
            </span>
            {/* Big Value */}
            <div 
              className="font-bold tracking-tight transition-all font-mono leading-none truncate w-full select-all" 
              style={{ 
                color: (widget.numberFormat?.negativeStyle === 'red' && (String(kpiData.value).startsWith('-') || String(kpiData.value).startsWith('('))) ? '#EF4444' : widget.color,
                fontSize: height > 180 ? '2.5rem' : height > 140 ? '2rem' : width > 200 ? '1.8rem' : '1.4rem',
                maxWidth: `${width - 80}px`
              }}
              title={kpiData.value || ''}
            >
              {kpiData.value || '—'}
            </div>

            {/* Associated Context Details (State, Profit etc.) */}
            {kpiData.extraDetails && kpiData.extraDetails.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 max-w-full max-h-[36px] overflow-y-auto scrollbar-none">
                {kpiData.extraDetails.slice(0, 4).map((detail, idx) => (
                  <div 
                    key={idx} 
                    className="text-[7.5px] font-mono px-1.5 py-0.5 rounded bg-surface/50 border border-border-custom/30 text-muted-custom flex items-center space-x-1 whitespace-nowrap"
                  >
                    <span className="opacity-75">{detail.label}:</span>
                    <span className="font-bold text-text-custom">{detail.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Auto-detected Category Icon */}
          {getKpiIcon(widget.targetMetricName || '', widget.color || '#3B82F6')}
        </div>

        {/* Progress bar or dynamic trend pill */}
        <div className="flex items-center justify-between w-full mt-2 pt-1.5 border-t border-border-custom/10">
          <span className="text-[8.5px] text-muted-custom truncate pr-2" title={kpiData.subtext}>
            {kpiData.subtext}
          </span>
          {/* Active aggregation badge */}
          <div 
            className="text-[7.5px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0"
            style={{ 
              backgroundColor: `${widget.color}08`, 
              borderColor: `${widget.color}15`,
              color: widget.color 
            }}
          >
            {widget.activeAgg || 'SUM'}
          </div>
        </div>
      </div>
    );
  }

  // Render Empty State
  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 text-muted-custom border-2 border-dashed border-border-custom/50 rounded-xl bg-surface-2/10">
        <HelpCircle className="w-6 h-6 mb-2 text-muted-custom/60 animate-bounce" />
        <span className="text-[11px] font-mono">No data matches current cross-filters.</span>
      </div>
    );
  }

  // Render Bar & Stacked Bar Charts
  if (widget.type === 'bar' || widget.type === 'stacked_bar') {
    const firstRow = chartData[0] || {};
    const rowKeys = Object.keys(firstRow);

    const key = (widget.xAxisKey && firstRow[widget.xAxisKey] !== undefined)
      ? widget.xAxisKey
      : (rowKeys.find(k => typeof firstRow[k] === 'string' || isNaN(Number(firstRow[k]))) || rowKeys[0] || 'label');

    const defaultWidth = 375;
    const defaultHeight = 230;
    const width = widget.customWidth ?? defaultWidth;
    const height = widget.customHeight ?? defaultHeight;

    // For stacked bar or multi-metric bar, get all numeric keys except the label key.
    const dataKeys = (widget.type === 'stacked_bar' || (widget.type === 'bar' && widget.targetMetricName && widget.targetMetricName.includes(',')))
      ? rowKeys.filter(k => k !== key && (typeof firstRow[k] === 'number' || (!isNaN(Number(firstRow[k])) && firstRow[k] !== null && firstRow[k] !== '')))
      : [widget.yAxisKey && firstRow[widget.yAxisKey] !== undefined ? widget.yAxisKey : (rowKeys.find(k => k !== key) || 'value')];

    const localMaxVal = Math.max(...chartData.map((d: any) => {
      const values = dataKeys.map(k => Number(d[k]) || 0);
      return widget.type === 'stacked_bar'
        ? values.reduce((sum: number, v: number) => sum + v, 0)
        : Math.max(...values, 0);
    })) || 1;

    const paletteColors = [
      widget.color || '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6'
    ];

    return (
      <div className="flex flex-col justify-end pt-2 min-h-[40px] w-full" style={{ height: '100%' }}>
        <div className="flex h-full w-full">
          {/* Y-axis Ticks */}
          <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[85%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 shrink-0 text-right min-w-[36px]">
            <div>{formatKpiValue(localMaxVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</div>
            <div>{formatKpiValue(localMaxVal / 2, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</div>
            <div>0</div>
          </div>

          <div className="flex-1 flex items-end justify-between space-x-2 px-1 pb-1.5 h-full relative">
            {chartData.map((item: any, idx: number) => {
              const totalVal = dataKeys.reduce((sum, k) => sum + (Number(item[k]) || 0), 0);
              const heightPercent = localMaxVal ? (totalVal / localMaxVal) * 85 : 0;
              const itemLabel = String(item[key] ?? item.label ?? Object.values(item)[0] ?? '');

              const isHighlighted = (() => {
                const activeFilters = customFilters.filter(f => f.selectedValue !== null);
                if (activeFilters.length === 0) return true;
                
                return activeFilters.every(f => {
                  const isTargetingThisChart = (widget.targetDimName && f.fieldName.toLowerCase() === widget.targetDimName.toLowerCase()) || f.fieldName.toLowerCase() === key.toLowerCase();
                  if (isTargetingThisChart) return String(itemLabel).toLowerCase() === String(f.selectedValue).toLowerCase();
                  if (item[f.fieldName] !== undefined) return String(item[f.fieldName]).toLowerCase() === String(f.selectedValue).toLowerCase();
                  return true;
                });
              })();

              const filterCol = widget.targetDimName || widget.xAxisKey || 'label';

              return (
                <div 
                  key={idx} 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onFilterClick) onFilterClick(filterCol, itemLabel);
                  }}
                  className="flex flex-col items-center flex-1 group/bar relative h-full justify-end cursor-pointer"
                  style={{ maxWidth: `${Math.max(20, Math.min(64, (width / (chartData.length || 1)) - 8))}px` }}
                >
                  {/* Bar hover label */}
                  <div className={`absolute top-2 left-1/2 -translate-x-1/2 scale-0 group-hover/bar:scale-100 bg-surface/95 border-2 border-accent-custom/40 shadow-2xl pointer-events-none whitespace-nowrap flex flex-col items-center z-[9999] transition-transform backdrop-blur-md ${
                    isLargeView
                      ? 'px-4 py-2.5 rounded-2xl border-accent-custom/60 text-[14px] space-y-0.5' 
                      : 'px-3 py-1.5 rounded-xl text-[12px] font-mono'
                  }`}>
                    {dataKeys.length > 1 ? (
                      <div className="flex flex-col items-start space-y-0.5">
                        <span className={`font-bold text-text-custom border-b border-border-custom/50 pb-0.5 w-full ${isLargeView ? 'text-[13px] mb-1' : 'text-[11px] mb-0.5'}`}>{sanitizeLabel(itemLabel)}</span>
                        {dataKeys.map(k => (
                          <span key={k} className={`font-semibold text-accent-custom ${isLargeView ? 'text-[12px]' : 'text-[10px]'}`}>
                            {prettifyLabel(k)}: {formatKpiValue(item[k], k, widget.activeAgg, widget.numberFormat)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className={`font-bold text-text-custom ${isLargeView ? 'text-[13px]' : 'text-[11px]'}`}>{sanitizeLabel(itemLabel)}: <span className="text-accent-custom">{formatKpiValue(totalVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</span></span>
                    )}
                  </div>

                  {widget.type === 'bar' && dataKeys.length > 1 ? (
                    <div className="flex items-end gap-0.5 h-full w-full justify-center">
                      {dataKeys.map((k, i) => {
                        const val = Number(item[k]) || 0;
                        const barHeight = localMaxVal ? (val / localMaxVal) * 85 : 0;
                        const barColor = paletteColors[i % paletteColors.length];
                        return (
                          <div 
                            key={k}
                            className={`w-2.5 rounded-t-xs transition-all duration-300 relative ${
                              isHighlighted ? 'opacity-100 ring-1 ring-accent-custom/25' : 'opacity-25 grayscale-50'
                            }`}
                            style={{ height: `${barHeight}%`, backgroundColor: barColor }}
                            title={`${prettifyLabel(k)}: ${formatKpiValue(val, k, widget.activeAgg, widget.numberFormat)}`}
                          >
                            <div className="absolute inset-x-0 top-0 h-full bg-white/5"></div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div 
                      className={`w-full transition-all duration-300 relative flex flex-col justify-end overflow-hidden rounded-t-sm ${
                        isHighlighted ? 'opacity-100 ring-2 ring-accent-custom/40' : 'opacity-25 grayscale-50'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    >
                      {dataKeys.map((k, i) => {
                        const val = Number(item[k]) || 0;
                        const segPercent = totalVal ? (val / totalVal) * 100 : 0;
                        const segColor = paletteColors[i % paletteColors.length];
                        return (
                          <div 
                            key={k}
                            className="w-full relative transition-all duration-300 border-b border-black/10 last:border-b-0" 
                            style={{ height: `${segPercent}%`, backgroundColor: segColor }}
                          >
                            <div className="absolute inset-x-0 top-0 h-full bg-white/5"></div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <span className="text-[8px] font-mono text-muted-custom mt-1 truncate max-w-full text-center">
                    {sanitizeLabel(item[key]).slice(0, 8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Render Line Charts
  if (widget.type === 'line') {
    const key = widget.xAxisKey || 'label';
    const defaultWidth = 375;
    const defaultHeight = 230;
    const width = widget.customWidth ?? defaultWidth;
    const height = widget.customHeight ?? defaultHeight;

    let metrics = widget.targetMetricName
      ? widget.targetMetricName.split(',').map(s => s.trim())
      : [widget.yAxisKey || 'value'];

    if (metrics.length === 1 && widget.data.length > 0 && !(metrics[0] in widget.data[0]) && ('value' in widget.data[0])) {
      metrics = ['value'];
    }

    const paletteColors = [
      widget.color || '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6'
    ];

    const allVals: number[] = [];
    widget.data.forEach(d => {
      metrics.forEach(m => {
        allVals.push(Number(d[m]) || 0);
      });
    });
    const localMaxVal = Math.max(...allVals, 1);
    const localMinVal = Math.min(...allVals, 0);
    const range = localMaxVal - localMinVal || 1;

    return (
      <div className="flex flex-col justify-end pt-2 min-h-[40px] w-full" style={{ height: '100%' }}>
        <div className="flex h-full w-full">
          {/* Y-axis Ticks */}
          <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[85%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 shrink-0 text-right min-w-[36px]">
            <div>{formatKpiValue(localMaxVal, metrics[0], widget.activeAgg, widget.numberFormat)}</div>
            <div>{formatKpiValue((localMaxVal + localMinVal) / 2, metrics[0], widget.activeAgg, widget.numberFormat)}</div>
            <div>{formatKpiValue(localMinVal, metrics[0], widget.activeAgg, widget.numberFormat)}</div>
          </div>

          <div className="flex-1 relative h-full pl-1.5 overflow-visible">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 200 100" preserveAspectRatio="none">
              <defs>
                {metrics.map((m, mIdx) => (
                  <linearGradient key={m} id={`grad-${widget.id}-${mIdx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={paletteColors[mIdx % paletteColors.length]} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={paletteColors[mIdx % paletteColors.length]} stopOpacity="0.0" />
                  </linearGradient>
                ))}
              </defs>

              {metrics.map((m, mIdx) => {
                const strokeColor = paletteColors[mIdx % paletteColors.length];
                const vals = widget.data.map(d => Number(d[m]) || 0);
                const segmentWidth = 180 / (widget.data.length - 1 || 1);
                const points = widget.data.map((item, idx) => {
                  const x = 10 + idx * segmentWidth;
                  const y = 90 - ((vals[idx] - localMinVal) / range) * 75;
                  return { x, y };
                });

                const pathD = points.reduce((acc, p, idx) => {
                  return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                }, '');
                const areaD = `${pathD} L 190 100 L 10 100 Z`;

                return (
                  <g key={m}>
                    <path d={areaD} fill={`url(#grad-${widget.id}-${mIdx})`} />
                    <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                );
              })}
            </svg>

            {/* Interactive HTML Hover Tooltip zones (positioned absolutely over the SVG wrapper) */}
            {widget.data.map((item: any, idx) => {
              const labelVal = String(item[key]);
              const leftPercent = (idx / (widget.data.length - 1 || 1)) * 90 + 5; // match SVG bounds roughly
              const firstVal = Number(item[metrics[0]]) || 0;
              const yPercent = 90 - ((firstVal - localMinVal) / range) * 75;

              return (
                <div 
                  key={idx}
                  className="absolute group/dot cursor-pointer z-10"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${yPercent}%`,
                    width: '14px',
                    height: '14px',
                    transform: 'translate(-50%, -50%)'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const filterCol = widget.targetDimName || widget.xAxisKey || 'label';
                    if (onFilterClick) onFilterClick(filterCol, labelVal);
                  }}
                >
                  {/* Outer glowing interactive dot, visible only on hover */}
                  <div 
                    className="w-2.5 h-2.5 rounded-full border border-white scale-0 opacity-0 group-hover/dot:scale-100 group-hover/dot:opacity-100 transition-all duration-150 shadow-md" 
                    style={{ backgroundColor: paletteColors[0] }}
                  />

                  {/* Rich HTML Tooltip */}
                  <div className={`absolute ${yPercent < 50 ? 'top-full mt-2 left-1/2 -translate-x-1/2' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'} scale-0 group-hover/dot:scale-100 bg-surface/95 border-2 border-accent-custom/40 shadow-2xl pointer-events-none whitespace-nowrap flex flex-col items-center z-[9999] transition-transform backdrop-blur-md ${
                    isLargeView ? 'px-4 py-2.5 rounded-2xl text-[14px]' : 'px-3 py-2 rounded-xl text-[12px] font-mono'
                  }`}>
                    <span className={`font-bold text-text-custom border-b border-border-custom/50 pb-1 mb-1 w-full text-center ${isLargeView ? 'text-[13px]' : 'text-[11px]'}`}>
                      {sanitizeLabel(labelVal)}
                    </span>
                    {metrics.map((m, mIdx) => (
                      <span key={m} className={`font-semibold text-accent-custom ${isLargeView ? 'text-[12px]' : 'text-[10px]'}`}>
                        {prettifyLabel(m)}: {formatKpiValue(Number(item[m]) || 0, m, widget.activeAgg, widget.numberFormat)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
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
      <div className="flex w-full h-full items-center justify-center space-x-6 font-sans p-2 relative overflow-hidden">
        {/* Pie/Donut SVG Container with perfect 1:1 aspect ratio to ensure it is always a circle */}
        <div className="relative aspect-square h-[85%] shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 42 42">
            {widget.data.map((item: any, idx) => {
              const val = Number(item.val || item.value || 0) || 0;
              const percent = (val / totalPieVal) * 100;
              const strokeDash = `${percent} ${100 - percent}`;
              const strokeOffset = 100 - currentAngle;
              currentAngle += percent;

              const colors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
              const segmentColor = colors[idx % colors.length];
              const itemLabel = item.name || item.label;

              const isHighlighted = (() => {
                const activeFilters = customFilters.filter(f => f.selectedValue !== null);
                if (activeFilters.length === 0) return true;
                
                return activeFilters.every(f => {
                  const isTargetingThisChart = (widget.targetDimName && f.fieldName.toLowerCase() === widget.targetDimName.toLowerCase()) || f.fieldName.toLowerCase() === (widget.xAxisKey || 'name').toLowerCase();
                  if (isTargetingThisChart) return String(itemLabel).toLowerCase() === String(f.selectedValue).toLowerCase();
                  if (item[f.fieldName] !== undefined) return String(item[f.fieldName]).toLowerCase() === String(f.selectedValue).toLowerCase();
                  return true;
                });
              })();

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
                  className={`transition-all duration-300 cursor-pointer ${
                    isHighlighted ? 'opacity-100 hover:opacity-90' : 'opacity-25'
                  }`}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onFilterClick && onFilterClick(widget.xAxisKey || 'name', itemLabel)}
                />
              );
            })}

            {/* Dynamic Center label/metrics statistics for Donut Charts */}
            {isDonut && (
              <g className="pointer-events-none select-none">
                <text
                  x="21"
                  y="20"
                  textAnchor="middle"
                  dy="0.5"
                  className="font-sans font-bold fill-text-custom"
                  style={{ fontSize: '3px' }}
                >
                  {hoveredIndex !== null 
                    ? `${((Number(widget.data[hoveredIndex]?.val || widget.data[hoveredIndex]?.value || 0) / totalPieVal) * 100).toFixed(0)}%`
                    : totalPieVal > 1000000 
                      ? `${(totalPieVal / 1000000).toFixed(1)}M` 
                      : totalPieVal > 1000 
                        ? `${(totalPieVal / 1000).toFixed(1)}K` 
                        : totalPieVal
                  }
                </text>
                <text
                  x="21"
                  y="24"
                  textAnchor="middle"
                  dy="0.5"
                  className="font-sans font-medium fill-muted-custom"
                  style={{ fontSize: '1.6px' }}
                >
                  {hoveredIndex !== null 
                    ? sanitizeLabel(widget.data[hoveredIndex]?.name || widget.data[hoveredIndex]?.label || '').slice(0, 12)
                    : 'Total'
                  }
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* Legend List */}
        <div className="flex flex-col space-y-1.5 overflow-y-auto max-h-[85%] pr-1 text-[9px] text-muted-custom max-w-[50%]">
          {widget.data.slice(0, 8).map((item: any, idx) => {
            const val = Number(item.val || item.value || 0) || 0;
            const percent = ((val / totalPieVal) * 100).toFixed(0);
            const colors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
            const segmentColor = colors[idx % colors.length];
            const itemLabel = item.name || item.label;

            const isHighlighted = (() => {
              const activeFilters = customFilters.filter(f => f.selectedValue !== null);
              if (activeFilters.length === 0) return true;
              
              return activeFilters.every(f => {
                const isTargetingThisChart = (widget.targetDimName && f.fieldName.toLowerCase() === widget.targetDimName.toLowerCase()) || f.fieldName.toLowerCase() === (widget.xAxisKey || 'name').toLowerCase();
                if (isTargetingThisChart) return String(itemLabel).toLowerCase() === String(f.selectedValue).toLowerCase();
                if (item[f.fieldName] !== undefined) return String(item[f.fieldName]).toLowerCase() === String(f.selectedValue).toLowerCase();
                return true;
              });
            })();

            return (
              <div 
                key={idx} 
                className={`flex items-center space-x-1.5 truncate cursor-pointer transition-all hover:text-text-custom ${
                  isHighlighted ? 'opacity-100' : 'opacity-35'
                }`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onFilterClick && onFilterClick(widget.xAxisKey || 'name', itemLabel)}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: segmentColor }} />
                <span className="font-semibold text-text-custom truncate">{sanitizeLabel(itemLabel)}</span>
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

  // Render HBAR (Horizontal Progress Bar Lists)
  if (widget.type === 'hbar') {
    const valKey = widget.yAxisKey || 'value';
    const key = widget.xAxisKey || 'label';
    const defaultWidth = 375;
    const defaultHeight = 230;
    const width = widget.customWidth ?? defaultWidth;
    const height = widget.customHeight ?? defaultHeight;

    const localMaxVal = Math.max(...widget.data.map(d => Number(d[valKey]) || 0)) || 1;

    return (
      <div className="flex flex-col justify-start space-y-2.5 overflow-y-auto w-full pr-1.5 overflow-x-visible relative" style={{ height: '100%' }}>
        {widget.data.map((item: any, idx) => {
          const val = Number(item[valKey]) || 0;
          const widthPercent = localMaxVal ? (val / localMaxVal) * 80 : 0;
          const itemLabel = String(item[key]);

          const isHighlighted = (() => {
            const activeFilters = customFilters.filter(f => f.selectedValue !== null);
            if (activeFilters.length === 0) return true;
            
            return activeFilters.every(f => {
              const isTargetingThisChart = (widget.targetDimName && f.fieldName.toLowerCase() === widget.targetDimName.toLowerCase()) || f.fieldName.toLowerCase() === key.toLowerCase();
              if (isTargetingThisChart) return String(itemLabel).toLowerCase() === String(f.selectedValue).toLowerCase();
              if (item[f.fieldName] !== undefined) return String(item[f.fieldName]).toLowerCase() === String(f.selectedValue).toLowerCase();
              return true;
            });
          })();

          const filterCol = widget.targetDimName || widget.xAxisKey || 'label';

          return (
            <div 
              key={idx} 
              onClick={(e) => {
                e.stopPropagation();
                if (onFilterClick) onFilterClick(filterCol, itemLabel);
              }}
              className="flex flex-col space-y-1 cursor-pointer group/hbar relative overflow-visible"
            >
              {/* Tooltip */}
              <div className={`absolute ${idx === 0 ? 'top-full mt-1.5 left-1/2 -translate-x-1/2' : '-top-10 left-1/2 -translate-x-1/2'} scale-0 group-hover/hbar:scale-100 bg-surface/95 border-2 border-accent-custom/40 shadow-2xl pointer-events-none whitespace-nowrap z-[9999] transition-transform backdrop-blur-md ${
                isLargeView
                  ? 'px-4 py-2.5 rounded-2xl border-accent-custom/60 text-[14px]' 
                  : 'px-3 py-1.5 rounded-xl text-[12px] font-mono'
              }`}>
                <span className={`font-bold text-text-custom ${isLargeView ? 'text-[13px]' : 'text-[11px]'}`}>
                  {sanitizeLabel(itemLabel)}: <span className="text-accent-custom">{formatKpiValue(val, widget.targetMetricName || valKey, widget.activeAgg, widget.numberFormat)}</span>
                </span>
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono text-muted-custom">
                <span className="truncate max-w-[70%] font-medium">{sanitizeLabel(itemLabel)}</span>
                <span>{formatKpiValue(val, widget.targetMetricName || valKey, widget.activeAgg, widget.numberFormat)}</span>
              </div>
              <div className="w-full bg-surface-2 rounded-full h-2 relative overflow-visible border border-border-custom/30">
                <div 
                  className={`h-full rounded-full transition-all duration-300 relative ${
                    isHighlighted ? 'opacity-100 ring-1 ring-accent-custom/25' : 'opacity-25 grayscale-50'
                  }`}
                  style={{ 
                    width: `${widthPercent}%`,
                    background: widget.color || '#3B82F6'
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-full bg-white/5 rounded-full"></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Render Multi-Chart Visual (Exploration / Multi-metric)
  if (widget.type === 'multi_chart') {
    const subCharts = (widget as any).charts || (widget.data as any)?.charts || [];
    const displayCharts = subCharts.length > 0 ? subCharts : [widget];
    return (
      <div className="flex flex-col space-y-3 overflow-y-auto w-full h-full pr-1 font-mono text-[9px] relative">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {displayCharts.map((sub: any, idx: number) => {
            const subWidget: CanvasWidget = {
              ...widget,
              id: `${widget.id}-sub-${idx}`,
              title: sub.title || `Visual ${idx + 1}`,
              type: sub.type || 'bar',
              data: sub.data?.rows || sub.data || [],
              xAxisKey: sub.dimension || widget.xAxisKey || 'label',
              yAxisKey: sub.metric || widget.yAxisKey || 'value',
              targetMetricName: sub.metric || widget.targetMetricName,
              targetDimName: sub.dimension || widget.targetDimName,
            };
            return (
              <div key={idx} className="border border-border-custom/40 rounded-xl p-2.5 bg-surface-2/20 flex flex-col h-[180px] min-w-0">
                <span className="text-[10px] font-semibold text-text-custom truncate mb-1 border-b border-border-custom/20 pb-1">
                  {sub.title || `Chart #${idx + 1}`}
                </span>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ChartRenderer
                    widget={subWidget}
                    isFullScreenCanvas={isFullScreenCanvas}
                    isPresentMode={isPresentMode}
                    geoFilters={geoFilters}
                    setGeoFilters={setGeoFilters}
                    addLog={addLog}
                    onFilterClick={onFilterClick}
                    customFilters={customFilters}
                  />
                </div>
              </div>
            );
          })}
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
