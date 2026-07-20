export type RecurrenceFrequency = "monthly" | "yearly";
export type RecurrenceEndMode = "never" | "on_date" | "after_occurrences";

export interface RecurrenceSchedule {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  timezone: string;
  endMode: RecurrenceEndMode;
  endDate?: string;
  maxOccurrences?: number;
  anchorDay: number;
  anchorMonth?: number;
  lastDayOfMonth: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Ungültiges ISO-Datum: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Ungültiges ISO-Datum: ${value}`);
  }
  return { year, month, day };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLastDayOfMonth(isoDate: string): boolean {
  const { year, month, day } = parseIsoDate(isoDate);
  return day === daysInMonth(year, month);
}

export function createRecurrenceSchedule(input: {
  frequency: RecurrenceFrequency;
  startDate: string;
  timezone: string;
  interval?: number;
  endMode?: RecurrenceEndMode;
  endDate?: string;
  maxOccurrences?: number;
}): RecurrenceSchedule {
  const start = parseIsoDate(input.startDate);
  const interval = input.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1) throw new Error("Intervall muss mindestens 1 sein");
  const endMode = input.endMode ?? "never";
  if (endMode === "on_date") {
    if (!input.endDate) throw new Error("Enddatum fehlt");
    parseIsoDate(input.endDate);
    if (input.endDate < input.startDate) throw new Error("Enddatum darf nicht vor dem Startdatum liegen");
  }
  if (endMode === "after_occurrences") {
    if (!Number.isInteger(input.maxOccurrences) || (input.maxOccurrences ?? 0) < 1) {
      throw new Error("Anzahl der Ausführungen muss mindestens 1 sein");
    }
  }
  return {
    frequency: input.frequency,
    interval,
    startDate: input.startDate,
    timezone: input.timezone,
    endMode,
    endDate: endMode === "on_date" ? input.endDate : undefined,
    maxOccurrences: endMode === "after_occurrences" ? input.maxOccurrences : undefined,
    anchorDay: start.day,
    anchorMonth: input.frequency === "yearly" ? start.month : undefined,
    lastDayOfMonth: isLastDayOfMonth(input.startDate),
  };
}

export function calculateOccurrence(schedule: RecurrenceSchedule, occurrenceIndex: number): string {
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
    throw new Error("Ausführungsindex muss eine nicht-negative Ganzzahl sein");
  }
  const start = parseIsoDate(schedule.startDate);
  if (schedule.frequency === "monthly") {
    const absoluteMonth = start.year * 12 + (start.month - 1) + occurrenceIndex * schedule.interval;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    const day = schedule.lastDayOfMonth
      ? daysInMonth(year, month)
      : Math.min(schedule.anchorDay, daysInMonth(year, month));
    return formatIsoDate(year, month, day);
  }

  const year = start.year + occurrenceIndex * schedule.interval;
  const month = schedule.anchorMonth ?? start.month;
  const day = Math.min(schedule.anchorDay, daysInMonth(year, month));
  return formatIsoDate(year, month, day);
}

export function isOccurrenceAllowed(
  schedule: RecurrenceSchedule,
  occurrenceDate: string,
  occurrenceIndex: number,
): boolean {
  parseIsoDate(occurrenceDate);
  if (schedule.endMode === "on_date" && schedule.endDate && occurrenceDate > schedule.endDate) return false;
  if (schedule.endMode === "after_occurrences" && schedule.maxOccurrences !== undefined) {
    return occurrenceIndex < schedule.maxOccurrences;
  }
  return true;
}

export function nextOccurrence(schedule: RecurrenceSchedule, generatedCount: number): string | null {
  const date = calculateOccurrence(schedule, generatedCount);
  return isOccurrenceAllowed(schedule, date, generatedCount) ? date : null;
}

export function previewOccurrences(
  schedule: RecurrenceSchedule,
  count: number,
  generatedCount = 0,
): string[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("Vorschauanzahl muss nicht-negativ sein");
  const result: string[] = [];
  for (let index = generatedCount; result.length < count; index += 1) {
    const date = calculateOccurrence(schedule, index);
    if (!isOccurrenceAllowed(schedule, date, index)) break;
    result.push(date);
  }
  return result;
}

export function dateInTimeZone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
