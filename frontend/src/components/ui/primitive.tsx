import * as React from "react";
import { cn } from "@/lib/utils";

export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { elevated?: boolean }
>(({ className, elevated, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(elevated ? "panel-elev" : "panel", className)}
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
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-start gap-2.5">
        {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
        <div>
          <h3 className="text-[12.5px] font-semibold tracking-tight">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</p>
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
    default: "bg-surface-2 text-muted-foreground border-border",
    success: "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success border-[color-mix(in_oklab,var(--success)_30%,transparent)]",
    warning: "bg-[color-mix(in_oklab,var(--warning)_15%,transparent)] text-warning border-[color-mix(in_oklab,var(--warning)_30%,transparent)]",
    danger: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive border-[color-mix(in_oklab,var(--destructive)_30%,transparent)]",
    info: "bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-accent border-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
    accent: "bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-primary border-[color-mix(in_oklab,var(--primary)_30%,transparent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium",
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
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-muted-foreground">
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
        "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[11.5px] font-medium text-muted-foreground transition hover:bg-surface-2 hover:text-foreground",
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
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-foreground transition hover:border-border-strong hover:bg-surface-3",
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
        "inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-[11.5px] font-semibold text-background transition hover:bg-foreground/90",
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
        "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11.5px] font-semibold text-primary-foreground transition hover:opacity-90",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
