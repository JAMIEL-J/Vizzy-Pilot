import { useState, useMemo } from 'react';
import { 
  Database, ChevronDown, Check, 
  AlertCircle, FileText, Sparkles, TrendingUp,
  Settings2, CheckSquare, Tag, X, Filter, Layers, Activity, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardPage({ isDark }: { isDark: boolean }) {
  // Programming function to dynamically query the parent lineage trace
  const parent_version_id = (version: 'v1' | 'v2'): string => {
    return version === 'v1' ? 'Raw v1 (PID-098)' : 'Cleaned v2 (PID-204)';
  };

  // Version Select: "Raw v1" or "Cleaned v2"
  const [selectedVersion, setSelectedVersion] = useState<'v1' | 'v2'>('v2');
  const [selectedDataset, setSelectedDataset] = useState('Global Transactions');
  const [selectedDomainContext, setSelectedDomainContext] = useState<'Sales & Revenue' | 'Marketing Campaigns' | 'Customer Retention' | 'Product Analytics'>('Sales & Revenue');
  
  // Interactive filters
  const [regionFilter, setRegionFilter] = useState('All Regions');
  const [segmentFilter, setSegmentFilter] = useState('All Segments');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [contractFilter, setContractFilter] = useState('All Contracts');
  
  // Tab selector: Key Insights or All Columns Tab
  const [activeTab, setActiveTab] = useState<'insights' | 'schema'>('insights');
  
  // Custom interactive notifications
  const [notifications, setNotifications] = useState<string[]>([]);
  
  // All Columns Page Pagination state
  const [allColumnsPage, setAllColumnsPage] = useState<number>(1);
  
  // Value Remapper Pop-up state
  const [isRemapperOpen, setIsRemapperOpen] = useState(false);
  const [remapColumn, setRemapColumn] = useState('Customer Region');
  const [remapFromValue, setRemapFromValue] = useState('NA');
  const [remapToValue, setRemapToValue] = useState('North America');

  // Column Classifier state overrides
  const [isClassifierOpen, setIsClassifierOpen] = useState(false);
  const [columnRoles, setColumnRoles] = useState<Record<string, 'metric' | 'categorical' | 'identifier'>>({
    'Order ID': 'identifier',
    'Revenue': 'metric',
    'Order Date': 'categorical',
    'Customer Region': 'categorical',
    'Customer Segment': 'categorical',
    'Product Category': 'categorical',
    'Contract Type': 'categorical',
    'Profit Margin': 'metric'
  });

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (id: string) => {
    setOpenDropdown(openDropdown === id ? null : id);
  };

  // KPI calculations based on Raw v1 vs Cleaned v2, active filters, and the chosen thematic domain context!
  const kpiData = useMemo(() => {
    const isV2 = selectedVersion === 'v2';
    const baseMult = isV2 ? 1.0 : 0.91; // Cleaned data has full deduplication & imputation (+9%)
    
    // Filter multipliers to show interactive reactive updates!
    let filterMult = 1.0;
    if (regionFilter !== 'All Regions') filterMult *= 0.35;
    if (segmentFilter !== 'All Segments') filterMult *= 0.45;
    if (categoryFilter !== 'All Categories') filterMult *= 0.55;
    if (contractFilter !== 'All Contracts') filterMult *= 0.65;
    
    // Cap minimum to make it look realistic
    filterMult = Math.max(filterMult, 0.12);

    let baseRev = 2110500;
    let baseChurn = 3.8;

    // Shift based on selected thematic domain context
    if (selectedDomainContext === 'Marketing Campaigns') {
      baseRev = 1450000;
      baseChurn = 5.2;
    } else if (selectedDomainContext === 'Customer Retention') {
      baseRev = 1890000;
      baseChurn = 2.1;
    } else if (selectedDomainContext === 'Product Analytics') {
      baseRev = 2320000;
      baseChurn = 3.4;
    }

    const revenue = baseRev * baseMult * filterMult;
    const orders = Math.round(8432 * baseMult * filterMult);
    const avgOrder = Math.round(revenue / (orders || 1));
    const churn = isV2 ? (baseChurn * 0.8) : baseChurn;
    const growth = isV2 ? 12.4 : 10.1;

    return {
      revenue: `$${(revenue / 1000000).toFixed(2)}M`,
      orders: orders.toLocaleString(),
      avgOrder: `$${avgOrder}`,
      churn: `${churn.toFixed(1)}%`,
      growth: `+${growth}%`
    };
  }, [selectedVersion, selectedDomainContext, regionFilter, segmentFilter, categoryFilter, contractFilter]);

  // Data for region chart (Dusty Blue #7D9BBA)
  const regionData = useMemo(() => {
    const base = [
      { name: 'North America', val: 920000 },
      { name: 'Europe', val: 640000 },
      { name: 'Asia Pacific', val: 380000 },
      { name: 'Latin America', val: 170000 }
    ];
    const isV1 = selectedVersion === 'v1';
    return base.map(item => {
      let multiplier = isV1 ? 0.91 : 1.0;
      if (regionFilter !== 'All Regions' && item.name !== regionFilter) {
        multiplier *= 0.05; // heavily dim others if specific region selected
      }
      return {
        name: item.name,
        val: Math.round(item.val * multiplier)
      };
    });
  }, [selectedVersion, regionFilter]);

  // Data for segment donut chart
  const segmentData = [
    { name: 'Enterprise', val: 45, color: '#2DD4BF' }, // teal-400
    { name: 'Mid-Market', val: 33, color: '#0D9488' }, // teal-600
    { name: 'SMB', val: 22, color: '#94A3B8' }         // slate-400
  ];

  // Actions
  const handleGenerateInsight = () => {
    const insightList = [
      `AI INSIGHT: Mid-Market expansion in Europe is outpacing enterprise by 2.4x for ${selectedDomainContext}.`,
      "AI INSIGHT: Cleaned dataset resolved 412 duplicate order rows in North America.",
      "AI INSIGHT: Churn risk flagged for 14 accounts in APAC using Multi-Year contracts.",
      "AI INSIGHT: Software category maintains a high average order value of $412 across all segments."
    ];
    const randomInsight = insightList[Math.floor(Math.random() * insightList.length)];
    setNotifications(prev => [randomInsight, ...prev].slice(0, 3));
  };

  const handleRemapValues = () => {
    setNotifications(prev => [`SUCCESS: Re-mapped '${remapFromValue}' occurrences to '${remapToValue}' in column '${remapColumn}'.`, ...prev].slice(0, 3));
    setIsRemapperOpen(false);
  };

  const handleSaveRoles = () => {
    setNotifications(prev => ["SUCCESS: Custom column classifier mappings saved to metadata overrides context.", ...prev].slice(0, 3));
    setIsClassifierOpen(false);
  };

  return (
    <div className="bg-bg text-text-custom font-sans flex flex-col relative pb-20 w-full min-h-[600px] text-left">
      
      {/* 1. Header Area with Dataset Selector and Version Toggle */}
      <div className="border-b border-border-custom bg-surface/50 backdrop-blur-md sticky top-0 z-25">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4">
          
          {/* Logo & Path Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-surface-2 rounded-xl border border-border-custom flex items-center justify-center">
              <Database className="w-5 h-5 text-accent-custom" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-[10px] text-muted-custom font-sans">
                <span>Apps</span>
                <span>/</span>
                <span>Workspace</span>
                <span>/</span>
                <span className="text-accent-custom">Analytics Dashboard</span>
              </div>
              <h1 className="text-sm font-semibold tracking-tight">Dynamic Analytics Dashboard</h1>
            </div>
          </div>

          {/* Action Row: Dataset dropdown + Version Switcher */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Dataset Dropdown */}
            <div className="relative">
              <button 
                onClick={() => toggleDropdown('dataset')}
                className="px-3 py-1.5 text-xs font-sans bg-surface border border-border-custom rounded-xl flex items-center space-x-2 hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-muted-custom" />
                <span>{selectedDataset}</span>
                <ChevronDown className="w-3 h-3 text-muted-custom" />
              </button>
              {openDropdown === 'dataset' && (
                <div className="absolute right-0 mt-1.5 w-56 bg-surface border border-border-custom rounded-xl shadow-xl z-50 py-1 overflow-hidden font-sans text-xs">
                  {['Global Transactions', 'Customer Churn Stream', 'Marketing Performance Log'].map((ds) => (
                    <button
                      key={ds}
                      onClick={() => {
                        setSelectedDataset(ds);
                        setOpenDropdown(null);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center justify-between transition-colors cursor-pointer border-none bg-transparent"
                    >
                      <span className={selectedDataset === ds ? 'text-accent-custom font-semibold' : ''}>{ds}</span>
                      {selectedDataset === ds && <Check className="w-3.5 h-3.5 text-accent-custom" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Version Picker */}
            <div className="bg-surface-2 border border-border-custom p-0.5 rounded-xl flex items-center space-x-0.5">
              <button
                onClick={() => setSelectedVersion('v1')}
                className={`px-3 py-1 text-xs font-sans rounded-lg transition-all cursor-pointer border-none ${
                  selectedVersion === 'v1' 
                    ? 'bg-surface text-text-custom shadow-xs font-medium border border-border-custom' 
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                {parent_version_id('v1')}
              </button>
              <button
                onClick={() => setSelectedVersion('v2')}
                className={`px-3 py-1 text-xs font-sans rounded-lg transition-all cursor-pointer flex items-center space-x-1 border-none ${
                  selectedVersion === 'v2' 
                    ? 'bg-surface text-text-custom shadow-xs font-semibold border border-border-custom' 
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <Sparkles className="w-3 h-3 text-accent-custom animate-pulse" />
                <span>{parent_version_id('v2')}</span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content Workspace Grid */}
      <div className="p-4 space-y-6 flex-1">

        {/* Dynamic Warning Indicator when on Raw v1 */}
        {selectedVersion === 'v1' && (
          <div className="p-3 bg-warning-custom/10 border border-warning-custom/20 rounded-xl flex items-start space-x-2 text-xs text-warning-custom animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Viewing Raw Dataset (v1).</span> Warning: 412 duplicate records, 28 null entries in Segment field, and 3 outliers in pricing are currently affecting accuracy. Switch to <button onClick={() => setSelectedVersion('v2')} className="underline font-bold hover:text-orange-600 bg-transparent border-none cursor-pointer">Cleaned v2</button> to apply corrections automatically.
            </div>
          </div>
        )}

        {/* Domain context switcher strip */}
        <div className="flex flex-wrap gap-2 items-center bg-surface border border-border-custom p-2 rounded-xl">
          <span className="text-[10px] font-sans text-muted-custom uppercase px-2 font-bold">Domain Context:</span>
          {(['Sales & Revenue', 'Marketing Campaigns', 'Customer Retention', 'Product Analytics'] as const).map((ctx) => (
            <button
              key={ctx}
              onClick={() => setSelectedDomainContext(ctx)}
              className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
                selectedDomainContext === ctx
                  ? 'bg-accent-custom/10 text-accent-custom border-accent-custom/20 font-bold'
                  : 'bg-transparent text-muted-custom border-transparent hover:text-text-custom'
              }`}
            >
              {ctx}
            </button>
          ))}
        </div>

        {/* 1. KEY INDICATORS OVERVIEW */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          
          <div className="bg-surface border border-border-custom p-4 rounded-2xl flex flex-col justify-between shadow-xs">
            <span className="text-[10px] font-sans text-muted-custom uppercase">Total Revenue</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold tracking-tight">{kpiData.revenue}</span>
              <span className={`text-[10px] font-sans ${selectedVersion === 'v2' ? 'text-success-custom font-bold' : 'text-muted-custom'}`}>
                {selectedVersion === 'v2' ? '+9.1%' : '--'}
              </span>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-2xl flex flex-col justify-between shadow-xs">
            <span className="text-[10px] font-sans text-muted-custom uppercase">Orders</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold tracking-tight">{kpiData.orders}</span>
              <span className="text-[10px] font-sans text-muted-custom">Deduplicated</span>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-2xl flex flex-col justify-between shadow-xs">
            <span className="text-[10px] font-sans text-muted-custom uppercase">Avg Order Value</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold tracking-tight font-mono">{kpiData.avgOrder}</span>
              <span className="text-[10px] font-sans text-success-custom font-bold">+2.4%</span>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-2xl flex flex-col justify-between shadow-xs">
            <span className="text-[10px] font-sans text-muted-custom uppercase">Customer Churn</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold tracking-tight">{kpiData.churn}</span>
              <span className={`text-[10px] font-sans ${selectedVersion === 'v2' ? 'text-success-custom font-bold' : 'text-warning-custom font-bold'}`}>
                {selectedVersion === 'v2' ? '-0.6%' : '+0.3%'}
              </span>
            </div>
          </div>

          <div className="bg-surface border border-border-custom p-4 rounded-2xl flex flex-col justify-between shadow-xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-sans text-muted-custom uppercase">Annual Growth</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold tracking-tight text-accent-custom">{kpiData.growth}</span>
              <span className="text-[10px] font-sans text-muted-custom">Target 15%</span>
            </div>
          </div>

        </div>

        {/* Notification Banner area */}
        {notifications.length > 0 && (
          <div className="space-y-1.5 animate-fade-in">
            {notifications.map((note, index) => (
              <div 
                key={index} 
                className={`p-2.5 rounded-xl text-xs font-sans border flex items-center justify-between ${
                  note.startsWith('SUCCESS') ? 'bg-success-custom/10 border-success-custom/20 text-success-custom' :
                  note.startsWith('CLASSIFIER') ? 'bg-sky-500/10 border-sky-500/20 text-accent-custom' :
                  note.startsWith('AI') ? 'bg-accent-custom/10 border-accent-custom/20 text-accent-custom font-semibold' :
                  'bg-surface border-border-custom text-text-custom'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-custom animate-ping"></span>
                  <span>{note}</span>
                </div>
                <button onClick={() => setNotifications(prev => prev.filter((_, i) => i !== index))} className="text-muted-custom hover:text-text-custom bg-transparent border-none cursor-pointer">×</button>
              </div>
            ))}
          </div>
        )}

        {/* 4. LOCAL FILTERS DOCK */}
        <div className="bg-surface border border-border-custom rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 text-xs font-sans text-muted-custom mr-2">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-bold uppercase tracking-wider text-accent-custom">Local Filters:</span>
          </div>

          {/* Region Filter */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('region')}
              className="px-3 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom hover:bg-border-custom/30 rounded-xl flex items-center space-x-2 cursor-pointer transition-all bg-transparent"
            >
              <span className="text-muted-custom">Region:</span>
              <span className="font-semibold">{regionFilter}</span>
              <ChevronDown className="w-3 h-3 text-muted-custom" />
            </button>
            {openDropdown === 'region' && (
              <div className="absolute left-0 mt-1.5 w-48 bg-surface border border-border-custom rounded-xl shadow-xl z-50 py-1 font-sans text-xs">
                {['All Regions', 'North America', 'Europe', 'Asia Pacific', 'Latin America'].map((region) => (
                  <button
                    key={region}
                    onClick={() => {
                      setRegionFilter(region);
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                  >
                    <span className={regionFilter === region ? 'text-accent-custom font-semibold' : ''}>{region}</span>
                    {regionFilter === region && <Check className="w-3 h-3 text-accent-custom" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Segment Filter */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('segment')}
              className="px-3 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom hover:bg-border-custom/30 rounded-xl flex items-center space-x-2 cursor-pointer transition-all bg-transparent"
            >
              <span className="text-muted-custom">Segment:</span>
              <span className="font-semibold">{segmentFilter}</span>
              <ChevronDown className="w-3 h-3 text-muted-custom" />
            </button>
            {openDropdown === 'segment' && (
              <div className="absolute left-0 mt-1.5 w-44 bg-surface border border-border-custom rounded-xl shadow-xl z-50 py-1 font-sans text-xs">
                {['All Segments', 'Enterprise', 'Mid-Market', 'SMB'].map((seg) => (
                  <button
                    key={seg}
                    onClick={() => {
                      setSegmentFilter(seg);
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                  >
                    <span className={segmentFilter === seg ? 'text-accent-custom font-semibold' : ''}>{seg}</span>
                    {segmentFilter === seg && <Check className="w-3 h-3 text-accent-custom" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category Filter */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('category')}
              className="px-3 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom hover:bg-border-custom/30 rounded-xl flex items-center space-x-2 cursor-pointer transition-all bg-transparent"
            >
              <span className="text-muted-custom">Category:</span>
              <span className="font-semibold">{categoryFilter}</span>
              <ChevronDown className="w-3 h-3 text-muted-custom" />
            </button>
            {openDropdown === 'category' && (
              <div className="absolute left-0 mt-1.5 w-44 bg-surface border border-border-custom rounded-xl shadow-xl z-50 py-1 font-sans text-xs">
                {['All Categories', 'Software', 'Hardware', 'Services'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setCategoryFilter(cat);
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                  >
                    <span className={categoryFilter === cat ? 'text-accent-custom font-semibold' : ''}>{cat}</span>
                    {categoryFilter === cat && <Check className="w-3 h-3 text-accent-custom" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contract Filter */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('contract')}
              className="px-3 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom hover:bg-border-custom/30 rounded-xl flex items-center space-x-2 cursor-pointer transition-all bg-transparent"
            >
              <span className="text-muted-custom">Contract:</span>
              <span className="font-semibold">{contractFilter}</span>
              <ChevronDown className="w-3 h-3 text-muted-custom" />
            </button>
            {openDropdown === 'contract' && (
              <div className="absolute left-0 mt-1.5 w-44 bg-surface border border-border-custom rounded-xl shadow-xl z-50 py-1 font-sans text-xs">
                {['All Contracts', 'Annual', 'Monthly', 'Multi-Year'].map((ct) => (
                  <button
                    key={ct}
                    onClick={() => {
                      setContractFilter(ct);
                      setOpenDropdown(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                  >
                    <span className={contractFilter === ct ? 'text-accent-custom font-semibold' : ''}>{ct}</span>
                    {contractFilter === ct && <Check className="w-3 h-3 text-accent-custom" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset Filters CTA */}
          {(regionFilter !== 'All Regions' || segmentFilter !== 'All Segments' || categoryFilter !== 'All Categories' || contractFilter !== 'All Contracts') && (
            <button 
              onClick={() => {
                setRegionFilter('All Regions');
                setSegmentFilter('All Segments');
                setCategoryFilter('All Categories');
                setContractFilter('All Contracts');
              }}
              className="text-xs font-sans text-accent-custom hover:underline ml-auto flex items-center space-x-1 bg-transparent border-none cursor-pointer animate-fade-in"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Clear Filter Locks</span>
            </button>
          )}

        </div>

        {/* 4. Chart Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
          
          {/* Card 1: Revenue by Region */}
          <div className="lg:col-span-3 bg-surface border border-border-custom rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold tracking-tight">Revenue by Region</h3>
                <span className="text-[11px] font-sans text-muted-custom">Adaptive In-Memory Engine</span>
              </div>
              
              <div className="h-44 flex justify-around border-b border-border-custom/50 pb-2 px-2 mt-8">
                {regionData.map((region, i) => {
                  const maxVal = 920000;
                  const percent = (region.val / maxVal) * 85; // cap at 85% for padding
                  return (
                    <div key={i} className="flex flex-col justify-end items-center flex-1 group relative h-full">
                      <div className="absolute -top-10 scale-0 group-hover:scale-100 bg-surface border border-border-custom px-2 py-1 rounded-md text-[10px] font-sans shadow-md transition-all duration-150 z-10 pointer-events-none whitespace-nowrap">
                        ${region.val.toLocaleString()}
                      </div>
                      <div 
                        className="w-8 bg-[#7D9BBA] hover:bg-[#6A89A8] rounded-t-lg transition-all duration-300 relative"
                        style={{ height: `${percent}%` }}
                      >
                        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/10 rounded-t-lg"></div>
                      </div>
                      <span className="text-[10px] font-sans text-muted-custom mt-2 truncate max-w-full text-center" title={region.name}>
                        {region.name === 'North America' ? 'NA' : region.name === 'Europe' ? 'EU' : region.name === 'Asia Pacific' ? 'APAC' : region.name === 'Latin America' ? 'LATAM' : 'ME'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border-custom pt-3 flex justify-between items-center text-[11px] font-sans text-muted-custom mt-4">
              <span>Primary accent: <span className="text-[#7D9BBA] font-semibold">Dusty Blue (#7D9BBA)</span></span>
              <span>Sorted by revenue desc</span>
            </div>
          </div>

          {/* Card 2: Segment Mix */}
          <div className="lg:col-span-3 bg-surface border border-border-custom rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold tracking-tight">Segment Distribution</h3>
                <span className="text-[11px] font-sans text-success-custom">Valid schema</span>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center justify-center py-6 gap-6">
                <div className="relative w-36 h-36 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#2DD4BF" strokeWidth="3.2" strokeDasharray="45 55" />
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0D9488" strokeWidth="3.2" strokeDasharray="33 67" strokeDashoffset="-45" />
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#94A3B8" strokeWidth="3.2" strokeDasharray="22 78" strokeDashoffset="-78" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-sans text-muted-custom">Total Mix</span>
                    <span className="text-base font-bold">100%</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs font-sans">
                  {segmentData.map((segment, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: segment.color }}></span>
                      <span className="text-muted-custom">{segment.name}:</span>
                      <span className="font-semibold text-text-custom">{segment.val}%</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
            <div className="border-t border-border-custom pt-3 text-[11px] font-sans text-muted-custom flex justify-between">
              <span>Automatic semantic typing</span>
              <span>100% rows mapped</span>
            </div>
          </div>

          {/* Card 3: Active Ingestion Trend */}
          <div className="lg:col-span-4 bg-surface border border-border-custom rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-semibold tracking-tight">Active Ingestion Trend</h3>
                  <span className="px-1.5 py-0.5 bg-success-custom/10 text-success-custom border border-success-custom/20 rounded-md text-[10px] font-sans">Live</span>
                </div>
                <div className="flex items-center space-x-2 text-xs font-sans">
                  <span className="w-2 h-2 rounded-full bg-accent-custom"></span>
                  <span className="text-muted-custom">Real-Time Inflow</span>
                </div>
              </div>

              <div className="h-44 w-full relative">
                <svg className="w-full h-full" viewBox="0 0 600 160" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gradientLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="40" x2="600" y2="40" stroke="var(--border)" strokeDasharray="3,3" />
                  <line x1="0" y1="80" x2="600" y2="80" stroke="var(--border)" strokeDasharray="3,3" />
                  <line x1="0" y1="120" x2="600" y2="120" stroke="var(--border)" strokeDasharray="3,3" />
                  <path d="M 0 160 Q 100 110, 200 130 T 400 60 T 600 20 L 600 160 Z" fill="url(#gradientLine)" />
                  <path d="M 0 160 Q 100 110, 200 130 T 400 60 T 600 20" fill="none" stroke="#2DD4BF" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="200" cy="130" r="4" fill="#2DD4BF" stroke="#FAFAF9" strokeWidth="2" />
                  <circle cx="400" cy="60" r="4" fill="#2DD4BF" stroke="#FAFAF9" strokeWidth="2" />
                  <circle cx="600" cy="20" r="4" fill="#2DD4BF" stroke="#FAFAF9" strokeWidth="2" />
                </svg>
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] font-sans text-muted-custom pt-1">
                  <span>Week 01</span>
                  <span>Week 02</span>
                  <span>Week 03</span>
                  <span>Week 04</span>
                </div>
              </div>
            </div>
            <div className="border-t border-border-custom pt-3 flex justify-between items-center text-[11px] font-sans text-muted-custom">
              <span>Crossover threshold: 100K rows</span>
              <span className="text-success-custom">No aggregation bottlenecks flagged</span>
            </div>
          </div>

          {/* Card 4: Engine Speed */}
          <div className="lg:col-span-2 bg-surface border border-border-custom rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight">Dual-Engine Speed</h3>
                <span className="text-xs font-sans text-[#7D9BBA]">Benchmark</span>
              </div>
              
              <div className="bg-surface-2 border border-border-custom p-4 rounded-xl space-y-3 font-sans">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-custom">In-Memory Cache (Small)</span>
                  <span className="text-text-custom font-semibold font-mono">2.77ms</span>
                </div>
                <div className="w-full h-1.5 bg-border-custom/50 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-custom w-1/4"></div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-muted-custom">Vectorized Engine (Large)</span>
                  <span className="text-text-custom font-semibold font-mono">55ms</span>
                </div>
                <div className="w-full h-1.5 bg-border-custom/50 rounded-full overflow-hidden">
                  <div className="h-full bg-[#7D9BBA] w-4/5"></div>
                </div>
              </div>

              <div className="text-xs space-y-1.5 text-muted-custom font-sans leading-relaxed text-left">
                <p>Vizzy routes queries dynamically depending on target dataset size. Small data segments remain cached in-memory for microsecond speed, while massive tables leverage vectorized parallel streams automatically.</p>
              </div>
            </div>
            <div className="border-t border-border-custom pt-3 text-[11px] font-sans text-muted-custom flex items-center justify-between">
              <span>Automatic router</span>
              <TrendingUp className="w-3.5 h-3.5 text-accent-custom" />
            </div>
          </div>

        </div>

        {/* 5. SWITCHER TABS SECTION */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-custom pb-2 gap-2">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('insights')}
                className={`pb-2 px-1 text-xs font-sans border-b-2 transition-all cursor-pointer bg-transparent border-none ${
                  activeTab === 'insights' 
                    ? 'border-accent-custom text-text-custom font-semibold animate-pulse-subtle' 
                    : 'border-transparent text-muted-custom hover:text-text-custom'
                }`}
              >
                Key Insights Tab
              </button>
              <button
                onClick={() => {
                  setActiveTab('schema');
                  setAllColumnsPage(1);
                }}
                className={`pb-2 px-1 text-xs font-sans border-b-2 transition-all cursor-pointer bg-transparent border-none ${
                  activeTab === 'schema' 
                    ? 'border-accent-custom text-text-custom font-semibold' 
                    : 'border-transparent text-muted-custom hover:text-text-custom'
                }`}
              >
                All Columns Tab (12 Dimensions)
              </button>
            </div>
            
            <div className="flex items-center space-x-3 text-[11px] font-sans">
              <button
                onClick={() => setIsClassifierOpen(!isClassifierOpen)}
                className="px-2 py-1 bg-surface-2 hover:bg-border-custom/30 text-text-custom border border-border-custom rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5 text-accent-custom" />
                <span>Configure Classifier overrides</span>
              </button>
              <div className="text-muted-custom flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-success-custom animate-pulse"></span>
                <span>5/5 widgets active</span>
              </div>
            </div>
          </div>

          {/* Interactive Column Classifier Overrides Grid Panel */}
          <AnimatePresence>
            {isClassifierOpen && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-surface border border-border-custom rounded-2xl p-5 space-y-4 overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckSquare className="w-4.5 h-4.5 text-accent-custom" />
                    <h3 className="text-sm font-semibold tracking-tight">Column Classifier Panel (Override Role Mapping)</h3>
                  </div>
                  <button onClick={() => setIsClassifierOpen(false)} className="text-muted-custom hover:text-text-custom bg-transparent border-none cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-custom">Override automated system classification roles. Column roles determine which automated chart pairings are compiled in the All Columns grid.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  {Object.entries(columnRoles).map(([colName, role]) => (
                    <div key={colName} className="bg-surface-2 border border-border-custom p-3 rounded-xl flex flex-col justify-between space-y-2 text-left">
                      <span className="text-xs font-sans font-semibold text-text-custom truncate" title={colName}>{colName}</span>
                      <div className="flex bg-surface rounded-lg p-0.5 border border-border-custom">
                        {(['metric', 'categorical', 'identifier'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setColumnRoles(prev => ({ ...prev, [colName]: r }))}
                            className={`flex-1 text-[10px] font-sans py-1 rounded capitalize transition-all border-none ${
                              role === r 
                                ? 'bg-accent-custom text-white font-semibold shadow-xs' 
                                : 'text-muted-custom hover:text-text-custom bg-transparent cursor-pointer'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveRoles}
                    className="px-4 py-1.5 bg-accent-custom hover:opacity-90 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all border-none"
                  >
                    Save Custom Classifier Overrides
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab Content 1: Key Insights Tab */}
          {activeTab === 'insights' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Regional Maps */}
              <div className="bg-surface border border-border-custom rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-accent-custom/10 text-accent-custom border border-accent-custom/20 rounded-lg text-[10px] font-sans font-semibold">Coordinate Mapping</span>
                    <span className="text-[10px] font-sans text-muted-custom">Interactive map bounds</span>
                  </div>
                  <h4 className="text-xs font-semibold font-sans text-text-custom">Regional Map Breakdown</h4>
                </div>

                <div className="h-32 w-full bg-surface-2/30 border border-border-custom/60 rounded-xl relative overflow-hidden flex items-center justify-center p-2">
                  <svg viewBox="0 0 120 60" className="w-full h-full opacity-60 text-muted-custom">
                    <path d="M10,15 Q18,8 25,12 T40,15 T50,25 T30,45 Z" fill="currentColor" opacity="0.15" />
                    <path d="M60,15 Q75,10 90,12 T110,25 T80,45 Z" fill="currentColor" opacity="0.15" />
                    <path d="M75,30 Q85,45 80,55 Z" fill="currentColor" opacity="0.1" />
                    <circle cx="28" cy="18" r="4" fill="#0EA5E9" className="animate-ping" style={{ animationDuration: '3s' }} />
                    <circle cx="28" cy="18" r="3.5" fill="#0EA5E9" />
                    <circle cx="78" cy="18" r="4" fill="#2DD4BF" className="animate-ping" style={{ animationDuration: '4.5s' }} />
                    <circle cx="78" cy="18" r="3.5" fill="#2DD4BF" />
                    <circle cx="95" cy="35" r="3" fill="#F59E0B" />
                    <circle cx="42" cy="42" r="3" fill="#EC4899" />
                  </svg>
                  
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center text-[9px] font-sans bg-surface/90 border border-border-custom p-1.5 rounded-lg">
                    <span className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-[#0EA5E9] rounded-full"></span><span>NA: 920k</span></span>
                    <span className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-[#2DD4BF] rounded-full"></span><span>EU: 640k</span></span>
                    <span className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full"></span><span>APAC: 380k</span></span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-custom leading-relaxed font-sans text-left">
                  Visualizing coordinates for regional activity. North America remains our high-density cluster center, maintaining the lowest overall friction score.
                </p>
              </div>

              {/* Weekly Velocity Trend */}
              <div className="bg-surface border border-border-custom rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-success-custom/10 text-success-custom border border-success-custom/20 rounded-lg text-[10px] font-sans font-semibold">Weekly Velocity</span>
                    <span className="text-[10px] font-sans text-muted-custom">Spike detected (Week 3)</span>
                  </div>
                  <h4 className="text-xs font-semibold font-sans text-text-custom">Regional Growth Anomaly</h4>
                </div>

                <div className="h-32 w-full relative">
                  <svg className="w-full h-full" viewBox="0 0 200 80" preserveAspectRatio="none">
                    <path
                      d="M 10 70 L 40 68 L 70 65 L 100 25 L 130 55 L 160 52 L 190 48"
                      fill="none"
                      stroke="#2DD4BF"
                      strokeWidth="2"
                    />
                    <circle cx="100" cy="25" r="3" fill="#2DD4BF" stroke="var(--surface)" strokeWidth="1" />
                    <circle cx="130" cy="55" r="3" fill="#2DD4BF" stroke="var(--surface)" strokeWidth="1" />
                  </svg>
                  <div className="absolute inset-0 bg-gradient-to-t from-accent-custom/5 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[8px] font-sans text-muted-custom pt-1">
                    <span>Wk 01</span>
                    <span className="text-accent-custom font-bold">Wk 03 (Spike)</span>
                    <span>Wk 07</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-custom leading-relaxed font-sans text-left">
                  Europe Enterprise subscription sales showed a 42% spike in the third week of Q3, driven by multi-year renewals.
                </p>
              </div>

              {/* Dimension Metrics Mix */}
              <div className="bg-surface border border-border-custom rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-accent-custom/10 text-accent-custom border border-accent-custom/20 rounded-lg text-[10px] font-sans font-semibold">Distribution profile</span>
                    <span className="text-[10px] font-sans text-muted-custom">No Nulls</span>
                  </div>
                  <h4 className="text-xs font-semibold font-sans text-text-custom">Contract Allocation Mix</h4>
                </div>

                <div className="flex items-center justify-center space-x-4 py-1">
                  <div className="relative w-20 h-20">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#2DD4BF" strokeWidth="4.5" strokeDasharray="65 35" strokeDashoffset="0" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0D9488" strokeWidth="4.5" strokeDasharray="25 75" strokeDashoffset="-65" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#94A3B8" strokeWidth="4.5" strokeDasharray="10 90" strokeDashoffset="-90" />
                    </svg>
                  </div>
                  <div className="space-y-1 text-[9px] font-sans">
                    <div className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-[#2DD4BF] rounded-full"></span><span>Annual: 65%</span></div>
                    <div className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-[#0D9488] rounded-full"></span><span>Monthly: 25%</span></div>
                    <div className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full"></span><span>Multi-Year: 10%</span></div>
                  </div>
                </div>

                <p className="text-[11px] text-muted-custom leading-relaxed font-sans text-left">
                  Annual licenses make up 65% of the software category mix. Growth is highly correlated with the SMB segment in NA.
                </p>
              </div>

            </div>
          )}

          {/* Tab Content 2: All Columns Tab */}
          {activeTab === 'schema' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-surface-2 p-3 border border-border-custom rounded-xl text-xs font-sans">
                <span className="text-muted-custom">Paginated grid showing column profiles (Page {allColumnsPage} of 2)</span>
                <div className="flex items-center space-x-1">
                  <button 
                    disabled={allColumnsPage === 1}
                    onClick={() => setAllColumnsPage(1)}
                    className="px-2 py-0.5 border border-border-custom rounded bg-surface text-text-custom disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    &larr; Prev Page
                  </button>
                  <button 
                    disabled={allColumnsPage === 2}
                    onClick={() => setAllColumnsPage(2)}
                    className="px-2 py-0.5 border border-border-custom rounded bg-surface text-text-custom disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Next Page &rarr;
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
                {(allColumnsPage === 1 
                  ? [
                      { name: 'Order ID', semantic: 'Identifier (UID)', type: 'Unique ID', chartType: 'bar', pairing: 'ID x Volume', distribution: [30, 30, 31, 30, 30] },
                      { name: 'Revenue', semantic: 'Numeric (Currency)', type: 'Currency / Float', chartType: 'line', pairing: 'Category x Revenue', distribution: [10, 30, 85, 45, 12] },
                      { name: 'Order Date', semantic: 'Temporal (Date)', type: 'Date & Time', chartType: 'line', pairing: 'Date x Profit Margin', distribution: [15, 35, 20, 60, 10] },
                      { name: 'Customer Region', semantic: 'Categorical (Geo)', type: 'Text / Label', chartType: 'bar', pairing: 'Region x Revenue', distribution: [85, 64, 38, 17, 9] },
                    ]
                  : [
                      { name: 'Customer Segment', semantic: 'Categorical', type: 'Text / Label', chartType: 'donut', pairing: 'Segment x Margin', distribution: [45, 33, 22] },
                      { name: 'Product Category', semantic: 'Categorical', type: 'Text / Label', chartType: 'bar', pairing: 'Category x Volume', distribution: [75, 45, 15] },
                      { name: 'Contract Type', semantic: 'Categorical', type: 'Text / Label', chartType: 'bar', pairing: 'Contract x Revenue', distribution: [65, 25, 10] },
                      { name: 'Profit Margin', semantic: 'Numeric (Ratio)', type: 'Ratio / Percent', chartType: 'line', pairing: 'Segment x Profit', distribution: [5, 25, 80, 50, 5] },
                    ]
                ).map((col, i) => (
                  <div key={col.name} className="bg-surface border border-border-custom rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-4 text-left">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-sans text-xs font-bold text-text-custom truncate max-w-[120px]">{col.name}</span>
                        <span className="text-[9px] font-mono text-muted-custom bg-surface-2 px-1.5 py-0.5 rounded border border-border-custom">{col.type}</span>
                      </div>
                      <div className="flex items-center justify-between font-sans text-[10px]">
                        <span className="text-accent-custom font-medium">{col.semantic}</span>
                        <span className="text-muted-custom bg-[#7D9BBA]/10 text-[#7D9BBA] px-1 rounded text-[8px] font-bold">{col.pairing}</span>
                      </div>
                    </div>

                    <div className="h-20 flex flex-col justify-end bg-surface-2/40 border border-border-custom/40 rounded-xl p-2 relative overflow-hidden">
                      {col.chartType === 'line' ? (
                        <div className="w-full h-12 relative mt-auto">
                          <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                            <path
                              d={`M 0 40 Q 25 ${40 - col.distribution[0] / 2.5}, 50 ${40 - col.distribution[2] / 2.5} T 100 ${40 - col.distribution[4] / 2.5}`}
                              fill="none"
                              stroke="#2DD4BF"
                              strokeWidth="2"
                            />
                          </svg>
                        </div>
                      ) : col.chartType === 'donut' ? (
                        <div className="flex items-center justify-center space-x-2 h-12">
                          <div className="relative w-10 h-10">
                            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#2DD4BF" strokeWidth="6" strokeDasharray="45 55" />
                              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0D9488" strokeWidth="6" strokeDasharray="33 67" strokeDashoffset="-45" />
                            </svg>
                          </div>
                          <span className="text-[9px] font-sans text-muted-custom">Pairing profile active</span>
                        </div>
                      ) : (
                        <div className="flex items-end space-x-1.5 h-12 px-1 mt-auto">
                          {col.distribution.map((val, idx) => (
                            <div 
                              key={idx} 
                              className="flex-1 bg-accent-custom/80 hover:bg-accent-custom rounded-t-sm transition-all" 
                              style={{ height: `${val}%` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border-custom/40 text-[10px] font-sans">
                      <span className="text-success-custom bg-success-custom/10 px-1.5 py-0.5 rounded capitalize">
                        Role: {columnRoles[col.name] || 'categorical'}
                      </span>
                      <span className="text-muted-custom font-mono">Col #{allColumnsPage === 1 ? i + 1 : i + 5}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* VALUE REMAPPER POP-UP MODAL OVERLAY */}
      <AnimatePresence>
        {isRemapperOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border-custom rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Tag className="w-5 h-5 text-accent-custom" />
                  <h3 className="text-base font-semibold tracking-tight">Value Remapper Pop-up</h3>
                </div>
                <button onClick={() => setIsRemapperOpen(false)} className="text-muted-custom hover:text-text-custom cursor-pointer border-none bg-transparent">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-muted-custom">Directly remap messy categorical levels to clean string representations across the current dataset page frame.</p>

              <div className="space-y-3 pt-2">
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-sans uppercase text-muted-custom">Target Column</label>
                  <select 
                    value={remapColumn} 
                    onChange={(e) => setRemapColumn(e.target.value)}
                    className="w-full p-2 text-xs bg-surface-2 border border-border-custom rounded-xl text-text-custom font-sans focus:outline-none"
                  >
                    <option value="Customer Region">Customer Region</option>
                    <option value="Customer Segment">Customer Segment</option>
                    <option value="Product Category">Product Category</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-sans uppercase text-muted-custom">Original Value (From)</label>
                    <input 
                      type="text" 
                      value={remapFromValue} 
                      onChange={(e) => setRemapFromValue(e.target.value)}
                      placeholder="e.g. NA"
                      className="w-full p-2 text-xs bg-surface-2 border border-border-custom rounded-xl text-text-custom font-sans focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-sans uppercase text-muted-custom">Replacement Value (To)</label>
                    <input 
                      type="text" 
                      value={remapToValue} 
                      onChange={(e) => setRemapToValue(e.target.value)}
                      placeholder="e.g. North America"
                      className="w-full p-2 text-xs bg-surface-2 border border-border-custom rounded-xl text-text-custom font-sans focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-border-custom/50">
                <button
                  onClick={() => setIsRemapperOpen(false)}
                  className="px-3 py-1.5 border border-border-custom text-text-custom hover:bg-surface-2 rounded-xl text-xs font-sans cursor-pointer bg-transparent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemapValues}
                  className="px-4 py-1.5 bg-accent-custom hover:opacity-90 text-white rounded-xl text-xs font-semibold cursor-pointer border-none"
                >
                  Apply Remapping Override
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sticky Bottom Control Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface/85 backdrop-blur-md border-t border-border-custom py-3 z-40 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans">
          
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-success-custom animate-pulse"></span>
            <span className="text-muted-custom">Schema valid · 12 columns typed · overrides active</span>
          </div>

          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsRemapperOpen(true)}
              className="px-3 py-1.5 bg-surface border border-border-custom hover:bg-surface-2 rounded-xl text-text-custom font-medium cursor-pointer transition-all"
            >
              Value remapper
            </button>
            <button 
              onClick={() => setIsClassifierOpen(true)}
              className="px-3 py-1.5 bg-surface border border-border-custom hover:bg-surface-2 rounded-xl text-text-custom font-medium cursor-pointer transition-all"
            >
              Column classifier
            </button>
            <button 
              onClick={handleGenerateInsight}
              className="px-3.5 py-1.5 bg-accent-custom hover:opacity-90 text-white rounded-xl font-semibold cursor-pointer transition-all flex items-center space-x-1 border-none"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Generate Insight</span>
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
