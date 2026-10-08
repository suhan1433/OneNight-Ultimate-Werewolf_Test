import type { BloodBoundRoom, ClientGameState } from '@bloodbound/shared';

export function clientState(room:BloodBoundRoom,playerId:string):ClientGameState {
  const self=room.players.find(p=>p.id===playerId)!;
  const position=room.players.findIndex(p=>p.id===playerId);
  // Seats advance to the left. A player receives the clue of their right neighbour.
  const right=room.players[(position-1+room.players.length)%room.players.length];
  const allowed:string[]=[];
  if(room.phase==='action'&&room.daggerHolderId===playerId)allowed.push('PASS','ATTACK');
  if(room.phase==='intervention_offer'&&room.attack&&playerId!==room.attack.attackerId&&playerId!==room.attack.targetId&&!self.tokens.some(token=>token.kind==='rank'))allowed.push('INTERVENE_OFFER');
  if((room.phase==='intervention_offer'||room.phase==='intervention_decide')&&room.attack?.targetId===playerId)allowed.push('INTERVENE_DECIDE');
  if(room.phase==='token_select'&&room.pendingWound?.targetId===playerId)allowed.push('TOKEN_SELECT');
  if(room.phase==='ability_decide'&&room.pendingAbility?.actorId===playerId)allowed.push('ABILITY_DECIDE');
  if(room.phase==='ability_input'&&room.pendingAbility?.actorId===playerId)allowed.push('ABILITY_INPUT');
  if((room.harlequinViews[playerId]??[]).length)allowed.push('HARLEQUIN_ACK');
  if(room.phase==='role_reveal'&&!self.roleConfirmed)allowed.push('ROLE_CONFIRM');
  if(room.phase==='clue_reveal'&&!self.clueConfirmed)allowed.push('CLUE_CONFIRM');
  return {roomCode:room.roomCode,playerId,hostId:room.hostId,maxPlayers:room.maxPlayers,phase:room.phase,seed:room.seed,daggerHolderId:room.daggerHolderId,activePlayerId:room.daggerHolderId,players:room.players.map(p=>({id:p.id,nickname:p.nickname,connected:p.connected,ready:p.ready,roleConfirmed:p.roleConfirmed,clueConfirmed:p.clueConfirmed,tokens:p.tokens,wounds:p.tokens.length,equipment:p.equipment,isBot:!!p.isBot})),attack:room.attack,offers:room.attack?.offers,privateCharacter:self.character,visibleClue:room.phase==='clue_reveal'&&right?.character?{fromPlayerId:right.id,clue:right.character.clue}:undefined,harlequinCards:(room.harlequinViews[playerId]??[]).map(id=>room.players.find(p=>p.id===id)?.character).filter((x):x is NonNullable<typeof x>=>!!x),pendingAbility:room.pendingAbility&&{actorId:room.pendingAbility.actorId,ability:room.pendingAbility.ability,context:room.pendingAbility.context},permittedActions:allowed,publicLog:room.publicLog.slice(-50),result:room.result,revealedCharacters:room.phase==='result'?room.players.map(p=>({id:p.id,character:p.character!,curse:p.curse})):undefined};
}
