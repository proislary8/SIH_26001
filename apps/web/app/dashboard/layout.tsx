import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardSidebar from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/Header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, role, district_id")
    .eq("id", user.id)
    .single();

  return (
    <div style={{ display: "flex", height: "100vh", background: "#000000", color: "#ffffff", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <DashboardSidebar role={profile?.role ?? "citizen"} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <DashboardHeader user={{ email: user.email!, name: profile?.full_name ?? "", role: profile?.role ?? "citizen" }} />
        <main style={{ flex: 1, overflowY: "auto", padding: 24, background: "#000000" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
