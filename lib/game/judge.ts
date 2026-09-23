import { HEROES, HERO_BY_NO, type HeroDefinition, type HeroRarity } from "@/content/heroes";
import type { Group } from "@/lib/domain";
import type { DayFeatures } from "@/lib/game/features";

export type HeroJudgement = { hero: HeroDefinition; reasons: string[]; score: number };

const c = (features: DayFeatures, key: string) => features.categoryMin[key] ?? 0;
const g = (features: DayFeatures, key: Group) => features.min[key] ?? 0;
const sleepGate = (features: DayFeatures) => features.sleepMin === 0 || features.sleepMin >= 360;
const between = (value: number, min: number, max: number) => value >= min && value <= max;
const otherActivity = (features: DayFeatures, category: string) => Math.max(0, features.totalActiveMin - c(features, category));
const stdDev = (values: number[]) => {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

export function heroMatches(no: number, f: DayFeatures): boolean {
  const knowledge = g(f, "knowledge");
  const craft = g(f, "craft");
  const study = c(f, "study");
  const development = c(f, "development");
  const exercise = c(f, "exercise");
  const rest = c(f, "rest");
  const meditation = c(f, "meditation");
  const reading = c(f, "reading");
  const creation = c(f, "creation");
  const outing = c(f, "outing");
  const social = c(f, "relationship");
  const life = c(f, "life");
  const leisure = c(f, "leisure");
  switch (no) {
    case 1: return f.wakeMinute !== null && f.wakeMinute <= 360 && knowledge >= 240 && f.sleepMin >= 420 && f.avgFocus >= 4;
    case 2: return between(f.sleepMin, 420, 540) && f.activeGroups >= 5 && f.moodAvg >= 3.5;
    case 3: return development >= 360 && f.developmentSolved >= 5 && f.sleepMin >= 420 && (rest >= 30 || exercise >= 30);
    case 4: return ((f.priorDaySleepMin > 0 && f.priorDaySleepMin < 300) || (f.priorDayMoodAvg > 0 && f.priorDayMoodAvg <= 2)) && f.sleepMin >= 480 && f.moodDelta >= 2 && rest + meditation >= 60;
    case 5: return f.lastSevenWakeMinutes.length === 7 && stdDev(f.lastSevenWakeMinutes) <= 30 && f.lastSevenSleepDays === 7;
    case 6: return f.eventRarities.includes("legendary") && f.activeGroups >= 3;
    case 7: return knowledge >= 120 && exercise >= 60 && (development >= 120 || creation >= 120) && f.sleepMin >= 420;
    case 8: return knowledge >= 180 && f.knowledgeLate2224Min >= 60 && f.sleepMin >= 420;
    case 9: return meditation >= 45 && f.natureOuting >= 60 && rest >= 60 && f.screenLeisure <= 60;
    case 10: return ((f.distanceKm >= 15 || (exercise >= 180 && f.exerciseKinds.length >= 2)) && f.sleepMin >= 420);
    case 11: return (f.strengthVolume >= 8_000 || f.strengthSets >= 20) && f.sleepMin >= 420 && f.heartyMealCount >= 1;
    case 12: return reading >= 180 || (f.completedBooks >= 1 && reading >= 90);
    case 13: return development >= 240 && (f.developmentKinds["설계"] ?? f.developmentKinds.design ?? 0) >= 1 && (f.developmentResults["완료"] ?? f.developmentResults.done ?? 0) >= 2;
    case 14: return creation >= 240 || (f.creationComplete >= 1 && creation >= 120);
    case 15: return social >= 240 && f.relationshipTargets.length >= 2 && f.moodAvg >= 4;
    case 16: return meditation >= 90 && f.moodDelta >= 1 && f.sleepMin >= 420;
    case 17: return f.wakeMinute !== null && f.wakeMinute <= 330 && f.before0600FocusActivity >= 60 && f.sleepMin >= 420;
    case 18: return f.travelMin >= 300 || f.outingPurposes.length >= 3;
    case 19: return exercise >= 90 && f.maxGroup === "body" && f.rpeMax >= 7;
    case 20: return development >= 240 && f.developmentSolved >= 3 && f.maxGroup === "craft";
    case 21: return ((f.sleepMin + f.napMin >= 600) || (f.sleepMin >= 540 && rest >= 90)) && f.moodAvg >= 3;
    case 22: return f.problemCount >= 50 && f.correctCount / Math.max(1, f.problemCount) >= 0.7;
    case 23: return f.groupsAt20 >= 5 && f.maxGroupShare <= 0.4;
    case 24: return f.singleLongLogMin >= 180 && ["study", "development", "creation"].includes(f.singleLongCategory) && f.singleLongFocus === 5;
    case 25: return f.activity1600To2200 >= 240 && f.focused1600To2200 >= 150;
    case 26: return rest + meditation >= 90 && f.sleepQuality >= 4 && f.totalActiveMin <= 180;
    case 27: return knowledge >= 120 && development >= 120;
    case 28: return development >= 90 && reading >= 60;
    case 29: return f.runningCycling >= 60 || f.distanceKm >= 8;
    case 30: return f.homeMeals >= 3 && f.mealSatisfaction >= 4;
    case 31: return social >= 120 && (exercise >= 60 || outing >= 60);
    case 32: return f.writing >= 90 && f.lateNightWritingMin > 0 && f.sleepMin >= 360;
    case 33: return f.natureOuting >= 90 && (meditation >= 30 || rest >= 30);
    case 34: return f.strengthMin >= 60 && f.stretching >= 20;
    case 35: return f.studySubjects.length >= 3 || (f.readingGenres.length >= 2 && f.studySubjects.length >= 2);
    case 36: return exercise >= 60 && f.exerciseFollowedByRecovery && rest + meditation + f.napMin >= 45 && f.sleepMin >= 420;
    case 37: return f.bugTasks >= 3 || f.developmentSolved >= 5;
    case 38: return f.musicCreation >= 60 && social >= 60;
    case 39: return f.lateNightThoughtMin >= 30 && f.sleepMin >= 360;
    case 40: return f.mealCount >= 4 && f.mealForms.length >= 3 && f.overeatCount === 0;
    case 41: return study >= 120 && f.maxGroup === "knowledge";
    case 42: return exercise >= 45 && f.maxGroup === "body";
    case 43: return development >= 120 && f.maxGroup === "craft";
    case 44: return f.drawing >= 60;
    case 45: return f.writing >= 60;
    case 46: return reading >= 90;
    case 47: return f.walking >= 45 && (f.musicLeisure > 0 || rest > 0);
    case 48: return rest >= 120 && outing >= 30;
    case 49: return f.teaBreaks > 0 && (meditation >= 30 || reading >= 30);
    case 50: return f.games >= 120 && f.moodAvg >= 3.5;
    case 51: return f.videos >= 120 && f.moodAvg >= 3.5;
    case 52: return f.familyMinutes >= 120;
    case 53: return f.petMinutes >= 30;
    case 54: return life >= 90;
    case 55: return f.shoppingMinutes >= 60 || f.groceryMinutes >= 60;
    case 56: return f.cafeMinutes > 0 && (knowledge >= 60 || craft >= 60);
    case 57: return f.wakeMinute !== null && f.wakeMinute <= 420 && f.sleepMin >= 420 && f.morningActiveMin >= 60;
    case 58: return f.night2224ActiveMin >= 90 && f.sleepMin >= 360;
    case 59: return f.breakfastAdequate && f.lunchAdequate && f.dinnerAdequate;
    case 60: return f.stretching >= 30;
    case 61: return f.reviews >= 2;
    case 62: return (f.developmentKinds["리뷰"] ?? f.developmentKinds.review ?? 0) > 0 && development >= 60;
    case 63: return f.deployments >= 1;
    case 64: return meditation >= 20;
    case 65: return f.napMin >= 20 && f.napMin <= 90 && f.sleepMin >= 360;
    case 66: return f.moodDelta >= 2 && f.moodCount >= 2;
    case 67: return (life >= 30 || f.natureOuting >= 30) && rest >= 30 && f.totalActiveMin <= 180;
    case 68: return f.togetherMeals >= 2;
    case 69: return f.teamSports >= 60;
    case 70: return f.exerciseKinds.some((kind) => ["등산", "hiking", "hike"].includes(kind)) || f.natureOuting >= 120;
    case 71: return f.sleepMin >= 360 && f.sleepMin <= 540 && f.mealCount >= 2 && f.totalActiveMin >= 60 && f.totalActiveMin <= 300;
    case 72: return (life > 0 || outing > 0) && f.totalActiveMin <= 120;
    case 73: return knowledge >= 30 && knowledge < 120;
    case 74: return between(exercise, 20, 89) || between(outing, 20, 89);
    case 75: return development >= 30 && development < 120;
    case 76: return creation >= 15 && creation < 60;
    case 77: return f.mealCount >= 3 && otherActivity(f, "meal") <= 60;
    case 78: return f.sleepMin >= 480 && f.totalActiveMin <= 60;
    case 79: return social >= 30 && social < 120;
    case 80: return rest >= 60 && otherActivity(f, "rest") <= 60;
    case 81: return reading >= 10 && reading < 90;
    case 82: return ((meditation >= 10 && meditation < 60) || (rest >= 10 && rest < 60)) && f.totalActiveMin <= 180;
    case 83: return leisure >= 60 && f.maxGroup === "leisure";
    case 84: return Object.entries(f.categoryMin).filter(([key, value]) => key !== "sleep" && value > 0 && value < 30).length >= 4;
    case 85: return f.lateNightActiveMin >= 60;
    case 86: return f.wakeMinute !== null && f.wakeMinute >= 600 && f.sleepMin >= 420;
    case 87: return f.moodAvg > 0 && f.moodAvg <= 2 && f.logCount >= 1;
    case 88: return f.logCount >= 1 && f.totalActiveMin < 30;
    case 89: return f.logCount >= 8 && f.activeGroups >= 3;
    case 90: return f.overeatCount >= 1 && f.moodAvg >= 3;
    case 91: return f.mealTypes.some((type) => ["야식", "late-night snack", "snack-night"].includes(type));
    case 92: return f.quickDeliveryMeals >= 2 && !Array.from({ length: 21 }, (_, index) => index + 71).some((id) => id !== 92 && heroMatches(id, f));
    case 93: return f.walking >= 30 || (outing >= 30 && f.outingPurposes.includes("산책"));
    case 94: return f.napMin > 0 && f.napMin < 20;
    case 95: return f.timerRecords >= 2;
    case 96: return f.logCount === 0 && f.priorDayLogCount > 0;
    case 97: return f.logCount > 0 && f.distinctCategories.every((key) => key === "sleep");
    case 98: return f.logCount > 0 && f.distinctCategories.every((key) => key === "meal");
    case 100: return f.accountCreatedDate === f.date && !Array.from({ length: 18 }, (_, index) => index + 1).some((id) => heroMatches(id, f));
    default: return false;
  }
}

function primaryScore(no: number, f: DayFeatures): number {
  const primaryValue = (() => {
    switch (no) {
      case 1: case 7: case 8: case 12: case 27: case 35: case 41: case 73: return g(f, "knowledge");
      case 3: case 13: case 20: case 28: case 37: case 43: case 62: case 63: case 75: return c(f, "development");
      case 4: case 9: case 16: case 21: case 26: case 36: case 48: case 49: case 64: case 80: case 82: return c(f, "rest") + c(f, "meditation");
      case 10: case 19: case 29: case 34: case 42: case 60: case 69: case 70: return c(f, "exercise");
      case 14: case 32: case 38: case 44: case 45: case 76: return c(f, "creation");
      case 15: case 31: case 52: case 53: case 68: case 79: return c(f, "relationship");
      case 18: case 33: case 55: case 56: case 72: case 74: case 93: return c(f, "outing");
      default: return f.totalActiveMin;
    }
  })();
  return Math.min(1, Math.max(0, primaryValue / 480));
}

const rarityOrder: HeroRarity[] = ["legendary", "epic", "rare", "uncommon", "common", "basic"];

function reasonsFor(features: DayFeatures): string[] {
  const label: Record<string, string> = {
    sleep: "충분한 수면", meal: "식사", study: "공부", development: "개발", exercise: "운동", meditation: "명상", rest: "휴식", reading: "독서", creation: "창작", leisure: "여가", outing: "외출", relationship: "인연", life: "생활",
  };
  const parts = Object.entries(features.categoryMin)
    .filter(([, minutes]) => minutes > 0)
    .map(([key, minutes]) => ({ text: `${label[key] ?? key} ${Math.round(minutes)}분`, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 3)
    .map((entry) => entry.text);
  if (features.sleepMin > 0 && parts.length < 3) parts.push(`수면 ${Math.round(features.sleepMin / 60 * 10) / 10}시간`);
  return parts.slice(0, 3).length ? parts.slice(0, 3) : ["기록이 없는 날도 모험의 한 페이지로 남았습니다"];
}

export function judgeHero(features: DayFeatures): HeroJudgement {
  const eligible = HEROES.filter((hero) => hero.no !== 99 && heroMatches(hero.no, features) && (hero.rarity !== "legendary" && hero.rarity !== "epic" || sleepGate(features)));
  for (const rarity of rarityOrder) {
    const candidates = eligible.filter((hero) => hero.rarity === rarity)
      .map((hero) => ({ hero, score: primaryScore(hero.no, features) }))
      .sort((a, b) => b.score - a.score || a.hero.no - b.hero.no);
    if (candidates[0]) return { hero: candidates[0].hero, score: candidates[0].score, reasons: reasonsFor(features) };
  }
  const fallback = HERO_BY_NO.get(99);
  if (!fallback) throw new Error("Hero #099 fallback is missing");
  return { hero: fallback, score: 0, reasons: reasonsFor(features) };
}

export function rarityName(rarity: HeroRarity): string {
  return ({ legendary: "전설", epic: "영웅", rare: "희귀", uncommon: "고급", common: "일반", basic: "기본" })[rarity];
}
