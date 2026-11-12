"use client";

import { FormEvent, useState } from "react";
import { ClipboardCheck, Send } from "lucide-react";
import { PortalShell } from "@/components/layout/portal-shell";
import { TicketDetailPanel } from "@/components/tickets/ticket-detail-panel";
import { StatusBadge } from "@/components/tickets/status-badge";
import { useTickets } from "@/lib/ticket-context";
import type { Ticket } from "@/lib/types";

const categories = ["Production issue", "Product quality", "Shipment delay", "Delivery issue", "Documentation", "Other"];

export default function CustomerPage() {
  const { tickets, createTicket } = useTickets();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [confirmation, setConfirmation] = useState<Ticket | null>(null);
  const [form, setForm] = useState({ name: "", company: "", orderId: "", shipmentId: "", category: categories[0], subject: "", description: "" });
  const customerTickets = email ? tickets.filter((ticket) => ticket.customerEmail.toLowerCase() === email.toLowerCase()) : [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticket = createTicket({ subject: form.subject, description: `${form.description}${form.orderId ? ` Order ID: ${form.orderId}.` : ""}${form.shipmentId ? ` Shipment ID: ${form.shipmentId}.` : ""}`, customer: form.company || form.name, customerEmail: email, category: form.category });
    setConfirmation(ticket);
    setForm({ name: "", company: "", orderId: "", shipmentId: "", category: categories[0], subject: "", description: "" });
  }

  return <PortalShell title="Customer Portal" description="Submit an operational issue and keep track of updates from the teams working on it."><div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]"><section className="border border-[#E1E4E2] bg-white p-5 sm:p-6"><div className="flex items-center gap-3 border-b border-[#E1E4E2] pb-4"><Send size={18} className="text-[#287D73]" /><div><h2 className="text-base font-semibold">Submit a complaint</h2><p className="mt-1 text-xs text-[#68747C]">Our operations teams will review the request.</p></div></div>{confirmation ? <div className="py-10 text-center"><ClipboardCheck size={32} className="mx-auto text-[#397A59]" /><h3 className="mt-4 text-lg font-semibold">Request received</h3><p className="mt-2 text-sm text-[#68747C]">Your reference is <strong className="text-[#287D73]">{confirmation.id}</strong>. It has been sent for simulated triage and is currently {confirmation.status.replaceAll("_", " ").toLowerCase()}.</p><button onClick={() => setConfirmation(null)} className="mt-5 text-sm font-semibold text-[#287D73]">Submit another request</button></div> : <form onSubmit={submit} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" value={form.name} required onChange={(value) => setForm({ ...form, name: value })} /><Field label="Email" type="email" value={email} required onChange={setEmail} /><Field label="Company" value={form.company} required onChange={(value) => setForm({ ...form, company: value })} /><Field label="Order ID" value={form.orderId} onChange={(value) => setForm({ ...form, orderId: value })} /><Field label="Shipment ID" value={form.shipmentId} onChange={(value) => setForm({ ...form, shipmentId: value })} /><label className="text-xs font-semibold text-[#68747C]">Issue category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 w-full border border-[#E1E4E2] bg-white px-3 py-2.5 text-sm font-normal text-[#172B3A]">{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div><Field label="Subject" value={form.subject} required onChange={(value) => setForm({ ...form, subject: value })} /><label className="block text-xs font-semibold text-[#68747C]">Detailed description<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 min-h-28 w-full border border-[#E1E4E2] p-3 text-sm font-normal text-[#172B3A]" /></label><p className="text-xs text-[#68747C]">Attachment upload will be available when storage is connected.</p><button type="submit" className="bg-[#287D73] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#20665E]">Submit request</button></form>}</section><section className="border border-[#E1E4E2] bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Track your tickets</h2><p className="mt-1 text-xs text-[#68747C]">Enter the email used on a request to view public updates.</p><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="mt-5 w-full border border-[#E1E4E2] px-3 py-2.5 text-sm" />{email && <div className="mt-5 space-y-2">{customerTickets.length === 0 ? <p className="py-6 text-center text-sm text-[#68747C]">No tickets found for this email.</p> : customerTickets.map((ticket) => <button key={ticket.id} onClick={() => setSelected(ticket)} className="block w-full border border-[#E1E4E2] p-4 text-left hover:bg-[#FAFAF8]"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[#287D73]">{ticket.id}</span><StatusBadge status={ticket.status} /></div><p className="mt-2 text-sm font-medium">{ticket.subject}</p><p className="mt-1 text-xs text-[#68747C]">Last updated {ticket.updatedAt}</p></button>)}</div>}</section></div>{selected && <TicketDetailPanel ticket={selected} customerView onClose={() => setSelected(null)} />}</PortalShell>;
}

function Field({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="block text-xs font-semibold text-[#68747C]">{label}<input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-[#E1E4E2] px-3 py-2.5 text-sm font-normal text-[#172B3A]" /></label>;
}
