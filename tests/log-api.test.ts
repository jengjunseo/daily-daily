import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/server-session", () => ({ getAuthenticatedUser: async () => null }));
import { GET as getLogs } from "@/app/api/logs/route";
import { GET as getSync } from "@/app/api/sync/route";
import { GET as getProfile } from "@/app/api/profile/route";
import { deleteAccountData, getAccountSnapshot, updateAccount } from "@/lib/api/account";
import { createActivityCategory, listActivityCategories } from "@/lib/api/categories";
import { listActivityLogs, listAllActivityLogs, saveActivityLog, softDeleteActivityLog, updateActivityLog } from "@/lib/api/logs";
import { syncActivityLogs } from "@/lib/api/sync";
import { validateActivityMetrics } from "@/lib/validation";
import { activityCategories, activityTypes, settlementJobs, userFavorites } from "@/lib/db/schema";
import type { Database } from "@/lib/db/connection";
import type { ActivityLog } from "@/lib/domain";

const engines: PGlite[] = [];
const migrations = ["0000_initial_schema.sql", "0001_add_event_effects.sql"].map((file) => readFileSync(resolve(process.cwd(), `lib/db/migrations/${file}`), "utf8"));
const ownerA = { id: "github-user-a", name: "A" };
const ownerB = { id: "github-user-b", name: "B" };
const start = "2026-09-22T01:00:00.000Z";
const end = "2026-09-22T02:00:00.000Z";

async function makeDatabase() {
  const engine = new PGlite();
  engines.push(engine);
  for (const migration of migrations) await engine.exec(migration);
  return drizzle(engine) as unknown as Database;
}

function studyLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: "83a9b7b8-0a12-4bca-b5a8-3543deabbc45",
    categoryKey: "study",
    typeKey: "수학",
    status: "completed",
    startedAt: start,
    endedAt: end,
    durationMin: 60,
    attributedDate: "2026-09-22",
    mood: null,
    details: { subject: "수학" },
    note: "",
    source: "detailed",
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()));
});

describe("authenticated log data access", () => {
  it("scopes reads, updates, and soft deletes to the session user", async () => {
    const database = await makeDatabase();
    const created = await saveActivityLog(database, ownerA, studyLog(), new Date("2026-09-23T12:00:00.000Z"));
    expect(created.created).toBe(true);
    expect(created.log.attributedDate).toBe("2026-09-22");
    expect((await listActivityLogs(database, ownerA.id, "2026-09-22")).map((log) => log.id)).toEqual([created.log.id]);
    expect(await listActivityLogs(database, ownerB.id, "2026-09-22")).toEqual([]);

    await expect(updateActivityLog(database, ownerB, studyLog({ ...created.log, note: "forged" }), 1))
      .rejects.toMatchObject({ status: 404 });
    await expect(softDeleteActivityLog(database, ownerB, created.log.id, 1))
      .rejects.toMatchObject({ status: 404 });

    const edited = await updateActivityLog(database, ownerA, studyLog({ ...created.log, note: "review" }), 1, new Date("2026-09-23T12:01:00.000Z"));
    expect(edited.version).toBe(2);
    await expect(updateActivityLog(database, ownerA, studyLog({ ...edited, note: "stale" }), 1))
      .rejects.toMatchObject({ status: 409 });

    const removed = await softDeleteActivityLog(database, ownerA, edited.id, 2, new Date("2026-09-23T12:02:00.000Z"));
    expect(removed).toEqual({ id: edited.id, deleted: true, version: 3 });
    expect(await listActivityLogs(database, ownerA.id, "2026-09-22")).toEqual([]);
  });

  it("makes retries idempotent, records favorites once, and queues past-date settlement", async () => {
    const database = await makeDatabase();
    const log = studyLog();
    const first = await saveActivityLog(database, ownerA, log, new Date("2026-09-23T12:00:00.000Z"));
    const retry = await saveActivityLog(database, ownerA, log, new Date("2026-09-23T12:00:01.000Z"));
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(await database.select().from(userFavorites).where(eq(userFavorites.userId, ownerA.id))).toHaveLength(1);
    const jobs = await database.select().from(settlementJobs).where(eq(settlementJobs.userId, ownerA.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.date).toBe("2026-09-22");
  });

  it("keeps custom categories and their activity types private to their owner", async () => {
    const database = await makeDatabase();
    const input = {
      key: "custom-12345678-1234-1234-1234-123456789abc",
      name: "악기 연습",
      icon: "♫",
      color: "#b9a071",
      group: "craft" as const,
      primary: "creativity" as const,
      secondary: "knowledge" as const,
      typeNames: ["기타"],
      metricSchemaKey: "count" as const,
      tag: "custom",
    };
    const result = await createActivityCategory(database, ownerA.id, input);
    expect((await database.select().from(activityCategories).where(eq(activityCategories.key, input.key)))[0]?.userId).toBe(ownerA.id);
    expect((await database.select().from(activityTypes).where(eq(activityTypes.userId, ownerA.id)))[0]?.metricSchemaKey).toBe("count");
    expect(result.created).toBe(true);
    expect((await createActivityCategory(database, ownerA.id, input)).created).toBe(false);
    expect((await listActivityCategories(database, ownerA.id)).map((category) => category.key)).toContain(input.key);
    expect((await listActivityCategories(database, ownerB.id)).map((category) => category.key)).not.toContain(input.key);

    const saved = await saveActivityLog(database, ownerA, studyLog({
      id: "7d7fbc64-316f-4fc1-8202-726866634bcd",
      categoryKey: input.key,
      typeKey: "기타",
      details: { count: 3 },
      customTraits: { creativity: 0.7, knowledge: 0.3 },
      customTag: "custom",
    }));
    expect(saved.log.categoryKey).toBe(input.key);
    expect(saved.log.customTraits).toEqual({ creativity: 0.7, knowledge: 0.3 });
    expect(validateActivityMetrics(studyLog({ categoryKey: input.key, details: { count: -1 } }), "count", true).success).toBe(false);
    expect(await listActivityLogs(database, ownerB.id, "2026-09-22")).toEqual([]);
    await expect(saveActivityLog(database, ownerA, studyLog({
      id: "5b39255b-7c01-4b51-a90a-35717fbb93fd",
      categoryKey: input.key,
      typeKey: "기타",
      details: { count: -1 },
      customTraits: { creativity: 0.7, knowledge: 0.3 },
      customTag: "custom",
    }))).rejects.toMatchObject({ status: 400 });
  });

  it("returns 401 before touching the database when there is no Auth.js session", async () => {
    const response = await getLogs(new Request("http://localhost/api/logs?date=2026-09-22"));
    expect(response?.status).toBe(401);
    expect((await getSync())?.status).toBe(401);
    expect((await getProfile())?.status).toBe(401);
  });

  it("syncs offline edits with version conflicts and never returns another user's logs", async () => {
    const database = await makeDatabase();
    const log = studyLog();
    const created = await syncActivityLogs(database, ownerA, [log]);
    expect(created.synced).toEqual([log.id]);
    expect((await listAllActivityLogs(database, ownerB.id))).toEqual([]);

    const edited = { ...log, version: 2, note: "offline edit" };
    const updated = await syncActivityLogs(database, ownerA, [edited]);
    expect(updated.synced).toEqual([log.id]);
    expect(updated.logs[0]).toMatchObject({ version: 2, note: "offline edit" });

    const stale = { ...edited, note: "stale device edit" };
    const conflict = await syncActivityLogs(database, ownerA, [stale]);
    expect(conflict.synced).toEqual([]);
    expect(conflict.conflicts).toMatchObject([{ id: log.id, server: { version: 2, note: "offline edit" } }]);

    const tombstone = { ...edited, version: 3, deletedAt: "2026-09-23T12:00:00.000Z" };
    const removed = await syncActivityLogs(database, ownerA, [tombstone]);
    expect(removed.synced).toEqual([log.id]);
    expect(removed.logs[0]).toMatchObject({ version: 3, deletedAt: expect.any(String) });
  });

  it("stores profile settings per account and deletes only the confirmed account's server data", async () => {
    const database = await makeDatabase();
    await saveActivityLog(database, ownerA, studyLog());
    await saveActivityLog(database, ownerB, studyLog({ id: "4d7d0acf-d6ae-4d7d-bdaf-c167b290952a" }));
    await updateAccount(database, ownerA, { displayName: "Astra", timezone: "America/New_York", reducedEffects: true, bgmVolume: 0.35 });
    expect(await getAccountSnapshot(database, ownerA)).toMatchObject({
      profile: { displayName: "Astra", timezone: "America/New_York" },
      settings: { timezone: "America/New_York", reducedEffects: true, bgmVolume: 0.35 },
    });
    await deleteAccountData(database, ownerA.id);
    expect(await listAllActivityLogs(database, ownerA.id)).toEqual([]);
    expect(await listAllActivityLogs(database, ownerB.id)).toHaveLength(1);
  });
});
