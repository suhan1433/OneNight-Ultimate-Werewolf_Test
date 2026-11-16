import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  transition,
  gameView,
  eligibleChancellors,
  powerAt,
  canChat,
  botAction,
  partyOf,
} from "../packages/rules-engine/src/index.js";
import type {
  Action,
  GameState,
  Policy,
} from "../packages/shared-types/src/index.js";
const rng = () => 0.42;
export const players = (n = 5) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `의원 ${i}`,
    avatar: i,
  }));
const make = (n = 5) => createGame(players(n), rng);
const act = (s: GameState, id: string, a: Action) => transition(s, id, a, rng);
function prepared(n = 5) {
  let s = make(n);
  for (const p of s.players) s = act(s, p.id, { type: "acknowledge" });
  return s;
}
function vote(s: GameState, ja = true) {
  for (const p of s.players.filter((p) => p.alive))
    s = act(s, p.id, { type: "vote", ja });
  return s;
}
function elected(n = 5) {
  let s = prepared(n);
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  return vote(s);
}
function redistribute(
  s: GameState,
  liberal: number,
  fascist: number,
  hand: Policy[] = [],
) {
  s.liberal = liberal;
  s.fascist = fascist;
  s.hand = hand;
  s.discard = [];
  s.deck = [
    ...Array(6 - liberal - hand.filter((p) => p === "liberal").length).fill(
      "liberal",
    ),
    ...Array(11 - fascist - hand.filter((p) => p === "fascist").length).fill(
      "fascist",
    ),
  ];
}

test("5~10인 역할 및 초기 정보 공개 범위", () => {
  for (let n = 5; n <= 10; n++) {
    const s = make(n);
    assert.equal(s.players.filter((p) => p.role === "hitler").length, 1);
    assert.equal(
      s.players.filter((p) => p.role === "fascist").length,
      n <= 6 ? 1 : n <= 8 ? 2 : 3,
    );
    for (const p of s.players) {
      const v = gameView(s, p.id);
      assert.equal(v.selfRole, p.role);
      assert.equal(
        v.knownPlayers.length,
        p.role === "liberal" || (p.role === "hitler" && n >= 7)
          ? 0
          : s.players.filter((q) => partyOf(q.role) === "fascist").length - 1,
      );
    }
    assert.equal(gameView(s, null).selfRole, undefined);
  }
});
test("수상 임기 제한: 생존 6명과 5명, 대통령 출마 제한 없음", () => {
  const s = prepared(7);
  s.president = "p0";
  s.previousGovernment = { president: "p1", chancellor: "p2" };
  assert(!eligibleChancellors(s).includes("p1"));
  assert(!eligibleChancellors(s).includes("p2"));
  s.players[6].alive = false;
  s.players[5].alive = false;
  assert(eligibleChancellors(s).includes("p1"));
  assert(!eligibleChancellors(s).includes("p2"));
  s.president = "p2";
  assert(eligibleChancellors(s).includes("p1"));
});
test("동수 부결, 부결 정부는 이전 정부를 바꾸지 않음, 사망자 제외", () => {
  let s = prepared(6);
  s.previousGovernment = { president: "p1", chancellor: "p2" };
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  const previous = s.previousGovernment;
  for (let i = 0; i < 6; i++) s = act(s, `p${i}`, { type: "vote", ja: i < 3 });
  assert.equal(s.tracker, 1);
  assert.deepEqual(s.previousGovernment, previous);
  assert.equal(s.phase, "nomination");
  s.players[5].alive = false;
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  for (let i = 0; i < 5; i++) s = act(s, `p${i}`, { type: "vote", ja: i < 3 });
  assert.equal(s.phase, "president_discard");
  assert.equal(s.tracker, 1);
});
test("혼란: 권한 없음, 임기 해제, 다섯 번째 파시스트 정책은 거부권 해금", () => {
  let s = prepared(7);
  redistribute(s, 0, 4);
  s.deck.sort((a, b) => (a === "fascist" ? -1 : 1));
  s.tracker = 2;
  s.previousGovernment = { president: "p1", chancellor: "p2" };
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  s = vote(s, false);
  assert.equal(s.fascist, 5);
  assert.equal(s.tracker, 0);
  assert.equal(s.power, null);
  assert.equal(s.previousGovernment, null);
  assert(gameView(s, null).vetoEnabled);
});
test("가결은 트래커를 초기화하지 않으며 정책 제정이 초기화", () => {
  let s = elected();
  s.tracker = 2;
  s = act(s, s.president, { type: "discard", index: 0 });
  assert.equal(s.tracker, 2);
  s = act(s, s.chancellor!, { type: "enact", index: 0 });
  assert.equal(s.tracker, 0);
});
test("거부권 승인 +1, 3이면 혼란 / 거절 후 재요청 금지", () => {
  for (const tracker of [0, 1, 2]) {
    let s = elected();
    redistribute(s, 0, 5, ["liberal", "fascist"]);
    s.phase = "chancellor_enact";
    s.tracker = tracker;
    s = act(s, s.chancellor!, { type: "request_veto" });
    s = act(s, s.president, { type: "answer_veto", accept: true });
    assert.equal(s.tracker, tracker === 2 ? 0 : tracker + 1);
    assert.equal(s.hand.length, 0);
    assert.equal(s.power, null);
  }
  let s = elected();
  redistribute(s, 0, 5, ["liberal", "fascist"]);
  s.phase = "chancellor_enact";
  s = act(s, s.chancellor!, { type: "request_veto" });
  s = act(s, s.president, { type: "answer_veto", accept: false });
  assert.throws(() => act(s, s.chancellor!, { type: "request_veto" }));
  s = act(s, s.chancellor!, { type: "enact", index: 0 });
  assert.equal(s.liberal, 1);
});
test("인원별 대통령 권한 표", () => {
  for (const n of [5, 6])
    assert.deepEqual(
      Array.from({ length: 6 }, (_, i) => powerAt(n, i + 1)),
      [null, null, "peek", "execute", "execute", null],
    );
  for (const n of [7, 8])
    assert.deepEqual(
      Array.from({ length: 6 }, (_, i) => powerAt(n, i + 1)),
      [null, "investigate", "special_election", "execute", "execute", null],
    );
  for (const n of [9, 10])
    assert.deepEqual(
      Array.from({ length: 6 }, (_, i) => powerAt(n, i + 1)),
      [
        "investigate",
        "investigate",
        "special_election",
        "execute",
        "execute",
        null,
      ],
    );
});
test("특별 선거는 부결되어도 원래 순서 복귀, 사망자 건너뛰기", () => {
  let s = prepared(7);
  s.phase = "executive";
  s.power = "special_election";
  s.president = "p0";
  s.players[1].alive = false;
  s = act(s, "p0", { type: "power", target: "p2" });
  assert.equal(s.president, "p2");
  s = act(s, "p2", { type: "nominate", target: eligibleChancellors(s)[0] });
  s = vote(s, false);
  assert.equal(s.president, "p2");
  s = act(s, "p2", { type: "nominate", target: eligibleChancellors(s)[0] });
  s = vote(s, false);
  assert.equal(s.president, "p3");
});
test("조사는 정당만 공개, 재조사 금지, 결과는 대통령에게만", () => {
  let s = prepared(9);
  s.phase = "executive";
  s.power = "investigate";
  const target =
    s.players.find((p) => p.role === "hitler" && p.id !== s.president) ??
    s.players.find((p) => p.id !== s.president)!;
  s = act(s, s.president, { type: "power", target: target.id });
  assert.equal(
    gameView(s, s.president).privateResult?.party,
    partyOf(target.role),
  );
  assert.equal(gameView(s, target.id).privateResult, undefined);
  assert(s.players.find((p) => p.id === target.id)!.investigated);
  s = act(s, s.president, { type: "confirm_power" });
  s.phase = "executive";
  s.power = "investigate";
  assert.throws(() =>
    act(s, s.president, { type: "power", target: target.id }),
  );
});
test("엿보기는 정책 순서를 바꾸지 않음, 본인만 열람", () => {
  let s = prepared();
  s.phase = "executive";
  s.power = "peek";
  const before = [...s.deck];
  s = act(s, s.president, { type: "power" });
  assert.deepEqual(s.deck, before);
  assert.deepEqual(
    gameView(s, s.president).privateResult?.policies,
    before.slice(0, 3),
  );
  assert.equal(gameView(s, null).privateResult, undefined);
});
test("처형 시 히틀러 외 역할은 공개되지 않음, 발언과 입력 금지", () => {
  let s = prepared();
  s.phase = "executive";
  s.power = "execute";
  const victim = s.players.find(
    (p) => p.id !== s.president && p.role !== "hitler",
  )!;
  s = act(s, s.president, { type: "power", target: victim.id });
  assert.equal(s.winner, null);
  assert.equal(canChat(s, victim.id), false);
  assert(!JSON.stringify(gameView(s, null)).includes("selfRole"));
  assert.equal(gameView(s, victim.id).knownPlayers.length, 0);
  assert.throws(() => act(s, victim.id, { type: "vote", ja: true }));
});
test("승리 조건 4개와 히틀러 조기 수상", () => {
  for (const f of [0, 3]) {
    let s = prepared();
    s.fascist = f;
    const hitler = s.players.find((p) => p.role === "hitler")!;
    s.president = s.players.find((p) => p.id !== hitler.id)!.id;
    s = act(s, s.president, { type: "nominate", target: hitler.id });
    s = vote(s);
    assert.equal(s.winner, f >= 3 ? "fascist" : null);
    assert.equal(hitler.notHitler, false);
  }
  for (const [l, f, tile, expected] of [
    [4, 0, "liberal", "liberal"],
    [0, 5, "fascist", "fascist"],
  ] as const) {
    let s = elected();
    redistribute(s, l, f, [tile, tile]);
    s.phase = "chancellor_enact";
    s = act(s, s.chancellor!, { type: "enact", index: 0 });
    assert.equal(s.winner, expected);
    assert.equal(s.phase, "finished");
  }
  let s = prepared();
  s.phase = "executive";
  s.power = "execute";
  const h = s.players.find((p) => p.role === "hitler")!;
  s.president = s.players.find((p) => p.id !== h.id)!.id;
  s = act(s, s.president, { type: "power", target: h.id });
  assert.equal(s.winner, "liberal");
  assert(gameView(s, null).revealedRoles);
});
test("3정책 이후 히틀러 아닌 수상의 확인 표식", () => {
  let s = prepared();
  redistribute(s, 0, 3);
  const target = s.players.find(
    (p) => p.id !== s.president && p.role !== "hitler",
  )!;
  s = act(s, s.president, { type: "nominate", target: target.id });
  s = vote(s);
  assert(s.players.find((p) => p.id === target.id)?.notHitler);
});
test("공식 PDF: 입법 종료 직후 3장 미만이면 권한 행사 전에 재셔플", () => {
  let s = elected();
  redistribute(s, 0, 2, ["fascist", "liberal"]);
  s.phase = "chancellor_enact";
  s.discard = s.deck.splice(2);
  assert.equal(s.deck.length, 2);
  s = act(s, s.chancellor!, { type: "enact", index: 0 });
  assert.equal(s.phase, "executive");
  assert.equal(s.power, "peek");
  assert.equal(s.discard.length, 0);
  assert.equal(s.deck.length, 14);
});
test("입법 중 채팅 잠금, 비정부 참가자는 대화 가능 / 투표는 동시 공개", () => {
  let s = prepared();
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  s = act(s, s.president, { type: "vote", ja: false });
  const v = gameView(s, null);
  assert(!("votes" in v));
  assert(!v.events.some((e) => e.votes));
  s = elected();
  assert(!canChat(s, s.president));
  assert(!canChat(s, s.chancellor!));
  assert(
    canChat(
      s,
      s.players.find((p) => p.id !== s.president && p.id !== s.chancellor)!.id,
    ),
  );
});
test("개인 뷰 페이로드는 역할·더미·버린 정책·비공개 로그를 유출하지 않음", () => {
  const s = elected();
  const observer = s.players.find(
    (p) => p.id !== s.president && p.id !== s.chancellor,
  )!;
  const v = gameView(s, observer.id);
  assert.equal(v.hand, undefined);
  assert.equal(v.replay, undefined);
  assert.equal(v.revealedRoles, undefined);
  for (const p of v.players) assert(!("role" in p));
  for (const key of ["deck", "discard", "secrets", "privateResults", "votes"])
    assert(!(key in v));
  assert.equal(gameView(s, s.president).hand?.length, 3);
  assert.equal(gameView(s, s.chancellor!).hand, undefined);
});
test("불법 행동은 원본을 변경하지 않음, 중복 투표와 역할 확인 거절", () => {
  const s = make();
  const before = structuredClone(s);
  assert.throws(() => act(s, s.president, { type: "discard", index: 0 }));
  assert.deepEqual(s, before);
  const a = act(s, s.president, { type: "acknowledge" });
  assert.throws(() => act(a, s.president, { type: "acknowledge" }));
});
test("입력 객체의 여분 내부 필드는 게임 생성과 뷰에서 제거", () => {
  const input = players().map((p) => ({
    ...p,
    tokenHash: "PRIVATE_SESSION_HASH",
    internal: "PRIVATE_VALUE",
  }));
  const s = createGame(input, rng);
  assert(!JSON.stringify(s.players).includes("PRIVATE_"));
  (s.players[0] as any).tokenHash = "PRIVATE_SESSION_HASH";
  assert(!JSON.stringify(gameView(s, null)).includes("PRIVATE_SESSION_HASH"));
});
test("특별 선거 가결·입법 종료 및 승인된 거부권 뒤 원래 순서 복귀", () => {
  for (const veto of [false, true]) {
    let s = prepared(7);
    s.phase = "executive";
    s.power = "special_election";
    s.president = "p0";
    s = act(s, "p0", { type: "power", target: "p4" });
    s = act(s, "p4", { type: "nominate", target: eligibleChancellors(s)[0] });
    s = vote(s);
    // Avoid Hitler-election victory; set the policy state after the election.
    if (veto) {
      redistribute(s, 0, 5, ["liberal", "fascist"]);
      s.phase = "chancellor_enact";
      s = act(s, s.chancellor!, { type: "request_veto" });
      s = act(s, s.president, { type: "answer_veto", accept: true });
    } else {
      redistribute(s, 0, 0, ["liberal", "liberal"]);
      s.phase = "chancellor_enact";
      s = act(s, s.chancellor!, { type: "enact", index: 0 });
    }
    assert.equal(s.president, "p1");
    assert.equal(s.specialResume, null);
  }
});
test("혼란 후 잔여 2장도 즉시 재셔플, 혼란 정책도 승리 판정", () => {
  let s = prepared();
  redistribute(s, 0, 0);
  s.discard = s.deck.splice(3);
  s.tracker = 2;
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  s = vote(s, false);
  assert.equal(s.discard.length, 0);
  assert.equal(s.deck.length, 16);
  s = prepared();
  redistribute(s, 4, 0);
  s.deck.sort((a, b) => (a === "liberal" ? -1 : 1));
  s.tracker = 2;
  s = act(s, s.president, {
    type: "nominate",
    target: eligibleChancellors(s)[0],
  });
  s = vote(s, false);
  assert.equal(s.winner, "liberal");
});
