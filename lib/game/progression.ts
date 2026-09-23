import { TRAITS, type AppState, type Trait } from "@/lib/domain";
import type { HeroDefinition } from "@/content/heroes";
import { calculateDayXp } from "@/lib/game/xp";

function addTraitXp(state: AppState, xp: Partial<Record<Trait, number>>): AppState {
  const traits = { ...state.traits };
  for (const trait of TRAITS) {
    const amount = xp[trait] ?? 0;
    if (amount <= 0) continue;
    let remaining = amount;
    let level = traits[trait].level;
    let currentXp = traits[trait].xp;
    while (remaining > 0 && level < 99) {
      const need = Math.round(60 * Math.pow(level, 1.5));
      const earned = Math.min(remaining, need - currentXp);
      currentXp += earned;
      remaining -= earned;
      if (currentXp >= need) {
        level += 1;
        currentXp = 0;
      }
    }
    traits[trait] = { level, xp: currentXp };
  }
  return { ...state, traits };
}

export function grantRewardOnce(
  state: AppState,
  sourceType: string,
  sourceKey: string,
  xp: Partial<Record<Trait, number>> = {},
  items: Record<string, number> = {},
): AppState {
  if (state.rewardLedger.some((entry) => entry.sourceType === sourceType && entry.sourceKey === sourceKey)) return state;
  const next = addTraitXp(state, xp);
  const inventory = { ...next.inventory };
  for (const [item, quantity] of Object.entries(items)) inventory[item] = (inventory[item] ?? 0) + quantity;
  return {
    ...next,
    inventory,
    rewardLedger: [...next.rewardLedger, { sourceType, sourceKey, xp, items, createdAt: new Date().toISOString() }],
  };
}

export function grantHeroDiscovery(state: AppState, hero: HeroDefinition): AppState {
  const { xp, items } = heroDiscoveryReward(hero);
  return grantRewardOnce(state, "settlement", `settlement_first:${hero.no}`, xp, items);
}

export function heroDiscoveryReward(hero: HeroDefinition): { xp: Record<Trait, number>; items: Record<string, number> } {
  const rewardXp = ({ legendary: 400, epic: 200, rare: 100, uncommon: 50, common: 30, basic: 0 })[hero.rarity];
  const each = Math.floor(rewardXp / 6);
  const remainder = rewardXp - each * 6;
  const xp = Object.fromEntries(TRAITS.map((trait, index) => [trait, each + (index < remainder ? 1 : 0)])) as Record<Trait, number>;
  return { xp, items: hero.rarity === "legendary" || hero.rarity === "epic" ? { "title:별의 기록자": 1 } : {} };
}

export function recomputeLogXp(state: AppState, date: string): AppState {
  const result = calculateDayXp(state.logs, date, state.customCategories);
  const before = state.xpAwardsByDate[date] ?? {};
  const adjustment: Partial<Record<Trait, number>> = {};
  for (const trait of TRAITS) adjustment[trait] = (result.byTrait[trait] ?? 0) - (before[trait] ?? 0);
  const next = { ...state, xpAwardsByDate: { ...state.xpAwardsByDate, [date]: result.byTrait } };
  const ledgerIndex = next.rewardLedger.findIndex((entry) => entry.sourceType === "log_xp" && entry.sourceKey === date);
  if (ledgerIndex < 0) next.rewardLedger = [...next.rewardLedger, { sourceType: "log_xp", sourceKey: date, xp: result.byTrait, items: {}, createdAt: new Date().toISOString() }];
  else next.rewardLedger = next.rewardLedger.map((entry, index) => index === ledgerIndex ? { ...entry, xp: result.byTrait } : entry);

  const traits = { ...next.traits };
  for (const trait of TRAITS) {
    const delta = adjustment[trait] ?? 0;
    const old = traits[trait];
    if (delta >= 0) {
      let amount = delta;
      let level = old.level;
      let xp = old.xp;
      while (amount > 0 && level < 99) {
        const need = Math.round(60 * Math.pow(level, 1.5));
        const earned = Math.min(amount, need - xp);
        xp += earned;
        amount -= earned;
        if (xp >= need) { level += 1; xp = 0; }
      }
      traits[trait] = { level, xp };
    } else {
      traits[trait] = { level: old.level, xp: Math.max(0, old.xp + delta) };
    }
  }
  return { ...next, traits };
}
