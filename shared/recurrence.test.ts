import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateOccurrence,
  createRecurrenceSchedule,
  dateInTimeZone,
  nextOccurrence,
  previewOccurrences,
} from "./recurrence.ts";

test("monthly recurrence preserves a regular anchor day", () => {
  const schedule = createRecurrenceSchedule({ frequency: "monthly", startDate: "2026-07-15", timezone: "Europe/Vienna" });
  assert.deepEqual(previewOccurrences(schedule, 4), ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"]);
});

test("monthly recurrence that starts on month end stays on month end", () => {
  const schedule = createRecurrenceSchedule({ frequency: "monthly", startDate: "2026-01-31", timezone: "Europe/Vienna" });
  assert.deepEqual(previewOccurrences(schedule, 4), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("fixed day 30 uses last valid February day but returns to 30", () => {
  const schedule = createRecurrenceSchedule({ frequency: "monthly", startDate: "2026-01-30", timezone: "Europe/Vienna" });
  assert.deepEqual(previewOccurrences(schedule, 4), ["2026-01-30", "2026-02-28", "2026-03-30", "2026-04-30"]);
});

test("yearly leap-day recurrence falls back to February 28 without drifting", () => {
  const schedule = createRecurrenceSchedule({ frequency: "yearly", startDate: "2028-02-29", timezone: "Europe/Vienna" });
  assert.equal(calculateOccurrence(schedule, 1), "2029-02-28");
  assert.equal(calculateOccurrence(schedule, 4), "2032-02-29");
});

test("end date is inclusive", () => {
  const schedule = createRecurrenceSchedule({
    frequency: "monthly",
    startDate: "2026-07-15",
    timezone: "Europe/Vienna",
    endMode: "on_date",
    endDate: "2026-09-15",
  });
  assert.deepEqual(previewOccurrences(schedule, 10), ["2026-07-15", "2026-08-15", "2026-09-15"]);
  assert.equal(nextOccurrence(schedule, 3), null);
});

test("maximum occurrence count is respected", () => {
  const schedule = createRecurrenceSchedule({
    frequency: "yearly",
    startDate: "2026-07-20",
    timezone: "Europe/Vienna",
    endMode: "after_occurrences",
    maxOccurrences: 2,
  });
  assert.deepEqual(previewOccurrences(schedule, 5), ["2026-07-20", "2027-07-20"]);
});

test("interval supports future every-two-month schedules without changing the MVP UI", () => {
  const schedule = createRecurrenceSchedule({ frequency: "monthly", interval: 2, startDate: "2026-07-20", timezone: "Europe/Vienna" });
  assert.deepEqual(previewOccurrences(schedule, 3), ["2026-07-20", "2026-09-20", "2026-11-20"]);
});

test("timezone date calculation is deterministic", () => {
  const now = new Date("2026-07-20T22:30:00.000Z");
  assert.equal(dateInTimeZone("Europe/Vienna", now), "2026-07-21");
  assert.equal(dateInTimeZone("UTC", now), "2026-07-20");
});

test("invalid dates are rejected", () => {
  assert.throws(
    () => createRecurrenceSchedule({ frequency: "monthly", startDate: "2026-02-30", timezone: "Europe/Vienna" }),
    /Ungültiges ISO-Datum/,
  );
});
