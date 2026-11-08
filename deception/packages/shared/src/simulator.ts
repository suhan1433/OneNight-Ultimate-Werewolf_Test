import {
  applyCommand,
  createGame,
  forensicId,
  presenterId,
  roleId,
  tick,
} from "./engine.js";
import type { Action, GameState, Settings, Team } from "./types.js";

export type Scenario =
  | "solved"
  | "exhausted"
  | "final-round"
  | "reversal-win"
  | "reversal-loss"
  | "reversal-timeout";
export interface SimulationResult {
  players: number;
  seed: string;
  scenario: Scenario;
  winner: Team;
  steps: number;
  state: GameState;
}
/** Omniscient test driver. Never include this module's state in a client payload. */
export function simulate(input: {
  players: number;
  seed: string;
  scenario: Scenario;
  settings?: Settings;
}): SimulationResult {
  let state = createGame({
    players: Array.from({ length: input.players }, (_, i) => ({
      id: `p${i}`,
      name: `수사관${i + 1}`,
    })),
    seed: input.seed,
    now: 0,
    ...(input.settings ? { settings: input.settings } : {}),
  });
  let steps = 0;
  const send = (actorId: string, action: Action) => {
    state = applyCommand(
      state,
      { id: `sim-${steps++}`, actorId, action },
      state.now,
    );
  };
  const wait = (now: number) => {
    state = tick(state, now);
    steps++;
  };
  wait(3_000);
  for (const p of state.players) send(p.id, { type: "confirmRole" });
  wait(state.nightStartedAt! + 3_000);
  const murderer = state.players.find((p) => state.roles[p.id] === "murderer")!;
  send(murderer.id, {
    type: "crimeSelect",
    clueId: murderer.cards.find((c) => c.kind === "clue")!.id,
    meansId: murderer.cards.find((c) => c.kind === "means")!.id,
  });
  wait(state.nightStartedAt! + 40_000);
  send(forensicId(state), {
    type: "chooseLocation",
    tileId: state.tiles[0]!.id,
  });
  wait(state.now + 3_000);
  const reversal = input.scenario.startsWith("reversal-");
  if (reversal && !state.settings.witness)
    throw new Error("REVERSAL_REQUIRES_WITNESS");
  while (state.phase !== "RESULT" && steps < 500) {
    if (state.phase === "EVIDENCE_COLLECTION") {
      for (const tile of state.tiles)
        if (state.markers[tile.id] === undefined)
          send(forensicId(state), {
            type: "placeMarker",
            tileId: tile.id,
            option: state.round % 6,
          });
      if (input.scenario === "solved" || reversal) {
        const solver = state.players.find(
          (p) => p.id !== murderer.id && state.roles[p.id] !== "forensic",
        )!;
        send(solver.id, { type: "startSolve" });
        send(solver.id, {
          type: "commitSolve",
          targetId: murderer.id,
          clueId: state.solution!.clueId,
          meansId: state.solution!.meansId,
        });
      } else if (input.scenario === "exhausted") {
        for (const solver of state.players.filter((p) => p.hasBadge)) {
          const target = state.players.find(
            (p) =>
              p.id !== solver.id &&
              state.roles[p.id] !== "forensic" &&
              p.id !== murderer.id,
          )!;
          send(solver.id, { type: "startSolve" });
          send(solver.id, {
            type: "commitSolve",
            targetId: target.id,
            clueId: target.cards.find((c) => c.kind === "clue")!.id,
            meansId: target.cards.find((c) => c.kind === "means")!.id,
          });
        }
      } else {
        for (const p of state.players.filter((p) => !p.departed))
          send(p.id, { type: "beginPresentations" });
      }
    } else if (state.phase === "PRESENTATION") {
      send(presenterId(state)!, { type: "endPresentation" });
    } else if (state.phase === "ROUND_TRANSITION") {
      send(forensicId(state), {
        type: "replaceTile",
        tileId: state.tiles.find((t) => t.kind === "hint")!.id,
      });
    } else if (state.phase === "REVERSAL") {
      if (input.scenario === "reversal-timeout") wait(state.now + 60_000);
      else
        send(murderer.id, {
          type: "reversalPick",
          targetId: roleId(
            state,
            input.scenario === "reversal-win" ? "witness" : "investigator",
          )!,
        });
    } else throw new Error(`SIMULATOR_STUCK: ${state.phase}`);
  }
  if (!state.winner) throw new Error("SIMULATION_DID_NOT_FINISH");
  return {
    players: input.players,
    seed: input.seed,
    scenario: input.scenario,
    winner: state.winner,
    steps,
    state,
  };
}
