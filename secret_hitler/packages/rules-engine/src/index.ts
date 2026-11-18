import type {
  Action,
  GameState,
  GameView,
  Party,
  Policy,
  Power,
  PublicEvent,
  PublicPlayer,
  Role,
} from "../../shared-types/src/index.js";
import tables from "./rule-tables.json" with { type: "json" };
export type Random = () => number;
export const ROLE_COUNTS = tables.roles;
export function shuffle<T>(items: T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export const partyOf = (role: Role): Party =>
  role === "liberal" ? "liberal" : "fascist";
export function powerAt(count: number, policies: number): Power | null {
  return (
    (tables.powers[count <= 6 ? "5-6" : count <= 8 ? "7-8" : "9-10"][
      policies - 1
    ] as Power | null) ?? null
  );
}
function event(
  s: GameState,
  type: string,
  text: string,
  extra: Partial<PublicEvent> = {},
) {
  s.events.push({
    id: (s.events.at(-1)?.id ?? 0) + 1,
    round: s.round,
    type,
    text,
    ...extra,
  });
}
export function createGame(
  players: Pick<PublicPlayer, "id" | "name" | "avatar">[],
  random: Random,
): GameState {
  if (
    players.length < 5 ||
    players.length > 10 ||
    new Set(players.map((p) => p.id)).size !== players.length
  )
    throw Error("인원은 서로 다른 5~10명이어야 합니다.");
  const [liberal, fascist] =
    ROLE_COUNTS[String(players.length) as keyof typeof ROLE_COUNTS];
  const roles = shuffle<Role>(
    [
      ...Array(liberal).fill("liberal"),
      ...Array(fascist).fill("fascist"),
      "hitler",
    ],
    random,
  );
  const s: GameState = {
    phase: "night",
    version: 0,
    phaseVersion: 0,
    round: 1,
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      role: roles[i],
      alive: true,
      investigated: false,
      notHitler: false,
    })),
    president: players[Math.floor(random() * players.length)].id,
    chancellor: null,
    previousGovernment: null,
    specialResume: null,
    votes: {},
    acknowledged: [],
    selectedTarget: null,
    deck: shuffle<Policy>(
      [...Array(6).fill("liberal"), ...Array(11).fill("fascist")],
      random,
    ),
    discard: [],
    hand: [],
    liberal: 0,
    fascist: 0,
    tracker: 0,
    power: null,
    vetoDenied: false,
    privateResults: {},
    events: [],
    secrets: [],
    winner: null,
    winReason: null,
  };
  event(s, "start", "역할 서류가 배부되었습니다.");
  return s;
}
export function nextAlive(s: GameState, id: string): string {
  const start = s.players.findIndex((p) => p.id === id);
  for (let i = 1; i <= s.players.length; i++) {
    const p = s.players[(start + i) % s.players.length];
    if (p.alive) return p.id;
  }
  throw Error("생존자가 없습니다.");
}
export function eligibleChancellors(s: GameState): string[] {
  const alive = s.players.filter((p) => p.alive).length;
  return s.players
    .filter(
      (p) =>
        p.alive &&
        p.id !== s.president &&
        p.id !== s.previousGovernment?.chancellor &&
        (alive <= 5 || p.id !== s.previousGovernment?.president),
    )
    .map((p) => p.id);
}
export function eligibleTargets(s: GameState): string[] {
  return s.players
    .filter(
      (p) =>
        p.alive &&
        p.id !== s.president &&
        (s.power !== "investigate" || !p.investigated),
    )
    .map((p) => p.id);
}
function reshuffle(s: GameState, random: Random) {
  if (s.deck.length < 3) {
    s.deck = shuffle([...s.deck, ...s.discard], random);
    s.discard = [];
    event(s, "shuffle", "정책 더미를 재구성했습니다.");
  }
}
function finish(s: GameState, winner: Party, reason: string) {
  s.winner = winner;
  s.winReason = reason;
  s.phase = "finished";
  s.power = null;
  event(s, "victory", reason);
}
function advance(s: GameState) {
  s.president = nextAlive(s, s.specialResume ?? s.president);
  s.specialResume = null;
  s.chancellor = null;
  s.votes = {};
  s.hand = [];
  s.power = null;
  s.vetoDenied = false;
  s.round++;
  s.phase = "nomination";
}
function enact(s: GameState, policy: Policy, chaos: boolean, random: Random) {
  s[policy]++;
  s.tracker = 0;
  event(
    s,
    chaos ? "chaos" : "policy",
    chaos ? "혼란으로 정책이 제정되었습니다." : "정책이 제정되었습니다.",
    {
      policy,
      president: s.president,
      ...(s.chancellor ? { chancellor: s.chancellor } : {}),
    },
  );
  if (chaos) s.previousGovernment = null;
  // Official PDF: reshuffle at the end of the session / after a chaos enactment.
  reshuffle(s, random);
  if (s.liberal === 5) {
    finish(s, "liberal", "자유 정책 5개가 제정되었습니다.");
    return;
  }
  if (s.fascist === 6) {
    finish(s, "fascist", "파시스트 정책 6개가 제정되었습니다.");
    return;
  }
  s.power =
    !chaos && policy === "fascist"
      ? powerAt(s.players.length, s.fascist)
      : null;
  if (s.power) {
    s.phase = "executive";
    event(s, "executive", `대통령 권한: ${s.power}`, {
      president: s.president,
    });
  } else advance(s);
}
function failedGovernment(s: GameState, random: Random) {
  s.tracker++;
  if (s.tracker === 3) {
    // A legal state always has a drawable card; still guard before consuming.
    if (!s.deck.length) reshuffle(s, random);
    const tile = s.deck.shift();
    if (!tile) throw Error("정책 더미가 비었습니다.");
    enact(s, tile, true, random);
  } else advance(s);
}
function requireThat(
  condition: unknown,
  message = "현재 단계에서 허용되지 않는 행동입니다.",
): asserts condition {
  if (!condition) throw Error(message);
}
function resolveElection(s: GameState, random: Random) {
  const alive = s.players.filter((p) => p.alive).length;
  const passed = Object.values(s.votes).filter(Boolean).length > alive / 2;
  if (!passed) {
    failedGovernment(s, random);
    return;
  }
  s.previousGovernment = {
    president: s.president,
    chancellor: s.chancellor!,
  };
  const elected = s.players.find((p) => p.id === s.chancellor)!;
  if (s.fascist >= 3) {
    if (elected.role === "hitler") {
      finish(
        s,
        "fascist",
        "파시스트 정책 3개 이후 히틀러가 수상으로 당선되었습니다.",
      );
      return;
    }
    elected.notHitler = true;
  }
  reshuffle(s, random);
  s.hand = s.deck.splice(0, 3);
  requireThat(s.hand.length === 3);
  s.phase = "president_discard";
  s.vetoDenied = false;
}
/** Pure transition: rejected input never mutates its source. Randomness is injected. */
export function transition(
  source: GameState,
  actor: string,
  action: Action,
  random: Random,
): GameState {
  requireThat(source.phase !== "finished", "종료된 게임입니다.");
  const player = source.players.find((p) => p.id === actor);
  requireThat(player?.alive, "생존 플레이어만 행동할 수 있습니다.");
  const s = structuredClone(source);
  const president = actor === s.president,
    chancellor = actor === s.chancellor;
  switch (action.type) {
    case "acknowledge":
      requireThat((s.phase === "night" || s.phase === "vote_result") && !s.acknowledged.includes(actor));
      s.acknowledged.push(actor);
      if (s.acknowledged.length === s.players.filter((p) => p.alive).length) {
        if (s.phase === "vote_result") resolveElection(s, random);
        else {
          s.phase = "nomination";
          event(s, "night_end", "심문을 개시합니다.");
        }
      }
      break;
    case "select_target": {
      requireThat(president && (s.phase === "nomination" || (s.phase === "executive" && !s.privateResults[actor])));
      const eligible = s.phase === "nomination" ? eligibleChancellors(s) : eligibleTargets(s);
      requireThat(eligible.includes(action.target), "선택할 수 없는 대상입니다.");
      s.selectedTarget = action.target;
      break;
    }
    case "nominate":
      requireThat(s.phase === "nomination" && president);
      requireThat(
        eligibleChancellors(s).includes(action.target),
        "지명할 수 없는 수상 후보입니다.",
      );
      s.chancellor = action.target;
      s.votes = {};
      s.phase = "voting";
      event(s, "nomination", "수상 후보가 지명되었습니다.", {
        president: s.president,
        chancellor: action.target,
      });
      break;
    case "vote": {
      requireThat(
        s.phase === "voting" &&
          !(actor in s.votes) &&
          typeof action.ja === "boolean",
      );
      s.votes[actor] = action.ja;
      const alive = s.players.filter((p) => p.alive).length;
      if (Object.keys(s.votes).length === alive) {
        const passed =
          Object.values(s.votes).filter(Boolean).length > alive / 2;
        event(
          s,
          "vote",
          passed ? "정부가 가결되었습니다." : "정부가 부결되었습니다.",
          {
            president: s.president,
            chancellor: s.chancellor!,
            votes: { ...s.votes },
          },
        );
        s.phase = "vote_result";
        s.acknowledged = [];
      }
      break;
    }
    case "discard":
      requireThat(
        s.phase === "president_discard" &&
          president &&
          Number.isInteger(action.index) &&
          action.index >= 0 &&
          action.index < 3,
      );
      s.discard.push(s.hand.splice(action.index, 1)[0]);
      s.phase = "chancellor_enact";
      break;
    case "enact": {
      requireThat(
        s.phase === "chancellor_enact" &&
          chancellor &&
          Number.isInteger(action.index) &&
          action.index >= 0 &&
          action.index < 2,
      );
      const chosen = s.hand.splice(action.index, 1)[0];
      s.discard.push(...s.hand);
      s.hand = [];
      enact(s, chosen, false, random);
      break;
    }
    case "request_veto":
      requireThat(
        s.phase === "chancellor_enact" &&
          chancellor &&
          s.fascist >= 5 &&
          !s.vetoDenied,
      );
      s.phase = "veto";
      event(s, "veto_request", "수상이 거부권을 요청했습니다.");
      break;
    case "answer_veto":
      requireThat(
        s.phase === "veto" && president && typeof action.accept === "boolean",
      );
      event(
        s,
        "veto_answer",
        action.accept ? "거부권이 승인되었습니다." : "거부권이 거절되었습니다.",
      );
      if (action.accept) {
        s.discard.push(...s.hand);
        s.hand = [];
        reshuffle(s, random);
        failedGovernment(s, random);
      } else {
        s.vetoDenied = true;
        s.phase = "chancellor_enact";
      }
      break;
    case "power": {
      requireThat(
        s.phase === "executive" && president && !s.privateResults[actor],
      );
      if (s.power === "peek") {
        reshuffle(s, random);
        s.privateResults[actor] = { policies: s.deck.slice(0, 3) };
        break;
      }
      requireThat(
        action.target && eligibleTargets(s).includes(action.target),
        "지정할 수 없는 대상입니다.",
      );
      const target = s.players.find((p) => p.id === action.target)!;
      if (s.power === "investigate") {
        target.investigated = true;
        s.privateResults[actor] = {
          target: target.id,
          party: partyOf(target.role),
        };
        event(s, "investigation", "정당 소속 조사가 완료되었습니다.", {
          president: actor,
          target: target.id,
        });
      } else if (s.power === "special_election") {
        const origin = s.president;
        s.round++;
        s.president = target.id;
        s.specialResume = origin;
        s.chancellor = null;
        s.votes = {};
        s.phase = "nomination";
        s.power = null;
        event(
          s,
          "special_election",
          "특별 선거 대통령 후보가 지정되었습니다.",
          { president: target.id },
        );
      } else if (s.power === "execute") {
        target.alive = false;
        event(s, "execution", "집행이 완료되었습니다.", {
          president: actor,
          target: target.id,
        });
        if (target.role === "hitler")
          finish(s, "liberal", "히틀러가 처형되었습니다.");
        else advance(s);
      } else throw Error("대통령 권한이 없습니다.");
      break;
    }
    case "confirm_power":
      requireThat(
        s.phase === "executive" && president && s.privateResults[actor],
      );
      delete s.privateResults[actor];
      advance(s);
      break;
    default:
      throw Error("알 수 없는 행동입니다.");
  }
  if (s.phase !== source.phase || s.privateResults[actor]) s.selectedTarget = null;
  // Only recent public cues are needed for presentation; no replay is retained.
  s.events = s.events.slice(-16);
  s.secrets = [];
  s.version++;
  if (s.phase !== source.phase) s.phaseVersion = s.version;
  return s;
}
export function gameView(s: GameState, viewer: string | null): GameView {
  const self = s.players.find((p) => p.id === viewer);
  const alive = !!self?.alive;
  const knownPlayers: GameView["knownPlayers"] = [];
  if (
    alive &&
    (self.role === "fascist" ||
      (self.role === "hitler" && s.players.length <= 6))
  )
    for (const p of s.players)
      if (p.id !== viewer && partyOf(p.role) === "fascist")
        knownPlayers.push({ id: p.id, role: p.role });
  const handVisible =
    alive &&
    ((viewer === s.president && s.phase === "president_discard") ||
      (viewer === s.chancellor &&
        (s.phase === "chancellor_enact" || s.phase === "veto")));
  return {
    phase: s.phase,
    version: s.version,
    round: s.round,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      alive: p.alive,
      investigated: p.investigated,
      notHitler: p.notHitler,
    })),
    president: s.president,
    chancellor: s.chancellor,
    previousGovernment: s.previousGovernment
      ? { ...s.previousGovernment }
      : null,
    liberal: s.liberal,
    fascist: s.fascist,
    tracker: s.tracker,
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    power: s.power,
    vetoEnabled: s.fascist >= 5,
    vetoDenied: s.vetoDenied,
    acknowledged: [...s.acknowledged],
    selectedTarget: s.selectedTarget ?? null,
    voted: Object.keys(s.votes),
    ...(self ? { selfRole: self.role } : {}),
    knownPlayers,
    ...(handVisible ? { hand: [...s.hand] } : {}),
    ...(alive && s.privateResults[viewer!]
      ? { privateResult: structuredClone(s.privateResults[viewer!]) }
      : {}),
    eligibleChancellors: eligibleChancellors(s),
    eligibleTargets: s.phase === "executive" ? eligibleTargets(s) : [],
    events: structuredClone(s.events),
    winner: s.winner,
    winReason: s.winReason,
    ...(s.phase === "finished"
      ? {
          revealedRoles: Object.fromEntries(
            s.players.map((p) => [p.id, p.role]),
          ),

        }
      : {}),
  };
}
export function canChat(s: GameState, id: string): boolean {
  const p = s.players.find((p) => p.id === id);
  if (!p?.alive) return false;
  return !(
    ["president_discard", "chancellor_enact", "veto"].includes(s.phase) &&
    (id === s.president || id === s.chancellor)
  );
}
/** Automated players consume only their authorized view; policy choices are intentional. */
export function botAction(v: GameView, id: string): Action | null {
  if (!v.players.find((p) => p.id === id)?.alive) return null;
  if (v.phase === "night" || v.phase === "vote_result")
    return v.acknowledged.includes(id) ? null : { type: "acknowledge" };
  if (v.phase === "nomination" && v.president === id) {
    const knownHitler = v.knownPlayers.find((p) => p.role === "hitler")?.id;
    const target =
      v.fascist >= 3 && v.eligibleChancellors.includes(knownHitler!)
        ? knownHitler!
        : v.eligibleChancellors[0];
    return target ? { type: "nominate", target } : null;
  }
  if (v.phase === "voting" && !v.voted.includes(id))
    return { type: "vote", ja: true };
  const preferred = partyOf(v.selfRole ?? "liberal");
  if (v.phase === "president_discard" && id === v.president && v.hand)
    return {
      type: "discard",
      index: Math.max(
        0,
        v.hand.findIndex((p) => p !== preferred),
      ),
    };
  if (v.phase === "chancellor_enact" && id === v.chancellor && v.hand)
    return {
      type: "enact",
      index: Math.max(
        0,
        v.hand.findIndex((p) => p === preferred),
      ),
    };
  if (v.phase === "veto" && id === v.president)
    return { type: "answer_veto", accept: true };
  if (v.phase === "executive" && id === v.president) {
    if (v.privateResult) return { type: "confirm_power" };
    if (v.power === "peek") return { type: "power" };
    const allies = new Set(v.knownPlayers.map((p) => p.id));
    const target =
      v.eligibleTargets.find((p) => !allies.has(p)) ?? v.eligibleTargets[0];
    return target ? { type: "power", target } : null;
  }
  return null;
}
