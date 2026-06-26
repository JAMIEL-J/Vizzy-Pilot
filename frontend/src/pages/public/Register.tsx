import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { authApi } from "../../lib/api/auth";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, ShieldCheck, Lock, Mail, User, AlertCircle, 
  ArrowRight, Sparkles, Terminal, Activity, Server, Cpu,
  Eye, EyeOff
} from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  
  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName || !lastName || !email) {
      setError("Please complete all personal details.");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!agreeToTerms) {
      setError("You must authorize the SLA system security terms.");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.register({
        name: `${firstName} ${lastName}`.trim(),
        email: email,
        password: password,
      });
      navigate("/login");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = password.length >= 12 ? "strong" : password.length >= 8 ? "medium" : "weak";

  return (
    <div id="auth-root" className="min-h-screen bg-[#F5F2EB] flex flex-col justify-between relative overflow-hidden select-none py-12 px-4 sm:px-6 lg:px-8">
      {/* Dynamic ambient grid patterns inside register page */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#E4DED4]/30 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-500/[0.03] blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-blue-500/[0.03] blur-[100px] pointer-events-none" />

      {/* Header Bar */}
      <div className="max-w-7xl w-full mx-auto flex justify-between items-center relative z-10 mb-8">
        <Link
          to="/"
          className="group flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#7C725D] hover:text-[#1F1C18] transition-colors bg-white/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/60 shadow-sm cursor-pointer text-decoration-none"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <span>Exit to Flight Deck</span>
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
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span>Generate security ID</span>
          </div>

          <h2 className="font-sans text-[40px] sm:text-[48px] font-medium tracking-tight leading-tight text-gray-950 font-display">
            Unlock the power of Intelligence.
          </h2>

          <p className="font-sans text-sm sm:text-base text-[#7C725D] leading-relaxed max-w-md">
            Setting up your account takes less than a minute. Join thousands of teams automating their data curation workflows.
          </p>

          {/* Integrated visual system stats list */}
          <div className="space-y-3.5 pt-4">
            <div className="flex items-center space-x-3 text-xs font-mono">
              <div className="h-8 w-8 rounded-lg bg-white/60 border border-white flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <span className="text-gray-400 block tracking-tight">ENCRYPTION PROTOCOL:</span>
                <span className="text-gray-950 font-semibold uppercase">AES-256 STATE BOUND</span>
              </div>
            </div>

            <div className="flex items-center space-x-3 text-xs font-mono">
              <div className="h-8 w-8 rounded-lg bg-white/60 border border-white flex items-center justify-center text-blue-650 shadow-sm shrink-0">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <span className="text-gray-400 block tracking-tight">SLA PRIORITY:</span>
                <span className="text-gray-950 font-semibold uppercase">99.999% CLUSTER COMMIT</span>
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
                      Create Pilot Account
                    </h3>
                    
                    {/* Mode Indicator badge */}
                    <span className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700 uppercase">
                      STANDARD PORTAL
                    </span>
                  </div>
                  <p className="font-sans text-xs text-[#7C725D]">
                    {step === 1 
                      ? "Step 1: Enter your personal credentials."
                      : "Step 2: Establish your verification key."
                    }
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

                {/* STEP 1: Personal Details */}
                {step === 1 ? (
                  <form onSubmit={handleNextStep} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                          First Name
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-[#7C725D] opacity-60" />
                          <input
                            type="text"
                            placeholder="Jane"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="w-full bg-[#FCFAF5] border border-[#E4DED4] rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                          Last Name
                        </label>
                        <input
                          type="text"
                          placeholder="Doe"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full bg-[#FCFAF5] border border-[#E4DED4] rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                        Work Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-[#7C725D] opacity-60" />
                        <input
                          type="email"
                          placeholder="jane.doe@company.com"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-[#FCFAF5] border border-[#E4DED4] rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                        />
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      type="submit"
                      className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-indigo-900 hover:bg-indigo-950 ring-1 ring-indigo-500/10 shadow-sm transition-all focus:outline-none cursor-pointer mt-4"
                    >
                      <span>CONTINUE</span>
                      <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </form>
                ) : (
                  /* STEP 2: Password creation */
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Read Only Email Pill */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-[#E4DED4]/60 bg-[#F5F2EB]/50 hover:bg-[#F5F2EB] transition-colors cursor-pointer" onClick={() => setStep(1)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs uppercase">
                          {email.charAt(0) || "U"}
                        </div>
                        <span className="text-sm font-medium text-[#1F1C18]">{email}</span>
                      </div>
                      <span className="text-xs font-mono text-[#7C725D] hover:text-[#1F1C18]">edit</span>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                          Password (Min. 8 characters)
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-xs font-semibold text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
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
                          className="w-full bg-[#FCFAF5] border border-[#E4DED4] rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
                        />
                      </div>

                      {/* Password Strength Indicator */}
                      {password && (
                        <div className="pt-1.5">
                          <div className="flex gap-1 h-1 mb-1">
                            <div className={`flex-1 rounded-full ${passwordStrength === "weak" ? "bg-rose-500" : passwordStrength === "medium" ? "bg-amber-500" : "bg-emerald-500"}`}></div>
                            <div className={`flex-1 rounded-full ${passwordStrength === "medium" || passwordStrength === "strong" ? (passwordStrength === "medium" ? "bg-amber-500" : "bg-emerald-500") : "bg-gray-200"}`}></div>
                            <div className={`flex-1 rounded-full ${passwordStrength === "strong" ? "bg-emerald-500" : "bg-gray-200"}`}></div>
                          </div>
                          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${passwordStrength === "weak" ? "text-rose-600" : passwordStrength === "medium" ? "text-amber-600" : "text-emerald-600"}`}>
                            {passwordStrength} security verification
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Confirm Password Input */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-sans font-bold text-[#7C725D] uppercase tracking-wider block">
                          Confirm Password
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="text-xs font-semibold text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                        >
                          {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span>{showConfirmPassword ? "Hide" : "Show"}</span>
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-[#7C725D] opacity-60" />
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={`w-full bg-[#FCFAF5] border rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans ${
                            confirmPassword && password !== confirmPassword ? "border-rose-450 focus:border-rose-500 focus:ring-rose-500" : "border-[#E4DED4]"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Terms Accepted Checkbox */}
                    <div className="flex items-start space-x-2.5 pt-2">
                      <input
                        id="terms-check"
                        type="checkbox"
                        checked={agreeToTerms}
                        onChange={(e) => setAgreeToTerms(e.target.checked)}
                        className="h-4 w-4 mt-0.5 accent-black rounded border-gray-300 focus:ring-black cursor-pointer"
                      />
                      <label htmlFor="terms-check" className="text-[11px] text-[#7C725D] leading-tight font-sans cursor-pointer select-none">
                        I authorized and declare full status reports conform with the Vizzy security SLA guidelines.
                      </label>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      type="submit"
                      disabled={isLoading || password !== confirmPassword || password.length === 0 || !agreeToTerms}
                      className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all focus:outline-none cursor-pointer mt-4 ${
                        isLoading || password !== confirmPassword || password.length === 0 || !agreeToTerms
                          ? "bg-[#7C725D] cursor-not-allowed" 
                          : "bg-indigo-900 hover:bg-indigo-950 ring-1 ring-indigo-500/10"
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                          <span>Generating Secure ID...</span>
                        </>
                      ) : (
                        <>
                          <span>CREATE ACCOUNT</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>
                  </form>
                )}

                {/* Auxiliary Auth Switches & Alternate Access Methods */}
                <div className="pt-4 border-t border-dashed border-gray-150 text-center space-y-3 font-sans">
                  <p className="text-[11px] text-[#7C725D]">
                    Already registered with Vizzy?{" "}
                    <Link to="/login" className="font-bold text-[#1F1C18] hover:underline">
                      Verify existing account
                    </Link>
                  </p>
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
