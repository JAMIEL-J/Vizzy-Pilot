import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Sparkles,
  Settings,
  ChevronDown,
  LogOut,
  Layers,
  Save,
  Loader2,
  User,
} from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { useAuthStore } from "@/lib/store/authStore";
import { userApi, type LLMSettings } from "../../lib/api/user";
import { toast } from "react-hot-toast";

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
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-12 items-center gap-4 px-5">
        <Link to="/user/dashboard" className="flex items-center gap-2.5">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-background">
            <Layers className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">Helix</span>
          <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Enterprise
          </span>
        </Link>

        <div className="mx-2 h-4 w-px bg-border" />

        <div className="ml-auto flex items-center gap-1.5">
          <IconButton ariaLabel="AI Assistant">
            <Sparkles className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton ariaLabel="Notifications" badge>
            <Bell className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton ariaLabel="Settings">
            <Settings className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton ariaLabel="Log out" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
          </IconButton>
          <ThemeToggle size="sm" />
          <div className="mx-1 h-5 w-px bg-border" />
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
            >
              <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-[10px] font-semibold text-background">
                {getInitials(user?.name, user?.email)}
              </div>
              <span className="text-[12px] font-medium">{user?.name || user?.email || "User"}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest dark:bg-surface p-4 shadow-2xl flex flex-col gap-3">
                <div className="flex items-center gap-3 border-b border-border pb-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-xs font-bold text-background">
                    {getInitials(user?.name, user?.email)}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-[13px] font-semibold truncate">{user?.name || "User"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-b border-border pb-2 text-[12px]">
                  <Link
                    to="/user/profile"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2 transition text-foreground"
                  >
                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    Account Profile
                  </Link>
                  <Link
                    to="/user/downloads"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2 transition text-foreground"
                  >
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    Exports Center
                  </Link>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    LLM Settings (Hybrid)
                  </div>
                  
                  <select
                    value={llmSettings?.provider || "default"}
                    onChange={(e) => handleSaveLLMSettings(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11.5px] outline-none text-foreground"
                  >
                    <option value="default">Default (Helix Managed)</option>
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
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none text-foreground"
                      />
                      <button
                        onClick={() => handleSaveLLMSettings("openai")}
                        disabled={isSavingSettings}
                        className="flex items-center justify-center gap-1.5 w-full rounded-md bg-primary py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
                      >
                        {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
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
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none text-foreground"
                      />
                      <button
                        onClick={() => handleSaveLLMSettings("gemini")}
                        disabled={isSavingSettings}
                        className="flex items-center justify-center gap-1.5 w-full rounded-md bg-primary py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
                      >
                        {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
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
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none text-foreground"
                      />
                      <input
                        type="text"
                        placeholder="Model Name (e.g. llama3)"
                        value={ollamaModelInput}
                        onChange={(e) => setOllamaModelInput(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none text-foreground"
                      />
                      <button
                        onClick={() => handleSaveLLMSettings("ollama")}
                        disabled={isSavingSettings}
                        className="flex items-center justify-center gap-1.5 w-full rounded-md bg-primary py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
                      >
                        {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save Local Ollama
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-2">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 hover:bg-surface-2 text-[12px] text-destructive transition"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      <div className="flex h-9 items-center gap-1 px-3">
        {NAV.map((n) => {
          const active = path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`relative rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n.label}
              {active && (
                <span className="absolute -bottom-[9px] left-2 right-2 h-px bg-foreground" />
              )}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            All systems operational
          </span>
          <span className="text-border">.</span>
          <span>v4.12.0</span>
        </div>
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
      className="relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
      {...props}
    >
      {children}
      {badge && (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background" />
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
    <div className="border-b border-border bg-background px-7 py-5">
      {breadcrumb && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-border">/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-foreground" : ""}>
                {b}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-display text-[22px] font-semibold leading-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[12.5px] text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
