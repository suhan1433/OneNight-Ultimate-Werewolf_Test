import { forensicId, NIGHT, presenterId, roleId } from "./engine.js";
import type { GameState, GameView, PrivateIntel } from "./types.js";

/** An allowlist, never {...state}: internal roles, deck and PRNG cannot escape. */
export function project(state: GameState, playerId: string): GameView {
  const role = state.roles[playerId];
  if (!state.players.some((p) => p.id === playerId) || !role)
    throw new Error("UNKNOWN_PLAYER");
  const intel: PrivateIntel = { myRole: role };
  if (state.solveLock?.playerId === playerId) intel.isSolving = true;
  const elapsed =
    state.nightStartedAt === null ? -1 : state.now - state.nightStartedAt;
  if (elapsed >= NIGHT.introMs) {
    if (["forensic", "murderer", "accomplice"].includes(role)) {
      intel.murdererId = roleId(state, "murderer")!;
      const accomplice = roleId(state, "accomplice");
      if (accomplice) intel.accompliceId = accomplice;
      if (state.solution) intel.solution = structuredClone(state.solution);
    }
    if (role === "witness" && elapsed >= NIGHT.introMs + NIGHT.crimeMs)
      intel.witnessCandidates = [...state.witnessCandidates];
  }
  const sceneVisible = !["DEAL", "ROLE_REVEAL", "CRIME_NIGHT"].includes(
    state.phase,
  );
  const result = state.phase === "RESULT";
  const view: GameView = {
    startedAt: state.startedAt,
    phase: state.phase,
    round: state.round,
    version: state.version,
    settings: structuredClone(state.settings),
    players: structuredClone(state.players),
    forensicId: forensicId(state),
    tiles: sceneVisible ? structuredClone(state.tiles) : [],
    markers: sceneVisible ? { ...state.markers } : {},
    pendingTile:
      role === "forensic" ? structuredClone(state.pendingTile) : null,
    presenterId: presenterId(state),
    presentationOrder: [...state.presentationOrder],
    timer: { ...state.timer },
    nightStartedAt: state.nightStartedAt,
    solveLock: state.solveLock
      ? { expiresAt: state.solveLock.expiresAt }
      : null,
    winner: state.winner,
    reason: state.reason,
    history: state.history.map((entry) => {
      if (result) return structuredClone(entry);
      const { solution: _solution, ...safe } = entry;
      return { ...safe };
    }),
    private: intel,
  };
  if (result) {
    view.revealedRoles = { ...state.roles };
    if (state.solution) view.solution = { ...state.solution };
  }
  return view;
}

/** The authenticated server checks this before accepting chat OR reactions. */
export function canChat(
  state: GameState,
  playerId: string,
  channel: "public" | "criminals" = "public",
): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.connected || player.departed) return false;
  const role = state.roles[playerId];
  if (channel === "criminals")
    return (
      state.phase === "REVERSAL" &&
      (role === "murderer" || role === "accomplice")
    );
  if (state.phase === "RESULT") return true;
  if (role === "forensic") return false;
  if (state.phase === "ROUND_TRANSITION") return true;
  if (state.phase === "EVIDENCE_COLLECTION")
    return Object.keys(state.markers).length > 0;
  return state.phase === "PRESENTATION" && presenterId(state) === playerId;
}
