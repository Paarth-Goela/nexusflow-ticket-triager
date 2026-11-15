export type Department = "FACTORY" | "OPERATIONS" | "LOGISTICS";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Urgency = "CRITICAL" | "URGENT" | "HIGH" | "NORMAL" | "LOW";
export type TicketStatus =
  | "NEW"
  | "AI_TRIAGED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_FOR_TEAM"
  | "ON_HOLD"
  | "RESOLVED"
  | "CLOSED";
export type DemoRole = "CUSTOMER" | "FACTORY_AGENT" | "LOGISTICS_AGENT" | "OPERATIONS_ADMIN" | "SYSTEM_ADMIN";

export interface TicketActivity {
  id: string;
  type: "STATUS_CHANGE" | "ASSIGNMENT" | "PRIORITY_CHANGE" | "DEPARTMENT_CHANGE" | "INTERNAL_NOTE" | "CUSTOMER_MESSAGE" | "ROUTED" | "CREATED";
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
  urgency?: Urgency;
  slaConsumedPercent?: number;
  overdueSeconds?: number;
  overdueSince?: string;
  escalationState?: "NONE" | "APPROACHING" | "BREACHED" | "OPERATIONS_REVIEW" | "SEVERELY_OVERDUE";
  operationsReviewRequired?: boolean;
  managementReviewRequired?: boolean;
  status: TicketStatus;
  assignedTo: string;
  assignedToId?: string;
  createdAt: string;
  updatedAt: string;
  aiSummary: string;
  slaDeadline: string;
  orderId?: string;
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
