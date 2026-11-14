"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowUpRight, CheckCircle2, Clock3, LayoutDashboard,
  Search, ShieldCheck, Ticket as TicketIcon, Users,
} from "lucide-react";
import { AuthGate } from "@/components/auth/auth-gate";
import { LogoutButton } from "@/components/auth/logout-button";
import { TicketDetailPanel } from "@/components/tickets/ticket-detail-panel";
import { PriorityIndicator } from "@/components/tickets/priority-indicator";
import { StatusBadge } from "@/components/tickets/status-badge";
import { useTickets } from "@/lib/ticket-context";
import { createClient } from "@/lib/supabase/client";
import { isOpen } from "@/lib/utils";
import type { Department, DemoRole, Ticket } from "@/lib/types";

type Tab = "overview" | "tickets" | "people" | "activity";
type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  role: DemoRole;
  department: Department | null;
  created_at: string;
};

const roleLabels: Record<DemoRole, string> = {
  CUSTOMER: "Customer",
  FACTORY_AGENT: "Factory agent",
  LOGISTICS_AGENT: "Logistics agent",
  OPERATIONS_ADMIN: "Operations admin",
  SYSTEM_ADMIN: "System admin",
};

const departmentLabels: Record<Department, string> = {
  FACTORY: "Factory",
  OPERATIONS: "Operations",
  LOGISTICS: "Logistics",
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function AdminConsole() {
  const { tickets, activities, loading, error } = useTickets();
  const [tab, setTab] = useState<Tab>("overview");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      const supabase = createClient();
      if (!supabase) {
        if (active) {
          setUsersError("User directory requires a connected Supabase project.");
          setUsersLoading(false);
        }
        return;
      }
      const { data, error: resultError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, department, created_at")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (resultError) setUsersError(resultError.message);
      else setUsers((data ?? []) as AdminUser[]);
      setUsersLoading(false);
    }
    void loadUsers();
    return () => { active = false; };
  }, []);

  const openTickets = tickets.filter(isOpen);
  const criticalTickets = tickets.filter((ticket) => ticket.priority === "CRITICAL" && isOpen(ticket));
  const resolvedTickets = tickets.filter((ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED");
  const unassignedTickets = tickets.filter((ticket) => !ticket.assignedToId && ticket.assignedTo === "Unassigned" && isOpen(ticket));

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesQuery = !normalized || [
        ticket.id, ticket.subject, ticket.customer, ticket.customerEmail,
        ticket.category, ticket.description, ticket.shipmentId ?? "",
      ].some((value) => value.toLowerCase().includes(normalized));
      const matchesDepartment = departmentFilter === "ALL" || ticket.department === departmentFilter;
      const matchesStatus = statusFilter === "ALL" || ticket.status === statusFilter;
      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [tickets, query, departmentFilter, statusFilter]);

  const recentActivity = useMemo(() => activities
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12), [activities]);

  const departments: Department[] = ["OPERATIONS", "FACTORY", "LOGISTICS"];
  const maxDepartmentCount = Math.max(1, ...departments.map((department) => tickets.filter((ticket) => ticket.department === department).length));

  const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "tickets", label: "All tickets", icon: TicketIcon },
    { id: "people", label: "People & access", icon: Users },
    { id: "activity", label: "Audit activity", icon: Activity },
  ];

  return <div className="min-h-screen bg-[#F5F5F1] text-[#172B3A]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#263946] bg-[#142431] text-white lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="flex h-8 w-8 items-center justify-center bg-[#287D73] text-sm font-bold">N</span>
        <div><p className="text-sm font-semibold tracking-wide">NEXUSFLOW</p><p className="text-[9px] uppercase tracking-[0.16em] text-white/55">System administration</p></div>
      </div>
      <div className="px-4 pt-6">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Platform</p>
        <nav className="mt-2 space-y-1" aria-label="Admin navigation">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${tab === id ? "bg-white/10 font-semibold text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}><Icon size={16} />{label}</button>)}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-4">
        <div className="flex items-center gap-2 px-2 py-2"><ShieldCheck size={16} className="text-[#70B5A9]" /><div><p className="text-xs font-semibold">System Admin</p><p className="text-[10px] text-white/50">Platform-wide access</p></div></div>
        <div className="mt-2"><LogoutButton /></div>
      </div>
    </aside>

    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E1E4E2] bg-white px-5 sm:px-8">
        <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center bg-[#287D73] text-sm font-bold text-white lg:hidden">N</span><div><p className="text-sm font-semibold">Platform control</p><p className="text-[10px] text-[#68747C]">NexusFlow / System Admin</p></div></div>
        <div className="flex items-center gap-3"><span className="hidden text-xs text-[#68747C] sm:inline">Restricted administrator workspace</span><div className="lg:hidden"><LogoutButton /></div></div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold text-[#287D73]">PLATFORM OVERVIEW</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{navItems.find((item) => item.id === tab)?.label}</h1><p className="mt-1 text-sm text-[#68747C]">A consolidated view of tickets, teams and operational activity.</p></div>
          <div className="text-xs text-[#68747C]">Live workspace overview</div>
        </div>

        {error && <div className="border border-[#B94A48]/30 bg-white px-4 py-3 text-sm text-[#B94A48]" role="alert">{error}</div>}

        {tab === "overview" && <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={TicketIcon} label="Total tickets" value={tickets.length} detail="Across all departments" />
            <Metric icon={Clock3} label="Open tickets" value={openTickets.length} detail="Awaiting closure" />
            <Metric icon={AlertCircle} label="Critical open" value={criticalTickets.length} detail="Requires attention" tone="critical" />
            <Metric icon={CheckCircle2} label="Resolved / closed" value={resolvedTickets.length} detail="Completed tickets" tone="success" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="border border-[#E1E4E2] bg-white">
              <div className="flex items-center justify-between border-b border-[#E1E4E2] px-5 py-4"><div><h2 className="text-sm font-semibold">Department distribution</h2><p className="mt-1 text-xs text-[#68747C]">Current ticket volume by owning team</p></div><button onClick={() => setTab("tickets")} className="text-xs font-semibold text-[#287D73]">View tickets <ArrowUpRight size={13} className="ml-1 inline" /></button></div>
              <div className="space-y-5 p-5">{departments.map((department) => { const count = tickets.filter((ticket) => ticket.department === department).length; const percent = Math.round((count / Math.max(1, tickets.length)) * 100); return <div key={department}><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium">{departmentLabels[department]}</span><span className="tabular-nums text-[#68747C]">{count} tickets · {percent}%</span></div><div className="h-2 overflow-hidden bg-[#EEF0ED]"><div className="h-full bg-[#287D73]" style={{ width: `${(count / maxDepartmentCount) * 100}%` }} /></div></div>; })}</div>
            </div>
            <div className="border border-[#E1E4E2] bg-white">
              <div className="border-b border-[#E1E4E2] px-5 py-4"><h2 className="text-sm font-semibold">Queue health</h2><p className="mt-1 text-xs text-[#68747C]">Items needing administrative review</p></div>
              <div className="divide-y divide-[#E1E4E2]">
                <QueueRow label="Unassigned open tickets" value={unassignedTickets.length} onClick={() => { setTab("tickets"); setStatusFilter("ALL"); }} />
                <QueueRow label="Critical tickets" value={criticalTickets.length} onClick={() => { setTab("tickets"); setStatusFilter("ALL"); }} />
                <QueueRow label="Factory tickets" value={tickets.filter((ticket) => ticket.department === "FACTORY").length} onClick={() => { setTab("tickets"); setDepartmentFilter("FACTORY"); }} />
                <QueueRow label="Operations tickets" value={tickets.filter((ticket) => ticket.department === "OPERATIONS").length} onClick={() => { setTab("tickets"); setDepartmentFilter("OPERATIONS"); }} />
              </div>
            </div>
          </section>

          <section className="border border-[#E1E4E2] bg-white">
            <div className="flex items-center justify-between border-b border-[#E1E4E2] px-5 py-4"><div><h2 className="text-sm font-semibold">Recently updated tickets</h2><p className="mt-1 text-xs text-[#68747C]">Latest changes across the platform</p></div><button onClick={() => setTab("tickets")} className="text-xs font-semibold text-[#287D73]">Open ticket register <ArrowUpRight size={13} className="ml-1 inline" /></button></div>
            <TicketRows tickets={tickets.slice(0, 6)} onSelect={setSelectedTicket} />
          </section>
        </>}

        {tab === "tickets" && <section className="border border-[#E1E4E2] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E4E2] px-5 py-4"><div><h2 className="text-sm font-semibold">Global ticket register</h2><p className="mt-1 text-xs text-[#68747C]">{filteredTickets.length} of {tickets.length} tickets</p></div><div className="flex flex-wrap gap-2"><label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#68747C]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" className="w-52 border border-[#E1E4E2] py-2 pl-9 pr-3 text-xs outline-none focus:border-[#287D73]" /></label><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="border border-[#E1E4E2] bg-white px-3 py-2 text-xs"><option value="ALL">All departments</option><option value="OPERATIONS">Operations</option><option value="FACTORY">Factory</option><option value="LOGISTICS">Logistics</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-[#E1E4E2] bg-white px-3 py-2 text-xs"><option value="ALL">All statuses</option>{["NEW","AI_TRIAGED","ASSIGNED","IN_PROGRESS","WAITING_FOR_TEAM","RESOLVED","CLOSED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div></div>
          {loading ? <p className="p-5 text-sm text-[#68747C]">Loading ticket register...</p> : <TicketRows tickets={filteredTickets} onSelect={setSelectedTicket} />}
        </section>}

        {tab === "people" && <section className="border border-[#E1E4E2] bg-white">
          <div className="border-b border-[#E1E4E2] px-5 py-4"><h2 className="text-sm font-semibold">People & access directory</h2><p className="mt-1 text-xs text-[#68747C]">All registered customer and employee profiles. Role changes remain restricted to trusted provisioning.</p></div>
          {usersLoading ? <p className="p-5 text-sm text-[#68747C]">Loading user directory...</p> : usersError ? <p className="p-5 text-sm text-[#B94A48]" role="alert">{usersError}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-[#FAFAF8] text-[10px] uppercase tracking-wider text-[#68747C]"><tr>{["Person","Email","Role","Department","Joined"].map((heading) => <th key={heading} className="px-5 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#E1E4E2]">{users.map((user) => <tr key={user.id}><td className="px-5 py-3 text-sm font-medium">{user.full_name || "Unnamed user"}</td><td className="px-5 py-3 text-xs text-[#68747C]">{user.email}</td><td className="px-5 py-3"><span className={`inline-flex border px-2 py-1 text-[10px] font-semibold ${user.role === "SYSTEM_ADMIN" ? "border-[#287D73]/30 bg-[#287D73]/5 text-[#20665E]" : "border-[#E1E4E2] text-[#52616A]"}`}>{roleLabels[user.role] ?? user.role}</span></td><td className="px-5 py-3 text-xs text-[#68747C]">{user.department ? departmentLabels[user.department] : "—"}</td><td className="px-5 py-3 text-xs text-[#68747C]">{dateLabel(user.created_at)}</td></tr>)}</tbody></table>{users.length === 0 && <p className="p-5 text-sm text-[#68747C]">No user profiles found.</p>}</div>}
        </section>}

        {tab === "activity" && <section className="border border-[#E1E4E2] bg-white">
          <div className="border-b border-[#E1E4E2] px-5 py-4"><h2 className="text-sm font-semibold">Ticket activity history</h2><p className="mt-1 text-xs text-[#68747C]">Events and messages visible to the system administrator</p></div>
          <div className="divide-y divide-[#E1E4E2]">{recentActivity.map((item) => <div key={item.id} className="flex gap-3 px-5 py-4"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-[#F1F4F1] text-[#287D73]"><Activity size={14} /></span><div className="min-w-0 flex-1"><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-[#68747C]">{item.actor} · {dateLabel(item.timestamp)}</p></div><span className="shrink-0 text-[10px] text-[#68747C]">{item.public ? "Customer-visible" : "Internal"}</span></div>)}{recentActivity.length === 0 && <p className="p-5 text-sm text-[#68747C]">No ticket activity has been recorded yet.</p>}</div>
        </section>}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1E4E2] pt-4 text-[11px] text-[#68747C]"><span>NexusFlow System Administration</span><span>Platform-wide visibility · Role-protected access</span></footer>
      </main>
    </div>
    {selectedTicket && <TicketDetailPanel ticket={tickets.find((ticket) => ticket.id === selectedTicket.id) ?? selectedTicket} onClose={() => setSelectedTicket(null)} />}
  </div>;
}

function Metric({ icon: Icon, label, value, detail, tone = "default" }: { icon: typeof TicketIcon; label: string; value: number; detail: string; tone?: "default" | "critical" | "success" }) {
  const iconClass = tone === "critical" ? "text-[#B94A48]" : tone === "success" ? "text-[#397A59]" : "text-[#287D73]";
  return <div className="border border-[#E1E4E2] bg-white p-4"><div className="flex items-center justify-between"><p className="text-xs text-[#68747C]">{label}</p><Icon size={16} className={iconClass} /></div><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-[#68747C]">{detail}</p></div>;
}

function QueueRow({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[#FAFAF8]"><span className="text-xs text-[#52616A]">{label}</span><span className="flex items-center gap-2 text-sm font-semibold tabular-nums">{value}<ArrowUpRight size={13} className="text-[#287D73]" /></span></button>;
}

function TicketRows({ tickets, onSelect }: { tickets: Ticket[]; onSelect: (ticket: Ticket) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-[#FAFAF8] text-[10px] uppercase tracking-wider text-[#68747C]"><tr>{["Ticket","Customer","Department","Priority","Status","Assigned to","Last updated"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#E1E4E2]">{tickets.map((ticket) => <tr key={ticket.id} onClick={() => onSelect(ticket)} className="cursor-pointer hover:bg-[#FAFAF8]"><td className="px-4 py-3"><span className="text-[11px] font-semibold text-[#287D73]">{ticket.id}</span><p className="mt-1 max-w-[230px] truncate text-xs font-medium">{ticket.subject}</p></td><td className="px-4 py-3"><p className="text-xs font-medium">{ticket.customer}</p><p className="mt-1 text-[10px] text-[#68747C]">{ticket.customerEmail}</p></td><td className="px-4 py-3 text-xs">{departmentLabels[ticket.department]}</td><td className="px-4 py-3"><PriorityIndicator priority={ticket.priority} /></td><td className="px-4 py-3"><StatusBadge status={ticket.status} /></td><td className="px-4 py-3 text-xs">{ticket.assignedTo}</td><td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#68747C]">{dateLabel(ticket.updatedAt)}</td></tr>)}</tbody></table>{tickets.length === 0 && <p className="p-5 text-sm text-[#68747C]">No tickets match the current filters.</p>}</div>;
}

export default function AdminPage() {
  return <AuthGate><AdminConsole /></AuthGate>;
}
