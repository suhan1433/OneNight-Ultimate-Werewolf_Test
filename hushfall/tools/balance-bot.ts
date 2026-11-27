import { Flight, type Frame, type Input } from '../src/core/sim/flight';
import { branches, evolutionIds, meets, type Branch } from '../src/data/builds';
import { rules, type CardId } from '../src/data/flight';

const presets = {
  newcomer: { reaction:.25, error:.15, danger:4 },
  practiced: { reaction:.15, error:.05, danger:6 },
  expert: { reaction:.09, error:.01, danger:9 },
} as const;
const args=new Map(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=') as [string,string]));
const count=Number(args.get('seeds')||5);
const heatLevels=(args.get('heat')||'-1,0,5,10').split(',').map(Number);
const voyage=args.get('mode')==='voyage';
const policy=(args.get('policy')||'practiced') as keyof typeof presets;
const preset=presets[policy];
const builds=(args.get('build')||'assault,control,escort').split(',') as Branch[];
const priorities:Record<Branch,CardId[]>={
  assault:['power','spread','rate','pierce','fire'],
  control:['frost','critical','volt','gravity','armor','dash'],
  escort:['armor','shield','range','field','dash','motor'],
};
if(builds.some(build=>!Object.hasOwn(branches,build)))throw Error('Use --build=assault,control,escort');
if(!preset||!Number.isSafeInteger(count)||count<1||count>1000||heatLevels.some(n=>!Number.isInteger(n)||n< -1||n>10)) {
  throw Error('Use --seeds=1..1000 --heat=-1,0..10 --policy=newcomer|practiced|expert --mode=voyage|stage1');
}

function play(seed:number,heat:number,build:Branch) {
  const flight=new Flight(seed,voyage?'voyage':'daily',heat,true);
  const interval=Math.round(preset.reaction*rules.hz);
  let rng=seed, target=200, input:Input={axis:0}, frame:Frame=flight.frame();
  let firstEvolution=0, resonanceSamples=0, firstBullet=0, firstUpgrade=0, lastStageAt=0, bossAt=0, stage1Boss=0, peak=0, lastGateway=0;
  const picks:Record<string,number>={};
  for(let tick=0;tick<45*60*rules.hz;tick++) {
    if(tick%interval===0) {
      frame=flight.frame();
      const p=frame.pilots[0], mate=frame.pilots[1];
      if(!firstEvolution&&evolutionIds.some(id=>meets(p.cards,id)))firstEvolution=frame.stageTime;
      if(frame.strategy.active)resonanceSamples++;
      if(frame.stage===1) {
        const hostiles=frame.bullets.filter(b=>b[2]<0).length;
        peak=Math.max(peak,hostiles);
        if(hostiles&&!firstBullet)firstBullet=frame.stageTime;
        if(frame.level>1&&!firstUpgrade)firstUpgrade=frame.stageTime;
      }
      if(frame.phase==='boss'&&!bossAt)bossAt=frame.stageTime;
      if(frame.phase==='gateway'&&frame.stage!==lastGateway) {
        lastGateway=frame.stage;
        if(frame.stage===1)stage1Boss=frame.stageTime-bossAt;
        lastStageAt=frame.stageTime;
        bossAt=0;
        const signature=build==='assault'?3:build==='control'?4:5;
        flight.gateway(0,p.hull<=2?1:frame.relicOffers[0].includes(signature)?signature:frame.relicOffers[0][0],0,p.hull<p.max);
      }
      if(frame.phase==='result') {
        if(!voyage&&frame.result==='won')stage1Boss=frame.stageTime-bossAt;
        break;
      }
      rng=(Math.imul(rng,1664525)+1013904223)>>>0;
      const focus=frame.enemies.find(e=>e[1]===7)??frame.enemies
        .filter(e=>e[3]>0).sort((a,b)=>Math.abs(a[2]-p.x)-Math.abs(b[2]-p.x))[0];
      const enemyX=focus?.[2]??210;
      const desired=mate.wreck>0?mate.x:build==='escort'&&focus?
        enemyX+(enemyX>330?60:-60):enemyX;
      const dangers=frame.bullets.filter(b=>b[2]<0&&b[1]>688&&b[1]<850);
      let least=Infinity;
      for(let x=30;x<=510;x+=12) {
        const danger=dangers.reduce((cost,b)=>cost+Math.max(0,40-Math.abs(b[0]-x))*preset.danger,0);
        const gap=frame.warning<0?0:Math.max(0,Math.abs(x-frame.warning)-48)*12;
        const cost=danger+gap+Math.abs(x-desired)*.78+Math.abs(x-p.x)*.38;
        if(cost<least){least=cost;target=x;}
      }
      if(rng/4294967296<preset.error)target=p.x;
      input={axis:0,target,burst:frame.linked&&frame.resonance>=100,dash:p.cd===0&&Math.abs(target-p.x)>95&&dangers.some(b=>Math.abs(b[0]-p.x)<17)};
      if(p.offer.length&&(frame.level===2||frame.phase==='lull'||frame.draft>0)) {
        const id=priorities[build].find(id=>p.offer.includes(id))||p.offer[0];
        if(p.branch!==build)flight.pick(0,build,'focus');
        flight.pick(0,id);picks[id]=(picks[id]||0)+1;
      }
    } else {
      input.dash=false;input.burst=false;
    }
    flight.step([input]);
  }
  return [seed,heat,policy,build,frame.result||'timeout',frame.stage,frame.stageTime,firstBullet,firstUpgrade,
    stage1Boss.toFixed(1),peak,frame.pilots[0].hits,frame.pilots[0].kills,frame.level,lastStageAt,firstEvolution,(resonanceSamples*interval/rules.hz).toFixed(1),
    Object.entries(picks).map(([id,n])=>id+':'+n).join('|')].join(',');
}
console.log('seed,heat,policy,build,result,stage,seconds,first_enemy_shot,first_upgrade,stage1_boss_seconds,stage1_peak_bullets,hull_hits,kills,level,last_clear,first_evolution,resonance_seconds,picks');
for(const heat of heatLevels)for(const build of builds)for(let seed=1;seed<=count;seed++)console.log(play(seed,heat,build));
