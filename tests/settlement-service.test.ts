import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { saveActivityLog, updateActivityLog } from "@/lib/api/logs";
import { settleDatabaseDay, processPendingSettlementJobs } from "@/lib/db/settlement";
import { dailySettlements, heroCollections, rewardLedger, settlementJobs } from "@/lib/db/schema";
import type { Database } from "@/lib/db/connection";
import type { ActivityLog } from "@/lib/domain";

const engines: PGlite[] = [];
const migrations = ["0000_initial_schema.sql", "0001_add_event_effects.sql"].map((file) => readFileSync(resolve(process.cwd(), `lib/db/migrations/${file}`), "utf8"));

async function makeDatabase() {
  const engine = new PGlite();
  engines.push(engine);
  for (const migration of migrations) await engine.exec(migration);
  return drizzle(engine) as unknown as Database;
}

afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()));
});

describe("server settlement worker", () => {
  it("keeps one final settlement when five callers settle the same date concurrently", async () => {
    const database = await makeDatabase();
    const owner = { id: "parallel-settlement-user", name: "Parallel" };
    const date = "2026-09-22";
    await saveActivityLog(database, owner, {
      id: "4925a20c-cd47-49fd-8415-586625b12a7e",
      categoryKey: "study", typeKey: "수학", status: "completed",
      startedAt: "2026-09-22T01:00:00.000Z", endedAt: "2026-09-22T02:00:00.000Z", durationMin: 60,
      attributedDate: date, mood: 3, details: { subject: "수학" }, note: "", source: "detailed", version: 1, deletedAt: null,
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => settleDatabaseDay(database, owner.id, date, new Date("2026-09-23T12:00:00.000Z"))));
    expect(results.filter((result) => result.settled)).toHaveLength(1);
    const rows = await database.select().from(dailySettlements).where(eq(dailySettlements.userId, owner.id));
    expect(rows.filter((row) => row.status === "final")).toHaveLength(1);
  });

  it("processes queued days, deduplicates retries, and revisions edits atomically", async () => {
    const database = await makeDatabase();
    const owner = { id: "settlement-user", name: "Adventurer" };
    const baseNow = new Date("2026-09-23T12:00:00.000Z");
    const log: ActivityLog = {
      id: "94609e53-7f19-4515-8d41-b038dd5358f5",
      categoryKey: "study",
      typeKey: "수학",
      status: "completed",
      startedAt: "2026-09-22T01:00:00.000Z",
      endedAt: "2026-09-22T02:00:00.000Z",
      durationMin: 60,
      attributedDate: "2026-09-22",
      mood: 4,
      details: { subject: "수학", problems: 30, correct: 25 },
      note: "",
      source: "detailed",
      version: 1,
      deletedAt: null,
    };
    await saveActivityLog(database, owner, log, baseNow);
    const firstBatch = await processPendingSettlementJobs(database, new Date(baseNow.getTime() + 60_000));
    expect(firstBatch).toMatchObject({ claimed: 1, settled: 1, failed: 0 });

    const first = await database.select().from(dailySettlements).where(eq(dailySettlements.userId, owner.id));
    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe("final");
    expect(first[0]?.heroTypeNo).toBeGreaterThanOrEqual(1);
    expect(first[0]?.heroTypeNo).toBeLessThanOrEqual(100);

    const retry = await settleDatabaseDay(database, owner.id, "2026-09-22", new Date("2026-09-23T13:00:00.000Z"));
    expect(retry).toMatchObject({ settled: false, reason: "unchanged" });
    const retryRows = await database.select().from(dailySettlements).where(eq(dailySettlements.userId, owner.id));
    expect(retryRows).toHaveLength(1);

    const updated = { ...log, version: 2, note: "revised" };
    await updateActivityLog(database, owner, updated, 1, new Date("2026-09-23T13:01:00.000Z"));
    const secondBatch = await processPendingSettlementJobs(database, new Date("2026-09-23T13:02:00.000Z"));
    expect(secondBatch).toMatchObject({ claimed: 1, settled: 1, failed: 0 });
    const revisions = await database.select().from(dailySettlements).where(eq(dailySettlements.userId, owner.id));
    expect(revisions.map((row) => [row.revision, row.status]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([[1, "superseded"], [2, "final"]]);
    const collections = await database.select().from(heroCollections).where(eq(heroCollections.userId, owner.id));
    expect(collections).toHaveLength(1);
    expect(collections[0]?.count).toBe(1);
    const ledger = await database.select().from(rewardLedger).where(eq(rewardLedger.userId, owner.id));
    expect(new Set(ledger.map((entry) => entry.sourceKey)).size).toBe(ledger.length);
    const jobs = await database.select().from(settlementJobs).where(eq(settlementJobs.userId, owner.id));
    expect(jobs.every((job) => job.status === "done")).toBe(true);
  });
});
