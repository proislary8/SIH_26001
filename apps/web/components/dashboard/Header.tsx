"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/types/database";

interface Props {
  user: { email: string; name: string; role: UserRole };
}

export default function DashboardHeader({ user }: Props) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initials = (user.name || user.email)[0].toUpperCase();

  return (
    <header className="dash-header" style={{
      height: 64, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", flexShrink: 0,
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      background: "#080808",
    }}>
      {/* System status pills */}
      <div className="dash-header-status" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 11, color: "#a1a1aa", fontWeight: 600 }}>System Operational</span>
        </div>
        <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", display: "inline-block" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#52525b" }}>
          <span>ML Model v1</span>
          <span>·</span>
          <span>Weather: Live</span>
        </div>
      </div>

      {/* User */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>
            {user.name || user.email.split("@")[0]}
          </div>
          <div style={{ fontSize: 10, color: "#52525b", textTransform: "capitalize", fontWeight: 500 }}>
            {user.role.replace("_", " ")}
          </div>
        </div>

        {/* Avatar — white circle, black letter */}
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "white", color: "black",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 14, flexShrink: 0,
          border: "1px solid rgba(255,255,255,0.2)",
        }}>
          {initials}
        </div>

        <button onClick={signOut} style={{
          fontSize: 12, color: "#52525b", background: "none", border: "none",
          cursor: "pointer", padding: "6px 12px", borderRadius: 8,
          transition: "all 0.15s", fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#52525b"; e.currentTarget.style.background = "none"; }}
        >
          Sign out
        </button>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </header>
  );
}
