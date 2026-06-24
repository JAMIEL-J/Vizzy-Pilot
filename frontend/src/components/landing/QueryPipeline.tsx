import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, BrainCircuit, CheckCircle2, Terminal, Landmark, ChevronRight, Sparkles } from "lucide-react";

type PipelineStep = {
  id: string;
  label: string;
  icon: any;
  title: string;
  subtitle: string;
  color: string;
};

const STEPS: PipelineStep[] = [
  {
    id: "question",
    label: "Question",
    icon: HelpCircle,
    title: "Raw Intent Ingestion",
    subtitle: "A simple natural language prompt enters the server.",
    color: "amber"
  },
  {
    id: "understanding",
    label: "Understanding",
    icon: BrainCircuit,
    title: "Semantic Parsing & Intent Alignment",
    subtitle: "Mapping grammar to database entities and catalog dictionaries.",
    color: "indigo"
  },
  {
    id: "validation",
    label: "Validation",
    icon: CheckCircle2,
    title: "Verifiable Schema Validation",
    subtitle: "Assessing dataset permissions, version states, and historic lineage.",
    color: "emerald"
  },
  {
    id: "execution",
    label: "Execution",
    icon: Terminal,
    title: "Zero-Latency Optimized Compiler",
    subtitle: "Generating high-performance SQL using cached delta structures.",
    color: "sky"
  },
  {
    id: "insight",
    label: "Insight",
    icon: Landmark,
    title: "Insight Convergence",
    subtitle: "A completely precise, auditable metric and interactive visual graph.",
    color: "emerald"
  }
];

export default function QueryPipeline() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Auto-rotate steps
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveStepIndex((prev) => (prev + 1) % STEPS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const activeStep = STEPS[activeStepIndex];

  return (
    <section id="intelligence" className="relative w-full py-28 bg-[#F5F2EB] border-t border-[#E4DED4] overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-16 text-left">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#7C725D] mb-3 block">
            Phase 01 / Natural Language Intelligence
          </span>
          <h2 className="font-sans text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter text-[#1F1C18] leading-none mb-4">
            Querying is. <br className="sm:hidden" /> No translation required.
          </h2>
          <p className="font-serif text-2xl sm:text-3xl font-normal leading-relaxed text-[#7C725D] max-w-2xl mt-4">
            Watch how a single natural business query is parsed, validated against schema lineages, and securely transcompiled in real-time.
          </p>
        </div>

        {/* Outer Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Left Panel: Vertical Steps Indicator / Controller */}
          <div className="lg:col-span-5 space-y-3 text-left">
            <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#7C725D] mb-3">
              PIPELINE TRACK TRANSITION
            </div>
            
            <div className="space-y-2">
              {STEPS.map((step, index) => {
                const isActive = index === activeStepIndex;
                const Icon = step.icon;
                
                return (
                  <button
                    key={step.id}
                    onClick={() => {
                      setActiveStepIndex(index);
                      setIsPlaying(false); // Pause auto-rotation on user click
                    }}
                    className={`w-full flex items-center justify-between text-left p-4 rounded-xl border transition-all duration-300 group relative cursor-pointer ${
                      isActive 
                        ? "bg-[#1F1C18] border-[#1F1C18] text-[#FBF9F6] shadow-2xl"
                        : "bg-[#FCFAF5] border-[#E4DED4] text-[#1F1C18] hover:border-[#1F1C18]"
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
                        isActive 
                          ? "bg-white/10 text-white" 
                          : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-[#1F1C18]"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono tracking-widest uppercase opacity-40">
                          STAGE 0{index + 1}
                        </div>
                        <span className="font-sans text-sm font-semibold tracking-tight">
                          {step.label}
                        </span>
                      </div>
                    </div>
                    
                    <ChevronRight className={`h-4 w-4 opacity-40 transition-transform ${
                      isActive ? "translate-x-1 opacity-90" : "group-hover:translate-x-0.5"
                    }`} />

                    {/* Active dynamic progress line inside the controller button */}
                    {isActive && isPlaying && (
                      <motion.div 
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 4.5, ease: "linear" }}
                        className="absolute bottom-0 left-0 h-0.5 bg-emerald-400 rounded-b-xl"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="text-xs font-mono text-[#1F1C18]/60 hover:text-[#1F1C18] flex items-center space-x-1.5 cursor-pointer bg-transparent border-none"
              >
                <span className={`p-1 rounded-sm ${isPlaying ? "bg-emerald-500/10" : "bg-orange-500/10"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full block ${isPlaying ? "bg-emerald-500 animate-pulse" : "bg-orange-500"}`} />
                </span>
                <span>{isPlaying ? "Pipeline Live Simulation Running" : "Simulation Paused"}</span>
              </button>
              <button
                onClick={() => {
                  setActiveStepIndex(0);
                  setIsPlaying(true);
                }}
                className="text-xs font-mono text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer bg-transparent border-none"
              >
                Restart Workflow
              </button>
            </div>
          </div>

          {/* Right Panel: Massive Morphing Visualization Canvas */}
          <div className="lg:col-span-7 h-[420px] rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 sm:p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden text-left">
            
            <div className="flex justify-between items-center border-b border-[#E4DED4] pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-xs text-[#7C725D]">vizzy-pipeline-kernel // host-live</span>
              </div>
              <div className="flex space-x-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1F1C18]/10" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#1F1C18]/10" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#1F1C18]/10" />
              </div>
            </div>

            {/* Core Animated Display */}
            <div className="flex-1 my-6 flex items-center justify-center relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep.id}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.98 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full flex flex-col"
                >
                  {/* Step Content Dynamic Views */}
                  {activeStep.id === "question" && (
                    <div className="space-y-4">
                      {/* Interactive Prompt card */}
                      <div className="bg-[#1c1c1a]/5 p-4 rounded-xl border border-[#1c1c1a]/10 font-mono text-xs text-[#1c1c1a] leading-relaxed text-left">
                        <span className="text-emerald-600 font-bold mr-1.5">&gt;</span>
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.8 }}
                        >
                          "Plot user LTV of signups who experienced v1.2 schema migration last month."
                        </motion.span>
                        <span className="animate-pulse font-bold">|</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] font-mono text-[#1c1c1a]/40">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        <span>Source: Slack Integrations API / Pilot Prompt Shell</span>
                      </div>
                    </div>
                  )}

                  {activeStep.id === "understanding" && (
                    <div className="space-y-3">
                      <div className="font-mono text-xs text-[#1c1c1a]/80 text-left">Semantic Entity Breakdown:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="bg-[#fafafa] border border-[#e4e4e0] p-3 rounded-lg flex flex-col justify-between text-left">
                          <span className="font-mono text-[9px] text-[#1c1c1a]/40 uppercase">Target Entity</span>
                          <span className="font-sans font-medium text-xs text-[#1c1c1a] mt-1 bg-yellow-400/10 px-1.5 py-0.5 rounded self-start border border-yellow-500/20">
                            metrics.user_ltv
                          </span>
                        </div>
                        <div className="bg-[#fafafa] border border-[#e4e4e0] p-3 rounded-lg flex flex-col justify-between text-left">
                          <span className="font-mono text-[9px] text-[#1c1c1a]/40 uppercase">Filtering Logic</span>
                          <span className="font-sans font-medium text-xs text-[#1c1c1a] mt-1 bg-purple-400/10 px-1.5 py-0.5 rounded self-start border border-purple-500/20">
                            schema_v === "v1.2"
                          </span>
                        </div>
                        <div className="bg-[#fafafa] border border-[#e4e4e0] p-3 rounded-lg flex flex-col justify-between text-left">
                          <span className="font-mono text-[9px] text-[#1c1c1a]/40 uppercase">Temporal Window</span>
                          <span className="font-sans font-medium text-xs text-[#1c1c1a] mt-1 bg-blue-400/10 px-1.5 py-0.5 rounded self-start border border-blue-500/20">
                            INTERVAL 30 DAYS
                          </span>
                        </div>
                        <div className="bg-[#fafafa] border border-[#e4e4e0] p-3 rounded-lg flex flex-col justify-between text-left">
                          <span className="font-mono text-[9px] text-[#1c1c1a]/40 uppercase">Context Schema</span>
                          <span className="font-sans font-semibold text-xs text-[#1c1c1a] mt-1 bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded self-start border border-emerald-500/20">
                            sqlite:production_head
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeStep.id === "validation" && (
                    <div className="space-y-3 p-1 text-left">
                      <div className="flex items-center justify-between border-b border-[#e4e4e0] pb-2">
                        <span className="text-xs font-mono font-medium text-[#1c1c1a]/80">Schema Integrity Verification</span>
                        <span className="text-[10px] font-mono text-emerald-600 font-bold bg-emerald-500/15 px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> VERIFIED MATCH
                        </span>
                      </div>
                      
                      <div className="space-y-1.5 font-mono text-[11px] text-[#1c1c1a]/85">
                        <div className="flex items-center space-x-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Lineage parent chain hashes match: <code className="bg-[#1c1c1a]/5 px-1 py-0.5 rounded text-indigo-600">v1.2_origin</code></span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Referential permissions validation for guest-id: <span className="underline select-all font-semibold">prod_admin</span></span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Integrity constraints checks complete</span>
                        </div>
                      </div>
                      <div className="bg-zinc-50 border border-zinc-200 p-2.5 rounded text-[10px] text-zinc-650 font-mono">
                        Verification log: Found 4 dependencies, all verified. Query optimization path chosen: <code>DELTA-TREE-V2</code>
                      </div>
                    </div>
                  )}

                  {activeStep.id === "execution" && (
                    <div className="space-y-3.5 text-left">
                      <div className="flex justify-between items-center bg-[#1c1c1a]/5 px-3 py-1.5 rounded-lg border border-[#1c1c1a]/10">
                        <span className="font-mono text-[10px] text-[#1c1c1a]/60">COMPILED SQL (0.55ms execution plan)</span>
                        <span className="font-mono text-[9px] text-emerald-600 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          CACHED
                        </span>
                      </div>
                      <div className="bg-[#1c1c1a] p-4 rounded-xl font-mono text-[11px] text-[#fafafa]/90 leading-relaxed shadow-inner">
                        <span className="text-indigo-400">SELECT</span> <span className="text-emerald-400">SUM</span>(t.user_ltv) <span className="text-zinc-400">as</span> calculated_ltv, <br />
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;u.schema_version<br />
                        <span className="text-indigo-400">FROM</span> users u<br />
                        <span className="text-indigo-400">JOIN</span> transactions_v2 t <span className="text-indigo-400">ON</span> t.user_id = u.id<br />
                        <span className="text-indigo-400">WHERE</span> u.schema_version = <span className="text-amber-400">'v1.2'</span> <span className="text-indigo-400">AND</span> t.created_at &gt;= NOW() - <span className="text-pink-400">INTERVAL '30 DAYS'</span><br />
                        <span className="text-indigo-400">GROUP BY</span> u.schema_version;
                      </div>
                    </div>
                  )}

                  {activeStep.id === "insight" && (
                    <div className="space-y-4 text-left">
                      {/* Explaining natural language output */}
                      <div className="bg-[#1c1c1a]/5 p-3 rounded-xl border border-dashed border-[#1c1c1a]/15 text-xs text-[#1c1c1a] leading-relaxed">
                        <span className="font-mono text-[9px] text-emerald-600 uppercase tracking-widest block mb-1">AUTOMATED EXECUTIVE BRIEF</span>
                        "Signups on <strong className="font-semibold text-emerald-800">v1.2</strong> schema displayed a <span className="underline underline-offset-4 decoration-emerald-500 font-bold">3.34x increase</span> in core user lifetime value. Total cumulative volume is <strong className="font-semibold text-emerald-800">$452,190</strong>. All calculated transformations successfully verified against origin lineage graphs."
                      </div>
                      {/* Simple graph display */}
                      <div className="h-10 w-full bg-zinc-50 border border-zinc-200/50 rounded flex items-center justify-between px-4 font-mono text-[10px]">
                        <span className="text-zinc-500">v1.1 (legacy schema)</span>
                        <div className="w-1/3 h-2 bg-zinc-200 rounded overflow-hidden">
                          <div className="h-full bg-zinc-400 w-[24%]" />
                        </div>
                        <span className="text-[#1c1c1a] font-semibold">$135K</span>
                      </div>
                      <div className="h-10 w-full bg-zinc-50 border border-zinc-200/50 rounded flex items-center justify-between px-4 font-mono text-[10px]">
                        <span className="text-emerald-700 font-medium">v1.2 (migrated schema)</span>
                        <div className="w-1/3 h-2 bg-emerald-100 rounded overflow-hidden">
                          <motion.div 
                            initial={{ width: "0%" }}
                            animate={{ width: "84%" }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="h-full bg-emerald-500" 
                          />
                        </div>
                        <span className="text-emerald-600 font-bold">$452K (3.34x)</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom Status Details */}
            <div className="flex justify-between items-center text-[10px] font-mono border-t border-[#F0EFED] pt-4 text-gray-400">
              <span>ACTIVE SYSTEM STATE: <span className="font-bold text-emerald-600">SIMULATION ACTIVE</span></span>
              <span className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> COMPILATION COMPLETE
              </span>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
