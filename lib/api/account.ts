import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/connection";
import {
  achievements,
  activityCategories,
  activityLogs,
  activityTypes,
  dailyCategoryOrdinals,
  dailySettlements,
  eventOccurrences,
  heroCollections,
  inventories,
  questProgress,
  regionUnlocks,
  rewardLedger,
  settlementJobs,
  traitProgress,
  userFavorites,
  userPins,
  userProfiles,
  userSettings,
} from "@/lib/db/schema";

const timezoneSchema = z.string().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "A valid IANA timezone is required");

export const AccountPatchSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  timezone: timezoneSchema.optional(),
  dayBoundaryMinutes: z.number().int().min(0).max(1439).optional(),
  avatarId: z.number().int().min(0).max(99).optional(),
  titleId: z.string().trim().min(1).max(80).optional(),
  bgmEnabled: z.boolean().optional(),
  bgmVolume: z.number().min(0).max(1).optional(),
  sfxEnabled: z.boolean().optional(),
  sfxVolume: z.number().min(0).max(1).optional(),
  skipTitle: z.boolean().optional(),
  reducedEffects: z.boolean().optional(),
  eventEffects: z.boolean().optional(),
}).strict();

export type AccountPatch = z.infer<typeof AccountPatchSchema>;

async function ensureAccount(database: Database, userId: string, displayName = "") {
  await database.insert(userProfiles).values({ userId, displayName }).onConflictDoNothing();
  await database.insert(userSettings).values({ userId }).onConflictDoNothing();
}

export async function getAccountSnapshot(database: Database, user: { id: string; name: string }) {
  await ensureAccount(database, user.id, user.name);
  const [[profile], [settings]] = await Promise.all([
    database.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1),
    database.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1),
  ]);
  if (!profile || !settings) throw new Error("Account could not be loaded");
  return {
    profile: {
      displayName: profile.displayName,
      timezone: profile.timezone,
      dayBoundaryMinutes: profile.dayBoundaryMinutes,
      avatarId: profile.avatarId,
      titleId: profile.titleId,
      createdAt: profile.createdAt.toISOString(),
    },
    settings: {
      bgmEnabled: settings.bgmEnabled,
      bgmVolume: settings.bgmVolume,
      sfxEnabled: settings.sfxEnabled,
      sfxVolume: settings.sfxVolume,
      skipTitle: settings.skipTitle,
      reducedEffects: settings.reducedEffects,
      eventEffects: settings.eventEffects,
      timezone: settings.timezone,
    },
  };
}

export async function updateAccount(database: Database, user: { id: string; name: string }, patch: AccountPatch) {
  return database.transaction(async (tx) => {
    await tx.insert(userProfiles).values({ userId: user.id, displayName: user.name }).onConflictDoNothing();
    await tx.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
    const profilePatch = {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.dayBoundaryMinutes !== undefined ? { dayBoundaryMinutes: patch.dayBoundaryMinutes } : {}),
      ...(patch.avatarId !== undefined ? { avatarId: patch.avatarId } : {}),
      ...(patch.titleId !== undefined ? { titleId: patch.titleId } : {}),
    };
    const settingsPatch = {
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.bgmEnabled !== undefined ? { bgmEnabled: patch.bgmEnabled } : {}),
      ...(patch.bgmVolume !== undefined ? { bgmVolume: patch.bgmVolume } : {}),
      ...(patch.sfxEnabled !== undefined ? { sfxEnabled: patch.sfxEnabled } : {}),
      ...(patch.sfxVolume !== undefined ? { sfxVolume: patch.sfxVolume } : {}),
      ...(patch.skipTitle !== undefined ? { skipTitle: patch.skipTitle } : {}),
      ...(patch.reducedEffects !== undefined ? { reducedEffects: patch.reducedEffects } : {}),
      ...(patch.eventEffects !== undefined ? { eventEffects: patch.eventEffects } : {}),
    };
    if (Object.keys(profilePatch).length) await tx.update(userProfiles).set(profilePatch).where(eq(userProfiles.userId, user.id));
    if (Object.keys(settingsPatch).length) await tx.update(userSettings).set(settingsPatch).where(eq(userSettings.userId, user.id));
    const [[profile], [settings]] = await Promise.all([
      tx.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1),
      tx.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1),
    ]);
    if (!profile || !settings) throw new Error("Account could not be loaded");
    return {
      profile: { displayName: profile.displayName, timezone: profile.timezone, dayBoundaryMinutes: profile.dayBoundaryMinutes, avatarId: profile.avatarId, titleId: profile.titleId, createdAt: profile.createdAt.toISOString() },
      settings: { bgmEnabled: settings.bgmEnabled, bgmVolume: settings.bgmVolume, sfxEnabled: settings.sfxEnabled, sfxVolume: settings.sfxVolume, skipTitle: settings.skipTitle, reducedEffects: settings.reducedEffects, eventEffects: settings.eventEffects, timezone: settings.timezone },
    };
  });
}

export async function deleteAccountData(database: Database, userId: string) {
  await database.transaction(async (tx) => {
    await tx.delete(eventOccurrences).where(eq(eventOccurrences.userId, userId));
    await tx.delete(dailySettlements).where(eq(dailySettlements.userId, userId));
    await tx.delete(settlementJobs).where(eq(settlementJobs.userId, userId));
    await tx.delete(heroCollections).where(eq(heroCollections.userId, userId));
    await tx.delete(rewardLedger).where(eq(rewardLedger.userId, userId));
    await tx.delete(inventories).where(eq(inventories.userId, userId));
    await tx.delete(achievements).where(eq(achievements.userId, userId));
    await tx.delete(questProgress).where(eq(questProgress.userId, userId));
    await tx.delete(regionUnlocks).where(eq(regionUnlocks.userId, userId));
    await tx.delete(traitProgress).where(eq(traitProgress.userId, userId));
    await tx.delete(dailyCategoryOrdinals).where(eq(dailyCategoryOrdinals.userId, userId));
    await tx.delete(userPins).where(eq(userPins.userId, userId));
    await tx.delete(userFavorites).where(eq(userFavorites.userId, userId));
    await tx.delete(activityLogs).where(eq(activityLogs.userId, userId));
    await tx.delete(activityTypes).where(eq(activityTypes.userId, userId));
    await tx.delete(activityCategories).where(eq(activityCategories.userId, userId));
    await tx.delete(userSettings).where(eq(userSettings.userId, userId));
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
  });
}
