import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

describe("Postgres schema migration", () => {
  it("creates the schema and repeatable system seeds in PGlite", async () => {
    const db = new PGlite();
    const migrations = ["0000_initial_schema.sql", "0001_add_event_effects.sql"].map((file) => readFileSync(resolve(process.cwd(), `lib/db/migrations/${file}`), "utf8"));
    for (const migration of migrations) { await db.exec(migration); await db.exec(migration); }
    const categories = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM activity_category WHERE user_id IS NULL");
    const types = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM activity_type WHERE user_id IS NULL");
    expect(categories.rows[0]?.count).toBe(13);
    expect(types.rows[0]?.count).toBeGreaterThan(60);
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='user_settings' AND column_name='event_effects'")).rows[0]?.count).toBe(1);
    await db.query("INSERT INTO reward_ledger(user_id,source_type,source_key) VALUES ('user-a','quest','same')");
    await expect(db.query("INSERT INTO reward_ledger(user_id,source_type,source_key) VALUES ('user-a','quest','same')")).rejects.toThrow();
    await db.close();
  });

  it("applies the checked-in migration through Drizzle's production migrator", async () => {
    const engine = new PGlite();
    const database = drizzle(engine);
    const migrationsFolder = resolve(process.cwd(), "lib/db/migrations");
    await migrate(database, { migrationsFolder });
    await migrate(database, { migrationsFolder });
    const categories = await engine.query<{ count: number }>("SELECT count(*)::int AS count FROM activity_category WHERE user_id IS NULL");
    const migrations = await engine.query<{ count: number }>("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
    expect(categories.rows[0]?.count).toBe(13);
    expect(migrations.rows[0]?.count).toBe(2);
    expect((await engine.query<{ count: number }>("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='user_settings' AND column_name='event_effects'")).rows[0]?.count).toBe(1);
    await engine.close();
  });
});
