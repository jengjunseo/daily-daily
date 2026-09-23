export type RegionCondition =
  | { kind: "start" }
  | { kind: "category_count"; category: string; count: number }
  | { kind: "category_minutes"; category: string; minutes: number }
  | { kind: "combined_minutes"; categories: string[]; minutes: number }
  | { kind: "sleep_days"; hours: number; count: number }
  | { kind: "active_days"; count: number; category?: string };

export type RegionDefinition = { id: string; name: string; npc: string; description: string; background: string; condition: RegionCondition };

export const REGIONS: RegionDefinition[] = [
  { id: "eos", name: "새벽의 마을 에오스", npc: "모르가", description: "기록자의 첫 발걸음이 시작되는 마을", background: "dawn", condition: { kind: "start" } },
  { id: "silver-inn", name: "은빛 여관", npc: "브람", description: "따뜻한 식탁과 쉴 곳이 있는 여관", background: "inn", condition: { kind: "category_count", category: "meal", count: 5 } },
  { id: "starlit-library", name: "별빛 마법도서관", npc: "세렌", description: "책장마다 오래된 지식이 잠든 도서관", background: "library", condition: { kind: "combined_minutes", categories: ["study", "reading"], minutes: 600 } },
  { id: "knight-yard", name: "기사단 훈련장", npc: "레온하르트", description: "몸과 마음을 함께 단련하는 훈련장", background: "training", condition: { kind: "category_minutes", category: "exercise", minutes: 300 } },
  { id: "rune-forge", name: "룬 대장간", npc: "이그니스", description: "생각을 룬으로 벼리는 대장간", background: "forge", condition: { kind: "category_minutes", category: "development", minutes: 600 } },
  { id: "spirit-forest", name: "정령의 숲", npc: "피오", description: "나무와 숨결이 천천히 대답하는 숲", background: "forest", condition: { kind: "combined_minutes", categories: ["rest", "meditation"], minutes: 300 } },
  { id: "dream-lake", name: "꿈의 호수", npc: "누아", description: "충분한 잠의 별빛이 모이는 호수", background: "lake", condition: { kind: "sleep_days", hours: 7, count: 5 } },
  { id: "festival-square", name: "광장의 축제", npc: "리라", description: "사람들의 인연이 노래가 되는 광장", background: "festival", condition: { kind: "category_count", category: "relationship", count: 5 } },
  { id: "workshop-street", name: "공방 거리", npc: "코코", description: "손끝에서 태어난 작품을 전시하는 거리", background: "workshop", condition: { kind: "category_minutes", category: "creation", minutes: 300 } },
  { id: "wanderer-road", name: "방랑자의 길", npc: "타쿠", description: "새로운 풍경으로 이어지는 오래된 길", background: "road", condition: { kind: "category_count", category: "outing", count: 10 } },
  { id: "quiet-spire", name: "고요의 첨탑", npc: "엔", description: "모든 기초 지역이 이어지는 명상의 첨탑", background: "spire", condition: { kind: "category_minutes", category: "meditation", minutes: 300 } },
  { id: "sanctum-time", name: "시간의 성소", npc: "시간의 수호자", description: "백 번의 모험일이 이어지는 마지막 성소", background: "sanctum", condition: { kind: "active_days", count: 100 } },
];

