import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, FlaskConical, MessageSquare, TrendingUp, TrendingDown, Sparkles, CheckCircle2, ArrowRight, CornerDownRight } from "lucide-react";

// ── Dashboard Mockup ──────────────────────────────────────────
function DashboardAppMockup() {
  const kpis = [
    { label: "Revenue", value: "$2.1M", trend: "+12%", up: true },
    { label: "Orders", value: "8,432", trend: "+8%", up: true },
    { label: "Avg Order", value: "$249", trend: "+3%", up: true },
    { label: "Churn", value: "3.2%", trend: "-0.4%", up: false },
    { label: "Growth", value: "+12%", trend: "QoQ", up: true },
  ];
  const bars = [
    { label: "West", pct: 85, val: "$612K" },
    { label: "East", pct: 72, val: "$521K" },
    { label: "Central", pct: 58, val: "$419K" },
    { label: "South", pct: 44, val: "$318K" },
  ];

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.06] bg-white">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-[#0A0A0A] flex items-center justify-center">
            <span className="text-white text-[7px] font-bold">V</span>
          </div>
          <span className="text-[11px] font-semibold">Analytics Dashboard</span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#F5F5F4] text-[#6B7280] border border-black/[0.06]">Superstore · v2 Cleaned</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
          <span className="text-[9px] text-[#6B7280]">Live</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 border-b border-black/[0.06]">
        {kpis.map((k) => (
          <div key={k.label} className="px-2.5 py-2 border-r last:border-r-0 border-black/[0.06]">
            <div className="text-[8px] text-[#9CA3AF] uppercase tracking-wide">{k.label}</div>
            <div className="text-[12px] font-semibold text-[#0A0A0A] tabular-nums">{k.value}</div>
            <div className={`text-[8px] font-medium ${k.up ? "text-[#10B981]" : "text-[#F97316]"}`}>{k.trend}</div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.06] bg-[#FAFAF9]">
        <span className="text-[8.5px] text-[#9CA3AF] font-medium">Filters:</span>
        {["Region", "Segment", "Category", "Contract Type"].map((f) => (
          <span key={f} className="text-[8px] px-2 py-0.5 rounded-full border border-black/[0.08] bg-white text-[#6B7280]">{f}</span>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-3 p-3">
        <div className="col-span-2 rounded-xl border border-black/[0.06] p-2.5">
          <div className="text-[8.5px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Revenue by Region</div>
          <div className="space-y-1.5">
            {bars.map((b) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <span className="text-[7.5px] text-[#9CA3AF] w-9 shrink-0">{b.label}</span>
                <div className="flex-1 h-2 bg-[#F5F5F4] rounded-full">
                  <div className="h-full rounded-full bg-[#7D9BBA]" style={{ width: `${b.pct}%` }} />
                </div>
                <span className="text-[7.5px] font-semibold text-[#0A0A0A] w-8 text-right tabular-nums">{b.val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-black/[0.06] p-2.5">
          <div className="text-[8.5px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Segment Mix</div>
          <svg viewBox="0 0 50 50" className="w-full h-14">
            <circle cx="25" cy="25" r="16" fill="none" stroke="#7D9BBA" strokeWidth="9" strokeDasharray="52 48" strokeDashoffset="0" />
            <circle cx="25" cy="25" r="16" fill="none" stroke="#6EA694" strokeWidth="9" strokeDasharray="30 70" strokeDashoffset="-52" />
            <circle cx="25" cy="25" r="16" fill="none" stroke="#DF8B70" strokeWidth="9" strokeDasharray="18 82" strokeDashoffset="-82" />
          </svg>
          {[["Consumer", "#7D9BBA", "52%"], ["Corporate", "#6EA694", "30%"], ["Home Office", "#DF8B70", "18%"]].map(([l, c, p]) => (
            <div key={l} className="flex items-center gap-1 mt-1">
              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
              <span className="text-[7.5px] text-[#6B7280] flex-1">{l}</span>
              <span className="text-[7.5px] font-semibold text-[#0A0A0A]">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-black/[0.06] bg-[#FAFAF9]">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
          <span className="text-[8px] text-[#6B7280]">Schema valid · 14 columns typed · 3 inferences pending</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-[#6B7280]">Remap values</span>
          <span className="text-[8px] font-medium" style={{ color: "#0EA5E9" }}>
            <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />
            Generate Insight
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Cleaning Studio Mockup ────────────────────────────────────
function CleaningAppMockup() {
  const recs = [
    { col: "Sales", type: "outliers", severity: "HIGH", impact: "12 rows affected", color: "#EF4444" },
    { col: "Profit", type: "missing_values", severity: "MEDIUM", impact: "34 nulls detected", color: "#F97316" },
    { col: "Dataset-wide", type: "duplicates", severity: "LOW", impact: "7 duplicate rows", color: "#6B7280" },
  ];

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.06]">
        <span className="text-[11px] font-semibold">Data Health Studio</span>
        <span className="text-[8px] font-medium px-2 py-1 rounded bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/20">78 / 100 Health Score</span>
      </div>

      {/* Health metrics */}
      <div className="grid grid-cols-3 border-b border-black/[0.06]">
        {[["Completeness", "91.2%", true], ["Validity", "88.5%", true], ["Uniqueness", "94.1%", true]].map(([l, v, ok]) => (
          <div key={l as string} className="px-3 py-2 border-r last:border-r-0 border-black/[0.06]">
            <div className="text-[8px] text-[#9CA3AF] uppercase tracking-wide">{l}</div>
            <div className={`text-[13px] font-semibold tabular-nums ${ok ? "text-[#10B981]" : "text-[#EF4444]"}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-0 border-b border-black/[0.06]" style={{ minHeight: "140px" }}>
        {/* Left: recommendations */}
        <div className="w-[42%] border-r border-black/[0.06] p-2.5 space-y-1.5">
          <div className="text-[8.5px] font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Recommendations Hub · 3 anomalies</div>
          {recs.map((r) => (
            <div key={r.col} className="p-2 rounded-lg border border-[#0EA5E9]/20 bg-[#0EA5E9]/[0.03] cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-semibold font-mono text-[#0A0A0A]">{r.col}</span>
                <span className="text-[7px] px-1.5 py-0.5 rounded-full font-bold" style={{ color: r.color, backgroundColor: `${r.color}10` }}>{r.severity}</span>
              </div>
              <div className="text-[8px] text-[#6B7280] capitalize">{r.type.replace(/_/g, " ")}</div>
              <div className="text-[7.5px] text-[#9CA3AF] mt-0.5">{r.impact}</div>
            </div>
          ))}
        </div>

        {/* Right: live diff tab */}
        <div className="flex-1 p-2.5">
          <div className="flex items-center gap-2 mb-2.5">
            {["Live View Diff", "Impact Metrics", "Execution Chain"].map((t, i) => (
              <span key={t} className={`text-[8px] px-2 py-0.5 rounded font-medium cursor-pointer ${i === 0 ? "bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/20" : "text-[#9CA3AF]"}`}>{t}</span>
            ))}
          </div>
          <div className="rounded-lg border border-black/[0.06] overflow-hidden text-[7.5px] font-mono">
            <div className="grid grid-cols-3 bg-[#FAFAF9] px-2 py-1 border-b border-black/[0.06] text-[#9CA3AF] uppercase text-[7px] tracking-wide">
              <span>Column</span><span>Original</span><span>Fixed</span>
            </div>
            {[
              ["Sales", "9999.00", "249.00"],
              ["Profit", "null", "147.32"],
              ["Sales", "8812.50", "248.50"],
            ].map(([col, orig, fixed], i) => (
              <div key={i} className="grid grid-cols-3 px-2 py-1 border-b border-black/[0.04] last:border-0 hover:bg-[#FAFAF9]">
                <span className="text-[#0A0A0A] font-semibold">{col}</span>
                <span className="text-[#EF4444] line-through opacity-70">{orig}</span>
                <span className="text-[#10B981] font-semibold">{fixed}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Execute CTA */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[8px] text-[#6B7280]">2 of 3 recommendations selected</span>
        <button className="flex items-center gap-1.5 text-[8px] font-semibold text-white bg-[#0A0A0A] rounded-lg px-3 py-1.5">
          Execute Cleaning Plan (2)
        </button>
      </div>
    </div>
  );
}

// ── Chat App Mockup ───────────────────────────────────────────
function ChatAppMockup() {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-[#0A0A0A] flex items-center justify-center">
            <span className="text-white text-[7px] font-bold">V</span>
          </div>
          <span className="text-[11px] font-semibold">Vizzy Pilot</span>
        </div>
        <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#F5F5F4] text-[#6B7280] border border-black/[0.06]">Superstore · v2</span>
      </div>

      <div className="p-3 space-y-3">
        {/* User message */}
        <div className="flex justify-end">
          <div className="bg-[#0A0A0A] text-white rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%]">
            <p className="text-[9.5px] leading-relaxed">What were the top 5 regions by revenue last quarter?</p>
          </div>
        </div>

        {/* AI response with thought log */}
        <div className="flex gap-2">
          <div className="h-5 w-5 rounded-full bg-[#0A0A0A] flex-shrink-0 flex items-center justify-center mt-0.5">
            <span className="text-white text-[7px] font-bold">V</span>
          </div>
          <div className="flex-1 space-y-1.5">
            {/* Thought log */}
            <div className="rounded-xl border border-[#0EA5E9]/15 bg-[#0EA5E9]/[0.03] p-2">
              <div className="text-[7.5px] text-[#0EA5E9] font-medium mb-1.5">Thought process</div>
              {[
                ["Classifying intent...", "100ms"],
                ["Generating SQL...", "320ms"],
                ["Validating with SQLGlot...", "12ms"],
                ["Routing to DuckDB (1.2M rows)...", "55ms"],
              ].map(([step, time], i) => (
                <div key={i} className="flex items-center gap-1.5 mb-0.5">
                  <div className="h-1 w-1 rounded-full bg-[#0EA5E9]" />
                  <span className="text-[7.5px] text-[#6B7280] flex-1">{step}</span>
                  <span className="text-[7px] font-mono text-[#9CA3AF]">{time}</span>
                </div>
              ))}
            </div>

            {/* Answer with mini chart */}
            <div className="rounded-xl border border-black/[0.07] bg-white p-2.5">
              <p className="text-[9px] text-[#6B7280] mb-2">Here are the top 5 regions by revenue last quarter:</p>
              <div className="space-y-1">
                {[["West", 92], ["East", 78], ["Central", 61], ["South", 45], ["Midwest", 31]].map(([r, pct]) => (
                  <div key={r} className="flex items-center gap-1.5">
                    <span className="text-[7.5px] text-[#9CA3AF] w-10">{r}</span>
                    <div className="flex-1 h-1.5 bg-[#F5F5F4] rounded-full">
                      <div className="h-full rounded-full bg-[#0EA5E9]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[7.5px] font-semibold text-[#0A0A0A] font-mono">{pct}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-black/[0.05]">
                <span className="text-[7.5px] text-[#9CA3AF] font-mono cursor-pointer hover:text-[#0EA5E9]">▾ View Generated SQL</span>
              </div>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 py-2 mt-2">
          <span className="text-[9px] text-[#9CA3AF] flex-1">Ask anything about your data...</span>
          <div className="h-5 w-5 rounded-lg bg-[#0A0A0A] flex items-center justify-center">
            <ArrowRight className="h-2.5 w-2.5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Applications Section ─────────────────────────────────
const APPS = [
  {
    id: "dashboard",
    icon: BarChart2,
    label: "Dashboard",
    route: "/user/dashboard",
    title: "Dynamic Analytics Dashboard",
    body: "Upload any dataset. Vizzy Pilot auto-renders domain-specific charts — revenue trends, segment distributions, geo filters — without configuration. Every filter updates charts locally from an in-memory sample, so the database is never re-queried on client-side interactions. The Column Classifier maps semantic roles automatically; you override with one click.",
    mockup: <DashboardAppMockup />,
    accent: "#0EA5E9",
    visualSide: "right",
  },
  {
    id: "cleaning",
    icon: FlaskConical,
    label: "Cleaning Studio",
    route: "/user/cleaning",
    title: "Data Health Studio",
    body: "Run a deep inspection on any uploaded dataset. Vizzy Pilot detects missing values, IQR outliers, and duplicates — then proposes a cleaning plan you approve before execution. A live side-by-side diff previews every cell change before a single row is modified. The cleaned result becomes a new immutable version with full audit lineage.",
    mockup: <CleaningAppMockup />,
    accent: "#10B981",
    visualSide: "left",
  },
  {
    id: "chat",
    icon: MessageSquare,
    label: "Chat",
    route: "/user/chat",
    title: "Conversational Analytics",
    body: "Ask questions in plain language. Vizzy Pilot generates SQL, validates it for safety, routes it to the optimal execution engine, and streams the result back as an inline chart — in under 100ms. Every query is accompanied by a full SQL transparency log. Manual column corrections are remembered and injected as few-shot prompts for future queries.",
    mockup: <ChatAppMockup />,
    accent: "#F97316",
    visualSide: "right",
  },
];

export default function ApplicationsShowcase() {
  const [activeApp, setActiveApp] = useState("dashboard");

  return (
    <section id="applications" className="bg-white py-24 px-6">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <span className="text-[11px] font-mono text-[#9CA3AF] uppercase tracking-widest block mb-3">Applications</span>
          <h2
            className="text-[40px] sm:text-[52px] font-serif tracking-tight text-[#0A0A0A] leading-[1.1] mb-3"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Three purpose-built workspaces.
          </h2>
          <p className="text-[15px] text-[#6B7280] max-w-lg mx-auto">
            Each is a standalone application — not tabs of one view. Navigate independently at dedicated routes.
          </p>
        </motion.div>

        {/* App tab switcher */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {APPS.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <button
                key={app.id}
                onClick={() => setActiveApp(app.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${
                  isActive
                    ? "bg-[#0A0A0A] text-white border-transparent shadow-md"
                    : "bg-white text-[#6B7280] border-black/[0.08] hover:text-[#0A0A0A] hover:border-black/[0.15]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {app.label}
              </button>
            );
          })}
        </div>

        {/* App content */}
        <AnimatePresence mode="wait">
          {APPS.filter((a) => a.id === activeApp).map((app) => {
            const isVisualRight = app.visualSide === "right";
            const Icon = app.icon;
            return (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col lg:flex-row items-center gap-10 ${isVisualRight ? "" : "lg:flex-row-reverse"}`}
              >
                {/* Text side */}
                <div className="flex-1 max-w-md">
                  <div
                    className="inline-flex items-center gap-2 text-[11px] font-medium px-3 py-1.5 rounded-full border mb-4"
                    style={{ color: app.accent, borderColor: `${app.accent}30`, backgroundColor: `${app.accent}08` }}
                  >
                    <Icon className="h-3 w-3" />
                    {app.label}
                    <span className="font-mono opacity-60">{app.route}</span>
                  </div>
                  <h3
                    className="text-[28px] sm:text-[34px] font-serif tracking-tight text-[#0A0A0A] leading-[1.15] mb-4"
                    style={{ fontFamily: "'Instrument Serif', serif" }}
                  >
                    {app.title}
                  </h3>
                  <p className="text-[14.5px] text-[#6B7280] leading-relaxed mb-6">{app.body}</p>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#0A0A0A] underline underline-offset-4 decoration-black/20 hover:decoration-black/60 transition-all"
                  >
                    Explore {app.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>

                {/* Mockup side */}
                <div className="flex-1 w-full max-w-xl">
                  {app.mockup}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
