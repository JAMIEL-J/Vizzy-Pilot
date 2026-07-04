import React, { useState } from "react";
import { 
  X, Book, Cpu, Terminal, GitBranch
} from "lucide-react";
import { motion } from "framer-motion";
import { VizzyPilotLogoIcon } from './layout/VizzyLogo';

interface DocsModalProps {
  initialTab: "docs" | "api" | "changelog";
  onClose: () => void;
  isDark: boolean;
}

export default function DocsModal({ initialTab, onClose, isDark }: DocsModalProps) {
  const [activeTab, setActiveTab] = useState<"docs" | "api" | "changelog">(initialTab);

  // Sanitized & Secured System Documentation
  const renderDocsContent = () => (
    <div className="space-y-8 animate-fade-in text-left">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-themed-main">Analytics Architecture Overview</h2>
        <p className="text-xs text-muted-custom mt-1 leading-relaxed">
          Vizzy Pilot operates as a high-performance analytical console executing optimizations on abstract data structures.
        </p>
      </div>

      {/* Engine overview without revealing backend directory structure */}
      <div className="bg-surface-2/40 border border-border-custom/55 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent-custom" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-themed-main">Engine Mechanics</h3>
        </div>
        <p className="text-xs text-muted-custom leading-relaxed">
          The processing pipeline utilizes an adaptive routing strategy to parse metric aggregations efficiently:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-mono text-[11px]">
          <div className="bg-surface p-4 rounded-xl border border-border-custom/40">
            <span className="text-accent-custom font-bold block mb-1">LIGHTWEIGHT PIPELINE</span>
            <p className="text-[10px] text-muted-custom leading-normal">
              Utilized for low-latency cache queries. Optimized for low-memory environments and instant dashboard card updates.
            </p>
          </div>
          <div className="bg-surface p-4 rounded-xl border border-border-custom/40">
            <span className="text-teal-400 font-bold block mb-1">VECTORIZED PIPELINE</span>
            <p className="text-[10px] text-muted-custom leading-normal">
              Designed to execute analytical aggregation queries on large-scale matrices. Evaluates data splits dynamically.
            </p>
          </div>
        </div>
      </div>

      {/* Security & Caching Overview */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold tracking-tight text-themed-main">Metadata & Caching Strategies</h3>
        <p className="text-xs text-muted-custom leading-relaxed">
          Subsequent modifications utilize cache lookups to minimize redundant server requests. Cache keys are generated dynamically based on active filter parameters, securing warm responses in under **1ms**.
        </p>
      </div>

      {/* Immutability */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold tracking-tight text-themed-main">Immutable Data Lineage</h3>
        <p className="text-xs text-muted-custom leading-relaxed">
          To maintain data integrity, all mutations operate on immutable lineage tracks. Operations generate sequential modification rules, keeping the original base structure untouched.
        </p>
      </div>
    </div>
  );

  // Sanitized & Secured API Reference (No real keys/params/paths revealed)
  const renderAPIContent = () => (
    <div className="space-y-8 animate-fade-in text-left">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-themed-main">API Reference</h2>
        <p className="text-xs text-muted-custom mt-1 leading-relaxed">
          Standard programmatic interface details for structured telemetry extraction. All endpoints enforce TLS and require active Bearer token authorizations.
        </p>
      </div>

      {/* Auth Docs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono text-[10px] font-bold">POST</span>
          <span className="text-xs font-mono text-themed-main font-semibold">/api/v1/auth/session</span>
        </div>
        <p className="text-xs text-muted-custom">
          Authenticates registered operators and generates session keys.
        </p>
      </div>

      {/* Chat Stream Docs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono text-[10px] font-bold">POST</span>
          <span className="text-xs font-mono text-themed-main font-semibold">/api/v1/query/stream</span>
        </div>
        <p className="text-xs text-muted-custom">
          Streams analytical progress and structured query results over secure connection pathways.
        </p>
      </div>
    </div>
  );

  // Custom JSX for Changelog (Sanitized to not expose filenames/directories)
  const renderChangelogContent = () => (
    <div className="space-y-8 animate-fade-in text-left">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-themed-main">Release Changelog</h2>
        <p className="text-xs text-muted-custom mt-1 leading-relaxed">
          Product release notes, performance upgrades, and design optimizations.
        </p>
      </div>

      <div className="border-l border-dashed border-border-custom/60 pl-6 space-y-8 relative">
        <div className="relative">
          <div className="absolute -left-[30px] top-1.5 w-2 h-2 rounded-full bg-accent-custom" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-accent-custom/10 text-accent-custom">v2.4.0</span>
              <span className="text-[10px] text-muted-custom font-mono">July 3, 2026</span>
            </div>
            <h4 className="text-xs font-semibold text-themed-main">Auth Modals & Font Separation</h4>
            <p className="text-xs text-muted-custom leading-relaxed">
              Implemented custom confirmation overlays inside top navigation headers. Restored Host Grotesk / Inter fallback typefaces across interactive workspaces, isolating Instrument Serif typography strictly to public presentation pages.
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-[30px] top-1.5 w-2 h-2 rounded-full bg-themed-muted" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-surface-3 text-themed-muted">v2.3.0</span>
              <span className="text-[10px] text-muted-custom font-mono">June 24, 2026</span>
            </div>
            <h4 className="text-xs font-semibold text-themed-main">Adaptive Vector Pipeline Routing</h4>
            <p className="text-xs text-muted-custom leading-relaxed">
              Integrated high-performance data processing pipelines to adaptively resolve complex multi-dimensional aggregations and queries depending on dataset size crossover points.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none font-sans text-left">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 12 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-5xl h-[85vh] bg-bg border border-border-custom rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row relative"
      >
        {/* SIDE BAR NAVIGATION */}
        <div className="md:w-3/12 bg-surface-2/60 border-b md:border-b-0 md:border-r border-border-custom/80 p-6 flex flex-col justify-between select-none">
          <div className="space-y-6">
            <div className="flex items-center space-x-2">
              <VizzyPilotLogoIcon size={22} className="shrink-0 text-text-custom" />
              <span className="font-sans font-bold tracking-tight text-text-custom text-xs">Console Telemetry</span>
            </div>

            <nav className="space-y-1">
              {[
                { id: "docs", label: "Documentation", icon: Book },
                { id: "api", label: "API Reference", icon: Terminal },
                { id: "changelog", label: "Release Changelog", icon: GitBranch },
              ].map((item) => {
                const IconComponent = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer border-none ${
                      active 
                        ? "bg-surface-3 text-text-custom font-bold border border-border-custom/40" 
                        : "text-muted-custom hover:text-text-custom bg-transparent"
                    }`}
                  >
                    <IconComponent className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="text-[10px] font-mono text-muted-custom pt-4 border-t border-border-custom/40">
            Vizzy Pilot Core v2.4.0
          </div>
        </div>

        {/* CONTENT VIEWPORT */}
        <div className="flex-1 flex flex-col min-h-0 bg-bg">
          {/* Header Close button row */}
          <header className="px-6 py-4 flex justify-between items-center border-b border-border-custom/40 shrink-0">
            <span className="text-xs font-mono font-bold text-muted-custom uppercase tracking-widest">
              {activeTab === "docs" ? "System Docs" : activeTab === "api" ? "API reference" : "Changelog"}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-2 rounded-full text-muted-custom hover:text-text-custom transition-all cursor-pointer bg-transparent border-none"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Scrolling area */}
          <div className="flex-1 p-6 md:p-8 overflow-y-auto min-h-0">
            {activeTab === "docs" && renderDocsContent()}
            {activeTab === "api" && renderAPIContent()}
            {activeTab === "changelog" && renderChangelogContent()}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
