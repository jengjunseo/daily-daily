import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;
const globalDatabase = globalThis as typeof globalThis & { dailyDailyDatabase?: { client: ReturnType<typeof postgres>; db: Database } };

export function getDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (!globalDatabase.dailyDailyDatabase) {
    const client = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false });
    globalDatabase.dailyDailyDatabase = { client, db: drizzle(client, { schema }) };
  }
  return globalDatabase.dailyDailyDatabase.db;
}
