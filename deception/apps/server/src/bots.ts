import { randomInt } from "node:crypto";
import { NIGHT, type Action, type GameView } from "@deception/shared";

const pick = <T>(items: T[]): T | undefined =>
  items.length ? items[randomInt(items.length)] : undefined;

/** A flow-testing bot. Decisions use only this player's projected information. */
export function botAction(view: GameView, playerId: string, now: number): Action | null {
  const me = view.players.find((p) => p.id === playerId);
  if (!me || me.departed) return null;
  const role = view.private.myRole;
  if (view.phase === "ROLE_REVEAL") return { type: "confirmRole" };
  if (view.phase === "CRIME_NIGHT" && role === "murderer" && !view.private.solution) {
    const elapsed = now - view.nightStartedAt!;
    if (elapsed >= NIGHT.introMs && elapsed < NIGHT.introMs + NIGHT.crimeMs)
      return {
        type: "crimeSelect",
        clueId: pick(me.cards.filter((c) => c.kind === "clue"))!.id,
        meansId: pick(me.cards.filter((c) => c.kind === "means"))!.id,
      };
  }
  if (role === "forensic") {
    if (view.phase === "SCENE_INTRO")
      return { type: "chooseLocation", tileId: view.tiles.find((t) => t.kind === "location")!.id };
    if (view.phase === "EVIDENCE_COLLECTION") {
      const tile = view.tiles.find((t) => view.markers[t.id] === undefined);
      if (tile) return { type: "placeMarker", tileId: tile.id, option: randomInt(tile.options.length) };
    }
    if (view.phase === "ROUND_TRANSITION")
      return { type: "replaceTile", tileId: pick(view.tiles.filter((t) => t.kind === "hint"))!.id };
  }
  if (view.phase === "PRESENTATION" && view.presenterId === playerId) {
    if (view.round === 3 && me.hasBadge) return { type: "startSolve" };
    return { type: "endPresentation" };
  }
  if (view.phase === "SOLVING" && view.private.isSolving) {
    const target = pick(view.players.filter((p) => p.id !== playerId && p.id !== view.forensicId))!;
    return {
      type: "commitSolve", targetId: target.id,
      clueId: pick(target.cards.filter((c) => c.kind === "clue"))!.id,
      meansId: pick(target.cards.filter((c) => c.kind === "means"))!.id,
    };
  }
  if (view.phase === "REVERSAL" && role === "murderer") {
    const target = pick(view.players.filter((p) =>
      p.id !== playerId && p.id !== view.forensicId && p.id !== view.private.accompliceId));
    if (target) return { type: "reversalPick", targetId: target.id };
  }
  return null;
}
