import { HEROES } from "../shared/data";
import { reduce, tacticalOutcome } from "../shared/engine";
import type { Action, Game, GameView } from "../shared/types";

// Board-only previews never advance a turn or use the opponent's private inventory.
export function previewAction(view: GameView, id: string, action: Action) {
  const game: Game = {
    ...view, seed: 1, replayEnabled: false,
    pool: Object.fromEntries(HEROES.map(h => [h.id, 0])),
    players: view.players.map(p => ({ ...p, bench: p.bench ?? [], shop: p.shop ?? [], choices: p.choices ?? [], barred: p.id === id ? Object.fromEntries(view.barredCells.map(c => [c, view.ply + 1])) : {} })),
  };
  try {
    const after = reduce(game, id, action, 0);
    const changes = after.board.flatMap((s, cell) => JSON.stringify(s) !== JSON.stringify(game.board[cell]) ? [cell] : []);
    return { legal: true as const, changes, messages: tacticalOutcome(game, after, id), error: "" };
  } catch (error) {
    return { legal: false as const, changes: [] as number[], messages: [] as string[], error: error instanceof Error ? error.message : "사용할 수 없는 대상입니다." };
  }
}

export function skillTargets(view: GameView, id: string, source: number, target: number | null) {
  const stone = view.board[source];
  if (!stone) return new Set<number>();
  const hero = HEROES.find(h => h.id === stone.hero);
  const candidates = view.board.flatMap((s, c) => {
    if (hero?.op === "push" && target !== null) return !s ? [c] : [];
    if (["push", "seal", "remove", "judge"].includes(hero?.op ?? "")) return s && s.owner !== id ? [c] : [];
    return [c];
  });
  return new Set(candidates.filter(c => {
    if (hero?.op === "push" && target === null) {
      return view.board.some((s, d) => !s && Math.max(Math.abs(d % 13 - c % 13), Math.abs(Math.floor(d / 13) - Math.floor(c / 13))) === 1 && previewAction(view, id, { type: "skill", source, target: c, destination: d }).legal);
    }
    return previewAction(view, id, { type: "skill", source, target: hero?.op === "push" ? target ?? c : c, ...(hero?.op === "push" && target !== null ? { destination: c } : {}) }).legal;
  }));
}
