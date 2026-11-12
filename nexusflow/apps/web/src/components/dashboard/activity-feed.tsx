import { Activity as ActivityIcon } from "lucide-react";
import { useTickets } from "@/lib/ticket-context";

export function ActivityFeed() {
  const { activities } = useTickets();
  return <section className="border border-[#E1E4E2] bg-white"><div className="border-b border-[#E1E4E2] px-5 py-4"><h2 className="text-base font-semibold text-[#172B3A]">Recent operational activity</h2><p className="mt-1 text-xs text-[#68747C]">Latest updates from your teams</p></div><div className="divide-y divide-[#E1E4E2]">{activities.slice(0, 8).map((activity) => <div key={activity.id} className="flex items-start gap-3 px-5 py-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#e6f0ee] text-[#287D73]"><ActivityIcon size={15} /></div><div className="min-w-0 text-sm"><p className="text-[#172B3A]"><span className="font-semibold">{activity.message}</span></p><p className="mt-1 text-xs text-[#68747C]">{activity.actor} · {activity.timestamp} · {activity.public ? "Customer-visible" : "Internal"}</p></div></div>)}</div></section>;
}
