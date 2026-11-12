"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { tickets as initialTickets } from "./mock-data";
import { createClient } from "./supabase/client";
import type { Department, DemoRole, Ticket, TicketActivity, TicketStatus } from "./types";

const STORAGE_KEY = "nexusflow-demo-tickets";

export interface TeamMember {
  id: string;
  fullName: string;
  department: Department;
  role: Exclude<DemoRole, "CUSTOMER">;
}

type TicketInput = Pick<Ticket, "subject" | "description" | "customer" | "customerEmail" | "category"> &
  Partial<Pick<Ticket, "department" | "shipmentId" | "orderId">>;

type Action = { type: "replace"; tickets: Ticket[] };

type TicketContextValue = {
  tickets: Ticket[];
  activities: TicketActivity[];
  teamMembers: TeamMember[];
  loading: boolean;
  error: string | null;
  dataMode: "supabase" | "demo";
  createTicket: (input: TicketInput) => Promise<Ticket | null>;
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  escalateTicket: (id: string) => Promise<void>;
  assignTicket: (id: string, assignedToId: string) => Promise<void>;
  updateStatus: (id: string, status: TicketStatus) => Promise<void>;
  addInternalNote: (id: string, note: string) => Promise<void>;
  addCustomerMessage: (id: string, message: string) => Promise<void>;
  getTicketById: (id: string) => Ticket | undefined;
  getTicketsByDepartment: (department: Department) => Ticket[];
  refresh: () => Promise<void>;
};

const TicketContext = createContext<TicketContextValue | null>(null);

const demoTeam: TeamMember[] = [
  { id: "demo-maya", fullName: "Maya Chen", department: "FACTORY", role: "FACTORY_AGENT" },
  { id: "demo-jon", fullName: "Jon Bell", department: "FACTORY", role: "FACTORY_AGENT" },
  { id: "demo-elias", fullName: "Elias Morgan", department: "LOGISTICS", role: "LOGISTICS_AGENT" },
  { id: "demo-priya", fullName: "Priya Shah", department: "OPERATIONS", role: "OPERATIONS_ADMIN" },
];

function reducer(state: Ticket[], action: Action) {
  return action.type === "replace" ? action.tickets : state;
}

function nowLabel() {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
}

function withDefaults(ticket: Ticket): Ticket {
  return {
    ...ticket,
    internalNotes: ticket.internalNotes ?? [],
    customerMessages: ticket.customerMessages ?? [],
    activity: ticket.activity ?? [{
      id: `${ticket.id}-created`,
      type: "CREATED",
      actor: "NexusFlow",
      message: "Ticket created",
      timestamp: ticket.createdAt,
      public: true,
    }],
  };
}

function toActivityType(value: unknown): TicketActivity["type"] {
  if (value === "STATUS_CHANGE" || value === "ASSIGNMENT" || value === "INTERNAL_NOTE" || value === "CUSTOMER_MESSAGE") {
    return value;
  }
  return "CREATED";
}

function fromDatabase(
  row: Record<string, unknown>,
  messages: Record<string, unknown>[],
  events: Record<string, unknown>[],
  people: Map<string, string>,
): Ticket {
  const ticketId = String(row.id);
  const ticketNumber = String(row.ticket_number);
  const ticketMessages = messages.filter((item) => String(item.ticket_id) === ticketId);
  const ticketEvents = events.filter((item) => String(item.ticket_id) === ticketId);
  const messageActivity: TicketActivity[] = ticketMessages.map((item) => {
    const visibility = String(item.visibility);
    const authorId = String(item.author_id ?? "");
    return {
      id: String(item.id),
      type: visibility === "INTERNAL" ? "INTERNAL_NOTE" : "CUSTOMER_MESSAGE",
      actor: people.get(authorId) ?? "NexusFlow team",
      message: String(item.message),
      timestamp: String(item.created_at),
      public: visibility === "PUBLIC",
    };
  });
  const eventActivity: TicketActivity[] = ticketEvents.map((item) => {
    const actorId = String(item.actor_id ?? "");
    const type = toActivityType(item.event_type);
    return {
      id: String(item.id),
      type,
      actor: people.get(actorId) ?? "NexusFlow team",
      message: String(item.description),
      timestamp: String(item.created_at),
      public: type === "CREATED" || type === "STATUS_CHANGE" || type === "CUSTOMER_MESSAGE",
    };
  });
  const activity = [...messageActivity, ...eventActivity].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return withDefaults({
    id: ticketNumber,
    databaseId: ticketId,
    subject: String(row.subject),
    description: String(row.description),
    customer: String(row.customer_company ?? "Customer"),
    customerEmail: String(row.customer_email ?? ""),
    department: row.department as Department,
    category: String(row.category),
    priority: row.priority as Ticket["priority"],
    priorityScore: Number(row.priority_score ?? 0),
    status: row.status as TicketStatus,
    assignedToId: row.assigned_to ? String(row.assigned_to) : undefined,
    assignedTo: row.assigned_to ? (people.get(String(row.assigned_to)) ?? "Assigned") : "Unassigned",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    aiSummary: String(row.ai_summary ?? ""),
    slaDeadline: row.sla_deadline ? String(row.sla_deadline) : "Not set",
    orderId: row.order_id ? String(row.order_id) : undefined,
    shipmentId: row.shipment_id ? String(row.shipment_id) : undefined,
    proofOfDeliveryReference: row.proof_of_delivery_reference ? String(row.proof_of_delivery_reference) : undefined,
    internalNotes: ticketMessages.filter((item) => item.visibility === "INTERNAL").map((item) => String(item.message)),
    customerMessages: ticketMessages.filter((item) => item.visibility === "PUBLIC").map((item) => String(item.message)),
    activity,
  });
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, dispatch] = useReducer(reducer, supabase ? [] : initialTickets.map(withDefaults));
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(supabase ? [] : demoTeam);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      dispatch({ type: "replace", tickets: [] });
      setTeamMembers([]);
      setError(userError?.message ?? "Sign in to load persistent ticket data.");
      setLoading(false);
      return;
    }

    const [ticketResult, profileResult] = await Promise.all([
      supabase.from("tickets").select("*").order("updated_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, department, role").neq("role", "CUSTOMER"),
    ]);

    if (ticketResult.error) {
      dispatch({ type: "replace", tickets: [] });
      setError(`Ticket data could not be loaded: ${ticketResult.error.message}`);
      setLoading(false);
      return;
    }
    if (profileResult.error) {
      setError(`Team directory could not be loaded: ${profileResult.error.message}`);
      setLoading(false);
      return;
    }

    const ticketRows = (ticketResult.data ?? []) as Record<string, unknown>[];
    const ticketIds = ticketRows.map((row) => String(row.id));
    const [messageResult, eventResult] = ticketIds.length
      ? await Promise.all([
          supabase.from("ticket_messages").select("id, ticket_id, author_id, message, visibility, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: true }),
          supabase.from("ticket_events").select("id, ticket_id, actor_id, event_type, description, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (messageResult.error || eventResult.error) {
      setError(`Ticket history could not be loaded: ${messageResult.error?.message ?? eventResult.error?.message}`);
      setLoading(false);
      return;
    }

    const profiles = (profileResult.data ?? []) as Record<string, unknown>[];
    const people = new Map<string, string>(profiles.map((profile) => [
      String(profile.id),
      String(profile.full_name || "Team member"),
    ]));
    const members: TeamMember[] = profiles.flatMap((profile) => {
      const role = String(profile.role);
      const department = profile.department as Department | null;
      if (!department || !["FACTORY_AGENT", "LOGISTICS_AGENT", "OPERATIONS_ADMIN"].includes(role)) return [];
      return [{
        id: String(profile.id),
        fullName: String(profile.full_name || "Team member"),
        department,
        role: role as TeamMember["role"],
      }];
    });

    const messageRows = (messageResult.data ?? []) as Record<string, unknown>[];
    const eventRows = (eventResult.data ?? []) as Record<string, unknown>[];
    dispatch({
      type: "replace",
      tickets: ticketRows.map((row) => fromDatabase(row, messageRows, eventRows, people)),
    });
    setTeamMembers(members);
    setReady(true);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase) {
        try {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved && active) dispatch({ type: "replace", tickets: (JSON.parse(saved) as Ticket[]).map(withDefaults) });
        } catch {
          if (active) setError("Demo data could not be loaded from browser storage.");
        } finally {
          if (active) { setReady(true); setLoading(false); }
        }
        return;
      }

      await refresh();
      if (!active) return;
    }

    void load();
    if (!supabase) return () => { active = false; };

    const channel = supabase
      .channel("nexusflow-ticket-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_messages" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_events" }, () => { void refresh(); })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh, supabase]);

  useEffect(() => {
    if (!supabase && ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state, supabase]);

  const replaceTicket = useCallback((updated: Ticket) => {
    dispatch({ type: "replace", tickets: state.map((ticket) => ticket.id === updated.id ? updated : ticket) });
  }, [state]);

  const createTicket = useCallback(async (input: TicketInput): Promise<Ticket | null> => {
    setError(null);
    if (!supabase) {
      const created = withDefaults({
        ...input,
        id: `NFX-${Math.floor(2000 + Math.random() * 8000)}`,
        department: input.department ?? "OPERATIONS",
        priority: "MEDIUM",
        priorityScore: 50,
        status: "NEW",
        assignedTo: "Unassigned",
        createdAt: nowLabel(),
        updatedAt: nowLabel(),
        aiSummary: "Simulated triage pending real AI service integration.",
        slaDeadline: "Within 24 hours",
      });
      dispatch({ type: "replace", tickets: [created, ...state] });
      return created;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.email) {
      setError(userError?.message ?? "Your authenticated email could not be verified.");
      return null;
    }

    const result = await supabase.from("tickets").insert({
      customer_id: userData.user.id,
      customer_email: userData.user.email,
      customer_company: input.customer,
      order_id: input.orderId ?? null,
      shipment_id: input.shipmentId ?? null,
      subject: input.subject,
      description: input.description,
      category: input.category,
    }).select("*").single();

    if (result.error || !result.data) {
      setError(`Ticket creation failed: ${result.error?.message ?? "No ticket was returned"}`);
      return null;
    }

    const created = fromDatabase(result.data as Record<string, unknown>, [], [], new Map());
    dispatch({ type: "replace", tickets: [created, ...state] });
    return created;
  }, [state, supabase]);

  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>) => {
    setError(null);
    const current = state.find((ticket) => ticket.id === id);
    if (!current) return;

    if (!supabase) {
      replaceTicket({ ...current, ...updates, updatedAt: "Just now" });
      return;
    }

    const databaseUpdates: Record<string, unknown> = {};
    if (updates.proofOfDeliveryReference !== undefined) databaseUpdates.proof_of_delivery_reference = updates.proofOfDeliveryReference;
    if (updates.slaDeadline !== undefined) databaseUpdates.sla_deadline = updates.slaDeadline;
    if (Object.keys(databaseUpdates).length === 0) return;

    const result = await supabase.from("tickets").update(databaseUpdates).eq("ticket_number", id).select("*").single();
    if (result.error) {
      setError(`Ticket update failed: ${result.error.message}`);
      return;
    }
    replaceTicket({ ...current, ...updates, updatedAt: nowLabel() });
  }, [replaceTicket, state, supabase]);

  const updateStatus = useCallback(async (id: string, status: TicketStatus) => {
    setError(null);
    const current = state.find((ticket) => ticket.id === id);
    if (!current) return;
    if (supabase) {
      const result = await supabase.from("tickets").update({ status }).eq("ticket_number", id).select("*").single();
      if (result.error) { setError(`Status update failed: ${result.error.message}`); return; }
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user && current.databaseId) {
        const eventResult = await supabase.from("ticket_events").insert({
          ticket_id: current.databaseId,
          actor_id: userData.user.id,
          event_type: "STATUS_CHANGE",
          previous_value: { status: current.status },
          new_value: { status },
          description: `Status changed to ${status.replaceAll("_", " ").toLowerCase()}`,
        });
        if (eventResult.error) setError(`Status saved, but activity history failed: ${eventResult.error.message}`);
      }
    }
    const activity: TicketActivity = {
      id: `${id}-status-${Date.now()}`,
      type: "STATUS_CHANGE",
      actor: "Current team member",
      message: `Status changed to ${status.replaceAll("_", " ").toLowerCase()}`,
      timestamp: nowLabel(),
      public: true,
    };
    replaceTicket({ ...current, status, updatedAt: nowLabel(), activity: [...(current.activity ?? []), activity] });
  }, [replaceTicket, state, supabase]);

  const assignTicket = useCallback(async (id: string, assignedToId: string) => {
    setError(null);
    const current = state.find((ticket) => ticket.id === id);
    if (!current) return;
    const member = teamMembers.find((person) => person.id === assignedToId && person.department === current.department);
    if (assignedToId && !member) {
      setError("Choose an employee from this ticket's department.");
      return;
    }

    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !current.databaseId) { setError("Your session or ticket reference is unavailable."); return; }
      const updateResult = await supabase.from("tickets").update({
        assigned_to: assignedToId || null,
        status: assignedToId ? "ASSIGNED" : current.status,
      }).eq("ticket_number", id).select("*").single();
      if (updateResult.error) { setError(`Assignment failed: ${updateResult.error.message}`); return; }
      const assignmentResult = await supabase.from("ticket_assignments").insert({
        ticket_id: current.databaseId,
        department: current.department,
        assigned_user_id: assignedToId || null,
        assigned_by: userData.user.id,
      });
      if (assignmentResult.error) setError(`Assignment saved, but assignment history failed: ${assignmentResult.error.message}`);
    }

    const label = member?.fullName ?? "Unassigned";
    const activity: TicketActivity = {
      id: `${id}-assignment-${Date.now()}`,
      type: "ASSIGNMENT",
      actor: "Current team member",
      message: assignedToId ? `Assigned to ${label}` : "Assignment cleared",
      timestamp: nowLabel(),
      public: false,
    };
    replaceTicket({
      ...current,
      assignedToId: assignedToId || undefined,
      assignedTo: label,
      status: assignedToId ? "ASSIGNED" : current.status,
      updatedAt: nowLabel(),
      activity: [...(current.activity ?? []), activity],
    });
  }, [replaceTicket, state, supabase, teamMembers]);

  const escalateTicket = useCallback(async (id: string) => {
    setError(null);
    const current = state.find((ticket) => ticket.id === id);
    if (!current) return;
    if (supabase) {
      const result = await supabase.from("tickets").update({ priority: "CRITICAL", priority_score: 100 })
        .eq("ticket_number", id).select("*").single();
      if (result.error) { setError(`Escalation failed: ${result.error.message}`); return; }
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user && current.databaseId) {
        const eventResult = await supabase.from("ticket_events").insert({
          ticket_id: current.databaseId,
          actor_id: userData.user.id,
          event_type: "ASSIGNMENT",
          previous_value: { priority: current.priority },
          new_value: { priority: "CRITICAL" },
          description: "Ticket escalated to critical priority",
        });
        if (eventResult.error) setError(`Escalation saved, but activity history failed: ${eventResult.error.message}`);
      }
    }
    replaceTicket({ ...current, priority: "CRITICAL", priorityScore: 100, updatedAt: nowLabel() });
  }, [replaceTicket, state, supabase]);

  const addMessage = useCallback(async (id: string, message: string, visibility: "PUBLIC" | "INTERNAL") => {
    setError(null);
    const current = state.find((ticket) => ticket.id === id);
    if (!current || !message.trim()) return;
    const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const timestamp = nowLabel();
    const activity: TicketActivity = {
      id: `${id}-message-${Date.now()}`,
      type: visibility === "INTERNAL" ? "INTERNAL_NOTE" : "CUSTOMER_MESSAGE",
      actor: "Current team member",
      message: message.trim(),
      timestamp,
      public: visibility === "PUBLIC",
    };

    if (supabase) {
      if (!userData.user || !current.databaseId) { setError("Your session or ticket reference is unavailable."); return; }
      const result = await supabase.from("ticket_messages").insert({
        ticket_id: current.databaseId,
        author_id: userData.user.id,
        message: message.trim(),
        visibility,
      }).select("id, created_at").single();
      if (result.error) { setError(`Message could not be saved: ${result.error.message}`); return; }
      activity.id = String(result.data.id);
      activity.timestamp = String(result.data.created_at);
    }

    replaceTicket({
      ...current,
      updatedAt: timestamp,
      internalNotes: visibility === "INTERNAL" ? [...(current.internalNotes ?? []), message.trim()] : current.internalNotes,
      customerMessages: visibility === "PUBLIC" ? [...(current.customerMessages ?? []), message.trim()] : current.customerMessages,
      activity: [...(current.activity ?? []), activity],
    });
  }, [replaceTicket, state, supabase]);

  const value = useMemo<TicketContextValue>(() => ({
    tickets: state,
    activities: state.flatMap((ticket) => ticket.activity ?? []).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ),
    teamMembers,
    loading,
    error,
    dataMode: supabase ? "supabase" : "demo",
    createTicket,
    updateTicket,
    escalateTicket,
    assignTicket,
    updateStatus,
    addInternalNote: (id, note) => addMessage(id, note, "INTERNAL"),
    addCustomerMessage: (id, message) => addMessage(id, message, "PUBLIC"),
    getTicketById: (id) => state.find((ticket) => ticket.id === id),
    getTicketsByDepartment: (department) => state.filter((ticket) => ticket.department === department),
    refresh,
  }), [addMessage, assignTicket, createTicket, error, escalateTicket, loading, refresh, state, supabase, teamMembers, updateStatus, updateTicket]);

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

export function useTickets() {
  const context = useContext(TicketContext);
  if (!context) throw new Error("useTickets must be used within TicketProvider");
  return context;
}
