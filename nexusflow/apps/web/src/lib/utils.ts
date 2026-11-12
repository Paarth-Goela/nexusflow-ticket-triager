import type { Department, Priority, Ticket, TicketStatus } from "./types";

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
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const priorityRank: Record<Priority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function isOpen(ticket: Ticket) {
  return ticket.status !== "RESOLVED" && ticket.status !== "CLOSED";
}
