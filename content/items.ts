export type ItemType = "material" | "equipment" | "relic" | "consumable" | "pet" | "title" | "skin";
export type ItemDefinition = { id: string; name: string; type: ItemType; description: string; icon: string; rarity: "common" | "rare" | "epic" | "legendary"; appearanceOnly?: boolean };
export type Recipe = { id: string; name: string; ingredients: Record<string, number>; result: string; title?: string };

export const ITEMS: ItemDefinition[] = [
  { id: "star-sand", name: "별빛 모래", type: "material", description: "하루의 끝에 남은 작은 에테르", icon: "✦", rarity: "common" },
  { id: "fairy-dust", name: "요정의 날개 가루", type: "material", description: "막힘 속에서 건네받은 다정한 힌트", icon: "✧", rarity: "common" },
  { id: "fossil-shard", name: "화석 조각", type: "material", description: "오래된 발자국의 흔적", icon: "◈", rarity: "common" },
  { id: "dream-shell", name: "꿈 조개", type: "material", description: "꿈의 호수에서 건져 올린 조개", icon: "◖", rarity: "common" },
  { id: "herb-leaf", name: "허브 잎", type: "material", description: "여관과 숲에서 말린 향기로운 잎", icon: "❧", rarity: "common" },
  { id: "map-scrap", name: "지도 조각", type: "material", description: "걸어온 길의 일부가 그려진 종이", icon: "⌖", rarity: "common" },
  { id: "seed-pod", name: "정원의 씨앗", type: "material", description: "창가 정원에서 얻은 작은 씨앗", icon: "❋", rarity: "common" },
  { id: "grimoire-shard", name: "마도서 조각", type: "material", description: "마지막 페이지의 글자가 새겨진 조각", icon: "▤", rarity: "rare" },
  { id: "ancient-manual", name: "고대 기술서", type: "relic", description: "공부와 개발의 기록이 만난 대장간 유물", icon: "⌘", rarity: "rare" },
  { id: "spring-water", name: "샘물 병", type: "material", description: "훈련 뒤 만난 회복의 샘물", icon: "◌", rarity: "rare" },
  { id: "friendship-bread", name: "우정의 빵", type: "material", description: "함께 나눈 식탁의 온기", icon: "✿", rarity: "rare" },
  { id: "order-crest", name: "기사단 문장", type: "equipment", description: "기사단의 초대를 기억하는 외형 장식", icon: "⚔", rarity: "rare", appearanceOnly: true },
  { id: "silver-string", name: "은빛 현", type: "material", description: "미완성 선율을 이어 주는 현", icon: "♬", rarity: "rare" },
  { id: "focus-crystal", name: "집중의 수정", type: "relic", description: "한동안 이어진 집중을 담은 수정", icon: "◇", rarity: "rare" },
  { id: "rune-steel", name: "룬 강철", type: "material", description: "이그니스가 알아본 완성의 흔적", icon: "⚙", rarity: "epic" },
  { id: "astral-map", name: "별빛 지도", type: "relic", description: "배운 문장과 읽은 페이지를 잇는 지도", icon: "✧", rarity: "epic" },
  { id: "heartwood-ring", name: "고목의 반지", type: "equipment", description: "숲의 고른 맥박을 담은 외형 장식", icon: "◉", rarity: "epic", appearanceOnly: true },
  { id: "prism-thread", name: "프리즘 실", type: "material", description: "서로 다른 빛을 엮는 실", icon: "✦", rarity: "epic" },
  { id: "time-key", name: "시간의 열쇠", type: "relic", description: "시간의 성소로 이어지는 문을 여는 열쇠", icon: "⌘", rarity: "legendary" },
  { id: "moti-pet", name: "아기 용 모치", type: "pet", description: "기록을 들으면 꼬리를 흔드는 작은 용", icon: "🐉", rarity: "legendary" },
  { id: "aurora-fragment", name: "오로라 조각", type: "skin", description: "홈 무대에 오로라 빛을 더하는 조각", icon: "☄", rarity: "legendary" },
  { id: "complete-grimoire", name: "완전한 마도서", type: "relic", description: "마도서 조각 다섯 개를 하나로 엮은 유물", icon: "▤", rarity: "epic" },
  { id: "complete-atlas", name: "아스테리아 도감", type: "relic", description: "별빛 지도를 완성한 세계의 기록", icon: "⌖", rarity: "epic" },
  { id: "code-breaker-sword", name: "코드 브레이커", type: "equipment", description: "이그니스의 전설 검, 외형 전용", icon: "⚔", rarity: "epic", appearanceOnly: true },
  { id: "index-of-all", name: "만물의 색인", type: "relic", description: "서렌의 잃어버린 색인을 복원한 유물", icon: "▤", rarity: "epic" },
  { id: "eternal-spring", name: "영원한 봄", type: "skin", description: "정령의 숲을 본뜬 홈 배경", icon: "❋", rarity: "epic" },
  { id: "ink-vial", name: "잉크 병", type: "material", description: "기록관의 반듯한 서재에서 찾은 잉크", icon: "▣", rarity: "common" },
  { id: "rune-dust", name: "룬 가루", type: "material", description: "시작한 손길을 기억하는 푸른 가루", icon: "✧", rarity: "common" },
  { id: "fox-feather", name: "여우 깃털", type: "material", description: "숲길을 지나간 여우가 남긴 깃털", icon: "❧", rarity: "common" },
  { id: "star-fragment", name: "별 조각", type: "relic", description: "충분히 쉰 밤의 맑은 결을 품은 조각", icon: "✦", rarity: "rare" },
  { id: "leaf-charm", name: "잎사귀 부적", type: "relic", description: "쉬어도 괜찮다는 숲의 약속", icon: "❋", rarity: "rare" },
  { id: "index-shard", name: "색인 조각", type: "material", description: "읽은 문장을 새로운 서가로 잇는 조각", icon: "▤", rarity: "rare" },
  { id: "letter-seal", name: "편지 봉인", type: "material", description: "멀리 있는 인연을 다시 잇는 봉인", icon: "✉", rarity: "rare" },
  { id: "spirit-seed", name: "정령의 씨앗", type: "material", description: "숲의 정령이 감사의 마음으로 건넨 씨앗", icon: "❋", rarity: "rare" },
  { id: "rainbow-spice", name: "무지개 향신료", type: "material", description: "기분 좋은 식탁에 더해진 다채로운 향", icon: "✿", rarity: "rare" },
  { id: "asteria-map", name: "아스테리아 지도", type: "relic", description: "새로운 지역을 잇는 대륙의 지도", icon: "⌖", rarity: "epic" },
  { id: "manual-fragment", name: "비전서 조각", type: "material", description: "나만의 수련이 기록된 비전서의 일부", icon: "▤", rarity: "common" },
  { id: "personal-manual", name: "개인 비전서", type: "relic", description: "직접 지은 행동의 이름을 보존하는 책", icon: "▤", rarity: "rare" },
  { id: "innkeeper-title", name: "여관의 단골", type: "title", description: "따뜻한 식탁을 함께 나눈 모험가의 칭호", icon: "⚑", rarity: "rare" },
];

export const RECIPES: Recipe[] = [
  { id: "combine-grimoire", name: "완전한 마도서 조합", ingredients: { "grimoire-shard": 5 }, result: "complete-grimoire", title: "마도서 수집가" },
  { id: "combine-atlas", name: "별빛 지도 완성", ingredients: { "map-scrap": 5 }, result: "complete-atlas" },
];

export const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
