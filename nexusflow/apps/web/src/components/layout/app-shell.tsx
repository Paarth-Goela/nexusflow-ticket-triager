import type { ReactNode } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function AppShell({ children, pageTitle }: { children: ReactNode; pageTitle: string }) {
  return <div className="min-h-screen bg-[#F5F5F1]"><Sidebar /><div className="lg:pl-64"><Header pageTitle={pageTitle} /><main className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">{children}</main></div></div>;
}
