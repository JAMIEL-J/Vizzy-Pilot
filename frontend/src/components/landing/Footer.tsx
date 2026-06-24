import { motion } from "framer-motion";

export default function Footer() {
  return (
    <footer id="vizzy-footer" className="relative w-full bg-[#F5F2EB] text-[#1F1C18] pt-24 pb-12 overflow-hidden select-none border-t border-[#E4DED4]">
      <div className="mx-auto max-w-7xl px-8 sm:px-12">
        {/* Top section: Title and link grids with Antigravity copy */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-12 mb-16 text-left">
          {/* Left Side: Antigravity-themed Editorial Title */}
          <div className="max-w-md">
            <h3 className="font-sans text-[36px] sm:text-[44px] font-medium tracking-tight leading-tight text-[#1F1C18]">
              Experience liftoff.<br />Zero-gravity state management.
            </h3>
            <p className="mt-4 text-[#7C725D] text-sm leading-relaxed font-serif text-[16px] max-w-sm">
              Unshackle complex metrics from traditional infrastructure bounds. Fully tracked, audited, and powered by the Antigravity architecture.
            </p>
          </div>

          {/* Right Side: Double Column Link Grid */}
          <div className="flex gap-20 sm:gap-32 text-left">
            {/* Column 1: System Control */}
            <div className="flex flex-col space-y-3.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#7C725D] font-bold">
                Antigravity Console
              </span>
              {[
                { label: "Launch Console", href: "#hero-trigger" },
                { label: "Intelligence Control", href: "#intelligence" },
                { label: "Version Lineage", href: "#version-history" },
                { label: "Performance Terminal", href: "#performance" }
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="font-sans text-[14px] font-medium text-gray-700 hover:text-black transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Column 2: Documentation & Flight Protocols */}
            <div className="flex flex-col space-y-3.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#7C725D] font-bold">
                Flight Protocols
              </span>
              {[
                { label: "Workspace Engine", href: "#product-canvas" },
                { label: "Gravity Shield SLA", href: "#" },
                { label: "Flight Logs & Status", href: "#" },
                { label: "Terms of Flight", href: "#" }
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="font-sans text-[14px] font-medium text-gray-700 hover:text-black transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar separator */}
        <div className="pt-8 border-t border-[#E4DED4] flex flex-col sm:flex-row items-center justify-between gap-6 mb-12">
          {/* Brand/Vizzy Pilot Logo & Copyright */}
          <div className="flex flex-col items-center sm:items-start space-y-1 text-center sm:text-left">
            <span className="font-sans font-bold text-[22px] tracking-tight text-[#1F1C18]">
              Vizzy Pilot
            </span>
            <span className="text-[12px] text-[#7C725D] font-mono">
              © 2026 Vizzy Pilot. Powered by Antigravity. All liftoff metrics encrypted.
            </span>
          </div>

          {/* Legal and information links */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 justify-center sm:justify-end text-[14px] text-[#7C725D] font-sans">
            {[
              { label: "About Vizzy Pilot", href: "#" },
              { label: "Systems SLA", href: "#" },
              { label: "Privacy Policy", href: "#" },
              { label: "Terms of Service", href: "#" }
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="hover:text-black transition-colors font-medium text-[13px]"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Adjusted Position: Massive Vizzy Pilot wordmark at the absolute bottom */}
        <div className="w-full text-center pt-8 pb-4">
          <motion.h1 
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="font-sans font-semibold text-[15vw] sm:text-[11vw] tracking-tighter leading-none text-[#1F1C18] select-none"
            style={{ letterSpacing: "-0.04em" }}
          >
            Vizzy Pilot
          </motion.h1>
        </div>

      </div>
    </footer>
  );
}
