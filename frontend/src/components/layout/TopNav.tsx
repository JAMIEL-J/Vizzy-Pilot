import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  ChevronDown,
  LogOut,
  Layers,
  Save,
  Loader2,
  Settings,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/authStore";
import { userApi, type LLMSettings } from "../../lib/api/user";
import { toast } from "react-hot-toast";
import ThemeToggle from "../ui/ThemeToggle";

const NAV = [
  { to: "/user/dashboard", label: "Dashboard" },
  { to: "/user/datasets", label: "Datasets" },
  { to: "/user/cleaning", label: "Cleaning" },
  { to: "/user/chat", label: "AI Assistant" },
  { to: "/user/downloads", label: "Exports" },
];

export function TopNav() {
  const location = useLocation();
  const path = location.pathname;
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [ollamaUrlInput, setOllamaUrlInput] = useState("http://localhost:11434");
  const [ollamaModelInput, setOllamaModelInput] = useState("llama3");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isDropdownOpen) {
      loadLLMSettings();
    }
  }, [isDropdownOpen]);

  const loadLLMSettings = async () => {
    try {
      const settings = await userApi.getLLMSettings();
      setLlmSettings(settings);
      setOpenaiKeyInput(settings.has_openai_key ? "********" : "");
      setGeminiKeyInput(settings.has_gemini_key ? "********" : "");
      
      const savedOllamaUrl = localStorage.getItem("ollama_url") || "http://localhost:11434";
      const savedOllamaModel = localStorage.getItem("ollama_model") || "llama3";
      setOllamaUrlInput(savedOllamaUrl);
      setOllamaModelInput(savedOllamaModel);
    } catch (e) {
      console.error("Failed to load LLM settings:", e);
    }
  };

  const handleSaveLLMSettings = async (provider: string) => {
    setIsSavingSettings(true);
    try {
      if (provider === "ollama") {
        localStorage.setItem("ollama_url", ollamaUrlInput);
        localStorage.setItem("ollama_model", ollamaModelInput);
      }

      const updated = await userApi.updateLLMSettings({
        provider,
        openai_api_key: openaiKeyInput,
        gemini_api_key: geminiKeyInput,
        ollama_url: ollamaUrlInput,
        ollama_model: ollamaModelInput,
      });
      setLlmSettings(updated);
      toast.success("LLM settings updated!");
    } catch (e) {
      console.error("Failed to save LLM settings:", e);
      toast.error("Failed to update settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length > 1) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return "US";
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-border-main bg-bg-card/80 backdrop-blur-xl select-none">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8">
        
        {/* Left Brand Area */}
        <div className="flex items-center space-x-3 text-left">
          <Link to="/user/dashboard" className="flex items-center space-x-3 text-decoration-none">
            <div className="h-7 w-7 rounded-sm flex items-center justify-center text-primary-foreground font-mono font-bold text-sm bg-themed-main shadow-md">
              V
            </div>
            <div>
              <span className="font-sans text-xs font-bold text-themed-main tracking-[0.15em] uppercase leading-none block">
                VIZZY PILOT AI
              </span>
              <span className="font-sans text-[10px] text-themed-muted uppercase font-semibold block mt-0.5">
                Session active • persistent connection established
              </span>
            </div>
          </Link>
        </div>

        {/* Central High-Fidelity Menu (Desktop) */}
        <nav className="hidden lg:flex items-center space-x-1.5 bg-bg-main/60 rounded-full p-1 border border-border-main shadow-xs">
          {NAV.map((tab) => {
            const active = path.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-extrabold tracking-wider uppercase transition-all duration-300 cursor-pointer border-none flex items-center space-x-1 text-decoration-none ${
                  active 
                    ? "bg-themed-main text-primary-foreground shadow-sm scale-102" 
                    : "text-themed-muted hover:text-themed-main hover:bg-surface-2"
                }`}
              >
                <span>{tab.label === "AI Assistant" ? "Vizzy Pilot AI" : tab.label === "Datasets" ? "Dataset Viewer" : tab.label === "Downloads" ? "Export Dataset" : tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Action / Authentication Info */}
        <div className="flex items-center space-x-3 relative" ref={dropdownRef}>
          <div 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="hidden sm:flex flex-col text-right font-sans cursor-pointer hover:opacity-80 transition-opacity"
          >
            <span className="text-xs font-bold text-themed-main capitalize leading-tight">
              {user?.name || "User"}
            </span>
            <span className="text-[10px] text-themed-muted font-mono leading-none mt-0.5">
              {user?.email}
            </span>
          </div>

          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-themed-main text-primary-foreground font-mono font-bold text-[11px] cursor-pointer shadow-sm border-none transition-transform hover:scale-105"
          >
            {getInitials(user?.name, user?.email)}
          </button>

          <ThemeToggle size="sm" />

          <button
            onClick={handleLogout}
            className="group flex h-9 w-9 items-center justify-center rounded-sm border border-border-main bg-bg-card hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 transition-all cursor-pointer shadow-xs text-themed-muted"
            title="Sign Out Session"
          >
            <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* LLM Settings Dropdown */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-border-main bg-bg-card p-4 shadow-xl flex flex-col gap-3 text-left">
              <div className="flex items-center gap-3 border-b border-border-main pb-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-themed-main text-xs font-bold text-primary-foreground">
                  {getInitials(user?.name, user?.email)}
                </div>
                <div className="overflow-hidden">
                  <div className="text-[13px] font-bold text-themed-main truncate">{user?.name || "User"}</div>
                  <div className="text-[11px] text-themed-muted truncate">{user?.email}</div>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-border-main pb-2 text-xs">
                <Link
                  to="/user/profile"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-2 transition-colors text-themed-main text-decoration-none"
                >
                  <Settings className="h-4 w-4 text-themed-muted" />
                  Account Profile
                </Link>
                <Link
                  to="/user/downloads"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-surface-2 transition-colors text-themed-main text-decoration-none"
                >
                  <Layers className="h-4 w-4 text-themed-muted" />
                  Exports Center
                </Link>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-themed-muted">
                  LLM Settings (Hybrid)
                </div>
                
                <select
                  value={llmSettings?.provider || "default"}
                  onChange={(e) => handleSaveLLMSettings(e.target.value)}
                  className="w-full rounded-lg border border-border-main bg-bg-card px-2.5 py-1.5 text-xs outline-none text-themed-main cursor-pointer"
                >
                  <option value="default">Default (Vizzy Pilot Managed)</option>
                  <option value="openai">Custom OpenAI API</option>
                  <option value="gemini">Custom Gemini API</option>
                  <option value="ollama">Local Ollama (Local Storage)</option>
                </select>

                {llmSettings?.provider === "openai" && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <input
                      type="password"
                      placeholder="OpenAI API Key"
                      value={openaiKeyInput}
                      onChange={(e) => setOpenaiKeyInput(e.target.value)}
                      className="w-full rounded-lg border border-border-main bg-bg-card px-2.5 py-1.5 text-xs outline-none text-themed-main"
                    />
                    <button
                      onClick={() => handleSaveLLMSettings("openai")}
                      disabled={isSavingSettings}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-themed-main py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer border-none"
                    >
                      {isSavingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Key
                    </button>
                  </div>
                )}

                {llmSettings?.provider === "gemini" && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <input
                      type="password"
                      placeholder="Gemini API Key"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      className="w-full rounded-lg border border-border-main bg-bg-card px-2.5 py-1.5 text-xs outline-none text-themed-main"
                    />
                    <button
                      onClick={() => handleSaveLLMSettings("gemini")}
                      disabled={isSavingSettings}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-themed-main py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer border-none"
                    >
                      {isSavingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Key
                    </button>
                  </div>
                )}

                {llmSettings?.provider === "ollama" && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <input
                      type="text"
                      placeholder="Ollama URL (http://localhost:11434)"
                      value={ollamaUrlInput}
                      onChange={(e) => setOllamaUrlInput(e.target.value)}
                      className="w-full rounded-lg border border-border-main bg-bg-card px-2.5 py-1.5 text-xs outline-none text-themed-main"
                    />
                    <input
                      type="text"
                      placeholder="Model Name (e.g. llama3)"
                      value={ollamaModelInput}
                      onChange={(e) => setOllamaModelInput(e.target.value)}
                      className="w-full rounded-lg border border-border-main bg-bg-card px-2.5 py-1.5 text-xs outline-none text-themed-main"
                    />
                    <button
                      onClick={() => handleSaveLLMSettings("ollama")}
                      disabled={isSavingSettings}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-themed-main py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer border-none"
                    >
                      {isSavingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Local Ollama
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-border-main pt-2">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 hover:bg-rose-50 text-xs font-bold text-rose-700 transition-colors border-none bg-transparent cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Horizontal Sub-Navigation for Mobile view */}
      <div className="flex lg:hidden h-11 items-center gap-1 px-4 overflow-x-auto bg-bg-main border-t border-border-main/60 no-scrollbar">
        {NAV.map((tab) => {
          const active = path.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap text-decoration-none ${
                active 
                  ? "bg-themed-main text-primary-foreground shadow-xs" 
                  : "text-themed-muted hover:text-themed-main"
              }`}
            >
              {tab.label === "AI Assistant" ? "Vizzy Pilot AI" : tab.label === "Datasets" ? "Dataset Viewer" : tab.label === "Downloads" ? "Export Dataset" : tab.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

function IconButton({
  children,
  ariaLabel,
  badge,
  ...props
}: {
  children: React.ReactNode;
  ariaLabel: string;
  badge?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={ariaLabel}
      className="relative grid h-8 w-8 place-items-center rounded-lg text-themed-muted hover:text-themed-main hover:bg-surface-2 transition-all border-none bg-transparent cursor-pointer"
      {...props}
    >
      {children}
      {badge && (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-themed-main ring-2 ring-bg-card" />
      )}
    </button>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: string[];
}) {
  return (
    <div className="border-b border-border-main bg-bg-card px-8 py-6 select-none text-left">
      {breadcrumb && (
        <div className="mb-2.5 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-themed-muted">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-border-main">/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-themed-main font-bold" : ""}>
                {b}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-sans font-bold text-themed-main tracking-tight leading-none">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-xs text-themed-muted font-sans">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
