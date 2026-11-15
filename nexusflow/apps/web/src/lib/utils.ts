import type { Department, Priority, Ticket, TicketStatus, Urgency } from "./types";

export const departmentLabels: Record<Department, string> = {
  FACTORY: "Factory",
  OPERATIONS: "Operations",
  LOGISTICS: "Logistics",
};

export const priorityLabels: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const statusLabels: Record<TicketStatus, string> = {
  NEW: "New",
  AI_TRIAGED: "AI triaged",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING_FOR_TEAM: "Waiting",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const priorityRank: Record<Priority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const urgencyRank: Record<Urgency, number> = {
  CRITICAL: 5,
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export function sortTicketsByUrgency(a: Ticket, b: Ticket) {
  const urgencyDifference = urgencyRank[b.urgency ?? "NORMAL"] - urgencyRank[a.urgency ?? "NORMAL"];
  if (urgencyDifference) return urgencyDifference;
  const deadlineDifference = Date.parse(a.slaDeadline) - Date.parse(b.slaDeadline);
  if (Number.isFinite(deadlineDifference) && deadlineDifference) return deadlineDifference;
  const overdueDifference = Date.parse(b.overdueSince ?? "") - Date.parse(a.overdueSince ?? "");
  if (Number.isFinite(overdueDifference) && overdueDifference) return overdueDifference;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export function isOpen(ticket: Ticket) {
  return ticket.status !== "RESOLVED" && ticket.status !== "CLOSED";
}
