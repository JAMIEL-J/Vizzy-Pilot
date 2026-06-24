import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { 
  ArrowDown, Database, Cpu, GitBranch, LineChart, ShieldCheck, 
  Terminal as TermIcon, Layers, Server, Activity, Users, Settings, Play, CheckCircle,
  TrendingUp, TrendingDown, Calendar, Sparkles, ArrowUpRight
} from "lucide-react";

export default function DashboardHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  const [activeMetric, setActiveMetric] = useState<"revenue" | "users" | "conversion" | "signups">("revenue");
  const [sliderValues, setSliderValues] = useState({ prodA: 85, prodB: 68, prodC: 44 });
  const [activeSegment, setActiveSegment] = useState<string>("Bome");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Set up mouse move listener for modern spatial parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      // Coordinates from -0.5 to 0.5
      setMousePosition({
        x: (clientX / innerWidth) - 0.5,
        y: (clientY / innerHeight) - 0.5,
      });
    };
    
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // HTML5 Fluid waves failsafe background canvas loops
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    // Let's create beautiful floating light blobs and plexus lines!
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      color: string;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < 35; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 2.5 + 1.2,
        color: i % 3 === 0 ? "rgba(124, 114, 93, 0.35)" : i % 3 === 1 ? "rgba(5, 150, 105, 0.25)" : "rgba(31, 28, 24, 0.18)",
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle background radial gradient glows (cream luxury theme)
      const grad = ctx.createRadialGradient(width * 0.5, height * 0.4, 10, width * 0.5, height * 0.5, Math.max(width, height) * 0.6);
      grad.addColorStop(0, "rgba(252, 250, 245, 0.9)");
      grad.addColorStop(0.5, "rgba(245, 242, 235, 0.75)");
      grad.addColorStop(1, "rgba(235, 230, 220, 0.6)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Draw smooth flowing fluid grid lines (abstract luxury wave)
      ctx.strokeStyle = "rgba(124, 114, 93, 0.06)";
      ctx.lineWidth = 1;
      const count = 16;
      const time = Date.now() * 0.0003;
      for (let i = 0; i < count; i++) {
        ctx.beginPath();
        const factor = i / count;
        for (let x = 0; x < width; x += 15) {
          const y = height * 0.48 + Math.sin(x * 0.005 + time + factor * Math.PI) * 40 * Math.sin(time * 0.4) + (factor - 0.5) * 200;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Draw particle nodes and linkages (plexus style)
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });

      // Draw light connecting webs between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const pi = particles[i];
          const pj = particles[j];
          const dist = Math.hypot(pi.x - pj.x, pi.y - pj.y);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(pi.x, pi.y);
            ctx.lineTo(pj.x, pj.y);
            ctx.strokeStyle = `rgba(124, 114, 93, ${0.1 * (1 - dist / 130)})`;
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Set up scroll-linked explosion transforms
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Smooth out scroll progress for buttery animations
  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 30,
    restDelta: 0.001
  });

  // Base transforms for structural layers
  const textScale = useTransform(smoothScroll, [0, 0.5], [1, 0.95]);
  const textOpacity = useTransform(smoothScroll, [0, 0.4], [1, 0]);
  const textY = useTransform(smoothScroll, [0, 0.5], [0, -50]);

  // Parallax spring mouse values to create continuous soft movement
  const springX = useSpring(mousePosition.x * 40, { stiffness: 100, damping: 20 });
  const springY = useSpring(mousePosition.y * 40, { stiffness: 100, damping: 20 });

  // Explosion values for floating widgets based on scroll progress
  const widget1X = useTransform(smoothScroll, [0, 1], [0, -250]);
  const widget1Y = useTransform(smoothScroll, [0, 1], [0, -120]);
  const widget1Scale = useTransform(smoothScroll, [0, 1], [1, 1.1]);
  const widget1Opacity = useTransform(smoothScroll, [0, 0.8], [0.95, 0]);

  const widget2X = useTransform(smoothScroll, [0, 1], [0, 280]);
  const widget2Y = useTransform(smoothScroll, [0, 1], [0, -200]);
  const widget2Scale = useTransform(smoothScroll, [0, 1], [1, 1.15]);
  const widget2Opacity = useTransform(smoothScroll, [0, 0.8], [0.9, 0]);

  const widget3X = useTransform(smoothScroll, [0, 1], [0, -320]);
  const widget3Y = useTransform(smoothScroll, [0, 1], [0, 200]);
  const widget3Scale = useTransform(smoothScroll, [0, 1], [1, 0.85]);
  const widget3Opacity = useTransform(smoothScroll, [0, 0.7], [0.85, 0]);

  const widget4X = useTransform(smoothScroll, [0, 1], [0, 300]);
  const widget4Y = useTransform(smoothScroll, [0, 1], [0, 180]);
  const widget4Scale = useTransform(smoothScroll, [0, 1], [1, 0.9]);
  const widget4Opacity = useTransform(smoothScroll, [0, 0.7], [0.9, 0]);

  // Centerpiece: Intimate lineage graph that gets revealed as other components fly away
  const centerScale = useTransform(smoothScroll, [0, 0.8], [0.85, 1.05]);
  const centerOpacity = useTransform(smoothScroll, [0, 0.4, 1], [0.3, 0.9, 1]);
  const centerTranslateY = useTransform(smoothScroll, [0, 1], [100, 0]);

  // Scroll-reactive video frame mappings
  const frameWidth = useTransform(smoothScroll, [0, 0.85], ["100%", "92%"]);
  const frameHeight = useTransform(smoothScroll, [0, 0.85], ["100%", "85%"]);
  const frameRadius = useTransform(smoothScroll, [0, 0.85], ["0px", "32px"]);
  const frameShadow = useTransform(
    smoothScroll,
    [0, 0.85],
    ["rgba(31, 28, 24, 0) 0px 0px 0px", "rgba(31, 28, 24, 0.12) 0px 50px 100px -20px, rgba(31, 28, 24, 0.08) 0px 30px 60px -30px"]
  );
  const frameBorder = useTransform(
    smoothScroll,
    [0, 0.85],
    ["1px solid rgba(124, 114, 93, 0)", "1px solid rgba(124, 114, 93, 0.18)"]
  );
  const frameBg = useTransform(
    smoothScroll,
    [0, 0.85],
    ["rgba(245, 242, 235, 1)", "rgba(252, 250, 245, 0.72)"]
  );
  const videoInFrameScale = useTransform(smoothScroll, [0, 0.85], [1.0, 1.15]);

  // Scroll interactive transformations for inner dashboard components
  const dashboardLeftY = useTransform(smoothScroll, [0.35, 0.95], [60, 0]);
  const dashboardLeftSkew = useTransform(smoothScroll, [0.35, 0.95], [-2, 0]);
  const dashboardRightY = useTransform(smoothScroll, [0.35, 0.95], [80, 0]);
  const dashboardRightSkew = useTransform(smoothScroll, [0.35, 0.95], [2, 0]);
  const dashboardBottomY = useTransform(smoothScroll, [0.45, 1.0], [100, 0]);

  return (
    <div id="hero-trigger" ref={containerRef} className="relative h-[180vh] w-full bg-[#F5F2EB]">
      {/* Sticky Content Window */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col items-center justify-center py-20">
        
        {/* Dynamic scroll-reactive video and canvas frame */}
        <motion.div
          style={{
            width: frameWidth,
            height: frameHeight,
            borderRadius: frameRadius,
            boxShadow: frameShadow,
            border: frameBorder,
            backgroundColor: frameBg
          }}
          className="absolute inset-0 m-auto overflow-hidden pointer-events-none z-0 flex items-center justify-center"
        >
          {/* Animated fluid canvas failsafe backdrop */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />

          {/* Loop video background */}
          <motion.video
            style={{ scale: videoInFrameScale }}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-[0.25] mix-blend-multiply"
          >
            <source src="https://assets.mixkit.co/videos/preview/mixkit-white-and-blue-plexus-lines-background-animation-40114-large.mp4" type="video/mp4" />
          </motion.video>

          {/* Dynamic ambient grid pattern overlaid inside the frame */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#F5F2EB]/20 to-[#F5F2EB]" />
        </motion.div>
        
        {/* Editorial Text Backdrop */}
        <motion.div 
          style={{ scale: textScale, opacity: textOpacity, y: textY }}
          className="absolute top-28 z-10 flex flex-col items-center text-center px-6 max-w-4xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          {/* Accent Badge */}
          <div className="inline-flex items-center space-x-1.5 rounded-full bg-[#1F1C18]/5 px-3 py-1 mb-6 border border-[#E4DED4] backdrop-blur-sm">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#1F1C18]/70">
              Introducing Version 2.0
            </span>
          </div>

          {/* Master Headline */}
          <h1 className="text-[52px] sm:text-[80px] lg:text-[110px] leading-[0.9] font-semibold tracking-tighter text-[#1F1C18] mb-8 font-sans">
            Crystallize Your <br /><span className="text-[#7C725D] font-serif font-normal italic">State Provenance</span>
          </h1>

          {/* Elegant Subhead - Robust Instrument Serif font in body */}
          <p className="font-serif text-2xl sm:text-3xl font-normal leading-relaxed text-[#7C725D] max-w-2xl mx-auto mt-4">
            Natural language analytics with intelligent execution and <br className="hidden sm:inline"/>verifiable lineage. Every decision, tracked forever.
          </p>

          {/* Micro-Cue */}
          <motion.div 
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="mt-8 flex items-center space-x-2 text-[10px] font-mono tracking-widest uppercase text-[#7C725D]"
          >
            <ArrowDown className="h-3.5 w-3.5 text-emerald-600" />
            <span>Scroll to disassemble the timeline</span>
          </motion.div>
        </motion.div>

        {/* PREMIUM ENTERPRISE SAAS DASHBOARD INTERFACE */}
        <div className="relative w-full max-w-7xl h-[65vh] flex items-center justify-center top-6 font-sans" style={{ perspective: "1200px" }}>
          
          {/* CENTERPIECE: Real React SaaS Analytics Console */}
          <motion.div
            style={{
              x: useTransform(springX, (v) => v * 0.15),
              y: useTransform(springY, (v) => v * 0.15),
              perspective: "1250px"
            }}
            className="absolute z-10 w-full max-w-5xl h-full flex items-center justify-center pointer-events-none"
          >
            <motion.div 
              style={{ 
                scale: centerScale, 
                opacity: centerOpacity, 
                y: centerTranslateY
              }}
              className="w-full h-full rounded-2xl border border-white/50 bg-[#FCFAF5]/85 backdrop-blur-xl relative shadow-[0_30px_70px_rgba(27,24,21,0.12)] pointer-events-auto overflow-hidden flex flex-col p-5 sm:p-6 justify-between select-none"
            >
              {/* HEADER BAR (Aether style) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4 mb-3">
                <div className="flex items-center space-x-3 text-left">
                  <div className="h-4 w-4 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 animate-pulse shadow-sm shadow-purple-200" />
                  <div className="flex flex-col">
                    <span className="font-sans text-[11px] sm:text-[12px] font-bold text-gray-950 tracking-[0.15em] uppercase leading-none">
                      Aether Analytics Dashboard
                    </span>
                    <span className="font-sans text-[10px] text-gray-400 mt-1 uppercase font-semibold">
                      Nelenne, Ebor | Oct 28, 2023
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="inline-flex items-center text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    LIVE TELEMETRY
                  </span>
                  <span className="text-[10px] font-mono text-gray-400 font-semibold bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                    SLA SECURE
                  </span>
                </div>
              </div>

              {/* TOP METRICS ROW (4 Cards) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { id: "revenue", label: "Total Revenue", value: "$34,589.20", trend: "+12.8%", color: "text-emerald-700 bg-emerald-50 border-emerald-150" },
                  { id: "users", label: "Active Users", value: "1,852", trend: "+2.5%", color: "text-emerald-700 bg-emerald-50 border-emerald-150" },
                  { id: "conversion", label: "Conversion Rate", value: "6.84%", trend: "+1.2%", color: "text-emerald-700 bg-emerald-50 border-emerald-150" },
                  { id: "signups", label: "New Sign-Ups", value: "399", trend: "-1.2%", color: "text-[#C15C3D] bg-orange-50/50 border-orange-100" }
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setActiveMetric(m.id as any)}
                    className={`p-3.5 text-left rounded-xl border transition-all cursor-pointer ${
                      activeMetric === m.id 
                        ? "bg-white border-black/15 shadow-[0_8px_20px_rgba(31,28,24,0.06)] scale-[1.02]" 
                        : "bg-white/45 border-transparent hover:bg-white/60"
                    }`}
                  >
                    <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                      {m.label}
                    </span>
                    <div className="flex items-baseline justify-between gap-1">
                      <strong className="font-sans text-xl sm:text-2xl font-semibold text-gray-950 font-display">
                        {m.value}
                      </strong>
                      <span className={`text-[10px] font-sans font-bold px-1.5 py-0.2 rounded-full border ${m.color}`}>
                        {m.trend}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* CORE METRICS STAGE (Double Column Layout) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-stretch">
                
                {/* Left Panel: Revenue Overview Chart - Scroll Reactive */}
                <motion.div
                  style={{ y: dashboardLeftY, skewX: dashboardLeftSkew }}
                  className="lg:col-span-7 bg-white/75 rounded-2xl border border-white p-4 flex flex-col justify-between text-left relative min-h-[200px] shadow-[0_4px_20px_rgba(31,28,24,0.02)]"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      {activeMetric === "revenue" ? "Revenue Overview Stream" : 
                       activeMetric === "users" ? "Active User Cohorts" :
                       activeMetric === "conversion" ? "Conversion Funnel Trend" : "Daily Sign-Up Distributions"}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400 uppercase font-bold">
                      Real-time updates
                    </span>
                  </div>

                  {/* SVG Chart Coordinates Wrapper */}
                  <div className="relative h-28 flex items-end w-full pt-4">
                    {/* Horizontal Guideline Grids */}
                    <div className="absolute inset-x-0 bottom-0 border-t border-gray-100/70 h-[25%]" />
                    <div className="absolute inset-x-0 bottom-0 border-t border-gray-100/70 h-[50%]" />
                    <div className="absolute inset-x-0 bottom-0 border-t border-gray-100/70 h-[75%]" />

                    <svg className="w-full h-full overflow-visible z-10" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <defs>
                        <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Area Fill */}
                      <path
                        d={
                          activeMetric === "revenue" 
                            ? "M 0 85 C 15 70, 30 75, 45 40 C 60 15, 75 35, 100 10 L 100 100 L 0 100 Z"
                            : activeMetric === "users"
                            ? "M 0 70 C 15 50, 35 60, 50 25 C 65 30, 80 15, 100 20 L 100 100 L 0 100 Z"
                            : activeMetric === "conversion"
                            ? "M 0 60 C 20 60, 40 40, 60 50 C 75 25, 87 20, 100 30 L 100 100 L 0 100 Z"
                            : "M 0 80 C 10 60, 30 90, 50 40 C 70 20, 85 40, 100 15 L 100 100 L 0 100 Z"
                        }
                        fill="url(#chartGlow)"
                      />

                      {/* Line Curve */}
                      <path
                        d={
                          activeMetric === "revenue" 
                            ? "M 0 85 C 15 70, 30 75, 45 40 C 60 15, 75 35, 100 10"
                            : activeMetric === "users"
                            ? "M 0 70 C 15 50, 35 60, 50 25 C 65 30, 80 15, 100 20"
                            : activeMetric === "conversion"
                            ? "M 0 60 C 20 60, 40 40, 60 50 C 75 25, 87 20, 100 30"
                            : "M 0 80 C 10 60, 30 90, 50 40 C 70 20, 85 40, 100 15"
                        }
                        fill="none"
                        stroke="url(#chartLineGrad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="animate-pulse"
                      />

                      <defs>
                        <linearGradient id="chartLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#4f46e5" />
                          <stop offset="50%" stopColor="#a855f7" />
                          <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                      </defs>

                      {/* Moving coordinate points */}
                      <circle cx="45" cy={activeMetric === "revenue" ? "40" : activeMetric === "users" ? "25" : activeMetric === "conversion" ? "50" : "40"} r="3" fill="#ffffff" stroke="#a855f7" strokeWidth="2" className="animate-ping" />
                      <circle cx="45" cy={activeMetric === "revenue" ? "40" : activeMetric === "users" ? "25" : activeMetric === "conversion" ? "50" : "40"} r="2" fill="#a855f7" />
                    </svg>
                  </div>

                  <div className="flex justify-between items-center text-[9px] font-mono text-gray-400 mt-2">
                    <span>JAN 1</span>
                    <span>ACTIVE TRACKING STATE</span>
                    <span>JAN 31</span>
                  </div>
                </motion.div>

                {/* Right Panel: Campaign Performance - Scroll Reactive */}
                <motion.div
                  style={{ y: dashboardRightY, skewX: dashboardRightSkew }}
                  className="lg:col-span-12 xl:col-span-5 bg-white/75 rounded-2xl border border-white p-4 flex flex-col justify-between text-left shadow-[0_4px_20px_rgba(31,28,24,0.02)]"
                >
                  <div>
                    <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-3">
                      Campaign Performance
                    </span>

                    <div className="space-y-3">
                      {[
                        { title: "Email Marketing", val: "78%", grad: "from-amber-400 to-orange-400", styleColor: "bg-amber-400" },
                        { title: "Social Ads", val: "82%", grad: "from-pink-400 to-rose-400", styleColor: "bg-pink-400" },
                        { title: "Content Strategy", val: "88%", grad: "from-cyan-400 to-blue-500", styleColor: "bg-cyan-450" },
                        { title: "SEO optimization", val: "62%", grad: "from-purple-400 to-indigo-500", styleColor: "bg-purple-400" }
                      ].map((item) => (
                        <div key={item.title}>
                          <div className="flex justify-between text-[11px] font-semibold text-gray-950 mb-1">
                            <span>{item.title}</span>
                            <span>{item.val}</span>
                          </div>
                          <div className="h-2 w-full bg-gray-100/60 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: item.val }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className={`h-full rounded-full bg-gradient-to-r ${item.grad} shadow-sm`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

              </div>

              {/* BOTTOM PANEL ROW (User Activity Circle & Top Products Sliders) - Scroll Reactive */}
              <motion.div
                style={{ y: dashboardBottomY }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-left"
              >
                
                {/* User Activity Circle Card */}
                <div className="bg-white/75 rounded-2xl border border-white p-4 flex items-center justify-between shadow-[0_4px_20px_rgba(31,28,24,0.02)]">
                  <div className="flex flex-col">
                    <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                      User Activity segments
                    </span>
                    <div className="space-y-1.5 font-sans mt-1">
                      {[
                        { name: "Bome", share: "42%", color: "#6366f1" },
                        { name: "23J", share: "35%", color: "#ec4899" },
                        { name: "UDFM", share: "23%", color: "#06b6d4" }
                      ].map((seg) => (
                        <button 
                          key={seg.name}
                          onClick={() => setActiveSegment(seg.name)}
                          className={`flex items-center space-x-2 text-[11px] px-2 py-0.5 rounded cursor-pointer transition-all ${activeSegment === seg.name ? "bg-gray-100 font-bold" : "hover:bg-gray-50 text-gray-600"}`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                          <span className="w-10 text-left">{seg.name}</span>
                          <span className="text-gray-400 ml-1">({seg.share})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* High fidelity radial segment */}
                  <div className="relative h-20 w-20 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="40" cy="40" r="30" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                      <circle cx="40" cy="40" r="30" stroke="#6366f1" strokeWidth="6" fill="transparent" strokeDasharray="188.4" strokeDashoffset={188.4 * (1 - 0.42)} strokeLinecap="round" />
                      <circle cx="40" cy="40" r="30" stroke="#ec4899" strokeWidth="6" fill="transparent" strokeDasharray="188.4" strokeDashoffset={188.4 * (1 - 0.77)} strokeLinecap="round" className="opacity-80" />
                    </svg>
                    <div className="absolute font-sans font-bold text-xs text-gray-900">
                      {activeSegment === "Bome" ? "42%" : activeSegment === "23J" ? "35%" : "23%"}
                    </div>
                  </div>
                </div>

                {/* Top Products Slider Card */}
                <div className="bg-white/75 rounded-2xl border border-white p-4 flex flex-col justify-between shadow-[0_4px_20px_rgba(31,28,24,0.02)]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-sans text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Analytics Calibration Handles
                    </span>
                    <span className="text-[9px] font-mono text-emerald-700 font-bold uppercase">
                      ACTIVE SENSORS
                    </span>
                  </div>

                  <div className="space-y-2 mt-2">
                    {[
                      { key: "prodA", label: "Signal amplification scalar", min: 10, max: 100 },
                      { key: "prodB", label: "SLA network core factor", min: 10, max: 100 },
                    ].map((sl) => (
                      <div key={sl.key} className="flex flex-col text-[11px] text-gray-700">
                        <div className="flex justify-between font-semibold text-gray-900 mb-0.5">
                          <span>{sl.label}</span>
                          <span className="font-mono text-[10px]">{(sliderValues as any)[sl.key]}%</span>
                        </div>
                        <input
                          type="range"
                          min={sl.min}
                          max={sl.max}
                          value={(sliderValues as any)[sl.key]}
                          onChange={(e) => setSliderValues({ ...sliderValues, [sl.key]: parseInt(e.target.value) })}
                          className="w-full h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-black"
                        />
                      </div>
                    ))}
                  </div>
                </div>

              </motion.div>

            </motion.div>
          </motion.div>

          {/* FLOATING COMPONENT 1: AI Query Card (Top Left) */}
          <motion.div 
            style={{ 
              x: useTransform(widget1X, (v) => v + mousePosition.x * -70),
              y: useTransform(widget1Y, (v) => v + mousePosition.y * -70),
              scale: widget1Scale,
              opacity: widget1Opacity,
              transformStyle: "preserve-3d",
              rotateX: 15,
              rotateY: -15,
              z: 50
            }}
            whileHover={{ scale: 1.03, y: -5 }}
            className="absolute top-0 left-[-2%] z-20 w-72 rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] p-6 shadow-2xl transition-shadow cursor-pointer transform -rotate-8"
          >
            <div className="flex items-center space-x-2 border-b border-[#E4DED4] pb-3 mb-4">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-[#7C725D]">
                Query Active
              </span>
            </div>
            <p className="font-serif font-medium leading-tight text-sm text-[#1F1C18] mb-4">
              "Show me churn risk by region for customers with &lt; 100 API calls."
            </p>
            <div className="h-[1px] w-full bg-[#E4DED4] mb-3"></div>
            <div className="flex items-center justify-between text-[10px] font-mono text-[#7C725D]">
              <span>IDENTIFYING_NODES...</span>
              <span className="text-emerald-500 font-bold">OK</span>
            </div>
          </motion.div>

          {/* FLOATING COMPONENT 2: Average Execution (Top Right) */}
          <motion.div 
            style={{ 
              x: useTransform(widget2X, (v) => v + mousePosition.x * 60),
              y: useTransform(widget2Y, (v) => v + mousePosition.y * 60),
              scale: widget2Scale,
              opacity: widget2Opacity,
              transformStyle: "preserve-3d",
              rotateX: -15,
              rotateY: 15,
              z: 60
            }}
            whileHover={{ scale: 1.05 }}
            className="absolute top-4 right-[2%] z-20 p-8 rounded-3xl border border-[#E4DED4] bg-[#FCFAF5] shadow-2xl cursor-pointer transform rotate-10"
          >
            <div className="text-5xl font-light tracking-tighter text-[#1F1C18] mb-1 font-sans">
              2.77<span className="text-xl ml-1 opacity-50">ms</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7C725D]">
              Average Execution
            </div>
          </motion.div>

          {/* FLOATING COMPONENT 3: Version Lineage Panel (Bottom Left) */}
          <motion.div 
            style={{ 
              x: useTransform(widget3X, (v) => v + mousePosition.x * -40),
              y: useTransform(widget3Y, (v) => v + mousePosition.y * -40),
              scale: widget3Scale,
              opacity: widget3Opacity,
              transformStyle: "preserve-3d",
              rotateY: -10,
              z: 40
            }}
            whileHover={{ scale: 1.04 }}
            className="absolute bottom-[-5%] left-[4%] z-20 w-72 p-6 rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] shadow-2xl cursor-pointer transform rotate-4"
          >
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#7C725D] block mb-4">Version Lineage</span>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-orange-550 flex items-center justify-center text-[10px] font-bold text-orange-600 bg-orange-50">V1</div>
                <div className="h-[1px] flex-1 bg-orange-100"></div>
                <div className="w-6 h-6 rounded-full bg-orange-550 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">V2</div>
              </div>
              <div className="pl-8 border-l border-dashed border-gray-200 text-left">
                <div className="text-[11px] font-semibold text-[#1F1C18]">Transformation: Log-Normalized</div>
                <div className="text-[10px] text-[#7C725D] font-mono mt-0.5">Execution via Node-X29</div>
              </div>
            </div>
          </motion.div>

          {/* FLOATING COMPONENT 4: Analytics live bar chart (Bottom Right) */}
          <motion.div 
            style={{ 
              x: useTransform(widget4X, (v) => v + mousePosition.x * 50),
              y: useTransform(widget4Y, (v) => v + mousePosition.y * 50),
              scale: widget4Scale,
              opacity: widget4Opacity,
              transformStyle: "preserve-3d",
              rotateX: 10,
              z: 45
            }}
            whileHover={{ scale: 1.03 }}
            className="absolute bottom-[-10%] right-[4%] z-20 w-80 p-6 rounded-2xl border border-[#D4C9BD] bg-[#FCFAF5] shadow-2xl cursor-pointer transform -rotate-5"
          >
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] uppercase tracking-widest font-bold text-[#7C725D]">Analytics Live</span>
              <div className="w-3 h-3 rounded-full bg-[#1F1C18] animate-pulse"></div>
            </div>
            
            <div className="flex items-end gap-1.5 h-24">
              <div className="flex-1 bg-gray-100 rounded-sm h-[40%] transition-all duration-300"></div>
              <div className="flex-1 bg-gray-100 rounded-sm h-[60%] transition-all duration-300"></div>
              <div className="flex-1 bg-gray-100 rounded-sm h-[55%] transition-all duration-300"></div>
              <div className="flex-1 bg-[#1F1C18] rounded-sm h-[90%] transition-all duration-300"></div>
              <div className="flex-1 bg-[#1F1C18] rounded-sm h-[100%] transition-all duration-300"></div>
              <div className="flex-1 bg-gray-200 rounded-sm h-[80%] transition-all duration-300"></div>
              <div className="flex-1 bg-gray-100 rounded-sm h-[45%] transition-all duration-300"></div>
            </div>
          </motion.div>

          {/* FLOATING COMPONENT 5: SLA Retention Calibration (Center Upper Right) */}
          <motion.div 
            style={{ 
              x: useTransform(smoothScroll, [0, 1], [0, 420]),
              y: useTransform(smoothScroll, [0, 1], [0, -30]),
              scale: useTransform(smoothScroll, [0, 1], [1, 0.75]),
              opacity: useTransform(smoothScroll, [0, 0.75], [0.95, 0]),
              transformStyle: "preserve-3d",
              rotateY: 20,
              rotateX: 10,
              z: 80
            }}
            whileHover={{ scale: 1.05 }}
            className="absolute top-[-15%] right-[22%] z-30 w-64 p-5 rounded-2xl border border-indigo-500/20 bg-[#FCFAF5] shadow-2xl cursor-default"
          >
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-indigo-500/10 font-mono text-[9px] text-indigo-800 font-bold uppercase tracking-wider">
              <div className="flex items-center space-x-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
                <span>SLA Retention Lock</span>
              </div>
              <span className="text-[8px] bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded font-semibold text-indigo-700">VIZZY GLOBAL</span>
            </div>

            <div className="space-y-2 font-mono text-[9.5px] text-left">
              <div className="flex justify-between text-gray-500 font-bold">
                <span>AUDIT FREQ:</span>
                <span className="text-[#1F1C18]">REAL-TIME</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>RETAINED COHORTS:</span>
                <span className="text-indigo-700 font-bold">98.42% SECURE</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>MAX DEVIATION:</span>
                <span className="text-[#1F1C18]">0.14% DELTA</span>
              </div>
              
              <div className="pt-2 mt-2 border-t border-dashed border-gray-100 flex items-center gap-1 text-[8px] text-gray-400">
                <span className="h-1 w-1 rounded-full bg-indigo-600" />
                <span>ALL COMPILER PIPELINES COMMITTED</span>
              </div>
            </div>
          </motion.div>

        </div>

      </div>
    </div>
  );
}
