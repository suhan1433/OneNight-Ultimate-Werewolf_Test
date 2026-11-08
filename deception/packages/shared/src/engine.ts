import { content } from "./content.js";
import { seedOf, shuffle } from "./rng.js";
import { commandSchema, settingsSchema } from "./schemas.js";
import type {
  Command,
  GameState,
  Player,
  Role,
  SceneTile,
  Settings,
  Solution,
  Team,
} from "./types.js";

export const SYSTEM = "$server";
export const NIGHT = {
  introMs: 3_000,
  crimeMs: 25_000,
  witnessMs: 10_000,
  closingMs: 2_000,
} as const;
const NIGHT_END = 40_000;
export class RuleError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RuleError";
  }
}
function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RuleError(code);
}
export function defaultSettings(count: number): Settings {
  return {
    cardsPerKind: 4,
    events: false,
    presentationSeconds: 30,
    accomplice: count >= 6,
    witness: count >= 8,
  };
}
export function roleSet(count: number, settings: Settings): Role[] {
  requireRule(
    Number.isInteger(count) && count >= 4 && count <= 12,
    "PLAYER_COUNT",
  );
  settingsSchema.parse(settings);
  requireRule(
    count >= 6 || (!settings.accomplice && !settings.witness),
    "ROLE_COUNT",
  );
  const roles: Role[] = ["forensic", "murderer"];
  if (settings.accomplice) roles.push("accomplice");
  if (settings.witness) roles.push("witness");
  while (roles.length < count) roles.push("investigator");
  return roles;
}
export function forensicId(state: GameState): string {
  return state.players.find((p) => state.roles[p.id] === "forensic")!.id;
}
export function roleId(state: GameState, role: Role): string | undefined {
  return state.players.find((p) => state.roles[p.id] === role)?.id;
}
export function presenterId(state: GameState): string | null {
  return state.phase === "PRESENTATION"
    ? (state.presentationOrder[state.presentationIndex] ?? null)
    : null;
}
export function createGame(input: {
  players: { id: string; name: string }[];
  seed: string;
  now: number;
  settings?: Settings;
  forensicId?: string;
}): GameState {
  const settings = settingsSchema.parse(
    input.settings ?? defaultSettings(input.players.length),
  );
  let roles = roleSet(input.players.length, settings);
  requireRule(Number.isFinite(input.now) && input.now >= 0, "INVALID_TIME");
  requireRule(input.seed.length > 0, "INVALID_SEED");
  requireRule(
    new Set(input.players.map((p) => p.id)).size === input.players.length,
    "DUPLICATE_PLAYER",
  );
  requireRule(
    input.players.every(
      (p) =>
        p.id.length > 0 &&
        p.id.length <= 100 &&
        p.id !== SYSTEM &&
        p.name.trim().length > 0 &&
        p.name.length <= 30,
    ),
    "INVALID_PLAYER",
  );
  let rng = seedOf(input.seed);
  let seated: typeof input.players;
  [seated, rng] = shuffle(input.players, rng);
  [roles, rng] = shuffle(roles, rng);
  if (input.forensicId !== undefined) {
    const selected = seated.findIndex((p) => p.id === input.forensicId);
    requireRule(selected >= 0, "UNKNOWN_FORENSIC");
    const previous = roles.indexOf("forensic");
    [roles[selected], roles[previous]] = [roles[previous]!, roles[selected]!];
  }
  let clues, means, hints;
  [clues, rng] = shuffle(
    content.cards.filter((c) => c.kind === "clue"),
    rng,
  );
  [means, rng] = shuffle(
    content.cards.filter((c) => c.kind === "means"),
    rng,
  );
  [hints, rng] = shuffle(
    content.tiles.filter((t) => t.kind === "hint"),
    rng,
  );
  const roleMap: Record<string, Role> = Object.fromEntries(
    seated.map((p, i) => [p.id, roles[i]!]),
  );
  const players: Player[] = seated.map((p, seat) => ({
    ...p,
    name: p.name.trim(),
    seat,
    connected: true,
    departed: false,
    hasBadge: roleMap[p.id] !== "forensic",
    cards:
      roleMap[p.id] === "forensic"
        ? []
        : [
            ...clues.splice(0, settings.cardsPerKind),
            ...means.splice(0, settings.cardsPerKind),
          ],
  }));
  const forensicSeat = players.find((p) => roleMap[p.id] === "forensic")!.seat;
  const order = [...players]
    .sort(
      (a, b) =>
        ((a.seat - forensicSeat + players.length) % players.length) -
        ((b.seat - forensicSeat + players.length) % players.length),
    )
    .filter((p) => roleMap[p.id] !== "forensic")
    .map((p) => p.id);
  let candidates;
  [candidates, rng] = shuffle(
    players
      .filter((p) => ["murderer", "accomplice"].includes(roleMap[p.id]!))
      .map((p) => p.id),
    rng,
  );
  return {
    startedAt: input.now,
    phase: "DEAL",
    round: 1,
    version: 0,
    now: input.now,
    rng,
    settings,
    players,
    roles: roleMap,
    confirmed: [],
    solution: null,
    witnessCandidates: candidates,
    nightStartedAt: null,
    tiles: structuredClone([
      content.tiles.find((t) => t.kind === "location")!,
      content.tiles.find((t) => t.kind === "cause")!,
      ...hints.splice(0, 4),
    ]) as SceneTile[],
    deck: structuredClone(hints) as SceneTile[],
    markers: {},
    pendingTile: null,
    presentationOrder: order,
    presentationIndex: 0,
    timer: { deadline: input.now + 3_000 },
    eventsAdded: false,
    roundPresentationSeconds: settings.presentationSeconds,
    solveLock: null,
    winner: null,
    reason: null,
    history: [],
    processedCommands: [],
  };
}

function finish(state: GameState, team: Team, reason: string): void {
  // Early departures can exhaust badges before the crime window has completed.
  fallbackSolution(state);
  state.phase = "RESULT";
  state.winner = team;
  state.reason = reason;
  state.timer.deadline = null;
  state.solveLock = null;
  state.history.push({
    type: "result",
    at: state.now,
    round: state.round,
    team,
  });
}

/** Explicit departure differs from a temporary disconnect and forfeits the badge. */
export function departPlayer(
  input: GameState,
  playerId: string,
  now: number,
): GameState {
  const state = tick(input, now);
  const player = state.players.find((p) => p.id === playerId);
  requireRule(player, "INVALID_ACTOR");
  player.connected = false;
  player.departed = true;
  player.hasBadge = false;
  if (state.phase !== "RESULT") {
    if (state.solveLock?.playerId === playerId) restoreSolve(state);
    if (presenterId(state) === playerId) endPresentation(state);
    if (!state.winner) checkBadges(state);
  }
  state.version++;
  return state;
}
function checkBadges(state: GameState): void {
  if (!state.players.some((p) => p.hasBadge))
    finish(state, "criminals", "BADGES_EXHAUSTED");
}
function startPresentationTimer(state: GameState): void {
  state.timer.deadline =
    state.roundPresentationSeconds === null
      ? null
      : state.now + state.roundPresentationSeconds * 1000;
}
function beginPresentations(state: GameState): void {
  state.phase = "PRESENTATION";
  state.presentationIndex = 0;
  while (
    state.presentationIndex < state.presentationOrder.length &&
    state.players.find(
      (p) => p.id === state.presentationOrder[state.presentationIndex],
    )!.departed
  )
    state.presentationIndex++;
  startPresentationTimer(state);
}
function drawReplacement(state: GameState): void {
  state.phase = "ROUND_TRANSITION";
  state.timer.deadline = null;
  state.roundPresentationSeconds = state.settings.presentationSeconds;
  if (state.settings.events && !state.eventsAdded) {
    [state.deck, state.rng] = shuffle(
      [
        ...state.deck,
        ...(structuredClone(
          content.tiles.filter((t) => t.kind === "event"),
        ) as SceneTile[]),
      ],
      state.rng,
    );
    state.eventsAdded = true;
  }
  let tile = state.deck.shift();
  while (tile?.kind === "event") {
    state.history.push({
      type: "event",
      at: state.now,
      round: state.round,
      tileId: tile.id,
    });
    if (tile.effect === "untimed") state.roundPresentationSeconds = null;
    else if (state.roundPresentationSeconds !== null)
      state.roundPresentationSeconds = Math.max(
        10,
        state.roundPresentationSeconds +
          (tile.effect === "lengthen" ? 10 : -10),
      );
    tile = state.deck.shift();
  }
  requireRule(tile?.kind === "hint", "EMPTY_SCENE_DECK");
  state.pendingTile = tile;
}
function endPresentation(state: GameState): void {
  const current = state.presentationOrder[state.presentationIndex];
  if (current)
    state.history.push({
      type: "presentation",
      at: state.now,
      round: state.round,
      playerId: current,
    });
  do {
    state.presentationIndex++;
  } while (
    state.presentationIndex < state.presentationOrder.length &&
    state.players.find(
      (p) => p.id === state.presentationOrder[state.presentationIndex],
    )!.departed
  );
  if (state.presentationIndex < state.presentationOrder.length)
    startPresentationTimer(state);
  else if (state.round === 3) {
    state.players.forEach((p) => {
      p.hasBadge = false;
    });
    finish(state, "criminals", "FINAL_PRESENTATION_ENDED");
  } else {
    state.round++;
    drawReplacement(state);
  }
}
function restoreSolve(state: GameState): void {
  const lock = state.solveLock!;
  state.phase = lock.previousPhase;
  state.timer.deadline =
    lock.remainingMs === null ? null : state.now + lock.remainingMs;
  state.solveLock = null;
}
function fallbackSolution(state: GameState): void {
  if (state.solution) return;
  const murderer = state.players.find((p) => state.roles[p.id] === "murderer")!;
  let cards;
  [cards, state.rng] = shuffle(murderer.cards, state.rng);
  state.solution = {
    murdererId: murderer.id,
    clueId: cards.find((c) => c.kind === "clue")!.id,
    meansId: cards.find((c) => c.kind === "means")!.id,
  };
}

/** Trusted scheduler entry point. Clock is supplied by the server, never the client. */
export function tick(input: GameState, now: number): GameState {
  requireRule(Number.isFinite(now) && now >= input.now, "CLOCK_REWIND");
  const state = structuredClone(input);
  state.now = now;
  const before = state.phase;
  if (state.phase === "CRIME_NIGHT") {
    const elapsed = now - state.nightStartedAt!;
    if (elapsed >= NIGHT.introMs + NIGHT.crimeMs) fallbackSolution(state);
    if (elapsed >= NIGHT_END) {
      state.phase = "SCENE_INTRO";
      state.timer.deadline = null;
    }
  } else if (state.phase === "SOLVING" && now >= state.solveLock!.expiresAt)
    restoreSolve(state);
  else if (state.timer.deadline !== null && now >= state.timer.deadline) {
    if (state.phase === "DEAL") {
      state.phase = "ROLE_REVEAL";
      state.timer.deadline = null;
    } else if (
      state.phase === "EVIDENCE_COLLECTION" &&
      Object.keys(state.markers).length === 6
    )
      beginPresentations(state);
    else if (state.phase === "PRESENTATION") endPresentation(state);
    else if (state.phase === "REVERSAL")
      finish(state, "investigators", "REVERSAL_TIMEOUT");
  }
  if (
    state.phase !== before ||
    state.presentationIndex !== input.presentationIndex ||
    state.round !== input.round
  )
    state.version++;
  return state;
}

/** Pure reducer. Actor identity must come from the authenticated socket session. */
export function applyCommand(
  input: GameState,
  untrusted: Command,
  now: number,
): GameState {
  const command = commandSchema.parse(untrusted);
  const state = tick(input, now);
  const { actorId, action } = command;
  const receipt = JSON.stringify([actorId, command.id]);
  if (state.processedCommands.includes(receipt)) return state;
  requireRule(state.phase !== "RESULT", "GAME_ENDED");
  const player = state.players.find((p) => p.id === actorId);
  const server = actorId === SYSTEM;
  requireRule(
    server || (player?.connected && !player.departed),
    "INVALID_ACTOR",
  );
  const role = state.roles[actorId];
  const forensic = role === "forensic";
  switch (action.type) {
    case "advance":
      requireRule(server, "SERVER_ONLY");
      break;
    case "confirmRole":
      requireRule(player && state.phase === "ROLE_REVEAL", "INVALID_PHASE");
      if (!state.confirmed.includes(actorId)) state.confirmed.push(actorId);
      if (state.confirmed.length === state.players.length) {
        state.phase = "CRIME_NIGHT";
        state.nightStartedAt = now;
        state.timer.deadline = now + NIGHT_END;
      }
      break;
    case "crimeSelect": {
      requireRule(
        role === "murderer" && state.phase === "CRIME_NIGHT",
        "INVALID_ROLE_OR_PHASE",
      );
      const elapsed = now - state.nightStartedAt!;
      requireRule(
        elapsed >= NIGHT.introMs && elapsed < NIGHT.introMs + NIGHT.crimeMs,
        "NIGHT_WINDOW",
      );
      requireRule(!state.solution, "SOLUTION_LOCKED");
      requireRule(
        player!.cards.some(
          (c) => c.id === action.clueId && c.kind === "clue",
        ) &&
          player!.cards.some(
            (c) => c.id === action.meansId && c.kind === "means",
          ),
        "INVALID_CARDS",
      );
      state.solution = {
        murdererId: actorId,
        clueId: action.clueId,
        meansId: action.meansId,
      };
      break;
    }
    case "chooseLocation": {
      requireRule(
        forensic && state.phase === "SCENE_INTRO",
        "INVALID_ROLE_OR_PHASE",
      );
      const tile = content.tiles.find(
        (t) => t.id === action.tileId && t.kind === "location",
      );
      requireRule(tile, "INVALID_TILE");
      state.tiles[0] = structuredClone(tile) as SceneTile;
      state.phase = "EVIDENCE_COLLECTION";
      break;
    }
    case "placeMarker": {
      requireRule(
        forensic && state.phase === "EVIDENCE_COLLECTION",
        "INVALID_ROLE_OR_PHASE",
      );
      requireRule(
        state.tiles.some((t) => t.id === action.tileId),
        "INVALID_TILE",
      );
      requireRule(
        state.markers[action.tileId] === undefined,
        "MARKER_IMMUTABLE",
      );
      state.markers[action.tileId] = action.option;
      state.history.push({
        type: "marker",
        at: now,
        round: state.round,
        tileId: action.tileId,
        option: action.option,
      });
      if (Object.keys(state.markers).length === 6)
        state.timer.deadline = now + 10_000;
      break;
    }
    case "beginPresentations":
      requireRule(
        (forensic || server) &&
          state.phase === "EVIDENCE_COLLECTION" &&
          Object.keys(state.markers).length === 6,
        "INVALID_PHASE",
      );
      beginPresentations(state);
      break;
    case "endPresentation":
      requireRule(
        state.phase === "PRESENTATION" && actorId === presenterId(state),
        "NOT_PRESENTER",
      );
      endPresentation(state);
      break;
    case "replaceTile": {
      requireRule(
        forensic && state.phase === "ROUND_TRANSITION" && state.pendingTile,
        "INVALID_ROLE_OR_PHASE",
      );
      const index = state.tiles.findIndex(
        (t) => t.id === action.tileId && t.kind === "hint",
      );
      requireRule(index >= 0, "PROTECTED_TILE");
      delete state.markers[action.tileId];
      state.tiles[index] = state.pendingTile;
      state.pendingTile = null;
      state.phase = "EVIDENCE_COLLECTION";
      state.history.push({
        type: "replace",
        at: now,
        round: state.round,
        tileId: state.tiles[index]!.id,
      });
      break;
    }
    case "startSolve":
      requireRule(player?.hasBadge && !forensic, "NO_BADGE");
      requireRule(
        state.phase === "EVIDENCE_COLLECTION" ||
          state.phase === "PRESENTATION" ||
          state.phase === "ROUND_TRANSITION",
        "SOLVE_LOCKED",
      );
      state.solveLock = {
        playerId: actorId,
        expiresAt: now + 20_000,
        previousPhase: state.phase,
        remainingMs:
          state.timer.deadline === null ? null : state.timer.deadline - now,
      };
      state.phase = "SOLVING";
      state.timer.deadline = null;
      break;
    case "cancelSolve":
      requireRule(
        state.phase === "SOLVING" && state.solveLock?.playerId === actorId,
        "NOT_SOLVER",
      );
      restoreSolve(state);
      break;
    case "commitSolve": {
      requireRule(
        state.phase === "SOLVING" &&
          state.solveLock?.playerId === actorId &&
          player?.hasBadge,
        "NOT_SOLVER",
      );
      const target = state.players.find((p) => p.id === action.targetId);
      requireRule(
        target &&
          target.id !== actorId &&
          state.roles[target.id] !== "forensic",
        "INVALID_TARGET",
      );
      requireRule(
        target.cards.some((c) => c.id === action.clueId && c.kind === "clue") &&
          target.cards.some(
            (c) => c.id === action.meansId && c.kind === "means",
          ),
        "INVALID_CARDS",
      );
      const guess: Solution = {
        murdererId: target.id,
        clueId: action.clueId,
        meansId: action.meansId,
      };
      const correct =
        state.solution?.murdererId === target.id &&
        state.solution.clueId === guess.clueId &&
        state.solution.meansId === guess.meansId;
      player.hasBadge = false;
      state.history.push({
        type: "solve",
        at: now,
        round: state.round,
        playerId: actorId,
        correct,
        solution: guess,
      });
      restoreSolve(state);
      if (correct && state.settings.witness) {
        state.phase = "REVERSAL";
        state.timer.deadline = now + 60_000;
      } else if (correct) finish(state, "investigators", "SOLVED");
      else checkBadges(state);
      break;
    }
    case "reversalPick":
      requireRule(
        state.phase === "REVERSAL" && role === "murderer",
        "INVALID_ROLE_OR_PHASE",
      );
      requireRule(
        state.players.some(
          (p) =>
            p.id === action.targetId &&
            ["witness", "investigator"].includes(state.roles[p.id]!),
        ),
        "INVALID_TARGET",
      );
      finish(
        state,
        state.roles[action.targetId] === "witness"
          ? "criminals"
          : "investigators",
        state.roles[action.targetId] === "witness"
          ? "WITNESS_IDENTIFIED"
          : "WITNESS_SURVIVED",
      );
      break;
  }
  state.processedCommands.push(receipt);
  // Private confirmations/selections must not produce public version signals.
  if (
    action.type !== "crimeSelect" &&
    (action.type !== "confirmRole" || state.phase === "CRIME_NIGHT")
  )
    state.version++;
  return state;
}
