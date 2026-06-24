import * as React from "react";
import { cn } from "@/lib/utils";

export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean }
>(({ className, elevated, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-bg-card border border-border-main rounded-2xl shadow-sm",
      className
    )}
    {...props}
  />
));
Panel.displayName = "Panel";

export function PanelHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-main px-5 py-4">
      <div className="flex items-start gap-2.5">
        {icon && <div className="mt-0.5 text-themed-muted">{icon}</div>}
        <div className="text-left">
          <h3 className="text-sm font-sans font-bold text-themed-main leading-snug">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-themed-muted font-sans">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "accent";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-surface-2 border-border-main text-themed-muted",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    danger: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    accent: "bg-themed-main/10 border-themed-main/20 text-themed-main",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border-main bg-surface-2 px-1 font-mono text-[9px] text-themed-muted">
      {children}
    </kbd>
  );
}

export function BtnGhost({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-xs font-sans font-bold uppercase tracking-wider text-themed-muted hover:bg-surface-2 hover:text-themed-main transition-all cursor-pointer border-none bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-border-main bg-bg-card px-3.5 py-2 text-xs font-sans font-bold uppercase tracking-wider text-themed-main hover:bg-surface-2 transition-all cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnPrimary({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl bg-themed-main px-3.5 py-2 text-xs font-sans font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 transition-all cursor-pointer border-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnAccent({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl bg-themed-main px-3.5 py-2 text-xs font-sans font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 transition-all cursor-pointer border-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
