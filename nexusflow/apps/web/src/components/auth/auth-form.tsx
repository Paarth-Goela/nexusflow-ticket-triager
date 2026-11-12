"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured. Add the required variables to .env.local.");
      setPending(false);
      return;
    }
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (result.error) setError(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Account created. Check your email to confirm the account, then sign in.");
    else router.push("/operations");
    setPending(false);
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#F5F5F1] px-5"><form onSubmit={submit} className="w-full max-w-md border border-[#E1E4E2] bg-white p-6"><p className="text-sm font-semibold tracking-tight text-[#172B3A]">NEXUSFLOW</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#68747C]">Operational Intelligence</p><h1 className="mt-10 text-xl font-semibold text-[#172B3A]">{mode === "login" ? "Sign in" : "Create customer account"}</h1><p className="mt-1 text-sm text-[#68747C]">{mode === "login" ? "Access your workspace." : "Customer registration only. Employee roles are provisioned separately."}</p>{mode === "signup" && <label className="mt-6 block text-xs font-semibold text-[#68747C]">Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full border border-[#E1E4E2] px-3 py-2.5 text-sm font-normal text-[#172B3A]" /></label>}<label className="mt-4 block text-xs font-semibold text-[#68747C]">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full border border-[#E1E4E2] px-3 py-2.5 text-sm font-normal text-[#172B3A]" /></label><label className="mt-4 block text-xs font-semibold text-[#68747C]">Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full border border-[#E1E4E2] px-3 py-2.5 text-sm font-normal text-[#172B3A]" /></label>{error && <p className="mt-4 text-sm text-[#B94A48]" role="alert">{error}</p>}{message && <p className="mt-4 text-sm text-[#397A59]" role="status">{message}</p>}<button disabled={pending} className="mt-6 w-full bg-[#287D73] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button><a href={mode === "login" ? "/signup" : "/login"} className="mt-4 block text-center text-xs font-semibold text-[#287D73]">{mode === "login" ? "Create a customer account" : "Already have an account? Sign in"}</a></form></main>;
}
