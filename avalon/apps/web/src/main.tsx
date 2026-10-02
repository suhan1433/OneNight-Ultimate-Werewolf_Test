import React,{useEffect,useMemo,useRef,useState} from 'react';
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
import {GateIntro,Table,useGateIntro} from './GateIntro';
import {RV,findMates,useHold} from './RoleScene';
import {LOBBY_TL,LobbyBackdrop,LobbyGlow,RoomCode,StartCurtain,shakeVars,useRoster,type GlowHandle} from './LobbyScene';
import {buildPlan,coinStyle,tintOf,useNewCoins,useReducedMotion,useRevealEffects,useTableMetrics,type Plan} from './VoteScene';

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
const BANNERS:Record<string,string>={team_build:'원정대 구성',team_vote:'신뢰의 투표',quest:'원정의 결단',assassination:'마지막 암살'};
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
function SeatFace({name}:{name:string}){
  return <><span className="avatar">{[...name][0]?.toUpperCase()??'?'}</span><span className="seat-name">{name}</span></>;
}
function Pips({done,total}:{done:number;total:number}){
  return <div className="pips" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="제출 현황">{Array.from({length:total},(_,i)=><i className={i<done?'on':''} key={i}/>)}</div>;
}
/* 원정 카드는 "섞어서" 공개되므로 실패 카드의 위치를 결정적으로 섞어 한 장씩 뒤집는다 */
function QuestReveal({total,fails}:{total:number;fails:number}){
  const order=useMemo(()=>{
    const arr=Array.from({length:total},(_,i)=>i<fails);
    let s=total*31+fails*17+7;
    for(let i=arr.length-1;i>0;i--){s=(s*9301+49297)%233280;const j=Math.floor(s/233280*(i+1));const current=arr[i]!;arr[i]=arr[j]!;arr[j]=current;}
    return arr;
  },[total,fails]);
  return <div className="quest-reveal" aria-hidden="true">{order.map((fail,i)=>
    <div className={`rcard ${fail?'fail':'success'}`} style={{'--i':i} as React.CSSProperties} key={i}>
      <div className="rcard-inner">
        <span className="rcard-back"><SealIcon size={38}/></span>
        <span className="rcard-front"><FactionSeal team={fail?'evil':'good'} size={40}/></span>
      </div>
    </div>)}
  </div>;
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

/* ---------- shared round-table layout ---------- */
function RoundTable({players,center,renderSeat,leaderId}:{players:any[];center:React.ReactNode;renderSeat:(p:any,i:number)=>React.ReactNode;leaderId?:string}){
  const radius=players.length>=8?39:42;
  return <div className={`table table--${players.length}`}>
    <div className="table-center">{center}</div>
    {players.map((p,i)=><div className="seat" style={{...seatPos(i,players.length,radius),'--i':i} as React.CSSProperties} key={p.id}>{p.id===leaderId&&<span className="leader-crown" title="리더"><CrownIcon size={16}/></span>}{renderSeat(p,i)}</div>)}
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
          return <span key={p.id} className={`rv-seat${p.id===game.playerId?' me':''}${isMate?' mate':''}`} style={{...pos,'--k':k} as React.CSSProperties}>{[...p.nickname][0]??'?'}</span>;
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
            ?<div className={`lb-seat${p.ready?' ready':''}${p.isBot?' bot':''}${p.id===game.playerId?' me':''}${roster.fresh.includes(p.id)?' fresh':''}`} style={seatAt(i)} key={p.id}>
              {p.id===game.hostId&&<span className="lb-crown" title="방장"><CrownIcon size={14}/></span>}
              <span className="lb-avatar">{letter(p.nickname)}{p.ready&&<span className="lb-ok"><CheckIcon size={11}/></span>}<i className="lb-flame" aria-hidden="true"/></span>
              <span className="lb-name">{p.id===game.playerId?'나 · ':''}{p.nickname}</span>
              {p.isBot&&<small>TEST BOT</small>}
            </div>
            :<div className="lb-seat empty" style={seatAt(i)} key={`e${i}`}><span className="lb-avatar"><i>{i+1}</i></span><span className="lb-name">빈 자리</span></div>;
        })}
        {roster.ghosts.map(g=><div className="lb-seat ghost" style={seatAt(g.index)} key={g.key} aria-hidden="true">
          <span className="lb-avatar">{letter(g.name)}<i className="lb-flame"/></span>
          <span className="lb-name">{g.name}</span>
          <span className="lb-smoke"><i style={{'--k':0} as React.CSSProperties}/><i style={{'--k':1} as React.CSSProperties}/><i style={{'--k':2} as React.CSSProperties}/></span>
        </div>)}
      </div>
    </div>
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
    <div className="round-detail-section expedition-detail"><div className="round-detail-label"><FactionSeal team="good" size={18}/><span>원정대</span></div><div className="expedition-content"><span className="leader-chip"><CrownIcon size={13}/> 리더 · {name(record.leaderId)}</span><div className="member-chips">{record.team.map(id=><span key={id}>{name(id)}</span>)}</div></div></div>
    <div className="round-detail-section"><div className="round-detail-label"><ShieldIcon size={18}/><span>찬반 투표</span></div>{voteComplete?<><div className="vote-summary"><span className="approve"><CheckIcon size={13}/> 찬성 <b>{record.approveCount}</b></span><span className="reject"><SwordsIcon size={13}/> 반대 <b>{record.rejectCount}</b></span></div>{game.options.revealVoteIdentities&&<div className="vote-groups"><div className="vote-group approve"><b><CheckIcon size={13}/> 찬성</b><div>{approved?.map(player=><span key={player.id}>{player.nickname}</span>)}</div></div><div className="vote-group reject"><b><SwordsIcon size={13}/> 반대</b><div>{rejected?.map(player=><span key={player.id}>{player.nickname}</span>)}</div></div></div>}</>:<div className="round-pending"><Dots/> 투표 진행 중</div>}</div>
    <div className="round-detail-section quest-detail"><div className="round-detail-label"><SwordsIcon size={18}/><span>원정 결과</span></div><div>{record.fails===undefined?<span className="round-pending"><Dots/> 원정 결과 대기 중</span>:<div className="quest-card-count"><span className="success"><ShieldIcon size={15}/> 성공 <b>{record.team.length-record.fails}</b></span><span className="fail"><SwordsIcon size={15}/> 실패 <b>{record.fails}</b></span></div>}</div></div>
  </section>}</>;
}

function ActiveRoles({game}:{game:ClientGameState}){
  return <section className="active-roles"><b>사용 캐릭터</b>{game.activeRoles.map((role,index)=>{const def=ROLE_DEFINITIONS[role];const delegated=!game.options.assassin&&game.options.assassinationAbilityRole===role;return <span className={def.team} key={`${role}-${index}`} title={delegated?`${def.description} 암살 능력을 함께 가집니다.`:def.description}><RoleIcon role={role} team={def.team} size={14}/>{def.name}{delegated&&<DaggerIcon size={12}/>}</span>;})}</section>;
}

/* 투표자는 좌석의 완료 점으로만 표시하고, 코인과 결과는 오직 합계로 만든다.
   따라서 이 화면은 revealedVotes처럼 개인과 선택을 연결하는 정보를 읽지 않는다. */
function VoteStage({game,approve,setApprove}:{game:ClientGameState;approve:boolean|null;setApprove:(value:boolean)=>void}){
  const rootRef=useRef<HTMLDivElement>(null);
  const tableRef=useRef<HTMLDivElement>(null);
  const isResult=game.phase==='vote_result';
  const totals=game.voteResult;
  const voteCount=isResult?(totals?.approve??0)+(totals?.reject??0):game.teamVotesCompleted;
  const seed=`${game.roomCode}|${game.round}|${[...game.proposedTeam].sort().join(',')}`;
  const plan=useMemo<Plan|null>(()=>isResult&&totals?buildPlan(totals.approve,totals.reject,seed):null,[isResult,totals?.approve,totals?.reject,seed]);
  const reduced=useReducedMotion();
  const initialCoins=useNewCoins(voteCount);
  useTableMetrics(tableRef,rootRef,isResult&&!reduced);
  useRevealEffects(plan,isResult&&!reduced);

  const style=plan?{'--R':`${plan.R}s`,'--S':`${plan.S}s`,'--ld':`${plan.ft[plan.N-1]!-.25}s`,'--sd':`${plan.S+1.2}s`,'--cd':`${plan.S+2}s`,'--kd':`${plan.S+.4}s`} as React.CSSProperties:undefined;
  const point=(id:string)=>{
    const index=game.players.findIndex(player=>player.id===id);
    const angle=(index/game.players.length)*Math.PI*2-Math.PI/2;
    return `${50+42*Math.cos(angle)},${50+42*Math.sin(angle)}`;
  };
  const teamPoints=game.proposedTeam.map(point).join(' ');
  const resultPassed=totals?.passed??false;

  return <section ref={rootRef} className={`vt${isResult?' is-reveal':''}${isResult?(resultPassed?' ok':' no'):''}${reduced?' is-final':''}`} style={style} aria-label={isResult?'원정대 투표 결과':'원정대 투표'}>
    <span className="vt-sr">{isResult?`찬성 ${totals?.approve??0}표, 반대 ${totals?.reject??0}표`: `투표 ${voteCount}/${game.players.length}명 완료`}</span>
    {isResult&&<div className="vt-dark" aria-hidden="true"/>}
    <div className="vt-wrap">
      <div className="vt-tilt vt-tilt--table">
        <div ref={tableRef} className={`table vt-table table--${game.players.length}`}>
          <div className="table-center"><div className="selection-core"><FactionSeal team="good" size={36}/><strong>{isResult?'투표 공개':`${voteCount} / ${game.players.length}`}</strong><span>{isResult?'원탁의 판결을 확인합니다':'찬성 또는 반대를 비밀리에 선택하세요'}</span></div></div>
          {game.players.map((player,index)=><div className="seat vt-seat" style={{...seatPos(index,game.players.length,game.players.length>=8?39:42),'--i':index} as React.CSSProperties} key={player.id}>
            {player.id===game.leaderId&&<span className={`leader-crown${isResult&&!resultPassed?' vt-crown-seat':''}`} title="리더"><CrownIcon size={16}/></span>}
            <div className="plate"><SeatFace name={player.nickname}/>{player.hasVoted&&<i className="vt-voted" aria-label="투표 완료"/>}</div>
          </div>)}
        </div>
        <div className="vt-tilt--top" aria-hidden="true">
          <svg className="vt-poly" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon className="vt-poly-fill" points={teamPoints}/><polygon className="vt-edge" points={teamPoints}/></svg>
          {!resultPassed&&isResult&&<span className="vt-crown" style={{'--a0':'-90deg','--a1':`${-90+360/game.players.length}deg`} as React.CSSProperties}><CrownIcon size={26}/></span>}
          <div className="vt-pool" aria-hidden="true">
            {Array.from({length:voteCount},(_,index)=>{
              const step=plan?.stepOf[index];
              const outcome=step===undefined?undefined:plan?.outcomes[step];
              return <div className={`vt-coin${index>=initialCoins?' drop':''}${plan&&step===plan.N-1?' lastcoin':''}`} style={coinStyle(index,seed,plan)} data-v={outcome===undefined?undefined:outcome?'a':'r'} key={`${seed}-${index}`}><div className="vt-coin-in"><span className="vt-face vt-cback"><i/></span><span className="vt-face vt-cfront">{outcome?<CheckIcon size={18}/>:<SwordsIcon size={18}/>}</span></div><i className="vt-glow"/></div>;
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
    {isResult? <>
      <div className="vt-summary" style={{zIndex:31}}><span className="a">찬성 <b>{totals?.approve??0}</b></span><i>/</i><span className="r">반대 <b>{totals?.reject??0}</b></span></div>
      <h2 className={`vt-verdict ${resultPassed?'goodtext':'eviltext'}`}>{resultPassed?'원정대 승인':'원정대 부결'}</h2>
      <div className="vt-continue"><button className="primary" disabled={game.hasContinued} onClick={()=>call('VOTE_RESULT_CONTINUE',{roomCode:game.roomCode})}>{game.hasContinued?'계속 확인 완료':'계속'} ({game.continueConfirmedCount}/{game.players.length})</button></div>
    </> : <div className="vote-stage">
      <h2>원정대 투표</h2><div className="team-chips">{game.proposedTeam.map(id=><span className="chip" key={id}>{game.players.find(player=>player.id===id)?.nickname}</span>)}</div>
      {game.players.find(player=>player.id===game.playerId)?.hasVoted?<><Pips done={game.teamVotesCompleted} total={game.players.length}/><p className="waiting">다른 기사를 기다리는 중<Dots/></p></>:<><div className="vote-tokens"><button className={`token approve${approve===true?' active':''}`} onClick={()=>setApprove(true)}><ShieldIcon size={26}/><span>찬성</span></button><button className={`token reject${approve===false?' active':''}`} onClick={()=>setApprove(false)}><SwordsIcon size={26}/><span>반대</span></button></div><button className="primary seal-btn" disabled={approve===null} onClick={()=>approve!==null&&call('TEAM_VOTE',{roomCode:game.roomCode,approve})}>원정 투표하기 ({game.teamVotesCompleted}/{game.players.length})</button></>}</div>}
  </section>;
}

function Board({game}:{game:ClientGameState}){
  const[team,setTeam]=useState<string[]>([]);
  const[approve,setApprove]=useState<boolean|null>(null);
  const[questCard,setQuestCard]=useState<'success'|'fail'|null>(null);
  const[openRound,setOpenRound]=useState<number|null>(null);
  const me=game.playerId,leader=game.leaderId===me;
  const phase=game.phase;
  const leaderPlayer=game.players.find(p=>p.id===game.leaderId);
  const leaderName=leaderPlayer?.nickname;
  const teamChips=(ids:string[])=><div className="team-chips">{ids.map(id=><span className="chip" key={id}>{game.players.find(p=>p.id===id)?.nickname}</span>)}</div>;
  const meP=game.players.find(p=>p.id===me);
  const myTurn=phase==='team_build'?leader:phase==='team_vote'?!meP?.hasVoted:phase==='quest'?game.proposedTeam.includes(me)&&!meP?.hasQuestCard:phase==='assassination'?!!game.hasAssassinationAbility:false;
  const questTotal=Math.max(game.proposedTeam.length||game.questSize,game.questResult?.fails??0);
  const questDelay=0.5+(questTotal-1)*0.55+0.9;
  const late=(s:number)=>({'--late':`${s}s`} as React.CSSProperties);
  useEffect(()=>{if(myTurn)navigator.vibrate?.(60);},[myTurn,phase,game.round]);
  useEffect(()=>{setTeam([]);setApprove(null);setQuestCard(null);},[phase,game.round,game.proposedTeam.join(',')]);

  return <>
    <header className="game-status" aria-label="현재 원정 현황">
      <div className="leader-row" aria-label="현재 리더와 부결 횟수">
        <CrownIcon size={15}/><span>리더 <b>{leaderName}</b></span>
        <div className="reject-track" title="연속 부결 횟수">{Array.from({length:5}).map((_,i)=><i className={i<game.rejectCount?'used':''} key={i}/>)}</div>{game.rejectCount>0&&<small className={`reject-label${game.rejectCount>=4?' danger':''}`}>{game.rejectCount>=4?'한 번 더 부결되면 악의 승리':`부결 ${game.rejectCount}/5`}</small>}
      </div>
      <RoundHistory game={game} open={openRound} setOpen={setOpenRound}/>
    </header>

    <main className={`board${phase==='assassination'?' tense':''}`}>
      <PhaseRibbon game={game} turn={myTurn}/>
      <ActiveRoles game={game}/>

      {phase==='team_build'&&<>
        <h2>원정대 구성 ({game.questSize}명)</h2>
        <RoundTable
          leaderId={game.leaderId ?? undefined}
          players={game.players}
          center={<div className="selection-core"><FactionSeal team="good" size={38}/><strong>{team.length} <small>/ {game.questSize}</small></strong><span>{leader?'원정대를 지명하세요':leaderPlayer?.isBot?`${leaderName}이(가) 원정대를 고르는 중입니다`:'리더가 원정대를 구성 중입니다'}{!leader&&<Dots/>}</span></div>}
          renderSeat={p=><button disabled={!leader} className={team.includes(p.id)?'selected':''} onClick={()=>setTeam(team.includes(p.id)?team.filter(x=>x!==p.id):team.length<game.questSize?[...team,p.id]:team)} aria-pressed={team.includes(p.id)}><SeatFace name={p.nickname}/></button>}
        />
        {leader&&<div className="selection-summary"><span>선택된 기사</span>{team.length?teamChips(team):<em>아직 선택된 기사가 없습니다</em>}</div>}
        {leader&&<button className="primary seal-btn" disabled={team.length!==game.questSize} onClick={()=>call('TEAM_PROPOSE',{roomCode:game.roomCode,team})}><ShieldIcon size={16}/> 원정대 제안</button>}
      </>}

      {(phase==='team_vote'||phase==='vote_result')&&<VoteStage game={game} approve={approve} setApprove={setApprove}/>}

      {phase==='quest'&&<div className="quest-stage">
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
      </div>}

      {phase==='quest_result'&&<>
        <QuestReveal total={questTotal} fails={game.questResult?.fails??0}/>
        <h2 className={`reveal-pop ${game.questResult?.success?'goodtext':'eviltext'}`} style={{animationDelay:`${questDelay}s`}}>{game.questResult?.success?'원정 성공!':'원정 실패'}</h2>
        <p className="muted late" style={late(questDelay+0.2)}>실패 카드 {game.questResult?.fails}장{game.round===3&&game.maxPlayers>=7?' · 이번 원정은 실패 2장부터 실패':''}</p>
        <button className="primary late" style={late(questDelay+0.6)} disabled={game.hasContinued} onClick={()=>call('QUEST_RESULT_CONTINUE',{roomCode:game.roomCode})}>{game.hasContinued?'계속 확인 완료':'계속'} ({game.continueConfirmedCount}/{game.players.length})</button>
      </>}

      {phase==='assassination'&&<>
        <h2>마지막 암살의 기회</h2>
        <RoundTable
          players={game.players.filter(p=>p.id!==me)}
          center={<DaggerIcon size={30}/>}
          renderSeat={p=>game.hasAssassinationAbility?
            <button className="target" onClick={()=>call('ASSASSIN_TARGET',{roomCode:game.roomCode,targetId:p.id})}><SeatFace name={p.nickname}/></button>
          :<div className="plate"><SeatFace name={p.nickname}/></div>}
        />
        {!game.hasAssassinationAbility&&<p className="waiting">암살 능력 보유자가 멀린을 지목하고 있습니다<Dots/></p>}
      </>}

    </main>
  </>;
}

function Result({game}:{game:ClientGameState}){
  const winners=game.revealedRoles?.filter(item=>ROLE_DEFINITIONS[item.role].team===game.winner)??[];
  return <section className={`center result-stage ${game.winner??'good'}`}>
    <div className="rays" aria-hidden="true"/>
    <div className={`crest ${game.winner==='good'?'goodtext':'eviltext'}`}>{game.winner==='good'?<ShieldIcon size={34}/>:<CrownIcon size={34}/>}</div>
    <h1 className={game.winner==='good'?'goodtext':'eviltext'}>{game.winner==='good'?'선의 승리':'악의 승리'}</h1>
    <p>{game.winReason}</p>
    <div className={`victory-summary ${game.winner==='good'?'good':'evil'}`}><FactionSeal team={game.winner??'good'} size={30}/><span><b>{game.winner==='good'?'선의 세력':'악의 세력'} {winners.length}명 승리</b><small>아래 역할 공개에서 각 기사의 결과를 확인하세요.</small></span></div>
    <div className="roster">
      {game.players.map(p=>{
        const role=game.revealedRoles?.find(x=>x.id===p.id)?.role;
        const def=role?ROLE_DEFINITIONS[role]:null;
        const won=!!def&&def.team===game.winner;
        return <div className={won?`winner ${def?.team}`:'loser'} key={p.id}>
          {def?<RoleIcon role={role!} team={def.team} size={18}/>:<span/>}
          <span>{p.nickname}</span>
          <span className="muted">{def?`${def.name}${game.revealedRoles?.find(x=>x.id===p.id)?.hasAssassinationAbility&&role!=='assassin'?' · 암살 능력':''}`:'—'}</span>
          <strong className={`result-badge ${won?'won':'lost'}`}>{won?'승리':'패배'}</strong>
        </div>;
      })}
    </div>
    {game.playerId===game.hostId&&<button className="primary restart-button" onClick={()=>call('GAME_RESTART',{roomCode:game.roomCode})}><ShieldIcon size={17}/> 새 게임 시작</button>}
  </section>;
}

function ChatPanel({game,close}:{game:ClientGameState;close:()=>void}){
  const[draft,setDraft]=useState('');
  const latestRef=useRef<HTMLDivElement>(null);
  const latestMessageId=game.chat?.[game.chat.length-1]?.id;
  useEffect(()=>{latestRef.current?.scrollIntoView({block:'end'});},[latestMessageId]);
  const send=(event:React.FormEvent)=>{event.preventDefault();const text=draft.trim();if(!text)return;setDraft('');call('CHAT_SEND',{roomCode:game.roomCode,text});};
  return <aside className="chat-panel" aria-label="원탁 채팅">
    <div className="chat-title"><span>원탁의 대화</span><small>DISCUSSION</small><button type="button" onClick={close} aria-label="채팅 닫기">×</button></div>
    <div className="chat-log" aria-live="polite">
      {game.chat?.length?game.chat.map(message=><div className={`chat-message ${message.playerId===game.playerId?'mine':''}`} key={message.id}><b>{message.nickname}</b><p>{message.text}</p></div>):<div className="chat-empty">아직 대화가 없습니다.<br/>원정대를 논의해보세요.</div>}<div ref={latestRef}/>
    </div>
    <form className="chat-compose" onSubmit={send}>
      <input value={draft} maxLength={300} onChange={event=>setDraft(event.target.value)} placeholder="원탁에 메시지 보내기" aria-label="채팅 메시지"/>
      <button type="submit" disabled={!draft.trim()} aria-label="전송"><SpearIcon size={17}/></button>
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
  return <aside className={`role-dossier ${def.team}`} aria-label="내 역할 정보"><button className="dossier-close" onClick={close} aria-label="내 역할 닫기">×</button><FactionSeal team={def.team} size={34}/><small>내 비밀 역할</small><h3>{def.name}</h3><p>{def.description}</p>{game.hasAssassinationAbility&&role!=='assassin'&&<p className="ability-note"><DaggerIcon size={15}/> 암살 능력 보유: 선이 원정 3회에 성공하면 멀린을 지목할 수 있습니다.</p>}<div className="dossier-intel"><b>능력 · 확인한 정보</b>{game.roleIntel.length?<ul>{game.roleIntel.map(item=><li key={item}>{item}</li>)}</ul>:<p>확인할 추가 정보가 없습니다.</p>}</div></aside>;
}

function App(){
  const{game,error,setError,setGame}=useGame();
  const[chatOpen,setChatOpen]=useState(false);
  const[helpOpen,setHelpOpen]=useState(false);
  const[dossierOpen,setDossierOpen]=useState(false);
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
        :game.phase==='result'?<Result game={game}/>
        :<Board game={game}/>} 
    </div>
    {game&&['lobby','team_build','team_vote','vote_result','quest_result'].includes(game.phase)&&<>
      {!chatOpen&&<button className="chat-toggle" onClick={()=>setChatOpen(true)}><span>✦</span> 원탁 채팅 {game.chat?.length?`(${game.chat.length})`:''}</button>}
      {chatOpen&&<ChatPanel game={game} close={()=>setChatOpen(false)}/>} 
    </>} 
    {curtain>0&&<StartCurtain key={curtain} onStart={()=>{window.setTimeout(()=>setHoldLobby(false),LOBBY_TL.swap*1000);}} onEnd={()=>setCurtain(0)}/>}
    {helpOpen&&<HelpModal close={()=>setHelpOpen(false)}/>}
    {confirmLeave&&<ConfirmDialog title={ongoing?'원탁을 떠날까요?':'방에서 나갈까요?'} body={ongoing?'진행 중인 게임입니다. 이 기기의 재접속 정보가 삭제되고, 다른 참가자에게는 연결 해제로 표시됩니다.':'대기실에서 나가면 자리가 비워집니다.'} confirmLabel="나가기" cancelLabel="계속 플레이" onConfirm={leave} onCancel={()=>setConfirmLeave(false)}/>} 
    {game?.selfRole&&dossierOpen&&<RoleDossier game={game} close={()=>setDossierOpen(false)}/>} 
    {error&&<Toast message={error} onClose={()=>setError(null)}/>}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
