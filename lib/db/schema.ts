import { pgTable, text, uuid, integer, boolean, real, jsonb, date, timestamp, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userProfiles = pgTable("user_profile", {
  userId: text("user_id").primaryKey(), displayName: text("display_name").notNull().default(""), timezone: text("timezone").notNull().default("Asia/Seoul"),
  dayBoundaryMinutes: integer("day_boundary_minutes").notNull().default(0), avatarId: integer("avatar_id").notNull().default(0), titleId: text("title_id").notNull().default("chronicler"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(), bgmEnabled: boolean("bgm_enabled").notNull().default(true), bgmVolume: real("bgm_volume").notNull().default(0.25),
  sfxEnabled: boolean("sfx_enabled").notNull().default(true), sfxVolume: real("sfx_volume").notNull().default(0.5), skipTitle: boolean("skip_title").notNull().default(false), reducedEffects: boolean("reduced_effects").notNull().default(false), eventEffects: boolean("event_effects").notNull().default(true), timezone: text("timezone").notNull().default("Asia/Seoul"),
});

export const activityCategories = pgTable("activity_category", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id"), key: text("key").notNull(), name: text("name").notNull(), icon: text("icon").notNull().default("✦"), color: text("color").notNull().default("#aaa9a2"), groupKey: text("group_key").notNull().default("life"),
  traitWeights: jsonb("trait_weights").$type<Record<string, number>>().notNull().default({}), isSystem: boolean("is_system").notNull().default(false), sortOrder: integer("sort_order").notNull().default(0), archived: boolean("archived").notNull().default(false),
}, (table) => [uniqueIndex("activity_category_system_key_uq").on(table.key).where(sql`${table.userId} IS NULL`), uniqueIndex("activity_category_user_key_uq").on(table.userId, table.key).where(sql`${table.userId} IS NOT NULL`)]);

export const activityTypes = pgTable("activity_type", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id"), categoryId: uuid("category_id").notNull().references(() => activityCategories.id), key: text("key").notNull(), name: text("name").notNull(), icon: text("icon"),
  metricSchemaKey: text("metric_schema_key").notNull().default("duration"), traitWeights: jsonb("trait_weights").$type<Record<string, number>>(), tags: jsonb("tags").$type<string[]>().notNull().default([]), isSystem: boolean("is_system").notNull().default(false), archived: boolean("archived").notNull().default(false),
}, (table) => [index("activity_type_category_idx").on(table.categoryId), uniqueIndex("activity_type_user_category_key_uq").on(table.userId, table.categoryId, table.key).where(sql`${table.userId} IS NOT NULL`), uniqueIndex("activity_type_system_category_key_uq").on(table.categoryId, table.key).where(sql`${table.userId} IS NULL`)]);

export const userFavorites = pgTable("user_favorite", {
  userId: text("user_id").notNull(), kind: text("kind").notNull(), value: text("value").notNull(), useCount: integer("use_count").notNull().default(1), lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.kind, table.value] })]);

export const userPins = pgTable("user_pin", {
  userId: text("user_id").notNull(), categoryId: uuid("category_id").notNull().references(() => activityCategories.id), position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.categoryId] }), uniqueIndex("user_pin_position_uq").on(table.userId, table.position)]);

export const activityLogs = pgTable("activity_log", {
  id: uuid("id").primaryKey(), userId: text("user_id").notNull(), categoryId: uuid("category_id").notNull().references(() => activityCategories.id), activityTypeId: uuid("activity_type_id").references(() => activityTypes.id),
  status: text("status").notNull().default("completed"), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), endedAt: timestamp("ended_at", { withTimezone: true }), durationMin: integer("duration_min").notNull().default(0),
  attributedDate: date("attributed_date").notNull(), mood: integer("mood"), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), note: text("note").notNull().default(""), source: text("source").notNull().default("detailed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp("deleted_at", { withTimezone: true }), version: integer("version").notNull().default(1),
}, (table) => [index("activity_log_user_date_idx").on(table.userId, table.attributedDate), index("activity_log_user_status_idx").on(table.userId, table.status)]);

export const dailySettlements = pgTable("daily_settlement", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull(), date: date("date").notNull(), revision: integer("revision").notNull(), status: text("status").notNull().default("final"),
  heroTypeNo: integer("hero_type_no").notNull(), features: jsonb("features").$type<Record<string, unknown>>().notNull(), reasons: jsonb("reasons").$type<string[]>().notNull(), narrative: text("narrative").array().notNull().default([]), ruleVersion: text("rule_version").notNull().default("1.0.0"), inputHash: text("input_hash").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("daily_settlement_final_uq").on(table.userId, table.date).where(sql`${table.status} = 'final'`), uniqueIndex("daily_settlement_revision_uq").on(table.userId, table.date, table.revision)]);

export const heroCollections = pgTable("hero_collection", {
  userId: text("user_id").notNull(), heroTypeNo: integer("hero_type_no").notNull(), firstObtainedDate: date("first_obtained_date").notNull(), count: integer("count").notNull().default(1),
}, (table) => [primaryKey({ columns: [table.userId, table.heroTypeNo] })]);

export const eventOccurrences = pgTable("event_occurrence", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull(), eventId: text("event_id").notNull(), date: date("date").notNull(), triggerLogId: uuid("trigger_log_id").references(() => activityLogs.id), chainId: text("chain_id"), chainStep: integer("chain_step"), seenAt: timestamp("seen_at", { withTimezone: true }), data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("event_occurrence_user_event_date_uq").on(table.userId, table.eventId, table.date)]);

export const rewardLedger = pgTable("reward_ledger", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull(), sourceType: text("source_type").notNull(), sourceKey: text("source_key").notNull(), xp: jsonb("xp").$type<Record<string, number>>().notNull().default({}), items: jsonb("items").$type<Record<string, number>>().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("reward_ledger_user_source_uq").on(table.userId, table.sourceType, table.sourceKey)]);

export const inventories = pgTable("inventory", {
  userId: text("user_id").notNull(), itemId: text("item_id").notNull(), quantity: integer("quantity").notNull().default(0), firstObtainedAt: timestamp("first_obtained_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.itemId] })]);

export const achievements = pgTable("achievement", {
  userId: text("user_id").notNull(), achievementId: text("achievement_id").notNull(), unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(), date: date("date").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.achievementId] })]);

export const questProgress = pgTable("quest_progress", {
  userId: text("user_id").notNull(), chainId: text("chain_id").notNull(), step: integer("step").notNull().default(0), state: text("state").notNull().default("active"), startedDate: date("started_date").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [primaryKey({ columns: [table.userId, table.chainId] })]);

export const regionUnlocks = pgTable("region_unlock", {
  userId: text("user_id").notNull(), regionId: text("region_id").notNull(), unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.regionId] })]);

export const settlementJobs = pgTable("settlement_job", {
  id: uuid("id").primaryKey().defaultRandom(), userId: text("user_id").notNull(), date: date("date").notNull(), reason: text("reason").notNull(), status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(), lockedUntil: timestamp("locked_until", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("settlement_job_open_user_date_uq").on(table.userId, table.date).where(sql`${table.status} IN ('pending', 'running')`), index("settlement_job_ready_idx").on(table.status, table.runAfter)]);

export const traitProgress = pgTable("trait_progress", {
  userId: text("user_id").notNull(), trait: text("trait").notNull(), xp: integer("xp").notNull().default(0), level: integer("level").notNull().default(1),
}, (table) => [primaryKey({ columns: [table.userId, table.trait] })]);

export const dailyCategoryOrdinals = pgTable("daily_category_ordinal", {
  userId: text("user_id").notNull(), date: date("date").notNull(), categoryKey: text("category_key").notNull(), ordinal: integer("ordinal").notNull().default(0), signatures: jsonb("signatures").$type<Record<string, number>>().notNull().default({}),
}, (table) => [primaryKey({ columns: [table.userId, table.date, table.categoryKey] })]);
