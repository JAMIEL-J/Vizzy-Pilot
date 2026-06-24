import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ShieldCheck, Compass, GitCommit, Layers, Menu, X } from "lucide-react";

interface NavbarProps {
  onSignIn?: () => void;
  onLaunch?: () => void;
}

export default function Navbar({ onSignIn, onLaunch }: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-[#E4DED4] bg-[#F5F2EB]/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8">
        {/* Logo */}
        <a href="#" className="group flex items-center space-x-2.5">
          <div className="relative flex h-5 w-5 items-center justify-center rounded-sm bg-[#1F1C18] text-white transition-all group-hover:scale-105">
            <span className="font-sans text-[11px] font-bold leading-none">V</span>
          </div>
          <span className="font-sans text-lg font-bold tracking-tight text-[#1F1C18]">
            Vizzy Pilot
          </span>
        </a>

        {/* Desktop Links (hidden on mobile) */}
        <nav className="hidden space-x-8 md:flex">
          {[
            { label: "Intelligence", href: "#intelligence", icon: Compass },
            { label: "Provenance", href: "#version-history", icon: GitCommit },
            { label: "Performance", href: "#performance", icon: Layers },
            { label: "Engine", href: "#product-canvas", icon: ShieldCheck }
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="group flex items-center space-x-1.5 text-xs font-semibold tracking-wider uppercase text-[#7C725D] transition-colors hover:text-[#1F1C18]"
            >
              <item.icon className="h-3.5 w-3.5 opacity-45 transition-opacity group-hover:opacity-90" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        {/* Actions Button & Mobile Trigger */}
        <div className="flex items-center space-x-4 sm:space-x-6">
          <button
            onClick={(e) => {
              e.preventDefault();
              if (onSignIn) onSignIn();
            }}
            className="hidden text-xs font-semibold uppercase tracking-wider text-[#7C725D] transition-colors hover:text-[#1F1C18] sm:block cursor-pointer bg-transparent border-none outline-none"
          >
            Sign In
          </button>
          
          <motion.button
            onClick={(e) => {
              e.preventDefault();
              if (onLaunch) onLaunch();
            }}
            whileHover={{ scale: 1.02, y: -0.5 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center space-x-1.5 rounded-full bg-[#1F1C18] px-4 py-2 sm:px-5 text-xs font-bold uppercase tracking-widest text-[#FBF9F6] shadow-sm transition-all hover:bg-black hover:shadow-lg cursor-pointer border-none"
          >
            <span>Launch Pilot</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
          </motion.button>

          {/* Hamburger Menu Trigger for Mobile Devices */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex md:hidden h-8 w-8 items-center justify-center rounded-md border border-[#E4DED4] bg-[#FCFAF5] text-[#1F1C18] cursor-pointer transition-colors hover:bg-gray-100"
            aria-label="Toggle navigation menu"
          >
            {isMenuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown Pane */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[#E4DED4] bg-[#F5F2EB] md:hidden overflow-hidden"
          >
            <div className="space-y-4 px-6 py-6">
              {[
                { label: "Intelligence", href: "#intelligence", icon: Compass },
                { label: "Provenance", href: "#version-history", icon: GitCommit },
                { label: "Performance", href: "#performance", icon: Layers },
                { label: "Engine", href: "#product-canvas", icon: ShieldCheck }
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="group flex items-center space-x-3 text-xs font-bold tracking-wider uppercase text-[#7C725D] hover:text-[#1F1C18] py-2 transition-colors"
                >
                  <item.icon className="h-4 w-4 opacity-70 transition-opacity group-hover:opacity-100" />
                  <span>{item.label}</span>
                </a>
              ))}
              <div className="pt-4 border-t border-[#E4DED4]/60 flex flex-col space-y-3">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (onSignIn) onSignIn();
                  }}
                  className="text-left text-xs font-bold uppercase tracking-wider text-[#7C725D] hover:text-[#1F1C18] cursor-pointer bg-transparent border-none py-2"
                >
                  Sign In
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
