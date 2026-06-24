import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/landing/Navbar";
import DashboardHero from "../../components/landing/DashboardHero";
import QueryPipeline from "../../components/landing/QueryPipeline";
import HorizontalStorytelling from "../../components/landing/HorizontalStorytelling";
import InteractiveCanvas from "../../components/landing/InteractiveCanvas";
import DataLineage from "../../components/landing/DataLineage";
import CTASection from "../../components/landing/CTASection";
import Footer from "../../components/landing/Footer";

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    const root = window.document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    root.style.setProperty('color-scheme', 'light');
    return () => {
      if (wasDark) {
        root.classList.add('dark');
        root.style.setProperty('color-scheme', 'dark');
      }
    };
  }, []);

  const handleSignIn = () => {
    navigate("/login");
  };

  const handleLaunch = () => {
    navigate("/register");
  };

  return (
    <div className="relative min-h-screen w-full bg-[#F5F2EB] text-[#1F1C18] font-sans">
      {/* Premium Watermark Grids & Texture base across entire application */}
      <div className="fixed inset-0 pointer-events-none noise-overlay z-40 opacity-70" />
      
      {/* Decorative ambient lighting backdrops */}
      <div className="fixed top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-emerald-500/[0.015] blur-[150px] pointer-events-none z-10" />
      <div className="fixed bottom-[-20%] right-[-10%] h-[700px] w-[700px] rounded-full bg-indigo-500/[0.015] blur-[150px] pointer-events-none z-10" />

      {/* Luxury fixed header */}
      <Navbar 
        onSignIn={handleSignIn} 
        onLaunch={handleLaunch} 
      />

      {/* Main timeline of sections without obvious boundaries */}
      <main className="relative z-20">
        
        {/* Section 00: Custom Floating 3D Exploding Hero */}
        <DashboardHero />
        
        {/* Section 01: Natural Language Intelligence (Question & Insight) */}
        <QueryPipeline />

        {/* Section 02 & 03: Horizontal Schema Lineage & Kinetic Performance Storytelling Journey */}
        <HorizontalStorytelling />

        {/* Section 04: Immersive Simulated Application Workspace */}
        <InteractiveCanvas />

        {/* Section 05: Scroll-linked connection Lineage graph */}
        <DataLineage />

        {/* Section 06: Final CTA */}
        <CTASection onLaunch={handleLaunch} />

        {/* Section 07: Footer */}
        <Footer />

      </main>
    </div>
  );
}

