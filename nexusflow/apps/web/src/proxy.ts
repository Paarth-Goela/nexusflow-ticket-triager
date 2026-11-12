import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

type Role = "CUSTOMER" | "FACTORY_AGENT" | "LOGISTICS_AGENT" | "OPERATIONS_ADMIN";
type RefreshedCookie = { apply: (response: NextResponse) => void };

function homeForRole(role: Role) {
  if (role === "CUSTOMER") return "/customer";
  if (role === "FACTORY_AGENT") return "/factory";
  if (role === "LOGISTICS_AGENT") return "/logistics";
  return "/operations";
}

function redirectWithSession(url: URL, cookies: RefreshedCookie[]) {
  const redirect = NextResponse.redirect(url);
  cookies.forEach(({ apply }) => apply(redirect));
  return redirect;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) return response;

  const refreshedCookies: RefreshedCookie[] = [];
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
          refreshedCookies.push({ apply: (target) => target.cookies.set(name, value, options) });
        });
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isProtectedPath = ["/customer", "/factory", "/operations", "/logistics"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isAuthPath = pathname === "/login" || pathname === "/signup";
  if (!isProtectedPath && !isAuthPath) return response;

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims || claimsError) {
    if (!isProtectedPath) return response;
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return redirectWithSession(login, refreshedCookies);
  }

  const userId = typeof claims.sub === "string" ? claims.sub : null;
  if (!userId) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "?error=session_invalid";
    return redirectWithSession(login, refreshedCookies);
  }

  // Authorization is derived only from the protected profiles table, never user metadata.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, department")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile?.role) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "?error=profile_unavailable";
    return redirectWithSession(login, refreshedCookies);
  }

  const role = profile.role as Role;
  const home = homeForRole(role);

  if (isAuthPath) {
    const destination = request.nextUrl.clone();
    destination.pathname = home;
    destination.search = "";
    return redirectWithSession(destination, refreshedCookies);
  }

  const allowed =
    (pathname === "/customer" || pathname.startsWith("/customer/")) ? role === "CUSTOMER" :
    (pathname === "/factory" || pathname.startsWith("/factory/")) ? role === "FACTORY_AGENT" || role === "OPERATIONS_ADMIN" :
    (pathname === "/logistics" || pathname.startsWith("/logistics/")) ? role === "LOGISTICS_AGENT" || role === "OPERATIONS_ADMIN" :
    (pathname === "/operations" || pathname.startsWith("/operations/")) ? role === "OPERATIONS_ADMIN" :
    false;

  if (!allowed) {
    const destination = request.nextUrl.clone();
    destination.pathname = home;
    destination.search = "";
    return redirectWithSession(destination, refreshedCookies);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
