import { AlertCircle, CheckCircle2, Clock3, Inbox } from "lucide-react";
import type { Ticket } from "@/lib/types";

export function MetricStrip({ tickets }: { tickets: Ticket[] }) {
  const metrics = [
    { label: "Open tickets", value: tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length, note: "Across all departments", icon: Inbox, color: "text-[#287D73]" },
    { label: "Critical issues", value: tickets.filter((t) => t.priority === "CRITICAL" && t.status !== "CLOSED").length, note: "Active critical priority", icon: AlertCircle, color: "text-[#B94A48]" },
    { label: "Awaiting assignment", value: tickets.filter((t) => t.assignedTo === "Unassigned").length, note: "Tickets without an owner", icon: Clock3, color: "text-[#C18A42]" },
    { label: "Resolved today", value: tickets.filter((t) => t.status === "RESOLVED").length, note: "Resolved in this period", icon: CheckCircle2, color: "text-[#397A59]" },
  ];
  return <section className="grid grid-cols-2 divide-x divide-y divide-[#E1E4E2] border border-[#E1E4E2] bg-white lg:grid-cols-4 lg:divide-y-0" aria-label="Operational metrics">{metrics.map(({ label, value, note, icon: Icon, color }) => <div key={label} className="flex items-start gap-3 p-4 sm:p-5"><Icon size={18} className={`mt-0.5 ${color}`} strokeWidth={1.8} /><div><p className="text-2xl font-semibold tracking-tight text-[#172B3A]">{value}</p><p className="mt-1 text-xs font-semibold text-[#172B3A]">{label}</p><p className="mt-1 hidden text-xs text-[#68747C] sm:block">{note}</p></div></div>)}</section>;
}
