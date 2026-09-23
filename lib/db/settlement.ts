import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/connection";
import {
  dailySettlements,
  eventOccurrences,
  heroCollections,
  inventories,
  rewardLedger,
  settlementJobs,
  traitProgress,
  userProfiles,
} from "@/lib/db/schema";
import { EVENTS } from "@/content/events";
import { HERO_BY_NO } from "@/content/heroes";
import { TRAITS, type ActivityLog, type Trait } from "@/lib/domain";
import { listActivityCategories } from "@/lib/api/categories";
import { listUserActivityLogsRange } from "@/lib/api/logs";
import { addDateDays, getDayBoundaryDate, sleepAttributedDate, splitIntervalByLocalDate } from "@/lib/game/time";
import { extractFeatures } from "@/lib/game/features";
import { judgeHero } from "@/lib/game/judge";
import { buildDailyNarrative } from "@/lib/game/narrative";
import { stableDigest } from "@/lib/game/rng";
import { heroDiscoveryReward } from "@/lib/game/progression";
import { applyTraitXp } from "@/lib/game/xp";

function dayLogsFor(logs: ActivityLog[], date: string, timezone: string): ActivityLog[] {
  return logs.filter((log) => {
    if (log.deletedAt || log.status !== "completed") return false;
    if (log.categoryKey === "sleep") return sleepAttributedDate(log, timezone) === date;
    if (!log.endedAt) return log.attributedDate === date;
    return Boolean(splitIntervalByLocalDate(log.startedAt, log.endedAt, timezone)[date]);
  });
}

async function applyDiscoveryReward(database: Database, userId: string, heroNo: number) {
  const hero = HERO_BY_NO.get(heroNo);
  if (!hero) throw new Error(`Hero ${heroNo} is missing`);
  const reward = heroDiscoveryReward(hero);
  const [ledgerRow] = await database.insert(rewardLedger).values({
    userId,
    sourceType: "settlement",
    sourceKey: `settlement_first:${hero.no}`,
    xp: reward.xp,
    items: reward.items,
  }).onConflictDoNothing().returning({ id: rewardLedger.id });
  if (!ledgerRow) return;

  const existing = await database.select().from(traitProgress).where(eq(traitProgress.userId, userId));
  const byTrait = new Map(existing.map((row) => [row.trait, row]));
  const current = Object.fromEntries(TRAITS.map((trait) => {
    const row = byTrait.get(trait);
    return [trait, { xp: row?.xp ?? 0, level: row?.level ?? 1 }];
  })) as Record<Trait, { xp: number; level: number }>;
  const next = applyTraitXp(current, reward.xp);
  for (const trait of TRAITS) {
    await database.insert(traitProgress).values({ userId, trait, xp: next[trait].xp, level: next[trait].level }).onConflictDoUpdate({
      target: [traitProgress.userId, traitProgress.trait],
      set: { xp: next[trait].xp, level: next[trait].level },
    });
  }
  for (const [itemId, quantity] of Object.entries(reward.items)) {
    await database.insert(inventories).values({ userId, itemId, quantity }).onConflictDoUpdate({
      target: [inventories.userId, inventories.itemId],
      set: { quantity: sql`${inventories.quantity} + ${quantity}` },
    });
  }
}

export async function settleDatabaseDay(database: Database, userId: string, date: string, now = new Date()) {
  return database.transaction(async (tx) => {
    await tx.insert(userProfiles).values({ userId }).onConflictDoNothing();
    const [profile] = await tx.select().from(userProfiles).where(eq(userProfiles.userId, userId)).for("update");
    if (!profile) throw new Error("Authenticated profile is missing");
    const today = getDayBoundaryDate(now, profile.timezone, profile.dayBoundaryMinutes);
    if (date >= today) return { settled: false, reason: "today_or_future" as const };

    const startDate = addDateDays(date, -60);
    const logs = await listUserActivityLogsRange(tx as Database, userId, startDate, date);
    const categories = await listActivityCategories(tx as Database, userId);
    const [eventRows, finalRows] = await Promise.all([
      tx.select().from(eventOccurrences).where(and(eq(eventOccurrences.userId, userId), eq(eventOccurrences.date, date))),
      tx.select().from(dailySettlements).where(and(eq(dailySettlements.userId, userId), eq(dailySettlements.date, date))),
    ]);
    const eventById = new Map(EVENTS.map((event) => [event.id, event]));
    const dateEvents = eventRows.flatMap((row) => {
      const event = eventById.get(row.eventId);
      return event ? [{ id: row.eventId, date: row.date, rarity: event.rarity, title: event.title }] : [];
    });
    const features = extractFeatures(logs, date, profile.timezone, dateEvents, profile.createdAt.toISOString(), categories);
    if (features.logCount === 0 && features.priorDayLogCount === 0) return { settled: false, reason: "no_activity" as const };
    const dateLogs = dayLogsFor(logs, date, profile.timezone);
    const inputHash = stableDigest({
      logs: dateLogs.map(({ id, categoryKey, typeKey, startedAt, endedAt, durationMin, mood, details, deletedAt, version }) => ({ id, categoryKey, typeKey, startedAt, endedAt, durationMin, mood, details, deletedAt, version })),
      events: dateEvents.map(({ id, rarity, title }) => ({ id, rarity, title })),
      ruleVersion: "1.0.0",
    });
    const currentFinal = finalRows.find((row) => row.status === "final");
    if (currentFinal?.inputHash === inputHash) return { settled: false, reason: "unchanged" as const };

    const judgement = judgeHero(features);
    const narrative = buildDailyNarrative(userId, date, features, judgement.hero, dateLogs);
    const revision = Math.max(0, ...finalRows.map((row) => row.revision)) + 1;
    await tx.update(dailySettlements).set({ status: "superseded" }).where(and(
      eq(dailySettlements.userId, userId), eq(dailySettlements.date, date), eq(dailySettlements.status, "final"),
    ));
    await tx.insert(dailySettlements).values({
      userId,
      date,
      revision,
      status: "final",
      heroTypeNo: judgement.hero.no,
      features: features as unknown as Record<string, unknown>,
      reasons: judgement.reasons,
      narrative,
      ruleVersion: "1.0.0",
      inputHash,
    });

    const priorCollection = await tx.select().from(heroCollections).where(and(
      eq(heroCollections.userId, userId), eq(heroCollections.heroTypeNo, judgement.hero.no),
    )).limit(1);
    const [collectionStats] = await tx.select({
      count: sql<number>`count(distinct ${dailySettlements.date})`,
      firstDate: sql<string>`min(${dailySettlements.date})`,
    }).from(dailySettlements).where(and(
      eq(dailySettlements.userId, userId), eq(dailySettlements.heroTypeNo, judgement.hero.no), eq(dailySettlements.status, "final"),
    ));
    await tx.insert(heroCollections).values({
      userId,
      heroTypeNo: judgement.hero.no,
      firstObtainedDate: collectionStats?.firstDate ?? date,
      count: Number(collectionStats?.count ?? 1),
    }).onConflictDoUpdate({
      target: [heroCollections.userId, heroCollections.heroTypeNo],
      set: { firstObtainedDate: collectionStats?.firstDate ?? date, count: Number(collectionStats?.count ?? 1) },
    });
    if (priorCollection.length === 0) await applyDiscoveryReward(tx as Database, userId, judgement.hero.no);
    return { settled: true, date, revision, heroNo: judgement.hero.no, reasons: judgement.reasons };
  });
}

function activityDates(logs: ActivityLog[], timezone: string): Set<string> {
  const dates = new Set<string>();
  for (const log of logs) {
    if (log.deletedAt || log.status !== "completed") continue;
    if (log.categoryKey === "sleep") {
      dates.add(sleepAttributedDate(log, timezone));
    } else if (log.endedAt) {
      Object.keys(splitIntervalByLocalDate(log.startedAt, log.endedAt, timezone)).forEach((date) => dates.add(date));
    } else {
      dates.add(log.attributedDate);
    }
  }
  return dates;
}

export async function enqueueMissingSettlementJobs(database: Database, userId: string, now = new Date()) {
  const [profile] = await database.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!profile) return 0;
  const today = getDayBoundaryDate(now, profile.timezone, profile.dayBoundaryMinutes);
  const earliest = addDateDays(today, -60);
  const logs = await listUserActivityLogsRange(database, userId, earliest, addDateDays(today, -1));
  const activeDates = activityDates(logs, profile.timezone);
  if (!activeDates.size) return 0;
  const firstDate = [...activeDates].sort()[0] ?? today;
  const startDate = firstDate < earliest ? earliest : firstDate;
  const finalRows = await database.select({ date: dailySettlements.date }).from(dailySettlements).where(and(
    eq(dailySettlements.userId, userId), eq(dailySettlements.status, "final"), gte(dailySettlements.date, startDate), lt(dailySettlements.date, today),
  ));
  const settledDates = new Set(finalRows.map((row) => row.date));
  let queued = 0;
  for (let date = startDate; date < today; date = addDateDays(date, 1)) {
    const active = activeDates.has(date) || activeDates.has(addDateDays(date, -1));
    if (!active || settledDates.has(date)) continue;
    const [job] = await database.insert(settlementJobs).values({ userId, date, reason: "midnight", runAfter: now }).onConflictDoNothing().returning({ id: settlementJobs.id });
    if (job) queued++;
  }
  return queued;
}

export async function enqueueAllMissingSettlementJobs(database: Database, now = new Date()) {
  const profiles = await database.select({ userId: userProfiles.userId }).from(userProfiles);
  let queued = 0;
  for (const profile of profiles) queued += await enqueueMissingSettlementJobs(database, profile.userId, now);
  return queued;
}

export async function ensureUserSettled(database: Database, userId: string, now = new Date()) {
  const queued = await enqueueMissingSettlementJobs(database, userId, now);
  const processed = await processPendingSettlementJobs(database, now);
  return { queued, ...processed };
}

export async function processPendingSettlementJobs(database: Database, now = new Date(), limit = 100) {
  const claimed = await database.transaction(async (tx) => {
    const rows = await tx.select().from(settlementJobs).where(and(
      eq(settlementJobs.status, "pending"), lt(settlementJobs.runAfter, new Date(now.getTime() + 1)),
    )).orderBy(asc(settlementJobs.runAfter)).limit(limit).for("update", { skipLocked: true });
    for (const row of rows) {
      await tx.update(settlementJobs).set({ status: "running", attempts: row.attempts + 1, lockedUntil: new Date(now.getTime() + 5 * 60_000) })
        .where(and(eq(settlementJobs.id, row.id), eq(settlementJobs.status, "pending")));
    }
    return rows.map((row) => ({ id: row.id, userId: row.userId, date: row.date, attempts: row.attempts + 1 }));
  });
  let settled = 0;
  let failed = 0;
  for (const job of claimed) {
    try {
      await settleDatabaseDay(database, job.userId, job.date, now);
      await database.update(settlementJobs).set({ status: "done", lockedUntil: null }).where(eq(settlementJobs.id, job.id));
      settled++;
    } catch {
      await database.update(settlementJobs).set({
        status: job.attempts >= 5 ? "failed" : "pending",
        runAfter: new Date(now.getTime() + Math.min(job.attempts * 60_000, 15 * 60_000)),
        lockedUntil: null,
      }).where(eq(settlementJobs.id, job.id));
      failed++;
    }
  }
  return { claimed: claimed.length, settled, failed };
}
