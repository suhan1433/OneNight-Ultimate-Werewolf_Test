import { randomUUID } from 'node:crypto';
import { NIGHT_ROLES, ROLE_DEFINITIONS, WOLF_ROLES, type ClientGameState, type Faction, type GameResult, type NightAction, type NightCommand, type Player, type RoleType, type Room } from '@werewolf/shared';

export function shuffleRoles<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!]; }
  return result;
}

export function assignRoles(players: Player[], selectedRoles: RoleType[], random = Math.random) {
  if (selectedRoles.length !== players.length + 3) throw new Error('역할 카드는 인원수 + 3장이어야 합니다.');
  const deck = shuffleRoles(selectedRoles, random);
  const assigned = players.map((p, index) => ({ ...p, originalRole: deck[index]!, currentRole: deck[index]!, hasConfirmedCard: false, hasActedTonight: false, vote: null }));
  const centerCards = deck.slice(players.length).map((role, index) => ({ id: `center-${index}`, role, originalRole: role }));
  return { players: assigned, centerCards };
}

export function buildNightActionQueue(selectedRoles: RoleType[], players: Player[]): NightAction[] {
  const selected = new Set(selectedRoles);
  return NIGHT_ROLES.filter((r) => selected.has(r.id)).map((r) => ({
    id: randomUUID(), role: r.id, playerIds: players.filter((p) => p.originalRole === r.id).map((p) => p.id), actedPlayerIds: [],
    order: r.nightOrder!, startedAt: 0, expiresAt: 0, status: 'pending'
  }));
}

export function startCurrentAction(room: Room, now = Date.now()): Room {
  const queue = [...room.nightActionQueue];
  const current = queue[room.currentNightActionIndex];
  if (!current) return startDay(room, now);
  // 선택된 역할은 실제 소유자가 없어도 사회자 안내와 추리의 타이밍이
  // 동일해야 한다. 배정 여부를 노출하지 않도록 항상 설정된 제한 시간을 쓴다.
  const duration = room.actionTimeLimitSeconds * 1000;
  queue[room.currentNightActionIndex] = { ...current, status: 'active', startedAt: now, expiresAt: now + duration };
  return { ...room, nightActionQueue: queue, updatedAt: now };
}

// The opening narration is 3.984 seconds. Keep a small transport/rendering
// buffer so every client sees the night intro before the first role appears.
export const NIGHT_INTRO_DURATION_MS = 4_300;

export function startNightIntro(room: Room, now = Date.now()): Room {
  const queue = [...room.nightActionQueue];
  const current = queue[room.currentNightActionIndex];
  if (!current) return startDay(room, now);
  queue[room.currentNightActionIndex] = { ...current, status: 'pending', startedAt: now, expiresAt: now + NIGHT_INTRO_DURATION_MS };
  return { ...room, nightActionQueue: queue, updatedAt: now };
}

export function advanceNight(room: Room, status: 'completed' | 'timeout' | 'skipped', now = Date.now()): Room {
  const queue = [...room.nightActionQueue];
  const action = queue[room.currentNightActionIndex];
  if (action) queue[room.currentNightActionIndex] = { ...action, status };
  const nextIndex = room.currentNightActionIndex + 1;
  const next = { ...room, nightActionQueue: queue, currentNightActionIndex: nextIndex, nightLog: action ? [...room.nightLog, { actionId: action.id, role: action.role, status, at: now }] : room.nightLog, updatedAt: now };
  return nextIndex >= queue.length ? startDay(next, now) : startCurrentAction(next, now);
}

export function validateNightAction(room: Room, playerId: string, actionId: string, command: NightCommand): string | null {
  if (room.phase !== 'night') return '현재 밤 페이즈가 아닙니다.';
  const action = room.nightActionQueue[room.currentNightActionIndex];
  if (!action || action.id !== actionId || action.status !== 'active') return '이미 끝났거나 현재 행동이 아닙니다.';
  if (!action.playerIds.includes(playerId) || action.actedPlayerIds.includes(playerId)) return '현재는 당신의 차례가 아닙니다.';
  const self = room.players.find((p) => p.id === playerId)!;
  const targets = command.targetPlayerIds ?? [];
  if (targets.some((id) => id === playerId || !room.players.some((p) => p.id === id && p.connected))) return '유효하지 않은 대상입니다.';
  if (room.protectedPlayerId && targets.includes(room.protectedPlayerId)) return '방패병이 보호한 카드는 확인하거나 바꿀 수 없습니다.';
  if (new Set(targets).size !== targets.length) return '서로 다른 대상을 선택하세요.';
  if ((command.centerIndexes ?? []).some((i) => i < 0 || i >= 3)) return '유효하지 않은 센터 카드입니다.';
  const role = action.role;
  const exactPlayers = role === 'troublemaker' ? 2 : ['doppelganger','shield_bearer','alpha_wolf','mystic_wolf','robber','journalist'].includes(role) ? 1 : undefined;
  if (exactPlayers !== undefined && targets.length !== exactPlayers) return `${exactPlayers}명의 플레이어를 선택하세요.`;
  if (role === 'seer' && !((targets.length === 1 && !command.centerIndexes?.length) || (targets.length === 0 && command.centerIndexes?.length === 2))) return '플레이어 1명 또는 센터 카드 2장을 선택하세요.';
  if (role === 'apprentice_seer' && command.centerIndexes?.length !== 1) return '센터 카드 1장을 선택하세요.';
  if (role === 'drunk' && command.centerIndexes?.length !== 1) return '센터 카드 1장을 선택하세요.';
  if (role === 'witch') {
    const inspectingOnly = command.type === 'inspect_center' && targets.length === 0 && command.centerIndexes?.length === 1;
    const swappingAfterInspection = command.type === 'swap_center' && targets.length === 1 && command.centerIndexes?.length === 1;
    if (!inspectingOnly && !swappingAfterInspection) return '먼저 센터 카드 1장을 확인한 뒤 교환할 플레이어를 선택하세요.';
    if (swappingAfterInspection) {
      const seen = room.privateResults[playerId];
      if (seen?.kind !== 'witch_seen' || Number(seen.centerIndex) !== command.centerIndexes![0]) return '확인한 센터 카드만 플레이어 카드와 교환할 수 있습니다.';
    }
  }
  if (role === 'werewolf') {
    const wolves = room.players.filter((p) => p.id !== self.id && p.currentRole && WOLF_ROLES.includes(p.currentRole));
    if (!wolves.length && command.type !== 'inspect_center') return '혼자인 늑대는 센터 카드 한 장을 확인하세요.';
    if (!wolves.length && command.centerIndexes?.length !== 1) return '센터 카드 한 장을 선택하세요.';
  }
  return null;
}

export function applyNightAction(room: Room, playerId: string, command: NightCommand): { room: Room; result: Record<string, unknown> } {
  const action = room.nightActionQueue[room.currentNightActionIndex]!;
  const players = room.players.map((p) => ({ ...p }));
  const centers = room.centerCards.map((c) => ({ ...c }));
  const self = players.find((p) => p.id === playerId)!;
  const target = players.find((p) => p.id === command.targetPlayerIds?.[0]);
  const target2 = players.find((p) => p.id === command.targetPlayerIds?.[1]);
  const indexes = command.centerIndexes ?? [];
  let result: Record<string, unknown> = {};
  const shielded = (p?: Player) => p?.id === room.protectedPlayerId;

  switch (action.role) {
    case 'doppelganger': {
      if (!target || shielded(target)) break;
      self.currentRole = target.currentRole; result = { kind: 'copied', targetNickname: target.nickname, role: target.currentRole };
      const copied = target.currentRole && ROLE_DEFINITIONS[target.currentRole];
      if (copied?.canActAtNight && copied.id !== 'doppelganger') {
        const follow: NightAction = { id: randomUUID(), role: copied.id, playerIds: [self.id], actedPlayerIds: [], order: action.order + 0.1, startedAt: 0, expiresAt: 0, status: 'pending', copied: true };
        room = { ...room, nightActionQueue: [...room.nightActionQueue.slice(0, room.currentNightActionIndex + 1), follow, ...room.nightActionQueue.slice(room.currentNightActionIndex + 1)] };
      }
      break;
    }
    case 'shield_bearer': room = { ...room, protectedPlayerId: target?.id ?? null }; result = { kind: 'protected', nickname: target?.nickname }; break;
    case 'werewolf': {
      const wolves = players.filter((p) => p.id !== playerId && p.currentRole && WOLF_ROLES.includes(p.currentRole));
      result = wolves.length
        ? { kind: 'people', title: '함께 깨어난 늑대', people: wolves.map(privateRole) }
        : { kind: 'cards', title: '혼자인 늑대가 확인한 센터 카드', cards: indexes.slice(0, 1).map((i) => ({ label: `센터 카드 ${i + 1}`, role: centers[i]!.role })) };
      break;
    }
    case 'alpha_wolf': if (target && !shielded(target) && !(target.currentRole && WOLF_ROLES.includes(target.currentRole))) { target.currentRole = 'werewolf'; result = { kind: 'alpha_swap', targetNickname: target.nickname }; } break;
    case 'mystic_wolf': case 'journalist': if (target && !shielded(target)) { result = { kind: 'cards', title: action.role === 'mystic_wolf' ? '신비한 늑대가 확인한 카드' : '신문기자가 확인한 카드', cards: [{ label: target.nickname, role: target.currentRole }] }; if (action.role === 'journalist' && target.currentRole && ROLE_DEFINITIONS[target.currentRole].faction === 'village') room = { ...room, publicReveals: [...room.publicReveals, `${target.nickname}님은 마을 진영입니다.`] }; } break;
    case 'minion': result = { kind: 'people', title: '늑대인간', people: players.filter((p) => p.currentRole && WOLF_ROLES.includes(p.currentRole)).map(privateRole) }; break;
    case 'apprentice_tanner': result = { kind: 'people', title: '무두장이', people: players.filter((p) => p.currentRole === 'tanner').map(privateRole) }; break;
    case 'secret_agent': result = { kind: 'people', title: '다른 비밀 요원', people: players.filter((p) => p.id !== playerId && p.currentRole === 'secret_agent').map(privateRole) }; break;
    case 'mason': result = { kind: 'people', title: '다른 프리메이슨', people: players.filter((p) => p.id !== playerId && p.currentRole === 'mason').map(privateRole) }; break;
    case 'seer': if (target && !shielded(target)) result = { kind: 'cards', title: '예언자가 확인한 카드', cards: [{ label: target.nickname, role: target.currentRole }] }; else result = { kind: 'cards', title: '예언자가 확인한 센터 카드', cards: indexes.map((i) => ({ label: `센터 카드 ${i + 1}`, role: centers[i]!.role })) }; break;
    case 'apprentice_seer': result = { kind: 'cards', title: '견습 예언자가 확인한 센터 카드', cards: indexes.map((i) => ({ label: `센터 카드 ${i + 1}`, role: centers[i]!.role })) }; break;
    case 'robber': if (target && !shielded(target)) { const myOldRole = self.currentRole; const targetOldRole = target.currentRole; [self.currentRole, target.currentRole] = [targetOldRole, myOldRole]; result = { kind: 'robber_swap', targetNickname: target.nickname, myNewRole: self.currentRole, targetNewRole: target.currentRole }; } break;
    case 'witch': {
      const center = centers[indexes[0]!]!;
      if (!target) { result = { kind: 'witch_seen', centerIndex: indexes[0]!, seenRole: center.role }; break; }
      if (!shielded(target)) { const seenRole = center.role; [center.role, target.currentRole] = [target.currentRole!, center.role]; result = { kind: 'witch_swap', targetNickname: target.nickname, seenRole }; }
      break;
    }
    case 'troublemaker': if (target && target2 && !shielded(target) && !shielded(target2)) { [target.currentRole, target2.currentRole] = [target2.currentRole, target.currentRole]; result = { kind: 'troublemaker_swap', firstNickname: target.nickname, secondNickname: target2.nickname }; } break;
    case 'drunk': { const center = centers[indexes[0]!]!; [center.role, self.currentRole] = [self.currentRole!, center.role]; result = { kind: 'drunk_swap', centerIndex: indexes[0]! + 1 }; break; }
    case 'insomniac': result = { kind: 'cards', title: '불면증 환자의 현재 카드', cards: [{ label: '내 카드', role: self.currentRole }] }; break;
    default: result = { kind: 'confirmed' };
  }
  // 마법사의 첫 단계(센터 카드 확인)는 행동을 종료하지 않는다. 결과는 해당
  // 플레이어에게만 저장되고 같은 action 안에서 두 번째 교환 선택으로 이어진다.
  const isWitchInspection = action.role === 'witch' && command.type === 'inspect_center' && !target;
  const queue = room.nightActionQueue.map((a, i) => i === room.currentNightActionIndex && !isWitchInspection ? { ...a, actedPlayerIds: [...a.actedPlayerIds, playerId] } : a);
  return { room: { ...room, players, centerCards: centers, nightActionQueue: queue }, result };
}

// 인물 확인 역할은 '누구인지'만 알면 된다. 역할/ID를 같이 보내면 개발자 도구나
// 잘못된 UI 경로를 통해 불필요한 정보가 노출될 수 있으므로 닉네임만 전송한다.
const privateRole = (p: Player) => ({ nickname: p.nickname });

export function startDay(room: Room, now = Date.now()): Room {
  return { ...room, phase: 'day', dayExpiresAt: now + room.dayTimeLimitSeconds * 1000, updatedAt: now };
}

export function calculateVotes(room: Pick<Room, 'players' | 'votes'>): Record<string, number> {
  const counts = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  const guarded = new Set(room.players.filter((p) => p.currentRole === 'bodyguard').map((p) => room.votes[p.id]).filter(Boolean));
  for (const [voterId, targetId] of Object.entries(room.votes)) {
    if (guarded.has(targetId)) continue;
    counts[targetId] = (counts[targetId] ?? 0) + 1;
  }
  for (const p of room.players) if (p.currentRole === 'prince') counts[p.id] = 0;
  return counts;
}

export function determineExecutions(counts: Record<string, number>): string[] {
  const max = Math.max(0, ...Object.values(counts));
  return max <= 1 ? [] : Object.entries(counts).filter(([, count]) => count === max).map(([id]) => id);
}

export function calculateResult(room: Room): GameResult {
  const players = room.players.map((p) => ({ ...p }));
  for (const cursed of players.filter((p) => p.currentRole === 'cursed')) {
    const wolfVoted = players.some((p) => p.currentRole && WOLF_ROLES.includes(p.currentRole) && room.votes[p.id] === cursed.id);
    if (wolfVoted) cursed.currentRole = 'werewolf';
  }
  const adjusted = { ...room, players };
  const voteCounts = calculateVotes(adjusted);
  const executed = new Set(determineExecutions(voteCounts));
  for (const hunter of players.filter((p) => p.currentRole === 'hunter' && executed.has(p.id))) { const target = room.votes[hunter.id]; if (target) executed.add(target); }
  const executedIds = [...executed];
  const wolves = players.filter((p) => p.currentRole && WOLF_ROLES.includes(p.currentRole));
  const wolfDied = wolves.some((p) => executed.has(p.id));
  const tannerDied = players.some((p) => p.currentRole === 'tanner' && executed.has(p.id));
  const minions = players.filter((p) => p.currentRole === 'minion');
  const winners: Faction[] = [];
  if (tannerDied) winners.push('tanner');
  if ((wolves.length > 0 && wolfDied) || (wolves.length === 0 && executed.size === 0)) winners.push('village');
  if (wolves.length > 0 && !wolfDied && !tannerDied) winners.push('werewolf');
  if (wolves.length === 0 && executed.size > 0 && minions.some((p) => !executed.has(p.id))) winners.push('minion');
  return { winners: [...new Set(winners)], executedIds, voteCounts, votes: room.votes, players: players.map((p) => ({ id: p.id, nickname: p.nickname, originalRole: p.originalRole!, currentRole: p.currentRole! })) };
}

export function buildPlayerGameState(room: Room, playerId: string, actionResults: Record<string, Record<string, unknown>> = {}): ClientGameState {
  const self = room.players.find((p) => p.id === playerId)!;
  const action = room.nightActionQueue[room.currentNightActionIndex] ?? null;
  const isActor = !!action?.playerIds.includes(playerId) && action.status === 'active' && !action.actedPlayerIds.includes(playerId);
  let actionContext: Record<string, unknown> | undefined;
  if (isActor && action) {
    if (['werewolf','alpha_wolf','minion'].includes(action.role)) actionContext = { kind: 'people', title: action.role === 'minion' ? '늑대인간' : '함께 깨어난 늑대', people: room.players.filter((p) => p.id !== playerId && p.currentRole && WOLF_ROLES.includes(p.currentRole)).map(privateRole) };
    if (action.role === 'secret_agent') actionContext = { kind: 'people', title: '다른 비밀 요원', people: room.players.filter((p) => p.id !== playerId && p.currentRole === 'secret_agent').map(privateRole) };
    if (action.role === 'mason') actionContext = { kind: 'people', title: '다른 프리메이슨', people: room.players.filter((p) => p.id !== playerId && p.currentRole === 'mason').map(privateRole) };
    if (action.role === 'apprentice_tanner') actionContext = { kind: 'people', title: '무두장이', people: room.players.filter((p) => p.currentRole === 'tanner').map(privateRole) };
    if (action.role === 'insomniac') actionContext = { kind: 'cards', title: '내 현재 카드', cards: [{ label: '내 카드', role: self.currentRole }] };
  }
  return {
    roomCode: room.roomCode, playerId, hostId: room.hostId, maxPlayers: room.maxPlayers, phase: room.phase, selfRole: self.originalRole, stateVersion: room.updatedAt,
    moderatorMode: !!room.moderatorMode,
    players: room.players.map((p) => ({ id: p.id, nickname: p.nickname, isReady: p.isReady, hasConfirmedCard: p.hasConfirmedCard, connected: p.connected, isHost: p.id === room.hostId, hasVoted: !!room.votes[p.id] })),
    selectedRoles: room.selectedRoles, currentNightAction: action ? { id: action.id, role: action.role, order: action.order, startedAt: action.startedAt, expiresAt: action.expiresAt, status: action.status, copied: action.copied } : null,
    isNightActor: isActor, actionContext, actionResult: actionResults[playerId], votesCompleted: Object.keys(room.votes).length, dayVoteRequests: (room.voteStartRequests ?? []).length, hasRequestedDayVote: (room.voteStartRequests ?? []).includes(playerId), totalPlayers: room.players.length,
    dayExpiresAt: room.dayExpiresAt, serverNow: Date.now(), chat: room.chat.slice(-100), lobbyChat: [], publicReveals: room.publicReveals,
    settings: { actionTimeLimitSeconds: room.actionTimeLimitSeconds, dayTimeLimitSeconds: room.dayTimeLimitSeconds }, result: room.result
  };
}
