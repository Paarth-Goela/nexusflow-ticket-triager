"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Ticket, TicketStatus } from "@/lib/types";
import { useTickets } from "@/lib/ticket-context";
import { departmentLabels, priorityLabels, statusLabels } from "@/lib/utils";
import { Button } from "../ui/button";
import { PriorityIndicator } from "./priority-indicator";
import { StatusBadge } from "./status-badge";

export function TicketDetailPanel({ ticket, customerView = false, onClose }: { ticket: Ticket; customerView?: boolean; onClose: () => void }) {
  const {
    updateStatus,
    updateTicket,
    escalateTicket,
    assignTicket,
    addInternalNote,
    addCustomerMessage,
    teamMembers,
    error,
  } = useTickets();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [proofOfDelivery, setProofOfDelivery] = useState(ticket.proofOfDeliveryReference ?? "");
  const departmentMembers = teamMembers.filter((member) => member.department === ticket.department);
  const visibleActivity = (ticket.activity ?? []).filter((item) => !customerView || item.public);

  return <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-[#E1E4E2] bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="ticket-panel-title">
    <div className="sticky top-0 flex items-start justify-between border-b border-[#E1E4E2] bg-white px-5 py-4"><div><p className="text-xs font-semibold text-[#287D73]">{ticket.id}</p><h2 id="ticket-panel-title" className="mt-1 text-base font-semibold">{ticket.subject}</h2></div><button onClick={onClose} className="p-2 text-[#68747C] hover:bg-[#F5F5F1]" aria-label="Close ticket details"><X size={18} /></button></div>
    <div className="space-y-6 p-5">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#68747C]">Complaint</p><p className="mt-2 text-sm leading-6">{ticket.description}</p></div>
      <div className="grid grid-cols-2 gap-4 border-y border-[#E1E4E2] py-4"><Detail label="Customer" value={ticket.customer} /><Detail label="Email" value={ticket.customerEmail} /><Detail label="Department" value={departmentLabels[ticket.department]} /><Detail label="Priority" value={priorityLabels[ticket.priority]} /><Detail label="Assigned to" value={ticket.assignedTo} /><Detail label="SLA deadline" value={ticket.slaDeadline} /><Detail label="Order ID" value={ticket.orderId ?? "Not provided"} /><Detail label="Shipment ID" value={ticket.shipmentId ?? "Not provided"} /></div>
      <div className="flex items-center justify-between"><PriorityIndicator priority={ticket.priority} /><StatusBadge status={ticket.status} /></div>
      {!customerView && <div className="space-y-3">
        <label className="block text-xs font-semibold text-[#68747C]">Update status<select value={ticket.status} onChange={(event) => { void updateStatus(ticket.id, event.target.value as TicketStatus); }} className="mt-2 w-full border border-[#E1E4E2] bg-white px-3 py-2 text-sm font-normal text-[#172B3A]">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[#68747C]">Assign employee<select value={ticket.assignedToId ?? ""} onChange={(event) => { void assignTicket(ticket.id, event.target.value); }} className="mt-2 w-full border border-[#E1E4E2] bg-white px-3 py-2 text-sm font-normal text-[#172B3A]"><option value="">Unassigned</option>{departmentMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select></label>
        {departmentMembers.length === 0 && <p className="text-xs text-[#68747C]">No assignable employees are provisioned for this department yet.</p>}
        <Button variant="secondary" className="text-xs" onClick={() => { void escalateTicket(ticket.id); }}>Escalate issue</Button>
      </div>}
      <div className="border border-[#E1E4E2] bg-[#FAFAF8] p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold">AI assessment</p><span className="text-[10px] font-medium text-[#C18A42]">SIMULATED DEMO DATA</span></div><p className="mt-2 text-sm leading-6 text-[#68747C]">{ticket.aiSummary}</p><p className="mt-3 text-xs font-semibold text-[#287D73]">Recommended next action: confirm owner and document the resolution path.</p></div>
      {!customerView && ticket.department === "LOGISTICS" && <div><p className="text-xs font-semibold uppercase tracking-wide text-[#68747C]">Proof of delivery reference</p><div className="mt-2 flex gap-2"><input value={proofOfDelivery} onChange={(event) => setProofOfDelivery(event.target.value)} className="min-w-0 flex-1 border border-[#E1E4E2] px-3 py-2 text-sm" placeholder="POD-2026-0014" /><Button variant="secondary" className="shrink-0 text-xs" onClick={() => { void updateTicket(ticket.id, { proofOfDeliveryReference: proofOfDelivery }); }}>Save reference</Button></div></div>}
      {!customerView && <div><p className="text-xs font-semibold uppercase tracking-wide text-[#68747C]">Internal note</p><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-20 w-full border border-[#E1E4E2] p-3 text-sm" placeholder="Visible to internal teams only" /><Button variant="secondary" className="mt-2 text-xs" onClick={() => { if (note.trim()) { void addInternalNote(ticket.id, note.trim()); setNote(""); } }}>Add internal note</Button></div>}
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#68747C]">Customer-visible updates</p>{(ticket.customerMessages ?? []).map((item, index) => <p key={`${item}-${index}`} className="mt-2 border-l-2 border-[#287D73] pl-3 text-sm text-[#68747C]">{item}</p>)}{!customerView && <><textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-3 min-h-20 w-full border border-[#E1E4E2] p-3 text-sm" placeholder="Share an update with the customer" /><Button variant="primary" className="mt-2 text-xs" onClick={() => { if (message.trim()) { void addCustomerMessage(ticket.id, message.trim()); setMessage(""); } }}>Send customer update</Button></>}</div>
      {error && <p className="text-xs text-[#B94A48]" role="alert">{error}</p>}
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#68747C]">Activity timeline</p><div className="mt-3 space-y-3 border-l border-[#E1E4E2] pl-4">{visibleActivity.slice().reverse().map((item) => <div key={item.id} className="relative text-xs"><span className="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#287D73]" /><p className="font-medium">{item.message}</p><p className="mt-0.5 text-[#68747C]">{item.actor} · {item.timestamp}</p></div>)}</div></div>
    </div>
  </aside>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-[#68747C]">{label}</p><p className="mt-1 break-words text-xs font-medium">{value}</p></div>;
}
