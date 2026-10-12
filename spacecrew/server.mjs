import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 3005);
// Keep the authoritative turn state in sync with the client-side trick reveal.
const TRICK_RESOLVE_MS = 2700;
const app = express();
app.use(express.static('dist'));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'the-crew-planet-nine' }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

const SUITS = {
  P: { name: '분홍', icon: '●', color: '#ff7eb6' },
  B: { name: '파랑', icon: '▲', color: '#72adff' },
  G: { name: '초록', icon: '■', color: '#66e099' },
  Y: { name: '노랑', icon: '★', color: '#ffd467' },
  R: { name: '로켓', icon: '🚀', color: '#edf2ff' },
};

// Planet Nine logbook.  Mission settings come from the supplied local-play reference.
const MISSIONS = {
  1: { tasks: 1, label: '첫 번째 신호', text: '과제 카드 1장을 올바른 승무원이 가져오세요.' },
  2: { tasks: 2, label: '궤도 보정', text: '과제 카드 2장을 올바른 승무원이 가져오세요.' },
  3: { tasks: 2, order: 2, label: '동기화', text: '① → ② 순서로 과제를 완료하세요.' },
  4: { tasks: 3, label: '심우주 항로', text: '과제 카드 3장을 올바른 승무원이 가져오세요.' },
  5: { tasks: 0, special: 'sick', label: '아픈 승무원', text: '과제 카드 없이 진행합니다. 지정된 아픈 승무원은 트릭을 한 번도 이기면 안 됩니다.' },
  6: { tasks: 3, arrows: 2, deadZone: true, label: '침묵 구간', text: '화살표 순서로 완료하세요. 통신의 최고/최저 표시는 숨겨집니다.' },
  7: { tasks: 3, omega: true, label: 'Ω 좌표', text: 'Ω 과제는 다른 모든 과제 뒤에 완료하세요.' },
  8: { tasks: 3, order: 3, label: '연쇄 신호', text: '① → ② → ③ 순서로 과제를 완료하세요.' },
  9: { tasks: 0, special: 'winOne', label: '미약한 신호', text: '값이 1인 카드로 트릭을 최소 한 번 이기세요.' },
  10: { tasks: 4, label: '행성 9 접근', text: '과제 카드 4장을 올바른 승무원이 가져오세요.' },
  11: { tasks: 4, order: 1, special: 'noComm', pick: 'notCommander', label: '무전 침묵', text: '① 과제를 먼저 완료하고, 지정된 승무원은 통신할 수 없습니다.' },
  12: { tasks: 4, omega: true, special: 'swap', label: '교차 궤도', text: '첫 트릭 뒤 오른쪽 이웃의 손패에서 무작위 한 장을 가져옵니다.' },
  13: { tasks: 0, special: 'rockets', label: '추진기 점검', text: '로켓 1·2·3·4로 각각 트릭을 이기세요.' },
  14: { tasks: 4, arrows: 3, deadZone: true, label: '블랙아웃', text: '화살표 순서로 과제를 완료하세요. 통신 표시는 숨겨집니다.' },
  15: { tasks: 4, order: 4, label: '신호 배열', text: '①→②→③→④ 순서로 과제를 완료하세요.' },
  16: { tasks: 0, special: 'noNine', label: '위험한 주파수', text: '값이 9인 카드로 트릭을 이기면 실패합니다.' },
  17: { tasks: 2, special: 'noNine', label: '위험한 주파수 II', text: '값이 9인 카드로 트릭을 이기면 실패합니다.' },
  18: { tasks: 5, commFrom: 2, label: '늦은 통신', text: '2번째 트릭 직전부터 통신할 수 있습니다.' },
  19: { tasks: 5, order: 1, commFrom: 3, label: '늦은 동기화', text: '3번째 트릭 직전부터 통신할 수 있습니다.' },
  20: { tasks: 2, special: 'allTasks', pick: 'notCommander', label: '단독 분석', text: '지정된 한 명이 모든 과제를 맡습니다.' },
  21: { tasks: 5, order: 2, deadZone: true, label: '데드 존', text: '통신 표시는 숨겨진 채 순서 과제를 완료합니다.' },
  22: { tasks: 5, arrows: 4, label: '화살표 항로', text: '화살표 순서로 과제를 완료하세요.' },
  23: { tasks: 5, order: 5, tokenSwap: true, label: '좌표 교환', text: '과제 선택 전, 순서 토큰 두 개의 위치를 한 번 바꿀 수 있습니다.' },
  24: { tasks: 6, distribute: true, label: '커맨더 분배', text: '커맨더가 과제를 균등하게 분배합니다.' },
  25: { tasks: 6, arrows: 2, deadZone: true, fiveTransfer: true, label: '흐린 성운', text: '데드 존에서 화살표 과제를 완료하세요.' },
  26: { tasks: 0, special: 'winTwoOnes', label: '두 개의 미약한 신호', text: '서로 다른 두 트릭을 값 1 카드로 이기세요.' },
  27: { tasks: 3, special: 'allTasks', pick: 'notCommander', fiveTransfer: true, label: '전담 승무원', text: '지정된 한 명이 모든 과제를 맡습니다.' },
  28: { tasks: 6, order: 1, omega: true, commFrom: 3, fiveTransfer: true, label: '마지막 Ω', text: '3번째 트릭부터 통신 가능, Ω는 마지막에 완료합니다.' },
  29: { tasks: 0, special: 'balanced', deadZone: true, label: '균형 비행', text: '누구의 승리 트릭 수도 2 이상 차이나면 안 됩니다.' },
  30: { tasks: 6, arrows: 3, commFrom: 2, fiveTransfer: true, label: '지연 항법', text: '2번째 트릭부터 통신하며 화살표 순서를 지키세요.' },
  31: { tasks: 6, order: 3, fiveTransfer: true, label: '연속 좌표', text: '①→②→③ 순서 과제입니다.' },
  32: { tasks: 7, distribute: true, fiveTransfer: true, label: '대규모 분배', text: '커맨더가 과제를 균등하게 분배합니다.' },
  33: { tasks: 0, special: 'oneTrick', pick: 'any', label: '정확한 한 번', text: '지정된 승무원은 로켓 없이 정확히 한 트릭만 이겨야 합니다.' },
  34: { tasks: 0, special: 'balancedCommander', label: '커맨더의 균형', text: '승리 수 차이는 2 미만, 커맨더는 첫·마지막 트릭을 이겨야 합니다.' },
  35: { tasks: 7, arrows: 3, fiveTransfer: true, label: '장거리 항로', text: '화살표 순서로 과제를 완료하세요.' },
  36: { tasks: 7, order: 2, distribute: true, fiveTransfer: true, label: '분배된 신호', text: '커맨더 분배 및 순서 과제입니다.' },
  37: { tasks: 4, special: 'allTasks', pick: 'notCommander', fiveTransfer: true, label: '전담 귀환', text: '지정된 한 명이 모든 과제를 맡습니다.' },
  38: { tasks: 8, commFrom: 3, fiveTransfer: true, label: '심층 통신', text: '3번째 트릭 직전부터 통신할 수 있습니다.' },
  39: { tasks: 8, arrows: 3, deadZone: true, fiveTransfer: true, label: '어두운 파편대', text: '데드 존에서 화살표 과제를 완료하세요.' },
  40: { tasks: 8, order: 3, tokenMove: true, fiveTransfer: true, label: '외곽 탐사', text: '과제 선택 전, 순서 토큰 하나를 토큰이 없는 다른 과제로 옮길 수 있습니다.' },
  41: { tasks: 0, special: 'firstLast', pick: 'any', label: '첫·마지막 신호', text: '지정된 승무원은 로켓 없이 첫·마지막 트릭만 이겨야 합니다.' },
  42: { tasks: 9, fiveTransfer: true, label: '탐사선 접근', text: '과제 카드 9장을 올바른 승무원이 가져오세요.' },
  43: { tasks: 9, distribute: true, fiveTransfer: true, label: '최종 분배', text: '커맨더가 과제를 균등하게 분배합니다.' },
  44: { tasks: 0, special: 'rocketOrder', label: '로켓 순서', text: '로켓 1→2→3→4 순서로 트릭을 이기세요.' },
  45: { tasks: 9, arrows: 3, fiveTransfer: true, label: '최종 항로', text: '화살표 순서로 과제를 완료하세요.' },
  46: { tasks: 0, special: 'pink', label: '분홍 수집', text: '분홍 9 소유자의 왼쪽 승무원이 모든 분홍 카드를 가져와야 합니다.' },
  47: { tasks: 10, fiveTransfer: true, label: '착륙 절차', text: '과제 카드 10장을 올바른 승무원이 가져오세요.' },
  48: { tasks: 3, omega: true, special: 'omegaLastTrick', fiveTransfer: true, label: '마지막 Ω', text: 'Ω 과제는 마지막 트릭에 완료해야 합니다.' },
  49: { tasks: 10, arrows: 3, fiveTransfer: true, label: '최종 신호 배열', text: '화살표 순서로 과제를 완료하세요.' },
  50: { tasks: 0, special: 'finalPattern', pick: 'two', label: '행성 9 발견', text: '한 명은 1~4번째, 다른 한 명은 마지막, 나머지는 중간 트릭을 이겨야 합니다.' },
};

const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
const token = () => randomBytes(24).toString('base64url');
const roomChannel = code => `crew:${code}`;
const shuffle = cards => { const copy = [...cards]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
const nextPlayer = (room, id) => room.players[(room.players.findIndex(p => p.id === id) + 1) % room.players.length];
const previousPlayer = (room, id) => room.players[(room.players.findIndex(p => p.id === id) - 1 + room.players.length) % room.players.length];
const getPlayer = (room, id) => room.players.find(p => p.id === id);
const cardLabel = card => `${SUITS[card.suit].icon}${card.value}`;

function deck() {
  return [...'PBGY'].flatMap(suit => Array.from({ length: 9 }, (_, i) => ({ id: `${suit}${i + 1}`, suit, value: i + 1 })))
    .concat(Array.from({ length: 4 }, (_, i) => ({ id: `R${i + 1}`, suit: 'R', value: i + 1 })));
}
function taskCards(amount, mission, dealtCards) {
  // Tasks must be cards that were actually dealt; an undealt task would make a
  // cooperative mission impossible, especially in a 3-player game.
  const pool = shuffle(dealtCards.filter(card => card.suit !== 'R')).slice(0, amount);
  return pool.map((card, index) => ({ ...card, ownerId: null, done: false,
    order: index < (mission.order || 0) ? index + 1 : null,
    arrow: index < (mission.arrows || 0) ? index + 1 : null,
    // Logbook tokens are laid out from left to right before drawing task cards.
    // Ω therefore follows any numbered tokens; it is not attached to the last
    // task card in the mission (notably missions 7, 12, 28 and 48).
    omega: !!mission.omega && index === (mission.order || 0),
  }));
}
function createRoom(roomCode, nickname, maxPlayers, missionId) {
  const hostId = randomUUID();
  const player = { id: hostId, nickname, sessionToken: token(), socketId: null, connected: true, ready: false, hand: [], wins: 0, comm: null };
  return { code: roomCode, hostId, maxPlayers, missionId, players: [player], phase: 'lobby', commanderId: null, turnId: null, leaderId: null, tasks: [], trick: [], trickNo: 0, totalTricks: 0, assignmentCursor: 0, sickId: null, lastTrick: null, decisionResponses: {}, distressVotes: {}, distressDirections: {}, distressPasses: {}, distressActive: false, distressMissionId: null, distressDirection: null, log: ['🛰 새로운 탐사대를 모집합니다.'], result: null, createdAt: Date.now() };
}
function validName(value) { const name = String(value || '').trim().slice(0, 16); if (!name) throw Error('이름을 입력해 주세요.'); return name; }
function mission(room) { return MISSIONS[room.missionId]; }
function requireSession(socket, roomCode) { if (socket.data.room !== roomCode || !socket.data.playerId) throw Error('유효하지 않은 게임 세션입니다.'); return socket.data.playerId; }
function bind(socket, room, player) { socket.data.room = room.code; socket.data.playerId = player.id; socket.join(roomChannel(room.code)); }
function playerPublic(room, p) { return { id: p.id, nickname: p.nickname, isBot: !!p.isBot, connected: p.connected, ready: p.ready, cardsLeft: p.hand.length, wins: p.wins, comm: p.comm }; }
function legalCards(room, player) { if (room.turnId !== player.id || Date.now() < (room.nextTurnReadyAt ?? 0)) return []; if (!room.trick.length) return player.hand.map(c => c.id); const lead = room.trick[0].card.suit; const follows = player.hand.filter(card => card.suit === lead); return (follows.length ? follows : player.hand).map(card => card.id); }
function taskPublic(task) { return { ...task }; }
function view(room, playerId) {
  const self = getPlayer(room, playerId);
  return {
    code: room.code, playerId, hostId: room.hostId, maxPlayers: room.maxPlayers, missionId: room.missionId, mission: mission(room), phase: room.phase,
    players: room.players.map(p => playerPublic(room, p)), commanderId: room.commanderId, turnId: room.turnId, leaderId: room.leaderId,
    hand: self.hand, legalCardIds: legalCards(room, self), tasks: room.tasks.map(taskPublic), trick: room.trick, lastTrick: room.lastTrick,
    trickNo: room.trickNo, totalTricks: room.totalTricks, assignmentCursor: room.assignmentCursor, sickId: room.sickId, targetId: room.targetId, targetBId: room.targetBId, targetStep: room.targetStep, decisionResponses: room.decisionResponses, distressVotes: room.distressVotes, distressDirections: room.distressDirections, distressActive: !!room.distressActive, distressPassed: !!room.distressPasses[playerId], distressPassCount: Object.keys(room.distressPasses).length, result: room.result, log: room.log.slice(-10),
  };
}
function send(room) { room.players.forEach(player => { if (player.socketId) io.to(player.socketId).emit('ROOM_STATE', view(room, player.id)); }); scheduleBotTurn(room); }
// A trick stays on screen briefly before its winner leads the next one.  The
// first state sent after resolving deliberately has no legal cards, but a
// human player also needs a fresh state when that delay ends.  Previously only
// bot turns caused another broadcast, leaving an all-human winner unable to
// select a card until they refreshed.
function scheduleTurnReady(room) {
  if (room.turnReadyTimer) clearTimeout(room.turnReadyTimer);
  const readyAt = room.nextTurnReadyAt ?? 0;
  if (room.phase !== 'play' || !readyAt) return;
  // Add a tiny cushion so legalCards() cannot be evaluated a millisecond
  // before the timestamp becomes valid.
  room.turnReadyTimer = setTimeout(() => {
    room.turnReadyTimer = null;
    // Do not publish stale readiness if the room advanced or ended meanwhile.
    if (room.phase === 'play' && room.nextTurnReadyAt === readyAt) send(room);
  }, Math.max(0, readyAt - Date.now()) + 10);
}
function roomByPayload(payload) { const room = rooms.get(String(payload?.code || '').toUpperCase()); if (!room) throw Error('방을 찾을 수 없습니다.'); return room; }
function appendLog(room, message) { room.log.push(message); room.log = room.log.slice(-30); }

function deal(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
  const keepDistress = room.distressActive && room.distressMissionId === room.missionId;
  const cards = shuffle(deck());
  room.players.forEach(p => { p.hand = []; p.wins = 0; p.comm = null; });
  cards.forEach((card, index) => room.players[index % room.players.length].hand.push(card));
  room.players.forEach(p => p.hand.sort((a, b) => a.suit.localeCompare(b.suit) || a.value - b.value));
  room.commanderId = room.players.find(p => p.hand.some(c => c.id === 'R4')).id;
  room.leaderId = room.commanderId; room.turnId = room.commanderId;
  room.tasks = taskCards(mission(room).tasks, mission(room), cards); room.hiddenTasks = null; if (mission(room).special === 'allTasks') { room.hiddenTasks = room.tasks; room.tasks = []; } room.trick = []; room.lastTrick = null; room.trickNo = 0; room.totalTricks = Math.floor(cards.length / room.players.length);
  room.assignmentCursor = 0; room.sickId = null; room.targetId = null; room.targetBId = null; room.targetStep = 0; room.wonWithOne = 0; room.rocketWins = []; room.pinkWins = 0; room.result = null; room.decisionResponses = {}; room.distressVotes = {}; room.distressDirections = {}; room.distressPasses = {}; room.distressActive = keepDistress; room.distressDirection = null; room.nextTurnReadyAt = 0;
  if (['sick', 'noComm', 'allTasks', 'oneTrick', 'firstLast', 'finalPattern'].includes(mission(room).special)) room.phase = 'chooseTarget';
  else if (mission(room).special === 'pink') { const holder = room.players.find(player => player.hand.some(card => card.id === 'P9')); room.targetId = previousPlayer(room, holder.id).id; room.phase = 'distressVote'; }
  else if (room.tasks.length) startTaskAssignment(room);
  else room.phase = 'distressVote';
  appendLog(room, `👑 ${getPlayer(room, room.commanderId).nickname} 님이 커맨더입니다.`);
}
function currentAssigner(room) { return room.players[(room.players.findIndex(p => p.id === room.commanderId) + room.assignmentCursor) % room.players.length]; }
function startTaskAssignment(room) {
  // Token changes happen after tasks are revealed but before anyone chooses one.
  room.decisionResponses = {};
  room.phase = (mission(room).tokenSwap || mission(room).tokenMove) ? 'tokenEdit' : 'assign';
}
function startPrePlay(room) {
  const rule = mission(room);
  // A token adjustment is followed by normal task selection, not by play.
  if (room.phase === 'tokenEdit') { room.phase = 'assign'; return; }
  if (rule.distribute) {
    const assignments = room.players.map(player => room.tasks.filter(task => task.ownerId === player.id).length);
    if (Math.max(...assignments) - Math.min(...assignments) > 1) {
      taskFailure(room, '커맨더 분배 과제는 승무원별 담당 수 차이가 1을 넘을 수 없습니다.');
      return;
    }
  }
  if (room.maxPlayers === 5 && rule.fiveTransfer) { room.phase = 'taskTransfer'; return; }
  room.phase = 'distressVote';
}
function startPlay(room) { room.phase = 'play'; room.turnId = room.commanderId; room.nextTurnReadyAt = 0; }
function finishMission(room, win, reason) {
  room.phase = 'result'; room.turnId = null; room.result = { win, reason };
  appendLog(room, win ? '✨ 미션 성공! 행성 9를 향한 항로가 열렸습니다.' : `✕ 미션 실패 — ${reason}`);
}
function unresolvedTasks(room) { return room.tasks.filter(task => !task.done); }
function taskFailure(room, text) { finishMission(room, false, text); }
function resolveTrick(room) {
  const cards = room.trick;
  const rockets = cards.filter(x => x.card.suit === 'R');
  const candidates = rockets.length ? rockets : cards.filter(x => x.card.suit === cards[0].card.suit);
  const win = candidates.reduce((best, x) => x.card.value > best.card.value ? x : best);
  const winner = getPlayer(room, win.playerId); winner.wins += 1; room.trickNo += 1;
  room.lastTrick = { cards: [...cards], winnerId: winner.id }; appendLog(room, `🏆 ${winner.nickname} 님이 ${cardLabel(win.card)}로 트릭을 가져갔습니다.`);
  room.nextTurnReadyAt = Date.now() + TRICK_RESOLVE_MS;
  const before = new Set(room.tasks.filter(t => !t.done).map(t => t.id)); const completed = [];
  for (const task of room.tasks) {
    if (task.done || !cards.some(x => x.card.id === task.id)) continue;
    if (task.ownerId !== winner.id) return taskFailure(room, `${getPlayer(room, task.ownerId)?.nickname || '담당자'}의 ${cardLabel(task)} 과제를 ${winner.nickname} 님이 가져갔습니다.`);
    completed.push(task);
  }
  const rule = mission(room).special;
  const completedIds = new Set(completed.map(task => task.id));
  for (const task of completed) {
    // Consecutive order tokens may be completed in the same trick.  Only a
    // lower token that remains unresolved after this trick is a violation.
    if (task.order && room.tasks.some(other => other.order && other.order < task.order && before.has(other.id) && !completedIds.has(other.id))) return taskFailure(room, `①→② 순서가 아닌 과제를 먼저 완료했습니다.`);
    if (!task.order && room.tasks.some(other => other.order && before.has(other.id))) return taskFailure(room, '순서 토큰 과제를 모두 완료하기 전에 다른 과제를 완료했습니다.');
    if (task.arrow && room.tasks.some(other => other.arrow && other.arrow < task.arrow && before.has(other.id) && !completedIds.has(other.id))) return taskFailure(room, `화살표 순서가 아닌 과제를 먼저 완료했습니다.`);
    if (task.omega && room.tasks.some(other => other.id !== task.id && before.has(other.id) && !completedIds.has(other.id))) return taskFailure(room, 'Ω 과제는 마지막에 완료해야 합니다.');
    if (rule === 'omegaLastTrick' && task.omega && room.trickNo !== room.totalTricks) return taskFailure(room, 'Ω 과제는 마지막 트릭에서 완료해야 합니다.');
  }
  completed.forEach(task => { task.done = true; appendLog(room, `✓ ${cardLabel(task)} 과제가 완료되었습니다.`); });
  if (rule === 'sick' && winner.id === room.sickId) return taskFailure(room, '아픈 승무원이 트릭을 이겼습니다.');
  if (rule === 'noNine' && win.card.value === 9) return taskFailure(room, '값이 9인 카드로 트릭을 이겼습니다.');
  if ((rule === 'winOne' || rule === 'winTwoOnes') && win.card.suit !== 'R' && win.card.value === 1) room.wonWithOne += 1;
  if (rule === 'rockets' && win.card.suit === 'R') room.rocketWins.push(win.card.value);
  if (rule === 'rocketOrder' && win.card.suit === 'R') { if (win.card.value !== room.rocketWins.length + 1) return taskFailure(room, '로켓은 1→2→3→4 순서로 이겨야 합니다.'); room.rocketWins.push(win.card.value); }
  if (rule === 'balanced' || rule === 'balancedCommander') { if (Math.max(...room.players.map(player => player.wins)) - Math.min(...room.players.map(player => player.wins)) >= 2) return taskFailure(room, '승리 트릭 수 차이가 2 이상입니다.'); if (rule === 'balancedCommander' && (room.trickNo === 1 || room.trickNo === room.totalTricks) && winner.id !== room.commanderId) return taskFailure(room, '커맨더가 첫·마지막 트릭을 이겨야 합니다.'); }
  if (rule === 'oneTrick' && winner.id === room.targetId) { if (win.card.suit === 'R') return taskFailure(room, '지정된 승무원은 로켓으로 이길 수 없습니다.'); room.targetWins = (room.targetWins || 0) + 1; if (room.targetWins > 1) return taskFailure(room, '지정된 승무원이 두 번 이겼습니다.'); }
  if (rule === 'firstLast') { const edge = room.trickNo === 1 || room.trickNo === room.totalTricks; if (winner.id === room.targetId) { if (!edge || win.card.suit === 'R') return taskFailure(room, '지정된 승무원은 로켓 없이 첫·마지막 트릭만 이겨야 합니다.'); } else if (edge) return taskFailure(room, '첫·마지막 트릭은 지정된 승무원이 이겨야 합니다.'); }
  if (rule === 'finalPattern') { const expected = room.trickNo <= 4 ? room.targetId : room.trickNo === room.totalTricks ? room.targetBId : null; if ((expected && winner.id !== expected) || (!expected && (winner.id === room.targetId || winner.id === room.targetBId))) return taskFailure(room, '최종 패턴과 다른 승리자입니다.'); }
  if (rule === 'pink') { const pinkCount = cards.filter(item => item.card.suit === 'P').length; if (pinkCount && winner.id !== room.targetId) return taskFailure(room, '분홍 카드는 지정된 승무원이 모두 가져와야 합니다.'); room.pinkWins += pinkCount; }
  if (rule === 'swap' && room.trickNo === 1) { const picked = room.players.map((player, index) => ({ player, card: room.players[(index + 1) % room.players.length].hand[Math.floor(Math.random() * room.players[(index + 1) % room.players.length].hand.length)] })); picked.forEach(({ card }) => { const owner = room.players.find(player => player.hand.includes(card)); owner.hand = owner.hand.filter(item => item !== card); }); picked.forEach(({ player, card }) => player.hand.push(card)); }
  const allDone = room.tasks.every(task => task.done);
  const goalsMet = rule === 'winOne' ? room.wonWithOne >= 1 : rule === 'winTwoOnes' ? room.wonWithOne >= 2 : rule === 'rockets' || rule === 'rocketOrder' ? new Set(room.rocketWins).size === 4 : rule === 'oneTrick' ? room.targetWins === 1 : rule === 'firstLast' || rule === 'finalPattern' || rule === 'pink' ? room.trickNo === room.totalTricks && (rule !== 'pink' || room.pinkWins === 9) : true;
  if (allDone && goalsMet && !['noNine', 'sick', 'balanced', 'balancedCommander', 'firstLast', 'finalPattern', 'pink', 'rockets', 'rocketOrder', 'oneTrick'].includes(rule)) return finishMission(room, true, '모든 과제를 완료했습니다.');
  if (room.trickNo >= room.totalTricks) return goalsMet && allDone ? finishMission(room, true, '모든 목표를 완료했습니다.') : finishMission(room, false, '남은 트릭이 없는데 목표를 완료하지 못했습니다.');
  room.trick = []; room.leaderId = winner.id; room.turnId = winner.id;
  scheduleTurnReady(room);
}
function isEligibleComm(player, card) {
  if (card.suit === 'R') return false;
  const same = player.hand.filter(c => c.suit === card.suit);
  const values = same.map(c => c.value); return card.value === Math.min(...values) || card.value === Math.max(...values);
}

// Test bots are server-side seats: they never receive another player's hidden
// state, but the server can advance their required acknowledgements and turns.
function botName(room) { return `테스트 봇 ${room.players.filter(player => player.isBot).length + 1}`; }
function scheduleBotTurn(room) {
  if (room.botTimer || room.phase === 'lobby' || room.phase === 'result') return;
  const needsBot = (room.phase === 'chooseTarget' && ((mission(room).special !== 'noComm' && room.players.some(player => player.isBot && !(player.id in room.decisionResponses))) || getPlayer(room, room.commanderId)?.isBot))
    || (room.phase === 'assign' && mission(room).distribute && room.players.some(player => player.isBot && !(player.id in room.decisionResponses)))
    || (room.phase === 'assign' && getPlayer(room, mission(room).distribute ? room.commanderId : currentAssigner(room).id)?.isBot)
    || (room.phase === 'tokenEdit' && getPlayer(room, room.commanderId)?.isBot)
    || (room.phase === 'taskTransfer' && room.players.some(player => player.isBot && room.tasks.some(task => task.ownerId === player.id)))
    || (room.phase === 'distressVote' && room.players.some(player => player.isBot && !(player.id in room.distressVotes)))
    || (room.phase === 'distressDirection' && room.players.some(player => player.isBot && !(player.id in room.distressDirections)))
    || (room.phase === 'distressPass' && room.players.some(player => player.isBot && !room.distressPasses[player.id]))
    || (room.phase === 'play' && getPlayer(room, room.turnId)?.isBot);
  if (!needsBot) return;
  const delay = Math.max(450, (room.nextTurnReadyAt ?? 0) - Date.now());
  room.botTimer = setTimeout(() => { room.botTimer = null; runBotTurn(room); send(room); }, delay);
}
function runBotTurn(room) {
  const rule = mission(room);
  if (room.phase === 'chooseTarget') {
    const needsResponses = rule.special !== 'noComm';
    const responder = needsResponses && room.players.find(player => player.isBot && !(player.id in room.decisionResponses));
    if (responder) { room.decisionResponses[responder.id] = true; appendLog(room, `🤖 ${responder.nickname} 님이 예라고 답했습니다.`); return; }
    const commander = getPlayer(room, room.commanderId);
    if (!commander?.isBot || (needsResponses && room.players.some(player => !(player.id in room.decisionResponses)))) return;
    const target = room.players.find(player => (rule.pick !== 'notCommander' || player.id !== commander.id) && (rule.special !== 'finalPattern' || player.id !== room.targetId));
    if (!target) return;
    if (rule.special === 'finalPattern' && room.targetStep === 0) { room.targetId = target.id; room.targetStep = 1; room.decisionResponses = {}; appendLog(room, '🤖 첫 4트릭 담당자를 지정했습니다.'); return; }
    room.targetId ??= target.id; if (rule.special === 'finalPattern') room.targetBId = target.id; if (rule.special === 'sick') room.sickId = target.id;
    if (rule.special === 'allTasks') { room.tasks = room.hiddenTasks ?? []; room.hiddenTasks = null; room.tasks.forEach(task => { task.ownerId = target.id; }); }
    if (room.tasks.length && rule.special !== 'allTasks') startTaskAssignment(room); else startPrePlay(room);
    appendLog(room, '🤖 특수 미션 대상을 지정했습니다.'); return;
  }
  if (room.phase === 'assign') {
    if (rule.distribute) {
      const responder = room.players.find(player => player.isBot && !(player.id in room.decisionResponses));
      if (responder) { room.decisionResponses[responder.id] = true; appendLog(room, `🤖 ${responder.nickname} 님이 과제를 맡을 수 있다고 답했습니다.`); return; }
      if (room.players.some(player => !(player.id in room.decisionResponses))) return;
    }
    const actor = getPlayer(room, rule.distribute ? room.commanderId : currentAssigner(room).id); if (!actor?.isBot) return;
    const task = room.tasks.find(item => !item.ownerId && actor.hand.some(card => card.id === item.id)) || room.tasks.find(item => !item.ownerId); if (!task) return;
    const owner = rule.distribute ? room.players.find(player => player.hand.some(card => card.id === task.id) && room.tasks.filter(item => item.ownerId === player.id).length < Math.ceil(room.tasks.length / room.players.length)) || room.players[0] : actor;
    task.ownerId = owner.id; room.assignmentCursor += 1; appendLog(room, `🤖 ${owner.nickname} 님이 ${cardLabel(task)} 과제를 맡았습니다.`);
    if (room.tasks.every(item => item.ownerId)) startPrePlay(room); return;
  }
  if (room.phase === 'tokenEdit' && getPlayer(room, room.commanderId)?.isBot) { appendLog(room, '🤖 순서 토큰 조정을 건너뜁니다.'); room.phase = 'assign'; return; }
  if (room.phase === 'taskTransfer') { const actor = room.players.find(player => player.isBot && room.tasks.some(task => task.ownerId === player.id)); const task = actor && room.tasks.find(item => item.ownerId === actor.id); if (!actor || !task) return; task.ownerId = nextPlayer(room, actor.id).id; room.phase = 'distressVote'; appendLog(room, '🤖 과제를 오른쪽 승무원에게 전달했습니다.'); return; }
  if (room.phase === 'distressVote') { const actor = room.players.find(player => player.isBot && !(player.id in room.distressVotes)); if (!actor) return; room.distressVotes[actor.id] = false; appendLog(room, `🤖 ${actor.nickname} 님이 조난 신호를 사용하지 않습니다.`); if (room.players.every(player => player.id in room.distressVotes)) startPlay(room); return; }
  if (room.phase === 'distressDirection') { const actor = room.players.find(player => player.isBot && !(player.id in room.distressDirections)); if (!actor) return; room.distressDirections[actor.id] = Object.values(room.distressDirections)[0] ?? 'left'; if (room.players.every(player => player.id in room.distressDirections)) { room.distressDirection = Object.values(room.distressDirections)[0]; room.phase = 'distressPass'; } return; }
  if (room.phase === 'distressPass') { const actor = room.players.find(player => player.isBot && !room.distressPasses[player.id]); const card = actor?.hand.find(item => item.suit !== 'R'); if (!actor || !card) return; room.distressPasses[actor.id] = card.id; return; }
  if (room.phase === 'play') { const actor = getPlayer(room, room.turnId); if (!actor?.isBot) return; const card = actor.hand.find(item => legalCards(room, actor).includes(item.id)); if (!card) return; actor.hand = actor.hand.filter(item => item.id !== card.id); room.trick.push({ playerId: actor.id, card }); appendLog(room, `🤖 ${actor.nickname} 님이 ${cardLabel(card)}를 냈습니다.`); if (room.trick.length === room.players.length) resolveTrick(room); else room.turnId = nextPlayer(room, actor.id).id; }
}

function ack(socket, event, handler) {
  socket.on(event, (payload = {}, callback) => { try { const data = handler(payload); callback?.({ ok: true, data }); } catch (error) { const message = error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'; callback?.({ ok: false, error: message }); socket.emit('ERROR', { message }); } });
}
io.on('connection', socket => {
  ack(socket, 'ROOM_CREATE', data => {
    const nickname = validName(data.nickname); const maxPlayers = Number(data.maxPlayers); const missionId = Number(data.missionId);
    if (![3, 4, 5].includes(maxPlayers)) throw Error('3~5명을 선택해 주세요.'); if (!MISSIONS[missionId]) throw Error('지원하지 않는 미션입니다.');
    let roomCode = code(); while (rooms.has(roomCode)) roomCode = code(); const room = createRoom(roomCode, nickname, maxPlayers, missionId); const player = room.players[0]; player.socketId = socket.id; rooms.set(roomCode, room); bind(socket, room, player); send(room); return { code: roomCode, playerId: player.id, sessionToken: player.sessionToken };
  });
  ack(socket, 'ROOM_JOIN', data => {
    const room = roomByPayload(data); let player = room.players.find(p => p.id === data.playerId && p.sessionToken === data.sessionToken);
    if (player) { player.socketId = socket.id; player.connected = true; }
    else { if (room.phase !== 'lobby') throw Error('이미 시작한 탐사입니다.'); if (room.players.length >= room.maxPlayers) throw Error('방이 가득 찼습니다.'); const nickname = validName(data.nickname); if (room.players.some(p => p.nickname === nickname)) throw Error('다른 이름을 사용해 주세요.'); player = { id: randomUUID(), nickname, sessionToken: token(), socketId: socket.id, connected: true, ready: false, hand: [], wins: 0, comm: null }; room.players.push(player); }
    bind(socket, room, player); send(room); return { code: room.code, playerId: player.id, sessionToken: player.sessionToken };
  });
  ack(socket, 'PLAYER_READY', data => { const room = roomByPayload(data); const player = getPlayer(room, requireSession(socket, room.code)); if (room.phase !== 'lobby') throw Error('대기실에서만 준비할 수 있습니다.'); player.ready = !player.ready; send(room); });
  ack(socket, 'TEST_BOT_ADD', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (actor !== room.hostId || room.phase !== 'lobby') throw Error('방장만 테스트 봇을 추가할 수 있습니다.'); if (room.players.length >= room.maxPlayers) throw Error('빈 좌석이 없습니다.'); const player = { id: randomUUID(), nickname: botName(room), isBot: true, sessionToken: null, socketId: null, connected: true, ready: true, hand: [], wins: 0, comm: null }; room.players.push(player); appendLog(room, `🤖 ${player.nickname} 님이 검증용 승무원으로 합류했습니다.`); send(room); });
  ack(socket, 'ROOM_LEAVE', data => { const room = rooms.get(String(data?.code || socket.data.room || '').toUpperCase()); if (!room) return; const player = getPlayer(room, socket.data.playerId); if (!player) return; if (room.phase === 'lobby') { room.players = room.players.filter(item => item.id !== player.id); if (!room.players.length) { rooms.delete(room.code); return; } if (room.hostId === player.id) room.hostId = room.players[0].id; } else { player.connected = false; player.socketId = null; } socket.leave(roomChannel(room.code)); socket.data.room = null; socket.data.playerId = null; send(room); });
  ack(socket, 'MISSION_SET', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const missionId = Number(data.missionId); if (actor !== room.hostId || room.phase !== 'lobby') throw Error('방장만 미션을 고를 수 있습니다.'); if (!MISSIONS[missionId]) throw Error('지원하지 않는 미션입니다.'); if (missionId !== room.missionId) { room.distressActive = false; room.distressMissionId = null; } room.missionId = missionId; send(room); });
  ack(socket, 'GAME_START', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (actor !== room.hostId) throw Error('방장만 시작할 수 있습니다.'); if (room.phase !== 'lobby') throw Error('이미 시작했습니다.'); if (room.players.length < 3) throw Error('최소 3명이 필요합니다.'); if (room.players.length !== room.maxPlayers) throw Error(`모든 좌석(${room.maxPlayers}명)이 채워져야 합니다.`); if (!room.players.every(p => p.ready)) throw Error('모든 승무원이 준비해야 합니다.'); deal(room); send(room); });
  ack(socket, 'DECISION_RESPONSE', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const distributing = room.phase === 'assign' && mission(room).distribute; if (room.phase !== 'chooseTarget' && !distributing) throw Error('지금은 응답할 때가 아닙니다.'); if (actor in room.decisionResponses) throw Error('이미 답했습니다.'); room.decisionResponses[actor] = !!data.yes; appendLog(room, `🗣 ${getPlayer(room, actor).nickname} 님이 ${data.yes ? '예' : '아니오'}라고 답했습니다.`); send(room); });
  ack(socket, 'TARGET_SELECT', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const rule = mission(room); if (room.phase !== 'chooseTarget' || actor !== room.commanderId) throw Error('커맨더만 지정할 수 있습니다.'); if (rule.special !== 'noComm' && room.players.some(player => !(player.id in room.decisionResponses))) throw Error('모든 승무원의 응답을 먼저 받아야 합니다.'); const target = getPlayer(room, String(data.targetId)); if (!target || (rule.pick === 'notCommander' && target.id === room.commanderId) || (rule.special === 'finalPattern' && room.targetId === target.id)) throw Error('선택할 수 없는 승무원입니다.'); if (rule.special === 'finalPattern' && room.targetStep === 0) { room.targetId = target.id; room.targetStep = 1; room.decisionResponses = {}; appendLog(room, '첫 4트릭 담당자가 지정되었습니다.'); send(room); return; } room.targetId ??= target.id; if (rule.special === 'finalPattern') room.targetBId = target.id; if (rule.special === 'sick') room.sickId = target.id; if (rule.special === 'allTasks') { room.tasks = room.hiddenTasks ?? []; room.hiddenTasks = null; room.tasks.forEach(task => { task.ownerId = target.id; }); } if (room.tasks.length && rule.special !== 'allTasks') room.phase = 'assign'; else startPrePlay(room); appendLog(room, '특수 미션 대상을 지정했습니다.'); send(room); });
  ack(socket, 'TASK_ASSIGN', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const rule = mission(room); if (room.phase !== 'assign' || (rule.distribute ? room.commanderId : currentAssigner(room).id) !== actor) throw Error('지금은 과제를 선택할 차례가 아닙니다.'); if (rule.distribute && room.players.some(player => !(player.id in room.decisionResponses))) throw Error('모든 승무원의 응답을 먼저 받아야 합니다.'); const task = room.tasks.find(t => t.id === String(data.taskId)); const owner = rule.distribute ? getPlayer(room, String(data.ownerId)) : getPlayer(room, actor); if (!task || task.ownerId || !owner) throw Error('선택할 수 없는 과제입니다.'); if (rule.distribute && room.tasks.filter(item => item.ownerId === owner.id).length >= Math.ceil(room.tasks.length / room.players.length)) throw Error('과제는 가능한 한 균등하게 분배해야 합니다.'); task.ownerId = owner.id; appendLog(room, `📌 ${owner.nickname} 님이 ${cardLabel(task)} 과제를 맡았습니다.`); room.assignmentCursor += 1; if (room.tasks.every(t => t.ownerId)) startPrePlay(room); else if (rule.distribute) room.decisionResponses = {}; send(room); });
  ack(socket, 'TOKEN_EDIT', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const rule = mission(room); if (room.phase !== 'tokenEdit' || actor !== room.commanderId) throw Error('커맨더만 순서 토큰을 조정할 수 있습니다.'); const from = room.tasks.find(task => task.id === String(data.fromId)); const to = room.tasks.find(task => task.id === String(data.toId)); const hasToken = task => !!(task?.order || task?.arrow || task?.omega); if (!from || !to || from === to) throw Error('서로 다른 과제를 선택해 주세요.'); if (rule.tokenSwap) { if (!hasToken(from) || !hasToken(to)) throw Error('맞바꿀 순서 토큰 두 개를 선택해 주세요.'); for (const key of ['order', 'arrow', 'omega']) [from[key], to[key]] = [to[key], from[key]]; appendLog(room, '🔀 순서 토큰 두 개의 위치를 바꿨습니다.'); } else if (rule.tokenMove) { const key = ['order', 'arrow', 'omega'].find(name => from[name]); if (!key || hasToken(to)) throw Error('옮길 순서 토큰과 토큰이 없는 과제를 선택해 주세요.'); to[key] = from[key]; from[key] = key === 'omega' ? false : null; appendLog(room, '🔀 순서 토큰을 다른 과제로 옮겼습니다.'); } else throw Error('이 미션에는 토큰 조정이 없습니다.'); startPrePlay(room); send(room); });
  ack(socket, 'TOKEN_EDIT_SKIP', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (room.phase !== 'tokenEdit' || actor !== room.commanderId) throw Error('커맨더만 건너뛸 수 있습니다.'); startPrePlay(room); send(room); });
  ack(socket, 'TASK_TRANSFER', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (room.phase !== 'taskTransfer') throw Error('지금은 과제를 전달할 수 없습니다.'); const task = room.tasks.find(item => item.id === String(data.taskId) && item.ownerId === actor); const recipient = getPlayer(room, String(data.recipientId)); if (!task || !recipient || recipient.id === actor) throw Error('내 과제 하나를 다른 승무원에게 전달해야 합니다.'); task.ownerId = recipient.id; appendLog(room, `↗ ${getPlayer(room, actor).nickname} 님이 과제를 ${recipient.nickname} 님에게 전달했습니다.`); room.taskTransferred = true; room.phase = 'distressVote'; send(room); });
  ack(socket, 'TASK_TRANSFER_SKIP', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (room.phase !== 'taskTransfer' || actor !== room.commanderId) throw Error('커맨더만 전달 단계를 건너뛸 수 있습니다.'); room.phase = 'distressVote'; send(room); });
  ack(socket, 'DISTRESS_VOTE', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (room.phase !== 'distressVote') throw Error('지금은 조난 신호를 결정할 때가 아닙니다.'); room.distressVotes[actor] = !!data.use; if (room.players.every(player => player.id in room.distressVotes)) { if (room.players.every(player => room.distressVotes[player.id])) { room.distressActive = true; room.distressMissionId = room.missionId; room.distressDirections = {}; room.phase = 'distressDirection'; appendLog(room, '🆘 조난 신호를 사용합니다. 카드를 전달할 방향을 정하세요.'); } else { appendLog(room, '조난 신호를 사용하지 않습니다.'); startPlay(room); } } send(room); });
  ack(socket, 'DISTRESS_DIRECTION', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const direction = data.direction === 'left' || data.direction === 'right' ? data.direction : null; if (room.phase !== 'distressDirection' || !direction) throw Error('지금은 전달 방향을 정할 때가 아닙니다.'); if (actor in room.distressDirections) throw Error('이미 방향을 골랐습니다.'); room.distressDirections[actor] = direction; if (room.players.every(player => player.id in room.distressDirections)) { const directions = Object.values(room.distressDirections); if (new Set(directions).size !== 1) { room.distressDirections = {}; appendLog(room, '🆘 전달 방향이 달라 다시 정합니다.'); } else { room.distressDirection = directions[0]; room.phase = 'distressPass'; appendLog(room, `🆘 조난 신호: ${room.distressDirection === 'left' ? '왼쪽' : '오른쪽'} 이웃에게 카드를 전달합니다.`); } } send(room); });
  ack(socket, 'DISTRESS_PASS', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (room.phase !== 'distressPass') throw Error('지금은 카드를 전달할 때가 아닙니다.'); if (room.distressPasses[actor]) throw Error('이미 전달할 카드를 골랐습니다.'); const card = getPlayer(room, actor).hand.find(item => item.id === String(data.cardId) && item.suit !== 'R'); if (!card) throw Error('로켓이 아닌 내 카드 한 장을 골라 주세요.'); room.distressPasses[actor] = card.id; if (room.players.every(player => room.distressPasses[player.id])) { const passes = room.players.map(player => ({ from: player, card: player.hand.find(item => item.id === room.distressPasses[player.id]) })); passes.forEach(({ from, card }) => { from.hand = from.hand.filter(item => item !== card); }); passes.forEach(({ from, card }) => (room.distressDirection === 'left' ? nextPlayer : previousPlayer)(room, from.id).hand.push(card)); room.players.forEach(player => player.hand.sort((a, b) => a.suit.localeCompare(b.suit) || a.value - b.value)); appendLog(room, `🆘 조난 신호: 모든 승무원이 ${room.distressDirection === 'left' ? '왼쪽' : '오른쪽'} 이웃에게 카드를 전달했습니다.`); startPlay(room); } send(room); });
  ack(socket, 'COMMUNICATE', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const player = getPlayer(room, actor); const rule = mission(room); if (room.phase !== 'play' || room.trick.length || room.trickNo + 1 < (rule.commFrom || 1)) throw Error('통신은 새 트릭의 첫 카드가 나오기 전에만 할 수 있습니다.'); if (rule.special === 'noComm' && room.targetId === actor) throw Error('지정된 승무원은 통신할 수 없습니다.'); if (player.comm) throw Error('통신은 미션에서 한 번만 할 수 있습니다.'); const card = player.hand.find(c => c.id === String(data.cardId)); if (!card || !isEligibleComm(player, card)) throw Error('해당 무늬의 최고 또는 최저 카드만 통신할 수 있습니다.'); const same = player.hand.filter(c => c.suit === card.suit); const marker = same.length === 1 ? '유일' : card.value === Math.max(...same.map(c => c.value)) ? '최고' : '최저'; player.comm = { card, marker: rule.deadZone ? '?' : marker }; appendLog(room, `📡 ${player.nickname} 님이 통신했습니다.`); send(room); });
  ack(socket, 'CARD_PLAY', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); const player = getPlayer(room, actor); if (room.phase !== 'play' || room.turnId !== actor) throw Error('지금은 당신의 차례가 아닙니다.'); const card = player.hand.find(c => c.id === String(data.cardId)); if (!card) throw Error('손패에 없는 카드입니다.'); if (!legalCards(room, player).includes(card.id)) throw Error('선도 무늬를 따라야 합니다.'); player.hand = player.hand.filter(c => c.id !== card.id); room.trick.push({ playerId: actor, card }); if (room.trick.length === room.players.length) resolveTrick(room); else room.turnId = nextPlayer(room, actor).id; send(room); });
  ack(socket, 'GAME_RESTART', data => { const room = roomByPayload(data); const actor = requireSession(socket, room.code); if (actor !== room.hostId || room.phase !== 'result') throw Error('방장만 다시 시작할 수 있습니다.'); if (room.result?.win) { room.distressActive = false; room.distressMissionId = null; } room.players.forEach(p => { p.ready = true; }); room.phase = 'lobby'; room.tasks = []; room.trick = []; room.result = null; appendLog(room, '↺ 모든 승무원이 준비 완료된 대기실로 돌아왔습니다.'); send(room); });
  socket.on('disconnect', () => { const room = rooms.get(socket.data.room); const player = room && getPlayer(room, socket.data.playerId); if (!player || player.socketId !== socket.id) return; player.connected = false; player.socketId = null; send(room); });
});
server.listen(PORT, () => console.log(`The Crew online server: http://localhost:${PORT}`));
