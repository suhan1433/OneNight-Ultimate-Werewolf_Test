import type { AbilityInputKind, Affiliation, BloodBoundAction, BloodBoundPlayer, BloodBoundRoom, Token } from '@bloodbound/shared';
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
function abilityInput(room:BloodBoundRoom,actor:BloodBoundPlayer):BloodBoundAction|undefined{
  const pending=room.pendingAbility!;const other=otherPlayers(room,actor.id);const unshielded=other.filter(player=>!shielded(player));
  const target=first(unshielded)||first(other);
  const one=(kind:AbilityInputKind,targetId:string):BloodBoundAction=>({type:'ABILITY_INPUT',actorId:actor.id,kind,targetIds:[targetId]});
  switch(pending.ability){
    case 'assassin': return target?one('assassin_target',target):undefined;
    case 'harlequin': {const ids=other.slice(0,2).map(player=>player.id);return ids.length===2?{type:'ABILITY_INPUT',actorId:actor.id,kind:'harlequin_targets',targetIds:ids}:undefined;}
    case 'alchemist': return {type:'ABILITY_INPUT',actorId:actor.id,kind:'alchemist_effect',choice:'wound'};
    case 'mentalist': return target?one('mentalist_target',target):undefined;
    case 'guardian': return first(other)?one('guardian_target',first(other)!):undefined;
    case 'mage': return first(other)?one('mage_target',first(other)!):undefined;
    case 'courtesan': return first(other)?one('courtesan_target',first(other)!):undefined;
    case 'inquisitor': {
      const count=room.maxPlayers===7?2:room.maxPlayers===9?3:4;const ids=other.slice(0,count).map(player=>player.id);
      return ids.length===count?{type:'ABILITY_INPUT',actorId:actor.id,kind:'inquisitor_curses',targetIds:ids,curses:Object.fromEntries(ids.map((id,index)=>[id,index===0?'true':'false']))}:undefined;
    }
    default:return undefined;
  }
}

/** Returns one deterministic legal mechanical choice for a local test bot. */
export function chooseBotAction(room:BloodBoundRoom):BloodBoundAction|undefined{
  if(room.phase==='role_reveal'){const bot=room.players.find(player=>player.isBot&&!player.roleConfirmed);return bot?{type:'ROLE_CONFIRM',actorId:bot.id}:undefined;}
  if(room.phase==='clue_reveal'){const bot=room.players.find(player=>player.isBot&&!player.clueConfirmed);return bot?{type:'CLUE_CONFIRM',actorId:bot.id}:undefined;}
  if(room.phase==='action'){
    const bot=room.daggerHolderId?byId(room,room.daggerHolderId):undefined;if(!bot?.isBot)return undefined;
    const targets=otherPlayers(room,bot.id).filter(target=>!shielded(target)&&!(bot.character?.clan==='secret'&&target.tokens.length>=3));
    const target=targets.sort((left,right)=>right.tokens.length-left.tokens.length)[0];
    return target?{type:'ATTACK',actorId:bot.id,targetId:target.id}:first(otherPlayers(room,bot.id))?{type:'PASS',actorId:bot.id,targetId:first(otherPlayers(room,bot.id))!}:undefined;
  }
  if(room.phase==='token_select'&&room.pendingWound){const bot=byId(room,room.pendingWound.targetId);const token=bot?.isBot?tokenFor(bot,!!room.pendingWound.forceRank):undefined;return bot&&token?{type:'TOKEN_SELECT',actorId:bot.id,token}:undefined;}
  if(room.phase==='ability_decide'&&room.pendingAbility){const bot=byId(room,room.pendingAbility.actorId);return bot?.isBot?{type:'ABILITY_DECIDE',actorId:bot.id,use:true}:undefined;}
  if(room.phase==='ability_input'&&room.pendingAbility){const bot=byId(room,room.pendingAbility.actorId);return bot?.isBot?abilityInput(room,bot):undefined;}
  return undefined;
}

/** Advance only bot-owned, non-social decisions. Human intervention offers remain open. */
export function settleBots(initial:BloodBoundRoom){
  let room=initial;
  for(let steps=0;steps<100;steps+=1){const action=chooseBotAction(room);if(!action)return room;const result=reduce(room,action);if('error' in result)return room;room=result.state;}
  return room;
}
