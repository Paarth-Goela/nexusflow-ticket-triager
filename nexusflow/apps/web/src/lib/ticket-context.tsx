"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { tickets as initialTickets } from "./mock-data";
import type { Department, Ticket, TicketActivity, TicketStatus } from "./types";

const STORAGE_KEY = "nexusflow-demo-tickets";
type Action = { type: "replace"; tickets: Ticket[] };
type TicketContextValue = {
  tickets: Ticket[];
  activities: TicketActivity[];
  createTicket: (input: Pick<Ticket, "subject" | "description" | "customer" | "customerEmail" | "category"> & Partial<Pick<Ticket, "department">>) => Ticket;
  updateTicket: (id: string, updates: Partial<Ticket>) => void;
  escalateTicket: (id: string) => void;
  assignTicket: (id: string, assignedTo: string) => void;
  updateStatus: (id: string, status: TicketStatus) => void;
  addInternalNote: (id: string, note: string) => void;
  addCustomerMessage: (id: string, message: string) => void;
  getTicketById: (id: string) => Ticket | undefined;
  getTicketsByDepartment: (department: Department) => Ticket[];
};

const TicketContext = createContext<TicketContextValue | null>(null);

function reducer(state: Ticket[], action: Action) {
  return action.type === "replace" ? action.tickets : state;
}

function timestamp() {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
}

function withDefaults(ticket: Ticket): Ticket {
  return { ...ticket, internalNotes: ticket.internalNotes ?? [], customerMessages: ticket.customerMessages ?? [], activity: ticket.activity ?? [{ id: `${ticket.id}-created`, type: "CREATED", actor: "NexusFlow", message: "Ticket created", timestamp: ticket.createdAt, public: true }] };
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialTickets.map(withDefaults));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) dispatch({ type: "replace", tickets: (JSON.parse(saved) as Ticket[]).map(withDefaults) });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const updateTicket = useCallback((id: string, updates: Partial<Ticket>) => {
    dispatch({ type: "replace", tickets: state.map((ticket) => ticket.id === id ? { ...ticket, ...updates, updatedAt: "Just now" } : ticket) });
  }, [state]);

  const changeTicket = useCallback((id: string, updates: Partial<Ticket>, activity?: Omit<TicketActivity, "id" | "timestamp">) => {
    const item = activity ? { ...activity, id: `${id}-${Date.now()}`, timestamp: timestamp() } : undefined;
    dispatch({ type: "replace", tickets: state.map((ticket) => ticket.id === id ? { ...ticket, ...updates, updatedAt: "Just now", activity: item ? [...(ticket.activity ?? []), item] : ticket.activity } : ticket) });
  }, [state]);

  const value = useMemo<TicketContextValue>(() => ({
    tickets: state,
    activities: state.flatMap((ticket) => ticket.activity ?? []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    createTicket: (input) => {
      const created: Ticket = withDefaults({ ...input, id: `NFX-${Math.floor(2000 + Math.random() * 8000)}`, department: input.department ?? "OPERATIONS", priority: "MEDIUM", priorityScore: 55, status: "AI_TRIAGED", assignedTo: "Unassigned", createdAt: "Just now", updatedAt: "Just now", aiSummary: "Simulated triage pending real AI service integration.", slaDeadline: "Within 24 hours" });
      dispatch({ type: "replace", tickets: [created, ...state] });
      return created;
    },
    updateTicket,
    escalateTicket: (id) => changeTicket(id, { priority: "CRITICAL" }, { type: "INTERNAL_NOTE", actor: "Demo operator", message: "Issue escalated for priority response.", public: false }),
    assignTicket: (id, assignedTo) => changeTicket(id, { assignedTo, status: "ASSIGNED" }, { type: "ASSIGNMENT", actor: "Demo operator", message: `Assigned to ${assignedTo}`, public: false }),
    updateStatus: (id, status) => changeTicket(id, { status }, { type: "STATUS_CHANGE", actor: "Demo operator", message: `Status changed to ${status.replaceAll("_", " ").toLowerCase()}`, public: true }),
    addInternalNote: (id, note) => { const ticket = state.find((item) => item.id === id); changeTicket(id, { internalNotes: [...(ticket?.internalNotes ?? []), note] }, { type: "INTERNAL_NOTE", actor: "Demo operator", message: note, public: false }); },
    addCustomerMessage: (id, message) => { const ticket = state.find((item) => item.id === id); changeTicket(id, { customerMessages: [...(ticket?.customerMessages ?? []), message] }, { type: "CUSTOMER_MESSAGE", actor: "Demo operator", message, public: true }); },
    getTicketById: (id) => state.find((ticket) => ticket.id === id),
    getTicketsByDepartment: (department) => state.filter((ticket) => ticket.department === department),
  }), [state, updateTicket, changeTicket]);

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

export function useTickets() {
  const context = useContext(TicketContext);
  if (!context) throw new Error("useTickets must be used within TicketProvider");
  return context;
}
