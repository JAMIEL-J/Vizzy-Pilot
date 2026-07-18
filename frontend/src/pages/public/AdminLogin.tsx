import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { authApi } from "../../lib/api/auth";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, ShieldCheck, Lock, Mail, AlertCircle, 
  ArrowRight, Sparkles, Terminal, Activity, Server, Cpu,
  Eye, EyeOff
} from "lucide-react";
import { VizzyPilotFullLogo, VizzyPilotVerticalLogo } from "../../components/layout/VizzyLogo";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoginSuccess, setIsLoginSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await authApi.loginAdmin({ email, password });
      // Tokens are set as HttpOnly cookies by the backend
      setIsLoginSuccess(true);
      setTimeout(() => {
        navigate("/admin");
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed. Please try again.");
      setIsLoading(false);
    }
  };

  if (isLoginSuccess) {
    return (
      <div className="min-h-screen bg-[#F5F2EB] flex flex-col items-center justify-center relative overflow-hidden select-none">
        <style>{`
          @keyframes loadingBar {
            0% { left: -40%; width: 40%; }
            50% { left: 30%; width: 50%; }
            100% { left: 100%; width: 30%; }
          }
        `}</style>
        {/* Ambient background patterns */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#E4DED4]/40 to-transparent pointer-events-none" />
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-500/[0.04] blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-indigo-500/[0.04] blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center space-y-8">
          <VizzyPilotVerticalLogo size={160} />
          
          <div className="flex flex-col items-center space-y-3 w-64">
            <div className="h-1 w-full bg-[#E4DED4] rounded-full overflow-hidden relative shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-[#1D70B8] to-[#02C39A] rounded-full absolute left-0 top-0" 
                style={{ animation: 'loadingBar 1.5s ease-in-out infinite' }} 
              />
            </div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-[#7C725D] uppercase animate-pulse">
              Synchronizing system console...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="auth-root" className="min-h-screen bg-[#F5F2EB] flex flex-col justify-between relative overflow-hidden select-none py-12 px-4 sm:px-6 lg:px-8">
      {/* Dynamic ambient grid patterns inside login page */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#E4DED4]/30 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-500/[0.03] blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-indigo-500/[0.03] blur-[100px] pointer-events-none" />

      {/* Header Bar */}
      <div className="max-w-7xl w-full mx-auto flex justify-between items-center relative z-10 mb-8">
        <Link
          to="/login"
          className="group flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#7C725D] hover:text-[#1F1C18] transition-colors bg-white/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/60 shadow-sm cursor-pointer text-decoration-none"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Return to Client Portal</span>
        </Link>

        <div className="flex items-center space-x-2.5">
          <div className="h-5 w-5 rounded-sm bg-[#1F1C18] flex items-center justify-center text-white">
            <span className="font-sans text-[11px] font-bold">V</span>
          </div>
          <span className="font-sans text-sm font-bold tracking-tight text-[#1F1C18]">
            Vizzy Pilot
          </span>
        </div>
      </div>

      {/* Main split viewport layout */}
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center flex-1 relative z-10 my-auto">
        
        {/* Left Side: Brand presentation / Editorial */}
        <div className="lg:col-span-6 text-left space-y-6 lg:pr-8">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 bg-white/70 backdrop-blur-md border border-[#E4DED4] rounded-full text-[10px] font-mono font-bold uppercase tracking-widest text-[#7C725D]">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-550 animate-pulse" />
            <span>Operator Access Protocol</span>
          </div>

          <h2 className="font-sans text-[40px] sm:text-[48px] font-medium tracking-tight leading-tight text-gray-950 font-display">
            System Operator Control Station.
          </h2>

          <p className="font-sans text-sm sm:text-base text-[#7C725D] leading-relaxed max-w-md">
            Access telemetry dials, real-time pipeline parameters, and administrative safety rules to coordinate the global cluster state.
          </p>

          {/* Integrated visual system stats list */}
          <div className="space-y-3.5 pt-4">
            <div className="flex items-center space-x-3 text-xs font-mono">
              <div className="h-8 w-8 rounded-lg bg-white/60 border border-white flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <span className="text-gray-400 block tracking-tight">ENCRYPTION PROTOCOL:</span>
                <span className="text-gray-950 font-semibold uppercase">AES-256 STATE BOUND</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 text-xs font-mono">
              <div className="h-8 w-8 rounded-lg bg-white/60 border border-white flex items-center justify-center text-indigo-650 shadow-sm shrink-0">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <span className="text-gray-400 block tracking-tight">SECURITY LEVEL:</span>
                <span className="text-gray-950 font-semibold uppercase">OPERATOR LEVEL 1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication container card */}
        <div className="lg:col-span-6 relative">
          <motion.div
            layout
            className="w-full bg-white/80 backdrop-blur-xl border border-white rounded-3xl p-6 sm:p-8 shadow-[0_25px_60px_rgba(31,28,24,0.08)] text-left"
          >
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Auth mode selection title */}
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-sans text-[22px] font-bold text-gray-900">
                      Operator Sign In
                    </h3>
                    
                    {/* Mode Indicator badge */}
                    <span className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-blue-100 bg-blue-50 text-blue-700 uppercase">
                      SYSTEM ADMIN
                    </span>
                  </div>
                  <p className="font-sans text-xs text-[#7C725D]">
                    Authorize via developer operator terminal protocols.
                  </p>
                </div>

                {/* Errors / Warnings */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl flex items-start gap-2.5 text-xs font-sans"
                  >
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <strong className="font-semibold block">Authorization Failure</strong>
                      <span>{error}</span>
                    </div>
                  </motion.div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                      Admin Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-[#7C725D] opacity-60" />
                      <input
                        type="email"
                        placeholder="admin@vizzy.pilot"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#FCFAF5] border border-[#E4DED4] rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                        Admin Secret Passcode
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>{showPassword ? "Hide" : "Show"}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-[#7C725D] opacity-60" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#FCFAF5] border border-[#E4DED4] rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all focus:outline-none cursor-pointer mt-4 ${
                      isLoading ? "bg-[#7C725D] cursor-not-allowed" : "bg-blue-900 hover:bg-blue-950 ring-1 ring-blue-500/10"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        <span>Verifying Security Access...</span>
                      </>
                    ) : (
                      <>
                        <span>VERIFY ADMIN RIGHTS</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </motion.button>
                </form>

                {/* Footer system status note */}
                <div className="pt-4 border-t border-dashed border-gray-150 text-center font-sans text-[10px] text-[#7C725D] flex items-center justify-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span>This is a secure admin area. All actions are logged.</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>

      </div>

      {/* Footer copyright section aligning with design system of main page */}
      <div className="max-w-7xl w-full mx-auto relative z-10 pt-8 border-t border-[#E4DED4] flex flex-col sm:flex-row items-center justify-between text-xs text-[#7C725D] space-y-3 sm:space-y-0">
        <span>© 2026 Vizzy Pilot. Structured Telemetry Console. All rights reserved.</span>
        <div className="flex space-x-4">
          <a href="#" className="hover:text-black transition-colors">SLA Policy</a>
          <span>•</span>
          <a href="#" className="hover:text-black transition-colors">Security Nodes</a>
        </div>
      </div>

    </div>
  );
}
