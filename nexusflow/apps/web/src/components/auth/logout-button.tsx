"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return <button onClick={logout} className="text-xs text-[#68747C] hover:text-[#172B3A]">Sign out</button>;
}
