import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Session, type Settings } from './client/session';
import type { Room } from './client/room';
import { award, emptyProfile, exportProfile, importProfile, loadCheckpoint, loadProfile, mergeProfile } from './client/storage';
import type { Checkpoint, Frame } from './core/sim/flight';
import { cards, difficulty, modes, relics, ships, stages, type Mode, type Ship } from './data/flight';
import { branchOf, branches, buildBalance, elementNames, evolutionIds, evolutions, meets, pairMaterials, resonanceFor, resonances, type Branch, type PairMaterial } from './data/builds';
import './style.css';

type View = {frame:Frame|null; room:Room|null; fault:string; online:boolean; rtt:number; direct:boolean; waiting:boolean; notice:string; local:boolean};
const base=import.meta.env.BASE_URL;
const get=(key:string,fallback='')=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const put=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{}};
const invite=()=>location.hash.match(/^#\/join\/([A-Z2-9]{5})$/i)?.[1].toUpperCase()||'';
const roomCode=(s:string)=>s.toUpperCase().replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g,'').slice(0,5);
const modeNames={voyage:['항해','Voyage'],endless:['무한','Endless'],daily:['오늘의 항해','Daily Voyage']};
const phaseNames={countdown:['출격 준비','Launching'],act:['전투 중','Engaged'],lull:['재정비','Regroup'],arrival:['보스 접근','Boss incoming'],boss:['보스전','Boss encounter'],gateway:['관문','Gateway'],result:['항해 기록','Flight log']};
const faultText:Record<string,string[]>={
  unavailable:['방 서버에 연결할 수 없습니다. 다시 시도하세요.','The room server is unavailable. Try again.'],
  missing:['방을 찾을 수 없습니다. 코드를 확인하세요.','Room unavailable. Check the code.'],
  full:['이미 두 명이 입장했거나 출격한 방입니다.','The room is full or in flight.'],
  rate:['요청이 많습니다. 잠시 뒤 다시 시도하세요.','Too many attempts. Try again shortly.'],
  closed:['방 연결이 종료됐습니다.','The room has closed.'],
  name:['조종사 이름을 입력하세요.','Enter a pilot name.'],
  version:['게임 버전이 다릅니다. 새로고침 후 다시 접속하세요.','Version mismatch. Reload to update.'],
  graphics:['이 기기에서는 WebGL을 시작할 수 없습니다.','WebGL could not start on this device.'],
};
const notices:Record<string,string[]>={
  unstable:['연결이 불안정합니다. 파트너 재접속 대기 중','Connection unstable. Waiting for your partner.'],
  drone:['동행 드론이 합류했습니다.','A wing drone has joined.'],
  hostLeft:['호스트 연결이 끊겨 항해를 종료했습니다.','The host disconnected. Flight ended.'],
  pauseRequest:['파트너가 일시정지를 요청했습니다.','Your partner requested a pause.'],
  pauseSent:['호스트에게 일시정지를 요청했습니다.','Pause request sent to the host.'],
};

function App() {
  const [view,setView]=useState<View>({frame:null,room:null,fault:'',online:false,rtt:0,direct:false,waiting:false,notice:'',local:false});
  const [settings,setSettings]=useState<Settings>(()=>{
    const defaults:Settings={lang:0,volume:.35,contrast:false,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches};
    try{return {...defaults,...JSON.parse(get('lt.settings','{}'))};}catch{return defaults;}
  });
  const lang=settings.lang===1?1:0;
  const t=(ko:string,en:string)=>lang===0?ko:en;
  const [menu,setMenu]=useState<'home'|'online'|'solo'|'local'>(()=>invite()?'online':'home');
  const [name,setName]=useState(get('lt.pilot'));
  const [code,setCode]=useState(invite);
  const [mode,setMode]=useState<Mode>('voyage');
  const [heat,setHeat]=useState(0);
  const [showSettings,setShowSettings]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [copied,setCopied]=useState(false);
  const [abandon,setAbandon]=useState(false);
  const [profile,setProfile]=useState(emptyProfile);
  const [checkpoint,setCheckpoint]=useState<Checkpoint|null>(null);
  const [chassis,setChassis]=useState<Ship>('aster');
  const [wing,setWing]=useState<Ship>('aster');
  const [backup,setBackup]=useState('');
  const [backupMessage,setBackupMessage]=useState('');
  const [shop,setShop]=useState(0);
  const [route,setRoute]=useState(0);
  const [eventChoice,setEventChoice]=useState(0);
  const [purchase,setPurchase]=useState(false);
  const [pickIndex,setPickIndex]=useState(0);
  const [hiddenDraft,setHiddenDraft]=useState(false);
  const mount=useRef<HTMLDivElement>(null);
  const settingDialog=useRef<HTMLDialogElement>(null);
  const helpDialog=useRef<HTMLDialogElement>(null);
  const session=useRef<Session>(null);
  if(!session.current) session.current=new Session(change=>setView(previous=>({...previous,...change})));
  const engine=session.current;
  const {room,frame,fault,notice,online,local}=view;
  const flightScreen=!!frame && frame.phase!=='result';
  const index=room?.self||0;
  const stage=frame?stages[(frame.stage-1)%stages.length]:stages[0];
  const me=frame?.pilots[index], other=frame?.pilots[1-index];
  const isHost=!room||room.self===0;
  const selectedMode=room?.mode||mode, selectedHeat=room?.heat??heat;
  const heatEffects=[
    ['기본 적과 탄막','Standard enemies and patterns'],
    ['적 체력 증가','Higher enemy hull'],
    ['탄속 증가','Faster projectiles'],
    ['엘리트 추가','Extra elite'],
    ['수리 드롭 감소','Fewer repair drops'],
    ['보스 변형 탄막','Extra boss volleys'],
    ['적 편대 증가','Larger enemy waves'],
    ['쉴드 충전 지연','Slower shield recharge'],
    ['정비 5초','5-second intermission'],
    ['보스 체력과 탄속 증가','Stronger bosses and faster shots'],
    ['시작 체력 감소 · 보호막 적','Lower starting hull · shielded enemies'],
  ];
  function heatLabel(value:number) {
    if(value<0)return t('고요','Calm');
    if(value===0)return t('표준','Normal');
    return 'Heat '+value;
  }
  const contribution=(p:Frame['pilots'][number])=>p.kills*10 + p.grazes + p.saves*30 + p.hits;
  const mvp=frame&&contribution(frame.pilots[0])!==contribution(frame.pilots[1])
    ? Number(contribution(frame.pilots[1])>contribution(frame.pilots[0])) : -1;

  useEffect(()=>{
    engine.start();engine.resume();
    void loadProfile().then(setProfile);
    const update=()=>{const next=invite();if(next){setCode(next);setMenu('online');}};
    addEventListener('hashchange',update);
    return ()=>{engine.stop();removeEventListener('hashchange',update);};
  },[]);
  useEffect(()=>{engine.settings=settings;document.documentElement.lang=lang===0?'ko':'en';put('lt.settings',JSON.stringify(settings));},[settings]);
  useEffect(()=>{
    if(!flightScreen||!mount.current)return;
    void engine.attach(mount.current);return ()=>engine.detach();
  },[flightScreen]);
  useEffect(()=>{
    if(!frame&&!room) void loadCheckpoint().then(setCheckpoint);
  },[!!frame,!!room]);
  useEffect(()=>{
    if(frame?.phase==='result') {
      const sum=Array.from({length:Math.min(frame.stage,100)},(_,i)=>stages[i%stages.length].reward)
        .reduce((total,reward)=>total+Math.round(reward*difficulty(frame.heat).dust*(room||local?1.15:1))+20,0);
      void award(frame.id,Math.min(frame.dust,sum),frame.score).then(setProfile);
    }
  },[frame?.phase,frame?.id]);
  useEffect(()=>{setShop(0);setRoute(0);setPurchase(false);setEventChoice(0);setPickIndex(0);},[frame?.stage,frame?.phase==='gateway']);
  useEffect(()=>{
    if(showSettings&&!settingDialog.current?.open) settingDialog.current?.showModal();
    if(!showSettings&&settingDialog.current?.open) settingDialog.current?.close();
  },[showSettings]);
  useEffect(()=>{
    if(showHelp&&!helpDialog.current?.open) helpDialog.current?.showModal();
    if(!showHelp&&helpDialog.current?.open) helpDialog.current?.close();
  },[showHelp]);

  function headBack() {
    if(flightScreen) {setAbandon(true);return;}
    engine.leave();setMenu('home');if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  }
  function enter(join:boolean) {
    if(!name.trim() || (join&&code.length!==5))return;
    put('lt.pilot',name.trim());engine.enter(name.trim(),join?code:undefined,chassis);
  }
  async function copyRoom() {
    if(!room)return;
    const url=new URL(location.pathname,location.origin);url.hash='/join/'+room.code;
    try {await navigator.clipboard.writeText(url.href);setCopied(true);setTimeout(()=>setCopied(false),1600);}
    catch {
      const input=document.querySelector<HTMLInputElement>('#invite-url');
      input?.focus();input?.select();
    }
  }
  async function shareRoom() {
    if(!room)return;
    const url=new URL(location.pathname,location.origin);url.hash='/join/'+room.code;
    try {await navigator.share({title:'Lumen Tether',url:url.href});}catch{}
  }
  function config(nextMode:Mode,nextHeat:number) {
    if(nextMode==='daily'&&nextHeat<0)nextHeat=0;
    if(room)engine.configure(nextMode,nextHeat);
    else{setMode(nextMode);setHeat(nextHeat);}
  }
  function fitConfig(readOnly=false) {
    return <div class="config">
      <label>{t('항해 모드','Flight mode')}<select disabled={readOnly} value={room?.mode||mode} onChange={e=>config(e.currentTarget.value as Mode,selectedHeat)}>
        {modes.map(m=><option value={m}>{modeNames[m][lang]}</option>)}</select></label>
      <label>{t('난이도','Difficulty')}<select disabled={readOnly} value={selectedHeat} onChange={e=>config(selectedMode,+e.currentTarget.value)}>
        {selectedMode!=='daily'&&<option value={-1}>{heatLabel(-1)}</option>}
        {Array.from({length:11},(_,i)=><option value={i}>{heatLabel(i)}{i>0?' · '+heatEffects[i][lang]:''}</option>)}</select>
      </label>
      <small class="heat-summary">{selectedHeat<0?t('체력 +2 · 적 약화 · 탄속 −20%','+2 hull · weaker enemies · 20% slower bullets'):selectedHeat>0?t('이전 Heat 효과가 함께 적용됩니다.','Previous Heat modifiers also apply.')+' '+heatEffects[selectedHeat][lang]:t('기본 탄속과 체력으로 도전합니다.','Standard bullet speed and hull.')}</small>
    </div>;
  }
  function chassisSelect(selected:Ship,choose:(value:Ship)=>void, label:string) {
    return <label>{label}
      <select value={selected} onChange={e=>choose(e.currentTarget.value as Ship)}>
        {(Object.keys(ships) as Ship[]).map(id=><option value={id} disabled={profile.dust<ships[id].unlock&&selected!==id}>
          {ships[id].name[lang]}{profile.dust<ships[id].unlock?' · '+ships[id].unlock+' Stardust':''}
        </option>)}
      </select>
    </label>;
  }
  function flightBuild(p:Frame['pilots'][number]) {
    return <ul class="build">
      {evolutionIds.filter(id=>meets(p.cards,id)).map(id=><li class="build-evolved"><strong>{evolutions[id].name[lang]}</strong><small>{evolutions[id].info[lang]}</small></li>)}
      {cards.filter(c=>p.cards[c.id]).map(c=><li>{c.name[lang]} <b>Lv {p.cards[c.id]}</b></li>)}
    </ul>;
  }
  function pairLabel(material:PairMaterial) {
    return material==='range'||material==='field'
      ? cards.find(card=>card.id===material)!.name[lang]
      : elementNames[material][lang];
  }
  function pairPlanner(seat:number) {
    if(!frame||(!room&&!local))return null;
    const pilot=frame.pilots[seat], partner=frame.pilots[1-seat];
    const target=pilot.pairPlan, otherTarget=partner.pairPlan;
    function pairing(material:PairMaterial) {
      if((material==='range'&&otherTarget==='field')||(material==='field'&&otherTarget==='range'))
        return t('랜턴 아치','Lantern Arch');
      const combination=resonanceFor(material==='range'||material==='field'?undefined:material,
        otherTarget==='range'||otherTarget==='field'?undefined:otherTarget);
      return combination?resonances[combination].name[lang]:'';
    }
    const label=target?pairing(target):'';
    return <details class="build-plan pair-plan">
      <summary>{t('협동 재료','Co-op material')}{target?' · '+pairLabel(target)+' '+Math.min(2,pilot.cards[target]||0)+'/2':''}</summary>
      <label>{t('다음 강화에서 우선 제시','Prioritize in the next draft')}
        <select value={target||'none'} onChange={e=>engine.pick(seat,e.currentTarget.value,'pair')}>
          <option value="none">{t('선택 안 함','No preference')}</option>
          {pairMaterials.map(material=><option value={material} disabled={pilot.excluded.includes(material)}>{pairLabel(material)}{pairing(material)&&' · '+pairing(material)}</option>)}
        </select>
      </label>
      <small>{t('파트너','Partner')}{otherTarget?' · '+pairLabel(otherTarget)+' '+Math.min(2,partner.cards[otherTarget]||0)+'/2':' · '+t('재료 선택 전','Choosing a material')}</small>
      {label&&<small class="evolution-tag">{label} · {t('둘 다 Lv 2에서 링크','Link when both reach Lv 2')}</small>}
    </details>;
  }
  function pilotHud(i:number) {
    if(!frame)return null;
    const p=frame.pilots[i];
    const title=room?.seats[i]?.name || (local?(i===0?'P1':'P2'):(i===0?t('내 기체','Your ship'):t('동행 드론','Wing drone')));
    return <section class={i===0?'pilot mint':'pilot peach'} aria-label={title}>
      <span class="mini">{i===0?'01':'02'} / {ships[p.ship].name[1].toUpperCase()}</span><strong>{title}</strong>
      <div class="hull" aria-label={t('체력','Hull')+' '+p.hull+'/'+p.max}>{Array.from({length:p.max},(_,n)=><i class={n<p.hull?'full':''}/>)}</div>
      <small>{p.recharge?t('예비 쉴드 전개 ','Backup shield in ')+Math.ceil(p.recharge)+'s':p.wreck>0?t('구조 가능 ','Rescue window ')+Math.ceil(p.wreck)+'s':p.shield>0?t('쉴드 충전 ','Shield charge ')+Math.ceil(p.shield)+'s':t('쉴드 준비','Shield ready')}</small>
    </section>;
  }
  useEffect(()=>setHiddenDraft(false),[frame?.level,frame?.phase]);
  function draftUi() {
    if(!frame||!me)return null;
    if(frame.phase!=='lull' && !frame.draft && frame.level!==2)
      return me.pending>0?<div class="draft-queued">{t('다음 정비에서 강화','Upgrades at intermission')} · {me.pending}</div>:null;
    if(hiddenDraft&&!frame.draft&&frame.phase!=='lull')return <button class="draft-queued" onClick={()=>setHiddenDraft(false)}>{t('강화 열기','Open upgrades')} · {me.pending}</button>;
    const seat=local?pickIndex:index, p=frame.pilots[seat];
    if(!p.offer.length && !local)return null;
    if(local && !frame.pilots.some(p=>p.offer.length))return null;
    const draftStatus=frame.phase==='lull'?t('정비','Intermission')+' · '+Math.ceil(frame.left)+'s':
      frame.draft?t('슬로 모션','Slow motion')+' · '+Math.ceil(frame.draft)+'s':t('사격은 계속됩니다','Weapons remain active');
    const branch=p.branch;
    const tracking=branch&&evolutionIds.find(id=>
      Object.keys(evolutions[id].requirements).some(card=>branchOf(card as typeof cards[number]['id'])===branch));
    const mateElement=frame.strategy.elements[1-seat];
    const elementHint=mateElement&&(['fire','frost','volt','gravity'] as const)
      .filter(element=>resonanceFor(element,mateElement)).map(element=>elementNames[element][lang]).join(' / ');
    const mateName=room?.seats[1-seat]?.name || (local?'P'+(2-seat):t('드론','Drone'));
    return <section class="overlay draft" aria-label={t('강화 선택','Upgrade selection')}>
      <div class="row"><div><span class="mini">LEVEL {frame.level}</span><h2>{t('비행 강화','Flight upgrade')}</h2><small>{draftStatus}</small></div>
      {local?<div class="row">{[0,1].map(i=><button class={pickIndex===i?'selected':''} onClick={()=>setPickIndex(i)}>P{i+1} · {frame.pilots[i].pending}</button>)}</div>:<small>{t('대기 강화','Queued')} {p.pending}</small>}</div>
      {!branch&&p.offer.length>0&&<small class="opening-choice">{t('첫 카드가 이후 강화의 우선순위를 정합니다.','Your first card sets the priority for later drafts.')}</small>}
      <div class="options">{p.offer.map(id=>{
        const c=cards.find(item=>item.id===id)!;
        const evolution=evolutionIds.find(evo=>Object.hasOwn(evolutions[evo].requirements,id)&&!meets(p.cards,evo)
          &&meets({...p.cards,[id]:(p.cards[id]||0)+1},evo));
        return <div class="option">
      <button class={evolution?'evolution-pick':''} onClick={()=>engine.pick(seat,id)}>
        <span class="mini">{branches[branchOf(id)].name[lang]} · Lv {(p.cards[id]||0)+1}</span>
        <strong>{c.name[lang]}</strong><small>{c.effect[lang]}</small>
        {evolution&&<small class="evolution-tag">{t('진화','Evolves')} · {evolutions[evolution].name[lang]}</small>}
      </button>
      {p.bans>0&&<button class="ban" onClick={()=>engine.pick(local?pickIndex:index,id,'ban')}>{t('제외','Ban')}</button>}</div>;})}</div>
      {branch&&p.offer.length>0&&<details class="build-plan">
        <summary>{t('다음 강화 우선순위','Next draft priority')} · {branches[branch].name[lang]}</summary>
        <div class="build-priorities" role="group" aria-label={t('강화 우선순위','Draft priority')}>
          {(Object.keys(branches) as Branch[]).map(choice=><button aria-pressed={branch===choice} class={branch===choice?'selected':''} onClick={()=>engine.pick(seat,choice,'focus')}>{branches[choice].name[lang]}</button>)}
        </div>
        {tracking&&<small><strong>{evolutions[tracking].name[lang]}</strong> · {meets(p.cards,tracking)?evolutions[tracking].info[lang]:
          Object.entries(evolutions[tracking].requirements).map(([id,goal])=>{
            const card=cards.find(c=>c.id===id)!;
            return card.name[lang]+' '+(p.cards[card.id]||0)+'/'+goal;
          }).join(' · ')}</small>}
        {mateElement&&<small>{mateName} · {elementNames[mateElement][lang]}{elementHint&&' · '+t('공명 조합 ','Pairs with ')+elementHint}</small>}
      </details>}
      {pairPlanner(seat)}
      <div class="draft-actions">{frame.phase!=='lull'&&!frame.draft&&<button class="text" onClick={()=>setHiddenDraft(true)}>{t('잠시 접기','Close for now')}</button>}{p.offer[0]&&p.rerolls>0&&<button class="text" onClick={()=>engine.pick(local?pickIndex:index,p.offer[0],'reroll')}>{t('다시 뽑기','Reroll')} · {p.rerolls}</button>}</div>
    </section>;
  }
  function gatewayUi() {
    if(frame?.phase!=='gateway')return null;
    const seat=local?pickIndex:index;
    const offers=frame.relicOffers[seat], selectedRelic=offers.includes(shop)?shop:offers[0];
    return <section class="overlay gateway">
      <div class="row"><div><span class="mini">{t('스테이지 완료','SECTOR CLEAR')} · {Math.ceil(frame.left)}s</span><h2>{t('성간 관문','Stellar Gateway')}</h2></div><span>{frame.shards} ◇</span></div>
      {local&&<div class="row">{[0,1].map(i=><button class={pickIndex===i?'selected':''} onClick={()=>setPickIndex(i)}>P{i+1}</button>)}</div>}
      {frame.gateway[seat]<0 ? <>
        <div class="options">{offers.map(id=><button class={id===selectedRelic?'selected':''} onClick={()=>setShop(id)}><strong>{relics[id].name[lang]}</strong><small>{relics[id].effect[lang]}</small></button>)}</div>
        <div class="row"><button class={route===0?'selected':''} onClick={()=>setRoute(0)}>{t('고요의 길','Calm Route')}</button><button class={route===1?'selected':''} onClick={()=>setRoute(1)}>{t('공허의 길','Void Route')}</button></div>
        <small>{route===0?t('다음 구역 기본 편대와 보상','Standard waves and rewards in the next sector'):
          t('다음 구역 적 체력 +15% · 엘리트 추가 · 샤드 +50%','Next sector: +15% enemy hull · extra elite · +50% shards')}</small>
        {!!frame.event&&<label class="trade">{frame.event===1?t('공허의 문 · 공허 경로 선택','Void Gate · Void Route'):frame.event===2?t('난파선 · 샤드 40 획득','Wreckage · +40 shards'):<select value={eventChoice} onChange={e=>setEventChoice(+e.currentTarget.value)}><option value="0">{t('수호 샘 · 완전 수리','Guardian Spring · Repair')}</option><option value="1">{t('수호 샘 · 추가 강화','Guardian Spring · Upgrade')}</option></select>}</label>}
        <label class="trade"><input type="checkbox" disabled={frame.shards<30||frame.pilots[seat].hull===frame.pilots[seat].max} checked={purchase} onChange={e=>setPurchase(e.currentTarget.checked)}/>{t('수리 +1 · 30 샤드','Repair +1 · 30 shards')}</label>
        <button class="primary" onClick={()=>{engine.gateway(seat,selectedRelic,route,purchase,eventChoice);if(local&&frame.gateway[1-seat]<0)setPickIndex(1-seat);}}>{t('선택 확정','Confirm choice')}</button>
      </>:<p>{t('파트너 선택을 기다리는 중','Waiting for your partner')}</p>}
    </section>;
  }

  return <div class={flightScreen?'root flying':'root'}>
    <header class="topbar">
      <a class="mark" href="/" aria-label={t('게임 선택기','Game collection')}><img src={base+'lumen.svg'} alt=""/><span>LUMEN <b>TETHER</b></span></a>
      <div class="top-actions">
        {room&&<span class={'connection '+(online?'live':'')}><i/>{online?(view.direct?'P2P':'RELAY')+' · '+view.rtt+' ms':t('재연결 중','Reconnecting')}</span>}
        <button class="text" onClick={()=>setShowHelp(true)}>{t('조작법','Controls')}</button>
        <button class="text" onClick={()=>setShowSettings(true)}>{t('설정','Settings')}</button>
      </div>
    </header>
    {!frame && !room && <main class="landing">
      <div class="briefing">
        <span class="kicker"><i/>{t('2인 협동 종스크롤 슈터','TWO-PILOT CO-OP SHOOTER')}</span>
        <h1>LUMEN<br/><em>TETHER</em></h1>
        <p class="intro">{t('빛의 끈으로 이어진 두 조종사.','Two pilots, tethered by light.')}<br/>{t('꺼져가는 별자리를 지키며 공허를 돌파하세요.','Hold the line as the constellations fade.')}</p>
        {menu==='home'?<div class="menu">
          <button class="primary" onClick={()=>setMenu('online')}>{t('온라인 2인','Online co-op')}</button>
          {checkpoint&&<button onClick={()=>engine.restore(checkpoint)}>{t('솔로 이어하기','Resume solo')} · SECTOR {checkpoint.stage}</button>}
          <div class="row"><button onClick={()=>setMenu('solo')}>{t('솔로 비행','Solo flight')}</button><button onClick={()=>setMenu('local')}>{t('로컬 2인','Local co-op')}</button></div>
        </div>:<div class="menu nested">
          <div class="row"><h2>{menu==='online'?t('온라인 2인','Online co-op'):menu==='local'?t('로컬 2인','Local co-op'):t('솔로 비행','Solo flight')}</h2><button class="text" onClick={headBack}>{t('뒤로','Back')}</button></div>
          {menu==='online'?<>
            <label>{t('조종사 이름','Pilot name')}<input value={name} maxLength={18} autoComplete="nickname" onInput={e=>setName(e.currentTarget.value)}/></label>
            {chassisSelect(chassis,setChassis,t('기체','Ship'))}
            <button class="primary" disabled={!name.trim()||view.waiting} onClick={()=>enter(false)}>{t('방 만들기','Create room')}</button>
            <form class="join" onSubmit={e=>{e.preventDefault();enter(true);}}>
              <label>{t('방 코드','Room code')}<input value={code} maxLength={5} onInput={e=>setCode(roomCode(e.currentTarget.value))} placeholder="ABCDE" autoCapitalize="characters" spellcheck={false}/></label>
              <button disabled={!name.trim()||code.length!==5||view.waiting}>{t('참가','Join room')}</button>
            </form>
            {view.waiting&&<p role="status">{t('서버에 연결 중…','Connecting…')}</p>}
          </>:<>
            {fitConfig()}
            <div class="config">{chassisSelect(chassis,setChassis,menu==='local'?'P1':t('기체','Ship'))}{menu==='local'&&chassisSelect(wing,setWing,'P2')}</div>
            <button class="primary" onClick={()=>engine.play(mode,heat,menu==='local',[chassis,wing])}>{t('출격','Launch')}</button>
          </>}
        </div>}
        {!!fault&&<p role="alert" class="fault">{faultText[fault]?.[lang]||fault}</p>}
      </div>
      <figure class="hero">
        <img src={base+'nebula.svg'} alt=""/>
        <figcaption><span><i/> {stages[0].name[lang]}</span><span>ASTER / 01 &amp; 02</span></figcaption>
      </figure>
      <footer class="landing-footer"><a href="/">{t('게임 선택기로','Game collection')}</a><span>{t('최고 점수','BEST SCORE')} <strong>{profile.best.toLocaleString()}</strong> · <strong>{profile.dust.toLocaleString()} ◇</strong></span></footer>
    </main>}
    {room && !frame && room.phase==='lobby'&&<main class="lobby">
      <div class="lobby-head"><span class="kicker"><i/>{t('온라인 2인','ONLINE CO-OP')}</span><h1>{t('비행 대기실','Flight lobby')}</h1><p>{t('초대 링크를 공유하고 두 조종사가 준비되면 출격하세요.','Share the invitation and launch when both pilots are ready.')}</p></div>
      <div class="invite"><div><label for="invite-url">{t('방 코드','Room code')}</label><strong>{room.code}</strong></div>
        <input id="invite-url" aria-label={t('초대 링크','Invite link')} readonly value={location.origin+location.pathname+'#/join/'+room.code} onFocus={e=>e.currentTarget.select()}/>
        <button onClick={copyRoom}>{copied?t('복사 완료','Copied'):t('초대 링크 복사','Copy invite')}</button>{typeof navigator.share==='function'&&<button onClick={shareRoom}>{t('공유','Share')}</button>}
      </div>
      <div class="seats">{room.seats.map((seat,i)=><div class={'seat '+(i?'peach':'mint')}><span class="ship">◇</span><div><span class="mini">{ships[seat?.ship||'aster'].name[1].toUpperCase()} / 0{i+1}</span><strong>{seat?.name||t('파트너 대기 중','Waiting for pilot')}</strong></div><span class="seat-status">{seat?.online?(seat.ready?t('준비 완료','Ready'):t('준비 중','Standing by')):seat?t('재연결','Reconnecting'):'···'}</span></div>)}</div>
      {fitConfig(!isHost)}
      <div class="lobby-ship">{chassisSelect(room.seats[index]?.ship||'aster',ship=>engine.ship(ship),t('내 기체','Your ship'))}</div>
      <div class="row lobby-actions"><button onClick={headBack}>{t('방 나가기','Leave room')}</button>
        {isHost?<button class="primary" disabled={!online||!room.seats[1]?.ready||!room.seats[1]?.online} onClick={()=>engine.launch()}>{t('출격','Launch')}</button>:<button class="primary" disabled={!online} onClick={()=>engine.ready(!room.seats[1]?.ready)}>{room.seats[1]?.ready?t('준비 취소','Cancel ready'):t('준비 완료','Ready up')}</button>}</div>
    </main>}
    {room&&!frame&&room.phase==='run'&&<main class="lobby"><p role="status">{t('전투 상태를 동기화하는 중…','Synchronizing flight…')}</p><button onClick={headBack}>{t('방 나가기','Leave room')}</button></main>}
    {flightScreen&&frame&&me&&other&&<main class="battle">
      <aside class="side"><span class="mini">FLIGHT DECK</span><h2>{stage.name[lang]}</h2>{pilotHud(0)}{pilotHud(1)}
        <section class="side-link"><strong>{frame.linked?t('테더 연결','Tether linked'):t('테더 단절','Tether out of range')}</strong><meter max="100" value={frame.resonance}/><span>{t('공명','Resonance')} {frame.resonance}%</span></section>
      </aside>
      <section class="playfield" aria-label={t('전투 화면','Flight field')}>
        <div class="canvas" ref={mount} onPointerDown={e=>engine.pointerDown(e)} onPointerMove={e=>engine.pointerMove(e)} onPointerUp={e=>engine.pointerEnd(e)} onPointerCancel={e=>engine.pointerEnd(e)} onLostPointerCapture={e=>engine.pointerEnd(e)}/>
        <div class="flight-top"><div class="row"><span class="mini">SECTOR {String(frame.stage).padStart(2,'0')} / {phaseNames[frame.phase][lang]}</span><button class="icon" onClick={()=>engine.pause()} aria-label={t('일시정지','Pause')}>Ⅱ</button></div>
          <div class="dashline"><strong>{frame.score.toLocaleString()}</strong><small>×{(1+.04*frame.chain).toFixed(2)}</small><span>{frame.phase==='boss'?'P'+frame.bossPhase:('ACT '+frame.act)} {frame.left>0&&frame.phase!=='countdown'?Math.ceil(frame.left)+'s':''}</span></div>
          {frame.boss>0&&<div class="bossbar"><span>{stage.boss[lang]}</span><progress max="100" value={frame.boss}/></div>}
          <div class="mobile-pilots">{pilotHud(index)}{pilotHud(1-index)}</div>
          <div class="mobile-link"><span>{frame.linked?t('테더 연결','Tether linked'):t('테더 단절','Out of range')}</span><meter max={100} value={frame.resonance}/><span>{frame.resonance}%</span></div>
        </div>
        {(frame.strategy.active||frame.strategy.anchor)&&<div class="team-synergy">
          {frame.strategy.active&&<span title={resonances[frame.strategy.active].effect[lang]}>{resonances[frame.strategy.active].name[lang]}</span>}
          {frame.strategy.anchor&&<span>{t('랜턴 아치','Lantern Arch')}</span>}
        </div>}
        {(room||local)&&frame.phase==='boss'&&frame.warning<0&&<div class="boss-tactic">
          {other.wreck>0?t('파트너 잔해에 겹쳐 구조하세요','Overlap your partner’s wreck to revive'):
            frame.strategy.exposed>0?t('약점 노출','Weak point exposed')+' · '+frame.strategy.exposed.toFixed(1)+'s':
            frame.strategy.lock>0?<><span>{t('테더 유지','Hold the tether')}</span><progress max={buildBalance.boss.hold} value={frame.strategy.lock}/></>:
            frame.strategy.cooldown>0?t('코어 집중 사격','Focus the core')+' · '+Math.ceil(frame.strategy.cooldown)+'s':
              frame.strategy.active==='steam'&&!frame.duetReady?t('같은 코어에 맞혀 열충격을 일으키세요','Hit the same core to trigger thermal shock'):
                t('보스를 링크 사이에 두고 약점을 여세요','Straddle the boss while linked to expose it')}
        </div>}
        {frame.phase==='countdown'&&<div class="message"><span class="mini">{phaseNames.countdown[lang]}</span><strong>{Math.max(1,Math.ceil(frame.left))}</strong></div>}
        {frame.phase==='arrival'&&<div class="message"><span class="mini">{phaseNames.arrival[lang]}</span><strong>{stage.boss[lang]}</strong></div>}
        {frame.phase==='act'&&frame.stageTime<6&&<div class="flight-tip">{local?'A / D · ← / →':t('좌우로 이동 · 사격은 자동','Move sideways · auto fire')}</div>}
        {frame.phase==='act'&&frame.warning<0&&frame.enemies.some(e=>e[5])&&<div class="flight-tip danger">{t('돌진 경로에서 벗어나세요','Leave the charge lane')}</div>}
        {frame.warning>=0&&<div class="flight-tip safe">{t('밝은 구간으로 이동','Move into the marked gap')}</div>}
        {frame.duet>=0&&<div class="duet-call" role="status">{frame.duet===index&&!local?t('파트너의 듀엣 입력 대기','Waiting for partner'):t('지금 듀엣!','Duet now!')} · {frame.duetLeft.toFixed(1)}s</div>}
        {me.drive>0&&<div class="drive-tag">OVERDRIVE · {Math.ceil(me.drive)}s</div>}
        {draftUi()}{gatewayUi()}
        {frame.paused&&<section class="overlay pause"><h2>{t('일시정지','Paused')}</h2><p>{isHost?t('준비되면 계속하세요.','Resume when you are ready.'):t('호스트가 게임을 일시정지했습니다.','The host paused the flight.')}</p>
          {isHost&&<button class="primary" onClick={()=>engine.pause()}>{t('계속','Resume')}</button>}<button onClick={()=>setAbandon(true)}>{t('항해 포기','Abandon flight')}</button></section>}
        {abandon&&<section class="overlay pause"><h2>{t('항해를 포기할까요?','Abandon flight?')}</h2><div class="row"><button onClick={()=>setAbandon(false)}>{t('취소','Cancel')}</button><button class="primary" onClick={()=>{setAbandon(false);engine.abandon();}}>{t('포기','Abandon')}</button></div></section>}
        {(notices[notice]||fault==='graphics')&&<div class="notice" role="status">{notices[notice]?.[lang]||faultText.graphics[lang]}</div>}
        <div class="skills">
          {(local?[0,1]:[index]).map(i=><div class={'skill-set '+(i?'peach':'mint')}>
            <button disabled={frame.paused||frame.pilots[i].cd>0||!frame.pilots[i].hull} onClick={()=>engine.skill('dash',i)}>{local?'P'+(i+1)+' ':''}{({aster:t('대시','Dash'),vesper:t('섬광','Flare'),rook:t('방벽','Bulwark'),pico:t('점멸','Blink'),sol:t('수리','Mend')})[frame.pilots[i].ship]} {frame.pilots[i].cd>0?Math.ceil(frame.pilots[i].cd)+'s':''}</button>
            <button class={frame.duetReady?'burst-ready':''} disabled={frame.paused||!frame.pilots[i].hull||(frame.pilots[i].nova<100&&(!frame.linked||frame.resonance<100))} onClick={()=>engine.skill('burst',i)}>{frame.duetReady?t('듀엣','Duet'):t('노바','Nova')+' '+Math.floor(frame.pilots[i].nova)+'%'}</button>
          </div>)}
          <div class="xp"><span>LV {frame.level}</span><progress aria-label={t('경험치','Experience')} max={frame.goal} value={frame.xp}/></div>
        </div>
      </section>
      <aside class="side right"><span class="mini">FLIGHT SYSTEMS</span><h2>{t('내 비행 기록','Your build')}</h2>
        <div class="side-link"><span>{t('샤드','Shards')} <b>{frame.shards}</b></span><span>{t('구조 비콘','Rescue beacons')} <b>{frame.beacon}</b></span></div>
        {flightBuild(me)}
      {room&&pairPlanner(index)}
        {room&&<div class="pings">{[[t('여기','Here'),0],[t('위험','Danger'),1],[t('모여','Group'),2],[t('고마워','Thanks'),3]].map(([label,i])=><button onClick={()=>engine.signal(Number(i))}>{label}</button>)}</div>}
        <button class="text" onClick={()=>setAbandon(true)}>{t('항해 포기','Abandon flight')}</button>
      </aside>
      {room&&<details class="mobile-pings"><summary>{t('핑','Ping')}</summary>{[t('여기','Here'),t('위험','Danger'),t('모여','Group'),t('고마워','Thanks')].map((label,i)=><button onClick={()=>engine.signal(i)}>{label}</button>)}</details>}
      {room&&<button class="mobile-leave" onClick={()=>setAbandon(true)} aria-label={t('항해 포기','Abandon flight')}>×</button>}
    </main>}
    {frame?.phase==='result'&&<main class="lobby result">
      <span class="kicker"><i/>{t('항해 기록','FLIGHT LOG')}</span>
      <h1>{frame.result==='won'?t('항해 완료','Voyage complete'):frame.result==='lost'?t('신호 소실','Signal lost'):t('항해 종료','Flight ended')}</h1>
      <p>{modeNames[frame.mode][lang]} · {stage.name[lang]} · {heatLabel(frame.heat)}</p>
      <div class="result-grid"><div><span>{t('최종 점수','Final score')}</span><strong>{frame.score.toLocaleString()}</strong></div><div><span>{t('링크 유지','Link uptime')}</span><strong>{frame.link}%</strong></div><div><span>STARDUST</span><strong>{frame.dust}</strong></div></div>
      <table><thead><tr><th>{t('조종사','Pilot')}</th><th>{t('처치','Kills')}</th><th>{t('그레이즈','Grazes')}</th><th>{t('구조','Rescues')}</th><th>{t('피격','Hits')}</th></tr></thead><tbody>
        {frame.pilots.map((p,i)=><tr><th>{room?.seats[i]?.name||(ships[p.ship].name[lang]+' '+(i+1))} {mvp===i&&<span class="mvp">MVP</span>}</th><td>{p.kills}</td><td>{p.grazes}</td><td>{p.saves}</td><td>{p.hits}</td></tr>)}</tbody></table>
      {(room||local)&&<p class="coop-result">{t('듀엣 성공','Duets')} <strong>{frame.strategy.duets}</strong> · {t('보스 약점 노출','Boss openings')} <strong>{frame.strategy.openings}</strong>{frame.strategy.shocks>0&&<> · {t('열충격','Thermal shocks')} <strong>{frame.strategy.shocks}</strong></>}</p>}
      {frame.pilots.some(p=>Object.keys(p.cards).length>0)&&<details class="result-build">
        <summary>{t('이번 항해의 빌드','Builds from this flight')}</summary>
        <div>{frame.pilots.map((p,i)=><section>
          <h2>{room?.seats[i]?.name||(local?'P'+(i+1):i?t('드론','Drone'):t('내 기체','Your ship'))}</h2>
          {flightBuild(p)}
        </section>)}</div>
      </details>}
      {!!notices[notice]&&<p role="status">{notices[notice][lang]}</p>}
      <div class="row lobby-actions"><button onClick={headBack}>{t('메인 화면','Main menu')}</button>{isHost&&<button class="primary" onClick={()=>engine.replay()}>{room?t('대기실로','Back to lobby'):t('다시 비행','Fly again')}</button>}</div>
    </main>}
    <dialog ref={settingDialog} aria-labelledby="settings-heading" onClose={()=>setShowSettings(false)}><div class="row"><h2 id="settings-heading">{t('설정','Settings')}</h2><button class="icon" onClick={()=>setShowSettings(false)} aria-label={t('닫기','Close')}>×</button></div>
      <label>{t('언어','Language')}<select value={lang} onChange={e=>setSettings({...settings,lang:e.currentTarget.value==='0'?0:1})}><option value="0">한국어</option><option value="1">English</option></select></label>
      <label>{t('효과음','Sound effects')}<input type="range" min="0" max="1" step=".05" value={settings.volume} onInput={e=>setSettings({...settings,volume:+e.currentTarget.value})}/></label>
      <label class="trade"><input type="checkbox" checked={settings.contrast} onChange={e=>setSettings({...settings,contrast:e.currentTarget.checked})}/>{t('적 탄 고대비','High-contrast projectiles')}</label>
      <label class="trade"><input type="checkbox" checked={settings.reduce} onChange={e=>setSettings({...settings,reduce:e.currentTarget.checked})}/>{t('배경 움직임 줄이기','Reduce background motion')}</label>
      <p>{t('설정과 진행 기록은 이 브라우저에 저장됩니다.','Settings and flight progress are stored in this browser.')}</p>
      <label>{t('백업 코드','Backup code')}<textarea rows={3} value={backup} onInput={e=>{setBackup(e.currentTarget.value);setBackupMessage('');}}/></label>
      <div class="row">
        <button onClick={()=>setBackup(exportProfile(profile))}>{t('백업 내보내기','Export backup')}</button>
        <button disabled={!backup.trim()} onClick={async()=>{
          try {const next=importProfile(backup);setProfile(await mergeProfile(next));setBackupMessage(t('진행 기록을 병합했습니다.','Flight records merged.'));}
          catch {setBackupMessage(t('백업 코드를 확인하세요.','Check the backup code.'));}
        }}>{t('백업 병합','Merge backup')}</button>
      </div>
      {!!backupMessage&&<p role="status">{backupMessage}</p>}
    </dialog>
    <dialog ref={helpDialog} aria-labelledby="controls-heading" onClose={()=>setShowHelp(false)}><div class="row"><h2 id="controls-heading">{t('비행 조작법','Flight controls')}</h2><button class="icon" onClick={()=>setShowHelp(false)} aria-label={t('닫기','Close')}>×</button></div>
      <ul><li>{t('좌우로 드래그하거나 A / D, 방향키로 이동합니다. 사격은 자동입니다.','Drag or press A / D or the arrow keys. Weapons fire automatically.')}</li><li>{t('Space로 대시합니다. 게이지가 차면 E로 노바, 링크 공명 100에서는 두 명이 1초 안에 눌러 듀엣을 발동합니다.','Press Space to dash and E for a charged Nova. At 100 resonance both pilots can press within one second for Duet Burst.')}</li><li>{t('파트너 잔해와 겹쳐 머무르면 부활시킬 수 있습니다.','Hover over your partner’s wreck to revive them.')}</li><li>{t('로컬 2인은 P1 A/D·W·S, P2 방향키를 사용합니다. 터치는 화면을 좌우로 나눠 조작합니다.','Local P1 uses A/D, W, S. P2 uses the arrow keys. Touch input is split by screen half.')}</li></ul>
    </dialog>
  </div>;
}
render(<App/>,document.getElementById('app')!);
