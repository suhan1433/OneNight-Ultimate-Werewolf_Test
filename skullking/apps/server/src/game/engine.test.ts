import { describe, expect, it } from 'vitest';
import type { Card, SkullPlayer } from '@skullking/shared';
import { createRoom, legalCards, makeDeck, play, resolveDecision, scoreRound, view } from './engine.js';

const card=(id:string,kind:Card['kind'],rank?:number,suit:Card['suit']='treasure',extra:Partial<Card>={}):Card=>({id,kind,name:id,suit:kind==='number'?suit:undefined,rank,...extra});
const sailor=(id:string):SkullPlayer=>({id,nickname:id,sessionToken:id,socketId:null,connected:true,ready:true,isBot:false,hand:[],bid:null,tricks:0,score:0,roundBonus:0});
const config={maxPlayers:2,advanced:false,expansionSuitCards:false,roundMode:'classic'} as const;
describe('Skull King engine',()=>{
  it('enforces following the lead suit',()=>{
    const hand=[card('map-14','number',14,'map'),card('treasure-4','number',4),card('escape','escape')];
    const trick=[{playerId:'a',card:{...card('treasure-8','number',8),suit:'treasure' as const}}];
    expect(legalCards(hand,trick).map(item=>item.id)).toEqual(['treasure-4']);
  });
  it('awards a standard higher suited card the trick',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));
    room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('twelve','number',12)];room.players[1]!.hand=[card('five','number',5)];
    play(room,'a','twelve');play(room,'b','five');
    expect(room.players[0]!.tricks).toBe(1);expect(room.phase).toBe('roundScore');
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
  it('keeps submitted bids hidden from other sailors until reveal',()=>{
    const room=createRoom('ABC123','a','a',config,'token');room.players.push(sailor('b'));room.phase='bidding';room.players[0]!.bid=2;room.players[1]!.bid=null;
    expect(view(room,'b').players.find(player=>player.id==='a')!.bid).toBeNull();expect(view(room,'a').players.find(player=>player.id==='a')!.bid).toBe(2);
  });
  it('adds one expansion 7, 8 and 0/14 to every suit',()=>{
    const deck=makeDeck(false,true);expect(deck).toHaveLength(82);
    for(const suit of ['parrot','map','treasure','jolly'] as const){expect(deck.filter(card=>card.suit===suit&&card.isExpansion)).toHaveLength(3);}
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
    const ability=createRoom('ABC124','a','a',{...config,maxPlayers:3,cards:options},'token');ability.players.push(sailor('b'),sailor('c'));ability.phase='play';ability.cardsThisRound=1;ability.leaderId='a';ability.turnId='a';ability.players[0]!.hand=[card('Rosie','pirate')];ability.players[1]!.hand=[card('escape-a','escape')];ability.players[2]!.hand=[card('escape-b','escape')];play(ability,'a','Rosie');play(ability,'b','escape-a');play(ability,'c','escape-b');expect(ability.pendingDecision?.kind).toBe('rosieLeader');resolveDecision(ability,'a','a');expect(ability.phase).toBe('roundScore');
  });
  it('lets Davy Jones remove a sea monster and records its bonus',()=>{
    const room=createRoom('ABC123','a','a',{...config,maxPlayers:3,cards:{kraken:true,whale:false,loot:false,pirateAbilities:false,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:true,walkThePlank:false}},'token');room.players.push(sailor('b'),sailor('c'));room.phase='play';room.cardsThisRound=1;room.leaderId='a';room.turnId='a';room.players[0]!.hand=[card('kraken','kraken')];room.players[1]!.hand=[card('davy','davy')];room.players[2]!.hand=[card('ten','number',10)];
    play(room,'a','kraken');play(room,'b','davy');play(room,'c','ten');expect(room.players[2]!.tricks).toBe(1);expect(room.history[0]!.scores.find(row=>row.playerId==='b')!.bonus).toBe(20);
  });
});
