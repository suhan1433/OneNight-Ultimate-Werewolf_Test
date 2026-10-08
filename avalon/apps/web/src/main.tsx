import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import ReactDOM from 'react-dom/client';
import {ROLE_DEFINITIONS,type AvalonOptions,type ClientGameState,type DelegableAssassinRole} from '@werewolf/shared';
import {useGame} from './store';
import {emit,saveSession} from './socket';
import './styles.css';
import './immersive.css';
import './premium.css';
import './stage.css';
import './intro.css';
import './lobby.css';
import './reveal.css';
import './vote.css';
import './cinematic.css';
import './chat-mobile.css';
import './chat-game-bar.css';
import './profile.css';
import {CHARACTERS,characterById,myAvatarId,setMyAvatarId,serverAvatarId,syncAvatar,useCharacterResolver,PlayerAvatar,PlayerEmoji,ProfileDialog,type Character} from './profile';
import {TeamScene,QuestScene,AssassinScene,EndingScene} from './CinematicScenes';
import {GateIntro,Table,useGateIntro} from './GateIntro';
import {RV,findMates,useHold} from './RoleScene';
import {LOBBY_TL,LobbyBackdrop,LobbyGlow,RoomCode,StartCurtain,shakeVars,useRoster,type GlowHandle} from './LobbyScene';
import {buildPlan,coinStyle,readVotes,tintOf,useNewCoins,useReducedMotion,useRevealEffects,useTableMetrics,type Plan} from './VoteScene';

const base:AvalonOptions={assassin:false,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:true};
const ROLE_OPTION_KEYS=['assassin','percival','morgana','mordred','oberon'] as const;
const DELEGABLE_ASSASSIN_ROLES=['morgana','mordred','oberon'] as const;
const call=(name:string,data:any)=>emit(name,data).catch(e=>useGame.getState().setError(e.message));

// official Avalon quest-size chart (players -> required team size per round)
const QUEST_SIZES:Record<number,number[]>={5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};
const TEAM_BALANCE:Record<number,{good:number;evil:number}>={5:{good:3,evil:2},6:{good:4,evil:2},7:{good:4,evil:3},8:{good:5,evil:3},9:{good:6,evil:3},10:{good:6,evil:4}};

function seatPos(i:number,total:number,radius=42){
  const angle=(i/total)*Math.PI*2-Math.PI/2;
  return {left:`${50+radius*Math.cos(angle)}%`,top:`${50+radius*Math.sin(angle)}%`};
}

/* ---------- icons ---------- */
function Icon({children,size=20}:{children:React.ReactNode;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
function ShieldIcon({size}:{size?:number}){return <Icon size={size}><path d="M12 2 4 5v6c0 5.2 3.4 8.7 8 9.6 4.6-.9 8-4.4 8-9.6V5l-8-3Z"/></Icon>;}
function SwordsIcon({size}:{size?:number}){return <Icon size={size}><path d="M5 5l14 14M19 5 5 19"/><path d="M5 5v3M5 5h3M19 5v3M19 5h-3"/></Icon>;}
function CrownIcon({size}:{size?:number}){return <Icon size={size}><path d="M3 18h18l-1.4-8.6-4 3.2L12 6l-3.6 6.6-4-3.2L3 18Z"/></Icon>;}
function CheckIcon({size}:{size?:number}){return <Icon size={size}><path d="M4 12.5 9 17 20 6"/></Icon>;}
function EyeIcon({size}:{size?:number}){return <Icon size={size}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/></Icon>;}
function DaggerIcon({size}:{size?:number}){return <Icon size={size}><path d="M12 2v12.5"/><path d="M7.5 14.5h9L12 21l-4.5-6.5Z"/><path d="M8.5 6h7"/></Icon>;}
function SpearIcon({size}:{size?:number}){return <Icon size={size}><path d="M4 20 17 7"/><path d="M14.5 3.5l6 6-3 1.2-4.2-4.2Z"/></Icon>;}
function MaskIcon({size}:{size?:number}){return <Icon size={size}><path d="M4.5 9c0-4 3.8-6.2 7.5-6.2S19.5 5 19.5 9c0 6-3.1 11.2-7.5 11.2S4.5 15 4.5 9Z"/><path d="M8 10.2c.5 1 1.5 1 2 0M14 10.2c.5 1 1.5 1 2 0"/></Icon>;}
function ChainIcon({size}:{size?:number}){return <Icon size={size}><rect x="3.5" y="8" width="7.5" height="9.5" rx="3.75"/><rect x="13" y="6.5" width="7.5" height="9.5" rx="3.75"/></Icon>;}
function SealIcon({size=96}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className="seal">
    <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="50" cy="50" r="37" stroke="currentColor" strokeWidth="1"/>
    <path d="M50 19v44M37 33l13-13 13 13M39 63h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function FactionSeal({team,size=44}:{team:'good'|'evil';size?:number}){
  const good=team==='good';
  return <svg className={`faction-seal ${team}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="23"/>
    {good?<><path d="M32 13 19 25v17l13 9 13-9V25L32 13Z"/><path d="M32 22v22M24 31h16"/></>:<><path d="m18 17 28 30M46 17 18 47"/><path d="M23 12h18l5 10-14 30-14-30 5-10Z"/></>}
  </svg>;
}
function RoleIcon({role,team,size}:{role:string;team:'good'|'evil';size?:number}){
  const r=role.toLowerCase();
  if(r.includes('merlin'))return <EyeIcon size={size}/>;
  if(r.includes('assassin'))return <DaggerIcon size={size}/>;
  if(r.includes('percival'))return <SpearIcon size={size}/>;
  if(r.includes('morgana'))return <MaskIcon size={size}/>;
  if(r.includes('mordred'))return <CrownIcon size={size}/>;
  if(r.includes('oberon'))return <ChainIcon size={size}/>;
  return <ShieldIcon size={size}/>;
}
function Dots(){return <span className="dots"><i/><i/><i/></span>;}
function PhaseRibbon({game,turn=false}:{game:ClientGameState;turn?:boolean}){
  const copy:Record<string,[string,string]>={
    team_build:['원정대 구성','리더가 이번 원정에 나설 기사를 지명합니다.'],
    team_vote:['신뢰의 투표','모든 기사가 찬성 또는 반대를 비밀리에 선택합니다.'],
    vote_result:['원탁의 판결','투표 토큰을 공개하고 원정 승인 여부를 확인합니다.'],
    quest:['원정의 결단','원정대원만 자신의 원정 카드를 비밀리에 제출합니다.'],
    quest_result:['원정 보고','섞인 원정 카드의 결과가 공개됩니다.'],
    assassination:['마지막 암살','암살 능력 보유자가 멀린이라고 생각하는 기사를 지목합니다.'],
  };
  const [title,description]=copy[game.phase]??['원탁','기사들이 다음 행동을 기다립니다.'];
  return <div className="phase-ribbon" key={game.phase}><span className="ribbon-kicker">ROUND {game.round+1}</span><div><strong>{title}</strong><small>{description}</small></div>{turn&&<em className="turn-pill">내 차례</em>}</div>;
}

/* ---------- atmosphere & feedback ---------- */
const EMBERS=Array.from({length:16},(_,k)=>({k,style:{left:`${(k*37+11)%100}%`,'--s':`${2+(k%3)}px`,'--d':`${10+(k*5)%9}s`,'--delay':`-${(k*3)%12}s`,'--x':`${((k%5)-2)*22}px`} as React.CSSProperties}));
function Ambient({phase}:{phase:string}){
  return <div className="ambient" data-phase={phase} aria-hidden="true"><div className="mist m1"/><div className="mist m2"/>{EMBERS.map(e=><i key={e.k} style={e.style}/>)}</div>;
}
const BANNERS:Record<string,string>={team_vote:'신뢰의 투표',quest:'원정의 결단'};
function PhaseBanner({game}:{game:ClientGameState}){
  const key=`${game.phase}:${game.round}`;
  const prev=useRef('');
  const[shown,setShown]=useState<string|null>(null);
  useEffect(()=>{
    const changed=prev.current!==''&&prev.current!==key;
    prev.current=key;
    if(!changed||!BANNERS[game.phase])return;
    setShown(key);
    const timer=window.setTimeout(()=>setShown(null),1700);
    return()=>window.clearTimeout(timer);
  },[key,game.phase]);
  if(!shown)return null;
  return <div className="phase-banner" key={shown} aria-hidden="true"><small>{game.round+1}번째 원정</small><strong>{BANNERS[game.phase]}</strong></div>;
}
function SeatFace({name,playerId}:{name:string;playerId:string}){
  const c=useCharacterResolver()(playerId);
  return <><span className="avatar has-char" style={{background:c.bg,textTransform:'none'}} aria-hidden="true">{c.emoji}</span><span className="seat-name">{name}</span></>;
}
function Pips({done,total}:{done:number;total:number}){
  return <div className="pips" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="제출 현황">{Array.from({length:total},(_,i)=><i className={i<done?'on':''} key={i}/>)}</div>;
}
function Toast({message,onClose}:{message:string;onClose:()=>void}){
  return <div className="toast-layer" role="alert" aria-live="assertive">
    <div className="toast" key={message} onClick={onClose}>
      <span className="toast-icon" aria-hidden="true"><FactionSeal team="evil" size={30}/></span>
      <div className="toast-body"><small>알림</small><p>{message}</p></div>
      <button type="button" className="toast-close" aria-label="알림 닫기" onClick={e=>{e.stopPropagation();onClose();}}>×</button>
      <i className="toast-timer" aria-hidden="true"/>
    </div>
  </div>;
}
function ConfirmDialog({title,body,confirmLabel,cancelLabel,onConfirm,onCancel}:{title:string;body:string;confirmLabel:string;cancelLabel:string;onConfirm:()=>void;onCancel:()=>void}){
  return <div className="help-scrim" role="alertdialog" aria-modal="true" aria-label={title} onClick={onCancel}>
    <section className="confirm-modal" onClick={event=>event.stopPropagation()}>
      <FactionSeal team="evil" size={46}/>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="confirm-actions"><button type="button" autoFocus onClick={onCancel}>{cancelLabel}</button><button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button></div>
    </section>
  </div>;
}

/* ---------- screens ---------- */
function Home(){
  const[nickname,setNickname]=useState('');
  const[code,setCode]=useState('');
  const[count,setCount]=useState(5);
  const[tab,setTab]=useState<'create'|'join'>('create');
  const[opts,setOpts]=useState<AvalonOptions>(base);
  const[nickError,setNickError]=useState(false);
  const nickRef=useRef<HTMLInputElement>(null);
  const intro=useGateIntro();
  const balance=TEAM_BALANCE[count]!;
  const evilSpecialLimit=balance.evil-Number(opts.assassin);
  const evilSpecialSelected=DELEGABLE_ASSASSIN_ROLES.filter(key=>opts[key]).length;
  const delegatedRole=opts.assassinationAbilityRole;
  const canCreate=opts.assassin||!!delegatedRole;
  const toggleRole=(key:typeof ROLE_OPTION_KEYS[number])=>{
    const next=!opts[key];
    const nextOptions={...opts,[key]:next};
    if(key==='assassin'&&next)nextOptions.assassinationAbilityRole=null;
    if(DELEGABLE_ASSASSIN_ROLES.includes(key as DelegableAssassinRole)&&!next&&delegatedRole===key)nextOptions.assassinationAbilityRole=null;
    setOpts(nextOptions);
  };
  const requireNickname=()=>{
    if(nickname.trim())return true;
    setNickError(true);nickRef.current?.focus();
    useGame.getState().setError('닉네임을 입력해주세요.');
    return false;
  };
  const create=async()=>{if(!requireNickname())return;try{const s=await emit('ROOM_CREATE',{nickname,maxPlayers:count,options:opts});saveSession(s);}catch(e:any){useGame.getState().setError(e.message);}};
  const join=async()=>{if(!requireNickname())return;try{const s=await emit('ROOM_JOIN',{roomCode:code,nickname});saveSession(s);}catch(e:any){useGame.getState().setError(e.message);}};
  return <section className={`gate${intro.live?' intro-live':''}`} style={intro.live?{'--T':intro.scale} as React.CSSProperties:undefined}>
    <GateIntro intro={intro}/>
    <header className="gate-hero" key={`hero-${intro.runKey}`}>
      <div className="gate-sigil"><SealIcon size={96}/></div>
      <small className="gate-eyebrow">THE RESISTANCE</small>
      <div className="gate-title"><h1>AVALON</h1></div>
      <p>원탁은 하나, 충성은 둘로 갈렸다</p>
    </header>
    <div className="gate-card" key={`card-${intro.runKey}`}>
      <div className="gate-tabs" role="tablist" aria-label="시작 방식">
        <button type="button" role="tab" aria-selected={tab==='create'} className={tab==='create'?'on':''} onClick={()=>setTab('create')}><ShieldIcon size={15}/> 원탁 만들기</button>
        <button type="button" role="tab" aria-selected={tab==='join'} className={tab==='join'?'on':''} onClick={()=>setTab('join')}><SwordsIcon size={15}/> 원탁 참가</button>
        <i className={`gate-tab-glow ${tab}`}/>
      </div>
      <label className={`gate-field${nickError?' invalid':''}`}><span>기사의 이름</span><input ref={nickRef} placeholder="닉네임을 입력하세요" maxLength={12} value={nickname} aria-invalid={nickError} onChange={e=>{setNickname(e.target.value);if(nickError)setNickError(false);}}/></label>
      {tab==='create'?<div className="gate-pane" key="create">
        <div className="gate-block">
          <div className="gate-label"><span>참가 인원</span><em>원탁에 앉을 기사의 수</em></div>
          <div className="gate-count">
            <div className="mini-table" aria-hidden="true">
              {Array.from({length:count},(_,i)=><b key={i} className={i<balance.good?'good':'evil'} style={seatPos(i,count,41)}/>)}
              <strong>{count}</strong>
            </div>
            <div className="gate-count-side">
              <div className="count-seg" role="group" aria-label="게임 인원 선택">{[5,6,7,8,9,10].map(n=><button type="button" className={n===count?'selected':''} onClick={()=>setCount(n)} key={n}>{n}</button>)}</div>
              <div className="faction-legend">
                <span className="good"><FactionSeal team="good" size={22}/>선 <b>{balance.good}</b></span>
                <span className="evil"><FactionSeal team="evil" size={22}/>악 <b>{balance.evil}</b></span>
              </div>
              <small>멀린 필수 · 선택 악 역할 {Number(opts.assassin)+evilSpecialSelected}/{balance.evil}</small>
            </div>
          </div>
        </div>
        <div className="gate-block">
          <div className="gate-label"><span>등장 캐릭터</span><em>눌러서 추가·제외</em></div>
          <div className="role-grid">
            {ROLE_OPTION_KEYS.map(key=>{
              const on=opts[key];const def=ROLE_DEFINITIONS[key];
              const blocked=def.team==='evil'&&!on&&evilSpecialSelected>=evilSpecialLimit;
              return <button type="button" disabled={blocked} title={def.description} aria-pressed={on} className={`role-card ${def.team}${on?' on':''}`} onClick={()=>toggleRole(key)} key={key}>
                <span className="rc-icon"><RoleIcon role={key} team={def.team} size={22}/></span>
                <span className="rc-name">{def.name}</span>
                <span className="rc-team">{def.team==='good'?'선':'악'}</span>
                <span className="rc-check"><CheckIcon size={11}/></span>
              </button>;
            })}
          </div>
        </div>
        {!opts.assassin&&<div className="assassination-delegation">
          <b>암살 능력 위임</b>
          <p>암살자가 없는 게임입니다. 선택한 악의 세력 중 멀린을 지목할 역할을 정하세요.</p>
          {evilSpecialSelected===0?<small>먼저 모르가나, 모드레드, 오베론 중 한 역할을 선택하세요.</small>:<div role="radiogroup" aria-label="암살 능력 보유 역할">
            {DELEGABLE_ASSASSIN_ROLES.filter(role=>opts[role]).map(role=><label key={role}><input type="radio" name="assassinationAbilityRole" checked={delegatedRole===role} onChange={()=>setOpts({...opts,assassinationAbilityRole:role})}/><RoleIcon role={role} team="evil" size={16}/>{ROLE_DEFINITIONS[role].name}</label>)}
          </div>}
        </div>}
        <label className="gate-switch"><span><b>원정 기록 투표자 공개</b><small>찬성·반대 인원과 투표자 이름을 함께 표시합니다.</small></span><input type="checkbox" checked={opts.revealVoteIdentities} onChange={e=>setOpts({...opts,revealVoteIdentities:e.target.checked})}/><i className="knob"/></label>
        <button className="primary gate-cta" disabled={!canCreate} onClick={create}><ShieldIcon size={17}/> 원탁 열기</button>
        {!canCreate&&<p className="gate-hint">암살자를 포함하거나, 암살 능력을 맡길 악 역할을 골라주세요.</p>}
      </div>:<div className="gate-pane" key="join">
        <div className="gate-block">
          <div className="gate-label"><span>초대 코드</span><em>방장에게 받은 코드를 입력하세요</em></div>
          <input className="code-input" placeholder="· · · · · ·" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} autoCapitalize="characters" spellCheck={false}/>
        </div>
        <button className="primary gate-cta" disabled={!code.trim()} onClick={join}><SwordsIcon size={17}/> 원탁에 앉기</button>
      </div>}
    </div>
  </section>;
}

function Role({game}:{game:ClientGameState}){
  const role=game.selfRole!;
  const def=ROLE_DEFINITIONS[role];
  const label=def.team==='good'?'선의 세력':game.hasAssassinationAbility?'악의 세력 · 암살 능력 보유':'악의 세력';
  const reduced=useMemo(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
  const[ready,setReady]=useState(reduced);            // 1.0s: 카드가 떠오르면 그때부터 누를 수 있다
  const[shown,setShown]=useState(false);              // 앞면이 보이는 중
  const[everShown,setEverShown]=useState(false);      // 한 번이라도 열렸는가 — 그 전에는 진영 정보가 DOM 에도 없다
  const[confirmed,setConfirmed]=useState(false);
  const[lit,setLit]=useState(false);                  // 원탁 조도 복귀
  const[strike,setStrike]=useState(0);
  const[fails,setFails]=useState(0);
  const[msg,setMsg]=useState('');
  useEffect(()=>{if(ready)return;const t=window.setTimeout(()=>{setReady(true);setMsg('카드가 준비되었습니다. 카드를 길게 눌러 신분을 확인하세요.');},RV.ready*1000);return()=>window.clearTimeout(t);},[]);
  useEffect(()=>{const r=document.documentElement;r.toggleAttribute('data-rv-dark',!lit);return()=>r.removeAttribute('data-rv-dark');},[lit]);

  const reveal=()=>{
    setEverShown(true);setShown(true);setLit(true);setStrike(k=>k+1);
    navigator.vibrate?.(90);                                            // 2.6s 타격: 햅틱 강 1회
    setMsg(`당신의 역할은 ${def.name}입니다. ${label}.`);
  };
  const hold=useHold({enabled:ready&&!shown,onComplete:reveal,onAbort:()=>setFails(f=>f+1)});
  const hide=()=>{setShown(false);hold.reset();};
  const confirm=async()=>{
    try{await emit('ROLE_CONFIRM',{roomCode:game.roomCode});setConfirmed(true);hide();setMsg('역할을 확인했습니다. 다른 기사들을 기다립니다.');}
    catch(e:any){useGame.getState().setError(e.message);}
  };
  const mates=useMemo(()=>def.team==='evil'?findMates(game.roleIntel,game.players,game.playerId):new Set<string>(),[def.team,game.roleIntel.join('|'),game.players.map(p=>p.id+p.nickname).join('|'),game.playerId]);
  const altVisible=ready&&!shown&&(reduced||fails>=3);
  const waiting=`모든 기사의 확인을 기다리는 중 (${game.roleConfirmedCount}/${game.players.length})`;

  return <section className={`rv${shown?' is-shown':''}${everShown?' was-shown':''}${lit?' is-lit':''}`} data-team={everShown?def.team:undefined}>
    <div className="rv-dark" aria-hidden="true"/>
    <div className="rv-beam" aria-hidden="true"/>
    <div className="intro-scene rv-table" aria-hidden="true"><div className="intro-rig"><Table/></div></div>
    <p className="rv-sr" role="status">{msg}</p>
    <div className="rv-cam">
      <div className="rv-stage">
        {everShown&&<i className="rv-aura" aria-hidden="true"/>}
        {strike>0&&<i className="rv-burst" key={strike} aria-hidden="true"/>}
        <button type="button" ref={hold.el} className="rv-card" {...hold.bind} disabled={!ready||shown}
          aria-label={shown?`역할 카드: ${def.name}`:'카드를 길게 눌러 신분 확인. 키보드는 스페이스바를 길게 누르세요.'}>
          <span className="rv-flipper">
            <span className="rv-face rv-back"><SealIcon size={92}/><small>AVALON</small></span>
            <span className="rv-face rv-front" aria-hidden={!shown}>{everShown&&<>
              <FactionSeal team={def.team} size={200}/>
              <span className="rv-glyph"><RoleIcon role={role} team={def.team} size={Math.round(24*1.9)}/></span>
              <small>{label}</small><strong>{def.name}</strong>
            </>}</span>
          </span>
          <span className="rv-heat" aria-hidden="true"/>
          <svg className="rv-perim" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><rect x="0.5" y="0.5" width="99" height="149" rx="7" pathLength={1}/></svg>
          <span className="rv-embers" aria-hidden="true">{[0,1,2,3,4,5,6].map(e=><i className="rv-ember" key={e} style={{'--e':e} as React.CSSProperties}/>)}</span>
        </button>
      </div>
      {ready&&!shown&&<p className="rv-hint" key={confirmed?'w':fails?'f':'h'}>{confirmed?waiting:fails?'끝까지 누르고 계세요':'주변을 확인한 뒤, 카드를 꾹 눌러 신분을 확인하세요'}
        <small>{confirmed?'다시 확인하려면 카드를 길게 누르세요':'손을 떼면 열이 식습니다 · 키보드는 스페이스바를 길게'}</small></p>}
      {!ready&&<p className="rv-hint" aria-hidden="true">&nbsp;</p>}
      {altVisible&&<button type="button" className="rv-alt" onClick={reveal}>길게 누르기 어렵다면 — 탭으로 바로 확인</button>}
    </div>
    {everShown&&<aside className="rv-panel" data-open={shown} aria-hidden={!shown} aria-label="내 역할 설명">
      <span className="rv-faction">{label}</span>
      <h3>{def.name}</h3>
      <p>{def.description}</p>
      {game.hasAssassinationAbility&&role!=='assassin'&&<p className="ability-note"><DaggerIcon size={15}/> 암살 능력: 선이 원정 3회에 성공하면 멀린을 지목할 수 있습니다.</p>}
      {(game.roleIntel.length>0||mates.size>0)&&<div className="rv-intel-row">
        {game.roleIntel.length>0&&<div className="intel"><b>확인한 정보</b>{game.roleIntel.map(x=><div key={x}>{x}</div>)}</div>}
        {def.team==='evil'&&mates.size>0&&<div className="rv-seats" aria-hidden="true">{game.players.map((p,i)=>{
          const isMate=mates.has(p.id);
          const k=isMate?[...mates].indexOf(p.id):0;
          const pos=seatPos(i,game.players.length,38);
          return <span key={p.id} className={`rv-seat${p.id===game.playerId?' me':''}${isMate?' mate':''}`} style={{...pos,'--k':k} as React.CSSProperties}><PlayerEmoji playerId={p.id}/></span>;
        })}</div>}
      </div>}
      <div className="rv-actions">
        {confirmed
          ?<button type="button" onClick={hide}>카드 가리기</button>
          :<button type="button" className="primary" onClick={confirm}>역할 확인 완료 ({game.roleConfirmedCount}/{game.players.length})</button>}
      </div>
    </aside>}
  </section>;
}

function Lobby({game,starting=false}:{game:ClientGameState;starting?:boolean}){
  const me=game.players.find(p=>p.id===game.playerId)!;
  const[copied,setCopied]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(game.roomCode);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{}};
  const readyCount=game.players.filter(p=>p.ready).length;
  const total=game.maxPlayers;
  const glow=useRef<GlowHandle>(null);
  const tableRef=useRef<HTMLDivElement>(null);
  /* 새 플레이어가 앉으면 촛불빛이 그 좌석 쪽으로 잠깐 기울었다 돌아온다 */
  const lean=(index:number)=>{
    const w=tableRef.current?.offsetWidth??360;
    const a=(index/total)*Math.PI*2-Math.PI/2;
    glow.current?.lean(Math.cos(a)*w*.09,Math.sin(a)*w*.09);
  };
  const roster=useRoster(game.players,game.playerId,lean);
  const[profileOpen,setProfileOpen]=useState(false);
  const resolve=useCharacterResolver(game.players,game.playerId);
  // 퇴장하는 사람(ghost 좌석)도 떠나기 직전의 캐릭터로 촛불이 꺼지도록 닉네임별로 기억해 둔다
  const seenChars=useRef(new Map<string,Character>());
  game.players.forEach(p=>seenChars.current.set(p.nickname,resolve(p.id)));
  useEffect(()=>{if(starting)setProfileOpen(false);},[starting]); // 게임이 시작되면 팝업을 닫는다
  // 입장하면 아직 안 쓰인 캐릭터를 자동 배정하고(저장된 선택이 있으면 그대로) 서버에 알린다
  const lastSynced=useRef('');
  const avatarSig=game.players.map(p=>`${p.id}:${serverAvatarId(p)??''}`).join(',');
  useEffect(()=>{
    const taken=new Set(game.players.filter(p=>p.id!==game.playerId).map(p=>serverAvatarId(p)).filter(Boolean) as string[]);
    let id=myAvatarId;
    if(!characterById(id)||taken.has(id!)){
      const free=CHARACTERS.filter(c=>!taken.has(c.id));const pool=free.length?free:CHARACTERS;
      id=pool[Math.floor(Math.random()*pool.length)]!.id;setMyAvatarId(id);
    }
    const key=`${game.roomCode}:${id}`;
    if(serverAvatarId(me)!==id&&lastSynced.current!==key){lastSynced.current=key;syncAvatar(game.roomCode,id!);}
  },[avatarSig,game.roomCode]);
  const seatAt=(i:number)=>({...seatPos(i,total,41),'--i':i} as React.CSSProperties);
  const letter=(name:string)=>[...name][0]??'?';
  return <section className={`lb${starting?' starting':''}`} style={{'--fill-n':game.players.length/total} as React.CSSProperties}>
    <div className="lb-shade" aria-hidden="true"/>
    <LobbyBackdrop/>
    <p className="lb-sr" role="status">{starting?'게임을 시작합니다. 곧 역할이 공개됩니다.':roster.message}</p>
    <header className="lb-head"><small>WAITING HALL</small><h2>원탁 대기실</h2></header>
    <button type="button" className="lb-code" style={shakeVars([...game.roomCode].length)} onClick={copy} aria-label={`초대 코드 ${game.roomCode} 복사`}>
      <small>INVITE CODE</small>
      <RoomCode code={game.roomCode}/>
      <em className={copied?'done':''}>{copied?<><CheckIcon size={13}/> 복사되었습니다</>:'눌러서 초대 코드 복사'}</em>
    </button>
    <div className="lb-table-wrap">
      <LobbyGlow ref={glow}/>
      <div ref={tableRef} className={`lb-table lb-t${total}`} style={{'--ready':`${(readyCount/total)*100}%`} as React.CSSProperties}>
        <div className="lb-core"><strong>{game.players.length}<span>/{total}</span></strong><small>준비 {readyCount}명</small></div>
        {Array.from({length:total},(_,i)=>{
          const p=game.players[i];
          if(!p&&roster.ghosts.some(g=>g.index===i))return null;           // 촛불이 꺼지는 동안 그 자리는 잔상이 차지한다
          return p
            ?<div className={`lb-seat${p.ready?' ready':''}${p.isBot?' bot':''}${p.id===game.playerId?' me':''}${roster.fresh.includes(p.id)?' fresh':''}`} style={seatAt(i)} key={p.id}
              {...(p.id===game.playerId?{role:'button',tabIndex:0,'aria-label':`내 프로필 수정 (${p.nickname}, ${resolve(p.id).name})`,onClick:()=>setProfileOpen(true),onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setProfileOpen(true);}}}:{})}>
              {p.id===game.hostId&&<span className="lb-crown" title="방장"><CrownIcon size={14}/></span>}
              <span className="lb-avatar has-char" style={{'--pf-bg':resolve(p.id).bg} as React.CSSProperties}>{resolve(p.id).emoji}{p.ready&&<span className="lb-ok"><CheckIcon size={11}/></span>}<i className="lb-flame" aria-hidden="true"/></span>
              <span className="lb-name">{p.id===game.playerId?'나 · ':''}{p.nickname}{p.id===game.playerId&&<span className="lb-edit" aria-hidden="true"> ✎</span>}</span>
              {p.isBot&&<small>TEST BOT</small>}
            </div>
            :<div className="lb-seat empty" style={seatAt(i)} key={`e${i}`}><span className="lb-avatar"><i>{i+1}</i></span><span className="lb-name">빈 자리</span></div>;
        })}
        {roster.ghosts.map(g=><div className="lb-seat ghost" style={seatAt(g.index)} key={g.key} aria-hidden="true">
          {(()=>{const gc=seenChars.current.get(g.name);return <span className={`lb-avatar${gc?' has-char':''}`} style={gc?{'--pf-bg':gc.bg} as React.CSSProperties:undefined}>{gc?gc.emoji:letter(g.name)}<i className="lb-flame"/></span>;})()}
          <span className="lb-name">{g.name}</span>
          <span className="lb-smoke"><i style={{'--k':0} as React.CSSProperties}/><i style={{'--k':1} as React.CSSProperties}/><i style={{'--k':2} as React.CSSProperties}/></span>
        </div>)}
      </div>
    </div>
    <p className="lb-profile-hint">내 자리를 눌러 캐릭터를 바꿀 수 있어요</p>
    {profileOpen&&<ProfileDialog game={game} close={()=>setProfileOpen(false)}/>}
    <div className="lb-roles"><b>이번 게임의 캐릭터</b><div>{game.activeRoles.map((role,index)=>{const delegated=!game.options.assassin&&game.options.assassinationAbilityRole===role;return <span key={`${role}-${index}`} className={ROLE_DEFINITIONS[role].team}><RoleIcon role={role} team={ROLE_DEFINITIONS[role].team} size={14}/>{ROLE_DEFINITIONS[role].name}{delegated&&<DaggerIcon size={12}/>}</span>;})}</div></div>
    <div className="lb-actions">
      <button className={`lb-ready${me.ready?' is-ready':''}`} onClick={()=>call('PLAYER_READY',{roomCode:game.roomCode})}>{me.ready?<><CheckIcon size={17}/> 준비 완료됨</>:'준비 완료'}</button>
      {game.playerId===game.hostId&&<button className="primary lb-start" onClick={()=>call('GAME_START',{roomCode:game.roomCode})}><CrownIcon size={17}/> 게임 시작</button>}
    </div>
  </section>;
}

function RoundHistory({game,open,setOpen,showSlots=true}:{game:ClientGameState;open:number|null;setOpen:(round:number|null)=>void;showSlots?:boolean}){
  const name=(id:string)=>game.players.find(player=>player.id===id)?.nickname??'알 수 없음';
  const record=open===null?undefined:game.roundHistory.find(item=>item.round===open);
  const voteComplete=record&&record.approveCount+record.rejectCount===game.players.length;
  const approved=record?.votes&&game.players.filter(player=>record.votes?.[player.id]);
  const rejected=record?.votes&&game.players.filter(player=>record.votes?.[player.id]===false);
  return <>{showSlots&&<section className="round-history" aria-label="원정 라운드 기록">{Array.from({length:5},(_,round)=>{const item=game.roundHistory.find(entry=>entry.round===round);const state=item?.success===true?'success':item?.success===false?'fail':'pending';const status=item?(item.success===undefined?'진행 중':item.success?'성공':'실패'):'대기';return <div className="round-history-item" key={round}><button type="button" disabled={!item} className={`${state} ${round===game.round?'current':''}`} onClick={()=>setOpen(open===round?null:round)} aria-expanded={open===round}><span className="round-label">ROUND {round+1}</span><span className="round-meta">{QUEST_SIZES[game.maxPlayers]?.[round]}명 · {status}</span></button></div>;})}</section>}{record&&<section className="round-detail" aria-live="polite">
    <div className="round-detail-head"><span>ROUND {record.round+1} · 원정 기록</span><b className={record.success===true?'success':record.success===false?'fail':''}>{record.success===undefined?'진행 중':record.success?'원정 성공':'원정 실패'}</b></div>
    <div className="round-detail-section expedition-detail"><div className="round-detail-label"><FactionSeal team="good" size={18}/><span>원정대</span></div><div className="expedition-content"><span className="leader-chip"><CrownIcon size={13}/> 리더 · <PlayerAvatar playerId={record.leaderId} size={16}/>{name(record.leaderId)}</span><div className="member-chips">{record.team.map(id=><span key={id}><PlayerAvatar playerId={id} size={16}/>{name(id)}</span>)}</div></div></div>
    <div className="round-detail-section"><div className="round-detail-label"><ShieldIcon size={18}/><span>찬반 투표</span></div>{voteComplete?<><div className="vote-summary"><span className="approve"><CheckIcon size={13}/> 찬성 <b>{record.approveCount}</b></span><span className="reject"><SwordsIcon size={13}/> 반대 <b>{record.rejectCount}</b></span></div>{game.options.revealVoteIdentities&&<div className="vote-groups"><div className="vote-group approve"><b><CheckIcon size={13}/> 찬성</b><div>{approved?.map(player=><span key={player.id}><PlayerAvatar playerId={player.id} size={16}/>{player.nickname}</span>)}</div></div><div className="vote-group reject"><b><SwordsIcon size={13}/> 반대</b><div>{rejected?.map(player=><span key={player.id}><PlayerAvatar playerId={player.id} size={16}/>{player.nickname}</span>)}</div></div></div>}</>:<div className="round-pending"><Dots/> 투표 진행 중</div>}</div>
    <div className="round-detail-section quest-detail"><div className="round-detail-label"><SwordsIcon size={18}/><span>원정 결과</span></div><div>{record.fails===undefined?<span className="round-pending"><Dots/> 원정 결과 대기 중</span>:<div className="quest-card-count"><span className="success"><ShieldIcon size={15}/> 성공 <b>{record.team.length-record.fails}</b></span><span className="fail"><SwordsIcon size={15}/> 실패 <b>{record.fails}</b></span></div>}</div></div>
  </section>}</>;
}

function ActiveRoles({game}:{game:ClientGameState}){
  return <section className="active-roles"><b>사용 캐릭터</b>{game.activeRoles.map((role,index)=>{const def=ROLE_DEFINITIONS[role];const delegated=!game.options.assassin&&game.options.assassinationAbilityRole===role;return <span className={def.team} key={`${role}-${index}`} title={delegated?`${def.description} 암살 능력을 함께 가집니다.`:def.description}><RoleIcon role={role} team={def.team} size={14}/>{def.name}{delegated&&<DaggerIcon size={12}/>}</span>;})}</section>;
}

/* 방 옵션 '원정 기록 투표자 공개'
   OFF: 코인은 중앙에 쌓였다가 섞인 뒤 나뉜다. 개인별 투표는 읽지 않고 합계만 쓴다 (익명).
   ON : 섞지 않는다. 각자 자리 앞에 놓인 코인이 그 사람의 선택이며, 공개 때 그 코인이 그대로 뒤집히고 좌석에 '찬성/반대' 표식이 남는다.
        서버가 개인별 투표를 아직 주지 않았으면(readVotes=null) 잠깐 대기하고, 끝내 안 오면 안전하게 섞기 연출로 대체한다. */
function VoteStage({game,approve,setApprove}:{game:ClientGameState;approve:boolean|null;setApprove:(value:boolean)=>void}){
  const rootRef=useRef<HTMLDivElement>(null);
  const tableRef=useRef<HTMLDivElement>(null);
  const isResult=game.phase==='vote_result';
  const totals=game.voteResult;
  const voteCount=isResult?(totals?.approve??0)+(totals?.reject??0):game.teamVotesCompleted;
  const seed=`${game.roomCode}|${game.round}|${[...game.proposedTeam].sort().join(',')}`;
  const seatCount=game.players.length;
  const leaderIndex=game.players.findIndex(player=>player.id===game.leaderId);
  /* 방 옵션 '투표자 공개'가 켜져 있으면 자기 앞 코인 = 자기 선택(identity), 아니면 중앙에서 섞어 나눠 놓는다(shuffled).
     옵션이 켜졌어도 서버가 개인별 표를 주지 않으면 shuffled 로 대체된다. voteKey 는 문자열이라 갱신돼도 연출이 다시 시작되지 않는다. */
  const identityOn=!!game.options?.revealVoteIdentities;
  const placement:'seat'|'pile'=identityOn?'seat':'pile';
  const voteKey=isResult&&identityOn?(readVotes(game)?.map(value=>value?'1':'0').join('')??''):'';
  const[voteWaitOver,setVoteWaitOver]=useState(false);
  useEffect(()=>{
    if(!isResult||!identityOn||voteKey){setVoteWaitOver(false);return;}
    const id=window.setTimeout(()=>setVoteWaitOver(true),1500);
    return()=>window.clearTimeout(id);
  },[isResult,identityOn,voteKey]);
  const holdPlan=isResult&&identityOn&&!voteKey&&!voteWaitOver;              // ON 인데 개인별 투표가 아직 안 왔다: 섞지 말고 기다린다
  const plan=useMemo<Plan|null>(()=>isResult&&totals&&!holdPlan?buildPlan(totals.approve,totals.reject,seed,{seats:seatCount,leaderIndex,votes:voteKey?[...voteKey].map(value=>value==='1'):null}):null,[isResult,holdPlan,totals?.approve,totals?.reject,seed,seatCount,leaderIndex,voteKey]);
  const revealing=isResult&&!!plan;
  const coinSeats=isResult?Array.from({length:voteCount},(_,seat)=>seat):game.players.map((player,seat)=>player.hasVoted?seat:-1).filter(seat=>seat>=0);
  const reduced=useReducedMotion();
  const initialCoins=useNewCoins(voteCount);
  useTableMetrics(tableRef,rootRef,revealing&&!reduced);
  useRevealEffects(plan,revealing&&!reduced);

  const style=plan?{'--R':`${plan.R}s`,'--S':`${plan.S}s`,'--ld':`${plan.ft[plan.N-1]!-.25}s`,'--sd':`${plan.S+1.2}s`,'--cd':`${plan.S+2}s`,'--kd':`${plan.S+.4}s`} as React.CSSProperties:undefined;
  const point=(id:string)=>{
    const index=game.players.findIndex(player=>player.id===id);
    const angle=(index/game.players.length)*Math.PI*2-Math.PI/2;
    return `${50+42*Math.cos(angle)},${50+42*Math.sin(angle)}`;
  };
  const teamPoints=game.proposedTeam.map(point).join(' ');
  const resultPassed=totals?.passed??false;

  return <section ref={rootRef} className={`vt${revealing?' is-reveal':''}${revealing?(resultPassed?' ok':' no'):''}${plan?.mode==='identity'?' identity':''}${placement==='seat'?' seat-coins':''}${reduced?' is-final':''}`} style={style} aria-label={isResult?'원정대 투표 결과':'원정대 투표'}>
    <span className="vt-sr">{isResult?`찬성 ${totals?.approve??0}표, 반대 ${totals?.reject??0}표`: `투표 ${voteCount}/${game.players.length}명 완료`}</span>
    {revealing&&<div className="vt-dark" aria-hidden="true"/>}
    <div className="vt-wrap">
      <div className="vt-tilt vt-tilt--table">
        <div ref={tableRef} className={`table vt-table table--${game.players.length}`}>
          <div className="table-center"><div className="selection-core"><FactionSeal team="good" size={36}/><strong>{isResult?'투표 공개':`${voteCount} / ${game.players.length}`}</strong><span>{isResult?'원탁의 판결을 확인합니다':'찬성 또는 반대를 비밀리에 선택하세요'}</span></div></div>
          {game.players.map((player,index)=><div className="seat vt-seat" style={{...seatPos(index,game.players.length,game.players.length>=8?39:42),'--i':index} as React.CSSProperties} key={player.id}>
            {player.id===game.leaderId&&<span className={`leader-crown${isResult&&!resultPassed?' vt-crown-seat':''}`} title="리더"><CrownIcon size={16}/></span>}
            {(()=>{const step=plan?.mode==='identity'?plan.stepOf[index]:undefined;const v=step===undefined?undefined:plan?.outcomes[step];
              return <div className="plate"><SeatFace name={player.nickname} playerId={player.id}/>{player.hasVoted&&!revealing&&<i className="vt-voted" aria-label="투표 완료"/>}
                {v!==undefined&&<span className="vt-mark" data-v={v?'a':'r'} style={{'--ft':plan!.ft[step!]!.toFixed(3)} as React.CSSProperties}>{v?<CheckIcon size={11}/>:<SwordsIcon size={11}/>}{v?'찬성':'반대'}</span>}</div>;})()}
          </div>)}
        </div>
        <div className="vt-tilt--top" aria-hidden="true">
          <svg className="vt-poly" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon className="vt-poly-fill" points={teamPoints}/><polygon className="vt-edge" points={teamPoints}/></svg>
          {!resultPassed&&isResult&&<span className="vt-crown" style={{'--a0':'-90deg','--a1':`${-90+360/game.players.length}deg`} as React.CSSProperties}><CrownIcon size={26}/></span>}
          <div className="vt-pool" aria-hidden="true">
            {coinSeats.map((seat,index)=>{
              const step=plan?.stepOf[seat];
              const outcome=step===undefined?undefined:plan?.outcomes[step];
              return <div className={`vt-coin${index>=initialCoins?' drop':''}${plan&&step===plan.N-1?' lastcoin':''}`} style={coinStyle(seat,seed,plan,{seats:seatCount,placement})} data-v={outcome===undefined?undefined:outcome?'a':'r'} key={`${seed}-${seat}`}><div className="vt-coin-in"><span className="vt-face vt-cback"><i/></span><span className="vt-face vt-cfront">{outcome?<CheckIcon size={18}/>:<SwordsIcon size={18}/>}</span></div><i className="vt-glow"/></div>;
            })}
            {plan?.revealed.slice(1).map((tally,index)=>{
              const start=plan.ft[index]!;
              const end=index===plan.N-1?plan.S:plan.ft[index+1]!-.08;
              return <div className="vt-tally" style={{'--ts':start,'--te':end} as React.CSSProperties} key={index}><span><b className="a">찬성 {tally.a}</b> <b className="r">반대 {tally.r}</b></span>{tally.a+tally.r<plan.N&&<span className="u">미공개 {plan.N-tally.a-tally.r}</span>}</div>;
            })}
            {plan&&<><i className="vt-warm"/><i className="vt-cold"/>{plan.revealed.slice(1).map((tally,index)=><i className="vt-tint" style={{'--tc':tintOf(tally.a,tally.r,plan.N),'--ft':plan.ft[index]!.toFixed(3),'--fn':(index===plan.N-1?plan.S:plan.ft[index+1]!).toFixed(3)} as React.CSSProperties} key={`tint-${index}`}/>)}</>}
          </div>
        </div>
      </div>
    </div>
    {isResult? (plan?<>
      {plan&&<p className="vt-note">{plan.mode==='identity'?'자리 앞의 코인이 각자의 선택입니다 · 뒤집힌 코인이 곧 그 사람의 표':'표가 섞였습니다 · 누구의 표인지는 공개되지 않습니다'}</p>}
      <div className="vt-summary" style={{zIndex:31}}><span className="a">찬성 <b>{totals?.approve??0}</b></span><i>/</i><span className="r">반대 <b>{totals?.reject??0}</b></span></div>
      <h2 className={`vt-verdict ${resultPassed?'goodtext':'eviltext'}`}>{resultPassed?'원정대 승인':'원정대 부결'}</h2>
      <div className="vt-continue"><button className="primary" disabled={game.hasContinued} onClick={()=>call('VOTE_RESULT_CONTINUE',{roomCode:game.roomCode})}>{game.hasContinued?'계속 확인 완료':'계속'} ({game.continueConfirmedCount}/{game.players.length})</button></div>
    </>:null) : <div className="vote-stage">
      <h2>원정대 투표</h2><div className="team-chips">{game.proposedTeam.map(id=><span className="chip" key={id}><PlayerAvatar playerId={id} size={18}/>{game.players.find(player=>player.id===id)?.nickname}</span>)}</div>
      {game.players.find(player=>player.id===game.playerId)?.hasVoted?<><Pips done={game.teamVotesCompleted} total={game.players.length}/><p className="waiting">다른 기사를 기다리는 중<Dots/></p></>:<><div className="vote-tokens"><button className={`token approve${approve===true?' active':''}`} onClick={()=>setApprove(true)}><ShieldIcon size={26}/><span>찬성</span></button><button className={`token reject${approve===false?' active':''}`} onClick={()=>setApprove(false)}><SwordsIcon size={26}/><span>반대</span></button></div><button className="primary seal-btn" disabled={approve===null} onClick={()=>approve!==null&&call('TEAM_VOTE',{roomCode:game.roomCode,approve})}>원정 투표하기 ({game.teamVotesCompleted}/{game.players.length})</button></>}</div>}
  </section>;
}

function Board({game}:{game:ClientGameState}){
  const[approve,setApprove]=useState<boolean|null>(null);
  const[questCard,setQuestCard]=useState<'success'|'fail'|null>(null);
  const[openRound,setOpenRound]=useState<number|null>(null);
  const[questDisclosed,setQuestDisclosed]=useState(false);
  const me=game.playerId,leader=game.leaderId===me;
  const phase=game.phase;
  const leaderPlayer=game.players.find(p=>p.id===game.leaderId);
  const leaderName=leaderPlayer?.nickname;
  const teamChips=(ids:string[])=><div className="team-chips">{ids.map(id=><span className="chip" key={id}><PlayerAvatar playerId={id} size={18}/>{game.players.find(p=>p.id===id)?.nickname}</span>)}</div>;
  const meP=game.players.find(p=>p.id===me);
  const myTurn=phase==='team_build'?leader:phase==='team_vote'?!meP?.hasVoted:phase==='quest'?game.proposedTeam.includes(me)&&!meP?.hasQuestCard:phase==='assassination'?!!game.hasAssassinationAbility:false;
  const historyGame=phase==='quest_result'&&!questDisclosed?{...game,results:game.results.slice(0,-1),roundHistory:game.roundHistory.map(record=>record.round===game.round?{...record,fails:undefined,success:undefined}:record)}:game;
  useEffect(()=>{if(myTurn&&['team_vote','quest'].includes(phase))navigator.vibrate?.(60);},[myTurn,phase,game.round]);
  useEffect(()=>{setApprove(null);setQuestCard(null);},[phase,game.round,game.proposedTeam.join(',')]);

  return <>
    <header className="game-status" aria-label="현재 원정 현황">
      <div className="leader-row" aria-label="현재 리더와 부결 횟수">
        <CrownIcon size={15}/>{leaderPlayer&&<PlayerAvatar playerId={leaderPlayer.id} size={20}/>}<span>리더 <b>{leaderName}</b></span>
        <div className="reject-track" title="연속 부결 횟수">{Array.from({length:5}).map((_,i)=><i className={i<game.rejectCount?'used':''} key={i}/>)}</div>{game.rejectCount>0&&<small className={`reject-label${game.rejectCount>=4?' danger':''}`}>{game.rejectCount>=4?'한 번 더 부결되면 악의 승리':`부결 ${game.rejectCount}/5`}</small>}
      </div>
      <RoundHistory game={historyGame} open={openRound} setOpen={setOpenRound}/>
    </header>

    <main className="board">
      <PhaseRibbon game={game} turn={myTurn}/>

      {phase==='team_build'&&<TeamScene key={`${game.roomCode}:${game.round}:${game.rejectCount}:${game.leaderId}`} game={game}/>}

      {(phase==='team_vote'||phase==='vote_result')&&<VoteStage game={game} approve={approve} setApprove={setApprove}/>}

      {(phase==='quest'||phase==='quest_result')&&<QuestScene key={`${game.roomCode}:${game.round}`} game={game} onResolved={setQuestDisclosed}><div className="quest-stage">
        <h2>원정 카드 제출</h2>
        {teamChips(game.proposedTeam)}
        {game.proposedTeam.includes(me)?
          game.players.find(p=>p.id===me)?.hasQuestCard?
            <><div className="card-back"><CheckIcon size={20}/><span>제출 완료</span></div><Pips done={game.questCardsCompleted} total={game.proposedTeam.length}/></>
          :<><div className="quest-cards">
            <button className={`qcard success${questCard==='success'?' active':''}`} onClick={()=>setQuestCard('success')}><FactionSeal team="good" size={42}/><span>원정 성공</span><small>SUCCESS</small></button>
            <span className="qcard-disabled-wrap" title="선의 세력은 원정 실패를 선택할 수 없습니다.">
              <button className={`qcard fail${questCard==='fail'?' active':''}`} disabled={ROLE_DEFINITIONS[game.selfRole!].team==='good'} onClick={()=>setQuestCard('fail')} aria-describedby={ROLE_DEFINITIONS[game.selfRole!].team==='good'?'fail-card-disabled-note':undefined}><FactionSeal team="evil" size={42}/><span>원정 실패</span><small>{ROLE_DEFINITIONS[game.selfRole!].team==='good'?'선택 불가':'FAIL'}</small></button>
            </span>
          </div>{ROLE_DEFINITIONS[game.selfRole!].team==='good'&&<p className="quest-rule-note" id="fail-card-disabled-note">선의 세력은 원정 실패를 선택할 수 없습니다.</p>}<div className="quest-actions"><button className="primary seal-btn" disabled={!questCard} onClick={()=>questCard&&call('QUEST_CARD',{roomCode:game.roomCode,card:questCard})}>원정 {questCard==='success'?'성공':'실패'} 선택하기 ({game.questCardsCompleted}/{game.proposedTeam.length})</button></div></>
        :<div className="card-back"><span>원정대가 제출 중</span><Dots/></div>}
      </div></QuestScene>}

      {phase==='assassination'&&<AssassinScene key={game.roomCode} game={game}/>}

    </main>
  </>;
}

/* ------------------------------------------------------------------
   채팅 — 모바일 메신저 UX
   · 모바일: 전체 화면 채팅 화면(키보드 바로 위에 입력창 고정, 대화만 스크롤)
   · 데스크톱: 기존처럼 우하단 플로팅 패널
   · 말풍선 묶음/시간 표시, 위로 읽는 중 자동 스크롤 중단 + "새 메시지" 버튼
   ------------------------------------------------------------------ */
const CHAT_MOBILE_QUERY='(max-width: 640px), (pointer: coarse) and (max-width: 900px)';
const CHAT_GROUP_MS=3*60_000;
type ChatMsg=NonNullable<ClientGameState['chat']>[number];
const chatAt=(m:ChatMsg)=>(m as {at?:number}).at;
const chatTime=(at?:number)=>at?new Date(at).toLocaleTimeString('ko-KR',{hour:'numeric',minute:'2-digit'}):'';
let chatDraft=''; // 채팅을 닫았다 열어도 쓰던 글 유지
type ChatSize='mini'|'half'|'full';
// 모바일 채팅은 '독(mini)'과 '시트(half)' 두 단계뿐이다. (예전 mini→half→full 3단계는 체감상 너무 자주 바뀌었다)
//  독   : 게임 위에 항상 떠 있다. 대화 말풍선(최근 3개)은 게임 위에 겹쳐 보이되 터치는 통과, 입력창·행동 버튼만 눌린다.
//  시트 : 지난 대화를 읽을 때만 연다. 높이 78% — 위쪽에 게임이 살짝 보이고, 거기를 탭하거나 ⌄ 를 누르면 독으로 돌아간다.
const CHAT_COMPOSE_H=60;                 // 입력창 줄 높이(px)
const CHAT_ACT_H=56;                     // 행동 줄(준비·투표·계속) 높이
const CHAT_FEED_ROW_H=34;                // 말풍선 한 줄 높이. 줄 수는 화면 높이에 맞춰 1~3개(키보드·가로모드에서는 줄임)
const CHAT_FEED_TTL=45_000;              // 새 말풍선이 독에 떠 있는 시간. 조용해지면 사라져 게임 화면이 깨끗해진다(지난 대화는 ⌃ 시트에 그대로)


function useVisualHeight(){
  const[h,setH]=useState(()=>Math.round(window.visualViewport?.height??window.innerHeight));
  useEffect(()=>{
    const vv=window.visualViewport;const u=()=>setH(Math.round(vv?.height??window.innerHeight));
    vv?.addEventListener('resize',u);window.addEventListener('resize',u);
    return()=>{vv?.removeEventListener('resize',u);window.removeEventListener('resize',u);};
  },[]);
  return h;
}
function useChatMobile(){
  const[mobile,setMobile]=useState(()=>window.matchMedia(CHAT_MOBILE_QUERY).matches);
  useEffect(()=>{const mq=window.matchMedia(CHAT_MOBILE_QUERY);const update=()=>setMobile(mq.matches);mq.addEventListener('change',update);return()=>mq.removeEventListener('change',update);},[]);
  return mobile;
}

/* 채팅 화면 위에 항상 보여줄 '게임 진행 상태'. mine=true 이면 내가 눌러야 게임이 진행된다 */
const CHAT_PHASES=['lobby','team_build','team_vote','vote_result','quest_result']; // 원정 결단(quest)·암살·결과는 연출에 집중하도록 채팅 없음
type ChatAct='ready'|'start'|'vote'|'continue'|'board';
function chatGameStatus(game:ClientGameState):{label:string;text:string;count:string;mine:boolean;act:ChatAct|null}{
  const n=game.players.length;
  const me=game.players.find(p=>p.id===game.playerId);
  const leader=game.players.find(p=>p.id===game.leaderId)?.nickname??'리더';
  switch(game.phase){
    case 'lobby':{
      const ready=game.players.filter(p=>p.ready).length,host=game.playerId===game.hostId;
      if(!me?.ready)return{label:'대기실',text:'준비 완료를 눌러주세요',count:`${ready}/${n}`,mine:true,act:'ready'};
      if(host&&ready===n)return{label:'대기실',text:'모두 준비됐어요. 게임을 시작하세요',count:`${ready}/${n}`,mine:true,act:'start'};
      return{label:'대기실',text:'다른 기사를 기다리는 중',count:`${ready}/${n}`,mine:false,act:null};
    }
    case 'team_build':
      return game.leaderId===game.playerId
        ?{label:'원정대 구성',text:'내가 리더예요. 원정대를 지명하세요',count:'',mine:true,act:'board'}
        :{label:'원정대 구성',text:`${leader}님이 원정대를 고르는 중`,count:'',mine:false,act:null};
    case 'team_vote':
      return !me?.hasVoted
        ?{label:'신뢰의 투표',text:'찬성 · 반대를 선택하세요',count:`${game.teamVotesCompleted}/${n}`,mine:true,act:'vote'}
        :{label:'신뢰의 투표',text:'다른 기사를 기다리는 중',count:`${game.teamVotesCompleted}/${n}`,mine:false,act:null};
    case 'vote_result':
      return !game.hasContinued
        ?{label:'원탁의 판결',text:"결과를 보고 '계속'을 눌러주세요",count:`${game.continueConfirmedCount}/${n}`,mine:true,act:'continue'}
        :{label:'원탁의 판결',text:'다른 기사를 기다리는 중',count:`${game.continueConfirmedCount}/${n}`,mine:false,act:null};
    case 'quest_result':
      return !game.hasContinued
        ?{label:'원정 보고',text:"결과를 확인하고 '계속'을 눌러주세요",count:`${game.continueConfirmedCount}/${n}`,mine:true,act:'continue'}
        :{label:'원정 보고',text:'다른 기사를 기다리는 중',count:`${game.continueConfirmedCount}/${n}`,mine:false,act:null};
    default:
      return{label:'원정 보고',text:'결과를 확인하는 중',count:'',mine:false,act:null};
  }
}

/* 공개 연출(투표 코인 · 원정 카드)이 끝나 게임 화면의 '계속' 버튼이 실제로 나타났는지 감지한다.
   연출을 건너뛰고 눌러버리는 것을 막고, 연출 동안에는 채팅이 화면을 가리지 않게 하는 기준이 된다.
   · 투표 공개: .vt-continue 가 페이드인 완료  · 원정 보고: 판결 카드의 '계속' 버튼이 활성화('결과 바로 보기'로 건너뛴 경우도 포함) */
function useRevealDone(phase:string,active:boolean){
  const[done,setDone]=useState(false);
  useEffect(()=>{
    if(!active){setDone(false);return;}
    const check=()=>{
      if(phase==='vote_result'){const el=document.querySelector<HTMLElement>('.vt-continue');if(el&&parseFloat(getComputedStyle(el).opacity)>.95)setDone(true);}
      else{const btn=document.querySelector<HTMLButtonElement>('.cs-quest-verdict .primary');if(btn&&!btn.disabled)setDone(true);}
    };
    check();
    const iv=window.setInterval(check,300);
    const safety=window.setTimeout(()=>setDone(true),20000);   // 안전망: 연출 DOM 을 못 찾아도 영원히 막히지 않게
    return()=>{window.clearInterval(iv);window.clearTimeout(safety);};
  },[active,phase]);
  return done;
}

/* 채팅 안의 '행동 도크' — 준비 · 투표 · 계속을 채팅을 떠나지 않고 바로 누른다.
   '채팅 ↔ 게임' 왕복의 가장 큰 원인(버튼 하나 누르려고 채팅을 접었다 다시 여는 것)을 없앤다. */
function ChatAction({game,st,toGame}:{game:ClientGameState;st:ReturnType<typeof chatGameStatus>;toGame:()=>void}){
  const[pick,setPick]=useState<boolean|null>(null);
  const[busy,setBusy]=useState(false);
  useEffect(()=>{setPick(null);setBusy(false);},[game.phase,game.round,game.rejectCount,st.act]);
  const room=game.roomCode;
  const fire=(name:string,data:Record<string,unknown>={})=>{if(busy)return;setBusy(true);Promise.resolve(call(name,{roomCode:room,...data})).finally(()=>window.setTimeout(()=>setBusy(false),600));};
  const names=game.proposedTeam.map(id=>game.players.find(p=>p.id===id)?.nickname).filter(Boolean).join(' · ');
  const small=st.act==='vote'?`${st.label} · ${st.count}`:`${st.label}${st.count?` · ${st.count}`:''}`;
  let text=st.text,btns:React.ReactNode=null;
  switch(st.act){
    case 'ready':btns=<button type="button" className="ac-act-go" disabled={busy} onClick={()=>fire('PLAYER_READY')}>준비 완료</button>;break;
    case 'start':btns=<button type="button" className="ac-act-go" disabled={busy} onClick={()=>fire('GAME_START')}>게임 시작</button>;break;
    case 'vote':
      text=names?`원정대 ${names}`:st.text;
      btns=pick===null
        ?<><button type="button" className="ac-act-yes" onClick={()=>setPick(true)}>찬성</button><button type="button" className="ac-act-no" onClick={()=>setPick(false)}>반대</button></>
        :<><button type="button" className="ac-act-sub" disabled={busy} onClick={()=>setPick(null)}>변경</button><button type="button" className={pick?'ac-act-yes on':'ac-act-no on'} disabled={busy} onClick={()=>fire('TEAM_VOTE',{approve:pick})}>{pick?'찬성':'반대'} 확정</button></>;
      break;
    case 'continue':
      btns=<button type="button" className="ac-act-go" disabled={busy} onClick={()=>fire(game.phase==='quest_result'?'QUEST_RESULT_CONTINUE':'VOTE_RESULT_CONTINUE')}>계속</button>;
      break;
    case 'board':btns=<button type="button" className="ac-act-go" onClick={toGame}>고르러 가기 ›</button>;break;
  }
  return <div className="ac-act" role="group" aria-label={`${st.label}: ${st.text}`}>
    <span className="ac-act-txt"><small>내 차례 · {small}</small><b>{text}</b></span>
    <span className="ac-act-btns">{btns}</span>
  </div>;
}

function ChatPanel({game,close}:{game:ClientGameState;close:()=>void}){
  const[draft,setDraftState]=useState(chatDraft);
  const[unread,setUnread]=useState(0);
  const mobile=useChatMobile();
  const vh=useVisualHeight();
  const feedRows=vh<430?1:vh<560?2:3;   // 키보드가 올라오거나 가로모드로 화면이 낮으면 말풍선을 줄여 게임을 지킨다
  const messages=game.chat??[];
  const resolve=useCharacterResolver(game.players,game.playerId);
  const panelRef=useRef<HTMLElement>(null);
  const listRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const stick=useRef(true);
  const lastId=useRef(messages[messages.length-1]?.id); // 길이가 아니라 '마지막 메시지 id'로 새 메시지를 감지 (서버가 오래된 메시지를 잘라내면 길이가 그대로라 놓침)
  const closeRef=useRef(close);closeRef.current=close;
  const setDraft=(value:string)=>{chatDraft=value;setDraftState(value);};
  const[size,setSize]=useState<ChatSize>('mini');   // 모바일: 항상 하단에 붙어 있는 mini 로 시작 (열고 닫는 개념 없음)
  const isMini=mobile&&size==='mini';
  closeRef.current=mobile?()=>setSize('mini'):close;      // 모바일에서 '닫기'는 mini 로 접기
  /* 게임 상태가 바뀌어 '내가 할 일'이 생기면 진동 + 행동 도크 번쩍.
     예전처럼 채팅을 저절로 접지 않는다(글 쓰다 화면이 튀는 문제). 행동은 채팅 안의 도크에서 바로 한다. */
  const st0=chatGameStatus(game);
  const revealDone=useRevealDone(game.phase,st0.act==='continue');
  const revealing=mobile&&st0.act==='continue'&&!revealDone;      // 투표·원정 공개 연출 중
  const st=revealing?{...st0,mine:false,act:null,text:'결과를 공개하는 중…'}:st0;   // 연출이 끝나는 순간 mine 이 켜져 진동·도크가 그때 나타난다
  useEffect(()=>{            // 공개 연출은 이 게임의 하이라이트 — 펼쳐 둔 채팅(글 쓰는 중이 아닐 때)은 연출 시작과 함께 mini 로 내려간다
    if(!revealing||size==='mini')return;
    const typing=document.activeElement===inputRef.current||chatDraft.trim().length>0;
    if(!typing)setSize('mini');
  },[revealing]);
  const alertKey=`${game.phase}:${game.round}:${game.rejectCount}:${st.mine}`;
  const prevKey=useRef(alertKey);
  useEffect(()=>{
    if(!mobile||prevKey.current===alertKey)return;
    prevKey.current=alertKey;
    if(st.mine)navigator.vibrate?.([40,60,40]);
  },[alertKey,mobile]);
  const showAct=mobile&&st.mine&&!!st.act&&!(isMini&&st.act==='board');   // mini 에선 게임이 그대로 보이므로 '보드에서 고르기'는 생략
  const curLastId=messages[messages.length-1]?.id;
  const seenRef=useRef<string|undefined>(curLastId);   // mini 에서 놓친 새 메시지 수 계산용: 펼쳐 봤거나 내가 보낸 시점까지는 '본 것'
  useEffect(()=>{if(!isMini)seenRef.current=curLastId;},[isMini,curLastId]);
  /* 독의 말풍선: '이 기기에서 새로 도착한' 메시지만 TTL 동안 보여 준다. (서버 시각이 아니라 도착 시각 기준 → 기기 시계가 달라도 안전)
     입장 시점에 이미 있던 대화는 숨기고, 지난 대화는 ⌃ 로 연다. */
  const arrivals=useRef(new Map<string,number>());
  const firstPaint=useRef(true);
  for(const m of messages)if(!arrivals.current.has(m.id))arrivals.current.set(m.id,firstPaint.current?0:Date.now());
  useEffect(()=>{firstPaint.current=false;},[]);
  const[,tick]=useState(0);
  useEffect(()=>{if(!isMini)return;const iv=window.setInterval(()=>tick(x=>x+1),4000);return()=>window.clearInterval(iv);},[isMini]);
  const feed=isMini&&!revealing?messages.slice(-feedRows).filter(m=>Date.now()-(arrivals.current.get(m.id)??0)<CHAT_FEED_TTL):[];
  const hiddenUnseen=(()=>{if(!isMini)return 0;const i=seenRef.current?messages.findIndex(m=>m.id===seenRef.current):-1;const tail=i>=0?messages.slice(i+1):messages;const shown=new Set(feed.map(m=>m.id));return tail.filter(m=>m.playerId!==game.playerId&&!shown.has(m.id)).length;})();
  const dockSolid=CHAT_COMPOSE_H+(showAct?CHAT_ACT_H:0);          // 실제로 눌리는 영역 = 게임 화면이 비워 줘야 하는 높이
  const feedPad=revealing?0:feedRows*(CHAT_FEED_ROW_H+4)+8;        // 말풍선(패널 위로 자라남)이 차지할 수 있는 높이 — 게임 화면 여백 계산용
  const dockTotal=dockSolid+feedPad;            // 겹쳐 보이는 말풍선까지 포함한 패널 전체 높이 (공개 연출 중엔 말풍선을 숨긴다)
  const toBottom=(smooth=false)=>{const el=listRef.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:smooth?'smooth':'auto'});};

  useLayoutEffect(()=>{toBottom();},[]);
  useLayoutEffect(()=>{stick.current=true;setUnread(0);if(!isMini)toBottom();},[isMini]);   // mini ↔ 확장 전환 시 항상 최신 메시지 위치
  useLayoutEffect(()=>{
    const prevId=lastId.current;
    if(curLastId===prevId)return;
    lastId.current=curLastId;
    const idx=prevId==null?-1:messages.findIndex(m=>m.id===prevId);
    const added=idx>=0?messages.length-1-idx:messages.length;   // 이전 마지막 메시지가 목록에서 밀려났으면 전부 새 메시지
    if(added<=0)return;
    // 내가 보냈거나 맨 아래를 보고 있으면 따라가고, 위쪽을 읽는 중이면 위치를 지킨다.
    if(stick.current||messages[messages.length-1]?.playerId===game.playerId){
      stick.current=true;toBottom();setUnread(0);
      requestAnimationFrame(()=>{if(stick.current)toBottom();}); // 글꼴·이모지 로딩/줄바꿈으로 높이가 늦게 확정돼도 맨 아래 유지
    }else setUnread(n=>n+added);
  },[curLastId]);
  useEffect(()=>{
    // 키보드가 열리거나 입력창이 늘어나 목록 높이가 바뀌어도 맨 아래를 유지한다.
    const el=listRef.current;if(!el||typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(()=>{if(stick.current)toBottom();});ro.observe(el);return()=>ro.disconnect();
  },[isMini]);

  // 모바일 하단 도킹 채팅: mini(항상 보임, 게임이 거의 그대로) → half → full.
  // mini/half 는 게임 화면이 시트 높이만큼 위로 스크롤될 수 있게 여백을 만들고, full 은 배경을 잠근다.
  // half 에서 키보드가 올라오면 전체 높이를, mini 는 키보드 바로 위에 그대로 붙어 게임을 계속 보여준다.
  const sizeRef=useRef<ChatSize|null>(null);
  const animTimer=useRef(0);
  useLayoutEffect(()=>{
    if(!mobile)return;
    const root=document.documentElement;
    const vv=window.visualViewport;const panel=panelRef.current;
    const fit=()=>{
      if(!panel)return;
      const vvH=vv?.height??window.innerHeight,top0=vv?.offsetTop??0;
      const kb=window.innerHeight-vvH>120;
      const mode:ChatSize=size; // 키보드가 올라와도 크기를 강제로 키우지 않는다 (mini 는 키보드 바로 위에 붙고 게임이 계속 보인다)
      let h:string,top:string,pad:string;
      if(mode==='mini'){
        const safe=kb?'0px':'env(safe-area-inset-bottom,0px)';
        h=`calc(${dockSolid}px + ${safe})`;top=`calc(${top0+vvH}px - ${dockSolid}px - ${safe})`;pad=`calc(${dockTotal}px + ${safe})`;
      }else{
        const hh=kb||mode==='full'?vvH:Math.min(vvH,Math.max(320,Math.round(vvH*.78)));
        h=`${hh}px`;top=`${top0+vvH-hh}px`;pad=mode==='full'?'0px':`${Math.max(320,Math.round(window.innerHeight*.78))}px`;
      }
      const put=(el:HTMLElement,k:string,v:string)=>{if(el.style.getPropertyValue(k)!==v)el.style.setProperty(k,v);};
      put(panel,'--chat-h',h);put(panel,'--chat-top',top);
      if(panel.dataset.size!==mode)panel.dataset.size=mode;
      const kbs=String(kb);if(panel.dataset.keyboard!==kbs)panel.dataset.keyboard=kbs;
      put(root,'--chat-pad',pad);
      if(!root.classList.contains('chat-half'))root.classList.add('chat-half');
      const lock=mode!=='mini'&&kb;                       // 시트에서 키보드가 열린 동안만 뒤 화면 스크롤 잠금
      if(root.classList.contains('chat-open')!==lock)root.classList.toggle('chat-open',lock);
    };
    // 독 ↔ 시트 전환일 때만 높이·위치를 부드럽게 움직인다. 키보드 때문에 생기는 변화는 즉시 따라가야 하므로 애니메이션을 걸지 않는다.
    if(panel&&sizeRef.current!==size&&sizeRef.current!==null){
      panel.dataset.anim='1';root.dataset.chatAnim='1';window.clearTimeout(animTimer.current);
      animTimer.current=window.setTimeout(()=>{delete panel.dataset.anim;delete root.dataset.chatAnim;},340);
    }
    sizeRef.current=size;
    let raf=0;
    const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;fit();});};
    fit();vv?.addEventListener('resize',schedule);vv?.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);
    return()=>{cancelAnimationFrame(raf);vv?.removeEventListener('resize',schedule);vv?.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);root.classList.remove('chat-open','chat-half');delete root.dataset.chatAnim;root.style.removeProperty('--chat-pad');};
  },[mobile,size,dockSolid,dockTotal]);
  // 핸들/제목줄: 탭 = 펼치기(mini→half), 위로 끌기 = 크게, 아래로 끌기 = 작게(키보드가 열려 있으면 키보드부터 내림)
  const onSheetDown=(e:React.PointerEvent)=>{
    const y0=e.clientY;
    const up=(ev:PointerEvent)=>{
      window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
      if(ev.clientY-y0>48){
        if(inputRef.current&&document.activeElement===inputRef.current){inputRef.current.blur();return;}   // 키보드가 열려 있으면 키보드부터
        setSize('mini');
      }
    };
    window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  };
  // 모바일: 펼친 상태(half/full)에서만 기기 뒤로가기 한 번으로 mini 로 접는다 (mini 일 땐 기록을 쌓지 않는다)
  const expanded=mobile&&size!=='mini';
  useEffect(()=>{
    if(!expanded)return;
    history.pushState({chatSheet:true},'');
    const onPop=()=>closeRef.current();window.addEventListener('popstate',onPop);
    return()=>{window.removeEventListener('popstate',onPop);if(history.state?.chatSheet)history.back();};
  },[expanded]);
  // 모바일 half(중간) 상태: 채팅 밖(게임 화면)을 탭하면 mini 로 내려간다 — 핸들을 잡고 내리지 않아도 된다.
  // click 캡처 단계에서 감지하므로 스크롤·드래그(click 이 발생하지 않음)는 영향이 없고,
  // 탭한 게임 버튼은 막지 않고 그대로 동작한다(접히기와 동시에 눌림). 키보드가 열려 있으면 함께 내린다.
  useEffect(()=>{
    if(!mobile||size!=='half')return;
    const onTapOutside=(e:MouseEvent)=>{
      const t=e.target as Element|null;
      if(t?.closest?.('.chat-panel'))return;
      inputRef.current?.blur();
      closeRef.current();
    };
    document.addEventListener('click',onTapOutside,true);
    return()=>document.removeEventListener('click',onTapOutside,true);
  },[mobile,size]);
  useLayoutEffect(()=>{ // 줄 수에 따라 입력창 높이 자동 조절(최대 약 4줄)
    const el=inputRef.current;if(!el)return;el.style.height='auto';el.style.height=`${Math.min(el.scrollHeight,112)}px`;
  },[draft]);

  const onScroll=()=>{const el=listRef.current;if(!el)return;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;if(stick.current)setUnread(0);};
  const send=(event?:React.FormEvent)=>{
    event?.preventDefault();const text=draft.trim();if(!text)return;
    seenRef.current=messages[messages.length-1]?.id;setDraft('');call('CHAT_SEND',{roomCode:game.roomCode,text});
    stick.current=true;setUnread(0);toBottom();
    inputRef.current?.focus(); // 전송 후에도 키보드 유지
  };
  const coarse=window.matchMedia('(pointer: coarse)').matches;
  const joins=(a?:ChatMsg,b?:ChatMsg)=>{
    if(!a||!b||a.playerId!==b.playerId)return false;
    const ta=chatAt(a),tb=chatAt(b);return ta&&tb?tb-ta<CHAT_GROUP_MS:true;
  };
  return <aside ref={panelRef} className="chat-panel" data-reveal={revealing&&isMini?'true':undefined} aria-label="원탁 채팅">
    {isMini?<>
      <div className="ac-mini-feed" role="log" aria-live="polite">
        {feed.map(m=>{
          const mine=m.playerId===game.playerId,c=resolve(m.playerId);
          return <div key={m.id} className={`ac-mini-row${mine?' mine':''}`}><i className="ac-avatar has-char" style={{background:c.bg}} aria-hidden="true">{c.emoji}</i><span><b>{mine?'나':m.nickname}</b>{m.text}</span></div>;
        })}
      </div>
      {showAct&&<ChatAction game={game} st={st} toGame={()=>closeRef.current()}/>}
    </>:<>
    <div className="chat-title" onPointerDown={mobile?onSheetDown:undefined}>
      {mobile&&<i className="ac-grip" aria-hidden="true"/>}
      <button type="button" className="ac-back" onClick={()=>closeRef.current()} aria-label="채팅 접기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <span>원탁의 대화</span><small>DISCUSSION</small>
      <button type="button" className="ac-size" onClick={()=>setSize('mini')} aria-label="채팅 접기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <button type="button" className="ac-close" onClick={close} aria-label="채팅 닫기">×</button>
    </div>
    {mobile&&(showAct?<ChatAction game={game} st={st} toGame={()=>closeRef.current()}/>:<button type="button" key={alertKey} className={`ac-game${st.mine?' mine':''}`} onClick={()=>closeRef.current()} aria-label={`게임 화면으로 돌아가기. ${st.label}: ${st.text}`}>
      <i className="ac-game-dot" aria-hidden="true"/>
      <span className="ac-game-txt"><small>{st.mine?'내 차례':st.label}{st.count&&` · ${st.count}`}</small><b>{st.text}</b></span>
      <span className="ac-game-go" aria-hidden="true">{st.mine?'게임으로':'게임 보기'} ›</span>
    </button>)}
    <div className="ac-list-wrap">
      <div className="ac-list" ref={listRef} onScroll={onScroll} onClick={()=>{if(mobile)inputRef.current?.blur();}} role="log" aria-live="polite">
        {messages.length===0&&<div className="ac-empty">아직 대화가 없습니다.<br/>원정대를 논의해보세요.</div>}
        {messages.map((m,i)=>{
          const prev=messages[i-1],next=messages[i+1];const mine=m.playerId===game.playerId;
          const first=!joins(prev,m);
          const last=!next||!joins(m,next)||chatTime(chatAt(next))!==chatTime(chatAt(m));
          return <div key={m.id} className={`ac-msg${mine?' mine':''}${first?' first':''}${last?' last':''}`}>
            {!mine&&<i className={`ac-avatar${first?' has-char':''}`} style={first?{background:resolve(m.playerId).bg}:undefined} aria-hidden="true">{first?resolve(m.playerId).emoji:''}</i>}
            <div className="ac-msg-main">
              {!mine&&first&&<b>{m.nickname}<small>{resolve(m.playerId).name}</small></b>}
              <div className="ac-bubble-row"><span className="ac-bubble">{m.text}</span>{last&&chatTime(chatAt(m))&&<time>{chatTime(chatAt(m))}</time>}</div>
            </div>
          </div>;
        })}
      </div>
      {unread>0&&<button type="button" className="ac-new" onClick={()=>{toBottom(true);setUnread(0);}}>새 메시지 {unread>1?`${unread}개 `:''}↓</button>}
    </div>
    </>}
    <form className="ac-compose" onSubmit={send}>
      {isMini&&<button type="button" className="ac-expand" onClick={()=>setSize('half')} aria-label={hiddenUnseen>0?`지난 대화 보기, 새 메시지 ${hiddenUnseen}개`:'지난 대화 보기'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>{hiddenUnseen>0&&<em className="ac-badge">{hiddenUnseen>99?'99+':hiddenUnseen}</em>}</button>}
      <textarea ref={inputRef} rows={1} value={draft} maxLength={300} autoComplete="off" placeholder="원탁에 메시지 보내기" aria-label="채팅 메시지"
        onChange={event=>setDraft(event.target.value)}
        onKeyDown={event=>{
          // 데스크톱: Enter 전송 / Shift+Enter 줄바꿈. 모바일: Enter 는 줄바꿈, 전송은 버튼.
          // 한글 조합 중 Enter 는 무시해 마지막 글자가 중복 전송되지 않게 한다.
          if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&!coarse){event.preventDefault();send();}
        }}/>
      <button type="submit" className="ac-send" disabled={!draft.trim()} aria-label="전송" onMouseDown={event=>event.preventDefault()}><SpearIcon size={19}/></button>
    </form>
  </aside>;
}

function HelpModal({close}:{close:()=>void}){
  const roles=Object.entries(ROLE_DEFINITIONS) as Array<[keyof typeof ROLE_DEFINITIONS,(typeof ROLE_DEFINITIONS)[keyof typeof ROLE_DEFINITIONS]]>;
  return <div className="help-scrim" role="dialog" aria-modal="true" aria-label="아발론 도움말" onClick={close}>
    <section className="help-modal" onClick={event=>event.stopPropagation()}>
      <header><div><small>THE RESISTANCE: AVALON</small><h2>게임 도움말</h2></div><button onClick={close} aria-label="도움말 닫기">×</button></header>
      <div className="help-scroll">
        <section><h3>승리 조건</h3><div className="help-rule-grid"><div><FactionSeal team="good" size={30}/><p><b>선의 승리</b><br/>원정 3회 성공 후 암살 능력 보유자가 멀린을 찾지 못하면 승리합니다.</p></div><div><FactionSeal team="evil" size={30}/><p><b>악의 승리</b><br/>원정 3회 실패, 5회 연속 부결, 또는 멀린 암살 성공 시 승리합니다.</p></div></div></section>
        <section><h3>한 라운드의 흐름</h3><ol className="help-flow"><li>리더가 정해진 인원의 원정대를 지명합니다.</li><li>전원이 찬성·반대를 비밀리에 투표하고 함께 공개합니다.</li><li>승인된 원정대원만 비밀 원정 카드를 냅니다.</li><li>성공/실패 카드 수를 공개하고 다음 리더에게 넘깁니다.</li></ol><p className="help-note">선은 반드시 <b>성공</b> 카드를 냅니다. 악은 성공 또는 실패를 선택합니다. 7명 이상 게임의 4번째 원정은 실패 카드 2장부터 실패입니다.</p></section>
        <section><h3>역할 도감</h3><div className="help-roles">{roles.map(([id,role])=><article className={role.team} key={id}><RoleIcon role={id} team={role.team} size={20}/><div><b>{role.name}</b><small>{role.team==='good'?'선의 세력':'악의 세력'}</small><p>{role.description}</p></div></article>)}</div></section>
      </div>
    </section>
  </div>;
}

function RoleDossier({game,close}:{game:ClientGameState;close:()=>void}){
  const role=game.selfRole!;const def=ROLE_DEFINITIONS[role];
  return <aside className={`role-dossier ${def.team}`} aria-label="내 역할 정보"><button className="dossier-close" onClick={close} aria-label="내 역할 닫기">×</button><FactionSeal team={def.team} size={34}/><small>내 비밀 역할</small><h3>{def.name}</h3><p>{def.description}</p>{game.hasAssassinationAbility&&role!=='assassin'&&<p className="ability-note"><DaggerIcon size={15}/> 암살 능력 보유: 선이 원정 3회에 성공하면 멀린을 지목할 수 있습니다.</p>}<div className="dossier-intel"><b>능력 · 확인한 정보</b>{game.roleIntel.length?<ul>{game.roleIntel.map(item=><li key={item}>{item}</li>)}</ul>:<p>확인할 추가 정보가 없습니다.</p>}</div><ActiveRoles game={game}/></aside>;
}

function App(){
  const{game,error,setError,setGame}=useGame();
  const[chatOpen,setChatOpen]=useState(false);
  const[seenChatId,setSeenChatId]=useState<string|null>(null);
  const resolveChar=useCharacterResolver();
  const mobileChat=useChatMobile();   // 모바일: 채팅이 항상 하단에 붙어 있다 (열기/닫기 버튼 없음)
  const[peek,setPeek]=useState<{id:string;name:string;text:string;pid:string}|null>(null);
  const peekRef=useRef<{room?:string;id?:string}>({});
  const[helpOpen,setHelpOpen]=useState(false);
  const[dossierOpen,setDossierOpen]=useState(false);
  /* 채팅이 열린 채로 원정/암살 단계를 지나면 chatOpen 이 true 로 남아, 다음 라운드에서 채팅이 저절로 전체화면으로 다시 뜨던 문제 방지 */
  const chatAllowed=!!game&&CHAT_PHASES.includes(game.phase);
  /* 채팅을 닫아 둔 동안 남이 보낸 메시지는 4.5초간 말풍선으로 미리 보여준다 → 열었다 닫았다 하지 않아도 대화 흐름을 따라갈 수 있다 */
  const lastChat=game?.chat?.[game.chat.length-1];
  useEffect(()=>{
    const room=game?.roomCode;
    if(peekRef.current.room!==room){peekRef.current={room,id:lastChat?.id};return;}   // 방에 처음 들어왔을 때의 기존 메시지는 알리지 않는다
    if(!lastChat||lastChat.id===peekRef.current.id)return;
    peekRef.current.id=lastChat.id;
    if(chatOpen||mobileChat||!chatAllowed||lastChat.playerId===game?.playerId)return;
    const msg={id:lastChat.id,name:lastChat.nickname,text:lastChat.text,pid:lastChat.playerId};
    setPeek(msg);
    const t=window.setTimeout(()=>setPeek(p=>p?.id===msg.id?null:p),4500);
    return()=>window.clearTimeout(t);
  },[lastChat?.id,game?.roomCode]);
  useEffect(()=>{if(chatOpen)setPeek(null);},[chatOpen]);
  const openChat=()=>{setSeenChatId(game?.chat?.[game.chat.length-1]?.id??null);setPeek(null);setChatOpen(true);};
  useEffect(()=>{if(!chatAllowed&&chatOpen){setSeenChatId(game?.chat?.[game.chat.length-1]?.id??null);setChatOpen(false);}},[chatAllowed,chatOpen]);
  useLayoutEffect(()=>{
    if(!game||!['lobby','result'].includes(game.phase))return;
    const scrollTop=()=>window.scrollTo(0,0);
    scrollTop();
    const frame=requestAnimationFrame(scrollTop);
    return()=>cancelAnimationFrame(frame);
  },[game?.phase,game?.roomCode]);
  useEffect(()=>{if(!error)return;const timer=window.setTimeout(()=>setError(null),4000);return()=>window.clearTimeout(timer);},[error,setError]);
  useEffect(()=>{const root=document.documentElement;const move=(e:PointerEvent)=>{root.style.setProperty('--mx',`${e.clientX}px`);root.style.setProperty('--my',`${e.clientY}px`);};window.addEventListener('pointermove',move,{passive:true});return()=>window.removeEventListener('pointermove',move);},[]);
  const[confirmLeave,setConfirmLeave]=useState(false);
  /* 스토리보드 2 '시작 시': 서버가 role_reveal 로 바꾸는 순간 로비를 잠깐 더 붙들고(일렁임 → 조도 하강),
     화면이 20%로 어두워진 뒤에 역할 공개 화면으로 교체한다. 이 전환은 렌더 중에 감지해 한 프레임도 깜빡이지 않게 한다. */
  const lobbySnap=useRef<ClientGameState|null>(null);
  const[seenPhase,setSeenPhase]=useState(game?.phase);
  const[holdLobby,setHoldLobby]=useState(false);
  const[curtain,setCurtain]=useState(0);
  if(game?.phase==='lobby')lobbySnap.current=game;
  if(game?.phase!==seenPhase){
    setSeenPhase(game?.phase);
    if(seenPhase==='lobby'&&game?.phase==='role_reveal'&&lobbySnap.current){setHoldLobby(true);setCurtain(Date.now());}
  }
  /* 정상 경로: 커튼 애니메이션의 시작 이벤트 +1.5s 에 교체, 종료 이벤트에 해제.
     안전망: 모션 축소(커튼 없음)나 이벤트 유실 시에도 로비가 영원히 남지 않도록 타이머로 정리한다. */
  useEffect(()=>{
    if(!holdLobby)return;
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t=window.setTimeout(()=>setHoldLobby(false),(reduced?.4:6)*1000);
    return()=>window.clearTimeout(t);
  },[holdLobby]);
  useEffect(()=>{
    if(!curtain)return;
    const t=window.setTimeout(()=>setCurtain(0),8000);
    return()=>window.clearTimeout(t);
  },[curtain]);
  const ongoing=!!game&&!['lobby','result'].includes(game.phase);
  const leave=async()=>{
    if(!game)return;
    try{await emit('ROOM_LEAVE',{roomCode:game.roomCode});}catch(e:any){setError(e.message);setConfirmLeave(false);return;}
    localStorage.removeItem('avalon-session');setConfirmLeave(false);setGame(null);
  };
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setHelpOpen(false);setConfirmLeave(false);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
  return <>
    <Ambient phase={game?.phase??'home'}/>
    {game&&<PhaseBanner game={game}/>}
    <div className="app" data-phase={game?.phase??'home'}>
      {game&&<button className="leave-room" onClick={()=>setConfirmLeave(true)} aria-label="방 나가기"><span>↗</span> 나가기</button>}
      <div className="utility-actions">{game?.selfRole&&game.phase!=='result'&&game.phase!=='role_reveal'&&<button className="dossier-button" onClick={()=>setDossierOpen(value=>!value)}><EyeIcon size={15}/> 내 역할</button>}<button className="help-button" onClick={()=>setHelpOpen(true)} aria-label="게임 도움말">?</button></div>
      {!game?<Home/>
        :holdLobby&&lobbySnap.current?<Lobby game={lobbySnap.current} starting/>
        :game.phase==='lobby'?<Lobby game={game}/>
        :game.phase==='role_reveal'?<Role game={game}/>
        :game.phase==='result'?<EndingScene key={game.roomCode} game={game}/>
        :<Board game={game}/>} 
    </div>
    {game&&chatAllowed&&<>
      {!mobileChat&&!chatOpen&&peek&&<button type="button" key={peek.id} className="chat-peek" onClick={openChat} aria-label={`${peek.name}: ${peek.text}. 채팅 열기`}><i className="ac-avatar has-char" style={{background:resolveChar(peek.pid).bg}} aria-hidden="true">{resolveChar(peek.pid).emoji}</i><span><b>{peek.name}</b>{peek.text}</span></button>}
      {!mobileChat&&!chatOpen&&<button className="chat-toggle" onClick={openChat}><span>✦</span> 원탁 채팅 {(()=>{const list=game.chat??[];const idx=seenChatId?list.findIndex(item=>item.id===seenChatId):-1;const unread=seenChatId&&idx>=0?list.length-1-idx:list.length;return unread>0?<em className="ac-badge">{unread>99?'99+':unread}</em>:null;})()}</button>}
      {(mobileChat||chatOpen)&&<ChatPanel game={game} close={()=>{setSeenChatId(game.chat?.[game.chat.length-1]?.id??null);setChatOpen(false);}}/>} 
    </>} 
    {curtain>0&&<StartCurtain key={curtain} onStart={()=>{window.setTimeout(()=>setHoldLobby(false),LOBBY_TL.swap*1000);}} onEnd={()=>setCurtain(0)}/>}
    {helpOpen&&<HelpModal close={()=>setHelpOpen(false)}/>}
    {confirmLeave&&<ConfirmDialog title={ongoing?'원탁을 떠날까요?':'방에서 나갈까요?'} body={ongoing?'진행 중인 게임입니다. 이 기기의 재접속 정보가 삭제되고, 다른 참가자에게는 연결 해제로 표시됩니다.':'대기실에서 나가면 자리가 비워집니다.'} confirmLabel="나가기" cancelLabel="계속 플레이" onConfirm={leave} onCancel={()=>setConfirmLeave(false)}/>} 
    {game?.selfRole&&dossierOpen&&<RoleDossier game={game} close={()=>setDossierOpen(false)}/>} 
    {error&&<Toast message={error} onClose={()=>setError(null)}/>}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
