import { motion } from "framer-motion";
import { ArrowUpRight, Database, GitBranch, Terminal, LineChart, Sparkles } from "lucide-react";

interface CTASectionProps {
  onLaunch?: () => void;
}

export default function CTASection({ onLaunch }: CTASectionProps) {
  return (
    <section className="relative w-full py-36 bg-[#F5F2EB] border-t border-[#E4DED4] overflow-hidden flex flex-col items-center justify-center">
      
      {/* Decorative Radial Background */}
      <div className="absolute inset-0 bg-transparent pointer-events-none" />
      
      {/* 1. VISUAL MERGING LAB: All elements converging on the center */}
      <div className="relative w-full max-w-lg h-56 flex items-center justify-center mb-16">
        
        {/* Core Central Ring */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
          className="absolute h-24 w-24 rounded-full border border-dashed border-[#1F1C18]/25 flex items-center justify-center"
        >
          <div className="h-16 w-16 rounded-full border border-emerald-500/30 bg-emerald-500/5 animate-pulse" />
        </motion.div>
 
         {/* Central Brand Shield core */}
         <motion.div 
           animate={{ scale: [0.97, 1.03, 0.97] }}
           transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
           className="absolute h-10 w-10 rounded-sm bg-[#1F1C18] text-white flex items-center justify-center shadow-lg"
         >
           <span className="font-sans text-sm font-black tracking-tight select-none">V</span>
         </motion.div>
 
         {/* Floating Converging Node 1: DB */}
         <motion.div 
           animate={{ 
             x: [60, 42, 60],
             y: [-60, -42, -60],
             rotate: [0, 10, 0]
           }}
           transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
           className="absolute flex items-center space-x-1.5 rounded-sm border border-[#E4DED4] bg-[#FCFAF5] px-3 py-1 text-[10px] font-mono shadow-sm text-[#7C725D]"
         >
           <Database className="h-3.5 w-3.5 text-emerald-500" />
           <span>DATA</span>
         </motion.div>
 
         {/* Floating Converging Node 2: Version Git */}
         <motion.div 
           animate={{ 
             x: [-90, -74, -90],
             y: [-30, -20, -30],
             rotate: [0, -10, 0]
           }}
           transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
           className="absolute flex items-center space-x-1.5 rounded-sm border border-[#E4DED4] bg-[#FCFAF5] px-3 py-1 text-[10px] font-mono shadow-sm text-[#7C725D]"
         >
           <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
           <span>VERSIONS</span>
         </motion.div>
 
         {/* Floating Converging Node 3: Transpile SQL */}
         <motion.div 
           animate={{ 
             x: [-40, -25, -40],
             y: [80, 64, 80],
             rotate: [0, 5, 0]
           }}
           transition={{ repeat: Infinity, duration: 6.5, ease: "easeInOut" }}
           className="absolute flex items-center space-x-1.5 rounded-sm border border-[#E4DED4] bg-[#FCFAF5] px-3 py-1 text-[10px] font-mono shadow-sm text-[#7C725D]"
         >
           <Terminal className="h-3.5 w-3.5 text-sky-500" />
           <span>QUERIES</span>
         </motion.div>
 
         {/* Floating Converging Node 4: Insight charts */}
         <motion.div 
           animate={{ 
             x: [80, 65, 80],
             y: [50, 38, 50],
             rotate: [0, -5, 0]
           }}
           transition={{ repeat: Infinity, duration: 9, ease: "easeInOut" }}
           className="absolute flex items-center space-x-1.5 rounded-sm border border-[#E4DED4] bg-[#FCFAF5] px-3 py-1 text-[10px] font-mono shadow-sm text-[#7C725D]"
         >
           <LineChart className="h-3.5 w-3.5 text-amber-500" />
           <span>INSIGHTS</span>
         </motion.div>
 
       </div>
 
       {/* 2. TEXT HEADLINE & SUBHEADLINES */}
       <div className="text-center px-6 max-w-4xl space-y-8 z-15">
         
         <div className="inline-flex items-center space-x-1 bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-3 py-1 rounded-sm text-xs font-mono font-bold uppercase">
           <Sparkles className="h-3 w-3" /> Core System Converged
         </div>

         <h2 className="font-sans text-4xl sm:text-5xl lg:text-7xl font-sans font-semibold tracking-tighter text-[#1F1C18]">
           Analytics You Can <br /> <span className="text-[#7C725D] font-serif font-normal italic">Actually Trust</span>
         </h2>
 
         {/* Editorial staggered subhead lists */}
         <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10 pt-4 pb-4">
           {[
             "Every transformation.",
             "Every version.",
             "Every decision."
           ].map((text, idx) => (
             <div key={idx} className="flex items-center space-x-2">
               <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
               <span className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-[#7C725D] uppercase">
                 {text}
               </span>
             </div>
           ))}
         </div>
 
         <div className="text-center">
           <span className="font-serif text-2xl font-light text-[#1F1C18] tracking-tight block">
             Tracked forever.
           </span>
         </div>
 
         {/* 3. CTA LAUNCH FLUID TRIGGER */}
         <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
           <motion.button
             onClick={(e) => {
               e.preventDefault();
               if (onLaunch) onLaunch();
             }}
             whileHover={{ scale: 1.03 }}
             whileTap={{ scale: 0.98 }}
             className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-full border border-[#1F1C18] bg-[#1F1C18] px-8 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-[#FBF9F6] shadow-2xl transition-all hover:bg-black cursor-pointer"
           >
             <span>Launch Vizzy Pilot</span>
             <ArrowUpRight className="h-4.5 w-4.5" />
           </motion.button>
           
           <motion.button
             onClick={(e) => {
               e.preventDefault();
               if (onLaunch) onLaunch();
             }}
             whileHover={{ scale: 1.02 }}
             whileTap={{ scale: 0.98 }}
             className="w-full sm:w-auto flex items-center justify-center rounded-full border border-[#E4DED4] bg-[#FCFAF5] px-8 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-[#1F1C18] hover:border-[#1F1C18] shadow-sm transition-all cursor-pointer bg-transparent"
           >
             Read Deployed Thesis
           </motion.button>
         </div>
 
         {/* Subtle Bottom Credit Line */}
         <div className="pt-16 text-[10px] font-mono text-[#7C725D] leading-none">
           <span>VIZZY PILOT INC. COPYRIGHT © 2026 // ALL COGNITIVE METRICS ENCRYPTED IMMUTABLY</span>
         </div>
 
       </div>
 
     </section>
  );
}
