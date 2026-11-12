import type { TicketStatus } from "@/lib/types";
import { statusLabels } from "@/lib/utils";

const colors: Record<TicketStatus, string> = { NEW: "bg-slate-100 text-slate-700", AI_TRIAGED: "bg-[#e6f0ee] text-[#287D73]", ASSIGNED: "bg-[#e8edf1] text-[#426176]", IN_PROGRESS: "bg-[#e6f0ee] text-[#287D73]", WAITING_FOR_TEAM: "bg-[#f5ecdf] text-[#946b32]", RESOLVED: "bg-[#e6f0ee] text-[#397A59]", CLOSED: "bg-slate-100 text-slate-500" };

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`inline-flex whitespace-nowrap px-2 py-1 text-[11px] font-semibold ${colors[status]}`}>{statusLabels[status]}</span>;
}
