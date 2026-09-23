import { getCategory, type ActivityLog, type CategoryDefinition, type Group } from "@/lib/domain";
import { addDateDays, localClock, localDateKey, splitIntervalByLocalDate } from "@/lib/game/time";

export type DayFeatures = {
  date: string;
  min: Record<Group, number>;
  categoryMin: Record<string, number>;
  sleepMin: number;
  napMin: number;
  sleepQuality: number;
  wakeMinute: number | null;
  bedMinute: number | null;
  mealCount: number;
  mealTypes: string[];
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  heartyMealCount: number;
  adequateMeals: number;
  breakfastAdequate: boolean;
  lunchAdequate: boolean;
  dinnerAdequate: boolean;
  overeatCount: number;
  hardlyAteCount: number;
  homeMeals: number;
  strengthMin: number;
  mealForms: string[];
  mealSatisfaction: number;
  togetherMeals: number;
  studySubjects: string[];
  problemCount: number;
  correctCount: number;
  avgFocus: number;
  avgUnderstanding: number;
  developmentSolved: number;
  developmentResults: Record<string, number>;
  developmentKinds: Record<string, number>;
  exerciseKinds: string[];
  distanceKm: number;
  strengthVolume: number;
  strengthSets: number;
  rpeMax: number;
  moodAvg: number;
  moodDelta: number;
  moodCount: number;
  activeGroups: number;
  groupsAt20: number;
  logCount: number;
  categoryCount: number;
  firstLogMinute: number | null;
  lastLogMinute: number | null;
  timeOfDayProfile: Record<"dawn" | "morning" | "afternoon" | "evening" | "lateNight", number>;
  lateNightActiveMin: number;
  night2224ActiveMin: number;
  knowledgeLate2224Min: number;
  activity1600To2200: number;
  focused1600To2200: number;
  morningActiveMin: number;
  before0600FocusActivity: number;
  singleLongLogMin: number;
  singleLongFocus: number;
  singleLongCategory: string;
  maxGroup: Group | null;
  maxGroupShare: number;
  screenLeisure: number;
  walking: number;
  runningCycling: number;
  natureOuting: number;
  travelMin: number;
  lateNightWritingMin: number;
  lateNightThoughtMin: number;
  outingPurposes: string[];
  relationshipTargets: string[];
  petMinutes: number;
  familyMinutes: number;
  shoppingMinutes: number;
  groceryMinutes: number;
  cafeMinutes: number;
  games: number;
  videos: number;
  musicLeisure: number;
  writing: number;
  drawing: number;
  musicCreation: number;
  stretching: number;
  teamSports: number;
  completedBooks: number;
  readingGenres: string[];
  reviews: number;
  deployments: number;
  bugTasks: number;
  teaBreaks: number;
  quickDeliveryMeals: number;
  creationComplete: number;
  timerRecords: number;
  distinctCategories: string[];
  totalActiveMin: number;
  priorDaySleepMin: number;
  priorDayMoodAvg: number;
  priorDayLogCount: number;
  exerciseFollowedByRecovery: boolean;
  lastSevenWakeMinutes: number[];
  lastSevenSleepDays: number;
  accountCreatedDate: string | null;
  eventRarities: string[];
};

const emptyGroups = (): Record<Group, number> => ({ knowledge: 0, body: 0, craft: 0, mind: 0, recovery: 0, life: 0, social: 0, leisure: 0, explore: 0 });
const average = (numbers: number[]) => numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown) => (typeof value === "string" ? value : "");
const detailNumber = (log: ActivityLog, ...keys: string[]) => keys.map((key) => num(log.details[key])).find((value) => value !== 0) ?? 0;

function logDateMinutes(log: ActivityLog, date: string, timeZone: string): number {
  if (log.deletedAt) return 0;
  if (log.categoryKey === "sleep") {
    const kind = str(log.details.sleepType ?? "night").toLowerCase();
    const isNap = kind === "nap" || kind === "powernap" || kind.includes("낮잠");
    const targetDate = isNap || !log.endedAt ? localDateKey(new Date(log.startedAt), timeZone) : localDateKey(new Date(log.endedAt), timeZone);
    return targetDate === date && log.status === "completed" ? Math.max(log.durationMin, 0) : 0;
  }
  const endAt = log.endedAt ?? (log.status === "completed" ? new Date(new Date(log.startedAt).getTime() + log.durationMin * 60_000).toISOString() : null);
  if (!endAt) return 0;
  return splitIntervalByLocalDate(log.startedAt, endAt, timeZone)[date] ?? 0;
}

export function extractFeatures(
  logs: ActivityLog[],
  date: string,
  timeZone: string,
  events: Array<{ date: string; rarity: string }> = [],
  accountCreatedAt: string | null = null,
  customCategories: CategoryDefinition[] = [],
): DayFeatures {
  const groups = emptyGroups();
  const nonSleepGroups = emptyGroups();
  const categoryMin: Record<string, number> = {};
  const dayLogs = logs.filter((log) => !log.deletedAt && log.status === "completed" && logDateMinutes(log, date, timeZone) > 0);
  const moodLogs = dayLogs.filter((log) => log.mood !== null).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const minuteOfDay = (iso: string) => {
    const [hour, minute] = localClock(new Date(iso), timeZone).split(":").map(Number);
    return hour * 60 + minute;
  };
  const minuteOf = (iso: string) => minuteOfDay(iso);
  const sleepLogs = dayLogs.filter((log) => {
    const type = String(log.details.sleepType ?? "night").toLowerCase();
    return log.categoryKey === "sleep" && type !== "nap" && type !== "powernap" && !type.includes("낮잠") && !type.includes("쪽잠");
  });
  const napLogs = dayLogs.filter((log) => log.categoryKey === "sleep" && !sleepLogs.includes(log));
  const mealLogs = dayLogs.filter((log) => log.categoryKey === "meal");
  const studyLogs = dayLogs.filter((log) => log.categoryKey === "study");
  const readingLogs = dayLogs.filter((log) => log.categoryKey === "reading");
  const devLogs = dayLogs.filter((log) => log.categoryKey === "development");
  const exerciseLogs = dayLogs.filter((log) => log.categoryKey === "exercise");
  const outingLogs = dayLogs.filter((log) => log.categoryKey === "outing");
  const relationshipLogs = dayLogs.filter((log) => log.categoryKey === "relationship");
  const creationLogs = dayLogs.filter((log) => log.categoryKey === "creation");
  const restLogs = dayLogs.filter((log) => log.categoryKey === "rest");
  const meditationLogs = dayLogs.filter((log) => log.categoryKey === "meditation");
  const categorized = new Map<string, ActivityLog[]>();
  let totalActiveMin = 0;
  let lateNightActiveMin = 0;
  let night2224ActiveMin = 0;
  let knowledgeLate2224Min = 0;
  let lateNightWritingMin = 0;
  let lateNightThoughtMin = 0;
  let activity1600To2200 = 0;
  let focused1600To2200 = 0;
  let morningActiveMin = 0;
  let before0600FocusActivity = 0;
  const timeOfDayProfile = { dawn: 0, morning: 0, afternoon: 0, evening: 0, lateNight: 0 };

  for (const log of dayLogs) {
    const category = getCategory(log.categoryKey, customCategories);
    const duration = logDateMinutes(log, date, timeZone);
    const categoryKey = category ? log.categoryKey : (log.customTag ?? "life");
    const group: Group = category?.group ?? "life";
    if (!categorized.has(categoryKey)) categorized.set(categoryKey, []);
    categorized.get(categoryKey)?.push(log);
    categoryMin[categoryKey] = (categoryMin[categoryKey] ?? 0) + duration;
    groups[group] += duration;
    if (log.categoryKey !== "sleep") {
      totalActiveMin += duration;
      nonSleepGroups[group] += duration;
    }

    const endAt = log.endedAt ?? new Date(new Date(log.startedAt).getTime() + duration * 60_000).toISOString();
    let cursor = new Date(log.startedAt).getTime();
    const end = new Date(endAt).getTime();
    while (cursor < end) {
      const instant = new Date(cursor);
      if (localDateKey(instant, timeZone) === date) {
        const [hour] = localClock(instant, timeZone).split(":").map(Number);
        if (hour >= 0 && hour < 4 && log.categoryKey !== "sleep") {
          lateNightActiveMin += 1;
          if (["reading", "meditation"].includes(log.categoryKey)) lateNightThoughtMin += 1;
          if (log.categoryKey === "creation" && ["글", "writing", "글쓰기"].includes(str(log.details.creationType ?? log.typeKey))) lateNightWritingMin += 1;
        }
        if (hour >= 22 && log.categoryKey !== "sleep") {
          night2224ActiveMin += 1;
          if (["study", "reading"].includes(log.categoryKey)) knowledgeLate2224Min += 1;
        }
        if (hour >= 16 && hour < 22 && log.categoryKey !== "sleep") activity1600To2200 += 1;
        if (hour >= 16 && hour < 22 && ["study", "reading", "development", "creation"].includes(log.categoryKey)) focused1600To2200 += 1;
        if (hour >= 7 && hour < 11 && log.categoryKey !== "sleep") morningActiveMin += 1;
        if (hour < 6 && ["study", "reading", "exercise", "meditation"].includes(log.categoryKey)) before0600FocusActivity += 1;
        if (hour >= 4 && hour < 7) timeOfDayProfile.dawn += 1;
        else if (hour >= 7 && hour < 11) timeOfDayProfile.morning += 1;
        else if (hour >= 11 && hour < 16) timeOfDayProfile.afternoon += 1;
        else if (hour >= 16 && hour < 22) timeOfDayProfile.evening += 1;
        else timeOfDayProfile.lateNight += 1;
      }
      cursor += 60_000;
    }
  }

  const sums = (items: ActivityLog[], pick: (log: ActivityLog) => boolean = () => true) => items.reduce((sum, log) => sum + (pick(log) ? logDateMinutes(log, date, timeZone) : 0), 0);
  const kinds = (items: ActivityLog[], field: string) => [...new Set(items.map((log) => str(log.details[field] ?? log.typeKey)).filter(Boolean))];
  const mealTypes = kinds(mealLogs, "mealType");
  const mealForms = kinds(mealLogs, "form");
  const outingPurposes = kinds(outingLogs, "purpose");
  const relationshipTargets = kinds(relationshipLogs, "target");
  const studySubjects = [...new Set(studyLogs.map((log) => str(log.details.subject ?? log.typeKey)).filter(Boolean))];
  const readingGenres = [...new Set(readingLogs.map((log) => str(log.details.genre)).filter(Boolean))];
  const adequateMeals = mealLogs.filter((log) => ["adequate", "hearty", "적당히", "든든히"].includes(str(log.details.amount))).length;
  const overeatCount = mealLogs.filter((log) => ["overeat", "과식"].includes(str(log.details.amount))).length;
  const hardlyAteCount = mealLogs.filter((log) => ["hardly", "거의 못 먹음"].includes(str(log.details.amount))).length;
  const averageSleepQuality = average(sleepLogs.map((log) => num(log.details.satisfaction ?? log.details.quality)).filter((value) => value > 0));
  const wakeMinute = sleepLogs.length ? Math.max(...sleepLogs.map((log) => minuteOf(log.endedAt ?? log.startedAt))) : null;
  const bedMinute = sleepLogs.length ? Math.min(...sleepLogs.map((log) => minuteOf(log.startedAt))) : null;
  const developmentResults: Record<string, number> = {};
  const developmentKinds: Record<string, number> = {};
  for (const log of devLogs) {
    const result = str(log.details.result ?? "");
    const kind = str(log.details.workType ?? log.typeKey);
    if (result) developmentResults[result] = (developmentResults[result] ?? 0) + 1;
    if (kind) developmentKinds[kind] = (developmentKinds[kind] ?? 0) + 1;
  }
  const exerciseKinds = kinds(exerciseLogs, "exerciseType");
  const strengthLogs = exerciseLogs.filter((log) => ["근력", "strength"].includes(str(log.details.exerciseType ?? log.typeKey)) || log.details.metricSchema === "strength");
  const strengthSetsData = exerciseLogs.flatMap((log) => {
    if (Array.isArray(log.details.sets)) return log.details.sets as Array<{ weightKg?: number; reps?: number }>;
    const count = Math.min(300, Math.max(0, Math.floor(num(log.details.sets))));
    return Array.from({ length: count }, () => ({ weightKg: num(log.details.weightKg), reps: num(log.details.reps) }));
  });
  const accountCreatedDate = accountCreatedAt ? localDateKey(new Date(accountCreatedAt), timeZone) : null;
  const priorDate = addDateDays(date, -1);
  const priorLogs = logs.filter((log) => !log.deletedAt && log.status === "completed" && logDateMinutes(log, priorDate, timeZone) > 0);
  const priorSleep = priorLogs.filter((log) => log.categoryKey === "sleep");
  const wakeByDate: Record<string, number> = {};
  const sleepByDate: Record<string, number> = {};
  for (const log of logs.filter((item) => !item.deletedAt && item.status === "completed" && item.categoryKey === "sleep")) {
    const sleepType = String(log.details.sleepType ?? "night").toLowerCase();
    if (sleepType === "nap" || sleepType === "powernap" || sleepType.includes("낮잠") || sleepType.includes("쪽잠")) continue;
    const attributed = log.endedAt ? localDateKey(new Date(log.endedAt), timeZone) : localDateKey(new Date(log.startedAt), timeZone);
    sleepByDate[attributed] = (sleepByDate[attributed] ?? 0) + log.durationMin;
    wakeByDate[attributed] = minuteOf(log.endedAt ?? log.startedAt);
  }
  const lastSevenDates = Array.from({ length: 7 }, (_, index) => addDateDays(date, index - 6));
  const lastSevenWakeMinutes = lastSevenDates.map((day) => wakeByDate[day]).filter((value): value is number => value !== undefined);
  const lastSevenSleepDays = lastSevenDates.filter((day) => (sleepByDate[day] ?? 0) >= 420).length;
  const categoryKeys = [...new Set(dayLogs.map((log) => log.categoryKey))];
  const maxGroupEntry = Object.entries(nonSleepGroups).sort((a, b) => b[1] - a[1])[0];
  const maxGroup = maxGroupEntry && maxGroupEntry[1] > 0 ? maxGroupEntry[0] as Group : null;
  const singleLongLog = [...dayLogs].sort((a, b) => b.durationMin - a.durationMin)[0];
  const totalGroupMinutes = Object.values(nonSleepGroups).reduce((sum, value) => sum + value, 0);
  const exerciseFollowedByRecovery = exerciseLogs.some((exercise) => {
    const finish = new Date(exercise.endedAt ?? exercise.startedAt).getTime();
    return [...restLogs, ...meditationLogs, ...napLogs].some((recoveryLog) => new Date(recoveryLog.startedAt).getTime() >= finish);
  });
  const eventRarities = events.filter((event) => event.date === date).map((event) => event.rarity);
  return {
    date,
    min: groups,
    categoryMin,
    sleepMin: sums(sleepLogs),
    napMin: sums(napLogs),
    sleepQuality: averageSleepQuality,
    wakeMinute,
    bedMinute,
    mealCount: mealLogs.length,
    mealTypes,
    breakfastAdequate: mealLogs.some((log) => ["아침", "breakfast"].includes(str(log.details.mealType ?? log.typeKey)) && ["adequate", "hearty", "적당히", "든든히"].includes(str(log.details.amount))),
    lunchAdequate: mealLogs.some((log) => ["점심", "lunch"].includes(str(log.details.mealType ?? log.typeKey)) && ["adequate", "hearty", "적당히", "든든히"].includes(str(log.details.amount))),
    dinnerAdequate: mealLogs.some((log) => ["저녁", "dinner"].includes(str(log.details.mealType ?? log.typeKey)) && ["adequate", "hearty", "적당히", "든든히"].includes(str(log.details.amount))),
    breakfast: mealLogs.some((log) => ["아침", "breakfast"].includes(str(log.details.mealType ?? log.typeKey))),
    lunch: mealLogs.some((log) => ["점심", "lunch"].includes(str(log.details.mealType ?? log.typeKey))),
    dinner: mealLogs.some((log) => ["저녁", "dinner"].includes(str(log.details.mealType ?? log.typeKey))),
    heartyMealCount: mealLogs.filter((log) => ["hearty", "든든히"].includes(str(log.details.amount))).length,
    adequateMeals,
    overeatCount,
    hardlyAteCount,
    homeMeals: mealLogs.filter((log) => log.details.form === "home" || log.details.form === "집밥").length,
    strengthMin: sums(strengthLogs),
    mealForms,
    mealSatisfaction: average(mealLogs.map((log) => num(log.details.satisfaction)).filter((value) => value > 0)),
    togetherMeals: mealLogs.filter((log) => Boolean(log.details.withSomeone)).length,
    studySubjects,
    problemCount: studyLogs.reduce((sum, log) => sum + detailNumber(log, "problems", "problemCount"), 0),
    correctCount: studyLogs.reduce((sum, log) => sum + detailNumber(log, "correct", "correctCount"), 0),
    avgFocus: average(studyLogs.map((log) => num(log.details.focus)).filter((value) => value > 0)),
    avgUnderstanding: average(studyLogs.map((log) => num(log.details.understanding)).filter((value) => value > 0)),
    developmentSolved: devLogs.reduce((sum, log) => sum + detailNumber(log, "solvedProblems", "solved"), 0),
    developmentResults,
    developmentKinds,
    exerciseKinds,
    distanceKm: exerciseLogs.reduce((sum, log) => sum + detailNumber(log, "distanceKm", "distance"), 0),
    strengthVolume: strengthSetsData.reduce((sum, set) => sum + num(set.weightKg) * num(set.reps), 0),
    strengthSets: strengthSetsData.length,
    rpeMax: Math.max(0, ...exerciseLogs.map((log) => num(log.details.rpe))),
    moodAvg: average(moodLogs.map((log) => log.mood ?? 0)),
    moodDelta: moodLogs.length > 1 ? (moodLogs[moodLogs.length - 1]?.mood ?? 0) - (moodLogs[0]?.mood ?? 0) : 0,
    moodCount: moodLogs.length,
    activeGroups: Object.values(nonSleepGroups).filter((value) => value >= 30).length,
    groupsAt20: Object.values(nonSleepGroups).filter((value) => value >= 20).length,
    logCount: dayLogs.length,
    categoryCount: categoryKeys.length,
    firstLogMinute: dayLogs.length ? Math.min(...dayLogs.map((log) => minuteOf(log.startedAt))) : null,
    lastLogMinute: dayLogs.length ? Math.max(...dayLogs.map((log) => minuteOf(log.endedAt ?? log.startedAt))) : null,
    timeOfDayProfile,
    lateNightActiveMin,
    night2224ActiveMin,
    knowledgeLate2224Min,
    activity1600To2200,
    focused1600To2200,
    morningActiveMin,
    before0600FocusActivity,
    singleLongLogMin: singleLongLog?.durationMin ?? 0,
    singleLongFocus: num(singleLongLog?.details.focus),
    singleLongCategory: singleLongLog?.categoryKey ?? "",
    maxGroup,
    maxGroupShare: totalGroupMinutes > 0 ? (maxGroupEntry?.[1] ?? 0) / totalGroupMinutes : 0,
    screenLeisure: sums(dayLogs.filter((log) => log.categoryKey === "leisure" && ["game", "video", "게임", "영상"].includes(str(log.details.leisureType ?? log.typeKey)))),
    walking: sums(exerciseLogs.filter((log) => ["걷기", "walking", "walk"].includes(str(log.details.exerciseType ?? log.typeKey)))) + sums(restLogs.filter((log) => log.details.restType === "산책")) + sums(outingLogs.filter((log) => log.details.purpose === "산책")),
    runningCycling: sums(exerciseLogs.filter((log) => ["달리기", "자전거", "running", "cycling"].includes(str(log.details.exerciseType ?? log.typeKey)))),
    natureOuting: sums(outingLogs.filter((log) => ["자연", "nature"].includes(str(log.details.purpose ?? log.typeKey)))),
    travelMin: sums(outingLogs.filter((log) => ["여행", "travel"].includes(str(log.details.purpose ?? log.typeKey)))),
    lateNightWritingMin,
    lateNightThoughtMin,
    outingPurposes,
    relationshipTargets,
    petMinutes: sums(relationshipLogs.filter((log) => ["반려동물", "pet"].includes(str(log.details.target ?? log.typeKey)))),
    familyMinutes: sums(relationshipLogs.filter((log) => ["가족", "family"].includes(str(log.details.target ?? log.typeKey)))),
    shoppingMinutes: sums(outingLogs.filter((log) => ["쇼핑", "shopping"].includes(str(log.details.purpose ?? log.typeKey)))),
    groceryMinutes: sums(dayLogs.filter((log) => log.categoryKey === "life" && ["장보기", "grocery"].includes(str(log.details.lifeType ?? log.typeKey)))),
    cafeMinutes: sums(outingLogs.filter((log) => ["카페", "cafe"].includes(str(log.details.purpose ?? log.typeKey)))),
    games: sums(dayLogs.filter((log) => log.categoryKey === "leisure" && ["게임", "game"].includes(str(log.details.leisureType ?? log.typeKey)))),
    videos: sums(dayLogs.filter((log) => log.categoryKey === "leisure" && ["영상", "video"].includes(str(log.details.leisureType ?? log.typeKey)))),
    musicLeisure: sums(dayLogs.filter((log) => log.categoryKey === "leisure" && ["음악감상", "music"].includes(str(log.details.leisureType ?? log.typeKey)))),
    writing: sums(creationLogs.filter((log) => ["글", "writing", "글쓰기"].includes(str(log.details.creationType ?? log.typeKey)))),
    drawing: sums(creationLogs.filter((log) => ["그림", "drawing", "그림그리기"].includes(str(log.details.creationType ?? log.typeKey)))),
    musicCreation: sums(creationLogs.filter((log) => ["음악", "music", "작곡"].includes(str(log.details.creationType ?? log.typeKey)))),
    stretching: sums(exerciseLogs.filter((log) => ["스트레칭", "요가", "필라테스", "stretch", "yoga"].includes(str(log.details.exerciseType ?? log.typeKey)))),
    teamSports: sums(exerciseLogs.filter((log) => ["축구", "농구", "배드민턴", "테니스", "클라이밍"].includes(str(log.details.exerciseType ?? log.typeKey)))),
    completedBooks: readingLogs.filter((log) => Boolean(log.details.completed)).length,
    readingGenres,
    reviews: studyLogs.filter((log) => log.details.method === "복습").length,
    deployments: devLogs.filter((log) => log.details.workType === "배포" && log.details.result === "완료").length,
    bugTasks: devLogs.filter((log) => log.details.workType === "버그").length,
    teaBreaks: restLogs.filter((log) => log.details.restType === "차 한잔").length,
    quickDeliveryMeals: mealLogs.filter((log) => ["간편식", "배달", "convenience", "delivery"].includes(str(log.details.form))).length,
    creationComplete: creationLogs.filter((log) => Boolean(log.details.completed)).length,
    timerRecords: dayLogs.filter((log) => log.source === "timer").length,
    distinctCategories: categoryKeys,
    totalActiveMin,
    priorDaySleepMin: priorSleep.reduce((sum, log) => sum + log.durationMin, 0),
    priorDayMoodAvg: average(priorLogs.map((log) => log.mood ?? 0).filter(Boolean)),
    priorDayLogCount: priorLogs.length,
    exerciseFollowedByRecovery,
    lastSevenWakeMinutes,
    lastSevenSleepDays,
    accountCreatedDate,
    eventRarities,
  };
}
