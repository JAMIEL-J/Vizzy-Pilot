import React, { useState, type FormEvent, useRef } from 'react';
import { 
  Sparkles, Mail, Lock, User, Eye, EyeOff, ArrowRight, ChevronLeft, Check, Shield, AlertCircle, RefreshCw, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi } from '../lib/api/auth';
import { useNavigate } from 'react-router-dom';
import { VizzyPilotVerticalLogo } from './layout/VizzyLogo';

interface AuthScreenProps {
  initialMode: 'signin' | 'signup';
  isDark: boolean;
  onToggleTheme: () => void;
  onClose: () => void; // Go back to Home
  onSuccess: (email: string, name?: string) => void;
  onSwitchMode: (newMode: 'signin' | 'signup') => void;
}

export default function AuthScreen({ initialMode, isDark, onToggleTheme, onClose, onSuccess, onSwitchMode }: AuthScreenProps) {
  const mode = initialMode;
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  // Interactive UI states
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoginSuccess, setIsLoginSuccess] = useState(false);

  // Social action loaders
  const [socialLoading, setSocialLoading] = useState<string | null>(null);

  // Grid interactive mouse tracking
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridCoords, setGridCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setGridCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleSocialLogin = (provider: string) => {
    setSocialLoading(provider);
    setErrorMsg(null);
    // Social logins remain mock as there is no real social login backend yet
    setTimeout(() => {
      setSocialLoading(null);
      setErrorMsg(`${provider} authentication integration is not configured on this cluster.`);
    }, 1200);
  };

  const validateForm = () => {
    if (!email || !password) {
      setErrorMsg('Please fill in all required fields.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMsg('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return false;
    }
    if (mode === 'signup') {
      if (!name) {
        setErrorMsg('Please enter your full name.');
        return false;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return false;
      }
      if (!agreeTerms) {
        setErrorMsg('You must agree to the Terms of Service and Privacy Policy.');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (mode === 'signup') {
        // 1. Call real backend registration
        await authApi.register({
          name: name.trim(),
          email: email.trim(),
          password: password,
        });

        setSuccessMsg('Workspace created successfully! Setting up secure session...');

        // 2. Perform auto login right after signup to save the JWT
        const response = await authApi.loginUser({
          email: email.trim(),
          password: password,
        });
        localStorage.setItem("access_token", response.access_token);
        localStorage.setItem("refresh_token", response.refresh_token);

        setIsLoginSuccess(true);
        setTimeout(() => {
          setIsLoading(false);
          onSuccess(email, name);
          navigate('/user/dashboard');
        }, 2000);

      } else {
        // Call real backend login
        const response = await authApi.loginUser({
          email: email.trim(),
          password: password,
        });

        localStorage.setItem("access_token", response.access_token);
        localStorage.setItem("refresh_token", response.refresh_token);

        setSuccessMsg('Signed in successfully! Loading console telemetry...');
        setIsLoginSuccess(true);
        
        setTimeout(() => {
          setIsLoading(false);
          onSuccess(email, name || email.split('@')[0]);
          navigate('/user/dashboard');
        }, 2000);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Authentication failure. Please check credentials.');
      setIsLoading(false);
    }
  };

  if (isLoginSuccess) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center relative overflow-hidden select-none">
        <style>{`
          @keyframes loadingBar {
            0% { left: -40%; width: 40%; }
            50% { left: 30%; width: 50%; }
            100% { left: 100%; width: 30%; }
          }
        `}</style>
        {/* Ambient background patterns */}
        <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-border-custom/30 to-transparent pointer-events-none" />
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-teal-500/[0.04] blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-teal-500/[0.04] blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center space-y-8">
          <VizzyPilotVerticalLogo size={160} />
          
          <div className="flex flex-col items-center space-y-3 w-64 text-center">
            <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden relative border border-border-custom shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-accent-custom to-teal-400 rounded-full absolute left-0 top-0" 
                style={{ animation: 'loadingBar 1.5s ease-in-out infinite' }} 
              />
            </div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-muted-custom uppercase animate-pulse">
              Synchronizing telemetry console...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="min-h-screen w-full bg-bg flex flex-col justify-between relative overflow-hidden cursor-default isolate text-left"
    >
      {/* Premium background grid matching landing page hero */}
      <div 
        className="absolute inset-0 -z-10 h-full w-full hero-grid-lines opacity-60"
        style={{
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 65%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 65%, transparent 100%)',
        }}
      />

      {/* Interactive mouse glowing spotlight */}
      <div 
        className="absolute inset-0 -z-10 pointer-events-none transition-opacity duration-300 ease-out"
        style={{
          background: isHovered 
            ? `radial-gradient(400px circle at ${gridCoords.x}px ${gridCoords.y}px, ${isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(13, 148, 136, 0.06)'}, transparent 80%)`
            : 'none',
          opacity: isHovered ? 1 : 0
        }}
      />

      {/* Standalone Page Header */}
      <header className="w-full border-b border-border-custom bg-surface-2/60 backdrop-blur-md py-4 px-6 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center space-x-1.5 text-xs font-mono text-muted-custom hover:text-text-custom transition-colors cursor-pointer bg-transparent border-none"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to home</span>
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-text-custom flex items-center justify-center">
              <span className="text-bg font-sans font-bold text-xs select-none">V</span>
            </div>
            <span className="font-sans font-semibold tracking-tight text-text-custom text-sm select-none">Vizzy Pilot</span>
          </div>

          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-full border border-border-custom bg-surface-2 text-muted-custom hover:text-text-custom transition-all hover:scale-105 cursor-pointer"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Centered Main Form Card Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl bg-surface border border-border-custom rounded-3xl shadow-xl overflow-hidden isolate flex flex-col md:flex-row min-h-[550px]"
        >
          {/* LEFT SIDE: Decorative & Branding Landscape Panel */}
          <div className="md:w-5/12 bg-surface-2/60 border-b md:border-b-0 md:border-r border-border-custom/80 p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden select-none">
            {/* Colorful custom subtle ambient glows */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-accent-custom/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="space-y-6 relative z-10 text-left">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-text-custom flex items-center justify-center shadow-xs">
                  <span className="text-bg font-sans font-bold text-sm">V</span>
                </div>
                <span className="font-sans font-semibold text-text-custom tracking-tight text-base">Vizzy Pilot Playroom</span>
              </div>
              
              <div className="space-y-4 pt-4">
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-accent-custom/10 text-accent-custom text-[10px] font-mono uppercase font-bold tracking-wider">
                  Secure Data Sandbox
                </div>
                <h3 className="text-lg font-semibold text-text-custom tracking-tight leading-snug">
                  The ultimate workspace for lightning fast data analysis & quality curation.
                </h3>
                <p className="text-xs text-muted-custom leading-relaxed">
                  Join analytics researchers who leverage Vizzy Pilot's real-time streaming engines and advanced validation toolkits to parse complex information in micro-seconds.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-6 mt-6 border-t border-border-custom/50 text-left relative z-10">
              <div className="flex items-center space-x-2.5 text-xs text-muted-custom">
                <div className="w-5 h-5 rounded-md bg-success-custom/10 text-success-custom flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>In-Memory high-speed cache</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-muted-custom">
                <div className="w-5 h-5 rounded-md bg-success-custom/10 text-success-custom flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Automatic data health scanning</span>
              </div>
              <div className="flex items-center space-x-2.5 text-xs text-muted-custom">
                <div className="w-5 h-5 rounded-md bg-success-custom/10 text-success-custom flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>Secure version rollback lineage</span>
              </div>
            </div>

            <div className="text-[10px] font-mono text-muted-custom/60 pt-6 mt-auto text-left">
              Trusted Sandbox Environment · v1.4.2
            </div>
          </div>

          {/* RIGHT SIDE: Interactive Auth Form */}
          <div className="md:w-7/12 p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
            {/* Internal colorful glows */}
            <div className="absolute top-0 right-1/4 w-72 h-72 bg-accent-custom/5 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="space-y-6">
              {/* Header Content */}
              <div className="text-left space-y-1.5">
                <h2 className="text-xl font-semibold tracking-tight text-text-custom">
                  {mode === 'signin' ? 'Sign in to Vizzy Pilot' : 'Create your Vizzy Pilot workspace'}
                </h2>
                <p className="text-xs text-muted-custom leading-relaxed">
                  {mode === 'signin' 
                    ? 'Access your analytics sandbox, automated data health monitors, and charts.' 
                    : 'Start mapping and transforming complex datasets in milliseconds.'}
                </p>
              </div>

              {/* Submit Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                <AnimatePresence mode="wait">
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -5 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -5 }}
                      className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start space-x-2.5 text-xs text-red-500"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-normal text-left">{errorMsg}</span>
                    </motion.div>
                  )}

                  {successMsg && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -5 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -5 }}
                      className="p-3 bg-success-custom/10 border border-success-custom/20 rounded-xl flex items-start space-x-2.5 text-xs text-success-custom"
                    >
                      <Check className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-normal text-left">{successMsg}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3.5">
                  {/* Full Name (Sign Up Only) */}
                  {mode === 'signup' && (
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-mono font-medium text-muted-custom uppercase">Full Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-custom">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="Jane Doe"
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            if (errorMsg) setErrorMsg(null);
                          }}
                          className="w-full pl-9 pr-4 py-2 text-xs bg-surface-2 border border-border-custom rounded-xl focus:outline-none focus:border-accent-custom/50 text-text-custom placeholder-muted-custom/60 transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  {/* Email Address */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-mono font-medium text-muted-custom uppercase">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-custom">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="you@domain.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-surface-2 border border-border-custom rounded-xl focus:outline-none focus:border-accent-custom/50 text-text-custom placeholder-muted-custom/60 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-mono font-medium text-muted-custom uppercase">Password</label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => setErrorMsg('Password recovery is disabled for demo workspaces.')}
                          className="text-[10px] font-mono text-muted-custom hover:text-text-custom hover:underline bg-transparent border-none cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-custom">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        className="w-full pl-9 pr-10 py-2 text-xs bg-surface-2 border border-border-custom rounded-xl focus:outline-none focus:border-accent-custom/50 text-text-custom placeholder-muted-custom/60 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-custom hover:text-text-custom cursor-pointer bg-transparent border-none"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password (Sign Up Only) */}
                  {mode === 'signup' && (
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-mono font-medium text-muted-custom uppercase">Confirm Password</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-custom">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (errorMsg) setErrorMsg(null);
                          }}
                          className="w-full pl-9 pr-4 py-2 text-xs bg-surface-2 border border-border-custom rounded-xl focus:outline-none focus:border-accent-custom/50 text-text-custom placeholder-muted-custom/60 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Terms checkbox (Sign Up Only) */}
                {mode === 'signup' && (
                  <div className="flex items-start space-x-2 pt-1 text-left">
                    <input
                      type="checkbox"
                      id="agree-terms"
                      checked={agreeTerms}
                      onChange={(e) => {
                        setAgreeTerms(e.target.checked);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="mt-0.5 w-3.5 h-3.5 rounded border border-border-custom text-accent-custom focus:ring-accent-custom cursor-pointer"
                    />
                    <label htmlFor="agree-terms" className="text-[10px] text-muted-custom leading-normal select-none">
                      I agree to the <span className="text-text-custom font-semibold hover:underline cursor-pointer">Terms of Service</span> and <span className="text-text-custom font-semibold hover:underline cursor-pointer">Privacy Policy</span>.
                    </label>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-2.5 bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-semibold transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-xs border-none"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{mode === 'signin' ? 'Authenticating...' : 'Compiling workspace...'}</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'signin' ? 'Sign In to Workspace' : 'Build Workspace'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Social Divider */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-custom/60"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-mono text-muted-custom uppercase">
                  <span className="bg-surface px-3">or continue with</span>
                </div>
              </div>

              {/* Social Options */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={socialLoading !== null}
                  onClick={() => handleSocialLogin('Google')}
                  className="px-3 py-2 bg-surface border border-border-custom rounded-xl text-[10px] font-mono font-medium hover:bg-surface-2 text-text-custom transition-all flex items-center justify-center space-x-2 cursor-pointer border-none"
                >
                  {socialLoading === 'Google' ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-custom" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" stroke="none" />
                    </svg>
                  )}
                  <span>Google</span>
                </button>

                <button
                  type="button"
                  disabled={socialLoading !== null}
                  onClick={() => handleSocialLogin('GitHub')}
                  className="px-3 py-2 bg-surface border border-border-custom rounded-xl text-[10px] font-mono font-medium hover:bg-surface-2 text-text-custom transition-all flex items-center justify-center space-x-2 cursor-pointer border-none"
                >
                  {socialLoading === 'GitHub' ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-custom" />
                  ) : (
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                    </svg>
                  )}
                  <span>GitHub</span>
                </button>
              </div>

              {/* View Switch Link */}
              <div className="text-center pt-2">
                <span className="text-xs text-muted-custom">
                  {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}{' '}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSwitchMode(mode === 'signin' ? 'signup' : 'signin');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-semibold text-accent-custom hover:underline hover:text-accent-custom/80 cursor-pointer bg-transparent border-none"
                >
                  {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                </button>
              </div>
            </div>

            {/* Secure footer block */}
            <div className="py-3 mt-6 border-t border-border-custom flex items-center justify-center space-x-2 text-[10px] font-mono text-muted-custom">
              <Shield className="w-3.5 h-3.5 text-success-custom shrink-0 animate-pulse" />
              <span>AES-256 secure session shield active</span>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Standalone Page Footer */}
      <footer className="w-full border-t border-border-custom py-4 px-6 text-center text-[10px] font-mono text-muted-custom bg-surface-2/20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 Vizzy Pilot Inc. All rights reserved.</span>
          <div className="flex space-x-4">
            <span className="hover:text-text-custom cursor-pointer">Security</span>
            <span className="hover:text-text-custom cursor-pointer">Terms of Service</span>
            <span className="hover:text-text-custom cursor-pointer">Privacy Policy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
