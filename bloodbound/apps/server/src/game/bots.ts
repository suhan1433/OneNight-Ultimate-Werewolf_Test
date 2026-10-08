import { SETUP_TABLE, type AbilityInputKind, type Affiliation, type BloodBoundAction, type BloodBoundPlayer, type BloodBoundRoom, type Token } from '@bloodbound/shared';
import { reduce } from './engine.js';

const byId=(room:BloodBoundRoom,id:string)=>room.players.find(player=>player.id===id);
const otherPlayers=(room:BloodBoundRoom,id:string)=>room.players.filter(player=>player.id!==id);
const hasRank=(player:BloodBoundPlayer)=>player.tokens.some(token=>token.kind==='rank');
const shielded=(player:BloodBoundPlayer)=>player.equipment.shields.length>0;
const affiliations=(player:BloodBoundPlayer):Affiliation[]=>{
  if(player.character?.clan==='secret')return ['rose','beast','unknown'].filter(value=>player.tokens.filter(token=>token.kind==='affiliation'&&token.value===value).length<2) as Affiliation[];
  const slots=player.character?.affiliations??[];
  return (['rose','beast','unknown'] as Affiliation[]).filter(value=>slots.filter(slot=>slot===value).length>player.tokens.filter(token=>token.kind==='affiliation'&&token.value===value).length);
};
const tokenFor=(player:BloodBoundPlayer,forceRank=false):Token|undefined=>{
  if(forceRank||!hasRank(player))return {kind:'rank',value:player.character?.clan==='secret'?'fleur':player.character?.rank??'fleur'};
  const values=affiliations(player).filter(value=>player.equipment.staffs===0||value==='unknown');
  return values[0]?{kind:'affiliation',value:values[0]}:undefined;
};
const first=(items:BloodBoundPlayer[])=>items[0]?.id;
const unshieldedOther=(room:BloodBoundRoom,actor:BloodBoundPlayer)=>otherPlayers(room,actor.id).filter(player=>!shielded(player));

/**
 * A bot should only opt in to an ability when the engine has a legal follow-up
 * action.  Choosing "use" unconditionally left games stuck for abilities such
 * as Alchemist when it was wounded itself, or Assassin when every target had a
 * Shield.
 */
function canUseAbility(room:BloodBoundRoom,actor:BloodBoundPlayer){
  const pending=room.pendingAbility;
  if(!pending)return false;
  const other=otherPlayers(room,actor.id);
  switch(pending.ability){
    case 'elder': return true;
    case 'assassin':
    case 'mentalist': return unshieldedOther(room,actor).length>0;
    case 'harlequin': return other.length>=2;
    case 'alchemist': {
      const targetId=pending.context.originalTargetId;
      const target=targetId?byId(room,targetId):undefined;
      return !!target&&target.id!==actor.id&&(target.tokens.length>0||!shielded(target));
    }
    case 'guardian':
    case 'mage':
    case 'courtesan': return other.length>0;
    case 'berserker': {
      const attackerId=pending.context.attackerId;
      return !!attackerId&&!shielded(byId(room,attackerId)!);
    }
    case 'inquisitor': {
      const count=SETUP_TABLE[String(room.maxPlayers)]?.curse;
      return !!count&&other.length>=count.true+count.false&&!room.curseDistributed;
    }
    default: return false;
  }
}
function abilityInput(room:BloodBoundRoom,actor:BloodBoundPlayer):BloodBoundAction|undefined{
  const pending=room.pendingAbility!;const other=otherPlayers(room,actor.id);const unshielded=other.filter(player=>!shielded(player));
  const target=first(unshielded)||first(other);
  const one=(kind:AbilityInputKind,targetId:string):BloodBoundAction=>({type:'ABILITY_INPUT',actorId:actor.id,kind,targetIds:[targetId]});
  switch(pending.ability){
    case 'assassin': return target?one('assassin_target',target):undefined;
    case 'harlequin': {const ids=other.slice(0,2).map(player=>player.id);return ids.length===2?{type:'ABILITY_INPUT',actorId:actor.id,kind:'harlequin_targets',targetIds:ids}:undefined;}
    case 'alchemist': {
      const originalId=pending.context.originalTargetId;
      const original=originalId?byId(room,originalId):undefined;
      if(!original||original.id===actor.id)return undefined;
      if(original.tokens.length)return {type:'ABILITY_INPUT',actorId:actor.id,kind:'alchemist_effect',choice:'heal'};
      return !shielded(original)?{type:'ABILITY_INPUT',actorId:actor.id,kind:'alchemist_effect',choice:'wound'}:undefined;
    }
    case 'mentalist': return target?one('mentalist_target',target):undefined;
    case 'guardian': return first(other)?one('guardian_target',first(other)!):undefined;
    case 'mage': return first(other)?one('mage_target',first(other)!):undefined;
    case 'courtesan': return first(other)?one('courtesan_target',first(other)!):undefined;
    case 'inquisitor': {
      const curse=SETUP_TABLE[String(room.maxPlayers)]?.curse;
      const count=curse?curse.true+curse.false:0;const ids=other.slice(0,count).map(player=>player.id);
      return curse&&ids.length===count?{type:'ABILITY_INPUT',actorId:actor.id,kind:'inquisitor_curses',targetIds:ids,curses:Object.fromEntries(ids.map((id,index)=>[id,index===0?'true':'false']))}:undefined;
    }
    default:return undefined;
  }
}

/** Returns one deterministic legal mechanical choice for a local test bot. */
export function chooseBotAction(room:BloodBoundRoom):BloodBoundAction|undefined{
  // Harlequin's private view does not change phase, so a bot must explicitly
  // close it before the next normal decision can be made.
  const viewingBot=room.players.find(player=>player.isBot&&(room.harlequinViews[player.id]??[]).length>0);
  if(viewingBot)return {type:'HARLEQUIN_ACK',actorId:viewingBot.id};
  if(room.phase==='role_reveal'){const bot=room.players.find(player=>player.isBot&&!player.roleConfirmed);return bot?{type:'ROLE_CONFIRM',actorId:bot.id}:undefined;}
  if(room.phase==='clue_reveal'){const bot=room.players.find(player=>player.isBot&&!player.clueConfirmed);return bot?{type:'CLUE_CONFIRM',actorId:bot.id}:undefined;}
  if(room.phase==='action'){
    const bot=room.daggerHolderId?byId(room,room.daggerHolderId):undefined;if(!bot?.isBot)return undefined;
    const targets=otherPlayers(room,bot.id).filter(target=>!shielded(target)&&!(bot.character?.clan==='secret'&&target.tokens.length>=3));
    const target=targets.sort((left,right)=>right.tokens.length-left.tokens.length)[0];
    return target?{type:'ATTACK',actorId:bot.id,targetId:target.id}:first(otherPlayers(room,bot.id))?{type:'PASS',actorId:bot.id,targetId:first(otherPlayers(room,bot.id))!}:undefined;
  }
  if(room.phase==='intervention_offer'&&room.attack){
    const bot=room.players.find(player=>player.isBot&&player.id!==room.attack!.attackerId&&player.id!==room.attack!.targetId&&!hasRank(player)&&!room.attack!.offers.includes(player.id));
    return bot?{type:'INTERVENE_OFFER',actorId:bot.id}:undefined;
  }
  if(room.phase==='token_select'&&room.pendingWound){const bot=byId(room,room.pendingWound.targetId);const token=bot?.isBot?tokenFor(bot,!!room.pendingWound.forceRank):undefined;return bot&&token?{type:'TOKEN_SELECT',actorId:bot.id,token}:undefined;}
  if(room.phase==='ability_decide'&&room.pendingAbility){const bot=byId(room,room.pendingAbility.actorId);return bot?.isBot?{type:'ABILITY_DECIDE',actorId:bot.id,use:canUseAbility(room,bot)}:undefined;}
  if(room.phase==='ability_input'&&room.pendingAbility){const bot=byId(room,room.pendingAbility.actorId);return bot?.isBot?abilityInput(room,bot):undefined;}
  return undefined;
}

/** Advance every bot-owned decision. Intervention acceptance stays timed in the socket layer so humans can see and respond to offers. */
export function settleBots(initial:BloodBoundRoom){
  let room=initial;
  for(let steps=0;steps<100;steps+=1){const action=chooseBotAction(room);if(!action)return room;const result=reduce(room,action);if('error' in result)return room;room=result.state;}
  return room;
}
