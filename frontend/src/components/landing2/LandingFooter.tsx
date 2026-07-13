import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Github, FileText, ArrowUpRight } from "lucide-react";
import { VizzyPilotFullLogo } from "../layout/VizzyLogo";

const FOOTER_LINKS = {
  Product: [
    { label: "Dashboard", href: "#applications" },
    { label: "Cleaning Studio", href: "#applications" },
    { label: "Chat", href: "#applications" },
    { label: "Benchmarks", href: "#benchmarks" },
  ],
  Resources: [
    { label: "GitHub", href: "#" },
    { label: "Documentation", href: "#" },
    { label: "API Docs", href: "#" },
    { label: "Changelog", href: "#" },
  ],
  Legal: [
    { label: "MIT License", href: "#" },
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
  ],
};

const LETTERS = ["V", "I", "Z", "Z", "Y", "\u00A0", "P", "I", "L", "O", "T"];

function FooterWordmark() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex items-end justify-center gap-0 mt-16 mb-6 overflow-hidden">
      {LETTERS.map((letter, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 60 }}
          animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
          transition={{
            delay: i * 0.06,
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="select-none leading-none"
          style={{
            fontSize: "clamp(60px, 16vw, 140px)",
            fontFamily: "'Instrument Serif', serif",
            fontWeight: 400,
            color: "transparent",
            WebkitTextStroke: "1px rgba(0, 0, 0, 0.12)",
            letterSpacing: "-0.03em",
          }}
        >
          {letter}
        </motion.span>
      ))}
    </div>
  );
}

interface FooterProps {
  onLaunch?: () => void;
}

export default function LandingFooter({ onLaunch }: FooterProps) {
  return (
    <footer className="bg-white border-t border-black/[0.06] pt-16 pb-6 px-6">
      <div className="mx-auto max-w-6xl">
        {/* Top 4-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-black/[0.06]">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <VizzyPilotFullLogo size={24} />
            </div>
            <p className="text-[13px] text-[#6B7280] leading-relaxed mb-5 max-w-[200px]">
              Natural language to validated SQL. Open source analytics platform.
            </p>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onLaunch}
              className="flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[12.5px] font-semibold text-white cursor-pointer border-none"
            >
              Get Started
              <ArrowUpRight className="h-3 w-3" />
            </motion.button>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-[11px] font-semibold text-[#0A0A0A] uppercase tracking-wider mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13.5px] text-[#6B7280] hover:text-[#0A0A0A] transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6">
          <p className="text-[12px] text-[#9CA3AF] font-mono">
            © 2026 Vizzy Pilot Inc. · Open source · MIT License
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-[12px] text-[#9CA3AF] hover:text-[#0A0A0A] transition-colors flex items-center gap-1">
              <Github className="h-3.5 w-3.5" />
              GitHub
            </a>
            <a href="#" className="text-[12px] text-[#9CA3AF] hover:text-[#0A0A0A] transition-colors flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Docs
            </a>
          </div>
        </div>

        {/* Massive staggered VIZZY wordmark reveal */}
        <FooterWordmark />
      </div>
    </footer>
  );
}
