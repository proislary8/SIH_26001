"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

const NAV: NavItem[] = [
  { href: "/dashboard",            label: "Overview",      icon: "⊞",  roles: ["citizen","field_officer","district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/dashboard/risk-map",   label: "Risk Map",      icon: "◉",  roles: ["field_officer","district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/dashboard/alerts",     label: "Alerts",        icon: "◈",  roles: ["district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/dashboard/sensors",    label: "Sensors",       icon: "⬡",  roles: ["field_officer","district_admin","state_admin","super_admin"] },
  { href: "/dashboard/reports",    label: "Field Reports", icon: "≡",  roles: ["field_officer","district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/dashboard/satellite",  label: "Satellite",     icon: "◎",  roles: ["district_admin","state_admin","super_admin"] },
  { href: "/dashboard/roads",      label: "Roads",         icon: "⟋",  roles: ["field_officer","district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/dashboard/evacuation", label: "Evacuation",    icon: "▷",  roles: ["district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/dashboard/simulator",  label: "Simulator",     icon: "⚙",  roles: ["district_admin","state_admin","super_admin"] },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/map",    label: "Public Map",  icon: "⊕", roles: ["citizen","field_officer","district_admin","state_admin","ndrf_officer","super_admin"] },
  { href: "/report", label: "File Report", icon: "⊙", roles: ["citizen","field_officer","district_admin","state_admin","ndrf_officer","super_admin"] },
];

export default function DashboardSidebar({ role }: { role: UserRole }) {
  const path = usePathname();
  const visible = (item: NavItem) => item.roles.includes(role);

  return (
    <aside style={{
      width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRight: "1px solid rgba(255,255,255,0.08)",
      background: "#080808",
    }}>
      {/* Logo */}
      <div style={{ height: 64, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ fontSize: 18 }}>🏔️</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: "white" }}>
            LandGuard<span style={{ color: "#71717a" }}>NER</span>
          </span>
        </Link>
      </div>

      {/* Primary Nav */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV.filter(visible).map((item) => {
          const active = path === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 10, textDecoration: "none",
              fontSize: 13, fontWeight: active ? 700 : 500,
              background: active ? "rgba(255,255,255,0.10)" : "transparent",
              color: active ? "#ffffff" : "#71717a",
              borderLeft: active ? "2px solid #ffffff" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 13, width: 16, textAlign: "center", fontFamily: "monospace" }}>{item.icon}</span>
              {item.label}
              {item.href === "/dashboard/alerts" && (
                <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite", display: "inline-block" }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ margin: "0 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }} />

      {/* Bottom Nav */}
      <nav style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {BOTTOM_NAV.filter(visible).map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 10, textDecoration: "none",
            fontSize: 12, color: "#52525b", transition: "color 0.15s",
          }}>
            <span style={{ fontSize: 13, fontFamily: "monospace" }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Role badge */}
      <div style={{ padding: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Role</div>
          <div style={{ fontSize: 11, color: "#71717a", marginTop: 3, textTransform: "capitalize" }}>{role.replace("_", " ")}</div>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </aside>
  );
}
