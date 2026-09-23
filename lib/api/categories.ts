import { and, asc, eq, or } from "drizzle-orm";
import type { Database } from "@/lib/db/connection";
import { activityCategories, activityTypes } from "@/lib/db/schema";
import { TRAITS, type CategoryDefinition, type Group, type Trait } from "@/lib/domain";
import type { z } from "zod";
import { CustomCategorySchema } from "@/lib/validation";
import { LogApiError } from "@/lib/api/logs";

type CustomCategoryInput = z.infer<typeof CustomCategorySchema>;
type TraitWeights = Record<string, number>;

function categoryDefinition(
  row: typeof activityCategories.$inferSelect,
  typeNames: string[],
  tag?: string,
  metricSchemaKey = "duration",
): CategoryDefinition {
  const weights = (row.traitWeights ?? {}) as TraitWeights;
  const traits = Object.entries(weights)
    .filter(([trait, weight]) => TRAITS.includes(trait as Trait) && Number.isFinite(weight))
    .sort((left, right) => right[1] - left[1])
    .map(([trait]) => trait as Trait);
  const primary = traits[0] ?? "knowledge";
  const secondary = traits[1] ?? primary;
  return {
    key: row.key,
    name: row.name,
    icon: row.icon,
    color: row.color,
    group: row.groupKey as Group,
    primary,
    secondary,
    types: typeNames,
    ...(row.userId ? { isCustom: true, tag: tag ?? "custom", metricSchemaKey: metricSchemaKey as CategoryDefinition["metricSchemaKey"] } : {}),
  };
}

export async function listActivityCategories(database: Database, userId: string): Promise<CategoryDefinition[]> {
  const rows = await database.select({ category: activityCategories, typeName: activityTypes.name, metricSchemaKey: activityTypes.metricSchemaKey })
    .from(activityCategories)
    .leftJoin(activityTypes, and(
      eq(activityTypes.categoryId, activityCategories.id),
      or(eq(activityTypes.userId, userId), eq(activityTypes.isSystem, true)),
    ))
    .where(or(eq(activityCategories.userId, userId), eq(activityCategories.isSystem, true)))
    .orderBy(asc(activityCategories.sortOrder), asc(activityCategories.name), asc(activityTypes.name));
  const grouped = new Map<string, { category: typeof activityCategories.$inferSelect; types: Set<string>; metricSchemaKey: string }>();
  for (const row of rows) {
    const entry = grouped.get(row.category.id) ?? { category: row.category, types: new Set<string>(), metricSchemaKey: row.metricSchemaKey ?? "duration" };
    if (row.typeName) entry.types.add(row.typeName);
    grouped.set(row.category.id, entry);
  }
  return [...grouped.values()].map(({ category, types, metricSchemaKey }) => categoryDefinition(category, [...types], undefined, metricSchemaKey));
}

export async function createActivityCategory(database: Database, userId: string, input: CustomCategoryInput): Promise<{ category: CategoryDefinition; created: boolean }> {
  return database.transaction(async (tx) => {
    const [existing] = await tx.select().from(activityCategories).where(and(
      eq(activityCategories.userId, userId), eq(activityCategories.key, input.key),
    )).limit(1);
    if (existing) {
      const existingTypes = await tx.select({ name: activityTypes.name }).from(activityTypes).where(and(
        eq(activityTypes.userId, userId), eq(activityTypes.categoryId, existing.id),
      )).orderBy(asc(activityTypes.name));
      const same = existing.name === input.name
        && existing.icon === input.icon
        && existing.color === input.color
        && existing.groupKey === input.group
        && JSON.stringify(existingTypes.map((type) => type.name).sort()) === JSON.stringify(input.typeNames.slice().sort());
      if (!same) throw new LogApiError(409, "A category with this key already exists");
      return { category: categoryDefinition(existing, input.typeNames, input.tag, input.metricSchemaKey), created: false };
    }

    const traitWeights = input.primary === input.secondary
      ? { [input.primary]: 1 }
      : { [input.primary]: 0.7, [input.secondary]: 0.3 };
    const [category] = await tx.insert(activityCategories).values({
      userId,
      key: input.key,
      name: input.name,
      icon: input.icon,
      color: input.color,
      groupKey: input.group,
      traitWeights,
      isSystem: false,
      sortOrder: 100,
    }).onConflictDoNothing().returning();
    if (!category) throw new LogApiError(409, "A category with this key already exists");
    await tx.insert(activityTypes).values(input.typeNames.map((name) => ({
      userId,
      categoryId: category.id,
      key: Buffer.from(name, "utf8").toString("hex"),
      name,
      metricSchemaKey: input.metricSchemaKey,
      tags: [...new Set([input.group, input.tag].filter((value): value is string => Boolean(value)))],
      isSystem: false,
    })));
    return { category: categoryDefinition(category, input.typeNames, input.tag, input.metricSchemaKey), created: true };
  });
}
