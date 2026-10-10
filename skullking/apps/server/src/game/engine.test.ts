import { describe, expect, it, vi } from 'vitest';
import type { Card, SkullPlayer } from '@skullking/shared';
import { advance, createRoom, leadSuit, legalCards, makeDeck, play, resolveDecision, returnToLobby, scoreRound, start, view } from './engine.js';

const card=(id:string,kind:Card['kind'],rank?:number,suit:Card['suit']='treasure',extra:Partial<Card>={}):Card=>({id,kind,name:id,suit:kind==='number'?suit:undefined,rank,...extra});
const sailor=(id:string):SkullPlayer=>({id,nickname:id,sessionToken:id,socketId:null,connected:true,ready:true,isBot:false,hand:[],bid:null,tricks:0,score:0,roundBonus:0});
const config={maxPlayers:2,advanced:false,expansionSuitCards:false,roundMode:'classic'} as const;
describe('Skull King engine',()=>{
  it('enforces following the lead suit',()=>{
    const hand=[card('map-14','number',14,'map'),card('treasure-4','number',4),card('escape','escape')];
    const trick=[{playerId:'a',card:{...card('treasure-8','number',8),suit:'treasure' as const}}];
    expect(legalCards(hand,trick).map(item=>item.id)).toEqual(['treasure-4','escape']);
  });
  it('does not establish a lead suit after a character leads',()=>{
    const hand=[card('treasure-4','number',4),card('map-14','number',14,'map'),card('escape','escape'),card('Rosie','pirate')];
    const trick=[{playerId:'a',card:card('Skull King','skullKing')},{playerId:'b',card:card('treasure-8','number',8)}];
    expect(leadSuit(trick)).toBeUndefined();
    expect(legalCards(hand,trick).map(item=>item.id)).toEqual(['treasure-4','map-14','escape','Rosie']);
  });
  it('uses the first suited card after suit-deferring specials as the lead suit',()=>{
    const trick=[{playerId:'a',card:card('escape','escape')},{playerId:'b',card:card('davy','davy')},{playerId:'c',card:card('stingray','stingray')},{playerId:'d',card:card('map-8','number',8,'map')}];
    expect(leadSuit(trick)).toBe('map');
  });
  it('keeps an established lead suit after Davy Jones or a Sea Monster is played',()=>{
    const hand=[card('treasure-4','number',4),card('map-14','number',14,'map'),card('davy','davy'),card('kraken','kraken')];
    const trick=[{playerId:'a',card:card('treasure-8','number',8)},{playerId:'b',card:card('davy-played','davy')},{playerId:'c',card:card('whale-played','whale')}];
    expect(legalCards(hand,trick).map(item=>item.id)).toEqual(['treasure-4','davy','kraken']);
  });
  it('awards a standard higher suited card the trick',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));
    room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('twelve','number',12)];room.players[1]!.hand=[card('five','number',5)];
    play(room,'a','twelve');play(room,'b','five');
    expect(room.players[0]!.tricks).toBe(1);expect(room.phase).toBe('roundScore');
  });
  it('keeps the completed trick available to clients after the final card resolves',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));
    room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('twelve','number',12)];room.players[1]!.hand=[card('five','number',5)];
    play(room,'a','twelve');play(room,'b','five');
    expect(view(room,'a').lastTrick).toEqual({cards:[expect.objectContaining({playerId:'a',card:expect.objectContaining({id:'twelve'})}),expect.objectContaining({playerId:'b',card:expect.objectContaining({id:'five'})})],winnerId:'a'});
  });
  it('lets a Mermaid capture Skull King and records the 40-point bonus',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));
    room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('king','skullKing')];room.players[1]!.hand=[card('mermaid','mermaid')];
    play(room,'a','king');play(room,'b','mermaid');
    expect(room.players[1]!.tricks).toBe(1);expect(room.players[1]!.roundBonus).toBe(40);
  });
  it('scores zero bids using the actual dealt-card count',()=>{
    const room=createRoom('ABC123','a','a',{...config,maxPlayers:8},'token');room.cardsThisRound=8;room.phase='play';room.roundIndex=9;room.players[0]!.bid=0;room.players[0]!.tricks=0;
    scoreRound(room);expect(room.players[0]!.score).toBe(80);expect(room.history[0]!.cards).toBe(8);
  });
  it('waits for every connected human to confirm the next round',()=>{
    const room=createRoom('ABC123','a','a',{...config,maxPlayers:3},'token');room.players.push(sailor('b'),{...sailor('bot'),isBot:true});room.phase='roundScore';room.cardsThisRound=1;
    advance(room,'a');expect(room.phase).toBe('roundScore');expect(view(room,'b').advanceReady).toEqual(['a']);expect(()=>advance(room,'bot')).toThrow('human sailors');
    advance(room,'b');expect(room.phase).toBe('bidding');expect(room.advanceReady.size).toBe(0);
  });
  it('returns a finished crew to the lobby with a clean scorecard',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));room.phase='result';room.roundIndex=9;room.cardsThisRound=10;room.history=[{round:10,cards:10,scores:[]}];room.players[0]!.score=125;room.players[0]!.hand=[card('old','escape')];room.players[1]!.score=80;returnToLobby(room,'a');expect(room.phase).toBe('lobby');expect(room.roundIndex).toBe(0);expect(room.history).toEqual([]);expect(room.players.map(p=>({ready:p.ready,score:p.score,hand:p.hand.length}))).toEqual([{ready:false,score:0,hand:0},{ready:false,score:0,hand:0}]);expect(()=>returnToLobby(room,'b')).toThrow('captain');
  });
  it('chooses a random sailor to lead the first round',()=>{
    const room=createRoom('ABC123','a','a',{...config,maxPlayers:3},'token');room.players.push(sailor('b'),sailor('c'));
    const random=vi.spyOn(Math,'random').mockReturnValue(.34);
    start(room,'a');
    expect(room.dealerIndex).toBe(1);expect(room.leaderId).toBe('c');
    random.mockRestore();
  });
  it('keeps submitted bids hidden from other sailors until reveal',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));room.phase='bidding';room.players[0]!.bid=2;room.players[1]!.bid=null;
    expect(view(room,'b').players.find(player=>player.id==='a')!.bid).toBeNull();expect(view(room,'a').players.find(player=>player.id==='a')!.bid).toBe(2);
  });
  it('adds one expansion 7, 8 and 0/14 to every suit',()=>{
    const deck=makeDeck(false,true);expect(deck).toHaveLength(82);
    for(const suit of ['parrot','map','treasure','jolly'] as const){expect(deck.filter(card=>card.suit===suit&&card.isExpansion)).toHaveLength(3);expect(deck.filter(card=>card.suit===suit&&card.rank===7)).toHaveLength(2);expect(deck.filter(card=>card.suit===suit&&card.rank===8)).toHaveLength(2);}
  });
  it('requires a 0/14 declaration and uses the selected value',()=>{
    const room=createRoom('ABC123','a','a',{...config,expansionSuitCards:true},'token');room.players.push(sailor('b'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('ten','number',10)];room.players[1]!.hand=[card('zero-fourteen','number',0,'treasure',{isExpansion:true,isZeroFourteen:true})];
    play(room,'a','ten');expect(()=>play(room,'b','zero-fourteen')).toThrow('0/14');play(room,'b','zero-fourteen',14);expect(room.players[1]!.tricks).toBe(1);expect(room.players[1]!.roundBonus).toBe(0);
  });
  it('records expansion 7 and 8 trick bonuses',()=>{
    const room=createRoom('ABC123','a','a',{...config,expansionSuitCards:true},'token');room.players.push(sailor('b'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('expansion-eight','number',8,'treasure',{isExpansion:true})];room.players[1]!.hand=[card('escape','escape')];
    play(room,'a','expansion-eight');play(room,'b','escape');expect(room.players[0]!.roundBonus).toBe(5);
  });
  it('scores a Loot alliance only when both allies hit their bids',()=>{
    const room=createRoom('ABC123','a','a',{...config,advanced:true},'token');room.players.push(sailor('b'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.bid=1;room.players[1]!.bid=0;room.players[0]!.hand=[card('ten','number',10)];room.players[1]!.hand=[card('loot','loot')];
    play(room,'a','ten');play(room,'b','loot');expect(room.players[0]!.score).toBe(40);expect(room.players[1]!.score).toBe(30);
  });
  it('lets the would-be winner lead after Kraken destroys a trick',()=>{
    const room=createRoom('ABC123','a','a',{...config,advanced:true},'token');room.players.push(sailor('b'));room.phase='play';room.cardsThisRound=2;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('kraken','kraken'),card('a-next','number',1)];room.players[1]!.hand=[card('escape','escape'),card('b-next','number',1)];
    play(room,'a','kraken');play(room,'b','escape');expect(room.players[0]!.tricks).toBe(0);expect(room.leaderId).toBe('b');expect(room.turnId).toBe('b');
  });
  it('uses every documented variable card-count schedule',()=>{
    const expected={evenKeeled:[2,4,6,8,10],brawl:[6,7,8,9,10],swift:[5,5,5,5,5],broadside:[10,10,10,10,10,10,10,10,10,10],whirlpool:[9,9,7,7,5,5,3,3,1,1],bedtime:[1]} as const;
    for(const [roundMode,rounds] of Object.entries(expected))expect(createRoom('ABC123','a','a',{...config,roundMode:roundMode as keyof typeof expected},'token').schedule).toEqual(rounds);
  });
  it('adds the complete 19-card expansion only when its options are enabled',()=>{
    const deck=makeDeck(false,false,{expansionSuitCards:true,wildMonkey:true,maryThorne:true,lastVolley:true,firstMateCon:true,stingray:true,davyJones:true,walkThePlank:true});
    expect(deck).toHaveLength(89);expect(deck.find(item=>item.name==='Wild Monkey 15')?.kind).toBe('wild');expect(deck.find(item=>item.name==='Mary Thorne')?.kind).toBe('pirate');
  });
  it('uses Wild Monkey as a declared 15 and exposes a Pirate ability decision',()=>{
    const options={kraken:false,whale:false,loot:false,pirateAbilities:true,expansionSuitCards:false,wildMonkey:true,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};const room=createRoom('ABC123','a','a',{...config,maxPlayers:3,cards:options},'token');room.players.push(sailor('b'),sailor('c'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('map-14','number',14,'map')];room.players[1]!.hand=[card('wild','wild',15,undefined,{isExpansion:true})];room.players[2]!.hand=[card('escape','escape')];
    play(room,'a','map-14');play(room,'b','wild','map');play(room,'c','escape');expect(room.players[1]!.tricks).toBe(1);
    const ability=createRoom('ABC124','a','a',{...config,maxPlayers:3,cards:options},'token');ability.players.push(sailor('b'),sailor('c'));ability.phase='play';ability.cardsThisRound=2;ability.leaderId='a';ability.turnId='a';ability.players[0]!.hand=[card('Rosie','pirate'),card('a-next','escape')];ability.players[1]!.hand=[card('escape-a','escape'),card('b-next','number',1)];ability.players[2]!.hand=[card('escape-b','escape'),card('c-next','number',1)];play(ability,'a','Rosie');play(ability,'b','escape-a');play(ability,'c','escape-b');expect(ability.pendingDecision?.kind).toBe('rosieLeader');resolveDecision(ability,'a','a');expect(ability.phase).toBe('play');expect(ability.turnId).toBe('a');
  });
  it('applies the official Wild 15, escape-style, and White Whale rules',()=>{
    const wild=createRoom('ABC134','a','a',config,'token');wild.players.push(sailor('b'));wild.phase='play';wild.cardsThisRound=1;wild.leaderId='a';wild.turnId='a';wild.players[0]!.hand=[card('map-10','number',10,'map')];wild.players[1]!.hand=[card('wild','wild',15,undefined,{isExpansion:true})];play(wild,'a','map-10');play(wild,'b','wild','parrot');expect(wild.players[1]!.tricks).toBe(1);expect(wild.lastTrick!.cards[1]!.declaration).toBe('map');
    const blackLead=createRoom('ABC134B','a','a',config,'token');blackLead.players.push(sailor('b'));blackLead.phase='play';blackLead.cardsThisRound=1;blackLead.leaderId='a';blackLead.turnId='a';blackLead.players[0]!.hand=[card('jolly-10','number',10,'jolly')];blackLead.players[1]!.hand=[card('wild','wild',15,undefined,{isExpansion:true})];play(blackLead,'a','jolly-10');play(blackLead,'b','wild','parrot');expect(blackLead.players[0]!.tricks).toBe(1);expect(blackLead.lastTrick!.cards[1]!.declaration).toBeUndefined();
    const escapeLoot=createRoom('ABC135','a','a',{...config,advanced:true},'token');escapeLoot.players.push(sailor('b'));escapeLoot.phase='play';escapeLoot.cardsThisRound=1;escapeLoot.leaderId='a';escapeLoot.turnId='a';escapeLoot.players[0]!.hand=[card('escape','escape')];escapeLoot.players[1]!.hand=[card('loot','loot')];play(escapeLoot,'a','escape');play(escapeLoot,'b','loot');expect(escapeLoot.players[0]!.tricks).toBe(1);
    const whale=createRoom('ABC136','a','a',{...config,maxPlayers:3,advanced:true},'token');whale.players.push(sailor('b'),sailor('c'));whale.phase='play';whale.cardsThisRound=2;whale.leaderId='a';whale.turnId='a';whale.players[0]!.hand=[card('escape','escape'),card('a-next','number',1)];whale.players[1]!.hand=[card('whale','whale'),card('b-next','number',1)];whale.players[2]!.hand=[card('pirate','pirate'),card('c-next','number',1)];play(whale,'a','escape');play(whale,'b','whale');play(whale,'c','pirate');expect(whale.players.every(p=>p.tricks===0)).toBe(true);expect(whale.leaderId).toBe('b');
    const whaleLoot=createRoom('ABC137','a','a',{...config,maxPlayers:3,advanced:true},'token');whaleLoot.players.push(sailor('b'),sailor('c'));whaleLoot.phase='play';whaleLoot.cardsThisRound=1;whaleLoot.leaderId='a';whaleLoot.turnId='a';whaleLoot.players[0]!.hand=[card('map-8','number',8,'map')];whaleLoot.players[1]!.hand=[card('loot','loot')];whaleLoot.players[2]!.hand=[card('whale','whale')];play(whaleLoot,'a','map-8');play(whaleLoot,'b','loot');play(whaleLoot,'c','whale');expect(whaleLoot.players[0]!.tricks).toBe(1);expect(whaleLoot.lootAlliances).toEqual([]);
  });
  it('waits for Last Volley before choosing a Walk the Plank target',()=>{
    const cards={kraken:false,whale:false,loot:false,pirateAbilities:false,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:true,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:true};const room=createRoom('ABC138','a','a',{...config,maxPlayers:3,cards},'token');room.players.push(sailor('b'),sailor('c'));room.phase='play';room.cardsThisRound=2;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('plank','plank'),card('a-next','escape')];room.players[1]!.hand=[card('volley','lastVolley'),card('Rosie','pirate')];room.players[2]!.hand=[card('escape','escape'),card('c-next','number',1)];play(room,'a','plank');play(room,'b','volley');play(room,'c','escape');expect(room.pendingDecision?.kind).toBe('lastVolley');resolveDecision(room,'b','Rosie');expect(room.pendingDecision).toEqual({kind:'plankTarget',playerId:'a',options:['Rosie']});resolveDecision(room,'a','Rosie');expect(room.lastTrick!.cards.some(p=>p.card.id==='Rosie')).toBe(false);
  });
  it('waits for Harry the Giant’s visible bid adjustment instead of losing the turn',()=>{
    const options={kraken:false,whale:false,loot:false,pirateAbilities:true,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};const room=createRoom('ABC125','a','a',{...config,maxPlayers:3,cards:options},'token');room.players.push(sailor('b'),sailor('c'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.bid=0;room.players[0]!.hand=[card('Harry','pirate')];room.players[1]!.hand=[card('escape-a','escape')];room.players[2]!.hand=[card('escape-b','escape')];
    play(room,'a','Harry');play(room,'b','escape-a');play(room,'c','escape-b');expect(room.pendingDecision?.kind).toBe('harryBid');resolveDecision(room,'a',1);expect(room.players[0]!.bid).toBe(1);expect(room.phase).toBe('roundScore');
  });
  it('restores the trick winner’s turn after an ability decision',()=>{
    const cards={kraken:false,whale:false,loot:false,pirateAbilities:true,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};
    const room=createRoom('ABC133','a','a',{...config,cards},'token');room.players.push(sailor('b'));room.phase='play';room.cardsThisRound=2;room.leaderId='a';room.turnId='a';
    room.players[0]!.hand=[card('Rascal','pirate'),card('a-next','number',1)];room.players[1]!.hand=[card('escape','escape'),card('b-next','number',1)];
    play(room,'a','Rascal');play(room,'b','escape');expect(room.pendingDecision?.kind).toBe('rascalBet');
    resolveDecision(room,'a',0);
    expect(room.phase).toBe('play');expect(room.leaderId).toBe('a');expect(room.turnId).toBe('a');
  });
  it('lets Davy Jones remove a sea monster and records its bonus',()=>{
    const room=createRoom('ABC123','a','a',{...config,maxPlayers:3,cards:{kraken:true,whale:false,loot:false,pirateAbilities:false,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:true,walkThePlank:false}},'token');room.players.push(sailor('b'),sailor('c'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('kraken','kraken')];room.players[1]!.hand=[card('davy','davy')];room.players[2]!.hand=[card('ten','number',10)];
    play(room,'a','kraken');play(room,'b','davy');play(room,'c','ten');expect(room.players[2]!.tricks).toBe(1);expect(room.history[0]!.scores.find(row=>row.playerId==='b')!.bonus).toBe(20);
  });
  it('draws then discards each card for Bendt before play resumes',()=>{
    const cards={kraken:false,whale:false,loot:false,pirateAbilities:true,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};const room=createRoom('ABC126','a','a',{...config,maxPlayers:3,cards},'token');room.players.push(sailor('b'),sailor('c'));room.phase='play';room.cardsThisRound=2;room.leaderId='a';room.turnId='a';room.deck=[card('draw-1','number',1),card('draw-2','number',2)];room.players[0]!.hand=[card('Bendt','pirate'),card('a-next','escape')];room.players[1]!.hand=[card('escape-a','escape'),card('b-next','number',1)];room.players[2]!.hand=[card('escape-b','escape'),card('c-next','number',1)];
    play(room,'a','Bendt');play(room,'b','escape-a');play(room,'c','escape-b');expect(room.pendingDecision?.kind).toBe('bendtDiscard');expect(room.players[0]!.hand).toHaveLength(3);resolveDecision(room,'a','draw-1');expect(room.pendingDecision?.kind).toBe('bendtDiscard');resolveDecision(room,'a','draw-2');expect(room.phase).toBe('play');expect(room.turnId).toBe('a');
  });
  it('handles Rascal scoring and keeps Juanita’s deck peek private',()=>{
    const cards={kraken:false,whale:false,loot:false,pirateAbilities:true,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};const rascal=createRoom('ABC127','a','a',{...config,maxPlayers:3,cards},'token');rascal.players.push(sailor('b'),sailor('c'));rascal.phase='play';rascal.cardsThisRound=2;rascal.leaderId='a';rascal.turnId='a';rascal.players.forEach(p=>p.bid=p.id==='a'?1:0);rascal.players[0]!.hand=[card('Rascal','pirate'),card('escape-next','escape')];rascal.players[1]!.hand=[card('escape-a','escape'),card('b-next','number',1)];rascal.players[2]!.hand=[card('escape-b','escape'),card('c-next','number',2)];play(rascal,'a','Rascal');play(rascal,'b','escape-a');play(rascal,'c','escape-b');resolveDecision(rascal,'a',20);expect(rascal.phase).toBe('play');play(rascal,'a','escape-next');play(rascal,'b','b-next');play(rascal,'c','c-next');expect(rascal.players[0]!.score).toBe(40);
    const juanita=createRoom('ABC128','a','a',{...config,maxPlayers:3,cards},'token');juanita.players.push(sailor('b'),sailor('c'));juanita.phase='play';juanita.cardsThisRound=2;juanita.leaderId='a';juanita.turnId='a';juanita.deck=[card('secret','number',9)];juanita.players[0]!.hand=[card('Juanita','pirate'),card('a-next','escape')];juanita.players[1]!.hand=[card('escape-c','escape'),card('b-next','number',1)];juanita.players[2]!.hand=[card('escape-d','escape'),card('c-next','number',1)];play(juanita,'a','Juanita');play(juanita,'b','escape-c');play(juanita,'c','escape-d');expect(juanita.phase).toBe('play');expect(view(juanita,'a').peekedDeck?.map(item=>item.id)).toEqual(['secret']);expect(view(juanita,'b')).not.toHaveProperty('peekedDeck');expect(view(juanita,'c')).not.toHaveProperty('peekedDeck');
  });
  it('forces Mary’s selected target and chains every Con-captured Pirate ability',()=>{
    const cards={kraken:false,whale:false,loot:false,pirateAbilities:true,expansionSuitCards:false,wildMonkey:false,maryThorne:true,lastVolley:false,firstMateCon:true,stingray:false,davyJones:false,walkThePlank:false};const mary=createRoom('ABC129','a','a',{...config,maxPlayers:3,cards},'token');mary.players.push(sailor('b'),sailor('c'));mary.phase='play';mary.cardsThisRound=2;mary.leaderId='a';mary.turnId='a';mary.players[0]!.hand=[card('Mary Thorne','pirate'),card('a-next','number',1)];mary.players[1]!.hand=[card('b-play','escape'),card('b-forced','number',2,'map')];mary.players[2]!.hand=[card('c-play','escape'),card('c-next','number',3)];play(mary,'a','Mary Thorne');play(mary,'b','b-play');play(mary,'c','c-play');expect(mary.pendingDecision?.kind).toBe('maryTarget');resolveDecision(mary,'a','b');expect(mary.players[1]!.forcedCardId).toBe('b-forced');play(mary,'a','a-next');expect(view(mary,'b').legalCardIds).toEqual(['b-forced']);expect(()=>play(mary,'b','b-forced')).not.toThrow();play(mary,'c','c-next');expect(mary.phase).toBe('roundScore');
    const con=createRoom('ABC130','a','a',{...config,maxPlayers:4,cards},'token');con.players.push(sailor('b'),sailor('c'),sailor('d'));con.phase='play';con.cardsThisRound=1;con.leaderId='a';con.turnId='a';con.players.forEach(p=>p.bid=0);con.players[0]!.hand=[card('Con','con')];con.players[1]!.hand=[card('Rosie','pirate')];con.players[2]!.hand=[card('Harry','pirate')];con.players[3]!.hand=[card('escape-e','escape')];play(con,'a','Con');play(con,'b','Rosie');play(con,'c','Harry');play(con,'d','escape-e');expect(con.pendingDecision?.kind).toBe('harryBid');resolveDecision(con,'a',0);expect(con.phase).toBe('roundScore');
  });
  it('makes only the Last Volley player skip the final trick and handles Walk the Plank',()=>{
    const volleyCards={kraken:false,whale:false,loot:false,pirateAbilities:false,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:true,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};const volley=createRoom('ABC131','a','a',{...config,maxPlayers:3,cards:volleyCards},'token');volley.players.push(sailor('b'),sailor('c'));volley.phase='play';volley.cardsThisRound=2;volley.leaderId='a';volley.turnId='a';volley.players[0]!.hand=[card('volley','lastVolley'),card('tigress','tigress')];volley.players[1]!.hand=[card('map-3','number',3,'map'),card('b-next','escape')];volley.players[2]!.hand=[card('map-4','number',4,'map'),card('c-next','escape')];
    play(volley,'a','volley');play(volley,'b','map-3');play(volley,'c','map-4');expect(volley.pendingDecision?.kind).toBe('lastVolley');resolveDecision(volley,'a','tigress','pirate');expect(volley.players[0]!.tricks).toBe(1);expect(volley.phase).toBe('play');expect(volley.turnId).toBe('b');expect(volley.players[0]!.hand).toHaveLength(0);
    play(volley,'b','b-next');expect(volley.turnId).toBe('c');play(volley,'c','c-next');expect(volley.phase).toBe('roundScore');
    const plankCards={...volleyCards,lastVolley:false,walkThePlank:true};const plank=createRoom('ABC132','a','a',{...config,maxPlayers:3,cards:plankCards},'token');plank.players.push(sailor('b'),sailor('c'));plank.phase='play';plank.cardsThisRound=1;plank.leaderId='a';plank.turnId='a';plank.players[0]!.hand=[card('plank','plank')];plank.players[1]!.hand=[card('Rosie','pirate')];plank.players[2]!.hand=[card('Harry','pirate')];play(plank,'a','plank');play(plank,'b','Rosie');play(plank,'c','Harry');expect(plank.pendingDecision?.kind).toBe('plankTarget');resolveDecision(plank,'a','Rosie');expect(plank.players[2]!.tricks).toBe(1);
  });
});
