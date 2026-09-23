import { ACHIEVEMENTS, type AchievementCondition } from "@/content/achievements";
import { QUESTS, type QuestChain, type QuestStepCondition } from "@/content/quests";
import { REGIONS, type RegionCondition } from "@/content/regions";
import { HERO_BY_NO } from "@/content/heroes";
import { CATEGORIES, TRAITS, type AppState, type ActivityLog, type Trait } from "@/lib/domain";
import { addDateDays, getDayBoundaryDate, localClock } from "@/lib/game/time";
import { extractFeatures, type DayFeatures } from "@/lib/game/features";
import { grantRewardOnce } from "@/lib/game/progression";

const activeLogs = (logs: ActivityLog[]) => logs.filter((log) => !log.deletedAt && log.status === "completed");
const categoryLogs = (logs: ActivityLog[], key: string) => activeLogs(logs).filter((log) => log.categoryKey === key);
const dayGroups = (logs: ActivityLog[]) => {
  const byDate = new Map<string, ActivityLog[]>();
  for (const log of activeLogs(logs)) byDate.set(log.attributedDate, [...(byDate.get(log.attributedDate) ?? []), log]);
  return byDate;
};
const uniqueDates = (logs: ActivityLog[]) => [...new Set(activeLogs(logs).map((log) => log.attributedDate))].sort();
const sumField = (logs: ActivityLog[], key: string) => activeLogs(logs).reduce((sum, log) => sum + (typeof log.details[key] === "number" ? Number(log.details[key]) : 0), 0);
const levelReward = (value: number) => Object.fromEntries(TRAITS.map((trait) => [trait, Math.floor(value / TRAITS.length)])) as Record<Trait, number>;

function computeDates(state: AppState, now: Date): string[] {
  const today = getDayBoundaryDate(now, state.profile.timezone);
  return Array.from({ length: 61 }, (_, index) => addDateDays(today, index - 60));
}

function featureForDate(state: AppState, date: string): DayFeatures {
  return extractFeatures(state.logs, date, state.profile.timezone, state.events, state.profile.createdAt, state.customCategories);
}

function matchesAchievement(state: AppState, condition: AchievementCondition, now: Date): boolean {
  const logs = activeLogs(state.logs);
  const dates = uniqueDates(logs);
  const days = computeDates(state, now);
  switch (condition.kind) {
    case "log_count": return logs.length >= condition.value;
    case "category_count": {
      if (condition.category.includes("-days:")) {
        const [, encoded] = condition.category.split("-days:");
        const key = condition.category.split("-days:")[0] ?? "";
        const category = key === "rest" ? "rest" : key === "meditation" ? "meditation" : key === "creation" ? "creation" : key === "outing" ? "outing" : key;
        const relevant = logs.filter((log) => log.categoryKey === category);
        return new Set(relevant.map((log) => log.attributedDate)).size >= Number(encoded ?? condition.value);
      }
      if (condition.category.startsWith("together-meals:")) {
        const target = Number(condition.category.split(":")[1] ?? condition.value);
        return new Set(logs.filter((log) => log.categoryKey === "meal" && Boolean(log.details.withSomeone)).map((log) => log.attributedDate)).size >= target;
      }
      if (condition.category === "early-reading") return logs.some((log) => log.categoryKey === "reading" && Number(localClock(new Date(log.startedAt), state.profile.timezone).slice(0, 2)) < 6);
      return categoryLogs(logs, condition.category).length >= condition.value;
    }
    case "active_days": return dates.length >= condition.value;
    case "all_categories": return CATEGORIES.every((category) => logs.some((log) => log.categoryKey === category.key));
    case "hero_count": {
      if (condition.heroNo) return (state.collection[condition.heroNo]?.count ?? 0) >= condition.value;
      return Object.keys(state.collection).length >= condition.value;
    }
    case "hero_rarity": return Object.keys(state.collection).some((no) => HERO_BY_NO.get(Number(no))?.rarity === condition.rarity);
    case "any_event": return state.events.length > 0;
    case "completed_chain": return Object.values(state.quests).some((quest) => quest.state === "done");
    case "all_regions": return REGIONS.every((region) => state.regions.includes(region.id));
    case "balanced_sleep_meals": return days.slice(-condition.days).every((date) => {
      const features = featureForDate(state, date);
      return features.sleepMin >= 420 && features.sleepMin <= 540 && features.mealCount >= 3;
    });
    case "rest_day": return days.some((date) => {
      const features = featureForDate(state, date);
      const dayLogs = logs.filter((log) => log.attributedDate === date);
      const production = dayLogs.some((log) => ["study", "development", "exercise", "creation"].includes(log.categoryKey));
      return features.min.recovery >= condition.restMin && !production && features.moodAvg >= condition.mood;
    });
    case "late_night_reading": return days.some((date) => {
      const features = featureForDate(state, date);
      return features.lateNightThoughtMin >= 30 && features.sleepMin >= condition.minSleep;
    });
    case "home_soup_day": return days.some((date) => {
      const features = featureForDate(state, date);
      return features.homeMeals >= 1 && features.categoryMin.rest > 0 && features.moodDelta > 0;
    });
    case "return_after_gap": return dates.some((date, index) => index > 0 && new Date(`${date}T00:00:00Z`).getTime() - new Date(`${dates[index - 1]}T00:00:00Z`).getTime() >= condition.days * 86_400_000);
    case "same_day_groups": return days.some((date) => featureForDate(state, date).activeGroups >= condition.count);
    case "different_category_days": return days.some((date) => featureForDate(state, date).categoryCount >= condition.count);
    case "custom_count": return logs.filter((log) => state.customCategories.some((category) => category.key === log.categoryKey)).length >= condition.value;
    case "item_count": return condition.item === "*" ? Object.values(state.inventory).some((quantity) => quantity > 0) : (state.inventory[condition.item] ?? 0) >= condition.value;
    case "all_traits_level": return TRAITS.every((trait) => state.traits[trait].level >= condition.value);
  }
}

function achievementXp(state: AppState, now: Date): AppState {
  let next = state;
  for (const achievement of ACHIEVEMENTS) {
    if (next.achievements[achievement.id] || !matchesAchievement(next, achievement.condition, now)) continue;
    const date = getDayBoundaryDate(now, next.profile.timezone);
    next = { ...next, achievements: { ...next.achievements, [achievement.id]: date } };
    next = grantRewardOnce(next, "achievement", achievement.id, levelReward(achievement.rewardXp));
  }
  return next;
}

function questConditionMet(condition: QuestStepCondition, logs: ActivityLog[]): boolean {
  const all = activeLogs(logs);
  const byDate = dayGroups(all);
  switch (condition.kind) {
    case "sleep_hours": return all.some((log) => log.categoryKey === "sleep" && log.durationMin >= condition.hours * 60 && !String(log.details.sleepType ?? "night").includes("낮잠"));
    case "category_days": {
      const dates = all.filter((log) => condition.category === "rest-or-meditation" ? ["rest", "meditation"].includes(log.categoryKey) : log.categoryKey === condition.category).map((log) => log.attributedDate);
      return new Set(dates).size >= condition.days;
    }
    case "mood": return all.some((log) => (log.mood ?? 0) >= condition.minimum);
    case "development_solved": return all.filter((log) => log.categoryKey === "development").reduce((sum, log) => sum + (Number(log.details.solvedProblems) || 0), 0) >= condition.count;
    case "category_count": return categoryLogs(all, condition.category).length >= condition.count;
    case "development_completed": return all.filter((log) => log.categoryKey === "development" && log.details.result === "완료").length >= condition.count;
    case "creation_or_reading": return all.some((log) => log.categoryKey === "creation" || log.categoryKey === "reading");
    case "distinct_subjects": return new Set(all.filter((log) => log.categoryKey === "study").map((log) => String(log.details.subject ?? log.typeKey))).size >= condition.count;
    case "book_completed": return all.filter((log) => log.categoryKey === "reading" && Boolean(log.details.completed)).length >= condition.count;
    case "study_problems": return sumField(all.filter((log) => log.categoryKey === "study"), "problems") >= condition.count;
    case "study_method": return all.filter((log) => log.categoryKey === "study" && log.details.method === condition.method).length >= condition.count;
    case "understanding": return all.some((log) => log.categoryKey === "study" && Number(log.details.understanding) >= condition.minimum);
    case "meals_in_day": return [...byDate.values()].some((dayLogs) => {
      const types = new Set(dayLogs.filter((log) => log.categoryKey === "meal").map((log) => String(log.details.mealType ?? log.typeKey)));
      return condition.types.every((type) => types.has(type));
    });
    case "home_meals": return all.filter((log) => log.categoryKey === "meal" && ["home", "집밥"].includes(String(log.details.form))).length >= condition.count;
    case "together_meal": return all.some((log) => log.categoryKey === "meal" && Boolean(log.details.withSomeone));
    case "outing_purpose": return all.some((log) => log.categoryKey === "outing" && log.details.purpose === condition.purpose);
    case "meditation": return all.some((log) => log.categoryKey === "meditation");
    case "sleep_days_window": {
      const window = all.filter((log) => log.categoryKey === "sleep" && !String(log.details.sleepType ?? "night").includes("낮잠"));
      const lastDate = uniqueDates(window).at(-1);
      const firstDate = lastDate ? addDateDays(lastDate, -(condition.within - 1)) : "";
      const dateSet = new Set(window.filter((log) => log.durationMin >= condition.hours * 60 && log.attributedDate >= firstDate).map((log) => log.attributedDate));
      return dateSet.size >= condition.days;
    }
    case "rest_recovery": return all.some((log) => log.categoryKey === "rest" && Number(log.details.recovery ?? log.details.satisfaction) >= condition.value);
  }
}

function potentialStart(chain: QuestChain, latestLog: ActivityLog): boolean {
  const condition = chain.steps[0]?.condition;
  if (!condition) return false;
  if (condition.kind === "sleep_hours") return latestLog.categoryKey === "sleep";
  if (condition.kind === "category_days") return condition.category === "rest-or-meditation" ? ["rest", "meditation"].includes(latestLog.categoryKey) : latestLog.categoryKey === condition.category;
  if (condition.kind === "development_solved" || condition.kind === "development_completed") return latestLog.categoryKey === "development";
  if (condition.kind === "category_count") return latestLog.categoryKey === condition.category;
  if (condition.kind === "distinct_subjects" || condition.kind === "study_problems" || condition.kind === "study_method" || condition.kind === "understanding") return latestLog.categoryKey === "study";
  if (condition.kind === "meals_in_day" || condition.kind === "home_meals" || condition.kind === "together_meal") return latestLog.categoryKey === "meal";
  if (condition.kind === "outing_purpose") return latestLog.categoryKey === "outing";
  if (condition.kind === "meditation") return latestLog.categoryKey === "meditation";
  if (condition.kind === "creation_or_reading") return ["creation", "reading"].includes(latestLog.categoryKey);
  return true;
}

function questProgress(state: AppState, latestLog: ActivityLog, now: Date): AppState {
  let next = state;
  const date = getDayBoundaryDate(now, state.profile.timezone);
  for (const chain of QUESTS) {
    let progress = next.quests[chain.id];
    if (progress?.state === "done") continue;
    if (progress?.state === "active" && date > addDateDays(progress.startedDate, chain.windowDays)) {
      progress = { ...progress, state: "expired", updatedAt: now.toISOString() };
      next = { ...next, quests: { ...next.quests, [chain.id]: progress } };
    }
    if (!progress || progress.state === "expired") {
      if (!potentialStart(chain, latestLog)) continue;
      const first = chain.steps[0];
      if (!first || !questConditionMet(first.condition, next.logs)) continue;
      progress = { step: 1, state: "active", startedDate: date, updatedAt: now.toISOString(), data: { stepDates: [date] } };
      next = { ...next, quests: { ...next.quests, [chain.id]: progress } };
    }
    let step = progress.step;
    const stepDates = [...((progress.data.stepDates as string[] | undefined) ?? [progress.startedDate])];
    while (step < chain.steps.length) {
      const definition = chain.steps[step];
      const lastStepDate = stepDates.at(-1) ?? progress.startedDate;
      const candidateLogs = next.logs.filter((log) => log.attributedDate >= lastStepDate && log.attributedDate <= date);
      if (!definition || !questConditionMet(definition.condition, candidateLogs)) break;
      step += 1;
      stepDates.push(date);
    }
    const done = step >= chain.steps.length;
    const updated = { ...progress, step, state: done ? "done" as const : "active" as const, updatedAt: now.toISOString(), data: { ...progress.data, stepDates } };
    next = { ...next, quests: { ...next.quests, [chain.id]: updated } };
    if (done) next = grantRewardOnce(next, "quest", chain.id, {}, { [chain.rewardItem]: 1, ...(chain.rewardTitle ? { [`title:${chain.rewardTitle}`]: 1 } : {}) });
  }
  return next;
}

function regionMet(condition: RegionCondition, state: AppState): boolean {
  const logs = activeLogs(state.logs);
  switch (condition.kind) {
    case "start": return true;
    case "category_count": return categoryLogs(logs, condition.category).length >= condition.count;
    case "category_minutes": return categoryLogs(logs, condition.category).reduce((sum, log) => sum + log.durationMin, 0) >= condition.minutes;
    case "combined_minutes": return logs.filter((log) => condition.categories.includes(log.categoryKey)).reduce((sum, log) => sum + log.durationMin, 0) >= condition.minutes;
    case "sleep_days": return new Set(logs.filter((log) => log.categoryKey === "sleep" && log.durationMin >= condition.hours * 60 && !String(log.details.sleepType ?? "night").includes("낮잠")).map((log) => log.attributedDate)).size >= condition.count;
    case "active_days": return new Set(logs.filter((log) => !condition.category || log.categoryKey === condition.category).map((log) => log.attributedDate)).size >= condition.count;
  }
}

function unlockRegions(state: AppState): AppState {
  const regions = new Set(state.regions);
  const allBasicExceptSpire = REGIONS.slice(0, 10).every((region) => regions.has(region.id));
  for (const region of REGIONS) {
    if (regions.has(region.id)) continue;
    if (region.id === "quiet-spire" && !allBasicExceptSpire) continue;
    if (regionMet(region.condition, state)) regions.add(region.id);
  }
  return { ...state, regions: [...regions] };
}

export function evaluateGrowth(state: AppState, latestLog: ActivityLog, now = new Date()): AppState {
  let next = questProgress(state, latestLog, now);
  next = unlockRegions(next);
  next = achievementXp(next, now);
  return next;
}
