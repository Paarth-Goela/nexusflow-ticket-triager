import { redirect } from "next/navigation";
import AdminConsole from "./admin-console";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const roleHomes: Record<string, string> = {
  CUSTOMER: "/customer",
  FACTORY_AGENT: "/factory",
  LOGISTICS_AGENT: "/logistics",
  OPERATIONS_ADMIN: "/operations",
  SYSTEM_ADMIN: "/admin",
};

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=admin_requires_auth");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/login?error=auth_required");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile?.role) redirect("/login?error=profile_unavailable");
  if (profile.role !== "SYSTEM_ADMIN") redirect(roleHomes[profile.role] ?? "/login");

  return <AdminConsole />;
}
