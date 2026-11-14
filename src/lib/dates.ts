/**
 * Date rules for the whole app. One module, no other file does date maths.
 *
 *  - Every date is a calendar day in Asia/Tehran, written "YYYY-MM-DD".
 *  - Tehran is UTC+3:30 all year (Iran has no daylight saving time since 2022),
 *    so a fixed offset is exact and keeps the results identical on every server.
 *  - A week runs Saturday to Thursday. Friday is the day off. A Friday belongs to
 *    the week that ended the day before, so the week start is always the
 *    Saturday on or before the date.
 */

const TEHRAN_OFFSET_MINUTES = 3 * 60 + 30;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** JavaScript weekday numbers (0 = Sunday). */
const SATURDAY = 6;
const FRIDAY = 5;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC of a calendar day, in milliseconds. */
function toDayMs(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Not a date in YYYY-MM-DD form: "${date}"`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (fromDayMs(ms) !== date) {
    throw new RangeError(`Not a real calendar day: "${date}"`);
  }
  return ms;
}

function fromDayMs(ms: number): string {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True for a real calendar day written as YYYY-MM-DD. */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  try {
    toDayMs(value);
    return true;
  } catch {
    return false;
  }
}

/** The Tehran calendar day and clock time of an instant. */
export function tehranClock(instant: Date): {
  date: string;
  hour: number;
  minute: number;
} {
  const shifted = new Date(instant.getTime() + TEHRAN_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    date: fromDayMs(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Today's date in Tehran. Pass `now` in tests. */
export function todayInTehran(now: Date = new Date()): string {
  return tehranClock(now).date;
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(toDayMs(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return fromDayMs(toDayMs(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDayMs(to) - toDayMs(from)) / MS_PER_DAY);
}

export function isFriday(date: string): boolean {
  return dayOfWeek(date) === FRIDAY;
}

export function isWeekStart(date: string): boolean {
  return isDateString(date) && dayOfWeek(date) === SATURDAY;
}

/** The Saturday on or before `date`. Friday gives the Saturday six days earlier. */
export function weekStartOf(date: string): string {
  const back = (dayOfWeek(date) - SATURDAY + 7) % 7;
  return addDays(date, -back);
}

/** The last working day of the week: the Thursday, five days after the Saturday. */
export function weekEnd(weekStart: string): string {
  if (!isWeekStart(weekStart)) {
    throw new RangeError(`Not a week start (Saturday): "${weekStart}"`);
  }
  return addDays(weekStart, 5);
}

/** All seven calendar days of a week, Saturday first. Friday is the last. */
export function weekDays(weekStart: string): string[] {
  weekEnd(weekStart); // validates
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** The weekly summary is due Thursday 23:59 Tehran time, returned as an exact instant. */
export function weeklyDueAt(weekStart: string): Date {
  const thursday = toDayMs(weekEnd(weekStart));
  const minutesIntoDay = 23 * 60 + 59;
  return new Date(thursday + (minutesIntoDay - TEHRAN_OFFSET_MINUTES) * MS_PER_MINUTE);
}

/** The Saturday that starts the week before. */
export function previousWeekStart(weekStart: string): string {
  return addDays(weekStart, -7);
}

// ---------------------------------------------------------------- display --

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(date: string): { year: number; month: string; day: number; weekday: string } {
  const d = new Date(toDayMs(date));
  return {
    year: d.getUTCFullYear(),
    month: MONTHS[d.getUTCMonth()],
    day: d.getUTCDate(),
    weekday: WEEKDAYS[d.getUTCDay()],
  };
}

/** "Sat 14 Nov" */
export function formatDay(date: string): string {
  const p = parts(date);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "14 Nov 2026" */
export function formatDayWithYear(date: string): string {
  const p = parts(date);
  return `${p.day} ${p.month} ${p.year}`;
}

/** "Sat" */
export function formatWeekday(date: string): string {
  return parts(date).weekday;
}

/** "Sat 14 Nov – Thu 19 Nov 2026" (Saturday to Thursday). */
export function formatWeekLabel(weekStart: string): string {
  const end = weekEnd(weekStart);
  const sameYear = weekStart.slice(0, 4) === end.slice(0, 4);
  const startText = sameYear ? formatDay(weekStart) : `${formatDay(weekStart)} ${weekStart.slice(0, 4)}`;
  return `${startText} – ${formatDay(end)} ${end.slice(0, 4)}`;
}

/** "14 Nov – 19 Nov 2026": a shorter form of the week for pickers. */
export function formatWeekRange(weekStart: string): string {
  const start = parts(weekStart);
  const end = parts(weekEnd(weekStart));
  const startYear = start.year === end.year ? "" : ` ${start.year}`;
  return `${start.day} ${start.month}${startYear} – ${end.day} ${end.month} ${end.year}`;
}

/** "14 Nov 2026, 17:42" in Tehran time. */
export function formatTehranDateTime(instant: Date): string {
  const { date, hour, minute } = tehranClock(instant);
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return `${formatDayWithYear(date)}, ${time}`;
}
