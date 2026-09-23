import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/connection";
import {
  activityCategories,
  activityLogs,
  activityTypes,
  settlementJobs,
  userFavorites,
  userProfiles,
  userSettings,
} from "@/lib/db/schema";
import type { ActivityLog } from "@/lib/domain";
import { getDayBoundaryDate, sleepAttributedDate } from "@/lib/game/time";
import { CATEGORIES } from "@/lib/domain";
import { validateActivityMetrics } from "@/lib/validation";

export class LogApiError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

function requireValidMetricDetails(log: ActivityLog, category: CategoryRow, type: { metricSchemaKey: string }) {
  const result = validateActivityMetrics(log, type.metricSchemaKey, category.userId !== null);
  if (!result.success) throw new LogApiError(400, result.message);
}

type Owner = { id: string; name: string };
type LogRow = typeof activityLogs.$inferSelect;
type CategoryRow = typeof activityCategories.$inferSelect;
type JoinedLog = { log: LogRow; categoryKey: string; typeKey: string | null };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function storedDetails(log: ActivityLog): Record<string, unknown> {
  const details = { ...log.details };
  if (log.customTraits) details.__dailyCustomTraits = log.customTraits;
  if (log.customTag) details.__dailyCustomTag = log.customTag;
  return details;
}

function fromJoined(row: JoinedLog): ActivityLog {
  const details = { ...row.log.details };
  const customTraits = details.__dailyCustomTraits;
  const customTag = details.__dailyCustomTag;
  delete details.__dailyCustomTraits;
  delete details.__dailyCustomTag;
  return {
    id: row.log.id,
    categoryKey: row.categoryKey,
    typeKey: row.typeKey ?? row.categoryKey,
    status: row.log.status as ActivityLog["status"],
    startedAt: row.log.startedAt.toISOString(),
    endedAt: row.log.endedAt?.toISOString() ?? null,
    durationMin: row.log.durationMin,
    attributedDate: row.log.attributedDate,
    mood: row.log.mood,
    details,
    note: row.log.note,
    source: row.log.source as ActivityLog["source"],
    version: row.log.version,
    deletedAt: row.log.deletedAt?.toISOString() ?? null,
    ...(customTraits && typeof customTraits === "object" ? { customTraits: customTraits as ActivityLog["customTraits"] } : {}),
    ...(typeof customTag === "string" ? { customTag } : {}),
  };
}

async function ensureProfile(database: Database, owner: Owner) {
  const [profile] = await database.select().from(userProfiles).where(eq(userProfiles.userId, owner.id)).limit(1);
  if (profile) return profile;
  await database.insert(userProfiles).values({ userId: owner.id, displayName: owner.name }).onConflictDoNothing();
  await database.insert(userSettings).values({ userId: owner.id }).onConflictDoNothing();
  const [created] = await database.select().from(userProfiles).where(eq(userProfiles.userId, owner.id)).limit(1);
  if (!created) throw new Error("Could not create the authenticated profile");
  return created;
}

async function resolveCategory(database: Database, userId: string, categoryKey: string): Promise<CategoryRow> {
  const [category] = await database.select().from(activityCategories).where(and(
    eq(activityCategories.key, categoryKey),
    or(isNull(activityCategories.userId), eq(activityCategories.userId, userId)),
  )).orderBy(sql`case when ${activityCategories.userId} = ${userId} then 0 else 1 end`).limit(1);
  if (!category) throw new LogApiError(400, "Unknown activity category");
  return category;
}

async function resolveActivityType(database: Database, userId: string, category: CategoryRow, typeKey: string) {
  const [type] = await database.select().from(activityTypes).where(and(
    eq(activityTypes.categoryId, category.id),
    eq(activityTypes.name, typeKey),
    or(isNull(activityTypes.userId), eq(activityTypes.userId, userId)),
  )).orderBy(sql`case when ${activityTypes.userId} = ${userId} then 0 else 1 end`).limit(1);
  if (type) return type;
  throw new LogApiError(400, "Unknown activity type");
}

function attributedDate(log: ActivityLog, timezone: string, dayBoundaryMinutes: number): string {
  return log.categoryKey === "sleep"
    ? sleepAttributedDate(log, timezone)
    : getDayBoundaryDate(new Date(log.startedAt), timezone, dayBoundaryMinutes);
}

async function queueSettlement(database: Database, ownerId: string, date: string, profile: { timezone: string; dayBoundaryMinutes: number }, now: Date, reason: "edit" | "late_entry") {
  const today = getDayBoundaryDate(now, profile.timezone, profile.dayBoundaryMinutes);
  if (date >= today) return;
  const runAfter = new Date(now.getTime() + 30_000);
  const [pending] = await database.select().from(settlementJobs).where(and(
    eq(settlementJobs.userId, ownerId), eq(settlementJobs.date, date), eq(settlementJobs.status, "pending"),
  )).limit(1);
  if (pending) {
    await database.update(settlementJobs).set({ reason, runAfter }).where(and(eq(settlementJobs.id, pending.id), eq(settlementJobs.userId, ownerId)));
    return;
  }
  await database.insert(settlementJobs).values({ userId: ownerId, date, reason, runAfter }).onConflictDoNothing();
}

async function upsertFavorites(database: Database, ownerId: string, log: ActivityLog, now: Date) {
  const candidates: Array<[string, unknown]> = [
    [log.categoryKey === "study" ? "subject" : "", log.details.subject],
    [log.categoryKey === "development" ? "project" : "", log.details.project],
    [log.categoryKey === "reading" ? "book" : "", log.details.book],
    [log.categoryKey === "meal" ? "menu" : "", log.details.menu ?? log.details.food],
  ];
  for (const [kind, value] of candidates) {
    if (!kind || typeof value !== "string" || !value.trim()) continue;
    await database.insert(userFavorites).values({ userId: ownerId, kind, value: value.trim(), useCount: 1, lastUsedAt: now }).onConflictDoUpdate({
      target: [userFavorites.userId, userFavorites.kind, userFavorites.value],
      set: { useCount: sql`${userFavorites.useCount} + 1`, lastUsedAt: now },
    });
  }
}

function isSameLog(row: LogRow, log: ActivityLog, categoryId: string, typeId: string, date: string): boolean {
  return row.categoryId === categoryId
    && row.activityTypeId === typeId
    && row.status === log.status
    && row.startedAt.getTime() === new Date(log.startedAt).getTime()
    && row.endedAt?.getTime() === (log.endedAt ? new Date(log.endedAt).getTime() : undefined)
    && row.durationMin === log.durationMin
    && row.attributedDate === date
    && row.mood === log.mood
    && stableJson(row.details) === stableJson(storedDetails(log))
    && row.note === log.note
    && row.source === log.source;
}

async function joinedById(database: Database, userId: string, id: string) {
  const [row] = await database.select({ log: activityLogs, categoryKey: activityCategories.key, typeKey: activityTypes.name })
    .from(activityLogs)
    .innerJoin(activityCategories, eq(activityLogs.categoryId, activityCategories.id))
    .leftJoin(activityTypes, eq(activityLogs.activityTypeId, activityTypes.id))
    .where(and(eq(activityLogs.id, id), eq(activityLogs.userId, userId), isNull(activityLogs.deletedAt)))
    .limit(1);
  return row as JoinedLog | undefined;
}

export async function listActivityLogs(database: Database, userId: string, date: string): Promise<ActivityLog[]> {
  const rows = await database.select({ log: activityLogs, categoryKey: activityCategories.key, typeKey: activityTypes.name })
    .from(activityLogs)
    .innerJoin(activityCategories, eq(activityLogs.categoryId, activityCategories.id))
    .leftJoin(activityTypes, eq(activityLogs.activityTypeId, activityTypes.id))
    .where(and(eq(activityLogs.userId, userId), eq(activityLogs.attributedDate, date), isNull(activityLogs.deletedAt)))
    .orderBy(asc(activityLogs.startedAt));
  return rows.map((row) => fromJoined(row as JoinedLog));
}

export async function listAllActivityLogs(database: Database, userId: string): Promise<ActivityLog[]> {
  const rows = await database.select({ log: activityLogs, categoryKey: activityCategories.key, typeKey: activityTypes.name })
    .from(activityLogs)
    .innerJoin(activityCategories, eq(activityLogs.categoryId, activityCategories.id))
    .leftJoin(activityTypes, eq(activityLogs.activityTypeId, activityTypes.id))
    .where(eq(activityLogs.userId, userId))
    .orderBy(asc(activityLogs.startedAt));
  return rows.map((row) => fromJoined(row as JoinedLog));
}

export async function listUserFavorites(database: Database, userId: string) {
  return database.select({ kind: userFavorites.kind, value: userFavorites.value, useCount: userFavorites.useCount, lastUsedAt: userFavorites.lastUsedAt })
    .from(userFavorites).where(eq(userFavorites.userId, userId)).orderBy(asc(userFavorites.kind), asc(userFavorites.value));
}

export async function deleteUserFavorite(database: Database, userId: string, kind: string, value: string) {
  const deleted = await database.delete(userFavorites).where(and(
    eq(userFavorites.userId, userId), eq(userFavorites.kind, kind), eq(userFavorites.value, value),
  )).returning({ value: userFavorites.value });
  return deleted.length > 0;
}

export async function listUserActivityLogsRange(database: Database, userId: string, startDate: string, endDate: string): Promise<ActivityLog[]> {
  const rows = await database.select({ log: activityLogs, categoryKey: activityCategories.key, typeKey: activityTypes.name })
    .from(activityLogs)
    .innerJoin(activityCategories, eq(activityLogs.categoryId, activityCategories.id))
    .leftJoin(activityTypes, eq(activityLogs.activityTypeId, activityTypes.id))
    .where(and(
      eq(activityLogs.userId, userId),
      sql`${activityLogs.attributedDate} >= ${startDate}::date AND ${activityLogs.attributedDate} <= ${endDate}::date`,
    ))
    .orderBy(asc(activityLogs.startedAt));
  return rows.map((row) => fromJoined(row as JoinedLog));
}

export async function saveActivityLog(database: Database, owner: Owner, log: ActivityLog, now = new Date()) {
  return database.transaction(async (tx) => {
    const profile = await ensureProfile(tx as Database, owner);
    const category = await resolveCategory(tx as Database, owner.id, log.categoryKey);
    const type = await resolveActivityType(tx as Database, owner.id, category, log.typeKey);
    requireValidMetricDetails(log, category, type);
    const date = attributedDate(log, profile.timezone, profile.dayBoundaryMinutes);
    const [existing] = await tx.select().from(activityLogs).where(and(eq(activityLogs.id, log.id), eq(activityLogs.userId, owner.id))).limit(1);
    let row: LogRow;
    let changed = false;
    if (existing) {
      if (existing.deletedAt) throw new LogApiError(409, "A deleted log cannot be recreated with the same id");
      if (isSameLog(existing, log, category.id, type.id, date)) return { log: fromJoined({ log: existing, categoryKey: category.key, typeKey: type.name }), created: false };
      if (log.version !== existing.version + 1) throw new LogApiError(409, "The log version is stale");
      const [updated] = await tx.update(activityLogs).set({
        categoryId: category.id,
        activityTypeId: type.id,
        status: log.status,
        startedAt: new Date(log.startedAt),
        endedAt: log.endedAt ? new Date(log.endedAt) : null,
        durationMin: log.durationMin,
        attributedDate: date,
        mood: log.mood,
        details: storedDetails(log),
        note: log.note,
        source: log.source,
        version: log.version,
        updatedAt: now,
      }).where(and(eq(activityLogs.id, log.id), eq(activityLogs.userId, owner.id), eq(activityLogs.version, existing.version), isNull(activityLogs.deletedAt))).returning();
      if (!updated) throw new LogApiError(409, "The log version is stale");
      row = updated;
      changed = true;
      if (existing.attributedDate !== date) await queueSettlement(tx as Database, owner.id, existing.attributedDate, profile, now, "edit");
    } else {
      const [created] = await tx.insert(activityLogs).values({
        id: log.id,
        userId: owner.id,
        categoryId: category.id,
        activityTypeId: type.id,
        status: log.status,
        startedAt: new Date(log.startedAt),
        endedAt: log.endedAt ? new Date(log.endedAt) : null,
        durationMin: log.durationMin,
        attributedDate: date,
        mood: log.mood,
        details: storedDetails(log),
        note: log.note,
        source: log.source,
        version: 1,
        updatedAt: now,
      }).onConflictDoNothing().returning();
      if (!created) throw new LogApiError(404, "The log id is already in use");
      row = created;
      changed = true;
    }
    if (changed) {
      await upsertFavorites(tx as Database, owner.id, log, now);
      await queueSettlement(tx as Database, owner.id, date, profile, now, existing ? "edit" : "late_entry");
    }
    return { log: fromJoined({ log: row, categoryKey: category.key, typeKey: type.name }), created: !existing };
  });
}

export async function updateActivityLog(database: Database, owner: Owner, log: ActivityLog, expectedVersion: number, now = new Date()) {
  return database.transaction(async (tx) => {
    const profile = await ensureProfile(tx as Database, owner);
    const current = await joinedById(tx as Database, owner.id, log.id);
    if (!current) throw new LogApiError(404, "Activity log not found");
    if (current.log.version !== expectedVersion) throw new LogApiError(409, "The log version is stale");
    const category = await resolveCategory(tx as Database, owner.id, log.categoryKey);
    const type = await resolveActivityType(tx as Database, owner.id, category, log.typeKey);
    requireValidMetricDetails(log, category, type);
    const date = attributedDate(log, profile.timezone, profile.dayBoundaryMinutes);
    const [updated] = await tx.update(activityLogs).set({
      categoryId: category.id,
      activityTypeId: type.id,
      status: log.status,
      startedAt: new Date(log.startedAt),
      endedAt: log.endedAt ? new Date(log.endedAt) : null,
      durationMin: log.durationMin,
      attributedDate: date,
      mood: log.mood,
      details: storedDetails(log),
      note: log.note,
      source: log.source,
      version: expectedVersion + 1,
      updatedAt: now,
    }).where(and(eq(activityLogs.id, log.id), eq(activityLogs.userId, owner.id), eq(activityLogs.version, expectedVersion), isNull(activityLogs.deletedAt))).returning();
    if (!updated) throw new LogApiError(409, "The log version is stale");
    await upsertFavorites(tx as Database, owner.id, log, now);
    await queueSettlement(tx as Database, owner.id, current.log.attributedDate, profile, now, "edit");
    await queueSettlement(tx as Database, owner.id, date, profile, now, "edit");
    return fromJoined({ log: updated, categoryKey: category.key, typeKey: type.name });
  });
}

export async function softDeleteActivityLog(database: Database, owner: Owner, id: string, expectedVersion: number, now = new Date()) {
  return database.transaction(async (tx) => {
    const profile = await ensureProfile(tx as Database, owner);
    const current = await joinedById(tx as Database, owner.id, id);
    if (!current) throw new LogApiError(404, "Activity log not found");
    if (current.log.version !== expectedVersion) throw new LogApiError(409, "The log version is stale");
    const [deleted] = await tx.update(activityLogs).set({ deletedAt: now, version: expectedVersion + 1, updatedAt: now })
      .where(and(eq(activityLogs.id, id), eq(activityLogs.userId, owner.id), eq(activityLogs.version, expectedVersion), isNull(activityLogs.deletedAt))).returning({ id: activityLogs.id });
    if (!deleted) throw new LogApiError(409, "The log version is stale");
    await queueSettlement(tx as Database, owner.id, current.log.attributedDate, profile, now, "edit");
    return { id, deleted: true, version: expectedVersion + 1 };
  });
}

export const SYSTEM_CATEGORY_KEYS = new Set(CATEGORIES.map((category) => category.key));
