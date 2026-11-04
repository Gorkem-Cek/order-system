// Order history filters by business day: the calendar day in the cafés' time zone
// (Istanbul, like the API's businessDate()), written as YYYY-MM-DD.

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The business day `at` falls on, e.g. "2026-11-04". */
export function businessDay(at: Date = new Date()): string {
  return dayFormatter.format(at);
}

/** The day `days` after (or before, when negative) a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
