import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient | undefined;

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  client ??= createBrowserClient(env.url, env.publishableKey);
  return client;
}
