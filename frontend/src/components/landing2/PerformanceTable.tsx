import { motion } from "framer-motion";

const ROWS = [
  { metric: "Simple filter", detail: "1M rows", value: "2.77ms", note: "p95" },
  { metric: "Complex multi-aggregation", detail: "1M rows", value: "55ms", note: "p95" },
  { metric: "DuckDB vs Pandas speedup", detail: "at 1M rows", value: "3.34×", note: "faster" },
  { metric: "Routing crossover point", detail: "", value: "~100K rows", note: "automatic" },
  { metric: "Cache cold → warm", detail: "", value: "27ms → <1ms", note: "same query" },
  { metric: "Time to first chart (SSE)", detail: "slot 1", value: "55ms", note: "" },
  { metric: "All 5 dashboard slots complete", detail: "", value: "67ms", note: "total" },
  { metric: "100MB CSV ingestion", detail: "2.3s total", value: "610K/sec", note: "rows/sec" },
];

export default function PerformanceTable() {
  return (
    <section id="benchmarks" className="bg-[#FAFAF9] py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="text-[11px] font-mono text-[#9CA3AF] uppercase tracking-widest block mb-3">Benchmarks</span>
          <h2
            className="text-[40px] sm:text-[52px] font-serif tracking-tight text-[#0A0A0A] leading-[1.1] mb-3"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Every number is reproducible.
          </h2>
          <p className="text-[14px] text-[#6B7280] font-mono">
            Run <span className="text-[#0A0A0A] font-semibold">python backend/benchmarks/run_benchmarks.py</span> to verify.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden shadow-sm"
        >
          {/* Table header */}
          <div className="grid grid-cols-12 bg-[#FAFAF9] border-b border-black/[0.06] px-6 py-3">
            <div className="col-span-7 text-[10.5px] font-semibold text-[#9CA3AF] uppercase tracking-wider">Metric</div>
            <div className="col-span-2 text-[10.5px] font-semibold text-[#9CA3AF] uppercase tracking-wider text-right">Value</div>
            <div className="col-span-3 text-[10.5px] font-semibold text-[#9CA3AF] uppercase tracking-wider text-right">Note</div>
          </div>

          {ROWS.map((row, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="grid grid-cols-12 items-center px-6 py-3.5 border-b last:border-0 border-black/[0.05] hover:bg-[#FAFAF9] transition-colors group"
            >
              <div className="col-span-7 flex items-center gap-3">
                <div
                  className="w-0.5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "#0EA5E9" }}
                />
                <div>
                  <span className="text-[13.5px] font-medium text-[#0A0A0A]">{row.metric}</span>
                  {row.detail && (
                    <span className="text-[12px] text-[#9CA3AF] ml-2">{row.detail}</span>
                  )}
                </div>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-[14px] font-semibold text-[#0A0A0A] font-mono tabular-nums">{row.value}</span>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-[11.5px] text-[#9CA3AF] font-mono">{row.note}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
