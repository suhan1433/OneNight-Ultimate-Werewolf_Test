import { CHARACTER_ROWS, SETUP_TABLE, characterFor, inquisitorCharacter, type AbilityId, type Affiliation, type BloodBoundAction, type BloodBoundPlayer, type BloodBoundRoom, type Character, type GameEvent, type PendingAbility, type PendingWound, type ReduceResult, type Token, type VictoryResult } from '@bloodbound/shared';

const clone=<T,>(value:T):T=>structuredClone(value);
const now=()=>Date.now();
const emptyEquipment=()=>({shields:[] as string[],swords:[] as string[],staffs:0,fans:0,quill:false});
const id=()=>crypto.randomUUID();
const event=(type:string,message:string,visibility:GameEvent['visibility']='public',actorId?:string,audience?:string[]):GameEvent=>({id:id(),type,message,visibility,actorId,audience,at:now()});
const fail=(error:string):ReduceResult=>({error});
const player=(state:BloodBoundRoom,id:string)=>state.players.find(item=>item.id===id);
const living=(state:BloodBoundRoom,id:string)=>!!player(state,id) && state.phase!=='result';
const isRank=(token:Token)=>token.kind==='rank';
const wounded=(p:BloodBoundPlayer)=>p.tokens.length;
const hasRank=(p:BloodBoundPlayer)=>p.tokens.some(isRank);
const opposite=(clan:'rose'|'beast')=>clan==='rose'?'beast':'rose';
const publicEvent=(state:BloodBoundRoom,events:GameEvent[],type:string,message:string,actorId?:string)=>{const item=event(type,message,'public',actorId);state.publicLog.push(item);events.push(item);};

/** Mulberry32 with explicit stored state; all setup randomness is reproducible. */
const random=(state:BloodBoundRoom)=>{let a=state.rngState|=0;a=(a+0x6D2B79F5)|0;state.rngState=a;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
const shuffle=<T,>(state:BloodBoundRoom,items:T[])=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random(state)*(i+1));[copy[i],copy[j]]=[copy[j]!,copy[i]!];}return copy;};

export function createRoom(roomCode:string,hostId:string,nickname:string,maxPlayers:number,seed:number,sessionToken:string):BloodBoundRoom{
  if(!SETUP_TABLE[String(maxPlayers)])throw Error('인원은 6~12명이어야 합니다.');
  const stamp=now();
  return {roomCode,hostId,maxPlayers,seed,rngState:seed||1,phase:'lobby',daggerHolderId:null,players:[{id:hostId,nickname,sessionToken,socketId:null,connected:true,ready:false,roleConfirmed:false,clueConfirmed:false,character:null,tokens:[],equipment:emptyEquipment()}],resolutionStack:[],publicLog:[],privateLog:[],harlequinViews:{},curseDistributed:false,pairSequence:0,createdAt:stamp,updatedAt:stamp,lobbyExpiresAt:stamp+3_600_000};
}

export function assignCharacters(state:BloodBoundRoom){
  const setup=SETUP_TABLE[String(state.maxPlayers)]!;
  const cards:Character[]=[];
  for(const clan of ['rose','beast'] as const){
    const ranks=shuffle(state,CHARACTER_ROWS.map(item=>item.rank)).slice(0,setup[clan]);
    cards.push(...ranks.map(rank=>characterFor(clan,rank)));
  }
  if(setup.inquisitor){const inq=inquisitorCharacter();inq.clue=random(state)<.5?'rose':'beast';cards.push(inq);}
  const deck=shuffle(state,cards);
  state.players=state.players.map((p,index)=>({...p,character:deck[index]!,tokens:[],equipment:emptyEquipment(),roleConfirmed:false,clueConfirmed:false,curse:undefined}));
  state.daggerHolderId=state.players[Math.floor(random(state)*state.players.length)]!.id;
}

export function leaderId(state:BloodBoundRoom,clan:'rose'|'beast'){
  const members=state.players.filter(p=>p.character?.clan===clan);
  const elder=members.find(p=>p.character?.rank===1&&p.equipment.quill);
  const candidates=elder?members.filter(p=>p.id!==elder.id):members;
  if(!candidates.length)return null;
  return [...candidates].sort((a,b)=>elder?(b.character!.rank!-a.character!.rank!):(a.character!.rank!-b.character!.rank!))[0]!.id;
}
const shielded=(p:BloodBoundPlayer)=>p.equipment.shields.length>0;
const availableAffiliations=(p:BloodBoundPlayer):Affiliation[]=>{
  if(p.character?.clan==='secret')return (['rose','beast','unknown'] as Affiliation[]).filter(value=>p.tokens.filter(t=>t.kind==='affiliation'&&t.value===value).length<2);
  const slots=p.character?.affiliations??[];
  return (['rose','beast','unknown'] as Affiliation[]).filter(value=>slots.filter(x=>x===value).length>p.tokens.filter(t=>t.kind==='affiliation'&&t.value===value).length);
};
function legalToken(p:BloodBoundPlayer,token:Token,forceRank=false){
  if(!p.character)return false;
  if(token.kind==='rank')return !hasRank(p) && (p.character.clan==='secret'?token.value==='fleur':token.value===p.character.rank) && (forceRank||true);
  if(forceRank)return false;
  if(p.equipment.staffs>0&&token.value!=='unknown')return false;
  return availableAffiliations(p).includes(token.value);
}
function setPhaseForWound(state:BloodBoundRoom,wound:PendingWound,events:GameEvent[]):boolean{
  const target=player(state,wound.targetId)!;
  if(wounded(target)>=3){capture(state,wound.targetId,wound.sourceId,events);return false;}
  state.pendingWound=wound;state.phase='token_select';return true;
}
function finishAttack(state:BloodBoundRoom,events:GameEvent[]){
  const recipient=state.attack?.actualTargetId??state.attack?.targetId;
  state.attack=undefined;
  if(recipient){state.daggerHolderId=recipient;publicEvent(state,events,'DAGGER_TRANSFER',`${player(state,recipient)!.nickname}님에게 단검이 전달되었습니다.`);}
  state.phase='action';
}
function resume(state:BloodBoundRoom,events:GameEvent[]){
  const frame=state.resolutionStack.pop();
  if(!frame?.ability){finishAttack(state,events);return;}
  const pending=frame.ability;
  const stage=(pending.context as Record<string,unknown>).stage;
  const targetId=(pending.context as Record<string,unknown>).targetId as string|undefined;
  if(stage==='assassin-second'&&targetId){
    state.resolutionStack.push({kind:'ability',ability:{...pending,context:{stage:'assassin-finish',targetId}}});
    setPhaseForWound(state,{targetId,sourceId:pending.actorId},events);return;
  }
  if((stage==='assassin-finish'||stage==='mentalist-finish')&&targetId){state.daggerHolderId=targetId;state.phase='action';publicEvent(state,events,'DAGGER_TRANSFER',`${player(state,targetId)!.nickname}님에게 단검이 전달되었습니다.`);return;}
  finishAttack(state,events);
}
function promptAbility(state:BloodBoundRoom,actorId:string,context:PendingAbility['context'],events:GameEvent[]){
  const p=player(state,actorId)!;state.pendingAbility={actorId,ability:p.character!.ability,context};state.phase='ability_decide';publicEvent(state,events,'RANK_REVEALED',`${p.nickname}님이 랭크 토큰을 공개했습니다.`,actorId);
}
function afterToken(state:BloodBoundRoom,p:BloodBoundPlayer,token:Token,events:GameEvent[]){
  const wound=state.pendingWound!;state.pendingWound=undefined;
  if(token.kind==='rank')promptAbility(state,p.id,{intervened:!!state.attack?.intervenerId&&state.attack.actualTargetId===p.id,originalTargetId:state.attack?.targetId,attackerId:state.attack?.attackerId},events);
  else resume(state,events);
}
function capture(state:BloodBoundRoom,capturedId:string,captorId:string,events:GameEvent[]){
  const captured=player(state,capturedId)!;const captor=player(state,captorId)!;const leaders={rose:leaderId(state,'rose'),beast:leaderId(state,'beast')};
  let winningClan:'rose'|'beast'|'secret';let override=false;let reason='';
  if(captured.character?.clan==='secret'){winningClan='secret';override=true;reason='Inquisitor가 포획되어 Secret Order가 단독 승리했습니다.';}
  else {
    const capturedClan=captured.character!.clan as 'rose'|'beast';
    const normalCaptor=captor.character?.clan;
    const generalWinner=normalCaptor==='rose'||normalCaptor==='beast'
      ? (leaders[opposite(normalCaptor)]===capturedId?normalCaptor:opposite(normalCaptor))
      : opposite(capturedClan);
    winningClan=generalWinner;
    reason=leaders[capturedClan]===capturedId?`${captor.nickname}님이 상대 클랜 리더를 포획했습니다.`:`${captor.nickname}님이 리더가 아닌 인물을 포획했습니다.`;
    const winningLeader=leaders[generalWinner];
    if(winningLeader&&player(state,winningLeader)?.curse==='true'){winningClan='secret';override=true;reason+=' True Curse가 승리 클랜 리더에게 있어 Inquisitor가 승리를 가로챘습니다.';}
  }
  const result:VictoryResult={capturedPlayer:capturedId,captor:captorId,captorClan:captor.character?.clan??'secret',capturedClan:captured.character?.clan??'secret',currentLeaders:leaders,winningClan,inquisitorOverride:override,victoryReason:reason};
  state.result=result;state.phase='result';state.pendingWound=undefined;state.pendingAbility=undefined;state.resolutionStack=[];state.attack=undefined;state.daggerHolderId=null;state.resultExpiresAt=now()+1_800_000;
  publicEvent(state,events,'CAPTURE',`${captured.nickname}님이 포획되었습니다. ${reason}`,captorId);
}
function beginAbility(state:BloodBoundRoom,ability:PendingAbility,events:GameEvent[]){
  const actor=player(state,ability.actorId)!;
  if(ability.ability==='elder'){
    const peers=state.players.filter(p=>p.character?.clan===actor.character?.clan&&p.id!==actor.id);
    if(!peers.length){publicEvent(state,events,'ABILITY_ERROR','Elder의 새 리더 후보가 없어 Quill을 사용할 수 없습니다.',actor.id);resume(state,events);return;}
    actor.equipment.quill=true;publicEvent(state,events,'QUILL',`${actor.nickname}님이 Quill을 얻어 리더가 변경되었습니다.`,actor.id);resume(state,events);return;
  }
  if(ability.ability==='berserker'){
    const attackerId=ability.context.attackerId;if(!attackerId||shielded(player(state,attackerId)!)){resume(state,events);return;}
    state.resolutionStack.push({kind:'ability',ability:{...ability,context:{stage:'attack-finish'}}});setPhaseForWound(state,{targetId:attackerId,sourceId:actor.id},events);return;
  }
  state.pendingAbility=ability;state.phase='ability_input';
}
function completeAbility(state:BloodBoundRoom,events:GameEvent[]){state.pendingAbility=undefined;resume(state,events);}
function validOther(state:BloodBoundRoom,actor:string,target:string){return target!==actor&&!!player(state,target);}

export function reduce(original:BloodBoundRoom,action:BloodBoundAction):ReduceResult{
  const state=clone(original);const events:GameEvent[]=[];const actor=player(state,action.actorId);
  if(!actor)return fail('방의 플레이어가 아닙니다.');if(state.phase==='result'&&action.type!=='START')return fail('게임이 이미 종료되었습니다.');
  const active=()=>state.daggerHolderId===action.actorId;
  switch(action.type){
    case 'START': {
      if(action.actorId!==state.hostId||state.phase!=='lobby')return fail('방장만 대기실에서 게임을 시작할 수 있습니다.');
      if(state.players.length!==state.maxPlayers||!state.players.every(p=>p.ready))return fail('정원과 모든 준비 상태를 확인하세요.');assignCharacters(state);state.phase='role_reveal';state.lobbyExpiresAt=null;publicEvent(state,events,'GAME_STARTED','카드가 배분되었습니다. 각자 역할을 확인하세요.');break;
    }
    case 'ROLE_CONFIRM': {
      if(state.phase!=='role_reveal'||actor.roleConfirmed)return fail('역할 확인 단계가 아닙니다.');actor.roleConfirmed=true;
      if(state.players.every(p=>p.roleConfirmed)){state.phase='clue_reveal';publicEvent(state,events,'CLUE_PHASE','왼쪽 이웃에게서 받은 단서를 확인하세요.');}break;
    }
    case 'CLUE_CONFIRM': {
      if(state.phase!=='clue_reveal'||actor.clueConfirmed)return fail('단서 확인 단계가 아닙니다.');actor.clueConfirmed=true;if(state.players.every(p=>p.clueConfirmed)){state.phase='action';publicEvent(state,events,'TURN_START',`${player(state,state.daggerHolderId!)!.nickname}님의 턴입니다.`);}break;
    }
    case 'PASS': {
      if(state.phase!=='action'||!active()||action.targetId===action.actorId||!player(state,action.targetId))return fail('다른 플레이어에게만 단검을 전달할 수 있습니다.');state.daggerHolderId=action.targetId;publicEvent(state,events,'PASS',`${actor.nickname}님이 단검을 넘겼습니다.`,actor.id);break;
    }
    case 'ATTACK': {
      if(state.phase!=='action'||!active()||action.targetId===action.actorId)return fail('현재 단검 보유자만 다른 플레이어를 공격할 수 있습니다.');const target=player(state,action.targetId);if(!target)return fail('대상을 찾을 수 없습니다.');if(shielded(target))return fail('Shield 보유자는 일반 공격 대상이 될 수 없습니다.');if(actor.character?.clan==='secret'&&wounded(target)>=3)return fail('Inquisitor는 상처 3개 이상인 플레이어를 공격할 수 없습니다.');state.attack={attackerId:actor.id,targetId:target.id,offers:[]};state.phase=target.equipment.fans>0?'intervention_decide':'intervention_offer';if(target.equipment.fans>0)publicEvent(state,events,'FAN',`${target.nickname}님의 Fan으로 개입이 차단되었습니다.`);break;
    }
    case 'INTERVENE_OFFER': {
      const attack=state.attack;if(state.phase!=='intervention_offer'||!attack||action.actorId===attack.attackerId||action.actorId===attack.targetId||hasRank(actor))return fail('개입을 제안할 수 없습니다.');if(!attack.offers.includes(actor.id)){attack.offers.push(actor.id);publicEvent(state,events,'INTERVENE_OFFER',`${actor.nickname}님이 개입을 제안했습니다.`,actor.id);}break;
    }
    case 'INTERVENE_DECIDE': {
      const attack=state.attack;if(state.phase!=='intervention_offer'&&state.phase!=='intervention_decide'||!attack||action.actorId!==attack.targetId)return fail('공격 대상만 개입을 결정할 수 있습니다.');if(action.intervenerId&&!attack.offers.includes(action.intervenerId))return fail('제안한 개입자만 선택할 수 있습니다.');const actual=action.intervenerId??attack.targetId;attack.intervenerId=action.intervenerId;attack.actualTargetId=actual;setPhaseForWound(state,{targetId:actual,sourceId:attack.attackerId,forceRank:!!action.intervenerId,originalAttack:true},events);break;
    }
    case 'TOKEN_SELECT': {
      if(state.phase!=='token_select'||!state.pendingWound||state.pendingWound.targetId!==actor.id||!legalToken(actor,action.token,state.pendingWound.forceRank))return fail('선택할 수 없는 토큰입니다.');
      actor.tokens.push(action.token);publicEvent(state,events,'TOKEN',`${actor.nickname}님이 ${action.token.kind==='rank'?'랭크':'Affiliation'} 토큰을 공개했습니다.`,actor.id);
      if(actor.character?.rank===6&&wounded(actor)===3&&actor.equipment.swords.length){
        const pairs=[...actor.equipment.swords];actor.equipment.swords=[];
        for(const other of state.players)other.equipment.shields=other.equipment.shields.filter(pair=>!pairs.includes(pair));
        publicEvent(state,events,'GUARDIAN_EQUIPMENT_RETURN',`${actor.nickname}님의 세 번째 상처로 연결된 Shield와 Sword가 반환되었습니다.`,actor.id);
      }
      afterToken(state,actor,action.token,events);break;
    }
    case 'ABILITY_DECIDE': {
      if(state.phase!=='ability_decide'||state.pendingAbility?.actorId!==actor.id)return fail('능력 사용을 결정할 수 없습니다.');const pending=state.pendingAbility;state.pendingAbility=undefined;if(!action.use){publicEvent(state,events,'ABILITY_SKIP',`${actor.nickname}님이 능력을 사용하지 않았습니다.`,actor.id);resume(state,events);}else beginAbility(state,pending!,events);break;
    }
    case 'ABILITY_INPUT': {
      const pending=state.pendingAbility;if(state.phase!=='ability_input'||!pending||pending.actorId!==actor.id)return fail('현재 능력 입력 권한이 없습니다.');
      const targets=action.targetIds??[];const one=targets[0];
      if(pending.ability==='assassin'&&action.kind==='assassin_target'&&one&&!!player(state,one)&&!shielded(player(state,one)!)){
        state.pendingAbility=undefined;state.resolutionStack.push({kind:'ability',ability:{...pending,context:{stage:'assassin-second',targetId:one}}});setPhaseForWound(state,{targetId:one,sourceId:actor.id},events);
      } else if(pending.ability==='harlequin'&&action.kind==='harlequin_targets'&&targets.length===2&&targets[0]!==targets[1]&&targets.every(t=>validOther(state,actor.id,t))){
        state.harlequinViews[actor.id]=targets;for(const target of targets){state.privateLog.push(event('HARLEQUIN_VIEW','비공개 카드 열람','private',actor.id,[actor.id]));}completeAbility(state,events);
      } else if(pending.ability==='alchemist'&&action.kind==='alchemist_effect'){
        const targetId=pending.context.originalTargetId;if(!targetId||targetId===actor.id)return fail('원래 공격 대상을 찾을 수 없습니다.');if(action.choice==='heal'){const target=player(state,targetId)!;if(!target.tokens.length)return fail('치유할 토큰이 없습니다.');target.tokens.pop();publicEvent(state,events,'HEAL',`${target.nickname}님이 상처 하나를 치유했습니다.`,actor.id);completeAbility(state,events);}else if(action.choice==='wound'&&!shielded(player(state,targetId)!)){state.pendingAbility=undefined;setPhaseForWound(state,{targetId,sourceId:actor.id},events);}else return fail('해당 효과를 사용할 수 없습니다.');
      } else if(pending.ability==='mentalist'&&action.kind==='mentalist_target'&&one&&validOther(state,actor.id,one)&&!shielded(player(state,one)!)){
        const target=player(state,one)!;state.pendingAbility=undefined;state.resolutionStack.push({kind:'ability',ability:{...pending,context:{stage:'mentalist-finish',targetId:one}}});setPhaseForWound(state,{targetId:one,sourceId:actor.id,forceRank:!hasRank(target)},events);
      } else if(pending.ability==='guardian'&&action.kind==='guardian_target'&&one&&validOther(state,actor.id,one)){
        const pair=`${actor.id}:${++state.pairSequence}`;actor.equipment.swords.push(pair);player(state,one)!.equipment.shields.push(pair);publicEvent(state,events,'SHIELD',`${player(state,one)!.nickname}님이 Shield를 받았습니다.`,actor.id);completeAbility(state,events);
      } else if(pending.ability==='mage'&&action.kind==='mage_target'&&one&&validOther(state,actor.id,one)){
        player(state,one)!.equipment.staffs++;if(actor.equipment.staffs===0)actor.equipment.staffs++;publicEvent(state,events,'STAFF',`${player(state,one)!.nickname}님이 Staff를 받았습니다.`,actor.id);completeAbility(state,events);
      } else if(pending.ability==='courtesan'&&action.kind==='courtesan_target'&&one&&validOther(state,actor.id,one)){
        player(state,one)!.equipment.fans++;publicEvent(state,events,'FAN',`${player(state,one)!.nickname}님이 Fan을 받았습니다.`,actor.id);completeAbility(state,events);
      } else if(pending.ability==='inquisitor'&&action.kind==='inquisitor_curses'&&action.curses&&!state.curseDistributed){
        const setup=SETUP_TABLE[String(state.maxPlayers)]!;const values=Object.values(action.curses);const ids=Object.keys(action.curses);if(ids.length!==setup.curse!.true+setup.curse!.false||new Set(ids).size!==ids.length||ids.includes(actor.id)||values.filter(v=>v==='true').length!==1||values.filter(v=>v==='false').length!==setup.curse!.false||ids.some(target=>!player(state,target)))return fail('Curse 배분이 올바르지 않습니다.');for(const [target,curse] of Object.entries(action.curses))player(state,target)!.curse=curse;state.curseDistributed=true;publicEvent(state,events,'CURSE','Inquisitor가 Curse를 배분했습니다.',actor.id);completeAbility(state,events);
      } else return fail('능력 대상 또는 입력이 올바르지 않습니다.');
      break;
    }
    case 'HARLEQUIN_ACK': {
      if(!(state.harlequinViews[actor.id]??[]).length)return fail('확인할 비공개 카드가 없습니다.');
      delete state.harlequinViews[actor.id];publicEvent(state,events,'HARLEQUIN_CLOSED',`${actor.nickname}님의 비공개 열람이 종료되었습니다.`,actor.id);break;
    }
    default:return fail('알 수 없는 행동입니다.');
  }
  state.updatedAt=now();return {state,events};
}
