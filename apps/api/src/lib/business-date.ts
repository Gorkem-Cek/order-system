/** Cafés are in Turkey for now; a per-café time zone can be added later. */
export const BUSINESS_TIME_ZONE = "Europe/Istanbul";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar day an order belongs to, in the café's time zone, as a UTC-midnight Date
 * (what Prisma expects for a `@db.Date` column). Order numbers restart at 1 each day.
 */
export function businessDate(at: Date): Date {
  return new Date(`${dayFormatter.format(at)}T00:00:00.000Z`);
}
