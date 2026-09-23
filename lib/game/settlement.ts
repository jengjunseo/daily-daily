import { HERO_BY_NO } from "@/content/heroes";
import type { AppState, ActivityLog } from "@/lib/domain";
import { addDateDays, getDayBoundaryDate, sleepAttributedDate, splitIntervalByLocalDate } from "@/lib/game/time";
import { extractFeatures } from "@/lib/game/features";
import { judgeHero } from "@/lib/game/judge";
import { buildDailyNarrative } from "@/lib/game/narrative";
import { stableDigest } from "@/lib/game/rng";
import { grantHeroDiscovery } from "@/lib/game/progression";

function logsForDate(logs: ActivityLog[], date: string, timeZone: string): ActivityLog[] {
  return logs.filter((log) => {
    if (log.deletedAt || log.status !== "completed") return false;
    if (log.categoryKey === "sleep") return sleepAttributedDate(log, timeZone) === date;
    if (!log.endedAt) return log.attributedDate === date;
    return Boolean(splitIntervalByLocalDate(log.startedAt, log.endedAt, timeZone)[date]);
  });
}

function hasRecordedDay(logs: ActivityLog[], date: string, timeZone: string): boolean {
  return logsForDate(logs, date, timeZone).length > 0;
}

export function settleLocalDay(state: AppState, date: string, now = new Date()): AppState {
  const today = getDayBoundaryDate(now, state.profile.timezone);
  if (date >= today) return state;
  const dayLogs = logsForDate(state.logs, date, state.profile.timezone);
  const priorLogs = logsForDate(state.logs, addDateDays(date, -1), state.profile.timezone);
  if (dayLogs.length === 0 && priorLogs.length === 0) return state;
  const dateEvents = state.events.filter((event) => event.date === date);
  const features = extractFeatures(state.logs, date, state.profile.timezone, dateEvents, state.profile.createdAt, state.customCategories);
  const inputHash = stableDigest({
    logs: dayLogs.map(({ id, categoryKey, typeKey, startedAt, endedAt, durationMin, mood, details, deletedAt, version }) => ({ id, categoryKey, typeKey, startedAt, endedAt, durationMin, mood, details, deletedAt, version })),
    events: dateEvents.map(({ id, rarity, title }) => ({ id, rarity, title })),
    ruleVersion: "1.0.0",
  });
  const activeFinal = state.settlements.find((settlement) => settlement.date === date && settlement.status === "final");
  if (activeFinal?.inputHash === inputHash) return state;

  const judgement = judgeHero(features);
  const narrative = buildDailyNarrative(state.profile.id, date, features, judgement.hero, dayLogs);
  const revision = Math.max(0, ...state.settlements.filter((settlement) => settlement.date === date).map((settlement) => settlement.revision)) + 1;
  const createdAt = now.toISOString();
  const nextSettlement = {
    date,
    revision,
    status: "final" as const,
    heroNo: judgement.hero.no,
    features: features as unknown as Record<string, unknown>,
    reasons: judgement.reasons,
    narrative,
    inputHash,
    seen: false,
    createdAt,
  };

  let next: AppState = {
    ...state,
    settlements: [
      ...state.settlements.map((settlement) => settlement.date === date && settlement.status === "final" ? { ...settlement, status: "superseded" as const } : settlement),
      nextSettlement,
    ],
  };
  const collection = { ...next.collection };
  const heroCollection = collection[judgement.hero.no];
  const dates = heroCollection?.dates.includes(date) ? heroCollection.dates : [...(heroCollection?.dates ?? []), date].sort();
  collection[judgement.hero.no] = { firstDate: heroCollection?.firstDate ?? date, count: Math.max(heroCollection?.count ?? 0, dates.length), dates };
  next = { ...next, collection };
  if (!heroCollection) next = grantHeroDiscovery(next, judgement.hero);
  return next;
}

export function ensureLocalSettlements(state: AppState, now = new Date()): AppState {
  const today = getDayBoundaryDate(now, state.profile.timezone);
  const activeDates = state.logs.filter((log) => !log.deletedAt && log.status === "completed").map((log) => log.attributedDate).filter((date) => date < today).sort();
  if (activeDates.length === 0) return state;
  const firstDate = activeDates[0] ?? today;
  const startDate = firstDate < addDateDays(today, -60) ? addDateDays(today, -60) : firstDate;
  let next = state;
  for (let date = startDate; date < today; date = addDateDays(date, 1)) {
    if (hasRecordedDay(next.logs, date, next.profile.timezone)) {
      next = settleLocalDay(next, date, now);
      continue;
    }
    const previousDate = addDateDays(date, -1);
    if (hasRecordedDay(next.logs, previousDate, next.profile.timezone)) next = settleLocalDay(next, date, now);
  }
  return next;
}

export function settleDatesForLog(state: AppState, log: ActivityLog, now = new Date()): AppState {
  const impacted = log.categoryKey === "sleep"
    ? [sleepAttributedDate(log, state.profile.timezone)]
    : log.endedAt
      ? Object.keys(splitIntervalByLocalDate(log.startedAt, log.endedAt, state.profile.timezone))
      : [log.attributedDate];
  return impacted.reduce((current, date) => settleLocalDay(current, date, now), state);
}

export function visibleSettlements(state: AppState): AppState["settlements"] {
  return state.settlements.filter((settlement) => settlement.status === "final").sort((a, b) => b.date.localeCompare(a.date));
}

export function heroForSettlement(heroNo: number) {
  return HERO_BY_NO.get(heroNo);
}

