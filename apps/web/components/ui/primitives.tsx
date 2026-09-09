"use client";

import Link from "next/link";
import type { ReactNode, CSSProperties } from "react";
import type { RiskLevel } from "@/lib/types/database";

/**
 * Shared dashboard primitives.
 *
 * Inline styles + globals.css classes, matching the convention already
 * used across this codebase rather than introducing a third styling
 * system. Every component here ships its loading, empty and error state,
 * because a console that renders nothing during a landslide is worse than
 * one that says why.
 */

export const surface: CSSProperties = {
  borderRadius: 16,
  background: "#0a0a0a",
  border: "1px solid rgba(255,255,255,0.08)",
  overflow: "hidden",
};

/* ── Risk badge ─────────────────────────────────────────────────────────── */

const RISK_STYLE: Record<string, CSSProperties> = {
  critical: { background: "#ffffff", color: "#000000", border: "1px solid rgba(255,255,255,0.3)" },
  high:     { background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" },
  medium:   { background: "rgba(255,255,255,0.08)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.1)" },
  low:      { background: "rgba(255,255,255,0.04)", color: "#52525b", border: "1px solid rgba(255,255,255,0.07)" },
};

export function RiskBadge({ level, label }: { level: string; label?: string }) {
  return (
    <span
      style={{
        ...(RISK_STYLE[level] ?? RISK_STYLE.low),
        fontSize: 9,
        fontWeight: 800,
        padding: "3px 8px",
        borderRadius: 100,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label ?? level}
    </span>
  );
}

/* ── Status pill (roads, sensors, teams) ────────────────────────────────── */

const STATUS_TONE: Record<string, { dot: string; text: string }> = {
  blocked:     { dot: "#ef4444", text: "#fca5a5" },
  warning:     { dot: "#f59e0b", text: "#fcd34d" },
  monitoring:  { dot: "#a1a1aa", text: "#d4d4d8" },
  clear:       { dot: "#22c55e", text: "#86efac" },
  deployed:    { dot: "#f59e0b", text: "#fcd34d" },
  en_route:    { dot: "#f59e0b", text: "#fcd34d" },
  standby:     { dot: "#22c55e", text: "#86efac" },
  unavailable: { dot: "#52525b", text: "#71717a" },
  online:      { dot: "#22c55e", text: "#86efac" },
  offline:     { dot: "#ef4444", text: "#fca5a5" },
  new:         { dot: "#f59e0b", text: "#fcd34d" },
  triaged:     { dot: "#a1a1aa", text: "#d4d4d8" },
  verified:    { dot: "#22c55e", text: "#86efac" },
  rejected:    { dot: "#52525b", text: "#71717a" },
  resolved:    { dot: "#3b82f6", text: "#93c5fd" },
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.monitoring;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 700, color: tone.text,
        padding: "3px 10px", borderRadius: 100,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", background: tone.dot, flexShrink: 0 }}
      />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

/* ── Page header ────────────────────────────────────────────────────────── */

export function PageHeader({
  title, subtitle, actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 6, letterSpacing: "-0.02em" }}>
          {title}
        </h1>
        {subtitle && <p style={{ fontSize: 13, color: "#52525b", maxWidth: 640 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────── */

export function StatCard({
  label, value, sub, emphasis = false, href,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  emphasis?: boolean;
  href?: string;
}) {
  const body = (
    <div
      style={{
        padding: 20,
        borderRadius: 16,
        height: "100%",
        background: emphasis ? "#ffffff" : "#0a0a0a",
        border: `1px solid ${emphasis ? "#ffffff" : "rgba(255,255,255,0.08)"}`,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ fontSize: 11, color: emphasis ? "#3f3f46" : "#52525b", marginBottom: 10, fontWeight: 500 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 6,
          color: emphasis ? "#000000" : "#ffffff",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: emphasis ? "#52525b" : "#3f3f46" }}>{sub}</div>}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
      {body}
    </Link>
  );
}

/* ── Section ────────────────────────────────────────────────────────────── */

export function Section({
  title, action, children, live = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <section style={surface}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h2 style={{ fontWeight: 700, fontSize: 13, color: "white", display: "flex", alignItems: "center", gap: 8 }}>
          {live && (
            <span
              aria-hidden="true"
              style={{
                width: 6, height: 6, borderRadius: "50%", background: "#ef4444",
                animation: "pulse 2s infinite", display: "inline-block",
              }}
            />
          )}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────── */

/**
 * An empty state is an invitation to act. "No data" tells an officer
 * nothing; "no roads are blocked right now" tells them the network is open.
 */
export function EmptyState({
  icon, title, body, action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      {icon && <div style={{ marginBottom: 14, opacity: 0.35, display: "flex", justifyContent: "center" }}>{icon}</div>}
      <p style={{ fontSize: 14, fontWeight: 700, color: "#d4d4d8", marginBottom: 6 }}>{title}</p>
      {body && (
        <p style={{ fontSize: 12.5, color: "#52525b", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/* ── Error state ────────────────────────────────────────────────────────── */

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ padding: "36px 24px", textAlign: "center" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", marginBottom: 6 }}>
        Could not load this data
      </p>
      <p style={{ fontSize: 12, color: "#71717a", maxWidth: 420, margin: "0 auto 16px", lineHeight: 1.6 }}>
        {message}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} style={buttonStyle()}>
          Try again
        </button>
      )}
    </div>
  );
}

/* ── Loading skeleton ───────────────────────────────────────────────────── */

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 52,
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.05) 37%, rgba(255,255,255,0.02) 63%)",
            backgroundSize: "400% 100%",
            animation: "shimmer 1.4s ease infinite",
          }}
        />
      ))}
    </div>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────────── */

export function buttonStyle(variant: "primary" | "ghost" | "danger" = "ghost"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "10px 16px", borderRadius: 10,
    fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    minHeight: 44, transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
  };
  if (variant === "primary") {
    return { ...base, background: "#ffffff", color: "#000000", border: "1px solid #ffffff" };
  }
  if (variant === "danger") {
    return { ...base, background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.35)" };
  }
  return { ...base, background: "rgba(255,255,255,0.05)", color: "#e4e4e7", border: "1px solid rgba(255,255,255,0.12)" };
}

/* ── Score bar ──────────────────────────────────────────────────────────── */

export function ScoreBar({ score, level }: { score: number; level: string }) {
  const pct = Math.round(score * 100);
  return (
    <div style={{ width: 88, display: "flex", alignItems: "center", gap: 8 }}>
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Risk score ${pct} percent`}
        style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%", borderRadius: 2, width: `${pct}%`,
            background: level === "critical" ? "#ffffff" : "rgba(255,255,255,0.5)",
            transition: "width 0.5s",
          }}
        />
      </div>
      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#71717a", width: 26, textAlign: "right" }}>
        {(score).toFixed(2).slice(1)}
      </span>
    </div>
  );
}

export type { RiskLevel };
