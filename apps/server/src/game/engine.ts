import { randomUUID } from 'node:crypto';
import { NIGHT_ROLES, ROLE_DEFINITIONS, WOLF_ROLES, type ClientGameState, type Faction, type GameResult, type NightAction, type NightCommand, type Player, type RoleType, type Room } from '@werewolf/shared';

export const DISCONNECT_GRACE_MS = 45_000;
export const NIGHT_INTRO_DURATION_MS = 4_300;
export const NIGHT_RESULT_DURATION_MS = 6_000;
export const effectiveRole = (card: { currentRole?: RoleType | null; role?: RoleType; copiedRole?: RoleType }): RoleType | null =>
  (card.currentRole ?? card.role) === 'doppelganger' ? card.copiedRole ?? 'doppelganger' : card.currentRole ?? card.role ?? null;
const nightRole = (p: Player) => p.originalRole === 'doppelganger' ? p.nightCopiedRole ?? 'doppelganger' : p.originalRole;
export const isNightWolf = (p: Player) => WOLF_ROLES.includes(nightRole(p)!);
const isWolf = (p: Player) => WOLF_ROLES.includes(effectiveRole(p)!);
const shields = (room: Room) => new Set(room.protectedPlayerIds ?? (room.protectedPlayerId ? [room.protectedPlayerId] : []));
export const OPTIONAL_NIGHT_ROLES: RoleType[] = ['shield_bearer','seer','apprentice_seer','robber','witch','troublemaker','mystic_wolf','journalist'];

export function shuffleRoles<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!]; }
  return result;
}
export function assignRoles(players: Player[], selectedRoles: RoleType[], random = Math.random) {
  if (selectedRoles.length !== players.length + 3) throw new Error('역할 카드는 인원수 + 3장이어야 합니다.');
  const deck = shuffleRoles(selectedRoles, random);
  const assigned = players.map((p, index) => ({ ...p, originalRole: deck[index]!, currentRole: deck[index]!, copiedRole: undefined, nightCopiedRole: undefined, hasConfirmedCard: false, hasActedTonight: false, vote: null }));
  const centerCards = deck.slice(players.length).map((role, index) => ({ id: `center-${index}`, role, originalRole: role }));
  if (selectedRoles.includes('alpha_wolf')) centerCards.push({ id: 'center-alpha', role: 'werewolf', originalRole: 'werewolf' });
  return { players: assigned, centerCards };
}

export function buildNightActionQueue(selectedRoles: RoleType[], players: Player[]): NightAction[] {
  const selected = new Set(selectedRoles);
  if (selectedRoles.some(id => WOLF_ROLES.includes(id) && id !== 'dream_wolf')) selected.add('werewolf');
  const make = (role: RoleType, order: number, playerIds: string[] = [], copied = false): NightAction => ({
    id: randomUUID(), role, playerIds, actedPlayerIds: [], order, startedAt: 0, expiresAt: 0, status: 'pending', copied
  });
  const queue = NIGHT_ROLES.filter(r => selected.has(r.id)).map(r => make(r.id, r.nightOrder!, players.filter(p =>
    r.id === 'werewolf' ? p.originalRole && WOLF_ROLES.includes(p.originalRole) && p.originalRole !== 'dream_wolf' : p.originalRole === r.id
  ).map(p => p.id)));
  // Immediate copied abilities share the original Doppelganger window.
  // Only copied Insomniac needs a later wake-up. Reserve it independently of
  // card assignment so its presence cannot reveal who copied what.
  if (selected.has('doppelganger') && selected.has('insomniac')) {
    queue.push(make('insomniac', 9.1, [], true));
  }
  return queue.sort((a,b) => a.order - b.order);
}
export function nextRoomVersion(room: Pick<Room, 'updatedAt'>, now = Date.now()): number {
  return Math.max(now, room.updatedAt + 1);
}
export function startNightIntro(room: Room, now = Date.now()): Room {
  const queue = room.nightActionQueue.map(a => ({ ...a }));
  if (!queue[0]) return startDay(room, now);
  queue[0] = { ...queue[0]!, status: 'pending', startedAt: now, expiresAt: now + NIGHT_INTRO_DURATION_MS };
  return { ...room, nightActionQueue: queue, currentNightActionIndex: 0, updatedAt: nextRoomVersion(room, now) };
}
export function startCurrentAction(room: Room, now = Date.now()): Room {
  const index = room.currentNightActionIndex;
  const current = room.nightActionQueue[index];
  if (!current) return { ...room, nightResolutionExpiresAt: now + NIGHT_RESULT_DURATION_MS, updatedAt: nextRoomVersion(room, now) };
  let playerIds = current.playerIds;
  if (!current.copied && ['werewolf','mason'].includes(current.role)) {
    playerIds = [...new Set([...playerIds, ...room.players.filter(p => p.originalRole === 'doppelganger' &&
      (current.role === 'werewolf' ? isNightWolf(p) && nightRole(p) !== 'dream_wolf' : nightRole(p) === 'mason')).map(p => p.id)])];
  }
  const queue = room.nightActionQueue.map((action,i) => i === index ? {
    ...action, playerIds, status: 'active' as const, startedAt: now,
    expiresAt: now + room.actionTimeLimitSeconds * 1000
  } : action);
  return { ...room, nightActionQueue: queue, pendingNightCommands: {}, updatedAt: nextRoomVersion(room, now) };
}
export function advanceNight(room: Room, status: 'completed' | 'timeout' | 'skipped', now = Date.now()): Room {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  const next = { ...room,
    nightActionQueue: room.nightActionQueue.map((a,i) => i === room.currentNightActionIndex ? { ...a, status } : a),
    currentNightActionIndex: room.currentNightActionIndex + 1,
    nightLog: action ? [...room.nightLog, { actionId: action.id, role: action.role, status, at: now }] : room.nightLog,
    updatedAt: nextRoomVersion(room, now)
  };
  return startCurrentAction(next, now);
}
export function allNightActionsSubmitted(room: Room): boolean {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  return !!action && action.playerIds.every(id => action.actedPlayerIds.includes(id));
}

export function validateNightAction(room: Room, playerId: string, actionId: string, command: NightCommand): string | null {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  if (room.phase !== 'night' || room.nightResolutionExpiresAt) return '현재 밤 행동 단계가 아닙니다.';
  if (!action || action.id !== actionId || action.status !== 'active') return '현재 행동이 아닙니다.';
  if (Date.now() > action.expiresAt) return '행동 시간이 끝났습니다.';
  if (!action.playerIds.includes(playerId) || action.actedPlayerIds.includes(playerId)) return '현재는 당신의 차례가 아닙니다.';
  if (!command || typeof command !== 'object') return '유효하지 않은 행동입니다.';
  const targets = command.targetPlayerIds ?? [];
  const indexes = command.centerIndexes ?? [];
  if (!Array.isArray(targets) || !Array.isArray(indexes)) return '유효하지 않은 선택입니다.';
  const role = action.role;
  const protectedIds = shields(room);
  const selfBlocked = protectedIds.has(playerId) && ['robber','drunk','insomniac'].includes(role);
  if (command.type === 'skip') {
    if (targets.length || indexes.length) return '넘길 때 대상을 선택할 수 없습니다.';
    if (selfBlocked || (OPTIONAL_NIGHT_ROLES.includes(role) && !(role === 'witch' && room.witchChoices?.[playerId] !== undefined))) return null;
    return '반드시 수행해야 하는 능력입니다.';
  }
  if (selfBlocked) return '내 카드가 방패로 보호되어 이 능력을 사용할 수 없습니다. 넘기기를 선택하세요.';
  if (targets.some(id => typeof id !== 'string' || (id === playerId && role !== 'witch') || !room.players.some(p => p.id === id))) return '유효하지 않은 대상입니다.';
  if (targets.some(id => protectedIds.has(id))) return '방패로 보호된 카드는 확인하거나 바꿀 수 없습니다.';
  if (new Set(targets).size !== targets.length || new Set(indexes).size !== indexes.length) return '서로 다른 대상을 선택하세요.';
  if (indexes.some(i => !Number.isInteger(i) || i < 0 || i >= room.centerCards.length)) return '유효하지 않은 센터 카드입니다.';
  const shape = (type: NightCommand['type'], people: number, centers: number) => command.type === type && targets.length === people && indexes.length === centers;
  let valid = false;
  switch (role) {
    case 'doppelganger': case 'mystic_wolf': case 'journalist': valid = shape('inspect_player',1,0); break;
    case 'shield_bearer': valid = shape('protect',1,0); break;
    case 'alpha_wolf': valid = (shape('swap_player',1,0) && room.centerCards.length === 4 && !room.players.some(p => p.id === targets[0] && isNightWolf(p))) || (shape('confirm',0,0) && !room.players.some(p => p.id !== playerId && !protectedIds.has(p.id) && !isNightWolf(p))); break;
    case 'robber': valid = shape('swap_player',1,0); break;
    case 'troublemaker': valid = shape('swap_players',2,0); break;
    case 'seer': valid = shape('inspect_player',1,0) || shape('inspect_centers',0,2); break;
    case 'apprentice_seer': valid = shape('inspect_center',0,1); break;
    case 'drunk': valid = shape('swap_center',0,1); break;
    case 'witch': {
      const seen = room.witchChoices?.[playerId];
      valid = seen === undefined ? shape('inspect_center',0,1) : shape('swap_center',1,1) && indexes[0] === seen;
      break;
    }
    case 'werewolf': valid = room.players.some(p => p.id !== playerId && isNightWolf(p)) ? shape('confirm',0,0) : shape('inspect_center',0,1) || shape('confirm',0,0); break;
    default: valid = shape('confirm',0,0);
  }
  return valid ? null : '역할에 맞는 행동과 대상을 선택하세요.';
}

export function applyNightAction(room: Room, playerId: string, command: NightCommand): { room: Room; result: Record<string, unknown> } {
  const action = room.nightActionQueue[room.currentNightActionIndex]!;
  const players = room.players.map(p => ({ ...p }));
  const centers = room.centerCards.map(c => ({ ...c }));
  const self = players.find(p => p.id === playerId)!;
  const target = players.find(p => p.id === command.targetPlayerIds?.[0]);
  const target2 = players.find(p => p.id === command.targetPlayerIds?.[1]);
  const indexes = command.centerIndexes ?? [];
  const protectedIds = shields(room);
  const blocked = (p?: Player) => !!p && protectedIds.has(p.id);
  let result: Record<string, unknown> = {};
  let complete = true;
  const exchangePlayers = (a: Player,b: Player) => {
    [a.currentRole,b.currentRole] = [b.currentRole,a.currentRole];
    [a.copiedRole,b.copiedRole] = [b.copiedRole,a.copiedRole];
  };
  const exchangeCenter = (p: Player,i: number) => {
    const c = centers[i]!;
    [p.currentRole,c.role] = [c.role,p.currentRole!];
    [p.copiedRole,c.copiedRole] = [c.copiedRole,p.copiedRole];
  };
  if (command.type === 'skip') result = { kind: 'skipped', title: '능력을 사용하지 않았습니다.' };
  else if (blocked(self) && ['robber','drunk','insomniac'].includes(action.role)) result = { kind: 'blocked', title: '내 카드가 방패로 보호되어 능력을 사용하지 않았습니다.' };
  else switch (action.role) {
    case 'doppelganger': {
      if (!target || blocked(target)) break;
      const copiedRole = effectiveRole(target)!;
      self.copiedRole = copiedRole; self.nightCopiedRole = copiedRole;
      result = { kind: 'copied', targetNickname: target.nickname, role: copiedRole };
      if (['werewolf','mason','dream_wolf'].includes(copiedRole)) break;
      if (copiedRole === 'insomniac') {
        room = { ...room, nightActionQueue: room.nightActionQueue.map(a => a.copied && a.order === 9.1 ? { ...a, playerIds: [playerId] } : a) };
      } else if (ROLE_DEFINITIONS[copiedRole].nightOrder !== null && copiedRole !== 'doppelganger') {
        // Keep the same action ID, start time and deadline. Copying a role
        // changes only this owner's controls, never starts another full turn.
        complete = false;
        room = { ...room, nightActionQueue: room.nightActionQueue.map((a,i) => i === room.currentNightActionIndex ? { ...a, role: copiedRole, copied: true } : a) };
      }
      break;
    }
    case 'shield_bearer':
      if (target) { protectedIds.add(target.id); room = { ...room, protectedPlayerIds: [...protectedIds], protectedPlayerId: target.id }; result = { kind: 'protected', nickname: target.nickname }; } break;
    case 'werewolf': {
      const wolves = players.filter(p => p.id !== playerId && isNightWolf(p));
      result = wolves.length ? { kind: 'people', title: '함께 깨어난 늑대', people: wolves.map(privatePerson) }
        : { kind: 'cards', title: '혼자인 늑대가 확인한 센터 카드', cards: indexes.map(i => ({ label: centerLabel(i), role: centers[i]!.role })) };
      break;
    }
    case 'alpha_wolf':
      if (target && !blocked(target) && !isNightWolf(target) && centers[3]) { exchangeCenter(target,3); result = { kind: 'alpha_swap', targetNickname: target.nickname }; } break;
    case 'mystic_wolf': case 'journalist':
      if (target && !blocked(target)) {
        result = { kind: 'cards', title: '확인한 카드', cards: [{ label: target.nickname, role: target.currentRole }] };
        if (action.role === 'journalist' && ROLE_DEFINITIONS[effectiveRole(target)!].faction === 'village') room = { ...room, publicReveals: [...room.publicReveals, `${target.nickname}님은 신문기자가 확인한 시점에 마을 진영이었습니다.`] };
      } break;
    case 'minion': result = { kind: 'people', title: '늑대인간', people: players.filter(isNightWolf).map(privatePerson) }; break;
    case 'apprentice_tanner': result = { kind: 'people', title: '무두장이', people: players.filter(p => nightRole(p) === 'tanner').map(privatePerson) }; break;
    case 'mason': result = { kind: 'people', title: '다른 프리메이슨', people: players.filter(p => p.id !== playerId && nightRole(p) === 'mason').map(privatePerson) }; break;
    case 'seer': result = target && !blocked(target)
      ? { kind: 'cards', title: '예언자가 확인한 카드', cards: [{ label: target.nickname, role: target.currentRole }] }
      : { kind: 'cards', title: '예언자가 확인한 센터 카드', cards: indexes.map(i => ({ label: centerLabel(i), role: centers[i]!.role })) }; break;
    case 'apprentice_seer': result = { kind: 'cards', title: '견습 예언자가 확인한 센터 카드', cards: indexes.map(i => ({ label: centerLabel(i), role: centers[i]!.role })) }; break;
    case 'robber':
      if (target && !blocked(target)) { exchangePlayers(self,target); result = { kind: 'robber_swap', targetNickname: target.nickname, myNewRole: self.currentRole }; } break;
    case 'witch': {
      const i = indexes[0]!;
      if (!target) {
        room = { ...room, witchChoices: { ...room.witchChoices, [playerId]: i } };
        result = { kind: 'witch_seen', centerIndex: i, seenRole: centers[i]!.role }; complete = false;
      } else if (!blocked(target)) {
        const seenRole = centers[i]!.role; exchangeCenter(target,i);
        result = { kind: 'witch_swap', targetNickname: target.nickname, seenRole, centerIndex: i };
      }
      break;
    }
    case 'troublemaker':
      if (target && target2 && !blocked(target) && !blocked(target2)) { exchangePlayers(target,target2); result = { kind: 'troublemaker_swap', firstNickname: target.nickname, secondNickname: target2.nickname }; } break;
    case 'drunk': exchangeCenter(self,indexes[0]!); result = { kind: 'drunk_swap', centerIndex: indexes[0]! + 1 }; break;
    case 'insomniac': result = { kind: 'cards', title: '불면증 환자의 현재 카드', cards: [{ label: '내 카드', role: self.currentRole }] }; break;
    default: result = { kind: 'confirmed' };
  }
  const before = new Map([...room.players.map(p => [p.id,effectiveRole(p)!] as const), ...room.centerCards.map((c,i) => [`center-${i}`,effectiveRole(c)!] as const)]);
  const after = [...players.map(p => [p.id,effectiveRole(p)!] as const), ...centers.map((c,i) => [`center-${i}`,effectiveRole(c)!] as const)];
  const changes = after.filter(([id,role]) => before.get(id) !== role).map(([location,after]) => ({ location,before: before.get(location)!,after }));
  const privateNightActions = { ...room.privateNightActions, [playerId]: [...(room.privateNightActions?.[playerId] ?? []), { role: action.role, result }] };
  const queue = room.nightActionQueue.map((a,i) => i === room.currentNightActionIndex && complete ? { ...a, actedPlayerIds: [...new Set([...a.actedPlayerIds,playerId])] } : a);
  return { room: { ...room, players, centerCards: centers, nightActionQueue: queue, privateNightActions,
    privateResults: { ...room.privateResults, [playerId]: result },
    replay: [...(room.replay ?? []), { role: action.role, actorId: playerId, result, changes }], updatedAt: nextRoomVersion(room) }, result };
}
const privatePerson = (p: Player) => ({ nickname: p.nickname });
const centerLabel = (i: number) => i === 3 ? '센터 늑대 카드' : `센터 카드 ${i + 1}`;

/** Resolve only this slot, then advance on its public deadline (never early). */
export function resolveNightDeadline(room: Room, now = Date.now()): Room {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  if (!action) return startCurrentAction(room,now);
  let next = room;
  let timedOut = false;
  for (const id of action.playerIds) {
    if (next.nightActionQueue[next.currentNightActionIndex]!.actedPlayerIds.includes(id)) continue;
    timedOut = true;
    const protectedIds = shields(next);
    let command: NightCommand = { type: 'skip' };
    if (action.role === 'drunk' && !protectedIds.has(id)) command = { type: 'swap_center', centerIndexes: [Math.floor(Math.random() * next.centerCards.length)] };
    else if (action.role === 'witch' && next.witchChoices?.[id] !== undefined) {
      const eligible = next.players.filter(p => !protectedIds.has(p.id));
      const target = eligible[Math.floor(Math.random()*eligible.length)];
      if (target) command = { type: 'swap_center', targetPlayerIds: [target.id], centerIndexes: [next.witchChoices[id]!] };
    } else if (['doppelganger','alpha_wolf'].includes(action.role)) {
      const target = next.players.find(p => p.id !== id && !protectedIds.has(p.id) && (action.role !== 'alpha_wolf' || !isNightWolf(p)));
      if (target) command = { type: action.role === 'doppelganger' ? 'inspect_player' : 'swap_player', targetPlayerIds: [target.id] };
    } else if (['werewolf','minion','apprentice_tanner','mason','insomniac'].includes(action.role)) command = { type: 'confirm' };
    next = applyNightAction(next,id,command).room;
    const follow = next.nightActionQueue[next.currentNightActionIndex]!;
    if (!follow.actedPlayerIds.includes(id) && follow.copied) {
      // Resolve mandatory copied abilities at the same deadline as the copy.
      // Optional abilities are explicitly skipped, rather than queued again.
      return resolveNightDeadline(next, now);
    }
  }
  return advanceNight(next, action.playerIds.length === 0 ? 'skipped' : timedOut ? 'timeout' : 'completed',now);
}

export function startDay(room: Room, now = Date.now()): Room {
  return { ...room, phase: 'day', dayExpiresAt: now + room.dayTimeLimitSeconds * 1000, nightResolutionExpiresAt: null, updatedAt: nextRoomVersion(room,now) };
}
export function calculateReceivedVotes(room: Pick<Room,'players'|'votes'>): Record<string,number> {
  const counts = Object.fromEntries(room.players.map(p => [p.id,0]));
  for (const [from,to] of Object.entries(room.votes)) if (room.players.some(p => p.id === from) && to in counts) counts[to]! += 1;
  return counts;
}
export function calculateVotes(room: Pick<Room,'players'|'votes'>): Record<string,number> {
  const counts = calculateReceivedVotes(room);
  for (const p of room.players) if (effectiveRole(p) === 'prince') counts[p.id] = 0;
  return counts;
}
export function determineExecutions(counts: Record<string,number>, minimum = 2): string[] {
  const max = Math.max(0,...Object.values(counts));
  return max < minimum ? [] : Object.entries(counts).filter(([,count]) => count === max).map(([id]) => id);
}
export function votingComplete(room: Pick<Room,'players'|'votes'>, now = Date.now()): boolean {
  const eligible = room.players.filter(p => p.connected || !p.disconnectedAt || now - p.disconnectedAt < DISCONNECT_GRACE_MS);
  return eligible.length > 0 && eligible.every(p => !!room.votes[p.id]);
}
export function calculateResult(room: Room): GameResult {
  const players = room.players.map(p => ({ ...p }));
  const originalWolves = new Set(players.filter(isWolf).map(p => p.id));
  for (const cursed of players.filter(p => effectiveRole(p) === 'cursed')) {
    if ([...originalWolves].some(id => room.votes[id] === cursed.id)) { cursed.currentRole = 'werewolf'; cursed.copiedRole = undefined; }
  }
  const adjusted = { ...room,players };
  const receivedVoteCounts = calculateReceivedVotes(adjusted);
  const voteCounts = calculateVotes(adjusted);
  const guarded = new Set(players.filter(p => effectiveRole(p) === 'bodyguard').map(p => room.votes[p.id]).filter((id): id is string => !!id));
  const candidates = Object.fromEntries(Object.entries(voteCounts).filter(([id]) => !guarded.has(id)));
  const ordinaryLeaders = determineExecutions(voteCounts);
  const guardedLeader = ordinaryLeaders.some(id => guarded.has(id));
  const executed = new Set(determineExecutions(candidates,guardedLeader ? 1 : 2));
  const executionReasons: Record<string,string> = {};
  for (const id of executed) executionReasons[id] = guardedLeader ? '보디가드의 보호 대상을 제외한 최다 득표' : '최다 득표 (동률 포함)';
  // Fixed point also handles multiple Hunters produced by Doppelganger.
  let changed = true;
  while (changed) {
    changed = false;
    for (const hunter of players.filter(p => effectiveRole(p) === 'hunter' && executed.has(p.id))) {
      const target = room.votes[hunter.id];
      if (target && !guarded.has(target) && !executed.has(target)) { executed.add(target); executionReasons[target] = `${hunter.nickname}님의 사냥꾼 능력`; changed = true; }
    }
  }
  const wolves = players.filter(isWolf);
  const wolfDied = wolves.some(p => executed.has(p.id));
  const tanners = players.filter(p => effectiveRole(p) === 'tanner');
  const tannerDied = tanners.some(p => executed.has(p.id));
  const minions = players.filter(p => effectiveRole(p) === 'minion');
  const villageWin = wolves.length > 0 ? wolfDied : tannerDied || executed.size === 0 || (minions.length > 0 && minions.every(p => executed.has(p.id)));
  const wolfWin = wolves.length > 0 && !wolfDied && !tannerDied;
  const minionWin = wolfWin || (wolves.length === 0 && !tannerDied && executed.size > 0 && minions.some(p => !executed.has(p.id)));
  const winnerIds = players.filter(p => {
    const role = effectiveRole(p)!;
    if (role === 'tanner') return executed.has(p.id);
    if (role === 'apprentice_tanner') return tanners.length ? tannerDied : executed.has(p.id);
    if (role === 'minion') return minionWin && (wolves.length > 0 || !executed.has(p.id));
    if (WOLF_ROLES.includes(role)) return wolfWin;
    return villageWin;
  }).map(p => p.id);
  const winners = [...new Set(players.filter(p => winnerIds.includes(p.id)).map(p => ROLE_DEFINITIONS[effectiveRole(p)!].faction))] as Faction[];
  const reasons: string[] = [];
  if (villageWin) reasons.push(wolfDied ? '최종 늑대가 한 명 이상 처형되어 마을이 승리했습니다.' : tannerDied ? '늑대가 없고 무두장이가 처형되어 마을도 승리했습니다.' : executed.size === 0 ? '최종 늑대가 없고 아무도 처형되지 않아 마을이 승리했습니다.' : '늑대가 없고 하수인이 처형되어 마을이 승리했습니다.');
  if (wolfWin) reasons.push('최종 늑대가 살아남고 무두장이가 처형되지 않아 늑대 진영이 승리했습니다.');
  if (tannerDied) reasons.push('처형된 무두장이가 개인 승리 조건을 달성했습니다.');
  if (players.some(p => effectiveRole(p) === 'apprentice_tanner' && winnerIds.includes(p.id))) reasons.push(tanners.length ? '무두장이의 죽음으로 견습 무두장이도 승리했습니다.' : '무두장이가 없어 처형된 견습 무두장이가 승리했습니다.');
  if (minionWin && !wolfWin) reasons.push('늑대가 없고 다른 사람이 처형되어 살아남은 하수인이 승리했습니다.');
  for (const p of players) if (effectiveRole(room.players.find(original => original.id === p.id)!) === 'cursed' && effectiveRole(p) === 'werewolf') reasons.push(`${p.nickname}님은 늑대의 투표를 받아 최종 늑대로 변했습니다.`);
  if (!winnerIds.length) reasons.push('어느 플레이어도 자신의 승리 조건을 달성하지 못했습니다.');
  if (!executed.size) reasons.unshift('처형된 사람이 없습니다. 유효한 최다 득표가 처형 기준에 미치지 못했습니다.');
  return { winners,winnerIds,reasons,executionReasons,executedIds:[...executed],voteCounts,receivedVoteCounts,votes:room.votes,
    players:players.map(p => ({id:p.id,nickname:p.nickname,originalRole:p.originalRole!,currentRole:effectiveRole(p)!})),
    replay:room.replay ?? [], centerCards:room.centerCards.map((c,i) => ({label:centerLabel(i),originalRole:c.originalRole,role:effectiveRole(c)!})) };
}
export function buildPlayerGameState(room: Room, playerId: string): ClientGameState {
  const self = room.players.find(p => p.id === playerId)!;
  const current = room.nightActionQueue[room.currentNightActionIndex];
  const isActor = room.phase === 'night' && !room.nightResolutionExpiresAt && current?.status === 'active' && current.playerIds.includes(playerId) && !current.actedPlayerIds.includes(playerId);
  // Copied identities remain private. Everyone sees the reserved role's name.
  const publicRole = current?.copied ? current.order === 9.1 ? 'insomniac' : 'doppelganger' : current?.role;
  const action = current ? { id:current.id,role:isActor || current.playerIds.includes(playerId) ? current.role : publicRole!,order:current.order,startedAt:current.startedAt,expiresAt:current.expiresAt,status:current.status,copied:current.copied } : null;
  let actionContext: Record<string,unknown> | undefined;
  if (isActor && current) {
    if (['werewolf','alpha_wolf','mystic_wolf','minion'].includes(current.role)) actionContext = {kind:'people',title:'늑대인간',people:room.players.filter(p => p.id !== playerId && isNightWolf(p)).map(privatePerson)};
    if (current.role === 'mason') actionContext = {kind:'people',title:'다른 프리메이슨',people:room.players.filter(p => p.id !== playerId && nightRole(p) === 'mason').map(privatePerson)};
    if (current.role === 'apprentice_tanner') actionContext = {kind:'people',title:'무두장이',people:room.players.filter(p => nightRole(p) === 'tanner').map(privatePerson)};
  }
  // No preliminary Insomniac snapshot: only its resolved action may reveal it.
  const hasOwnResult = !!current?.playerIds.includes(playerId) && (room.privateNightActions?.[playerId]?.some(a => a.role === current.role) || (current.copied && current.order < 0));
  return {
    roomCode:room.roomCode,playerId,hostId:room.hostId,maxPlayers:room.maxPlayers,phase:room.phase,selfRole:self.originalRole,stateVersion:room.updatedAt,botMode:!!room.botMode,
    players:room.players.map(p => ({id:p.id,nickname:p.nickname,avatar:p.avatar,isReady:p.isReady,hasConfirmedCard:p.hasConfirmedCard,connected:p.connected,isHost:p.id===room.hostId,hasVoted:!!room.votes[p.id],isBot:!!p.isBot})),
    selectedRoles:room.selectedRoles,currentNightAction:action,isNightActor:!!isActor,actionContext,
    actionResult:room.nightResolutionExpiresAt || hasOwnResult ? room.privateResults[playerId] : undefined,nightActions:room.privateNightActions?.[playerId] ?? [],
    votesCompleted:Object.keys(room.votes).length,dayVoteRequests:(room.voteStartRequests ?? []).filter(id => room.players.some(p => p.id===id && p.connected)).length,
    hasRequestedDayVote:(room.voteStartRequests ?? []).includes(playerId),totalPlayers:room.players.length,dayExpiresAt:room.dayExpiresAt,serverNow:Date.now(),chat:room.chat.slice(-100),lobbyChat:[],publicReveals:room.publicReveals,
    settings:{actionTimeLimitSeconds:room.actionTimeLimitSeconds,dayTimeLimitSeconds:room.dayTimeLimitSeconds},result:room.result,
    protectedPlayerIds:[...shields(room)],centerCardCount:room.centerCards.length,
    nightEndsAt:room.nightResolutionExpiresAt ?? current?.expiresAt ?? null,nightResolutionEndsAt:room.nightResolutionExpiresAt ?? null
  };
}
