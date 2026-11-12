import { Factory, Settings2, Truck } from "lucide-react";
import type { Department, Ticket } from "@/lib/types";
import { isOpen } from "@/lib/utils";

const config: Record<Department, { label: string; icon: typeof Factory; color: string }> = { FACTORY: { label: "Factory", icon: Factory, color: "bg-[#287D73]" }, OPERATIONS: { label: "Operations", icon: Settings2, color: "bg-[#C18A42]" }, LOGISTICS: { label: "Logistics", icon: Truck, color: "bg-[#426176]" } };

export function DepartmentWorkload({ tickets }: { tickets: Ticket[] }) {
  const open = tickets.filter(isOpen);
  return <section id="analytics" className="border border-[#E1E4E2] bg-white"><div className="border-b border-[#E1E4E2] px-5 py-4"><h2 className="text-base font-semibold text-[#172B3A]">Department workload</h2><p className="mt-1 text-xs text-[#68747C]">Open and critical tickets by team</p></div><div className="space-y-5 px-5 py-5">{(Object.keys(config) as Department[]).map((department) => { const departmentTickets = open.filter((ticket) => ticket.department === department); const critical = departmentTickets.filter((ticket) => ticket.priority === "CRITICAL").length; const { label, icon: Icon, color } = config[department]; return <div key={department}><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium text-[#172B3A]"><Icon size={16} className="text-[#68747C]" />{label}</span><span className="text-xs font-semibold text-[#172B3A]">{departmentTickets.length} open <span className="font-normal text-[#B94A48]">· {critical} critical</span></span></div><div className="h-2 bg-[#F0F1EE]"><div className={`h-2 ${color}`} style={{ width: `${Math.max((departmentTickets.length / Math.max(open.length, 1)) * 100, 8)}%` }} /></div></div>; })}</div></section>;
}
