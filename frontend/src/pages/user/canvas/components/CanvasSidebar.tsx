// CanvasSidebar.tsx — left control pane & field checklist — extracted from CanvasPage.tsx
import React from 'react';
import { LayoutGrid, ChevronLeft, Sliders, Maximize2, BarChart3, MapPin, BarChart4, TrendingUp, PieChart as PieIcon, Globe, Activity, CircleDot, Shuffle, FileSpreadsheet, Grid, Sparkles, Loader2, GripVertical, Check } from 'lucide-react';
import type { FieldDef } from '../types';
import { prettifyLabel } from '../../../../components/dashboard/dashboard-helpers';

interface CanvasSidebarProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean) => void;
  addLog: (msg: string) => void;
  handleAddDefaultVisual: (type: 'kpi' | 'bar' | 'stacked_bar' | 'line' | 'pie' | 'donut' | 'table' | 'map' | 'scatter' | 'bubble' | 'combo' | 'hbar') => void;
  selectedWidgetId: string | null;
  setSelectedWidgetId: (id: string | null) => void;
  checkedFields: string[];
  setCheckedFields: (fields: string[]) => void;
  calcPrompt: string;
  setCalcPrompt: (v: string) => void;
  handleCreateCalculatedField: (e?: React.FormEvent | React.KeyboardEvent) => void;
  isCreatingCalcField: boolean;
  isLoadingColumns: boolean;
  fieldsList: FieldDef[];
  handleFieldToggle: (fieldName: string) => void;
  handleDeleteField: (fieldName: string, e: React.MouseEvent) => void;
  logs: string[];
}

export const CanvasSidebar: React.FC<CanvasSidebarProps> = ({
  isSidebarCollapsed, setIsSidebarCollapsed, addLog,
  handleAddDefaultVisual,
  selectedWidgetId, setSelectedWidgetId,
  checkedFields, setCheckedFields,
  calcPrompt, setCalcPrompt, handleCreateCalculatedField, isCreatingCalcField,
  isLoadingColumns, fieldsList, handleFieldToggle, handleDeleteField,
  logs
}) => {
  if (isSidebarCollapsed) return null;

  return (
    <div className="xl:col-span-3 bg-surface-2/30 p-5 space-y-6 text-left flex flex-col justify-between overflow-y-auto transition-all duration-300 xl:max-h-[calc(100vh-60px)]">
      <div className="space-y-6">
        
        {/* Sidebar toggle header */}
        <div className="flex items-center justify-between border-b border-border-custom/50 pb-3">
          <div className="flex items-center space-x-2">
            <LayoutGrid className="w-4 h-4 text-accent-custom" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-text-custom">Layout Control Pane</span>
          </div>
          <button
            type="button"
            aria-label="Close Sidebar"
            onClick={() => {
              setIsSidebarCollapsed(true);
              addLog("Sidebar collapsed. Canvas entered Full Screen mode.");
            }}
            className="p-1 hover:bg-surface border border-border-custom/60 text-muted-custom hover:text-text-custom rounded-md transition-all cursor-pointer bg-transparent"
            title="Close Sidebar (Full Screen Canvas)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Visual template palette */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-custom flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-accent-custom" />
            <span>Visualizations Palette</span>
          </h3>
          <p className="text-[11px] text-muted-custom font-sans leading-relaxed">
            Click a visualization element template to append it directly to the active designing canvas grid.
          </p>
          
          <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[9px]">
            <button 
              onClick={() => handleAddDefaultVisual('kpi')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Single metric card"
            >
              <Maximize2 className="w-3.5 h-3.5 text-accent-custom" />
              <span>Card</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('bar')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Vertical bar chart"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Bar</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('hbar')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Horizontal bar list"
            >
              <MapPin className="w-3.5 h-3.5 text-teal-500" />
              <span>H-Bar</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('stacked_bar')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Stacked pivot bar"
            >
              <BarChart4 className="w-3.5 h-3.5 text-cyan-500" />
              <span>Stacked</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('line')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Chronological trend line"
            >
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
              <span>Line</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('pie')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Segment distribution pie"
            >
              <PieIcon className="w-3.5 h-3.5 text-pink-500" />
              <span>Pie</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('donut')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Segment distribution donut"
            >
              <div className="w-3.5 h-3.5 border-2 border-pink-500 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-surface rounded-full" />
              </div>
              <span>Donut</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('map')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Geographic regional bubbles"
            >
              <Globe className="w-3.5 h-3.5 text-amber-500" />
              <span>Map</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('scatter')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Metric variables correlation"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-500" />
              <span>Scatter</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('bubble')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="3-variable matrix bubble chart"
            >
              <CircleDot className="w-3.5 h-3.5 text-violet-500" />
              <span>Bubble</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('combo')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Bar & Line dual axis"
            >
              <Shuffle className="w-3.5 h-3.5 text-orange-500" />
              <span>Combo</span>
            </button>
            <button 
              onClick={() => handleAddDefaultVisual('table')}
              className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer text-[9px] font-mono text-text-custom"
              title="Data ledger spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Fields Selection Checklist */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border-custom pb-2">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-custom flex items-center space-x-1.5">
              <Grid className="w-3.5 h-3.5 text-accent-custom" />
              <span>Fields & Properties</span>
            </h3>
            {selectedWidgetId && (
              <button
                onClick={() => {
                  setSelectedWidgetId(null);
                  setCheckedFields([]);
                  addLog("Deselected active visual. Ready to build a new one.");
                }}
                className="text-[9px] font-mono text-accent-custom hover:text-accent-custom/80 transition-colors uppercase tracking-wider font-semibold cursor-pointer border border-accent-custom/20 rounded px-1.5 py-0.5 bg-accent-custom/5"
              >
                New / Clear
              </button>
            )}
          </div>
          
          {/* Inline AI Calculated Field Input Bar */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={calcPrompt}
              onChange={(e) => setCalcPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateCalculatedField();
                }
              }}
              placeholder="Ask AI to calculate a field..."
              className="w-full text-[10px] font-mono py-1.5 pl-2.5 pr-8 bg-surface-2 border border-border-custom focus:border-accent-custom/50 rounded-xl outline-none text-text-custom placeholder-muted-custom"
              disabled={isCreatingCalcField}
            />
            <button
              onClick={handleCreateCalculatedField}
              disabled={isCreatingCalcField || !calcPrompt.trim()}
              aria-label="Generate calculated field with AI"
              className="absolute right-1.5 p-1 text-accent-custom hover:text-accent-custom/80 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border-none"
              title="Generate calculated field with AI"
            >
              {isCreatingCalcField ? (
                <Loader2 className="w-3 h-3 animate-spin text-accent-custom" />
              ) : (
                <Sparkles className="w-3 h-3 animate-pulse" />
              )}
            </button>
          </div>
          
          <div role="listbox" aria-label="Dataset fields" className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {isLoadingColumns ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-custom space-y-2">
                <Loader2 className="w-5 h-5 animate-spin text-accent-custom" />
                <span className="text-[10px] font-mono">Syncing columns...</span>
              </div>
            ) : fieldsList.length === 0 ? (
              <div className="text-[10px] italic text-muted-custom py-6 text-center">
                No columns loaded. Select a dataset to sync fields.
              </div>
            ) : (
              fieldsList.map((field) => {
                const isChecked = checkedFields.includes(field.name);
                return (
                  <div
                    key={field.name}
                    draggable="true"
                    onDragStart={(e) => { 
                      e.dataTransfer.setData("text/plain", field.name); 
                      e.dataTransfer.effectAllowed = "copyMove"; 
                      addLog(`Dragging column: "${field.name}". Drop it in the Interactive Canvas Slicers zone to filter!`); 
                    }}
                    role="option"
                    aria-selected={isChecked}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-mono transition-all hover:bg-surface-2 border border-transparent group"
                  >
                    <div onClick={() => handleFieldToggle(field.name)} className="flex items-center space-x-2.5 min-w-0 cursor-pointer flex-1">
                      <GripVertical className="w-3 h-3 text-muted-custom/30 group-hover:text-accent-custom shrink-0 cursor-grab active:cursor-grabbing mr-1 transition-all" />
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                        isChecked 
                          ? 'bg-accent-custom border-accent-custom text-white' 
                          : 'border-border-custom bg-surface'
                      }`}>
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className={`truncate ${isChecked ? 'text-text-custom font-semibold' : 'text-muted-custom'}`} title={field.name}>
                        {prettifyLabel(field.name)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 ml-2 shrink-0">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface border border-border-custom text-muted-custom font-mono uppercase">
                        {field.category.slice(0, 3)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Diagnostics terminal readout window */}
      <div className="bg-black/40 border border-border-custom p-3.5 rounded-2xl space-y-2 mt-4 shrink-0">
        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-custom flex items-center justify-between">
          <span>Parser Transparency Logs</span>
          <span className="w-1.5 h-1.5 rounded-full bg-accent-custom animate-ping"></span>
        </h4>
        <div className="h-24 overflow-y-auto font-mono text-[9px] text-muted-custom space-y-1.5 pr-1 scrollbar-thin">
          {logs.length === 0 ? (
            <span className="italic">Telemetry logs silent. Execute a canvas action...</span>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="leading-relaxed border-b border-white/5 pb-1 last:border-0 truncate" title={log}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
