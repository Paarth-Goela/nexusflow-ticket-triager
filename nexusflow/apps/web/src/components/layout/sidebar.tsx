"use client";

import Link from "next/link";
import { BarChart3, ChevronDown, Factory, LayoutDashboard, ListChecks, Settings, Truck, TriangleAlert } from "lucide-react";

const navigation = [
  { label: "Overview", href: "/operations", icon: LayoutDashboard },
  { label: "All Tickets", href: "/operations#tickets", icon: ListChecks },
  { label: "Factory Hub", href: "/factory", icon: Factory },
  { label: "Logistics Hub", href: "/logistics", icon: Truck },
  { label: "Escalations", href: "/operations#escalations", icon: TriangleAlert },
  { label: "Analytics", href: "/operations#analytics", icon: BarChart3 },
];

export function Sidebar() {
  return (
    <aside className="flex w-full shrink-0 flex-col bg-[#142431] text-white lg:fixed lg:inset-y-0 lg:w-64">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <Link href="/operations" className="flex items-center gap-3" aria-label="NexusFlow overview">
          <span className="flex h-8 w-8 items-center justify-center bg-[#287D73] text-sm font-bold">N</span>
          <span><span className="block text-lg font-semibold tracking-tight">NEXUSFLOW</span><span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Operational Intelligence</span></span>
        </Link>
        <button className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Open navigation"><ChevronDown size={18} /></button>
      </div>
      <div className="px-4 py-3 lg:py-6">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Workspace</p>
        <nav className="mt-3 flex gap-1 overflow-x-auto lg:block lg:space-y-1" aria-label="Main navigation">
          {navigation.map(({ label, href, icon: Icon }, index) => (
            <Link key={label} href={href} className={`flex shrink-0 items-center gap-3 px-3 py-2.5 text-sm transition-colors ${index === 0 ? "bg-white/10 font-medium text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
              <Icon size={17} strokeWidth={1.8} />{label}
              {label === "Escalations" && <span className="ml-auto bg-[#B94A48] px-1.5 py-0.5 text-[10px] font-semibold">3</span>}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-auto hidden border-t border-white/10 px-4 py-5 lg:block">
        <Link href="/operations#settings" className="flex items-center gap-3 px-3 py-2.5 text-sm text-white/65 hover:bg-white/10 hover:text-white"><Settings size={17} strokeWidth={1.8} />Settings</Link>
        <div className="mt-5 flex items-center gap-3 px-3"><div className="flex h-8 w-8 items-center justify-center bg-[#287D73] text-xs font-semibold">JD</div><div className="min-w-0"><p className="truncate text-sm font-medium">Jordan Davis</p><p className="truncate text-xs text-white/45">Operations lead</p></div></div>
      </div>
    </aside>
  );
}
