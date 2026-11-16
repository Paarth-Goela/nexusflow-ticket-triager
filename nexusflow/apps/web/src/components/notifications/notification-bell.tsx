"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  ticket_id: string | null;
  category: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
type Preferences = { email_enabled: boolean; in_app_enabled: boolean };

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({ email_enabled: true, in_app_enabled: true });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    const load = async () => {
      const { data, error: resultError } = await supabase
        .from("notifications")
        .select("id, ticket_id, category, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (!active) return;
      if (resultError) setError(`Notifications could not be loaded: ${resultError.message}`);
      else setItems((data ?? []) as Notification[]);
      const { data: preference } = await supabase.from("notification_preferences").select("email_enabled, in_app_enabled").maybeSingle();
      if (active && preference) setPreferences(preference as Preferences);
    };
    void load();
    const channel = supabase
      .channel("nexusflow-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { void load(); })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setError("Live notification updates are unavailable; refresh to retry.");
      });
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);

  const unread = items.filter((item) => !item.read_at).length;
  const markRead = async (id: string) => {
    const supabase = createClient();
    if (!supabase) return;
    const { error: resultError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (resultError) setError(resultError.message);
    else setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  };
  const markAllRead = async () => {
    const supabase = createClient();
    if (!supabase || !unread) return;
    const { error: resultError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (resultError) setError(resultError.message);
    else setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  };
  const updatePreference = async (key: keyof Preferences, value: boolean) => {
    const supabase = createClient();
    if (!supabase) return;
    const { error: resultError } = await supabase.from("notification_preferences").update({ [key]: value }).eq("user_id", (await supabase.auth.getUser()).data.user?.id);
    if (resultError) setError(resultError.message);
    else setPreferences((current) => ({ ...current, [key]: value }));
  };

  return <div className="relative">
    <button className="relative p-2 text-[#68747C] hover:text-[#172B3A]" aria-label={`View notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((value) => !value)}>
      <Bell size={19} strokeWidth={1.8} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 bg-[#B94A48] px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-11 z-50 w-80 border border-[#E1E4E2] bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[#E1E4E2] px-4 py-3"><p className="text-sm font-semibold">Notifications</p><button className="flex items-center gap-1 text-[11px] text-[#287D73]" onClick={() => { void markAllRead(); }}><CheckCheck size={13} />Mark all read</button></div>
      {error && <p className="px-4 py-2 text-xs text-[#B94A48]" role="alert">{error}</p>}
      <div className="flex gap-4 border-b border-[#E1E4E2] px-4 py-2 text-[11px] text-[#68747C]"><label><input type="checkbox" checked={preferences.in_app_enabled} onChange={(event) => { void updatePreference("in_app_enabled", event.target.checked); }} /> In-app</label><label><input type="checkbox" checked={preferences.email_enabled} onChange={(event) => { void updatePreference("email_enabled", event.target.checked); }} /> Email</label></div>
      <div className="max-h-96 overflow-y-auto">{items.length === 0 ? <p className="px-4 py-8 text-center text-xs text-[#68747C]">No notifications yet.</p> : items.map((item) => <div key={item.id} className={`border-b border-[#E1E4E2] px-4 py-3 ${item.read_at ? "" : "bg-[#f1f7f5]"}`}><div className="flex items-start gap-2"><button className="min-w-0 flex-1 text-left" onClick={() => { void markRead(item.id); }}><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#68747C]">{item.body}</p><p className="mt-1 text-[10px] text-[#68747C]">{new Date(item.created_at).toLocaleString()}</p></button>{item.ticket_id && <Link href="/operations#tickets" className="text-[10px] font-semibold text-[#287D73]" onClick={() => { void markRead(item.id); }}>Open</Link>}</div></div>)}</div>
    </div>}
  </div>;
}
