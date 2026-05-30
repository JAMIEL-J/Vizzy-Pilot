import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Sparkles,
  Settings,
  ChevronDown,
  Database,
  Command,
  LogOut,
  Layers,
} from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { useAuthStore } from "@/lib/store/authStore";

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
  const { logout } = useAuthStore();

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

        <DatasetSwitcher />

        <div className="ml-auto flex items-center gap-1.5">
          <button className="group flex h-8 w-72 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-[12px] text-muted-foreground transition hover:border-border-strong hover:bg-surface-2">
            <Search className="h-3.5 w-3.5" />
            <span>Search datasets, queries, insights...</span>
            <span className="ml-auto flex items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Command className="h-2.5 w-2.5" /> K
            </span>
          </button>
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
          <Link
            to="/user/profile"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
          >
            <div className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-[10px] font-semibold text-background">
              EA
            </div>
            <span className="text-[12px] font-medium">Elena A.</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Link>
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

function DatasetSwitcher() {
  return (
    <button className="flex h-7 items-center gap-2 rounded-md border border-border bg-surface px-2 text-[12px] transition hover:border-border-strong hover:bg-surface-2">
      <Database className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">orders_q4_2026</span>
      <span className="rounded bg-surface-3 px-1 text-[10px] text-muted-foreground">
        1.2M rows
      </span>
      <ChevronDown className="h-3 w-3 text-muted-foreground" />
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
