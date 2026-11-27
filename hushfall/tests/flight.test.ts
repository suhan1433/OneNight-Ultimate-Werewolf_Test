import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Flight, type Input } from '../src/core/sim/flight';
import { difficulty, rules, patterns, stages } from '../src/data/flight';

test('identical seed and inputs produce the same state after 1000 ticks',()=>{
  const a=new Flight(143,'voyage',0,false),b=new Flight(143,'voyage',0,false);
  for(let i=0;i<1000;i++) {
    const input:Input[]=[{axis:i%116<58?1:-1,dash:i===250},{axis:0,burst:i===500}];
    a.step(input);b.step(input);
  }
  assert.deepEqual(a.frame(),b.frame());
  assert.ok(a.frame().t>=1000);
});

test('the projectile pool sustains 700 simultaneous rounds',()=>{
  const game=new Flight(47,'voyage',0,true);
  for(let i=0;i<190;i++)game.step([{axis:0}]);
  game.stressFill();
  assert.equal(game.frame().bullets.length,rules.maxBullets);
  const start=performance.now();
  for(let i=0;i<1000;i++) {
    game.stressFill();game.step([{axis:i%100<50?-1:1}]);
  }
  const elapsed=performance.now()-start;
  assert.ok(game.frame().bullets.length<=rules.maxBullets);
  assert.ok(Number.isFinite(game.frame().score));
  console.log('700-projectile headless simulation, 1000 ticks:',elapsed.toFixed(1),'ms');
});

test('boss wall leaves room to dash or move into a 130px safe gap',()=>{
  assert.ok(patterns.wall.tell>=.6);
  for(let stage=0;stage<stages.length;stage++) {
    const gap=patterns.wall.gap, bulletSpeed=patterns.wall.speed*stages[stage].bulletSpeed*1.25;
    const arrival=patterns.wall.tell+(rules.flightY-610)/bulletSpeed-.25;
    assert.ok(gap>110);
    const reachable=arrival*rules.speed+gap/2;
    for(let i=0;i<1000;i++) {
      const gapX=90+i%361;
      assert.ok(Math.max(gapX-rules.edge,rules.width-rules.edge-gapX)<=reachable);
    }
  }
});

test('two pilot bots reach the Stage 1 Gateway and can select a route',()=>{
  const game=new Flight(417,'voyage',0,false);
  let frame=game.frame(), goals=[200,340];
  for(let i=0;i<25000&&frame.phase!=='gateway'&&frame.phase!=='result';i++) {
    if(i%6===0) {
      frame=game.frame();
      const threats=frame.bullets.filter(b=>b[2]<0&&b[1]>685&&b[1]<850);
      const target=frame.enemies.find(e=>e[1]===7) || frame.enemies.find(e=>e[3]>1);
      for(let p=0;p<2;p++) {
        const pilot=frame.pilots[p], mate=frame.pilots[1-p];
        const desired=mate.wreck>0?mate.x:(target?.[2]??270)+(p===0?-21:21);
        let cost=Infinity;
        for(let x=30;x<=510;x+=8) {
          const danger=threats.reduce((n,b)=>n+Math.max(0,43-Math.abs(b[0]-x))*7,0);
          const next=danger+Math.abs(x-desired)*.66+Math.abs(x-pilot.x)*.9;
          if(next<cost){cost=next;goals[p]=x;}
        }
        if(pilot.offer.length) game.pick(p,pilot.offer.find(id=>id==='power'||id==='spread')||pilot.offer[0]);
      }
    }
    game.step(goals.map(target=>({target,axis:0,burst:frame.resonance>=100&&i%7===0})));
  }
  assert.equal(frame.phase,'gateway');
  assert.ok(frame.score>10000);
  game.gateway(0,frame.relicOffers[0][0],1,false);game.gateway(1,frame.relicOffers[1][0],0,false);
  for(let i=0;i<60;i++)game.step([{axis:0},{axis:0}]);
  assert.equal(game.frame().stage,2);
  assert.equal(game.frame().phase,'act');
});

test('Calm and Heat expose different survival constraints and rewards',()=>{
  const calm=new Flight(1,'voyage',-1,true).frame();
  const normal=new Flight(1,'voyage',0,true).frame();
  const max=new Flight(1,'voyage',10,true).frame();
  assert.equal(calm.pilots[0].hull,normal.pilots[0].hull+2);
  assert.equal(max.pilots[0].hull,normal.pilots[0].hull-1);
  assert.equal(difficulty(5).bossExtra,true);
  assert.equal(difficulty(5).extraElites,1);
  assert.equal(difficulty(10).lull,5);
  assert.ok(difficulty(10).dust>difficulty(0).dust);
});

test('opening teaches aiming, introduces live enemy fire and delivers an early upgrade',()=>{
  const game=new Flight(417,'daily',0,true);
  let firstBullet=0, firstUpgrade=0;
  for(let i=0;i<28*rules.hz;i++) {
    const frame=game.frame(), p=frame.pilots[0];
    if(!firstBullet&&frame.bullets.some(b=>b[2]<0))firstBullet=frame.stageTime;
    if(!firstUpgrade&&p.offer.length)firstUpgrade=frame.stageTime;
    const nearest=frame.enemies.find(e=>e[3]>0);
    game.step([{axis:0,target:nearest?.[2]??210}]);
  }
  assert.ok(firstBullet>=6&&firstBullet<=15, 'enemy fire should follow a brief learning window');
  assert.ok(firstUpgrade>0&&firstUpgrade<=25,'first draft should arrive within the opening');
});

test('opening roles, draft priority and evolution use authoritative choices',()=>{
  const game=new Flight(19,'daily',0,false);
  game['awardXP'](rules.xp);
  assert.deepEqual(game.frame().pilots[0].offer,['power','frost','shield']);
  game.pick(0,'frost');game.pick(1,'volt');
  assert.equal(game.frame().pilots[0].branch,'control');
  assert.equal(game.frame().pilots[1].branch,undefined,'cannot select a card outside the offer');
  const found=new Set<string>();
  for(let i=0;i<4;i++) {
    game['awardXP'](game.frame().goal-game.frame().xp);
    const offer=game.frame().pilots[0].offer;
    const required=offer.find(card=>['frost','critical'].includes(card)&&
      (game.pilots[0].cards[card]||0)<2);
    assert.ok(required);
    game.pick(0,required);
    found.add(required);
    if(game.pilots[0].cards.frost===2&&game.pilots[0].cards.critical===2)break;
  }
  assert.equal(found.size,2);
  assert.equal(game.pilots[0].cards.frost,2);
  assert.equal(game.pilots[0].cards.critical,2);
});

test('linked elements, cross-seat upgrades and flanking require both pilots',()=>{
  const game=new Flight(19,'voyage',0,false);
  game.pilots[0].cards={frost:2,range:2};
  game.pilots[1].cards={volt:2,field:2};
  for(let i=0;i<190;i++)game.step([{axis:0},{axis:0}]);
  assert.equal(game.frame().strategy.active,'circuit');
  assert.equal(game.frame().strategy.anchor,true);
  game['time']=182;
  for(let i=0;i<250;i++)game.step([{axis:0,target:178},{axis:0,target:365}]);
  assert.equal(game.frame().phase,'boss');
  assert.ok(game.frame().strategy.exposed>0 || game['exposureCooldown']>0,'straddling the boss opens a timed vulnerability');
  game.pilots[1].x=510;game.pilots[0].x=30;
  game.step([{axis:0},{axis:0}]);
  assert.equal(game.frame().strategy.active,undefined);
  assert.equal(game.frame().strategy.anchor,false);
});

test('solo drone supplies a complementary element and survives its own play path',()=>{
  const game=new Flight(19,'voyage',0,true);
  game.pilots[0].cards={frost:2};
  for(let i=0;i<190;i++)game.step([{axis:0}]);
  assert.equal(game.frame().strategy.elements[1],'fire');
  assert.equal(game.frame().strategy.active,'steam');
});


test('the Aegis reserve deploys once and remains consumed until a normal recharge',()=>{
  const game=new Flight(78,'voyage',0,false);
  game.pilots[0].cards={armor:2,shield:2};
  const restored=Flight.restore(game.checkpoint());
  restored['phase']='act';
  const p=restored.pilots[0];
  assert.equal(p.reserve,true);
  restored['hurt'](0,1);
  assert.equal(p.reserve,false);
  assert.equal(p.nova,10);
  for(let t=0;t<125;t++)restored.step([{axis:0},{axis:0}]);
  assert.equal(p.shield,0);
  assert.equal(p.reserve,false);
  const nova=p.nova;
  restored['hurt'](0,1);
  assert.ok(p.shield>2);
  assert.equal(p.nova,nova);
});

test('co-op material plans reserve a later draft slot and can activate a shared combination',()=>{
  const game=new Flight(113,'voyage',0,false);
  game.pick(0,'frost','pair');
  game.pick(1,'fire','pair');
  game.pick(0,'not-a-material','pair');
  game['awardXP'](rules.xp);
  assert.deepEqual(game.pilots[0].offer,['power','frost','shield']);
  game.pick(0,'frost');
  game.pick(1,'power');
  for(let i=0;i<2;i++){
    game['awardXP'](game.frame().goal-game.frame().xp);
    if((game.pilots[0].cards.frost||0)<2) {
      assert.ok(game.pilots[0].offer.includes('frost'));game.pick(0,'frost');
    } else game.pick(0,game.pilots[0].offer[0]);
    assert.ok(game.pilots[1].offer.includes('fire'));game.pick(1,'fire');
  }
  for(let i=0;i<190;i++)game.step([{axis:0},{axis:0}]);
  assert.equal(game.frame().strategy.active,'steam');
  const other=new Flight(114,'voyage',0,false);
  other.pick(0,'frost','pair');other['awardXP'](rules.xp);
  other.pick(0,'frost','ban');other.pick(0,'frost','pair');
  assert.equal(other.pilots[0].pairPlan,undefined);
});

test('duet damage is symmetric and requires two live linked pilots',()=>{
  const fire=(first:number) => {
    const game=new Flight(113,'voyage',0,false,['rook','aster']);
    game['resonance']=100;
    game['spawn'](6,265);
    const inputs=[{axis:0,burst:false},{axis:0,burst:false}];
    inputs[first].burst=true;
    game['resolveBursts'](inputs);
    assert.equal(game.frame().duet,first);
    inputs[first].burst=false;inputs[1-first].burst=true;
    game['resolveBursts'](inputs);
    assert.equal(game.frame().strategy.duets,1);
    game.pilots[1-first].nova=100;
    game['resolveBursts'](inputs);
    assert.equal(game.pilots[1-first].nova,100,'duplicate packets cannot spend Nova after the Duet');
    return game['enemies'][0].hp;
  };
  assert.equal(fire(0),fire(1));
  const game=new Flight(113,'voyage',0,false);
  game['resonance']=100;game.pilots[1].hull=0;game.pilots[0].nova=100;
  game['resolveBursts']([{axis:0,burst:true},{axis:0,burst:false}]);
  assert.equal(game.frame().duet,-1);
  assert.equal(game.frame().duetReady,false);
  assert.equal(game.pilots[0].nova,0);
});

test('steam shock rewards two pilots hitting a shared target once per cooldown',()=>{
  const game=new Flight(113,'voyage',0,false);
  game.pilots[0].cards={frost:2};
  game.pilots[1].cards={fire:2};
  game['resonanceKind']='steam';
  game['spawn'](6,250);
  const foe=game['enemies'][0];
  foe.y=510;
  const hit=(i:number)=>{game['addOrb'](250,510,0,0,i,5);game['collision']();};
  hit(0);hit(0);
  assert.equal(game.frame().strategy.shocks,0);
  const hp=foe.hp;
  hit(1);
  assert.equal(game.frame().strategy.shocks,1);
  assert.ok(foe.hp<hp-5);
  hit(0);hit(1);
  assert.equal(game.frame().strategy.shocks,1);
});

test('later gateways rotate unowned relics while retaining a repair option',()=>{
  const game=new Flight(74,'voyage',0,false);
  const pilot=game.pilots[0];
  pilot.branch='assault';
  pilot.relics=[0,1,3,5];
  const offer=game['offerRelics'](pilot);
  assert.ok(offer.includes(1));
  assert.equal(new Set(offer).size,3);
  assert.ok(offer.filter(id=>id!==1).every(id=>!pilot.relics.includes(id)));
});
