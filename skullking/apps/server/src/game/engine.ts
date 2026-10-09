import type { Card, CardDeclaration, CardOptions, ClientGameState, GameConfig, PendingDecision, PlayedCard, SkullPlayer, SkullRoom, Suit } from '@skullking/shared';

const suits: Suit[]=['parrot','map','treasure','jolly'];
const pirateNames=['Rosie','Bendt','Rascal','Juanita','Harry'];
const schedule=(mode:GameConfig['roundMode'])=>({classic:[1,2,3,4,5,6,7,8,9,10],evenKeeled:[2,4,6,8,10],brawl:[6,7,8,9,10],swift:Array(5).fill(5),broadside:Array(10).fill(10),whirlpool:[9,9,7,7,5,5,3,3,1,1],bedtime:[1]}[mode]);
const uid=()=>crypto.randomUUID();
export const defaultCardOptions=(config:Pick<GameConfig,'advanced'|'expansionSuitCards'|'cards'>):CardOptions=>({
  kraken:config.cards?.kraken??config.advanced, whale:config.cards?.whale??config.advanced, loot:config.cards?.loot??config.advanced,
  pirateAbilities:config.cards?.pirateAbilities??config.advanced, expansionSuitCards:config.cards?.expansionSuitCards??config.expansionSuitCards,
  wildMonkey:config.cards?.wildMonkey??false, maryThorne:config.cards?.maryThorne??false, lastVolley:config.cards?.lastVolley??false,
  firstMateCon:config.cards?.firstMateCon??false, stingray:config.cards?.stingray??false, davyJones:config.cards?.davyJones??false, walkThePlank:config.cards?.walkThePlank??false,
});
const playedSuit=(p:PlayedCard):Suit|undefined=>p.card.kind==='number'?p.card.suit:p.card.kind==='wild'&&typeof p.declaration==='string'&&p.declaration!=='pirate'&&p.declaration!=='escape'?p.declaration:undefined;
const effectiveRank=(p:PlayedCard)=>p.card.kind==='wild'?15:p.card.isZeroFourteen?(p.declaration===14?14:0):(p.card.rank??0);
const normalKind=(p:PlayedCard)=>p.card.kind==='tigress'?(p.declaration==='pirate'?'pirate':'escape'):p.card.kind==='loot'?'escape':p.card.kind;
const isMonster=(p:PlayedCard)=>['kraken','whale','stingray'].includes(p.card.kind);
const isPirate=(p:PlayedCard)=>p.card.kind==='pirate'||(p.card.kind==='tigress'&&p.declaration==='pirate');
const next=(room:SkullRoom,id:string)=>{
  const index=room.players.findIndex(p=>p.id===id);
  for(let offset=1;offset<=room.players.length;offset++){
    const candidate=room.players[(index+offset)%room.players.length]!;
    if(candidate.hand.length>0)return candidate;
  }
  return room.players[index]!;
};

export const leadSuit=(trick:PlayedCard[]):Suit|undefined=>{
  for(const p of trick){
    const suit=playedSuit(p); if(suit)return suit;
    /* Characters and the two base Sea Monsters leave no lead suit for the
       whole trick.  Escape-style cards and the newer expansion specials defer
       suit selection until a later suited card is played. */
    if(['pirate','skullKing','mermaid','con','kraken','whale'].includes(normalKind(p)))return undefined;
  }
  return undefined;
};
export const legalCards=(hand:Card[],trick:PlayedCard[])=>{
  const lead=leadSuit(trick); if(!lead)return hand;
  const follows=hand.filter(card=>card.kind==='number'&&card.suit===lead);
  // Special cards (including Wild Monkey) may always be played; only number cards follow suit.
  const specials=hand.filter(card=>card.kind!=='number');
  return follows.length?[...follows,...specials]:hand;
};
export function makeDeck(advanced:boolean,expansionSuitCards=false,selected?:Partial<CardOptions>){
  const cards:Card[]=[]; const options:CardOptions={...defaultCardOptions({advanced,expansionSuitCards}),...selected};
  const add=(kind:Card['kind'],name:string,suit?:Suit,rank?:number,extra:Partial<Card>={})=>cards.push({id:uid(),kind,name,suit,rank,...extra});
  for(const suit of suits)for(let rank=1;rank<=14;rank++)add('number',`${suit} ${rank}`,suit,rank);
  if(options.expansionSuitCards)for(const suit of suits){add('number',`${suit} 7 · expansion`,suit,7,{isExpansion:true});add('number',`${suit} 8 · expansion`,suit,8,{isExpansion:true});add('number',`${suit} 0/14`,suit,0,{isExpansion:true,isZeroFourteen:true});}
  pirateNames.forEach(name=>add('pirate',name)); add('tigress','Tigress');add('skullKing','Skull King');add('mermaid','Alyra');add('mermaid','Sirena'); for(let i=0;i<5;i++)add('escape','Escape');
  if(options.kraken)add('kraken','Kraken'); if(options.whale)add('whale','White Whale'); if(options.loot){add('loot','Loot');add('loot','Loot');}
  if(options.wildMonkey)add('wild','Wild Monkey 15',undefined,15,{isExpansion:true}); if(options.maryThorne)add('pirate','Mary Thorne',undefined,undefined,{isExpansion:true});
  if(options.lastVolley)add('lastVolley','The Last Volley',undefined,undefined,{isExpansion:true}); if(options.firstMateCon)add('con','First Mate Con',undefined,undefined,{isExpansion:true}); if(options.stingray)add('stingray','Spotted Stingray',undefined,undefined,{isExpansion:true}); if(options.davyJones)add('davy',"Davy Jones' Locker",undefined,undefined,{isExpansion:true}); if(options.walkThePlank)add('plank','Walk the Plank',undefined,undefined,{isExpansion:true});
  return cards;
}
const shuffle=<T,>(items:T[])=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j]!,copy[i]!];}return copy;};
const player=(room:SkullRoom,id:string)=>room.players.find(p=>p.id===id)!;
const clearAndContinue=(room:SkullRoom)=>{
  room.pendingDecision=undefined; room.phase='play'; room.turnId??=room.leaderId;
  if(room.players.every(p=>p.hand.length===0))scoreRound(room);
};
const queue=(room:SkullRoom,pending:PendingDecision)=>{room.pendingDecision=pending;room.phase='decision';room.turnId=null;};
function startAbility(room:SkullRoom,sourceName:string,ownerId:string){
  const owner=player(room,ownerId);
  if(sourceName==='Rosie'){const options=room.players.filter(p=>p.hand.length>0).map(p=>p.id);if(options.length){queue(room,{kind:'rosieLeader',playerId:owner.id,options});return true;}return false;}
  if(sourceName==='Bendt'){const drawn=room.deck.splice(0,2);owner.hand.push(...drawn);if(drawn.length){queue(room,{kind:'bendtDiscard',playerId:owner.id,remaining:drawn.length});return true;}return false;}
  if(sourceName==='Rascal'){queue(room,{kind:'rascalBet',playerId:owner.id});return true;}
  if(sourceName==='Juanita'){owner.peekedDeck=[...room.deck];room.log.push(`🔮 ${owner.nickname} secretly inspected the undealt deck.`);return false;}
  if(sourceName==='Harry'){queue(room,{kind:'harryBid',playerId:owner.id});return true;}
  if(sourceName==='Mary Thorne'){const options=room.players.filter(p=>p.hand.length>0).map(p=>p.id);if(options.length){queue(room,{kind:'maryTarget',playerId:owner.id,options});return true;}}
  return false;
}
function advanceAbilityQueue(room:SkullRoom){while(room.abilityQueue?.length){const task=room.abilityQueue.shift()!;if(startAbility(room,task.sourceName,task.ownerId))return true;}room.abilityQueue=undefined;return false;}
function finishDecision(room:SkullRoom){room.pendingDecision=undefined;if(advanceAbilityQueue(room))return;clearAndContinue(room);}
function winnerOf(cards:PlayedCard[],lead:Suit|undefined|null){
  const contenders=cards.filter(p=>!['lastVolley','plank','davy'].includes(p.card.kind));
  const kinds=contenders.map(normalKind); const first=(kind:string)=>contenders.find(p=>normalKind(p)===kind);
  if(kinds.includes('mermaid')&&(kinds.includes('skullKing')||kinds.includes('con')))return first('mermaid');
  if(kinds.includes('skullKing'))return first('skullKing'); if(kinds.includes('con'))return first('con'); if(kinds.includes('pirate'))return first('pirate'); if(kinds.includes('mermaid'))return first('mermaid');
  const numbers=contenders.filter(p=>p.card.kind==='number'||p.card.kind==='wild');
  if(numbers.length){const trump=numbers.filter(p=>playedSuit(p)==='jolly');const followed=numbers.filter(p=>playedSuit(p)===lead);const candidates=trump.length?trump:followed.length?followed:numbers;return candidates.reduce((best,p)=>effectiveRank(p)>effectiveRank(best)?p:best);}
  // Loot is an Escape for ranking purposes, so the first escape-style card wins.
  return contenders.find(p=>normalKind(p)==='escape');
}
function resolveTrick(room:SkullRoom){
  const original=[...room.trick]; let cards=[...original];
  const davy=cards.find(p=>p.card.kind==='davy');if(davy){const monsters=cards.filter(isMonster);if(monsters.length)player(room,davy.playerId).roundBonus+=monsters.length*20;cards=cards.filter(p=>p.card.kind!=='davy'&&!isMonster(p));}
  const monster=cards.filter(isMonster).at(-1); let winner:PlayedCard|undefined; let destroyed=false;
  if(monster?.card.kind==='kraken'){winner=winnerOf(cards.filter(p=>p.card.kind!=='kraken'),room.trickLead);destroyed=true;}
  else if(monster?.card.kind==='whale'||monster?.card.kind==='stingray'){const numbers=cards.filter(p=>p.card.kind==='number'||p.card.kind==='wild');winner=numbers.reduce<PlayedCard|undefined>((best,p)=>!best||(monster.card.kind==='whale'?effectiveRank(p)>effectiveRank(best):effectiveRank(p)<effectiveRank(best))?p:best,undefined);destroyed=!winner;}
  else winner=winnerOf(cards,room.trickLead);
  // A numberless White Whale trick is discarded, but its player—not the original
  // leader—leads next.  Other discarded non-winning-special tricks keep the leader.
  const fallback=!winner&&monster?.card.kind==='whale'?monster.playerId:room.leaderId??original[0]!.playerId; const leadPlayer=player(room,winner?.playerId??fallback); const nextLeader=leadPlayer.hand.length>0?leadPlayer:next(room,leadPlayer.id);
  // Keep the complete trick in the outbound state.  Without this snapshot, the
  // final card is cleared before clients receive a state containing it.
  room.lastTrick={cards:original,winnerId:destroyed?null:(winner?.playerId??null)};
  room.trick=[];room.trickPlayerIds=[];room.trickLead=undefined;room.leaderId=nextLeader.id;room.turnId=nextLeader.id;
  if(destroyed){room.log.push(monster?.card.kind==='kraken'?'🐙 Kraken destroyed the trick.':'🌊 Sea Monster left no number card: trick discarded.');clearAndContinue(room);return;}
  if(!winner){room.log.push('🌊 No card could win; the original leader plays again.');clearAndContinue(room);return;}
  leadPlayer.tricks++;let bonus=0;const kinds=cards.map(normalKind);const pirateCount=cards.filter(isPirate).length;const mermaids=kinds.filter(k=>k==='mermaid').length;
  if(normalKind(winner)==='skullKing')bonus+=pirateCount*30+(cards.filter(p=>p.card.kind==='con').length*30);
  if(normalKind(winner)==='mermaid'){if(kinds.includes('skullKing'))bonus+=40;bonus+=cards.filter(p=>p.card.kind==='con').length*30;}
  if(normalKind(winner)==='pirate')bonus+=mermaids*20;
  cards.filter(p=>(p.card.kind==='number'||p.card.kind==='wild')&&p.card.rank===14&&!p.card.isZeroFourteen).forEach(p=>bonus+=playedSuit(p)==='jolly'?20:10);
  cards.filter(p=>p.card.kind==='number'&&p.card.isExpansion&&p.card.rank===7).forEach(()=>bonus-=5); cards.filter(p=>p.card.kind==='number'&&p.card.isExpansion&&p.card.rank===8).forEach(()=>bonus+=5);
  leadPlayer.roundBonus+=bonus;
  // White Whale and Stingray destroy special cards, so a destroyed Loot never forms an alliance.
  if(monster?.card.kind!=='whale'&&monster?.card.kind!=='stingray')cards.filter(p=>p.card.kind==='loot'&&p.playerId!==leadPlayer.id).forEach(p=>room.lootAlliances.push([p.playerId,leadPlayer.id]));
  room.log.push(`🏆 ${leadPlayer.nickname} wins the trick${bonus?` (+${bonus} pending)`:''}.`);
  const abilityTasks=defaultCardOptions(room.config).pirateAbilities?(winner.card.kind==='con'?cards.filter(isPirate).map(p=>({sourceName:p.card.name,ownerId:leadPlayer.id})):winner.card.kind==='pirate'?[{sourceName:winner.card.name,ownerId:leadPlayer.id}] :[]):[];
  // Harry is the only Pirate ability permitted after the final trick.
  room.abilityQueue=room.players.every(p=>p.hand.length===0)?abilityTasks.filter(task=>task.sourceName==='Harry'):abilityTasks;if(advanceAbilityQueue(room))return;clearAndContinue(room);
}
export function createRoom(roomCode:string,hostId:string,nickname:string,config:GameConfig,token:string):SkullRoom{
  return {roomCode,hostId,config,players:[{id:hostId,nickname,sessionToken:token,socketId:null,connected:true,ready:false,isBot:false,hand:[],bid:null,tricks:0,score:0,roundBonus:0}],phase:'lobby',roundIndex:0,schedule:schedule(config.roundMode),cardsThisRound:0,dealerIndex:0,leaderId:null,turnId:null,trick:[],trickPlayerIds:[],deck:[],lootAlliances:[],history:[],log:['⚓ A new Skull King table is open.'],createdAt:Date.now()};
}
export function beginRound(room:SkullRoom){const wanted=room.schedule[room.roundIndex]!;const options=defaultCardOptions(room.config);const deck=makeDeck(room.config.advanced,room.config.expansionSuitCards,options);const cards=Math.min(wanted,Math.floor(deck.length/room.players.length));room.cardsThisRound=cards;room.deck=shuffle(deck);room.lootAlliances=[];room.pendingDecision=undefined;room.abilityQueue=undefined;room.lastTrick=undefined;room.players.forEach(p=>{p.hand=room.deck.splice(0,cards);p.bid=null;p.tricks=0;p.roundBonus=0;p.rascalBet=0;p.forcedCardId=undefined;p.peekedDeck=undefined;});room.phase='bidding';room.leaderId=room.players[(room.dealerIndex+1)%room.players.length]!.id;room.turnId=null;room.trick=[];room.trickPlayerIds=[];room.trickLead=undefined;room.log.push(`⛵ Round ${room.roundIndex+1}: ${cards} cards. Submit your bid.`);}
export function start(room:SkullRoom,actor:string){if(room.hostId!==actor||room.phase!=='lobby')throw Error('Only the captain can start from the lobby.');if(room.players.length<2)throw Error('At least two sailors are needed.');room.dealerIndex=Math.floor(Math.random()*room.players.length);beginRound(room);}
export function submitBid(room:SkullRoom,actor:string,bid:number){if(room.phase!=='bidding')throw Error('Bidding is not open.');const sailor=player(room,actor);if(!Number.isInteger(bid)||bid<0||bid>sailor.hand.length)throw Error('Choose a valid bid.');sailor.bid=bid;if(room.players.every(p=>p.bid!==null)){room.phase='play';room.turnId=room.leaderId;room.log.push('✊ All bids are revealed.');}}
function validateDeclaration(room:SkullRoom,card:Card,declaration?:CardDeclaration):CardDeclaration|undefined{if(card.kind==='tigress'&&declaration!=='pirate'&&declaration!=='escape')throw Error('Tigress must be declared as Pirate or Escape.');if(card.isZeroFourteen&&declaration!==0&&declaration!==14)throw Error('0/14 must be declared as 0 or 14.');if(card.kind==='wild'){
  // Wild 15 is forced to a colored lead suit; it needs a choice only with no lead.
  if(room.trickLead==='jolly')return undefined;
  if(room.trickLead)return room.trickLead;
  if(!['parrot','map','treasure'].includes(String(declaration)))throw Error('Wild Monkey must be declared as parrot, map, or treasure.');
}return declaration;}
function appendPlay(room:SkullRoom,actor:string,card:Card,declaration?:CardDeclaration){declaration=validateDeclaration(room,card,declaration);if(room.trick.length===0)room.trickPlayerIds=room.players.filter(p=>p.hand.length>0).map(p=>p.id);const sailor=player(room,actor);sailor.hand=sailor.hand.filter(c=>c.id!==card.id);if(sailor.forcedCardId===card.id)sailor.forcedCardId=undefined;room.trick.push({playerId:actor,card,declaration});room.trickLead=leadSuit(room.trick);}
const askLastVolley=(room:SkullRoom)=>{const volley=room.trick.find(p=>p.card.kind==='lastVolley');if(volley&&player(room,volley.playerId).hand.length>0){queue(room,{kind:'lastVolley',playerId:volley.playerId});return true;}return false;};
const askPlank=(room:SkullRoom)=>{const plank=room.trick.find(p=>p.card.kind==='plank');const targets=room.trick.filter(isPirate);if(plank&&targets.length){queue(room,{kind:'plankTarget',playerId:plank.playerId,options:targets.map(p=>p.card.id)});return true;}return false;};
export function play(room:SkullRoom,actor:string,cardId:string,declaration?:CardDeclaration){if(room.phase!=='play'||room.turnId!==actor)throw Error('It is not your turn.');const sailor=player(room,actor);const card=sailor.hand.find(c=>c.id===cardId);if(!card)throw Error('That card is not in your hand.');const forced=sailor.forcedCardId===cardId;if(sailor.forcedCardId&&!forced)throw Error('Mary Thorne chose a card you must play now.');if(!forced&&!legalCards(sailor.hand,room.trick).some(c=>c.id===cardId))throw Error('You must follow the lead suit when possible.');appendPlay(room,actor,card,declaration);if(room.trick.length===room.trickPlayerIds.length){if(askLastVolley(room))return;if(askPlank(room))return;resolveTrick(room);}else room.turnId=next(room,actor).id;}
export function resolveDecision(room:SkullRoom,actor:string,value:string|number,extra?:CardDeclaration){const pending=room.pendingDecision;if(!pending||pending.playerId!==actor)throw Error('You cannot make that decision.');const sailor=player(room,actor);
  if(pending.kind==='rosieLeader'){if(!pending.options.includes(String(value)))throw Error('Choose a sailor at this table.');room.leaderId=String(value);room.turnId=String(value);room.log.push(`🍲 Rosie chose ${player(room,String(value)).nickname} to lead next.`);finishDecision(room);return;}
  if(pending.kind==='bendtDiscard'){const card=sailor.hand.find(c=>c.id===value);if(!card)throw Error('Choose one of your cards to discard.');sailor.hand=sailor.hand.filter(c=>c.id!==card.id);const remaining=pending.remaining-1;if(remaining>0){queue(room,{...pending,remaining});}else finishDecision(room);return;}
  if(pending.kind==='rascalBet'){if(![0,10,20].includes(Number(value)))throw Error('Choose 0, 10, or 20.');sailor.rascalBet=Number(value);room.log.push(`🎲 Rascal wagered ${value} points.`);finishDecision(room);return;}
  if(pending.kind==='harryBid'){const change=Number(value);if(![-1,0,1].includes(change)||sailor.bid===null||sailor.bid+change<0||sailor.bid+change>room.cardsThisRound)throw Error('That bid adjustment is not available.');sailor.bid+=change;room.log.push(`🦍 Harry adjusted the bid to ${sailor.bid}.`);finishDecision(room);return;}
  if(pending.kind==='maryTarget'){if(!pending.options.includes(String(value)))throw Error('Choose a sailor with cards.');const target=player(room,String(value));const forced=target.hand[Math.floor(Math.random()*target.hand.length)];if(forced){target.forcedCardId=forced.id;room.log.push(`🗡️ Mary Thorne forced ${target.nickname}'s next card.`);}finishDecision(room);return;}
  if(pending.kind==='plankTarget'){if(!pending.options.includes(String(value)))throw Error('Choose a Pirate in this trick.');const target=room.trick.find(p=>p.card.id===value&&isPirate(p));if(!target)throw Error('That Pirate is no longer available.');room.trick=room.trick.filter(p=>p!==target);room.trickLead=leadSuit(room.trick);room.log.push(`🦈 Walk the Plank removed ${target.card.name}.`);resolveTrick(room);return;}
  if(pending.kind==='lastVolley'){const card=sailor.hand.find(c=>c.id===value);if(!card)throw Error('Choose an extra card.');appendPlay(room,actor,card,extra);if(askPlank(room))return;resolveTrick(room);}
}
export function scoreRound(room:SkullRoom){const cards=room.cardsThisRound;const scores=room.players.map(sailor=>{const bid=sailor.bid??0;const exact=bid===sailor.tricks;const base=bid===0?(exact?10*cards:-10*cards):(exact?20*bid:-10*Math.abs(bid-sailor.tricks));const lootBonus=room.lootAlliances.filter(([a,b])=>a===sailor.id||b===sailor.id).filter(([a,b])=>{const ally=player(room,a===sailor.id?b:a);return ally.bid===ally.tricks;}).length*20;const rascal=sailor.rascalBet??0;const bonus=(exact?sailor.roundBonus+lootBonus+rascal:sailor.roundBonus*0+lootBonus*0-rascal);sailor.score+=base+bonus;return {playerId:sailor.id,bid,tricks:sailor.tricks,base,bonus,total:sailor.score};});room.history.push({round:room.roundIndex+1,cards,scores});room.log.push('📜 The score parchment has been updated.');room.phase=room.roundIndex===room.schedule.length-1?'result':'roundScore';room.turnId=null;}
export function advance(room:SkullRoom,actor:string){if(room.hostId!==actor||room.phase!=='roundScore')throw Error('Only the captain can begin the next voyage.');room.roundIndex++;room.dealerIndex=(room.dealerIndex+1)%room.players.length;beginRound(room);}
/** Keeps the crew and settings together while resetting a finished voyage to recruitment. */
export function returnToLobby(room:SkullRoom,actor:string){if(room.hostId!==actor||room.phase!=='result')throw Error('Only the captain can return this crew to the lobby.');room.phase='lobby';room.roundIndex=0;room.schedule=schedule(room.config.roundMode);room.cardsThisRound=0;room.dealerIndex=0;room.leaderId=null;room.turnId=null;room.trick=[];room.trickPlayerIds=[];room.trickLead=undefined;room.lastTrick=undefined;room.deck=[];room.lootAlliances=[];room.pendingDecision=undefined;room.abilityQueue=undefined;room.history=[];room.players.forEach(p=>{p.ready=p.isBot;p.hand=[];p.bid=null;p.tricks=0;p.score=0;p.roundBonus=0;p.rascalBet=0;p.forcedCardId=undefined;p.peekedDeck=undefined;});room.log.push('⚓ The crew returned to the harbor for a new voyage.');}
export function view(room:SkullRoom,playerId:string):ClientGameState {const self=player(room,playerId);const pending=room.pendingDecision&&room.pendingDecision.playerId===playerId?room.pendingDecision:undefined;const legalCardIds=room.turnId===playerId?(self.forcedCardId?[self.forcedCardId]:legalCards(self.hand,room.trick).map(c=>c.id)):[];return {roomCode:room.roomCode,playerId,hostId:room.hostId,config:room.config,phase:room.phase,round:room.roundIndex+1,cardsThisRound:room.cardsThisRound,dealerId:room.players[room.dealerIndex]?.id??null,leaderId:room.leaderId,turnId:room.turnId,players:room.players.map(p=>({id:p.id,nickname:p.nickname,connected:p.connected,ready:p.ready,isBot:p.isBot,cardsLeft:p.hand.length,bid:room.phase==='bidding'&&p.id!==playerId?null:p.bid,tricks:p.tricks,score:p.score})),hand:self.hand,legalCardIds,trick:room.trick,trickLead:room.trickLead,lastTrick:room.lastTrick,pendingDecision:pending,pendingPlayerId:room.pendingDecision?.playerId,pendingKind:room.pendingDecision?.kind,
  // Juanita's information is private: it is serialized only in the owner's state.
  ...(self.peekedDeck ? {peekedDeck:self.peekedDeck} : {}),history:room.history,log:room.log.slice(-8),canAdvance:room.phase==='roundScore'&&room.hostId===playerId};}
