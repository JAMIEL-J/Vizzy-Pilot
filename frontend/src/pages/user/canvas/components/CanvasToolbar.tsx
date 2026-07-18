// CanvasToolbar.tsx — top actions control bar — extracted from CanvasPage.tsx
import React from 'react';
import { 
  Database, Play, Undo2, Redo2, Grid, Sliders, Maximize2, Minimize2, Save as SaveIcon, FolderOpen, Loader2, ArrowRightLeft 
} from 'lucide-react';
import type { Dataset, DatasetVersionSummary } from '../../../../lib/api/dataset';

interface CanvasToolbarProps {
  // Datasets
  datasets: Dataset[];
  selectedDatasetId: string;
  handleDatasetChange: (id: string) => void;
  versions: DatasetVersionSummary[];
  selectedVersionId: string;
  handleVersionChange: (id: string) => void;
  isLoadingColumns: boolean;

  // Compilation
  isCompiling: boolean;

  // History state
  pastLength: number;
  futureLength: number;
  handleUndo: () => void;
  handleRedo: () => void;

  // Layout snapping configs
  gridSnap: boolean;
  setGridSnap: (v: boolean) => void;
  showGridlines: boolean;
  setShowGridlines: (v: boolean) => void;

  // Dashboard load/save state
  loadedDashboardId: string | null;
  saveDashboardName: string;
  handleSaveDashboard: () => void;
  executeSaveDashboardOverride: () => void;
  fetchDashboards: () => void;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (v: boolean) => void;

  // Viewport Zoom Options
  canvasZoom: 'fit-width' | 'fit-page' | 'fit-canvas' | '100' | '75' | '50';
  setCanvasZoom: (v: 'fit-width' | 'fit-page' | 'fit-canvas' | '100' | '75' | '50') => void;
  isFullScreenCanvas: boolean;
  setIsFullScreenCanvas: (v: boolean) => void;
  isPresentMode: boolean;
  setIsPresentMode: (v: boolean) => void;

  // Export visual triggers
  handleExportVisuals: (format: 'png' | 'svg' | 'json') => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  datasets, selectedDatasetId, handleDatasetChange,
  versions, selectedVersionId, handleVersionChange, isLoadingColumns,
  isCompiling,
  pastLength, futureLength, handleUndo, handleRedo,
  gridSnap, setGridSnap, showGridlines, setShowGridlines,
  loadedDashboardId, saveDashboardName, handleSaveDashboard, executeSaveDashboardOverride, fetchDashboards,
  autoSaveEnabled, setAutoSaveEnabled,
  canvasZoom, setCanvasZoom,
  isFullScreenCanvas, setIsFullScreenCanvas,
  isPresentMode, setIsPresentMode,
  handleExportVisuals
}) => {
  return (
    <div className="border-b border-border-custom bg-surface-2/40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 font-mono text-xs select-none">
      <div className="flex items-center space-x-6 flex-wrap gap-y-2">
        <div className="flex items-center space-x-2.5">
          <span className="font-semibold text-text-custom tracking-wider uppercase">Vizzy Pilot Canvas</span>
          <span className="text-muted-custom">|</span>
          <span className="text-muted-custom">Snap: <span className="text-accent-custom font-bold">16px</span></span>
        </div>

        {/* Dataset & Version Selectors */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Dataset select */}
          <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-custom font-semibold bg-surface-2 px-2 py-1 rounded-lg mr-1.5">
              <Database className="w-3 h-3 text-accent-custom" />
              Dataset
            </div>
            <select
              value={selectedDatasetId}
              onChange={(e) => handleDatasetChange(e.target.value)}
              className="bg-transparent border-none text-[11px] font-semibold text-text-custom outline-none pr-6 cursor-pointer max-w-[150px] truncate"
            >
              <option value="" className="bg-surface text-text-custom">Select Dataset...</option>
              {datasets.map(ds => (
                <option key={ds.id} value={ds.id} className="bg-surface text-text-custom">{ds.name}</option>
              ))}
            </select>
          </div>

          {/* Version select */}
          {versions.length > 0 && (
            <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-custom font-semibold bg-surface-2 px-2 py-1 rounded-lg mr-1.5">
                <ArrowRightLeft className="w-3 h-3 text-accent-custom" />
                Version
              </div>
              <select
                value={selectedVersionId}
                onChange={(e) => handleVersionChange(e.target.value)}
                className="bg-transparent border-none text-[11px] font-semibold text-text-custom outline-none pr-6 cursor-pointer max-w-[150px] truncate"
              >
                {versions.map(v => (
                  <option key={v.id} value={v.id} className="bg-surface text-text-custom">
                    Version {v.version_number} ({v.row_count?.toLocaleString() ?? '?'} rows)
                  </option>
                ))}
              </select>
            </div>
          )}

          {isLoadingColumns && (
            <div className="flex items-center text-muted-custom gap-1 px-1 text-[11px] italic">
              <Loader2 className="w-3 h-3 animate-spin text-accent-custom" />
              <span>Loading schema...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Controls & Layout Options */}
      <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
        {/* Undo / Redo */}
        <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs mr-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={pastLength === 0}
            className="p-1.5 hover:bg-surface-2 disabled:opacity-30 rounded-lg text-muted-custom hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
            title="Undo (Ctrl+Z)"
            aria-label="Undo layout edit"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={futureLength === 0}
            className="p-1.5 hover:bg-surface-2 disabled:opacity-30 rounded-lg text-muted-custom hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
            title="Redo (Ctrl+Y)"
            aria-label="Redo layout edit"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Snap & Grid Options */}
        <button
          type="button"
          onClick={() => setGridSnap(!gridSnap)}
          className={`flex items-center space-x-1.5 px-3 py-2 border rounded-xl transition-all cursor-pointer text-xs font-semibold ${
            gridSnap 
              ? 'bg-accent-custom/10 border-accent-custom/30 text-accent-custom' 
              : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom hover:border-border-custom/80'
          }`}
          title="Toggle Grid Snapping"
        >
          <Grid className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Snap</span>
        </button>

        <button
          type="button"
          onClick={() => setShowGridlines(!showGridlines)}
          className={`flex items-center space-x-1.5 px-3 py-2 border rounded-xl transition-all cursor-pointer text-xs font-semibold ${
            showGridlines 
              ? 'bg-accent-custom/10 border-accent-custom/30 text-accent-custom' 
              : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom hover:border-border-custom/80'
          }`}
          title="Toggle Gridlines"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Gridlines</span>
        </button>

        {/* Save / Load actions */}
        <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs">
          <button
            type="button"
            onClick={handleSaveDashboard}
            className="px-2.5 py-1 text-[11px] font-semibold text-muted-custom hover:text-text-custom transition-colors cursor-pointer border-none bg-transparent flex items-center space-x-1.5"
            title="Save Layout As..."
          >
            <SaveIcon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Save As...</span>
          </button>
          
          {loadedDashboardId && (
            <button
              type="button"
              onClick={executeSaveDashboardOverride}
              className="px-2.5 py-1 text-[11px] font-semibold text-accent-custom hover:opacity-90 transition-colors cursor-pointer border-none bg-transparent flex items-center space-x-1.5 border-l border-border-custom/50"
              title="Save Changes"
            >
              <span>Save</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchDashboards}
            className="px-2.5 py-1 text-[11px] font-semibold text-muted-custom hover:text-text-custom transition-colors cursor-pointer border-l border-border-custom/50 bg-transparent flex items-center space-x-1.5"
            title="Load Layout"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Load...</span>
          </button>
        </div>

        {loadedDashboardId && (
          <label className="flex items-center space-x-1.5 text-[10px] text-muted-custom font-semibold select-none ml-1 bg-surface-2 px-2.5 py-1.5 rounded-xl border border-border-custom/40">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="rounded border-border-custom accent-accent-custom w-3 h-3"
            />
            <span>Auto-Save</span>
          </label>
        )}

        <span className="text-border-custom/50 text-xs px-1 hidden lg:inline">|</span>

        {/* View mode toggle (FullScreen/Present/Zoom controls) */}
        {isFullScreenCanvas && (
          <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs mr-1 text-[11px]">
            <span className="text-muted-custom px-2 uppercase font-bold text-[9px] tracking-wider">Zoom:</span>
            <select
              value={canvasZoom}
              onChange={(e) => setCanvasZoom(e.target.value as any)}
              className="bg-transparent border-none text-[11px] font-semibold text-text-custom outline-none pr-5 cursor-pointer"
            >
              <option value="fit-width">Fit Width</option>
              <option value="fit-page">Fit Page</option>
              <option value="fit-canvas">Fit Canvas</option>
              <option value="100">100%</option>
              <option value="75">75%</option>
              <option value="50">50%</option>
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsFullScreenCanvas(!isFullScreenCanvas)}
          className={`flex items-center space-x-1.5 px-3 py-2 border rounded-xl transition-all cursor-pointer text-xs font-semibold ${
            isFullScreenCanvas 
              ? 'bg-accent-custom/10 border-accent-custom/30 text-accent-custom' 
              : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom hover:border-border-custom/80'
          }`}
          title="Toggle Full Screen Layout Mode"
        >
          {isFullScreenCanvas ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isFullScreenCanvas ? "Exit Full" : "Full Screen"}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsPresentMode(!isPresentMode)}
          className={`flex items-center space-x-1.5 px-3 py-2 border rounded-xl transition-all cursor-pointer text-xs font-semibold ${
            isPresentMode 
              ? 'bg-accent-custom/10 border-accent-custom/30 text-accent-custom' 
              : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom hover:border-border-custom/80'
          }`}
          title="Preview Presentation mode (Read Only View)"
        >
          <span className="hidden sm:inline">Present</span>
        </button>

        {/* Export select options dropdown */}
        <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs">
          <button
            type="button"
            onClick={() => handleExportVisuals('png')}
            className="px-2.5 py-1 text-[11px] font-semibold text-muted-custom hover:text-text-custom transition-colors cursor-pointer border-none bg-transparent"
            title="Download PNG image"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={() => handleExportVisuals('svg')}
            className="px-2.5 py-1 text-[11px] font-semibold text-muted-custom hover:text-text-custom transition-colors cursor-pointer border-l border-border-custom/50 bg-transparent"
            title="Download Vector SVG image"
          >
            SVG
          </button>
        </div>
      </div>
    </div>
  );
};
