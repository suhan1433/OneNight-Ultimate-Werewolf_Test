import { cards, combat, difficulty, enemies, patterns, relics, rules as R, sectorWaves, ships, stages, stats, type CardId, type Mode, type Pattern, type Ship } from '../../data/flight';

import { branchOf, branches, buildBalance as B, complement, evolutionIds, evolutions, meets,
  opening, pairMaterials, primaryElement, resonanceFor, type Branch, type Element, type Evolution, type PairMaterial, type Resonance } from '../../data/builds';
import { trig } from './angles';

const dt = 1 / R.hz;
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const q = (n: number) => Math.round(n * 10) / 10;
export type Input = { axis: number; dash?: boolean; burst?: boolean; target?: number };
export type Phase = 'countdown'|'act'|'lull'|'arrival'|'boss'|'gateway'|'result';
interface Pilot {
  ship: Ship; x: number; dx: number; hull: number; max: number; shield: number; cd: number; dash: number;
  inv: number; shot: number; dir: number; nova: number; over: number; drive: number;
  wreck: number; revive: number; kills: number; grazes: number; saves: number; hits: number;
  cards: Partial<Record<CardId,number>>; relics: number[]; offer: CardId[];
  branch?: Branch; pairPlan?:PairMaterial; volley?: number; reserve?: boolean; recharge?: number;
  pending: number; rerolls: number; bans: number; excluded: CardId[];
}
interface Foe {
  id: number; type: number; reinforcement:boolean; x: number; y: number; anchor: number; hp: number; max: number;
  age: number; shell: number; next: number; volley: number; last: number; burn: number; burnRate: number; chill: number; shatter: number; burnFrom:number; chillFrom:number; shock:number;
}
type Orb = { x: number; y: number; vx: number; vy: number; power: number; owner: number; pierce: number; last: number; critical: boolean; grazed: number; kind: number };
type Drop = { x: number; y: number; kind: number; value: number };
export type Checkpoint = {
  version: 1; id: string; seed: number; rng: number; mode: Mode; heat: number; stage: number;
  score: number; level: number; xp: number; resonance: number; beacon: number; shards: number;
  dust: number; route: number; linkTime: number; combatTime: number; campaignTime: number; pilots: [Pilot,Pilot];
};
export type Frame = {
  id: string; t: number; phase: Phase; stage: number; act: number; left: number; score: number; chain: number;
  level: number; xp: number; goal: number; resonance: number; linked: boolean; link: number;
  beacon: number; shards: number; heat: number; mode: Mode; result: ''|'won'|'lost'|'abandoned';
  paused: boolean; pilots: Pilot[]; enemies: number[][]; bullets: number[][]; drops: number[][];
  boss: number; bossCore: number; bossPhase: number; warning: number; duetReady:boolean; duet: number; duetLeft: number; flash: number; signal: [number,number,number,number];
  strategy: { elements: (Element|undefined)[]; active: Resonance|undefined; anchor:boolean; exposed:number; lock:number; cooldown:number; openings:number; duets:number; shocks:number };
  relicOffers: number[][]; gateway: number[]; draft: number; dust: number; stageTime: number; event: number; eventChoices: number[];
};

const pilot = (x: number, ship:Ship): Pilot => ({
  ship, x, dx:0, hull:ships[ship].hull, max:ships[ship].hull, shield:0, cd:0, dash:0, inv:0, shot:0, dir:1,
  nova:0, over:0, drive:0, wreck:0, revive:0, kills:0, grazes:0, saves:0, hits:0,
  cards:{}, relics:[], offer:[], pending:0, rerolls:R.rerolls, bans:R.bans, excluded:[],
});
const timelines=sectorWaves.map(waves=>waves.flatMap(([at,type,count,interval,formation]) =>
  Array.from({length:count}, (_, i) => ({at:at+i*interval,type,i,count,formation}))).sort((a,b) => a.at-b.at));

export class Flight {
  tick = 0;
  id: string;
  private rng: number;
  phase: Phase = 'countdown';
  stage = 1;
  private act = 1;
  private time = 0;
  private campaignTime = 0;
  private left = R.countdown;
  score = 0;
  private chain = 0;
  private combo = 0;
  private level = 1;
  private xp = 0;
  private resonance = 0;
  private linked = false;
  private linkTime = 0;
  private combatTime = 0;
  private field = 0;
  private fieldHeight = R.linkHeight;
  private anchorLink = false;
  private resonanceKind?: Resonance;
  private elements: (Element|undefined)[] = [undefined,undefined];
  private exposureCharge=0;
  private exposed=0;
  private exposureCooldown=0;
  private openings=0;
  private duets=0;
  private shocks=0;
  private burstLock=[0,0];
  private beacon: number;
  private shards = 0;
  private dust = 0;
  private wave = 0;
  private aim = 0;
  private enemyId = 0;
  private enemies: Foe[] = [];
  private drops: Drop[] = [];
  private orbs: Orb[] = Array.from({length:R.maxBullets}, () => ({x:0,y:0,vx:0,vy:0,power:0,owner:-2,pierce:0,last:0,critical:false,grazed:0,kind:0}));
  private count = 0;
  private bossPhase = 0;
  private bossBreak = 0;
  private warning = -1;
  private warningUntil = 0;
  private flash = 0;
  private duet = -1;
  private duetLeft = 0;
  private signal: Frame['signal'] = [-1,0,0,0];
  private pingAt = [0,0];
  private relicOffers:number[][] = [[],[]];
  private choices = [-1,-1];
  private eventChoices = [-1,-1];
  private event = 0;
  private route = 0;
  private draft = 0;
  private draftFraction=0;
  private draftSkills=[{dash:false,burst:false},{dash:false,burst:false}];
  private stageHit = false;
  private pauseTime = 0;
  private paused = false;
  private result: Frame['result'] = '';
  pilots: [Pilot,Pilot];
  private challenge:ReturnType<typeof difficulty>;

  constructor(public readonly seed: number, public readonly mode: Mode, public readonly heat: number, public drone: boolean, shipIds: [Ship,Ship] = ['aster','aster']) {
    this.challenge=difficulty(heat);
    this.pilots = [pilot(200,shipIds[0]),pilot(340,shipIds[1])];
    for(const p of this.pilots) {p.max+=this.challenge.hull;p.hull=p.max;}
    this.id=String(seed);
    this.rng = seed >>> 0 || 1;
    this.beacon = drone ? 1 : 2;
  }

  private random() {
    this.rng ^= this.rng << 13;
    this.rng ^= this.rng >>> 17;
    this.rng ^= this.rng << 5;
    return (this.rng >>> 0) / 4294967296;
  }

  private get theme() { return stages[(this.stage-1) % stages.length]; }
  private get goal() { return Math.round(R.xp * R.xpScale ** (this.level-1)); }
  private get boss() { return this.enemies.find(e => e.type === 7); }
  private coreRadius(e:Foe,p?:Pilot) {
    const shatter=p?this.hasEvolution(p,'shatter'):this.pilots.some(pilot=>this.hasEvolution(pilot,'shatter'));
    return this.theme.core+(e.chill>0&&shatter?B.shatter.bossCore:0);
  }
  private card(p: Pilot, id: CardId) { return (p.cards[id] || 0) * stats[id]; }
  private damage(p: Pilot) { return ships[p.ship].damage * Math.max(.4,1+this.card(p,'power')+p.relics.reduce((sum,n)=>sum+relics[n].damage,0)); }
  private speed(p: Pilot) { return ships[p.ship].speed * (1+this.card(p,'motor')); }
  pause(timed=false) {
    if (this.phase === 'result') return;
    this.paused = !this.paused;
    this.pauseTime = timed ? R.pauseLimit : 0;
  }
  abandon() { this.result='abandoned'; this.phase='result'; this.paused=false; }
  ping(i: number, kind: number) {
    if (kind < 0 || kind > 3 || this.tick < this.pingAt[i]) return;
    this.pingAt[i] = this.tick + 90;
    this.signal = [kind,this.pilots[i].x,i,this.tick+180];
  }

  private makeOffer(p: Pilot) {
    const pool = cards.filter(c => !p.excluded.includes(c.id) && (p.cards[c.id] || 0) < c.max);
    if(this.level===2 && !p.branch && p.rerolls===R.rerolls && p.bans===R.bans) {
      p.offer=[...opening];
      return;
    }
    p.offer = [];
    const preferred=p.branch && branches[p.branch].cards;
    const project=evolutionIds.find(id=>Object.keys(evolutions[id].requirements).some(card=>(p.cards[card as CardId]||0)>0)
      && !meets(p.cards,id)
      && Object.keys(evolutions[id].requirements).some(card=>branchOf(card as CardId)===p.branch));
    const upgrades=project && evolutions[project].requirements as Partial<Record<CardId,number>>|undefined;
    const missing=upgrades && pool.filter(c=>(p.cards[c.id]||0)<(upgrades[c.id]||0));
    const focus=missing?.length?missing:pool.filter(c=>preferred?.some(id=>id===c.id));
    if(p.pairPlan&&(p.cards[p.pairPlan]||0)<2&&pool.some(card=>card.id===p.pairPlan))p.offer.push(p.pairPlan);
    const priority=focus.filter(card=>!p.offer.includes(card.id));
    if(priority.length) p.offer.push(priority[Math.floor(this.random()*priority.length)].id);
    const remaining=pool.filter(card=>!p.offer.includes(card.id));
    while (remaining.length && p.offer.length < 3) {
      const [card] = remaining.splice(Math.floor(this.random()*remaining.length),1);
      p.offer.push(card.id);
    }
    if (!p.offer.length) p.pending = 0;
  }

  pick(i: number, id: string, action = 'pick') {
    const p = this.pilots[i], card = cards.find(c => c.id === id);
    if(action==='pair') {
      if(!this.drone&&this.phase!=='result') {
        if(id==='none')p.pairPlan=undefined;
        else if(pairMaterials.some(material=>material===id)&&!p.excluded.includes(id as CardId))p.pairPlan=id as PairMaterial;
      }
      return;
    }
    if(action==='focus') {
      if(p.pending&&Object.hasOwn(branches,id)&&this.phase!=='result')p.branch=id as Branch;
      return;
    }
    if (!p.pending || !card || !p.offer.includes(card.id) || this.phase === 'result') return;
    if (action === 'reroll' && p.rerolls > 0) { p.rerolls--; this.makeOffer(p); return; }
    if (action === 'ban' && p.bans > 0) {
      p.bans--;p.excluded.push(card.id);
      if(p.pairPlan===card.id)p.pairPlan=undefined;
      this.makeOffer(p);return;
    }
    if (action !== 'pick') return;
    const hadAegis=this.hasEvolution(p,'aegis');
    p.branch ??= branchOf(card.id);
    p.cards[card.id] = (p.cards[card.id] || 0)+1;
    if(!hadAegis&&this.hasEvolution(p,'aegis'))p.reserve=true;
    if (card.id === 'armor') { p.max++; if (p.hull) p.hull++; }
    p.pending--;
    if (p.pending) this.makeOffer(p); else p.offer = [];
  }

  gateway(i: number, relic: number, route: number, purchase: boolean, eventChoice = -1) {
    if (this.phase !== 'gateway' || this.choices[i] >= 0 || !this.relicOffers[i].includes(relic) || ![0,1].includes(route)) return;
    const p = this.pilots[i];
    if (purchase && this.shards >= 30 && p.hull < p.max) { this.shards -= 30; p.hull++; }
    this.choices[i] = route;
    this.eventChoices[i] = eventChoice;
    if (p.relics.length < 8) {
      p.relics.push(relic);
      p.max = Math.max(1,p.max+relics[relic].hull);
      p.hull = relic === 1 ? p.max : clamp(p.hull,1,p.max);
    }
    if (this.drone && i === 0) this.gateway(1,
      this.relicOffers[1].includes(relic)?relic:this.relicOffers[1][0],route,false,eventChoice);
    if (this.choices.every(n=>n>=0)) this.left = Math.min(this.left,.75);
  }

  private offerRelics(p:Pilot) {
    const pool=relics.map((_,i)=>i);
    // A defensive choice keeps the gateway usable after a costly boss fight.
    const signature=p.branch==='assault'?3:p.branch==='control'?4:p.branch==='escort'?5:undefined;
    const choices=signature===undefined||p.relics.includes(signature)?[1]:[1,signature];
    while(choices.length<3) {
      const remaining=pool.filter(id=>!choices.includes(id));
      const fresh=remaining.filter(id=>!p.relics.includes(id));
      const candidates=fresh.length?fresh:remaining;
      choices.push(candidates[Math.floor(this.random()*candidates.length)]);
    }
    return choices.sort((a,b)=>a-b);
  }

  private hasEvolution(p:Pilot,id:Evolution) { return meets(p.cards,id); }

  private awardXP(value: number) {
    this.xp += value;
    while (this.xp >= this.goal) {
      this.xp -= this.goal; this.level++;
      for (const [i,p] of this.pilots.entries()) {
        p.pending++;
        if (p.pending === 1) this.makeOffer(p);
        if (i === 1 && this.drone && p.offer[0]) {
          const preferred=(this.pilots[0].cards.range||0)>=B.anchor.range&&!(p.cards.field&&(p.cards.field>=B.anchor.field))?
            ['field','power','rate','spread']:['power','rate','spread'];
          this.pick(i,p.offer.find(card=>preferred.includes(card))||p.offer[0]);
        }
      }
    }
  }

  private addOrb(x:number,y:number,vx:number,vy:number,owner:number,power:number,pierce=0,kind=0,critical=false) {
    if (this.count >= this.orbs.length) return;
    const orb=this.orbs[this.count++];
    orb.x=x;orb.y=y;orb.vx=vx;orb.vy=vy;orb.owner=owner;orb.power=power;
    orb.pierce=pierce;orb.last=-1;orb.grazed=0;orb.kind=kind;orb.critical=critical;
  }
  private removeOrb(i: number) {
    const orb = this.orbs[i];
    this.orbs[i] = this.orbs[--this.count];
    this.orbs[this.count] = orb;
  }
  stressFill() {
    for (let i = 0; i < R.maxBullets; i++) this.addOrb(40+(i%23)*20,120+(i%71)*9,0,80,-1,1);
  }
  private circle(x:number,y:number,angle:number,speed:number,damage=1) {
    this.addOrb(x,y,trig(angle+90)*speed,trig(angle)*speed,-1,damage,0,damage===2?2:0);
  }
  private aimed(e:Foe,count:number,speed:number,spread=11) {
    const living = this.pilots.filter(p=>p.hull>0);
    const p = living[this.aim++ % living.length];
    if (!p) return;
    const dx=p.x-e.x, dy=R.flightY-e.y;
    const hyp=Math.hypot(dx,dy) || 1;
    for(let n=0;n<count;n++) {
      const a=(n-(count-1)/2)*spread;
      this.addOrb(e.x,e.y,(dx*trig(a+90)-dy*trig(a))*speed/hyp,(dy*trig(a+90)+dx*trig(a))*speed/hyp,-1,1);
    }
  }
  private spawn(type:number,x:number,reinforcement=false) {
    if(this.enemies.length >= R.maxEnemies) return;
    const scale = this.theme.hp*this.challenge.enemyHp*(1+this.route*.15)*Math.max(1,this.stage/5);
    const hp= type===7 ? this.theme.bossHp*this.challenge.bossHp*(this.drone?1:1.85)*scale/this.theme.hp :
      (type===6 ? R.eliteHull : enemies[type].hp)*scale;
    const shell=type<6 && this.challenge.voidChance>0 && this.random()<this.challenge.voidChance ? hp*combat.voidShell:0;
    this.enemies.push({id:++this.enemyId,type,reinforcement,x,y:-60,anchor:x,hp,max:hp,age:0,shell,next:1.2,volley:0,last:0,burn:0,burnRate:0,chill:0,shatter:0,burnFrom:-1,chillFrom:-1,shock:0});
  }

  private fieldContains(e: Foe) {
    return this.linked && e.y>=R.flightY-this.fieldHeight && e.y<=R.flightY &&
      (e.x-this.pilots[0].x)*(e.x-this.pilots[1].x)<=0;
  }
  private shieldTime(p:Pilot) {
    return Math.max(R.shieldFloor,R.shield-this.card(p,'shield')+this.challenge.shieldDelay+p.relics.reduce((n,id)=>n+(relics[id].shieldDelay||0),0))*(this.linked?R.linkShield:1);
  }
  private hurt(i:number,damage:number) {
    const p=this.pilots[i];
    if(p.inv>0 || !p.hull) return;
    const shielded=p.shield<=0;
    if(!shielded) {
      p.hull=Math.max(0,p.hull-damage); p.hits++;
      this.stageHit=true; this.chain=Math.floor(this.chain/2);
    }
    p.shield=this.shieldTime(p); p.inv=R.immunity;
    if(shielded && p.reserve) {
      p.reserve=false;p.recharge=B.aegis.delay;p.nova=Math.min(R.charge,p.nova+B.aegis.nova);
    }
    if(!p.hull) {p.wreck=R.wreckTime; p.revive=0;}
    for(let n=this.count-1;n>=0;n--) {
      const b=this.orbs[n];
      if(b.owner<0 && Math.hypot(b.x-p.x,b.y-R.flightY)<R.mercy) this.removeOrb(n);
    }
  }
  private burst(i:number,duet:boolean) {
    const p=this.pilots[i];
    if(duet) {this.resonance=0;this.flash=1.15;this.duets++;}
    else {if(p.nova<R.charge) return; p.nova=0; this.flash=.65;}
    p.inv=Math.max(p.inv,1);
    if(duet) this.pilots[1-i].inv=Math.max(this.pilots[1-i].inv,1);
    for(let n=this.count-1;n>=0;n--) if(this.orbs[n].owner<0) {this.removeOrb(n); this.shards+=.1;}
    for(const e of this.enemies) {
      if (e.type === 7 && this.bossBreak > 0) continue;
      if (duet && e.type!==7 && (e.x-this.pilots[0].x)*(e.x-this.pilots[1].x)>0) continue;
      const damage=duet?(this.damage(this.pilots[0])+this.damage(this.pilots[1]))*.5*R.duetPower:this.damage(p)*R.novaPower;
      e.hp-=e.type===7 ? Math.min(damage,e.max*(duet?combat.bossDuetCap:R.novaCap)) : damage; e.last=i;
    }
  }

  private linkRange() {
    const [a,b]=this.pilots;
    return R.linkRange+(a.ship==='sol'||b.ship==='sol'?60:0)+Math.max(this.card(a,'range'),this.card(b,'range'));
  }
  private get duetReady() {
    const [a,b]=this.pilots;
    return a.hull>0&&b.hull>0&&Math.abs(a.x-b.x)<=this.linkRange()&&this.resonance>=R.charge;
  }
  private resolveBursts(inputs:readonly Input[]) {
    for(let i=0;i<2;i++) {
      this.burstLock[i]=Math.max(0,this.burstLock[i]-dt);
      if(this.burstLock[i]>0||!inputs[i]?.burst||!this.pilots[i].hull)continue;
      if(this.duet===1-i&&this.duetReady) {this.burst(i,true);this.duet=-1;this.burstLock.fill(.2);break;}
      if(this.duet>=0)continue;
      if(this.duetReady) {this.duet=i;this.duetLeft=R.duetWindow;this.burstLock[i]=.2;}
      else if(this.pilots[i].nova>=R.charge) {this.burst(i,false);this.burstLock[i]=.2;}
    }
  }

  private localDrone(): Input {
    const p=this.pilots[1], leader=this.pilots[0];
    const target=!leader.hull?leader.x:clamp(leader.x+(leader.x>330?-96:96),R.edge,R.width-R.edge);
    // Keep the drone in formation, with a short sidestep for rounds already near its lane.
    let dodge=0;
    for(let i=0;i<this.count;i++) {
      const b=this.orbs[i];
      if(b.owner>=0||b.vy<=0||b.y<R.flightY-90||b.y>R.flightY)continue;
      const x=b.x+b.vx*(R.flightY-b.y)/b.vy;
      if(Math.abs(x-p.x)<18) {dodge=p.x>=x?54:-54;break;}
    }
    return {axis:clamp((clamp(target+dodge,R.edge,R.width-R.edge)-p.x)/26,-1,1),burst:this.duet===0};
  }
  private move(i:number,input:Input) {
    const p=this.pilots[i], partner=this.pilots[1-i];
    p.inv=Math.max(0,p.inv-dt); p.cd=Math.max(0,p.cd-dt);
    const priorShield=p.shield;
    const chargeRate=p.shield>0&&this.linked&&p.hull&&partner.hull&&
      (this.hasEvolution(p,'aegis')||this.hasEvolution(partner,'aegis'))?B.aegis.linkedRecharge:1;
    p.shield=Math.max(0,p.shield-dt*chargeRate);
    if((p.recharge||0)>0) {
      p.recharge=Math.max(0,p.recharge!-dt);
      if(p.recharge===0)p.shield=0;
    }
    if(priorShield>0&&priorShield<=dt*chargeRate&&this.hasEvolution(p,'aegis'))p.reserve=true;
    p.drive=Math.max(0,p.drive-dt);
    if(!p.hull) {
      if(p.wreck>0) {
        p.wreck-=dt;
        const near=partner.hull && Math.abs(partner.x-p.x)<=R.reviveRadius;
        p.revive=near?p.revive+dt:0;
        if(p.revive>=(this.linked?R.linkRevive:R.revive)) {
          p.hull=R.reviveHull; p.inv=R.reviveImmune; p.revive=0; p.wreck=0; partner.saves++;
        }
      }
      return;
    }
    const axis=typeof input.target==='number'?clamp((input.target-p.x)/24,-1,1):clamp(input.axis,-1,1);
    if(Math.abs(axis)>.08) p.dir=Math.sign(axis);
    if(input.dash && p.cd===0) {
      p.cd=ships[p.ship].cooldown*(1-this.card(p,'dash'));
      if(p.ship==='sol') {
        const target=partner.hull?partner:p;
        target.hull=Math.min(target.max,target.hull+1);
      } else if(p.ship==='pico') {
        p.x=clamp(partner.hull?partner.x:p.x+p.dir*R.dashDistance,R.edge,R.width-R.edge);
        p.inv=Math.max(p.inv,R.dashTime);
      } else if(p.ship==='rook') {
        p.inv=Math.max(p.inv,3);
        for(let n=this.count-1;n>=0;n--) {
          const orb=this.orbs[n];
          if(orb.owner<0 && Math.hypot(orb.x-p.x,orb.y-R.flightY)<90) {
            orb.owner=i;orb.vy=-Math.abs(orb.vy)*2;orb.power=this.damage(p);
          }
        }
      } else if(p.ship==='vesper') {
        p.inv=Math.max(p.inv,1.5);
        for(let n=this.count-1;n>=0;n--) {
          const orb=this.orbs[n];
          if(orb.owner<0 && Math.hypot(orb.x-p.x,orb.y-R.flightY)<90) {this.removeOrb(n);this.score+=25;}
        }
      } else {
        p.dash=R.dashTime;p.inv=Math.max(p.inv,R.dashTime);
      }
    }
    p.dx+=(axis*this.speed(p)-p.dx)*dt/R.acceleration;
    if (typeof input.target === 'number' && Math.abs(input.target-p.x)<2 && p.dash<=0) p.dx=0;
    p.x=clamp(p.x+dt*(p.dash>0?p.dir*R.dashDistance/R.dashTime:p.dx),R.edge,R.width-R.edge);
    p.dash=Math.max(0,p.dash-dt);
    p.shot-=dt;
    if(p.shot>0) return;
    const bonus=p.relics.reduce((sum,n)=>sum+relics[n].rate,0);
    p.shot+=1/(ships[p.ship].rate*Math.max(.4,1+bonus+this.card(p,'rate'))*(this.linked?R.linkRate:1)*(p.drive?R.overdriveRate:1));
    const count=ships[p.ship].count+(p.cards.spread || 0);
    for(let n=0;n<count;n++) {
      let power=this.damage(p)*(1-this.card(p,'spread'));
      const critical=this.random()<this.card(p,'critical');
      if(critical) power*=1.8;
      const spread=p.ship==='vesper'?(n-(count-1)/2)*12:0;
      this.addOrb(p.x+(n-(count-1)/2)*R.shotGap,R.flightY-20,trig(spread)*R.shotSpeed,-trig(spread+90)*R.shotSpeed,i,power,p.ship==='rook'?40:p.ship==='sol'?5:this.card(p,'pierce'),p.ship==='pico'?3:0,critical);
    }
    if(this.hasEvolution(p,'skyneedle')) {
      p.volley=(p.volley||0)+1;
      if(p.volley%B.skyneedle.every===0) this.addOrb(p.x,R.flightY-20,0,-R.shotSpeed,i,
        this.damage(p)*B.skyneedle.power,B.skyneedle.pierce,B.skyneedle.kind);
    }
  }

  private bossAttack(e:Foe, pattern:Pattern, speed:number) {
    const spec=patterns[pattern], sector=e.volley++;
    if(pattern==='wall'||pattern==='rain') {
      for(let n=0;n<spec.count;n++) {
        const x=20+n*(R.width-40)/(spec.count-1);
        if(pattern==='wall' && Math.abs(x-this.warning)<patterns.wall.gap/2) continue;
        if(pattern==='rain' && (n+sector)%3===0) continue;
        this.addOrb(x,e.y+20,0,speed,-1,1);
      }
    } else if(pattern==='aim') this.aimed(e,spec.count,speed);
    else for(let n=0;n<spec.count;n++) {
      const angle=pattern==='fan'?90+(n-(spec.count-1)/2)*11:
        (n*360/spec.count+sector*(pattern==='spiral'?39:17));
      this.circle(e.x,e.y+18,angle,speed);
    }
  }

  private updateEnemy(e:Foe) {
    const def=enemies[e.type===6?0:e.type];
    const before=e.age;
    e.age+=dt;
    e.shatter=Math.max(0,e.shatter-dt);
    e.shock=Math.max(0,e.shock-dt);
    if(e.burn>0) {if(e.type!==7)e.hp-=e.burnRate*dt;e.burn-=dt;}
    const field=this.fieldContains(e);
    if(field && this.field<=0 && (e.type!==7||(this.phase==='boss'&&this.bossBreak<=0))) {
      const [a,b]=this.pilots;
      const plasma=this.resonanceKind==='plasma'?B.plasma.power:1;
      const focus=(this.anchorLink?B.anchor.power:1)*(e.type===7&&this.exposed>0?B.boss.fieldMultiplier:1);
      const defense=e.type===7 ? 1+Number(this.hasEvolution(a,'aegis')||this.hasEvolution(b,'aegis'))*B.aegis.bossField : 1;
      if(this.resonanceKind==='singularity'&&e.type!==7)e.x+=clamp((a.x+b.x)/2-e.x,-B.singularity.pull,B.singularity.pull)*R.fieldTick;
      e.hp-=(this.damage(a)+this.damage(b))*.5*R.fieldTick*(1+this.card(a,'field')+this.card(b,'field')+[a,b].reduce((sum,p)=>sum+p.relics.reduce((n,id)=>n+(relics[id].field||0),0),0))*plasma*focus*defense*(a.ship==='sol'||b.ship==='sol'?1.5:1)*(e.type===7?1.5:1);
    }
    let speed=(def?.speed || 0)*(field && e.type!==7?(e.type===6?.9:R.linkSlow):1)*(e.chill>0?.78:1);
    e.chill=Math.max(0,e.chill-dt);
    if(e.type===7) {
      const drift=this.theme.drift[Math.max(0,this.bossPhase-1)]*(e.chill>0?B.shatter.bossDrift:1);
      const direction=trig(e.age*(this.bossPhase===2?57:34));
      e.y+=((this.linked?590:275)-e.y)*dt*.65;
      e.x+=(270+direction*(this.linked?drift:Math.max(126,drift))-e.x)*dt*1.4;
      if(this.phase!=='boss') return;
      const phase=e.hp/e.max>.66?1:e.hp/e.max>.33?2:3;
      if(this.bossPhase!==phase) {
        this.bossPhase=phase; this.exposed=0; this.exposureCharge=0; e.volley=0; this.bossBreak=R.bossBreak; this.warning=-1;
        e.next=e.age+R.bossBreak+patterns[this.theme.pattern[phase-1]].tell;
        for(let n=this.count-1;n>=0;n--) if(this.orbs[n].owner<0) this.removeOrb(n);
      }
      this.bossBreak=Math.max(0,this.bossBreak-dt);
      if(this.bossBreak>0) return;
      const pattern=this.theme.pattern[phase-1], spec=patterns[pattern];
      if(this.warning>=0 && e.age>=this.warningUntil) this.warning=-1;
      if(pattern==='wall' && this.warning<0 && e.age>=e.next-spec.tell) {
        this.warning=90+this.random()*360;
        this.warningUntil=e.next+dt;
      }
      if(e.age>=e.next) {
        const speed=spec.speed*this.theme.bulletSpeed*this.challenge.bulletSpeed;
        this.bossAttack(e,pattern,speed);
        if(this.challenge.bossExtra&&phase>1&&e.volley%combat.volleyVariation===0&&pattern!=='wall') {
          this.aimed(e,3,speed*.82,17);
        }
        e.next=e.age+spec.every;
        this.warning=-1;
      }
      return;
    }
    const type=e.type===6?'elite':def.behavior;
    if(type==='pod'||type==='elite') speed=e.y<180?speed:0;
    if(type==='ram') {
      if(before===0) e.x=this.pilots[e.id%2].x;
      if(e.age<combat.ramTell) {e.y=96;speed=0;}
    }
    if(type==='zig'||type==='wing') e.x=clamp(e.anchor+trig(e.age*(type==='zig'?155:86))*92,28,512);
    e.y+=speed*dt;
    const cadence=e.type===6?1.55:def.fire;
    if(cadence && e.age>=e.next && e.y>16 && e.y<R.flightY-65) {
      this.aimed(e,e.type===6?5:def.count,170*this.theme.bulletSpeed*this.challenge.bulletSpeed);
      e.next=e.age+cadence;
    }
    for(let i=0;i<2;i++) if(Math.hypot(this.pilots[i].x-e.x,R.flightY-e.y)<def.radius+R.hitRadius) this.hurt(i,type==='ram'?2:1);
  }

  private kills() {
    for(let i=this.enemies.length-1;i>=0;i--) {
      const e=this.enemies[i];
      if(e.hp<=0) {
        const p=this.pilots[e.last], def=enemies[e.type>=6?0:e.type];
        this.chain=Math.min(R.comboMax,this.chain+1); this.combo=R.comboTime;
        p.kills++; p.nova=Math.min(R.charge,p.nova+(e.type===6?8:1));
        if(this.linked) this.resonance=Math.min(R.charge,this.resonance+1);
        this.score+=Math.round((e.type===7?15000:e.type===6?2400:def.points)*(1+R.comboGain*this.chain));
        if(e.type===7) {
          this.dust+=Math.round(this.theme.reward*this.challenge.dust*(this.drone?1:1.15)); if(!this.stageHit) this.score+=R.perfectPoints;
          this.count=0; this.enemies=[]; this.drops=[];
          if((this.mode==='voyage'&&this.stage===5)||(this.mode==='daily'&&this.stage===1)) {this.phase='result'; this.result='won';}
          else {this.phase='gateway';this.left=20;this.relicOffers=this.pilots.map(p=>this.offerRelics(p)); this.choices=[-1,-1]; this.eventChoices=[-1,-1]; this.event=this.stage>=2 && this.stage<=4 && this.random()<.2 ? 1+Math.floor(this.random()*3):0;}
          return;
        }
        if(this.drops.length<R.maxDrops) {
          this.drops.push({x:e.x,y:e.y,kind:0,value:Math.max(1,Math.round((e.type===6?45:def.xp)*(e.reinforcement?combat.heatReinforcementXp:1)))});
          if(e.type===6 || this.random()<R.shardsChance) this.drops.push({x:e.x,y:e.y,kind:1,value:e.type===6?(e.reinforcement?20:40):6});
          if(this.random()<(e.type===6?.5:R.repairChance)*this.challenge.repair) this.drops.push({x:e.x,y:e.y,kind:2,value:1});
          if(e.type===6&&!e.reinforcement) this.drops.push({x:e.x,y:e.y,kind:3,value:25});
        }
        if(e.type===5) for(let a=0;a<8;a++) this.circle(e.x,e.y,a*45,145);
      }
      if(e.hp<=0 || e.y>R.height+50) this.enemies.splice(i,1);
    }
  }
  private collision() {
    for(let n=this.count-1;n>=0;n--) {
      if(n>=this.count) continue;
      const b=this.orbs[n];
      const slowed=b.owner<0&&this.resonanceKind==='steam'&&b.y>=R.flightY-this.fieldHeight&&
        b.y<=R.flightY&&b.x>=Math.min(this.pilots[0].x,this.pilots[1].x)-B.steam.padding&&
        b.x<=Math.max(this.pilots[0].x,this.pilots[1].x)+B.steam.padding;
      const speed=slowed?B.steam.speed:1;
      b.x+=b.vx*dt*speed; b.y+=b.vy*dt*speed;
      if(b.y<-80||b.y>R.height+80||b.x<-80||b.x>R.width+80) {this.removeOrb(n);continue;}
      if(b.owner>=0) {
        if(b.kind===3) {
          let target:Foe|undefined, distance=260;
          for(const e of this.enemies) {
            const gap=Math.hypot(b.x-e.x,b.y-e.y);
            if(e.y<b.y && gap<distance) {distance=gap;target=e;}
          }
          if(target) b.vx+=(clamp((target.x-b.x)*8,-480,480)-b.vx)*.22;
        }
        for(const e of this.enemies) {
          if(e.hp<=0||e.id===b.last|| (e.type===7 && (this.phase!=='boss'||this.bossBreak>0))) continue;
          const radius=e.type===7?98:e.type===6?44:enemies[e.type].radius;
          if(Math.hypot(e.x-b.x,e.y-b.y)>radius) continue;
          const p=this.pilots[b.owner];
          if(e.shell>0) e.shell=Math.max(0,e.shell-b.power);
          else {
            const boss=e.type===7;
            const core=boss&&Math.abs(e.x-b.x)<this.coreRadius(e,p);
            const shatter=e.chill>0&&this.hasEvolution(p,'shatter')?B.shatter.bossBonus:0;
            const multiplier=core?1+shatter+p.relics.reduce((n,id)=>n+(relics[id].core||0),0):
              boss?(this.exposed>0?B.boss.wingMultiplier:combat.wingDamage):1;
            e.hp-=b.power*multiplier;
          }
          e.last=b.owner;
          if(this.resonanceKind==='steam'&&e.shock===0&&e.shell<=0&&
            ((p.cards.fire&&e.chill>0&&e.chillFrom===1-b.owner)||(p.cards.frost&&e.burn>0&&e.burnFrom===1-b.owner))) {
            e.hp-=(this.damage(this.pilots[0])+this.damage(this.pilots[1]))*.5*B.steam.shockPower;
            e.shock=B.steam.shockCooldown;this.shocks++;
            for(const pilot of this.pilots) if(pilot.shield>0)
              pilot.shield=Math.max(dt,pilot.shield-B.steam.shieldCredit);
          }
          if(p.cards.fire) {e.burn=3;e.burnFrom=b.owner;e.burnRate=this.damage(p)*this.card(p,'fire');}
          if(e.chill>0&&e.shatter===0&&this.hasEvolution(p,'shatter')
            && (b.critical||this.random()<B.shatter.criticalBonus)) {
            e.shatter=e.type===7?B.shatter.bossInterval:B.shatter.interval;
            if(e.type===7&&this.warning<0)e.next+=B.shatter.bossDelay;
            e.hp-=b.power*B.shatter.power;
            for(const nearby of this.enemies) if(nearby!==e&&nearby.type!==7&&nearby.hp>0
              &&Math.hypot(e.x-nearby.x,e.y-nearby.y)<=B.shatter.radius) {
              nearby.hp-=b.power*B.shatter.power;nearby.last=b.owner;
            }
          }
          if(p.cards.frost) {e.chill=1.25;e.chillFrom=b.owner;}
          if(e.type!==7 && p.cards.gravity) {
            for(const next of this.enemies) if(next!==e && next.type!==7 && Math.hypot(next.x-e.x,next.y-e.y)<70) next.anchor+=clamp(e.x-next.x,-this.card(p,'gravity'),this.card(p,'gravity'));
          }
          if(p.cards.volt) {
            let jumps=p.cards.volt, chilled=this.resonanceKind==='circuit'&&e.chill>0?B.circuit.extraJumps:0;
            for(const next of this.enemies) if((jumps||chilled&&next.chill>0) && next!==e && next.hp>0 && next.type!==7 && Math.hypot(next.x-e.x,next.y-e.y)<112) {
              next.hp-=b.power*.5; next.last=b.owner;if(jumps)jumps--;else chilled--;
            }
          }
          if(b.pierce<=0) {this.removeOrb(n);break;}
          b.pierce--; b.last=e.id;
        }
      } else for(let i=0;i<2;i++) {
        const p=this.pilots[i];
        if(!p.hull) continue;
        const range=Math.hypot(p.x-b.x,R.flightY-b.y);
        if(range<R.hitRadius+5 && p.inv<=0) {this.hurt(i,b.power);break;}
        if(range<R.grazeRadius*(p.ship==='vesper'?1.3:1) && !(b.grazed&(1<<i))) {
          b.grazed|=1<<i; p.grazes++; p.over+=R.overdriveGain;
          p.nova=Math.min(R.charge,p.nova+.5);
          this.score+=Math.round(R.grazePoints*(1+R.comboGain*this.chain)*(p.drive?2:1));
          if(p.over>=R.charge) {p.over=0;p.drive=R.overdriveTime;}
        }
      }
    }
  }
  private pickups() {
    for(let i=this.drops.length-1;i>=0;i--) {
      const d=this.drops[i], [a,b]=this.pilots;
      if(this.resonanceKind==='singularity'&&d.y>=R.flightY-this.fieldHeight&&d.y<=R.flightY
        && (d.x-a.x)*(d.x-b.x)<=0) d.x+=clamp((a.x+b.x)/2-d.x,-B.singularity.pull,B.singularity.pull)*dt;
      const p= !b.hull || (a.hull && Math.abs(a.x-d.x)<=Math.abs(b.x-d.x))?a:b;
      const gap=Math.hypot(p.x-d.x,R.flightY-d.y);
      if(p.hull && gap<19) {
        if(d.kind===0) this.awardXP(d.value);
        if(d.kind===1) this.shards+=Math.round(d.value*(this.route?combat.voidShards:1));
        if(d.kind===2) p.hull=Math.min(p.max,p.hull+1);
        if(d.kind===3) p.nova=Math.min(R.charge,p.nova+d.value);
        this.drops.splice(i,1);
      } else if(p.hull && gap<R.magnet*(1+this.card(p,'magnet'))) {
        d.x+=(p.x-d.x)*dt*R.gemSeek/gap; d.y+=(R.flightY-d.y)*dt*R.gemSeek/gap;
      } else {
        d.y+=R.gemFall*dt; if(d.y>R.height) this.drops.splice(i,1);
      }
    }
  }

  private rescue() {
    for(const p of this.pilots) if(!p.hull && this.beacon>0) {
      this.beacon--; p.hull=R.reviveHull; p.inv=R.reviveImmune; p.wreck=0; p.revive=0;
    }
  }

  step(inputs: readonly Input[]) {
    if(this.phase==='result') return;
    if(this.paused) {
      if(this.pauseTime>0) {
        this.pauseTime-=dt;
        if(this.pauseTime<=0) this.paused=false;
      }
      return;
    }
    this.tick++;
    this.flash=Math.max(0,this.flash-dt);
    if(this.phase==='gateway') {
      this.left-=dt;
      if(this.left>0) return;
      for(let i=0;i<2;i++) if(this.choices[i]<0) this.gateway(i,1,0,false);
      this.route=this.choices[0]===this.choices[1]?this.choices[0]:Number(this.random()<.5);
      if(this.choices[0]!==this.choices[1]) this.shards+=20;
      if(this.event===1) { this.route=1; this.dust+=20; }
      if(this.event===2) this.shards+=40;
      if(this.event===3) {
        for(const [i,p] of this.pilots.entries()) {
          if(this.eventChoices[i]===1) {p.pending++;if(p.pending===1)this.makeOffer(p);}
          else p.hull=p.max;
        }
      }
      this.stage++; this.time=0; this.wave=0; this.act=1; this.stageHit=false;
      this.bossPhase=0; this.warning=-1; this.phase='act'; this.rescue();
      return;
    }
    if(this.phase==='countdown') {
      this.left-=dt;
      if(this.left<=0) this.phase='act';
      return;
    }
    const drafting=this.draft>0;
    const elapsed=dt;
    this.draft=Math.max(0,this.draft-dt);
    if(drafting && this.draft===0) {
      for(const [i,p] of this.pilots.entries()) while(p.pending>=3 && p.offer[0]) this.pick(i,p.offer.find(id=>p.cards[id])||p.offer[0]);
    }
    if (this.draft===0 && this.phase!=='lull' && this.pilots.some(p=>p.pending>=3)) this.draft=10;
    if(drafting) {
      for(let i=0;i<2;i++) {
        this.draftSkills[i].dash ||= !!inputs[i]?.dash;
        this.draftSkills[i].burst ||= !!inputs[i]?.burst;
      }
      this.draftFraction+=.15;
      if(this.draftFraction<1&&this.draft>0)return;
      this.draftFraction=Math.max(0,this.draftFraction-1);
      inputs=this.draftSkills.map((skills,i)=>({...inputs[i],axis:inputs[i]?.axis??0,dash:skills.dash,burst:skills.burst}));
      this.draftSkills.forEach(skills=>{skills.dash=false;skills.burst=false;});
    }
    this.time+=elapsed; this.campaignTime+=elapsed; this.combatTime+=dt;
    const lull=R.act+this.challenge.lull, act2=lull+R.act, arrival=act2+this.challenge.lull;
    const prevPhase=this.phase;
    if(this.time<R.act) {this.phase='act';this.left=R.act-this.time;}
    else if(this.time<lull) {this.phase='lull';this.left=lull-this.time;}
    else if(this.time<act2) {
      if(this.act===1) {this.act=2;this.rescue();}
      this.phase='act'; this.left=act2-this.time;
    } else if(this.time<arrival) {this.phase='lull'; this.left=arrival-this.time;}
    else {
      if(!this.boss) {this.enemies=[];this.count=0;this.spawn(7,270);this.rescue();}
      this.phase=this.time<arrival+R.intro?'arrival':'boss'; this.left=arrival+R.intro-this.time;
    }
    if(this.phase==='lull'&&prevPhase!=='lull') {
      this.enemies=[];
      for(let n=this.count-1;n>=0;n--) if(this.orbs[n].owner<0)this.removeOrb(n);
    }
    const stageWaves=timelines[(this.stage-1)%timelines.length];
    while(this.wave<stageWaves.length && stageWaves[this.wave].at<=this.time) {
      const w=stageWaves[this.wave++];
      const x=w.formation==='line'?120+300*w.i/Math.max(1,w.count-1):
        w.formation==='vee'?270+(w.i-(w.count-1)/2)*48:
        w.formation==='edges'?(w.i%2===0?140:400):50+this.random()*440;
      const type=w.type;
      this.spawn(type,x);
      if(type===6) {
        if(this.route) this.spawn(type,400);
        if(this.challenge.extraElites) this.spawn(type,140,true);
      } else if(this.challenge.extraSpawns && this.wave%7===0) {
        this.spawn(type,R.width-x,true);
      }
    }
    if(this.phase==='lull' && this.left<=dt*1.5) for (const [i,p] of this.pilots.entries()) while(p.offer[0]) this.pick(i,p.offer.find(id=>p.cards[id])||p.offer[0]);
    const [a,b]=this.pilots;
    this.linked=!!(a.hull||a.wreck>0)&&!!(b.hull||b.wreck>0)&&Math.abs(a.x-b.x)<=this.linkRange();
    this.elements[0]=primaryElement(a.cards,a.pairPlan);
    this.elements[1]=this.drone&&this.elements[0]?complement[this.elements[0]]:primaryElement(b.cards,b.pairPlan);
    this.resonanceKind=this.linked&&a.hull&&b.hull?resonanceFor(this.elements[0],this.elements[1]):undefined;
    this.anchorLink=!!(this.linked&&a.hull&&b.hull&&((a.cards.range||0)>=B.anchor.range&&(b.cards.field||0)>=B.anchor.field||
         (b.cards.range||0)>=B.anchor.range&&(a.cards.field||0)>=B.anchor.field));
    this.fieldHeight=this.anchorLink?B.anchor.height:R.linkHeight;
    this.exposed=Math.max(0,this.exposed-dt);
    this.exposureCooldown=Math.max(0,this.exposureCooldown-dt);
    const boss=this.phase==='boss'&&this.boss;
    if(!this.drone&&boss&&this.linked&&a.hull&&b.hull&&this.bossBreak<=0&&this.exposureCooldown===0&&
      Math.abs(a.x-b.x)>=B.boss.width&&(a.x-boss.x)*(b.x-boss.x)<0) {
      this.exposureCharge+=dt;
      if(this.exposureCharge>=B.boss.hold) {
        this.exposed=B.boss.activate;this.exposureCooldown=B.boss.cooldown;this.openings++;this.exposureCharge=0;
      }
    } else this.exposureCharge=0;
    if(this.linked && a.hull && b.hull) {
      this.linkTime+=dt;this.resonance=Math.min(R.charge,this.resonance+dt*R.resonance*(1+(a.relics.reduce((n,id)=>n+(relics[id].linkCharge||0),0)+b.relics.reduce((n,id)=>n+(relics[id].linkCharge||0),0))*.5));
      this.score+=dt*R.linkPoints;
    }
    if(this.duet>=0) {
      if(!this.duetReady)this.duetLeft=0;
      this.duetLeft-=dt;
      if(this.duetLeft<=0) {if(this.pilots[this.duet].hull>0)this.burst(this.duet,false);this.duet=-1;}
    }
    this.combo-=dt;
    if(this.combo<=0) {this.chain=Math.floor(this.chain/2);this.combo=R.comboTime;}
    const first=inputs[0]||{axis:0}, second=this.drone?this.localDrone():inputs[1]||{axis:0};
    this.move(0,first);
    this.move(1,second);
    this.resolveBursts([first,second]);
    this.field-=dt;
    for(const e of this.enemies) this.updateEnemy(e);
    if(this.field<=0) this.field=R.fieldTick;
    this.collision();
    this.kills();
    this.pickups();
    if((!a.hull&&!b.hull) || (!this.beacon && this.pilots.some(p=>!p.hull&&p.wreck<=0))) {
      if(this.result!=='won') {this.phase='result'; this.result='lost';}
    }
  }

  checkpoint():Checkpoint {
    return {
      version:1,id:this.id,seed:this.seed,rng:this.rng,mode:this.mode,heat:this.heat,stage:this.stage,
      score:this.score,level:this.level,xp:this.xp,resonance:this.resonance,beacon:this.beacon,shards:this.shards,
      dust:this.dust,route:this.route,linkTime:this.linkTime,combatTime:this.combatTime,campaignTime:this.campaignTime,
      pilots:structuredClone(this.pilots),
    };
  }

  static restore(save:Checkpoint) {
    const game=new Flight(save.seed,save.mode,save.heat,true,[save.pilots[0].ship,save.pilots[1].ship]);
    game.id=save.id;game.rng=save.rng;game.stage=save.stage;game.score=save.score;
    game.level=save.level;game.xp=save.xp;game.resonance=save.resonance;game.beacon=save.beacon;
    game.shards=save.shards;game.dust=save.dust;game.route=save.route;game.pilots=structuredClone(save.pilots);
    for(const p of game.pilots) if(p.reserve===undefined&&game.hasEvolution(p,'aegis'))p.reserve=true;
    game.linkTime=save.linkTime;game.combatTime=save.combatTime;game.campaignTime=save.campaignTime;
    return game;
  }

  frame():Frame {
    const boss=this.boss;
    return {
      id:this.id,t:this.tick,stage:this.stage,act:this.act,phase:this.phase,left:q(Math.max(0,this.left)),
      score:Math.floor(this.score*this.challenge.score),chain:this.chain,level:this.level,xp:this.xp,goal:this.goal,
      resonance:Math.floor(this.resonance),linked:this.linked,link:Math.round(100*this.linkTime/Math.max(dt,this.combatTime)),
      beacon:this.beacon,shards:Math.floor(this.shards),heat:this.heat,mode:this.mode,result:this.result,paused:this.paused,
      pilots:this.pilots.map(p=>({...p,x:q(p.x),cards:{...p.cards},relics:[...p.relics],offer:[...p.offer],excluded:[...p.excluded]})),
      enemies:this.enemies.map(e=>[e.id,e.type,q(e.x),q(e.y),Math.max(0,Math.ceil(100*e.hp/e.max)),e.type===4&&e.age<combat.ramTell?1:0,e.shell>0?1:0,Math.round(e.shock*100)]),
      bullets:this.orbs.slice(0,this.count).map(b=>[Math.round(b.x),Math.round(b.y),b.owner,b.kind]),
      drops:this.drops.map(d=>[Math.round(d.x),Math.round(d.y),d.kind]),
      boss:boss?Math.max(0,Math.ceil(100*boss.hp/boss.max)):0,bossCore:boss?this.coreRadius(boss):this.theme.core,bossPhase:this.bossPhase,warning:q(this.warning),
      duetReady:this.duetReady,duet:this.duet,duetLeft:q(Math.max(0,this.duetLeft)),flash:q(this.flash),signal:this.signal,relicOffers:this.relicOffers.map(offer=>[...offer]),gateway:[...this.choices],draft:q(this.draft),dust:this.dust,stageTime:q(this.campaignTime),
      event:this.event,eventChoices:[...this.eventChoices],
      strategy:{elements:[...this.elements],active:this.resonanceKind,anchor:this.anchorLink,exposed:q(this.exposed),lock:q(this.exposureCharge),cooldown:q(this.exposureCooldown),openings:this.openings,duets:this.duets,shocks:this.shocks},
    };
  }
}
