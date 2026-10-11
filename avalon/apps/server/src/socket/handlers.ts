import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { COUNT_TABLE, ROLE_DEFINITIONS, isAvatarId, type Ack, type AvalonOptions, type Player, type Room } from '@werewolf/shared';
import { assignRoles, clientState, doubleFail, questSize } from '../game/engine.js';
import { appendChat, clearChat, consumeRateLimit, deleteRoom, getChatHistory, getRoom, saveRoom, withRoomLock } from '../services/redis.js';
const code=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join(''); const token=()=>randomBytes(24).toString('base64url');
const channel=(id:string)=>`player:${id}`; const roomChannel=(id:string)=>`game:${id}`;
const BOT_TEAM_SELECTION_DELAY_MS=1_400;
const BOT_ASSASSINATION_AIM_DELAY_MS=1_500;
const BOT_ASSASSINATION_RESULT_DELAY_MS=1_000;
const pendingBotTeamSelections=new Set<string>();
const pendingBotAssassinations=new Set<string>();
const pendingAssassinations=new Map<string,string>();
// Team building is intentionally an in-progress, public scene.  Keep its latest
// ephemeral selection so a reconnecting player can immediately join the scene.
const pendingTeamSelections=new Map<string,{actorId:string;team:string[]}>();
const ack=<T>(socket:Socket,event:string,fn:(data:any)=>Promise<T>)=>socket.on(event,async(data:any,cb?:(x:Ack<T>)=>void)=>{try{cb?.({ok:true,data:await fn(data)});}catch(e){const error=e instanceof Error?e.message:'요청을 처리하지 못했습니다.';cb?.({ok:false,error});socket.emit('ERROR',{message:error});}});
const session=(s:Socket,c:string)=>{if(s.data.roomCode!==c||!s.data.playerId)throw Error('유효한 게임 세션이 아닙니다.');return s.data.playerId as string;};
export async function emitRoomState(io:Server,room:Room){
 for(const p of room.players)io.to(channel(p.id)).emit('ROOM_STATE',clientState(room,p.id));
 if(room.phase==='team_build'){
  const selection=pendingTeamSelections.get(room.roomCode);
  io.to(roomChannel(room.roomCode)).emit('TEAM_SELECTION',{roomCode:room.roomCode,actorId:selection?.actorId??room.players[room.leaderIndex]?.id,team:selection?.team??[]});
 }else pendingTeamSelections.delete(room.roomCode);
 if(room.phase==='assassination')io.to(roomChannel(room.roomCode)).emit('ASSASSIN_AIM',{roomCode:room.roomCode,actorId:room.players.find(p=>p.hasAssassinationAbility)?.id,targetId:pendingAssassinations.get(room.roomCode)??null,locked:pendingAssassinations.has(room.roomCode)});
}
function bind(s:Socket,r:Room,id:string){s.data.roomCode=r.roomCode;s.data.playerId=id;s.join(roomChannel(r.roomCode));s.join(channel(id));}
function resetRound(room:Room){room.proposedTeam=[];room.teamVotes={};room.questCards={};room.continueConfirmations={};room.voteResult=undefined;room.questResult=undefined;room.assassinTarget=undefined;}
function validateRoleOptions(maxPlayers:number,options:AvalonOptions){const special=['morgana','mordred','oberon'].filter(role=>options[role as keyof AvalonOptions]).length;const evilRoles=special+Number(options.assassin);if(evilRoles>COUNT_TABLE[maxPlayers]!.evil)throw Error('선택한 악 역할이 인원수보다 많습니다.');if(!options.assassin&&(!options.assassinationAbilityRole||!options[options.assassinationAbilityRole]))throw Error('암살자가 없으면 선택한 악의 세력 중 암살 능력 보유자를 지정해야 합니다.');if(options.assassin&&options.assassinationAbilityRole)throw Error('암살자를 포함한 게임에서는 암살 능력을 위임할 수 없습니다.');}
function saveRoundRecord(room:Room, update:Partial<Room['roundHistory'][number]>) { room.roundHistory??=[];const current=room.roundHistory.findIndex(item=>item.round===room.round); const approveCount=Object.values(room.teamVotes).filter(Boolean).length;const base={round:room.round,leaderId:room.players[room.leaderIndex]!.id,team:[...room.proposedTeam],votes:{...room.teamVotes},approveCount,rejectCount:Object.keys(room.teamVotes).length-approveCount}; if(current<0)room.roundHistory.push({...base,...update});else room.roundHistory[current]={...room.roundHistory[current]!,...base,...update}; }
function showVoteResult(room:Room){room.continueConfirmations={};room.phase='vote_result';}
function showQuestResult(room:Room){room.continueConfirmations={};room.phase='quest_result';}
function advanceVoteResult(room:Room){if(room.voteResult?.passed){room.phase='quest';room.questCards={};}else{room.rejectCount++;if(room.rejectCount>=5){room.phase='result';room.winner='evil';room.winReason='원정대가 5회 연속 부결되었습니다.';room.resultExpiresAt=Date.now()+30*60*1000;}else{room.leaderIndex=(room.leaderIndex+1)%room.players.length;room.phase='team_build';resetRound(room);}}}
function advanceQuestResult(room:Room){const good=room.results.filter(x=>x==='success').length,evil=room.results.filter(x=>x==='fail').length;if(evil>=3){room.phase='result';room.winner='evil';room.winReason='원정 3회가 실패했습니다.';room.resultExpiresAt=Date.now()+30*60*1000;}else if(good>=3){room.phase='assassination';}else{room.round++;room.rejectCount=0;room.leaderIndex=(room.leaderIndex+1)%room.players.length;room.phase='team_build';resetRound(room);}}
const isEvil=(player:Player)=>!!player.role&&ROLE_DEFINITIONS[player.role].team==='evil';
const evilTeammates=(room:Room,bot:Player)=>room.players.filter(player=>player.id!==bot.id&&isEvil(player)&&player.role!=='oberon');
/** What a good bot can infer from completed missions, rather than hidden roles. */
function suspicion(room:Room,bot:Player,player:Player){
  if(bot.role==='merlin'&&isEvil(player)&&player.role!=='mordred')return 100;
  let score=0;
  for(const record of room.roundHistory??[]){
    if(record.success===false&&record.team.includes(player.id))score+=2;
    if(record.success===true&&record.team.includes(player.id))score-=1;
  }
  return score;
}
function chooseBotTeam(room:Room,bot:Player){
  const size=questSize(room), teammates=evilTeammates(room,bot);
  const candidates=[...room.players].sort((left,right)=>{
    const leftScore=isEvil(bot)
      ?(teammates.some(player=>player.id===left.id)?20:0)+suspicion(room,bot,left)
      :suspicion(room,bot,left);
    const rightScore=isEvil(bot)
      ?(teammates.some(player=>player.id===right.id)?20:0)+suspicion(room,bot,right)
      :suspicion(room,bot,right);
    return leftScore-rightScore;
  });
  // An evil leader includes itself, then avoids stacking visible allies on the party.
  const chosen=isEvil(bot)?[bot]:[];
  for(const player of candidates)if(!chosen.some(member=>member.id===player.id)&&chosen.length<size)chosen.push(player);
  return chosen.slice(0,size).map(player=>player.id);
}
function botApproves(room:Room,bot:Player){
  const team=room.proposedTeam.map(id=>room.players.find(player=>player.id===id)!).filter(Boolean);
  if(isEvil(bot))return team.some(player=>player.id===bot.id||evilTeammates(room,bot).some(ally=>ally.id===player.id));
  const risk=team.reduce((sum,player)=>sum+suspicion(room,bot,player),0);
  // Known evil is always rejected; otherwise allow ordinary teams until evidence accumulates.
  return !team.some(player=>suspicion(room,bot,player)>=100)&&risk<Math.max(2,team.length);
}
function botQuestCard(room:Room,bot:Player){
  if(!isEvil(bot))return 'success' as const;
  const failures=Object.values(room.questCards).filter(card=>card==='fail').length;
  const needed=doubleFail(room)?2:1;
  // Coordinate with allies: submit only the minimum failures needed to lose the quest.
  return failures<needed?'fail' as const:'success' as const;
}
function botAssassinationTarget(room:Room,bot:Player){
  const allies=new Set(evilTeammates(room,bot).map(player=>player.id));
  const candidates=room.players.filter(player=>player.id!==bot.id&&!allies.has(player.id));
  // Merlin tends to keep known evil players off missions; use that public pattern as evidence.
  return [...candidates].sort((left,right)=>{
    const merlinSignal=(player:Player)=>(room.roundHistory??[]).reduce((score,record)=>score+(record.leaderId===player.id?record.team.filter(id=>allies.has(id)).length:-0),0);
    return merlinSignal(left)-merlinSignal(right);
  })[0];
}
/** Fills only the mechanical actions of local test bots. Human choices remain server-authoritative. */
function settleBots(room: Room) {
  let changed=true;
  while(changed){changed=false;
    if(room.phase==='team_vote'){
      for(const bot of room.players.filter(p=>p.isBot&&! (p.id in room.teamVotes))) room.teamVotes[bot.id]=botApproves(room,bot);
      if(Object.keys(room.teamVotes).length===room.players.length){const approve=Object.values(room.teamVotes).filter(Boolean).length;room.voteResult={approve,reject:room.players.length-approve,passed:approve>room.players.length-approve};saveRoundRecord(room,{});showVoteResult(room);}
      continue;
    }
    if(room.phase==='vote_result'){
      for(const bot of room.players.filter(p=>p.isBot&&!(p.id in (room.continueConfirmations??{})))) (room.continueConfirmations??={})[bot.id]=true;
      if(Object.keys(room.continueConfirmations??{}).length===room.players.length){advanceVoteResult(room);changed=true;}
      continue;
    }
    if(room.phase==='quest'){
      for(const bot of room.players.filter(p=>p.isBot&&room.proposedTeam.includes(p.id)&&!(p.id in room.questCards)))room.questCards[bot.id]=botQuestCard(room,bot);
      if(Object.keys(room.questCards).length===room.proposedTeam.length){const fails=Object.values(room.questCards).filter(card=>card==='fail').length;const success=fails<(doubleFail(room)?2:1);room.questResult={fails,success};room.results.push(success?'success':'fail');saveRoundRecord(room,{fails,success});showQuestResult(room);}
      continue;
    }
    if(room.phase==='quest_result'){
      for(const bot of room.players.filter(p=>p.isBot&&!(p.id in (room.continueConfirmations??{})))) (room.continueConfirmations??={})[bot.id]=true;
      if(Object.keys(room.continueConfirmations??{}).length===room.players.length){advanceQuestResult(room);changed=true;}
      continue;
    }
    if(room.phase==='assassination')break;
  }
}
/**
 * Give clients a short, observable team-building state before a test bot acts.
 * Previously settleBots advanced this state synchronously, so the UI never had a
 * chance to render the existing "leader is selecting" progress message.
 */
function scheduleBotTeamSelection(io:Server, room:Room) {
  const leader=room.players[room.leaderIndex];
  if(room.phase!=='team_build'||!leader?.isBot||pendingBotTeamSelections.has(room.roomCode))return;
  pendingBotTeamSelections.add(room.roomCode);
  const timer=setTimeout(()=>void withRoomLock(room.roomCode,async current=>{
    if(current.phase!=='team_build'||!current.players[current.leaderIndex]?.isBot)return null;
    current.proposedTeam=chooseBotTeam(current,current.players[current.leaderIndex]!);
    current.teamVotes={};
    saveRoundRecord(current,{fails:undefined,success:undefined});
    current.phase='team_vote';
    settleBots(current);
    current.updatedAt=Date.now();
    await saveRoom(current);
    return current;
  }).then(next=>next&&emitRoomState(io,next)).catch(()=>{}).finally(()=>pendingBotTeamSelections.delete(room.roomCode)),BOT_TEAM_SELECTION_DELAY_MS);
  timer.unref();
}
/** Lets everyone see the assassination scene and the bot's target before revealing the result. */
function scheduleBotAssassination(io:Server, room:Room) {
  const assassin=room.players.find(player=>player.hasAssassinationAbility);
  if(room.phase!=='assassination'||!assassin?.isBot||pendingBotAssassinations.has(room.roomCode))return;
  pendingBotAssassinations.add(room.roomCode);
  const aimTimer=setTimeout(()=>void withRoomLock(room.roomCode,async current=>{
    const actor=current.players.find(player=>player.hasAssassinationAbility);
    if(current.phase!=='assassination'||!actor?.isBot)return null;
    const target=botAssassinationTarget(current,actor);
    return target?{actorId:actor.id,targetId:target.id}:null;
  }).then(aim=>{
    if(!aim){pendingBotAssassinations.delete(room.roomCode);return;}
    io.to(roomChannel(room.roomCode)).emit('ASSASSIN_AIM',{roomCode:room.roomCode,...aim,locked:true});
    const resultTimer=setTimeout(()=>void withRoomLock(room.roomCode,async current=>{
      if(current.phase!=='assassination')return null;
      const actor=current.players.find(player=>player.id===aim.actorId);
      const target=current.players.find(player=>player.id===aim.targetId);
      if(!actor?.isBot||!target)return null;
      current.assassinTarget=target.id;current.phase='result';current.winner=target.role==='merlin'?'evil':'good';
      current.winReason=target.role==='merlin'?`테스트 봇 암살 능력 보유자가 멀린 ${target.nickname}님을 찾아냈습니다.`:'테스트 봇 암살 능력 보유자가 멀린을 찾지 못했습니다.';
      current.resultExpiresAt=Date.now()+30*60*1000;current.updatedAt=Date.now();await saveRoom(current);return current;
    }).then(current=>current&&emitRoomState(io,current)).catch(()=>{}).finally(()=>pendingBotAssassinations.delete(room.roomCode)),BOT_ASSASSINATION_RESULT_DELAY_MS);
    resultTimer.unref();
  }).catch(()=>pendingBotAssassinations.delete(room.roomCode)),BOT_ASSASSINATION_AIM_DELAY_MS);
  aimTimer.unref();
}
export function registerHandlers(io:Server,socket:Socket){
 // Like an assassin's aim, team selection is an ephemeral visual event.  The
 // proposed team itself remains authoritative only once TEAM_PROPOSE succeeds.
 socket.on('TEAM_SELECTION',async(d:{roomCode?:string;team?:unknown})=>{
  try{
   if(!d||typeof d.roomCode!=='string')return;
   const roomCode=d.roomCode.toUpperCase(),id=session(socket,roomCode);
   const room=await getRoom(roomCode),leader=room?.players[room.leaderIndex];
   if(!room||room.phase!=='team_build'||leader?.id!==id||leader.socketId!==socket.id||!leader.connected)return;
   const team=Array.isArray(d.team)?d.team.filter((member:unknown):member is string=>typeof member==='string'):[];
   if(team.length>questSize(room)||new Set(team).size!==team.length||team.some(member=>!room.players.some(player=>player.id===member)))return;
   pendingTeamSelections.set(roomCode,{actorId:id,team});
   io.to(roomChannel(roomCode)).emit('TEAM_SELECTION',{roomCode,actorId:id,team});
  }catch{/* Selection updates must not produce error toasts. */}
 });
 // Aim is an ephemeral room-scoped visual event, never a committed game action.
 socket.on('ASSASSIN_AIM',async(d:{roomCode?:string;targetId?:string|null})=>{
  try{
   if(!d||typeof d.roomCode!=='string')return;
   const roomCode=d.roomCode.toUpperCase(),id=session(socket,roomCode);
   if(pendingAssassinations.has(roomCode))return;
   const now=Date.now();if(now-(socket.data.lastAssassinAimAt??0)<70)return;socket.data.lastAssassinAimAt=now;
   const room=await getRoom(roomCode),player=room?.players.find(p=>p.id===id);
   if(!room||room.phase!=='assassination'||!player?.hasAssassinationAbility||player.socketId!==socket.id||!player.connected)return;
   const targetId=d.targetId??null;
   if(targetId!==null&&(typeof targetId!=='string'||targetId===id||!room.players.some(p=>p.id===targetId)))return;
   if(pendingAssassinations.has(roomCode))return;
   io.to(roomChannel(roomCode)).emit('ASSASSIN_AIM',{roomCode,targetId,actorId:id,locked:false});
  }catch{/* Pointer movement must not produce error toasts. */}
 });
 ack(socket,'ASSASSIN_COMMIT',async d=>{
  const roomCode=String(d.roomCode).toUpperCase();
  const targetId=String(d.targetId);
  await withRoomLock(roomCode,async room=>{
   const id=session(socket,roomCode),player=room.players.find(p=>p.id===id);
   if(room.phase!=='assassination'||!player?.hasAssassinationAbility||player.socketId!==socket.id)throw Error('암살 능력 보유자만 대상을 확정할 수 있습니다.');
   if(targetId===id||!room.players.some(p=>p.id===targetId))throw Error('암살 대상을 선택하세요.');
   if(pendingAssassinations.has(roomCode))throw Error('이미 암살 대상을 확정했습니다.');
   pendingAssassinations.set(roomCode,targetId);
  });
  io.to(roomChannel(roomCode)).emit('ASSASSIN_AIM',{roomCode,targetId,actorId:socket.data.playerId,locked:true});
  // One authoritative second of stillness for every connected client.
  const timer=setTimeout(()=>void withRoomLock(roomCode,async room=>{
   if(room.phase!=='assassination'||pendingAssassinations.get(roomCode)!==targetId)return null;
   const target=room.players.find(p=>p.id===targetId);if(!target)return null;
   room.assassinTarget=targetId;room.phase='result';room.winner=target.role==='merlin'?'evil':'good';
   room.winReason=target.role==='merlin'?`암살 능력 보유자가 멀린 ${target.nickname}님을 찾아냈습니다.`:`암살 능력 보유자가 멀린을 찾지 못했습니다. (${target.nickname}님 지목)`;
   room.resultExpiresAt=Date.now()+30*60*1000;room.updatedAt=Date.now();await saveRoom(room);return room;
  }).then(room=>room&&emitRoomState(io,room)).catch(()=>{io.to(roomChannel(roomCode)).emit('ASSASSIN_AIM',{roomCode,targetId,locked:false});io.to(roomChannel(roomCode)).emit('ERROR',{message:'암살 결과를 처리하지 못했습니다. 다시 확정해주세요.'});}).finally(()=>pendingAssassinations.delete(roomCode)),1000);
  timer.unref();return {};
 });
 ack(socket,'ROOM_CREATE',async d=>{const maxPlayers=Number(d.maxPlayers);if(!COUNT_TABLE[maxPlayers])throw Error('인원은 5~10명이어야 합니다.');const nickname=String(d.nickname??'').trim().slice(0,16);if(!nickname)throw Error('닉네임을 입력해주세요.');const delegated=['morgana','mordred','oberon'].includes(d.options?.assassinationAbilityRole)?d.options.assassinationAbilityRole:null;const options:AvalonOptions={assassin:!!d.options?.assassin,assassinationAbilityRole:delegated,percival:!!d.options?.percival,morgana:!!d.options?.morgana,mordred:!!d.options?.mordred,oberon:!!d.options?.oberon,revealVoteIdentities:d.options?.revealVoteIdentities!==false};validateRoleOptions(maxPlayers,options);let roomCode=code();while(await getRoom(roomCode))roomCode=code();const id=randomUUID(), now=Date.now();const room:Room={roomCode,hostId:id,maxPlayers,players:[{id,nickname,sessionToken:token(),socketId:socket.id,role:null,ready:false,connected:true}],phase:'lobby',options,round:0,leaderIndex:0,rejectCount:0,results:[],roundHistory:[],proposedTeam:[],teamVotes:{},questCards:{},createdAt:now,updatedAt:now,lobbyExpiresAt:now+3600000};await saveRoom(room);bind(socket,room,id);await emitRoomState(io,room);return {roomCode,playerId:id,sessionToken:room.players[0]!.sessionToken};});
 ack(socket,'ROOM_JOIN',async d=>{const room=await withRoomLock(String(d.roomCode).toUpperCase(),async room=>{const existing=d.playerId&&room.players.find(p=>p.id===d.playerId&&p.sessionToken===d.sessionToken);if(existing){existing.socketId=socket.id;existing.connected=true;existing.disconnectedAt=null;room.allOfflineExpiresAt=null;return room;}if(room.phase!=='lobby'||room.players.length>=room.maxPlayers)throw Error('참가할 수 없는 방입니다.');const nickname=String(d.nickname??'').trim().slice(0,16);if(!nickname||room.players.some(p=>p.nickname===nickname))throw Error('사용할 수 없는 닉네임입니다.');room.players.push({id:randomUUID(),nickname,sessionToken:token(),socketId:socket.id,role:null,ready:false,connected:true});room.allOfflineExpiresAt=null;room.updatedAt=Date.now();await saveRoom(room);return room;});const p=room.players.find(p=>p.socketId===socket.id)!;bind(socket,room,p.id);await emitRoomState(io,room);socket.emit('CHAT_HISTORY',await getChatHistory(room.roomCode));return {roomCode:room.roomCode,playerId:p.id,sessionToken:p.sessionToken};});
 ack(socket,'ROOM_LEAVE',async d=>{const code=String(d.roomCode).toUpperCase();const room=await withRoomLock(code,async r=>{const id=session(socket,r.roomCode);if(!['lobby','result'].includes(r.phase)){const player=r.players.find(p=>p.id===id)!;player.connected=false;player.socketId=null;player.disconnectedAt=Date.now();if(r.players.filter(p=>!p.isBot).every(p=>!p.connected))r.allOfflineExpiresAt=Date.now()+10*60*1000;r.updatedAt=Date.now();await saveRoom(r);return r;}r.players=r.players.filter(p=>p.id!==id);if(!r.players.length||r.players.every(p=>p.isBot)){await deleteRoom(r.roomCode);return r;}if(r.hostId===id)r.hostId=r.players.find(p=>!p.isBot)?.id??r.players[0]!.id;r.updatedAt=Date.now();await saveRoom(r);return r;});socket.leave(roomChannel(code));socket.leave(channel(socket.data.playerId));socket.data.roomCode=undefined;socket.data.playerId=undefined;if(room.players.length)await emitRoomState(io,room);return {};});
 const mutate=(event:string,fn:(r:Room,id:string,d:any)=>void|Promise<void>)=>ack(socket,event,async d=>{const room=await withRoomLock(String(d.roomCode).toUpperCase(),async r=>{const id=session(socket,r.roomCode);await fn(r,id,d);settleBots(r);r.updatedAt=Date.now();await saveRoom(r);return r;});await emitRoomState(io,room);scheduleBotTeamSelection(io,room);scheduleBotAssassination(io,room);return {};});
 mutate('PROFILE_UPDATE',(r,id,d)=>{if(!isAvatarId(d.avatar))throw Error('유효하지 않은 캐릭터입니다.');if(r.players.some(player=>player.id!==id&&player.avatar===d.avatar))throw Error('이미 사용 중인 캐릭터입니다.');r.players.find(player=>player.id===id)!.avatar=d.avatar;});
 ack(socket,'CHAT_SEND',async d=>{const roomCode=String(d.roomCode).toUpperCase();const playerId=session(socket,roomCode);const text=String(d.text??'').trim();if(!text||text.length>300)throw Error('메시지는 1~300자로 입력해주세요.');const room=await getRoom(roomCode);const player=room?.players.find(p=>p.id===playerId);if(!room||!player||!player.connected||player.socketId!==socket.id)throw Error('채팅 세션이 유효하지 않습니다.');if(!['lobby','team_build','team_vote','vote_result','quest_result'].includes(room.phase))throw Error('지금은 채팅할 수 없는 단계입니다.');if(!await consumeRateLimit(roomCode,`chat:${playerId}`,6,5))throw Error('메시지를 너무 빠르게 보내고 있습니다.');const message={id:randomUUID(),playerId,nickname:player.nickname,text,at:Date.now()};await appendChat(roomCode,message);io.to(roomChannel(roomCode)).emit('CHAT_MESSAGE',message);return {};});
 mutate('PLAYER_READY',(r,id)=>{if(r.phase!=='lobby')throw Error('대기실에서만 준비할 수 있습니다.');const p=r.players.find(p=>p.id===id)!;p.ready=!p.ready;});
 mutate('GAME_START',(r,id)=>{if(id!==r.hostId)throw Error('방장만 시작할 수 있습니다.');while(r.players.length<r.maxPlayers){const number=r.players.filter(player=>player.isBot).length+1;r.players.push({id:randomUUID(),nickname:`테스트 봇 ${number}`,sessionToken:'',socketId:null,role:null,ready:true,connected:false,isBot:true});}if(!r.players.filter(p=>!p.isBot).every(p=>p.ready))throw Error('모두 준비해야 합니다.');validateRoleOptions(r.maxPlayers,r.options);assignRoles(r);r.leaderIndex=Math.floor(Math.random()*r.players.length);r.roundHistory=[];r.players.forEach(p=>p.confirmed=!!p.isBot);r.phase='role_reveal';});
 mutate('ROLE_CONFIRM',(r,id)=>{if(r.phase!=='role_reveal')throw Error('역할 공개 단계가 아닙니다.');const p=r.players.find(p=>p.id===id)!;p.confirmed=true;if(r.players.every(x=>x.confirmed)){r.phase='team_build';}});
 mutate('TEAM_PROPOSE',(r,id,d)=>{if(r.phase!=='team_build'||r.players[r.leaderIndex]?.id!==id)throw Error('현재 리더만 원정대를 제안할 수 있습니다.');const team: string[]=Array.isArray(d.team)?d.team.filter((x:unknown):x is string=>typeof x==='string'):[];if(team.length!==questSize(r)||new Set(team).size!==team.length||team.some(x=>!r.players.some(p=>p.id===x)))throw Error(`원정대는 ${questSize(r)}명이어야 합니다.`);r.proposedTeam=team;r.teamVotes={};saveRoundRecord(r,{fails:undefined,success:undefined});r.phase='team_vote';});
 mutate('TEAM_VOTE',(r,id,d)=>{if(r.phase!=='team_vote'||id in r.teamVotes)throw Error('이미 투표했거나 투표 단계가 아닙니다.');r.teamVotes[id]=!!d.approve;if(Object.keys(r.teamVotes).length===r.players.length){const approve=Object.values(r.teamVotes).filter(Boolean).length;r.voteResult={approve,reject:r.players.length-approve,passed:approve>r.players.length-approve};saveRoundRecord(r,{});showVoteResult(r);}});
 mutate('VOTE_RESULT_CONTINUE',(r,id)=>{if(r.phase!=='vote_result'||id in (r.continueConfirmations??{}))throw Error('이미 계속을 확인했거나 결과 화면이 아닙니다.');(r.continueConfirmations??={})[id]=true;if(Object.keys(r.continueConfirmations).length===r.players.length)advanceVoteResult(r);});
 mutate('QUEST_CARD',(r,id,d)=>{if(r.phase!=='quest'||!r.proposedTeam.includes(id)||id in r.questCards)throw Error('원정대원만 한 번 제출할 수 있습니다.');const p=r.players.find(p=>p.id===id)!;const card=d.card==='fail'?'fail':'success';if(ROLE_DEFINITIONS[p.role!].team==='good'&&card==='fail')throw Error('선의 세력은 성공 카드만 낼 수 있습니다.');r.questCards[id]=card;if(Object.keys(r.questCards).length===r.proposedTeam.length){const fails=Object.values(r.questCards).filter(x=>x==='fail').length;const success=fails<(doubleFail(r)?2:1);r.questResult={fails,success};r.results.push(success?'success':'fail');saveRoundRecord(r,{fails,success});showQuestResult(r);}});
 mutate('QUEST_RESULT_CONTINUE',(r,id)=>{if(r.phase!=='quest_result'||id in (r.continueConfirmations??{}))throw Error('이미 계속을 확인했거나 결과 화면이 아닙니다.');(r.continueConfirmations??={})[id]=true;if(Object.keys(r.continueConfirmations).length===r.players.length)advanceQuestResult(r);});
 mutate('ASSASSIN_TARGET',(r,id,d)=>{if(pendingAssassinations.has(r.roomCode))throw Error('이미 암살 대상을 확정했습니다.');if(r.phase!=='assassination'||!r.players.find(p=>p.id===id)?.hasAssassinationAbility)throw Error('암살 능력 보유자만 대상을 선택할 수 있습니다.');const target=r.players.find(p=>p.id===d.targetId);if(!target)throw Error('대상을 선택하세요.');r.assassinTarget=target.id;r.phase='result';r.winner=target.role==='merlin'?'evil':'good';r.winReason=target.role==='merlin'?`암살 능력 보유자가 멀린 ${target.nickname}님을 찾아냈습니다.`:`암살 능력 보유자가 멀린을 찾지 못했습니다. (${target.nickname}님 지목)`;r.resultExpiresAt=Date.now()+30*60*1000;});
 mutate('GAME_RESTART',async(r,id)=>{if(id!==r.hostId||r.phase!=='result')throw Error('방장만 새 게임을 시작할 수 있습니다.');r.players=r.players.map(p=>({...p,role:null,hasAssassinationAbility:false,ready:false,confirmed:false}));r.phase='lobby';r.round=0;r.leaderIndex=0;r.rejectCount=0;r.results=[];r.roundHistory=[];r.winner=undefined;r.winReason=undefined;r.resultExpiresAt=null;r.lobbyExpiresAt=Date.now()+60*60*1000;resetRound(r);await clearChat(r.roomCode);});
 socket.on('disconnect',async()=>{const c=socket.data.roomCode,id=socket.data.playerId;if(!c||!id)return;try{const r=await withRoomLock(c,async r=>{const p=r.players.find(p=>p.id===id);if(p&&p.socketId===socket.id){p.connected=false;p.socketId=null;p.disconnectedAt=Date.now();if(r.players.every(player=>!player.connected))r.allOfflineExpiresAt=Date.now()+10*60*1000;r.updatedAt=Date.now();await saveRoom(r);}return r;});await emitRoomState(io,r);}catch{}});
}
