import Link from "next/link";
import { Factory, LayoutDashboard, Truck, UserRound } from "lucide-react";

const portals = [
  { href: "/customer", label: "Customer Portal", description: "Submit and track service issues.", icon: UserRound },
  { href: "/factory", label: "Factory Hub", description: "Manage production and quality incidents.", icon: Factory },
  { href: "/operations", label: "Operations Hub", description: "Monitor the complete ticket network.", icon: LayoutDashboard },
  { href: "/logistics", label: "Logistics Hub", description: "Coordinate shipments and delivery exceptions.", icon: Truck },
];

export default function Home() {
  return <main className="min-h-screen bg-[#F5F5F1] px-5 py-12 text-[#172B3A] sm:px-10"><div className="mx-auto max-w-5xl"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center bg-[#287D73] text-sm font-bold text-white">N</span><div><p className="font-semibold tracking-tight">NEXUSFLOW</p><p className="text-[10px] uppercase tracking-[0.16em] text-[#68747C]">Operational Intelligence</p></div></div><div className="mt-20 max-w-2xl"><p className="text-sm font-semibold text-[#287D73]">Connected ticket management</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">One operational view for every team.</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#68747C]">NexusFlow connects customers, factories, operations teams and logistics coordinators around the same service record.</p></div><nav className="mt-14 grid gap-3 sm:grid-cols-2" aria-label="NexusFlow portals">{portals.map(({ href, label, description, icon: Icon }) => <Link key={href} href={href} className="group border border-[#E1E4E2] bg-white p-5 hover:border-[#287D73]"><Icon size={20} className="text-[#287D73]" /><h2 className="mt-8 text-base font-semibold">{label}</h2><p className="mt-1 text-sm text-[#68747C]">{description}</p><span className="mt-5 block text-xs font-semibold text-[#287D73] group-hover:text-[#20665E]">Open portal →</span></Link>)}</nav><p className="mt-10 text-xs text-[#68747C]">Demo environment. Authentication and server-side authorization will be added in a future milestone.</p></div></main>;
}
