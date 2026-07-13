import { useRef, useEffect } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";

// Static mock data for the floating dashboard card
const MOCK_KPIS = [
  { label: "Revenue", value: "$2.1M", trend: "+12%", up: true },
  { label: "Orders", value: "8,432", trend: "+8%", up: true },
  { label: "Avg Order", value: "$249", trend: "+3%", up: true },
  { label: "Churn", value: "3.2%", trend: "-0.4%", up: false },
  { label: "Growth", value: "+12%", trend: "QoQ", up: true },
];

const MOCK_BARS = [
  { label: "West", pct: 85, val: "$612K" },
  { label: "East", pct: 72, val: "$521K" },
  { label: "Central", pct: 58, val: "$419K" },
  { label: "South", pct: 44, val: "$318K" },
];

const MOCK_DONUT = [
  { label: "Consumer", pct: 52, color: "#7D9BBA" },
  { label: "Corporate", pct: 30, color: "#6EA694" },
  { label: "Home Office", pct: 18, color: "#DF8B70" },
];

function DashboardMockup() {
  return (
    <div className="w-full rounded-2xl overflow-hidden border border-black/[0.08] bg-white shadow-2xl">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] bg-white">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-[#0A0A0A] flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">V</span>
          </div>
          <span className="text-[12px] font-semibold text-[#0A0A0A]">Dashboard</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F4] text-[#6B7280] border border-black/[0.06]">Superstore · Cleaned v2</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#10B981]" />
          <span className="text-[10px] text-[#6B7280]">Live</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 border-b border-black/[0.06]">
        {MOCK_KPIS.map((kpi) => (
          <div key={kpi.label} className="px-3 py-2.5 border-r last:border-r-0 border-black/[0.06]">
            <div className="text-[9px] text-[#9CA3AF] uppercase tracking-wide font-medium">{kpi.label}</div>
            <div className="text-[15px] font-semibold text-[#0A0A0A] mt-0.5 tabular-nums">{kpi.value}</div>
            <div className={`text-[9px] mt-0.5 font-medium ${kpi.up ? "text-[#10B981]" : "text-[#F97316]"}`}>{kpi.trend}</div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-3 gap-0 p-4 gap-3">
        {/* Bar chart */}
        <div className="col-span-2 rounded-xl border border-black/[0.06] p-3 bg-white">
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Revenue by Region</div>
          <div className="space-y-2">
            {MOCK_BARS.map((bar) => (
              <div key={bar.label} className="flex items-center gap-2">
                <span className="text-[9px] text-[#9CA3AF] w-12 shrink-0">{bar.label}</span>
                <div className="flex-1 h-2.5 bg-[#F5F5F4] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7D9BBA]"
                    style={{ width: `${bar.pct}%` }}
                  />
                </div>
                <span className="text-[9px] font-semibold text-[#0A0A0A] w-10 text-right tabular-nums">{bar.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut chart */}
        <div className="rounded-xl border border-black/[0.06] p-3 bg-white">
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Segment Mix</div>
          {/* Simple visual donut placeholder */}
          <div className="flex justify-center mb-3">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="20" fill="none" stroke="#7D9BBA" strokeWidth="12" strokeDasharray="65 35" strokeDashoffset="0" />
              <circle cx="30" cy="30" r="20" fill="none" stroke="#6EA694" strokeWidth="12" strokeDasharray="38 62" strokeDashoffset="-65" />
              <circle cx="30" cy="30" r="20" fill="none" stroke="#DF8B70" strokeWidth="12" strokeDasharray="22 78" strokeDashoffset="-103" />
            </svg>
          </div>
          <div className="space-y-1">
            {MOCK_DONUT.map((seg) => (
              <div key={seg.label} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-[9px] text-[#6B7280] flex-1">{seg.label}</span>
                <span className="text-[9px] font-semibold text-[#0A0A0A]">{seg.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mini trend line placeholder */}
        <div className="col-span-3 rounded-xl border border-black/[0.06] p-3 bg-white">
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Monthly Revenue Trend</div>
          <svg viewBox="0 0 300 40" className="w-full h-8">
            <polyline
              points="0,35 40,28 80,20 120,24 160,12 200,8 240,14 300,5"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <polyline
              points="0,35 40,28 80,20 120,24 160,12 200,8 240,14 300,5"
              fill="url(#trendGrad)"
              stroke="none"
              opacity="0.15"
            />
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0EA5E9" />
                <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Sticky status bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-black/[0.06] bg-[#FAFAF9]">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
          <span className="text-[9px] text-[#6B7280]">Schema valid · 14 columns typed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[#0EA5E9] font-medium">Generate Insight</span>
        </div>
      </div>
    </div>
  );
}

export default function HeroSection({ onLaunch }: { onLaunch?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [4, -4]), { stiffness: 80, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-5, 5]), { stiffness: 80, damping: 20 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left - rect.width / 2);
      mouseY.set(e.clientY - rect.top - rect.height / 2);
    };
    const onLeave = () => { mouseX.set(0); mouseY.set(0); };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, [mouseX, mouseY]);

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  } as const;
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
  } as const;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden bg-[#FAFAF9]">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto"
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="mb-6">
          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[#6B7280] bg-white border border-black/[0.08] rounded-full px-3.5 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            Natural language to verified SQL · Open source
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className="font-serif text-[56px] sm:text-[72px] leading-[1.05] tracking-tight text-[#0A0A0A] mb-6"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Ask your data anything.
          <br />
          <span className="italic">Get a verified chart.</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={itemVariants}
          className="text-[17px] text-[#6B7280] leading-relaxed max-w-xl mb-8"
        >
          Vizzy Pilot translates natural language to validated SQL, executes it on a dual-engine
          pipeline, and version-logs every transformation — so every chart is explainable.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3 justify-center mb-8">
          <motion.button
            whileHover={{ y: -1, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
            whileTap={{ scale: 0.97 }}
            onClick={onLaunch}
            className="flex items-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3 text-[14px] font-semibold text-white cursor-pointer border-none transition-all"
          >
            Initialize Free Instance
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7l7 7-7 7" />
            </svg>
          </motion.button>
          <a
            href="#benchmarks"
            className="text-[14px] font-medium text-[#6B7280] hover:text-[#0A0A0A] transition-colors underline underline-offset-4 decoration-black/20"
          >
            View Benchmarks
          </a>
        </motion.div>

        {/* Stat strip */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-12">
          {["Under 55ms", "1M rows", "Immutable audit trail", "Open source · MIT"].map((s, i) => (
            <span key={i} className="text-[11.5px] font-mono text-[#9CA3AF]">
              {i > 0 && <span className="mr-4 text-[#D1D5DB]">·</span>}
              {s}
            </span>
          ))}
        </motion.div>

        {/* Dashboard mockup with 3D tilt */}
        <motion.div
          ref={containerRef}
          variants={itemVariants}
          style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1200 }}
          className="w-full max-w-4xl"
        >
          <motion.div
            style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)" }}
            className="rounded-2xl overflow-hidden"
          >
            <DashboardMockup />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
