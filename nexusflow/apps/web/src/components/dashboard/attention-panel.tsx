import { ArrowUpRight, Clock3, FileWarning, TriangleAlert, UserRound } from "lucide-react";
import type { Ticket } from "@/lib/types";
import { PriorityIndicator } from "../tickets/priority-indicator";

export function AttentionPanel({ tickets }: { tickets: Ticket[] }) {
  const items = [
    { ticket: tickets.find((item) => item.id === "NFX-1046"), label: "Critical production interruption", icon: TriangleAlert, tone: "text-[#B94A48]" },
    { ticket: tickets.find((item) => item.id === "NFX-1047"), label: "Shipment delay requires review", icon: FileWarning, tone: "text-[#C18A42]" },
    { ticket: tickets.find((item) => item.id === "NFX-1048"), label: "SLA approaching breach", icon: Clock3, tone: "text-[#C18A42]" },
    { ticket: tickets.find((item) => item.assignedTo === "Unassigned" && item.priority === "CRITICAL"), label: "Unassigned critical issue", icon: UserRound, tone: "text-[#B94A48]" },
  ].filter((item) => item.ticket);
  return <section id="escalations" className="border border-[#E1E4E2] bg-white"><div className="flex items-center justify-between border-b border-[#E1E4E2] px-5 py-4"><div className="flex items-center gap-2"><TriangleAlert size={17} className="text-[#B94A48]" /><h2 className="text-base font-semibold text-[#172B3A]">Operational attention</h2></div><span className="text-xs font-semibold text-[#B94A48]">{items.length} items</span></div><div className="divide-y divide-[#E1E4E2]">{items.map(({ ticket, label, icon: Icon, tone }) => ticket && <a href={`#${ticket.id}`} key={`${label}-${ticket.id}`} className="block px-5 py-3.5 hover:bg-[#FAFAF8]"><div className="flex items-start gap-3"><Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-[#172B3A]">{label}</p><PriorityIndicator priority={ticket.priority} /></div><p className="mt-1 truncate text-sm text-[#287D73]">{ticket.id} · {ticket.subject}</p><p className="mt-1 text-xs text-[#68747C]">SLA {ticket.slaDeadline} · {ticket.assignedTo}</p></div></div></a>)}</div><a href="#tickets" className="flex items-center gap-1 border-t border-[#E1E4E2] px-5 py-3 text-xs font-semibold text-[#287D73] hover:text-[#172B3A]">Review queue <ArrowUpRight size={14} /></a></section>;
}
