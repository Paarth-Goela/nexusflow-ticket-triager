import type { Priority } from "@/lib/types";
import { priorityLabels } from "@/lib/utils";

const colors: Record<Priority, string> = { CRITICAL: "bg-[#B94A48]", HIGH: "bg-[#C18A42]", MEDIUM: "bg-[#287D73]", LOW: "bg-[#9aa4a8]" };

export function PriorityIndicator({ priority }: { priority: Priority }) {
  return <span className="inline-flex items-center gap-2 text-xs font-medium text-[#68747C]"><span className={`h-2 w-2 rounded-full ${colors[priority]}`} />{priorityLabels[priority]}</span>;
}
