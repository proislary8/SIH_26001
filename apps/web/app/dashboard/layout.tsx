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
    <div className="dash-layout">
      <DashboardSidebar role={profile?.role ?? "citizen"} />
      <div className="dash-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <DashboardHeader user={{ email: user.email!, name: profile?.full_name ?? "", role: profile?.role ?? "citizen" }} />
        <main style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#000000" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
