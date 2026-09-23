export type QuestStepCondition =
  | { kind: "sleep_hours"; hours: number }
  | { kind: "category_days"; category: string; days: number }
  | { kind: "mood"; minimum: number }
  | { kind: "development_solved"; count: number }
  | { kind: "category_count"; category: string; count: number }
  | { kind: "development_completed"; count: number }
  | { kind: "creation_or_reading" }
  | { kind: "distinct_subjects"; count: number }
  | { kind: "book_completed"; count: number }
  | { kind: "study_problems"; count: number }
  | { kind: "study_method"; method: string; count: number }
  | { kind: "understanding"; minimum: number }
  | { kind: "meals_in_day"; types: string[] }
  | { kind: "home_meals"; count: number }
  | { kind: "together_meal" }
  | { kind: "outing_purpose"; purpose: string }
  | { kind: "meditation" }
  | { kind: "sleep_days_window"; hours: number; days: number; within: number }
  | { kind: "rest_recovery"; value: number };

export type QuestStep = { title: string; description: string; condition: QuestStepCondition };
export type QuestChain = { id: string; name: string; npc: string; windowDays: number; rewardItem: string; rewardTitle?: string; steps: QuestStep[] };

export const QUESTS: QuestChain[] = [
  { id: "dragon-egg", name: "잠든 용의 알", npc: "피오", windowDays: 14, rewardItem: "moti-pet", rewardTitle: "용의 보호자", steps: [
    { title: "알의 발견", description: "밤잠 7시간 이상", condition: { kind: "sleep_hours", hours: 7 } },
    { title: "따뜻해진 알", description: "서로 다른 3일에 휴식 또는 명상", condition: { kind: "category_days", category: "rest-or-meditation", days: 3 } },
    { title: "작은 부화", description: "기분 4 이상인 하루", condition: { kind: "mood", minimum: 4 } },
  ] },
  { id: "code-breaker", name: "이그니스의 전설 검", npc: "이그니스", windowDays: 21, rewardItem: "code-breaker-sword", steps: [
    { title: "문제의 흔적", description: "개발 중 해결한 문제 5개", condition: { kind: "development_solved", count: 5 } },
    { title: "검을 들 힘", description: "운동 한 번", condition: { kind: "category_count", category: "exercise", count: 1 } },
    { title: "세 번의 완성", description: "개발 결과 완료 3회", condition: { kind: "development_completed", count: 3 } },
    { title: "마지막 영감", description: "창작 또는 독서 한 번", condition: { kind: "creation_or_reading" } },
  ] },
  { id: "lost-index", name: "세렌의 잃어버린 색인", npc: "세렌", windowDays: 30, rewardItem: "index-of-all", steps: [
    { title: "서가의 열쇠", description: "서로 다른 과목 3개 공부", condition: { kind: "distinct_subjects", count: 3 } },
    { title: "완독의 약속", description: "책 한 권 완독", condition: { kind: "book_completed", count: 1 } },
    { title: "문제의 지도", description: "문제풀이 50문항", condition: { kind: "study_problems", count: 50 } },
    { title: "되짚는 문장", description: "복습 기록 2회", condition: { kind: "study_method", method: "복습", count: 2 } },
    { title: "완성된 색인", description: "이해도 5 기록", condition: { kind: "understanding", minimum: 5 } },
  ] },
  { id: "secret-recipe", name: "브람의 비밀 레시피", npc: "브람", windowDays: 21, rewardItem: "innkeeper-title", rewardTitle: "여관의 단골", steps: [
    { title: "세 끼의 하루", description: "아침·점심·저녁을 모두 기록한 날", condition: { kind: "meals_in_day", types: ["아침", "점심", "저녁"] } },
    { title: "집밥의 온기", description: "집밥 세 번", condition: { kind: "home_meals", count: 3 } },
    { title: "함께 나눈 식탁", description: "누군가와 함께 식사", condition: { kind: "together_meal" } },
  ] },
  { id: "pio-seasons", name: "피오의 계절", npc: "피오", windowDays: 28, rewardItem: "eternal-spring", steps: [
    { title: "숲으로 난 길", description: "자연으로 외출", condition: { kind: "outing_purpose", purpose: "자연" } },
    { title: "숲의 숨결", description: "명상 한 번", condition: { kind: "meditation" } },
    { title: "일곱 날의 밤", description: "7일 중 5일 수면 7시간 이상", condition: { kind: "sleep_days_window", hours: 7, days: 5, within: 7 } },
    { title: "회복의 계절", description: "회복감 5의 휴식 기록", condition: { kind: "rest_recovery", value: 5 } },
  ] },
];

