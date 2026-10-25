import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { io as connect } from 'socket.io-client';
import {
  MISSIONS, server, io, rooms, createRoom, deal, view, resolveTrick,
  runBotTurn, currentAssigner, assignTask, canAssignTask, legalCards,
} from './server.mjs';

const fixtures = [];
const card = id => ({ id, suit: id[0], value: Number(id.slice(1)) });
function roomFor(missionId, count = 4) {
  const room = createRoom(`TEST${fixtures.length}`, '승무원 1', count, missionId);
  for (let i = 1; i < count; i++) room.players.push(createRoom('', `승무원 ${i + 1}`, count, missionId).players[0]);
  fixtures.push(room);
  deal(room);
  return room;
}
function task(room, id, extra = {}) {
  return { ...card(id), ownerId: room.players[0].id, done: false, ...extra };
}
function trick(room, ids, winnerIndex = 0) {
  room.phase = 'play';
  room.trick = ids.map((id, i) => ({ playerId: room.players[(i + winnerIndex) % room.players.length].id, card: card(id) }));
  resolveTrick(room);
}
afterEach(() => {
  for (const room of fixtures) {
    clearTimeout(room.turnReadyTimer);
    clearTimeout(room.botTimer);
  }
});
after(() => io.close());

// Counts and token layouts transcribed from the supplied mission PDF, pp. 3–11.
test('all 50 mission setups match the logbook for 3, 4 and 5 players', () => {
  const counts = [1,2,2,3,0,3,3,3,0,4,4,4,0,4,4,0,2,5,5,2,5,5,5,6,6,0,3,6,0,6,6,7,0,0,7,7,4,8,8,8,0,9,9,0,9,0,10,3,10,0];
  const orders = {3:2,8:3,11:1,15:4,19:1,21:2,23:5,28:1,31:3,36:2,40:3};
  const arrows = {6:2,14:3,22:4,25:2,30:3,35:3,39:3,45:3,49:3};
  const omegas = [7,12,28,48];
  const deadZones = [6,14,21,25,29,39];
  const communicationFrom = {18:2,19:3,28:3,30:2,38:3};
  const distribution = [24,32,36,43];
  for (let id = 1; id <= 50; id++) {
    assert.equal(MISSIONS[id].tasks, counts[id - 1], `mission ${id} tasks`);
    assert.equal(MISSIONS[id].order ?? 0, orders[id] ?? 0, `mission ${id} numbers`);
    assert.equal(MISSIONS[id].arrows ?? 0, arrows[id] ?? 0, `mission ${id} arrows`);
    assert.equal(!!MISSIONS[id].omega, omegas.includes(id), `mission ${id} omega`);
    assert.equal(!!MISSIONS[id].deadZone, deadZones.includes(id), `mission ${id} dead zone`);
    assert.equal(MISSIONS[id].commFrom ?? 1, communicationFrom[id] ?? 1, `mission ${id} communication`);
    assert.equal(!!MISSIONS[id].distribute, distribution.includes(id), `mission ${id} distribution`);
    assert.equal(!!MISSIONS[id].fiveTransfer, id >= 25 && counts[id - 1] > 0, `mission ${id} five-player transfer`);
    for (const count of [3,4,5]) {
      const room = roomFor(id, count);
      const tasks = room.hiddenTasks ?? room.tasks;
      assert.equal(room.players.flatMap(p => p.hand).length, 40);
      assert.equal(room.totalTricks, Math.floor(40 / count));
      assert.equal(tasks.length, counts[id - 1]);
      assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length);
      assert.ok(room.players.find(p => p.id === room.commanderId).hand.some(c => c.id === 'R4'));
      if (omegas.includes(id)) assert.ok(tasks[orders[id] ?? 0].omega);
    }
  }
});

test('commander distributes every task, revealing only the current one and clearing each answer round', () => {
  const room = roomFor(24);
  const commander = room.commanderId;
  assert.equal(view(room, commander).tasks.length, 1);
  assert.throws(() => assignTask(room, room.tasks[1], room.players[0]), /현재 공개/);
  for (let i = 0; i < room.tasks.length; i++) {
    assert.equal(currentAssigner(room).id, commander);
    room.decisionResponses = Object.fromEntries(room.players.map(p => [p.id, true]));
    const owner = room.players.find(p => canAssignTask(room, p.id));
    assignTask(room, room.tasks[i], owner);
    assert.deepEqual(room.decisionResponses, {});
    if (room.phase === 'assign') {
      const visible = view(room, commander).tasks;
      assert.equal(visible.length, i + 2);
      assert.equal(visible.filter(t => !t.ownerId).length, 1);
    }
  }
  assert.equal(room.phase, 'distressVote');
  const counts = room.players.map(p => room.tasks.filter(t => t.ownerId === p.id).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('distribution prevents allocations that would force an uneven final split', () => {
  const room = roomFor(24);
  const [a,b,c,d] = room.players;
  [a,a,b,b,c].forEach((p, i) => assignTask(room, room.tasks[i], p));
  assert.equal(canAssignTask(room, c.id), false); // 2,2,2,0 would fail.
  assert.throws(() => assignTask(room, room.tasks[5], c), /균등/);
  assignTask(room, room.tasks[5], d);
  assert.equal(room.phase, 'distressVote');
});

test('bot commander follows one-card disclosure, repeats questions and distributes evenly', () => {
  const room = roomFor(36, 5);
  room.players.forEach(p => { p.isBot = true; });
  for (let i = 0; i < 100 && room.phase === 'assign'; i++) runBotTurn(room);
  assert.equal(room.phase, 'taskTransfer');
  const counts = room.players.map(p => room.tasks.filter(t => t.ownerId === p.id).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('consecutive numbered tasks and an unnumbered task can finish in the same trick', () => {
  const room = roomFor(21);
  room.tasks = [task(room, 'B2', {order:1}), task(room, 'B3', {order:2}), task(room, 'B4')];
  trick(room, ['B9','B2','B3','B4']);
  assert.equal(room.result?.win, true);
});

test('an unnumbered task still fails when a numbered task is outstanding', () => {
  const room = roomFor(21);
  room.tasks = [task(room, 'G2', {order:1}), task(room, 'B4')];
  trick(room, ['B9','B2','B3','B4']);
  assert.equal(room.result?.win, false);
});

test('arrow order and omega-last conditions reject premature completion', () => {
  for (const token of ['arrow', 'omega']) {
    const room = roomFor(token === 'arrow' ? 22 : 7);
    room.tasks = token === 'arrow'
      ? [task(room, 'G2', {arrow:1}), task(room, 'B2', {arrow:2})]
      : [task(room, 'G2'), task(room, 'B2', {omega:true})];
    trick(room, ['B9','B2','B3','B4']);
    assert.equal(room.result?.win, false);
  }
});

test('mission 12 draws simultaneously from the right-hand neighbor', () => {
  const room = roomFor(12);
  room.players.forEach((p,i) => { p.hand = [card(`G${i+1}`)]; });
  room.tasks = [task(room, 'Y8')];
  trick(room, ['B9','B2','B3','B4']);
  assert.deepEqual(room.players.map(p => p.hand.map(c => c.id)), [['G4'],['G1'],['G2'],['G3']]);
});

test('mission 46 announces pink 9 and assigns its left-hand neighbor', () => {
  const room = roomFor(46);
  const holderIndex = room.players.findIndex(p => p.hand.some(c => c.id === 'P9'));
  assert.equal(view(room, room.players[0].id).pinkNineHolderId, room.players[holderIndex].id);
  assert.equal(room.targetId, room.players[(holderIndex + 1) % room.players.length].id);
  assert.ok(room.log.some(line => line.includes('●9 소유자:') && line.includes(room.players[holderIndex].nickname)));
});

test('mission 33 resets exactly-one-trick progress on a retry', () => {
  const room = roomFor(33);
  room.targetWins = 1;
  deal(room);
  assert.equal(room.targetWins, 0);
  room.targetId = room.players[0].id;
  trick(room, ['B9','B2','B3','B4']);
  assert.equal(room.result, null);
  assert.equal(room.targetWins, 1);
});

test('mission 17 succeeds once its tasks finish; mission 16 continues checking nines', () => {
  const room = roomFor(17);
  room.tasks = [task(room, 'B2'), task(room, 'B3')];
  trick(room, ['B8','B2','B3','B4']);
  assert.equal(room.result?.win, true);
  const noTasks = roomFor(16);
  trick(noTasks, ['B8','B2','B3','B4']);
  assert.equal(noTasks.result, null);
  trick(noTasks, ['G9','G2','G3','G4']);
  assert.equal(noTasks.result?.win, false);
});

test('mission 13 and 44 finish on the fourth winning rocket, including before the final trick', () => {
  for (const id of [13,44]) {
    const room = roomFor(id);
    for (let n = 1; n <= 4; n++) trick(room, [`R${n}`,'B2','B3','B4']);
    assert.equal(room.result?.win, true);
    assert.equal(room.trickNo, 4);
  }
});

test('mission 46 succeeds when all pink cards have been captured', () => {
  const room = roomFor(46);
  room.targetId = room.players[0].id;
  room.pinkWins = 7;
  trick(room, ['P9','P2','G3','G4']);
  assert.equal(room.result?.win, true);
});

test('sick and exactly-one-trick roles continue to be checked after an initial valid trick', () => {
  const sick = roomFor(5);
  sick.sickId = sick.players[1].id;
  trick(sick, ['B9','B2','B3','B4']);
  assert.equal(sick.result, null);
  trick(sick, ['G9','G2','G3','G4'], 1);
  assert.equal(sick.result?.win, false);
  const one = roomFor(33);
  one.targetId = one.players[0].id;
  trick(one, ['B9','B2','B3','B4']);
  trick(one, ['G9','G2','G3','G4']);
  assert.equal(one.result?.win, false);
});

test('mission 48 omega must finish in the final trick', () => {
  const room = roomFor(48);
  room.tasks = [task(room, 'B2', {omega:true})];
  trick(room, ['B9','B2','B3','B4']);
  assert.equal(room.result?.win, false);
});

test('following suit takes priority over playing a rocket', () => {
  const room = roomFor(1);
  const player = room.players[0];
  player.hand = ['B2','R4','Y3'].map(card);
  room.turnId = player.id;
  room.trick = [{playerId:room.players[1].id, card:card('B9')}];
  assert.deepEqual(legalCards(room, player), ['B2']);
});

test('a played communication card becomes used while the one-use limit remains', () => {
  const room = roomFor(1);
  const player = room.players[0];
  player.comm = { card: player.hand[0], marker: '최고' };
  assert.equal(view(room, player.id).players[0].comm.played, false);
  player.hand.shift();
  assert.equal(view(room, player.id).players[0].comm.played, true);
  assert.ok(player.comm);
});

test('bots finish the simultaneous distress pass and cannot override conflicting directions', () => {
  const room = roomFor(1, 3);
  const [a,b,c] = room.players;
  c.isBot = true;
  room.phase = 'distressDirection';
  room.distressDirections = {[a.id]:'left', [b.id]:'right'};
  runBotTurn(room);
  assert.equal(room.phase, 'distressDirection');
  assert.deepEqual(room.distressDirections, {});
  room.phase = 'distressPass'; room.distressDirection = 'left';
  [a,b,c].forEach((p,i) => {p.hand = [card(`B${i+1}`), card(`R${i+1}`)];});
  room.distressPasses = {[a.id]:'B1', [b.id]:'B2'};
  runBotTurn(room);
  assert.equal(room.phase, 'play');
  assert.deepEqual(room.players.map(p => p.hand.find(c => c.suit === 'B').id), ['B3','B1','B2']);
  assert.deepEqual(room.players.map(p => p.hand.find(c => c.suit === 'R').id), ['R1','R2','R3']);
});

test('distress activation survives failed retries and resets for a different mission', () => {
  const room = roomFor(1);
  room.distressActive = true; room.distressMissionId = 1;
  deal(room);
  assert.equal(room.distressActive, true);
  room.missionId = 2;
  deal(room);
  assert.equal(room.distressActive, false);
});

test('real socket clients receive good/bad answers and the commander can distribute successive tasks', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  const command = (client, event, data = {}) => new Promise((resolve, reject) => {
    client.timeout(3000).emit(event, data, (error, reply) => error ? reject(error) : resolve(reply));
  });
  try {
    for (let i = 0; i < 3; i++) {
      const client = connect(url, {transports:['websocket'], reconnection:false});
      await new Promise((resolve, reject) => {client.once('connect', resolve); client.once('connect_error', reject);});
      clients.push(client);
    }
    const created = await command(clients[0], 'ROOM_CREATE', {nickname:'가람', maxPlayers:3, missionId:5});
    const code = created.data.code;
    const sessions = [created.data];
    for (let i = 1; i < 3; i++) sessions.push((await command(clients[i], 'ROOM_JOIN', {code, nickname:['','나래','다온'][i]})).data);
    for (const client of clients) assert.equal((await command(client, 'PLAYER_READY', {code})).ok, true);
    assert.equal((await command(clients[0], 'GAME_START', {code})).ok, true);
    const room = rooms.get(code); fixtures.push(room);
    const cmdIndex = sessions.findIndex(s => s.playerId === room.commanderId);
    assert.equal((await command(clients[cmdIndex], 'TARGET_SELECT', {code, targetId:sessions[0].playerId})).ok, false);
    for (let i = 0; i < 3; i++) assert.equal((await command(clients[i], 'DECISION_RESPONSE', {code, yes:i !== 1})).ok, true);
    const snapshot = new Promise(resolve => clients[0].once('ROOM_STATE', resolve));
    assert.equal((await command(clients[cmdIndex], 'TARGET_SELECT', {code, targetId:sessions[1].playerId})).ok, true);
    const received = await snapshot;
    assert.equal(received.decisionResponses[sessions[0].playerId], true);
    assert.equal(received.decisionResponses[sessions[1].playerId], false);
    assert.equal(received.targetId, sessions[1].playerId);
    assert.ok(received.log.some(line => line.includes('나쁨')));
    assert.ok(received.players.every(p => !('hand' in p)));

    room.missionId = 24; deal(room);
    const distributor = clients[sessions.findIndex(s => s.playerId === room.commanderId)];
    const outsider = clients.find(c => c !== distributor);
    for (let i = 0; i < 6; i++) {
      for (const client of clients) await command(client, 'DECISION_RESPONSE', {code, yes:true});
      const next = room.tasks.find(t => !t.ownerId);
      const owner = room.players.find(p => canAssignTask(room, p.id));
      assert.equal((await command(outsider, 'TASK_ASSIGN', {code, taskId:next.id, ownerId:owner.id})).ok, false);
      assert.equal((await command(distributor, 'TASK_ASSIGN', {code, taskId:next.id, ownerId:owner.id})).ok, true);
    }
    assert.equal(room.phase, 'distressVote');
  } finally { clients.forEach(client => client.close()); }
});
