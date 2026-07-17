import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Sparkles, Grid, Sliders, Play, Trash2, ArrowRight, RotateCcw, LayoutGrid, 
  ChevronRight, ChevronLeft, Plus, Check, Settings2, Download, Eye, FileSpreadsheet,
  Info, BarChart3, BarChart4, PieChart as PieIcon, TrendingUp, HelpCircle, AlertCircle, Maximize2, Minimize2, Move, Percent,
  Globe, ScatterChart, CircleDot, Shuffle, MapPin, Activity, DollarSign, ShoppingCart, Users, Box,
  Terminal, Code, Cpu, Database, Copy, CheckCheck, Table2, Layers, Undo2, Redo2,
  GripVertical, Filter, ChevronDown, GitBranch, FolderOpen, Save as SaveIcon, Loader2, ArrowRightLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../../context/ThemeContext';
import { datasetService, type Dataset, type DatasetVersionSummary } from '../../lib/api/dataset';
import { analyticsService } from '../../lib/api/dashboard';
import { chatService, type ChatSession, type ChatMessage } from '../../lib/api/chat';
import { canvasService, formatKpiValue, formatKpiSubtext, type NumberFormatConfig } from '../../lib/api/canvas';
import { apiClient } from '../../lib/api/client';
import { toast } from 'react-hot-toast';
// html-to-image is lazy-loaded in handleExportVisuals to reduce bundle size
import download from 'downloadjs';
import { VizzyPilotLogoIcon } from '../../components/layout/VizzyLogo';
import { prettifyLabel } from '../../components/dashboard/dashboard-helpers';
import { CustomGeoMap } from './CustomGeoMap';

// AIPromptBarProps interface and React.memo component definition to avoid page-wide keydown re-renders
interface AIPromptBarProps {
  onSubmit: (prompt: string) => void;
  isCompiling: boolean;
  suggestions: string[];
  placeholder?: string;
  isFullScreen?: boolean;
  showSuggestions?: boolean;
}

const AIPromptBar: React.FC<AIPromptBarProps> = React.memo(({
  onSubmit,
  isCompiling,
  suggestions,
  placeholder = "Prompt AI to construct and organize widgets on your canvas...",
  isFullScreen = false,
  showSuggestions = true
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isCompiling) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="space-y-4 w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <VizzyPilotLogoIcon size={18} className="text-accent-custom animate-pulse" />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={
            isFullScreen
              ? "w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-xl py-3 pl-11 pr-32 text-xs font-mono shadow-inner focus:outline-none transition-all placeholder:text-muted-custom"
              : "w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-2xl py-3.5 pl-11 pr-32 text-xs font-mono shadow-xs focus:outline-none transition-all placeholder:text-muted-custom"
          }
          disabled={isCompiling}
        />
        <div className={isFullScreen ? "absolute right-2 inset-y-1.5 flex items-center space-x-1.5" : "absolute right-2.5 inset-y-2 flex items-center space-x-1.5"}>
          {value && (
            <button 
              type="button" 
              onClick={() => setValue('')}
              className="text-[10px] font-mono text-muted-custom hover:text-text-custom px-1 cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={isCompiling}
            className={
              isFullScreen
                ? "px-3 h-full bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-mono font-medium rounded-lg flex items-center space-x-1 cursor-pointer transition-all shadow-xs"
                : "px-4 h-full bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-xl flex items-center space-x-1 cursor-pointer transition-all shadow-xs"
            }
          >
            {isCompiling ? (
              <>
                <RotateCcw className={isFullScreen ? "w-3.5 h-3.5 animate-spin" : "w-3 h-3 animate-spin"} />
                <span>Compiling...</span>
              </>
            ) : (
              <>
                <Play className={isFullScreen ? "w-3.5 h-3.5 fill-current" : "w-3 h-3 fill-current"} />
                <span>Compile</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Suggestion pills */}
      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-2">
          {!isFullScreen && <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-custom">AI Templates:</span>}
          {suggestions.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setValue(sug)}
              className={
                isFullScreen
                  ? "px-2 py-1 bg-surface-2 hover:bg-border-custom/20 border border-border-custom/30 rounded-full text-[9px] font-mono text-muted-custom hover:text-text-custom transition-all cursor-pointer truncate max-w-[200px]"
                  : "px-2.5 py-1 bg-surface hover:bg-border-custom/20 border border-border-custom rounded-full text-[9px] font-mono text-muted-custom hover:text-text-custom transition-all cursor-pointer truncate max-w-[240px]"
              }
            >
              {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

// Define Widget Type for the Canvas with AI logs
import type { ChartDataPoint, CanvasChartType, AggregationType, TimeGrain } from '../../types/canvas';

interface CanvasWidget {
  id: string;
  title: string;
  type: CanvasChartType;
  data: ChartDataPoint[];
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
  activeGrain?: TimeGrain;
  activeAgg?: AggregationType;
  targetMetricName?: string;
  targetDimName?: string;
  filterOmitted?: boolean;
  numberFormat?: NumberFormatConfig;
  limit?: number;
  isConfigWarning?: boolean;
  configWarningMessage?: string;
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

const getKpiIcon = (metricName: string, color: string) => {
  const lower = String(metricName).toLowerCase();
  let Icon = Activity;
  if (lower.includes('sale') || lower.includes('revenue') || lower.includes('profit') || lower.includes('cost') || lower.includes('price') || lower.includes('amount')) {
    Icon = DollarSign;
  } else if (lower.includes('order') || lower.includes('transaction') || lower.includes('deal') || lower.includes('count')) {
    Icon = ShoppingCart;
  } else if (lower.includes('rate') || lower.includes('margin') || lower.includes('pct') || lower.includes('growth')) {
    Icon = TrendingUp;
  } else if (lower.includes('percent')) {
    Icon = Percent;
  } else if (lower.includes('user') || lower.includes('customer') || lower.includes('client') || lower.includes('visitor')) {
    Icon = Users;
  } else if (lower.includes('product') || lower.includes('item') || lower.includes('stock')) {
    Icon = Box;
  }

  return (
    <div 
      className="p-2 rounded-lg border flex items-center justify-center shrink-0 shadow-md relative overflow-hidden group-hover/kpi:scale-105 transition-transform duration-300"
      style={{ backgroundColor: `${color}12`, borderColor: `${color}25` }}
    >
      <div 
        className="absolute inset-0 blur-md opacity-25"
        style={{ backgroundColor: color }}
      />
      <Icon className="w-4 h-4 relative z-10" style={{ color }} />
    </div>
  );
};

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
  
  // Auto-persist widgets state to local cache (debounced to avoid thrashing during drag/resize)
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

  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number; active: boolean } | null>(null);
  const selectedWidgetIdsRef = useRef<string[]>([]);

  useEffect(() => {
    selectedWidgetIdsRef.current = selectedWidgetIds;
  }, [selectedWidgetIds]);

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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDashboardId, setDeleteDashboardId] = useState<string | null>(null);
  const [showDeleteFieldModal, setShowDeleteFieldModal] = useState(false);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [saveDashboardName, setSaveDashboardName] = useState(() => localStorage.getItem('vizzy_last_loaded_dashboard_name') || '');
  const [loadedDashboardId, setLoadedDashboardId] = useState<string | null>(() => localStorage.getItem('vizzy_last_loaded_dashboard_id'));
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(false);
  const [geoFilters, setGeoFilters] = useState<Record<string, string[]>>({});

  // Persist loaded layout details to survive page refreshes
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

  // Number Formatting Custom Modal States
  const [showCustomFormatModal, setShowCustomFormatModal] = useState(false);
  const [customFormatModalWidgetId, setCustomFormatModalWidgetId] = useState<string | null>(null);
  const [customFormatModalType, setCustomFormatModalType] = useState<'number_custom' | 'currency_custom' | 'standard_custom'>('number_custom');
  const [customFormatDecimals, setCustomFormatDecimals] = useState<number>(2);
  const [customFormatNegative, setCustomFormatNegative] = useState<'minus' | 'parentheses' | 'red'>('minus');
  const [customFormatPrefix, setCustomFormatPrefix] = useState<string>('');
  const [customFormatSuffix, setCustomFormatSuffix] = useState<string>('');
  const [customFormatSeparator, setCustomFormatSeparator] = useState<string>(',');
  const [customFormatUnit, setCustomFormatUnit] = useState<'none' | 'K' | 'M' | 'B' | 'auto'>('none');

  const buildAggExpr = (agg: string, colName: string, orderExpr?: string) => {
    const colObj = fieldsList.find(f => f.name === colName);
    
    let baseAgg = agg === 'PERCENT_CHANGE' ? 'SUM' : agg;
    let baseExpr = `${baseAgg}("${colName}")`;

    // 1. Handle AI Calculated Fields with formulas
    if (colObj?.formula) {
      if (/\b(SUM|AVG|MIN|MAX|COUNT|VAR_SAMP)\s*\(/i.test(colObj.formula)) {
        baseExpr = `(${colObj.formula})`;
      } else {
        baseExpr = `${baseAgg}(${colObj.formula})`;
      }
    }
    // 2. Handle dirty numeric string columns
    else if (
      colObj && 
      colObj.category === 'Metrics' && 
      (colObj.type.toLowerCase().includes('varchar') || 
       colObj.type.toLowerCase().includes('string') || 
       colObj.type.toLowerCase().includes('char'))
    ) {
      baseExpr = `${baseAgg}(TRY_CAST(NULLIF(REGEXP_REPLACE("${colName}", '^\\s*$', ''), '') AS DOUBLE))`;
    }

    if (agg === 'PERCENT_CHANGE') {
      // For percent change, we need a window function over a dimension
      const overClause = orderExpr ? `OVER (ORDER BY ${orderExpr} ASC)` : `OVER ()`;
      return `(((${baseExpr}) - LAG(${baseExpr}) ${overClause}) / NULLIF(LAG(${baseExpr}) ${overClause}, 0)) * 100`;
    }

    return baseExpr;
  };

  // Function to case column names
  const _humanizeLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const beautifyTitle = (rawTitle: string): string => {
    if (!rawTitle) return '';
    return rawTitle
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isDateColumn = (colName: string) => {
    const colObj = fieldsList.find(f => f.name === colName);
    if (!colObj) return false;
    const typeLower = colObj.type.toLowerCase();
    const nameLower = colObj.name.toLowerCase();
    return colObj.category === 'Dates' || 
           typeLower.includes('date') || 
           typeLower.includes('timestamp') || 
           typeLower.includes('time') || 
           nameLower.includes('date') || 
           nameLower.includes('time');
  };

  const getColExpr = (colName: string) => {
    const colObj = fieldsList.find(f => f.name === colName);
    if (colObj?.formula) return `(${colObj.formula})`;
    return `"${colName}"`;
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

    // Time grain formatting (e.g. 2014-06 -> June 2014)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {}
    }
    
    if (/^\d{4}-\d{2}$/.test(str)) {
      try {
        const d = new Date(str + "-01");
        if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } catch (e) {}
    }

    if (/^\d{4}-Q[1-4]$/i.test(str)) {
      const parts = str.split('-');
      return `${parts[1].toUpperCase()} ${parts[0]}`;
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
  const handleDatasetChange = async (datasetId: string, keepWidgets: boolean = false, targetVersionId?: string) => {
    setSelectedDatasetId(datasetId);
    localStorage.setItem('vizzy_last_dataset_id', datasetId);
    setCanvasChatSessionId(null); // Reset session
    if (!keepWidgets) setWidgets([]); // Empty canvas on dataset change
    try {
      if (datasetId) {
        const vers = await datasetService.listVersionsForDataset(datasetId);
        setVersions(vers);
        if (vers.length > 0) {
          const latestVersion = targetVersionId && vers.some((v: any) => v.id === targetVersionId) ? targetVersionId : vers[0].id;
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
  const [isExporting, setIsExporting] = useState(false);
  const [isPresentMode, setIsPresentMode] = useState(false);
  
  // A single flag that tells us if the layout should snap to a responsive CSS Grid
  const isResponsive = isExporting;

  const [canvasZoom, setCanvasZoom] = useState<'fit-width' | 'fit-page' | 'fit-canvas' | '100' | '75' | '50'>('fit-width');
  const [showFloatingSuggestions, setShowFloatingSuggestions] = useState(false);
  const [isPromptBubbleCollapsed, setIsPromptBubbleCollapsed] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 });
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

  // Resize listener for viewportSize (debounced to avoid re-renders per frame)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setViewportSize({ width: window.innerWidth, height: window.innerHeight });

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      }, 200);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
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
    const chart = (spec && spec.chart) ? spec.chart : (spec || {});
    const type = chart.type === 'stacked_bar' || chart.type === 'stacked' ? 'stacked_bar' : (chart.type || 'table');
    
    let data: any[] = [];
    let value: string | undefined = undefined;
    let subtext: string | undefined = undefined;
    let xAxisKey: string | undefined = undefined;
    let yAxisKey: string | undefined = undefined;

    if (type === 'kpi') {
      const kpiVal = chart.data?.value;
      const kpiLabel = chart.data?.label || chart.title || '';
      const suffix = chart.data?.suffix || '';
      const rows = chart.data?.rows || [];
      
      const formattedMetricVal = suffix === '%'
        ? (typeof kpiVal === 'number' ? `${kpiVal.toFixed(1)}%` : String(kpiVal || '0') + '%')
        : formatKpiValue(kpiVal, kpiLabel, 'SUM');

      if (rows.length > 0) {
        data = rows;
        const firstRow = rows[0];
        const hasLabel = firstRow.label !== undefined && firstRow.label !== null;
        if (hasLabel) {
          value = String(firstRow.label);
          subtext = `${prettifyLabel(kpiLabel)}: ${formattedMetricVal}`;
        } else {
          value = formattedMetricVal;
          subtext = kpiLabel || 'Total';
        }
      } else {
        value = formattedMetricVal;
        subtext = kpiLabel || 'Total';
        if (chart.data?.metrics && chart.data.metrics.length > 1) {
          data = chart.data.metrics;
        }
      }
    } else if (type === 'bar' || type === 'stacked_bar') {
      data = chart.data?.rows || [];
      xAxisKey = chart.dimension || 'label';
      // For stacked bar, we might have multiple metrics, but we store the primary one in yAxisKey
      // or we can just leave yAxisKey as the first category and use Object.keys in rendering.
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

    const titleText = String(chart.title || '').toLowerCase();
    const topMatch = titleText.match(/\btop\s*(\d+)\b/);
    const limitVal = topMatch ? parseInt(topMatch[1]) : (data && data.length > 0 ? data.length : undefined);

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
      targetDimName: chart.dimension || '',
      limit: limitVal
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

  // Debounced auto-save effect
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
    }, 2000); // 2 second delay debounce

    return () => clearTimeout(timer);
  }, [widgets, gridSnap, showGridlines, autoSaveEnabled, loadedDashboardId, saveDashboardName, selectedDatasetId, selectedVersionId]);

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
    } catch (err: any) {
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
    } catch (err: any) {
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
  const hasDraggedRef = useRef(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

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

  const canvasScale = useMemo(() => {
    if (!isPresentMode && !isFullScreenCanvas) return 1;
    if (!canvasContainerRef.current) return 0.5; // fallback until mounted

    const containerWidth = canvasContainerRef.current.clientWidth - 32;
    const containerHeight = canvasContainerRef.current.clientHeight - 32;

    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;

    if (isPresentMode) {
      // Cover the screen with the dashboard responsively, containing it entirely
      return Math.min(scaleX, scaleY);
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
  }, [isFullScreenCanvas, isPresentMode, canvasZoom, viewportSize, widgets.length, contentWidth, contentHeight]);

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
  // AST Cross-Filtering Re-query Engine (debounced + abortable)
  // ============================================================================
  const crossFilterAbortRef = useRef<AbortController | null>(null);
  const crossFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedDatasetId) return;

    const updatableWidgets = widgets.filter(w => w.sql);
    if (updatableWidgets.length === 0) return;

    const activeFilters = customFilters.filter(f => f.selectedValue !== null);

    // Cancel any in-flight request batch
    if (crossFilterAbortRef.current) {
      crossFilterAbortRef.current.abort();
    }
    // Debounce rapid filter toggles by 300ms
    if (crossFilterTimerRef.current) {
      clearTimeout(crossFilterTimerRef.current);
    }

    crossFilterTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      crossFilterAbortRef.current = controller;

      const executeAll = async () => {
        try {
          const promises = updatableWidgets.map(async (w) => {
            if (controller.signal.aborted) return { id: w.id, data: w.data, error: 'Aborted', filterOmitted: true, isKpi: w.type === 'kpi' };
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
              if (controller.signal.aborted) return { id: w.id, data: w.data, error: 'Aborted', filterOmitted: true, isKpi: w.type === 'kpi' };
              console.error(`Failed to requery widget ${w.id}`, e);
              return { id: w.id, data: w.data, error: 'Failed', filterOmitted: true, isKpi: w.type === 'kpi' };
            }
          });

          const updates = await Promise.all(promises);
          if (controller.signal.aborted) return;

          setWidgets(currentWidgets => currentWidgets.map(w => {
            const update = updates.find(u => u.id === w.id);
            if (update && !update.error) {
              let updatedData = update.data || [];

              // Map SQL label/value results back to Pie/Donut's expected { name, val } structure
              if (w.type === 'pie' || w.type === 'donut') {
                updatedData = updatedData.map((r: any) => ({ name: r.label || r.name, val: r.value || r.val }));
              }

              // Apply dynamic Top-N slicing
              const titleText = String(w.title || '').toLowerCase();
              const topMatch = titleText.match(/\btop\s*(\d+)\b/);
              const titleLimit = topMatch ? parseInt(topMatch[1]) : null;
              const limit = titleLimit ?? w.limit;

              if (limit && updatedData.length > limit) {
                updatedData = updatedData.slice(0, limit);
              }

              const newWidget = {
                ...w,
                data: updatedData,
                filterOmitted: update.filterOmitted
              };
              // If it's a KPI and it re-queried successfully without fallback, update its value dynamically
              if (update.isKpi && update.data && update.data.length > 0) {
                const firstRow = update.data[0];
                const numericKey = Object.keys(firstRow).find(k => typeof firstRow[k] === 'number');
                if (numericKey) {
                   const rawValue = firstRow[numericKey];
                   const metricLabel = w.targetMetricName || w.yAxisKey || numericKey;
                   newWidget.value = formatKpiValue(rawValue, metricLabel, w.activeAgg || 'SUM', w.numberFormat);
                }
              }
              return newWidget;
            }
            return w;
          }));
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error('Cross-filter re-query failed', err);
          }
        }
      };

      executeAll();
    }, 300);

    return () => {
      if (crossFilterTimerRef.current) clearTimeout(crossFilterTimerRef.current);
      if (crossFilterAbortRef.current) crossFilterAbortRef.current.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFilters, selectedDatasetId, selectedVersionId]);

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
  }, [selectedWidgetId, widgets]);

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

      // Keyboard nudge navigation for moving selected charts
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

        // Add movement step to history state
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
    
    // Ensure this widget is selected. If not, make it the single selection (unless Shift key is held).
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
    
    // Cache starting coordinates for all active selected widgets
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
      
      // Update DOM styles directly in real-time for high-sensitivity and buttery smooth rendering
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

      // Commit final locations to state on pointerup
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

      const anyMoved = initialPositions.some(pos => {
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
        setFuture([]); // Clear future stack
        addLog(`Moved ${activeIds.length} component(s) on the canvas.`);
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

    // Find the DOM element for direct manipulation (avoids React re-renders during resize)
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
      
      // Direct DOM manipulation — no React re-render per pixel
      if (widgetEl) {
        widgetEl.style.width = `${nextWidth}px`;
        widgetEl.style.height = `${nextHeight}px`;
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      // Compute final size and commit to React state once
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

  // Selection box dragging logic on the canvas sheet background
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag on left click and not in responsive mode
    if (e.button !== 0 || isResponsive) return;
    
    // Skip if user clicks inside any widget, button, selector, or inputs
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

    // Clear previous selections if shift key is not pressed
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
        return {
          ...prev,
          currentX,
          currentY
        };
      });

      // Calculate intersection bounding box in canvas relative space
      const boxStartX = Math.min(startX, currentX);
      const boxEndX = Math.max(startX, currentX);
      const boxStartY = Math.min(startY, currentY);
      const boxEndY = Math.max(startY, currentY);

      // Detect widgets inside the selection rectangle boundary
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

      // Sync primary selected widget to console on release
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
      const fieldExpr = getColExpr(fieldName);
      const sql = `SELECT DISTINCT ${fieldExpr} AS val FROM data WHERE ${fieldExpr} IS NOT NULL ORDER BY val ASC LIMIT 100`;
      const sqlResult = await canvasService.executeSql(selectedDatasetId, selectedVersionId || '', sql);
      
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
    let extraDetails: { label: string; value: string }[] = [];

    if (widget.data && widget.data.length > 0) {
      const firstRow = widget.data[0];
      const keys = Object.keys(firstRow);
      const numericKey = keys.find(k => k.toLowerCase() === 'value') || keys.find(k => typeof firstRow[k] === 'number');
      const labelKey = keys.find(k => k.toLowerCase() === 'label');

      // 1. Capture dimension label if present (e.g., California) and map to target dim name
      if (labelKey) {
        const labelVal = firstRow[labelKey];
        if (labelVal !== undefined && labelVal !== null) {
          const dimLabel = widget.targetDimName ? prettifyLabel(widget.targetDimName.split(',')[0]) : 'Top Entity';
          extraDetails.push({ label: dimLabel, value: String(labelVal) });
        }
      }

      // 2. Capture other non-technical metrics/dimensions
      keys.forEach(k => {
        const kLower = k.toLowerCase();
        const isTechnical = ['key', 'is percentage', 'format type', 'ispercentage', 'formattype', 'dtype', 'type', 'color', 'id'].includes(kLower);
        
        if (k !== numericKey && kLower !== 'value' && kLower !== 'label' && !isTechnical) {
          const val = firstRow[k];
          if (val !== undefined && val !== null) {
            const formattedVal = typeof val === 'number' 
              ? formatKpiValue(val, k, undefined, widget.numberFormat)
              : String(val);
            const displayLabel = k.replace(/[_\-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            extraDetails.push({ label: displayLabel, value: formattedVal });
          }
        }
      });
    }

    const activeFilters = customFilters.filter(f => f.selectedValue !== null);
    if (activeFilters.length > 0) {
      const filterDesc = activeFilters.map(f => `${f.fieldName}=${f.selectedValue}`).join(', ');
      displaySubtext = `${widget.subtext || ''} (Filtered by: ${filterDesc})`;
    }

    return { value: displayValue, subtext: displaySubtext, extraDetails };
  };

  const recompileWidget = async (widgetId: string, fields: string[]) => {
    const targetWidget = widgets.find(w => w.id === widgetId);
    if (!targetWidget) return;

    const checkedMetrics = fields.filter(f => fieldsList.some(af => af.name === f && af.category === 'Metrics'));
    const checkedDims = fields.filter(f => fieldsList.some(af => af.name === f && (af.category === 'Dimensions' || af.category === 'Dates')));
    const isDimOnlyAnalysis = checkedMetrics.length === 0 && checkedDims.length >= 2;

    const primaryMetric = isDimOnlyAnalysis
      ? checkedDims[1]
      : (checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1');
    const primaryDim = checkedDims[0] || fieldsList.find(f => f.category === 'Dimensions')?.name || fieldsList.find(f => f.category === 'Dates')?.name || fieldsList[0]?.name;

    const type = targetWidget.type;

    let isConfigWarning = false;
    let configWarningMessage = '';

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
    } else if (type === 'pie' && checkedDims.length < 1) {
      isConfigWarning = true;
      configWarningMessage = 'Donut chart requires at least 1 Dimension.';
    } else if (type === 'kpi' && checkedMetrics.length < 1 && checkedDims.length < 2) {
      isConfigWarning = true;
      configWarningMessage = 'Card visual requires at least 1 Metric to summarize.';
    }

    if (isConfigWarning) {
      setWidgets(prev => prev.map(w => w.id === widgetId ? {
        ...w,
        title: `${type.toUpperCase()} Visual (Configuration Pending)`,
        isConfigWarning,
        configWarningMessage,
        data: [],
        sql: '-- Column selections pending',
        thinking: ['Waiting for correct dimension and metric selections in the left sidebar fields list.']
      } : w));
      return;
    }

    // compile SQL query
    let sql = '';
    let title = '';
    
    if (type === 'kpi') {
      const extraCols = checkedFields
        .filter(f => f !== primaryMetric)
        .map(f => {
          const isMetric = fieldsList.some(af => af.name === f && af.category === 'Metrics');
          return isMetric ? `${buildAggExpr('SUM', f)} AS "${f}"` : `ANY_VALUE(${getColExpr(f)}) AS "${f}"`;
        });
      const selection = [
        isDimOnlyAnalysis ? `COUNT(${getColExpr(primaryMetric)}) AS value` : `${buildAggExpr('SUM', primaryMetric)} AS value`,
        ...extraCols
      ].join(', ');
      sql = `SELECT ${selection} FROM data`;
      title = isDimOnlyAnalysis ? `Count of ${primaryMetric}` : `Total ${primaryMetric}`;
    } else if (type === 'table') {
      const colsToSelect = fields.length > 0 
        ? fields.map(f => `${getColExpr(f)} AS "${f}"`).join(', ')
        : fieldsList.slice(0, 4).map(f => `${getColExpr(f.name)} AS "${f.name}"`).join(', ');
      sql = `SELECT ${colsToSelect} FROM data LIMIT 50`;
      title = `Dataset Sample Ledger`;
    } else if (type === 'line') {
      const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(primaryDim)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(primaryDim)} AS DATE) WHEN TRY_CAST(${getColExpr(primaryDim)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(primaryDim)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
      const dateExpr = isDateColumn(primaryDim)
        ? `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(primaryDim)} AS VARCHAR))`
        : `CAST(${getColExpr(primaryDim)} AS VARCHAR)`;

      if (isDimOnlyAnalysis) {
        sql = `SELECT ${dateExpr} AS label, COUNT(${getColExpr(primaryMetric)}) AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
        title = `Count of ${primaryMetric} by ${primaryDim}`;
      } else if (checkedMetrics.length > 1) {
        const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
        sql = `SELECT ${dateExpr} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
        title = `Metrics Trend by ${primaryDim}`;
      } else {
        sql = `SELECT ${dateExpr} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
        title = `${primaryMetric} Trend by ${primaryDim}`;
      }
    } else if (type === 'stacked_bar') {
      if (checkedDims.length >= 2) {
        sql = `SELECT ${getColExpr(checkedDims[0])} AS label, * EXCLUDE (${getColExpr(checkedDims[0])}) FROM (PIVOT data ON ${getColExpr(checkedDims[1])} USING ${buildAggExpr('SUM', primaryMetric)} GROUP BY ${getColExpr(checkedDims[0])}) LIMIT 15`;
        title = `${primaryMetric} by ${checkedDims[0]} (Stacked by ${checkedDims[1]})`;
      } else if (checkedMetrics.length > 1) {
        const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
        title = `Comparison by ${primaryDim}`;
      } else {
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
        title = `${primaryMetric} by ${primaryDim}`;
      }
    } else if (type === 'map') {
      const geoDim = checkedDims.find(d => ['country', 'state', 'city', 'region', 'postal', 'zip'].some(keyword => d.toLowerCase().includes(keyword))) || primaryDim;
      if (checkedMetrics.length > 1) {
        const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
        sql = `SELECT ${getColExpr(geoDim)} AS label, ${metricSelections} FROM data GROUP BY 1 LIMIT 100`;
        title = `Metrics by Geographic Location (${geoDim})`;
      } else {
        sql = `SELECT ${getColExpr(geoDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 30`;
        title = `${primaryMetric} by Geographic Location (${geoDim})`;
      }
    } else if (type === 'scatter') {
      const xMetric = checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
      const yMetric = checkedMetrics[1] || fieldsList.find(f => f.category === 'Metrics' && f.name !== xMetric)?.name || xMetric;
      sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('AVG', xMetric)} AS x_val, ${buildAggExpr('AVG', yMetric)} AS y_val FROM data GROUP BY 1 LIMIT 50`;
      title = `${yMetric} vs ${xMetric} Correlation by ${primaryDim}`;
    } else if (type === 'bubble') {
      const xMetric = checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
      const yMetric = checkedMetrics[1] || fieldsList.find(f => f.category === 'Metrics' && f.name !== xMetric)?.name || xMetric;
      const zMetric = checkedMetrics[2] || fieldsList.find(f => f.category === 'Metrics' && f.name !== xMetric && f.name !== yMetric)?.name || xMetric;
      sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('AVG', xMetric)} AS x_val, ${buildAggExpr('AVG', yMetric)} AS y_val, ${buildAggExpr('SUM', zMetric)} AS size_val FROM data GROUP BY 1 LIMIT 50`;
      title = `${yMetric} vs ${xMetric} Bubble Matrix by ${primaryDim}`;
    } else if (type === 'combo') {
      const barMetric = checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
      const lineMetric = checkedMetrics[1] || fieldsList.find(f => f.category === 'Metrics' && f.name !== barMetric)?.name || barMetric;
      sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', barMetric)} AS bar_val, ${buildAggExpr('AVG', lineMetric)} AS line_val FROM data GROUP BY 1 ORDER BY bar_val DESC LIMIT 15`;
      title = `${barMetric} & ${lineMetric} Combo Analysis by ${primaryDim}`;
    } else if (type === 'hbar') {
      if (isDimOnlyAnalysis) {
        sql = `SELECT ${getColExpr(primaryDim)} AS label, COUNT(${getColExpr(primaryMetric)}) AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
        title = `Count of ${primaryMetric} by ${primaryDim}`;
      } else {
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
        title = `${primaryMetric} Distribution by ${primaryDim}`;
      }
    } else {
      if (isDimOnlyAnalysis) {
        sql = `SELECT ${getColExpr(primaryDim)} AS label, COUNT(${getColExpr(primaryMetric)}) AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
        title = `Count of ${primaryMetric} by ${primaryDim}`;
      } else if (checkedDims.length > 1) {
        const concatDims = checkedDims.map(d => `COALESCE(CAST(${getColExpr(d)} AS VARCHAR), '')`).join(" || ' - ' || ");
        sql = `SELECT ${concatDims} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY ${checkedDims.map(d => getColExpr(d)).join(', ')} ORDER BY value DESC LIMIT 15`;
        title = `${primaryMetric} by ${checkedDims.join(' & ')}`;
      } else if (checkedMetrics.length > 1) {
        const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
        title = `Comparison by ${primaryDim}`;
      } else {
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
        title = `${primaryMetric} by ${primaryDim}`;
      }
    }

    try {
      const sqlResult = await canvasService.executeSql(selectedDatasetId, selectedVersionId || '', sql);
      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        
        let value: string | undefined = undefined;
        let subtext: string | undefined = undefined;
        let chartData = queryData;
        let xAxisKey: string | undefined = 'label';
        let yAxisKey: string | undefined = 'value';

        if (type === 'kpi') {
          const firstRow = queryData[0] || {};
          const hasLabel = firstRow.label !== undefined && firstRow.label !== null;
          const kpiVal = firstRow.value ?? firstRow.VALUE ?? 0;
          
          if (hasLabel) {
            value = String(firstRow.label);
            subtext = `${prettifyLabel(primaryMetric)}: ${formatKpiValue(kpiVal, primaryMetric, 'SUM')}`;
          } else {
            value = formatKpiValue(kpiVal, primaryMetric, 'SUM');
            subtext = formatKpiSubtext(primaryMetric, 'SUM');
          }
          chartData = [];
        } else if (type === 'pie') {
          const rowKeys = Object.keys(queryData[0] || {});
          xAxisKey = rowKeys.find(k => k.toLowerCase() === 'label') || rowKeys[0] || 'name';
          yAxisKey = rowKeys.find(k => k.toLowerCase() === 'value') || rowKeys[1] || 'val';
        } else if (type === 'bar' || type === 'line') {
          const rowKeys = Object.keys(queryData[0] || {});
          xAxisKey = rowKeys.find(k => k.toLowerCase() === 'label') || rowKeys[0] || 'label';
          yAxisKey = rowKeys.find(k => k.toLowerCase() === 'value') || rowKeys[1] || 'value';
        }

        setWidgets(prev => prev.map(w => w.id === widgetId ? {
          ...w,
          title: beautifyTitle(title),
          sql,
          data: chartData,
          value,
          subtext,
          xAxisKey,
          yAxisKey,
          isConfigWarning: false,
          configWarningMessage: '',
          targetMetricName: checkedMetrics.length > 0 ? checkedMetrics.join(', ') : primaryMetric,
          targetDimName: type !== 'kpi' ? primaryDim : undefined,
          thinking: [`Compiled widget successfully targeting SQL query: ${title}`]
        } : w));
      }
    } catch (err) {
      console.error("Recompiling selected widget failed:", err);
    }
  };

  // Field selection auto-visual creation logic (Tableau-style multi-select)
  const handleFieldToggle = (fieldName: string) => {
    const fieldObj = fieldsList.find(f => f.name === fieldName);
    if (!fieldObj) return;

    let nextChecked = [...checkedFields];
    if (nextChecked.includes(fieldName)) {
      nextChecked = nextChecked.filter(f => f !== fieldName);
    } else {
      nextChecked.push(fieldName);
    }
    
    setCheckedFields(nextChecked);
    addLog(`PowerBI Fields updated: Active Selection: [${nextChecked.join(', ')}]`);

    if (selectedWidgetId) {
      recompileWidget(selectedWidgetId, nextChecked);
    }

    // Dynamic Visual generator when selected combination changes
    if (nextChecked.length >= 2) {
      const activeMetrics = nextChecked.filter(f => fieldsList.some(af => af.name === f && af.category === 'Metrics'));
      const activeDimensions = nextChecked.filter(f => fieldsList.some(af => af.name === f && af.category === 'Dimensions'));
      
      if (activeMetrics.length > 0 && activeDimensions.length > 0) {
        addLog(`System suggestions: Compiling dynamic visual matching (${activeMetrics.join(' + ')} × ${activeDimensions.join(' + ')})...`);
      }
    }
  };

  const handleDeleteField = (fieldName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteFieldId(fieldName);
    setShowDeleteFieldModal(true);
  };

  const executeDeleteField = async () => {
    if (!deleteFieldId || !selectedDatasetId) return;
    
    try {
      // Call backend to delete the field from schema
      const updatedSchema = await canvasService.deleteField(selectedDatasetId, deleteFieldId);
      
      // Update local state with the returned schema
      if (updatedSchema && updatedSchema.columns) {
        const updatedCols = updatedSchema.columns.map((c: any) => ({
          name: c.name,
          dtype: c.dtype,
          category: c.category,
          type: c.dtype.toLowerCase(),
          formula: c.formula
        }));
        setFieldsList(updatedCols);
      } else {
        setFieldsList(prev => prev.filter(f => f.name !== deleteFieldId));
      }
      
      setCheckedFields(prev => prev.filter(f => f !== deleteFieldId));
      setGeoFilters(prev => {
        const next = { ...prev };
        delete next[deleteFieldId];
        return next;
      });
      toast.success(`Field "${deleteFieldId}" deleted successfully`);
      addLog(`Field "${deleteFieldId}" deleted.`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to delete field: ${err.response?.data?.detail || err.message}`);
    } finally {
      setShowDeleteFieldModal(false);
      setDeleteFieldId(null);
    }
  };

  // Rule-based prompt compilation engine replaced with real stateless Canvas compiler
  const handleAIPromptSubmit = async (promptText: string) => {
    if (!promptText.trim()) return;
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    setIsCompiling(true);
    setActiveStepIndex(0);
    setCompilationSteps([
      "Analyzing dataset version...",
      "Running SQL sandbox parser...",
      "Executing projection logic...",
      "Compiling final visualization widget..."
    ]);
    setCompiledSql('');
    setCompiledResult('');
    addLog(`AI Parsing prompt query: "${promptText}"`);

    // Use a timer to progress steps dynamically
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep = Math.min(currentStep + 1, 3);
      setActiveStepIndex(currentStep);
    }, 700);

    try {
      addLog("Executing stateless Canvas prompt compilation...");
      const res = await canvasService.compilePrompt(
        selectedDatasetId,
        selectedVersionId || null,
        promptText,
        false
      );

      clearInterval(interval);
      setActiveStepIndex(3);

      if (res.success) {
        const sql = res.sql || '';
        const chartSpec = res.chart || {};
        const rowsCount = chartSpec.chart?.data?.rows?.length || chartSpec.chart?.data?.series?.length || 0;
        const sqlExecutionSummary = `Executed successfully: ${rowsCount} records retrieved.`;
        
        setCompiledSql(sql);
        setCompiledResult(sqlExecutionSummary);

        const newWidget = chartSpecToCanvasWidget(
          chartSpec,
          promptText,
          sql,
          [
            "Analyzing dataset version...",
            "Running SQL sandbox parser...",
            "Executing projection logic...",
            "Compiling final visualization widget..."
          ],
          sqlExecutionSummary
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
        addLog("AI processed request but did not generate a chart. Error: " + res.error);
        toast.error("Prompt did not result in a queryable chart. Try asking for trends or comparisons.");
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      addLog(`ERROR: Pipeline execution failed: ${err.message || err}`);
      toast.error("Execution failed. Please verify the query and try again.");
    } finally {
      setIsCompiling(false);
      setActiveStepIndex(-1);
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
    if (!confirm("Are you sure you want to clear the entire canvas?")) return;
    setWidgets([]);
    setPast([]);
    setFuture([]);
    addLog('Canvas cleared.');
  };

  const handleExportVisuals = async (format: 'png' | 'svg' | 'json' = 'png') => {
    if (!canvasContainerRef.current) return;
    toast.loading(`Exporting canvas as ${format.toUpperCase()}...`, { id: 'export-toast' });
    
    // We add a short timeout to ensure the UI is fully stable before capturing
    setTimeout(async () => {
      if (format === 'json') {
        const config = { widgets, past, future };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        download(blob, 'vizzy-canvas-export.json');
        toast.success("Canvas exported successfully as JSON!", { id: 'export-toast' });
        addLog("Export success! Canvas saved as JSON config.");
        return;
      }

      // Lazy-load html-to-image only when user actually exports
      const htmlToImage = await import('html-to-image');

      setIsExporting(true);
      // Give React time to apply responsive grid layout for export
      setTimeout(() => {
        const element = canvasContainerRef.current as HTMLElement;
        
        // When responsive, use the scroll dimensions of the container
        const exportWidth = element.scrollWidth;
        const exportHeight = Math.max(element.scrollHeight, 800); // Ensure minimum height

        const options = { 
          backgroundColor: '#111111',
          pixelRatio: 2, // High resolution
          width: exportWidth,
          height: exportHeight,
          style: {
            transform: 'none' // reset any scaling during export if needed
          }
        };

        const promise = format === 'svg' 
          ? htmlToImage.toSvg(element, options)
          : htmlToImage.toPng(element, options);

        promise
        .then((dataUrl) => {
          let finalUrl = dataUrl;
          if (format === 'svg') {
            const parts = dataUrl.split(',');
            if (parts.length > 1) {
              finalUrl = parts[0] + ',' + encodeURIComponent(decodeURIComponent(parts[1]));
            }
          }
          download(finalUrl, `vizzy-canvas-export.${format}`);
          toast.success(`Canvas exported successfully as ${format.toUpperCase()}!`, { id: 'export-toast' });
          addLog(`Export success! Canvas saved as high-res ${format.toUpperCase()}.`);
        })
        .catch((error) => {
          console.error('Error exporting canvas:', error);
          toast.error("Failed to export canvas.", { id: 'export-toast' });
          addLog("Export failed.");
        })
        .finally(() => {
          setIsExporting(false);
        });
      }, 300);
    }, 100);
  };

  // Add default visual from Fields / Palette clicking using live query compiler
  const handleAddDefaultVisual = async (type: 'kpi' | 'bar' | 'stacked_bar' | 'line' | 'pie' | 'donut' | 'table' | 'map' | 'scatter' | 'bubble' | 'combo' | 'hbar') => {
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first.");
      return;
    }

    // Filter checked fields into metrics and dimensions/dates
    const checkedMetrics = checkedFields.filter(f => fieldsList.some(af => af.name === f && af.category === 'Metrics'));
    const checkedDims = checkedFields.filter(f => fieldsList.some(af => af.name === f && (af.category === 'Dimensions' || af.category === 'Dates')));

    let isConfigWarning = false;
    let configWarningMessage = '';

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
        width: type === 'kpi' ? 'third' as const : 'half' as const,
        position: initialPos,
        color,
        isConfigWarning,
        configWarningMessage,
        sql: '-- Column selections pending',
        thinking: ['Select valid fields in the left pane to initialize this widget.']
      };

      setWidgets(prev => [...prev, placeholderWidget]);
      setSelectedWidgetId(id);
      addLog(`Created empty ${type} template. Select columns in the sidebar to populate.`);
      return;
    }

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
        const extraCols = checkedFields
          .filter(f => f !== primaryMetric)
          .map(f => {
            const isMetric = fieldsList.some(af => af.name === f && af.category === 'Metrics');
            return isMetric ? `${buildAggExpr('SUM', f)} AS "${f}"` : `ANY_VALUE(${getColExpr(f)}) AS "${f}"`;
          });
        const selection = [
          isDimOnlyAnalysis ? `COUNT(${getColExpr(primaryMetric)}) AS value` : `${buildAggExpr('SUM', primaryMetric)} AS value`,
          ...extraCols
        ].join(', ');
        sql = `SELECT ${selection} FROM data`;
        title = isDimOnlyAnalysis ? `Count of ${primaryMetric}` : `Total ${primaryMetric}`;
      } else if (type === 'table') {
        // Table renders the checked columns in order, or slices first 4 from dataset
        const colsToSelect = checkedFields.length > 0 
          ? checkedFields.map(f => `${getColExpr(f)} AS "${f}"`).join(', ')
          : fieldsList.slice(0, 4).map(f => `${getColExpr(f.name)} AS "${f.name}"`).join(', ');
        sql = `SELECT ${colsToSelect} FROM data LIMIT 50`;
        title = `Dataset Sample Ledger`;
      } else if (type === 'line') {
        const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(primaryDim)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(primaryDim)} AS DATE) WHEN TRY_CAST(${getColExpr(primaryDim)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(primaryDim)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
        const dateExpr = isDateColumn(primaryDim)
          ? `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(primaryDim)} AS VARCHAR))`
          : `CAST(${getColExpr(primaryDim)} AS VARCHAR)`;

        if (isDimOnlyAnalysis) {
          sql = `SELECT ${dateExpr} AS label, COUNT(${getColExpr(primaryMetric)}) AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 30`;
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
      } else if (type === 'stacked_bar') {
        if (checkedDims.length >= 2) {
          sql = `SELECT ${getColExpr(checkedDims[0])} AS label, * EXCLUDE (${getColExpr(checkedDims[0])}) FROM (PIVOT data ON ${getColExpr(checkedDims[1])} USING ${buildAggExpr('SUM', primaryMetric)} GROUP BY ${getColExpr(checkedDims[0])}) LIMIT 15`;
          title = `${primaryMetric} by ${checkedDims[0]} (Stacked by ${checkedDims[1]})`;
        } else if (checkedMetrics.length > 1) {
          const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
          sql = `SELECT ${getColExpr(primaryDim)} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
          title = `Comparison by ${primaryDim}`;
        } else {
          sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${primaryDim}`;
        }
      } else if (type === 'map') {
        const geoDim = checkedDims.find(d => ['country', 'state', 'city', 'region', 'postal', 'zip'].some(keyword => d.toLowerCase().includes(keyword))) || primaryDim;
        if (checkedMetrics.length > 1) {
          const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
          sql = `SELECT ${getColExpr(geoDim)} AS label, ${metricSelections} FROM data GROUP BY 1 LIMIT 100`;
          title = `Metrics by Geographic Location (${geoDim})`;
        } else {
          sql = `SELECT ${getColExpr(geoDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 30`;
          title = `${primaryMetric} by Geographic Location (${geoDim})`;
        }
      } else if (type === 'scatter') {
        const xMetric = checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
        const yMetric = checkedMetrics[1] || fieldsList.find(f => f.category === 'Metrics' && f.name !== xMetric)?.name || xMetric;
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('AVG', xMetric)} AS x_val, ${buildAggExpr('AVG', yMetric)} AS y_val FROM data GROUP BY 1 LIMIT 50`;
        title = `${yMetric} vs ${xMetric} Correlation by ${primaryDim}`;
      } else if (type === 'bubble') {
        const xMetric = checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
        const yMetric = checkedMetrics[1] || fieldsList.find(f => f.category === 'Metrics' && f.name !== xMetric)?.name || xMetric;
        const zMetric = checkedMetrics[2] || fieldsList.find(f => f.category === 'Metrics' && f.name !== xMetric && f.name !== yMetric)?.name || xMetric;
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('AVG', xMetric)} AS x_val, ${buildAggExpr('AVG', yMetric)} AS y_val, ${buildAggExpr('SUM', zMetric)} AS size_val FROM data GROUP BY 1 LIMIT 50`;
        title = `${yMetric} vs ${xMetric} Bubble Matrix by ${primaryDim}`;
      } else if (type === 'combo') {
        const barMetric = checkedMetrics[0] || fieldsList.find(f => f.category === 'Metrics')?.name || '1';
        const lineMetric = checkedMetrics[1] || fieldsList.find(f => f.category === 'Metrics' && f.name !== barMetric)?.name || barMetric;
        sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', barMetric)} AS bar_val, ${buildAggExpr('AVG', lineMetric)} AS line_val FROM data GROUP BY 1 ORDER BY bar_val DESC LIMIT 15`;
        title = `${barMetric} & ${lineMetric} Combo Analysis by ${primaryDim}`;
      } else if (type === 'hbar') {
        if (isDimOnlyAnalysis) {
          sql = `SELECT ${getColExpr(primaryDim)} AS label, COUNT(${getColExpr(primaryMetric)}) AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else {
          sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} Distribution by ${primaryDim}`;
        }
      } else {
        // Bar/Pie Chart
        if (isDimOnlyAnalysis) {
          sql = `SELECT ${getColExpr(primaryDim)} AS label, COUNT(${getColExpr(primaryMetric)}) AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `Count of ${primaryMetric} by ${primaryDim}`;
        } else if (checkedDims.length > 1) {
          // Composite dimension grouping (e.g. Region - Segment)
          const concatDims = checkedDims.map(d => `COALESCE(CAST(${getColExpr(d)} AS VARCHAR), '')`).join(" || ' - ' || ");
          sql = `SELECT ${concatDims} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY ${checkedDims.map(d => getColExpr(d)).join(', ')} ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${checkedDims.join(' & ')}`;
        } else if (checkedMetrics.length > 1) {
          // Multiple metrics over a single dimension
          const metricSelections = checkedMetrics.map(m => `${buildAggExpr('SUM', m)} AS "${m}"`).join(', ');
          sql = `SELECT ${getColExpr(primaryDim)} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${checkedMetrics[0]}" DESC LIMIT 15`;
          title = `Comparison by ${primaryDim}`;
        } else {
          sql = `SELECT ${getColExpr(primaryDim)} AS label, ${buildAggExpr('SUM', primaryMetric)} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT 15`;
          title = `${primaryMetric} by ${primaryDim}`;
        }
      }

      // Execute SQL query against DuckDB sandbox
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
          const hasLabel = firstRow.label !== undefined && firstRow.label !== null;
          const kpiVal = firstRow.value ?? firstRow.VALUE ?? 0;
          
          if (hasLabel) {
            value = String(firstRow.label);
            subtext = `${prettifyLabel(primaryMetric)}: ${formatKpiValue(kpiVal, primaryMetric, 'SUM')}`;
          } else {
            value = formatKpiValue(kpiVal, primaryMetric, 'SUM');
            subtext = formatKpiSubtext(primaryMetric, 'SUM');
          }
          chartData = [];
        } else if (type === 'pie' || type === 'donut') {
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
      const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(realDim)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(realDim)} AS DATE) WHEN TRY_CAST(${getColExpr(realDim)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(realDim)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
      
      if (grain === 'year') {
        grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y'), regexp_extract(CAST(${getColExpr(realDim)} AS VARCHAR), '\\d{4}'))`;
      } else if (grain === 'quarter') {
        grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-Q') || CAST(quarter(${fallbackDate}) AS VARCHAR), CAST(${getColExpr(realDim)} AS VARCHAR))`;
      } else if (grain === 'month') {
        grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(realDim)} AS VARCHAR))`;
      } else {
        grainExpr = `COALESCE(CAST(${fallbackDate} AS VARCHAR), CAST(${getColExpr(realDim)} AS VARCHAR))`;
      }

      // Always alias output as label/value for consistent key mapping
      const currentAgg = widget.activeAgg || 'SUM';
      const metrics = realMetric.split(',').map(s => s.trim());
      let sql = '';
      if (metrics.length > 1) {
        const metricSelections = metrics.map(m => `${buildAggExpr(currentAgg, m, '1')} AS "${m}"`).join(', ');
        sql = `SELECT ${grainExpr} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
      } else {
        sql = `SELECT ${grainExpr} AS label, ${buildAggExpr(currentAgg, realMetric)} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
      }
      
      addLog(`Executing Canvas grain query: ${sql}`);
      const sqlResult = await canvasService.executeSql(selectedDatasetId, selectedVersionId || '', sql);
      
      if (sqlResult && !sqlResult.error && sqlResult.results) {
        const queryData = sqlResult.results || [];
        setWidgets(prev => prev.map(w => w.id === widgetId ? {
          ...w,
          data: queryData,
          sql: sql,
          activeGrain: grain,
          xAxisKey: 'label',
          yAxisKey: metrics.length > 1 ? (w.yAxisKey || metrics[0]) : 'value'
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

  // Dynamic number formatting modifier (Right-click format hover actions)
  const handleWidgetFormatChange = (widgetId: string, formatConfig: NumberFormatConfig) => {
    setWidgets(prev => prev.map(w => {
      if (w.id !== widgetId) return w;
      
      const updatedWidget = {
        ...w,
        numberFormat: formatConfig
      };
      
      if (updatedWidget.type === 'kpi' && updatedWidget.data && updatedWidget.data.length > 0) {
        const firstRow = updatedWidget.data[0];
        const numericKey = Object.keys(firstRow).find(k => typeof firstRow[k] === 'number');
        const rawValue = numericKey ? firstRow[numericKey] : (parseFloat(String(updatedWidget.value).replace(/[^0-9.-]/g, '')) || 0);
        const metricLabel = updatedWidget.targetMetricName || updatedWidget.yAxisKey || numericKey || '';
        updatedWidget.value = formatKpiValue(rawValue, metricLabel, updatedWidget.activeAgg || 'SUM', formatConfig);
      } else if (updatedWidget.type === 'kpi' && updatedWidget.value) {
        const rawValue = parseFloat(String(updatedWidget.value).replace(/[^0-9.-]/g, ''));
        if (!isNaN(rawValue)) {
          const metricLabel = updatedWidget.targetMetricName || updatedWidget.yAxisKey || '';
          updatedWidget.value = formatKpiValue(rawValue, metricLabel, updatedWidget.activeAgg || 'SUM', formatConfig);
        }
      }
      return updatedWidget;
    }));
    addLog(`Updated format configuration to ${formatConfig.type} for visual.`);
  };

  // Tableau-style measure aggregation modifier (Right-click action)
  const handleWidgetAggregationChange = async (widgetId: string, agg: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT' | 'VAR_SAMP' | 'PERCENT_CHANGE') => {
    if (!selectedDatasetId) return;
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;

    addLog(`Re-compiling widget measure to aggregation: '${agg}'...`);
    setIsCompiling(true);

    try {
      // Resolve REAL column names (not aliased keys) for SQL generation
      const metrics = widget.targetMetricName 
        ? widget.targetMetricName.split(',').map(s => s.trim()) 
        : [fieldsList.find(f => f.category === 'Metrics')?.name || '1'];
      const dimension = widget.targetDimName || fieldsList.find(f => f.category === 'Dimensions')?.name || 'label';
      
      let sql = '';
      let title = '';

      if (widget.type === 'kpi') {
        const metric = metrics[0];
        sql = `SELECT ${buildAggExpr(agg, metric)} AS value FROM data`;
        title = agg === 'PERCENT_CHANGE' ? `% Change of ${metric}` : `${agg.charAt(0) + agg.slice(1).toLowerCase()} of ${metric}`;
      } else if (metrics.length > 1) {
        const labelExpr = getColExpr(dimension);
        const metricSelections = metrics.map(m => `${buildAggExpr(agg, m, '1')} AS "${m}"`).join(', ');
        
        if (widget.type === 'line') {
          const grain = widget.activeGrain || 'month';
          const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(dimension)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(dimension)} AS DATE) WHEN TRY_CAST(${getColExpr(dimension)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(dimension)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
          
          let grainExpr = '';
          if (grain === 'year') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y'), CAST(regexp_extract(${getColExpr(dimension)}, '\\d{4}') AS VARCHAR))`;
          } else if (grain === 'quarter') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-Q') || CAST(quarter(${fallbackDate}) AS VARCHAR), CAST(${getColExpr(dimension)} AS VARCHAR))`;
          } else if (grain === 'month') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(dimension)} AS VARCHAR))`;
          } else {
            grainExpr = `COALESCE(CAST(${fallbackDate} AS VARCHAR), CAST(${getColExpr(dimension)} AS VARCHAR))`;
          }
          sql = `SELECT ${grainExpr} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
          title = `Metrics (${agg}) Trend by ${dimension}`;
        } else {
          const limitVal = widget.limit || 15;
          sql = `SELECT ${labelExpr} AS label, ${metricSelections} FROM data GROUP BY 1 ORDER BY "${metrics[0]}" DESC LIMIT ${limitVal}`;
          title = `Comparison (${agg}) by ${dimension}`;
        }
      } else {
        const metric = metrics[0];
        const labelExpr = getColExpr(dimension);
        
        if (widget.type === 'line') {
          const grain = widget.activeGrain || 'month';
          const fallbackDate = `(CASE WHEN TRY_CAST(${getColExpr(dimension)} AS DATE) IS NOT NULL THEN TRY_CAST(${getColExpr(dimension)} AS DATE) WHEN TRY_CAST(${getColExpr(dimension)} AS TIMESTAMP) IS NOT NULL THEN CAST(TRY_CAST(${getColExpr(dimension)} AS TIMESTAMP) AS DATE) ELSE NULL END)`;
          
          let grainExpr = '';
          if (grain === 'year') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y'), CAST(regexp_extract(${getColExpr(dimension)}, '\\d{4}') AS VARCHAR))`;
          } else if (grain === 'quarter') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-Q') || CAST(quarter(${fallbackDate}) AS VARCHAR), CAST(${getColExpr(dimension)} AS VARCHAR))`;
          } else if (grain === 'month') {
            grainExpr = `COALESCE(strftime(${fallbackDate}, '%Y-%m'), CAST(${getColExpr(dimension)} AS VARCHAR))`;
          } else {
            grainExpr = `COALESCE(CAST(${fallbackDate} AS VARCHAR), CAST(${getColExpr(dimension)} AS VARCHAR))`;
          }
          sql = `SELECT ${grainExpr} AS label, ${buildAggExpr(agg, metric, '1')} AS value FROM data GROUP BY 1 ORDER BY 1 ASC LIMIT 50`;
          title = agg === 'PERCENT_CHANGE' ? `% Change of ${metric} by ${dimension}` : `${metric} (${agg}) Trend by ${dimension}`;
        } else {
          const limitVal = widget.limit || 15;
          sql = `SELECT ${labelExpr} AS label, ${buildAggExpr(agg, metric, '1')} AS value FROM data GROUP BY 1 ORDER BY value DESC LIMIT ${limitVal}`;
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
          value = formatKpiValue(kpiVal, metrics[0], agg, widget.numberFormat);
          subtext = formatKpiSubtext(metrics[0], agg);
          chartData = [];
        } else if (widget.type === 'pie' || widget.type === 'donut') {
          chartData = queryData.map((r: any) => ({ name: r.label, val: r.value }));
          updatedXKey = 'name';
          updatedYKey = 'val';
        } else {
          updatedYKey = metrics.length > 1 ? metrics[0] : 'value';
        }

        setWidgets(prev => prev.map(w => w.id === widgetId ? {
          ...w,
          data: chartData,
          value,
          subtext,
          title: beautifyTitle(title),
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
            <VizzyPilotLogoIcon size={18} className="text-accent-custom shrink-0" />
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
            {selectedDatasetId && versions.length > 0 && (
              <div className="flex items-center bg-surface border border-border-custom rounded-xl p-1 shadow-xs animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-custom font-semibold bg-surface-2 px-2 py-1 rounded-lg mr-1.5">
                  <GitBranch className="w-3 h-3 text-accent-custom" />
                  Version
                </div>
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

          <div className="relative group/save flex items-center z-40">
            {loadedDashboardId ? (
              <button 
                onClick={executeSaveDashboardOverride}
                className="h-9 px-3 text-[11px] font-semibold bg-surface hover:bg-surface-2 border border-border-custom text-text-custom hover:text-accent-custom hover:border-accent-custom/55 rounded-l-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs border-r-0"
                title="Override and save changes in existing layout"
              >
                <SaveIcon className="w-3.5 h-3.5 text-accent-custom" />
                <span>Save</span>
              </button>
            ) : (
              <button 
                onClick={handleSaveDashboard}
                className="h-9 px-3.5 text-[11px] font-semibold bg-surface hover:bg-surface-2 border border-border-custom text-text-custom hover:text-accent-custom hover:border-accent-custom/55 rounded-l-full flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs border-r-0"
                title="Save layout configuration to the database"
              >
                <SaveIcon className="w-3.5 h-3.5 text-accent-custom" />
                <span>Save Layout</span>
              </button>
            )}
            
            <button 
              aria-label="Save options"
              className="h-9 px-2 bg-surface hover:bg-surface-2 border border-border-custom text-text-custom hover:text-accent-custom hover:border-accent-custom/55 rounded-r-full flex items-center justify-center transition-all cursor-pointer shadow-xs"
            >
              <ChevronDown className="w-3 h-3 text-muted-custom" />
            </button>
            
            <div className="absolute left-0 top-full mt-2 w-44 bg-surface border border-border-custom rounded-xl shadow-xl opacity-0 invisible group-hover/save:opacity-100 group-hover/save:visible transition-all z-50 flex flex-col p-1.5 font-mono text-[11px]">
              {loadedDashboardId && (
                <button 
                  onClick={handleSaveDashboard} 
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-lg text-text-custom transition-colors cursor-pointer flex items-center justify-between"
                >
                  <span>Save As New...</span>
                </button>
              )}
              <button 
                onClick={() => {
                  if (!loadedDashboardId) {
                    toast.error("Please save the dashboard once before enabling auto-save.");
                    return;
                  }
                  setAutoSaveEnabled(!autoSaveEnabled);
                  toast.success(autoSaveEnabled ? "Auto-save disabled." : "Auto-save enabled!");
                }} 
                className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-lg text-text-custom transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>Auto-Save</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${autoSaveEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted-custom/20 text-muted-custom'}`}>
                  {autoSaveEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>

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

          <div className="relative group/export">
            <button 
              className="h-9 px-4 text-[11px] font-bold bg-accent-custom hover:opacity-90 text-white rounded-full flex items-center space-x-1.5 cursor-pointer transition-all shadow-md active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Visuals</span>
            </button>
            <div className="absolute right-0 mt-2 w-40 bg-surface border border-border-custom rounded-xl shadow-xl opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-50 flex flex-col p-1.5 font-mono text-[11px]">
              <button onClick={() => handleExportVisuals('png')} className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-lg text-text-custom transition-colors cursor-pointer flex items-center justify-between group/btn">
                <span>Export as PNG</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
              </button>
              <button onClick={() => handleExportVisuals('svg')} className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-lg text-text-custom transition-colors cursor-pointer flex items-center justify-between group/btn">
                <span>Interactive SVG</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
              </button>
              <button onClick={() => handleExportVisuals('json')} className="w-full text-left px-3 py-2 hover:bg-surface-2 rounded-lg text-text-custom transition-colors cursor-pointer flex items-center justify-between group/btn">
                <span>JSON Config</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
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
                aria-label="Close Sidebar"
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
              
              <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[9px]">
                <button 
                  onClick={() => handleAddDefaultVisual('kpi')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Single metric card"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-accent-custom" />
                  <span>Card</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('bar')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Vertical bar chart"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Bar</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('hbar')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Horizontal bar list"
                >
                  <MapPin className="w-3.5 h-3.5 text-teal-500" />
                  <span>H-Bar</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('stacked_bar')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Stacked pivot bar"
                >
                  <BarChart4 className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Stacked</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('line')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Chronological trend line"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
                  <span>Line</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('pie')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Segment distribution pie"
                >
                  <PieIcon className="w-3.5 h-3.5 text-pink-500" />
                  <span>Pie</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('donut')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Segment distribution donut"
                >
                  <div className="w-3.5 h-3.5 border-2 border-pink-500 rounded-full flex items-center justify-center">
                    <div className="w-1 h-1 bg-surface rounded-full" />
                  </div>
                  <span>Donut</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('map')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Geographic regional bubbles"
                >
                  <Globe className="w-3.5 h-3.5 text-amber-500" />
                  <span>Map</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('scatter')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Metric variables correlation"
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Scatter</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('bubble')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="3-variable matrix bubble chart"
                >
                  <CircleDot className="w-3.5 h-3.5 text-violet-500" />
                  <span>Bubble</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('combo')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
                  title="Bar & Line dual axis"
                >
                  <Shuffle className="w-3.5 h-3.5 text-orange-500" />
                  <span>Combo</span>
                </button>
                <button 
                  onClick={() => handleAddDefaultVisual('table')}
                  className="p-1.5 bg-surface border border-border-custom rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-accent-custom/50 transition-all cursor-pointer"
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
               
               <div role="listbox" aria-label="Dataset fields" className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
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
                          key={field.name} draggable="true" onDragStart={(e) => { e.dataTransfer.setData("text/plain", field.name); e.dataTransfer.effectAllowed = "copyMove"; addLog(`Dragging column: "${field.name}". Drop it in the Interactive Canvas Slicers zone to filter!`); }} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, field: field }); }}
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
                          <div className="flex items-center space-x-1.5 ml-2">
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
              aria-label="Show Sidebar"
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
            <AIPromptBar 
              onSubmit={handleAIPromptSubmit} 
              isCompiling={isCompiling} 
              suggestions={PROMPT_SUGGESTIONS} 
              placeholder="Prompt AI to construct and organize widgets on your canvas... (e.g. 'Add a line chart showing trend')"
              isFullScreen={false}
            />

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
                    <div className="text-[10px] font-mono text-accent-custom px-1.5 font-bold flex items-center space-x-1">
                      <Filter className="w-2.5 h-2.5" />
                      <span>{cf.fieldName}:</span>
                    </div>
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
                      aria-label="Remove Filter"
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
                role="application"
                aria-label="Vizzy Canvas workspace"
                className="relative w-full border border-border-custom/30 rounded-2xl bg-surface-2/15 shadow-inner p-4 scrollbar-thin overflow-auto flex flex-col items-start justify-start"
                style={{ 
                  height: (isFullScreenCanvas || isPresentMode) ? 'calc(100vh - 180px)' : (isResponsive ? '100%' : '650px'),
                  minHeight: (isFullScreenCanvas || isPresentMode) ? 'calc(100vh - 180px)' : (isResponsive ? 'calc(100vh - 140px)' : '650px')
                }}
              >
                {/* Scaled Wrapper to center the scaled absolute layout responsively */}
                <div 
                  className="flex items-start justify-start mx-auto"
                  style={{
                    height: (!isResponsive && (isFullScreenCanvas || isPresentMode)) ? `${contentHeight * canvasScale}px` : 'auto',
                    width: (!isResponsive && (isFullScreenCanvas || isPresentMode)) ? `${contentWidth * canvasScale}px` : '100%',
                    overflow: 'visible'
                  }}
                >
                  {/* Independent high-resolution Canvas Workspace sheet */}
                  <div 
                    onPointerDown={handleCanvasPointerDown}
                    onClick={(e) => {
                      if (hasDraggedRef.current) {
                        hasDraggedRef.current = false;
                        return;
                      }
                      if (e.target === e.currentTarget) {
                        setSelectedWidgetId(null);
                        setSelectedWidgetIds([]);
                        setCheckedFields([]);
                      }
                    }}
                    className={`relative ${isResponsive ? 'transition-all duration-300' : ''} ${
                    isResponsive 
                      ? 'w-full bg-transparent border-0 shadow-none grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max' 
                      : 'bg-surface rounded-xl border border-dashed border-border-custom/80 shadow-md origin-top-left shrink-0'
                  }`}
                  style={{
                    width: isResponsive ? '100%' : ((isFullScreenCanvas || isPresentMode) ? `${contentWidth}px` : '2400px'),
                    height: isResponsive ? 'auto' : ((isFullScreenCanvas || isPresentMode) ? `${contentHeight}px` : '1600px'),
                    minHeight: isResponsive ? '100%' : ((isFullScreenCanvas || isPresentMode) ? `${contentHeight}px` : '1600px'),
                    backgroundImage: (showGridlines && !isResponsive) 
                      ? (isDark 
                          ? 'radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px)' 
                          : 'radial-gradient(rgba(0, 0, 0, 0.04) 1.2px, transparent 1.2px)')
                      : undefined,
                    backgroundSize: '16px 16px',
                    transform: (!isResponsive && (isFullScreenCanvas || isPresentMode)) ? `scale(${canvasScale})` : 'translateZ(0)',
                    transformOrigin: 'top left',
                    willChange: 'transform'
                  }}
                >
                  <AnimatePresence mode="popLayout">
                  {/* Sort widgets logically by Y then X for responsive flow */}
                  {widgets.slice().sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0)).map((widget) => {
                    const isSelected = selectedWidgetIds.includes(widget.id) || selectedWidgetId === widget.id;
                    const width = widget.customWidth ?? (widget.type === 'kpi' ? 245 : 375);
                    const height = widget.customHeight ?? (widget.type === 'kpi' ? 120 : 230);

                    // Compute dynamic KPI values
                    const kpiData = widget.type === 'kpi' 
                      ? getDisplayKPI(widget) 
                      : { value: widget.value, subtext: widget.subtext, extraDetails: [] as { label: string; value: string }[] };

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
                        id={`widget-card-${widget.id}`}
                        data-widget-id={widget.id}
                        role="region"
                        aria-label={`Chart: ${widget.title}`}
                        tabIndex={0}
                        aria-selected={selectedWidgetIds.includes(widget.id)}
                        className={`canvas-widget group bg-surface border rounded-2xl ${widget.type === 'kpi' ? 'p-3' : 'p-4'} shadow-sm flex flex-col justify-between overflow-hidden transition-colors transition-shadow duration-150 select-none touch-none ${
                          isResponsive ? 'relative w-full' : 'absolute'
                        } ${
                          isPresentMode
                            ? 'border-border-custom/50 shadow-md'
                            : isSelected 
                              ? 'border-accent-custom ring-2 ring-accent-custom/20 shadow-md' 
                              : 'border-border-custom hover:border-border-custom/80'
                        }`}
                        style={{
                          left: isResponsive ? 'auto' : `${widget.position?.x ?? 20}px`,
                          top: isResponsive ? 'auto' : `${widget.position?.y ?? 20}px`,
                          width: isResponsive ? '100%' : `${width}px`,
                          height: isResponsive ? `${Math.max(height, 250)}px` : `${height}px`,
                          zIndex: isSelected && !isPresentMode ? 30 : 10
                        }}
                        onClick={(e) => {
                          if (isPresentMode) return;
                          e.stopPropagation();
                          if (e.shiftKey) {
                            setSelectedWidgetIds(prev => {
                              if (prev.includes(widget.id)) {
                                const next = prev.filter(id => id !== widget.id);
                                if (selectedWidgetId === widget.id) {
                                  setSelectedWidgetId(next[0] || null);
                                }
                                return next;
                              } else {
                                setSelectedWidgetId(widget.id);
                                return [...prev, widget.id];
                              }
                            });
                          } else {
                            setSelectedWidgetId(widget.id);
                            setSelectedWidgetIds([widget.id]);
                          }
                        }}
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
                        {/* Accent gradient bar for KPI cards */}
                        {widget.type === 'kpi' && (
                          <div 
                            className="absolute top-0 left-0 w-1 h-full rounded-l-2xl opacity-80 pointer-events-none"
                            style={{ background: `linear-gradient(180deg, ${widget.color}, ${widget.color}44)` }}
                          />
                        )}
                        {/* Upper controls toolbar */}
                        {isPresentMode ? (
                          <div className={`flex items-center justify-between mb-2 pb-1.5 text-left ${widget.type === 'kpi' ? '' : 'border-b border-border-custom/30'}`}>
                            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                              <span className="text-[10px] font-mono text-text-custom font-bold uppercase tracking-wider whitespace-normal break-words" title={widget.title}>
                                {widget.title}
                              </span>
                              {isSlicerMissing && (
                                <div className="group relative flex items-center">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500/80" />
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
                            className={`flex items-center justify-between mb-1.5 pb-1 cursor-grab active:cursor-grabbing ${widget.type === 'kpi' ? '' : 'border-b border-border-custom/50'}`}
                            title="Click & Drag header to position anywhere on canvas"
                          >
                            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                              <Move className="w-3.5 h-3.5 text-accent-custom shrink-0" />
                              <span className="text-[10px] font-mono text-text-custom font-semibold uppercase tracking-wider whitespace-normal break-words" title={widget.title}>
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
                                aria-label="Format size and positioning bounds"
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
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Delete widget"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteWidget(widget.id, widget.title);
                                }}
                                className="p-1 hover:bg-red-500/10 border border-red-500/20 text-red-500 rounded-md transition-all cursor-pointer z-20"
                                title="Delete component"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}


                        {/* PowerBI Style Geometry Adjuster Overlay */}
                        {editingWidgetId === widget.id && (
                          <div 
                            className="absolute inset-0 bg-surface/98 z-40 p-3 flex flex-col justify-between border border-accent-custom/30 rounded-2xl animate-in fade-in zoom-in-95 duration-150 text-left select-none overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div>
                              <div className="flex items-center justify-between border-b border-border-custom/50 pb-1 mb-2">
                                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-accent-custom flex items-center space-x-1">
                                  <Settings2 className="w-2.5 h-2.5" />
                                  <span>Visual Properties</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setEditingWidgetId(null)}
                                  className="text-[9px] font-mono text-accent-custom hover:underline font-bold transition-all"
                                >
                                  Done
                                </button>
                              </div>

                              {/* Title Modifier */}
                              <div className="mb-2">
                                <span className="text-[8px] text-muted-custom uppercase font-semibold block mb-1">Visual Title</span>
                                <input
                                  type="text"
                                  value={widget.title}
                                  onChange={(e) => {
                                    const newTitle = e.target.value;
                                    setWidgets(prev => prev.map(w => w.id === widget.id ? { ...w, title: newTitle } : w));
                                  }}
                                  className="w-full bg-surface-2 border border-border-custom/50 rounded px-1.5 py-0.5 text-[10px] text-text-custom focus:outline-none focus:border-accent-custom font-mono"
                                  placeholder="Edit title..."
                                />
                              </div>
                            </div>

                            {/* Control inputs */}
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-1">
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
                        <div className="flex-1 py-1 relative">
                          
                          {widget.isConfigWarning ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center border border-dashed border-amber-500/20 bg-amber-500/5 rounded-2xl space-y-1.5 select-none" style={{ height: `${height - 50}px` }}>
                              <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />
                              <div className="text-[10px] font-mono font-bold text-text-custom">Setup Required</div>
                              <div className="text-[8.5px] font-mono text-muted-custom max-w-[90%] leading-relaxed">
                                {widget.configWarningMessage}
                              </div>
                            </div>
                          ) : (
                            <>
                          
                          {/* Type 1: KPI */}
                          {widget.type === 'kpi' && (
                            <div className={`flex-1 flex flex-col justify-between min-h-0 mt-0.5 text-left relative overflow-hidden transition-all duration-300 group/kpi ${isSlicerMissing ? 'opacity-50' : ''}`}>
                              
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
                                    className="font-bold tracking-tight transition-all font-mono leading-none" 
                                    style={{ 
                                      color: (widget.numberFormat?.negativeStyle === 'red' && (String(kpiData.value).startsWith('-') || String(kpiData.value).startsWith('('))) ? '#EF4444' : widget.color,
                                      fontSize: height > 180 ? '2.5rem' : height > 140 ? '2rem' : width > 200 ? '1.8rem' : '1.4rem'
                                    }}
                                  >
                                    {kpiData.value || '—'}
                                  </div>

                                  {/* Associated Context Details (State, Profit etc.) */}
                                  {kpiData.extraDetails && kpiData.extraDetails.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5 max-w-full">
                                      {kpiData.extraDetails.map((detail, idx) => (
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
                              <div className="flex items-center justify-end w-full mt-2 pt-1.5 border-t border-border-custom/10">
                                {/* Active aggregation badge */}
                                <div 
                                  className="text-[7.5px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider"
                                  style={{ 
                                    backgroundColor: `${widget.color}08`, 
                                    borderColor: `${widget.color}20`,
                                    color: widget.color 
                                  }}
                                >
                                  {widget.activeAgg || 'SUM'}
                                </div>
                              </div>

                            </div>
                          )}

                          {/* Type 2: BAR CHART & STACKED BAR CHART */}
                          {(widget.type === 'bar' || widget.type === 'stacked_bar') && (() => {
                            const key = widget.xAxisKey || 'label';
                            const valKey = widget.yAxisKey || 'value';
                            
                            // For stacked bar or multi-metric bar, get all keys except the label key.
                            const dataKeys = (widget.type === 'stacked_bar' || (widget.type === 'bar' && widget.targetMetricName && widget.targetMetricName.includes(','))) && widget.data.length > 0
                              ? Object.keys(widget.data[0]).filter(k => k !== key && typeof widget.data[0][k] === 'number')
                              : [valKey];

                             const maxVal = Math.max(...widget.data.map(d => {
                               const values = dataKeys.map(k => Number(d[k]) || 0);
                               return widget.type === 'stacked_bar'
                                 ? values.reduce((sum, v) => sum + v, 0)
                                 : Math.max(...values, 0);
                             })) || 1;
                             
                             const paletteColors = [
                               widget.color || '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6'
                             ];

                             return (
                               <div className="flex flex-col justify-end pt-2 min-h-[40px] w-full" style={{ height: `${height - 90}px` }}>
                                 <div className="flex h-full w-full">
                                   {/* Y-axis Ticks */}
                                   <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[85%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 shrink-0 text-right min-w-[36px]">
                                     <div>{formatKpiValue(maxVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</div>
                                     <div>{formatKpiValue(maxVal / 2, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</div>
                                     <div>{formatKpiValue(0, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</div>
                                   </div>
                                   
                                   {/* Chart bars */}
                                   <div className="flex-1 flex items-end justify-around h-full border-b border-border-custom/50 pb-1.5 gap-1 pl-1">
                                     {widget.data.map((item, idx) => {
                                       const totalVal = dataKeys.reduce((sum, k) => sum + (Number(item[k]) || 0), 0);
                                       const heightPercent = maxVal ? (totalVal / maxVal) * 85 : 0;
                                     
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

                                   return (
                                     <div 
                                       key={idx} 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         const filterCol = widget.targetDimName || widget.xAxisKey || 'label';
                                         setCustomFilters(prev => {
                                           const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                           if (existing) {
                                             return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                               ...f,
                                               selectedValue: f.selectedValue === itemLabel ? null : itemLabel
                                             } : f);
                                           } else {
                                             const options = Array.from(new Set(widget.data.map(d => String(d[widget.xAxisKey || 'label'] || d[filterCol]))));
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
                                       <div className={`absolute -top-7 scale-0 group-hover/bar:scale-100 bg-surface border shadow-2xl pointer-events-none whitespace-nowrap flex flex-col items-center z-20 ${
                                         (isFullScreenCanvas || isPresentMode)
                                           ? 'px-3 py-1.5 rounded-xl border-accent-custom/50 border-2 text-[12px] space-y-0.5 -translate-y-3' 
                                           : 'px-1.5 py-0.5 rounded border-border-custom text-[9px] font-mono'
                                       }`}>
                                         {dataKeys.length > 1 ? (
                                           <div className="flex flex-col items-start space-y-0.5">
                                             <span className={`font-bold border-b border-border-custom/50 pb-0.5 w-full ${isFullScreenCanvas || isPresentMode ? 'text-[12px] mb-1' : 'text-[9px] mb-0.5'}`}>{_sanitizeLabel(itemLabel)}</span>
                                             {dataKeys.map(k => (
                                               <span key={k} className={isFullScreenCanvas || isPresentMode ? 'text-[11px]' : 'text-[8px] text-muted-custom'}>
                                                 {prettifyLabel(k)}: {formatKpiValue(item[k], k, widget.activeAgg, widget.numberFormat)}
                                               </span>
                                             ))}
                                           </div>
                                         ) : (
                                           <span className={isFullScreenCanvas || isPresentMode ? 'text-[12px]' : ''}>{_sanitizeLabel(itemLabel)}: {formatKpiValue(totalVal, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)}</span>
                                         )}
                                       </div>
                                      {widget.type === 'bar' && dataKeys.length > 1 ? (
                                        <div className="flex items-end gap-0.5 h-full w-full justify-center">
                                          {dataKeys.map((k, i) => {
                                            const val = Number(item[k]) || 0;
                                            const barHeight = maxVal ? (val / maxVal) * 85 : 0;
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
                                        {_sanitizeLabel(item[key]).slice(0, 8)}
                                      </span>
                                    </div>
                                  );
                                })}
                                </div>
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
                                 {(() => {
                                   if (!widget.data || widget.data.length === 0) {
                                     return <div className="text-center text-xs text-muted-custom py-8">No data points</div>;
                                   }

                                   const metrics = widget.targetMetricName
                                     ? widget.targetMetricName.split(',').map(s => s.trim())
                                     : [widget.yAxisKey || 'value'];

                                   const paletteColors = [
                                     widget.color || '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'
                                   ];

                                   const allVals: number[] = [];
                                   widget.data.forEach(d => {
                                     metrics.forEach(m => {
                                       allVals.push(Number(d[m]) || Number(d.value) || 0);
                                     });
                                   });
                                   const maxVal = Math.max(...allVals, 1);
                                   const minVal = Math.min(...allVals, 0); 
                                   const range = maxVal - minVal || 1;

                                   return (
                                     <div className="flex h-full w-full">
                                       {/* Y-axis Ticks */}
                                       <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[75%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 mt-2 shrink-0 text-right min-w-[36px]">
                                         <div>{formatKpiValue(maxVal, metrics[0], widget.activeAgg, widget.numberFormat)}</div>
                                         <div>{formatKpiValue((maxVal + minVal) / 2, metrics[0], widget.activeAgg, widget.numberFormat)}</div>
                                         <div>{formatKpiValue(minVal, metrics[0], widget.activeAgg, widget.numberFormat)}</div>
                                       </div>
                                       
                                       <div className="flex-1 relative h-full">
                                         <svg className="w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="none">
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
                                             const vals = widget.data.map(d => Number(d[m]) || Number(d.value) || 0);

                                             if (widget.data.length === 1) {
                                               const numVal = vals[0];
                                               const x = 100;
                                               const y = 90 - ((numVal - minVal) / range) * 75;
                                               const labelVal = widget.data[0][widget.xAxisKey || 'label'] || '';
                                               return (
                                                 <g key={m}>
                                                   <circle
                                                     cx={x}
                                                     cy={y}
                                                     r="5"
                                                     fill={strokeColor}
                                                     stroke="#fff"
                                                     strokeWidth="2"
                                                     className="cursor-pointer hover:opacity-80 transition-opacity duration-150"
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       const filterCol = widget.targetDimName || widget.xAxisKey || 'label';
                                                       setCustomFilters(prev => {
                                                         const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                                         if (existing) {
                                                           return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                             ...f,
                                                             selectedValue: f.selectedValue === labelVal ? null : labelVal
                                                           } : f);
                                                         } else {
                                                           const options = Array.from(new Set(widget.data.map(d => String(d[widget.xAxisKey || 'label'] || d[filterCol]))));
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
                                                         x: rect.left + rect.width / 2,
                                                         y: rect.top - 10,
                                                         content: `${_sanitizeLabel(labelVal)} (${prettifyLabel(m)}): ${formatKpiValue(numVal, m, widget.activeAgg, widget.numberFormat)}`
                                                       });
                                                     }}
                                                     onMouseLeave={() => setActiveHoverTooltip(null)}
                                                   >
                                                     <title>{`${_sanitizeLabel(labelVal)} (${prettifyLabel(m)}): ${formatKpiValue(numVal, m, widget.activeAgg, widget.numberFormat)}`}</title>
                                                   </circle>
                                                 </g>
                                               );
                                             }

                                             const segmentWidth = 180 / (widget.data.length - 1 || 1);
                                             const points = widget.data.map((item, idx) => {
                                               const x = 10 + idx * segmentWidth;
                                               const y = 90 - ((vals[idx] - minVal) / range) * 75;
                                               return { x, y };
                                             });
                                             const pathD = points.reduce((acc, p, idx) => {
                                               return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                                             }, '');
                                             const areaD = `${pathD} L 190 100 L 10 100 Z`;
                                             
                                             return (
                                               <g key={m}>
                                                 <path d={areaD} fill={`url(#grad-${widget.id}-${mIdx})`} />
                                                 <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
                                                 {points.map((p, idx) => {
                                                   const item = widget.data[idx];
                                                   const labelVal = item[widget.xAxisKey || 'label'] || '';
                                                   const numVal = vals[idx];
                                                   return (
                                                     <circle 
                                                       key={idx} 
                                                       cx={p.x} 
                                                       cy={p.y} 
                                                       r="6" 
                                                       fill={strokeColor} 
                                                       stroke="#fff" 
                                                       strokeWidth="1.5" 
                                                       className="cursor-pointer opacity-0 hover:opacity-100 transition-opacity duration-150"
                                                       onClick={(e) => {
                                                         e.stopPropagation();
                                                         const filterCol = widget.targetDimName || widget.xAxisKey || 'label';
                                                         setCustomFilters(prev => {
                                                           const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                                           if (existing) {
                                                             return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                               ...f,
                                                               selectedValue: f.selectedValue === labelVal ? null : labelVal
                                                             } : f);
                                                           } else {
                                                             const options = Array.from(new Set(widget.data.map(d => String(d[widget.xAxisKey || 'label'] || d[filterCol]))));
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
                                                           x: rect.left + rect.width / 2,
                                                           y: rect.top - 10,
                                                           content: `${_sanitizeLabel(labelVal)} (${prettifyLabel(m)}): ${formatKpiValue(numVal, m, widget.activeAgg, widget.numberFormat)}`
                                                         });
                                                       }}
                                                       onMouseLeave={() => setActiveHoverTooltip(null)}
                                                     >
                                                       <title>{`${_sanitizeLabel(labelVal)} (${prettifyLabel(m)}): ${formatKpiValue(numVal, m, widget.activeAgg, widget.numberFormat)}`}</title>
                                                     </circle>
                                                   );
                                                 })}
                                               </g>
                                             );
                                           })}
                                         </svg>
                                       </div>
                                     </div>
                                   );
                                 })()}
                              </div>
                              <div className="flex justify-between text-[8px] font-mono text-muted-custom mt-1 border-t border-border-custom/30 pt-0.5 overflow-hidden shrink-0">
                                {widget.data.map((item, idx) => (
                                  <span key={idx} className="truncate max-w-[40px] text-center" title={_sanitizeLabel(item[widget.xAxisKey || 'label'])}>
                                    {_sanitizeLabel(item[widget.xAxisKey || 'label'])}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Type 4: DONUT/PIE CHART */}
                          {((widget.type === 'pie' || widget.type === 'donut')) && (() => {
                            const totalVal = widget.data.reduce((acc, d) => acc + Number(d[widget.yAxisKey || 'val'] || 0), 0) || 1;
                            const pieFilterCol = widget.targetDimName || widget.xAxisKey || 'name';
                            const pieFilter = customFilters.find(f => f.fieldName.toLowerCase() === pieFilterCol.toLowerCase());
                            const selectedVal = pieFilter?.selectedValue;
                            
                            const paletteColors = [
                              widget.color || '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#3B82F6', '#EF4444', '#14B8A6'
                            ];

                            const isPie = widget.type === 'pie';
                            let accumulatedPercent = 0;
 
                            return (
                              <div className="flex items-center justify-center space-x-4 min-h-[40px] w-full" style={{ height: `${height - 90}px` }}>
                                <div className="relative shrink-0 transition-all" style={{ width: `${Math.max(48, Math.min(120, (height - 90) * 0.85))}px`, height: `${Math.max(48, Math.min(120, (height - 90) * 0.85))}px` }}>
                                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                    {/* Draw base circle track */}
                                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(120, 120, 120, 0.1)" strokeWidth={isPie ? "0" : "4"} />
                                    
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
                                          strokeWidth={isPie ? "31.83" : "6.5"} 
                                          strokeDasharray={`${percent} ${100 - percent}`} 
                                          strokeDashoffset={offset} 
                                          className={`transition-all duration-200 cursor-pointer ${isRingSelected ? 'opacity-100' : 'opacity-20'}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const filterCol = widget.targetDimName || widget.xAxisKey || 'name';
                                            setCustomFilters(prev => {
                                              const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                              if (existing) {
                                                return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                  ...f,
                                                  selectedValue: f.selectedValue === keyName ? null : keyName
                                                } : f);
                                              } else {
                                                const options = Array.from(new Set(widget.data.map(d => String(d[widget.xAxisKey || 'name'] || d[filterCol]))));
                                                return [...prev, {
                                                  fieldName: filterCol,
                                                  category: 'Dimensions',
                                                  options,
                                                  selectedValue: keyName
                                                }];
                                              }
                                            });
                                            addLog(`Clicked Slice: cross-filtered canvas by "${filterCol}" = "${keyName}"`);
                                          }}
                                          onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setActiveHoverTooltip({
                                              x: rect.left + rect.width / 2,
                                              y: rect.top - 10,
                                              content: `${_sanitizeLabel(keyName)}: ${percent.toFixed(1)}% (${formatKpiValue(valNum, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)})`
                                            });
                                          }}
                                          onMouseLeave={() => setActiveHoverTooltip(null)}
                                        >
                                          <title>{`${_sanitizeLabel(keyName)}: ${percent.toFixed(1)}% (${formatKpiValue(valNum, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)})`}</title>
                                        </circle>
                                      );
                                    })}
                                  </svg>
                                  {!isPie && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[7px] font-mono leading-none text-text-custom pointer-events-none">
                                      <span className="text-[10px] font-bold text-accent-custom tracking-wider">{widget.data.length}</span>
                                      <span className="text-[6px] text-muted-custom uppercase mt-0.5">Slices</span>
                                    </div>
                                  )}
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
                                        const isTargetingThisChart = (widget.targetDimName && f.fieldName.toLowerCase() === widget.targetDimName.toLowerCase()) || f.fieldName.toLowerCase() === (widget.xAxisKey || 'name').toLowerCase();
                                        if (isTargetingThisChart) return String(keyName).toLowerCase() === String(f.selectedValue).toLowerCase();
                                        if (item[f.fieldName] !== undefined) return String(item[f.fieldName]).toLowerCase() === String(f.selectedValue).toLowerCase();
                                        return true;
                                      });
                                    })();
                                    return (
                                      <div 
                                        key={idx} 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const filterCol = widget.targetDimName || widget.xAxisKey || 'name';
                                          setCustomFilters(prev => {
                                            const existing = prev.find(f => f.fieldName.toLowerCase() === filterCol.toLowerCase());
                                            if (existing) {
                                              return prev.map(f => f.fieldName.toLowerCase() === filterCol.toLowerCase() ? {
                                                ...f,
                                                selectedValue: f.selectedValue === keyName ? null : keyName
                                              } : f);
                                            } else {
                                              const options = Array.from(new Set(widget.data.map(d => String(d[widget.xAxisKey || 'name'] || d[filterCol]))));
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
                                        <span className="font-bold text-text-custom">{percent.toFixed(1)}% ({formatKpiValue(valNum, widget.targetMetricName || widget.yAxisKey || '', widget.activeAgg, widget.numberFormat)})</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Type 6: MAP */}
                          {widget.type === 'map' && (
                            <div className="w-full h-full relative" style={{ height: `${height - 90}px` }}>
                              <CustomGeoMap 
                                data={widget.data as any} 
                                isDark={isDark} 
                                color={widget.color}
                                formatConfig={widget.numberFormat}
                                targetMetricName={widget.targetMetricName || widget.yAxisKey}
                                isFullScreen={isFullScreenCanvas || isPresentMode}
                              />
                            </div>
                          )}

                          {/* Type 7: SCATTER */}
                          {widget.type === 'scatter' && (() => {
                            const data = widget.data || [];
                            const xVals = data.map(d => Number(d.x_val) || 0);
                            const yVals = data.map(d => Number(d.y_val) || 0);
                            const maxX = Math.max(...xVals, 1);
                            const minX = Math.min(...xVals, 0);
                            const maxY = Math.max(...yVals, 1);
                            const minY = Math.min(...yVals, 0);
                            const rangeX = maxX - minX || 1;
                            const rangeY = maxY - minY || 1;
                            return (
                              <div className="flex h-full w-full pb-1" style={{ height: `${height - 90}px` }}>
                                <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[85%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 shrink-0 text-right min-w-[36px] mt-1">
                                  <div>{formatKpiValue(maxY, 'y_val', widget.activeAgg, widget.numberFormat)}</div>
                                  <div>{formatKpiValue((maxY + minY) / 2, 'y_val', widget.activeAgg, widget.numberFormat)}</div>
                                  <div>{formatKpiValue(minY, 'y_val', widget.activeAgg, widget.numberFormat)}</div>
                                </div>
                                <div className="flex-1 flex flex-col justify-between h-full relative pl-1.5">
                                  <div className="flex-1 relative border-b border-border-custom/50">
                                    {data.map((item, idx) => {
                                      const xVal = Number(item.x_val) || 0;
                                      const yVal = Number(item.y_val) || 0;
                                      const xPercent = ((xVal - minX) / rangeX) * 90;
                                      const yPercent = ((yVal - minY) / rangeY) * 85;
                                      return (
                                        <div 
                                          key={idx} 
                                          className="absolute w-2.5 h-2.5 rounded-full border border-white shadow-xs cursor-pointer hover:scale-125 transition-transform"
                                          style={{ 
                                            left: `${xPercent + 5}%`, 
                                            bottom: `${yPercent + 5}%`,
                                            backgroundColor: widget.color || '#3B82F6'
                                          }}
                                          title={`${item.label}: X=${xVal.toFixed(1)}, Y=${yVal.toFixed(1)}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <div className="flex justify-between text-[7px] text-muted-custom font-mono pt-1 select-none w-[90%] mx-auto">
                                    <span>{formatKpiValue(minX, 'x_val', widget.activeAgg, widget.numberFormat)}</span>
                                    <span>{formatKpiValue(maxX, 'x_val', widget.activeAgg, widget.numberFormat)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Type 8: BUBBLE */}
                          {widget.type === 'bubble' && (() => {
                            const data = widget.data || [];
                            const xVals = data.map(d => Number(d.x_val) || 0);
                            const yVals = data.map(d => Number(d.y_val) || 0);
                            const zVals = data.map(d => Number(d.size_val) || 0);
                            const maxX = Math.max(...xVals, 1);
                            const minX = Math.min(...xVals, 0);
                            const maxY = Math.max(...yVals, 1);
                            const minY = Math.min(...yVals, 0);
                            const maxZ = Math.max(...zVals, 1);
                            const rangeX = maxX - minX || 1;
                            const rangeY = maxY - minY || 1;
                            return (
                              <div className="flex h-full w-full pb-1" style={{ height: `${height - 90}px` }}>
                                <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[85%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 shrink-0 text-right min-w-[36px] mt-1">
                                  <div>{formatKpiValue(maxY, 'y_val', widget.activeAgg, widget.numberFormat)}</div>
                                  <div>{formatKpiValue((maxY + minY) / 2, 'y_val', widget.activeAgg, widget.numberFormat)}</div>
                                  <div>{formatKpiValue(minY, 'y_val', widget.activeAgg, widget.numberFormat)}</div>
                                </div>
                                <div className="flex-1 flex flex-col justify-between h-full relative pl-1.5">
                                  <div className="flex-1 relative border-b border-border-custom/50">
                                    {data.map((item, idx) => {
                                      const xVal = Number(item.x_val) || 0;
                                      const yVal = Number(item.y_val) || 0;
                                      const zVal = Number(item.size_val) || 0;
                                      const xPercent = ((xVal - minX) / rangeX) * 90;
                                      const yPercent = ((yVal - minY) / rangeY) * 85;
                                      const size = maxZ ? 6 + (zVal / maxZ) * 16 : 8;
                                      return (
                                        <div 
                                          key={idx} 
                                          className="absolute rounded-full border border-white shadow-md cursor-pointer hover:scale-110 transition-transform opacity-75"
                                          style={{ 
                                            left: `${xPercent + 5}%`, 
                                            bottom: `${yPercent + 5}%`,
                                            width: `${size}px`,
                                            height: `${size}px`,
                                            backgroundColor: widget.color || '#3B82F6',
                                            transform: 'translate(-50%, 50%)'
                                          }}
                                          title={`${item.label}: X=${xVal.toFixed(1)}, Y=${yVal.toFixed(1)}, Size=${zVal.toFixed(1)}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <div className="flex justify-between text-[7px] text-muted-custom font-mono pt-1 select-none w-[90%] mx-auto">
                                    <span>{formatKpiValue(minX, 'x_val', widget.activeAgg, widget.numberFormat)}</span>
                                    <span>{formatKpiValue(maxX, 'x_val', widget.activeAgg, widget.numberFormat)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Type 9: COMBO */}
                          {widget.type === 'combo' && (() => {
                            const data = widget.data || [];
                            const barVals = data.map(d => Number(d.bar_val) || 0);
                            const lineVals = data.map(d => Number(d.line_val) || 0);
                            const maxBar = Math.max(...barVals, 1);
                            const maxLine = Math.max(...lineVals, 1);
                            const minLine = Math.min(...lineVals, 0);
                            const rangeLine = maxLine - minLine || 1;
                            return (
                              <div className="flex h-full w-full pb-1" style={{ height: `${height - 90}px` }}>
                                <div className="flex flex-col justify-between text-[7px] text-muted-custom font-mono h-[85%] pr-1.5 border-r border-border-custom/30 select-none pb-1.5 mt-1 shrink-0 text-right min-w-[36px]">
                                  <div>{formatKpiValue(maxBar, 'bar_val', widget.activeAgg, widget.numberFormat)}</div>
                                  <div>{formatKpiValue(maxBar / 2, 'bar_val', widget.activeAgg, widget.numberFormat)}</div>
                                  <div>0</div>
                                </div>
                                <div className="flex-1 flex flex-col justify-between h-full relative pl-1.5">
                                  <div className="flex-1 relative border-b border-border-custom/50 flex items-end justify-around gap-1.5">
                                    {data.map((item, idx) => {
                                      const barVal = Number(item.bar_val) || 0;
                                      const barHeight = maxBar ? (barVal / maxBar) * 80 : 0;
                                      return (
                                        <div 
                                          key={idx}
                                          className="w-4 rounded-t-xs hover:opacity-85 transition-opacity"
                                          style={{ 
                                            height: `${barHeight}%`, 
                                            backgroundColor: widget.color || '#3B82F6',
                                            opacity: 0.7
                                          }}
                                          title={`${item.label}: Bar=${barVal}`}
                                        />
                                      );
                                    })}
                                    {data.length > 1 && (
                                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <path 
                                          d={data.map((item, idx) => {
                                            const lineVal = Number(item.line_val) || 0;
                                            const x = (idx / (data.length - 1)) * 90 + 5;
                                            const y = 90 - ((lineVal - minLine) / rangeLine) * 75;
                                            return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                                          }).join(' ')}
                                          fill="none" 
                                          stroke="#10B981" 
                                          strokeWidth="2" 
                                        />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex justify-between text-[7px] text-muted-custom font-mono pt-1 select-none w-full">
                                    <span className="truncate max-w-[45%]">{String(data[0]?.label || '')}</span>
                                    <span className="truncate max-w-[45%]">{String(data[data.length - 1]?.label || '')}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Type 10: HBAR */}
                          {widget.type === 'hbar' && (() => {
                            const valKey = widget.yAxisKey || 'value';
                            const key = widget.xAxisKey || 'label';
                            const maxVal = Math.max(...widget.data.map(d => Number(d[valKey]) || 0)) || 1;
                            return (
                              <div className="flex flex-col justify-start space-y-2.5 overflow-y-auto w-full pr-1.5" style={{ height: `${height - 90}px` }}>
                                {widget.data.map((item, idx) => {
                                  const val = Number(item[valKey]) || 0;
                                  const widthPercent = maxVal ? (val / maxVal) * 80 : 0;
                                  return (
                                    <div key={idx} className="flex flex-col space-y-1">
                                      <div className="flex items-center justify-between text-[9px] font-mono text-muted-custom">
                                        <span className="truncate max-w-[70%] font-medium">{String(item[key])}</span>
                                        <span>{formatKpiValue(val, widget.targetMetricName || valKey, widget.activeAgg, widget.numberFormat)}</span>
                                      </div>
                                      <div className="w-full bg-surface-2 rounded-full h-2 relative overflow-hidden border border-border-custom/30">
                                        <div 
                                          className="h-full rounded-full transition-all duration-300"
                                          style={{ 
                                            width: `${widthPercent}%`,
                                            background: widget.color || '#3B82F6'
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                            </>
                          )}

                        </div>


                        {/* Drag-resize handle on bottom-right corner (PowerBI Style) */}
                        {isSelected && !isPresentMode && (
                          <div
                            onPointerDown={(e) => handleResizeStart(e, widget.id)}
                            role="button"
                            aria-label="Resize widget"
                            tabIndex={0}
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
                {selectionBox && selectionBox.active && (
                  <div 
                    className="absolute border border-accent-custom bg-accent-custom/10 pointer-events-none rounded-xs z-50"
                    style={{
                      left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                      top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                      width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                      height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`,
                    }}
                  />
                )}
                </div>
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
                    className="ml-auto flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 duration-200 bg-transparent border-none"
                    title="Expand AI Prompt Assistant"
                  >
                    <VizzyPilotLogoIcon size={48} className="text-accent-custom drop-shadow-2xl animate-pulse" />
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="p-4 bg-surface/95 backdrop-blur-md border border-accent-custom/20 rounded-2xl shadow-2xl flex flex-col space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                      <div className="flex items-center space-x-2">
                        <VizzyPilotLogoIcon size={16} className="text-accent-custom animate-pulse" />
                        <span className="text-[11px] font-bold font-mono uppercase text-text-custom">Vizzy Pilot Assistant</span>
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

                    <AIPromptBar 
                      onSubmit={handleAIPromptSubmit} 
                      isCompiling={isCompiling} 
                      suggestions={PROMPT_SUGGESTIONS} 
                      placeholder="Prompt AI to construct and organize widgets on your canvas..."
                      isFullScreen={true}
                      showSuggestions={showFloatingSuggestions}
                    />
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
                setFieldsList(prev => prev.map(f => f.name === contextMenu.field.name ? {
                  ...f,
                  category: f.category === 'Dimensions' ? 'Metrics' : 'Dimensions'
                } : f));
                setContextMenu(null);
                addLog(`Converted "${contextMenu.field.name}" to ${contextMenu.field.category === 'Dimensions' ? 'Measure' : 'Dimension'}`);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-2 hover:bg-accent-custom/10 hover:text-accent-custom rounded-lg transition-all text-left cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-accent-custom" />
              <span>{contextMenu.field.category === 'Dimensions' ? 'Convert to Measure' : 'Convert to Dimension'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                handleFieldToggle(contextMenu.field.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-2 hover:bg-surface-2 rounded-lg transition-all text-left cursor-pointer text-muted-custom hover:text-text-custom"
            >
              <Grid className="w-3.5 h-3.5 text-muted-custom/60" />
              <span>{checkedFields.includes(contextMenu.field.name) ? 'Deselect Property' : 'Select Property'}</span>
            </button>
            <div className="h-px bg-border-custom/30 my-1 w-full" />
            <button
              type="button"
              onClick={(e) => {
                handleDeleteField(contextMenu.field.name, e);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all text-left cursor-pointer text-muted-custom"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Field</span>
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
                const metrics = targetMetric.split(',').map(s => s.trim());
                const isCategoricalMetric = metrics.some(m => fieldsList.some(f => f.name === m && (f.category === 'Dimensions' || f.category === 'Dates')));

                return ([
                  { label: 'Sum (Total)', value: 'SUM' },
                  { label: 'Average (Mean)', value: 'AVG' },
                  { label: 'Minimum', value: 'MIN' },
                  { label: 'Maximum', value: 'MAX' },
                  { label: 'Count (Records)', value: 'COUNT' },
                  { label: 'Variance (SAMP)', value: 'VAR_SAMP' },
                  { label: '% Change', value: 'PERCENT_CHANGE' }
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
              
              <div className="h-px bg-border-custom/30 my-1 w-full" />
              
              <div className="relative group">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-surface-2 rounded-lg transition-all text-left cursor-pointer text-muted-custom hover:text-text-custom border-none bg-transparent"
                >
                  <span className="flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-muted-custom/60" />
                    <span>Format Value</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-custom" />
                </button>
                <div className="hidden group-hover:block absolute left-[98%] top-0 ml-1 bg-surface/95 backdrop-blur-md border border-border-custom/80 shadow-2xl rounded-2xl p-1.5 min-w-[190px] z-[1002] animate-in fade-in slide-in-from-left-2 duration-100">
                  {([
                    { label: 'Automatic', value: 'automatic' },
                    { label: 'Number (Standard)', value: 'number_standard' },
                    { label: 'Number (Custom)...', value: 'number_custom' },
                    { label: 'Currency (Standard)', value: 'currency_standard' },
                    { label: 'Currency (Custom)...', value: 'currency_custom' },
                    { label: 'Scientific', value: 'scientific' },
                    { label: 'Percentage', value: 'percentage' },
                    { label: 'Fraction', value: 'fraction' },
                    { label: 'Standard (Custom)...', value: 'standard_custom' }
                  ] as const).map(fmt => {
                    const isSelected = (targetWidget?.numberFormat?.type || 'automatic') === fmt.value;
                    return (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => {
                          if (fmt.value.endsWith('_custom')) {
                            setCustomFormatModalWidgetId(widgetContextMenu.widgetId);
                            setCustomFormatModalType(fmt.value as 'number_custom' | 'currency_custom' | 'standard_custom');
                            const current = targetWidget?.numberFormat || { type: fmt.value };
                            setCustomFormatDecimals(current.decimals ?? 2);
                            setCustomFormatNegative(current.negativeStyle ?? 'minus');
                            setCustomFormatPrefix(current.prefix ?? '');
                            setCustomFormatSuffix(current.suffix ?? '');
                            setCustomFormatSeparator(current.separator ?? ',');
                            setCustomFormatUnit(current.unit ?? 'none');
                            setShowCustomFormatModal(true);
                          } else {
                            handleWidgetFormatChange(widgetContextMenu.widgetId, { type: fmt.value });
                          }
                          setWidgetContextMenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all text-left cursor-pointer border-none bg-transparent ${
                          isSelected
                            ? 'bg-accent-custom/10 text-accent-custom font-bold'
                            : 'hover:bg-surface-2 text-muted-custom hover:text-text-custom'
                        }`}
                      >
                        <span>{fmt.label}</span>
                        {isSelected && <Check className="w-3 h-3 text-accent-custom" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        );
      })()}

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
        <div className="fixed inset-0 z-[2010] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-surface border border-border-custom rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col font-sans">
            <div className="flex items-center space-x-3 text-accent-custom mb-4 border-b border-border-custom/50 pb-3">
              <div className="p-2 bg-accent-custom/10 rounded-full">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-custom">
                  {customFormatModalType === 'currency_custom' ? 'Currency Formatting (Custom)' : 
                   customFormatModalType === 'standard_custom' ? 'Standard Numeric (Custom)' : 
                   'Number Formatting (Custom)'}
                </h3>
                <p className="text-[10px] text-muted-custom">Adjust display properties for this visual</p>
              </div>
            </div>

            <div className="space-y-4 my-2 text-xs">
              {/* Decimal places */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-text-custom">Decimal Places</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={customFormatDecimals}
                  onChange={(e) => setCustomFormatDecimals(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-center text-text-custom outline-none"
                />
              </div>

              {/* Separators */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-text-custom">Thousands Separator</label>
                <select
                  value={customFormatSeparator}
                  onChange={(e) => setCustomFormatSeparator(e.target.value)}
                  className="w-32 bg-surface-2 border border-border-custom rounded-lg px-2 py-1 text-text-custom outline-none"
                >
                  <option value=",">Comma (,)</option>
                  <option value=".">Dot (.)</option>
                  <option value=" ">Space ( )</option>
                  <option value="none">None</option>
                </select>
              </div>

              {/* Prefix and Suffix */}
              <div className="grid grid-cols-2 gap-3">
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

      {activeHoverTooltip && (
        <div 
          className={`fixed z-[9999] bg-surface border border-border-custom shadow-2xl pointer-events-none whitespace-nowrap text-text-custom animate-in fade-in duration-75 ${
            (isFullScreenCanvas || isPresentMode)
              ? 'px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-wide border-2 border-accent-custom/50' 
              : 'px-2 py-1 rounded-lg text-[10px] font-mono'
          }`}
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
