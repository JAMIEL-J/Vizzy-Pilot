import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitCommit, Database, Zap, Cpu, Activity } from "lucide-react";

type VersionNode = {
  id: string;
  version: string;
  hash: string;
  date: string;
  author: string;
  description: string;
  metricsCount: number;
  status: string;
  deltas: string[];
};

const VERSION_DATA: VersionNode[] = [
  {
    id: "v1.0",
    version: "v1.0.0_origin",
    hash: "6e2a8fb",
    date: "May 12, 2026",
    author: "Elena Rostov (Core Infrastructure)",
    description: "Initial schema deployment mapping main transactional database logs directly from payment systems.",
    metricsCount: 14,
    status: "Active Verified",
    deltas: ["+ table: users", "+ table: transactions", "+ column: users.id (uuid)"]
  },
  {
    id: "v1.1",
    version: "v1.1.0_aggregation",
    hash: "fb9202a",
    date: "May 28, 2026",
    author: "Marcus Chen (Analytics Lead)",
    description: "Introduced user-lifetime metrics logic with continuous chronological sum calculations.",
    metricsCount: 22,
    status: "Active Verified",
    deltas: ["+ table: user_ltv_history", "+ index: idx_user_transactions", "Δ column: transactions.amount (decimal)"]
  },
  {
    id: "v2.0",
    version: "v2.0.0_head_release",
    hash: "d4c1b05",
    date: "June 18, 2026",
    author: "Elena Rostov (Core Infrastructure)",
    description: "Merged sandbox predictive pipelines into production head. Initialized immutable audit version tables.",
    metricsCount: 42,
    status: "Active Verified",
    deltas: ["✓ merge branch config: predict", "+ table: lineage_provenance_logs", "Δ trigger: verify_integrity_on_insert"]
  },
  {
    id: "v2.1",
    version: "v2.1.2_canary",
    hash: "9e8d7c6",
    date: "June 20, 2026",
    author: "Continuous Delivery Bot",
    description: "Automatic Canary migration incorporating security filters on customer geographic coordinates.",
    metricsCount: 45,
    status: "System Active Head",
    deltas: ["+ table: geographic_zones_shield", "Δ security policy: apply_row_rls"]
  }
];

export default function HorizontalStorytelling() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("v2.0");
  const selectedNode = VERSION_DATA.find((node) => node.id === selectedNodeId) || VERSION_DATA[2];

  return (
    <section id="version-history" className="relative w-full py-28 bg-[#F5F2EB] border-t border-[#E4DED4] overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-16 text-left">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#7C725D] mb-3 block">
            Phase 02 & 03 / Engineering Bento Matrix
          </span>
          <h2 className="font-sans text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter text-[#1F1C18] leading-none mb-4 font-sans">
            Unified Chronology. <br />High performance structures.
          </h2>
          <p className="font-serif text-2xl sm:text-3xl font-normal leading-relaxed text-[#7C725D] max-w-2xl mt-4">
            Trace version catalogs, live compilation latency statistics, and cryptographic delta tracking in our unified physical grid display.
          </p>
        </div>

        {/* BENTO GRID MATRIX */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch text-left">
          
          {/* Bento Cell 1: Interactive Version Graph (Span 2 Columns, 2 Rows) */}
          <div className="md:col-span-2 row-span-2 rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 sm:p-8 flex flex-col justify-between shadow-lg relative min-h-[500px]">
            <div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="font-mono text-[9px] text-[#7C725D] tracking-widest block uppercase font-bold mb-1">
                    01 / VERSION TIMELINE SCHEMA
                  </span>
                  <h3 className="text-xl font-bold font-sans text-[#1F1C18]">
                    Immutable Schema Evolution Graph
                  </h3>
                </div>
                <div className="flex items-center space-x-1.5 rounded-full bg-[#1F1C18]/5 px-3 py-1 border border-[#E4DED4]">
                  <GitCommit className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[9px] font-mono font-bold text-[#1F1C18]/80 uppercase">Active Master Head</span>
                </div>
              </div>

              {/* Version Timeline Nodes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {VERSION_DATA.map((node) => {
                  const isSelected = node.id === selectedNodeId;
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`text-left p-4 rounded-xl border transition-all duration-300 relative overflow-hidden cursor-pointer ${
                        isSelected 
                          ? "bg-[#1F1C18] border-[#1F1C18] text-[#FBF9F6] shadow-xl"
                          : "bg-[#F5F2EB]/50 border-[#E4DED4] text-[#1F1C18] hover:border-[#1F1C18]"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase ${
                          isSelected ? "bg-white/10 text-emerald-400" : "bg-[#1F1C18]/5 text-[#7C725D]"
                        }`}>
                          {node.id}
                        </span>
                        <span className="font-mono text-[9px] opacity-40">#{node.hash}</span>
                      </div>
                      <div className="font-sans text-xs font-bold truncate">
                        {node.version.replace("v1.0.0_", "").replace("v2.0.0_", "").replace("_", " ")}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Display Select Node Details */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedNode.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="bg-[#F5F2EB]/70 border border-[#E4DED4] p-5 rounded-xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-2 border-b border-[#E4DED4] pb-3">
                    <div className="text-xs">
                      <span className="text-[#7C725D] font-mono uppercase block text-[9px] tracking-wider mb-0.5">Committer Author</span>
                      <strong className="font-sans text-[#1F1C18] font-bold">{selectedNode.author}</strong>
                    </div>
                    <div className="text-xs">
                      <span className="text-[#7C725D] font-mono uppercase block text-[9px] tracking-wider mb-0.5">Deployment Timestamp</span>
                      <strong className="font-sans text-[#1F1C18] font-bold">{selectedNode.date}</strong>
                    </div>
                  </div>

                  <p className="text-sm text-[#1F1C18] leading-relaxed font-sans font-medium">
                    {selectedNode.description}
                  </p>

                  <div>
                    <span className="text-[#7C725D] font-mono uppercase block text-[9px] tracking-wider mb-2">Schema Delta Changes ({selectedNode.deltas.length})</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedNode.deltas.map((delta, i) => (
                        <span key={i} className="text-[10px] font-mono bg-[#1F1C18]/5 border border-[#E4DED4] px-2.5 py-1 rounded-sm text-[#1F1C18] font-semibold">
                          {delta}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="pt-6 border-t border-[#E4DED4] mt-6 flex justify-between items-center text-xs text-[#7C725D]">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-emerald-600" />
                <span>Total Active Lineage Metrics: <strong className="text-[#1F1C18] font-bold">{selectedNode.metricsCount} Verified Nodes</strong></span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#1F1C18]/45">SECURE SHIELD ACTIVE</span>
            </div>
          </div>

          {/* Bento Cell 2: SQL Compilation Speed */}
          <div className="rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 sm:p-8 flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div>
              <span className="font-mono text-[9px] text-[#7C725D] tracking-widest block uppercase font-bold mb-1">
                02 / INTENT COMPILER
              </span>
              <h3 className="text-base font-bold font-sans text-[#1F1C18] mb-6">
                Zero-Translation Generation
              </h3>
              
              <div className="my-4 relative">
                <div className="text-6xl font-black font-mono text-emerald-700 tracking-tighter flex items-baseline">
                  2.77<span className="text-2xl font-normal text-[#7C725D] ml-1">ms</span>
                </div>
                <div className="text-[10px] font-mono text-[#7C725D] uppercase mt-2 tracking-wider flex items-center space-x-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>SQL Compile Time Average</span>
                </div>
              </div>

              <p className="text-xs text-[#7C725D] leading-relaxed font-sans mt-4">
                By transcompiling raw logical queries directly against structural lineage nodes, translation steps are entirely skipped.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E4DED4] flex items-center justify-between">
              <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider">Fastest Pipeline</span>
              <Zap className="h-4 w-4 text-emerald-600" />
            </div>
          </div>

          {/* Bento Cell 3: Tree Traversal Speed */}
          <div className="rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 sm:p-8 flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div>
              <span className="font-mono text-[9px] text-[#7C725D] tracking-widest block uppercase font-bold mb-1">
                03 / TREE TRAVERSAL
              </span>
              <h3 className="text-base font-bold font-sans text-[#1F1C18] mb-6">
                Rhythm Degree Traversal
              </h3>

              <div className="my-4 relative">
                <div className="text-6xl font-black font-mono text-[#1F1C18] tracking-tighter flex items-baseline">
                  55<span className="text-2xl font-normal text-[#7C725D] ml-1">ms</span>
                </div>
                <div className="text-[10px] font-mono text-[#7C725D] uppercase mt-2 tracking-wider flex items-center space-x-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
                  <span>12-Degree Relational Trace</span>
                </div>
              </div>

              <div className="h-1.5 w-full bg-[#F5F2EB] rounded-full overflow-hidden mt-4">
                <div className="h-full bg-indigo-600 rounded-full w-[85%]" />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E4DED4] flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#7C725D] uppercase font-bold tracking-wider">Blink Traversal</span>
              <Cpu className="h-4 w-4 text-indigo-500" />
            </div>
          </div>

          {/* Bento Cell 4: Execution Yield Over Cache */}
          <div className="rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 sm:p-8 flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div>
              <span className="font-mono text-[9px] text-[#7C725D] tracking-widest block uppercase font-bold mb-1">
                04 / PERFORMANCE RATIO
              </span>
              <h3 className="text-base font-bold font-sans text-[#1F1C18] mb-6">
                Chronological Delta Cache
              </h3>

              <div className="my-4 relative">
                <div className="text-6xl font-black font-mono text-amber-700 tracking-tighter flex items-baseline">
                  3.34<span className="text-2xl font-normal text-[#7C725D] ml-1">x</span>
                </div>
                <div className="text-[10px] font-mono text-[#7C725D] uppercase mt-2 tracking-wider flex items-center space-x-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Throughput Boost Over Raw PG</span>
                </div>
              </div>

              <p className="text-xs text-[#7C725D] leading-relaxed font-sans mt-4">
                Storing analytical states as physical chronological delta trees bypasses redundant and costly full table scans.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E4DED4] flex items-center justify-between">
              <span className="text-[10px] font-mono text-amber-700 font-bold uppercase tracking-wider">Delta Ingestion</span>
              <Activity className="h-4 w-4 text-amber-500" />
            </div>
          </div>

          {/* Bento Cell 5: Cryptographic Write Rate (Span 2 Columns) */}
          <div className="md:col-span-2 rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 sm:p-8 flex flex-col justify-between shadow-lg relative">
            <div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="font-mono text-[9px] text-[#7C725D] tracking-widest block uppercase font-bold mb-1">
                    05 / SECURE CRYPTO INGESTION
                  </span>
                  <h3 className="text-xl font-bold font-sans text-[#1F1C18]">
                    Lineage Continuous Logging
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#7C725D] font-mono block font-sans">Lineage Write Speed</span>
                  <strong className="text-2xl font-black font-sans text-emerald-700">610K/s</strong>
                </div>
              </div>

              {/* Pseudo real-time console tracer */}
              <div className="bg-[#F5F2EB] border border-[#E4DED4] rounded-xl p-4 font-mono text-[10px] text-[#1F1C18] space-y-2 max-h-[140px] overflow-y-auto">
                <div className="flex justify-between opacity-75">
                  <span className="text-[#7C725D]">&gt; [03:14:12] VERIFIED COMMIT</span>
                  <span className="text-emerald-600 font-bold">SHA-9E8D7C6</span>
                </div>
                <div className="flex justify-between opacity-70">
                  <span className="text-[#7C725D]">&gt; [03:14:14] SECURE SHIELD APPLY row_rls</span>
                  <span className="text-[#1F1C18] font-semibold">SUCCESS</span>
                </div>
                <div className="flex justify-between opacity-60">
                  <span className="text-[#7C725D]">&gt; [03:14:15] INGEST s3_telemetry_json</span>
                  <span className="text-emerald-600 font-bold">COMPLETED</span>
                </div>
                <div className="flex justify-between opacity-40">
                  <span className="text-[#7C725D]">&gt; [03:14:16] COMPREHENSIVE COMPRESSION EVAL</span>
                  <span className="text-[#1F1C18]">NODE-X39</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E4DED4] flex items-center justify-between text-xs text-[#7C725D]">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#1F1C18]/40">Continuous Telemetry Loop</span>
              <div className="flex items-center space-x-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-sans font-bold text-[#1F1C18]">Audit Vault Active</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
