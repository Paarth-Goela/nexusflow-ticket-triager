import assert from "node:assert/strict";
import test from "node:test";
import {
  getRoutingReason,
  resolveAssignment,
  resolveDepartment,
  validateDepartment,
} from "./routing.ts";

test("resolves supported categories deterministically", () => {
  assert.equal(resolveDepartment("Production"), "FACTORY");
  assert.equal(resolveDepartment("Machine Breakdown"), "FACTORY");
  assert.equal(resolveDepartment("Quality Defect"), "FACTORY");
  assert.equal(resolveDepartment("Component Shortage"), "FACTORY");
  assert.equal(resolveDepartment("Maintenance"), "FACTORY");
  assert.equal(resolveDepartment("Shipment Delay"), "LOGISTICS");
  assert.equal(resolveDepartment("Delivery Issue"), "LOGISTICS");
  assert.equal(resolveDepartment("Transporter Issue"), "LOGISTICS");
  assert.equal(resolveDepartment("Dispatch Issue"), "LOGISTICS");
  assert.equal(resolveDepartment("General Operations"), "OPERATIONS");
  assert.equal(resolveDepartment("Other"), "OPERATIONS");
  assert.equal(resolveDepartment("Unclassified"), "OPERATIONS");
  assert.equal(resolveDepartment("Unknown category"), "OPERATIONS");
  assert.equal(resolveDepartment("  machine breakdown "), "FACTORY");
  assert.equal(validateDepartment("Shipment Delay", "LOGISTICS"), true);
  assert.equal(validateDepartment("Shipment Delay", "FACTORY"), false);
  assert.match(getRoutingReason("Unknown category"), /defaults to Operations/);
});

test("assigns the lowest workload with stable tie-breaking", () => {
  const employees = [
    { id: "zeta", department: "FACTORY" as const, isActive: true, openTicketCount: 1 },
    { id: "alpha", department: "FACTORY" as const, isActive: true, openTicketCount: 1 },
    { id: "inactive", department: "FACTORY" as const, isActive: false, openTicketCount: 0 },
    { id: "logistics", department: "LOGISTICS" as const, isActive: true, openTicketCount: 0 },
  ];
  assert.equal(resolveAssignment("FACTORY", employees), "alpha");
  assert.equal(resolveAssignment("OPERATIONS", employees), undefined);
});
