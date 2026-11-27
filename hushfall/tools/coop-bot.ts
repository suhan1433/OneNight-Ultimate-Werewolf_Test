import { Flight, type Frame, type Input } from '../src/core/sim/flight';
import { rules, type CardId } from '../src/data/flight';

const flags=new Map(process.argv.slice(2).map(arg=>arg.slice(2).split('=') as [string,string]));
const seeds=Number(flags.get('seeds')||24);
const heats=(flags.get('heat')||'0,5').split(',').map(Number);
const voyage=flags.get('mode')==='voyage';
const deliberate=flags.get('plan')==='on';
const adaptive=flags.get('adaptive')==='on';
const matched=flags.get('same-build')==='on';
const pairs={
  elements:[['frost','volt','critical','gravity','power','shield'],['power','fire','volt','rate','spread','armor']],
  escort:[['shield','armor','range','dash','frost','power'],['power','field','spread','rate','volt','fire']],
} satisfies Record<string,[CardId[],CardId[]]>;
const scenarios=(flags.get('pairs')||'elements,escort').split(',') as (keyof typeof pairs)[];
if(!Number.isSafeInteger(seeds)||seeds<1||seeds>1000||scenarios.some(pair=>!Object.hasOwn(pairs,pair))
  ||heats.some(heat=>!Number.isInteger(heat)||heat< -1||heat>10))throw Error('Invalid co-op scenario');
const cadence=9;

function run(seed:number,heat:number,pair:keyof typeof pairs,coordinated:boolean) {
  const game=new Flight(seed,voyage?'voyage':'daily',heat,false);
  const plans=pairs[pair];
  const materials=pair==='elements'?['frost','fire'] as const:['range','field'] as const;
  if((coordinated||matched)&&deliberate) for(let i=0;i<2;i++)game.pick(i,materials[i],'pair');
  let frame=game.frame(), rng=seed, samples=0, linked=0, common=0, arch=0, exposed=0;
  let inputs:Input[]=[{axis:0},{axis:0}], lastGateway=0;
  for(let tick=0;tick<45*60*rules.hz;tick++) {
    if(tick%cadence===0) {
      frame=game.frame();
      if(frame.phase==='result')break;
      if(frame.phase==='gateway'&&lastGateway!==frame.stage) {
        lastGateway=frame.stage;
        for(let seat=0;seat<2;seat++) {
          const relic=frame.pilots[seat].hull<=2?1:frame.relicOffers[seat].find(n=>n!==1)??1;
          game.gateway(seat,relic,0,frame.pilots[seat].hull<frame.pilots[seat].max);
        }
      }
      samples++;
      if(frame.linked)linked++;
      if(frame.strategy.active)common++;
      if(frame.strategy.anchor)arch++;
      if(frame.strategy.exposed>0)exposed++;
      const boss=frame.enemies.find(enemy=>enemy[1]===7);
      const bossX=boss?.[2]??270;
      const dangers=frame.bullets.filter(b=>b[2]<0&&b[1]>680&&b[1]<853);
      const press=frame.duetReady&&(frame.phase==='boss'||dangers.length>=4);
      const needsCover=frame.pilots.some(p=>p.hull<=2||p.wreck>0);
      const flank=coordinated&&frame.strategy.exposed<=0&&(!adaptive||
        (!needsCover&&frame.strategy.cooldown<=.1&&(frame.strategy.active!=='steam'||press)));
      inputs=frame.pilots.map((pilot,seat)=>{
        const mate=frame.pilots[1-seat];
        const target=frame.enemies.filter(enemy=>enemy[3]>0).reduce<number|undefined>((best,enemy)=>{
          const x=enemy[2];
          return best===undefined||Math.abs(x-pilot.x)<Math.abs(best-pilot.x)?x:best;
        },undefined);
        const left=frame.pilots[0].x<=frame.pilots[1].x?0:1;
        const sign=seat===left?-1:1;
        const desired=mate.wreck>0?mate.x:boss?bossX+(flank?sign*(adaptive?49:65):0):target??(210+seat*120);
        let min=Infinity, aim=pilot.x;
        for(let x=30;x<=510;x+=8) {
          const danger=dangers.reduce((n,b)=>n+Math.max(0,38-Math.abs(b[0]-x))*6,0);
          const safe=frame.warning<0?0:Math.max(0,Math.abs(x-frame.warning)-45)*14;
          const spacing=coordinated?Math.max(0,Math.abs(x-mate.x)-235)*1.05:0;
          const cost=danger+safe+spacing+Math.abs(x-desired)*.95+Math.abs(x-pilot.x)*.47;
          if(cost<min){min=cost;aim=x;}
        }
        rng=(Math.imul(rng,1664525)+1013904223)>>>0;
        const burst=coordinated&&(frame.duet===1-seat||press&&seat===0)||
          (!coordinated&&pilot.nova>=100&&(!frame.linked||frame.resonance<100)&&dangers.length>=4);
        return {axis:0,target:rng/4294967296<.05?pilot.x:aim,burst,
          dash:pilot.cd===0&&Math.abs(aim-pilot.x)>100&&dangers.some(b=>Math.abs(b[0]-pilot.x)<16)};
      });
      for(let seat=0;seat<2;seat++) {
        const pilot=frame.pilots[seat];
        if(!pilot.offer.length||!(frame.level===2||frame.phase==='lull'||frame.draft>0))continue;
        const independent:CardId[]=['power','spread','rate','critical','armor','shield','pierce'];
        const plan=coordinated||matched?plans[seat]:independent;
        const material=materials[seat];
        const id=(coordinated||matched)&&deliberate&&(pilot.cards[material]||0)<2&&pilot.offer.includes(material)?material:
          plan.find(card=>pilot.offer.includes(card))??pilot.offer[0];
        game.pick(seat,id);
      }
    } else {
      for(const input of inputs){input.burst=false;input.dash=false;}
    }
    game.step(inputs);
  }
  const [a,b]=frame.pilots, seconds=(n:number)=>(n*cadence/rules.hz).toFixed(1);
  return [seed,heat,pair,coordinated?'team':'independent',frame.result||'timeout',frame.stage,frame.stageTime,
    (100*linked/Math.max(1,samples)).toFixed(1),seconds(common),seconds(arch),seconds(exposed),frame.strategy.openings,frame.strategy.duets,a.saves+b.saves,
    a.hits,b.hits,a.kills,b.kills,frame.strategy.shocks].join(',');
}
console.log('seed,heat,pair,policy,result,stage,seconds,link_pct,synergy_s,arch_s,exposed_s,openings,duets,revives,p1_hits,p2_hits,p1_kills,p2_kills,shocks');
for(const heat of heats)for(const scenario of scenarios)for(const team of [false,true])
  for(let seed=1;seed<=seeds;seed++)console.log(run(seed,heat,scenario,team));
