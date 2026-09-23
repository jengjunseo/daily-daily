export type Trait = "knowledge" | "strength" | "creativity" | "recovery" | "bond" | "calm";

export type Group =
  | "knowledge"
  | "body"
  | "craft"
  | "mind"
  | "recovery"
  | "life"
  | "social"
  | "leisure"
  | "explore";

export type CategoryDefinition = {
  key: string;
  name: string;
  icon: string;
  color: string;
  group: Group;
  primary: Trait;
  secondary: Trait;
  types: string[];
  isCustom?: boolean;
  tag?: string;
};

export const TRAITS: Trait[] = ["knowledge", "strength", "creativity", "recovery", "bond", "calm"];

export const TRAIT_NAMES: Record<Trait, string> = {
  knowledge: "지식",
  strength: "체력",
  creativity: "창의",
  recovery: "회복",
  bond: "유대",
  calm: "평정",
};

export const CATEGORIES: CategoryDefinition[] = [
  { key: "sleep", name: "수면", icon: "☾", color: "#7e8bd4", group: "recovery", primary: "recovery", secondary: "calm", types: ["밤잠", "낮잠", "쪽잠", "선잠·밤샘 후"] },
  { key: "meal", name: "식사", icon: "✦", color: "#d99b59", group: "life", primary: "recovery", secondary: "bond", types: ["아침", "점심", "저녁", "간식", "야식"] },
  { key: "study", name: "공부", icon: "⌘", color: "#70b9b2", group: "knowledge", primary: "knowledge", secondary: "calm", types: ["수학", "영어", "강의", "독학", "문제풀이", "암기", "복습", "스터디"] },
  { key: "development", name: "개발", icon: "⚙", color: "#b18bc9", group: "craft", primary: "creativity", secondary: "knowledge", types: ["기능", "버그", "리팩터", "설계", "리뷰", "배포", "학습"] },
  { key: "exercise", name: "운동", icon: "⚔", color: "#d67d72", group: "body", primary: "strength", secondary: "calm", types: ["근력", "걷기", "달리기", "자전거", "수영", "등산", "스트레칭", "요가", "필라테스", "축구", "농구", "배드민턴", "테니스", "클라이밍"] },
  { key: "meditation", name: "명상", icon: "❋", color: "#7ebbb4", group: "mind", primary: "calm", secondary: "recovery", types: ["호흡", "바디스캔", "걷기명상", "기도"] },
  { key: "rest", name: "휴식", icon: "❧", color: "#82a97d", group: "recovery", primary: "recovery", secondary: "calm", types: ["멍", "산책", "차 한잔", "음악", "낮잠 아님 휴식"] },
  { key: "reading", name: "독서", icon: "▤", color: "#b99a6d", group: "knowledge", primary: "knowledge", secondary: "creativity", types: ["읽기", "완독"] },
  { key: "creation", name: "창작", icon: "✎", color: "#ce8eaa", group: "craft", primary: "creativity", secondary: "calm", types: ["글", "그림", "음악", "영상", "공예"] },
  { key: "leisure", name: "여가", icon: "◇", color: "#d2bc69", group: "leisure", primary: "creativity", secondary: "recovery", types: ["게임", "영상", "음악감상", "취미"] },
  { key: "outing", name: "외출", icon: "⌖", color: "#91b87e", group: "explore", primary: "strength", secondary: "creativity", types: ["산책", "쇼핑", "여행", "카페", "자연"] },
  { key: "relationship", name: "인연", icon: "♡", color: "#d5ae55", group: "social", primary: "bond", secondary: "recovery", types: ["가족", "친구", "연인", "동료", "반려동물"] },
  { key: "life", name: "생활", icon: "⌂", color: "#aaa9a2", group: "life", primary: "calm", secondary: "strength", types: ["집안일", "위생", "정리", "장보기"] },
];

export type ActivityLog = {
  id: string;
  categoryKey: string;
  typeKey: string;
  status: "in_progress" | "completed";
  startedAt: string;
  endedAt: string | null;
  durationMin: number;
  attributedDate: string;
  mood: number | null;
  details: Record<string, unknown>;
  note: string;
  source: "quick" | "detailed" | "timer";
  version: number;
  deletedAt: string | null;
  customTraits?: Partial<Record<Trait, number>>;
  customTag?: string;
};

export type TraitProgress = { xp: number; level: number };
export type RewardLedgerEntry = { sourceType: string; sourceKey: string; xp: Partial<Record<Trait, number>>; items: Record<string, number>; createdAt: string };
export type Settlement = { date: string; revision: number; status: "final" | "superseded"; heroNo: number; features: Record<string, unknown>; reasons: string[]; narrative: string[]; inputHash: string; seen: boolean; createdAt: string };
export type EventOccurrence = { id: string; date: string; rarity: "common" | "rare" | "epic" | "legendary"; kind: "chance" | "combo" | "streak" | "chain_step" | "milestone"; title: string; body: string; npcLine: string; rewards: string; seen: boolean; effectsSuppressed: boolean; triggerLogId?: string };
export type Favorite = { kind: "subject" | "project" | "book" | "menu" | "activity_type"; value: string; useCount: number; lastUsedAt: string };
export type AppSettings = { bgmEnabled: boolean; bgmVolume: number; sfxEnabled: boolean; sfxVolume: number; skipTitle: boolean; reducedEffects: boolean; timezone: string; eventEffects: boolean };
export type UserProfile = { id: string; displayName: string; timezone: string; avatarId: number; titleId: string; createdAt: string };

export type AppState = {
  schemaVersion: 1;
  profile: UserProfile;
  settings: AppSettings;
  logs: ActivityLog[];
  settlements: Settlement[];
  collection: Record<number, { firstDate: string; count: number; dates: string[] }>;
  events: EventOccurrence[];
  rewardLedger: RewardLedgerEntry[];
  inventory: Record<string, number>;
  achievements: Record<string, string>;
  quests: Record<string, { step: number; state: "active" | "done" | "expired"; startedDate: string; updatedAt: string; data: Record<string, unknown> }>;
  regions: string[];
  favorites: Favorite[];
  pins: string[];
  customCategories: CategoryDefinition[];
  traits: Record<Trait, TraitProgress>;
  dailyOrdinals: Record<string, number>;
  eventSeeds: Record<string, number>;
  eventOutcomes: Record<string, string[]>;
  dismissedSettlementDates: string[];
  xpAwardsByDate: Record<string, Partial<Record<Trait, number>>>;
};

export function getCategory(key: string, custom: CategoryDefinition[] = []): CategoryDefinition | undefined {
  return CATEGORIES.find((category) => category.key === key) ?? custom.find((category) => category.key === key);
}
