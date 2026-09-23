import { describe, expect, it } from "vitest";
import { HEROES } from "@/content/heroes";
import { EVENTS } from "@/content/events";
import { createInitialState } from "@/lib/storage";
import { extractFeatures } from "@/lib/game/features";
import { heroMatches, judgeHero } from "@/lib/game/judge";
import { evaluateLogEvents, validateEventDefinitions } from "@/lib/game/events";
import { settleLocalDay } from "@/lib/game/settlement";
import { grantRewardOnce } from "@/lib/game/progression";
import { baseLogXp, calculateDayXp } from "@/lib/game/xp";
import type { ActivityLog } from "@/lib/domain";
import type { DayFeatures } from "@/lib/game/features";

function log(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: "a0000000-0000-4000-8000-000000000001", categoryKey: "study", typeKey: "수학", status: "completed",
    startedAt: "2026-09-21T00:00:00.000Z", endedAt: "2026-09-21T01:00:00.000Z", durationMin: 60,
    attributedDate: "2026-09-21", mood: 4, details: { subject: "수학" }, note: "", source: "detailed", version: 1, deletedAt: null, ...overrides,
  };
}

function reachabilityFixture(no: number): DayFeatures {
  const date = "2026-09-21";
  const base = extractFeatures([], date, "Asia/Seoul");
  const categoryMin = Object.fromEntries(["sleep","meal","study","development","exercise","meditation","rest","reading","creation","leisure","outing","relationship","life"].map((key) => [key, 500]));
  const wide: DayFeatures = {
    ...base,
    min: { knowledge:500,body:500,craft:500,mind:500,recovery:500,life:500,social:500,leisure:500,explore:500 },
    categoryMin,
    sleepMin:480,napMin:120,sleepQuality:5,wakeMinute:300,bedMinute:120,mealCount:4,mealTypes:["야식"],breakfast:true,lunch:true,dinner:true,
    heartyMealCount:2,adequateMeals:3,breakfastAdequate:true,lunchAdequate:true,dinnerAdequate:true,overeatCount:0,hardlyAteCount:0,homeMeals:3,
    strengthMin:120,mealForms:["home","restaurant","delivery"],mealSatisfaction:4,togetherMeals:2,studySubjects:["수학","영어","과학"],problemCount:60,correctCount:50,avgFocus:5,avgUnderstanding:5,
    developmentSolved:8,developmentResults:{"완료":3,done:3},developmentKinds:{"설계":2,design:2,"리뷰":2,review:2,"버그":3},exerciseKinds:["등산","달리기"],distanceKm:15,strengthVolume:9_000,strengthSets:20,rpeMax:8,
    moodAvg:4,moodDelta:2,moodCount:3,activeGroups:6,groupsAt20:7,logCount:8,categoryCount:5,firstLogMinute:300,lastLogMinute:1_200,
    timeOfDayProfile:{dawn:60,morning:100,afternoon:120,evening:240,lateNight:90},lateNightActiveMin:100,night2224ActiveMin:100,knowledgeLate2224Min:60,
    activity1600To2200:300,focused1600To2200:200,morningActiveMin:100,before0600FocusActivity:60,singleLongLogMin:240,singleLongFocus:5,singleLongCategory:"study",
    maxGroup:"body",maxGroupShare:.3,screenLeisure:0,walking:60,runningCycling:60,natureOuting:120,travelMin:300,lateNightWritingMin:90,lateNightThoughtMin:30,
    outingPurposes:["자연","여행","카페"],relationshipTargets:["가족","친구"],petMinutes:30,familyMinutes:120,shoppingMinutes:60,groceryMinutes:60,cafeMinutes:30,games:120,videos:120,musicLeisure:30,
    writing:90,drawing:60,musicCreation:60,stretching:30,teamSports:60,completedBooks:1,readingGenres:["소설","역사"],reviews:2,deployments:1,bugTasks:3,teaBreaks:1,
    quickDeliveryMeals:0,creationComplete:1,timerRecords:2,distinctCategories:["study","sleep","meal"],totalActiveMin:120,priorDaySleepMin:240,priorDayMoodAvg:1,priorDayLogCount:1,
    exerciseFollowedByRecovery:true,lastSevenWakeMinutes:Array(7).fill(300),lastSevenSleepDays:7,accountCreatedDate:null,eventRarities:["legendary"],
  };
  if (no <= 70) {
    if (no === 20 || no === 43) wide.maxGroup="craft";
    if (no === 41) wide.maxGroup="knowledge";
    if (no === 65) wide.napMin=60;
    if (no === 26 || no === 67) wide.totalActiveMin=120;
    return wide;
  }
  const quiet = { ...base };
  switch (no) {
    case 71: return { ...quiet,sleepMin:420,mealCount:2,totalActiveMin:120 };
    case 72: return { ...quiet,categoryMin:{...base.categoryMin,life:30},totalActiveMin:60 };
    case 73: return { ...quiet,min:{...base.min,knowledge:60} };
    case 74: return { ...quiet,categoryMin:{...base.categoryMin,exercise:50} };
    case 75: return { ...quiet,categoryMin:{...base.categoryMin,development:60} };
    case 76: return { ...quiet,categoryMin:{...base.categoryMin,creation:30} };
    case 77: return { ...quiet,mealCount:3,categoryMin:{...base.categoryMin,meal:60},totalActiveMin:60 };
    case 78: return { ...quiet,sleepMin:480,totalActiveMin:60 };
    case 79: return { ...quiet,categoryMin:{...base.categoryMin,relationship:60} };
    case 80: return { ...quiet,categoryMin:{...base.categoryMin,rest:60},totalActiveMin:120 };
    case 81: return { ...quiet,categoryMin:{...base.categoryMin,reading:30} };
    case 82: return { ...quiet,categoryMin:{...base.categoryMin,meditation:20},totalActiveMin:120 };
    case 83: return { ...quiet,categoryMin:{...base.categoryMin,leisure:60},maxGroup:"leisure" };
    case 84: return { ...quiet,categoryMin:{study:10,exercise:15,creation:20,rest:25} };
    case 85: return { ...quiet,lateNightActiveMin:60 };
    case 86: return { ...quiet,wakeMinute:600,sleepMin:420 };
    case 87: return { ...quiet,moodAvg:2,logCount:1 };
    case 88: return { ...quiet,logCount:1,totalActiveMin:20 };
    case 89: return { ...quiet,logCount:8,activeGroups:3 };
    case 90: return { ...quiet,overeatCount:1,moodAvg:3 };
    case 91: return { ...quiet,mealTypes:["야식"] };
    case 92: return { ...quiet,quickDeliveryMeals:2 };
    case 93: return { ...quiet,walking:30 };
    case 94: return { ...quiet,napMin:10 };
    case 95: return { ...quiet,timerRecords:2 };
    case 96: return { ...quiet,priorDayLogCount:1 };
    case 97: return { ...quiet,logCount:1,distinctCategories:["sleep"] };
    case 98: return { ...quiet,logCount:1,distinctCategories:["meal"] };
    case 100: return { ...quiet,accountCreatedDate:date };
    default: return quiet;
  }
}

describe("hero judgement", () => {
  it("contains 100 unique hero definitions and always returns a fallback", () => {
    expect(HEROES).toHaveLength(100);
    expect(new Set(HEROES.map((hero) => hero.no)).size).toBe(100);
    expect(judgeHero(extractFeatures([], "2026-09-21", "Asia/Seoul")).hero.no).toBe(99);
  });

  it("keeps the three protected hero rules reachable", () => {
    const exercise = log({ categoryKey: "exercise", typeKey: "근력", durationMin: 90, endedAt: "2026-09-21T01:30:00.000Z", details: { exerciseType: "근력", metricType: "strength", rpe: 8 } });
    const development = log({ categoryKey: "development", typeKey: "버그", durationMin: 240, endedAt: "2026-09-21T04:00:00.000Z", details: { workType: "버그", solvedProblems: 3 } });
    const sleep = log({ categoryKey: "sleep", typeKey: "밤잠", startedAt: "2026-09-20T14:00:00.000Z", endedAt: "2026-09-21T00:00:00.000Z", durationMin: 600, attributedDate: "2026-09-20", details: { sleepType: "night" } });
    expect(heroMatches(19, extractFeatures([exercise], "2026-09-21", "Asia/Seoul"))).toBe(true);
    expect(heroMatches(20, extractFeatures([development], "2026-09-21", "Asia/Seoul"))).toBe(true);
    expect(heroMatches(21, extractFeatures([sleep], "2026-09-21", "Asia/Seoul"))).toBe(true);
  });

  it("has a satisfying feature fixture for every non-fallback hero rule", () => {
    for (const hero of HEROES.filter((item) => item.no !== 99)) {
      expect(heroMatches(hero.no, reachabilityFixture(hero.no)), `hero ${hero.no} should be reachable`).toBe(true);
    }
  });

  it("makes the same judgement over 1,000 repeated calls", () => {
    const features = extractFeatures([log()], "2026-09-21", "Asia/Seoul");
    const expected = judgeHero(features);
    for (let i = 0; i < 1_000; i += 1) expect(judgeHero(features)).toEqual(expected);
  });

  it("blocks legendary and epic rarity after a recorded short night but allows missing sleep", () => {
    const baseline = extractFeatures([], "2026-09-21", "Asia/Seoul");
    const shortSleep = { ...baseline, sleepMin: 359, categoryMin: { ...baseline.categoryMin, reading: 180 }, min: { ...baseline.min, knowledge: 180 } };
    expect(judgeHero(shortSleep).hero.rarity).not.toBe("legendary");
    expect(judgeHero(shortSleep).hero.rarity).not.toBe("epic");
    const noSleep = { ...baseline, eventRarities: ["legendary"], activeGroups: 3 };
    expect(judgeHero(noSleep).hero.rarity).toBe("legendary");
  });
});

describe("settlement, events, and rewards", () => {
  it("settles the same input idempotently and preserves revisions after an edit", () => {
    const now = new Date("2026-09-23T00:00:00.000Z");
    const initial = createInitialState("Asia/Seoul");
    const state = { ...initial, logs: [log()] };
    const first = settleLocalDay(state, "2026-09-21", now);
    const repeated = settleLocalDay(first, "2026-09-21", now);
    expect(repeated.settlements).toHaveLength(1);
    const changed = { ...first, logs: [{ ...state.logs[0]!, durationMin: 120, version: 2 }] };
    const revised = settleLocalDay(changed, "2026-09-21", now);
    expect(revised.settlements.filter((item) => item.status === "final")).toHaveLength(1);
    expect(revised.settlements.find((item) => item.status === "final")?.revision).toBe(2);
    expect(revised.settlements.find((item) => item.status === "superseded")?.revision).toBe(1);
  });

  it("keeps event outcomes stable for identical replay and grants a reward once", () => {
    const state = createInitialState("Asia/Seoul");
    const activity = log();
    const features = extractFeatures([activity], activity.attributedDate, state.profile.timezone);
    const first = evaluateLogEvents(state, activity, features);
    const replay = evaluateLogEvents(first.state, activity, features);
    expect(replay.newEvents).toEqual([]);
    expect(replay.state.events).toEqual(first.state.events);
    expect(Object.keys(first.state.eventSeeds)).toHaveLength(1);
    const rewarded = grantRewardOnce(state, "quest", "same-quest", { knowledge: 30 }, { "star-sand": 1 });
    const duplicated = grantRewardOnce(rewarded, "quest", "same-quest", { knowledge: 30 }, { "star-sand": 1 });
    expect(duplicated.rewardLedger).toHaveLength(1);
    expect(duplicated.inventory["star-sand"]).toBe(1);
  });
});

describe("experience and content rules", () => {
  it("keeps custom activity on the same duration curve and applies the daily cap", () => {
    const base = log({ durationMin: 60 });
    const custom = log({ categoryKey: "custom-test", durationMin: 60, customTraits: { calm: 0.7, recovery: 0.3 } });
    expect(baseLogXp(base)).toBe(baseLogXp(custom));
    const logs = Array.from({ length: 60 }, (_, index) => log({ id: "a0000000-0000-4000-8000-" + String(index).padStart(12, "0"), startedAt: new Date(Date.parse("2026-09-21T00:00:00.000Z") + index * 60_000).toISOString(), durationMin: 240 }));
    expect(calculateDayXp(logs, "2026-09-21").total).toBeLessThanOrEqual(1_200);
  });

  it("validates unique event identifiers and the required content minimum", () => {
    expect(validateEventDefinitions()).toEqual([]);
    expect(new Set(EVENTS.map((event) => event.id)).size).toBe(EVENTS.length);
    expect(EVENTS.filter((event) => event.rarity === "common").length).toBeGreaterThanOrEqual(20);
    expect(EVENTS.filter((event) => event.rarity === "rare").length).toBeGreaterThanOrEqual(12);
    expect(EVENTS.filter((event) => event.rarity === "epic").length).toBeGreaterThanOrEqual(5);
    expect(EVENTS.filter((event) => event.rarity === "legendary").length).toBeGreaterThanOrEqual(3);
    for (const event of EVENTS) expect(event.body.length).toBeGreaterThanOrEqual(2);
  });
});
