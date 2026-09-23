import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

describe("Postgres schema migration", () => {
  it("creates the schema and repeatable system seeds in PGlite", async () => {
    const db = new PGlite();
    const migration = readFileSync(resolve(process.cwd(), "lib/db/migrations/0000_initial_schema.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const categories = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM activity_category WHERE user_id IS NULL");
    const types = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM activity_type WHERE user_id IS NULL");
    expect(categories.rows[0]?.count).toBe(13);
    expect(types.rows[0]?.count).toBeGreaterThan(60);
    await db.query("INSERT INTO reward_ledger(user_id,source_type,source_key) VALUES ('user-a','quest','same')");
    await expect(db.query("INSERT INTO reward_ledger(user_id,source_type,source_key) VALUES ('user-a','quest','same')")).rejects.toThrow();
    await db.close();
  });
});
