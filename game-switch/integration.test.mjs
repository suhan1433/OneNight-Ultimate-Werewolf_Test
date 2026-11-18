import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { games, entry } from './catalog.ts';
import { defaultSetup, defaultWerewolfDeck, lobbySettings } from './settings.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
const sockets = new Set();
const dataDir = await mkdtemp(join(tmpdir(), 'club-switch-'));
const servers = {};
const call = (socket, event, data = {}) => new Promise((resolve, reject) => {
  socket.timeout(5000).emit(event, data, (err, ack) => err ? reject(err) : ack?.ok ? resolve(ack.data) : reject(Error(ack?.error)));
});
const connect = async game => {
  const socket = io(servers[game], { path: game === 'secret_hitler' ? '/secret_hitler/socket.io' : '/socket.io', forceNew: true, transports: ['websocket'], reconnection: false });
  sockets.add(socket);
  socket.onAny((event, state) => { if (['ROOM_STATE','state','state:sync'].includes(event)) socket.view = state; });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
};
const createBotLobby = async game => {
  const socket=await connect(game);
  const [event,payload]=entry(game,'봇방 방장',1);
  const session=await call(socket,event,game==='werewolf'?{...payload,botMode:true}:payload);
  const code=session.roomCode??session.code??session.roomId;
  const add={skullking:'BOT_FILL',spacecrew:'TEST_BOT_ADD',rummikub:'room:fillBots',deception:'addBot',secret_hitler:'ADD_BOT'}[game];
  if(add) await call(socket,add,game==='deception'||game==='secret_hitler'?{}:{roomCode:code,code,roomId:code,clientSeq:1});
  // Avalon fills bots at game start; its waiting room exercises solo movement.
  const members=socket.view.players??socket.view.members;
  assert.equal(members.filter(p=>!p.isBot&&!p.bot&&!p.spectator).length,1);
  if(game!=='avalon') assert.ok(members.some(p=>p.isBot||p.bot));
  return {socket,session,code};
};
const modules = {
  werewolf: `const m=await import('./apps/server/src/server.ts'); const app=m.createGameServer();`,
  avalon: `const m=await import('./avalon/apps/server/src/server.ts'); const app=m.createGameServer();`,
  skullking: `const m=await import('./skullking/apps/server/src/server.ts'); const app=m.createGameServer();`,
  spacecrew: `const app=await import('./spacecrew/server.mjs');`,
  rummikub: `const app=await import('./rummikub/apps/server/src/server.ts');`,
  deception: `const m=await import('./deception/apps/server/src/server.ts'); const instance=m.createApp(); const app={server:instance.http};`,
  secret_hitler: `const m=await import('./secret_hitler/apps/server/src/server.ts'); const app=m.createGameServer({dataDir:process.env.DATA_DIR});`,
};
const serverChildren = {};
const startServer = async (game, code) => {
    const child = spawn(process.execPath, ['--import','tsx','--input-type=module','-e', `${code} const server=app.server; if(!server.listening)server.listen(0,'127.0.0.1'); const ready=()=>console.log('SWITCH_READY:'+server.address().port); if(server.listening)ready();else server.once('listening',ready);`], { cwd: root, env: { ...process.env, PORT: '0', DATA_DIR: dataDir, RUN_STANDALONE_SERVER: 'false' }, stdio: ['ignore','pipe','pipe'] });
    children.push(child);
    serverChildren[game] = child;
    servers[game] = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error(`${game} startup timed out: ${output}`)), 15000);
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/SWITCH_READY:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('exit', code => { clearTimeout(timer); reject(Error(`${game} exited ${code}: ${output}`)); });
    });
};
try {
  for (const [game, code] of Object.entries(modules)) await startServer(game, code);
  const ranges = { werewolf:3, avalon:5, skullking:3, spacecrew:3, rummikub:3, deception:4, secret_hitler:5 };
  for (const source of Object.keys(games)) {
    const count = ranges[source];
    const originals = [];
    let roomCode;
    for (let i = 0; i < count; i++) {
      const socket = await connect(source);
      const [event, payload] = entry(source, `참가자${i+1}`, count, roomCode);
      const session = await call(socket, event, payload);
      roomCode = session.roomCode ?? session.code ?? session.roomId;
      originals.push({ socket, session, id: session.playerId ?? session.id });
    }
    const destination = source === 'avalon' || source === 'secret_hitler' ? 'werewolf' : source === 'deception' ? 'rummikub' : source === 'skullking' ? 'spacecrew' : 'skullking';
    await assert.rejects(call(originals[1].socket, 'GAME_SWITCH', { game: destination }), /방장/);
    await assert.rejects(call(originals[0].socket, 'GAME_SWITCH', { game: 'missing' }), /인원/);
    if (count > 4) await assert.rejects(call(originals[0].socket, 'GAME_SWITCH', { game: 'rummikub' }), /인원/);
    const roster = await call(originals[0].socket, 'GAME_SWITCH', { game: destination });
    assert.equal(roster.members.length, count);
    assert.deepEqual(roster.members.map(p => p.name).sort(), Array.from({length:count},(_,i)=>`참가자${i+1}`).sort());
    const reserved = [];
    const sessions = {};
    let targetCode;
    for (const member of [...roster.members].sort((a,b)=>Number(b.id===roster.hostId)-Number(a.id===roster.hostId))) {
      const socket = await connect(destination);
      const [event,payload] = entry(destination, member.name, count, targetCode);
      const session = await call(socket,event,payload);
      await call(socket,'GAME_SWITCH_RESERVE');
      sessions[member.id] = session;
      targetCode = session.roomCode ?? session.code ?? session.roomId;
      reserved.push(socket);
    }
    // A missing reservation must leave every source participant in place.
    await assert.rejects(call(originals[0].socket,'GAME_SWITCH',{ game:destination, code:targetCode, sessions:{} }), /참가자/);
    const arrivals = originals.map(({socket}) => new Promise(resolve => socket.once('GAME_SWITCHED',resolve)));
    await call(originals[0].socket,'GAME_SWITCH',{ game:destination, code:targetCode, sessions });
    const transfers = await Promise.all(arrivals);
    assert.equal(transfers.length,count);
    for(let i=0;i<count;i++) {
      assert.equal(transfers[i].game,destination);
      assert.deepEqual(transfers[i].session,sessions[originals[i].id]);
      assert.equal(transfers[i].name,`참가자${i+1}`);
    }
    for(const socket of reserved.reverse()) socket.disconnect();
    for(let i=0;i<count;i++) {
      const socket = await connect(destination);
      const transfer=transfers[i];
      const [event,payload] = entry(destination,transfer.name,count,targetCode);
      await call(socket,event,{...payload,...transfer.session});
      assert.equal((socket.view.players ?? socket.view.members).length,count);
      assert.equal(socket.view.hostId,sessions[roster.hostId].playerId ?? sessions[roster.hostId].id);
      socket.disconnect();
    }
    originals.forEach(({socket})=>socket.disconnect());
    console.log(`PASS ${source} → ${destination}: ${count} names, private sessions, host retained, resume, invalid requests`);
  }
  // A host with bots can move to every destination without sending bot sessions.
  const gameIds=Object.keys(games);
  for(const [index,source] of gameIds.entries()) {
    const {socket}=await createBotLobby(source);
    const destination=gameIds[(index+1)%gameIds.length];
    const roster=await call(socket,'GAME_SWITCH',{game:destination});
    assert.equal(roster.members.length,1);
    assert.equal(roster.members[0].name,'봇방 방장');
    const target=await connect(destination);
    const [event,payload]=entry(destination,roster.members[0].name,1);
    const session=await call(target,event,payload);
    await call(target,'GAME_SWITCH_RESERVE');
    const code=session.roomCode??session.code??session.roomId;
    const arrival=new Promise(resolve=>socket.once('GAME_SWITCHED',resolve));
    await call(socket,'GAME_SWITCH',{game:destination,code,sessions:{[roster.hostId]:session}});
    assert.deepEqual((await arrival).session,session);
    assert.equal((target.view.players??target.view.members).length,1);
    socket.disconnect();target.disconnect();
    console.log(`PASS ${source} → ${destination}: solo human leaves bot lobby; no bot session required`);
  }
  // Exercise every destination below its start minimum and with a full group.
  for (const game of Object.keys(games)) {
    for (const count of [1,ranges[game]]) {
    const reserved=[]; const saved=[];let code;
    for(let i=0;i<count;i++) {
      const socket=await connect(game);const [event,payload]=entry(game,`도착${i}`,count,code);
      const session=await call(socket,event,payload);await call(socket,'GAME_SWITCH_RESERVE');
      saved.push(session);reserved.push(socket);code=session.roomCode??session.code??session.roomId;
    }
    reserved.reverse().forEach(s=>s.disconnect());
    // Resume guests before the host to exercise out-of-order page loads.
    for(const i of [...Array.from({length:count-1},(_,i)=>i+1),0]) {
      const socket=await connect(game);
      const [event,payload]=entry(game,`도착${i}`,count,code);
      const resumeEvent=game==='deception'?'resume':game==='secret_hitler'?'RESUME':event;
      const resumePayload=game==='deception'||game==='secret_hitler'?saved[i]:{...payload,...saved[i]};
      await call(socket,resumeEvent,resumePayload);
      assert.equal((socket.view.players??socket.view.members).length,count);
      assert.equal(socket.view.hostId,saved[0].playerId??saved[0].id);
      socket.disconnect();
    }
    console.log(`PASS ${game}: ${count} destination reservations and native resume`);
    }
  }
  // Verify selected settings against actual destination state, not just payloads.
  for (const game of Object.keys(games)) {
    const count=game==='deception'?6:1;
    const setup=defaultSetup(game,count);
    if(game==='werewolf') {setup.maxPlayers=4;setup.selectedRoles=defaultWerewolfDeck(4);setup.selectedRoles[6]='witch';Object.assign(setup.values,{actionTimeLimitSeconds:8,dayTimeLimitSeconds:600});}
    if(game==='avalon') {setup.maxPlayers=7;Object.assign(setup.values,{assassin:false,morgana:true,mordred:true,oberon:true,assassinationAbilityRole:'oberon',revealVoteIdentities:false});}
    if(game==='skullking') {setup.maxPlayers=3;Object.assign(setup.values,{roundMode:'bedtime',kraken:true,pirateAbilities:true});}
    if(game==='spacecrew') {setup.maxPlayers=4;setup.values.missionId=17;}
    if(game==='rummikub') {setup.maxPlayers=4;Object.assign(setup.values,{initialMeldMin:45,turnSeconds:90,penaltyDraw:2,jokerPenalty:40,jokerReuse:'newMeld',allowTwoJokersInMeld:false});}
    if(game==='deception') Object.assign(setup.values,{cardsPerKind:5,events:true,crimeSeconds:40,discussionSeconds:60,presentationSeconds:45,accomplice:true,witness:true,forensicPlayer:'host'});
    if(game==='secret_hitler') {setup.maxPlayers=6;Object.assign(setup.values,{timerSeconds:60,language:'en'});}
    const group=[];const sessions={};let code;
    for(let i=0;i<count;i++) {
      const socket=await connect(game);const [event,payload]=entry(game,`설정${i}`,count,code,setup);
      const saved=await call(socket,event,payload);await call(socket,'GAME_SWITCH_RESERVE');
      sessions[i===0?'host':`guest${i}`]=saved;group.push(socket);code=saved.roomCode??saved.code??saved.roomId;
    }
    const configure=lobbySettings(game,setup,sessions);
    if(configure) await call(group[0],configure[0],configure[1]);
    const state=group[0].view;
    if(game==='werewolf') {assert.deepEqual(state.selectedRoles,setup.selectedRoles);assert.equal(state.settings.actionTimeLimitSeconds,8);assert.equal(state.settings.dayTimeLimitSeconds,600);assert.equal(state.maxPlayers,4);}
    if(game==='avalon') {assert.equal(state.maxPlayers,7);for(const [key,value] of Object.entries(setup.values)) assert.equal(state.options[key],value);assert.ok(state.activeRoles.includes('oberon'));assert.equal(state.activeRoles.includes('assassin'),false);}
    if(game==='skullking') {assert.equal(state.config.maxPlayers,3);assert.equal(state.config.roundMode,'bedtime');assert.equal(state.config.cards.kraken,true);assert.equal(state.config.cards.pirateAbilities,true);}
    if(game==='spacecrew') {assert.equal(state.maxPlayers,4);assert.equal(state.missionId,17);}
    if(game==='rummikub') for(const [key,value] of Object.entries(setup.values)) assert.equal(state.config[key],value);
    if(game==='deception') {const {forensicPlayer,...values}=setup.values;assert.deepEqual(state.settings,values);assert.equal(state.forensicChoice,sessions.host.playerId);}
    if(game==='secret_hitler') assert.deepEqual(state.settings,{maxPlayers:6,timerSeconds:60,language:'en'});
    group.forEach(socket=>socket.disconnect());
    console.log(`PASS ${game}: custom host settings applied to destination lobby`);
  }
  if (process.env.GAME_SWITCH_BROWSER === '1') {
    // Keep setup requests in the native suite from consuming the browser
    // suite's per-IP room-creation allowance. Production limits stay intact.
    const previous = serverChildren.secret_hitler;
    previous.kill('SIGTERM');
    await new Promise(resolve => previous.exitCode !== null || previous.signalCode !== null ? resolve() : previous.once('exit',resolve));
    await startServer('secret_hitler', modules.secret_hitler);
    const { browserCheck } = await import('./browser-check.mjs');
    await browserCheck({ servers, connect, call, createBotLobby });
  }
} finally {
  for(const socket of sockets) socket.disconnect();
  for(const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child=>new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve))));
  await rm(dataDir,{recursive:true,force:true});
}
