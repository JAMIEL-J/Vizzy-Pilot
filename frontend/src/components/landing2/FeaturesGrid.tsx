import { motion } from "framer-motion";
import { MessageSquare, Cpu, Lock, Radio, HeartPulse, RefreshCw } from "lucide-react";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Natural Language → SQL",
    body: "Type a question in plain English. An LLM router (Groq / Gemini) generates SQL constrained to a 512-token budget and 30-second timeout. SQLGlot validates dialect correctness before any row is touched.",
    accent: "#0EA5E9",
  },
  {
    icon: Cpu,
    title: "Dual-Engine Routing",
    body: "Automatic crossover at 100K rows — Pandas for speed at small scale (2.24× faster), DuckDB for columnar power at large scale (3.34× faster at 1M rows). One API, zero config.",
    accent: "#10B981",
  },
  {
    icon: Lock,
    title: "Immutable Versioning",
    body: "Every cleaning operation or schema remap creates a new DatasetVersion with a parent chain. No original data is ever overwritten. Full diff visibility and instant rollback via parent_version_id navigation.",
    accent: "#F97316",
  },
  {
    icon: Radio,
    title: "SSE Progressive Loading",
    body: "Dashboard slots execute concurrently. Results stream via Server-Sent Events as each slot completes. First chart visible at 55ms. All 5 charts complete at 67ms — no blocking render.",
    accent: "#8B5CF6",
  },
  {
    icon: HeartPulse,
    title: "Data Health Studio",
    body: "Automated inspection scores each dataset A–F across Completeness, Validity, and Uniqueness. IQR outlier capping, median/mean imputation, and duplicate removal — previewed cell-by-cell before a row is modified.",
    accent: "#EF4444",
  },
  {
    icon: RefreshCw,
    title: "Semantic Corrective Loop",
    body: "Column mapping proposals from the LLM are saved as few-shot corrections to a persistent database. Manual overrides retrain future classification context, preventing semantic drift across datasets.",
    accent: "#F97316",
  },
];

export default function FeaturesGrid() {
  return (
    <section id="features" className="bg-[#FAFAF9] py-24 px-6">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-[11px] font-mono text-[#9CA3AF] uppercase tracking-widest block mb-3">Features</span>
          <h2
            className="text-[40px] sm:text-[52px] font-serif tracking-tight text-[#0A0A0A] leading-[1.1]"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Six systems. Zero trust broken.
          </h2>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -3, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}
                className="rounded-2xl bg-white border border-black/[0.07] p-6 cursor-default transition-shadow"
              >
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${feat.accent}10` }}
                >
                  <Icon className="h-4 w-4" style={{ color: feat.accent }} />
                </div>
                <h3 className="text-[15px] font-semibold text-[#0A0A0A] mb-2 tracking-tight">{feat.title}</h3>
                <p className="text-[13.5px] text-[#6B7280] leading-relaxed">{feat.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
