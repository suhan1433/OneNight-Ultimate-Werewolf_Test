import { createGame, reduce, player } from "../shared/engine";
import { HERO } from "../shared/data";
import type { Game, Stone } from "../shared/types";
export const LEARNER = "learner";
export const COACH = "coach";
type InputKind =
  | "ready"
  | "buy"
  | "unit"
  | "cell"
  | "confirm"
  | "skill"
  | "cast"
  | "end"
  | "augment"
  | "altar";
interface LessonStep {
  kind: InputKind;
  prompt: string;
  cell?: number;
  role?: "place" | "source" | "target";
  hero?: string;
  feedback: string;
}
interface Lesson {
  id: string;
  title: string;
  intro: string;
  success: string;
  steps: LessonStep[];
}
export const LESSONS: Lesson[] = [
  {
    id: "turn",
    title: "내 차례에 돌 놓기",
    intro:
      "시간 제한 없이 한 턴을 직접 해봐요. 지금 누를 칸과 버튼에는 금색 테두리가 있어요.",
    success:
      "한 턴을 끝냈어요! 돌 하나를 놓고 턴을 마치면 상대 차례가 됩니다. 마나도 2 회복됐어요.",
    steps: [
      {
        kind: "ready",
        prompt: "먼저 아래의 [정비 완료]를 눌러 내 차례를 시작하세요.",
        feedback: "준비가 끝났어요. 이제 내 차례입니다.",
      },
      {
        kind: "cell",
        role: "place",
        cell: 84,
        prompt: "가운데 금색 테두리의 G7 교차점을 눌러보세요.",
        feedback: "아직 놓인 것이 아니라 미리보기예요.",
      },
      {
        kind: "confirm",
        prompt: "아래의 [착수 확정]을 눌러 돌을 놓으세요.",
        feedback: "내 돌 하나가 놓였어요. 아직 턴을 끝내지는 않았어요.",
      },
      {
        kind: "end",
        prompt: "[턴 마치기]를 눌러 상대에게 차례를 넘기세요.",
        feedback: "잘했어요. 다음에는 상대의 공격을 막아볼게요.",
      },
    ],
  },
  {
    id: "block",
    title: "상대의 4목 막기",
    intro:
      "상대의 흰 돌 4개가 한 줄로 이어져 있어요. 다음 빈자리를 막지 않으면 상대가 이겨요.",
    success:
      "상대의 다섯 번째 자리를 내 돌로 막았어요. 내 돌을 잇는 것만큼 상대의 다음 수를 막는 것도 중요해요.",
    steps: [
      {
        kind: "cell",
        role: "place",
        cell: 85,
        prompt: "상대 돌 4개 오른쪽의 H7 빈자리를 누르세요.",
        feedback: "여기가 상대가 다음에 놓고 싶어 하는 자리예요.",
      },
      {
        kind: "confirm",
        prompt: "[착수 확정]을 눌러 상대의 빈자리를 내 돌로 막으세요.",
        feedback: "이제 상대는 이 줄로 5목을 완성할 수 없어요.",
      },
      {
        kind: "end",
        prompt: "막았다면 [턴 마치기]를 누르세요.",
        feedback: "방어 성공! 다음에는 능력이 있는 돌을 사볼게요.",
      },
    ],
  },
  {
    id: "shop",
    title: "석혼을 사서 보드에 놓기",
    intro:
      "석혼은 능력이 있는 돌이에요. 연습용으로 번개 술사 한 장과 골드 5개를 준비했어요.",
    success:
      "골드 2개를 내고 산 석혼이 벤치를 거쳐 보드에 놓였어요. 구매만 해서는 능력을 쓸 수 없고, 보드에 놓아야 해요.",
    steps: [
      {
        kind: "buy",
        prompt: "상점의 [번개 술사 구매 · 2G]를 누르세요.",
        feedback: "골드가 5에서 3으로 줄고, 벤치에 번개 술사가 생겼어요.",
      },
      {
        kind: "ready",
        prompt: "상점 이용을 마쳤으면 [정비 완료]를 누르세요.",
        feedback: "이제 보드에 돌을 놓을 차례예요.",
      },
      {
        kind: "unit",
        hero: "thunder",
        prompt: "보관함인 벤치에서 [번개 술사]를 선택하세요.",
        feedback: "기본 돌 대신 번개 술사를 놓도록 선택했어요.",
      },
      {
        kind: "cell",
        role: "place",
        cell: 84,
        prompt: "번개 술사를 놓을 G7 교차점을 누르세요.",
        feedback: "번개 술사의 미리보기가 보여요.",
      },
      {
        kind: "confirm",
        prompt: "[착수 확정]을 누르세요.",
        feedback:
          "벤치의 번개 술사가 보드로 옮겨졌어요. 능력을 쓸 준비가 됐어요.",
      },
      {
        kind: "end",
        prompt: "이번에는 스킬을 쓰지 않고 [턴 마치기]를 누르세요.",
        feedback: "스킬은 매번 쓰지 않아도 돼요. 다음 연습에서 직접 써볼게요.",
      },
    ],
  },
  {
    id: "seal",
    title: "번개 술사의 스킬 써보기",
    intro:
      "내 번개 술사와 마나 3을 미리 준비했어요. 상대 돌 하나를 잠시 연결에서 빼는 “봉인”을 해볼게요.",
    success:
      "마나 3을 써서 상대 돌을 봉인하고, 기본 돌도 하나 놓았어요. 봉인된 돌은 남아 있지만 연결에서 빠져요. 스킬을 썼어도 착수는 해야 합니다.",
    steps: [
      {
        kind: "cell",
        role: "source",
        cell: 97,
        prompt: "雷 문양이 있는 내 번개 술사 G6을 누르세요.",
        feedback: "이 돌의 액티브 스킬을 선택할 수 있어요.",
      },
      {
        kind: "skill",
        prompt: "아래의 [스킬 · 3✧]를 누르세요.",
        feedback: "이번에는 어느 돌에 스킬을 쓸지 고를 차례예요.",
      },
      {
        kind: "cell",
        role: "target",
        cell: 84,
        prompt: "봉인할 상대 돌 G7을 누르세요.",
        feedback: "상대 돌을 대상으로 골랐어요. 아직 마나는 쓰지 않았어요.",
      },
      {
        kind: "cast",
        prompt: "[스킬 확정]을 눌러 봉인하세요.",
        feedback: "封 표시가 생기고 마나가 3에서 0으로 줄었어요.",
      },
      {
        kind: "cell",
        role: "place",
        cell: 85,
        prompt: "스킬을 썼어도 돌은 하나 놓아야 해요. H7 빈칸을 누르세요.",
        feedback: "이제 일반 착수를 할 준비가 됐어요.",
      },
      {
        kind: "confirm",
        prompt: "[착수 확정]으로 기본 돌을 하나 놓으세요.",
        feedback: "스킬과 착수를 둘 다 했어요.",
      },
      {
        kind: "end",
        prompt: "[턴 마치기]를 눌러 마무리하세요.",
        feedback: "스킬 사용을 포함한 한 턴을 완료했어요.",
      },
    ],
  },
  {
    id: "trait",
    title: "같은 특성을 모아보기",
    intro:
      "보드에 견습 수호병이 있어요. 서로 다른 수호자 둘을 모으면 방패가 자동으로 생깁니다.",
    success:
      "견습 수호병 + 방패 기사로 수호자 2가 켜졌어요. 두 돌의 방패 테두리를 보세요. 서로 다른 이름을 모으는 것이 특성의 핵심이에요.",
    steps: [
      {
        kind: "unit",
        hero: "knight",
        prompt: "벤치에서 [방패 기사]를 선택하세요.",
        feedback: "방패 기사도 견습 수호병처럼 수호자 특성이 있어요.",
      },
      {
        kind: "cell",
        role: "place",
        cell: 97,
        prompt: "견습 수호병 옆의 G6 교차점을 누르세요.",
        feedback: "이곳에 놓아 서로 다른 수호자 둘을 모아볼게요.",
      },
      {
        kind: "confirm",
        prompt: "[착수 확정]을 누르고 방패가 생기는지 보세요.",
        feedback: "수호자 2가 활성화되어 두 돌에 방패가 생겼어요.",
      },
      {
        kind: "end",
        prompt: "특성 효과는 자동으로 적용돼요. [턴 마치기]를 누르세요.",
        feedback: "특성을 켜는 데 별도의 스킬 버튼이나 마나가 필요하지 않아요.",
      },
    ],
  },
  {
    id: "five",
    title: "다섯 돌로 직접 승리하기",
    intro:
      "이번에는 내 돌이 이미 4개 이어져 있어요. 한 수를 더 놓아 승리해 봐요.",
    success:
      "5목 완성! 직접 돌을 놓아 다섯 개를 이으면 바로 승리해요. 승리한 뒤에는 턴 마치기를 누를 필요가 없어요.",
    steps: [
      {
        kind: "cell",
        role: "place",
        cell: 85,
        prompt: "내 돌 4개 오른쪽의 H7 교차점을 누르세요.",
        feedback: "이곳이 다섯 번째 돌을 놓을 자리예요.",
      },
      {
        kind: "confirm",
        prompt: "[착수 확정]으로 다섯 번째 돌을 놓으세요.",
        feedback: "직접 5목을 완성해 승리했어요!",
      },
    ],
  },
  {
    id: "augment",
    title: "증강으로 추가 능력 얻기",
    intro:
      "3·7·11라운드에는 추가 능력 하나를 골라요. 이번에는 돈을 바로 받는 비상금을 골라볼게요.",
    success:
      "비상금으로 골드가 5에서 13으로 늘었어요. 실제 대국에서는 세 후보의 설명을 읽고 내 전략에 맞는 능력을 고르면 돼요.",
    steps: [
      {
        kind: "augment",
        prompt: "후보 중 [비상금]을 누르고 골드 숫자가 바뀌는지 보세요.",
        feedback: "즉시 골드 8개를 받았어요.",
      },
    ],
  },
  {
    id: "altar",
    title: "제단에서 무료 석혼 고르기",
    intro:
      "4·8·12라운드에는 둘이 같은 석혼 4개를 나눠 가져요. 선택자 이름이 나일 때 고를 수 있어요.",
    success:
      "골드는 그대로인데 벤치에 견습 수호병이 들어왔어요. 제단은 무료예요. 이 돌도 내 차례에 보드에 놓아 사용합니다.",
    steps: [
      {
        kind: "altar",
        prompt:
          "지금은 내 선택 차례예요. [견습 수호병 무료로 받기]를 누르세요.",
        feedback: "무료 석혼을 받았어요. 다음에는 상대가 고를 차례입니다.",
      },
    ],
  },
];
export interface PracticeState {
  lesson: number;
  step: number;
  game: Game;
  cell: number | null;
  unit: string | undefined;
  source: number | null;
  target: number | null;
  message: string;
  complete: boolean;
}
export interface PracticeInput {
  kind: InputKind;
  cell?: number;
  uid?: string;
  id?: string;
  slot?: number;
}
function put(g: Game, cell: number, owner: string, hero = "plain") {
  const h = HERO[hero];
  const s: Stone = {
    uid: `lesson-${cell}`,
    hero,
    owner,
    star: 1,
    copies: h ? 1 : 0,
    paid: h?.cost || 0,
    placed: 0,
    protectedUntil: -1,
    sealedUntil: 0,
    shield: false,
    shieldRegen: 0,
    cooldown: 0,
    uses: 0,
    tokenUntil: 0,
  };
  g.board[cell] = s;
  if (h) g.pool[hero]--;
  return s;
}
function bench(g: Game, id: string, hero: string) {
  const h = HERO[hero];
  g.pool[hero]--;
  player(g, id).bench.push({
    uid: `bench-${hero}`,
    hero,
    star: 1,
    copies: 1,
    paid: h.cost,
  });
}
export function createPractice(lesson = 0): PracticeState {
  const index = Math.max(
    0,
    Math.min(LESSONS.length - 1, Math.floor(lesson) || 0),
  );
  const g = createGame(
    [
      { id: LEARNER, name: "나" },
      { id: COACH, name: "연습 상대" },
    ],
    123,
    0,
  );
  g.players.sort((a) => (a.id === LEARNER ? -1 : 1));
  for (const p of g.players) {
    for (const id of p.shop) if (id) g.pool[id]++;
    p.shop = Array(5).fill(null);
    p.gold = p.id === LEARNER ? 5 : 8;
    p.mana = p.id === LEARNER ? 0 : 2;
    p.ready = p.id === COACH;
  }
  g.phase = "turn";
  g.turn = LEARNER;
  g.ply = 8;
  const p = player(g, LEARNER),
    id = LESSONS[index].id;
  if (id === "turn" || id === "shop") {
    g.phase = "prep";
    g.ply = 0;
  }
  if (id === "block") {
    put(g, 80, LEARNER);
    for (const c of [81, 82, 83, 84]) put(g, c, COACH);
  }
  if (id === "five") {
    put(g, 80, COACH);
    for (const c of [81, 82, 83, 84]) put(g, c, LEARNER);
  }
  if (id === "shop" || id === "seal") {
    p.level = 3;
    p.xp = 2;
    p.mana = 3;
  }
  if (id === "shop") {
    p.shop[0] = "thunder";
    g.pool.thunder--;
  }
  if (id === "seal") {
    put(g, 97, LEARNER, "thunder");
    for (const c of [82, 83, 84]) put(g, c, COACH);
  }
  if (id === "trait") {
    put(g, 84, LEARNER, "guard");
    bench(g, LEARNER, "knight");
  }
  if (id === "augment") {
    g.phase = "augment";
    g.round = 3;
    p.choices = ["cash", "mana", "shields"];
    p.augmentRerolls = 1;
    player(g, COACH).choices = ["cash"];
  }
  if (id === "altar") {
    g.phase = "altar";
    g.round = 4;
    g.altar = ["guard", "thunder", "dealer", "soldier"];
    g.altar.forEach((h) => {
      if (h) g.pool[h]--;
    });
    g.altarOrder = [LEARNER, COACH, COACH, LEARNER];
    g.altarStep = 0;
  }
  return {
    lesson: index,
    step: 0,
    game: g,
    cell: null,
    unit: undefined,
    source: null,
    target: null,
    message: "",
    complete: false,
  };
}
export function practiceStep(s: PracticeState) {
  return LESSONS[s.lesson].steps[s.step];
}
export function practiceInput(
  s: PracticeState,
  input: PracticeInput,
): PracticeState {
  if (s.complete) return s;
  const step = practiceStep(s);
  if (input.kind !== step.kind) return { ...s, message: step.prompt };
  if (step.kind === "cell" && input.cell !== step.cell)
    return { ...s, message: `금색 테두리의 칸을 찾아보세요. ${step.prompt}` };
  if (
    step.kind === "unit" &&
    !player(s.game, LEARNER).bench.some(
      (u) => u.uid === input.uid && u.hero === step.hero,
    )
  )
    return { ...s, message: step.prompt };
  if (step.kind === "augment" && input.id !== "cash")
    return {
      ...s,
      message: "이번 연습에서는 비상금을 골라 골드가 늘어나는지 확인해 보세요.",
    };
  if (step.kind === "altar" && input.slot !== 0)
    return {
      ...s,
      message: "이번에는 금색 테두리의 견습 수호병을 골라보세요.",
    };
  let game = s.game,
    cell = s.cell,
    unit = s.unit,
    source = s.source,
    target = s.target;
  try {
    switch (input.kind) {
      case "ready":
        game = reduce(game, LEARNER, { type: "ready" }, 0);
        break;
      case "buy":
        game = reduce(game, LEARNER, { type: "buy", slot: 0 }, 0);
        break;
      case "unit":
        unit = input.uid;
        break;
      case "cell":
        if (step.role === "source") source = input.cell!;
        else if (step.role === "target") target = input.cell!;
        else cell = input.cell!;
        break;
      case "confirm":
        if (cell === null) return { ...s, message: step.prompt };
        game = reduce(game, LEARNER, { type: "place", cell, uid: unit }, 0);
        cell = null;
        unit = undefined;
        break;
      case "skill":
        break;
      case "cast":
        if (source === null) return { ...s, message: step.prompt };
        game = reduce(
          game,
          LEARNER,
          { type: "skill", source, target: target ?? undefined },
          0,
        );
        target = null;
        source = null;
        break;
      case "end":
        game = reduce(game, LEARNER, { type: "end" }, 0);
        break;
      case "augment":
        game = reduce(game, LEARNER, { type: "augment", id: "cash" }, 0);
        break;
      case "altar":
        game = reduce(game, LEARNER, { type: "altar", slot: 0 }, 0);
        break;
    }
  } catch (error) {
    return {
      ...s,
      message: error instanceof Error ? error.message : step.prompt,
    };
  }
  const next = s.step + 1;
  return {
    ...s,
    game,
    cell,
    unit,
    source,
    target,
    step: next,
    message: step.feedback,
    complete: next >= LESSONS[s.lesson].steps.length,
  };
}
