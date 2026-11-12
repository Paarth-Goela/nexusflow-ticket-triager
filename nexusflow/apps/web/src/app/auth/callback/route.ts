import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Role = "CUSTOMER" | "FACTORY_AGENT" | "LOGISTICS_AGENT" | "OPERATIONS_ADMIN";

function routeForRole(role: Role) {
  if (role === "CUSTOMER") return "/customer";
  if (role === "FACTORY_AGENT") return "/factory";
  if (role === "LOGISTICS_AGENT") return "/logistics";
  return "/operations";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (!supabase || !code) {
    return NextResponse.redirect(new URL("/login?error=callback_invalid", url.origin));
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=callback_failed", url.origin));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.redirect(new URL("/login?error=session_invalid", url.origin));
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.role) {
    return NextResponse.redirect(new URL("/login?error=profile_unavailable", url.origin));
  }

  return NextResponse.redirect(new URL(routeForRole(profile.role as Role), url.origin));
}
