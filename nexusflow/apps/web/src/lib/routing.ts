import type { Department } from "./types";

export const routingCategories = [
  "Production",
  "Machine Breakdown",
  "Quality Defect",
  "Component Shortage",
  "Maintenance",
  "Shipment Delay",
  "Delivery Issue",
  "Transporter Issue",
  "Dispatch Issue",
  "General Operations",
  "Other",
  "Unclassified",
] as const;

export type RoutingCategory = (typeof routingCategories)[number];

export type RoutingEmployee = {
  id: string;
  department: Department;
  isActive: boolean;
  openTicketCount: number;
};

const departmentByCategory: Record<RoutingCategory, Department> = {
  Production: "FACTORY",
  "Machine Breakdown": "FACTORY",
  "Quality Defect": "FACTORY",
  "Component Shortage": "FACTORY",
  Maintenance: "FACTORY",
  "Shipment Delay": "LOGISTICS",
  "Delivery Issue": "LOGISTICS",
  "Transporter Issue": "LOGISTICS",
  "Dispatch Issue": "LOGISTICS",
  "General Operations": "OPERATIONS",
  Other: "OPERATIONS",
  Unclassified: "OPERATIONS",
};

function normalizedCategory(category: string) {
  return category.trim().toLowerCase();
}

export function resolveDepartment(category: string): Department {
  const match = routingCategories.find((supportedCategory) => (
    normalizedCategory(supportedCategory) === normalizedCategory(category)
  ));
  return match ? departmentByCategory[match] : "OPERATIONS";
}

export function validateDepartment(category: string, department: Department) {
  return resolveDepartment(category) === department;
}

export function resolveAssignment(department: Department, availableEmployees: RoutingEmployee[]) {
  return availableEmployees
    .filter((employee) => employee.isActive && employee.department === department)
    .sort((left, right) => left.openTicketCount - right.openTicketCount || left.id.localeCompare(right.id))[0]?.id;
}

export function getRoutingReason(category: string, department = resolveDepartment(category)) {
  const normalized = normalizedCategory(category);
  const supported = routingCategories.find((supportedCategory) => normalizedCategory(supportedCategory) === normalized);
  return supported
    ? `${supported} routes to ${department}.`
    : `Unsupported category "${category}" defaults to Operations.`;
}
