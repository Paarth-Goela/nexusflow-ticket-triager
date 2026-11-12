"use client";

import { CalendarDays } from "lucide-react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { DepartmentWorkload } from "@/components/dashboard/department-workload";
import { MetricStrip } from "@/components/dashboard/metric-strip";
import { TicketTable } from "@/components/dashboard/ticket-table";
import { AppShell } from "@/components/layout/app-shell";
import { useTickets } from "@/lib/ticket-context";

export default function OperationsPage() {
  const { tickets: ticketData } = useTickets();

  return <AppShell pageTitle="Operations Overview"><div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-[#68747C]">Thursday, 13 November 2026</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#172B3A]">Operations Overview</h1><p className="mt-1 text-sm text-[#68747C]">Monitor operational incidents, departmental workloads and service-level performance.</p></div><label className="flex items-center gap-2 border border-[#E1E4E2] bg-white px-3 py-2 text-xs font-medium text-[#172B3A]"><CalendarDays size={15} className="text-[#68747C]" /><span className="sr-only">Reporting period</span><select className="bg-transparent outline-none"><option>Today · 13 Nov 2026</option><option>Last 7 days</option><option>Last 30 days</option></select></label></div><MetricStrip tickets={ticketData} /><TicketTable tickets={ticketData} /><div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]"><AttentionPanel tickets={ticketData} /><DepartmentWorkload tickets={ticketData} /></div><ActivityFeed /></div></AppShell>;
}
