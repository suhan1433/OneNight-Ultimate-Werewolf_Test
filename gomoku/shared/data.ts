export type Trait =
  | "guardian"
  | "mage"
  | "legion"
  | "assassin"
  | "illusion"
  | "spirit"
  | "merchant"
  | "chrono";
export const TRAITS: Record<
  Trait,
  { name: string; icon: string; steps: number[]; effects: string[] }
> = {
  guardian: {
    name: "수호자",
    icon: "◇",
    steps: [2, 4, 6],
    effects: ["수호자에게 방패", "방패 3턴 후 재생", "방패 파괴 시 마나 +2"],
  },
  mage: {
    name: "마법사",
    icon: "✧",
    steps: [2, 4, 6],
    effects: ["턴 종료 마나 +1", "스킬 마나 -1", "세 번째 스킬 무료"],
  },
  legion: {
    name: "군단",
    icon: "⚑",
    steps: [2, 4, 6],
    effects: [
      "인접 아군 2개 시 봉인 면역",
      "연결 군단 3개 시 마나 +1",
      "3목 군단 라인 골드 +1",
    ],
  },
  assassin: {
    name: "자객",
    icon: "†",
    steps: [2, 3, 4],
    effects: ["제거·봉인 마나 1 환급", "쿨다운 -1", "게임당 1회 쿨다운 무시"],
  },
  illusion: {
    name: "환영술사",
    icon: "◈",
    steps: [2, 4],
    effects: ["밀기·교환 사거리 +1", "환영 스킬 사용 시 상대 마나 -1"],
  },
  spirit: {
    name: "정령사",
    icon: "❋",
    steps: [2, 4],
    effects: ["토큰 지속 +1턴", "토큰 소멸 시 마나 +2"],
  },
  merchant: {
    name: "상단",
    icon: "◎",
    steps: [2, 3, 4],
    effects: [
      "라운드 골드 +1",
      "리롤 비용 -1",
      "라운드 골드 +3 · 증강 리롤 +1",
    ],
  },
  chrono: {
    name: "시간술사",
    icon: "◷",
    steps: [2, 4],
    effects: ["액티브 쿨다운 -1", "4턴마다 마나 완충"],
  },
};
export type SkillOp =
  | "shieldNeighbor"
  | "push"
  | "gold"
  | "field"
  | "smoke"
  | "clock"
  | "breakShield"
  | "shieldAll"
  | "seal"
  | "swap"
  | "remove"
  | "token"
  | "discount"
  | "fortress"
  | "watch"
  | "storm"
  | "captain"
  | "stealMana"
  | "refund"
  | "judge"
  | "income"
  | "king"
  | "extra"
  | "freeze";
export interface Hero {
  id: string;
  name: string;
  cost: number;
  traits: Trait[];
  glyph: string;
  type: "deploy" | "active" | "passive";
  op: SkillOp;
  mana: number;
  cooldown: number;
  description: string;
  value: number;
}
const hero = (
  id: string,
  name: string,
  cost: number,
  traits: Trait[],
  glyph: string,
  type: Hero["type"],
  op: SkillOp,
  mana: number,
  cooldown: number,
  description: string,
  value: number,
): Hero => ({
  id,
  name,
  cost,
  traits,
  glyph,
  type,
  op,
  mana,
  cooldown,
  description,
  value,
});
export const HEROES: Hero[] = [
  hero(
    "guard",
    "견습 수호병",
    1,
    ["guardian", "legion"],
    "衛",
    "deploy",
    "shieldNeighbor",
    0,
    0,
    "배치: 인접 아군 돌 1개에 방패를 부여합니다.",
    1,
  ),
  hero(
    "ember",
    "불꽃 견습생",
    1,
    ["mage", "spirit"],
    "炎",
    "active",
    "push",
    2,
    2,
    "적 돌을 인접한 빈 칸으로 1칸 밀어냅니다. 대상과 도착 칸을 선택하세요.",
    1.5,
  ),
  hero(
    "pickpocket",
    "그림자 소매치기",
    1,
    ["assassin", "merchant"],
    "影",
    "deploy",
    "gold",
    0,
    0,
    "배치: 골드 +1. 상단 수입은 라운드당 최대 +4입니다.",
    1,
  ),
  hero(
    "soldier",
    "들판 병사",
    1,
    ["legion", "spirit"],
    "兵",
    "passive",
    "field",
    0,
    0,
    "인접한 아군 돌이 2개 이상이면 턴 종료 마나 +1.",
    1.2,
  ),
  hero(
    "smoke",
    "연막 사환",
    1,
    ["illusion", "spirit"],
    "霧",
    "deploy",
    "smoke",
    0,
    0,
    "배치: 반경 2의 빈 칸에 토큰 1개를 자동 소환합니다(2턴).",
    1.5,
  ),
  hero(
    "clock",
    "시계공 견습",
    1,
    ["chrono", "merchant"],
    "刻",
    "passive",
    "clock",
    0,
    0,
    "라운드 종료 시 쿨다운 중인 스킬 하나의 쿨다운 -1.",
    1.2,
  ),
  hero(
    "blade",
    "칼날 그림자",
    1,
    ["assassin", "illusion"],
    "刃",
    "deploy",
    "breakShield",
    0,
    0,
    "배치: 인접한 적 돌 하나의 방패를 파괴합니다.",
    1,
  ),
  hero(
    "knight",
    "방패 기사",
    2,
    ["guardian", "legion"],
    "盾",
    "active",
    "shieldAll",
    3,
    2,
    "인접한 아군 돌 모두에게 방패를 부여합니다.",
    3,
  ),
  hero(
    "thunder",
    "번개 술사",
    2,
    ["mage", "chrono"],
    "雷",
    "active",
    "seal",
    3,
    2,
    "적 돌 1개를 2턴 동안 봉인합니다.",
    2,
  ),
  hero(
    "illusionist",
    "환영 마술사",
    2,
    ["illusion", "mage"],
    "幻",
    "active",
    "swap",
    4,
    3,
    "거리 3 이내의 아군 돌과 적 돌의 위치를 교환합니다.",
    3,
  ),
  hero(
    "assassin",
    "자객",
    2,
    ["assassin", "illusion"],
    "殺",
    "active",
    "remove",
    4,
    3,
    "적 돌 하나를 제거합니다. 방패가 있으면 방패만 파괴합니다.",
    3,
  ),
  hero(
    "summoner",
    "견습 정령사",
    2,
    ["spirit", "mage"],
    "靈",
    "active",
    "token",
    2,
    2,
    "빈 칸에 3턴 동안 토큰 1개를 소환합니다.",
    1.5,
  ),
  hero(
    "dealer",
    "암거래상",
    2,
    ["merchant", "assassin"],
    "商",
    "passive",
    "discount",
    0,
    0,
    "매 라운드 첫 리롤 비용 -1.",
    2.4,
  ),
  hero(
    "fortress",
    "철벽 대장",
    3,
    ["guardian", "legion"],
    "壁",
    "passive",
    "fortress",
    0,
    0,
    "인접한 아군 돌에 방패를 부여하고, 파괴된 방패는 3턴 후 재생합니다.",
    4.8,
  ),
  hero(
    "watcher",
    "시간 감시자",
    3,
    ["chrono", "guardian"],
    "時",
    "passive",
    "watch",
    0,
    0,
    "반경 2칸을 대상으로 하는 상대 스킬의 마나 비용 +1.",
    3.6,
  ),
  hero(
    "storm",
    "폭풍 마도사",
    3,
    ["mage", "illusion"],
    "嵐",
    "active",
    "storm",
    5,
    4,
    "선택한 3×3 영역의 돌들을 바깥으로 1칸 밀어냅니다.",
    4.5,
  ),
  hero(
    "captain",
    "용병 대장",
    3,
    ["legion", "merchant"],
    "將",
    "passive",
    "captain",
    0,
    0,
    "군단 특성의 인원 계산에서 이 돌을 2명으로 계산합니다.",
    3.6,
  ),
  hero(
    "timeThief",
    "시간 도둑",
    3,
    ["assassin", "chrono"],
    "盜",
    "active",
    "stealMana",
    3,
    3,
    "상대 마나를 2 감소시킵니다.",
    2.5,
  ),
  hero(
    "archmage",
    "대마법사",
    4,
    ["mage", "chrono"],
    "玄",
    "passive",
    "refund",
    0,
    0,
    "매 턴 첫 스킬 사용 후 마나 1을 환급합니다.",
    6,
  ),
  hero(
    "judge",
    "심판자",
    4,
    ["guardian", "assassin"],
    "判",
    "active",
    "judge",
    5,
    4,
    "상대의 열린 3 또는 4목 라인을 봉인합니다. 해당 라인의 돌을 선택하세요.",
    4.5,
  ),
  hero(
    "tycoon",
    "대상단주",
    4,
    ["merchant", "spirit"],
    "金",
    "passive",
    "income",
    0,
    0,
    "라운드 종료 골드 +2. 상단 보너스는 합계 +4까지입니다.",
    6,
  ),
  hero(
    "earthKing",
    "대지의 정령왕",
    4,
    ["spirit", "legion"],
    "王",
    "passive",
    "king",
    0,
    0,
    "인접한 아군 토큰을 연결 판정에 포함합니다. 새 승부처에는 예고 규칙이 적용됩니다.",
    6,
  ),
  hero(
    "legend",
    "전설의 기사",
    5,
    ["guardian", "legion"],
    "天",
    "active",
    "extra",
    6,
    0,
    "게임당 2회 추가 착수. 추가 돌로는 5목을 완성할 수 없습니다.",
    8,
  ),
  hero(
    "timeLord",
    "시간의 지배자",
    5,
    ["chrono", "illusion"],
    "永",
    "active",
    "freeze",
    7,
    0,
    "게임당 1회 상대의 다음 턴 스킬 사용과 마나 획득을 정지합니다.",
    6,
  ),
];
export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<
  string,
  Hero
>;
export const ODDS: Record<number, number[]> = {
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 40, 10, 1],
  8: [15, 20, 35, 25, 5],
};
export const XP = [0, 0, 0, 2, 6, 14, 26, 42, 62];
export const COPIES = [0, 12, 10, 8, 5, 3];
export interface Augment {
  id: string;
  name: string;
  tier: number;
  category: string;
  glyph: string;
  description: string;
}
export const AUGMENTS: Augment[] = [
  {
    id: "cash",
    name: "비상금",
    tier: 1,
    category: "경제",
    glyph: "◎",
    description: "즉시 8골드를 얻습니다.",
  },
  {
    id: "shields",
    name: "단단한 시작",
    tier: 1,
    category: "전투",
    glyph: "◇",
    description:
      "방패 3개를 지급합니다. 턴당 하나를 아군 돌에 부착할 수 있습니다.",
  },
  {
    id: "mana",
    name: "마나 샘",
    tier: 1,
    category: "전투",
    glyph: "✧",
    description: "턴 종료 시 마나를 1 추가 회복합니다.",
  },
  {
    id: "emblem",
    name: "특성 인장",
    tier: 1,
    category: "특성",
    glyph: "印",
    description: "보드에 존재하는 특성 하나의 인원을 +1 합니다.",
  },
  {
    id: "interest",
    name: "복리",
    tier: 2,
    category: "경제",
    glyph: "金",
    description: "이자 수입 상한이 +3 증가합니다.",
  },
  {
    id: "chain",
    name: "연쇄 시전",
    tier: 2,
    category: "전투",
    glyph: "連",
    description: "한 턴에 스킬 2회 사용. 두 번째 스킬은 마나 +1.",
  },
  {
    id: "level",
    name: "공격적 레벨업",
    tier: 2,
    category: "리스크",
    glyph: "昇",
    description: "즉시 레벨 +1. 다음 3라운드 동안 마나 회복 -1.",
  },
  {
    id: "promote",
    name: "속성 승급",
    tier: 2,
    category: "빌드",
    glyph: "★",
    description: "벤치의 3코 이하 ★1 돌 하나를 ★2로 승급합니다.",
  },
  {
    id: "twins",
    name: "쌍둥이 별",
    tier: 3,
    category: "빌드",
    glyph: "✦",
    description: "★2 돌 하나를 ★3으로 승급합니다. 5코 제외.",
  },
  {
    id: "counter",
    name: "반격 태세",
    tier: 3,
    category: "전투",
    glyph: "逆",
    description:
      "게임당 1회, 상대가 열린 3 이상을 만들면 해당 라인 돌 하나를 즉시 봉인합니다.",
  },
  {
    id: "golden",
    name: "황금 기회",
    tier: 3,
    category: "경제",
    glyph: "運",
    description:
      "5라운드 동안 리롤 무료. 매 라운드 상점 한 칸에 최고 코스트를 보장합니다.",
  },
  {
    id: "contract",
    name: "석혼의 계약",
    tier: 3,
    category: "리스크",
    glyph: "契",
    description: "무작위 5코 돌 하나를 얻고 최대 마나가 영구히 1 감소합니다.",
  },
];
export const AUGMENT = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));
