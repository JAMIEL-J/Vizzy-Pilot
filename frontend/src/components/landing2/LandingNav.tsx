import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";

interface LandingNavProps {
  onSignIn?: () => void;
  onLaunch?: () => void;
}

import { VizzyPilotFullLogo } from "../layout/VizzyLogo";

const NAV_LINKS = [
  { label: "Product", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Applications", href: "#applications" },
  { label: "Benchmarks", href: "#benchmarks" },
];

export default function LandingNav({ onSignIn, onLaunch }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-black/[0.06] shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <a href="#" className="flex items-center group">
          <div className="transition-transform group-hover:scale-105">
            <VizzyPilotFullLogo size={22} />
          </div>
        </a>

        {/* Desktop Links */}
        <nav className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[13.5px] text-[#6B7280] hover:text-[#0A0A0A] transition-colors duration-200 font-medium"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onSignIn}
            className="text-[13.5px] text-[#6B7280] hover:text-[#0A0A0A] transition-colors font-medium cursor-pointer bg-transparent border-none"
          >
            Sign In
          </button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onLaunch}
            className="flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2 text-[13px] font-semibold text-white cursor-pointer border-none hover:bg-[#1a1a1a] transition-colors"
          >
            Get Started
            <ArrowUpRight className="h-3.5 w-3.5 opacity-80" />
          </motion.button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/80 cursor-pointer"
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-white border-t border-black/[0.06]"
          >
            <div className="px-6 py-5 space-y-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block text-[14px] text-[#6B7280] hover:text-[#0A0A0A] font-medium transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-3 border-t border-black/[0.06] flex flex-col gap-3">
                <button onClick={onSignIn} className="text-left text-[13.5px] text-[#6B7280] font-medium bg-transparent border-none cursor-pointer">
                  Sign In
                </button>
                <button
                  onClick={onLaunch}
                  className="flex items-center gap-1.5 rounded-full bg-[#0A0A0A] px-4 py-2.5 text-[13px] font-semibold text-white w-fit cursor-pointer border-none"
                >
                  Get Started <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
