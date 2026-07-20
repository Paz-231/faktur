import test from "node:test";
import assert from "node:assert/strict";
import { canUseRecurringOrders, recurringPlanError } from "./planAccess.ts";

test("active starter and pro plans may use recurring orders", () => {
  assert.equal(canUseRecurringOrders({ plan: "starter", planStatus: "active" }), true);
  assert.equal(canUseRecurringOrders({ plan: "pro", planStatus: "active" }), true);
});

test("free, canceled and past-due plans are blocked", () => {
  assert.equal(canUseRecurringOrders({ plan: "free", planStatus: "active" }), false);
  assert.equal(canUseRecurringOrders({ plan: "starter", planStatus: "canceled" }), false);
  assert.equal(canUseRecurringOrders({ plan: "pro", planStatus: "past_due" }), false);
});

test("access errors distinguish upgrade and inactive subscription cases", () => {
  assert.match(recurringPlanError({ plan: "free", planStatus: "active" }), /Starter- und Pro-Plan/);
  assert.match(recurringPlanError({ plan: "starter", planStatus: "canceled" }), /aktiven Starter- oder Pro-Tarif/);
});
