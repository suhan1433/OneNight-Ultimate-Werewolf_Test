import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entry, games } from './catalog.ts';
import { defaultSetup, validateSetup, lobbySettings, defaultWerewolfDeck } from './settings.ts';

test('each game has valid settings for solo and full-group moves',()=>{
  for(const game of Object.keys(games)) for(const count of [1,games[game].min,games[game].max]) {
    const setup=defaultSetup(game,count);
    assert.equal(validateSetup(game,setup,count),null,`${game}: ${count}`);
    assert.doesNotThrow(()=>entry(game,'방장',count,undefined,setup));
    assert.equal(setup.maxPlayers,Math.max(count,games[game].min));
    assert.ok(validateSetup(game,setup,games[game].max+1));
  }
});
test('Avalon requires a valid assassination role and respects faction limits',()=>{
  const setup=defaultSetup('avalon',5);
  setup.values.assassin=false;
  assert.ok(validateSetup('avalon',setup,5));
  setup.values.morgana=true;setup.values.assassinationAbilityRole='morgana';
  assert.equal(validateSetup('avalon',setup,5),null);
  setup.values.mordred=true;setup.values.oberon=true;
  assert.match(validateSetup('avalon',setup,5),/악 역할/);
  setup.maxPlayers=7;
  assert.equal(validateSetup('avalon',setup,5),null);
  setup.values.assassin=true;
  assert.ok(validateSetup('avalon',setup,5));
});
test('Werewolf validates deck size and per-role copy limits',()=>{
  const setup=defaultSetup('werewolf',3);
  setup.selectedRoles.pop();assert.ok(validateSetup('werewolf',setup,3));
  setup.selectedRoles=['seer','seer','werewolf','werewolf','villager','villager'];
  assert.ok(validateSetup('werewolf',setup,3));
  setup.maxPlayers=4;setup.selectedRoles=defaultWerewolfDeck(4);
  assert.equal(validateSetup('werewolf',setup,3),null);
});
test('invalid settings fail before destination room creation',()=>{
  const setup=defaultSetup('spacecrew',3);setup.values.missionId=51;
  assert.throws(()=>entry('spacecrew','방장',3,undefined,setup),/시작 미션/);
  const rummi=defaultSetup('rummikub',2);rummi.values.turnSeconds=NaN;
  assert.ok(validateSetup('rummikub',rummi,2));
  rummi.maxPlayers=2;rummi.values.turnSeconds=90;
  assert.ok(validateSetup('rummikub',rummi,3),'roster changes cannot overfill configured capacity');
});
test('Deception roles depend on people count, and forensic choice maps to a new session',()=>{
  const setup=defaultSetup('deception',6);
  assert.ok(validateSetup('deception',setup,5));
  setup.values.forensicPlayer='source-id';
  const [event,payload]=lobbySettings('deception',setup,{'source-id':{playerId:'target-id'}});
  assert.equal(event,'settings');assert.equal(payload.forensicChoice,'target-id');
  assert.equal('forensicPlayer' in payload.settings,false);
  assert.throws(()=>lobbySettings('deception',setup,{}),/법의학자/);
  setup.values.accomplice=false;setup.values.witness=true;
  assert.ok(validateSetup('deception',setup,6));
});
