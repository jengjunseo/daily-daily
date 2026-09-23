import type { ActivityLog } from "@/lib/domain";

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const take = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: take("year"), month: take("month"), day: take("day"), hour: take("hour"), minute: take("minute"), second: take("second") };
}

export function localDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function localClock(date: Date, timeZone: string): string {
  const { hour, minute } = localParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addDateDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compareLocal(parts: LocalParts, dateKey: string, hour: number, minute: number): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const lhs = (((((parts.year * 13 + parts.month) * 32 + parts.day) * 24 + parts.hour) * 60) + parts.minute);
  const rhs = (((((year * 13 + month) * 32 + day) * 24 + hour) * 60) + minute);
  return lhs - rhs;
}

/**
 * Convert a wall-clock value to an instant without relying on the server's timezone.
 * Ambiguous fall-back times select the earlier instant; skipped spring-forward times
 * advance to the first real wall-clock minute after the gap.
 */
export function localDateTimeToInstant(dateKey: string, clock: string, timeZone: string): Date {
  const [hour, minute] = clock.split(":").map(Number);
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let firstExact: number | null = null;
  let firstLater: number | null = null;
  for (let instant = guess - 15 * 60 * 60_000; instant <= guess + 15 * 60 * 60_000; instant += 60_000) {
    const parts = localParts(new Date(instant), timeZone);
    const sameDate = parts.year === year && parts.month === month && parts.day === day;
    if (!sameDate) continue;
    const comparison = compareLocal(parts, dateKey, hour, minute);
    if (comparison === 0 && firstExact === null) firstExact = instant;
    if (comparison > 0 && (firstLater === null || compareLocal(localParts(new Date(firstLater), timeZone), dateKey, hour, minute) > comparison)) {
      firstLater = instant;
    }
  }
  const result = firstExact ?? firstLater;
  if (result === null) throw new RangeError(`Could not resolve ${dateKey} ${clock} in ${timeZone}`);
  return new Date(result);
}

export function splitIntervalByLocalDate(startAt: string | Date, endAt: string | Date, timeZone: string): Record<string, number> {
  const start = startAt instanceof Date ? startAt.getTime() : new Date(startAt).getTime();
  const end = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return {};
  const totals: Record<string, number> = {};
  let cursor = start;
  while (cursor < end) {
    const nextBoundary = Math.min(end, Math.floor(cursor / 60_000) * 60_000 + 60_000);
    const dateKey = localDateKey(new Date(cursor), timeZone);
    totals[dateKey] = (totals[dateKey] ?? 0) + (nextBoundary - cursor) / 60_000;
    cursor = nextBoundary;
  }
  return totals;
}

export function durationMinutes(startAt: string | Date, endAt: string | Date): number {
  const start = startAt instanceof Date ? startAt.getTime() : new Date(startAt).getTime();
  const end = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function sleepAttributedDate(log: Pick<ActivityLog, "categoryKey" | "startedAt" | "endedAt" | "details" | "attributedDate">, timeZone: string): string {
  if (log.categoryKey !== "sleep") return log.attributedDate;
  const kind = String(log.details.sleepType ?? "night").toLowerCase();
  const isNap = kind === "nap" || kind.includes("낮잠") || kind === "powernap";
  if (isNap || !log.endedAt) return localDateKey(new Date(log.startedAt), timeZone);
  return localDateKey(new Date(log.endedAt), timeZone);
}

export function getDayBoundaryDate(now: Date, timeZone: string, boundaryMinutes = 0): string {
  const date = localDateKey(now, timeZone);
  const clock = localClock(now, timeZone);
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute < boundaryMinutes ? addDateDays(date, -1) : date;
}

export function localDateTimeRangeToInstants(date: string, startClock: string, endClock: string, timeZone: string): { start: Date; end: Date } {
  const start = localDateTimeToInstant(date, startClock, timeZone);
  const endDate = endClock < startClock ? addDateDays(date, 1) : date;
  return { start, end: localDateTimeToInstant(endDate, endClock, timeZone) };
}

export function formatDate(dateKey: string, timeZone = "Asia/Seoul", options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "short" }): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { ...options, timeZone }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
