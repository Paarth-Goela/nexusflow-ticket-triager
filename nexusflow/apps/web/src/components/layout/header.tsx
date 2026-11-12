import { Bell, Search } from "lucide-react";

export function Header({ pageTitle }: { pageTitle: string }) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-[#E1E4E2] bg-white px-5 py-3 sm:px-8">
      <div><p className="hidden text-[11px] text-[#68747C] sm:block">Workspace / Overview</p><h2 className="text-base font-semibold text-[#172B3A]">{pageTitle}</h2></div>
      <div className="flex items-center gap-4">
        <label className="hidden items-center gap-2 border border-[#E1E4E2] bg-[#F5F5F1] px-3 py-2 sm:flex"><Search size={16} className="text-[#68747C]" /><span className="sr-only">Search tickets</span><input className="w-40 bg-transparent text-sm text-[#172B3A] outline-none placeholder:text-[#68747C] lg:w-56" placeholder="Search tickets..." /></label>
        <button className="relative p-2 text-[#68747C] hover:text-[#172B3A]" aria-label="View notifications"><Bell size={19} strokeWidth={1.8} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 bg-[#B94A48]" /></button>
        <div className="flex h-8 w-8 items-center justify-center bg-[#172B3A] text-xs font-semibold text-white" aria-label="Jordan Davis profile">JD</div>
      </div>
    </header>
  );
}
