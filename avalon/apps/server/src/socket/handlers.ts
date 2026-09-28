import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { COUNT_TABLE, ROLE_DEFINITIONS, type Ack, type AvalonOptions, type Room } from '@werewolf/shared';
import { assignRoles, clientState, doubleFail, questSize, shuffle } from '../game/engine.js';
import { appendChat, clearChat, consumeRateLimit, deleteRoom, getChatHistory, getRoom, saveRoom, withRoomLock } from '../services/redis.js';
const code=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join(''); const token=()=>randomBytes(24).toString('base64url');
const channel=(id:string)=>`player:${id}`; const roomChannel=(id:string)=>`game:${id}`;
const BOT_TEAM_SELECTION_DELAY_MS=1_400;
const pendingBotTeamSelections=new Set<string>();
const ack=<T>(socket:Socket,event:string,fn:(data:any)=>Promise<T>)=>socket.on(event,async(data:any,cb?:(x:Ack<T>)=>void)=>{try{cb?.({ok:true,data:await fn(data)});}catch(e){const error=e instanceof Error?e.message:'요청을 처리하지 못했습니다.';cb?.({ok:false,error});socket.emit('ERROR',{message:error});}});
const session=(s:Socket,c:string)=>{if(s.data.roomCode!==c||!s.data.playerId)throw Error('유효한 게임 세션이 아닙니다.');return s.data.playerId as string;};
export async function emitRoomState(io:Server,room:Room){for(const p of room.players)io.to(channel(p.id)).emit('ROOM_STATE',clientState(room,p.id));}
function bind(s:Socket,r:Room,id:string){s.data.roomCode=r.roomCode;s.data.playerId=id;s.join(roomChannel(r.roomCode));s.join(channel(id));}
function resetRound(room:Room){room.proposedTeam=[];room.teamVotes={};room.questCards={};room.voteResult=undefined;room.questResult=undefined;}
function saveRoundRecord(room:Room, update:Partial<Room['roundHistory'][number]>) { room.roundHistory??=[];const current=room.roundHistory.findIndex(item=>item.round===room.round); const base={round:room.round,leaderId:room.players[room.leaderIndex]!.id,team:[...room.proposedTeam],votes:{...room.teamVotes}}; if(current<0)room.roundHistory.push({...base,...update});else room.roundHistory[current]={...room.roundHistory[current]!,...base,...update}; }
/** Fills only the mechanical actions of local test bots. Human choices remain server-authoritative. */
function settleBots(room: Room) {
  let changed=true;
  while(changed){changed=false;
    if(room.phase==='team_vote'){
      for(const bot of room.players.filter(p=>p.isBot&&! (p.id in room.teamVotes))) room.teamVotes[bot.id]=Math.random()<.7;
      if(Object.keys(room.teamVotes).length===room.players.length){const approve=Object.values(room.teamVotes).filter(Boolean).length;room.voteResult={approve,reject:room.players.length-approve,passed:approve>room.players.length-approve};saveRoundRecord(room,{});room.phase='vote_result';}
      continue;
    }
    if(room.phase==='quest'){
      for(const bot of room.players.filter(p=>p.isBot&&room.proposedTeam.includes(p.id)&&!(p.id in room.questCards))){const evil=ROLE_DEFINITIONS[bot.role!].team==='evil';room.questCards[bot.id]=evil&&Math.random()<.55?'fail':'success';}
      if(Object.keys(room.questCards).length===room.proposedTeam.length){const fails=Object.values(room.questCards).filter(card=>card==='fail').length;const success=fails<(doubleFail(room)?2:1);room.questResult={fails,success};room.results.push(success?'success':'fail');saveRoundRecord(room,{fails,success});room.phase='quest_result';}
      continue;
    }
    if(room.phase==='assassination'){const assassin=room.players.find(p=>p.role==='assassin');if(assassin?.isBot){const target=shuffle(room.players.filter(p=>p.id!==assassin.id))[0]!;room.assassinTarget=target.id;room.phase='result';room.winner=target.role==='merlin'?'evil':'good';room.winReason=target.role==='merlin'?`테스트 봇 암살자가 멀린 ${target.nickname}님을 찾아냈습니다.`:'테스트 봇 암살자가 멀린을 찾지 못했습니다.';room.resultExpiresAt=Date.now()+30*60*1000;}}
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
    current.proposedTeam=shuffle(current.players.map(player=>player.id)).slice(0,questSize(current));
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
export function registerHandlers(io:Server,socket:Socket){
 ack(socket,'ROOM_CREATE',async d=>{const maxPlayers=Number(d.maxPlayers);if(!COUNT_TABLE[maxPlayers])throw Error('인원은 5~10명이어야 합니다.');const nickname=String(d.nickname??'').trim().slice(0,16);if(!nickname)throw Error('닉네임을 입력해주세요.');let roomCode=code();while(await getRoom(roomCode))roomCode=code();const id=randomUUID(), now=Date.now();const options:AvalonOptions={percival:!!d.options?.percival,morgana:!!d.options?.morgana,mordred:!!d.options?.mordred,oberon:!!d.options?.oberon};const room:Room={roomCode,hostId:id,maxPlayers,players:[{id,nickname,sessionToken:token(),socketId:socket.id,role:null,ready:false,connected:true}],phase:'lobby',options,round:0,leaderIndex:0,rejectCount:0,results:[],roundHistory:[],proposedTeam:[],teamVotes:{},questCards:{},createdAt:now,updatedAt:now,lobbyExpiresAt:now+3600000};await saveRoom(room);bind(socket,room,id);await emitRoomState(io,room);return {roomCode,playerId:id,sessionToken:room.players[0]!.sessionToken};});
 ack(socket,'ROOM_JOIN',async d=>{const room=await withRoomLock(String(d.roomCode).toUpperCase(),async room=>{const existing=d.playerId&&room.players.find(p=>p.id===d.playerId&&p.sessionToken===d.sessionToken);if(existing){existing.socketId=socket.id;existing.connected=true;existing.disconnectedAt=null;room.allOfflineExpiresAt=null;return room;}if(room.phase!=='lobby'||room.players.length>=room.maxPlayers)throw Error('참가할 수 없는 방입니다.');const nickname=String(d.nickname??'').trim().slice(0,16);if(!nickname||room.players.some(p=>p.nickname===nickname))throw Error('사용할 수 없는 닉네임입니다.');room.players.push({id:randomUUID(),nickname,sessionToken:token(),socketId:socket.id,role:null,ready:false,connected:true});room.allOfflineExpiresAt=null;room.updatedAt=Date.now();await saveRoom(room);return room;});const p=room.players.find(p=>p.socketId===socket.id)!;bind(socket,room,p.id);await emitRoomState(io,room);socket.emit('CHAT_HISTORY',await getChatHistory(room.roomCode));return {roomCode:room.roomCode,playerId:p.id,sessionToken:p.sessionToken};});
 ack(socket,'ROOM_LEAVE',async d=>{const code=String(d.roomCode).toUpperCase();const room=await withRoomLock(code,async r=>{const id=session(socket,r.roomCode);if(!['lobby','result'].includes(r.phase)){const player=r.players.find(p=>p.id===id)!;player.connected=false;player.socketId=null;player.disconnectedAt=Date.now();if(r.players.filter(p=>!p.isBot).every(p=>!p.connected))r.allOfflineExpiresAt=Date.now()+10*60*1000;r.updatedAt=Date.now();await saveRoom(r);return r;}r.players=r.players.filter(p=>p.id!==id);if(!r.players.length||r.players.every(p=>p.isBot)){await deleteRoom(r.roomCode);return r;}if(r.hostId===id)r.hostId=r.players.find(p=>!p.isBot)?.id??r.players[0]!.id;r.updatedAt=Date.now();await saveRoom(r);return r;});socket.leave(roomChannel(code));socket.leave(channel(socket.data.playerId));socket.data.roomCode=undefined;socket.data.playerId=undefined;if(room.players.length)await emitRoomState(io,room);return {};});
 const mutate=(event:string,fn:(r:Room,id:string,d:any)=>void|Promise<void>)=>ack(socket,event,async d=>{const room=await withRoomLock(String(d.roomCode).toUpperCase(),async r=>{const id=session(socket,r.roomCode);await fn(r,id,d);settleBots(r);r.updatedAt=Date.now();await saveRoom(r);return r;});await emitRoomState(io,room);scheduleBotTeamSelection(io,room);return {};});
 ack(socket,'CHAT_SEND',async d=>{const roomCode=String(d.roomCode).toUpperCase();const playerId=session(socket,roomCode);const text=String(d.text??'').trim();if(!text||text.length>300)throw Error('메시지는 1~300자로 입력해주세요.');const room=await getRoom(roomCode);const player=room?.players.find(p=>p.id===playerId);if(!room||!player||!player.connected||player.socketId!==socket.id)throw Error('채팅 세션이 유효하지 않습니다.');if(!['lobby','team_build','team_vote','vote_result','quest_result'].includes(room.phase))throw Error('지금은 채팅할 수 없는 단계입니다.');if(!await consumeRateLimit(roomCode,`chat:${playerId}`,6,5))throw Error('메시지를 너무 빠르게 보내고 있습니다.');const message={id:randomUUID(),playerId,nickname:player.nickname,text,at:Date.now()};await appendChat(roomCode,message);io.to(roomChannel(roomCode)).emit('CHAT_MESSAGE',message);return {};});
 mutate('PLAYER_READY',(r,id)=>{if(r.phase!=='lobby')throw Error('대기실에서만 준비할 수 있습니다.');const p=r.players.find(p=>p.id===id)!;p.ready=!p.ready;});
 mutate('GAME_START',(r,id)=>{if(id!==r.hostId)throw Error('방장만 시작할 수 있습니다.');if(r.players.length===1){while(r.players.length<r.maxPlayers){const number=r.players.length;r.players.push({id:randomUUID(),nickname:`테스트 봇 ${number}`,sessionToken:'',socketId:null,role:null,ready:true,connected:false,isBot:true});}}else if(r.players.length!==r.maxPlayers)throw Error('혼자 테스트하거나 모든 자리가 채워져야 합니다.');if(!r.players.filter(p=>!p.isBot).every(p=>p.ready))throw Error('모두 준비해야 합니다.');const evil=1+Number(r.options.morgana)+Number(r.options.mordred)+Number(r.options.oberon);if(evil>COUNT_TABLE[r.maxPlayers]!.evil)throw Error('선택한 악 역할이 인원수보다 많습니다.');assignRoles(r);r.leaderIndex=Math.floor(Math.random()*r.players.length);r.roundHistory=[];r.players.forEach(p=>p.confirmed=!!p.isBot);r.phase='role_reveal';});
 mutate('ROLE_CONFIRM',(r,id)=>{if(r.phase!=='role_reveal')throw Error('역할 공개 단계가 아닙니다.');const p=r.players.find(p=>p.id===id)!;p.confirmed=true;if(r.players.every(x=>x.confirmed)){r.phase='team_build';}});
 mutate('TEAM_PROPOSE',(r,id,d)=>{if(r.phase!=='team_build'||r.players[r.leaderIndex]?.id!==id)throw Error('현재 리더만 원정대를 제안할 수 있습니다.');const team: string[]=Array.isArray(d.team)?d.team.filter((x:unknown):x is string=>typeof x==='string'):[];if(team.length!==questSize(r)||new Set(team).size!==team.length||team.some(x=>!r.players.some(p=>p.id===x)))throw Error(`원정대는 ${questSize(r)}명이어야 합니다.`);r.proposedTeam=team;r.teamVotes={};saveRoundRecord(r,{fails:undefined,success:undefined});r.phase='team_vote';});
 mutate('TEAM_VOTE',(r,id,d)=>{if(r.phase!=='team_vote'||id in r.teamVotes)throw Error('이미 투표했거나 투표 단계가 아닙니다.');r.teamVotes[id]=!!d.approve;if(Object.keys(r.teamVotes).length===r.players.length){const approve=Object.values(r.teamVotes).filter(Boolean).length;r.voteResult={approve,reject:r.players.length-approve,passed:approve>r.players.length-approve};saveRoundRecord(r,{});r.phase='vote_result';}});
 mutate('VOTE_RESULT_CONTINUE',(r,id)=>{if(r.phase!=='vote_result'||id!==r.hostId)throw Error('방장만 진행할 수 있습니다.');if(r.voteResult?.passed){r.phase='quest';r.questCards={};}else{r.rejectCount++;if(r.rejectCount>=5){r.phase='result';r.winner='evil';r.winReason='원정대가 5회 연속 부결되었습니다.';r.resultExpiresAt=Date.now()+30*60*1000;}else{r.leaderIndex=(r.leaderIndex+1)%r.players.length;r.phase='team_build';resetRound(r);}}});
 mutate('QUEST_CARD',(r,id,d)=>{if(r.phase!=='quest'||!r.proposedTeam.includes(id)||id in r.questCards)throw Error('원정대원만 한 번 제출할 수 있습니다.');const p=r.players.find(p=>p.id===id)!;const card=d.card==='fail'?'fail':'success';if(ROLE_DEFINITIONS[p.role!].team==='good'&&card==='fail')throw Error('선의 세력은 성공 카드만 낼 수 있습니다.');r.questCards[id]=card;if(Object.keys(r.questCards).length===r.proposedTeam.length){const fails=Object.values(r.questCards).filter(x=>x==='fail').length;const success=fails<(doubleFail(r)?2:1);r.questResult={fails,success};r.results.push(success?'success':'fail');saveRoundRecord(r,{fails,success});r.phase='quest_result';}});
 mutate('QUEST_RESULT_CONTINUE',(r,id)=>{if(r.phase!=='quest_result'||id!==r.hostId)throw Error('방장만 진행할 수 있습니다.');const good=r.results.filter(x=>x==='success').length,evil=r.results.filter(x=>x==='fail').length;if(evil>=3){r.phase='result';r.winner='evil';r.winReason='원정 3회가 실패했습니다.';r.resultExpiresAt=Date.now()+30*60*1000;}else if(good>=3){r.phase='assassination';}else{r.round++;r.rejectCount=0;r.leaderIndex=(r.leaderIndex+1)%r.players.length;r.phase='team_build';resetRound(r);}});
 mutate('ASSASSIN_TARGET',(r,id,d)=>{if(r.phase!=='assassination'||r.players.find(p=>p.id===id)?.role!=='assassin')throw Error('암살자만 선택할 수 있습니다.');const target=r.players.find(p=>p.id===d.targetId);if(!target)throw Error('대상을 선택하세요.');r.assassinTarget=target.id;r.phase='result';r.winner=target.role==='merlin'?'evil':'good';r.winReason=target.role==='merlin'?`암살자가 멀린 ${target.nickname}님을 찾아냈습니다.`:`암살자가 멀린을 찾지 못했습니다. (${target.nickname}님 지목)`;r.resultExpiresAt=Date.now()+30*60*1000;});
 mutate('GAME_RESTART',async(r,id)=>{if(id!==r.hostId||r.phase!=='result')throw Error('방장만 새 게임을 시작할 수 있습니다.');r.players=r.players.map(p=>({...p,role:null,ready:false,confirmed:false}));r.phase='lobby';r.round=0;r.leaderIndex=0;r.rejectCount=0;r.results=[];r.roundHistory=[];r.winner=undefined;r.winReason=undefined;r.resultExpiresAt=null;r.lobbyExpiresAt=Date.now()+60*60*1000;resetRound(r);await clearChat(r.roomCode);});
 socket.on('disconnect',async()=>{const c=socket.data.roomCode,id=socket.data.playerId;if(!c||!id)return;try{const r=await withRoomLock(c,async r=>{const p=r.players.find(p=>p.id===id);if(p&&p.socketId===socket.id){p.connected=false;p.socketId=null;p.disconnectedAt=Date.now();if(r.players.every(player=>!player.connected))r.allOfflineExpiresAt=Date.now()+10*60*1000;r.updatedAt=Date.now();await saveRoom(r);}return r;});await emitRoomState(io,r);}catch{}});
}
