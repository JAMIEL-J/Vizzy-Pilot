import { useState, useRef, useEffect, type MouseEvent } from 'react';
import { 
  Sparkles, Database, Zap, GitBranch, MessageSquare, Lock, 
  HeartPulse, RefreshCw, ChevronRight, Moon, Sun, Table, FileText, ArrowRight, PieChart,
  LogOut, User as UserIcon, Sliders, Activity, Filter, Layers, Edit3, ClipboardCheck, AlertTriangle, Settings, Grid, Clock, TrendingUp, Terminal, Github
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import DashboardPage from '../../components/playground/DashboardPage';
import CleaningStudioPage from '../../components/playground/CleaningStudioPage';
import ChatPage from '../../components/playground/ChatPage';
import AuthScreen from '../../components/AuthScreen';
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { VizzyPilotLogoIcon } from '../../components/layout/VizzyLogo';
import DocsModal from '../../components/DocsModal';
import { cn } from "@/lib/utils";

const bentoContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    }
  }
};

const bentoItemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number]
    }
  }
};

export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'dashboard' | 'cleaning' | 'chat'>('dashboard');
  const [setSelectedFeatureTab, setSelectedFeatureTabState] = useState<'dashboard' | 'cleaning' | 'chat'>('dashboard');
  const [userSession, setUserSession] = useState<{ email: string; name: string } | null>(null);
  const [activeAuthScreen, setActiveAuthScreen] = useState<'signin' | 'signup' | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeDocsTab, setActiveDocsTab] = useState<'docs' | 'api' | 'changelog' | null>(null);
  
  // Mouse tilt state for Hero visual card
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 });
  const heroCardRef = useRef<HTMLDivElement>(null);

  const handleHeroMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!heroCardRef.current) return;
    const rect = heroCardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;
    
    // Calculate rotation bounds (max ±6 degrees)
    const rotX = -(mouseY / (height / 2)) * 6;
    const rotY = (mouseX / (width / 2)) * 6;
    
    setHeroTilt({ x: rotX, y: rotY });
  };

  const handleHeroMouseLeave = () => {
    setHeroTilt({ x: 0, y: 0 });
  };

  // Cursor tracking for Grid background component with spotlight highlight
  const [gridCoords, setGridCoords] = useState({ x: 0, y: 0 });
  const [isGridHovered, setIsGridHovered] = useState(false);
  const heroSectionRef = useRef<HTMLElement>(null);

  const handleGridMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!heroSectionRef.current) return;
    const rect = heroSectionRef.current.getBoundingClientRect();
    setGridCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  // State to simulate scroll border in navbar
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Parallax calculations for the interactive grid background using Framer Motion
  const parallaxX = isGridHovered && heroSectionRef.current
    ? (gridCoords.x - heroSectionRef.current.getBoundingClientRect().width / 2) * -0.04
    : 0;

  const parallaxY = isGridHovered && heroSectionRef.current
    ? (gridCoords.y - heroSectionRef.current.getBoundingClientRect().height / 2) * -0.04
    : 0;

  if (activeAuthScreen) {
    return (
      <AuthScreen
        initialMode={activeAuthScreen}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onClose={() => setActiveAuthScreen(null)}
        onSwitchMode={(newMode) => setActiveAuthScreen(newMode)}
        onSuccess={(email, name) => {
          setUserSession({ email, name: name || email.split('@')[0] });
          setActiveAuthScreen(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text-custom font-sans transition-colors duration-300 relative text-left landing-page-root">
      
      {/* 1. FLOATING NAVIGATION BAR */}
      <div className="fixed top-5 left-0 right-0 z-50 px-4 flex justify-center pointer-events-none">
        <nav className={`pointer-events-auto transition-all duration-500 ease-out flex items-center justify-between w-full max-w-5xl rounded-full px-5 py-2.5 border border-border-custom bg-surface/90 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.08)] ${scrolled ? 'shadow-[0_16px_48px_rgba(0,0,0,0.15)] scale-[0.99]' : ''}`}>
          
          {/* Left Side Wordmark */}
          <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <VizzyPilotLogoIcon size={24} className="shrink-0 text-text-custom" />
            <span className="text-sm font-semibold tracking-tight select-none">Vizzy Pilot</span>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center space-x-8 text-[11px] font-sans font-medium tracking-wide text-muted-custom">
            <a href="#how-it-works" className="hover:text-text-custom transition-colors">How It Works</a>
            <a href="#features" className="hover:text-text-custom transition-colors">Systems Grid</a>
            <a href="#applications" className="hover:text-text-custom transition-colors">Workspaces</a>
            <a href="#benchmarks" className="hover:text-text-custom transition-colors">Benchmarks</a>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-3">
            
             {/* Dark/Light mode toggle */}
            <button 
              onClick={toggleTheme}
              className="p-1.5 hover:bg-border-custom/20 border border-border-custom/30 rounded-full text-muted-custom hover:text-text-custom transition-all cursor-pointer bg-transparent"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>



            {/* CTA action buttons */}
            {userSession ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-surface-2/40 hover:bg-border-custom/20 border border-border-custom/30 rounded-full transition-all cursor-pointer text-xs bg-transparent"
                >
                  <div className="w-4.5 h-4.5 rounded-full bg-accent-custom flex items-center justify-center text-[9px] font-bold text-white uppercase select-none">
                    {userSession.name.charAt(0)}
                  </div>
                  <span className="font-medium text-text-custom hidden sm:inline-block max-w-[80px] truncate">
                    {userSession.name}
                  </span>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-52 bg-surface border border-border-custom rounded-2xl shadow-xl z-50 py-1 overflow-hidden font-mono text-xs text-left animate-fade-in">
                    <div className="px-4 py-3 border-b border-border-custom/60 flex flex-col space-y-0.5">
                      <span className="font-semibold text-text-custom truncate">{userSession.name}</span>
                      <span className="text-[10px] text-muted-custom truncate">{userSession.email}</span>
                    </div>
                    <button
                      onClick={() => {
                        const el = document.getElementById('applications');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-surface-2 transition-colors flex items-center space-x-2 border-none bg-transparent cursor-pointer"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-muted-custom" />
                      <span>Active Workspaces</span>
                    </button>
                    <button
                      onClick={() => {
                        setUserSession(null);
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-surface-2 transition-colors flex items-center space-x-2 text-red-500 hover:text-red-600 border-t border-border-custom/40 border-none bg-transparent cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button 
                  onClick={() => setActiveAuthScreen('signin')}
                  className="text-xs font-sans text-muted-custom hover:text-text-custom cursor-pointer px-2 bg-transparent border-none"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => setActiveAuthScreen('signup')}
                  className="px-3.5 py-1.5 bg-accent-custom hover:opacity-90 text-white rounded-full text-xs font-sans font-medium transition-all cursor-pointer shadow-xs border-none"
                >
                  Get Started →
                </button>
              </>
            )}
          </div>

        </nav>
      </div>

      {/* 2. HERO SECTION — Typographic Centerpiece with Interactive Grid Background */}
      <section 
        ref={heroSectionRef}
        onMouseMove={handleGridMouseMove}
        onMouseEnter={() => setIsGridHovered(true)}
        onMouseLeave={() => setIsGridHovered(false)}
        className="min-h-screen pt-32 pb-16 flex flex-col items-center justify-center w-full relative overflow-hidden cursor-default isolate text-center"
      >
        
        {/* Animated Grid Pattern Background aligned for light/dark modes */}
        <AnimatedGridPattern
          numSquares={40}
          maxOpacity={isDark ? 0.15 : 0.08}
          duration={4}
          repeatDelay={0.5}
          className={cn(
            "[mask-image:radial-gradient(ellipse_at_50%_50%,white_60%,transparent_100%)]",
            "absolute inset-0 -z-10 h-full w-full",
            isDark 
              ? "fill-teal-500/10 stroke-teal-500/15 text-teal-400/25" 
              : "fill-teal-600/5 stroke-teal-600/8 text-teal-500/10"
          )}
        />

        {/* Ambient interactive spotlight color accent */}
        <div 
          className="absolute inset-0 -z-10 pointer-events-none transition-opacity duration-300 ease-out"
          style={{
            background: isGridHovered 
              ? `radial-gradient(350px circle at ${gridCoords.x}px ${gridCoords.y}px, ${isDark ? 'rgba(45, 212, 191, 0.12)' : 'rgba(13, 148, 136, 0.08)'}, transparent 80%)`
              : 'none',
            opacity: isGridHovered ? 1 : 0
          }}
        />
        
        <div className="w-full max-w-6xl mx-auto px-4 flex flex-col items-center justify-center relative">
          
          {/* Typographic Core */}
          <div className="text-center space-y-6 max-w-3xl mb-12">
            
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-display font-normal tracking-tight text-text-custom leading-[1.05] max-w-3xl">
                Ask your data anything.<br />
                Get a verified chart.
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-base sm:text-lg text-muted-custom max-w-xl mx-auto leading-relaxed font-sans"
            >
              Vizzy Pilot translates natural language to validated SQL, executes it on a dual-engine pipeline, and version-logs every transformation — so every chart is explainable.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2"
            >
              <button 
                onClick={() => {
                  const el = document.getElementById('applications');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="px-6 py-2.5 bg-accent-custom hover:opacity-95 text-white rounded-full text-sm font-semibold transition-all cursor-pointer shadow-md border-none"
              >
                Initialize Free Instance →
              </button>
              <a 
                href="#benchmarks"
                className="px-4 py-2 text-xs font-mono text-muted-custom hover:text-text-custom transition-all"
              >
                View Benchmarks
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-[11px] font-mono text-muted-custom pt-4"
            >
              Under 55ms <span className="opacity-40">·</span> 1M rows <span className="opacity-40">·</span> Immutable audit trail
            </motion.div>

          </div>

          {/* 3. HERO VISUAL — Floating 3D Cursor Tilt Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-4xl"
          >
            <div 
              ref={heroCardRef}
              onMouseMove={handleHeroMouseMove}
              onMouseLeave={handleHeroMouseLeave}
              className="bg-surface border border-border-custom rounded-2xl p-6 md:p-8 shadow-2xl relative transition-all duration-200 cursor-default select-none"
              style={{
                transform: `perspective(1200px) rotateX(${heroTilt.x}deg) rotateY(${heroTilt.y}deg)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="space-y-6" style={{ transform: 'translateZ(30px)' }}>
                
                {/* Card top banner row with KPI chips */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-border-custom pb-5 text-left font-mono">
                  {[
                    { label: 'Total Revenue', value: '$2.1M', change: '+12%', color: 'text-success-custom' },
                    { label: 'Orders', value: '8,432', change: 'Cleaned', color: 'text-muted-custom' },
                    { label: 'Avg Order', value: '$249', change: '+2.4%', color: 'text-success-custom' },
                    { label: 'Churn Rate', value: '3.2%', change: '-0.6%', color: 'text-success-custom' },
                    { label: 'Annual Growth', value: '+12.4%', change: 'Target 15%', color: 'text-accent-custom' },
                  ].map((chip, idx) => (
                    <div key={idx} className="bg-surface/50 border border-border-custom rounded-xl p-3">
                      <span className="text-[9px] text-muted-custom uppercase block">{chip.label}</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-sm font-bold text-text-custom">{chip.value}</span>
                        <span className={`text-[8px] font-semibold ${chip.color}`}>{chip.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Card middle */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  
                  <div className="md:col-span-3 bg-surface/30 border border-border-custom rounded-xl p-4 text-left">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-mono text-muted-custom uppercase">Revenue by Region</span>
                      <span className="text-[9px] font-mono text-accent-custom">Teal Mint Accent</span>
                    </div>
                    <div className="space-y-3">
                      {[
                        { name: 'North America', val: '$920K', pct: 'w-[92%]' },
                        { name: 'Europe', val: '$640K', pct: 'w-[64%]' },
                        { name: 'Asia Pacific', val: '$380K', pct: 'w-[38%]' },
                        { name: 'Latin America', val: '$170K', pct: 'w-[17%]' },
                      ].map((bar, bidx) => (
                        <div key={bidx} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-text-custom">{bar.name}</span>
                            <span className="font-semibold text-text-custom">{bar.val}</span>
                          </div>
                          <div className="w-full h-3 bg-surface border border-border-custom/50 rounded-sm overflow-hidden">
                            <div className={`h-full bg-accent-custom rounded-r-xs ${bar.pct}`}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    
                    {/* segment mix */}
                    <div className="bg-surface/30 border border-border-custom rounded-xl p-4 text-left">
                      <span className="text-[10px] font-mono text-muted-custom uppercase block mb-2">Segment Mix</span>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 relative shrink-0">
                          <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#2DD4BF" strokeWidth="4.5" strokeDasharray="45 55" />
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0D9488" strokeWidth="4.5" strokeDasharray="33 67" strokeDashoffset="-45" />
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#94A3B8" strokeWidth="4.5" strokeDasharray="22 78" strokeDashoffset="-78" />
                          </svg>
                        </div>
                        <div className="text-[10px] font-mono space-y-0.5">
                          <div className="flex items-center space-x-1.5"><span className="w-1.5 h-1.5 bg-[#2DD4BF] rounded-full"></span><span>Enterprise: 45%</span></div>
                          <div className="flex items-center space-x-1.5"><span className="w-1.5 h-1.5 bg-[#0D9488] rounded-full"></span><span>Mid-Market: 33%</span></div>
                          <div className="flex items-center space-x-1.5"><span className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full"></span><span>SMB: 22%</span></div>
                        </div>
                      </div>
                    </div>

                    {/* cache indicators */}
                    <div className="bg-surface/30 border border-border-custom rounded-xl p-3 flex items-center justify-between text-left">
                      <span className="text-[10px] font-mono text-muted-custom uppercase">Cache Crossover speed</span>
                      <span className="px-2 py-0.5 bg-success-custom/10 text-success-custom font-mono text-[9px] rounded-md border border-success-custom/20 font-bold">&lt; 1ms warm hit</span>
                    </div>

                  </div>

                </div>

              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* 3. TRUST STRIP */}
      <section className="bg-surface-2 border-y border-border-custom py-8 px-4 overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="text-xs font-mono text-muted-custom font-medium uppercase tracking-wider">
            Benchmarked on Python 3.14 · Intel i-series · 7.75GB RAM
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { num: '2.77ms', label: 'Simple filter · 1M rows' },
              { num: '55ms', label: 'Complex aggregation · 1M' },
              { num: '<1ms', label: 'Cache warm hit (vs 27ms)' },
              { num: '55ms', label: 'First chart (SSE)' },
              { num: '610K', label: 'rows/sec Ingestion' },
            ].map((stat, sidx) => (
              <div key={sidx} className="bg-surface border border-border-custom/80 px-3 py-1.5 rounded-full flex items-center space-x-1.5 text-xs font-mono shadow-xs">
                <span className="text-accent-custom font-bold">{stat.num}</span>
                <span className="text-muted-custom text-[11px]">— {stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-4 max-w-5xl mx-auto space-y-16">
        
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-3"
        >
          <h2 className="text-[45px] italic font-display font-medium tracking-tight text-text-custom leading-tight">
            From question to verified chart — in under 100ms.
          </h2>
          <p className="text-sm text-muted-custom max-w-md mx-auto leading-relaxed">
            Every step is optimized, validated, cached, and versioned for absolute security and speed.
          </p>
        </motion.div>

        <div className="relative border-l border-dashed border-border-custom pl-8 sm:pl-12 ml-4 sm:ml-8 space-y-12">
          
          {/* Phase 1 */}
          <motion.div 
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="relative"
          >
            <div className="absolute -left-14 sm:-left-18 top-0.5 w-10 h-10 rounded-xl bg-surface border border-border-custom flex items-center justify-center text-text-custom shadow-xs">
              <Database className="w-5 h-5 text-accent-custom" />
            </div>
            <div className="space-y-2 max-w-2xl text-left">
              <div className="font-mono text-xs text-accent-custom uppercase font-semibold">Phase 01 · semantically typed</div>
              <h3 className="text-lg font-semibold tracking-tight text-text-custom">Ingest & Profile</h3>
              <p className="text-sm text-muted-custom leading-relaxed">
                Upload a CSV or connect a database. Vizzy Pilot profiles a 50-row sample to detect column semantics — numeric, categorical, date, identifier — using a pre-mapper backed by an LLM corrective loop.
              </p>
            </div>
          </motion.div>

          {/* Phase 2 */}
          <motion.div 
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="relative"
          >
            <div className="absolute -left-14 sm:-left-18 top-0.5 w-10 h-10 rounded-xl bg-surface border border-border-custom flex items-center justify-center text-text-custom shadow-xs">
              <Zap className="w-5 h-5 text-[#7D9BBA]" />
            </div>
            <div className="space-y-2 max-w-2xl text-left">
              <div className="font-mono text-xs text-[#7D9BBA] uppercase font-semibold">Phase 02 · Smart Security Validation</div>
              <h3 className="text-lg font-semibold tracking-tight text-text-custom">Route & Execute</h3>
              <p className="text-sm text-muted-custom leading-relaxed">
                Our smart engine evaluates the worksheet size instantly. Smaller files load straight from cache for split-second updates, while massive databases are calculated by high-speed processing streams.
              </p>
            </div>
          </motion.div>

          {/* Phase 3 */}
          <motion.div 
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
            className="relative"
          >
            <div className="absolute -left-14 sm:-left-18 top-0.5 w-10 h-10 rounded-xl bg-surface border border-border-custom flex items-center justify-center text-text-custom shadow-xs">
              <GitBranch className="w-5 h-5 text-success-custom" />
            </div>
            <div className="space-y-2 max-w-2xl text-left">
              <div className="font-mono text-xs text-success-custom uppercase font-semibold">Phase 03 · Secure Version History</div>
              <h3 className="text-lg font-semibold tracking-tight text-text-custom">Stream & Version</h3>
              <p className="text-sm text-muted-custom leading-relaxed">
                Results stream into view sequentially to keep your browser fast. Every single change creates a secure data snapshot linked to the previous state, forming an automatic history path.
              </p>
            </div>
          </motion.div>

        </div>

      </section>

      {/* 5. FEATURES SHOWCASE */}
      <section id="features" className="py-24 px-4 bg-surface-2/40 border-y border-border-custom relative overflow-hidden">
        
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent-custom/5 rounded-full blur-[120px] pointer-events-none -z-10" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#7D9BBA]/5 rounded-full blur-[120px] pointer-events-none -z-10" />

        <div className="max-w-6xl mx-auto space-y-16">
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-center space-y-4 max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center space-x-1.5 bg-accent-custom/10 text-accent-custom px-3 py-1 rounded-full text-xs font-mono font-medium border border-accent-custom/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Modular Capability Suite</span>
            </div>
            <h2 className="text-[45px] italic font-display font-medium tracking-tight text-text-custom leading-tight">
              Deep Capabilities. Zero Friction.
            </h2>
            <p className="text-[14px] text-muted-custom leading-relaxed">
              Explore the comprehensive feature architecture powering each of our workspaces. Engineered from the ground up for transparent data cleaning, high-performance visual indexing, and conversational intelligence.
            </p>
          </motion.div>

          {/* Feature Showcase Tabs Selector */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="flex justify-center"
          >
            <div className="bg-surface border border-border-custom p-1 rounded-2xl flex flex-wrap justify-center gap-1 font-mono text-xs shadow-xs">
              <button
                onClick={() => setSelectedFeatureTabState('dashboard')}
                className={`px-5 py-2.5 rounded-xl font-semibold transition-all cursor-pointer flex items-center space-x-2 border-none ${
                  setSelectedFeatureTab === 'dashboard'
                    ? 'bg-surface-2 text-text-custom shadow-xs border border-border-custom font-bold'
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <PieChart className="w-3.5 h-3.5 text-accent-custom" />
                <span>Analytics Dashboard</span>
              </button>
              <button
                onClick={() => setSelectedFeatureTabState('cleaning')}
                className={`px-5 py-2.5 rounded-xl font-semibold transition-all cursor-pointer flex items-center space-x-2 border-none ${
                  setSelectedFeatureTab === 'cleaning'
                    ? 'bg-surface-2 text-text-custom shadow-xs border border-border-custom font-bold'
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5 text-red-500" />
                <span>Data Health Studio</span>
              </button>
              <button
                onClick={() => setSelectedFeatureTabState('chat')}
                className={`px-5 py-2.5 rounded-xl font-semibold transition-all cursor-pointer flex items-center space-x-2 border-none ${
                  setSelectedFeatureTab === 'chat'
                    ? 'bg-surface-2 text-text-custom shadow-xs border border-border-custom font-bold'
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                <span>Conversational Chat</span>
              </button>
            </div>
          </motion.div>

          {/* Interactive Feature Cards Grid */}
          <div className="relative min-h-[420px]">
            <AnimatePresence mode="wait">
              {setSelectedFeatureTab === 'dashboard' && (
                <motion.div
                  key="dashboard-features"
                  variants={bentoContainerVariants}
                  initial="hidden"
                  whileInView="visible"
                  exit={{ opacity: 0, y: -12 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-left"
                >
                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-custom/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-accent-custom/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <Sliders className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Dataset Control Board</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Double dropdown selectors to switch source data version states (Raw vs Cleaned) and specify thematic domain contexts. Fully dynamic pipeline configurations loaded into client session.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Dynamic Ingestion Selector</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Key Indicator Strip</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Top banner showing primary revenue, conversion, or churn metrics.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Primary KPI Summary</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <Filter className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Local Filters Dock</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Dropdowns allowing the user to pick active categories and geo-locations.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">In-Memory Partitioning</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-custom/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-accent-custom/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Narrative Insights Banner</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Automatic bulleted summaries outlining causal indicators, variance anomalies, and target variable correlations triggered dynamically per query context.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Causal Correlation Insights</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <PieChart className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Key Insights Tab</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Configurable multi-column grid displaying regional maps, dimension metrics, and trends.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Metric Grid Deck</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <Table className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">All Columns Tab</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Paginated grid rendering automated charts for every possible categorical-numeric column pairing in the dataset.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Automated Chart Matrix</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-custom/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-accent-custom/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Column Classifier Panel</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Interface grid to map column roles (metric, categorical, identifier) with custom override saving. Updates schema definitions in real-time.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Semantic Profile Map</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-custom/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-accent-custom/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-accent-custom/10 border border-accent-custom/20 flex items-center justify-center">
                        <Edit3 className="w-5 h-5 text-accent-custom" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Value Remapper</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Pop-up selector to edit values in categorical columns directly from the screen, generating instant translation rulesets on the underlying engine.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Inline String Mutator</span>
                  </motion.div>
                </motion.div>
              )}

              {setSelectedFeatureTab === 'cleaning' && (
                <motion.div
                  key="cleaning-features"
                  variants={bentoContainerVariants}
                  initial="hidden"
                  whileInView="visible"
                  exit={{ opacity: 0, y: -12 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left"
                >
                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-red-500/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <ClipboardCheck className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Quality Metrics Panel</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Letter scorecard showing completeness, validity, and uniqueness rates. Integrates an aggregate profile matrix scoring column-by-column coverage scores to outline data depth.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">A–F Health Grading</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Anomalies Checklist</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Categorized issue logs (outliers, missing values, duplicates) color-coded by severity.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Severity Flag Engine</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <Settings className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Treatment Selector</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          In-line inputs to choose fixing strategies per category (drop row, impute mean/median, cap limits).
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Remediation Action Dock</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-red-500/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <Grid className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Side-by-Side Live Grid</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Side-by-side database sheet detailing original cells alongside proposed fixes. Lets operators audit transformations and preview the repaired data live before finalizing schema runs.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Real-Time Cell Compare</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-red-500/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Audit Timeline Log</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Immutable audit stream documenting historical run execution steps, row mutation volumes, corrective query lineage, and pipeline processing durations. Restores previous states in one-click.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Immutable Change History</span>
                  </motion.div>
                </motion.div>
              )}

              {setSelectedFeatureTab === 'chat' && (
                <motion.div
                  key="chat-features"
                  variants={bentoContainerVariants}
                  initial="hidden"
                  whileInView="visible"
                  exit={{ opacity: 0, y: -12 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left"
                >
                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-indigo-500/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Conversational Console</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Advanced semantic text entry interface to query structured databases in simple natural English. Vizzy Pilot compiles contextual mappings into highly specific SQL dialects automatically.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Natural Language Interface</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <Terminal className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Thought Telemetry Accordion</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Detailed execution stack exposing natural language parsing, validation loops, code generation, and pipeline routing speeds.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Parser Transparency Logs</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1 md:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full blur-2xl pointer-events-none transition-all group-hover:bg-indigo-500/10"></div>
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">Dynamic Answers Container</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Fully responsive rendered visual lists of interactive inline charts, pivot summaries, and datasets streamed seamlessly.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Progressive Streaming</span>
                  </motion.div>

                  <motion.div variants={bentoItemVariants} className="bg-surface border border-border-custom rounded-3xl p-7 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between space-y-6 group col-span-1">
                    <div className="space-y-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-base font-semibold tracking-tight text-text-custom">SQL Viewer Component</h3>
                        <p className="text-xs text-muted-custom leading-relaxed">
                          Collapsible code drawer displaying compiled and dialect-sanitized SQL query structures with color syntax highlights.
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono text-muted-custom uppercase tracking-wider">Dialect Validation Frame</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </section>

      {/* 6. INTERACTIVE WORKSPACE PLAYGROUND */}
      <section id="applications" className="py-24 px-4 max-w-7xl mx-auto space-y-12">
        
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-3"
        >
          <h2 className="text-[45px] italic font-display font-medium tracking-tight text-text-custom leading-tight">
            Experience the active workspaces.
          </h2>
          <p className="text-sm text-muted-custom max-w-xl mx-auto leading-relaxed">
            Run real-time operations, configure cleaning actions, or run natural language queries in the live sandboxes below.
          </p>
        </motion.div>

        {/* Workspace Hub Container */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="bg-glass-bg border border-glass-border rounded-3xl p-2 md:p-4 shadow-xl backdrop-blur-md"
        >
          {/* Workspace Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-custom pb-4 px-2 font-mono text-xs">
            <div className="flex items-center space-x-1 bg-surface-2 border border-border-custom p-1 rounded-2xl">
              <button
                onClick={() => setActiveWorkspaceTab('dashboard')}
                className={`px-4 py-2 rounded-xl font-medium transition-all cursor-pointer flex items-center space-x-2 border-none ${
                  activeWorkspaceTab === 'dashboard'
                    ? 'bg-surface text-text-custom shadow-xs border border-border-custom'
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span>Analytics Dashboard</span>
              </button>
              <button
                onClick={() => setActiveWorkspaceTab('cleaning')}
                className={`px-4 py-2 rounded-xl font-medium transition-all cursor-pointer flex items-center space-x-2 border-none ${
                  activeWorkspaceTab === 'cleaning'
                    ? 'bg-surface text-text-custom shadow-xs border border-border-custom'
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5" />
                <span>Data Health Studio</span>
              </button>
              <button
                onClick={() => setActiveWorkspaceTab('chat')}
                className={`px-4 py-2 rounded-xl font-medium transition-all cursor-pointer flex items-center space-x-2 border-none ${
                  activeWorkspaceTab === 'chat'
                    ? 'bg-surface text-text-custom shadow-xs border border-border-custom'
                    : 'text-muted-custom hover:text-text-custom bg-transparent'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Conversational Analytics</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-muted-custom">
              <span className="w-2 h-2 rounded-full bg-success-custom animate-pulse"></span>
              <span>All engines hot-caching active</span>
            </div>
          </div>

          {/* Render Active Workspace Inline */}
          <div className="mt-4 rounded-2xl overflow-hidden bg-bg/50 border border-border-custom min-h-[500px]">
            {activeWorkspaceTab === 'dashboard' && <DashboardPage isDark={isDark} />}
            {activeWorkspaceTab === 'cleaning' && <CleaningStudioPage isDark={isDark} />}
            {activeWorkspaceTab === 'chat' && <ChatPage isDark={isDark} />}
          </div>
        </motion.div>

      </section>

      {/* 7. PERFORMANCE NUMBERS */}
      <section id="benchmarks" className="py-24 px-4 max-w-4xl mx-auto space-y-12">
        
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-3"
        >
          <h2 className="text-[45px] italic font-display font-medium tracking-tight text-text-custom leading-tight">
            Every number is reproducible.
          </h2>
          <p className="text-xs font-sans text-muted-custom">
            All metrics compiled using hardware loopback test scripts on simulated standard transactions.
          </p>
        </motion.div>

        {/* Premium Visual Chart Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface border border-border-custom rounded-2xl p-6 shadow-xs space-y-6 text-left"
          >
            <h3 className="text-sm font-sans font-semibold text-text-custom uppercase tracking-wider border-b border-border-custom/60 pb-3">
              Average Query Speed
            </h3>
            
            <div className="space-y-4">
              {[
                { label: 'Simple filter · 1M rows', val: '2.77ms', pct: 'w-[4%]', desc: 'Direct column filtering in-memory' },
                { label: 'Complex aggregation · 1M rows', val: '55.00ms', pct: 'w-[68%]', desc: 'Multi-group aggregation sequence' },
                { label: 'Time to first chart (Live Stream)', val: '55.00ms', pct: 'w-[68%]', desc: 'Progressive pipeline rendering' },
                { label: 'All 5 slots complete rendering', val: '67.00ms', pct: 'w-[82%]', desc: 'Concurrent UI paint complete' },
              ].map((item, i) => (
                <div key={i} className="space-y-1.5 font-sans">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-custom font-medium">{item.label}</span>
                    <span className="text-accent-custom font-bold font-mono">{item.val}</span>
                  </div>
                  <div className="w-full h-2.5 bg-surface-2 border border-border-custom/50 rounded-full overflow-hidden">
                    <div className={`h-full bg-accent-custom rounded-full ${item.pct}`} />
                  </div>
                  <div className="text-[10px] text-muted-custom leading-none">{item.desc}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="bg-surface border border-border-custom rounded-2xl p-6 shadow-xs flex flex-col justify-between text-left"
          >
            <div>
              <h3 className="text-sm font-sans font-semibold text-text-custom uppercase tracking-wider border-b border-border-custom/60 pb-3">
                Engine Efficiency Factors
              </h3>

              <div className="space-y-6 mt-4 font-sans">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-text-custom">Large Scale vs Small Scale (at 1M rows)</span>
                    <span className="text-success-custom font-bold text-sm font-mono">3.34× faster</span>
                  </div>
                  <div className="flex space-x-1.5 h-3">
                    <div className="flex-[3.34] bg-success-custom rounded-sm" />
                    <div className="flex-1 bg-surface-2 border border-border-custom rounded-sm" />
                  </div>
                  <p className="text-[10px] text-muted-custom">Vectorized column scanning automatically activates for large-scale datasets</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-text-custom">Cache crossover speed</span>
                    <span className="text-accent-custom font-bold text-sm font-mono">~27ms → &lt;1ms</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-muted-custom bg-surface-2 px-1.5 py-0.5 rounded border border-border-custom font-mono">First Load: 27ms</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-custom" />
                    <span className="text-[10px] text-success-custom bg-success-custom/10 px-1.5 py-0.5 rounded border border-success-custom/20 font-bold font-mono">Cached Warm Hit: 0.8ms</span>
                  </div>
                  <p className="text-[10px] text-muted-custom">Subsequent interactions avoid redundant computation and state rebuilding</p>
                </div>
              </div>
            </div>

            <div className="border-t border-border-custom/60 pt-4 mt-6 text-[10px] font-sans text-muted-custom">
              All benchmarks represent stable performance parameters measured across 100 trials.
            </div>
          </motion.div>

        </div>

      </section>

      {/* 8. FOOTER — Typography Reveal Animation */}
      <footer className="bg-surface-2 pt-20 pb-12 px-6 border-t border-border-custom text-left">
        <div className="max-w-6xl mx-auto space-y-16">
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            
            {/* Col 1: Brand */}
            <div className="space-y-3 col-span-2 md:col-span-1 text-left">
              <div className="flex items-center space-x-2">
                <VizzyPilotLogoIcon size={20} className="shrink-0 text-text-custom" />
                <span className="font-semibold text-sm">Vizzy Pilot</span>
              </div>
              <p className="text-xs text-muted-custom leading-relaxed">
                Natural language to validated SQL. Optimized for column engines, immutable lineages, and explainable charts.
              </p>
            </div>

            {/* Col 2: Products */}
            <div className="space-y-3 text-left">
              <h4 className="text-xs font-semibold font-sans text-text-custom uppercase tracking-wider">Product</h4>
              <ul className="text-xs text-muted-custom space-y-2 font-sans list-none p-0">
                <li>
                  <button 
                    onClick={() => {
                      setActiveWorkspaceTab('dashboard');
                      const el = document.getElementById('applications');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }} 
                    className="hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
                  >
                    Dashboard
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => {
                      setActiveWorkspaceTab('cleaning');
                      const el = document.getElementById('applications');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }} 
                    className="hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
                  >
                    Cleaning Studio
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => {
                      setActiveWorkspaceTab('chat');
                      const el = document.getElementById('applications');
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }} 
                    className="hover:text-text-custom transition-all cursor-pointer border-none bg-transparent"
                  >
                    Chat Interface
                  </button>
                </li>
                <li><a href="#benchmarks" className="hover:text-text-custom">Benchmarks</a></li>
              </ul>
            </div>

            {/* Col 3: Resources */}
            <div className="space-y-3 text-left">
              <h4 className="text-xs font-semibold font-sans text-text-custom uppercase tracking-wider">Resources</h4>
              <ul className="text-xs text-muted-custom space-y-2 font-sans list-none p-0">
                <li><a href="https://github.com/JAMIEL-J/Vizzy-Analytics" target="_blank" rel="noopener noreferrer" className="hover:text-text-custom text-decoration-none">GitHub</a></li>
                <li><button onClick={() => setActiveDocsTab("docs")} className="hover:text-text-custom transition-colors border-none bg-transparent cursor-pointer p-0 text-xs text-muted-custom block font-sans">Documentation</button></li>
                <li><button onClick={() => setActiveDocsTab("api")} className="hover:text-text-custom transition-colors border-none bg-transparent cursor-pointer p-0 text-xs text-muted-custom block font-sans">API Docs</button></li>
                <li><button onClick={() => setActiveDocsTab("changelog")} className="hover:text-text-custom transition-colors border-none bg-transparent cursor-pointer p-0 text-xs text-muted-custom block font-sans">Changelog</button></li>
              </ul>
            </div>

            {/* Col 4: Legal */}
            <div className="space-y-3 text-left">
              <h4 className="text-xs font-semibold font-sans text-text-custom uppercase tracking-wider">Legal</h4>
              <ul className="text-xs text-muted-custom space-y-2 font-sans list-none p-0">
                <li><span className="hover:text-text-custom">MIT License</span></li>
                <li><span className="hover:text-text-custom">Privacy Policy</span></li>
                <li><span className="hover:text-text-custom">Terms of Service</span></li>
              </ul>
            </div>

          </div>

          <div className="border-t border-border-custom pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            
            <span className="text-xs font-sans text-muted-custom">
              © 2025 Vizzy Pilot Analytics · Open source · MIT License
            </span>

            {/* Scroll Reveal typography marquee */}
            <div className="w-full text-center overflow-hidden py-4 select-none font-display">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="flex justify-center space-x-1 sm:space-x-3 text-[70px] sm:text-[110px] md:text-[140px] font-display font-bold tracking-tight select-none leading-none"
              >
                {['V', 'I', 'Z', 'Z', 'Y', ' ', 'P', 'I', 'L', 'O', 'T'].map((letter, idx) => (
                  <motion.span
                    key={idx}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: idx * 0.06,
                      duration: 0.7,
                      ease: [0.16, 1, 0.3, 1]
                    }}
                    className="text-text-custom transition-colors duration-300 font-bold"
                  >
                    {letter === ' ' ? '\u00A0' : letter}
                  </motion.span>
                ))}
              </motion.div>
            </div>

          </div>

        </div>
      </footer>

      <AnimatePresence>
        {activeDocsTab && (
          <DocsModal
            initialTab={activeDocsTab}
            onClose={() => setActiveDocsTab(null)}
            isDark={isDark}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
