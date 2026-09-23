export type AchievementCondition =
  | { kind: "log_count"; value: number }
  | { kind: "category_count"; category: string; value: number }
  | { kind: "active_days"; value: number }
  | { kind: "all_categories" }
  | { kind: "hero_count"; heroNo?: number; value: number }
  | { kind: "hero_rarity"; rarity: "legendary" | "epic" | "rare" | "uncommon" | "common" | "basic" }
  | { kind: "any_event" }
  | { kind: "completed_chain" }
  | { kind: "all_regions" }
  | { kind: "balanced_sleep_meals"; days: number }
  | { kind: "rest_day"; restMin: number; mood: number }
  | { kind: "late_night_reading"; minSleep: number }
  | { kind: "home_soup_day" }
  | { kind: "return_after_gap"; days: number }
  | { kind: "same_day_groups"; count: number }
  | { kind: "different_category_days"; count: number }
  | { kind: "custom_count"; value: number }
  | { kind: "item_count"; item: string; value: number }
  | { kind: "all_traits_level"; value: number };
  

export type AchievementDefinition = { id: string; name: string; description: string; secret: boolean; rewardXp: number; condition: AchievementCondition };

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "first-page", name: "첫 장을 펼치다", description: "첫 기록을 남겼다", secret: false, rewardXp: 20, condition: { kind: "log_count", value: 1 } },
  { id: "rest-first", name: "숨 고르기", description: "처음으로 휴식을 기록했다", secret: false, rewardXp: 20, condition: { kind: "category_count", category: "rest", value: 1 } },
  { id: "sleep-first", name: "별 아래 잠들다", description: "처음으로 밤잠을 기록했다", secret: false, rewardXp: 20, condition: { kind: "category_count", category: "sleep", value: 1 } },
  { id: "table-first", name: "따뜻한 식탁", description: "처음으로 식사를 기록했다", secret: false, rewardXp: 20, condition: { kind: "category_count", category: "meal", value: 1 } },
  { id: "study-first", name: "새 문장의 시작", description: "처음으로 공부를 기록했다", secret: false, rewardXp: 20, condition: { kind: "category_count", category: "study", value: 1 } },
  { id: "adventure-3", name: "세 번의 모험", description: "세 날에 걸쳐 기록을 남겼다", secret: false, rewardXp: 30, condition: { kind: "active_days", value: 3 } },
  { id: "adventure-7", name: "일주일의 연대기", description: "일곱 날에 걸쳐 기록을 남겼다", secret: false, rewardXp: 50, condition: { kind: "active_days", value: 7 } },
  { id: "all-orbs", name: "모든 공과 인사", description: "시스템 카테고리를 모두 한 번씩 기록했다", secret: false, rewardXp: 100, condition: { kind: "all_categories" } },
  { id: "hundred-pages", name: "백 번째 페이지", description: "누적 기록 100개", secret: false, rewardXp: 100, condition: { kind: "log_count", value: 100 } },
  { id: "thousand-pages", name: "천 장의 이야기", description: "누적 기록 1000개", secret: false, rewardXp: 300, condition: { kind: "log_count", value: 1000 } },
  { id: "first-custom", name: "나만의 구슬", description: "커스텀 행동을 한 번 기록했다", secret: false, rewardXp: 25, condition: { kind: "custom_count", value: 1 } },
  { id: "custom-ten", name: "비전서의 첫 장", description: "커스텀 행동 기록 10개", secret: false, rewardXp: 60, condition: { kind: "custom_count", value: 10 } },
  { id: "hero-ten", name: "열 가지 얼굴", description: "용사 유형 열 가지를 발견했다", secret: false, rewardXp: 80, condition: { kind: "hero_count", value: 10 } },
  { id: "hero-fifty", name: "별무리 수집가", description: "용사 유형 쉰 가지를 발견했다", secret: false, rewardXp: 200, condition: { kind: "hero_count", value: 50 } },
  { id: "first-legend", name: "전설의 목격자", description: "전설 용사 유형을 발견했다", secret: false, rewardXp: 100, condition: { kind: "hero_rarity", rarity: "legendary" } },
  { id: "five-groups", name: "넓은 마음", description: "하루에 다섯 판정 그룹에 발자국을 남겼다", secret: false, rewardXp: 50, condition: { kind: "same_day_groups", count: 5 } },
  { id: "three-category-days", name: "하루의 여러 결", description: "한 날에 세 카테고리를 기록했다", secret: false, rewardXp: 30, condition: { kind: "different_category_days", count: 3 } },
  { id: "first-event", name: "작은 기적", description: "첫 이벤트를 만났다", secret: false, rewardXp: 25, condition: { kind: "any_event" } },
  { id: "first-quest", name: "약속의 첫 단계", description: "연속 퀘스트를 완료했다", secret: false, rewardXp: 80, condition: { kind: "completed_chain" } },
  { id: "all-regions", name: "아스테리아 순례자", description: "열두 지역을 모두 열었다", secret: false, rewardXp: 250, condition: { kind: "all_regions" } },
  { id: "ordinary-beauty", name: "평범함의 미학", description: "7일 연속 수면 7–9시간과 세 끼를 기록했다", secret: true, rewardXp: 120, condition: { kind: "balanced_sleep_meals", days: 7 } },
  { id: "rest-courage", name: "아무것도 하지 않을 용기", description: "휴식 180분, 생산 활동 없이 기분 4 이상인 날", secret: true, rewardXp: 80, condition: { kind: "rest_day", restMin: 180, mood: 4 } },
  { id: "two-am-philosopher", name: "새벽 두 시의 철학자", description: "00–04시 독서 또는 명상, 수면 6시간 이상", secret: true, rewardXp: 60, condition: { kind: "late_night_reading", minSleep: 360 } },
  { id: "rainy-soup", name: "비 오는 날의 수프", description: "집밥과 휴식, 기분 상승이 함께한 날", secret: true, rewardXp: 50, condition: { kind: "home_soup_day" } },
  { id: "returning-adventurer", name: "다시 돌아온 모험가", description: "14일 이상 쉬었다가 돌아왔다", secret: true, rewardXp: 70, condition: { kind: "return_after_gap", days: 14 } },
  { id: "sleepy-sage-ten", name: "잠꾸러기의 전설", description: "잠꾸러기 현자를 10회 만났다", secret: true, rewardXp: 100, condition: { kind: "hero_count", heroNo: 21, value: 10 } },
  { id: "five-rest-days", name: "쉼의 기술", description: "서로 다른 날 다섯 번 휴식을 기록했다", secret: true, rewardXp: 60, condition: { kind: "category_count", category: "rest-days:5", value: 5 } },
  { id: "night-walk", name: "별 아래의 산책", description: "서로 다른 날 세 번 외출을 기록했다", secret: true, rewardXp: 40, condition: { kind: "category_count", category: "outing-days:3", value: 3 } },
  { id: "first-artifact", name: "첫 번째 유물", description: "아이템을 처음 획득했다", secret: false, rewardXp: 25, condition: { kind: "item_count", item: "*", value: 1 } },
  { id: "five-fragments", name: "조각의 의미", description: "별빛 모래 다섯 개를 모았다", secret: true, rewardXp: 40, condition: { kind: "item_count", item: "star-sand", value: 5 } },
  { id: "all-six-traits", name: "여섯 빛의 조화", description: "여섯 특성을 모두 레벨 5로 키웠다", secret: false, rewardXp: 120, condition: { kind: "all_traits_level", value: 5 } },
  { id: "early-reader", name: "여명의 독자", description: "아침 6시 전에 독서를 기록했다", secret: true, rewardXp: 30, condition: { kind: "category_count", category: "early-reading", value: 1 } },
  { id: "meal-together", name: "함께한 한 끼", description: "누군가와 식사한 날을 세 번 만들었다", secret: true, rewardXp: 40, condition: { kind: "category_count", category: "together-meals:3", value: 3 } },
  { id: "calm-week", name: "고요의 주간", description: "일곱 날에 걸쳐 명상했다", secret: true, rewardXp: 70, condition: { kind: "category_count", category: "meditation-days:7", value: 7 } },
  { id: "creator-five", name: "손끝의 별자리", description: "창작을 기록한 날 다섯 번", secret: true, rewardXp: 50, condition: { kind: "category_count", category: "creation-days:5", value: 5 } },
  { id: "quiet-return", name: "천천히 다시", description: "공백 뒤에 기록을 다시 시작했다", secret: true, rewardXp: 35, condition: { kind: "return_after_gap", days: 7 } },
];
