import type { ActivityLog } from "@/lib/domain";
import type { DayFeatures } from "@/lib/game/features";
import type { HeroDefinition } from "@/content/heroes";
import { seededRandom } from "@/lib/game/rng";

const introductions = [
  "모르가가 {date}의 두루마리를 조심스레 펼쳤습니다.",
  "별빛이 가라앉은 뒤, 아스테리아의 기록실에 {date}의 장이 도착했습니다.",
  "작은 발자국도 놓치지 않도록 모르가가 오늘의 일지를 읽어 내려갑니다.",
  "하루의 끝에서 모은 빛이 {date}의 기록을 밝혔습니다.",
];

const quietEndings = [
  "쉼도 여정의 일부라는 사실을 세계는 오래 기억할 것입니다.",
  "한 걸음의 크기보다 그날을 건넌 일이 더 오래 빛납니다.",
  "모르가는 두루마리를 덮고 다음 장을 위해 등불을 남겼습니다.",
  "오늘의 별빛은 사라지지 않고 당신의 연대기에 머뭅니다.",
];

function sentence<T>(items: T[], seed: string, index: number): T {
  return items[Math.floor(seededRandom(seed, index) * items.length)] as T;
}

export function buildDailyNarrative(userId: string, date: string, features: DayFeatures, hero: HeroDefinition, logs: ActivityLog[]): string[] {
  const seed = `${userId}:${date}`;
  const categoryNames: Record<string, string> = { sleep: "잠든 별자리", meal: "따뜻한 식탁", study: "마도서의 문장", development: "룬 대장간", exercise: "훈련의 길", meditation: "고요한 숨결", rest: "여관의 쉼터", reading: "도서관의 오래된 책", creation: "새로 태어난 작품", leisure: "작은 즐거움", outing: "바깥으로 난 길", relationship: "나누어 가진 마음", life: "정돈된 생활" };
  const strongest = Object.entries(features.categoryMin).sort((a, b) => b[1] - a[1])[0];
  const focus = strongest ? categoryNames[strongest[0]] ?? "하루의 발자국" : "조용한 여백";
  const opening = sentence(introductions, seed, 0).replace("{date}", date);
  const action = features.logCount > 0
    ? `${focus}에 남긴 ${features.logCount}개의 발자국이 오늘의 길을 만들었습니다.`
    : "기록이 비어 있는 하루에도, 당신이 지나온 시간은 아스테리아의 빛으로 남았습니다.";
  const rest = features.sleepMin >= 420
    ? `모르가는 ${Math.round(features.sleepMin / 60 * 10) / 10}시간의 잠에서 다음 모험을 위한 회복을 보았습니다.`
    : features.napMin > 0
      ? "짧은 쉼이 마음과 몸에 작은 숨을 돌려주었습니다."
      : features.moodAvg > 0 && features.moodAvg <= 2
        ? "구름이 머문 순간에도 당신은 오늘을 건넜고, 기록실은 그 사실을 다정하게 간직했습니다."
        : "모르가는 하루의 빈틈까지도 당신의 이야기로 읽었습니다.";
  const event = features.eventRarities.length > 0
    ? "그 사이 작은 사건 하나가 별빛을 남겨, 다음 장으로 이어졌습니다."
    : logs.length > 0 ? "평범한 순간들이 모여 누구와도 다른 하루의 모양을 만들었습니다." : "세계는 서두르지 않고 다음 만남을 기다립니다.";
  const ending = sentence(quietEndings, seed, 4);
  return [opening, action, rest, `${hero.name}의 모습은 이 하루가 가진 고유한 빛을 닮았습니다.`, event, ending];
}

