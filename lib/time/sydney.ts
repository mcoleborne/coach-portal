/**
 * The one place this codebase turns an instant into a Sydney calendar date or
 * clock reading. Everything goes through Intl.DateTimeFormat with the IANA zone
 * Australia/Sydney, so AEDT (UTC+11, first Sunday in October to first Sunday in
 * April) and AEST (UTC+10) are both handled by the platform's tz database.
 *
 * Never derive a date with toISOString().slice(0, 10) (that is UTC) and never
 * add a fixed offset. Day arithmetic between two date-only values stays civil:
 * see civilDaysBetween, which never involves a zone.
 */

export const SYDNEY = "Australia/Sydney";

export type CivilDate = { year: number; month: number; day: number };

export type SydneyParts = CivilDate & {
  hour: number;
  minute: number;
  weekday: number; // 0 Sunday to 6 Saturday
  zone: "AEDT" | "AEST";
};

const partsFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
  weekday: "short",
  timeZoneName: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Calendar and clock parts of an instant, as read on a wall clock in Sydney. */
export function sydneyParts(instant: Date): SydneyParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(instant)) out[p.type] = p.value;
  const zone = out.timeZoneName === "AEDT" ? "AEDT" : "AEST";
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    weekday: WEEKDAYS.indexOf(out.weekday),
    zone,
  };
}

/** Today in Sydney. Pass a clock in tests; production passes nothing. */
export function sydneyToday(now: Date = new Date()): CivilDate {
  const { year, month, day } = sydneyParts(now);
  return { year, month, day };
}

/** YYYY-MM-DD for a civil date. Pure formatting, no zone involved. */
export function civilToIso(d: CivilDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Parse YYYY-MM-DD into a civil date. */
export function parseCivil(iso: string): CivilDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not a civil date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** The Sydney date of an instant, as YYYY-MM-DD. */
export function sydneyDateIso(instant: Date): string {
  return civilToIso(sydneyToday(instant));
}

/** The Sydney month an instant falls in, as YYYY-MM (the tier_by_month key). */
export function sydneyMonthKey(instant: Date): string {
  const { year, month } = sydneyParts(instant);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Whole days from a to b between two civil dates. Both are reduced to a day
 * count on the proleptic Gregorian calendar, so no zone or DST enters.
 */
export function civilDaysBetween(a: CivilDate, b: CivilDate): number {
  return dayNumber(b) - dayNumber(a);
}

function dayNumber({ year, month, day }: CivilDate): number {
  // Days since 0000-03-01, a standard civil-from-days inverse.
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

/** AEDT or AEST, as it applies in Sydney at that instant. */
export function zoneLabel(instant: Date): "AEDT" | "AEST" {
  return sydneyParts(instant).zone;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(p: SydneyParts): string {
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const mm = String(p.minute).padStart(2, "0");
  return `${h12}:${mm}${p.hour < 12 ? "am" : "pm"}`;
}

/** "Tue 18 Nov, 6:00pm AEDT" */
export function formatSydneyDateTime(instant: Date): string {
  const p = sydneyParts(instant);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}, ${clock(p)} ${p.zone}`;
}

/** "18 Nov 2026" */
export function formatSydneyDate(instant: Date): string {
  const p = sydneyParts(instant);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "18 Nov" */
export function formatSydneyShortDate(instant: Date): string {
  const p = sydneyParts(instant);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "Tue" for a due date this week, otherwise "18 Nov". */
export function formatDue(instant: Date, now: Date = new Date()): string {
  const days = civilDaysBetween(sydneyToday(now), sydneyToday(instant));
  const p = sydneyParts(instant);
  if (days >= 0 && days < 7) return WEEKDAYS[p.weekday];
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "6:00pm AEDT" */
export function formatSydneyTime(instant: Date): string {
  const p = sydneyParts(instant);
  return `${clock(p)} ${p.zone}`;
}
