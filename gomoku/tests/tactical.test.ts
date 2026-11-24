import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, reduce, gameView, player, traitCounts, expire } from "../shared/engine";
import { HEROES, COPIES } from "../shared/data";
import { previewAction, skillTargets } from "../src/tactical-model";
import type { Game, Stone } from "../shared/types";
const names = [{id:"a",name:"하늘"},{id:"b",name:"바람"}];
const setup = () => createGame(names,123,0,{ruleset:"focused",prepSeconds:25,turnSeconds:45});
function start(g: Game) {
  for (const p of g.players) g = reduce(g,p.id,{type:"ready"},0);
  return g;
}
function stock(g: Game) {
  for (const h of HEROES) {
    const owned = g.players.reduce((n,p) => n + p.bench.filter(u=>u.hero===h.id).reduce((n,u)=>n+u.copies,0) + p.shop.filter(id=>id===h.id).length,0);
    const placed = g.board.filter(s=>s?.hero===h.id).reduce((n,s)=>n+s!.copies,0);
    assert.equal(g.pool[h.id] + owned + placed,COPIES[h.cost],h.id);
  }
}
function put(g:Game,c:number,owner:string,hero="plain",extra:Partial<Stone>={}) {
  g.board[c]={uid:`fixture-${c}`,hero,owner,star:1,copies:hero==="plain"?0:1,paid:0,placed:0,protectedUntil:-1,sealedUntil:0,shield:false,shieldRegen:0,cooldown:0,uses:0,tokenUntil:0,...extra};
}
test("focused: equal starter tools, private views, supply every four rounds, no economy interruptions",()=>{
  let g=setup();
  assert.equal(g.deadline,25000);
  for(const p of g.players) {
    assert.deepEqual(p.bench.map(u=>u.hero),["guard","ember","thunder"]);
    assert.equal(p.mana,4); assert.equal(p.gold,3);
    assert.deepEqual(p.shop,["guard","ember","thunder"]);
  }
  stock(g); g=start(g);
  for(let round=1;round<=8;round++) {
    assert.equal(g.round,round); assert.equal(g.phase,"turn");
    for(let side=0;side<2;side++) {
      const id=g.turn;
      // Isolated alternating positions do not complete a five.
      g=reduce(g,id,{type:"place",cell:(round-1)*2+side + Math.floor((round-1)/2)*13},0);
      assert.equal(g.turn,id,"placement always leaves an explicit end-turn decision");
      g=reduce(g,id,{type:"end"},0);
    }
    if(round%4===0) {
      assert.equal(g.phase,"prep");
      assert.ok(g.players.every(p=>p.gold===3+round));
      stock(g); g=start(g);
    } else assert.equal(g.phase,"turn");
    assert.ok(g.players.every(p=>p.xp===0&&p.level===2&&p.augments.length===0));
  }
  assert.equal(g.round,9); stock(g);
});
test("focused: fixed supply, no rerolls, six-unit limit and no hidden merging",()=>{
  let g=setup(); const id=g.players[0].id;
  assert.throws(()=>reduce(g,id,{type:"xp"},0),/보급/);
  assert.throws(()=>reduce(g,id,{type:"reroll"},0),/보급/);
  g.players[0].gold=99;
  for(const slot of [0,1,2]) g=reduce(g,id,{type:"buy",slot},0);
  assert.equal(player(g,id).bench.length,6); stock(g);
  g.players[0].shop[0]="guard";g.pool.guard--;
  assert.throws(()=>reduce(g,id,{type:"buy",slot:0},0),/가득/);
  g=reduce(g,id,{type:"sell",uid:player(g,id).bench[0].uid},0);
  g=reduce(g,id,{type:"buy",slot:0},0);
  assert.equal(player(g,id).bench.length,6);
  assert.ok(player(g,id).bench.every(u=>u.star===1));stock(g);
});
test("focused: legal target previews match server protection, shield and push destination rules",()=>{
  let g=start(setup()); const id=g.turn, enemy=g.players.find(p=>p.id!==id)!.id;
  g.ply=10; put(g,68,id,"thunder");put(g,70,id,"ember");
  for(const c of [81,82,83]) put(g,c,enemy);
  put(g,95,enemy,"plain",{protectedUntil:11});
  let v=gameView(g,id);
  const before=structuredClone(v);
  const targets=skillTargets(v,id,68,null);
  assert.ok(targets.has(82)); assert.ok(!targets.has(95));
  put(g,168,enemy);
  assert.equal(previewAction(gameView(g,id),id,{type:"skill",source:68,target:168}).legal,false);
  assert.ok(!skillTargets(v,id,68,82).has(95));
  const preview=previewAction(v,id,{type:"skill",source:68,target:82});
  assert.equal(preview.legal,true);assert.ok(preview.messages.some(m=>m.includes("3목")));
  assert.deepEqual(v,before,"previews must not mutate the live view");
  const actual=reduce(g,id,{type:"skill",source:68,target:82},0);
  assert.ok(actual.board[82]!.sealedUntil>g.ply);
  assert.ok(actual.events.at(-1)!.text.includes("3목"));
  assert.ok(!skillTargets(v,id,70,82).has(168));
  assert.ok(skillTargets(v,id,70,82).has(69));
  put(g,82,enemy,"plain",{shield:true});v=gameView(g,id);
  const shieldPreview=previewAction(v,id,{type:"skill",source:68,target:82});
  assert.equal(shieldPreview.legal,true);
  assert.ok(!shieldPreview.messages.some(m=>m.includes("연결을 끊")),"breaking a shield does not break a line");
});
test("focused: guard preview identifies the protected ally, traits stay off, timeout advances",()=>{
  let g=start(setup());const id=g.turn;
  put(g,84,id); put(g,85,id,"thunder");
  const uid=player(g,id).bench.find(u=>u.hero==="guard")!.uid;
  const preview=previewAction(gameView(g,id),id,{type:"place",cell:71,uid});
  assert.equal(preview.legal,true);assert.ok(preview.changes.includes(84));
  assert.ok(preview.messages.some(m=>m.includes("방패")));
  g=reduce(g,id,{type:"place",cell:71,uid},0);
  assert.deepEqual(traitCounts(g,id),{});
  const next=expire(g,g.deadline);
  assert.notEqual(next.turn,id);assert.equal(player(next,id).timeouts,1);
});
