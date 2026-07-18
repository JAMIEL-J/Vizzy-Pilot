// CanvasPage.tsx — main canvas page and orchestrator — decomposed to import hooks and components
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Check } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../../lib/api/client';
import { canvasService, formatKpiValue, formatKpiSubtext } from '../../../lib/api/canvas';

// Decomposed Hook imports
import {
  useCanvasWidgets,
  useCanvasDragDrop,
  useCanvasDatasets,
  useCanvasFilters,
  useCanvasExport
} from './hooks';

// Decomposed Component imports
import AIPromptBar from './components/AIPromptBar';
import { CanvasToolbar } from './components/CanvasToolbar';
import { CanvasSidebar } from './components/CanvasSidebar';
import { WidgetCard } from './components/WidgetCard';
import { FilterBar } from './components/FilterBar';
import { CanvasModals } from './components/CanvasModals';

// Decomposed Utilities
import { beautifyTitle, sanitizeLabel } from './utils/canvasUtils';
import { buildAggExpr, isDateColumn, getColExpr, chartSpecToCanvasWidget } from './utils/sqlBuilder';
import { PROMPT_SUGGESTIONS } from './constants';
import type { CanvasWidget, FieldDef } from './types';


export default function CanvasPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Initialize modular hooks
  const widgetsHook = useCanvasWidgets();
  const {
    widgets, setWidgets, recordHistory, widgetsRef, fieldsListRef, checkedFieldsRef,
    canvasContainerRef, hasDraggedRef, contentWidth, contentHeight,
    handleDeleteWidget, handleClearCanvas, handleOrganizeLayout, updateWidgetBounds,
    logs, addLog, setPast, setFuture, past, future
  } = widgetsHook;

  // 1. Toolbar configurations
  const [gridSnap, setGridSnap] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  const [showSqlViewer, setShowSqlViewer] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState<'fit-width' | 'fit-page' | 'fit-canvas' | '100' | '75' | '50'>('fit-width');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // 2. Modals state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDashboardId, setDeleteDashboardId] = useState<string | null>(null);
  const [saveDashboardName, setSaveDashboardName] = useState(() => localStorage.getItem('vizzy_last_loaded_dashboard_name') || '');
  const [loadedDashboardId, setLoadedDashboardId] = useState<string | null>(() => localStorage.getItem('vizzy_last_loaded_dashboard_id'));
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(false);
  const [dashboardsList, setDashboardsList] = useState<any[]>([]);

  // 3. Custom formatting state
  const [showCustomFormatModal, setShowCustomFormatModal] = useState(false);
  const [customFormatModalWidgetId, setCustomFormatModalWidgetId] = useState<string | null>(null);
  const [customFormatModalType, setCustomFormatModalType] = useState<'number_custom' | 'currency_custom' | 'standard_custom'>('number_custom');
  const [customFormatDecimals, setCustomFormatDecimals] = useState<number>(2);
  const [customFormatNegative, setCustomFormatNegative] = useState<'minus' | 'parentheses' | 'red'>('minus');
  const [customFormatPrefix, setCustomFormatPrefix] = useState<string>('');
  const [customFormatSuffix, setCustomFormatSuffix] = useState<string>('');
  const [customFormatSeparator, setCustomFormatSeparator] = useState<string>(',');
  const [customFormatUnit, setCustomFormatUnit] = useState<'none' | 'K' | 'M' | 'B' | 'auto'>('none');

  // Context Menu state
  const [widgetContextMenu, setWidgetContextMenu] = useState<{ x: number; y: number; widgetId: string } | null>(null);

  // Compiler activity state
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationSteps, setCompilationSteps] = useState<string[]>([]);
  const [compiledSql, setCompiledSql] = useState<string>('');
  const [compiledResult, setCompiledResult] = useState<string>('');
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);

  // Load persistence details
  useEffect(() => {
    if (loadedDashboardId) {
      localStorage.setItem('vizzy_last_loaded_dashboard_id', loadedDashboardId);
    } else {
      localStorage.removeItem('vizzy_last_loaded_dashboard_id');
    }
  }, [loadedDashboardId]);

  useEffect(() => {
    if (saveDashboardName) {
      localStorage.setItem('vizzy_last_loaded_dashboard_name', saveDashboardName);
    } else {
      localStorage.removeItem('vizzy_last_loaded_dashboard_name');
    }
  }, [saveDashboardName]);

  // Hook for datasets
  const datasetsHook = useCanvasDatasets({
    setWidgets,
    fieldsListRef,
    checkedFieldsRef,
    addLog
  });
  const {
    datasets, selectedDatasetId, versions, selectedVersionId, loadDatasetColumns,
    fieldsList, isLoadingColumns, checkedFields, setCheckedFields,
    calcPrompt, setCalcPrompt, isCreatingCalcField, deleteFieldId, setDeleteFieldId,
    showDeleteFieldModal, setShowDeleteFieldModal, handleDatasetChange, handleVersionChange,
    handleFieldToggle, handleDeleteField, executeDeleteField, handleCreateCalculatedField
  } = datasetsHook;

  // Hook for exporting
  const exportHook = useCanvasExport({
    widgets,
    past,
    future,
    canvasContainerRef,
    addLog
  });
  const {
    isExporting, isPresentMode, setIsPresentMode,
    isFullScreenCanvas, setIsFullScreenCanvas,
    isResponsive, handleExportVisuals
  } = exportHook;

  // Compute zoom scale relative to canvas container size
  const canvasScale = useMemo(() => {
    if (!isPresentMode && !isFullScreenCanvas) return 1;
    if (!canvasContainerRef.current) return 0.5;

    const containerWidth = canvasContainerRef.current.clientWidth - 32;
    const containerHeight = canvasContainerRef.current.clientHeight - 32;

    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;

    if (isPresentMode) return Math.min(scaleX, scaleY);

    switch (canvasZoom) {
      case 'fit-width': return scaleX;
      case 'fit-page': return Math.min(scaleX, scaleY);
      case 'fit-canvas': return Math.max(scaleX, scaleY);
      case '100': return 1;
      case '75': return 0.75;
      case '50': return 0.5;
      default: return scaleX;
    }
  }, [isFullScreenCanvas, isPresentMode, canvasZoom, contentWidth, contentHeight]);

  // Hook for dragging & selection box
  const dragHook = useCanvasDragDrop({
    widgets, setWidgets, widgetsRef, fieldsListRef, checkedFieldsRef,
    canvasContainerRef, hasDraggedRef, setPast, setFuture, addLog,
    handleUndo: widgetsHook.handleUndo, handleRedo: widgetsHook.handleRedo,
    gridSnap, canvasScale, isResponsive, isFullScreenCanvas, isPresentMode,
    setIsFullScreenCanvas, setIsPresentMode, setCheckedFields
  });
  const {
    selectedWidgetId, setSelectedWidgetId, selectedWidgetIds, setSelectedWidgetIds,
    selectedWidgetIdsRef, selectionBox, handleDragStart, handleResizeStart, handleCanvasPointerDown
  } = dragHook;

  // Hook for filters
  const filtersHook = useCanvasFilters({
    widgets,
    setWidgets,
    selectedDatasetId,
    selectedVersionId,
    fieldsList,
    addLog
  });
  const {
    customFilters, setCustomFilters, isDraggingOverFilters, setIsDraggingOverFilters,
    geoFilters, setGeoFilters, handleAddColumnAsFilter
  } = filtersHook;

  // Re-compile widget query on aggregation or grain change
  const recompileWidget = async (widgetId: string, fields: string[]) => {
    const widget = widgets.find((w: CanvasWidget) => w.id === widgetId);
    if (!widget) return;

    const checkedMetrics = fields.filter((f: string) => fieldsList.some((af: FieldDef) => af.name === f && af.category === 'Metrics'));
    const checkedDims = fields.filter((f: string) => fieldsList.some((af: FieldDef) => af.name === f && (af.category === 'Dimensions' || af.category === 'Dates')));

    if (checkedDims.length === 0 || checkedMetrics.length === 0) {
      setWidgets((prev: CanvasWidget[]) => prev.map((w: CanvasWidget) => w.id === widgetId ? {
        ...w,
        isConfigWarning: true,
        configWarningMessage: 'Select at least 1 Dimension and 1 Metric from the checklist to recompile.'
      } : w));
      return;
    }

    const agg = widget.activeAgg || 'SUM';
    setIsCompiling(true);
    try {
      const metric = checkedMetrics[0];
      const dimension = checkedDims[0];
      const labelExpr = getColExpr(dimension, fieldsList);

      let sql = '';
      let title = '';

      if (widget.type === 'kpi') {
        const extraCols = fields
          .filter((f: string) => f !== metric)
          .map((f: string) => {
            const isMetric = fieldsList.some((af: FieldDef) => af.name === f && af.category === 'Metrics');
            return isMetric ? `${buildAggExpr('SUM', f, fieldsList)} AS "${f}"` : `ANY_VALUE(${getColExpr(f, fieldsList)}) AS "${f}"`;
          });
        const selection = [`${buildAggExpr(agg, metric, fieldsList)} AS value`, ...extraCols].join(', ');
        sql = `SELECT ${selection} FROM data`;
        title = `Total ${metric}`;
      } else if (widget.type === 'table') {
        const colsToSelect = fields.map((f: string) => `${getColExpr(f, fieldsList)} AS "${f}"`).join(', ');
        sql = `SELECT ${colsToSelect} FROM data LIMIT 50`;
        title = `Custom Ledger Sample`;
      } else {
        if (widget.type === 'line') {
          const grain = widget.activeGrain || 'month';
          const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(dimension, fieldsList)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(dimension, fieldsList)} AS DATE) WHEN TRY_CAST(${getColExpr(dimension, fieldsList)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(dimension, fieldsList)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
          
          let grainExpr = '';
          if (grain === 'year') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y'), CAST(regexp_extract(${getColExpr(dimension, fieldsList)}, '\\d{4}') AS VARCHAR))`;
          } else if (grain === 'quarter') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-Q') || CAST(quarter(${fallbackDate}) AS VARCHAR), CAST(${getColExpr(dimension, fieldsList)} AS VARCHAR))`;
          } else if (grain === 'month') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(dimension, fieldsList)} AS VARCHAR))`;
          } else {
            grainExpr = `COALESCE(CAST(${fallbackDate} AS VARCHAR), CAST(${getColExpr(dimension, fieldsList)} AS VARCHAR))`;
          }
          sql = `SELECT ${grainExpr} AS label, ${buildAggExpr(agg, metric, fieldsList, '1')} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
          title = agg === 'PERCENT_CHANGE' ? `% Change of ${metric} by ${dimension}` : `${metric} (${agg}) Trend by ${dimension}`;
        } else {
          const limitVal = widget.limit || 15;
          sql = `SELECT ${labelExpr} AS label, ${buildAggExpr(agg, metric, fieldsList, '1')} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT ${limitVal}`;
          title = agg === 'PERCENT_CHANGE' ? `% Change of ${metric} by ${dimension}` : `${metric} (${agg}) by ${dimension}`;
        }
      }

      addLog(`Executing Canvas aggregation query: ${sql}`);
      const sqlResult = await canvasService.executeSql(selectedDatasetId, selectedVersionId || '', sql);

      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        
        let value = widget.value;
        let subtext = widget.subtext;
        let chartData: any[] = queryData;
        let updatedXKey = 'label';
        let updatedYKey = 'value';

        if (widget.type === 'kpi') {
          const kpiVal = queryData[0]?.value ?? queryData[0]?.VALUE ?? 0;
          value = formatKpiValue(kpiVal, metric, agg, widget.numberFormat);
          subtext = formatKpiSubtext(metric, agg);
          chartData = [];
        } else if (widget.type === 'pie' || widget.type === 'donut') {
          chartData = queryData.map((r: any) => ({ name: r.label, val: r.value }));
          updatedXKey = 'name';
          updatedYKey = 'val';
        } else {
          updatedYKey = checkedMetrics.length > 1 ? checkedMetrics[0] : 'value';
        }

        setWidgets((prev: CanvasWidget[]) => prev.map((w: CanvasWidget) => w.id === widgetId ? {
          ...w,
          data: chartData,
          value,
          subtext,
          title: beautifyTitle(title),
          sql: sql,
          activeAgg: agg,
          xAxisKey: updatedXKey,
          yAxisKey: updatedYKey,
          isConfigWarning: false
        } : w));
        
        addLog(`SUCCESS: Re-compiled chart [${widget.title}] with ${agg} aggregation.`);
      } else {
        throw new Error(sqlResult?.error || "SQL query failed");
      }
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Aggregation switch failed: ${err.message || err}`);
      toast.error(`Failed to change aggregation to ${agg}`);
    } finally {
      setIsCompiling(false);
    }
  };

  // Add default visual from Palette selection click
  const handleAddDefaultVisual = async (type: 'kpi' | 'bar' | 'stacked_bar' | 'line' | 'pie' | 'donut' | 'table' | 'map' | 'scatter' | 'bubble' | 'combo' | 'hbar') => {
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    const checkedMetrics = checkedFields.filter((f: string) => fieldsList.some((af: FieldDef) => af.name === f && af.category === 'Metrics'));
    const checkedDims = checkedFields.filter((f: string) => fieldsList.some((af: FieldDef) => af.name === f && (af.category === 'Dimensions' || af.category === 'Dates')));

    let isConfigWarning = false;
    let configWarningMessage = '';

    // Validator matches
    if (type === 'combo' && (checkedMetrics.length < 2 || checkedDims.length < 1)) {
      isConfigWarning = true;
      configWarningMessage = 'Combo visual requires 1 Dimension and at least 2 Metrics in the sidebar.';
    } else if (type === 'scatter' && (checkedMetrics.length < 2 || checkedDims.length < 1)) {
      isConfigWarning = true;
      configWarningMessage = 'Scatter chart requires 1 Dimension and at least 2 Metrics.';
    } else if (type === 'bubble' && (checkedMetrics.length < 3 || checkedDims.length < 1)) {
      isConfigWarning = true;
      configWarningMessage = 'Bubble chart requires 1 Dimension and at least 3 Metrics.';
    } else if (type === 'stacked_bar' && checkedDims.length < 1) {
      isConfigWarning = true;
      configWarningMessage = 'Stacked bar requires at least 1 Dimension to pivot on.';
    } else if (type === 'map' && (checkedMetrics.length < 1 || checkedDims.length < 1)) {
      isConfigWarning = true;
      configWarningMessage = 'Map visual requires 1 Geographic Dimension and 1 Metric.';
    } else if (type === 'hbar' && (checkedMetrics.length < 1 && checkedDims.length < 2)) {
      isConfigWarning = true;
      configWarningMessage = 'H-Bar requires at least 1 Dimension and 1 Metric.';
    } else if (type === 'line' && checkedDims.length < 1) {
      isConfigWarning = true;
      configWarningMessage = 'Line chart requires at least 1 temporal or grouping Dimension.';
    } else if (type === 'bar' && checkedDims.length < 1) {
      isConfigWarning = true;
      configWarningMessage = 'Bar chart requires at least 1 Dimension.';
    } else if ((type === 'pie' || type === 'donut') && checkedDims.length < 1) {
      isConfigWarning = true;
      configWarningMessage = 'Pie/Donut chart requires at least 1 Dimension.';
    } else if (type === 'kpi' && checkedMetrics.length < 1 && checkedDims.length < 2) {
      isConfigWarning = true;
      configWarningMessage = 'Card visual requires at least 1 Metric to summarize.';
    }

    if (isConfigWarning) {
      const widgetColors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
      const color = widgetColors[Math.floor(Math.random() * widgetColors.length)];
      const id = 'w-' + Date.now();
      const initialPos = { x: 32 + (widgets.length * 64) % 480, y: 152 + (widgets.length * 48) % 300 };

      const placeholderWidget: CanvasWidget = {
        id,
        title: `${type.toUpperCase()} Visual (Configuration Pending)`,
        type,
        data: [],
        width: type === 'kpi' ? 'third' : 'half',
        position: initialPos,
        color,
        isConfigWarning,
        configWarningMessage,
        sql: '-- Column selections pending',
        thinking: ['Select valid fields in the left pane to initialize this widget.']
      };

      setWidgets((prev: CanvasWidget[]) => [...prev, placeholderWidget]);
      setSelectedWidgetId(id);
      addLog(`Created empty ${type} template. Select columns in the sidebar to populate.`);
      return;
    }

    const isDimOnlyAnalysis = checkedMetrics.length === 0 && checkedDims.length >= 2;
    const primaryMetric = isDimOnlyAnalysis ? checkedDims[1] : (checkedMetrics[0] || fieldsList.find((f: FieldDef) => f.category === 'Metrics')?.name || '1');
    const primaryDim = checkedDims[0] || fieldsList.find((f: FieldDef) => f.category === 'Dimensions')?.name || fieldsList.find((f: FieldDef) => f.category === 'Dates')?.name || fieldsList[0]?.name;

    addLog(`Compiling live query for manual visual append (${type})...`);
    setIsCompiling(true);

    try {
      let sql = '';
      let title = '';
      
      if (type === 'kpi') {
        const extraCols = checkedFields.filter((f: string) => f !== primaryMetric).map((f: string) => {
          const isMetric = fieldsList.some((af: FieldDef) => af.name === f && af.category === 'Metrics');
          return isMetric ? `${buildAggExpr('SUM', f, fieldsList)} AS "${f}"` : `ANY_VALUE(${getColExpr(f, fieldsList)}) AS "${f}"`;
        });
        const selection = [isDimOnlyAnalysis ? `COUNT(${getColExpr(primaryMetric, fieldsList)}) AS value` : `${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value`, ...extraCols].join(', ');
        sql = `SELECT ${selection} FROM data`;
        title = isDimOnlyAnalysis ? `Count of ${primaryMetric}` : `Total ${primaryMetric}`;
      } else if (type === 'table') {
        const colsToSelect = checkedFields.length > 0 ? checkedFields.map((f: string) => `${getColExpr(f, fieldsList)} AS "${f}"`).join(', ') : fieldsList.slice(0, 4).map((f: FieldDef) => `${getColExpr(f.name, fieldsList)} AS "${f.name}"`).join(', ');
        sql = `SELECT ${colsToSelect} FROM data LIMIT 50`;
        title = `Dataset Sample Ledger`;
      } else if (type === 'line') {
        const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(primaryDim, fieldsList)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(primaryDim, fieldsList)} AS DATE) WHEN TRY_CAST(${getColExpr(primaryDim, fieldsList)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(primaryDim, fieldsList)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
        const dateExpr = isDateColumn(primaryDim, fieldsList) ? `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(primaryDim, fieldsList)} AS VARCHAR))` : `CAST(${getColExpr(primaryDim, fieldsList)} AS VARCHAR)`;

        if (isDimOnlyAnalysis) {
          sql = `SELECT ${dateExpr} AS label, COUNT(${getColExpr(primaryMetric, fieldsList)}) AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else if (checkedMetrics.length > 1) {
          const metricSelections = checkedMetrics.map((m: string) => `${buildAggExpr('SUM', m, fieldsList)} AS "${m}"`).join(', ');
          sql = `SELECT ${dateExpr} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
          title = `Metrics Trend by ${primaryDim}`;
        } else {
          sql = `SELECT ${dateExpr} AS label, ${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
          title = `${primaryMetric} Trend by ${primaryDim}`;
        }
      } else if (type === 'stacked_bar') {
        if (checkedDims.length >= 2) {
          sql = `SELECT ${getColExpr(checkedDims[0], fieldsList)} AS label, * EXCLUDE (${getColExpr(checkedDims[0], fieldsList)}) FROM (PIVOT data ON ${getColExpr(checkedDims[1], fieldsList)} USING ${buildAggExpr('SUM', primaryMetric, fieldsList)} GROUP BY ${getColExpr(checkedDims[0], fieldsList)}) LIMIT 15`;
          title = `${primaryMetric} by ${checkedDims[0]} (Stacked by ${checkedDims[1]})`;
        } else if (checkedMetrics.length > 1) {
          const metricSelections = checkedMetrics.map((m: string) => `${buildAggExpr('SUM', m, fieldsList)} AS "${m}"`).join(', ');
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
          title = `Comparison by ${primaryDim}`;
        } else {
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${primaryDim}`;
        }
      } else if (type === 'map') {
        const geoDim = checkedDims.find((d: string) => ['country', 'state', 'city', 'region', 'postal', 'zip'].some((keyword: string) => d.toLowerCase().includes(keyword))) || primaryDim;
        if (checkedMetrics.length > 1) {
          const metricSelections = checkedMetrics.map((m: string) => `${buildAggExpr('SUM', m, fieldsList)} AS "${m}"`).join(', ');
          sql = `SELECT ${getColExpr(geoDim, fieldsList)} AS label, ${metricSelections} FROM data GROUP BY 1 LIMIT 100`;
          title = `Metrics by Geographic Location (${geoDim})`;
        } else {
          sql = `SELECT ${getColExpr(geoDim, fieldsList)} AS label, ${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 30`;
          title = `${primaryMetric} by Geographic Location (${geoDim})`;
        }
      } else if (type === 'scatter') {
        const xMetric = checkedMetrics[0] || fieldsList.find((f: FieldDef) => f.category === 'Metrics')?.name || '1';
        const yMetric = checkedMetrics[1] || fieldsList.find((f: FieldDef) => f.category === 'Metrics' && f.name !== xMetric)?.name || xMetric;
        sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${buildAggExpr('AVG', xMetric, fieldsList)} AS x_val, ${buildAggExpr('AVG', yMetric, fieldsList)} AS y_val FROM data GROUP BY 1 LIMIT 50`;
        title = `${yMetric} vs ${xMetric} Correlation by ${primaryDim}`;
      } else if (type === 'bubble') {
        const xMetric = checkedMetrics[0] || fieldsList.find((f: FieldDef) => f.category === 'Metrics')?.name || '1';
        const yMetric = checkedMetrics[1] || fieldsList.find((f: FieldDef) => f.category === 'Metrics' && f.name !== xMetric)?.name || xMetric;
        const zMetric = checkedMetrics[2] || fieldsList.find((f: FieldDef) => f.category === 'Metrics' && f.name !== xMetric && f.name !== yMetric)?.name || xMetric;
        sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${buildAggExpr('AVG', xMetric, fieldsList)} AS x_val, ${buildAggExpr('AVG', yMetric, fieldsList)} AS y_val, ${buildAggExpr('SUM', zMetric, fieldsList)} AS size_val FROM data GROUP BY 1 LIMIT 50`;
        title = `${yMetric} vs ${xMetric} Bubble Matrix by ${primaryDim}`;
      } else if (type === 'combo') {
        const barMetric = checkedMetrics[0] || fieldsList.find((f: FieldDef) => f.category === 'Metrics')?.name || '1';
        const lineMetric = checkedMetrics[1] || fieldsList.find((f: FieldDef) => f.category === 'Metrics' && f.name !== barMetric)?.name || barMetric;
        sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${buildAggExpr('SUM', barMetric, fieldsList)} AS bar_val, ${buildAggExpr('AVG', lineMetric, fieldsList)} AS line_val FROM data GROUP BY 1 ORDER BY bar_val DESC LIMIT 15`;
        title = `${barMetric} & ${lineMetric} Combo Analysis by ${primaryDim}`;
      } else if (type === 'hbar') {
        if (isDimOnlyAnalysis) {
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, COUNT(${getColExpr(primaryMetric, fieldsList)}) AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else {
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} Distribution by ${primaryDim}`;
        }
      } else {
        if (isDimOnlyAnalysis) {
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, COUNT(${getColExpr(primaryMetric, fieldsList)}) AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else if (checkedDims.length > 1) {
          const concatDims = checkedDims.map((d: string) => `COALESCE(CAST(${getColExpr(d, fieldsList)} AS VARCHAR), '')`).join(" || ' - ' || ");
          sql = `SELECT ${concatDims} AS label, ${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value FROM data GROUP BY ${checkedDims.map((d: string) => getColExpr(d, fieldsList)).join(', ')} ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${checkedDims.join(' & ')}`;
        } else if (checkedMetrics.length > 1) {
          const metricSelections = checkedMetrics.map((m: string) => `${buildAggExpr('SUM', m, fieldsList)} AS "${m}"`).join(', ');
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
          title = `Comparison by ${primaryDim}`;
        } else {
          sql = `SELECT ${getColExpr(primaryDim, fieldsList)} AS label, ${buildAggExpr('SUM', primaryMetric, fieldsList)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${primaryDim}`;
        }
      }

      addLog(`Executing Canvas query: ${sql}`);
      const sqlResult = await canvasService.executeSql(selectedDatasetId, selectedVersionId || '', sql);
      
      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        const widgetColors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
        const color = widgetColors[Math.floor(Math.random() * widgetColors.length)];
        const id = 'w-' + Date.now();
        const initialPos = { x: 32 + (widgets.length * 64) % 480, y: 152 + (widgets.length * 48) % 300 };

        let value: string | undefined = undefined;
        let subtext: string | undefined = undefined;
        let chartData = queryData;
        let xAxisKey: string | undefined = 'label';
        let yAxisKey: string | undefined = 'value';

        if (type === 'kpi') {
          const firstRow = queryData[0] || {};
          const kpiVal = firstRow.value ?? firstRow.VALUE ?? 0;
          value = formatKpiValue(kpiVal, primaryMetric, 'SUM');
          subtext = formatKpiSubtext(primaryMetric, 'SUM');
          chartData = queryData;
        } else if (type === 'pie' || type === 'donut') {
          const rowKeys = Object.keys(queryData[0] || {});
          xAxisKey = rowKeys.find((k: string) => k.toLowerCase() === 'label') || rowKeys[0] || 'name';
          yAxisKey = rowKeys.find((k: string) => k.toLowerCase() === 'value') || rowKeys[1] || 'val';
          chartData = queryData;
        } else if (type === 'bar' || type === 'line') {
          const rowKeys = Object.keys(queryData[0] || {});
          xAxisKey = rowKeys.find((k: string) => k.toLowerCase() === 'label') || rowKeys[0] || 'label';
          yAxisKey = rowKeys.find((k: string) => k.toLowerCase() === 'value') || rowKeys[1] || 'value';
          chartData = queryData;
        } else if (type === 'table') {
          xAxisKey = undefined;
          yAxisKey = undefined;
        }

        const targetMetricName = checkedMetrics.length > 0 ? checkedMetrics.join(', ') : primaryMetric;
        const targetDimName = checkedDims.length > 0 ? checkedDims.join(', ') : primaryDim;

        const newWidget: CanvasWidget = {
          id,
          title: beautifyTitle(title),
          type: type as any,
          width: type === 'kpi' ? 'third' : 'half',
          value,
          subtext,
          color,
          data: chartData,
          xAxisKey,
          yAxisKey,
          position: initialPos,
          sql: sql,
          activeGrain: type === 'line' ? 'month' : undefined,
          activeAgg: 'SUM',
          targetMetricName,
          targetDimName,
          thinking: [
            "User-triggered dynamic visual checklist layout append.",
            `Active context: metric="${primaryMetric}", dimension="${primaryDim}"`,
            "Executing sandboxed query against DuckDB data index."
          ],
          resultSummary: `Executed successfully: ${queryData.length} records retrieved.`
        };

        recordHistory();
        setWidgets((prev: CanvasWidget[]) => [...prev, newWidget]);
        setSelectedWidgetId(id);
        addLog(`SUCCESS: Instantiated live dynamic visual: [${title}]`);
      } else {
        throw new Error(sqlResult?.error || "SQL query failed");
      }
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Failed to compile visual: ${err.message || err}`);
      toast.error("Could not construct dynamic query. Verify column selections.");
    } finally {
      setIsCompiling(false);
    }
  };

  // Consume pinned charts from ChatInterface
  useEffect(() => {
    const importPinnedCharts = () => {
      try {
        const pinnedStr = localStorage.getItem('vizzy_pinned_charts');
        if (pinnedStr) {
          const pinned = JSON.parse(pinnedStr);
          if (pinned && pinned.length > 0) {
            localStorage.removeItem('vizzy_pinned_charts');
            
            const newWidgets = pinned.map((p: any, index: number) => {
              const w = chartSpecToCanvasWidget(p.spec, p.query || '', p.sql || '', p.thinking || [], p.resultSummary || '');
              w.position = { x: 40 + (index * 20), y: 160 + (index * 20) };
              return w;
            });
            
            setWidgets(prev => [...prev, ...newWidgets]);
            toast.success(`Imported ${pinned.length} pinned chart(s) from Chat.`);
          }
        }
      } catch (e) {
        console.error('Failed to import pinned charts', e);
      }
    };

    importPinnedCharts();
    window.addEventListener('storage', (e) => {
      if (e.key === 'vizzy_pinned_charts' && e.newValue) importPinnedCharts();
    });
    window.addEventListener('vizzy-pin', importPinnedCharts);

    return () => {
      window.removeEventListener('storage', importPinnedCharts);
      window.removeEventListener('vizzy-pin', importPinnedCharts);
    };
  }, [setWidgets]);

  // Debounced auto-save triggers
  useEffect(() => {
    if (!autoSaveEnabled || !loadedDashboardId || widgets.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const configObj = {
          type: 'canvas',
          widgets,
          gridSnap,
          showGridlines,
          selectedDatasetId,
          selectedVersionId
        };
        const payload = {
          name: saveDashboardName || "My Vizzy Canvas",
          config: configObj
        };
        await apiClient.patch(`/dashboards/${loadedDashboardId}`, payload);
        addLog(`Auto-saved layout changes to "${saveDashboardName}".`);
      } catch (err) {
        console.error("Auto save failed:", err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [widgets, gridSnap, showGridlines, autoSaveEnabled, loadedDashboardId, saveDashboardName, selectedDatasetId, selectedVersionId, addLog]);

  const handleSaveDashboard = () => {
    if (widgets.length === 0) {
      toast.error("Canvas is empty. Add some widgets first!");
      return;
    }
    setSaveDashboardName(saveDashboardName || "My Vizzy Canvas");
    setShowSaveModal(true);
  };

  const executeSaveDashboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveDashboardName.trim()) {
      toast.error("Dashboard name is required");
      return;
    }

    try {
      const configObj = {
        type: 'canvas',
        widgets,
        gridSnap,
        showGridlines,
        selectedDatasetId,
        selectedVersionId
      };
      
      const payload = {
        name: saveDashboardName,
        description: "Vizzy Canvas generated layout",
        dataset_id: selectedDatasetId || null,
        dataset_version_id: selectedVersionId || null,
        config: configObj,
        is_public: false
      };

      const res = await apiClient.post('/dashboards', payload);
      if (res.data && res.data.id) {
        setLoadedDashboardId(res.data.id);
      }
      toast.success("Dashboard layout saved successfully!");
      addLog(`SUCCESS: Saved dashboard layout: "${saveDashboardName}"`);
      setShowSaveModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save dashboard layout.");
    }
  };

  const executeSaveDashboardOverride = async () => {
    if (!loadedDashboardId) return;
    try {
      const configObj = {
        type: 'canvas',
        widgets,
        gridSnap,
        showGridlines,
        selectedDatasetId,
        selectedVersionId
      };
      
      const payload = {
        name: saveDashboardName || "My Vizzy Canvas",
        config: configObj
      };

      await apiClient.patch(`/dashboards/${loadedDashboardId}`, payload);
      toast.success("Dashboard layout updated successfully!");
      addLog(`SUCCESS: Updated layout changes for "${saveDashboardName || 'Dashboard'}"`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update dashboard layout.");
    }
  };

  const handleLoadDashboard = async (dashboardId: string) => {
    try {
      const res = await apiClient.get(`/dashboards/${dashboardId}`);
      const db = res.data;
      if (db.config && db.config.type === 'canvas') {
        recordHistory();
        setWidgets(db.config.widgets || []);
        setGridSnap(db.config.gridSnap ?? true);
        setShowGridlines(db.config.showGridlines ?? true);
        setLoadedDashboardId(db.id);
        setSaveDashboardName(db.name);
        if (db.config.selectedDatasetId) {
          handleDatasetChange(db.config.selectedDatasetId, true, db.config.selectedVersionId);
        }
        toast.success(`Loaded dashboard: ${db.name}`);
        addLog(`SUCCESS: Loaded dashboard layout: "${db.name}"`);
        setShowLoadModal(false);
      } else {
        toast.error("This dashboard is not compatible with the canvas view.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboard layout.");
    }
  };

  const fetchDashboards = async () => {
    try {
      const res = await apiClient.get('/dashboards');
      const canvasDashboards = (res.data.dashboards || []).filter((d: any) => d.config && d.config.type === 'canvas');
      setDashboardsList(canvasDashboards);
      setShowLoadModal(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboards list.");
    }
  };

  const handleDeleteDashboardClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteDashboardId(id);
    setShowDeleteModal(true);
  };

  const executeDeleteDashboard = async () => {
    if (!deleteDashboardId) return;
    try {
      await apiClient.delete(`/dashboards/${deleteDashboardId}`);
      toast.success("Dashboard deleted");
      setDashboardsList(prev => prev.filter(db => db.id !== deleteDashboardId));
      setShowDeleteModal(false);
      setDeleteDashboardId(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete dashboard");
    }
  };

  // AI Prompt compiler submission engine
  const handleAIPromptSubmit = async (promptText: string) => {
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    addLog(`AI compilation query triggered: "${promptText}"`);
    setIsCompiling(true);
    setCompilationSteps([]);
    setCompiledSql('');
    setCompiledResult('');
    setActiveStepIndex(-1);

    const logSteps = [
      "Interpreting natural language intent...",
      "Resolving database column mappings...",
      "Parsing aggregate definitions...",
      "Translating request to ANSI SQL...",
      "Optimizing query execution path...",
      "Compiling final visual components..."
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logSteps.length) {
        setCompilationSteps(prev => [...prev, logSteps[currentStep]]);
        setActiveStepIndex(currentStep);
        currentStep++;
      } else {
        clearInterval(interval);
      }
    }, 400);

    try {
      const res = await canvasService.compilePrompt(selectedDatasetId, selectedVersionId || null, promptText, false);
      clearInterval(interval);

      if (res && res.success) {
        setCompiledSql(res.sql || '');
        const executionSummary = `Executed successfully: ${res.chart?.data?.rows?.length || 0} records.`;
        setCompiledResult(executionSummary);
        
        const generatedWidget = chartSpecToCanvasWidget(
          res.chart,
          promptText,
          res.sql || '',
          res.explanation?.thinking || [],
          executionSummary
        );

        generatedWidget.position = {
          x: 32 + (widgets.length * 48) % 400,
          y: 152 + (widgets.length * 32) % 240
        };

        recordHistory();
        setWidgets((prev: CanvasWidget[]) => [...prev, generatedWidget]);
        setSelectedWidgetId(generatedWidget.id);
        setSelectedWidgetIds([generatedWidget.id]);
        addLog(`SUCCESS: Compiled new visual: "${generatedWidget.title}"`);
      } else {
        throw new Error(res?.error || "AI compiler failed to build spec");
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      addLog(`ERROR: AI compilation crashed: ${err.message || err}`);
      toast.error("Semantic translation failed. Refine your query vocabulary.");
    } finally {
      setIsCompiling(false);
    }
  };

  // Single widget right-click context menu options
  const handleWidgetRightClick = (e: React.MouseEvent, widgetId: string) => {
    e.preventDefault();
    setWidgetContextMenu({ x: e.clientX, y: e.clientY, widgetId });
  };

  // Modify individual widget format configurations
  const handleWidgetFormatChange = (widgetId: string, formatConfig: any) => {
    setWidgets((prev: CanvasWidget[]) => prev.map((w: CanvasWidget) => w.id === widgetId ? { ...w, numberFormat: formatConfig } : w));
    addLog(`Formatted widget parameters.`);
  };

  // Switch aggregation function on widget right-click context menu options
  const handleWidgetAggregationChange = async (widgetId: string, agg: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT' | 'VAR_SAMP' | 'PERCENT_CHANGE') => {
    const target = widgets.find((w: CanvasWidget) => w.id === widgetId);
    if (!target) return;
    
    setWidgets((prev: CanvasWidget[]) => prev.map((w: CanvasWidget) => w.id === widgetId ? { ...w, activeAgg: agg } : w));
    const metrics = target.targetMetricName ? target.targetMetricName.split(',').map((s: string) => s.trim()) : [];
    const dims = target.targetDimName ? target.targetDimName.split(',').map((s: string) => s.trim()) : [];
    
    await recompileWidget(widgetId, [...dims, ...metrics]);
  };

  // Cross-filter clicking logic
  const handleFilterClick = (fieldName: string, value: string) => {
    setCustomFilters((prev: any[]) => {
      const existing = prev.find((f: any) => f.fieldName === fieldName);
      if (existing) {
        return prev.map((f: any) => f.fieldName === fieldName ? {
          ...f,
          selectedValue: f.selectedValue === value ? null : value
        } : f);
      }
      return [...prev, {
        fieldName,
        category: 'Dimensions',
        options: [value],
        selectedValue: value
      }];
    });
    addLog(`Cross-filtering active: filter applied to "${fieldName}" = "${value}"`);
  };

  return (
    <div className="min-h-[700px] flex flex-col bg-bg text-text-custom select-none font-body canvas-workspace-root overflow-hidden">
      
      {/* 1. COMPILER UPPER TOOLBAR PANEL */}
      <CanvasToolbar 
        datasets={datasets}
        selectedDatasetId={selectedDatasetId}
        handleDatasetChange={handleDatasetChange}
        versions={versions}
        selectedVersionId={selectedVersionId}
        handleVersionChange={handleVersionChange}
        isLoadingColumns={isLoadingColumns}
        isCompiling={isCompiling}
        pastLength={past.length}
        futureLength={future.length}
        handleUndo={widgetsHook.handleUndo}
        handleRedo={widgetsHook.handleRedo}
        gridSnap={gridSnap}
        setGridSnap={setGridSnap}
        showGridlines={showGridlines}
        setShowGridlines={setShowGridlines}
        loadedDashboardId={loadedDashboardId}
        saveDashboardName={saveDashboardName}
        handleSaveDashboard={handleSaveDashboard}
        executeSaveDashboardOverride={executeSaveDashboardOverride}
        fetchDashboards={fetchDashboards}
        autoSaveEnabled={autoSaveEnabled}
        setAutoSaveEnabled={setAutoSaveEnabled}
        canvasZoom={canvasZoom}
        setCanvasZoom={setCanvasZoom}
        isFullScreenCanvas={isFullScreenCanvas}
        setIsFullScreenCanvas={setIsFullScreenCanvas}
        isPresentMode={isPresentMode}
        setIsPresentMode={setIsPresentMode}
        handleExportVisuals={handleExportVisuals}
      />

      {/* 2. DOCK SHELF GRID CONTAINER */}
      <div className="grid grid-cols-1 xl:grid-cols-12 flex-1 divide-y xl:divide-y-0 xl:divide-x divide-border-custom">
        
        {/* LEFT DOCK SIDEBAR PANEL */}
        <CanvasSidebar 
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          addLog={addLog}
          handleAddDefaultVisual={handleAddDefaultVisual}
          selectedWidgetId={selectedWidgetId}
          setSelectedWidgetId={setSelectedWidgetId}
          checkedFields={checkedFields}
          setCheckedFields={setCheckedFields}
          calcPrompt={calcPrompt}
          setCalcPrompt={setCalcPrompt}
          handleCreateCalculatedField={handleCreateCalculatedField}
          isCreatingCalcField={isCreatingCalcField}
          isLoadingColumns={isLoadingColumns}
          fieldsList={fieldsList}
          handleFieldToggle={(f) => handleFieldToggle(f, selectedWidgetId, recompileWidget)}
          handleDeleteField={handleDeleteField}
          logs={logs}
        />

        {/* RIGHT CORE GRIDSTAGE SHEET */}
        <div className={`${isSidebarCollapsed ? 'xl:col-span-12' : 'xl:col-span-9'} p-6 flex flex-col justify-between space-y-6 transition-all duration-300 relative`}>
          
          {/* Floating Expand button when sidebar collapsed */}
          {isSidebarCollapsed && !isFullScreenCanvas && (
            <button
              type="button"
              onClick={() => {
                setIsSidebarCollapsed(false);
                addLog("Sidebar restored.");
              }}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-50 bg-accent-custom hover:bg-accent-custom/95 text-white py-4 px-1.5 rounded-r-xl shadow-lg border border-l-0 border-accent-custom/30 flex flex-col items-center space-y-2 cursor-pointer transition-all hover:scale-105 duration-200 bg-transparent"
              title="Show Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
              <span className="text-[9px] font-bold tracking-widest uppercase" style={{ writingMode: 'vertical-lr' }}>
                Show Sidebar
              </span>
            </button>
          )}

          {/* TOP BAR: PROMPT INPUT BAR */}
          <div className="space-y-4">
            <AIPromptBar 
              onSubmit={handleAIPromptSubmit} 
              isCompiling={isCompiling} 
              suggestions={PROMPT_SUGGESTIONS} 
              placeholder="Prompt AI to construct and organize widgets on your canvas..."
              isFullScreen={false}
            />
          </div>

          {/* MAIN ABSOLUTE CANVAS SHEET AREA */}
          <div 
            onPointerDown={handleCanvasPointerDown}
            className={`transition-all duration-300 ${
              isFullScreenCanvas 
                ? 'fixed inset-0 z-[999] p-8 w-screen h-screen overflow-auto' 
                : 'flex-1 rounded-2xl border border-border-custom p-6 min-h-[580px] relative overflow-hidden'
            } ${
              isDark ? 'bg-[#060606]' : 'bg-[#fafafa]'
            }`}
            style={showGridlines ? {
              backgroundImage: isDark 
                ? 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)' 
                : 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
              backgroundSize: '16px 16px'
            } : undefined}
          >
            {/* Slicers Filters Bar zone */}
            <FilterBar 
              customFilters={customFilters}
              setCustomFilters={setCustomFilters}
              isDraggingOverFilters={isDraggingOverFilters}
              setIsDraggingOverFilters={setIsDraggingOverFilters}
              handleAddColumnAsFilter={handleAddColumnAsFilter}
              addLog={addLog}
            />

            {/* Selection dragging overlay box */}
            {selectionBox && selectionBox.active && (
              <div 
                className="absolute border border-accent-custom bg-accent-custom/10 pointer-events-none z-[9999] rounded-sm"
                style={{
                  left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                  top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                  width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                  height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`
                }}
              />
            )}

            {/* Absolute widget layout renders */}
            <div 
              className={isResponsive ? 'grid grid-cols-1 md:grid-cols-2 gap-6 p-2 mt-4' : 'relative w-full h-full mt-4'}
              style={!isResponsive ? { transform: `scale(${canvasScale})`, transformOrigin: 'top left' } : undefined}
            >
              {widgets.map((w: CanvasWidget) => (
                <WidgetCard 
                  key={w.id} 
                  widget={w}
                  selectedWidgetIds={selectedWidgetIds}
                  selectedWidgetId={selectedWidgetId}
                  setSelectedWidgetId={setSelectedWidgetId}
                  setSelectedWidgetIds={setSelectedWidgetIds}
                  isResponsive={isResponsive}
                  isFullScreenCanvas={isFullScreenCanvas}
                  isPresentMode={isPresentMode}
                  geoFilters={geoFilters}
                  setGeoFilters={setGeoFilters}
                  addLog={addLog}
                  handleDragStart={handleDragStart}
                  handleResizeStart={handleResizeStart}
                  handleDeleteWidget={handleDeleteWidget}
                  onFilterClick={handleFilterClick}
                  onWidgetRightClick={handleWidgetRightClick}
                  onRecompile={recompileWidget}
                />
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* 3. MODALS RENDERS */}
      <CanvasModals 
        showSaveModal={showSaveModal}
        setShowSaveModal={setShowSaveModal}
        saveDashboardName={saveDashboardName}
        setSaveDashboardName={setSaveDashboardName}
        executeSaveDashboard={executeSaveDashboard}
        showLoadModal={showLoadModal}
        setShowLoadModal={setShowLoadModal}
        dashboardsList={dashboardsList}
        handleLoadDashboard={handleLoadDashboard}
        handleDeleteDashboardClick={handleDeleteDashboardClick}
        showDeleteModal={showDeleteModal}
        setShowDeleteModal={setShowDeleteModal}
        setDeleteDashboardId={setDeleteDashboardId}
        executeDeleteDashboard={executeDeleteDashboard}
        showDeleteFieldModal={showDeleteFieldModal}
        setShowDeleteFieldModal={setShowDeleteFieldModal}
        deleteFieldId={deleteFieldId}
        setDeleteFieldId={setDeleteFieldId}
        executeDeleteField={executeDeleteField}
        showCustomFormatModal={showCustomFormatModal}
        setShowCustomFormatModal={setShowCustomFormatModal}
        customFormatModalWidgetId={customFormatModalWidgetId}
        setCustomFormatModalWidgetId={setCustomFormatModalWidgetId}
        customFormatModalType={customFormatModalType}
        setCustomFormatModalType={setCustomFormatModalType}
        customFormatDecimals={customFormatDecimals}
        setCustomFormatDecimals={setCustomFormatDecimals}
        customFormatNegative={customFormatNegative}
        setCustomFormatNegative={setCustomFormatNegative}
        customFormatPrefix={customFormatPrefix}
        setCustomFormatPrefix={setCustomFormatPrefix}
        customFormatSuffix={customFormatSuffix}
        setCustomFormatSuffix={setCustomFormatSuffix}
        customFormatSeparator={customFormatSeparator}
        setCustomFormatSeparator={setCustomFormatSeparator}
        customFormatUnit={customFormatUnit}
        setCustomFormatUnit={setCustomFormatUnit}
        handleWidgetFormatChange={handleWidgetFormatChange}
      />

      {/* Widget Right Click context menu options */}
      {widgetContextMenu && (() => {
        const targetWidget = widgets.find((w: CanvasWidget) => w.id === widgetContextMenu.widgetId);
        
        return (
          <div 
            className="fixed z-[9999] bg-surface border border-border-custom rounded-2xl shadow-2xl p-2 font-mono text-[11px] min-w-[180px] animate-in zoom-in-95 duration-100 flex flex-col"
            style={{ top: `${widgetContextMenu.y}px`, left: `${widgetContextMenu.x}px` }}
          >
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-[-1] cursor-default" onClick={() => setWidgetContextMenu(null)} />
            
            <div className="px-3 py-1.5 text-muted-custom font-bold border-b border-border-custom/50 select-none truncate">
              Aggregation: {targetWidget?.title || 'Visual'}
            </div>
            
            <div className="p-1 space-y-1">
              {[
                { label: 'Sum Aggregation', value: 'SUM' },
                { label: 'Average (Mean)', value: 'AVG' },
                { label: 'Minimum Val', value: 'MIN' },
                { label: 'Maximum Val', value: 'MAX' },
                { label: 'Record Count', value: 'COUNT' },
                { label: 'Variance (Sample)', value: 'VAR_SAMP' },
                { label: 'Percent Change (%)', value: 'PERCENT_CHANGE' }
              ].map(opt => {
                const isSelected = targetWidget?.activeAgg === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      handleWidgetAggregationChange(widgetContextMenu.widgetId, opt.value as any);
                      setWidgetContextMenu(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected 
                        ? 'bg-accent-custom text-white font-bold' 
                        : 'text-text-custom hover:bg-surface-2'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
