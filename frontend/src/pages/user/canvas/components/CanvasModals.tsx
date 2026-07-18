// CanvasModals.tsx — save, load, delete, format modals — extracted from CanvasPage.tsx
import React from 'react';
import { Save as SaveIcon, ChevronLeft, FolderOpen, ChevronRight, Trash2 } from 'lucide-react';
import type { NumberFormatConfig } from '../types';

interface CanvasModalsProps {
  // Save dashboard modal state & handlers
  showSaveModal: boolean;
  setShowSaveModal: (v: boolean) => void;
  saveDashboardName: string;
  setSaveDashboardName: (v: string) => void;
  executeSaveDashboard: (e: React.FormEvent) => void;

  // Load dashboard modal state & handlers
  showLoadModal: boolean;
  setShowLoadModal: (v: boolean) => void;
  dashboardsList: any[];
  handleLoadDashboard: (id: string) => void;
  handleDeleteDashboardClick: (id: string, e: React.MouseEvent) => void;

  // Delete dashboard modal state & handlers
  showDeleteModal: boolean;
  setShowDeleteModal: (v: boolean) => void;
  setDeleteDashboardId: (id: string | null) => void;
  executeDeleteDashboard: () => void;

  // Delete field modal state & handlers
  showDeleteFieldModal: boolean;
  setShowDeleteFieldModal: (v: boolean) => void;
  deleteFieldId: string | null;
  setDeleteFieldId: (id: string | null) => void;
  executeDeleteField: () => void;

  // Custom format modal state & handlers
  showCustomFormatModal: boolean;
  setShowCustomFormatModal: (v: boolean) => void;
  customFormatModalWidgetId: string | null;
  setCustomFormatModalWidgetId: (id: string | null) => void;
  customFormatModalType: 'number_custom' | 'currency_custom' | 'standard_custom';
  setCustomFormatModalType: (type: 'number_custom' | 'currency_custom' | 'standard_custom') => void;
  customFormatDecimals: number;
  setCustomFormatDecimals: (v: number) => void;
  customFormatNegative: 'minus' | 'parentheses' | 'red';
  setCustomFormatNegative: (style: 'minus' | 'parentheses' | 'red') => void;
  customFormatPrefix: string;
  setCustomFormatPrefix: (v: string) => void;
  customFormatSuffix: string;
  setCustomFormatSuffix: (v: string) => void;
  customFormatSeparator: string;
  setCustomFormatSeparator: (v: string) => void;
  customFormatUnit: 'none' | 'K' | 'M' | 'B' | 'auto';
  setCustomFormatUnit: (unit: 'none' | 'K' | 'M' | 'B' | 'auto') => void;
  handleWidgetFormatChange: (widgetId: string, formatConfig: NumberFormatConfig) => void;
}

export const CanvasModals: React.FC<CanvasModalsProps> = ({
  showSaveModal, setShowSaveModal, saveDashboardName, setSaveDashboardName, executeSaveDashboard,
  showLoadModal, setShowLoadModal, dashboardsList, handleLoadDashboard, handleDeleteDashboardClick,
  showDeleteModal, setShowDeleteModal, setDeleteDashboardId, executeDeleteDashboard,
  showDeleteFieldModal, setShowDeleteFieldModal, deleteFieldId, setDeleteFieldId, executeDeleteField,
  showCustomFormatModal, setShowCustomFormatModal, customFormatModalWidgetId, setCustomFormatModalWidgetId,
  customFormatModalType, setCustomFormatModalType, customFormatDecimals, setCustomFormatDecimals,
  customFormatNegative, setCustomFormatNegative, customFormatPrefix, setCustomFormatPrefix,
  customFormatSuffix, setCustomFormatSuffix, customFormatSeparator, setCustomFormatSeparator,
  customFormatUnit, setCustomFormatUnit, handleWidgetFormatChange
}) => {
  return (
    <>
      {/* 4. SAVE DASHBOARD MODAL */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-surface border border-border-custom rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col font-sans">
            <div className="flex items-center justify-between border-b border-border-custom/50 pb-3 mb-4">
              <h3 className="text-sm font-bold text-text-custom flex items-center space-x-2">
                <SaveIcon className="w-4 h-4 text-accent-custom" />
                <span>Save Canvas Layout</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="p-1 hover:bg-surface-2 rounded-md text-muted-custom hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
              >
                <ChevronLeft className="rotate-90 w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={executeSaveDashboard} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-custom">Dashboard Name</label>
                <input
                  type="text"
                  value={saveDashboardName}
                  onChange={(e) => setSaveDashboardName(e.target.value)}
                  className="w-full bg-surface-2 border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-lg px-3 py-2 text-xs text-text-custom outline-none transition-all"
                  autoFocus
                />
              </div>
              <div className="flex justify-end pt-2 space-x-3 border-t border-border-custom/50 mt-4">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-custom hover:text-text-custom hover:bg-surface-2 transition-colors cursor-pointer border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-custom text-white hover:bg-accent-custom/90 transition-colors shadow-lg shadow-accent-custom/20 cursor-pointer border border-transparent flex items-center space-x-1.5"
                >
                  <SaveIcon className="w-3.5 h-3.5" />
                  <span>Save Layout</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. LOAD DASHBOARD MODAL */}
      {showLoadModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-surface border border-border-custom rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col max-h-[80vh] font-sans">
            <div className="flex items-center justify-between border-b border-border-custom/50 pb-3 mb-4">
              <h3 className="text-sm font-bold text-text-custom flex items-center space-x-2">
                <FolderOpen className="w-4 h-4 text-accent-custom" />
                <span>Load Canvas Layout</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="p-1 hover:bg-surface-2 rounded-md text-muted-custom hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
              >
                <ChevronLeft className="rotate-90 w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-1">
              {dashboardsList.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-custom">
                  No saved canvas layouts found. Click "Save Layout" in the toolbar to create one.
                </div>
              ) : (
                dashboardsList.map((db) => (
                  <button
                    key={db.id}
                    type="button"
                    onClick={() => handleLoadDashboard(db.id)}
                    className="w-full p-3 bg-surface hover:bg-surface-2 border border-border-custom hover:border-accent-custom/50 rounded-xl transition-all text-left flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-text-custom group-hover:text-accent-custom transition-colors">{db.name}</div>
                      <div className="text-[10px] text-muted-custom mt-0.5">{db.description || 'Canvas Dashboard'}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={(e) => handleDeleteDashboardClick(db.id, e)} 
                        className="p-1.5 text-muted-custom hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer"
                        title="Delete layout"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-custom group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. DELETE DASHBOARD MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[2010] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-surface border border-border-custom rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col font-sans">
            <div className="flex items-center space-x-3 text-red-500 mb-4">
              <div className="p-2 bg-red-500/10 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold">Delete Layout</h3>
            </div>
            <p className="text-xs text-muted-custom mb-6">
              Are you sure you want to delete this layout? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteDashboardId(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-custom hover:text-text-custom hover:bg-surface-2 transition-colors cursor-pointer border border-transparent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteDashboard}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 cursor-pointer border border-transparent"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. DELETE FIELD MODAL */}
      {showDeleteFieldModal && (
        <div className="fixed inset-0 z-[2010] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-surface border border-border-custom rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col font-sans">
            <div className="flex items-center space-x-3 text-red-500 mb-4">
              <div className="p-2 bg-red-500/10 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold">Delete Field</h3>
            </div>
            <p className="text-xs text-muted-custom mb-6">
              Are you sure you want to delete the field "{deleteFieldId}"? It will be removed from your active selections and visuals.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteFieldModal(false);
                  setDeleteFieldId(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-custom hover:text-text-custom hover:bg-surface-2 transition-colors cursor-pointer border border-transparent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteField}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 cursor-pointer border border-transparent"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. CUSTOM FORMAT CONFIGURATION MODAL */}
      {showCustomFormatModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-surface border border-border-custom rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col font-sans">
            <div className="flex items-center justify-between border-b border-border-custom/50 pb-3 mb-4">
              <h3 className="text-sm font-bold text-text-custom">
                {customFormatModalType === 'currency_custom' ? 'Currency Formatting (Custom)' : 
                 customFormatModalType === 'standard_custom' ? 'Standard Numeric (Custom)' : 'Formatting Options'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCustomFormatModal(false);
                  setCustomFormatModalWidgetId(null);
                }}
                className="p-1 hover:bg-surface-2 rounded-md text-muted-custom hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
              >
                <ChevronLeft className="rotate-90 w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Decimals */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-text-custom">Decimal Places</label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={customFormatDecimals}
                  onChange={(e) => setCustomFormatDecimals(parseInt(e.target.value) || 0)}
                  className="w-16 bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-center text-text-custom outline-none"
                />
              </div>

              {/* Separators */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-text-custom">Thousands Separator</label>
                <select
                  value={customFormatSeparator}
                  onChange={(e) => setCustomFormatSeparator(e.target.value)}
                  className="w-24 bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-text-custom outline-none"
                >
                  <option value=",">Comma (,)</option>
                  <option value=".">Period (.)</option>
                  <option value=" ">Space ( )</option>
                  <option value="">None</option>
                </select>
              </div>

              {/* Prefix & Suffix Custom Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-text-custom block">Prefix</label>
                  <input
                    type="text"
                    value={customFormatPrefix}
                    onChange={(e) => setCustomFormatPrefix(e.target.value)}
                    placeholder="e.g. $"
                    className="w-full bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-text-custom outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-text-custom block">Suffix</label>
                  <input
                    type="text"
                    value={customFormatSuffix}
                    onChange={(e) => setCustomFormatSuffix(e.target.value)}
                    placeholder="e.g. %"
                    className="w-full bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-text-custom outline-none"
                  />
                </div>
              </div>

              {/* Unit scaling */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-text-custom">Display Units</label>
                <select
                  value={customFormatUnit}
                  onChange={(e) => setCustomFormatUnit(e.target.value as any)}
                  className="w-32 bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-text-custom outline-none"
                >
                  <option value="none">Default (None)</option>
                  <option value="auto">Auto-detect (K, M, B)</option>
                  <option value="K">Thousands (K)</option>
                  <option value="M">Millions (M)</option>
                  <option value="B">Billions (B)</option>
                </select>
              </div>

              {/* Negative format */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-text-custom">Negative Values</label>
                <select
                  value={customFormatNegative}
                  onChange={(e) => setCustomFormatNegative(e.target.value as any)}
                  className="w-32 bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-text-custom outline-none"
                >
                  <option value="minus">Minus sign (-123)</option>
                  <option value="parentheses">Parentheses ((123))</option>
                  <option value="red">Red styled color</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-border-custom/50 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowCustomFormatModal(false);
                  setCustomFormatModalWidgetId(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-custom hover:text-text-custom hover:bg-surface-2 transition-colors cursor-pointer border border-transparent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customFormatModalWidgetId) {
                    handleWidgetFormatChange(customFormatModalWidgetId, {
                      type: customFormatModalType,
                      decimals: customFormatDecimals,
                      negativeStyle: customFormatNegative,
                      prefix: customFormatPrefix,
                      suffix: customFormatSuffix,
                      separator: customFormatSeparator,
                      unit: customFormatUnit
                    });
                  }
                  setShowCustomFormatModal(false);
                  setCustomFormatModalWidgetId(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent-custom text-white hover:bg-accent-custom/90 transition-colors shadow-lg shadow-accent-custom/20 cursor-pointer border border-transparent"
              >
                Apply Format
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
