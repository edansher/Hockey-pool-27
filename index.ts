const torontoClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function previousDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Pool reporting days end at 02:00 Toronto wall time, not UTC or local midnight. */
export function getPoolDates(now = new Date()): { today: string; lastNight: string } {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid current time");
  const parts = new Map(torontoClock.formatToParts(now).map(part => [part.type, part.value]));
  const calendarDate = `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
  const hour = Number(parts.get("hour"));
  if (!Number.isFinite(hour) || !/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    throw new Error("Unable to determine Toronto pool date");
  }
  // Calendar arithmetic preserves the boundary through both DST transitions.
  const today = hour < 2 ? previousDate(calendarDate) : calendarDate;
  return { today, lastNight: previousDate(today) };
}

export function getPreviousPoolDate(now = new Date()): string {
  return getPoolDates(now).lastNight;
}