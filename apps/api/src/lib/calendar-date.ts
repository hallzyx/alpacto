/**
 * Campaign (and similar) fields are calendar days, not instants.
 * Storing `YYYY-MM-DDT00:00:00.000Z` and formatting in local TZ (e.g. Peru UTC−5)
 * shows the previous day. Prefer noon UTC + serialize as YYYY-MM-DD.
 */

export function parseCalendarDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const day = value.includes("T") ? value.slice(0, 10) : value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("Invalid calendar date");
  }
  const d = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid calendar date");
  return d;
}

export function toCalendarDateString(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
