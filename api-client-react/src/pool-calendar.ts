const torontoCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const poolCalendarDate = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Previous Toronto calendar day, not the UTC day or a rolling 24-hour period. */
export function getPreviousTorontoDate(now = new Date()): string {
  const parts = torontoCalendar.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find(p => p.type === type);
    if (!part) throw new Error(`Toronto calendar is missing ${type}.`);
    return part.value;
  };
  const calendarDay = new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);
  calendarDay.setUTCDate(calendarDay.getUTCDate() - 1);
  return calendarDay.toISOString().slice(0, 10);
}

/** Formats a YYYY-MM-DD wire value as a calendar date, never as a local instant. */
export function formatPoolCalendarDate(value?: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return poolCalendarDate.format(date);
}