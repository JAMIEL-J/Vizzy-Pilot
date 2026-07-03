import { useState, useMemo } from 'react';
import { 
  HeartPulse, Check, 
  Play, RefreshCw, AlertTriangle, Table, PieChart, GitCommit, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CleaningStudioPage({ isDark }: { isDark: boolean }) {
  // Application active states
  const [activeTab, setActiveTab] = useState<'diff' | 'metrics' | 'chain'>('diff');
  const [isCleaned, setIsCleaned] = useState(false);
  const [isCleaningInProgress, setIsCleaningInProgress] = useState(false);
  
  // Custom strategies chosen by user
  const [outlierStrategy, setOutlierStrategy] = useState('IQR Cap (95th)');
  const [missingStrategy, setMissingStrategy] = useState('Median Impute');
  const [duplicateStrategy, setDuplicateStrategy] = useState('Remove Duplicates');
  
  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (id: string) => {
    setOpenDropdown(openDropdown === id ? null : id);
  };

  // Dynamic health metrics
  const healthMetrics = useMemo(() => {
    if (isCleaned) {
      return { score: 98, completeness: 100, validity: 97.4, uniqueness: 100 };
    }
    return { score: 78, completeness: 91.2, validity: 88.5, uniqueness: 94.1 };
  }, [isCleaned]);

  // Handle execution of the cleaning plan
  const handleExecuteCleaning = () => {
    setIsCleaningInProgress(true);
    setTimeout(() => {
      setIsCleaningInProgress(false);
      setIsCleaned(true);
    }, 1800); // 1.8 seconds cleaning animation simulation
  };

  const handleResetCleaning = () => {
    setIsCleaned(false);
  };

  return (
    <div className="bg-bg text-text-custom font-sans flex flex-col relative pb-12 w-full min-h-[600px] text-left">
      
      {/* 1. Page Header with Action Block */}
      <div className="border-b border-border-custom bg-surface/50 backdrop-blur-md sticky top-0 z-25">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4">
          
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-surface-2 rounded-xl border border-border-custom flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-accent-custom" />
            </div>
            <div>
              <div className="flex items-center space-x-2 text-[10px] text-muted-custom font-sans">
                <span>Apps</span>
                <span>/</span>
                <span>Workspace</span>
                <span>/</span>
                <span className="text-accent-custom">Data Health Studio</span>
              </div>
              <h1 className="text-sm font-semibold tracking-tight">Data Health Studio</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            
            {/* Toggle Status indicator */}
            <div className="px-3 py-1 bg-surface-2 border border-border-custom rounded-xl flex items-center space-x-2 text-xs font-sans">
              <span className={`w-1.5 h-1.5 rounded-full ${isCleaned ? 'bg-success-custom animate-pulse' : 'bg-warning-custom'}`}></span>
              <span className="text-muted-custom">Status:</span>
              <span className="font-semibold text-text-custom">{isCleaned ? 'CLEANED (v2)' : 'DIRTY (v1)'}</span>
            </div>

            <span className="text-xs font-sans text-muted-custom hidden md:inline-block border-l border-border-custom pl-3 mr-1">
              In-Memory engine · 55ms
            </span>

            {/* Execution Trigger */}
            {isCleaned ? (
              <button
                onClick={handleResetCleaning}
                className="px-3 py-1.5 text-xs font-semibold bg-surface border border-border-custom hover:bg-surface-2 text-text-custom rounded-xl transition-all cursor-pointer"
              >
                Reset Original
              </button>
            ) : (
              <button
                onClick={handleExecuteCleaning}
                disabled={isCleaningInProgress}
                className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer border-none ${
                  isCleaningInProgress 
                    ? 'bg-surface-2 border border-border-custom text-muted-custom' 
                    : 'bg-accent-custom hover:opacity-90 text-white'
                }`}
              >
                {isCleaningInProgress ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Resolving cells...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Execute Cleaning Plan (3)</span>
                  </>
                )}
              </button>
            )}

          </div>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="p-4 space-y-6 flex-1">
        
        {/* 2. QUALITY METRICS PANEL (LETTER SCORECARD) */}
        <div className="bg-surface border border-border-custom rounded-2xl shadow-xs p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 font-sans text-[9px] text-muted-custom">
            Studio Engine: v2.1-Vectorized
          </div>
          
          <div className="flex flex-col space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider font-sans text-muted-custom">Quality Metrics Panel</h2>
              <p className="text-[11px] text-muted-custom mt-0.5 font-sans">Aggregate validation health metrics, null percentage ratios, and type conformance scores.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center text-left">
              
              {/* Scorecard Letter Grade Column */}
              <div className="bg-surface-2 border border-border-custom p-4 rounded-2xl flex items-center space-x-4">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-extrabold font-sans shadow-inner transition-colors duration-500 ${
                  isCleaned 
                    ? 'bg-success-custom/20 text-success-custom border border-success-custom/30' 
                    : 'bg-warning-custom/20 text-warning-custom border border-warning-custom/30'
                }`}>
                  {isCleaned ? 'A+' : 'C-'}
                </div>
                <div>
                  <div className="text-[9px] font-sans uppercase text-muted-custom">Grade Rating</div>
                  <div className="text-xs font-bold">{isCleaned ? 'Optimal Standard' : 'Attention Required'}</div>
                  <div className="text-[10px] text-muted-custom font-sans">Score: {healthMetrics.score}/100</div>
                </div>
              </div>

              {/* Metric 2: Completeness */}
              <div className="space-y-1 md:border-l md:border-border-custom/60 md:pl-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-sans text-muted-custom uppercase">Completeness (Nulls)</span>
                  {isCleaned && <span className="text-[10px] font-sans text-success-custom font-bold">(+8.8%)</span>}
                </div>
                <div className="text-xl font-bold tracking-tight">{healthMetrics.completeness}%</div>
                <div className="w-full h-1 bg-border-custom rounded-full overflow-hidden">
                  <div className={`h-full ${isCleaned ? 'bg-success-custom' : 'bg-warning-custom'}`} style={{ width: `${healthMetrics.completeness}%` }}></div>
                </div>
                <p className="text-[9px] text-muted-custom font-sans">Null percentage: {isCleaned ? '0.0%' : '8.8%'}</p>
              </div>

              {/* Metric 3: Uniqueness */}
              <div className="space-y-1 md:border-l md:border-border-custom/60 md:pl-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-sans text-muted-custom uppercase">Uniqueness Score</span>
                  {isCleaned && <span className="text-[10px] font-sans text-success-custom font-bold">(+5.9%)</span>}
                </div>
                <div className="text-xl font-bold tracking-tight">{healthMetrics.uniqueness}%</div>
                <div className="w-full h-1 bg-border-custom rounded-full overflow-hidden">
                  <div className={`h-full ${isCleaned ? 'bg-success-custom' : 'bg-warning-custom'}`} style={{ width: `${healthMetrics.uniqueness}%` }}></div>
                </div>
                <p className="text-[9px] text-muted-custom font-sans">Redundancy rate: {isCleaned ? '0.0%' : '5.9%'}</p>
              </div>

              {/* Metric 4: Type Check Pass Rates */}
              <div className="space-y-1 md:border-l md:border-border-custom/60 md:pl-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-sans text-muted-custom uppercase">Type Pass Rate</span>
                  {isCleaned && <span className="text-[10px] font-sans text-success-custom font-bold">(+8.9%)</span>}
                </div>
                <div className="text-xl font-bold tracking-tight">{healthMetrics.validity}%</div>
                <div className="w-full h-1 bg-border-custom rounded-full overflow-hidden">
                  <div className={`h-full ${isCleaned ? 'bg-success-custom' : 'bg-warning-custom'}`} style={{ width: `${healthMetrics.validity}%` }}></div>
                </div>
                <p className="text-[9px] text-muted-custom font-sans">Format compliance: {isCleaned ? '100%' : '88.5%'}</p>
              </div>

            </div>
          </div>
        </div>

        {/* 3. Sidebar Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LEFT: Recommendations Hub */}
          <div className="lg:col-span-1 space-y-6">
            
            <div className="bg-surface border border-border-custom rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border-custom pb-3">
                <h3 className="text-xs font-semibold tracking-tight font-sans">Anomalies Checklist</h3>
                <span className="px-2 py-0.5 bg-surface-2 border border-border-custom rounded-md text-[10px] font-sans text-muted-custom">
                  {isCleaned ? '0 Issues' : '3 Issues Pending'}
                </span>
              </div>

              <div className="space-y-3">
                
                {/* Outliers */}
                <div className={`p-4 rounded-xl border transition-all text-left ${
                  isCleaned ? 'bg-surface-2/30 border-border-custom/50 opacity-60' : 'bg-surface border-border-custom shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-sans text-xs font-semibold text-text-custom">Sales Outliers</span>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-sans font-bold uppercase ${
                      isCleaned ? 'bg-border-custom text-muted-custom' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                    }`}>
                      {isCleaned ? 'Resolved' : 'HIGH Severity'}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold mb-1">Crossover Pricing Outliers</h4>
                  <p className="text-[11px] text-muted-custom leading-relaxed mb-3">
                    Found 3 extreme transactions ({'>'} $15k) skewing regional aggregated margins.
                  </p>
                  
                  <div className="relative">
                    <button 
                      onClick={() => !isCleaned && toggleDropdown('outlier')}
                      disabled={isCleaned}
                      className="w-full px-2.5 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom rounded-lg flex items-center justify-between cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    >
                      <span className="truncate">Treatment: {outlierStrategy}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-custom shrink-0 animate-pulse" />
                    </button>
                    {openDropdown === 'outlier' && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-surface border border-border-custom rounded-lg shadow-lg z-50 py-1 font-sans text-xs">
                        {['IQR Cap (95th)', 'Cap at Mean + 3SD', 'Delete Outlier Rows', 'Keep Original'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setOutlierStrategy(opt);
                              setOpenDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                          >
                            <span>{opt}</span>
                            {outlierStrategy === opt && <Check className="w-3.5 h-3.5 text-accent-custom" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Missing Values */}
                <div className={`p-4 rounded-xl border transition-all text-left ${
                  isCleaned ? 'bg-surface-2/30 border-border-custom/50 opacity-60' : 'bg-surface border-border-custom shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-sans text-xs font-semibold text-text-custom">Profit Nulls</span>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-sans font-bold uppercase ${
                      isCleaned ? 'bg-border-custom text-muted-custom' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    }`}>
                      {isCleaned ? 'Resolved' : 'MEDIUM Severity'}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold mb-1">Blank Profit Records</h4>
                  <p className="text-[11px] text-muted-custom leading-relaxed mb-3">
                    28 instances with NULL currency values. Imputation is required to complete aggregations.
                  </p>

                  <div className="relative">
                    <button 
                      onClick={() => !isCleaned && toggleDropdown('missing')}
                      disabled={isCleaned}
                      className="w-full px-2.5 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom rounded-lg flex items-center justify-between cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    >
                      <span className="truncate">Treatment: {missingStrategy}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-custom shrink-0 animate-pulse" />
                    </button>
                    {openDropdown === 'missing' && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-surface border border-border-custom rounded-lg shadow-lg z-50 py-1 font-sans text-xs">
                        {['Median Impute', 'Mean Impute', 'Fill Zero (0.00)', 'Drop Empty Rows'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setMissingStrategy(opt);
                              setOpenDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                          >
                            <span>{opt}</span>
                            {missingStrategy === opt && <Check className="w-3.5 h-3.5 text-accent-custom" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Duplicates */}
                <div className={`p-4 rounded-xl border transition-all text-left ${
                  isCleaned ? 'bg-surface-2/30 border-border-custom/50 opacity-60' : 'bg-surface border-border-custom shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-sans text-xs font-semibold text-text-custom">Row Duplicates</span>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-sans font-bold uppercase ${
                      isCleaned ? 'bg-border-custom text-muted-custom' : 'bg-gray-500/10 text-muted-custom border border-border-custom'
                    }`}>
                      {isCleaned ? 'Resolved' : 'LOW Severity'}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold mb-1">Duplicate Unique Key rows</h4>
                  <p className="text-[11px] text-muted-custom leading-relaxed mb-3">
                    Detected 412 redundant transactional rows repeating exactly.
                  </p>

                  <div className="relative">
                    <button 
                      onClick={() => !isCleaned && toggleDropdown('duplicate')}
                      disabled={isCleaned}
                      className="w-full px-2.5 py-1.5 text-xs font-sans bg-surface-2 border border-border-custom rounded-lg flex items-center justify-between cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    >
                      <span className="truncate">Treatment: {duplicateStrategy}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-custom shrink-0 animate-pulse" />
                    </button>
                    {openDropdown === 'duplicate' && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-surface border border-border-custom rounded-lg shadow-lg z-50 py-1 font-sans text-xs">
                        {['Remove Duplicates', 'Merge Records (Sum)', 'Flag but Retain'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setDuplicateStrategy(opt);
                              setOpenDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-surface-2 flex items-center justify-between cursor-pointer border-none bg-transparent"
                          >
                            <span>{opt}</span>
                            {duplicateStrategy === opt && <Check className="w-3.5 h-3.5 text-accent-custom" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* RIGHT: Three-Tab Workspace */}
          <div className="lg:col-span-2 bg-surface border border-border-custom rounded-2xl overflow-hidden shadow-xs space-y-6">
            
            <div className="bg-surface-2 border-b border-border-custom px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab('diff')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-sans transition-all cursor-pointer flex items-center space-x-1.5 border-none ${
                    activeTab === 'diff' 
                      ? 'bg-surface text-text-custom shadow-xs border border-border-custom font-semibold' 
                      : 'text-muted-custom hover:text-text-custom bg-transparent'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Side-by-Side Live Grid</span>
                </button>
                <button
                  onClick={() => setActiveTab('metrics')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-sans transition-all cursor-pointer flex items-center space-x-1.5 border-none ${
                    activeTab === 'metrics' 
                      ? 'bg-surface text-text-custom shadow-xs border border-border-custom font-semibold' 
                      : 'text-muted-custom hover:text-text-custom bg-transparent'
                  }`}
                >
                  <PieChart className="w-3.5 h-3.5" />
                  <span>Impact Metrics</span>
                </button>
                <button
                  onClick={() => setActiveTab('chain')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-sans transition-all cursor-pointer flex items-center space-x-1.5 border-none ${
                    activeTab === 'chain' 
                      ? 'bg-surface text-text-custom shadow-xs border border-border-custom font-semibold' 
                      : 'text-muted-custom hover:text-text-custom bg-transparent'
                  }`}
                >
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Execution Chain</span>
                </button>
              </div>

              <span className="text-[11px] font-sans text-muted-custom">
                CSV Live Grid Diff
              </span>
            </div>

            {/* TAB CONTENT 1: Side-by-Side Live Grid */}
            {activeTab === 'diff' && (
              <div className="p-4 overflow-x-auto">
                <p className="text-[11px] font-sans text-muted-custom mb-3">
                  {isCleaned 
                    ? "✓ Plan Executed. Side-by-Side Live Grid mapping showing replaced outlier ranges and imputed values."
                    : "⚡ Previewing proposed modifications in Side-by-Side Live Grid. Red is original; green is proposed replacement."
                  }
                </p>
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-custom text-muted-custom uppercase text-[9px]">
                      <th className="p-2">Row ID</th>
                      <th className="p-2">Region</th>
                      <th className="p-2">Original Sales</th>
                      <th className="p-2">Replaced (Diff)</th>
                      <th className="p-2">Profit column</th>
                      <th className="p-2">Replaced (Diff)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-custom/50">
                    
                    {/* Row 1: Outlier capping */}
                    <tr className="hover:bg-surface-2/40">
                      <td className="p-2.5 text-muted-custom">#14402</td>
                      <td className="p-2.5">North America</td>
                      <td className="p-2.5 bg-red-500/10 text-red-600 line-through font-semibold">$24,900.00</td>
                      <td className="p-2.5 bg-success-custom/10 text-success-custom font-semibold">
                        {outlierStrategy === 'IQR Cap (95th)' ? '$4,520.00' : 
                         outlierStrategy === 'Keep Original' ? '$24,900.00' : '$2,450.00'}
                      </td>
                      <td className="p-2.5 text-muted-custom">$890.00</td>
                      <td className="p-2.5 text-muted-custom">--</td>
                    </tr>

                    {/* Row 2: Missing Value imputation */}
                    <tr className="hover:bg-surface-2/40">
                      <td className="p-2.5 text-muted-custom">#14403</td>
                      <td className="p-2.5">Europe</td>
                      <td className="p-2.5 text-muted-custom">$1,200.00</td>
                      <td className="p-2.5 text-muted-custom">--</td>
                      <td className="p-2.5 bg-red-500/10 text-red-600 font-semibold italic">NULL</td>
                      <td className="p-2.5 bg-success-custom/10 text-success-custom font-semibold">
                        {missingStrategy === 'Median Impute' ? '$249.00' :
                         missingStrategy === 'Mean Impute' ? '$284.10' : '$0.00'}
                      </td>
                    </tr>

                    {/* Row 3: Standard cells */}
                    <tr className="hover:bg-surface-2/40">
                      <td className="p-2.5 text-muted-custom">#14404</td>
                      <td className="p-2.5">Asia Pacific</td>
                      <td className="p-2.5 text-muted-custom">$3,120.00</td>
                      <td className="p-2.5 text-muted-custom">--</td>
                      <td className="p-2.5 text-muted-custom">$620.00</td>
                      <td className="p-2.5 text-muted-custom">--</td>
                    </tr>

                    {/* Row 4: Duplicate row mapping */}
                    <tr className={`hover:bg-surface-2/40 ${isCleaned ? 'opacity-30' : ''}`}>
                      <td className="p-2.5 text-muted-custom">#14405</td>
                      <td className="p-2.5">Latin America</td>
                      <td className="p-2.5 bg-red-500/10 text-red-600 line-through">$890.00</td>
                      <td className="p-2.5 text-muted-custom">
                        {isCleaned ? '[DELETED DUPLICATE]' : '--'}
                      </td>
                      <td className="p-2.5 bg-red-500/10 text-red-600 line-through">$180.00</td>
                      <td className="p-2.5 text-muted-custom">
                        {isCleaned ? '[DELETED]' : '--'}
                      </td>
                    </tr>

                    {/* Row 5: Outlier mapping */}
                    <tr className="hover:bg-surface-2/40">
                      <td className="p-2.5 text-muted-custom">#14406</td>
                      <td className="p-2.5">North America</td>
                      <td className="p-2.5 bg-red-500/10 text-red-600 line-through font-semibold">$18,450.00</td>
                      <td className="p-2.5 bg-success-custom/10 text-success-custom font-semibold">
                        {outlierStrategy === 'IQR Cap (95th)' ? '$4,520.00' : '$18,450.00'}
                      </td>
                      <td className="p-2.5 text-muted-custom">$3,200.00</td>
                      <td className="p-2.5 text-muted-custom">--</td>
                    </tr>

                  </tbody>
                </table>
              </div>
            )}

            {/* TAB CONTENT 2: Impact Metrics */}
            {activeTab === 'metrics' && (
              <div className="p-6 flex flex-col md:flex-row items-center justify-around gap-6 text-left">
                
                <div className="relative w-44 h-44 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#FB923C" strokeWidth="3.5" strokeDasharray="14.8 85.2" strokeDashoffset="0" />
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10B981" strokeWidth="2.5" strokeDasharray="85.2 14.8" strokeDashoffset="-14.8" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold">14.8%</span>
                    <span className="text-[10px] font-sans text-muted-custom uppercase">Modified</span>
                  </div>
                </div>

                <div className="space-y-4 font-sans text-xs">
                  <h4 className="font-semibold text-text-custom">Impact Breakdown Summary</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 bg-success-custom rounded-full"></span>
                      <span className="text-muted-custom">Original Row Matches:</span>
                      <span className="text-text-custom font-semibold font-mono">85.2% (7,184 rows)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 bg-[#F97316] rounded-full"></span>
                      <span className="text-muted-custom">Duplicates Removed:</span>
                      <span className="text-text-custom font-semibold font-mono">4.8% (412 rows)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 bg-accent-custom rounded-full"></span>
                      <span className="text-muted-custom">Imputed Null Values:</span>
                      <span className="text-text-custom font-semibold font-mono">0.3% (28 rows)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 bg-[#EF4444] rounded-full"></span>
                      <span className="text-muted-custom">Outliers Capped:</span>
                      <span className="text-text-custom font-semibold font-mono">0.03% (3 rows)</span>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB CONTENT 3: Execution Chain */}
            {activeTab === 'chain' && (
              <div className="p-6 font-sans text-xs space-y-6 text-left">
                
                <h4 className="font-semibold text-text-custom">Lineage Trace Logs</h4>
                
                <div className="relative border-l border-border-custom pl-6 ml-3 space-y-6">
                  
                  {/* Step 1 */}
                  <div className="relative">
                    <span className="absolute -left-9 top-0.5 w-6 h-6 bg-surface-2 border border-border-custom rounded-full flex items-center justify-center text-[10px] font-mono">1</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-text-custom">Ingest & Profile</span>
                        <span className="text-[10px] text-muted-custom font-mono">08:14:22 UTC</span>
                      </div>
                      <p className="text-muted-custom text-[11px] mt-1 leading-relaxed">Parsed file structure successfully. Semantic classifier identified 12 column patterns with 98.7% average mapping confidence.</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="relative">
                    <span className="absolute -left-9 top-0.5 w-6 h-6 bg-surface-2 border border-border-custom rounded-full flex items-center justify-center text-[10px] font-mono">2</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-text-custom">Deduplication</span>
                        <span className="text-[10px] text-muted-custom font-mono">08:14:23 UTC</span>
                      </div>
                      <p className="text-muted-custom text-[11px] mt-1 leading-relaxed">Evaluated 8,432 rows. Mapped redundant key identifiers and removed 412 duplications based on exact row hash equivalence.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="relative">
                    <span className="absolute -left-9 top-0.5 w-6 h-6 bg-surface-2 border border-border-custom rounded-full flex items-center justify-center text-[10px] font-mono">3</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-text-custom">IQR Outlier Capping</span>
                        <span className="text-[10px] text-muted-custom font-mono">08:14:23 UTC</span>
                      </div>
                      <p className="text-muted-custom text-[11px] mt-1 leading-relaxed">Outlier capping logic evaluated. Interquartile Range capping threshold capped values exceeding 95th percentile bounds on Sales column.</p>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* AUDIT TIMELINE LOG */}
            <div className="border-t border-border-custom p-5 bg-surface-2/30 text-left">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider font-sans text-text-custom">Audit Timeline Log</h4>
                  <p className="text-[11px] text-muted-custom mt-0.5 font-sans">Real-time compilation logs, total execution duration, and row-count delta shifts.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-3 py-1 bg-surface border border-border-custom rounded-lg text-center">
                    <div className="text-[9px] font-sans text-muted-custom">RUN DURATION</div>
                    <div className="text-xs font-bold font-mono text-accent-custom">{isCleaned ? '1.82s' : 'Pending'}</div>
                  </div>
                  <div className="px-3 py-1 bg-surface border border-border-custom rounded-lg text-center">
                    <div className="text-[9px] font-sans text-muted-custom">INITIAL ROWS</div>
                    <div className="text-xs font-bold font-mono">8,432</div>
                  </div>
                  <div className="px-3 py-1 bg-surface border border-border-custom rounded-lg text-center">
                    <div className="text-[9px] font-sans text-muted-custom">PROCESSED ROWS</div>
                    <div className="text-xs font-bold font-mono">{isCleaned ? '8,020' : '8,432'}</div>
                  </div>
                  <div className="px-3 py-1 bg-surface border border-border-custom rounded-lg text-center">
                    <div className="text-[9px] font-sans text-muted-custom">TOTAL SHIFT</div>
                    <div className={`text-xs font-bold font-mono ${isCleaned ? 'text-red-500 font-semibold' : 'text-muted-custom'}`}>
                      {isCleaned ? '-412 (-4.89%)' : '0.0%'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 bg-surface border border-border-custom/60 rounded-xl p-3 font-mono text-[11px] text-muted-custom space-y-1">
                <div className="flex justify-between">
                  <span>[08:14:21] SYSTEM: Bootstrap pipeline...</span>
                  <span className="text-success-custom font-semibold">SUCCESS</span>
                </div>
                <div className="flex justify-between">
                  <span>[08:14:22] METRIC: Calculating column entropy pass rate...</span>
                  <span className="text-success-custom font-semibold">Score: 78.5%</span>
                </div>
                {isCleaned && (
                  <div className="flex justify-between text-success-custom font-semibold">
                    <span>[08:14:23] AUDIT: Cleaning execution compiled successfully.</span>
                    <span>DONE</span>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
