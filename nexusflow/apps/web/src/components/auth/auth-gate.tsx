"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthGate({ children }: { children: ReactNode }) {
  const configured = Boolean(createClient());
  const [state, setState] = useState<"loading" | "ready" | "signed-out">(() => configured ? "loading" : "ready");
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setState(data.user ? "ready" : "signed-out"));
  }, []);
  if (state === "loading") return <div className="p-8 text-sm text-[#68747C]">Loading workspace...</div>;
  if (state === "signed-out") return <div className="flex min-h-[50vh] items-center justify-center p-8 text-center"><div><p className="text-sm font-semibold text-[#172B3A]">Sign in required</p><p className="mt-1 text-sm text-[#68747C]">Authenticate to access persistent NexusFlow data.</p><a href="/login" className="mt-4 inline-block bg-[#287D73] px-4 py-2 text-sm font-semibold text-white">Go to sign in</a></div></div>;
  return <>{!configured && <div className="border-b border-[#C18A42]/30 bg-[#fff8ed] px-5 py-2 text-center text-xs text-[#946b32]">Development demo mode: Supabase is not configured; changes are not production-persistent.</div>}{children}</>;
}
