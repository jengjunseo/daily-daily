import type { Trait } from "@/lib/domain";
import type { RuleExpr } from "@/lib/game/rules-dsl";

export type EventRarity = "common" | "rare" | "epic" | "legendary";
export type EventKind = "chance" | "combo" | "streak" | "chain_step" | "milestone";
export type EventDefinition = {
  id: string;
  rarity: EventRarity;
  kind: EventKind;
  category: string;
  trigger: RuleExpr;
  weight: number;
  cooldownDays: number;
  title: string;
  body: [string, string];
  npc: string;
  rewards: { xp?: Partial<Record<Trait, number>>; items?: Record<string, number>; title?: string; startsChain?: string };
};

const all = (...rules: RuleExpr[]): RuleExpr => ({ all: rules });
const some = (...rules: RuleExpr[]): RuleExpr => ({ any: rules });
const cat = (category: string): RuleExpr => ({ cat: category });
const min = (duration: number): RuleExpr => ({ durationMin: { gte: duration } });
const field = (key: string, value: string | number): RuleExpr => ({ field: key, op: typeof value === "number" ? "gte" : "eq", value });
const event = (id: string, rarity: EventRarity, kind: EventKind, category: string, title: string, body: [string, string], npc: string, xp: Partial<Record<Trait, number>>, item?: string, trigger: RuleExpr = all(cat(category), min(10)), cooldownDays = 3): EventDefinition => ({
  id, rarity, kind, category, title, body, npc, weight: 1, cooldownDays, trigger,
  rewards: { xp, ...(item ? { items: { [item]: 1 } } : {}) },
});

export const EVENTS: EventDefinition[] = [
  event("evt_ink_note", "common", "chance", "study", "잉크 번진 쪽지", ["책 사이에서 이전 모험가의 응원 쪽지를 발견했습니다.", "낡은 쪽지에는 포기하지 않은 날들이 적혀 있었습니다."], "세렌: 이 응원은 오늘 당신에게 건네는 것 같네요.", { knowledge: 10 }, "star-sand", all(cat("study"), min(30))),
  event("evt_warm_soup", "common", "chance", "meal", "여관의 따뜻한 수프", ["브람이 오늘의 식탁에 따뜻한 수프를 더했습니다.", "김이 오른 그릇에 여관의 작은 환대가 담겼습니다."], "브람: 오늘은 서비스야. 천천히 먹어.", { recovery: 8 }, undefined, all(cat("meal"), field("details.amount", "든든히"))),
  event("evt_bugb_fairy", "common", "chance", "development", "이상한 버그 요정", ["막힌 코드 사이에서 장난꾸러기 요정이 튀어나왔습니다.", "요정은 답을 알려주는 대신, 잠깐 쉬어도 괜찮다고 속삭였습니다."], "이그니스: 오늘 여기까지도 충분히 잘했네.", { creativity: 10 }, "fairy-dust", all(cat("development"), field("details.result", "막힘"))),
  event("evt_footprint_fossil", "common", "chance", "exercise", "발자국 화석", ["산책길 돌 틈에서 오래된 짐승의 발자국이 모습을 드러냈습니다.", "작은 화석은 이 길에도 먼 옛날의 여행자가 있었다고 전했습니다."], "레온하르트: 길은 언제나 이야기를 품고 있지.", { strength: 10 }, "fossil-shard", all(cat("exercise"), field("typeKey", "걷기"))),
  event("evt_dream_tortoise", "common", "chance", "sleep", "꿈속의 거북", ["꿈의 호수에서 누아가 등을 내어주었습니다.", "고요한 물결 위를 천천히 건너며 별자리를 바라보았습니다."], "피오: 푹 쉰 마음에는 좋은 꿈이 찾아와.", { recovery: 10 }, "dream-shell", all(cat("sleep"), min(420))),
  event("evt_spirit_breath", "common", "chance", "meditation", "정령의 숨결", ["고요한 숨결을 따라 작은 정령들이 모여들었습니다.", "정령들은 당신의 어깨에 잠깐 앉았다가 숲으로 돌아갔습니다."], "피오: 오늘의 숨도 소중히 남겨둘게요.", { calm: 10 }, undefined, all(cat("meditation"), min(10))),
  event("evt_doodle_magic", "common", "chance", "creation", "낙서의 마법", ["스케치가 종이 위에서 살짝 몸을 움직였습니다.", "그 작은 움직임은 아직 끝나지 않은 가능성처럼 빛났습니다."], "세렌: 첫 선이 이미 마법을 시작했어요.", { creativity: 10 }, undefined, all(cat("creation"), min(15))),
  event("evt_lazy_cat", "common", "chance", "rest", "게으른 오후의 고양이", ["햇볕 드는 창가에 고양이 한 마리가 자리를 잡았습니다.", "고양이는 아무 말 없이 곁을 지키며 오후를 느리게 만들었습니다."], "브람: 고양이도 쉬는 법을 잘 알지.", { recovery: 10 }, undefined, all(cat("rest"), min(30))),
  event("evt_lost_vendor", "common", "chance", "outing", "길 잃은 상인", ["갈림길에서 타쿠가 작은 수레를 정리하고 있었습니다.", "수레 안에는 별빛 모래 한 줌이 여행의 기념으로 들어 있었습니다."], "타쿠: 여기서 만난 것도 인연이지.", { creativity: 5 }, "star-sand", all(cat("outing"), min(30))),
  event("evt_shared_story", "common", "chance", "relationship", "함께 웃은 이야기", ["함께 나눈 웃음이 광장의 등불 하나를 밝혔습니다.", "누군가의 목소리는 먼 길에서도 따뜻한 표식이 됩니다."], "리라: 좋은 이야기는 나누면 오래 남아요.", { bond: 10 }, undefined, all(cat("relationship"), min(10))),
  event("evt_orderly_room", "common", "chance", "life", "반듯해진 서재", ["정리된 공간 사이에서 잃어버렸던 작은 메모를 찾았습니다.", "메모에는 내일의 일을 서두르지 않아도 된다고 적혀 있었습니다."], "모르가: 질서도 마음을 쉴 자리를 만들어 주지요.", { calm: 10 }, "ink-vial", all(cat("life"), min(10))),
  event("evt_page_turn", "common", "chance", "reading", "바람이 넘긴 페이지", ["책장이 저절로 넘어가며 오래된 별 지도를 드러냈습니다.", "지도에는 아직 가보지 않은 길이 조용히 그려져 있었습니다."], "세렌: 다음 장은 언제든 다시 펼칠 수 있어요.", { knowledge: 10 }, "map-scrap", all(cat("reading"), min(10))),
  event("evt_evening_lantern", "common", "chance", "outing", "저녁길의 등불", ["돌아오는 길목에 작은 등불이 하나 켜졌습니다.", "등불은 어디에서 왔는지보다 돌아갈 자리가 있다는 사실을 알려주었습니다."], "브람: 길을 마친 뒤엔 따뜻한 방이 있지.", { recovery: 8 }, undefined, all(cat("outing"), min(10))),
  event("evt_cloud_window", "common", "chance", "leisure", "구름 창문", ["창밖 구름이 잠시 거대한 배의 모양을 만들었습니다.", "그 배는 아무 데도 서두르지 않고 하늘을 건넜습니다."], "피오: 잠깐 바라보는 시간도 괜찮아.", { calm: 8 }, undefined, all(cat("leisure"), min(10))),
  event("evt_tea_steam", "common", "chance", "rest", "찻잔의 별자리", ["찻잔 위로 오른 김이 작은 별자리 모양을 만들었습니다.", "별자리는 다음 휴식도 기꺼이 기다린다고 말했습니다."], "브람: 차가 식기 전에 한 모금 하게.", { recovery: 8 }, "herb-leaf", all(cat("rest"), field("details.restType", "차 한잔"))),
  event("evt_breakfast_bell", "common", "chance", "meal", "아침 종소리", ["은빛 여관의 종이 부드럽게 울렸습니다.", "누군가의 하루가 시작되는 소리에 주방도 깨어났습니다."], "브람: 아침은 네 속도에 맞춰 먹으면 돼.", { recovery: 8 }, undefined, all(cat("meal"), field("details.mealType", "아침"))),
  event("evt_first_spark", "common", "chance", "development", "첫 번째 룬", ["화면 구석에서 작고 푸른 룬이 깜박였습니다.", "룬은 완성된 답보다 시작한 손길을 기억했습니다."], "이그니스: 시작한 흔적도 대장간에 남겨 두지.", { creativity: 8 }, "rune-dust", all(cat("development"), min(10))),
  event("evt_warmup_fox", "common", "chance", "exercise", "숲길의 여우", ["숲길에서 여우가 앞서 달리다가 뒤돌아보았습니다.", "여우는 길을 조금 걷고 다시 숲으로 사라졌습니다."], "레온하르트: 몸이 움직인 만큼 숲도 응답했군.", { strength: 8 }, "fox-feather", all(cat("exercise"), min(10))),
  event("evt_window_garden", "common", "chance", "life", "창가의 작은 정원", ["창가에 둔 화분에서 새잎 하나가 올라왔습니다.", "새잎은 조용한 돌봄이 쌓이고 있다고 알려주었습니다."], "모르가: 작아도 자라나는 것은 분명하답니다.", { calm: 8 }, "seed-pod", all(cat("life"), min(10))),
  event("evt_star_glint", "common", "chance", "sleep", "이불 끝의 별", ["잠자리 곁에 작은 별빛 조각이 내려앉았습니다.", "별은 오늘의 끝을 다정하게 닫아주었습니다."], "피오: 오늘은 여기까지, 잘 쉬어요.", { recovery: 8 }, "star-sand", all(cat("sleep"), min(60))),

  event("evt_grimoire_last_page", "rare", "chance", "study", "마도서의 마지막 페이지", ["풀리지 않던 식을 완성하자 마도서가 스스로 펼쳐졌습니다.", "마지막 장에는 공식보다 오래 버틴 마음에 대한 문장이 적혀 있었습니다."], "세렌: 깨달은 건 공식이 아니라 포기하지 않는 법이에요.", { knowledge: 30 }, "grimoire-shard", all(cat("study"), some(field("details.subject", "수학"), field("details.method", "문제풀이")), min(60), field("details.understanding", 4)), 7),
  event("evt_ancient_tech", "rare", "combo", "development", "고대 기술서", ["룬 대장간 지하에서 먼지 쌓인 기술서가 빛났습니다.", "책 속 도면은 오늘의 기록을 이어 새로운 길을 그렸습니다."], "이그니스: 서로 다른 지식이 만났을 때 새 기술이 태어나네.", { creativity: 25 }, "ancient-manual", all(cat("development"), { dayHas: "reading" }), 10),
  event("evt_recovery_spring", "rare", "combo", "rest", "회복의 샘", ["훈련 뒤 쉬던 숲에서 푸른 샘이 솟아났습니다.", "샘물은 오늘 몸을 돌본 기록을 투명한 빛으로 비췄습니다."], "피오: 회복도 네가 걸어온 길의 일부야.", { recovery: 25 }, "spring-water", all(cat("rest"), { dayHas: "exercise" }), 7),
  event("evt_shared_bread", "rare", "combo", "meal", "함께 나눈 빵", ["나눈 빵 조각 하나가 황금빛으로 물들었습니다.", "빵은 혼자 먹을 때와 다른 온기를 기억하고 있었습니다."], "브람: 나누어 먹은 마음까지 오늘의 식탁에 남았어.", { bond: 20 }, "friendship-bread", all(cat("meal"), { dayHas: "relationship" }), 7),
  event("evt_knights_invitation", "rare", "streak", "exercise", "기사단의 초대장", ["레온하르트의 봉인된 초대장이 우편함에 도착했습니다.", "초대장은 기록의 횟수보다 다시 돌아온 발걸음을 반겼습니다."], "레온하르트: 문은 열려 있다. 네 속도로 와라.", { strength: 30 }, "order-crest", all(cat("exercise"), { streakDays: { within: 7, atLeast: 3, category: "exercise" } }), 14),
  event("evt_star_fragment", "rare", "chance", "sleep", "별이 떨어진 밤", ["잠든 사이 창가에 별 조각 하나가 내려왔습니다.", "별 조각은 충분히 쉰 밤의 맑은 결을 품고 있었습니다."], "피오: 잘 쉰 밤은 아침을 더 부드럽게 해.", { recovery: 30 }, "star-fragment", all(cat("sleep"), min(480), field("details.satisfaction", 5)), 7),
  event("evt_rest_gift", "rare", "chance", "rest", "아무 일도 없던 날의 선물", ["피오가 푸른 잎사귀 부적을 두 손으로 건넸습니다.", "부적에는 쉬어도 괜찮다는 숲의 약속이 새겨져 있습니다."], "피오: 쉬는 것도 모험이야.", { recovery: 25 }, "leaf-charm", all(cat("rest"), min(120), { not: { dayHas: "development" } }), 7),
  event("evt_unfinished_symphony", "rare", "streak", "creation", "미완성 교향곡", ["여러 날의 음표가 모여 작은 선율이 되었습니다.", "아직 끝나지 않은 곡도 오늘은 충분히 아름답게 울렸습니다."], "리라: 다음 음은 나중에 이어도 좋아요.", { creativity: 30 }, "silver-string", all(cat("creation"), field("details.creationType", "음악"), { streakDays: { within: 14, atLeast: 3, category: "creation" } }), 14),
  event("evt_lantern_library", "rare", "chance", "reading", "도서관의 숨겨둔 색인", ["책장 사이에서 잃어버린 색인 조각이 빛났습니다.", "색인은 오늘 읽은 문장을 새로운 서가로 안내했습니다."], "세렌: 지식은 페이지 사이에서 서로 만난답니다.", { knowledge: 25 }, "index-shard", all(cat("reading"), min(45)), 7),
  event("evt_distant_friend", "rare", "chance", "relationship", "먼 길의 편지", ["오래 연락하지 못했던 친구에게 편지가 도착했습니다.", "짧은 문장 안에 서로의 안부가 따뜻하게 담겨 있었습니다."], "리라: 인연은 멀리 있어도 다시 이어져요.", { bond: 25 }, "letter-seal", all(cat("relationship"), min(20)), 10),
  event("evt_nature_spirit", "rare", "combo", "outing", "숲의 작은 정령", ["자연 속에서 정령 하나가 발자국을 따라왔습니다.", "정령은 잠시 머물다 감사의 씨앗을 건네고 숲으로 돌아갔습니다."], "피오: 숲을 바라본 마음을 정령들이 기억했어.", { calm: 20 }, "spirit-seed", all(cat("outing"), field("details.purpose", "자연"), { any: [{ dayHas: "meditation" }, { dayHas: "rest" }] }), 7),
  event("evt_home_feast", "rare", "chance", "meal", "무지개 식탁", ["서로 다른 그릇들이 식탁 위에 고운 빛을 만들었습니다.", "브람은 과하지 않은 한 끼의 즐거움을 오래된 조리책에 적었습니다."], "브람: 기분 좋은 식탁이 오늘의 별을 밝혔군.", { recovery: 20, bond: 10 }, "rainbow-spice", all(cat("meal"), min(10)), 7),
  event("evt_bug_solved", "rare", "chance", "development", "버그 사냥꾼의 단서", ["작은 버그 요정이 숨겨둔 단서를 남기고 달아났습니다.", "단서는 해결의 마지막 걸음을 조용히 비추었습니다."], "이그니스: 문제를 발견한 눈도 실력이지.", { creativity: 25 }, "rune-steel", all(cat("development"), field("details.workType", "버그")), 7),
  event("evt_new_road", "rare", "chance", "outing", "지도에 생긴 새 길", ["지나온 길이 지도에 새로운 선 하나를 그었습니다.", "선은 다음 산책이 어디로 이어질지 궁금하게 만들었습니다."], "타쿠: 지도는 걸은 만큼 넓어지거든.", { strength: 15, creativity: 10 }, "map-scrap", all(cat("outing"), min(60)), 7),
  event("evt_focus_crystal", "rare", "chance", "study", "집중의 수정", ["마도서 가장자리에서 투명한 수정이 굴러 나왔습니다.", "수정 안에는 한동안 이어진 집중의 빛이 고여 있었습니다."], "세렌: 노력보다 몰입의 순간을 오래 간직해요.", { knowledge: 25 }, "focus-crystal", all(cat("study"), min(60)), 7),

  event("evt_blacksmith_applause", "epic", "chance", "development", "대장장이의 인정", ["이그니스가 망치를 내려놓고 처음으로 박수를 보냈습니다.", "완성된 룬이 대장간 천장까지 번져 밤하늘을 밝혔습니다."], "이그니스: 오늘의 성취는 네 이름으로 새겨두지.", { creativity: 60 }, "rune-steel", all(cat("development"), field("details.solvedProblems", 3), field("details.result", "완료")), 14),
  event("evt_order_of_stars", "epic", "combo", "study", "별빛 도서관의 수호자", ["도서관의 가장 높은 서가가 당신 앞에 열렸습니다.", "서가 위의 별지도는 배운 것들을 하나의 여정으로 잇고 있었습니다."], "세렌: 네가 쌓은 문장들이 길이 되었어요.", { knowledge: 35, calm: 15 }, "astral-map", all(cat("study"), { dayHas: "reading" }, min(60)), 14),
  event("evt_heartwood", "epic", "combo", "meditation", "고목의 맥박", ["숲 한가운데 오래된 나무가 천천히 빛을 내기 시작했습니다.", "나무의 고른 맥박이 숲 전체에 평온을 건넸습니다."], "피오: 네가 멈춰 귀 기울인 순간, 숲도 대답했어.", { calm: 40 }, "heartwood-ring", all(cat("meditation"), min(45), { dayHas: "outing" }), 21),
  event("evt_wayfarer_map", "epic", "milestone", "outing", "아스테리아의 새 지도", ["기록관 벽에 대륙 지도의 한 부분이 복원되었습니다.", "아직 가보지 않은 지역이 별빛 선으로 이어졌습니다."], "모르가: 당신의 길이 세계의 지도를 다시 씁니다.", { creativity: 25, knowledge: 25 }, "asteria-map", all(cat("outing"), min(120)), 21),
  event("evt_three_colors", "epic", "combo", "creation", "세 가지 빛의 작품", ["서로 다른 세 분야의 기운이 하나의 작품을 감쌌습니다.", "작품은 완성 여부와 상관없이 고유한 색으로 빛났습니다."], "리라: 네 마음에서 나온 빛은 하나뿐인 색이야.", { creativity: 45, calm: 15 }, "prism-thread", all(cat("creation"), { dayHas: "study" }, { dayHas: "relationship" }), 21),

  event("evt_time_fissure", "legendary", "milestone", "meditation", "시간의 틈", ["고요 속에서 시간의 성소로 이어지는 틈이 열렸습니다.", "별빛의 흐름이 오늘의 쉼과 오랜 여정을 한 줄로 이었습니다."], "엔: 오래 쌓인 평온이 새로운 문을 열었구나.", { calm: 100 }, "time-key", all(cat("meditation"), min(30), { any: [{ dayHas: "rest" }, { dayHas: "sleep" }] }, { streakDays: { within: 30, atLeast: 20, category: "__active__" } }), 30),
  event("evt_dragon_wakes", "legendary", "chain_step", "sleep", "잠든 용의 눈 뜸", ["알껍질에 금빛 금이 가고 모치가 세상을 바라보았습니다.", "작은 용은 당신의 여정에 함께하겠다는 듯 꼬리를 흔들었습니다."], "피오: 기다려 준 마음이 새로운 생명을 맞이했어.", { recovery: 60, bond: 40 }, "moti-pet", all(cat("sleep"), min(420), { tag: "dragon:complete" }), 60),
  event("evt_aurora_guide", "legendary", "milestone", "rest", "오로라의 안내자", ["심야 하늘에 오로라가 나타나 다음 지역으로 가는 길을 밝혔습니다.", "빛은 서두르지 않는 걸음도 대륙을 건너게 한다고 말했습니다."], "모르가: 당신의 별빛이 길을 다시 이어주었습니다.", { recovery: 50, calm: 50 }, "aurora-fragment", all(cat("rest"), min(60), { dayHas: "sleep" }), 30),

  event("evt_custom_training", "common", "chance", "custom", "{name}의 수련서", ["당신만의 {name} 수련이 아스테리아에 새로운 기술로 기록되었습니다.", "수련서는 다른 누구도 대신 쓸 수 없는 이름을 품었습니다."], "이그니스: 네 방식 그대로 비전서에 새겨두겠네.", { creativity: 10 }, "manual-fragment", all({ tag: "custom" }, min(20)), 7),
  event("evt_custom_rare", "rare", "combo", "custom", "이름을 새긴 비전서", ["{name}의 기록 위로 은빛 글자가 새겨졌습니다.", "비전서는 당신이 직접 지은 행동의 이름을 오래 보존합니다."], "모르가: 당신의 이름으로 된 기술은 특별하지요.", { recovery: 15, calm: 10 }, "personal-manual", all({ tag: "custom" }, min(60)), 30),
];

export function validateEventContent(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of EVENTS) {
    if (ids.has(item.id)) errors.push(`duplicate event id: ${item.id}`);
    ids.add(item.id);
    if (item.body.length < 2) errors.push(`event needs two body variants: ${item.id}`);
    for (const text of [...item.body, item.title, item.npc]) {
      for (const variable of text.matchAll(/\{([^}]+)\}/g)) {
        if (!["subject", "project", "minutes", "name"].includes(variable[1] ?? "")) errors.push(`unknown variable ${variable[0]} in ${item.id}`);
      }
    }
  }
  for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
    const count = EVENTS.filter((item) => item.rarity === rarity).length;
    const minimum = { common: 20, rare: 12, epic: 5, legendary: 3 }[rarity];
    if (count < minimum) errors.push(`${rarity} events: ${count}, expected at least ${minimum}`);
  }
  return errors;
}
