import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Server, GitBranch, Terminal, LineChart } from "lucide-react";

export default function DataLineage() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Track scroll position of the lineage panel to animate path lengths
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  // Smooth the scroll transition
  const smoothLineage = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 30
  });

  // Transformations that grow path lengths while scrolling
  const path1Length = useTransform(smoothLineage, [0.1, 0.45], [0, 1]);
  const path2Length = useTransform(smoothLineage, [0.35, 0.7], [0, 1]);
  const path3Length = useTransform(smoothLineage, [0.6, 0.95], [0, 1]);

  // Scalability of nodes relative to path reach
  const node1Scale = useTransform(smoothLineage, [0, 0.25], [0.85, 1.05]);
  const node1Opacity = useTransform(smoothLineage, [0, 0.25], [0.4, 1]);

  const node2Scale = useTransform(smoothLineage, [0.25, 0.55], [0.85, 1.05]);
  const node2Opacity = useTransform(smoothLineage, [0.25, 0.55], [0.4, 1]);

  const node3Scale = useTransform(smoothLineage, [0.5, 0.8], [0.85, 1.05]);
  const node3Opacity = useTransform(smoothLineage, [0.5, 0.8], [0.4, 1]);

  const node4Scale = useTransform(smoothLineage, [0.75, 0.95], [0.85, 1.05]);
  const node4Opacity = useTransform(smoothLineage, [0.75, 0.95], [0.3, 1]);

  return (
    <section 
      ref={containerRef} 
      id="performance" 
      className="relative w-full py-32 bg-[#F5F2EB] border-t border-[#E4DED4] overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        
        {/* Editorial Subheader block */}
        <div className="max-w-3xl mb-24">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#7C725D] mb-3 block">
            Phase 05 / Provenance & Trust
          </span>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter text-[#1F1C18] leading-none mb-4">
            Trust is drawn, <br/> not merely <span className="text-emerald-700 font-bold">asserted</span>.
          </h2>
          <p className="font-serif text-2xl sm:text-3xl font-normal leading-relaxed text-[#7C725D] max-w-2xl mt-4">
            Watch the network connections compile as you scroll. Vizzy establishes dynamic cryptographic relationships mapping raw telemetry points straight through to high-level executive forecasts.
          </p>
        </div>

        {/* LINEAGE SCROLL GRAPH STAGE */}
        <div className="relative w-full max-w-5xl mx-auto h-[480px] bg-[#FCFAF5] rounded-2xl border border-[#E4DED4] p-6 sm:p-10 flex items-center justify-between overflow-hidden shadow-2xl">
          
          {/* SVG canvas layer drawing paths */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            {/* Column 1 to Column 2 bezier connectors */}
            <motion.path
              d="M 160,140 C 230,140 230,180 300,180 M 160,280 C 230,280 230,180 300,180 M 160,370 C 230,370 230,200 300,180"
              fill="none"
              stroke="#1F1C18"
              strokeOpacity="0.12"
              strokeWidth="1.5"
            />
            {/* Scroll-powered growth paths (Col 1 to Col 2) */}
            <motion.path
              style={{ pathLength: path1Length }}
              d="M 160,140 C 230,140 230,180 300,180 M 160,280 C 230,280 230,180 300,180 M 160,370 C 230,370 230,200 300,180"
              fill="none"
              stroke="#10b981"
              strokeOpacity="0.5"
              strokeWidth="2"
              strokeDasharray="8 8"
            />

            {/* Column 2 to Column 3 connectors */}
            <motion.path
              d="M 440,200 C 510,200 510,240 580,240 C 510,200 510,165 580,165"
              fill="none"
              stroke="#1F1C18"
              strokeOpacity="0.12"
              strokeWidth="1.5"
            />
            <motion.path
              style={{ pathLength: path2Length }}
              d="M 440,200 C 510,200 510,240 580,240 C 510,200 510,165 580,165"
              fill="none"
              stroke="#10b981"
              strokeOpacity="0.5"
              strokeWidth="2"
              strokeDasharray="8 8"
            />

            {/* Column 3 to Column 4 connectors */}
            <motion.path
              d="M 720,180 C 790,180 790,150 860,150 M 720,290 C 790,290 790,320 860,320 M 720,290 C 790,290 790,150 860,150"
              fill="none"
              stroke="#1F1C18"
              strokeOpacity="0.12"
              strokeWidth="1.5"
            />
            <motion.path
              style={{ pathLength: path3Length }}
              d="M 720,180 C 790,180 790,150 860,150 M 720,290 C 790,290 790,320 860,320 M 720,290 C 790,290 790,150 860,150"
              fill="none"
              stroke="#1F1C18"
              strokeOpacity="0.3"
              strokeWidth="2.5"
            />
          </svg>

          {/* COLUMN 1: SENSORS / RAW DATA SOURCES */}
          <div className="flex flex-col space-y-7 z-10 w-44">
            <span className="font-mono text-[9px] text-[#1F1C18]/40 tracking-widest block font-bold border-b border-[#E4DED4] pb-2">
              COLUMN A // INPUT
            </span>

            {[
              { id: "stripe", title: "stripe_billing_raw", source: "Events Log API" },
              { id: "auth", title: "auth0_identity_db", source: "Auth0 Core" },
              { id: "s3", title: "s3_telemetry_json", source: "S3 Pipeline" }
            ].map((node) => (
              <motion.div
                key={node.id}
                style={{ scale: node1Scale, opacity: node1Opacity }}
                className="p-3 rounded-sm border border-[#E4DED4] bg-[#FCFAF5] shadow-sm flex items-center space-x-2.5 hover:shadow-2xl hover:border-[#1F1C18] transition-all cursor-default"
              >
                <div className="h-6 w-6 rounded bg-[#1F1C18]/5 flex items-center justify-center text-[#1F1C18]/70">
                  <Server className="h-3.5 w-3.5" />
                </div>
                <div className="truncate">
                  <span className="font-mono text-[10px] text-[#1F1C18]/95 font-semibold block truncate">{node.title}</span>
                  <span className="font-mono text-[8px] text-[#1F1C18]/45 block font-medium uppercase tracking-wider">{node.source}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* COLUMN 2: IMMUTABLE VERSION LAYER */}
          <div className="flex flex-col justify-center z-10 w-48 -translate-x-4">
            <div className="space-y-4">
              <span className="font-mono text-[9px] text-[#1F1C18]/40 tracking-widest block font-bold border-b border-[#E4DED4] pb-2">
                COLUMN B // VERSION
              </span>

              <motion.div
                style={{ scale: node2Scale, opacity: node2Opacity }}
                className="p-4 rounded-sm border border-emerald-500/20 bg-emerald-50/20 shadow-xl relative flex flex-col justify-between"
              >
                <div className="absolute top-2 right-2 flex h-2 w-2 rounded-full bg-emerald-500" />
                <div className="flex items-center space-x-2 font-mono text-[9px] text-emerald-800 font-bold uppercase mb-2">
                  <GitBranch className="h-3.5 w-3.5 text-emerald-600" />
                  <span>ACTIVE HEAD v2.1.2</span>
                </div>
                <span className="font-mono text-[11px] text-[#1F1C18]/90 font-semibold block leading-tight">schema_state_active</span>
                <span className="font-mono text-[8px] text-[#1F1C18]/45 block mt-1">Cryptographic commit hash verified catalog</span>
              </motion.div>
            </div>
          </div>

          {/* COLUMN 3: TRANSFORMATION PIPELINES */}
          <div className="flex flex-col space-y-7 z-10 w-44">
            <span className="font-mono text-[9px] text-[#1F1C18]/40 tracking-widest block font-bold border-b border-[#E4DED4] pb-2">
              COLUMN C // CORE METRIC
            </span>

            {[
              { id: "prune", title: "delta_compressor", status: "Active pruner" },
              { id: "prov", title: "provenance_eval", status: "Validating logical" }
            ].map((node) => (
              <motion.div
                key={node.id}
                style={{ scale: node3Scale, opacity: node3Opacity }}
                className="p-3 rounded-sm border border-[#E4DED4] bg-[#FCFAF5] shadow-sm flex items-center space-x-2.5 cursor-default hover:border-[#1F1C18] hover:shadow-2xl transition-all"
              >
                <div className="h-6 w-6 rounded bg-[#1F1C18]/5 flex items-center justify-center text-[#1F1C18]/85">
                  <Terminal className="h-3.5 w-3.5" />
                </div>
                <div className="truncate">
                  <span className="font-mono text-[10px] text-[#1F1C18]/95 font-semibold block truncate">{node.title}</span>
                  <span className="font-mono text-[8px] text-[#1F1C18]/45 block font-medium uppercase tracking-wider">{node.status}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* COLUMN 4: REFINED DECISIVE INSIGHTS */}
          <div className="flex flex-col space-y-7 z-10 w-44">
            <span className="font-mono text-[9px] text-[#1F1C18]/40 tracking-widest block font-bold border-b border-[#E4DED4] pb-2">
              COLUMN D // INSIGHT
            </span>

            {[
              { id: "dash", title: "ltv_cohort_matrix", dest: "Analytical dashboard" },
              { id: "forecast", title: "churn_vector_api", dest: "ML Forecast trigger" }
            ].map((node) => (
              <motion.div
                key={node.id}
                style={{ scale: node4Scale, opacity: node4Opacity }}
                className="p-3 rounded-sm border border-[#1F1C18]/15 bg-[#FCFAF5] shadow-xl flex items-center space-x-2.5 cursor-default hover:shadow-2xl hover:border-[#1F1C18] transition-all"
              >
                <div className="h-6 w-6 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <LineChart className="h-3.5 w-3.5" />
                </div>
                <div className="truncate">
                  <span className="font-mono text-[10px] text-[#1F1C18]/95 font-semibold block truncate">{node.title}</span>
                  <span className="font-mono text-[8px] text-[#1F1C18]/45 block font-medium uppercase tracking-wider">{node.dest}</span>
                </div>
              </motion.div>
            ))}
          </div>

        </div>

      </div>
    </section>
  );
}
