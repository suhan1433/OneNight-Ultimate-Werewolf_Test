import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Card, CardDeclaration, CardOptions, GameConfig, PendingDecision, PlayedCard, Suit } from '@skullking/shared';
import { cardArt } from './card-art';
import { clearSession, emit, saveSession } from './socket';
import { playCardSound, unlockCardSounds } from './sound';
import { useGame } from './store';
import { fx } from './fx';
import { Avatar, Icon } from './icons';
import { Bubble, ChatInput, useChatSync } from './chat';
import './styles.css';

const SFX_PREF='skullking.effects';
const soundEnabled=()=>{try{return localStorage.getItem(SFX_PREF)!=='off';}catch{return true;}};
const setSoundEnabled=(enabled:boolean)=>{try{localStorage.setItem(SFX_PREF,enabled?'on':'off');}catch{/* 저장소를 사용할 수 없어도 현재 화면에서는 계속 작동 */}fx.setEnabled(enabled);};
fx.setEnabled(soundEnabled());
/** 사용자 제스처 안에서: 카드 효과음 + 앰비언트 오디오 잠금 해제 */
const unlock=()=>{unlockCardSounds();fx.unlock();};
type Pl=NonNullable<ReturnType<typeof useGame.getState>['game']>['players'][number];

const suits:Record<Suit,{icon:string;name:string}>={parrot:{icon:'parrot',name:'앵무새'},map:{icon:'map',name:'지도'},treasure:{icon:'treasure',name:'보물'},jolly:{icon:'jolly',name:'졸리 로저'}};
const emptyCards: CardOptions={kraken:false,whale:false,loot:false,pirateAbilities:false,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};
const fullCards: CardOptions={kraken:true,whale:true,loot:true,pirateAbilities:true,expansionSuitCards:true,wildMonkey:true,maryThorne:true,lastVolley:true,firstMateCon:true,stingray:true,davyJones:true,walkThePlank:true};
const cardSettings: Array<[keyof CardOptions,string,string]>=[
  ['kraken','Kraken','트릭 전체를 파괴합니다.'],['whale','White Whale','특수카드를 제거하고 가장 높은 숫자가 이깁니다.'],['loot','Loot ×2','다른 사람이 가져가고 둘 다 예측을 맞히면 각 +20점입니다.'],['pirateAbilities','Pirate Abilities','일반 Pirate 5명의 능력을 사용합니다.'],
  ['expansionSuitCards','수트 확장 12장','7(-5), 8(+5), 0/14를 넣습니다.'],['wildMonkey','Wild Monkey 15','검정을 제외한 수트를 선언하는 15입니다.'],['maryThorne','Mary Thorne','승리 후 다음 강제 카드를 정합니다.'],
  ['lastVolley','The Last Volley','모두 첫 카드를 낸 뒤 한 장 더 냅니다. 마지막 트릭에는 참여하지 않습니다.'],['firstMateCon','First Mate Con','일반 Pirate를 이기고, 잡은 Pirate의 능력을 사용할 수 있습니다.'],['stingray','Spotted Stingray','특수카드를 제거하고 가장 낮은 숫자가 이깁니다.'],
  ['davyJones',"Davy Jones' Locker",'모든 Sea Monster를 제거하고 다른 괴물마다 +20점입니다.'],['walkThePlank','Walk the Plank','트릭이 끝날 때 일반 Pirate 한 장을 제거합니다.'],
];
const icon:Record<Card['kind'],string>={number:'',wild:'wild',pirate:'sword',tigress:'tigress',skullKing:'skull',mermaid:'mermaid',escape:'escape',kraken:'kraken',whale:'whale',stingray:'stingray',davy:'davy',con:'con',lastVolley:'lastVolley',plank:'plank',loot:'loot'};
const label=(c:Card)=>c.kind==='number'?suits[c.suit!].name+' '+(c.isZeroFourteen?'0/14':c.rank):c.name;
const showError=(e:unknown)=>useGame.getState().setError(e instanceof Error?e.message:'요청을 처리할 수 없습니다.');
const leaveRoom=async(roomCode:string)=>{try{await emit('ROOM_LEAVE',{roomCode});}catch(e){showError(e);}finally{clearSession();useGame.getState().setGame(null);}};

const declTag=(p:PlayedCard)=>p.card.kind==='tigress'&&p.declaration?<b className={'declared-tag '+p.declaration}><Icon name={p.declaration==='pirate'?'sword':'escape'}/>{p.declaration==='pirate'?'해적':'탈출'}</b>:(p.card.isZeroFourteen||p.card.kind==='wild')?<b className="declared-value">{p.card.kind==='wild'?<Icon name={suits[p.declaration as Suit]?.icon??'wild'}/>:String(p.declaration)}</b>:null;
type SweepCard={playerId:string;card:Card|null;declaration?:CardDeclaration;late?:boolean};
const art=(n:string)=>import.meta.env.BASE_URL+'card-art/'+n+'.jpg';
/** 선실 배경: 나무 탁자(텍스처) + 랜턴 한 방향 조명 + 필름 그레인 + 비네팅. 조명 레이어는 콘텐츠 위(z40)에서 전체를 같은 방향으로 비춘다. */
function Scene({mode}:{mode:'home'|'lobby'|'game'}){return <><div className={'scene m-'+mode} aria-hidden="true"><div className="room"/><div className="dim"/></div><div className="overlay" aria-hidden="true">{Array.from({length:9},(_,i)=><i className="mote" key={i} style={{left:(6+i*10.5)%90+'%',top:(10+(i*31)%58)+'%',animationDelay:-(i*2.3)+'s',animationDuration:(15+i%4*4)+'s'} as CSSProperties}/>)}<div className="lantern"/><div className="grain"/><div className="vignette"/></div></>;}
const rose=Array.from({length:16},(_,i)=>{const a=i*Math.PI/8-Math.PI/2;const r=i%2?15:(i%4===0?72:44);return (Math.cos(a)*r).toFixed(1)+','+(Math.sin(a)*r).toFixed(1);}).join(' ');
/** 탁자 위에 펼친 해도. 장식일 뿐이라 선과 대비를 아주 약하게 쓴다. */
function Chart(){return <div className="chart" aria-hidden="true"><svg viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#4b3217" strokeLinecap="round">
  <rect x="22" y="22" width="756" height="476" strokeWidth="1.6" opacity=".5"/><rect x="30" y="30" width="740" height="460" strokeWidth=".7" opacity=".4"/>
  <g strokeWidth=".6" opacity=".22">{[1,2,3,4,5,6,7].map(i=><path key={'v'+i} d={'M'+i*100+' 30V490'}/>)}{[1,2,3,4].map(i=><path key={'h'+i} d={'M30 '+i*98+'H770'}/>)}</g>
  <path d="M30 128c46-26 84 8 128-10 38-16 52-52 96-50 24 0 46 12 70 6V30H30Z" strokeWidth="1.1" opacity=".5"/><path d="M30 146c46-26 84 8 128-10 38-16 52-52 96-50 24 0 46 12 78 8" strokeWidth=".6" opacity=".26"/>
  <path d="M560 470c24-32 62-34 92-52 26-16 30-46 62-52 20-4 36 4 56 0v174H560Z" strokeWidth="1.1" opacity=".42"/>
  <path d="M170 360C260 300 320 330 400 280S560 190 650 150" strokeWidth="1.4" strokeDasharray="2 9" opacity=".55"/>
  <g transform="translate(676 120)" opacity=".55"><circle r="54" strokeWidth=".8"/><circle r="46" strokeWidth=".5"/><polygon points={rose} strokeWidth="1" fill="rgba(75,50,23,.12)"/></g>
  <g transform="translate(170 360)" opacity=".7" strokeWidth="1.8"><path d="M-9-9 9 9M9-9-9 9"/></g>
  <g transform="translate(110 420)" opacity=".42" strokeWidth="1.1"><path d="M-22 6q22 14 44 0l-4 7q-18 7-36 0ZM0-16v22M0-14q10 4 12 16H0M0-10q-8 4-9 12H0"/></g></g></svg></div>;}
type CardViewProps={card:Card;small?:boolean}&ButtonHTMLAttributes<HTMLButtonElement>;
function CardView({card,small,disabled,className,...rest}:CardViewProps) {
  const a=cardArt(card);
  return <button type="button" {...rest} disabled={disabled} className={'card '+card.kind+' '+(a?'art-card ':'')+(small?'small ':'')+(disabled?'disabled ':'')+(className??'')} title={label(card)}>
    {a?<img className="card-art" src={a} alt={label(card)} draggable={false}/>:<><Icon className={'card-sigil '+(card.kind==='number'?'suit-'+card.suit:'')} name={card.kind==='number'?suits[card.suit!].icon:icon[card.kind]} strokeWidth={1.4}/><b>{card.kind==='number'?card.rank:card.kind==='wild'?'15':''}</b><em>{label(card)}</em></>}
  </button>;
}
/* ───── v3 공용 조각: 이니셜 · 해골 · 카운트업 · 트릭 현황 ───── */
const ini=(s:string)=>[...s][0]??'?';
const sg=(v:number)=>v>0?'+'+v:String(v);
function Crest({kind='anchor',className}:{kind?:'anchor'|'crown'|'coin';className?:string}){return <Icon className={className} name={kind==='anchor'?'anchor':kind==='crown'?'crown':'coin'}/>;}
function CountUp({to,delay=0,dur=1000,signed}:{to:number;delay?:number;dur?:number;signed?:boolean}){
  const [v,setV]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?to:0);
  useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setV(to);return;}let raf=0;const t0=performance.now()+delay;const step=(t:number)=>{const k=Math.min(1,Math.max(0,(t-t0)/dur));setV(Math.round(to*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(step);};raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);},[to,delay,dur]);
  return <>{signed&&v>0?'+':''}{v}</>;
}
/** 선원 칩의 트릭 현황: 예측 수만큼 구슬을 놓고, 딴 만큼 금색으로 채운다(초과분은 붉은색). */
function Tally({bid,tricks}:{bid:number|null;tricks:number}){
  if(bid===null)return <span className="tally"><em className="n">{tricks}</em></span>;
  const cnt=Math.min(Math.max(bid,tricks),12);
  return <span className={'tally'+(tricks===bid?' exact':tricks>bid?' over':'')} title={'예측 '+bid+' · 획득 '+tricks}>{bid===0?<span className="zero">무승</span>:<span className="pips">{Array.from({length:cnt},(_,k)=><i key={k} className={k<tricks?(k>=bid?'on bust':'on'):''}/>)}</span>}<em className="n">{tricks}<s>/{bid}</s></em></span>;
}
/* ───── 손패 정렬 ───── */
const SUIT_RANK:Record<string,number>={parrot:0,map:1,treasure:2,jolly:3};
const KIND_RANK:Record<string,number>={wild:0,pirate:1,tigress:2,skullKing:3,mermaid:4,escape:5,loot:6,kraken:7,whale:8,stingray:9,davy:10,con:11,lastVolley:12,plank:13};
const numVal=(c:Card)=>c.isZeroFourteen?0:(c.rank??0);
const cardName=(c:Card)=>String((c as unknown as {name?:string}).name??'');
/** 숫자 카드가 앞, 특수 카드가 뒤. by='suit' 수트→숫자, by='rank' 숫자→수트 */
function sortCards(cards:Card[],by:'suit'|'rank'):Card[]{
  const isNum=(c:Card)=>c.kind==='number';const suit=(c:Card)=>SUIT_RANK[c.suit??'']??9;
  return [...cards].sort((a,b)=>{
    if(isNum(a)!==isNum(b))return isNum(a)?-1:1;
    if(!isNum(a))return (KIND_RANK[a.kind]??99)-(KIND_RANK[b.kind]??99)||cardName(a).localeCompare(cardName(b));
    return by==='suit'?suit(a)-suit(b)||numVal(a)-numVal(b):numVal(a)-numVal(b)||suit(a)-suit(b);
  });
}
/**
 * 내 손패. 카드는 절대 위치로 배치(좁은 화면에서도 겹침 간격을 자동 계산해 한 줄에 모두 보임).
 * - 탭 1번: 카드가 위로 올라옴(선택)  · 같은 카드를 한 번 더 탭: 내기(내 차례 + 낼 수 있는 카드일 때만)
 * - 끌기: 8px 이상 움직이면 드래그 시작 → 좌우로 끌어 순서 변경(터치/마우스 공통, Pointer Events)
 * - 비딩 중에는 disabled를 쓰지 않으므로 흐려지지 않고, 탭은 '확대해서 보기'로만 동작
 */
function Hand({cards,legal,canPlay,mode,resetKey,onPlay,bar}:{cards:Card[];legal:string[];canPlay:boolean;mode:'bid'|'play';resetKey:number|string;onPlay?:(c:Card)=>void;bar?:ReactNode}){
  const [order,setOrder]=useState<string[]>([]);const [sortMode,setSortMode]=useState<'suit'|'rank'|null>('suit');
  const [sel,setSel]=useState<string|null>(null);const [drag,setDrag]=useState<{id:string;x:number;over:number}|null>(null);const [width,setWidth]=useState(0);
  const box=useRef<HTMLDivElement>(null);const info=useRef<{id:string;sx:number;sy:number;off:number;moved:boolean;over:number}|null>(null);
  /* Legal cards are server-authoritative.  Keep this distinct from the manual
     card order so a trick/turn update cannot wait for a sort or drag rerender. */
  const legalSet=useMemo(()=>new Set(legal),[legal]);const availabilityKey=mode==='play'?(canPlay?'play:'+legal.join(','):'wait'):'bid';
  useEffect(()=>{setOrder([]);setSortMode('suit');setSel(null);},[resetKey]);
  useEffect(()=>{if(canPlay)setSel(null);},[canPlay]);/* 내 차례가 되는 순간 선택 해제 → 이전에 올려둔 카드가 한 번 탭으로 나가는 사고 방지 */
  useEffect(()=>{if(sel&&!cards.some(c=>c.id===sel))setSel(null);},[cards,sel]);
  useEffect(()=>{if(!sel)return;const h=(e:Event)=>{if(!box.current?.contains(e.target as Node))setSel(null);};document.addEventListener('pointerdown',h);return()=>document.removeEventListener('pointerdown',h);},[sel]);
  useLayoutEffect(()=>{const el=box.current;if(!el)return;const ro=new ResizeObserver(()=>setWidth(el.clientWidth));ro.observe(el);setWidth(el.clientWidth);return()=>ro.disconnect();},[]);
  const list=useMemo(()=>{const byId=new Map(cards.map(c=>[c.id,c] as const));const kept=order.filter(id=>byId.has(id));const keptSet=new Set(kept);return [...kept.map(id=>byId.get(id)!),...sortCards(cards.filter(c=>!keptSet.has(c.id)),'suit')];},[cards,order]);
  const shown=useMemo(()=>{if(!drag)return list;const from=list.findIndex(c=>c.id===drag.id);if(from<0)return list;const next=[...list];const [c]=next.splice(from,1);next.splice(Math.max(0,Math.min(next.length,drag.over)),0,c);return next;},[list,drag?.id,drag?.over]);
  const n=shown.length;const W=width||360;
  // Mobile cards are a touch larger while remaining compact enough to keep a full hand visible.
  const cw=W<460?Math.round(Math.min(82,Math.max(66,W*.21))):W<820?96:112;const ch=Math.round(cw*156/110);
  const pad=Math.round(cw*.16);const U=Math.max(cw,W-pad*2);/* 회전한 양 끝 카드가 화면 밖으로 잘리지 않게 좌우 여백 */
  const step=n>1?Math.max(10,Math.min(cw*.8,(U-cw)/(n-1))):0;const total=cw+step*Math.max(0,n-1);const left0=Math.max(0,pad+(U-total)/2);const H=ch+84;const mid=(n-1)/2;
  const slot=(i:number)=>left0+i*step;
  const tap=(id:string)=>{const c=list.find(x=>x.id===id);if(!c)return;if(sel!==id){setSel(id);return;}if(mode==='play'&&canPlay&&legalSet.has(id)&&onPlay){setSel(null);onPlay(c);}else setSel(null);};
  const down=(e:ReactPointerEvent<HTMLButtonElement>,id:string)=>{if(e.pointerType==='mouse'&&e.button!==0)return;const br=box.current!.getBoundingClientRect();const i=shown.findIndex(c=>c.id===id);info.current={id,sx:e.clientX,sy:e.clientY,off:e.clientX-br.left-slot(i),moved:false,over:i};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* 일부 브라우저 예외 무시 */}};
  const move=(e:ReactPointerEvent<HTMLButtonElement>)=>{const d=info.current;if(!d)return;if(!d.moved){if(Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<8)return;d.moved=true;setSel(null);}
    const br=box.current!.getBoundingClientRect();const x=Math.max(left0-cw*.35,Math.min(e.clientX-br.left-d.off,left0+total-cw*.65));const over=step>0?Math.max(0,Math.min(n-1,Math.round((x-left0)/step))):0;d.over=over;setDrag({id:d.id,x,over});};
  const finish=(commit:boolean)=>{const d=info.current;info.current=null;if(!d)return;
    if(d.moved){if(commit){const ids=list.map(c=>c.id);ids.splice(ids.indexOf(d.id),1);ids.splice(d.over,0,d.id);setOrder(ids);setSortMode(null);}setDrag(null);}
    else if(commit)tap(d.id);};
  const sortBy=(by:'suit'|'rank')=>{setOrder(sortCards(cards,by).map(c=>c.id));setSortMode(by);setSel(null);};
  const selIdx=drag?-1:shown.findIndex(c=>c.id===sel);const selCard=selIdx>=0?shown[selIdx]:null;const okSel=!!selCard&&mode==='play'&&canPlay&&legalSet.has(selCard.id);
  return <section className="handwrap" aria-label="내 손패">
    <div className="hand-bar"><span className="hand-title" title="카드를 끌어서 순서를 바꿀 수 있어요">내 손패<small>{n}장</small></span>{bar}
      <div className="seg sm" role="group" aria-label="손패 정렬"><button type="button" className={sortMode==='suit'?'on':''} onClick={()=>sortBy('suit')}>수트순</button><button type="button" className={sortMode==='rank'?'on':''} onClick={()=>sortBy('rank')}>숫자순</button></div></div>
    <div className="hand-box" ref={box} style={{height:H}} onPointerDown={e=>{if(e.target===e.currentTarget)setSel(null);}}>
      {shown.map((c,i)=>{const dragging=drag?.id===c.id;const isSel=sel===c.id&&!dragging;const ok=mode==='play'&&canPlay&&legalSet.has(c.id);const dim=mode==='play'&&canPlay&&!ok;
        const arc=Math.pow(i-mid,2)*Math.min(.9,5/Math.max(n,1));const rot=dragging?0:(i-mid)*Math.min(2.6,16/Math.max(n,1));
        /* An unavailable card can still be selected to show its reason, but it should not jump as far as a playable one. */
        const lift=isSel?(ok?-30:-20):dragging?-14:arc;
        return <CardView key={c.id+':'+availabilityKey} card={c} className={'hcard'+(dragging?' dragging':'')+(isSel?' sel':'')+(ok?' ok':'')+(dim?' dim':'')} aria-pressed={isSel}
          onPointerDown={e=>down(e,c.id)} onPointerMove={move} onPointerUp={()=>finish(true)} onPointerCancel={()=>finish(false)} onClick={e=>{if(e.detail===0)tap(c.id);}}
          style={{width:cw,height:ch,left:dragging?drag!.x:slot(i),zIndex:dragging?200:isSel?100:i+1,'--y':lift+'px','--r':rot+'deg','--d':Math.min(i,10)*.04+'s'} as CSSProperties}/>;})}
      {selCard&&mode==='play'&&<span className={'hand-tip'+(okSel?'':' no')} style={{left:Math.max(72,Math.min(W-72,slot(selIdx)+cw/2)),top:Math.max(0,H-ch-74)}}>{okSel?'한 번 더 눌러서 내기':canPlay?'지금은 낼 수 없는 카드예요':'내 차례가 아니에요'}</span>}
    </div>
  </section>;
}
/** 모달용 카드 선택: 탭으로 고르고 버튼으로 확정(되돌릴 수 없는 선택이 한 번 탭으로 실행되지 않게) */
function CardPicker({cards,cta,onPick,disabled}:{cards:Card[];cta:string;onPick:(c:Card)=>void;disabled?:boolean}){
  const [sel,setSel]=useState<string|null>(null);
  return <><div className="pick-row">{sortCards(cards,'suit').map(c=><CardView key={c.id} card={c} className={sel===c.id?'picked-card':''} onClick={()=>setSel(sel===c.id?null:c.id)}/>)}</div>
    <button className="primary" disabled={!sel||disabled} onClick={()=>{const c=cards.find(x=>x.id===sel);if(c){setSel(null);onPick(c);}}}>{sel?cta:'카드를 한 장 고르세요'}</button></>;
}
const helpTabs=['기본 규칙','서열','점수','특수 카드','해적 능력'] as const;
function Tile({img,title,desc,tag}:{img:string;title:string;desc:string;tag?:string}){return <div className="tile"><img src={art(img)} alt={title} loading="lazy" draggable={false}/><div><b>{title}{tag&&<em>{tag}</em>}</b><p>{desc}</p></div></div>;}
function Beat({a,b,note,bonus}:{a:string;b:string;note:string;bonus:string}){return <div className="beat"><img src={art(a)} alt="" draggable={false}/><span className="beat-arrow">이긴다<Icon name="next"/></span><img src={art(b)} alt="" draggable={false}/><div><b>{note}</b><em>{bonus}</em></div></div>;}
/** 도움말 공통 조각: 탭마다 같은 틀(제목+한 줄 요약 → 섹션)로 맞춘다 */
const HHead=({title,lead}:{title:string;lead:string})=><header className="hhead"><h2>{title}</h2><p>{lead}</p></header>;
const HSec=({title,tag,children}:{title:string;tag?:string;children:ReactNode})=><section className="hsec"><h3>{title}{tag&&<small>{tag}</small>}</h3>{children}</section>;
function Help({close}:{close:()=>void}) {
  const [tab,setTab]=useState<typeof helpTabs[number]>('기본 규칙');
  const bodyRef=useRef<HTMLDivElement>(null);
  const tabsRef=useRef<HTMLElement>(null);const [edge,setEdge]=useState({l:false,r:false});
  const idx=helpTabs.indexOf(tab);const go=(d:number)=>setTab(t=>helpTabs[Math.min(helpTabs.length-1,Math.max(0,helpTabs.indexOf(t)+d))]);
  const measure=()=>{const e=tabsRef.current;if(e)setEdge({l:e.scrollLeft>4,r:e.scrollLeft+e.clientWidth<e.scrollWidth-4});};
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape')close();else if(e.key==='ArrowRight')go(1);else if(e.key==='ArrowLeft')go(-1);};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[close]);
  useEffect(()=>{window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);},[]);
  useEffect(()=>{bodyRef.current?.scrollTo({top:0});const e=tabsRef.current;const b=e?.querySelector<HTMLElement>('.on');if(e&&b)e.scrollTo({left:b.offsetLeft-(e.clientWidth-b.clientWidth)/2,behavior:'smooth'});measure();},[tab]);
  return <div className="modal" onClick={close}><div className="help book" role="dialog" aria-label="도움말" onClick={e=>e.stopPropagation()}>
    <button type="button" className="help-x" onClick={close} aria-label="도움말 닫기"><Icon name="close"/></button>
    <nav className={'help-tabs'+(edge.l?' fade-l':'')+(edge.r?' fade-r':'')} role="tablist" ref={tabsRef} onScroll={measure}>{helpTabs.map(t=><button key={t} role="tab" aria-selected={t===tab} className={t===tab?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    <div className="help-body" ref={bodyRef} key={tab}>
      {tab==='기본 규칙'&&<>
        <HHead title="기본 규칙" lead="예측한 만큼 정확히 트릭을 따는 게임입니다."/>
        <HSec title="라운드 진행"><ol className="steps">
          <li><div><b>카드 받기</b>방에서 고른 항해 방식대로 받습니다. Classic은 1라운드 1장에서 시작해 라운드마다 1장씩 늘어납니다.</div></li>
          <li><div><b>예측</b>손패를 보고 이번 라운드에 딸 트릭 수를 정합니다. 모두 정하면 동시에 공개됩니다.</div></li>
          <li><div><b>트릭</b>리더부터 시계 방향으로 한 장씩 냅니다. 가장 강한 카드를 낸 사람이 트릭을 가져가고 다음 리더가 됩니다.</div></li>
          <li><div><b>정산</b>예측과 딴 트릭 수를 비교해 점수를 계산합니다. 자세한 계산은 ‘점수’ 탭에 있습니다.</div></li></ol></HSec>
        <HSec title="수트(무늬) 따라내기">
          <div className="suit-row">{[['parrot-7','앵무새'],['map-7','지도'],['treasure-7','보물'],['jolly-7','졸리 로저 · 트럼프']].map(([i,t])=><figure key={i}><img src={art(i)} alt={t} draggable={false}/><figcaption>{t}</figcaption></figure>)}</div>
          <ul className="hlist" style={{marginTop:'.9rem'}}><li>숫자 카드로 리드되면, 같은 수트의 숫자 카드가 있을 때 반드시 그 수트를 냅니다.</li><li>같은 수트가 없으면 어떤 카드든 낼 수 있습니다. 특수 카드는 언제든 낼 수 있습니다.</li></ul>
        </HSec>
        <HSec title="리드 수트는 어떻게 정해지나요?">
          <div className="hcols">
            <div className="hbox"><b>다음 플레이어가 수트를 정함</b><p>Escape, Loot, Escape로 선언한 Tigress, Spotted Stingray, Davy Jones, Walk the Plank, The Last Volley로 리드한 경우입니다. 다음 카드도 수트를 넘기는 카드라면 그다음 사람에게 넘어갑니다.</p></div>
            <div className="hbox"><b>수트가 정해지지 않음</b><p>Pirate, Mermaid, Skull King, Kraken, White Whale, First Mate Con으로 리드한 경우입니다. 그 트릭에는 리드 수트가 없습니다.</p></div>
          </div>
        </HSec></>}
      {tab==='서열'&&<>
        <HHead title="카드 서열" lead="숫자 카드끼리는 리드 수트의 높은 숫자가 이기고, 특수 카드는 서로 상성이 있습니다."/>
        <HSec title="기본 높낮이">
          <div className="ladder">{[['escape','Escape','숫자 카드보다 낮음'],['parrot-9','숫자 카드','리드 수트 중 최고'],['jolly-9','졸리 로저','숫자 수트의 트럼프'],['pirate-rosie','Pirate','숫자 카드보다 높음']].map(([i,t,d],k)=><Fragment key={i}>{k>0&&<span className="lad-arrow"><Icon name="next"/></span>}<figure><img src={art(i)} alt={t} draggable={false}/><figcaption><b>{t}</b>{d}</figcaption></figure></Fragment>)}</div>
          <p className="hnote">서열이 같으면 먼저 낸 카드가 이깁니다.</p>
        </HSec>
        <HSec title="캐릭터 카드 상성">
          <Beat a="skull-king" b="pirate-rosie" note="Skull King이 Pirate를 이김" bonus="Pirate마다 +30"/><Beat a="pirate-rosie" b="mermaid-alyra" note="Pirate가 Mermaid를 이김" bonus="Mermaid마다 +20"/><Beat a="mermaid-alyra" b="skull-king" note="Mermaid가 Skull King을 이김" bonus="+40"/>
          <p className="hnote">Skull King·Pirate·Mermaid가 한 트릭에 모두 나오면 <b>Mermaid</b>가 이깁니다. First Mate Con은 일반 Pirate를 이기지만 Skull King과 Mermaid에게 집니다.</p>
        </HSec></>}
      {tab==='점수'&&<>
        <HHead title="점수" lead="예측을 정확히 맞힌 라운드에만 보너스를 받습니다."/>
        <HSec title="라운드 점수"><div className="srules">
          <div className="srow"><span>예측 적중<small>딴 트릭 1개마다</small></span><b>+20</b></div>
          <div className="srow"><span>예측 빗나감<small>예측과 딴 트릭 수의 차이 1마다</small></span><b className="neg">−10</b></div>
          <div className="srow"><span>0 예측 성공<small>트릭을 하나도 따지 않음</small></span><b>+10 × 카드 수</b></div>
          <div className="srow"><span>0 예측 실패<small>트릭을 하나라도 땀</small></span><b className="neg">−10 × 카드 수</b></div></div></HSec>
        <HSec title="보너스 점수"><div className="tiles">
          <Tile img="jolly-14" title="검정 14" desc="내가 딴 트릭에 있으면 +20점"/><Tile img="parrot-14" title="초록·보라·노랑 14" desc="내가 딴 트릭에 있으면 카드마다 +10점"/><Tile img="skull-king" title="Skull King" desc="내가 딴 트릭의 Pirate마다 +30점"/><Tile img="mermaid-alyra" title="Mermaid" desc="Skull King을 잡으면 +40점"/><Tile img="pirate-rosie" title="Pirate" desc="내가 딴 트릭의 Mermaid마다 +20점"/></div></HSec>
        <HSec title="어드밴스드" tag="옵션"><div className="tiles"><Tile img="loot" title="Loot 동맹" desc="다른 사람이 Loot를 가져가고 두 사람 모두 예측을 맞히면 각각 +20점"/></div></HSec>
        <HSec title="확장" tag="옵션"><div className="tiles">
          <Tile img="first-mate-con" title="First Mate Con" desc="Skull King 또는 Mermaid가 Con을 잡으면 +30점"/><Tile img="davy-jones" title="Davy Jones' Locker" desc="Davy Jones가 제거한 다른 Sea Monster마다 +20점"/><Tile img="parrot-8-expansion" title="확장 8 / 7" desc="확장 8은 +5점, 확장 7은 −5점. 기본 카드에는 적용되지 않습니다."/></div></HSec></>}
      {tab==='특수 카드'&&<>
        <HHead title="특수 카드" lead="수트 의무와 상관없이 언제든 낼 수 있습니다."/>
        <HSec title="기본"><div className="tiles">
          <Tile img="tigress" title="Tigress" desc="낼 때 Pirate 또는 Escape를 선택합니다. Pirate로 내면 Pirate의 서열과 보너스가 적용되고, Escape로 내면 이길 수 없으며 포획 보너스도 없습니다."/>
          <Tile img="escape" title="Escape" desc="숫자 카드나 Pirate 같은 승리 카드에는 이기지 못합니다. 모두가 Escape·Loot·Escape로 선언한 Tigress만 냈다면 가장 먼저 낸 카드가 이깁니다."/></div></HSec>
        <HSec title="어드밴스드" tag="옵션"><div className="tiles">
          <Tile img="loot" title="Loot" desc="Escape처럼 이기지 않는 카드입니다. 다른 사람이 Loot를 가져가고 두 사람 모두 예측을 맞히면 각각 +20점을 받습니다."/>
          <Tile img="kraken" title="Kraken" desc="트릭 전체를 파괴해 아무도 가져가지 못합니다. 다음 리더는 Kraken이 없었다면 이겼을 사람입니다."/>
          <Tile img="white-whale" title="White Whale" desc="특수 카드를 제거하고, 수트와 상관없이 가장 높은 숫자 카드가 이깁니다. 숫자 카드가 없으면 트릭을 버리고 처음 낸 사람이 다음 트릭을 리드합니다."/></div></HSec>
        <HSec title="확장" tag="옵션"><div className="tiles">
          <Tile img="spotted-stingray" title="Spotted Stingray" desc="White Whale처럼 특수 카드를 제거하지만 가장 낮은 숫자 카드가 이깁니다. 동률이면 먼저 낸 카드가 이깁니다."/>
          <Tile img="wild-monkey-15" title="Wild Monkey 15" desc="리드 수트가 초록·보라·노랑이면 그 수트의 15로 냅니다. 수트가 아직 없으면 세 수트 중 하나를 선언합니다. 검정으로는 선언할 수 없고, 검정이 리드되면 트럼프에게 집니다."/>
          <Tile img="first-mate-con" title="First Mate Con" desc="일반 Pirate를 이기지만 Skull King과 Mermaid에게는 집니다. Con으로 이기면 잡은 Pirate들의 능력을 쓸 수 있지만 Pirate 포획 보너스는 받지 않습니다."/>
          <Tile img="davy-jones" title="Davy Jones' Locker" desc="모든 Sea Monster와 자신을 제거합니다. 남은 카드 중 가장 높은 카드가 트릭을 가져가며, 제거한 다른 괴물마다 +20점입니다."/>
          <Tile img="last-volley" title="The Last Volley" desc="모두 첫 카드를 낸 뒤 내가 한 장을 더 냅니다. 대신 그 라운드의 마지막 트릭에는 참여하지 않습니다. 마지막 트릭에서 쓰면 건너뛸 트릭이 없습니다."/>
          <Tile img="walk-the-plank" title="Walk the Plank" desc="트릭이 끝나면 일반 Pirate 한 장을 제거해야 합니다. 여러 장이면 내가 고릅니다. 제거된 Pirate는 승자 판정, Skull King 보너스, Con 능력에서 제외됩니다."/>
          <Tile img="parrot-zero-fourteen" title="확장 0/14" desc="낼 때 0 또는 14를 선언합니다. 확장 14는 14 보너스를 주지 않습니다."/>
          <Tile img="parrot-8-expansion" title="확장 7 / 8" desc="일반 수트 카드처럼 냅니다. 딴 확장 7은 −5점, 확장 8은 +5점입니다. 기본 덱의 7·8에는 적용되지 않습니다."/></div></HSec>
        <p className="hnote">Sea Monster가 여러 장 나오면 가장 나중에 낸 괴물의 효과를 적용합니다. Davy Jones만 순서와 상관없이 모든 괴물을 제거합니다. 승자를 정할 카드가 하나도 없으면 트릭을 버리고, 처음 카드를 낸 사람이 다음 트릭을 시작합니다.</p></>}
      {tab==='해적 능력'&&<>
        <HHead title="해적 능력" lead="해적 능력 옵션을 켠 경우에만 사용합니다."/>
        <p className="hnote" style={{marginTop:0,marginBottom:'1.1rem'}}>Pirate 또는 First Mate Con으로 트릭을 이긴 직후에 사용하며, 다음 라운드로 미룰 수 없습니다. 단, <b>Harry</b>만 마지막 트릭 뒤에도 사용할 수 있습니다.</p>
        <HSec title="기본 Pirate"><div className="tiles">
          <Tile img="pirate-rosie" title="Rosie D'Laney" desc="플레이어 한 명(자신 포함)을 골라 다음 트릭의 리더로 정합니다."/>
          <Tile img="pirate-bendt" title="Bendt the Bandit" desc="덱에서 2장을 가져온 뒤 손패에서 원하는 2장을 버립니다. 덱이 부족하면 가능한 만큼만 처리합니다."/>
          <Tile img="pirate-rascal" title="Rascal of Roatan" desc="0·10·20점 중 하나를 겁니다. 라운드 예측을 맞히면 건 점수를 얻고, 틀리면 같은 점수를 잃습니다."/>
          <Tile img="pirate-juanita" title="Juanita Jade" desc="이번 라운드에 나눠 주지 않은 남은 덱을 나만 비공개로 확인합니다."/>
          <Tile img="pirate-harry" title="Harry the Giant" desc="내 예측을 1 낮추거나, 그대로 두거나, 1 높입니다."/></div></HSec>
        <HSec title="확장" tag="옵션"><div className="tiles">
          <Tile img="mary-thorne" title="Mary Thorne" desc="플레이어 한 명(자신 포함)의 손패에서 무작위로 카드 한 장을 정합니다. 그 카드는 다음 트릭에 수트 규칙과 상관없이 내야 합니다."/>
          <Tile img="first-mate-con" title="Con이 잡은 Pirate" desc="Con으로 이긴 트릭에서 잡은 Pirate들의 능력을 차례로 사용할 수 있습니다. 상대가 낸 Juanita의 능력도 포함됩니다."/></div></HSec></>}
    </div>
    <footer className="help-foot">
      <button type="button" className="prev" disabled={idx===0} onClick={()=>go(-1)}><Icon name="back"/><span>이전</span></button>
      <div className="help-dots" role="group" aria-label={'도움말 페이지 '+(idx+1)+' / '+helpTabs.length}>{helpTabs.map((t,i)=><button key={t} type="button" className={i===idx?'on':''} onClick={()=>setTab(t)} aria-label={t} aria-current={i===idx?'page':undefined}/>)}</div>
      {idx<helpTabs.length-1?<button type="button" className="primary next" onClick={()=>go(1)}>다음 · {helpTabs[idx+1]}<Icon name="next"/></button>:<button type="button" className="primary next" onClick={close}>확인</button>}</footer></div></div>;
}
const modes:Array<[GameConfig['roundMode'],string,string]>=[['classic','Classic','1–10장'],['evenKeeled','Even Keeled','2·4·6·8·10장'],['brawl','Skip to the Brawl','6–10장'],['swift','Swift-n-Salty','5장 × 5'],['broadside','Broadside','10장 × 10'],['whirlpool','Whirlpool','9·7·5·3·1장 × 2'],['bedtime','Past Your Bedtime','1장']];
const advancedCards:CardOptions={...emptyCards,kraken:true,whale:true,loot:true,pirateAbilities:true};
const deckSize=(c:CardOptions)=>70+(c.kraken?1:0)+(c.whale?1:0)+(c.loot?2:0)+(c.expansionSuitCards?12:0)+(c.wildMonkey?1:0)+(c.maryThorne?1:0)+(['lastVolley','firstMateCon','stingray','davyJones','walkThePlank'] as const).filter(k=>c[k]).length;
const sameCards=(a:CardOptions,b:CardOptions)=>(Object.keys(a) as Array<keyof CardOptions>).every(k=>a[k]===b[k]);
const fan=['mermaid-alyra','pirate-rosie','skull-king','tigress','kraken'];
function Landing() {
  const [nickname,setNickname]=useState(localStorage.getItem('skullking-name')??'');const [roomCode,setRoomCode]=useState('');
  const [tab,setTab]=useState<'create'|'join'>('create');const [detail,setDetail]=useState(false);
  const [maxPlayers,setMaxPlayers]=useState(4);const [mode,setMode]=useState<GameConfig['roundMode']>('classic');const [cards,setCards]=useState<CardOptions>(emptyCards);const [help,setHelp]=useState(false);const [busy,setBusy]=useState(false);const error=useGame(s=>s.error);
  const restricted=maxPlayers<3;const active=restricted?emptyCards:cards;const deck=deckSize(active);const maxByDeck=Math.floor(deck/10);
  const current=sameCards(active,emptyCards)?'classic':sameCards(active,advancedCards)?'advanced':sameCards(active,fullCards)?'full':'custom';
  const enter=async(create:boolean)=>{try{setBusy(true);const name=nickname.trim();localStorage.setItem('skullking-name',name);const reply=await emit(create?'ROOM_CREATE':'ROOM_JOIN',create?{nickname:name,config:{maxPlayers,advanced:active.kraken||active.whale||active.loot,expansionSuitCards:active.expansionSuitCards,roundMode:mode,cards:active}}:{nickname:name,roomCode});saveSession(reply);}catch(e){showError(e);}finally{setBusy(false);}};
  const presets:Array<['classic'|'advanced'|'full',string,string,CardOptions]>=[['classic','Classic','기본 덱',emptyCards],['advanced','Advanced','괴물 · 약탈 · 해적 능력',advancedCards],['full','Full','확장 전부',fullCards]];
  const hasName=!!nickname.trim();const modeInfo=modes.find(([id])=>id===mode);
  return <main className="home"><button type="button" className="help-orb corner" onClick={()=>setHelp(true)} aria-label="도움말 열기"><Icon name="help"/></button>
    <div className="hero"><p className="eyebrow"><Icon name="skull"/>A wager at sea</p><h1 aria-label="Skull King"><span>Skull</span> <span>King</span></h1>
      <p className="subtitle">해골왕의 배에서 열리는 한 판 도박. 예측하고, 속이고, 마지막 트릭까지 살아남으세요.</p>
      <div className="fan" aria-hidden="true">{fan.map((n,i)=>{const k=i-2;return <img key={n} src={art(n)} alt="" draggable={false} style={{'--k':k,zIndex:5-Math.abs(k)} as CSSProperties}/>;})}</div></div>
    <section className="dock paper" aria-label="게임 시작"><div className="dock-title"><Icon name="scroll" size={26}/><div><h2>항해 서약서</h2><p>이름을 적고, 배에 오르세요.</p></div></div>
      <label className="field"><span>선원 이름</span><input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={16} autoComplete="nickname" placeholder="이름을 입력하세요"/></label>
      <div className="seg" role="tablist"><button type="button" role="tab" aria-selected={tab==='create'} className={tab==='create'?'on':''} onClick={()=>setTab('create')}>새 항해 열기</button><button type="button" role="tab" aria-selected={tab==='join'} className={tab==='join'?'on':''} onClick={()=>setTab('join')}>방 코드로 참가</button></div>
      {tab==='create'?<div className="pane" role="tabpanel">
        <div className="duo">
          <div className="field" role="group" aria-label="인원"><span>인원</span><div className="stepper"><button type="button" aria-label="인원 줄이기" disabled={maxPlayers<=2} onClick={()=>setMaxPlayers(maxPlayers-1)}><Icon name="minus"/></button><output>{maxPlayers}</output><button type="button" aria-label="인원 늘리기" disabled={maxPlayers>=9} onClick={()=>setMaxPlayers(maxPlayers+1)}><Icon name="plus"/></button></div></div>
          <label className="field"><span>항해 방식</span><select value={mode} onChange={e=>setMode(e.target.value as GameConfig['roundMode'])}>{modes.map(([id,name,desc])=><option key={id} value={id}>{name} · {desc}</option>)}</select></label>
        </div>
        <div className="field" role="group" aria-label="카드 상자"><span>카드 상자<em className="hint">{current==='custom'?'직접 구성':''}</em></span>
          <div className="presets">{presets.map(([id,name,desc,value])=><button type="button" key={id} className={'preset'+(current===id?' on':'')} disabled={restricted&&id!=='classic'} aria-pressed={current===id} onClick={()=>setCards(value)}><b>{name}</b><small>{desc}</small></button>)}</div></div>
        {restricted?<p className="hint warn">2인 게임은 기본 덱으로만 진행해요. 확장 카드와 해적 능력은 3인부터 쓸 수 있어요.</p>:<>
          <button type="button" className="link" aria-expanded={detail} onClick={()=>setDetail(!detail)}>{detail?'세부 설정 접기':'카드를 하나씩 고르기'}</button>
          {detail&&<div className="opts">{cardSettings.map(([key,title,desc])=><label className="opt" key={key}><input type="checkbox" checked={cards[key]} onChange={e=>setCards({...cards,[key]:e.target.checked})}/><i aria-hidden="true"/><b>{title}</b><small>{desc}</small></label>)}</div>}</>}
        <p className={'hint'+(maxPlayers>maxByDeck?' warn':'')}>현재 덱 {deck}장{maxPlayers>maxByDeck?` · 10장 라운드는 ${maxByDeck}명까지 가능해요. 카드를 더 넣거나 인원을 줄여 보세요.`:` · 10장 라운드 기준 최대 ${maxByDeck}명`}</p>
      </div>:<div className="pane" role="tabpanel">
        <label className="field"><span>방 코드</span><input className="code-input" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==='Enter'&&hasName&&roomCode.length>=6&&!busy)enter(false);}} maxLength={6} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" spellCheck={false}/></label>
        <p className="hint">방장에게 받은 6자리 코드를 입력하세요.</p>
      </div>}
      <div className="dock-foot">
        {error&&<p className="error" role="alert">{error}</p>}
        {!hasName&&<p className="hint">먼저 선원 이름을 입력하세요.</p>}
        {tab==='create'?<button className="primary cta" disabled={!hasName||busy} onClick={()=>enter(true)}>{busy?'출항 준비 중…':'방 만들기'}</button>:<button className="primary cta" disabled={!hasName||roomCode.length<6||busy} onClick={()=>enter(false)}>{busy?'접속 중…':'방 참가'}</button>}
        
      </div>
    </section>
    {help&&<Help close={()=>setHelp(false)}/>}
  </main>;
}
function GameHeader({round,cards,onHelp,title}:{round?:number;cards?:number;onHelp:()=>void;title?:string}){const game=useGame(s=>s.game)!;const [soundOn,setSoundOn]=useState(soundEnabled);return <header className="game-head"><button className="leave" onClick={()=>leaveRoom(game.roomCode)} aria-label="방 나가기"><Icon name="back"/><span>나가기</span></button><span className="voyage-mark">{title??<><small>ROUND</small><b>{round}</b><span className="of">{cards}장</span></>}</span><div className="game-tools"><button className="tool sound-toggle" type="button" aria-pressed={soundOn} aria-label={'소리 '+(soundOn?'켜짐':'꺼짐')} title={'소리 '+(soundOn?'끄기':'켜기')} onClick={()=>{const next=!soundOn;setSoundOn(next);setSoundEnabled(next);if(next)unlock();}}><Icon name={soundOn?'sound':'mute'}/></button><button className="tool help-orb" onClick={onHelp} aria-label="도움말 열기"><Icon name="help"/></button></div></header>;}
function BidPanel(){const game=useGame(s=>s.game)!;const [bid,setBid]=useState(0);useEffect(()=>setBid(0),[game.round]);const me=game.players.find(p=>p.id===game.playerId)!;if(me.bid!==null)return <div className="status" role="status"><Icon name="anchor"/>다른 선원들이 예측을 고르는 중…</div>;return <section className="bid paper"><p className="eyebrow">Round {game.round}</p><h2>이번 라운드,<br/>몇 트릭을 가져갈까요?</h2><div className="bid-dial" aria-label="예측할 트릭 수">{Array.from({length:game.cardsThisRound+1},(_,n)=><button key={n} className={bid===n?'picked':''} onClick={()=>setBid(n)} aria-pressed={bid===n}>{n}{n===0&&<small>무승</small>}</button>)}</div><button className="primary bid-submit" onClick={()=>{unlock();emit('BID_SUBMIT',{roomCode:game.roomCode,bid}).catch(showError);}}><Icon name="coin"/>{bid===0?'무승으로 봉인':bid+'트릭으로 봉인'}</button></section>;}
/** 능력 이름(대기 중인 다른 선원에게도 무슨 일이 벌어지는지 보여주기 위함) */
const abilityName:Record<string,string>={rosieLeader:'Rosie',maryTarget:'Mary Thorne',plankTarget:'Walk the Plank',bendtDiscard:'Bendt',lastVolley:'The Last Volley',rascalBet:'Rascal'};
function Sheet({title,sub,children}:{title:string;sub?:string;children:ReactNode}){return <div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="sheet"><h2>{title}</h2>{sub&&<p>{sub}</p>}{children}</div></div>;}
function Decision({pending}:{pending:PendingDecision}) {
 const game=useGame(s=>s.game)!;const [extra,setExtra]=useState<Card|null>(null);const [busy,setBusy]=useState(false);
 /* 중복 전송 방지: 응답이 오기 전 연타하면 서버가 거절해 화면이 멈춘 것처럼 보이던 문제 */
 const decide=async(value:string|number,declaration?:CardDeclaration)=>{if(busy)return;unlock();setBusy(true);try{await emit('ABILITY_DECIDE',{roomCode:game.roomCode,value,declaration});}catch(e){showError(e);}finally{setBusy(false);}};
 const pname=(id:string)=>game.players.find(p=>p.id===id)?.nickname??id;const needsDeclaration=(card:Card)=>card.kind==='tigress'||card.isZeroFourteen||(card.kind==='wild'&&!game.trickLead);
 if(pending.kind==='rosieLeader'||pending.kind==='maryTarget')return <Sheet title={pending.kind==='rosieLeader'?'Rosie · 다음 리더':'Mary Thorne · 대상 선택'} sub={pending.kind==='rosieLeader'?'다음 트릭을 시작할 선원을 고르세요.':'다음 트릭에 무작위 카드를 강제로 내게 할 선원을 고르세요.'}><div className="choices">{pending.options.map(id=><button key={id} disabled={busy} onClick={()=>decide(id)}>{pname(id)}</button>)}</div></Sheet>;
 if(pending.kind==='plankTarget'){const targets=game.trick.filter(p=>pending.options.includes(p.card.id));return <Sheet title="Walk the Plank" sub="제거할 Pirate를 고르세요."><div className="choices">{targets.map(p=><button key={p.card.id} disabled={busy} onClick={()=>decide(p.card.id)}>{pname(p.playerId)} · {p.card.name}</button>)}</div></Sheet>;}
 if(pending.kind==='bendtDiscard')return <Sheet title={'Bendt · '+pending.remaining+'장 버리기'} sub="버릴 카드를 고르고 확정하세요."><CardPicker cards={game.hand} cta="이 카드 버리기" disabled={busy} onPick={c=>decide(c.id)}/></Sheet>;
 if(pending.kind==='lastVolley'){
  if(extra)return <Sheet title="Last Volley 선언" sub={label(extra)}><div className="choices">{extra.isZeroFourteen?<><button disabled={busy} onClick={()=>decide(extra.id,0)}>0</button><button className="primary" disabled={busy} onClick={()=>decide(extra.id,14)}>14</button></>:extra.kind==='wild'?<>{(['parrot','map','treasure'] as const).map(s=><button key={s} disabled={busy} onClick={()=>decide(extra.id,s)}><Icon name={suits[s].icon}/> {suits[s].name}</button>)}</>:<><button className="primary" disabled={busy} onClick={()=>decide(extra.id,'pirate')}>Pirate</button><button disabled={busy} onClick={()=>decide(extra.id,'escape')}>Escape</button></>}</div><button className="text" onClick={()=>setExtra(null)}>다른 카드 고르기</button></Sheet>;
  return <Sheet title="Last Volley" sub="추가로 낼 카드를 한 장 고르세요."><CardPicker cards={game.hand} cta="이 카드 내기" disabled={busy} onPick={c=>needsDeclaration(c)?setExtra(c):decide(c.id)}/></Sheet>;}
 if(pending.kind==='rascalBet')return <Sheet title="Rascal의 내기" sub="이번 트릭 결과에 점수를 걸 수 있어요."><div className="choices">{[0,10,20].map(n=><button key={n} className={n===20?'primary':''} disabled={busy} onClick={()=>decide(n)}>{n===0?'내기 안 함':n+'점 걸기'}</button>)}</div></Sheet>;
 /* 알 수 없는 종류에 options가 있으면 그대로 선택지로 보여준다(예전에는 전부 Harry 화면으로 떨어져 선택이 불가능했음) */
 const opts=(pending as unknown as {options?:unknown}).options;
 if(Array.isArray(opts)&&opts.length)return <Sheet title="능력 선택" sub={abilityName[String(pending.kind)]}><div className="choices">{opts.map(o=><button key={String(o)} disabled={busy} onClick={()=>decide(o as string|number)}>{pname(String(o))}</button>)}</div></Sheet>;
 const myBid=game.players.find(p=>p.id===game.playerId)?.bid??0;
 return <Sheet title="Harry · 비드 조정" sub={'현재 비드 '+myBid+' · 딜 장수 '+game.cardsThisRound}><div className="choices">{[-1,0,1].filter(n=>myBid+n>=0&&myBid+n<=game.cardsThisRound).map(n=><button key={n} disabled={busy} onClick={()=>decide(n)}>{n>0?'+1':n===0?'유지':'-1'}</button>)}</div></Sheet>;
}
function Table(){
 const game=useGame(s=>s.game)!;const [choice,setChoice]=useState<Card|null>(null);const [help,setHelp]=useState(false);
 /* State arrives separately for every player. Sound only the newly revealed card so
    animation/state refreshes never replay an entire trick. */
 const heardCards=useRef<Set<string>|null>(null);
 useEffect(()=>{const cards=[...game.trick,...(game.lastTrick?.cards??[])];const keys=cards.map(p=>p.card.id);if(!heardCards.current){heardCards.current=new Set(keys);return;}const heard=heardCards.current;cards.forEach(p=>{if(!heard.has(p.card.id)){heard.add(p.card.id);if(soundEnabled())playCardSound(p);}});},[game.trick,game.lastTrick]);
 /* 트릭 종료 연출: 직전 상태의 트릭 카드를 복사해 두었다가 승자 칩(.sailor[data-pid]) 쪽으로 쓸어 보낸다. 승자는 '획득 수가 늘어난 선원'으로 추론(서버 상태/로직은 변경 없음). */
 const [sweep,setSweep]=useState<{cards:SweepCard[];winner:string|null;late:boolean}|null>(null);const lastOwn=useRef<SweepCard|null>(null);const prevGame=useRef(game);const sweepRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const before=prevGame.current;prevGame.current=game;if(!before||before===game)return;const ended=before.trick.length>0&&before.round===game.round&&before.phase!=='bidding'&&game.phase!=='bidding'&&(game.trick.length<before.trick.length||game.trick[0]?.card.id!==before.trick[0].card.id);if(!ended)return;
  /* 서버가 lastTrick({cards,winnerId})을 내려주면 그것을 사용(마지막 카드까지 정확). 없으면 직전 상태 + '마지막 사람의 카드'를 보완한다: 내 카드는 직접 기억, 남의 카드는 뒷면으로 표시. */
  const last=game.lastTrick;let cards:SweepCard[]=before.trick.map(t=>({playerId:t.playerId,card:t.card,declaration:t.declaration}));
  if(last?.cards?.length&&last.cards.length>=cards.length)cards=last.cards.map(c=>({playerId:c.playerId,card:c.card,declaration:c.declaration,late:!before.trick.some(t=>t.playerId===c.playerId)}));
  else if(cards.length===before.players.length-1&&before.turnId&&!cards.some(c=>c.playerId===before.turnId)){const mine=lastOwn.current;cards.push(mine&&mine.playerId===before.turnId?{...mine,late:true}:{playerId:before.turnId,card:null,late:true});}
  const winner=last&&last.winnerId!==undefined?last.winnerId:(game.players.find(p=>p.tricks>(before.players.find(b=>b.id===p.id)?.tricks??0))?.id??null);setSweep({cards,winner,late:cards.some(c=>c.late)});},[game]);
 /* 트릭 기록: 이 화면에서 본 트릭의 승자를 라운드별로 쌓아 둔다(파괴된 트릭은 null) */
 const [log,setLog]=useState<{round:number;ids:(string|null)[]}>({round:-1,ids:[]});
 useEffect(()=>{if(!sweep)return;setLog(l=>({round:game.round,ids:[...(l.round===game.round?l.ids:[]),sweep.winner]}));},[sweep]);
 useEffect(()=>{if(!sweep)return;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const t=setTimeout(()=>setSweep(null),reduced?420:(sweep.late?1950:1200)+sweep.cards.length*30);return()=>clearTimeout(t);},[sweep]);
 useLayoutEffect(()=>{const root=sweepRef.current;if(!sweep||!root)return;const to=document.querySelector(`[data-pid="${sweep.winner}"]`)?.getBoundingClientRect();root.querySelectorAll<HTMLElement>('.sweep-card').forEach(el=>{const r=el.getBoundingClientRect();el.style.setProperty('--tx',(to?to.left+to.width/2-(r.left+r.width/2):0)+'px');el.style.setProperty('--ty',(to?to.top+to.height/2-(r.top+r.height/2):80)+'px');});},[sweep]);const active=game.turnId===game.playerId;
 /* Juanita: 본 덱을 모달로 보여준다(예전엔 화면 맨 아래 작은 글씨뿐이라 '아무 일도 안 일어난 것'처럼 보였음) */
 const [peek,setPeek]=useState(false);const peekKey=useRef('');
 useEffect(()=>{const k=game.peekedDeck?game.peekedDeck.map(c=>c.id).join(','):'';if(k&&k!==peekKey.current)setPeek(true);peekKey.current=k;},[game.peekedDeck]);
 /* 능력 처리 완료 알림: decision → 다른 단계로 넘어가는 순간 */
 const [notice,setNotice]=useState<string|null>(null);const prevDec=useRef(game);
 useEffect(()=>{const b=prevDec.current;prevDec.current=game;if(b!==game&&b.phase==='decision'&&game.phase!=='decision'&&b.round===game.round)setNotice(pname(b,b.pendingPlayerId??null)+'의 '+(abilityName[String(b.pendingKind??'')]??'능력')+' 사용 완료');},[game]);
 useEffect(()=>{if(!notice)return;const tm=setTimeout(()=>setNotice(null),2400);return()=>clearTimeout(tm);},[notice]);
 const play=(card:Card,declaration?:CardDeclaration)=>{unlock();if(soundEnabled())fx.thud();lastOwn.current={playerId:game.playerId,card,declaration};setChoice(null);emit('CARD_PLAY',{roomCode:game.roomCode,cardId:card.id,declaration}).catch(showError);};/* 차례 표시: 선(리더) · 지금/다음/N번째 · 제출 완료 */
 const bidding=game.phase==='bidding';const playedIds=new Set(game.trick.map(t=>t.playerId));const nP=game.players.length;const start=Math.max(0,game.players.findIndex(p=>p.id===(bidding?game.leaderId:game.turnId)));const waitOrder=new Map<string,number>();{let k=0;for(let j=0;j<nP;j++){const p=game.players[(start+j)%nP];if(bidding||!playedIds.has(p.id))waitOrder.set(p.id,k++);}}
 const nextUp=game.players.find(p=>!bidding&&!playedIds.has(p.id)&&waitOrder.get(p.id)===1);const nextTxt=nextUp?' · 다음은 '+nextUp.nickname:'';
 /* 비딩 공개 연출(북 3박) · 내 차례 진동 · 트릭 획득 차임 · 좌석 정보 팝업 */
 const [reveal,setReveal]=useState(false);const prevPhase=useRef(game.phase);
 useEffect(()=>{const was=prevPhase.current;prevPhase.current=game.phase;if(was==='bidding'&&game.phase!=='bidding'){setReveal(true);if(soundEnabled())fx.drums();}},[game.phase]);
 useEffect(()=>{if(!reveal)return;const t=setTimeout(()=>setReveal(false),1800);return()=>clearTimeout(t);},[reveal]);
 useEffect(()=>{if(active&&!bidding&&!game.pendingDecision)fx.nudge();},[active,bidding,game.trick.length]);
 useEffect(()=>{if(!sweep||!sweep.winner)return;const mine=sweep.winner===game.playerId;setTimeout(()=>{if(soundEnabled())fx.coin(mine);},sweep.late?1500:850);},[sweep]);
 const [openSeat,setOpenSeat]=useState<string|null>(null);
 useEffect(()=>{if(!openSeat)return;const t=setTimeout(()=>setOpenSeat(null),3200);return()=>clearTimeout(t);},[openSeat]);
 const [focus,setFocus]=useState<string|null>(null);
 useEffect(()=>{if(!focus)return;const t=setTimeout(()=>setFocus(null),3000);return()=>clearTimeout(t);},[focus]);
 useEffect(()=>{setFocus(null);},[game.trick.length]);
 /* 좌석은 내가 맨 아래, 나머지는 시계 방향으로 둘러앉는다. 낸 카드도 자기 좌석 방향에서 날아와 약간 삐뚤게 놓인다. */
 const meIdx=Math.max(0,game.players.findIndex(p=>p.id===game.playerId));
 const rel=(id:string)=>(game.players.findIndex(p=>p.id===id)-meIdx+nP)%nP;
 const ang=(id:string)=>Math.PI/2+2*Math.PI*rel(id)/nP;
 const hs=(s:string)=>[...s].reduce((a,c)=>(a*131+c.charCodeAt(0))>>>0,17);const rnd=(s:string,k:number)=>(hs(s+':'+k)%2000)/1000-1;
 const placed=(id:string,seed:string)=>{const a=ang(id);return {'--ax':Math.cos(a).toFixed(3),'--ay':Math.sin(a).toFixed(3),'--rot':(rnd(seed,1)*10).toFixed(1)+'deg','--jx':(rnd(seed,2)*8).toFixed(1)+'px','--jy':(rnd(seed,3)*7).toFixed(1)+'px'} as CSSProperties;};
 const badge=(p:{id:string})=>{const o=waitOrder.get(p.id)??0;return bidding?(o===0?'첫 리드':(o+1)+'번째'):playedIds.has(p.id)?'제출 완료':o===0?'지금 차례':o===1?'다음':(o+1)+'번째';};
 /* 이름표는 카드와 별도 레이어(항상 맨 위)라서 카드가 겹쳐도 가려지지 않는다. 번호 = 낸 순서. */
 const tagFor=(p:PlayedCard,i:number)=>{const pl=game.players.find(x=>x.id===p.playerId);const mine=p.playerId===game.playerId;const nm=mine?'나':pname(game,p.playerId);const shortName=[...nm].slice(0,3).join('');
  return <button type="button" key={p.playerId+'-t'+i} className={'tag-pill'+(focus===p.playerId?' focused':'')+(mine?' mine':'')} style={placed(p.playerId,p.card.id)} onClick={()=>setFocus(focus===p.playerId?null:p.playerId)} aria-label={(i+1)+'번째 '+nm+' · '+label(p.card)}><i className="ord">{i+1}</i><span className="tp-av"><Avatar name={pl?.nickname??nm} bot={pl?.isBot}/></span><b>{shortName}</b></button>;};
 const seatEl=(p:Pl)=>{const o=waitOrder.get(p.id)??0;const st=bidding?'wait':playedIds.has(p.id)?'done':o===0?'now':o===1?'next':'wait';const isMe=p.id===game.playerId;const a=ang(p.id);
  const pos={'--si':rel(p.id),...(isMe?{}:{left:(50+38*Math.cos(a)).toFixed(2)+'%',top:(46+35*Math.sin(a)).toFixed(2)+'%'})} as CSSProperties;const toggle=()=>{setOpenSeat(openSeat===p.id?null:p.id);setFocus(p.id);};
  return <div key={p.id} data-pid={p.id} data-side={isMe||Math.cos(a)<-.35?'l':Math.cos(a)>.35?'r':'c'} role="button" tabIndex={0} aria-label={p.nickname+' 정보 보기'} onClick={toggle} onMouseEnter={()=>setFocus(p.id)} onMouseLeave={()=>setFocus(null)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}}} style={pos}
   className={'seat '+st+(game.turnId===p.id&&!bidding?' turn':'')+(game.leaderId===p.id?' leader':'')+(isMe?' me':'')+(openSeat===p.id?' open':'')+(focus===p.id?' spot':'')+(sweep&&sweep.winner===p.id?' collect'+(sweep.late?' late':''):'')}>
   <span className="portrait"><Avatar name={p.nickname} bot={p.isBot}/><Bubble playerId={p.id}/>{game.leaderId===p.id&&<em className="lead-tag" title="선(리드)">선</em>}</span>
   <b className="nm">{p.nickname}</b>
   {bidding?<span className="state">{p.bid===null?'고민 중':'봉인'}</span>:<Tally bid={p.bid} tricks={p.tricks}/>}
   <span className="sr">{badge(p)}</span>
   <span className="seat-info"><span><b>{p.score}</b>점</span><span><b>{p.cardsLeft}</b>장</span></span>
   {sweep?.winner===p.id&&<em className="trick-plus">+1</em>}
  </div>;};
 const lastId=log.round===game.round&&log.ids.length?log.ids[log.ids.length-1]:null;
 const needs=(c:Card)=>c.kind==='tigress'||c.isZeroFourteen||(c.kind==='wild'&&!game.trickLead);
 const canPlay=active&&!game.pendingDecision&&game.phase!=='decision';const waiting=game.phase==='decision'&&!game.pendingDecision;
 const turnLine=game.pendingDecision?'능력을 선택하세요.':active?'당신의 차례입니다.'+nextTxt:pname(game,game.turnId)+'의 차례'+nextTxt;
 if((game.phase==='roundScore'||game.phase==='result')&&!sweep)return <Score/>;
 return <main className={'game '+(bidding?'is-bidding':'is-play')}><GameHeader round={game.round} cards={game.cardsThisRound} onHelp={()=>setHelp(true)}/>
 <section className={'felt'+(sweep?.winner?' won':'')+(reveal?' revealing':'')} data-n={Math.min(nP,9)}>
  <Chart/>
  {log.round===game.round&&log.ids.length>0&&<div className="tricklog" aria-label="트릭 기록">{log.ids.map((id,i)=>{const nm=id?pname(game,id):'파괴';return <i key={i} className={id?'':'void'} title={'트릭 '+(i+1)+': '+nm}>{id?ini(nm):'✕'}</i>;})}</div>}
  {game.players.filter(p=>p.id!==game.playerId).map(seatEl)}{game.players.filter(p=>p.id===game.playerId).map(seatEl)}
  <div className="arena">
   {!bidding&&game.trick.length>0&&<div className="lead">{game.trickLead?<><Icon name={suits[game.trickLead].icon}/>{suits[game.trickLead].name} 리드</>:'리드 수트 없음'}</div>}
   <div className={'trick'+(sweep?' holding':'')+(focus?' has-focus':'')}>{game.trick.map((p:PlayedCard,i)=><div key={p.playerId+'-'+i} className={'played'+(p.card.kind==='tigress'&&p.declaration?' as-'+p.declaration:'')+(focus===p.playerId?' focused':'')} style={placed(p.playerId,p.card.id)} onClick={()=>setFocus(focus===p.playerId?null:p.playerId)} onMouseEnter={()=>setFocus(p.playerId)} onMouseLeave={()=>setFocus(null)}><CardView card={p.card} small/>{declTag(p)}</div>)}</div>
   {!sweep&&game.trick.length>0&&<div className="tags">{game.trick.map(tagFor)}</div>}
   {!bidding&&!game.trick.length&&!sweep&&<div className="empty"><span className="hintline">탁자 위에 첫 카드를 내세요</span>{lastId&&<span className="lastwin"><Crest kind="crown"/>직전 트릭 · <b>{pname(game,lastId)}</b></span>}</div>}
   {sweep&&<div className={'sweep'+(sweep.late?' has-late':'')} ref={sweepRef}>{sweep.cards.map((p,i)=><div key={i} className={'played sweep-card'+(p.playerId===sweep.winner?' win':'')+(p.late?' late':'')+(p.card?.kind==='tigress'&&p.declaration?' as-'+p.declaration:'')} style={{...placed(p.playerId,p.card?.id??('x'+i)),'--i':i} as CSSProperties}>{p.card?<><CardView card={p.card} small/>{declTag(p as unknown as PlayedCard)}</>:<div className="card small back" aria-label="마지막 카드"><Icon name="skull"/></div>}</div>)}{sweep.winner?<div className="trick-result"><Crest kind="crown"/><span><b>{pname(game,sweep.winner)}</b> 님이 트릭 획득</span></div>:<span className="sweep-note">승자 없음 · 트릭 파괴</span>}</div>}
  </div>
  {bidding&&<div className="center-ui"><BidPanel/></div>}
  {reveal&&<div className="reveal-note" role="status">예측 공개</div>}
  {game.peekedDeck&&<button className="peek-fab" onClick={()=>setPeek(true)}><Icon name="scroll"/><span>비공개 덱</span></button>}
 </section>
 {bidding?<p className="turntext sub">손패를 살피고, 선원들과 동시에 예측을 공개하세요.</p>:waiting?<p className="turntext wait" role="status"><i className="spinner"/>{pname(game,game.pendingPlayerId??null)}님이 {abilityName[String(game.pendingKind??'')]??'능력'}{game.pendingKind==='lastVolley'?' 추가 카드를 내는 중…':' 능력을 사용하는 중…'}</p>:<p className={'turntext'+(active&&!game.pendingDecision?' mine':'')}>{turnLine}</p>}
 <Hand cards={game.hand} legal={game.legalCardIds} canPlay={bidding?false:canPlay} mode={bidding?'bid':'play'} resetKey={game.round} bar={<ChatInput roomCode={game.roomCode} meId={game.playerId}/>} onPlay={c=>needs(c)?setChoice(c):play(c)}/>
 {choice&&<div className="modal"><div className="sheet">{choice.isZeroFourteen?<><h2>0/14 선언</h2><div className="choices"><button onClick={()=>play(choice,0)}>0</button><button className="primary" onClick={()=>play(choice,14)}>14</button></div></>:choice.kind==='wild'?<><h2>Wild Monkey 15</h2><div className="choices">{(['parrot','map','treasure'] as const).map(s=><button key={s} onClick={()=>play(choice,s)}><Icon name={suits[s].icon}/> {suits[s].name}</button>)}</div></>:<><h2>Tigress 선언</h2><div className="choices"><button className="primary" onClick={()=>play(choice,'pirate')}><Icon name="sword"/>Pirate</button><button onClick={()=>play(choice,'escape')}><Icon name="escape"/>Escape</button></div></>}<button className="text" onClick={()=>setChoice(null)}>취소</button></div></div>}
 {notice&&<div className="notice" role="status">{notice}</div>}{peek&&game.peekedDeck&&<div className="modal" onClick={()=>setPeek(false)}><div className="sheet peek" onClick={e=>e.stopPropagation()}><h2>Juanita · 비공개 덱 확인</h2><p>이 정보는 당신에게만 공개됩니다.</p><p>{game.peekedDeck.length?'남은 덱 '+game.peekedDeck.length+'장':'남은 덱이 없어요.'}</p><div className="pick-row mini">{game.peekedDeck.map(c=><CardView key={c.id} card={c} small/>)}</div><button className="primary" onClick={()=>setPeek(false)}>확인</button></div></div>}{game.pendingDecision&&<Decision pending={game.pendingDecision}/>} {help&&<Help close={()=>setHelp(false)}/>}</main>;
}
const pname=(game:NonNullable<ReturnType<typeof useGame.getState>['game']>,id:string|null)=>game?.players.find(p=>p.id===id)?.nickname??'—';
const rankOf=(rows:{total:number}[],i:number)=>rows.findIndex(r=>r.total===rows[i].total)+1;
function Score(){
  const game=useGame(s=>s.game)!;const latest=game.history.at(-1);const [help,setHelp]=useState(false);const final=game.phase==='result';const [view,setView]=useState<'round'|'total'>(final?'total':'round');const boardRef=useRef<HTMLDivElement>(null);useEffect(()=>{const e=boardRef.current;if(view==='total'&&e)e.scrollLeft=e.scrollWidth;},[view,game.history.length]);
  const ranking=[...(latest?.scores??[])].sort((a,b)=>b.total-a.total);const n=ranking.length;const host=game.hostId===game.playerId;
  const maxTotal=Math.max(1,...ranking.map(r=>r.total));const top=ranking[0];const champs=final&&top?ranking.filter(r=>r.total===top.total):[];
  const gain=(r:{base:number;bonus:number})=>r.base+r.bonus;const best=[...ranking].sort((a,b)=>gain(b)-gain(a))[0];
  const myIdx=ranking.findIndex(r=>r.playerId===game.playerId);const myWin=champs.some(c=>c.playerId===game.playerId);
  const pod=[1,0,2].filter(k=>ranking[k]);
  const ledger=latest&&<ol className="ledger" aria-label="점수표">{ranking.map((r,i)=>{
    const nm=pname(game,r.playerId);const g=gain(r);const hit=r.bid===r.tricks;const rk=rankOf(ranking,i);const me=r.playerId===game.playerId;const delay=(final?1.9:.35)+(n-1-i)*.3;
    return <li key={r.playerId} className={'lrow'+(rk===1?' first':'')+(me?' me':'')} style={{'--h':hue(nm),'--d':delay+'s'} as CSSProperties}>
      <span className={'medal m'+Math.min(rk,4)}>{rk===1?<Icon name="crown"/>:rk}</span><span className="bwrap"><Avatar name={nm}/><Bubble playerId={r.playerId}/></span>
      <div className="lmain"><b>{nm}{me&&<u>나</u>}</b><span className="lline"><em className={'res '+(hit?'ok':'no')}>{hit?(r.bid===0?'무승 성공':'적중'):'빗나감'}</em><span>예측 {r.bid} · 획득 {r.tricks}</span></span><span className="lbreak">기본 {sg(r.base)} · 보너스 {sg(r.bonus)}</span></div>
      <div className={'ldelta '+(g>0?'pos':g<0?'neg':'zero')}><strong><CountUp to={g} delay={delay*1000+250} signed/></strong><small>이번 라운드</small></div>
      <div className="ltotal"><b><CountUp to={r.total} delay={delay*1000+250}/></b><small>누적</small><i><s style={{width:Math.max(0,r.total)/maxTotal*100+'%'}}/></i></div>
    </li>;})}</ol>;
  /* 모두 확인 → 다음 라운드. 서버가 advanceReady(확인한 playerId 배열)를 내려주면 전원 확인 방식,
     내려주지 않으면 기존처럼 방장 버튼만 쓴다. 봇은 항상 확인한 것으로 보고 사람 수만 센다. */
  const [sent,setSent]=useState(false);useEffect(()=>{setSent(false);},[game.round,game.phase]);
  const readyRaw=(game as unknown as {advanceReady?:string[]}).advanceReady;const confirmMode=Array.isArray(readyRaw);
  const humans=game.players.filter(p=>!p.isBot);const readySet=new Set<string>([...(readyRaw??[]),...(sent?[game.playerId]:[])]);
  const readyN=humans.filter(p=>readySet.has(p.id)).length;const iReady=readySet.has(game.playerId);
  const confirmRound=()=>{if(iReady)return;setSent(true);emit('ROUND_ADVANCE',{roomCode:game.roomCode}).catch(e=>{setSent(false);showError(e);});};
  const rn=(h:unknown,i:number)=>(h as {round?:number}).round??i+1;const last=game.history.length-1;
  /** 전체 점수표: 라운드별 점수(큰 숫자)와 그 시점의 누적(작은 숫자), 오른쪽 끝에 현재 총점 */
  const board=latest&&<div className="board paper" ref={boardRef} role="region" aria-label="전체 점수표" tabIndex={0}><table>
    <thead><tr><th className="who" scope="col">선원</th>{game.history.map((h,i)=><th key={i} scope="col" className={i===last?'cur':''}>R{rn(h,i)}</th>)}<th className="sum" scope="col">총점</th></tr></thead>
    <tbody>{ranking.map((r,idx)=>{const nm=pname(game,r.playerId);const rk=rankOf(ranking,idx);const me=r.playerId===game.playerId;
      return <tr key={r.playerId} className={me?'me':''}><th className="who" scope="row"><div className="wh"><span className={'medal m'+Math.min(rk,4)}>{rk===1?<Icon name="crown"/>:rk}</span><Avatar name={nm}/><b>{nm}{me&&<u>나</u>}</b></div></th>
        {game.history.map((h,i)=>{const e=h.scores.find(x=>x.playerId===r.playerId);const g=e?gain(e):0;return <td key={i} className={(g>0?'pos':g<0?'neg':'')+(i===last?' cur':'')} title={e?'예측 '+e.bid+' · 획득 '+e.tricks:''}><b>{e?sg(g):'–'}</b><small>{e?e.total:''}</small></td>;})}
        <td className="sum"><b>{r.total}</b></td></tr>;})}</tbody></table>
    <p className="board-note">큰 숫자는 그 라운드에서 얻은 점수, 작은 숫자는 그 라운드까지의 누적 점수입니다.</p></div>;
  return <main className={'game score'+(final?' final-score':'')}>
    <GameHeader round={game.round} cards={game.cardsThisRound} title={final?'최종 결산':'라운드 정산'} onHelp={()=>setHelp(true)}/>
    {final?<section className="finale">
      <div className="fx" aria-hidden="true"><i className="rays"/>{Array.from({length:18},(_,i)=><i className="coin" key={i} style={{left:(i*47+9)%100+'%',animationDelay:(i%9)*.45+'s',animationDuration:3.4+(i%5)*.5+'s'}}/>)}</div>
      <p className="eyebrow">THE CAPTAIN’S LOG · FINAL</p>
      <div className="crown-big" aria-hidden="true"><Icon name="crown" strokeWidth={1.1}/></div>
      <p className="champ-label">{champs.length>1?'공동 우승':'새로운 바다의 지배자'}</p>
      <h1 className="champ-name">{champs.map(c=>pname(game,c.playerId)).join(' · ')||'항해의 끝'}</h1>
      {top&&<p className="champ-score"><CountUp to={top.total} delay={900} dur={1500}/><small>점</small></p>}
      <div className="podium">{pod.map(k=>{const r=ranking[k];const nm=pname(game,r.playerId);return <div key={r.playerId} className={'pod p'+k+(r.playerId===game.playerId?' me':'')} style={{'--h':hue(nm),'--d':(k===0?1.3:k===1?.5:.8)+'s'} as CSSProperties}><span className="bwrap"><Avatar name={nm}/><Bubble playerId={r.playerId}/></span><b>{nm}</b><strong>{r.total}</strong><div className="pillar"><em>{rankOf(ranking,k)}</em></div></div>;})}</div>
      {myIdx>=0&&<p className={'myrank'+(myWin?' win':'')}>{myWin?'당신이 이 바다의 주인입니다.':'당신의 최종 순위 '+rankOf(ranking,myIdx)+'위 · '+ranking[myIdx].total+'점'}</p>}
    </section>:<section className="roundhead"><div className="crest" aria-hidden="true"><Icon name="anchor" strokeWidth={1.2}/></div><p className="eyebrow">THE CAPTAIN’S LOG · ROUND {game.round}</p><h1>라운드 {game.round} 정산</h1>{best&&gain(best)>0&&<p className="mvp"><Icon name="coin"/>이번 라운드 최고 득점 <b>{pname(game,best.playerId)}</b><em>+{gain(best)}</em></p>}</section>}
    {latest&&<div className="score-tabs"><div className="seg" role="tablist" aria-label="점수 보기">{([['round',final?'마지막 라운드':'이번 라운드'],['total','전체 점수표']] as const).map(([k,t])=><button key={k} type="button" role="tab" aria-selected={view===k} className={view===k?'on':''} onClick={()=>setView(k)}>{t}</button>)}</div></div>}
    {view==='round'?ledger:board}
    {!final&&<p className="score-note">예측을 맞힌 선원만 보너스를 온전히 획득합니다.</p>}
    <div className="chat-inline"><ChatInput roomCode={game.roomCode} meId={game.playerId} wide/></div>
    <div className="score-actions">
      {!final&&confirmMode&&<div className="confirm">
        <button className="primary cta-lg" disabled={iReady} onClick={confirmRound}>{iReady?<><Icon name="check"/>확인 완료</>:<>확인하고 다음 항해로<Icon name="next"/></>}<span className="count" aria-label={'확인한 인원 '+readyN+'명, 전체 '+humans.length+'명'}>{readyN}/{humans.length}</span></button>
        <ul className="ready-row" aria-label="확인 현황">{humans.map(p=>{const ok=readySet.has(p.id);return <li key={p.id} className={ok?'ok':''} title={p.nickname+(ok?' · 확인함':' · 확인 중')}><Avatar name={p.nickname}/>{ok&&<i><Icon name="check"/></i>}</li>;})}</ul>
        <p className="hint">{iReady?'다른 선원이 확인하면 바로 다음 항해가 시작됩니다.':'모든 선원이 확인하면 다음 항해가 시작됩니다.'}</p></div>}
      {game.canAdvance&&!final&&!confirmMode&&<button className="primary cta-lg" onClick={()=>emit('ROUND_ADVANCE',{roomCode:game.roomCode}).catch(showError)}>다음 항해를 시작합니다<Icon name="next"/></button>}
      {!final&&!confirmMode&&!game.canAdvance&&<p className="waiting-captain"><i className="spinner"/>다음 항해를 준비하는 중입니다…</p>}
      {final&&(host?<><button className="primary cta-lg" onClick={()=>emit('GAME_RETURN_TO_LOBBY',{roomCode:game.roomCode}).catch(showError)}><Icon name="anchor"/>선원 모집으로 돌아가기</button><p className="hint">모든 선원이 대기실로 돌아가 한 판 더 즐길 수 있어요.</p></>:<p className="waiting-captain"><i className="spinner"/>선장이 대기실로 돌아가기를 기다리는 중입니다…</p>)}
    </div>
    {help&&<Help close={()=>setHelp(false)}/>}</main>;
}
const hue=(s:string)=>[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))%360,7);
function Lobby(){
  const game=useGame(s=>s.game)!;const me=game.players.find(p=>p.id===game.playerId)!;const host=game.hostId===game.playerId;const [help,setHelp]=useState(false);const [copied,setCopied]=useState(false);
  const cards=game.config.cards??emptyCards;const on=cardSettings.filter(([k])=>cards[k]);const readyN=game.players.filter(p=>p.ready).length;
  const canStart=host&&game.players.length>=2&&game.players.every(p=>p.ready);const modeInfo=modes.find(([id])=>id===game.config.roundMode);
  const copy=async()=>{try{await navigator.clipboard.writeText(game.roomCode);setCopied(true);setTimeout(()=>setCopied(false),1600);}catch{showError(new Error('복사하지 못했어요. 코드를 직접 선택해 주세요.'));}};
  const hint=host?(canStart?'모두 준비됐어요. 출항하세요!':game.players.length<2?'최소 2명이 필요해요. 봇으로 채울 수도 있어요.':'모든 선원이 준비하면 출항할 수 있어요 ('+readyN+'/'+game.players.length+')'):'선장이 출항하기를 기다리는 중이에요.';
  return <main className="harbor">
    <header className="topbar"><button className="leave" onClick={()=>leaveRoom(game.roomCode)}><Icon name="back"/><span>나가기</span></button><button className="help-orb" onClick={()=>setHelp(true)} aria-label="도움말 열기"><Icon name="help"/></button></header>
    <div className="harbor-head"><div><h1>선원 모집</h1><p>친구에게 방 코드를 알려 주세요.</p></div>
      <button type="button" className="roomcode" onClick={copy} aria-label={'방 코드 '+game.roomCode+' 복사'}><small>방 코드</small><strong>{game.roomCode}</strong><span>{copied?'복사했어요':'눌러서 복사'}</span></button></div>
    <div className="harbor-body">
      <ul className="roster" aria-label="선원 목록">{Array.from({length:game.config.maxPlayers},(_,i)=>{const p=game.players[i];
        if(!p)return <li className="berth vacant" key={'v'+i}><span className="avatar"><Icon name="plus"/></span><b>빈 자리</b><small>기다리는 중…</small></li>;
        return <li className={'berth'+(p.ready?' ready':'')+(p.id===game.playerId?' me':'')} key={p.id} style={{'--h':hue(p.nickname)} as CSSProperties}><span className="avatar"><Avatar name={p.nickname} bot={p.isBot}/><Bubble playerId={p.id}/></span>
          <b>{p.nickname}{p.id===game.playerId&&<em className="tag">나</em>}{p.id===game.hostId&&<em className="tag host">선장</em>}</b><small className={p.ready?'ok':''}>{p.isBot?'봇 · ':''}{p.ready?'준비 완료':'준비 중'}</small></li>;})}</ul>
      <aside className="voyage paper"><h2>항해 설정</h2>
        <dl><div><dt>인원</dt><dd>{game.players.length} / {game.config.maxPlayers}명</dd></div><div><dt>방식</dt><dd>{modeInfo?modeInfo[1]:game.config.roundMode}{modeInfo&&<small>{modeInfo[2]}</small>}</dd></div><div><dt>덱</dt><dd>{deckSize(cards)}장</dd></div></dl>
        <div className="chips">{on.length?on.map(([k,t])=><span className="chip" key={k}>{t}</span>):<span className="chip">Classic 기본 덱</span>}</div></aside>
    </div>
    <div className="harbor-actions"><ChatInput roomCode={game.roomCode} meId={game.playerId} wide/><p className="hint">{hint}</p>
      <div className="btnrow"><button className={me.ready?'':'primary'} onClick={()=>emit('PLAYER_READY',{roomCode:game.roomCode}).catch(showError)}>{me.ready?'준비 취소':'준비 완료'}</button>
        {host&&<button disabled={game.players.length>=game.config.maxPlayers} onClick={()=>emit('BOT_FILL',{roomCode:game.roomCode}).catch(showError)}>봇으로 채우기</button>}
        {host&&<button className={me.ready?'primary':''} disabled={!canStart} onClick={()=>emit('GAME_START',{roomCode:game.roomCode}).catch(showError)}><Icon name="anchor"/>출항</button>}</div></div>
    {help&&<Help close={()=>setHelp(false)}/>}
  </main>;
}
function App(){const game=useGame(s=>s.game);const error=useGame(s=>s.error);useChatSync();useEffect(()=>{if(!error)return;const timer=setTimeout(()=>useGame.getState().setError(null),3500);return()=>clearTimeout(timer);},[error]);
  useEffect(()=>{window.addEventListener('pointerdown',unlock);return()=>window.removeEventListener('pointerdown',unlock);},[]);
  const inRoom=!!game;useEffect(()=>{fx.ambience(inRoom);},[inRoom]);
  return <><Scene mode={game?(game.phase==='lobby'?'lobby':'game'):'home'}/>{game?(game.phase==='lobby'?<Lobby/>:<Table/>):<Landing/>}{error&&game&&<div className="toast">{error}</div>}</>;}
createRoot(document.getElementById('root')!).render(<App/>);
