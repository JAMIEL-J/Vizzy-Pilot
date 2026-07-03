import { motion } from "framer-motion";

const STATS = [
  { value: "2.77ms", label: "Simple filter · 1M rows", note: "p95" },
  { value: "55ms", label: "Complex aggregation · 1M rows", note: "p95" },
  { value: "<1ms", label: "Cache warm hit", note: "vs 27ms cold" },
  { value: "55ms", label: "First chart (SSE stream)", note: "slot 1" },
  { value: "610K/s", label: "100MB CSV ingestion", note: "rows/sec" },
];

export default function TrustStrip() {
  return (
    <div className="border-y border-black/[0.06] bg-white py-5 px-6 overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-[11px] text-[#9CA3AF] font-mono mb-4">
          Benchmarked on Python 3.14 · Intel i-series · 7.75GB RAM · reproducible via{" "}
          <span className="text-[#6B7280]">run_benchmarks.py</span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className="flex items-center gap-2.5 rounded-full bg-[#FAFAF9] border border-black/[0.07] px-4 py-2"
            >
              <span className="text-[14px] font-semibold text-[#0A0A0A] font-mono tabular-nums">{stat.value}</span>
              <div className="h-3 w-px bg-black/10" />
              <div>
                <span className="text-[11px] text-[#6B7280]">{stat.label}</span>
                <span className="text-[10px] text-[#9CA3AF] ml-1">· {stat.note}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
