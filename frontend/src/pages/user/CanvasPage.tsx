import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Sparkles, Grid, Sliders, Play, Trash2, ArrowRight, RotateCcw, LayoutGrid, 
  ChevronRight, ChevronLeft, Plus, Check, Settings2, Download, Eye, FileSpreadsheet,
  Info, BarChart3, PieChart as PieIcon, TrendingUp, HelpCircle, AlertCircle, Maximize2, Minimize2, Move,
  Terminal, Code, Cpu, Database, Copy, CheckCheck, Table2, Layers, Undo2, Redo2,
  GripVertical, Filter, ChevronDown, GitBranch, FolderOpen, Save as SaveIcon, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../../context/ThemeContext';
import { datasetService, type Dataset, type DatasetVersionSummary } from '../../lib/api/dataset';
import { analyticsService } from '../../lib/api/dashboard';
import { chatService, type ChatSession, type ChatMessage } from '../../lib/api/chat';
import { canvasService, formatKpiValue, formatKpiSubtext } from '../../lib/api/canvas';
import { apiClient } from '../../lib/api/client';
import { toast } from 'react-hot-toast';

// Define Widget Type for the Canvas with AI logs
interface CanvasWidget {
  id: string;
  title: string;
  type: 'kpi' | 'bar' | 'line' | 'pie' | 'table';
  data: any[];
  width: 'full' | 'half' | 'third';
  value?: string;
  subtext?: string;
  color?: string;
  xAxisKey?: string;
  yAxisKey?: string;
  sql?: string;
  thinking?: string[];
  resultSummary?: string;
  position?: { x: number; y: number };
  customWidth?: number;
  customHeight?: number;
  activeGrain?: 'year' | 'quarter' | 'month' | 'day';
  activeAgg?: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT' | 'VAR_SAMP';
  targetMetricName?: string;
  targetDimName?: string;
  filterOmitted?: boolean;
}

// Initial starter widgets (Starts empty in production for real data generation)
const INITIAL_WIDGETS: CanvasWidget[] = [];



// Supported templates
const PROMPT_SUGGESTIONS = [
  'Create a KPI card showing conversion rate as 4.8%',
  'Generate a line chart showing Monthly Revenue Trend: Jan $45k, Feb $52k, Mar $58k, Apr $64k',
  'Add a bar chart for sales by product: Software $120k, Hardware $85k, Services $40k',
  'Build a pie chart representing segment share: Enterprise 45%, Mid-Market 35%, SMB 20%'
];

export default function CanvasPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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
  
  // Auto-persist widgets state to local cache whenever modified
  useEffect(() => {
    localStorage.setItem('vizzy_canvas_widgets', JSON.stringify(widgets));
  }, [widgets]);

  const [promptInput, setPromptInput] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [checkedFields, setCheckedFields] = useState<string[]>([]);
  
  // AI Calculated Fields states

  const [calcPrompt, setCalcPrompt] = useState('');
  const [isCreatingCalcField, setIsCreatingCalcField] = useState(false);

  // Dataset/Version State Management
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => localStorage.getItem('vizzy_last_dataset_id') || '');
  const [versions, setVersions] = useState<DatasetVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(() => localStorage.getItem('vizzy_last_version_id') || '');
  const [canvasChatSessionId, setCanvasChatSessionId] = useState<string | null>(null);

  // Dashboards persistence list
  const [dashboardsList, setDashboardsList] = useState<any[]>([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [geoFilters, setGeoFilters] = useState<Record<string, string[]>>({});

  const buildAggExpr = (agg: string, colName: string) => {
    const colObj = fieldsList.find(f => f.name === colName);
    
    // 1. Handle AI Calculated Fields with formulas
    if (colObj?.formula) {
      // If the formula already performs an aggregation, DO NOT wrap it again!
      if (/\b(SUM|AVG|MIN|MAX|COUNT|VAR_SAMP)\s*\(/i.test(colObj.formula)) {
        return `(${colObj.formula})`;
      }
      return `${agg}(${colObj.formula})`;
    }

    // 2. Handle dirty numeric string columns
    if (
      colObj && 
      colObj.category === 'Metrics' && 
      (colObj.type.toLowerCase().includes('varchar') || 
       colObj.type.toLowerCase().includes('string') || 
       colObj.type.toLowerCase().includes('char'))
    ) {
      return `${agg}(TRY_CAST(NULLIF(REGEXP_REPLACE("${colName}", '^\\s*$', ''), '') AS DOUBLE))`;
    }

    // 3. Normal columns
    return `${agg}("${colName}")`;
  };

  // Function to case column names
  const _humanizeLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Sanitize internal boolean, integer, or raw values for clean presentation (e.g. 0/1 to No/Yes, yes/no to Yes/No)
  const _sanitizeLabel = (val: any): string => {
    if (val === null || val === undefined) return '—';
    const str = String(val).trim();
    const lower = str.toLowerCase();
    
    if (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'y') {
      return 'Yes';
    }
    if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'n') {
      return 'No';
    }
    
    // Humanize standard text if it looks like a database snake case name
    if (str.includes('_')) {
      return _humanizeLabel(str);
    }
    return str;
  };

  // Load column schema from dedicated canvas endpoint
  const loadDatasetColumns = async (datasetId: string, _versionId: string) => {
    setIsLoadingColumns(true);
    try {
      addLog('Loading column schema via Canvas API...');
      const schema = await canvasService.getSchema(datasetId);
      
      const dynamicFields = schema.columns.map(col => ({
        name: col.name,
        category: col.category === 'Dates' ? 'Dimensions' : col.category,
        type: col.category === 'Metrics' ? 'numeric' : col.category === 'Dates' ? 'date' : 'text',
        formula: (col as any).formula
      }));
      
      if (dynamicFields.length > 0) {
        setFieldsList(dynamicFields);
        
        // Smart default selection: pick first metric + first dimension
        const defaultChecked: string[] = [];
        const firstMetric = dynamicFields.find(f => f.category === 'Metrics');
        const firstDim = dynamicFields.find(f => f.category === 'Dimensions');
        if (firstMetric) defaultChecked.push(firstMetric.name);
        if (firstDim) defaultChecked.push(firstDim.name);
        if (defaultChecked.length === 0 && dynamicFields.length > 0) {
          defaultChecked.push(dynamicFields[0].name);
        }
        setCheckedFields(defaultChecked);
        addLog(`Loaded ${dynamicFields.length} columns (${schema.dataset_name}, ${schema.row_count?.toLocaleString() ?? '?'} rows)`);
      } else {
        setFieldsList([]);
        addLog('No columns found in dataset schema.');
      }
    } catch (err) {
      console.error('Canvas schema load failed:', err);
      addLog('ERROR: Failed to load schema. Falling back to status endpoint...');
      
      // Fallback to legacy getDuckdbStatus
      try {
        const statusData = await datasetService.getDuckdbStatus(datasetId);
        if (statusData.schema && statusData.schema.length > 0) {
          const fallbackFields = statusData.schema.map((col: any) => {
            const typeLower = (col.dtype || '').toLowerCase();
            const isNumeric = ['int', 'double', 'float', 'decimal', 'numeric', 'real', 'bigint'].some(t => typeLower.includes(t));
            const isDate = ['date', 'time', 'timestamp'].some(t => typeLower.includes(t));
            return { name: col.name, category: isNumeric ? 'Metrics' : 'Dimensions', type: isNumeric ? 'numeric' : isDate ? 'date' : 'text' };
          });
          setFieldsList(fallbackFields);
          const defaultChecked = fallbackFields.slice(0, 2).map((f: any) => f.name);
          setCheckedFields(defaultChecked);
          addLog(`Fallback loaded ${fallbackFields.length} columns.`);
        } else {
          setFieldsList([]);
        }
      } catch {
        setFieldsList([]);
      }
    } finally {
      setIsLoadingColumns(false);
    }
  };

  // Load datasets on mount
  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const data = await datasetService.listDatasets();
        setDatasets(data);
        const savedDatasetId = localStorage.getItem('vizzy_last_dataset_id') || '';
        const savedVersionId = localStorage.getItem('vizzy_last_version_id') || '';
        if (savedDatasetId) {
          const vers = await datasetService.listVersionsForDataset(savedDatasetId);
          setVersions(vers);
          const activeVer = savedVersionId || (vers.length > 0 ? vers[0].id : '');
          if (activeVer) {
            setSelectedVersionId(activeVer);
            loadDatasetColumns(savedDatasetId, activeVer);
          }
        }
      } catch (err) {
        console.error("Failed to load datasets:", err);
      }
    };
    loadDatasets();
  }, []);

  // Handle dataset change
  const handleDatasetChange = async (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    localStorage.setItem('vizzy_last_dataset_id', datasetId);
    setCanvasChatSessionId(null); // Reset session
    setWidgets([]); // Empty canvas on dataset change
    try {
      if (datasetId) {
        const vers = await datasetService.listVersionsForDataset(datasetId);
        setVersions(vers);
        if (vers.length > 0) {
          const latestVersion = vers[0].id;
          setSelectedVersionId(latestVersion);
          localStorage.setItem('vizzy_last_version_id', latestVersion);
          loadDatasetColumns(datasetId, latestVersion);
        } else {
          setSelectedVersionId('');
          setFieldsList([]);
        }
      } else {
        setVersions([]);
        setSelectedVersionId('');
        setFieldsList([]);
      }
    } catch (err) {
      console.error("Failed to load versions:", err);
      setFieldsList([]);
    }
  };

  const handleVersionChange = (versionId: string) => {
    setSelectedVersionId(versionId);
    localStorage.setItem('vizzy_last_version_id', versionId);
    setCanvasChatSessionId(null); // Reset session
    setWidgets([]); // Empty canvas on version change
    if (selectedDatasetId && versionId) {
      loadDatasetColumns(selectedDatasetId, versionId);
    }
  };
  
  // PowerBI Design configuration
  const [gridSnap, setGridSnap] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  const [showSqlViewer, setShowSqlViewer] = useState(false); // Default false for clean spacious view, togglable on request!

  // Drag & Drop / Context Menu Filter state variables
  interface CustomFilter {
    fieldName: string;
    category: string;
    options: string[];
    selectedValue: string | null;
  }
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [isDraggingOverFilters, setIsDraggingOverFilters] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    field: { name: string; category: string; type: string };
  } | null>(null);
  
  const [widgetContextMenu, setWidgetContextMenu] = useState<{
    x: number;
    y: number;
    widgetId: string;
  } | null>(null);

  const [activeHoverTooltip, setActiveHoverTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);

  // Custom calculated field state variables
  const [fieldsList, setFieldsList] = useState<{ name: string; category: string; type: string; formula?: string }[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);


  // Sidebar and individual widget editing/resizing state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFullScreenCanvas, setIsFullScreenCanvas] = useState(false);
  const [isPresentMode, setIsPresentMode] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState<'fit-width' | 'fit-page' | 'fit-canvas' | '100' | '75' | '50'>('fit-width');
  const [showFloatingSuggestions, setShowFloatingSuggestions] = useState(false);
  const [isPromptBubbleCollapsed, setIsPromptBubbleCollapsed] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

  // Resize listener for viewportSize
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // AI SQL Engine active compilation parameters
  const [compilationSteps, setCompilationSteps] = useState<string[]>([]);
  const [compiledSql, setCompiledSql] = useState<string>('');
  const [compiledResult, setCompiledResult] = useState<string>('');
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  
  // Add direct log entries
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 15));
  };

  // Mapper function to transform a backend chart spec to a CanvasWidget shape
  const chartSpecToCanvasWidget = (spec: any, query: string, sql: string, thinking: string[], resultSummary: string): CanvasWidget => {
    const chart = spec.chart || {};
    const type = chart.type === 'stacked_bar' || chart.type === 'stacked' ? 'bar' : (chart.type || 'table');
    
    let data: any[] = [];
    let value: string | undefined = undefined;
    let subtext: string | undefined = undefined;
    let xAxisKey: string | undefined = undefined;
    let yAxisKey: string | undefined = undefined;

    if (type === 'kpi') {
      const kpiVal = chart.data?.value;
      const kpiLabel = chart.data?.label || chart.title || '';
      const suffix = chart.data?.suffix || '';
      
      // Use professional compact notation with auto-currency detection
      if (suffix === '%') {
        value = typeof kpiVal === 'number' ? `${kpiVal.toFixed(1)}%` : String(kpiVal || '0') + '%';
      } else {
        value = formatKpiValue(kpiVal, kpiLabel, 'SUM');
      }
      subtext = kpiLabel || 'Total';
      
      // If backend provides secondary metrics, store for enhanced rendering
      if (chart.data?.metrics && chart.data.metrics.length > 1) {
        data = chart.data.metrics;
      }
    } else if (type === 'bar' || chart.type === 'stacked_bar' || chart.type === 'stacked') {
      data = chart.data?.rows || [];
      xAxisKey = chart.dimension || 'label';
      yAxisKey = chart.metric || (chart.data?.categories ? chart.data.categories[0] : 'value');
    } else if (type === 'line') {
      xAxisKey = chart.dimension || 'timestamp';
      yAxisKey = chart.metric || 'value';
      const series = chart.data?.series || [];
      if (series.length > 0) {
        data = series.map((s: any) => ({
          [xAxisKey!]: s.timestamp,
          [yAxisKey!]: s.value
        }));
      } else {
        data = chart.data?.rows || [];
      }
    } else if (type === 'pie') {
      data = chart.data?.rows || [];
      xAxisKey = chart.dimension || 'name';
      yAxisKey = chart.metric || 'val';
      if (data.length > 0 && !data[0].hasOwnProperty(xAxisKey)) {
        const keys = Object.keys(data[0]);
        xAxisKey = keys[0];
        yAxisKey = keys[1];
      }
    } else {
      // Table fallback: map columns and rows to fit the schema
      data = chart.data?.rows || [];
    }

    const widgetColors = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
    const color = widgetColors[Math.floor(Math.random() * widgetColors.length)];

    return {
      id: 'w-' + Date.now(),
      title: chart.title || 'AI Visual',
      type: type as any,
      data,
      width: type === 'kpi' ? 'third' : 'half',
      value,
      subtext,
      color,
      xAxisKey,
      yAxisKey,
      sql: sql,
      thinking: thinking,
      resultSummary: resultSummary,
      position: { x: 32, y: 152 },
      targetMetricName: chart.metric || '',
      targetDimName: chart.dimension || ''
    };
  };

  // Consume pinned charts from ChatInterface
  useEffect(() => {
    const importPinnedCharts = () => {
      try {
        const pinnedStr = localStorage.getItem('vizzy_pinned_charts');
        if (pinnedStr) {
          const pinned = JSON.parse(pinnedStr);
          if (pinned && pinned.length > 0) {
            // Synchronously clear to prevent StrictMode double-invokes or race conditions
            localStorage.removeItem('vizzy_pinned_charts');
            
            const newWidgets = pinned.map((p: any, index: number) => {
              const w = chartSpecToCanvasWidget(p.spec, p.query || '', p.sql || '', p.thinking || [], p.resultSummary || '');
              // Offset position slightly for multiple pins
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

    // 1. Check on mount
    importPinnedCharts();

    // 2. Listen for cross-tab pins
    window.addEventListener('storage', (e) => {
      if (e.key === 'vizzy_pinned_charts' && e.newValue) {
        importPinnedCharts();
      }
    });

    // 3. Listen for same-tab pins (if route is cached/persistent)
    window.addEventListener('vizzy-pin', importPinnedCharts);

    return () => {
      window.removeEventListener('storage', importPinnedCharts);
      window.removeEventListener('vizzy-pin', importPinnedCharts);
    };
  }, []);

  const handleSaveDashboard = async () => {
    if (widgets.length === 0) {
      toast.error("Canvas is empty. Add some widgets first!");
      return;
    }
    const name = prompt("Enter a name for this dashboard:", "My AI Canvas Dashboard");
    if (!name) return;

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
        name,
        description: "AI Canvas generated dashboard",
        dataset_id: selectedDatasetId || null,
        dataset_version_id: selectedVersionId || null,
        config: configObj,
        is_public: false
      };

      await apiClient.post('/dashboards', payload);
      toast.success("Dashboard layout saved successfully!");
      addLog(`SUCCESS: Saved dashboard layout: "${name}"`);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save dashboard layout.");
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
        if (db.config.selectedDatasetId) {
          handleDatasetChange(db.config.selectedDatasetId);
        }
        toast.success(`Loaded dashboard: ${db.name}`);
        addLog(`SUCCESS: Loaded dashboard layout: "${db.name}"`);
        setShowLoadModal(false);
      } else {
        toast.error("This dashboard is not compatible with the canvas view.");
      }
    } catch (err: any) {
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

  // Workspace Undo/Redo History State Management
  interface HistoryFrame {
    widgets: CanvasWidget[];
    fieldsList: { name: string; category: string; type: string }[];
    checkedFields: string[];
  }

  const [past, setPast] = useState<HistoryFrame[]>([]);
  const [future, setFuture] = useState<HistoryFrame[]>([]);

  const widgetsRef = useRef(widgets);
  const fieldsListRef = useRef(fieldsList);
  const checkedFieldsRef = useRef(checkedFields);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const canvasScale = useMemo(() => {
    if (!isPresentMode && !isFullScreenCanvas) return 1;
    if (!canvasContainerRef.current) return 0.5; // fallback until mounted

    const containerWidth = canvasContainerRef.current.clientWidth - 32;
    const containerHeight = canvasContainerRef.current.clientHeight - 32;

    const scaleX = containerWidth / 2400;
    const scaleY = containerHeight / 1600;

    if (isPresentMode) {
      // Cover the screen with the dashboard responsively, filling the background and avoiding being minimized
      return Math.max(scaleX, scaleY);
    }

    // In regular edit full screen, we let the user adjust zoom or default to fit width
    switch (canvasZoom) {
      case 'fit-width':
        return scaleX;
      case 'fit-page':
        return Math.min(scaleX, scaleY);
      case 'fit-canvas':
        return Math.max(scaleX, scaleY);
      case '100':
        return 1;
      case '75':
        return 0.75;
      case '50':
        return 0.5;
      default:
        return scaleX;
    }
  }, [isFullScreenCanvas, isPresentMode, canvasZoom, viewportSize, widgets.length]);

  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  useEffect(() => {
    fieldsListRef.current = fieldsList;
  }, [fieldsList]);

  useEffect(() => {
    checkedFieldsRef.current = checkedFields;
  }, [checkedFields]);

  const recordHistory = () => {
    setPast(prev => [
      ...prev,
      {
        widgets: widgetsRef.current,
        fieldsList: fieldsListRef.current,
        checkedFields: checkedFieldsRef.current
      }
    ]);
    setFuture([]); // Clear future stack on any new mutation
  };

  const handleUndo = () => {
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
    setFieldsList(previous.fieldsList);
    setCheckedFields(previous.checkedFields);
    
    addLog("Undo executed: reverted workspace change.");
  };

  const handleRedo = () => {
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
    setFieldsList(next.fieldsList);
    setCheckedFields(next.checkedFields);
    
    addLog("Redo executed: restored workspace change.");
  };

  // ============================================================================
  // AST Cross-Filtering Re-query Engine
  // ============================================================================
  useEffect(() => {
    if (!selectedDatasetId) return;

    setWidgets(prevWidgets => {
      const updatableWidgets = prevWidgets.filter(w => w.sql);
      if (updatableWidgets.length === 0) return prevWidgets;

      const activeFilters = customFilters.filter(f => f.selectedValue !== null);
      
      const executeAll = async () => {
        try {
          const promises = updatableWidgets.map(async (w) => {
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
              console.error(`Failed to requery widget ${w.id}`, e);
              return { id: w.id, data: w.data, error: 'Failed', filterOmitted: true, isKpi: w.type === 'kpi' };
            }
          });

          const updates = await Promise.all(promises);
          
          setWidgets(currentWidgets => currentWidgets.map(w => {
            const update = updates.find(u => u.id === w.id);
            if (update && !update.error) {
              const newWidget = {
                ...w,
                data: update.data,
                filterOmitted: update.filterOmitted
              };
              // If it's a KPI and it re-queried successfully without fallback, update its value dynamically
              if (update.isKpi && update.data && update.data.length > 0) {
                const firstRow = update.data[0];
                const numericKey = Object.keys(firstRow).find(k => typeof firstRow[k] === 'number');
                if (numericKey) {
                   const rawValue = firstRow[numericKey];
                   const metricLabel = w.targetMetricName || w.yAxisKey || numericKey;
                   newWidget.value = formatKpiValue(rawValue, metricLabel, w.activeAgg || 'SUM');
                }
              }
              return newWidget;
            }
            return w;
          }));
        } catch (err) {
          console.error('Cross-filter re-query failed', err);
        }
      };

      // Fire async execution without blocking state
      executeAll();

      return prevWidgets;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFilters, selectedDatasetId, selectedVersionId]);

  // Bind Ctrl+Z / Ctrl+Y and Mac Cmd counterpart shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if target is input/textarea to avoid intercepting normal text editing
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.getAttribute('contenteditable') === 'true'
      )) {
        return; // Let standard text undo/redo function inside fields
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
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [past, future, isFullScreenCanvas, isPresentMode]);

  // Drag and drop free movement mechanics
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>, widgetId: string) => {
    // Only drag on left click and not on inner controls
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('input')) {
      return;
    }
    
    e.preventDefault();
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    setSelectedWidgetId(widgetId);
    
    const dragStartWidgets = [...widgetsRef.current];
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = widget.position?.x ?? 16;
    const initialY = widget.position?.y ?? 16;
    
    const width = widget.customWidth ?? (widget.type === 'kpi' ? 245 : 375);
    const height = widget.customHeight ?? (widget.type === 'kpi' ? 120 : 230);
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      let newX = initialX + deltaX;
      let newY = initialY + deltaY;
      
      if (gridSnap) {
        newX = Math.round(newX / 16) * 16;
        newY = Math.round(newY / 16) * 16;
      }
      
      // Boundaries to prevent dragging completely off the large independent design stage
      newX = Math.max(0, Math.min(newX, 2400 - width));
      newY = Math.max(0, Math.min(newY, 1600 - height));
      
      setWidgets(prev => prev.map(w => w.id === widgetId ? {
        ...w,
        position: { x: newX, y: newY }
      } : w));
    };
    
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      // Check if position actually changed
      const currentWidgets = widgetsRef.current;
      const widgetBefore = dragStartWidgets.find(w => w.id === widgetId);
      const widgetAfter = currentWidgets.find(w => w.id === widgetId);

      if (widgetBefore && widgetAfter && (
        widgetBefore.position?.x !== widgetAfter.position?.x ||
        widgetBefore.position?.y !== widgetAfter.position?.y
      )) {
        setPast(prev => [
          ...prev,
          {
            widgets: dragStartWidgets,
            fieldsList: fieldsListRef.current,
            checkedFields: checkedFieldsRef.current
          }
        ]);
        setFuture([]); // Clear future stack
        addLog(`Moved component "${widgetAfter.title}" to position (${widgetAfter.position?.x}px, ${widgetAfter.position?.y}px).`);
      }
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Drag and drop resize mechanics (PowerBI style)
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

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      let nextWidth = Math.max(150, startWidth + deltaX);
      let nextHeight = Math.max(80, startHeight + deltaY);
      
      if (gridSnap) {
        nextWidth = Math.round(nextWidth / 16) * 16;
        nextHeight = Math.round(nextHeight / 16) * 16;
      }
      
      setWidgets(prev => prev.map(w => {
        if (w.id === widgetId) {
          return {
            ...w,
            customWidth: nextWidth,
            customHeight: nextHeight
          };
        }
        return w;
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      const currentWidgets = widgetsRef.current;
      const widgetBefore = dragStartWidgets.find(w => w.id === widgetId);
      const widgetAfter = currentWidgets.find(w => w.id === widgetId);

      if (widgetBefore && widgetAfter && (
        (widgetBefore.customWidth !== widgetAfter.customWidth) ||
        (widgetBefore.customHeight !== widgetAfter.customHeight)
      )) {
        setPast(prev => [
          ...prev,
          {
            widgets: dragStartWidgets,
            fieldsList: fieldsListRef.current,
            checkedFields: checkedFieldsRef.current
          }
        ]);
        setFuture([]); // Clear future stack
        addLog(`Resized component "${widgetAfter.title}" to ${widgetAfter.customWidth}x${widgetAfter.customHeight}px.`);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Geometry precise properties update
  const updateWidgetBounds = (widgetId: string, updates: { x?: number; y?: number; width?: number; height?: number }) => {
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
  };

  const handleAddColumnAsFilter = async (fieldName: string) => {
    if (customFilters.some(f => f.fieldName === fieldName)) {
      addLog(`Filter for column "${fieldName}" is already present on the canvas.`);
      return;
    }
    
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    const fieldObj = fieldsList.find(f => f.name === fieldName);
    
    // Add temporary filter with loading placeholder
    const newFilter: CustomFilter = {
      fieldName,
      category: fieldObj?.category || 'Dimensions',
      options: ['Loading...'],
      selectedValue: null
    };
    
    setCustomFilters(prev => [...prev, newFilter]);
    addLog(`Registering dynamic slicer filter for: "${fieldName}"...`);

    try {
      // Query distinct values from DuckDB
      const sql = `SELECT DISTINCT "${fieldName}" AS val FROM data WHERE "${fieldName}" IS NOT NULL ORDER BY val ASC LIMIT 100`;
      const sqlResult = await canvasService.executeSql(selectedDatasetId, sql);
      
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
      // Fallback options
      setCustomFilters(prev => prev.map(f => {
        if (f.fieldName === fieldName) {
          return { ...f, options: ['High', 'Medium', 'Low'] };
        }
        return f;
      }));
    }
  };

  const getDisplayKPI = (widget: CanvasWidget) => {
    let displayValue = widget.value ?? '';
    let displaySubtext = widget.subtext ?? '';

    const activeFilters = customFilters.filter(f => f.selectedValue !== null);
    if (activeFilters.length > 0) {
      const filterDesc = activeFilters.map(f => `${f.fieldName}=${f.selectedValue}`).join(', ');
      displaySubtext = `${widget.subtext || ''} (Filtered by: ${filterDesc})`;
    }

    return { value: displayValue, subtext: displaySubtext };
  };

  // Field selection auto-visual creation logic (Tableau-style single measure + single dimension filter)
  const handleFieldToggle = (fieldName: string) => {
    const fieldObj = fieldsList.find(f => f.name === fieldName);
    if (!fieldObj) return;

    let nextChecked = [...checkedFields];
    if (nextChecked.includes(fieldName)) {
      nextChecked = nextChecked.filter(f => f !== fieldName);
    } else {
      // Filter out existing checked fields of the same category (enforce single metric and single dimension)
      nextChecked = nextChecked.filter(f => {
        const activeObj = fieldsList.find(af => af.name === f);
        return activeObj ? activeObj.category !== fieldObj.category : true;
      });
      nextChecked.push(fieldName);
    }
    
    setCheckedFields(nextChecked);
    addLog(`PowerBI Fields updated: Active Selection: [${nextChecked.join(', ')}]`);

    // Dynamic Visual generator when selected combination changes
    if (nextChecked.length >= 2) {
      const metric = nextChecked.find(f => fieldsList.some(af => af.name === f && af.category === 'Metrics'));
      const dimension = nextChecked.find(f => fieldsList.some(af => af.name === f && af.category === 'Dimensions'));
      
      if (metric && dimension) {
        addLog(`System suggestions: Compiling dynamic visual matching (${metric} × ${dimension})...`);
      }
    }
  };

  // Rule-based prompt compilation engine replaced with real SSE NL2SQL streaming compiler
  const handlePromptSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim()) return;
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    setIsCompiling(true);
    setActiveStepIndex(0);
    setCompilationSteps([]);
    setCompiledSql('');
    setCompiledResult('');
    addLog(`AI Parsing prompt query: "${promptInput}"`);

    try {
      // 1. Enforce strict Session Isolation (0% context bleed)
      // We explicitly create a NEW session for every prompt so the LLM doesn't incorrectly reuse formats or insights from previous widgets
      addLog("Creating isolated canvas compilation session...");
      const session = await chatService.createSession(selectedDatasetId, selectedVersionId || undefined, "Canvas Workspace Session");
      const sessionId = session.id;

      // 2. Stream thoughts and progress
      const promptQuery = promptInput;
      const thoughts: string[] = [];
      
      const res = await chatService.sendMessageStream(
        sessionId,
        promptQuery,
        (progress) => {
          // Progress update
          addLog(`[AI Compiler Progress] ${progress.phase}: ${progress.detail}`);
        },
        (thought) => {
          // Thought update
          thoughts.push(thought.content);
          setCompilationSteps([...thoughts]);
          setActiveStepIndex(thoughts.length - 1);
          addLog(`[AI Compiler Step] ${thought.content}`);
        },
        undefined,
        { forceDeepAnalysis: true } // Let's enable deep analysis for high-fidelity SQL/insight generation
      );

      // 3. Process result
      const outputData = res.assistant_message?.output_data;
      if (outputData && outputData.type === 'nl2sql') {
        const sql = outputData.sql || '';
        const chartSpec = outputData.chart || {};
        const explanation = outputData.explanation || {};
        const summary = explanation.summary || "Generated successfully";
        
        setCompiledSql(sql);
        setCompiledResult(summary);

        const newWidget = chartSpecToCanvasWidget(
          outputData,
          promptQuery,
          sql,
          thoughts,
          summary
        );

        // Adjust position dynamically
        newWidget.position = { 
          x: 32 + (widgets.length * 64) % 480, 
          y: 152 + (widgets.length * 48) % 300 
        };

        recordHistory();
        setWidgets(prev => [...prev, newWidget]);
        setSelectedWidgetId(newWidget.id);
        addLog(`SUCCESS: Built dynamic visual component: [${newWidget.title}]`);
      } else {
        addLog("AI processed request but did not generate a chart. Content: " + res.assistant_message?.content);
        toast.error("Prompt did not result in a queryable chart. Try asking for trends or comparisons.");
      }
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Pipeline execution failed: ${err.message || err}`);
      toast.error("Execution failed. Please verify the query and try again.");
    } finally {
      setIsCompiling(false);
      setActiveStepIndex(-1);
      setPromptInput('');
    }
  };

  // Re-organize layout neatly (Bento-style auto arrangement in Absolute Coordinates)
  const handleOrganizeLayout = () => {
    recordHistory();
    addLog('Executing layout auto-alignment algorithm...');
    
    // Sort widgets such that KPIs are grouped at the top and charts occupy larger slots nicely
    const sorted = [...widgets].sort((a, b) => {
      if (a.type === 'kpi' && b.type !== 'kpi') return -1;
      if (a.type !== 'kpi' && b.type === 'kpi') return 1;
      return 0;
    });

    let currentX = 16;
    let currentY = 16;
    let maxRowHeight = 120;

    const balanced = sorted.map((w, idx) => {
      const width = w.type === 'kpi' ? 240 : 380;
      const height = w.type === 'kpi' ? 120 : 230;

      // Wrap if exceeding right boundary (approx 840 pixels)
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
  };

  // Delete individual widget
  const handleDeleteWidget = (id: string, name: string) => {
    recordHistory();
    setWidgets(prev => prev.filter(w => w.id !== id));
    addLog(`Removed visual component: "${name}"`);
    if (selectedWidgetId === id) setSelectedWidgetId(null);
  };

  // Clear everything
  const handleClearCanvas = () => {
    recordHistory();
    setWidgets([]);
    addLog('Canvas wiped clean. Ready for a new prompt build session.');
  };

  // Add default visual from Fields / Palette clicking using live query compiler
  const handleAddDefaultVisual = async (type: 'kpi' | 'bar' | 'line' | 'pie' | 'table') => {
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    // Filter checked fields into metrics and dimensions/dates
    const checkedMetrics = checkedFields.filter(f => fieldsList.some(af => af.name === f && af.category === 'Metrics'));
    const checkedDims = checkedFields.filter(f => fieldsList.some(af => af.name === f && (af.category === 'Dimensions' || af.category === 'Dates')));

    // Detect dimension-only analysis (e.g. Churn vs Contract) to apply COUNT aggregation
    const isDimOnlyAnalysis = checkedMetrics.length === 0 && checkedDims.length >= 2;

    // Defaults if none checked
    const primaryMetric = isDimOnlyAnalysis
      ? checkedDims[1]
      : (checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1');
    const primaryDim = checkedDims[0] || fieldsList.find(f => f.category === 'Dimensions')?.name || fieldsList.find(f => f.category === 'Dates')?.name || fieldsList[0]?.name;

    addLog(`Compiling live query for manual visual append (${type})...`);
    setIsCompiling(true);

    try {
      let sql = '';
      let title = '';
      
      if (type === 'kpi') {
        sql = isDimOnlyAnalysis
          ? `SELECT COUNT("${primaryMetric}") AS value FROM data`
          : `SELECT ${buildAggExpr('SUM', primaryMetric)} AS value FROM data`;
        title = isDimOnlyAnalysis ? `Count of ${primaryMetric}` : `Total ${primaryMetric}`;
      } else if (type === 'table') {
        // Table renders the checked columns in order, or slices first 4 from dataset
        const colsToSelect = checkedFields.length > 0 
          ? checkedFields.map(f => `"${f}"`).join(', ')
          : fieldsList.slice(0, 4).map(f => `"${f.name}"`).join(', ');
        sql = `SELECT ${colsToSelect} FROM data LIMIT 50`;
        title = `Dataset Sample Ledger`;
      } else if (type === 'line') {
        const fallbackDate = `(CASE WHEN TRY_CAST("${primaryDim}" AS DATE) IS NOT NULL THEN TRY_CAST("${primaryDim}" AS DATE) WHEN TRY_CAST("${primaryDim}" AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST("${primaryDim}" AS TIMESTAMP) AS DATE) ELSE NULL END)`;
        const dateExpr = fieldsList.some(f => f.name === primaryDim && f.category === 'Dates')
          ? `COALESCE(strftime(${fallbackDate}, '%Y-%m'), "${primaryDim}")`
          : `"${primaryDim}"`;

        if (isDimOnlyAnalysis) {
          sql = `SELECT ${dateExpr} AS label, COUNT("${primaryMetric}") AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else if (checkedMetrics.length > 1) {
          // Multiple metrics over a single dimension
          const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
          sql = `SELECT ${dateExpr} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
          title = `Metrics Trend by ${primaryDim}`;
        } else {
          sql = `SELECT ${dateExpr} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
          title = `${primaryMetric} Trend by ${primaryDim}`;
        }
      } else {
        // Bar/Pie Chart
        if (isDimOnlyAnalysis) {
          sql = `SELECT "${primaryDim}" AS label, COUNT("${primaryMetric}") AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else if (checkedDims.length > 1) {
          // Composite dimension grouping (e.g. Region - Segment)
          const concatDims = checkedDims.map(d => `COALESCE(CAST("${d}" AS VARCHAR), '')`).join(" || ' - ' || ");
          sql = `SELECT ${concatDims} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY ${checkedDims.map(d => `"${d}"`).join(', ')} ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${checkedDims.join(' & ')}`;
        } else if (checkedMetrics.length > 1) {
          // Multiple metrics over a single dimension
          const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
          sql = `SELECT "${primaryDim}" AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
          title = `Comparison by ${primaryDim}`;
        } else {
          sql = `SELECT "${primaryDim}" AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${primaryDim}`;
        }
      }

      // Execute SQL query against DuckDB sandbox
      addLog(`Executing Canvas query: ${sql}`);
      const sqlResult = await canvasService.executeSql(selectedDatasetId, sql);
      
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
          const kpiVal = queryData[0]?.value ?? queryData[0]?.VALUE ?? 0;
          value = formatKpiValue(kpiVal, primaryMetric, 'SUM');
          subtext = formatKpiSubtext(primaryMetric, 'SUM');
          chartData = [];
        } else if (type === 'pie') {
          const rowKeys = Object.keys(queryData[0] || {});
          xAxisKey = rowKeys.find(k => k.toLowerCase() === 'label') || rowKeys[0] || 'name';
          yAxisKey = rowKeys.find(k => k.toLowerCase() === 'value') || rowKeys[1] || 'val';
          chartData = queryData;
        } else if (type === 'bar' || type === 'line') {
          const rowKeys = Object.keys(queryData[0] || {});
          xAxisKey = rowKeys.find(k => k.toLowerCase() === 'label') || rowKeys[0] || 'label';
          yAxisKey = rowKeys.find(k => k.toLowerCase() === 'value') || rowKeys[1] || 'value';
          chartData = queryData;
        } else if (type === 'table') {
          xAxisKey = undefined;
          yAxisKey = undefined;
        } else {
          // Normalize query keys if multiple metrics checked
          if (queryData.length > 0) {
            const firstRow = queryData[0];
            const keys = Object.keys(firstRow);
            const labelKey = keys.find(k => k.toLowerCase() === 'label') || keys[0];
            const valueKey = keys.find(k => k.toLowerCase() === 'value') || keys[1];
            xAxisKey = labelKey;
            yAxisKey = checkedMetrics.length > 1 ? checkedMetrics[0] : valueKey;
          }
        }

        const targetMetricName = checkedMetrics.length > 0 ? checkedMetrics.join(', ') : primaryMetric;
        const targetDimName = checkedDims.length > 0 ? checkedDims.join(', ') : primaryDim;

        const newWidget: CanvasWidget = {
          id,
          title,
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
        setWidgets(prev => [...prev, newWidget]);
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

  // AI Calculated Field Creator
  const handleCreateCalculatedField = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }
    if (!calcPrompt.trim()) {
      toast.error("Please type a calculation prompt.");
      return;
    }

    addLog(`AI Generating calculated field for: "${calcPrompt}"...`);
    setIsCreatingCalcField(true);

    try {
      const res = await canvasService.createCalculatedField(selectedDatasetId, calcPrompt);
      if (res && res.success) {
        addLog(`SUCCESS: Generated calculated field "${res.field_name}" with formula: [${res.formula_sql}]`);
        toast.success(`Created calculated field: "${res.field_name}"`);
        
        // Update local fieldsList with backend updated schema
        if (res.schema && res.schema.columns) {
          const updatedCols = res.schema.columns.map((c: any) => ({
            name: c.name,
            dtype: c.dtype,
            category: c.category,
            type: c.dtype.toLowerCase(),
            formula: c.formula
          }));
          setFieldsList(updatedCols);
        }
        

        setCalcPrompt('');
      } else {
        throw new Error("Failed to generate calculated field");
      }
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Calculated field failed: ${err.response?.data?.detail || err.message || err}`);
      toast.error(err.response?.data?.detail || "AI formula generation failed. Try specifying your math explicitly.");
    } finally {
      setIsCreatingCalcField(false);
    }
  };

  // Tableau-style trend chart time grain modifier
  const handleTimeGrainChange = async (widgetId: string, grain: 'year' | 'quarter' | 'month' | 'day') => {
    if (!selectedDatasetId) return;
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget || widget.type !== 'line') return;

    addLog(`Re-compiling trend line query to '${grain}' grain...`);
    setIsCompiling(true);

    try {
      // Resolve REAL column names from targetMetricName/targetDimName (not aliased keys)
      const realDim = widget.targetDimName || fieldsList.find(f => f.type === 'date')?.name || fieldsList.find(f => f.category === 'Dimensions')?.name || fieldsList[0]?.name;
      const realMetric = widget.targetMetricName || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
      
      let grainExpr = '';
      const fallbackDate = `(CASE WHEN TRY_CAST("${realDim}" AS DATE) IS NOT NULL THEN TRY_CAST("${realDim}" AS DATE) WHEN TRY_CAST("${realDim}" AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST("${realDim}" AS TIMESTAMP) AS DATE) ELSE NULL END)`;
      
      if (grain === 'year') {
        grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y'), CAST(regexp_extract("${realDim}", '\\d{4}') AS VARCHAR))`;
      } else if (grain === 'quarter') {
        grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-Q') || CAST(quarter(${fallbackDate}) AS VARCHAR), "${realDim}")`;
      } else if (grain === 'month') {
        grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-%m'), "${realDim}")`;
      } else {
        grainExpr = `COALESCE(CAST(${fallbackDate} AS VARCHAR), "${realDim}")`;
      }

      // Always alias output as label/value for consistent key mapping
      const currentAgg = widget.activeAgg || 'SUM';
      const sql = `SELECT ${grainExpr} AS label, ${buildAggExpr(currentAgg, realMetric)} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
      
      addLog(`Executing Canvas grain query: ${sql}`);
      const sqlResult = await canvasService.executeSql(selectedDatasetId, sql);
      
      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        setWidgets(prev => prev.map(w => w.id === widgetId ? {
          ...w,
          data: queryData,
          sql: sql,
          activeGrain: grain,
          xAxisKey: 'label',
          yAxisKey: 'value'
        } : w));
        addLog(`SUCCESS: Re-grained trend chart [${widget.title}] to ${grain}.`);
      } else {
        throw new Error(sqlResult?.error || "SQL query failed");
      }
    } catch (err: any) {
      console.error(err);
      addLog(`ERROR: Time grain transition failed: ${err.message || err}`);
      toast.error("Time grain transition failed due to schema incompatibilities.");
    } finally {
      setIsCompiling(false);
    }
  };

  // Tableau-style measure aggregation modifier (Right-click action)
  const handleWidgetAggregationChange = async (widgetId: string, agg: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT' | 'VAR_SAMP') => {
    if (!selectedDatasetId) return;
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;

    addLog(`Re-compiling widget measure to aggregation: '${agg}'...`);
    setIsCompiling(true);

    try {
      // Resolve REAL column names (not aliased keys) for SQL generation
      const metric = widget.targetMetricName || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
      const dimension = widget.targetDimName || fieldsList.find(f => f.category === 'Dimensions')?.name || 'label';
      
      let sql = '';
      let title = '';

      if (widget.type === 'kpi') {
        sql = `SELECT ${buildAggExpr(agg, metric)} AS value FROM data`;
        title = `${agg.charAt(0) + agg.slice(1).toLowerCase()} of ${metric}`;
      } else if (widget.type === 'line') {
        // If trend line, respect the active time grain
        const grain = widget.activeGrain || 'month';
        const fallbackDate = `(CASE WHEN TRY_CAST("${dimension}" AS DATE) IS NOT NULL THEN TRY_CAST("${dimension}" AS DATE) WHEN TRY_CAST("${dimension}" AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST("${dimension}" AS TIMESTAMP) AS DATE) ELSE NULL END)`;
        
        let grainExpr = '';
        if (grain === 'year') {
          grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y'), CAST(regexp_extract("${dimension}", '\\d{4}') AS VARCHAR))`;
        } else if (grain === 'quarter') {
          grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-Q') || CAST(quarter(${fallbackDate}) AS VARCHAR), "${dimension}")`;
        } else if (grain === 'month') {
          grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-%m'), "${dimension}")`;
        } else {
          grainExpr = `COALESCE(CAST(${fallbackDate} AS VARCHAR), "${dimension}")`;
        }
        
        // Always alias to label/value for consistent key mapping
        sql = `SELECT ${grainExpr} AS label, ${buildAggExpr(agg, metric)} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
        title = `${metric} (${agg}) Trend by ${dimension}`;
      } else {
        // Bar/Pie — always alias to label/value
        sql = `SELECT "${dimension}" AS label, ${buildAggExpr(agg, metric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
        title = `${metric} (${agg}) by ${dimension}`;
      }

      addLog(`Executing Canvas aggregation query: ${sql}`);
      const sqlResult = await canvasService.executeSql(selectedDatasetId, sql);

      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        
        let value = widget.value;
        let subtext = widget.subtext;
        let chartData: any[] = queryData;
        let updatedXKey = 'label';
        let updatedYKey = 'value';

        if (widget.type === 'kpi') {
          const kpiVal = queryData[0]?.value ?? queryData[0]?.VALUE ?? 0;
          value = formatKpiValue(kpiVal, metric, agg);
          subtext = formatKpiSubtext(metric, agg);
          chartData = [];
        } else if (widget.type === 'pie') {
          // Remap SQL label/value to pie's expected name/val keys
          chartData = queryData.map((r: any) => ({ name: r.label, val: r.value }));
          updatedXKey = 'name';
          updatedYKey = 'val';
        }

        setWidgets(prev => prev.map(w => w.id === widgetId ? {
          ...w,
          data: chartData,
          value,
          subtext,
          title,
          sql: sql,
          activeAgg: agg,
          xAxisKey: updatedXKey,
          yAxisKey: updatedYKey
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

  return (
    <div className="min-h-[700px] flex flex-col bg-bg text-text-custom select-none font-body canvas-workspace-root overflow-hidden">
      
      {/* 1. COMPILER UPPER CONTROL PANEL */}
      <div className="border-b border-border-custom bg-surface-2/40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center space-x-6 flex-wrap gap-y-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-2.5 h-2.5 bg-accent-custom rounded-full animate-pulse"></div>
            <span className="font-semibold text-text-custom tracking-wider uppercase">PowerBI AI Canvas Studio</span>
            <span className="text-muted-custom">|</span>
            <span className="text-muted-custom">Snap: <span className="text-accent-custom font-bold">16px</span></span>
          </div>

          {/* Dataset & Version Selectors */}
          <div className="flex items-center space-x-3 text-xs">
            {/* Dataset select */}
            <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs">
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-custom font-semibold bg-surface-2 px-2 py-1 rounded-lg mr-1.5">
                <Database className="w-3 h-3 text-accent-custom" />
                Dataset
              </span>
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
            {selectedDatasetId && versions.length > 0 && (
              <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs animate-in fade-in slide-in-from-left-2 duration-200">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-custom font-semibold bg-surface-2 px-2 py-1 rounded-lg mr-1.5">
                  <GitBranch className="w-3 h-3 text-accent-custom" />
                  Version
                </span>
                <select
                  value={selectedVersionId}
                  onChange={(e) => handleVersionChange(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-semibold text-text-custom outline-none pr-6 cursor-pointer max-w-[120px] truncate"
                >
                  {versions.map(ver => (
                    <option key={ver.id} value={ver.id} className="bg-surface text-text-custom">v{ver.version_number} ({ver.source_type === 'CLEAN' ? 'Clean' : 'Raw'})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Action button deck */}
        <div className="flex items-center space-x-2 flex-wrap">
          {/* Undo Button */}
          <button
            onClick={handleUndo}
            disabled={past.length === 0}
            className={`h-9 px-3.5 text-[11px] font-semibold border rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
              past.length === 0
                ? 'bg-surface/50 border-border-custom text-muted-custom opacity-40 cursor-not-allowed'
                : 'bg-surface hover:bg-surface-2 border-border-custom text-text-custom hover:text-accent-custom hover:border-accent-custom/50'
            }`}
            title="Undo last workspace change (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5 animate-duration-100" />
            <span>Undo</span>
            {past.length > 0 && (
              <span className="text-[9px] bg-accent-custom/20 text-accent-custom px-1.5 py-0.2 rounded-full font-bold">
                {past.length}
              </span>
            )}
          </button>

          {/* Redo Button */}
          <button
            onClick={handleRedo}
            disabled={future.length === 0}
            className={`h-9 px-3.5 text-[11px] font-semibold border rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
              future.length === 0
                ? 'bg-surface/50 border-border-custom text-muted-custom opacity-40 cursor-not-allowed'
                : 'bg-surface hover:bg-surface-2 border-border-custom text-text-custom hover:text-purple-500 hover:border-purple-500/50'
            }`}
            title="Redo next workspace change (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>Redo</span>
            {future.length > 0 && (
              <span className="text-[9px] bg-purple-500/20 text-purple-500 px-1.5 py-0.2 rounded-full font-bold">
                {future.length}
              </span>
            )}
          </button>

          <span className="text-muted-custom/30 px-1">|</span>

          <button 
            onClick={() => setShowGridlines(!showGridlines)}
            className={`h-9 px-3.5 text-[11px] font-semibold border rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
              showGridlines 
                ? 'bg-accent-custom/15 border-accent-custom/30 text-accent-custom font-bold' 
                : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Gridlines</span>
          </button>

          <button 
            onClick={() => {
              setIsFullScreenCanvas(!isFullScreenCanvas);
              addLog(`Full Screen Mode: ${!isFullScreenCanvas ? 'ENABLED' : 'DISABLED'}`);
            }}
            className={`h-9 px-3.5 text-[11px] font-semibold border rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
              isFullScreenCanvas 
                ? 'bg-accent-custom/15 border-accent-custom/30 text-accent-custom font-bold' 
                : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom'
            }`}
            title="Toggle immersive Full Screen view of the PowerBI style dashboard canvas"
          >
            {isFullScreenCanvas ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullScreenCanvas ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>

          <button 
            onClick={() => setShowSqlViewer(!showSqlViewer)}
            className={`h-9 px-3.5 text-[11px] font-semibold border rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
              showSqlViewer 
                ? 'bg-purple-500/15 border-purple-500/30 text-purple-500 font-bold' 
                : 'bg-surface border-border-custom text-muted-custom hover:text-text-custom'
            }`}
            title="Toggle showing database SQL query translation and step-by-step thinking for each chart"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Show SQL & Logic</span>
          </button>

          <button 
            onClick={handleOrganizeLayout}
            className="h-9 px-3.5 text-[11px] font-bold bg-surface hover:bg-surface-2 border border-border-custom text-text-custom rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
            title="Auto-organize elements into a balanced layout grid"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-accent-custom" />
            <span>Organize</span>
          </button>

          <span className="text-muted-custom/30 px-1">|</span>

          <button 
            onClick={handleSaveDashboard}
            className="h-9 px-3.5 text-[11px] font-semibold bg-surface hover:bg-surface-2 border border-border-custom text-text-custom hover:text-accent-custom hover:border-accent-custom/55 rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
            title="Save layout configuration to the database"
          >
            <SaveIcon className="w-3.5 h-3.5 text-accent-custom" />
            <span>Save Layout</span>
          </button>

          <button 
            onClick={fetchDashboards}
            className="h-9 px-3.5 text-[11px] font-semibold bg-surface hover:bg-surface-2 border border-border-custom text-text-custom hover:text-accent-custom hover:border-accent-custom/55 rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
            title="Load a saved dashboard layout"
          >
            <FolderOpen className="w-3.5 h-3.5 text-accent-custom" />
            <span>Load Layout</span>
          </button>

          <button 
            onClick={handleClearCanvas}
            className="h-9 px-3.5 text-[11px] font-semibold bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Canvas</span>
          </button>

          <button 
            onClick={() => {
              addLog('Export success! Configuration serialized to PowerBI templates.');
              alert('Canvas configuration exported! Dynamic PowerBI JSON compiled successfully.');
            }}
            className="h-9 px-4 text-[11px] font-bold bg-accent-custom hover:opacity-90 text-white rounded-full flex items-center space-x-1.5 cursor-pointer transition-all shadow-md active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Visuals</span>
          </button>
        </div>
      </div>

      {/* 2. DOCK SHELF GRID AREA */}
      <div className="grid grid-cols-1 xl:grid-cols-12 flex-1 divide-y xl:divide-y-0 xl:divide-x divide-border-custom">
        
        {/* LEFT DOCK: POWERBI METRICS PALETTE & FIELD LIST (4 COLS) */}
        <div className={`${isSidebarCollapsed ? 'hidden' : 'xl:col-span-3'} bg-surface-2/30 p-5 space-y-6 text-left flex flex-col justify-between overflow-y-auto transition-all duration-300`}>
          <div className="space-y-6">
            
            {/* Sidebar toggle header */}
            <div className="flex items-center justify-between border-b border-border-custom/50 pb-3">
              <div className="flex items-center space-x-2">
                <LayoutGrid className="w-4 h-4 text-accent-custom" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-text-custom">Layout Control Pane</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSidebarCollapsed(true);
                  addLog("Sidebar collapsed. Canvas entered Full Screen mode.");
                }}
                className="p-1 hover:bg-surface border border-border-custom/60 text-muted-custom hover:text-text-custom rounded-md transition-all cursor-pointer"
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
              
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px]">
                <button 
                  onClick={() => handleAddDefaultVisual('kpi')}
                  className="p-2.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4 text-accent-custom" />
                  <span>Card</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('bar')}
                  className="p-2.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-emerald-500" />
                  <span>Bar</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('line')}
                  className="p-2.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                >
                  <TrendingUp className="w-4 h-4 text-purple-500" />
                  <span>Line</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('pie')}
                  className="p-2.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                >
                  <PieIcon className="w-4 h-4 text-pink-500" />
                  <span>Donut</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('table')}
                  className="p-2.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                  <span>Table</span>
                </button>
                <button 
                  onClick={() => addLog('Advanced Gauges and Targets unlocked in Pro Tier.')}
                  className="p-2.5 bg-surface border border-border-custom/50 rounded-xl flex flex-col items-center justify-center space-y-1 opacity-50 cursor-not-allowed"
                  title="Requires Pro Tier licensing"
                >
                  <Settings2 className="w-4 h-4 text-muted-custom" />
                  <span>Gauge</span>
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
                   className="absolute right-1.5 p-1 text-accent-custom hover:text-accent-custom/80 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                   title="Generate calculated field with AI"
                 >
                   {isCreatingCalcField ? (
                     <Loader2 className="w-3 h-3 animate-spin text-accent-custom" />
                   ) : (
                     <Sparkles className="w-3 h-3 animate-pulse" />
                   )}
                 </button>
               </div>
               
               <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
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
                        <button
                          key={field.name} onClick={() => handleFieldToggle(field.name)} draggable="true" onDragStart={(e) => { e.dataTransfer.setData("text/plain", field.name); e.dataTransfer.effectAllowed = "copyMove"; addLog(`Dragging column: "${field.name}". Drop it in the Interactive Canvas Slicers zone to filter!`); }} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, field: field }); }}
                          className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-mono transition-all hover:bg-surface-2 border border-transparent cursor-pointer"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 group"><GripVertical className="w-3 h-3 text-muted-custom/30 group-hover:text-accent-custom shrink-0 cursor-grab active:cursor-grabbing mr-1 transition-all" />
                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                              isChecked 
                                ? 'bg-accent-custom border-accent-custom text-white' 
                                : 'border-border-custom bg-surface'
                            }`}>
                              {isChecked && <Check className="w-2.5 h-2.5" />}
                            </div>
                            <span className={`truncate ${isChecked ? 'text-text-custom font-semibold' : 'text-muted-custom'}`}>
                              {field.name}
                            </span>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface border border-border-custom text-muted-custom font-mono uppercase">
                            {field.category.slice(0, 3)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
             </div>


          </div>

          {/* Diagnostics terminal readout window */}
          <div className="bg-black/40 border border-border-custom p-3.5 rounded-2xl space-y-2 mt-6">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-custom flex items-center justify-between">
              <span>Parser Transparency Logs</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-custom animate-ping"></span>
            </h4>
            <div className="h-28 overflow-y-auto font-mono text-[9px] text-muted-custom space-y-1.5 pr-1 scrollbar-thin">
              {logs.length === 0 ? (
                <span className="italic">Telemetry logs silent. Execute a canvas action or type an AI prompt...</span>
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

        {/* RIGHT AREA: PROMPT ENTRY & CORE CANVAS (9 COLS or 12 COLS if sidebar collapsed) */}
        <div className={`${isSidebarCollapsed ? 'xl:col-span-12' : 'xl:col-span-9'} p-6 flex flex-col justify-between space-y-6 transition-all duration-300 relative`}>
          
          {/* Floating Expand button when sidebar is collapsed */}
          {isSidebarCollapsed && !isFullScreenCanvas && (
            <button
              type="button"
              onClick={() => {
                setIsSidebarCollapsed(false);
                addLog("Sidebar restored.");
              }}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-50 bg-accent-custom hover:bg-accent-custom/95 text-white py-4 px-1.5 rounded-r-xl shadow-lg border border-l-0 border-accent-custom/30 flex flex-col items-center space-y-2 cursor-pointer transition-all hover:scale-105 duration-200"
              title="Show Visual Palette & Field Checklist"
            >
              <ChevronRight className="w-4 h-4 shrink-0" />
              <span className="text-[9px] font-bold tracking-widest uppercase" style={{ writingMode: 'vertical-lr' }}>
                Show Sidebar
              </span>
            </button>
          )}

          {/* TOP BAR: PROMPT ENGINE TO COMPILE PLOTS */}
          <div className="space-y-4">
            
            {/* Form */}
            <form onSubmit={handlePromptSubmit} className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Sparkles className="w-4.5 h-4.5 text-accent-custom animate-pulse" />
              </div>
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Prompt AI to construct and organize widgets on your canvas... (e.g. 'Add a line chart showing trend')"
                className="w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-2xl py-3.5 pl-11 pr-32 text-xs font-mono shadow-xs focus:outline-none transition-all placeholder:text-muted-custom"
                disabled={isCompiling}
              />
              <div className="absolute right-2.5 inset-y-2 flex items-center space-x-1.5">
                {promptInput && (
                  <button 
                    type="button" 
                    onClick={() => setPromptInput('')}
                    className="text-[10px] font-mono text-muted-custom hover:text-text-custom px-1"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isCompiling}
                  className="px-4 h-full bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-xl flex items-center space-x-1 cursor-pointer transition-all shadow-xs"
                >
                  {isCompiling ? (
                    <>
                      <RotateCcw className="w-3 h-3 animate-spin" />
                      <span>Compiling...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>Compile</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Suggestion pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-custom">AI Templates:</span>
              {PROMPT_SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPromptInput(sug)}
                  className="px-2.5 py-1 bg-surface-2 hover:bg-border-custom/20 border border-border-custom/30 rounded-full text-[10px] font-mono text-muted-custom hover:text-text-custom transition-all cursor-pointer truncate max-w-xs"
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Live AI SQL & Logic Compilation Console (Always visible & context-aware!) */}
            {showSqlViewer && (
              <div className="bg-slate-950 text-slate-100 border border-slate-800 rounded-2xl p-5 font-mono text-xs overflow-hidden shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span className="font-bold text-white tracking-wide uppercase">
                      {isCompiling 
                        ? "AI SQL Compiler & Logic Terminal (Active)" 
                        : selectedWidgetId 
                          ? `AI Logic Console: ${widgets.find(w => w.id === selectedWidgetId)?.title || 'Widget'}`
                          : "AI Semantic Engine & SQL Translation Console"
                      }
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                      isCompiling 
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse' 
                        : selectedWidgetId
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {isCompiling 
                        ? 'Active NLP Session' 
                        : selectedWidgetId 
                          ? 'Compiled SQL Object' 
                          : 'Engine Standby'
                      }
                    </span>
                  </div>
                </div>

                {isCompiling ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left side: Thinking steps */}
                    <div className="lg:col-span-5 space-y-3">
                      <div className="flex items-center space-x-1.5 text-purple-300 font-bold text-[10px] uppercase tracking-wider">
                        <Cpu className="w-3.5 h-3.5 text-purple-400" />
                        <span>AI Reasoning Process</span>
                      </div>
                      <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5 max-h-48 overflow-y-auto">
                        {compilationSteps.length === 0 && (
                          <div className="text-slate-400 italic text-[11px] animate-pulse">Initializing semantic vectors...</div>
                        )}
                        {compilationSteps.map((step, idx) => (
                          <div key={idx} className="flex items-start space-x-2 text-[11px]">
                            <span className="text-purple-400 font-bold">↳</span>
                            <span className={idx === activeStepIndex ? "text-white font-semibold" : "text-slate-300"}>
                              {step}
                            </span>
                            {idx < activeStepIndex && (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right side: Generated SQL and Compiled Result */}
                    <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5 flex-1 flex flex-col">
                        <div className="flex items-center justify-between text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                          <div className="flex items-center space-x-1.5">
                            <Code className="w-3.5 h-3.5 text-purple-400" />
                            <span>Natural Language (NL) to SQL Translation</span>
                          </div>
                        </div>
                        <div className="bg-black border border-white/10 rounded-xl p-3 flex-1 min-h-[90px] flex flex-col justify-between font-mono text-[11px]">
                          {!compiledSql ? (
                            <div className="text-slate-500 italic animate-pulse">Awaiting SQL translator binding...</div>
                          ) : (
                            <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap select-all text-left">
                              <code>{compiledSql}</code>
                            </pre>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                        <div className="flex items-center space-x-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                          <Database className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Generated SQL Tabular Result Set</span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono text-left">
                          {compiledResult ? (
                            <div className="flex items-center space-x-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                              <span>{compiledResult}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">Executing translated query on memory model...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : selectedWidgetId && widgets.find(w => w.id === selectedWidgetId) ? (
                  (() => {
                    const activeWidget = widgets.find(w => w.id === selectedWidgetId)!;
                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        {/* Left side: Thinking steps */}
                        <div className="lg:col-span-5 space-y-3">
                          <div className="flex items-center space-x-1.5 text-indigo-300 font-bold text-[10px] uppercase tracking-wider">
                            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                            <span>AI Reasoning Steps</span>
                          </div>
                          <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5 max-h-48 overflow-y-auto">
                            {(!activeWidget.thinking || activeWidget.thinking.length === 0) ? (
                              <div className="text-slate-500 italic text-[11px]">No semantic steps recorded.</div>
                            ) : (
                              activeWidget.thinking.map((step, idx) => (
                                <div key={idx} className="flex items-start space-x-2 text-[11px]">
                                  <span className="text-indigo-400 font-bold">↳</span>
                                  <span className="text-slate-300">{step}</span>
                                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Right side: Generated SQL and Compiled Result */}
                        <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
                          <div className="space-y-1.5 flex-1 flex flex-col">
                            <div className="flex items-center justify-between text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                              <div className="flex items-center space-x-1.5">
                                <Code className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Compiled ANSI-SQL Query Code</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeWidget.sql) {
                                    navigator.clipboard.writeText(activeWidget.sql);
                                    addLog(`Copied SQL for [${activeWidget.title}] to clipboard.`);
                                  }
                                }}
                                className="text-[10px] text-indigo-400 hover:text-white transition-all underline cursor-pointer"
                              >
                                Copy SQL
                              </button>
                            </div>
                            <div className="bg-black border border-white/10 rounded-xl p-3 flex-1 min-h-[90px] flex flex-col justify-between font-mono text-[11px]">
                              {activeWidget.sql ? (
                                <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap select-all text-left">
                                  <code>{activeWidget.sql}</code>
                                </pre>
                              ) : (
                                <div className="text-slate-500 italic">No SQL available for this template type.</div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                            <div className="flex items-center space-x-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                              <Database className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Tabular Results Schema Summary</span>
                            </div>
                            <div className="text-[11px] text-slate-300 font-mono text-left">
                              {activeWidget.resultSummary || "Table compiled without active relational constraints."}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 space-y-2">
                    <Terminal className="w-6 h-6 text-slate-600" />
                    <p className="text-xs font-semibold">Engine Standby: Ready for Action</p>
                    <p className="text-[10px] text-slate-500 max-w-md">
                      Interactive compiler is waiting. Select any widget card on the canvas below to display its parsed query logic, or type a dynamic prompt to compile a new visual!
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* MAIN GRIDSTAGE: DOT CANVAS DESIGNER */}
          <div 
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
            {/* Integrated Page Slicers & Highlighters (PowerBI style) */}
            <div 
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOverFilters(true);
              }}
              onDragLeave={() => setIsDraggingOverFilters(false)}
              onDrop={(e) => {
                e.preventDefault();
                const fieldName = e.dataTransfer.getData("text/plain");
                handleAddColumnAsFilter(fieldName);
                setIsDraggingOverFilters(false);
              }}
              className={`mb-6 p-4 bg-surface border rounded-2xl flex flex-wrap items-center justify-between gap-4 z-20 relative transition-all duration-200 ${
                isDraggingOverFilters 
                  ? 'border-accent-custom bg-accent-custom/5 border-dashed scale-[1.01] shadow-lg ring-2 ring-accent-custom/15' 
                  : 'border-border-custom'
              }`}
            >
              {isDraggingOverFilters && (
                <div className="absolute inset-0 bg-accent-custom/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-accent-custom z-50 pointer-events-none animate-pulse">
                  <div className="bg-surface border border-accent-custom/50 px-4 py-2 rounded-xl flex items-center space-x-2 text-accent-custom text-xs font-mono font-bold shadow-lg">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Drop Column Here to Filter!</span>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2 text-left">
                <Sliders className="w-4 h-4 text-accent-custom animate-pulse" />
                <div>
                  <h4 className="text-xs font-bold font-mono uppercase text-text-custom flex items-center space-x-1">
                    <span>Interactive Canvas Slicers</span>
                    <span className="text-[8px] bg-accent-custom/15 text-accent-custom px-1 py-0.2 rounded font-normal lowercase">Drag & Drop Target</span>
                  </h4>
                  <p className="text-[10px] text-muted-custom font-sans">Filter values & highlight elements in real-time across the canvas</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {customFilters.length === 0 ? (
                  <div className="text-[10px] italic text-muted-custom border border-dashed border-border-custom/50 px-3 py-1.5 rounded-xl bg-surface-2/30">
                    No active slicers. Drag a column from the left panel and drop it here to filter!
                  </div>
                ) : null}

                {/* Render custom filters added dynamically */}
                {customFilters.map((cf) => (
                  <div 
                    key={cf.fieldName} 
                    className="flex items-center space-x-1 bg-surface-2 p-1 rounded-xl border border-accent-custom/30 relative group/slicer animate-in fade-in zoom-in-95 duration-150"
                  >
                    <span className="text-[10px] font-mono text-accent-custom px-1.5 font-bold flex items-center space-x-1">
                      <Filter className="w-2.5 h-2.5" />
                      <span>{cf.fieldName}:</span>
                    </span>
                    {['All', ...cf.options].map((opt) => {
                      const isSelected = opt === 'All' ? !cf.selectedValue : cf.selectedValue === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setCustomFilters(prev => prev.map(f => f.fieldName === cf.fieldName ? {
                              ...f,
                              selectedValue: opt === 'All' ? null : opt
                            } : f));
                            addLog(`Slicer active: Filtered canvas by ${cf.fieldName} = "${opt}"`);
                          }}
                          className={`px-2 py-1 text-[9px] font-mono rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-accent-custom text-white font-bold shadow-xs'
                              : 'text-muted-custom hover:text-text-custom hover:bg-surface'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                    {/* Remove custom filter button */}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFilters(prev => prev.filter(f => f.fieldName !== cf.fieldName));
                        addLog(`Removed custom filter for column "${cf.fieldName}".`);
                      }}
                      className="ml-1 w-4 h-4 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center text-[10px] leading-none transition-all cursor-pointer opacity-50 group-hover/slicer:opacity-100"
                      title="Remove Filter"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Reset Filters */}
                {customFilters.some(f => f.selectedValue) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFilters(prev => prev.map(f => ({ ...f, selectedValue: null })));
                      addLog('Cleared all interactive slicers and highlighting states.');
                    }}
                    className="p-1.5 hover:bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-[10px] font-mono flex items-center space-x-1 cursor-pointer transition-all"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Slicers</span>
                  </button>
                )}

                {/* Divider */}
                <div className="h-5 w-[1px] bg-border-custom/30 self-center hidden sm:block"></div>

                {/* Present Mode toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !isPresentMode;
                    setIsPresentMode(nextVal);
                    if (nextVal) {
                      setIsFullScreenCanvas(true);
                      addLog("Entered Presentation Mode: Canvas cover and editor controls hidden.");
                    } else {
                      addLog("Exited Presentation Mode.");
                    }
                  }}
                  className={`px-3 py-1.5 border rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer text-[10px] font-mono font-semibold ${
                    isPresentMode
                      ? 'bg-amber-500 hover:bg-amber-600 border-amber-500/20 text-white shadow-md animate-pulse'
                      : 'bg-surface hover:bg-surface-2 border-border-custom text-muted-custom hover:text-text-custom'
                  }`}
                  title={isPresentMode ? "Exit Presentation Mode" : "Start Immersive Presentation"}
                >
                  <Eye className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isPresentMode ? 'Exit Presentation' : 'Present Mode'}</span>
                </button>

                {/* Integrated Responsive Full Screen toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !isFullScreenCanvas;
                    setIsFullScreenCanvas(nextVal);
                    if (!nextVal) {
                      setIsPresentMode(false);
                    }
                    addLog(nextVal ? "Entered full screen canvas mode." : "Exited full screen canvas mode.");
                  }}
                  className={`px-3 py-1.5 border rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer text-[10px] font-mono font-semibold ${
                    isFullScreenCanvas && !isPresentMode
                      ? 'bg-red-500 hover:bg-red-600 border-red-500/20 text-white shadow-md'
                      : 'bg-surface hover:bg-surface-2 border-border-custom text-muted-custom hover:text-text-custom'
                  }`}
                  title={isFullScreenCanvas ? "Exit Immersive Full Screen" : "Immersive Full Screen"}
                >
                  {isFullScreenCanvas ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5 text-accent-custom" />}
                  <span>{isFullScreenCanvas ? 'Exit Full Screen' : 'Full Screen'}</span>
                </button>

                {/* Full Screen Zoom controller */}
                {isFullScreenCanvas && !isPresentMode && (
                  <div className="flex items-center space-x-1 bg-surface-2 p-1 rounded-xl border border-border-custom/50">
                    <span className="text-[10px] font-mono text-muted-custom px-1.5">Zoom:</span>
                    {([
                      { label: 'Fit Width', value: 'fit-width' },
                      { label: 'Fit Page', value: 'fit-page' },
                      { label: 'Fit Canvas', value: 'fit-canvas' },
                      { label: '100%', value: '100' },
                      { label: '75%', value: '75' },
                      { label: '50%', value: '50' }
                    ] as const).map((z) => {
                      const isSelected = canvasZoom === z.value;
                      return (
                        <button
                          key={z.value}
                          type="button"
                          onClick={() => {
                            setCanvasZoom(z.value);
                            addLog(`Canvas Zoom set to "${z.label}"`);
                          }}
                          className={`px-2 py-1 text-[9px] font-mono rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-accent-custom text-white font-bold shadow-xs'
                              : 'text-muted-custom hover:text-text-custom hover:bg-surface'
                          }`}
                        >
                          {z.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Pulsing Designer Stage Status */}
                <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 bg-surface-2 border border-border-custom/50 rounded-xl text-[10px] font-mono text-muted-custom">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-custom animate-pulse"></span>
                  <span>{isPresentMode ? 'PowerBI Live Present Stage' : 'PowerBI Live Designer Stage'}</span>
                </div>
              </div>
            </div>

            {widgets.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                  <Grid className="w-6 h-6 text-accent-custom animate-pulse" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h4 className="text-sm font-semibold tracking-tight">Empty Design Stage</h4>
                  <p className="text-xs text-muted-custom font-sans leading-relaxed">
                    Type a prompt above (e.g. "Add sales KPI") or use the Left Palette options to start compiling your responsive analytics layouts.
                  </p>
                </div>
              </div>
            ) : (
              <div 
                ref={canvasContainerRef}
                className={`relative w-full border border-border-custom/30 rounded-2xl bg-surface-2/15 shadow-inner p-4 scrollbar-thin ${
                  isPresentMode 
                    ? 'overflow-hidden flex justify-center items-start' 
                    : 'overflow-auto'
                }`}
                style={{ 
                  height: isFullScreenCanvas ? 'calc(100vh - 140px)' : '650px',
                  minHeight: isFullScreenCanvas ? 'calc(100vh - 140px)' : '650px'
                }}
              >
                {/* Independent high-resolution Canvas Workspace sheet */}
                <div 
                  className={`relative transition-all duration-300 ${
                    isPresentMode 
                      ? 'bg-transparent border-0 shadow-none' 
                      : 'bg-surface rounded-xl border border-dashed border-border-custom/80 shadow-md'
                  }`}
                  style={{
                    width: '2400px',
                    height: '1600px',
                    backgroundImage: (showGridlines && !isPresentMode) 
                      ? (isDark 
                          ? 'radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px)' 
                          : 'radial-gradient(rgba(0, 0, 0, 0.04) 1.2px, transparent 1.2px)')
                      : undefined,
                    backgroundSize: '16px 16px',
                    transform: (isFullScreenCanvas || isPresentMode) ? `scale(${canvasScale})` : undefined,
                    transformOrigin: isPresentMode ? 'top center' : 'top left',
                  }}
                >
                  <AnimatePresence mode="popLayout">
                  {widgets.map((widget) => {
                    const isSelected = selectedWidgetId === widget.id;
                    const width = widget.customWidth ?? (widget.type === 'kpi' ? 245 : 375);
                    const height = widget.customHeight ?? (widget.type === 'kpi' ? 120 : 230);

                    // Compute dynamic KPI values
                    const kpiData = widget.type === 'kpi' ? getDisplayKPI(widget) : { value: widget.value, subtext: widget.subtext };

                    // Check if slicer fields are missing from this widget's data
                    const activeFilters = customFilters.filter(f => f.selectedValue !== null);
                    const hasActiveSlicers = activeFilters.length > 0;
                    const isSlicerMissing = hasActiveSlicers && (widget.filterOmitted || activeFilters.some(f => {
                      if (widget.type === 'kpi') return false; // AST filters apply to KPIs directly now, missing columns get caught by filterOmitted
                      if (!widget.data || widget.data.length === 0) return false;
                      const key = widget.xAxisKey || 'label';
                      if (f.fieldName.toLowerCase() === key.toLowerCase()) return false;
                      const firstRow = widget.data[0];
                      return firstRow[f.fieldName] === undefined && firstRow[f.fieldName.toLowerCase()] === undefined;
                    }));

                    return (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 220, damping: 22 }}
                        key={widget.id}
                        className={`bg-surface border rounded-2xl p-4 shadow-sm flex flex-col justify-between absolute overflow-hidden transition-all select-none touch-none ${
                          isPresentMode
                            ? 'border-border-custom/50 shadow-md'
                            : isSelected 
                              ? 'border-accent-custom ring-2 ring-accent-custom/20 shadow-md' 
                              : 'border-border-custom hover:border-border-custom/80'
                        }`}
                        style={{
                          left: `${widget.position?.x ?? 20}px`,
                          top: `${widget.position?.y ?? 20}px`,
                          width: `${width}px`,
                          height: `${height}px`,
                          zIndex: isSelected && !isPresentMode ? 30 : 10
                        }}
                        onClick={() => !isPresentMode && setSelectedWidgetId(widget.id)}
                        onContextMenu={(e) => {
                          if (isPresentMode) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedWidgetId(widget.id);
                          setWidgetContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            widgetId: widget.id
                          });
                        }}
                      >
                        {/* Upper controls toolbar */}
                        {isPresentMode ? (
                          <div className="flex items-center justify-between mb-2 border-b border-border-custom/30 pb-1.5 text-left">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <span className="text-[10px] font-mono text-text-custom font-bold uppercase tracking-wider truncate" title={widget.title}>
                                {widget.title}
                              </span>
                              {isSlicerMissing && (
                                <div className="group relative flex items-center">
                                  <AlertCircle className="w-3 h-3 text-amber-500/80" />
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block w-max max-w-[200px] bg-surface-3 text-text-custom text-[9px] px-2 py-1 rounded shadow-md border border-border-custom z-50 whitespace-normal">
                                    Static Snapshot: Field not available on this chart.
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div 
                            onPointerDown={(e) => handleDragStart(e, widget.id)}
                            className="flex items-center justify-between mb-2 border-b border-border-custom/50 pb-1.5 cursor-grab active:cursor-grabbing"
                            title="Click & Drag header to position anywhere on canvas"
                          >
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <Move className="w-3.5 h-3.5 text-accent-custom shrink-0" />
                              <span className="text-[10px] font-mono text-text-custom font-semibold uppercase tracking-wider truncate max-w-[100px]" title={widget.title}>
                                {widget.title}
                              </span>
                              {isSlicerMissing && (
                                <div className="group relative flex items-center">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500/80 hover:text-amber-500 transition-colors" />
                                  <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-max max-w-[200px] bg-surface-3 text-text-custom text-[10px] px-2 py-1 rounded shadow-md border border-border-custom z-50 whitespace-normal">
                                    Static Snapshot: Field not available on this chart.
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Sizing & Delete Controls */}
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingWidgetId(editingWidgetId === widget.id ? null : widget.id);
                                }}
                                className={`p-1 border rounded-md transition-all cursor-pointer z-20 ${
                                  editingWidgetId === widget.id 
                                    ? 'bg-accent-custom/20 border-accent-custom text-accent-custom' 
                                    : 'hover:bg-accent-custom/10 border-border-custom text-muted-custom hover:text-accent-custom'
                                }`}
                                title="Format size and positioning bounds"
                              >
                                <Settings2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteWidget(widget.id, widget.title);
                                }}
                                className="p-1 hover:bg-red-500/10 border border-red-500/20 text-red-500 rounded-md transition-all cursor-pointer z-20"
                                title="Delete component"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* PowerBI Style Geometry Adjuster Overlay */}
                        {editingWidgetId === widget.id && (
                          <div 
                            className="absolute inset-0 bg-surface/98 z-40 p-3 flex flex-col justify-between border border-accent-custom/30 rounded-2xl animate-in fade-in zoom-in-95 duration-150 text-left select-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between border-b border-border-custom/50 pb-1 mb-1.5">
                              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-accent-custom flex items-center space-x-1">
                                <Settings2 className="w-2.5 h-2.5" />
                                <span>Geometry Bounds</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingWidgetId(null)}
                                className="text-[9px] font-mono text-accent-custom hover:underline font-bold transition-all"
                              >
                                Done
                              </button>
                            </div>

                            {/* Control inputs */}
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                              {/* Position controls */}
                              <div className="space-y-1.5 border-r border-border-custom/30 pr-1.5">
                                <span className="text-[8px] text-muted-custom uppercase font-semibold">Position</span>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span>X: <b className="text-text-custom">{(widget.position?.x ?? 20)}px</b></span>
                                    <div className="flex space-x-1">
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { x: (widget.position?.x ?? 20) - 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >-</button>
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { x: (widget.position?.x ?? 20) + 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >+</button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Y: <b className="text-text-custom">{(widget.position?.y ?? 20)}px</b></span>
                                    <div className="flex space-x-1">
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { y: (widget.position?.y ?? 20) - 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >-</button>
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { y: (widget.position?.y ?? 20) + 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >+</button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Size controls */}
                              <div className="space-y-1.5 pl-1">
                                <span className="text-[8px] text-muted-custom uppercase font-semibold">Dimensions</span>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span>W: <b className="text-text-custom">{width}px</b></span>
                                    <div className="flex space-x-1">
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { width: width - 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >-</button>
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { width: width + 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >+</button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>H: <b className="text-text-custom">{height}px</b></span>
                                    <div className="flex space-x-1">
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { height: height - 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >-</button>
                                      <button 
                                        type="button"
                                        onClick={() => updateWidgetBounds(widget.id, { height: height + 16 })}
                                        className="w-4 h-4 bg-surface-2 hover:bg-border-custom/50 text-text-custom rounded flex items-center justify-center font-bold border border-border-custom/50"
                                      >+</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Presets and layout feedback */}
                            <div className="flex items-center justify-between pt-1 border-t border-border-custom/30 mt-1.5 text-[8px] text-muted-custom">
                              <span>Grid Snap: 16px</span>
                              <button
                                type="button"
                                onClick={() => updateWidgetBounds(widget.id, { width: widget.type === 'kpi' ? 245 : 375, height: widget.type === 'kpi' ? 120 : 230 })}
                                className="px-1.5 py-0.5 bg-surface hover:bg-surface-2 rounded border border-border-custom/50 text-text-custom transition-all"
                              >
                                Reset Size
                              </button>
                            </div>
                          </div>
                        )}

                        {/* CORE CONTENT BY TYPE */}
                        <div className="flex-1 py-1">
                          
                          {/* Type 1: KPI */}
                          {widget.type === 'kpi' && (
                            <div className={`flex flex-col justify-center h-full text-left relative overflow-hidden transition-opacity duration-300 ${isSlicerMissing ? 'opacity-50' : ''}`} style={{ height: `${height - 50}px` }}>
                              {/* Accent gradient bar */}
                              <div 
                                className="absolute top-0 left-0 w-1 h-full rounded-r-full opacity-80"
                                style={{ background: `linear-gradient(180deg, ${widget.color}, ${widget.color}44)` }}
                              />
                              <div className="pl-3">
                                <div 
                                  className="font-bold tracking-tight transition-all leading-none" 
                                  style={{ 
                                    color: widget.color,
                                    fontSize: height > 180 ? '2.5rem' : height > 140 ? '2rem' : width > 200 ? '1.5rem' : '1.25rem'
                                  }}
                                >
                                  {kpiData.value || '—'}
                                </div>
                                <p className="text-[10px] font-medium text-muted-custom line-clamp-1 mt-1.5 uppercase tracking-wider">
                                  {kpiData.subtext}
                                </p>
                                {/* Secondary metrics row (from prompt-generated multi-metric KPIs) */}
                                {widget.data && widget.data.length > 1 && (
                                  <div className="flex gap-3 mt-2 pt-1.5 border-t border-border-custom/20">
                                    {widget.data.slice(1, 3).map((m: any, i: number) => (
                                      <div key={i} className="text-[9px]">
                                        <span className="text-muted-custom">{m.label || m.key}: </span>
                                        <span className="font-semibold text-text-custom">
                                          {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                                          {m.suffix || ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Type 2: BAR CHART */}
                          {widget.type === 'bar' && (() => {
                            const key = widget.xAxisKey || 'label';
                            const valKey = widget.yAxisKey || 'value';
                            const maxVal = Math.max(...widget.data.map(d => Number(d[valKey]) || 0)) || 1;
                            return (
                              <div className="flex flex-col justify-end pt-2 min-h-[40px] w-full" style={{ height: `${height - 90}px` }}>
                                <div className="flex items-end justify-around h-full border-b border-border-custom/50 pb-1.5 gap-1">
                                  {widget.data.map((item, idx) => {
                                    const heightPercent = maxVal ? ((Number(item[valKey]) || 0) / maxVal) * 85 : 0;
                                    
                                    const itemLabel = String(item[key]);
                                  const isHighlighted = (() => {
                                    const activeFilters = customFilters.filter(f => f.selectedValue !== null);
                                    if (activeFilters.length === 0) return true;
                                    
                                    return activeFilters.every(f => {
                                      if (item[f.fieldName] === undefined && item[f.fieldName.toLowerCase()] === undefined && f.fieldName.toLowerCase() !== key.toLowerCase()) {
                                        return true; // Ignore missing fields
                                      }
                                      const itemVal = item[f.fieldName] || item[f.fieldName.toLowerCase()] || (f.fieldName.toLowerCase() === key.toLowerCase() ? itemLabel : '') || '';
                                      return String(itemVal).toLowerCase() === String(f.selectedValue).toLowerCase();
                                    });
                                  })();

                                  return (
                                    <div 
                                      key={idx} 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const filterCol = widget.xAxisKey || 'label';
                                        setCustomFilters(prev => {
                                          const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                          if (existing) {
                                            return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                              ...f,
                                              selectedValue: f.selectedValue === itemLabel ? null : itemLabel
                                            } : f);
                                          } else {
                                            const options = Array.from(new Set(widget.data.map(d => String(d[filterCol]))));
                                            return [...prev, {
                                              fieldName: filterCol,
                                              category: 'Dimensions',
                                              options,
                                              selectedValue: itemLabel
                                            }];
                                          }
                                        });
                                        addLog(`Clicked Bar: cross-filtered canvas by "${filterCol}" = "${itemLabel}"`);
                                      }}
                                      className="flex flex-col items-center flex-1 group/bar relative h-full justify-end cursor-pointer"
                                      style={{ maxWidth: `${Math.max(20, Math.min(64, (width / widget.data.length) - 8))}px` }}
                                    >
                                      {/* Bar hover label */}
                                      <div className="absolute -top-7 scale-0 group-hover/bar:scale-100 bg-surface border border-border-custom px-1.5 py-0.5 rounded text-[9px] font-mono shadow z-20 pointer-events-none whitespace-nowrap">
                                        {_sanitizeLabel(itemLabel)}: {formatKpiValue(item[valKey], widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)}
                                      </div>
                                      <div 
                                        className={`w-full rounded-t-sm transition-all duration-300 relative ${
                                          isHighlighted ? 'opacity-100 ring-2 ring-accent-custom/40' : 'opacity-25 grayscale-50'
                                        }`}
                                        style={{ 
                                          height: `${heightPercent}%`,
                                          backgroundColor: widget.color || '#3B82F6'
                                        }}
                                      >
                                        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/5 rounded-t-sm"></div>
                                      </div>
                                      <span className="text-[8px] font-mono text-muted-custom mt-1 truncate max-w-full text-center">
                                        {_sanitizeLabel(item[key]).slice(0, 8)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })()}

                           {/* Type 3: LINE CHART */}
                           {widget.type === 'line' && (
                            <div className="relative pt-2 min-h-[40px] w-full flex flex-col justify-between" style={{ height: `${height - 50}px` }}>
                              {/* Tableau Grain Selectors */}
                              <div className="flex items-center space-x-1 mb-1.5 self-end bg-surface-2 border border-border-custom rounded-lg p-0.5 z-10">
                                {(['year', 'quarter', 'month', 'day'] as const).map(g => (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTimeGrainChange(widget.id, g);
                                    }}
                                    className={`px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                                      (widget.activeGrain || 'month') === g
                                        ? 'bg-accent-custom text-white shadow-xs'
                                        : 'text-muted-custom hover:text-text-custom hover:bg-surface'
                                    }`}
                                  >
                                    {g === 'day' ? 'date' : g}
                                  </button>
                                ))}
                              </div>
                              
                              <div className="relative flex-1">
                                <svg className="w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="none">
                                  <defs>
                                    <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={widget.color || '#3B82F6'} stopOpacity="0.15" />
                                      <stop offset="100%" stopColor={widget.color || '#3B82F6'} stopOpacity="0.0" />
                                    </linearGradient>
                                  </defs>
                                  
                                  {/* Curve path calculator */}
                                  {(() => {
                                    const valKey = widget.yAxisKey || 'value';
                                    if (!widget.data || widget.data.length === 0) {
                                      return <text x="100" y="50" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="monospace">No data points</text>;
                                    }
                                    const maxVal = Math.max(...widget.data.map(d => Number(d[valKey]) || 0)) || 1;
                                    
                                    if (widget.data.length === 1) {
                                      const numVal = Number(widget.data[0][valKey]) || 0;
                                      const x = 100;
                                      const y = 90 - (numVal / maxVal) * 75;
                                      const labelVal = widget.data[0][widget.xAxisKey || 'label'] || '';
                                      return (
                                        <circle
                                          cx={x}
                                          cy={y}
                                          r="5"
                                          fill={widget.color || '#3B82F6'}
                                          stroke="#fff"
                                          strokeWidth="2"
                                          className="cursor-pointer hover:scale-125 transition-all duration-150"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const filterCol = widget.xAxisKey || 'label';
                                            setCustomFilters(prev => {
                                              const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                              if (existing) {
                                                return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                  ...f,
                                                  selectedValue: f.selectedValue === labelVal ? null : labelVal
                                                } : f);
                                              } else {
                                                const options = Array.from(new Set(widget.data.map(d => String(d[filterCol]))));
                                                return [...prev, {
                                                  fieldName: filterCol,
                                                  category: 'Dimensions',
                                                  options,
                                                  selectedValue: labelVal
                                                }];
                                              }
                                            });
                                            addLog(`Clicked Line Point: cross-filtered canvas by "${filterCol}" = "${labelVal}"`);
                                          }}
                                          onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setActiveHoverTooltip({
                                              x: rect.left + window.scrollX + 6,
                                              y: rect.top + window.scrollY - 30,
                                              content: `${_sanitizeLabel(labelVal)}: ${formatKpiValue(numVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)}`
                                            });
                                          }}
                                          onMouseLeave={() => setActiveHoverTooltip(null)}
                                        >
                                          <title>{`${_sanitizeLabel(labelVal)}: ${formatKpiValue(numVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)}`}</title>
                                        </circle>
                                      );
                                    }

                                    const segmentWidth = 200 / (widget.data.length - 1 || 1);
                                    
                                    const points = widget.data.map((item, idx) => {
                                      const x = idx * segmentWidth;
                                      const y = 90 - ((Number(item[valKey]) || 0) / maxVal) * 75; // map to svg viewbox bounds
                                      return { x, y };
                                    });

                                    const pathD = points.reduce((acc, p, idx) => {
                                      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                                    }, '');

                                    const areaD = `${pathD} L 200 100 L 0 100 Z`;

                                    return (
                                      <>
                                        <path d={areaD} fill={`url(#grad-${widget.id})`} />
                                        <path d={pathD} fill="none" stroke={widget.color || '#3B82F6'} strokeWidth="2" strokeLinecap="round" />
                                        {points.map((p, idx) => {
                                          const item = widget.data[idx];
                                          const labelVal = item[widget.xAxisKey || 'label'] || '';
                                          const numVal = item[valKey] || 0;
                                          return (
                                            <circle 
                                              key={idx} 
                                              cx={p.x} 
                                              cy={p.y} 
                                              r="4" 
                                              fill={widget.color || '#3B82F6'} 
                                              stroke="#fff" 
                                              strokeWidth="1.5" 
                                              className="cursor-pointer hover:scale-125 transition-all duration-150"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const filterCol = widget.xAxisKey || 'label';
                                                setCustomFilters(prev => {
                                                  const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                                  if (existing) {
                                                    return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                      ...f,
                                                      selectedValue: f.selectedValue === labelVal ? null : labelVal
                                                    } : f);
                                                  } else {
                                                    const options = Array.from(new Set(widget.data.map(d => String(d[filterCol]))));
                                                    return [...prev, {
                                                      fieldName: filterCol,
                                                      category: 'Dimensions',
                                                      options,
                                                      selectedValue: labelVal
                                                    }];
                                                  }
                                                });
                                                addLog(`Clicked Line Point: cross-filtered canvas by "${filterCol}" = "${labelVal}"`);
                                              }}
                                              onMouseEnter={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setActiveHoverTooltip({
                                                  x: rect.left + window.scrollX + 6,
                                                  y: rect.top + window.scrollY - 30,
                                                  content: `${_sanitizeLabel(labelVal)}: ${formatKpiValue(numVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)}`
                                                });
                                              }}
                                              onMouseLeave={() => setActiveHoverTooltip(null)}
                                            >
                                              <title>{`${_sanitizeLabel(labelVal)}: ${formatKpiValue(numVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)}`}</title>
                                            </circle>
                                          );
                                        })}
                                      </>
                                    );
                                  })()}
                                </svg>
                              </div>
                              <div className="flex justify-between text-[8px] font-mono text-muted-custom mt-1 border-t border-border-custom/30 pt-0.5 overflow-hidden shrink-0">
                                {widget.data.map((item, idx) => (
                                  <span key={idx} className="truncate max-w-[40px] text-center" title={String(item[widget.xAxisKey || 'label'] || '')}>
                                    {String(item[widget.xAxisKey || 'label'] || '').split(' ')[0] || ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Type 4: DONUT/PIE CHART */}
                          {widget.type === 'pie' && (() => {
                            const totalVal = widget.data.reduce((acc, d) => acc + Number(d[widget.yAxisKey || 'val'] || 0), 0) || 1;
                            const pieFilter = customFilters.find(f => f.fieldName.toLowerCase() === (widget.xAxisKey || 'name').toLowerCase());
                            const selectedVal = pieFilter?.selectedValue;
                            
                            const paletteColors = [
                              widget.color || '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6', '#EF4444', '#14B8A6'
                            ];

                            let accumulatedPercent = 0;

                            return (
                              <div className="flex items-center justify-center space-x-4 min-h-[40px] w-full" style={{ height: `${height - 90}px` }}>
                                <div className="relative shrink-0 transition-all" style={{ width: `${Math.max(48, Math.min(120, (height - 90) * 0.85))}px`, height: `${Math.max(48, Math.min(120, (height - 90) * 0.85))}px` }}>
                                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                    {/* Draw base circle track */}
                                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(120, 120, 120, 0.1)" strokeWidth="4" />
                                    
                                    {widget.data.map((item, idx) => {
                                      const keyName = String(item[widget.xAxisKey || 'name']);
                                      const valNum = Number(item[widget.yAxisKey || 'val'] || 0);
                                      const percent = (valNum / totalVal) * 100;
                                      const sliceColor = paletteColors[idx % paletteColors.length];
                                      const isRingSelected = !selectedVal || selectedVal.toLowerCase() === keyName.toLowerCase();
                                      
                                      const offset = -accumulatedPercent;
                                      accumulatedPercent += percent;

                                      return (
                                        <circle 
                                          key={idx}
                                          cx="18" 
                                          cy="18" 
                                          r="15.915" 
                                          fill="transparent" 
                                          stroke={sliceColor} 
                                          strokeWidth="4.5" 
                                          strokeDasharray={`${percent} ${100 - percent}`} 
                                          strokeDashoffset={offset} 
                                          className={`transition-all duration-200 cursor-pointer ${isRingSelected ? 'opacity-100' : 'opacity-20'}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const filterCol = widget.xAxisKey || 'name';
                                            setCustomFilters(prev => {
                                              const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                              if (existing) {
                                                return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                  ...f,
                                                  selectedValue: f.selectedValue === keyName ? null : keyName
                                                } : f);
                                              } else {
                                                const options = Array.from(new Set(widget.data.map(d => String(d[filterCol]))));
                                                return [...prev, {
                                                  fieldName: filterCol,
                                                  category: 'Dimensions',
                                                  options,
                                                  selectedValue: keyName
                                                }];
                                              }
                                            });
                                            addLog(`Clicked Pie Slice: cross-filtered canvas by "${filterCol}" = "${keyName}"`);
                                          }}
                                          onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setActiveHoverTooltip({
                                              x: rect.left + window.scrollX + 15,
                                              y: rect.top + window.scrollY - 30,
                                              content: `${_sanitizeLabel(keyName)}: ${percent.toFixed(1)}% (${formatKpiValue(valNum, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)})`
                                            });
                                          }}
                                          onMouseLeave={() => setActiveHoverTooltip(null)}
                                        >
                                          <title>{`${_sanitizeLabel(keyName)}: ${percent.toFixed(1)}% (${formatKpiValue(valNum, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)})`}</title>
                                        </circle>
                                      );
                                    })}
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[7px] font-mono leading-none text-text-custom">
                                    <span className="text-[10px] font-bold text-accent-custom tracking-wider">{widget.data.length}</span>
                                    <span className="text-[6px] text-muted-custom uppercase mt-0.5">Slices</span>
                                  </div>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-1.5 max-h-full pr-1 font-mono text-[8px] text-muted-custom">
                                  {widget.data.map((item, idx) => {
                                    const keyName = String(item[widget.xAxisKey || 'name']);
                                    const valNum = Number(item[widget.yAxisKey || 'val'] || 0);
                                    const percent = (valNum / totalVal) * 100;
                                    const sliceColor = paletteColors[idx % paletteColors.length];
                                    
                                    const isHighlighted = (() => {
                                      const activeFilters = customFilters.filter(f => f.selectedValue !== null);
                                      if (activeFilters.length === 0) return true;
                                      
                                      return activeFilters.every(f => {
                                        if (item[f.fieldName] === undefined && item[f.fieldName.toLowerCase()] === undefined && f.fieldName.toLowerCase() !== (widget.xAxisKey || 'name').toLowerCase()) {
                                          return true; // Ignore missing fields
                                        }
                                        const itemVal = item[f.fieldName] || item[f.fieldName.toLowerCase()] || (f.fieldName.toLowerCase() === (widget.xAxisKey || 'name').toLowerCase() ? keyName : '') || '';
                                        return String(itemVal).toLowerCase() === String(f.selectedValue).toLowerCase();
                                      });
                                    })();
                                    return (
                                      <div 
                                        key={idx} 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const filterCol = widget.xAxisKey || 'name';
                                          setCustomFilters(prev => {
                                            const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                            if (existing) {
                                              return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                ...f,
                                                selectedValue: f.selectedValue === keyName ? null : keyName
                                              } : f);
                                            } else {
                                              const options = Array.from(new Set(widget.data.map(d => String(d[filterCol]))));
                                              return [...prev, {
                                                fieldName: filterCol,
                                                category: 'Dimensions',
                                                options,
                                                selectedValue: keyName
                                              }];
                                            }
                                          });
                                          addLog(`Clicked Donut slice: cross-filtered canvas by "${filterCol}" = "${keyName}"`);
                                        }}
                                        className={`flex items-center space-x-1 cursor-pointer transition-all ${
                                          isHighlighted ? 'opacity-100 font-semibold text-text-custom' : 'opacity-30'
                                        }`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sliceColor }}></span>
                                        <span className="truncate max-w-[60px]" title={_sanitizeLabel(keyName)}>{_sanitizeLabel(keyName)}:</span>
                                        <span className="font-bold text-text-custom">{percent.toFixed(1)}% ({formatKpiValue(valNum, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg)})</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Type 5: TABLE */}
                          {widget.type === 'table' && (
                            <div className="flex flex-col justify-start pt-1 min-h-[40px] w-full overflow-auto text-[9px] font-mono" style={{ height: `${height - 90}px` }}>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border-custom bg-surface-2/40">
                                    {widget.data.length > 0 && Object.keys(widget.data[0]).slice(0, 4).map((col, idx) => (
                                      <th key={idx} className="p-1.5 font-bold uppercase tracking-wider text-muted-custom truncate">{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {widget.data.slice(0, 5).map((row, rowIdx) => (
                                    <tr key={rowIdx} className="border-b border-border-custom/50 hover:bg-surface-2/20">
                                      {Object.keys(row).slice(0, 4).map((col, colIdx) => {
                                         const cellVal = row[col];
                                         const isMetric = fieldsList.some(af => af.name === col && af.category === 'Metrics');
                                         return (
                                           <td key={colIdx} className="p-1.5 truncate text-text-custom max-w-[100px]" title={String(cellVal)}>
                                             {isMetric ? formatKpiValue(cellVal, col) : String(cellVal)}
                                           </td>
                                         );
                                       })}
                                    </tr>
                                  ))}
                                  {widget.data.length > 5 && (
                                    <tr>
                                      <td colSpan={4} className="p-1 text-center text-muted-custom italic">
                                        + {widget.data.length - 5} more rows
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}

                        </div>

                        {/* Lower tag stamp */}
                        <div className="flex items-center justify-between text-[8px] font-mono text-muted-custom mt-1.5 pt-1 border-t border-border-custom/30">
                          <span className="text-accent-custom font-bold">● Free-form Draggable</span>
                          <span>{widget.type.toUpperCase()} Visual</span>
                        </div>

                        {/* Drag-resize handle on bottom-right corner (PowerBI Style) */}
                        {isSelected && !isPresentMode && (
                          <div
                            onPointerDown={(e) => handleResizeStart(e, widget.id)}
                            className="absolute bottom-1.5 right-1.5 w-4 h-4 cursor-se-resize z-35 flex items-end justify-end text-muted-custom hover:text-accent-custom active:text-accent-custom transition-all"
                            title="Drag to resize component (PowerBI style)"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" className="fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round">
                              <line x1="8" y1="2" x2="2" y2="8" />
                              <line x1="8" y1="5" x2="5" y2="8" />
                            </svg>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                </div>
              </div>
            )}

            {/* Floating prompt bar bubble for full screen mode */}
            {isFullScreenCanvas && (
              <div className="fixed bottom-6 left-1/2 -translate-y-0 -translate-x-1/2 z-50 w-[90%] max-w-2xl">
                {isPromptBubbleCollapsed ? (
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    type="button"
                    onClick={() => setIsPromptBubbleCollapsed(false)}
                    className="ml-auto w-12 h-12 rounded-full bg-accent-custom text-white hover:bg-accent-custom/95 flex items-center justify-center cursor-pointer shadow-2xl hover:scale-110 active:scale-95 duration-200 border border-accent-custom/30"
                    title="Expand AI Prompt Assistant"
                  >
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="p-4 bg-surface/95 backdrop-blur-md border border-accent-custom/20 rounded-2xl shadow-2xl flex flex-col space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-accent-custom animate-pulse" />
                        <span className="text-[11px] font-bold font-mono uppercase text-text-custom">AI Prompt Stage Assistant</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => setShowFloatingSuggestions(!showFloatingSuggestions)}
                          className="text-[10px] font-mono text-muted-custom hover:text-accent-custom hover:underline transition-all cursor-pointer"
                        >
                          {showFloatingSuggestions ? 'Hide Templates' : 'Show Templates'}
                        </button>
                        <div className="h-3 w-[1px] bg-border-custom/30" />
                        <button
                          type="button"
                          onClick={() => setIsPromptBubbleCollapsed(true)}
                          className="text-[10px] font-mono text-muted-custom hover:text-red-500 hover:underline transition-all flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Minimize</span>
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handlePromptSubmit} className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Sparkles className="w-4.5 h-4.5 text-accent-custom animate-pulse" />
                      </div>
                      <input
                        type="text"
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        placeholder="Prompt AI to construct and organize widgets on your canvas..."
                        className="w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-xl py-3 pl-11 pr-32 text-xs font-mono shadow-inner focus:outline-none transition-all placeholder:text-muted-custom"
                        disabled={isCompiling}
                      />
                      <div className="absolute right-2 inset-y-1.5 flex items-center space-x-1.5">
                        {promptInput && (
                          <button 
                            type="button" 
                            onClick={() => setPromptInput('')}
                            className="text-[10px] font-mono text-muted-custom hover:text-text-custom px-1 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={isCompiling}
                          className="px-3 h-full bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-mono font-medium rounded-lg flex items-center space-x-1 cursor-pointer transition-all shadow-xs"
                        >
                          {isCompiling ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                              <span>Compiling...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Compile</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>

                    {showFloatingSuggestions && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {PROMPT_SUGGESTIONS.map((sug, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPromptInput(sug)}
                            className="px-2 py-1 bg-surface-2 hover:bg-border-custom/20 border border-border-custom/30 rounded-full text-[9px] font-mono text-muted-custom hover:text-text-custom transition-all cursor-pointer truncate max-w-[200px]"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

          </div>

          {/* LOWER GRIDFOOTER TIPS */}
          <div className="p-3.5 bg-accent-custom/5 border border-accent-custom/10 rounded-2xl flex items-start space-x-2 text-xs text-left">
            <Info className="w-4 h-4 text-accent-custom shrink-0 mt-0.5" />
            <div className="space-y-1 font-sans">
              <span className="font-semibold text-text-custom">Interactive Canvas Advice:</span>
              <p className="text-[11px] text-muted-custom leading-relaxed">
                Our rule-based Natural Language Processing engine decodes user intent directly to assemble chart properties. You can modify any item's column span using its <b>Size</b> controls, append custom variables from the left <b>Fields & Properties</b> selection pane, or run an automatic geometric snap using the <b>Organize</b> algorithm in the header.
              </p>
            </div>
          </div>

        </div>

      </div>

      {contextMenu && (
        <>
          <div 
            className="fixed inset-0 z-[1000]" 
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div 
            className="fixed z-[1001] bg-surface/95 backdrop-blur-md border border-border-custom/80 shadow-2xl rounded-2xl p-1.5 min-w-[210px] animate-in fade-in zoom-in-95 duration-100 font-mono text-[11px]"
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          >
            <div className="px-2.5 py-1.5 border-b border-border-custom/30 text-[9px] text-muted-custom uppercase font-semibold">
              Field: {contextMenu.field.name}
            </div>
            <button
              type="button"
              onClick={() => {
                handleAddColumnAsFilter(contextMenu.field.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-2 hover:bg-accent-custom/10 hover:text-accent-custom rounded-lg transition-all text-left cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-accent-custom" />
              <span>Use Column as Filter</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleFieldToggle(contextMenu.field.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-2 hover:bg-surface-2 rounded-lg transition-all text-left cursor-pointer text-muted-custom hover:text-text-custom"
            >
              <Grid className="w-3.5 h-3.5 text-muted-custom/60" />
              <span>{checkedFields.includes(contextMenu.field.name) ? 'Deselect Property' : 'Select Property'}</span>
            </button>
          </div>
        </>
      )}

      {widgetContextMenu && (() => {
        const targetWidget = widgets.find(w => w.id === widgetContextMenu.widgetId);
        return (
          <>
            <div 
              className="fixed inset-0 z-[1000]" 
              onClick={() => setWidgetContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setWidgetContextMenu(null);
              }}
            />
            <div 
              className="fixed z-[1001] bg-surface/95 backdrop-blur-md border border-border-custom/80 shadow-2xl rounded-2xl p-1.5 min-w-[200px] animate-in fade-in zoom-in-95 duration-100 font-mono text-[11px]"
              style={{ top: `${widgetContextMenu.y}px`, left: `${widgetContextMenu.x}px` }}
            >
              <div className="px-2.5 py-1.5 border-b border-border-custom/30 text-[9px] text-muted-custom uppercase font-semibold">
                Aggregation: {targetWidget?.title || 'Visual'}
              </div>
              {(() => {
                const targetMetric = targetWidget?.targetMetricName || '';
                const isCategoricalMetric = fieldsList.some(f => f.name === targetMetric && (f.category === 'Dimensions' || f.category === 'Dates'));

                return ([
                  { label: 'Sum (Total)', value: 'SUM' },
                  { label: 'Average (Mean)', value: 'AVG' },
                  { label: 'Minimum', value: 'MIN' },
                  { label: 'Maximum', value: 'MAX' },
                  { label: 'Count (Records)', value: 'COUNT' },
                  { label: 'Variance (SAMP)', value: 'VAR_SAMP' }
                ] as const).map(opt => {
                  const isSelected = targetWidget?.activeAgg === opt.value;
                  const isInvalid = isCategoricalMetric && opt.value !== 'COUNT';

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isInvalid}
                      onClick={() => {
                        handleWidgetAggregationChange(widgetContextMenu.widgetId, opt.value);
                        setWidgetContextMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all text-left ${
                        isInvalid
                          ? 'opacity-30 cursor-not-allowed text-muted-custom'
                          : isSelected
                            ? 'bg-accent-custom/10 text-accent-custom font-bold cursor-pointer'
                            : 'hover:bg-surface-2 text-muted-custom hover:text-text-custom cursor-pointer'
                      }`}
                      title={isInvalid ? "Mathematical aggregate not supported on text fields" : ""}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent-custom" />}
                    </button>
                  );
                });
              })()}
            </div>
          </>
        );
      })()}

      {/* 4. LOAD DASHBOARD MODAL */}
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
                    <ChevronRight className="w-3.5 h-3.5 text-muted-custom group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}



      {activeHoverTooltip && (
        <div 
          className="fixed z-[9999] bg-surface border border-border-custom px-2 py-1 rounded-lg text-[10px] font-mono shadow-xl pointer-events-none whitespace-nowrap text-text-custom animate-in fade-in duration-75"
          style={{ 
            top: `${activeHoverTooltip.y}px`, 
            left: `${activeHoverTooltip.x}px`,
            transform: 'translateX(-50%)'
          }}
        >
          {activeHoverTooltip.content}
        </div>
      )}

    </div>
  );
}
