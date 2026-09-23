import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/connection";
import { activityCategories, userPins } from "@/lib/db/schema";

export async function listUserPins(database: Database, userId: string) {
  const rows = await database.select({ key: activityCategories.key, position: userPins.position })
    .from(userPins)
    .innerJoin(activityCategories, eq(userPins.categoryId, activityCategories.id))
    .where(eq(userPins.userId, userId))
    .orderBy(asc(userPins.position));
  return rows.map((row) => row.key);
}

export async function replaceUserPins(database: Database, userId: string, keys: string[]) {
  return database.transaction(async (tx) => {
    const categories = keys.length ? await tx.select({ id: activityCategories.id, key: activityCategories.key })
      .from(activityCategories)
      .where(and(
        inArray(activityCategories.key, keys),
        or(isNull(activityCategories.userId), eq(activityCategories.userId, userId)),
      ))
      .orderBy(sql`case when ${activityCategories.userId} = ${userId} then 0 else 1 end`) : [];
    const byKey = new Map<string, string>();
    for (const row of categories) if (!byKey.has(row.key)) byKey.set(row.key, row.id);
    const resolved = keys.map((key) => ({ key, id: byKey.get(key) })).filter((entry): entry is { key: string; id: string } => Boolean(entry.id));
    if (resolved.length !== keys.length) throw new Error("One or more categories are not available to this account");
    await tx.delete(userPins).where(eq(userPins.userId, userId));
    if (resolved.length) await tx.insert(userPins).values(resolved.map((entry, position) => ({ userId, categoryId: entry.id, position })));
    return resolved.map((entry) => entry.key);
  });
}
