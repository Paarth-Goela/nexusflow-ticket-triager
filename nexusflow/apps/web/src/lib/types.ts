export type Department = "FACTORY" | "OPERATIONS" | "LOGISTICS";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TicketStatus =
  | "NEW"
  | "AI_TRIAGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_FOR_TEAM"
  | "RESOLVED"
  | "CLOSED";
export type DemoRole = "CUSTOMER" | "FACTORY_AGENT" | "LOGISTICS_AGENT" | "OPERATIONS_ADMIN";

export interface TicketActivity {
  id: string;
  type: "STATUS_CHANGE" | "ASSIGNMENT" | "INTERNAL_NOTE" | "CUSTOMER_MESSAGE" | "CREATED";
  actor: string;
  message: string;
  timestamp: string;
  public: boolean;
}

export interface Ticket {
  id: string;
  databaseId?: string;
  subject: string;
  description: string;
  customer: string;
  customerEmail: string;
  department: Department;
  category: string;
  priority: Priority;
  priorityScore: number;
  status: TicketStatus;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  aiSummary: string;
  slaDeadline: string;
  shipmentId?: string;
  origin?: string;
  destination?: string;
  factoryLocation?: string;
  internalNotes?: string[];
  customerMessages?: string[];
  activity?: TicketActivity[];
  proofOfDeliveryReference?: string;
}

export interface Activity {
  id: string;
  event: string;
  actor: string;
  ticketId: string;
  timestamp: string;
}
