import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, ClipboardCopy, Terminal, Landmark, Sliders, Database, Layers, CheckCircle, 
  Search, RefreshCw, BarChart2, Activity, ArrowUpRight, HelpCircle, HardDrive, FileText,
  Clock, GitCommit, PlayCircle, Settings
} from "lucide-react";

interface LogAction {
  time: string;
  source: string;
  action: string;
  status: "success" | "warning" | "info";
}

type PresetQuery = {
  id: string;
  name: string;
  prompt: string;
  sql: string;
  insight: string;
  statValue1: string;
  statLabel1: string;
  statValue2: string;
  statLabel2: string;
  statValue3: string;
  statLabel3: string;
  statValue4: string;
  statLabel4: string;
  nodesCount: number;
  explanation: { step: string; cost: string; operation: string; details: string }[];
  logs: LogAction[];
  lineageNodes: { name: string; type: string; status: string; rows: string }[];
  chartData: { x: string; value: number; secondary: number }[];
};

const PRESETS: PresetQuery[] = [
  {
    id: "retention",
    name: "Audit User Retention",
    prompt: "Show daily user retention metrics and trace dependencies back to raw signup data.",
    sql: "SELECT date_trunc('day', created_at) as day,\n       count(user_id) FILTER (WHERE session_duration > 300) as retained_users\nFROM user_sessions\nGROUP BY 1 ORDER BY 1 DESC LIMIT 30;",
    insight: "Daily retention rates showed an interesting 14% delta. Bypassed legacy tables by relying on optimized session_v2 metrics.",
    statValue1: "88.4%",
    statLabel1: "RETENTION COEFFICIENT",
    statValue2: "14.2B",
    statLabel2: "ROWS INGESTED",
    statValue3: "0.22ms",
    statLabel3: "READ LATENCY SLA",
    statValue4: "+14.3%",
    statLabel4: "RETENTION DELTA",
    nodesCount: 6,
    explanation: [
      { step: "1", cost: "12%", operation: "Seq Scan", details: "Scanning raw signup logs block partition in user_sessions_p4" },
      { step: "2", cost: "4%", operation: "Filter", details: "Filter where session_duration > 300 seconds" },
      { step: "3", cost: "55%", operation: "Hash Aggregate", details: "Grouping by day truncations utilizing custom memory keys" },
      { step: "4", cost: "29%", operation: "Sort", details: "Sorting output buffer descending to fetch the active top 30 view" }
    ],
    logs: [
      { time: "03:25:12", source: "Auth Engine", action: "User session authorized for secure schema trace", status: "success" },
      { time: "03:24:45", source: "Query Compiler", action: "Constructed syntax plan with 4 aggregation pipelines", status: "success" },
      { time: "03:22:11", source: "Storage Gateway", action: "Partition hit on active DB table: user_sessions", status: "info" },
      { time: "03:20:08", source: "Metrics Analyzer", action: "Computed retention margin deviation exceeds historical limits", status: "warning" }
    ],
    lineageNodes: [
      { name: "raw_signup_stream_v2", type: "DB SOURCE", status: "ACTIVE", rows: "14.2B records" },
      { name: "session_aggregation_worker", type: "TRANSFORM PIPELINE", status: "RUNNING", rows: "Avg 2.4k ops/sec" },
      { name: "retention_global_view", type: "ACTIVE SCHEMA", status: "STABLE", rows: "30 cached indices" }
    ],
    chartData: [
      { x: "Mon", value: 64, secondary: 40 },
      { x: "Tue", value: 82, secondary: 52 },
      { x: "Wed", value: 78, secondary: 48 },
      { x: "Thu", value: 91, secondary: 65 },
      { x: "Fri", value: 88, secondary: 70 },
      { x: "Sat", value: 95, secondary: 82 },
      { x: "Sun", value: 104, secondary: 88 }
    ]
  },
  {
    id: "schema_delta",
    name: "Inspect Version Delta",
    prompt: "Analyze database volume differences between v1.1 and v2.0 master schema.",
    sql: "SELECT version_hash, count(table_name) as table_count,\n       sum(estimated_rows) as aggregate_rows\nFROM schema_lineage_registry\nWHERE version_hash IN ('fb9202a', '8a1e261')\nGROUP BY 1;",
    insight: "Schema consolidation in v2.0 successfully pruned 3 deprecated tables, resulting in aggregate storage delta reduction of custom indexes.",
    statValue1: "-2.4GB",
    statLabel1: "INDEX SPACE RECLAIMED",
    statValue2: "2.77ms",
    statLabel2: "EXECUTION TIME",
    statValue3: "100.0%",
    statLabel3: "INTEGRITY METRIC",
    statValue4: "-25.0%",
    statLabel4: "STORAGE ACCELERATION",
    nodesCount: 9,
    explanation: [
      { step: "1", cost: "5%", operation: "Index Scan", details: "Scanning version system history index on registry hash" },
      { step: "2", cost: "18%", operation: "Filter", details: "Extracting records targeting hashes 'fb9202a' and '8a1e261'" },
      { step: "3", cost: "70%", operation: "Group Aggregate", details: "Summing database segment metadata size blocks safely" },
      { step: "4", cost: "7%", operation: "Render Cache", details: "Populating version delta matrix mapping output to local clients" }
    ],
    logs: [
      { time: "03:10:44", source: "Storage Gateway", action: "Index schema integrity verification executed", status: "success" },
      { time: "03:09:12", source: "DB Administrator", action: "Purged deprecated index files from directory segment v1.1", status: "warning" },
      { time: "03:08:22", source: "Registry API", action: "Synchronized v2.0 structural definitions to global catalog", status: "success" },
      { time: "03:05:15", source: "Version Controller", action: "Calculated footprint difference for schema indexes", status: "info" }
    ],
    lineageNodes: [
      { name: "schema_lineage_registry", type: "DB CONDUIT", status: "STABLE", rows: "25 schema trees" },
      { name: "version_reconciliation_runner", type: "CRON WORKER", status: "STANDBY", rows: "Pruned 3 structures" },
      { name: "storage_delta_reporter", type: "API GATEWAY", status: "ACTIVE", rows: "Sync: 2.77ms" }
    ],
    chartData: [
      { x: "Mon", value: 120, secondary: 15 },
      { x: "Tue", value: 110, secondary: 10 },
      { x: "Wed", value: 95, secondary: 8 },
      { x: "Thu", value: 85, secondary: 6 },
      { x: "Fri", value: 70, secondary: 4 },
      { x: "Sat", value: 62, secondary: 2 },
      { x: "Sun", value: 50, secondary: 1 }
    ]
  },
  {
    id: "churn_correlation",
    name: "Correlate Churn Triggers",
    prompt: "Correlate customer churn records with custom database schema heartbeats of predictive model.",
    sql: "SELECT correlation_coefficient(activity_score, churn_event) as churn_idx,\n       count(distinct machine_id) as device_nodes\nFROM prediction_heartbeats\nWHERE active_model_hash = 'sha_heartbeat_9221';",
    insight: "Identified high correlation (0.78 index point) between active model failures and deprecated sqlite heartbeats on client platforms.",
    statValue1: "0.78",
    statLabel1: "CORRELATION MULTIPLE",
    statValue2: "99.94%",
    statLabel2: "PREDICTION ACCURACY",
    statValue3: "1.05s",
    statLabel3: "MODEL TRAIN LAG",
    statValue4: "14,284",
    statLabel4: "TRACKED DEVICE NODES",
    nodesCount: 14,
    explanation: [
      { step: "1", cost: "35%", operation: "Bitmap Index Scan", details: "Analyzing sparse bitmaps mapping device platform machine_id keys" },
      { step: "2", cost: "15%", operation: "Bitmap Heap Scan", details: "Reconciling matched bitmap logs with real transaction activity blocks" },
      { step: "3", cost: "45%", operation: "Correlation Math", details: "Invoking custom vectorized engine for Pearson correlation computation" },
      { step: "4", cost: "5%", operation: "Telemetry Buffer", details: "Emitted output stream bytes directly to cognitive client dashboard" }
    ],
    logs: [
      { time: "03:19:10", source: "Predictive VM", action: "Vector calculation array instantiated for 14k devices", status: "success" },
      { time: "03:18:41", source: "Telemetry Collector", action: "Device logging endpoint overflow warning detected", status: "warning" },
      { time: "03:18:12", source: "Storage Gateway", action: "Index schema updated with transaction records dynamically", status: "success" },
      { time: "03:15:02", source: "Core Kernel", action: "Validated model metadata signature: sha_heartbeat_9221", status: "success" }
    ],
    lineageNodes: [
      { name: "prediction_heartbeats", type: "LIVE INGESTION", status: "BUSY", rows: "14,284 nodes active" },
      { name: "pearson_coefficent_aggregator", type: "MATH MODEL", status: "COMPLETED", rows: "Correlation scale: 0.78" },
      { name: "cognitive_client", type: "CONSUMER OUTLET", status: "STREAMING", rows: "Lag: 1.05s" }
    ],
    chartData: [
      { x: "Mon", value: 30, secondary: 12 },
      { x: "Tue", value: 45, secondary: 18 },
      { x: "Wed", value: 35, secondary: 22 },
      { x: "Thu", value: 65, secondary: 36 },
      { x: "Fri", value: 55, secondary: 40 },
      { x: "Sat", value: 78, secondary: 54 },
      { x: "Sun", value: 78, secondary: 58 }
    ]
  }
];

export default function InteractiveCanvas() {
  const [activePresetId, setActivePresetId] = useState("retention");
  const [isCompiling, setIsCompiling] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Dashboard states
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "lineage" | "explain">("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [metricMultiplier, setMetricMultiplier] = useState(1);
  const [isRealTimeLoading, setIsRealTimeLoading] = useState(false);
  const [tableSearch, setTableSearch] = useState("");

  const activePreset = PRESETS.find((p) => p.id === activePresetId) || PRESETS[0];

  const handlePresetSelect = (id: string) => {
    setIsCompiling(true);
    setActivePresetId(id);
    const timer = setTimeout(() => {
      setIsCompiling(false);
    }, 450);
    return () => clearTimeout(timer);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(activePreset.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefreshState = () => {
    setIsRealTimeLoading(true);
    setTimeout(() => {
      setIsRealTimeLoading(false);
    }, 600);
  };

  // Filter schemas
  const schemaTables = [
    { name: "users", type: "table", size: "4.8 GB", cols: "12 cols" },
    { name: "user_sessions", type: "table", size: "12.1 GB", cols: "8 cols" },
    { name: "transactions_v2", type: "table", size: "54.0 GB", cols: "14 cols" },
    { name: "prediction_runs", type: "table", size: "1.2 GB", cols: "5 cols" },
    { name: "retention_global", type: "view", size: "computed", cols: "6 cols" },
    { name: "audit_lineage_logs", type: "table", size: "850 MB", cols: "9 cols" },
  ];

  const filteredTables = schemaTables.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section id="product-canvas" className="relative w-full py-28 bg-[#F5F2EB] border-t border-[#E4DED4] overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        
        {/* Header content section */}
        <div className="max-w-3xl mb-12 text-left">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#7C725D] mb-3 block">
            Phase 04 / Live Workspace Console
          </span>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter text-[#1F1C18] leading-none mb-4">
            A premium <span className="text-emerald-800 font-bold">provenance terminal</span> designed for analytics.
          </h2>
          <p className="mt-4 text-base text-[#7C725D] font-light max-w-2xl leading-relaxed">
            Configure system configurations, audit execution pipelines in real-time, trace lineage steps visually, and understand SQL transpilation sequences.
          </p>
        </div>

        {/* Interactive Preset Scenarios Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                id={`btn-preset-${preset.id}`}
                onClick={() => handlePresetSelect(preset.id)}
                className={`px-5 py-2.5 rounded-full text-xs font-semibold font-mono transition-all border ${
                  activePresetId === preset.id
                    ? "bg-[#1F1C18] border-[#1F1C18] text-[#FBF9F6] shadow-xl"
                    : "bg-[#FCFAF5] border-[#E4DED4] text-[#1F1C18] hover:text-[#1F1C18] hover:border-[#1F1C18]"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>

          {/* Quick Config Controls */}
          <div className="flex items-center space-x-3 bg-[#FCFAF5] border border-[#E4DED4] rounded-full px-4 py-1.5 shadow-sm text-xs text-[#1F1C18]/80 font-mono">
            <Sliders className="h-3.5 w-3.5 text-[#7C725D]" />
            <span className="text-[10px] text-[#7C725D] font-bold uppercase">METRIC SCALE:</span>
            <button 
              id="scale-1x-btn"
              onClick={() => setMetricMultiplier(1)} 
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${metricMultiplier === 1 ? 'bg-[#1F1C18] text-[#FBF9F6]' : 'text-[#7C725D] hover:text-[#1F1C18]'}`}
            >
              1X
            </button>
            <button 
              id="scale-5x-btn"
              onClick={() => setMetricMultiplier(5)} 
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${metricMultiplier === 5 ? 'bg-[#1F1C18] text-[#FBF9F6]' : 'text-[#7C725D] hover:text-[#1F1C18]'}`}
            >
              5X
            </button>
            <button 
              id="scale-10x-btn"
              onClick={() => setMetricMultiplier(10)} 
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${metricMultiplier === 10 ? 'bg-[#1F1C18] text-[#FBF9F6]' : 'text-[#7C725D] hover:text-[#1F1C18]'}`}
            >
              10X
            </button>
          </div>
        </div>

        {/* HIGH PERFORMANCE PREMIUM ENTERPRISE SAAS DASHBOARD CARD */}
        <div className="w-full rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] shadow-[0_20px_50px_rgba(27,24,21,0.12)] overflow-hidden flex flex-col lg:grid lg:grid-cols-12 max-w-7xl mx-auto min-h-[720px] relative">
          
          {/* COLUMN 1 - LEFT SIDEBAR: Active Schemas & Filtering (3 Cols on LG) */}
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-[#E4DED4] bg-[#F5F2EB]/40 p-5 flex flex-col justify-between">
            <div className="space-y-6">
              
              {/* Sidebar Header with DB Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-7 w-7 rounded bg-[#1F1C18] flex items-center justify-center border border-[#1F1C18] text-xs text-[#FBF9F6] font-mono font-bold shadow-md">D</div>
                    <div>
                      <span className="font-mono text-[8px] text-[#7C725D] block uppercase tracking-widest font-bold">STATE SOURCE</span>
                      <span className="font-mono text-xs font-semibold text-[#1F1C18]">sqlite:prod_metrics</span>
                    </div>
                  </div>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                
                {/* Embedded status specs */}
                <div className="bg-[#1F1C18]/5 border border-[#E4DED4] rounded-lg p-2.5 space-y-1.5 text-[10px] font-mono text-[#7C725D]">
                  <div className="flex justify-between">
                    <span>Engine:</span>
                    <span className="text-[#1F1C18] font-bold">Vizzy Core v2</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Catalog Status:</span>
                    <span className="text-emerald-700 font-bold">SYNCED</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Dialect:</span>
                    <span className="text-[#1F1C18] font-bold">Ansi SQL</span>
                  </div>
                </div>
              </div>

              {/* Schema table listing search and catalog */}
              <div className="space-y-3">
                <span className="font-mono text-[9px] text-[#7C725D] block uppercase tracking-widest font-bold">CATALOG INDEX TABLES</span>
                
                {/* Search Bar for tables */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#7C725D]" />
                  <input
                    id="table-search-input"
                    type="text"
                    placeholder="Filter tables..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#FCFAF5] border border-[#E4DED4] rounded-md text-xs text-[#1F1C18] placeholder-[#7C725D]/60 focus:outline-none focus:border-[#1F1C18] font-mono"
                  />
                </div>

                {/* Scroller schema items */}
                <div className="space-y-1 max-h-[290px] overflow-y-auto pr-1">
                  {filteredTables.map((tbl) => (
                    <div 
                      key={tbl.name}
                      id={`table-row-${tbl.name}`}
                      className={`p-2 rounded-lg border text-xs font-mono transition-all flex items-center justify-between cursor-default ${
                        tbl.name === "retention_global"
                          ? "bg-emerald-500/5 text-emerald-950 border-emerald-550/20"
                          : "bg-[#FCFAF5] hover:bg-neutral-200/20 border-transparent text-[#1F1C18]/80"
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="opacity-40">{tbl.type === "view" ? "└" : "├"}─</span>
                        <span className="font-medium text-[#1F1C18]">{tbl.name}</span>
                      </div>
                      <div className="flex flex-col items-end text-[9px] text-[#7C725D]">
                        <span className="font-bold">{tbl.size}</span>
                        <span className="opacity-70">{tbl.cols}</span>
                      </div>
                    </div>
                  ))}
                  {filteredTables.length === 0 && (
                    <div className="text-center py-6 text-[10px] text-[#7C725D] font-mono">
                      No tables match "{searchTerm}"
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Bottom active state indicator */}
            <div className="p-3 bg-[#FCFAF5] border border-[#E4DED4] rounded-xl space-y-1.5 shadow-sm mt-4">
              <span className="font-mono text-[8px] text-[#7C725D] uppercase tracking-widest block font-bold">STATE VERIFICATION</span>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> VERIFIED
                </span>
                <span className="text-[10px] text-[#7C725D]">ID: fb55a_2</span>
              </div>
            </div>

          </div>

          {/* COLUMN 2 - CORE ANALYTICS WORKSPACE: Tabulated Reports, Multi-metrics, Live charts (6 Cols on LG) */}
          <div className="lg:col-span-6 bg-[#FCFAF5] p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#E4DED4] relative">
            
            {/* Real-time typing or compiling overlay */}
            <AnimatePresence>
              {(isCompiling || isRealTimeLoading) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/80 backdrop-blur-xs z-30 flex flex-col items-center justify-center p-6 text-center"
                >
                  <div className="h-10 w-10 rounded-full border-2 border-[#1F1C18] border-t-transparent animate-spin" />
                  <span className="font-mono text-xs text-[#1F1C18] font-bold mt-3 uppercase tracking-widest animate-pulse">
                    {isCompiling ? "RE-TRANSPILING SAAS COHORT ENGINE..." : "SYNCING DEPLOYED TELEMETRY LOGS..."}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-5">
              
              {/* Dynamic Scenario Workspace Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#1F1C18]/5 p-3 px-4 rounded-xl border border-[#E4DED4] font-mono text-[11px] text-[#1F1C18]/90 overflow-hidden">
                <div className="flex items-center space-x-2 min-w-0">
                  <Terminal className="h-4 w-4 opacity-70 text-[#1F1C18] shrink-0" />
                  <span className="truncate text-[10px] md:text-[11px] select-all font-semibold">
                    {activePreset.prompt}
                  </span>
                </div>
                <div className="text-[9px] bg-[#1F1C18] text-[#FBF9F6] px-2 py-0.5 rounded font-bold shrink-0 self-end sm:self-auto lowercase">
                  active prompt
                </div>
              </div>

              {/* Sub-navigation inside Premium Dashboard Viewport */}
              <div className="flex border-b border-[#E4DED4]/60 gap-4">
                <button
                  id="tab-overview"
                  onClick={() => setActiveSubTab("overview")}
                  className={`pb-2.5 text-xs font-mono font-bold uppercase transition-all relative ${
                    activeSubTab === "overview" 
                      ? "text-[#1F1C18]" 
                      : "text-[#7C725D] hover:text-[#1F1C18]"
                  }`}
                >
                  Overview Analytics
                  {activeSubTab === "overview" && (
                    <motion.div layoutId="subtabBorder" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1F1C18]" />
                  )}
                </button>
                <button
                  id="tab-lineage"
                  onClick={() => setActiveSubTab("lineage")}
                  className={`pb-2.5 text-xs font-mono font-bold uppercase transition-all relative ${
                    activeSubTab === "lineage" 
                      ? "text-[#1F1C18]" 
                      : "text-[#7C725D] hover:text-[#1F1C18]"
                  }`}
                >
                  Data Lineage Flow
                  {activeSubTab === "lineage" && (
                    <motion.div layoutId="subtabBorder" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1F1C18]" />
                  )}
                </button>
                <button
                  id="tab-explain"
                  onClick={() => setActiveSubTab("explain")}
                  className={`pb-2.5 text-xs font-mono font-bold uppercase transition-all relative ${
                    activeSubTab === "explain" 
                      ? "text-[#1F1C18]" 
                      : "text-[#7C725D] hover:text-[#1F1C18]"
                  }`}
                >
                  Query Plan Cost
                  {activeSubTab === "explain" && (
                    <motion.div layoutId="subtabBorder" className="absolute bottom-0 inset-x-0 h-0.5 bg-[#1F1C18]" />
                  )}
                </button>
              </div>

              {/* CONTROLLER MAIN SCREEN DESIGNS */}
              <div className="min-h-[300px] flex flex-col justify-between">
                
                {/* SUBTAB 1: Overview Analytics Report */}
                {activeSubTab === "overview" && (
                  <div className="space-y-4 animate-fade-in" data-description="overview-reports">
                    
                    {/* Responsive dual graph setup */}
                    <div className="bg-[#F5F2EB]/30 border border-[#E4DED4] rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-mono text-[9px] text-[#7C725D] uppercase tracking-wider block font-bold">STATE METRIC PERFORMANCE SHIELD</span>
                          <span className="text-xs font-semibold text-[#1F1C18]">Continuous Interval Cohorts</span>
                        </div>
                        <button 
                          id="btn-refresh-state"
                          onClick={handleRefreshState}
                          title="Flush live records cache"
                          className="p-1.5 rounded-md hover:bg-[#1F1C18]/5 border border-[#E4DED4] transition-all"
                        >
                          <RefreshCw className="h-3 w-3 text-[#1C1914] animate-hover:spin" />
                        </button>
                      </div>

                      {/* Professional Hand-crafted Area Chart with Gridlines & Hover Interactivity */}
                      <div className="h-36 relative flex items-end w-full pt-4">
                        
                        {/* Static Horizontal Grid Guides */}
                        <div className="absolute inset-x-0 top-0 border-t border-[#E4DED4]/30 h-0" />
                        <div className="absolute inset-x-0 top-1/4 border-t border-[#E4DED4]/30 h-0" />
                        <div className="absolute inset-x-0 top-2/4 border-t border-[#E4DED4]/30 h-0" />
                        <div className="absolute inset-x-0 top-3/4 border-t border-[#E4DED4]/30 h-0" />

                        {/* Chart Line Representation & Area Fills */}
                        <div className="relative w-full h-24 flex items-end justify-between z-10 px-2">
                          <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#065f46" stopOpacity="0.18" />
                                <stop offset="100%" stopColor="#065f46" stopOpacity="0.01" />
                              </linearGradient>
                            </defs>
                            
                            {/* Area Polyline */}
                            <path 
                              d={`M 0 100 
                                  ${activePreset.chartData.map((d, i) => 
                                    `L ${(i / (activePreset.chartData.length - 1)) * 360} ${100 - d.value * 0.7}`
                                  ).join(" ")}
                                  L 360 100 Z`}
                              fill="url(#areaGrad)"
                              className="transition-all duration-500"
                            />

                            {/* Border Polyline */}
                            <path 
                              d={activePreset.chartData.map((d, i) => 
                                `${i === 0 ? 'M' : 'L'} ${(i / (activePreset.chartData.length - 1)) * 360} ${100 - d.value * 0.7}`
                              ).join(" ")}
                              fill="none"
                              stroke="#047857"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-all duration-500"
                            />

                            {/* Data points indicator */}
                            {activePreset.chartData.map((d, i) => (
                              <circle 
                                key={i}
                                cx={(i / (activePreset.chartData.length - 1)) * 360}
                                cy={100 - d.value * 0.7}
                                r="4.5"
                                fill="#ffffff"
                                stroke="#047857"
                                strokeWidth="2"
                                className="cursor-pointer hover:r-6 transition-all"
                              />
                            ))}
                          </svg>
                        </div>
                      </div>

                      {/* Chart Footer with Intervals */}
                      <div className="flex justify-between items-center text-[10px] font-mono text-[#7C725D] pt-2 border-t border-[#E4DED4]/60">
                        <span>METRIC INTERVAL: DAILY</span>
                        <div className="flex space-x-4">
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Active Stream Rate
                          </span>
                        </div>
                      </div>

                    </div>

                    {/* Operational Journal list */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[9px] text-[#7C725D] uppercase tracking-wide font-bold">LIVE TELEMETRY WORKSPACE OPERATIONS LOGS</span>
                        <span className="text-[9px] font-mono text-emerald-800 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <Activity className="h-3 w-3 animate-pulse" /> Active listener
                        </span>
                      </div>

                      <div className="border border-[#E4DED4] rounded-xl bg-[#FCFAF5] overflow-hidden">
                        <table className="w-full text-left font-mono text-[10px]">
                          <thead>
                            <tr className="bg-[#F5F2EB]/50 border-b border-[#E4DED4] text-[#7C725D] text-[9px] uppercase font-bold">
                              <th className="px-3 py-2 w-20">TIME</th>
                              <th className="px-3 py-2 w-28">GATEWAY</th>
                              <th className="px-3 py-2">LOG MESSAGE</th>
                              <th className="px-3 py-2 w-20 text-right">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E4DED4]/50">
                            {activePreset.logs.map((log, idx) => (
                              <tr key={idx} className="hover:bg-neutral-200/10">
                                <td className="px-3 py-2 text-[#7C725D]">{log.time}</td>
                                <td className="px-3 py-2 text-[#1F1C18] font-bold">{log.source}</td>
                                <td className="px-3 py-2 text-[#1F1C18]/85 truncate max-w-[200px]">{log.action}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`inline-block px-1.5 py-0.2 rounded-[4px] text-[8px] font-bold uppercase ${
                                    log.status === "success" 
                                      ? "bg-emerald-100 text-emerald-900" 
                                      : log.status === "warning"
                                      ? "bg-amber-100 text-amber-900"
                                      : "bg-blue-100 text-blue-900"
                                  }`}>
                                    {log.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                )}

                {/* SUBTAB 2: Data Lineage Dependency flow */}
                {activeSubTab === "lineage" && (
                  <div className="space-y-4 animate-fade-in py-1" id="lineage-dashboard-report">
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-semibold text-[#1F1C18]">Provenanceline-graph Path Reconstitution Analysis</h4>
                      <p className="text-[11px] text-[#7C725D] font-light font-sans">
                        Vizzy Pilot intercepts database processes, tracing all intermediate transforms down to the primary static filesystem.
                      </p>
                    </div>

                    {/* Nodes flow block grid layout */}
                    <div className="space-y-3.5 pt-2">
                      {activePreset.lineageNodes.map((node, i) => (
                        <div key={i} className="flex items-center justify-between">
                          {/* Left node card */}
                          <div className="flex items-center space-x-3 bg-[#FCFAF5] border border-[#E4DED4] p-3 rounded-xl flex-1 max-w-[420px] shadow-sm relative overflow-hidden group hover:border-[#1F1C18]/60 transition-all">
                            {/* Accent highlight strip */}
                            <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-emerald-600" />
                            <div className="pl-1.5 flex flex-col">
                              <div className="flex items-center space-x-2">
                                <span className="text-[11px] font-bold font-mono text-[#1F1C18] leading-tight block">{node.name}</span>
                                <span className="text-[8px] bg-[#1F1C18]/5 text-[#7C725D] border border-[#E4DED4] px-1.5 rounded font-mono font-bold leading-normal">{node.type}</span>
                              </div>
                              <span className="text-[10px] text-[#7C725D] font-mono mt-1 font-light block">Metadata reads: {node.rows}</span>
                            </div>
                          </div>

                          {/* Line and details indicator */}
                          <div className="hidden sm:flex flex-col items-center flex-1 font-mono text-[9px] text-[#7C725D] relative">
                            {i < activePreset.lineageNodes.length - 1 && (
                              <>
                                <span className="font-bold flex items-center gap-1.5 text-emerald-700">
                                  <GitCommit className="h-3.5 w-3.5" /> AGGREGATE LINK
                                </span>
                                <div className="h-8 border-l border-dashed border-[#E4DED4] my-1" />
                              </>
                            )}
                          </div>

                          {/* Status report */}
                          <div className="font-mono text-[10px] text-right">
                            <span className="text-[8px] text-[#7C725D] uppercase tracking-widest block font-bold mb-1">NODE RUN</span>
                            <span className="text-emerald-700 font-bold tracking-tight bg-emerald-500/10 px-2 py-0.5 rounded">{node.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 border border-[#E4DED4] rounded-xl bg-[#F5F2EB]/30 font-mono text-[10px] text-[#7C725D]">
                      <span className="text-[#1F1C18] font-bold">SECURITY NOTICE:</span> Database dependency mappings are locked in a signed cryptographic schema header block instantly verified.
                    </div>
                  </div>
                )}

                {/* SUBTAB 3: EXPLAIN ANALYZE QUERY COST PLAN */}
                {activeSubTab === "explain" && (
                  <div className="space-y-4 animate-fade-in py-1" id="query-plan-report">
                    <div className="space-y-1 bg-[#1F1C18] text-[#FCFAF5] p-3.5 rounded-xl font-mono text-[10.5px]">
                      <div className="flex items-center space-x-1 mb-2 text-emerald-500 font-bold border-b border-[#FCFAF5]/10 pb-2 text-[9px]">
                        <Terminal className="h-3.5 w-3.5 animate-pulse" />
                        <span>QUERY COMPILER EXPLAIN PERFORMANCE ANALYZER</span>
                      </div>
                      <div className="text-[#FCFAF5]/80">
                        EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS)
                      </div>
                      <div className="text-emerald-400 font-bold">
                        {activePreset.sql.slice(0, activePreset.sql.indexOf("\n")) || activePreset.sql} ...
                      </div>
                    </div>

                    {/* Sequential Operations list */}
                    <div className="space-y-2">
                      <span className="font-mono text-[9px] text-[#7C725D] uppercase tracking-wide font-bold">ESTIMATED SEGMENT EXECUTION COST</span>
                      <div className="space-y-2">
                        {activePreset.explanation.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-2.5 rounded-lg border border-[#E4DED4] bg-[#FCFAF5]">
                            <div className="flex items-center space-x-2.5">
                              <span className="h-5 w-5 rounded-full bg-[#1F1C18]/10 text-[#1F1C18] flex items-center justify-center font-mono text-[10px] font-bold">{item.step}</span>
                              <div className="flex flex-col">
                                <span className="font-mono text-xs font-bold text-[#1F1C18]">{item.operation}</span>
                                <span className="text-[10px] font-sans text-[#7C725D] font-light max-w-[280px] md:max-w-[340px] truncate block">{item.details}</span>
                              </div>
                            </div>
                            <div className="font-mono text-right">
                              <span className="text-[8px] text-[#7C725D] block uppercase font-bold">PIPELINE COST</span>
                              <span className="text-amber-800 font-bold text-xs">{item.cost}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Bottom aggregate stat box */}
            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-[#E4DED4] mt-6">
              <div>
                <span className="font-mono text-[8px] text-[#7C725D]/75 block uppercase tracking-wider">{activePreset.statLabel1}</span>
                <span className="font-display text-lg md:text-xl font-bold text-[#1F1C18]">
                  {metricMultiplier > 1 && !activePreset.statValue1.includes("-") && !activePreset.statValue1.includes(".")
                    ? (parseFloat(activePreset.statValue1.replace(/[^\d.]/g, '')) * metricMultiplier).toLocaleString() + (activePreset.statValue1.includes("%") ? "%" : "")
                    : activePreset.statValue1
                  }
                </span>
              </div>
              <div>
                <span className="font-mono text-[8px] text-[#7C725D]/75 block uppercase tracking-wider">{activePreset.statLabel2}</span>
                <span className="font-display text-lg md:text-xl font-bold text-[#1F1C18]">
                  {metricMultiplier > 1 && activePreset.statValue2.includes("B")
                    ? (parseFloat(activePreset.statValue2) * metricMultiplier).toFixed(1) + "B"
                    : activePreset.statValue2
                  }
                </span>
              </div>
              <div>
                <span className="font-mono text-[8px] text-[#7C725D]/75 block uppercase tracking-wider">{activePreset.statLabel3}</span>
                <span className="font-display text-lg md:text-xl font-bold text-[#1F1C18]">{activePreset.statValue3}</span>
              </div>
              <div>
                <span className="font-mono text-[8px] text-[#7C725D]/75 block uppercase tracking-wider">{activePreset.statLabel4}</span>
                <span className="font-display text-lg md:text-xl font-bold text-emerald-800">{activePreset.statValue4}</span>
              </div>
            </div>

          </div>

          {/* COLUMN 3: RIGHT SYSTEM DETAILS: Copied Insiders, AI provenance logs, SQL output (3 Cols on LG) */}
          <div className="lg:col-span-3 bg-[#F5F2EB]/40 p-5 flex flex-col justify-between">
            <div className="space-y-6 flex-1 flex flex-col justify-between h-full">
              
              {/* Dynamic Copied Insight panel */}
              <div className="space-y-3">
                <span className="font-mono text-[9px] text-[#7C725D] block uppercase tracking-wide font-bold">STATE INTERPRETER REPORT</span>
                <div className="bg-emerald-550/5 border border-emerald-500/15 p-4 rounded-xl font-normal text-xs text-emerald-950 leading-relaxed font-sans relative">
                  <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                  <div className="font-mono text-[8px] tracking-wider font-semibold text-emerald-800 uppercase mb-2 flex items-center gap-1.5">
                    <Landmark className="h-3 w-3" /> SECURITY CERTIFICATE
                  </div>
                  "{activePreset.insight}"
                </div>
              </div>

              {/* Data Specifications summary info grid */}
              <div className="space-y-2.5">
                <span className="font-mono text-[9px] text-[#7C725D] block uppercase tracking-widest font-bold">SCHEMA SPECIFICATIONS</span>
                <div className="space-y-1.5 font-mono text-[10px]">
                  <div className="flex justify-between border-b border-[#E4DED4] pb-1.5 text-[#7C725D]">
                    <span>Transaction Class:</span>
                    <strong className="text-[#1F1C18]">OLAP (Batch Ingest)</strong>
                  </div>
                  <div className="flex justify-between border-b border-[#E4DED4] pb-1.5 text-[#7C725D]">
                    <span>Index Nodes Traversed:</span>
                    <strong className="text-[#1F1C18]">{activePreset.nodesCount} segments</strong>
                  </div>
                  <div className="flex justify-between border-b border-[#E4DED4] pb-1.5 text-[#7C725D]">
                    <span>Cache Expiry:</span>
                    <strong className="text-emerald-700">300 seconds (TTL)</strong>
                  </div>
                  <div className="flex justify-between text-[#7C725D]">
                    <span>Audit Pipeline:</span>
                    <strong className="text-emerald-750">Active SHA-256</strong>
                  </div>
                </div>
              </div>

              {/* Compiled Raw SQL box */}
              <div className="space-y-2 pb-1 bg-white border border-[#E4DED4] p-3 rounded-xl shadow-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[9px] text-[#7C725D] uppercase tracking-wide font-bold">PRODUCED COMPLIANT SQL</span>
                  <button
                    id="btn-copy-sql"
                    onClick={copyToClipboard}
                    className="p-1 rounded-md hover:bg-[#1F1C18]/10 text-[#1F1C18] transition-all"
                    title="Copy Compiled SQL"
                  >
                    {copied ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-700">Copied!</span>
                    ) : (
                      <ClipboardCopy className="h-3.5 w-3.5 text-[#7C725D]" />
                    )}
                  </button>
                </div>
                <div className="bg-[#1F1C18] rounded-lg p-3 font-mono text-[9.5px] text-[#FCFAF5]/90 leading-relaxed overflow-x-auto max-h-36 shadow-md select-all">
                  {activePreset.sql}
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono text-[#1F1C18]/40 pt-1">
                  <span>Compilation: 0.05ms</span>
                  <span>100% Strict Type</span>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
