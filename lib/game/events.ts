import { TRAIT_NAMES, type AppState, type ActivityLog, type Trait } from "@/lib/domain";
import { EVENTS, type EventDefinition, type EventRarity } from "@/content/events";
import type { DayFeatures } from "@/lib/game/features";
import { evaluateRule } from "@/lib/game/rules-dsl";
import { addDateDays, sleepAttributedDate } from "@/lib/game/time";
import { stableDigest, seededRandom } from "@/lib/game/rng";
import { grantRewardOnce } from "@/lib/game/progression";

const rarityWeights: Record<EventRarity, number> = { common: 70, rare: 22, epic: 6.5, legendary: 1.5 };

function selectWeighted<T>(items: T[], weight: (item: T) => number, seed: string | number): T | undefined {
  const sum = items.reduce((total, item) => total + Math.max(0, weight(item)), 0);
  if (!items.length || sum <= 0) return undefined;
  let remaining = seededRandom(seed) * sum;
  for (const item of items) {
    remaining -= Math.max(0, weight(item));
    if (remaining < 0) return item;
  }
  return items[items.length - 1];
}

function dateDistance(from: string, to: string): number {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function recentDays(state: AppState, date: string): string[][] {
  const result: string[][] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = addDateDays(date, -offset);
    const logs = state.logs.filter((log) => !log.deletedAt && log.status === "completed" && log.attributedDate === day);
    const categories = [...new Set(logs.map((log) => log.categoryKey))];
    if (logs.length) categories.push("__active__");
    result.push(categories);
  }
  return result;
}

function triggerTags(state: AppState, log: ActivityLog): string[] {
  const custom = state.customCategories.find((category) => category.key === log.categoryKey);
  const tags = [log.customTag, custom?.tag, ...(custom ? ["custom"] : [])].filter((tag): tag is string => Boolean(tag));
  if (state.quests["dragon-egg"]?.state === "done") tags.push("dragon:complete");
  return tags;
}

function isOnCooldown(state: AppState, definition: EventDefinition, date: string): boolean {
  const last = state.events.filter((event) => event.id === definition.id).map((event) => event.date).sort().at(-1);
  return Boolean(last && dateDistance(last, date) <= definition.cooldownDays);
}

function isCustomLog(state: AppState, log: ActivityLog): boolean {
  return state.customCategories.some((category) => category.key === log.categoryKey);
}

function matchingCandidates(state: AppState, log: ActivityLog, features: DayFeatures, date: string, ordinal: number, kind: EventDefinition["kind"]): EventDefinition[] {
  const custom = isCustomLog(state, log);
  const normalizedLog = custom ? { ...log, categoryKey: "custom" } : log;
  const context = {
    log: normalizedLog,
    logs: state.logs.filter((item) => item.attributedDate === date && !item.deletedAt),
    features,
    tags: triggerTags(state, log),
    recentDayCategories: recentDays(state, date),
  };
  return EVENTS.filter((definition) => {
    const categoryMatches = definition.category === "custom" ? custom : definition.category === log.categoryKey;
    return categoryMatches && definition.kind === kind && evaluateRule(definition.trigger, context)
      && !state.events.some((item) => item.id === definition.id && item.date === date)
      && !isOnCooldown(state, definition, date);
  });
}

function hasPity(state: AppState, date: string): boolean {
  const recentRare = state.events.some((event) => event.rarity !== "common" && dateDistance(event.date, date) >= 0 && dateDistance(event.date, date) < 7);
  return !recentRare;
}

function chooseChanceEvent(state: AppState, candidates: EventDefinition[], date: string, category: string, ordinal: number): EventDefinition | undefined {
  if (!candidates.length || seededRandom(state.profile.id, date, category, ordinal, "chance") >= 0.25) return undefined;
  const pity = hasPity(state, date);
  const availableRarities = [...new Set(candidates.map((item) => item.rarity))];
  const selectedRarity = selectWeighted(availableRarities, (rarity) => rarityWeights[rarity] * (pity && rarity !== "common" ? 2 : 1), stableDigest([state.profile.id, date, category, ordinal, "rarity"]));
  if (!selectedRarity) return undefined;
  return selectWeighted(candidates.filter((item) => item.rarity === selectedRarity), (item) => item.weight, stableDigest([state.profile.id, date, category, ordinal, selectedRarity]));
}

function replaceVariables(text: string, log: ActivityLog, state: AppState): string {
  const custom = state.customCategories.find((category) => category.key === log.categoryKey);
  const values: Record<string, string> = {
    subject: String(log.details.subject ?? log.typeKey),
    project: String(log.details.project ?? "오늘의 작업"),
    minutes: String(log.durationMin),
    name: custom?.name ?? log.typeKey,
  };
  return text.replace(/\{(subject|project|minutes|name)\}/g, (_, key: string) => values[key] ?? "");
}

function formatRewards(definition: EventDefinition): string {
  const xp = Object.entries(definition.rewards.xp ?? {}).map(([trait, amount]) => `${TRAIT_NAMES[trait as Trait]} +${amount}`);
  const items = Object.entries(definition.rewards.items ?? {}).map(([item, amount]) => `${item} ×${amount}`);
  return [...xp, ...items, ...(definition.rewards.title ? [`칭호: ${definition.rewards.title}`] : [])].join(" · ");
}

function rarityCaption(rarity: EventRarity): string {
  return ({ common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" })[rarity];
}

function occurrenceFor(definition: EventDefinition, log: ActivityLog, state: AppState, date: string, ordinal: number): AppState["events"][number] {
  const variant = Math.floor(seededRandom(state.profile.id, date, log.categoryKey, ordinal, definition.id, "text") * definition.body.length);
  const currentEffects = state.events.filter((item) => item.date === date && !item.effectsSuppressed).length;
  return {
    id: definition.id,
    date,
    rarity: definition.rarity,
    kind: definition.kind,
    title: definition.title,
    body: replaceVariables(definition.body[variant] ?? definition.body[0], log, state),
    npcLine: replaceVariables(definition.npc, log, state),
    rewards: formatRewards(definition),
    seen: false,
    effectsSuppressed: currentEffects >= 3,
    triggerLogId: log.id,
  };
}

function adjustCustomReward(state: AppState, log: ActivityLog, definition: EventDefinition): Partial<Record<Trait, number>> {
  const custom = state.customCategories.find((category) => category.key === log.categoryKey);
  if (!custom || definition.category !== "custom") return definition.rewards.xp ?? {};
  const base = definition.rarity === "common" ? 10 : 20;
  return { [custom.primary]: base };
}

function addOccurrence(state: AppState, occurrence: AppState["events"][number], definition: EventDefinition, log: ActivityLog): AppState {
  const items = definition.rewards.items ?? {};
  const xp = adjustCustomReward(state, log, definition);
  const rewarded = grantRewardOnce(state, "event", `${definition.id}:${occurrence.date}`, xp, items);
  return { ...rewarded, events: [...rewarded.events, occurrence] };
}

/**
 * Roll one chance event and one matching rule event at most. Ordinals are stored by
 * input signature and never decremented after deletion, so replaying identical input
 * cannot reroll a previously assigned outcome.
 */
export function evaluateLogEvents(state: AppState, log: ActivityLog, features: DayFeatures): { state: AppState; newEvents: AppState["events"] } {
  if (log.status !== "completed" || log.durationMin < 10 && log.durationMin > 0) return { state, newEvents: [] };
  const date = log.categoryKey === "sleep" ? sleepAttributedDate(log, state.profile.timezone) : log.attributedDate;
  const signature = stableDigest({ date, category: log.categoryKey, type: log.typeKey, duration: log.durationMin, details: log.details, user: state.profile.id });
  if (Object.hasOwn(state.eventOutcomes, signature)) return { state, newEvents: [] };
  let next = state;
  let ordinal = next.eventSeeds[signature];
  if (ordinal === undefined) {
    const counterKey = `${date}|${log.categoryKey}`;
    ordinal = (next.dailyOrdinals[counterKey] ?? 0) + 1;
    next = { ...next, eventSeeds: { ...next.eventSeeds, [signature]: ordinal }, dailyOrdinals: { ...next.dailyOrdinals, [counterKey]: ordinal } };
  }
  const todayEvents = next.events.filter((event) => event.date === date);
  const occurrenceCapChance = todayEvents.filter((event) => event.kind === "chance").length < 3;
  const occurrenceCapConditional = todayEvents.filter((event) => event.kind !== "chance").length < 2;
  const generated: AppState["events"] = [];

  if (occurrenceCapChance) {
    const candidates = matchingCandidates(next, log, features, date, ordinal, "chance");
    const selected = chooseChanceEvent(next, candidates, date, log.categoryKey, ordinal);
    if (selected) {
      const occurrence = occurrenceFor(selected, log, next, date, ordinal);
      next = addOccurrence(next, occurrence, selected, log);
      generated.push(occurrence);
    }
  }

  if (occurrenceCapConditional) {
    const candidates = ["combo", "streak", "chain_step", "milestone"].flatMap((kind) => matchingCandidates(next, log, features, date, ordinal, kind as EventDefinition["kind"]));
    const selected = selectWeighted(candidates, (item) => item.weight, stableDigest([next.profile.id, date, log.categoryKey, ordinal, "conditional"]));
    if (selected) {
      const occurrence = occurrenceFor(selected, log, next, date, ordinal);
      next = addOccurrence(next, occurrence, selected, log);
      generated.push(occurrence);
    }
  }
  next = { ...next, eventOutcomes: { ...next.eventOutcomes, [signature]: generated.map((item) => item.id) } };
  return { state: next, newEvents: generated };
}

export function eventRarityLabel(rarity: EventRarity): string {
  return rarityCaption(rarity);
}

export function validateEventDefinitions(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const definition of EVENTS) {
    if (ids.has(definition.id)) errors.push(`duplicate event id: ${definition.id}`);
    ids.add(definition.id);
  }
  return errors;
}
