"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { tickets as initialTickets } from "./mock-data";
import { createClient } from "./supabase/client";
import type { Department, Ticket, TicketActivity, TicketStatus } from "./types";

const STORAGE_KEY = "nexusflow-demo-tickets";
type Action = { type: "replace"; tickets: Ticket[] };
type TicketContextValue = {
  tickets: Ticket[];
  activities: TicketActivity[];
  loading: boolean;
  error: string | null;
  dataMode: "supabase" | "demo";
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

function withDefaults(ticket: Ticket): Ticket {
  return { ...ticket, internalNotes: ticket.internalNotes ?? [], customerMessages: ticket.customerMessages ?? [], activity: ticket.activity ?? [{ id: `${ticket.id}-created`, type: "CREATED", actor: "NexusFlow", message: "Ticket created", timestamp: ticket.createdAt, public: true }] };
}

function fromDatabase(row: Record<string, unknown>): Ticket {
  return withDefaults({
    id: String(row.ticket_number),
    databaseId: String(row.id),
    subject: String(row.subject),
    description: String(row.description),
    customer: String(row.customer_company ?? "Customer"),
    customerEmail: String(row.customer_email),
    department: row.department as Department,
    category: String(row.category),
    priority: row.priority as Ticket["priority"],
    priorityScore: Number(row.priority_score),
    status: row.status as TicketStatus,
    assignedTo: row.assigned_to ? String(row.assigned_to) : "Unassigned",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    aiSummary: String(row.ai_summary),
    slaDeadline: row.sla_deadline ? String(row.sla_deadline) : "Not set",
  });
}

function nowLabel() {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [state, dispatch] = useReducer(reducer, initialTickets.map(withDefaults));
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        try {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved && active) dispatch({ type: "replace", tickets: (JSON.parse(saved) as Ticket[]).map(withDefaults) });
        } catch {
          setError("Demo data could not be loaded from browser storage.");
        } finally {
          if (active) { setReady(true); setLoading(false); }
        }
        return;
      }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (active) { setError("Sign in to load persistent ticket data."); setLoading(false); }
        return;
      }
      const result = await supabase.from("tickets").select("*").order("updated_at", { ascending: false });
      if (result.error) {
        if (active) { setError(`Ticket data could not be loaded: ${result.error.message}`); setLoading(false); }
        return;
      }
      if (active) { dispatch({ type: "replace", tickets: (result.data as Record<string, unknown>[]).map(fromDatabase) }); setReady(true); setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!supabase && ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state, supabase]);

  const persist = useCallback(async (id: string, updates: Partial<Ticket>) => {
    if (!supabase) return;
    const result = await supabase.from("tickets").update({
      subject: updates.subject,
      description: updates.description,
      department: updates.department,
      priority: updates.priority,
      priority_score: updates.priorityScore,
      status: updates.status,
      sla_deadline: updates.slaDeadline,
      ai_summary: updates.aiSummary,
    }).eq("ticket_number", id);
    if (result.error) setError(`Ticket update failed: ${result.error.message}`);
  }, [supabase]);

  const updateTicket = useCallback((id: string, updates: Partial<Ticket>) => {
    dispatch({ type: "replace", tickets: state.map((ticket) => ticket.id === id ? { ...ticket, ...updates, updatedAt: "Just now" } : ticket) });
    void persist(id, updates);
  }, [persist, state]);

  const changeTicket = useCallback((id: string, updates: Partial<Ticket>, activity?: Omit<TicketActivity, "id" | "timestamp">) => {
    const item = activity ? { ...activity, id: `${id}-${Date.now()}`, timestamp: nowLabel() } : undefined;
    const current = state.find((ticket) => ticket.id === id);
    dispatch({ type: "replace", tickets: state.map((ticket) => ticket.id === id ? { ...ticket, ...updates, updatedAt: "Just now", activity: item ? [...(ticket.activity ?? []), item] : ticket.activity } : ticket) });
    void persist(id, updates);
    if (supabase && current?.databaseId && item) {
      void supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        void supabase.from("ticket_events").insert({ ticket_id: current.databaseId, event_type: item.type, description: item.message, actor_id: data.user.id });
        if (item.type === "INTERNAL_NOTE" || item.type === "CUSTOMER_MESSAGE") void supabase.from("ticket_messages").insert({ ticket_id: current.databaseId, author_id: data.user.id, message: item.message, visibility: item.public ? "PUBLIC" : "INTERNAL" });
      });
    }
  }, [persist, state, supabase]);

  const value = useMemo<TicketContextValue>(() => ({
    tickets: state,
    activities: state.flatMap((ticket) => ticket.activity ?? []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    loading,
    error,
    dataMode: supabase ? "supabase" : "demo",
    createTicket: (input) => {
      const created = withDefaults({ ...input, id: `NFX-${Math.floor(2000 + Math.random() * 8000)}`, department: input.department ?? "OPERATIONS", priority: "MEDIUM", priorityScore: 55, status: "AI_TRIAGED", assignedTo: "Unassigned", createdAt: nowLabel(), updatedAt: nowLabel(), aiSummary: "Simulated triage pending real AI service integration.", slaDeadline: "Within 24 hours" });
      dispatch({ type: "replace", tickets: [created, ...state] });
      if (supabase) void supabase.auth.getUser().then(({ data }) => data.user && supabase.from("tickets").insert({ ticket_number: created.id, customer_id: data.user.id, subject: created.subject, description: created.description, customer_email: created.customerEmail, customer_company: created.customer, category: created.category, department: created.department, priority: created.priority, priority_score: created.priorityScore, status: created.status, ai_summary: created.aiSummary }).then(({ error: insertError }) => { if (insertError) setError(`Ticket creation failed: ${insertError.message}`); }));
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
  }), [changeTicket, error, loading, state, supabase, updateTicket]);

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

export function useTickets() {
  const context = useContext(TicketContext);
  if (!context) throw new Error("useTickets must be used within TicketProvider");
  return context;
}
