import { getCategory, type ActivityLog, type CategoryDefinition, type Trait } from "@/lib/domain";

export type DayXp = { total: number; byTrait: Partial<Record<Trait, number>>; perLog: Record<string, number> };

function roundXp(value: number): number {
  return Math.max(0, Math.round(value));
}

export function baseLogXp(log: Pick<ActivityLog, "durationMin" | "categoryKey" | "details">): number {
  if (log.durationMin <= 0 || log.details.metricType === "check" || log.details.metricType === "count") return 8;
  const minutes = Math.min(Math.max(0, log.durationMin), 240);
  let xp = 10 * Math.pow(minutes, 0.7);
  if (log.categoryKey === "sleep") {
    if (minutes < 420) xp *= Math.max(0.35, minutes / 420);
    else if (minutes > 540) xp *= Math.max(0.35, 1 - (minutes - 540) / 480);
  }
  if (log.categoryKey === "meal") {
    const amount = String(log.details.amount ?? "");
    if (["adequate", "hearty", "적당히", "든든히"].includes(amount)) xp *= 1;
    else if (["hardly", "거의 못 먹음", "little", "조금"].includes(amount)) xp *= 0.65;
    else if (["overeat", "과식"].includes(amount)) xp *= 0.8;
    else xp *= 0.8;
  }
  return roundXp(xp);
}

function traitWeights(log: ActivityLog, category?: CategoryDefinition): Partial<Record<Trait, number>> {
  if (log.customTraits && Object.keys(log.customTraits).length) return log.customTraits;
  if (category) return { [category.primary]: 0.7, [category.secondary]: (category.primary === category.secondary ? 0 : 0.3) };
  return { recovery: 0.7, calm: 0.3 };
}

export function calculateDayXp(logs: ActivityLog[], date: string, customCategories: CategoryDefinition[] = []): DayXp {
  const sorted = logs
    .filter((log) => !log.deletedAt && log.status === "completed" && log.attributedDate === date)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  const byTrait: Partial<Record<Trait, number>> = {};
  const perLog: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};
  let total = 0;

  for (const log of sorted) {
    const category = getCategory(log.categoryKey, customCategories);
    const categoryKey = log.categoryKey;
    const base = baseLogXp(log);
    const priorCategory = categoryTotals[categoryKey] ?? 0;
    const attenuation = priorCategory > 400 ? 0.2 : priorCategory > 200 ? 0.5 : 1;
    const remainingDaily = Math.max(0, 1_200 - total);
    const granted = roundXp(Math.min(base * attenuation, remainingDaily));
    perLog[log.id] = granted;
    categoryTotals[categoryKey] = priorCategory + granted;
    total += granted;

    const weights = traitWeights(log, category);
    const entries = Object.entries(weights).filter((entry): entry is [Trait, number] => typeof entry[1] === "number" && entry[1] > 0);
    const weightTotal = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (weightTotal <= 0 || granted <= 0) continue;
    let allocated = 0;
    entries.forEach(([trait, weight], index) => {
      const amount = index === entries.length - 1 ? granted - allocated : Math.floor(granted * weight / weightTotal);
      allocated += amount;
      byTrait[trait] = (byTrait[trait] ?? 0) + amount;
    });
  }
  return { total, byTrait, perLog };
}

export function xpRequiredForLevel(level: number): number {
  return Math.round(60 * Math.pow(Math.max(1, level), 1.5));
}

export function applyTraitXp(
  current: Record<Trait, { xp: number; level: number }>,
  adjustment: Partial<Record<Trait, number>>,
): Record<Trait, { xp: number; level: number }> {
  const next = { ...current };
  for (const [trait, amount] of Object.entries(adjustment) as Array<[Trait, number]>) {
    const old = next[trait];
    let xp = Math.max(0, old.xp + amount);
    let level = old.level;
    while (level < 99 && xp >= xpRequiredForLevel(level)) {
      xp -= xpRequiredForLevel(level);
      level += 1;
    }
    if (amount < 0) {
      // Recalculation can lower displayed XP, but levels never go down.
      xp = Math.max(0, xp);
      level = old.level;
    }
    next[trait] = { xp, level };
  }
  return next;
}

export function characterLevel(traits: Record<Trait, { xp: number; level: number }>): number {
  const levels = Object.values(traits).map((trait) => trait.level);
  const minimum = Math.min(...levels);
  return Math.floor(levels.reduce((sum, level) => sum + level, 0) / 6 + 0.5 * minimum);
}

