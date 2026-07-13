import { motion } from "framer-motion";
import { Database, Zap, GitBranch } from "lucide-react";

const PHASES = [
  {
    icon: Database,
    phase: "01",
    title: "Ingest & Profile",
    body: "Upload a CSV or connect a database. Vizzy Pilot profiles a 50-row sample to detect column semantics — numeric, categorical, date, identifier — using a deterministic regex pre-mapper backed by an LLM corrective loop. Low-confidence mappings are flagged for human review.",
    accent: "#0EA5E9",
    tag: "Schema detection",
  },
  {
    icon: Zap,
    phase: "02",
    title: "Route & Execute",
    body: "The hybrid router evaluates row count at query time. Datasets under 100K rows run through Pandas (p95: 2.77ms). Above 100K rows, queries execute on DuckDB (p95: 55ms at 1M rows). All queries pass through SQLGlot validation before execution to block injection and dialect leaks.",
    accent: "#10B981",
    tag: "Hybrid engine",
  },
  {
    icon: GitBranch,
    phase: "03",
    title: "Stream & Version",
    body: "Results stream slot-by-slot via Server-Sent Events. First chart appears in 55ms; all 5 slots complete in 67ms. Every transformation creates an immutable DatasetVersion chained via parent_version_id, forming an auditable lineage with 1-click rollback.",
    accent: "#F97316",
    tag: "Immutable lineage",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-24 px-6">
      <div className="mx-auto max-w-5xl">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2
            className="text-[40px] sm:text-[52px] font-serif tracking-tight text-[#0A0A0A] leading-[1.1] mb-4"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            From question to verified chart
            <br />
            <span className="italic">in under 100ms.</span>
          </h2>
          <p className="text-[16px] text-[#6B7280] max-w-lg mx-auto">
            Three phases. Zero ambiguity. Every query is cache-checked, validated, and version-logged before a chart renders.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[19px] top-8 bottom-8 w-px bg-gradient-to-b from-black/[0.06] via-black/[0.1] to-black/[0.06] hidden md:block" />

          <div className="space-y-10">
            {PHASES.map((phase, i) => {
              const Icon = phase.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex gap-6 md:gap-8"
                >
                  {/* Icon node */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center shadow-sm border border-black/[0.06]"
                      style={{ backgroundColor: `${phase.accent}10` }}
                    >
                      <Icon className="h-4.5 w-4.5" style={{ color: phase.accent }} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-8">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[11px] font-mono text-[#9CA3AF] font-medium">{phase.phase}</span>
                      <span
                        className="text-[10.5px] font-medium px-2 py-0.5 rounded-full border"
                        style={{ color: phase.accent, borderColor: `${phase.accent}30`, backgroundColor: `${phase.accent}08` }}
                      >
                        {phase.tag}
                      </span>
                    </div>
                    <h3 className="text-[20px] font-semibold text-[#0A0A0A] tracking-tight mb-2">{phase.title}</h3>
                    <p className="text-[14.5px] text-[#6B7280] leading-relaxed max-w-xl">{phase.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
