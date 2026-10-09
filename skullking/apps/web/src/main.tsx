import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Card, CardDeclaration, CardOptions, GameConfig, PendingDecision, PlayedCard, Suit } from '@skullking/shared';
import { cardArt } from './card-art';
import { clearSession, emit, saveSession } from './socket';
import { playCardSound, unlockCardSounds } from './sound';
import { useGame } from './store';
import './styles.css';

const SFX_PREF='skullking.effects';
const soundEnabled=()=>{try{return localStorage.getItem(SFX_PREF)!=='off';}catch{return true;}};
const setSoundEnabled=(enabled:boolean)=>{try{localStorage.setItem(SFX_PREF,enabled?'on':'off');}catch{/* 저장소를 사용할 수 없어도 현재 화면에서는 계속 작동 */}};

const suits: Record<Suit,{icon:string;name:string}>={parrot:{icon:'♧',name:'앵무새'},map:{icon:'⌖',name:'지도'},treasure:{icon:'◈',name:'보물'},jolly:{icon:'✦',name:'졸리 로저'}};
const emptyCards: CardOptions={kraken:false,whale:false,loot:false,pirateAbilities:false,expansionSuitCards:false,wildMonkey:false,maryThorne:false,lastVolley:false,firstMateCon:false,stingray:false,davyJones:false,walkThePlank:false};
const fullCards: CardOptions={kraken:true,whale:true,loot:true,pirateAbilities:true,expansionSuitCards:true,wildMonkey:true,maryThorne:true,lastVolley:true,firstMateCon:true,stingray:true,davyJones:true,walkThePlank:true};
const cardSettings: Array<[keyof CardOptions,string,string]>=[
  ['kraken','Kraken','트릭을 폐기합니다.'],['whale','White Whale','숫자만 남기고 가장 높은 숫자가 이깁니다.'],['loot','Loot ×2','승자와 성공 시 +20 동맹입니다.'],['pirateAbilities','Pirate Abilities','5명의 일반 Pirate 능력을 사용합니다.'],
  ['expansionSuitCards','수트 확장 12장','7(-5), 8(+5), 0/14를 넣습니다.'],['wildMonkey','Wild Monkey 15','검정을 제외한 수트를 선언하는 15입니다.'],['maryThorne','Mary Thorne','승리 후 다음 강제 카드를 정합니다.'],
  ['lastVolley','The Last Volley','추가 한 장을 선언까지 마치고 내며 마지막 트릭을 건너뜁니다.'],['firstMateCon','First Mate Con','Pirate를 이기고, 잡은 Pirate 능력을 모두 이어서 사용합니다.'],['stingray','Spotted Stingray','숫자만 남기고 가장 낮은 숫자가 이깁니다.'],
  ['davyJones',"Davy Jones' Locker",'Sea Monster를 제거하고 한 장당 +20입니다.'],['walkThePlank','Walk the Plank','트릭의 Pirate 중 제거할 대상을 직접 고릅니다.'],
];
const icon:Record<Card['kind'],string>={number:'',wild:'15',pirate:'⚔',tigress:'♛',skullKing:'☠',mermaid:'♆',escape:'⌁',kraken:'✹',whale:'≈',stingray:'◇',davy:'†',con:'⌖',lastVolley:'✦',plank:'⌁',loot:'◈'};
const label=(c:Card)=>c.kind==='number'?suits[c.suit!].name+' '+(c.isZeroFourteen?'0/14':c.rank):c.name;
const showError=(e:unknown)=>useGame.getState().setError(e instanceof Error?e.message:'요청을 처리할 수 없습니다.');
const leaveRoom=async(roomCode:string)=>{try{await emit('ROOM_LEAVE',{roomCode});}catch(e){showError(e);}finally{clearSession();useGame.getState().setGame(null);}};

const declTag=(p:PlayedCard)=>p.card.kind==='tigress'&&p.declaration?<b className={'declared-tag '+p.declaration}>{p.declaration==='pirate'?'☠ 해적':'⛵ 탈출'}</b>:(p.card.isZeroFourteen||p.card.kind==='wild')?<b className="declared-value">{p.card.kind==='wild'?(suits[p.declaration as Suit]?.icon??String(p.declaration)):String(p.declaration)}</b>:null;
type SweepCard={playerId:string;card:Card|null;declaration?:CardDeclaration;late?:boolean};
const art=(n:string)=>import.meta.env.BASE_URL+'card-art/'+n+'.jpg';
function Scene({mode}:{mode:'home'|'lobby'|'game'}){return <div className={'scene '+mode} aria-hidden="true"><div className="scene-moon"/><svg className="scene-ship" viewBox="0 0 300 260"><g fill="#03060c"><path d="M20 190q130 40 260 0l-20 30q-110 28-220 0Z"/><rect x="146" y="20" width="5" height="175"/><path d="M60 40q40 50 86 20V150Q100 170 60 140ZM152 30q60 40 90 100-40 20-90 12Z"/><rect x="76" y="90" width="3" height="100"/></g></svg>{Array.from({length:26},(_,i)=><i className="star" key={'s'+i} style={{left:(i*37)%100+'%',top:(i*53)%46+'%',animationDelay:(i%7)*.4+'s'}}/>)}{[0,1,2].map(k=><svg key={k} className={'scene-wave w'+k} viewBox="0 0 2700 200" preserveAspectRatio="none"><path d={'M0 24'+'q80-26 160 0t160 0'.repeat(17)+'V200H0Z'}/></svg>)}{Array.from({length:14},(_,i)=><i className="ember" key={'e'+i} style={{left:(i*71)%100+'%',animationDelay:(i%7)*1.3+'s',animationDuration:7+(i%5)+'s'}}/>)}</div>;}
type CardViewProps={card:Card;small?:boolean}&ButtonHTMLAttributes<HTMLButtonElement>;
function CardView({card,small,disabled,className,...rest}:CardViewProps) {
  const art=cardArt(card);
  return <button type="button" {...rest} disabled={disabled} className={'card '+card.kind+' '+(art?'art-card ':'')+(small?'small ':'')+(disabled?'disabled ':'')+(className??'')} title={label(card)}>
    {art?<img className="card-art" src={art} alt={label(card)} draggable={false}/>:<><span className={'card-sigil '+(card.kind==='number'?'suit-'+card.suit:'')}>{card.kind==='number'?suits[card.suit!].icon:icon[card.kind]}</span><b>{card.kind==='number'?card.rank:card.kind==='wild'?'15':''}</b><em>{label(card)}</em></>}
  </button>;
}
/* ───── v3 공용 조각: 이니셜 · 해골 · 카운트업 · 트릭 현황 ───── */
const ini=(s:string)=>[...s][0]??'?';
const sg=(v:number)=>v>0?'+'+v:String(v);
const wavePath='M0 24'+'q80-26 160 0t160 0'.repeat(17)+'V200H0Z';
function Crest({kind='anchor',className}:{kind?:'anchor'|'crown'|'coin';className?:string}){return <svg className={className} viewBox="0 0 48 48" aria-hidden="true">{kind==='anchor'?<g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="8" r="3.3"/><path d="M24 12v25M16 17h16M10 27c0 8 5.5 13 14 13s14-5 14-13M10 27l-4 4m32-4 4 4"/></g>:kind==='crown'?<g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round"><path d="m7 16 10 8 7-14 7 14 10-8-4 22H11z"/><path d="M12 43h24"/></g>:<g fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="24" cy="24" r="17"/><path d="M30 17c-1.4-2-3.1-2.8-5.6-2.8-3.1 0-5.2 1.7-5.2 4.1 0 6.3 10.6 3 10.6 9.7 0 2.7-2.3 4.8-5.8 4.8-2.2 0-4.3-.8-5.9-2.5M24 11v26"/></g>}</svg>;}
function CountUp({to,delay=0,dur=1000,signed}:{to:number;delay?:number;dur?:number;signed?:boolean}){
  const [v,setV]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?to:0);
  useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setV(to);return;}let raf=0;const t0=performance.now()+delay;const step=(t:number)=>{const k=Math.min(1,Math.max(0,(t-t0)/dur));setV(Math.round(to*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(step);};raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);},[to,delay,dur]);
  return <>{signed&&v>0?'+':''}{v}</>;
}
/** 선원 칩의 트릭 현황: 예측 수만큼 구슬을 놓고, 딴 만큼 금색으로 채운다(초과분은 붉은색). */
function Tally({bid,tricks}:{bid:number|null;tricks:number}){
  if(bid===null)return <span className="tally"><span className="lab">획득</span><em className="n">{tricks}</em></span>;
  const cnt=Math.min(Math.max(bid,tricks),12);
  return <span className={'tally'+(tricks===bid?' exact':tricks>bid?' over':'')} title={'예측 '+bid+' · 획득 '+tricks}><span className="lab">{bid===0?'무승':'트릭'}</span><span className="pips">{Array.from({length:cnt},(_,k)=><i key={k} className={k<tricks?(k>=bid?'on bust':'on'):''}/>)}</span><em className="n">{tricks}</em><span className="of">/{bid}</span></span>;
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
function Hand({cards,legal,canPlay,mode,resetKey,onPlay}:{cards:Card[];legal:string[];canPlay:boolean;mode:'bid'|'play';resetKey:number|string;onPlay?:(c:Card)=>void}){
  const [order,setOrder]=useState<string[]>([]);const [sortMode,setSortMode]=useState<'suit'|'rank'|null>('suit');
  const [sel,setSel]=useState<string|null>(null);const [drag,setDrag]=useState<{id:string;x:number;over:number}|null>(null);const [width,setWidth]=useState(0);
  const box=useRef<HTMLDivElement>(null);const info=useRef<{id:string;sx:number;sy:number;off:number;moved:boolean;over:number}|null>(null);
  useEffect(()=>{setOrder([]);setSortMode('suit');setSel(null);},[resetKey]);
  useEffect(()=>{if(canPlay)setSel(null);},[canPlay]);/* 내 차례가 되는 순간 선택 해제 → 이전에 올려둔 카드가 한 번 탭으로 나가는 사고 방지 */
  useEffect(()=>{if(sel&&!cards.some(c=>c.id===sel))setSel(null);},[cards,sel]);
  useEffect(()=>{if(!sel)return;const h=(e:Event)=>{if(!box.current?.contains(e.target as Node))setSel(null);};document.addEventListener('pointerdown',h);return()=>document.removeEventListener('pointerdown',h);},[sel]);
  useLayoutEffect(()=>{const el=box.current;if(!el)return;const ro=new ResizeObserver(()=>setWidth(el.clientWidth));ro.observe(el);setWidth(el.clientWidth);return()=>ro.disconnect();},[]);
  const list=useMemo(()=>{const byId=new Map(cards.map(c=>[c.id,c] as const));const kept=order.filter(id=>byId.has(id));const keptSet=new Set(kept);return [...kept.map(id=>byId.get(id)!),...sortCards(cards.filter(c=>!keptSet.has(c.id)),'suit')];},[cards,order]);
  const shown=useMemo(()=>{if(!drag)return list;const from=list.findIndex(c=>c.id===drag.id);if(from<0)return list;const next=[...list];const [c]=next.splice(from,1);next.splice(Math.max(0,Math.min(next.length,drag.over)),0,c);return next;},[list,drag?.id,drag?.over]);
  const n=shown.length;const W=width||360;
  const cw=W<460?Math.round(Math.min(76,Math.max(62,W*.2))):W<820?96:112;const ch=Math.round(cw*156/110);
  const pad=Math.round(cw*.16);const U=Math.max(cw,W-pad*2);/* 회전한 양 끝 카드가 화면 밖으로 잘리지 않게 좌우 여백 */
  const step=n>1?Math.max(10,Math.min(cw*.8,(U-cw)/(n-1))):0;const total=cw+step*Math.max(0,n-1);const left0=Math.max(0,pad+(U-total)/2);const H=ch+84;const mid=(n-1)/2;
  const slot=(i:number)=>left0+i*step;
  const tap=(id:string)=>{const c=list.find(x=>x.id===id);if(!c)return;if(sel!==id){setSel(id);return;}if(mode==='play'&&canPlay&&legal.includes(id)&&onPlay){setSel(null);onPlay(c);}else setSel(null);};
  const down=(e:ReactPointerEvent<HTMLButtonElement>,id:string)=>{if(e.pointerType==='mouse'&&e.button!==0)return;const br=box.current!.getBoundingClientRect();const i=shown.findIndex(c=>c.id===id);info.current={id,sx:e.clientX,sy:e.clientY,off:e.clientX-br.left-slot(i),moved:false,over:i};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* 일부 브라우저 예외 무시 */}};
  const move=(e:ReactPointerEvent<HTMLButtonElement>)=>{const d=info.current;if(!d)return;if(!d.moved){if(Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<8)return;d.moved=true;setSel(null);}
    const br=box.current!.getBoundingClientRect();const x=Math.max(left0-cw*.35,Math.min(e.clientX-br.left-d.off,left0+total-cw*.65));const over=step>0?Math.max(0,Math.min(n-1,Math.round((x-left0)/step))):0;d.over=over;setDrag({id:d.id,x,over});};
  const finish=(commit:boolean)=>{const d=info.current;info.current=null;if(!d)return;
    if(d.moved){if(commit){const ids=list.map(c=>c.id);ids.splice(ids.indexOf(d.id),1);ids.splice(d.over,0,d.id);setOrder(ids);setSortMode(null);}setDrag(null);}
    else if(commit)tap(d.id);};
  const sortBy=(by:'suit'|'rank')=>{setOrder(sortCards(cards,by).map(c=>c.id));setSortMode(by);setSel(null);};
  const selIdx=drag?-1:shown.findIndex(c=>c.id===sel);const selCard=selIdx>=0?shown[selIdx]:null;const okSel=!!selCard&&mode==='play'&&canPlay&&legal.includes(selCard.id);
  return <section className="handwrap" aria-label="내 손패">
    <div className="hand-bar"><span className="hand-title">내 손패<small>{n}장 · 카드를 끌어서 순서를 바꿀 수 있어요</small></span>
      <div className="seg sm" role="group" aria-label="손패 정렬"><button type="button" className={sortMode==='suit'?'on':''} onClick={()=>sortBy('suit')}>수트순</button><button type="button" className={sortMode==='rank'?'on':''} onClick={()=>sortBy('rank')}>숫자순</button></div></div>
    <div className="hand-box" ref={box} style={{height:H}} onPointerDown={e=>{if(e.target===e.currentTarget)setSel(null);}}>
      {shown.map((c,i)=>{const dragging=drag?.id===c.id;const isSel=sel===c.id&&!dragging;const ok=mode==='play'&&canPlay&&legal.includes(c.id);const dim=mode==='play'&&canPlay&&!ok;
        const arc=Math.pow(i-mid,2)*Math.min(.9,5/Math.max(n,1));const rot=dragging?0:(i-mid)*Math.min(2.6,16/Math.max(n,1));
        return <CardView key={c.id} card={c} className={'hcard'+(dragging?' dragging':'')+(isSel?' sel':'')+(ok?' ok':'')+(dim?' dim':'')} aria-pressed={isSel}
          onPointerDown={e=>down(e,c.id)} onPointerMove={move} onPointerUp={()=>finish(true)} onPointerCancel={()=>finish(false)} onClick={e=>{if(e.detail===0)tap(c.id);}}
          style={{width:cw,height:ch,left:dragging?drag!.x:slot(i),zIndex:dragging?200:isSel?100:i+1,'--y':(isSel?-30:dragging?-14:arc)+'px','--r':rot+'deg','--d':Math.min(i,10)*.04+'s'} as CSSProperties}/>;})}
      {selCard&&mode==='play'&&<span className={'hand-tip'+(okSel?'':' no')} style={{left:Math.max(72,Math.min(W-72,slot(selIdx)+cw/2)),top:Math.max(0,H-ch-74)}}>{okSel?'한 번 더 눌러서 내기':canPlay?'지금은 낼 수 없는 카드예요':'내 차례가 아니에요'}</span>}
    </div>
  </section>;
}
/** 모달용 카드 선택: 탭으로 고르고 버튼으로 확정(되돌릴 수 없는 선택이 한 번 탭으로 실행되지 않게) */
function CardPicker({cards,cta,onPick,disabled}:{cards:Card[];cta:string;onPick:(c:Card)=>void;disabled?:boolean}){
  const [sel,setSel]=useState<string|null>(null);
  return <><div className="pick-row">{sortCards(cards,'suit').map(c=><CardView key={c.id} card={c} className={sel===c.id?'picked-card':''} onClick={()=>setSel(sel===c.id?null:c.id)}/>)}</div>
    <button className="gold" disabled={!sel||disabled} onClick={()=>{const c=cards.find(x=>x.id===sel);if(c){setSel(null);onPick(c);}}}>{sel?cta:'카드를 한 장 고르세요'}</button></>;
}
const helpTabs=['항해 규칙','서열','보너스','특수 카드','해적 능력'] as const;
function Tile({img,title,desc,tag}:{img:string;title:string;desc:string;tag?:string}){return <div className="tile"><img src={art(img)} alt={title} loading="lazy" draggable={false}/><div><b>{title}{tag&&<em>{tag}</em>}</b><p>{desc}</p></div></div>;}
function Beat({a,b,note,bonus}:{a:string;b:string;note:string;bonus:string}){return <div className="beat"><img src={art(a)} alt="" draggable={false}/><span className="beat-arrow">이긴다<i>→</i></span><img src={art(b)} alt="" draggable={false}/><div><b>{note}</b><em>{bonus}</em></div></div>;}
function Help({close}:{close:()=>void}) {
  const [tab,setTab]=useState<typeof helpTabs[number]>('항해 규칙');
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[close]);
  return <div className="modal" onClick={close}><div className="help book" onClick={e=>e.stopPropagation()}><button type="button" className="help-x" onClick={close} aria-label="도움말 닫기">✕</button>
    <nav className="help-tabs">{helpTabs.map(t=><button key={t} className={t===tab?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    <div className="help-body" key={tab}>
      {tab==='항해 규칙'&&<><h2>항해 규칙</h2><ol className="steps"><li><b>딜</b>N라운드에는 N장씩 받습니다.</li><li><b>비딩</b>이번 라운드에 딸 트릭 수를 정해 동시에 공개합니다.</li><li><b>트릭</b>선(리드)부터 시계 방향으로 한 장씩 냅니다. 이긴 사람이 다음 선이 됩니다.</li><li><b>정산</b>예측이 정확하면 트릭당 <em>+20</em>, 틀리면 차이당 <em>-10</em>. 0 예측은 딜된 장수 × 10점을 걸고 성공·실패가 갈립니다.</li></ol>
        <h3>수트 따르기</h3><div className="suit-row">{[['parrot-7','앵무새'],['map-7','지도'],['treasure-7','보물'],['jolly-7','졸리 로저 · 트럼프']].map(([i,t])=><figure key={i}><img src={art(i)} alt={t} draggable={false}/><figcaption>{t}</figcaption></figure>)}</div><p className="help-note">Escape·Loot 및 일부 확장 특수 카드 뒤에는 처음 나온 숫자 카드가 리드 수트가 됩니다. Pirate·Mermaid·Skull King·Kraken·White Whale이 먼저 나오면 그 트릭에는 리드 수트가 없습니다.</p></>}
      {tab==='서열'&&<><h2>서열 · 가위바위보</h2><Beat a="skull-king" b="pirate-rosie" note="Skull King이 Pirate를 잡음" bonus="+30 / 장"/><Beat a="pirate-rosie" b="mermaid-alyra" note="Pirate가 Mermaid를 잡음" bonus="+20 / 장"/><Beat a="mermaid-alyra" b="skull-king" note="Mermaid가 Skull King을 잡음" bonus="+40"/><p className="help-note">셋이 한 트릭에 모두 나오면 <b>Mermaid</b>가 이깁니다.</p>
        <h3>기본 높낮이</h3><div className="ladder">{[['escape','Escape','항상 짐'],['parrot-9','숫자 카드','리드 수트 중 최고'],['jolly-9','졸리 로저','트럼프'],['pirate-rosie','특수 캐릭터','위 가위바위보']].map(([i,t,d],k)=><Fragment key={i}>{k>0&&<span className="lad-arrow">›</span>}<figure><img src={art(i)} alt={t} draggable={false}/><figcaption><b>{t}</b>{d}</figcaption></figure></Fragment>)}</div></>}
      {tab==='보너스'&&<><h2>보너스</h2><p className="help-note strong">보너스는 <b>예측을 맞힌 트릭 승자</b>에게만 지급됩니다.</p><div className="tiles">
        <Tile img="jolly-14" title="검정 14" desc="잡은 트릭에 있으면 +20"/><Tile img="parrot-14" title="초록·보라·노랑 14" desc="잡은 트릭에 있으면 +10"/><Tile img="skull-king" title="Skull King" desc="잡은 Pirate마다 +30"/><Tile img="mermaid-alyra" title="Mermaid" desc="Skull King을 잡으면 +40"/><Tile img="pirate-rosie" title="Pirate" desc="잡은 Mermaid마다 +20"/><Tile img="loot" title="Loot" desc="동맹이 둘 다 성공하면 각자 +20" tag="어드밴스드"/><Tile img="davy-jones" title="Davy Jones" desc="제거한 Sea Monster마다 +20" tag="확장"/><Tile img="parrot-8-expansion" title="확장 8 / 7" desc="8은 +5, 7은 -5 (확장 카드만)" tag="확장"/></div></>}
      {tab==='특수 카드'&&<><h2>특수 카드</h2><p className="help-note">Sea Monster가 여러 장이면 <b>마지막에 낸 괴물</b>의 효과를 적용합니다. 이길 수 없는 특수카드만 남으면 트릭은 폐기됩니다.</p><div className="tiles">
        <Tile img="tigress" title="Tigress" desc="낼 때 Pirate 또는 Escape를 선언합니다. Pirate 선언이면 Pirate의 모든 서열·보너스 규칙을 따릅니다."/>
        <Tile img="escape" title="Escape" desc="항상 집니다. Escape류만 있으면 먼저 낸 Escape류 카드가 이깁니다."/>
        <Tile img="loot" title="Loot" desc="Escape로 취급합니다. 다른 사람이 획득하면 둘 다 비드 성공 시 각 +20; 본인이 이기면 동맹은 없습니다." tag="어드밴스드"/>
        <Tile img="kraken" title="Kraken" desc="트릭 전체를 파괴해 아무도 획득·보너스를 받지 않습니다. Kraken이 없었다면 이길 사람이 다음 리드입니다." tag="어드밴스드"/>
        <Tile img="white-whale" title="White Whale" desc="특수카드를 파괴하고 수트를 무시한 최고 숫자가 이깁니다. 숫자가 없으면 폐기되고 Whale을 낸 사람이 다음 리드입니다." tag="어드밴스드"/>
        <Tile img="spotted-stingray" title="Spotted Stingray" desc="White Whale처럼 특수카드를 파괴하지만 가장 낮은 숫자가 이깁니다. 동점은 먼저 낸 쪽 승리." tag="확장"/>
        <Tile img="wild-monkey-15" title="Wild Monkey 15" desc="색 리드가 있으면 그 수트의 15, 리드가 없으면 초록·보라·노랑 중 선언합니다. 검정 리드에는 트럼프에게 집니다." tag="확장"/>
        <Tile img="first-mate-con" title="First Mate Con" desc="Pirate를 모두 이기지만 Mermaid·Skull King에게 집니다. 승리하면 잡은 모든 Pirate 능력을 사용할 수 있으며 Pirate 포획 보너스는 없습니다." tag="확장"/>
        <Tile img="davy-jones" title="Davy Jones' Locker" desc="언제든 낼 수 있지만 Sea Monster를 강제하지는 않습니다. 순서와 무관하게 모든 Sea Monster와 자신을 제거하고, 제거한 괴물마다 +20을 기록한 뒤 남은 카드로 승부합니다." tag="확장"/>
        <Tile img="last-volley" title="The Last Volley" desc="모두 낸 뒤 자신이 한 장을 더 냅니다. 그 결과 마지막 트릭은 본인만 건너뜁니다(마지막 트릭에서는 추가 카드 없음)." tag="확장"/>
        <Tile img="walk-the-plank" title="Walk the Plank" desc="트릭 끝에 Pirate 한 장을 반드시 제거합니다. 제거된 Pirate는 승리·Skull King 보너스·Con 능력 대상이 아닙니다." tag="확장"/>
        <Tile img="parrot-zero-fourteen" title="0/14" desc="낼 때 0 또는 14를 선언합니다. 14로 써도 14 보너스는 없습니다." tag="확장"/>
        <Tile img="parrot-8-expansion" title="확장 7 / 8" desc="잡은 확장 7은 -5, 확장 8은 +5입니다. 기본 덱의 7·8에는 적용되지 않습니다." tag="확장"/></div></>}
      {tab==='해적 능력'&&<><h2>해적 능력</h2><p className="help-note">능력 옵션이 켜졌을 때 <b>그 Pirate로 트릭을 이긴 플레이어</b>가 즉시 사용합니다. 다음 라운드로 넘길 수 없고, 마지막 트릭 뒤에도 쓸 수 있는 것은 Harry뿐입니다.</p><div className="tiles">
        <Tile img="pirate-rosie" title="Rosie D'Laney" desc="자신을 포함한 아무 플레이어를 다음 트릭 리더로 지정합니다."/>
        <Tile img="pirate-bendt" title="Bendt the Bandit" desc="덱에서 2장을 가져온 뒤, 손패에서 원하는 2장을 버립니다. 덱이 부족하면 가능한 만큼만 처리합니다."/>
        <Tile img="pirate-rascal" title="Rascal of Roatan" desc="0·10·20점 중 하나를 겁니다. 비드 성공 시 얻고 실패 시 건 금액만큼 잃습니다."/>
        <Tile img="pirate-juanita" title="Juanita Jade" desc="그 라운드에 딜되지 않은 모든 카드를 본인만 비공개로 확인합니다."/>
        <Tile img="pirate-harry" title="Harry the Giant" desc="내 예측을 -1·유지·+1 중 하나로 조정합니다. 마지막 트릭 뒤에도 사용할 수 있습니다."/>
        <Tile img="mary-thorne" title="Mary Thorne" desc="자신을 포함한 한 사람의 손패에서 무작위 카드 1장을 정해, 다음 트릭에 수트·다른 효과와 무관하게 반드시 내게 합니다." tag="확장"/>
        <Tile img="first-mate-con" title="Con이 잡은 Pirate" desc="Con으로 이긴 트릭의 모든 Pirate 능력을 Con의 승자가 차례로 사용할 수 있습니다. 상대가 낸 Juanita도 여기에 포함됩니다." tag="확장"/></div></>}
    </div><button className="gold help-close" onClick={close}>확인</button></div></div>;
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
  return <main className="home"><button type="button" className="help-orb corner" onClick={()=>setHelp(true)} aria-label="도움말 열기">?</button>
    <div className="hero"><h1 aria-label="Skull King"><span>SKULL</span> <span>KING</span></h1>
      <p className="subtitle">해골왕의 배에서 열리는 한 판 도박. 예측하고, 속이고, 마지막 트릭까지 살아남으세요.</p>
      <div className="fan" aria-hidden="true">{fan.map((n,i)=>{const k=i-2;return <img key={n} src={art(n)} alt="" draggable={false} style={{'--k':k,zIndex:5-Math.abs(k)} as CSSProperties}/>;})}</div></div>
    <section className="dock" aria-label="게임 시작">
      <label className="field"><span>선원 이름</span><input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={16} autoComplete="nickname" placeholder="이름을 입력하세요"/></label>
      <div className="seg" role="tablist"><button type="button" role="tab" aria-selected={tab==='create'} className={tab==='create'?'on':''} onClick={()=>setTab('create')}>새 항해 열기</button><button type="button" role="tab" aria-selected={tab==='join'} className={tab==='join'?'on':''} onClick={()=>setTab('join')}>방 코드로 참가</button></div>
      {tab==='create'?<div className="pane" role="tabpanel">
        <div className="duo">
          <div className="field" role="group" aria-label="인원"><span>인원</span><div className="stepper"><button type="button" aria-label="인원 줄이기" disabled={maxPlayers<=2} onClick={()=>setMaxPlayers(maxPlayers-1)}>−</button><output>{maxPlayers}</output><button type="button" aria-label="인원 늘리기" disabled={maxPlayers>=9} onClick={()=>setMaxPlayers(maxPlayers+1)}>＋</button></div></div>
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
        {tab==='create'?<button className="gold cta" disabled={!hasName||busy} onClick={()=>enter(true)}>{busy?'출항 준비 중…':'방 만들기'}</button>:<button className="gold cta" disabled={!hasName||roomCode.length<6||busy} onClick={()=>enter(false)}>{busy?'접속 중…':'방 참가'}</button>}
        
      </div>
    </section>
    {help&&<Help close={()=>setHelp(false)}/>}
  </main>;
}
function GameHeader({round,cards,onHelp,title}:{round?:number;cards?:number;onHelp:()=>void;title?:string}){const game=useGame(s=>s.game)!;const [soundOn,setSoundOn]=useState(soundEnabled);return <header className="game-head"><button className="leave" onClick={()=>leaveRoom(game.roomCode)}><span aria-hidden="true">‹</span> 방 나가기</button><span className="voyage-mark">{title??<><small>ROUND</small><b>{round}</b><i>·</i><span>{cards}장</span></>}</span><div className="game-tools"><button className="sound-toggle" type="button" aria-pressed={soundOn} aria-label={'카드 효과음 '+(soundOn?'켜짐':'꺼짐')} title={'카드 효과음 '+(soundOn?'끄기':'켜기')} onClick={()=>{const next=!soundOn;setSoundOn(next);setSoundEnabled(next);}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11"/></svg><span>{soundOn?'소리':'음소거'}</span></button><button className="help-orb" onClick={onHelp} aria-label="도움말 열기">?</button></div></header>;}
function BidPanel(){const game=useGame(s=>s.game)!;const [bid,setBid]=useState(0);useEffect(()=>setBid(0),[game.round]);const me=game.players.find(p=>p.id===game.playerId)!;if(me.bid!==null)return <div className="status"><Crest/>다른 선원들이 비드를 고르는 중입니다…</div>;return <section className="bid"><div className="bid-crest"><Crest/></div><p className="eyebrow">CAPTAIN'S CALL · ROUND {game.round}</p><h2>이번 항해, 몇 트릭을<br/>차지하시겠습니까?</h2><p>선원들의 눈을 읽고, 당신의 운을 걸어 보세요.</p><div className="bid-dial" aria-label="예측할 트릭 수">{Array.from({length:game.cardsThisRound+1},(_,n)=><button key={n} className={bid===n?'picked':''} onClick={()=>setBid(n)}><small>{n===0?'무승':'트릭'}</small>{n}</button>)}</div><button className="gold bid-submit" onClick={()=>{unlockCardSounds();emit('BID_SUBMIT',{roomCode:game.roomCode,bid}).catch(showError);}}><Crest kind="coin"/><b>예측 제출</b><small>{bid}트릭을 예측합니다</small></button></section>;}
/** 능력 이름(대기 중인 다른 선원에게도 무슨 일이 벌어지는지 보여주기 위함) */
const abilityName:Record<string,string>={rosieLeader:'Rosie',maryTarget:'Mary Thorne',plankTarget:'Walk the Plank',bendtDiscard:'Bendt',lastVolley:'The Last Volley',rascalBet:'Rascal'};
function Sheet({title,sub,children}:{title:string;sub?:string;children:ReactNode}){return <div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="sheet"><h2>{title}</h2>{sub&&<p>{sub}</p>}{children}</div></div>;}
function Decision({pending}:{pending:PendingDecision}) {
 const game=useGame(s=>s.game)!;const [extra,setExtra]=useState<Card|null>(null);const [busy,setBusy]=useState(false);
 /* 중복 전송 방지: 응답이 오기 전 연타하면 서버가 거절해 화면이 멈춘 것처럼 보이던 문제 */
 const decide=async(value:string|number,declaration?:CardDeclaration)=>{if(busy)return;unlockCardSounds();setBusy(true);try{await emit('ABILITY_DECIDE',{roomCode:game.roomCode,value,declaration});}catch(e){showError(e);}finally{setBusy(false);}};
 const pname=(id:string)=>game.players.find(p=>p.id===id)?.nickname??id;const needsDeclaration=(card:Card)=>card.kind==='tigress'||card.isZeroFourteen||(card.kind==='wild'&&!game.trickLead);
 if(pending.kind==='rosieLeader'||pending.kind==='maryTarget')return <Sheet title={pending.kind==='rosieLeader'?'Rosie · 다음 리더':'Mary Thorne · 대상 선택'} sub={pending.kind==='rosieLeader'?'다음 트릭을 시작할 선원을 고르세요.':'다음 트릭에 무작위 카드를 강제로 내게 할 선원을 고르세요.'}><div className="choices">{pending.options.map(id=><button key={id} disabled={busy} onClick={()=>decide(id)}>{pname(id)}</button>)}</div></Sheet>;
 if(pending.kind==='plankTarget'){const targets=game.trick.filter(p=>pending.options.includes(p.card.id));return <Sheet title="Walk the Plank" sub="제거할 Pirate를 고르세요."><div className="choices">{targets.map(p=><button key={p.card.id} disabled={busy} onClick={()=>decide(p.card.id)}>{pname(p.playerId)} · {p.card.name}</button>)}</div></Sheet>;}
 if(pending.kind==='bendtDiscard')return <Sheet title={'🃏 Bendt: '+pending.remaining+'장 버리기'} sub="버릴 카드를 고르고 확정하세요."><CardPicker cards={game.hand} cta="이 카드 버리기" disabled={busy} onPick={c=>decide(c.id)}/></Sheet>;
 if(pending.kind==='lastVolley'){
  if(extra)return <Sheet title="💥 Last Volley 선언" sub={label(extra)}><div className="choices">{extra.isZeroFourteen?<><button disabled={busy} onClick={()=>decide(extra.id,0)}>0</button><button className="gold" disabled={busy} onClick={()=>decide(extra.id,14)}>14</button></>:extra.kind==='wild'?<>{(['parrot','map','treasure'] as const).map(s=><button key={s} disabled={busy} onClick={()=>decide(extra.id,s)}>{suits[s].icon} {suits[s].name}</button>)}</>:<><button className="gold" disabled={busy} onClick={()=>decide(extra.id,'pirate')}>Pirate</button><button disabled={busy} onClick={()=>decide(extra.id,'escape')}>Escape</button></>}</div><button className="text" onClick={()=>setExtra(null)}>다른 카드 고르기</button></Sheet>;
  return <Sheet title="💥 Last Volley" sub="추가로 낼 카드를 한 장 고르세요."><CardPicker cards={game.hand} cta="이 카드 내기" disabled={busy} onPick={c=>needsDeclaration(c)?setExtra(c):decide(c.id)}/></Sheet>;}
 if(pending.kind==='rascalBet')return <Sheet title="Rascal의 내기" sub="이번 트릭 결과에 점수를 걸 수 있어요."><div className="choices">{[0,10,20].map(n=><button key={n} className={n===20?'gold':''} disabled={busy} onClick={()=>decide(n)}>{n===0?'내기 안 함':n+'점 걸기'}</button>)}</div></Sheet>;
 /* 알 수 없는 종류에 options가 있으면 그대로 선택지로 보여준다(예전에는 전부 Harry 화면으로 떨어져 선택이 불가능했음) */
 const opts=(pending as unknown as {options?:unknown}).options;
 if(Array.isArray(opts)&&opts.length)return <Sheet title="⚓ 능력 선택" sub={abilityName[String(pending.kind)]}><div className="choices">{opts.map(o=><button key={String(o)} disabled={busy} onClick={()=>decide(o as string|number)}>{pname(String(o))}</button>)}</div></Sheet>;
 const myBid=game.players.find(p=>p.id===game.playerId)?.bid??0;
 return <Sheet title="🦍 Harry: 비드 조정" sub={'현재 비드 '+myBid+' · 딜 장수 '+game.cardsThisRound}><div className="choices">{[-1,0,1].filter(n=>myBid+n>=0&&myBid+n<=game.cardsThisRound).map(n=><button key={n} disabled={busy} onClick={()=>decide(n)}>{n>0?'+1':n===0?'유지':'-1'}</button>)}</div></Sheet>;
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
 const play=(card:Card,declaration?:CardDeclaration)=>{unlockCardSounds();lastOwn.current={playerId:game.playerId,card,declaration};setChoice(null);emit('CARD_PLAY',{roomCode:game.roomCode,cardId:card.id,declaration}).catch(showError);};/* 차례 표시: 선(리더) · 지금/다음/N번째 · 제출 완료 */
 const bidding=game.phase==='bidding';const playedIds=new Set(game.trick.map(t=>t.playerId));const nP=game.players.length;const start=Math.max(0,game.players.findIndex(p=>p.id===(bidding?game.leaderId:game.turnId)));const waitOrder=new Map<string,number>();{let k=0;for(let j=0;j<nP;j++){const p=game.players[(start+j)%nP];if(bidding||!playedIds.has(p.id))waitOrder.set(p.id,k++);}}
 const nextUp=game.players.find(p=>!bidding&&!playedIds.has(p.id)&&waitOrder.get(p.id)===1);const nextTxt=nextUp?' · 다음은 '+nextUp.nickname:'';
 const badge=(p:{id:string})=>{const o=waitOrder.get(p.id)??0;return bidding?(o===0?'첫 리드':(o+1)+'번째'):playedIds.has(p.id)?'제출 완료':o===0?'지금 차례':o===1?'다음':(o+1)+'번째';};
 const crew=<section className="crew" aria-label="선원 현황" style={{'--np':Math.min(nP,4)} as CSSProperties}>{game.players.map(p=>{const o=waitOrder.get(p.id)??0;const st=bidding?(o===0?'now':'wait'):playedIds.has(p.id)?'done':o===0?'now':o===1?'next':'wait';return <div className={'sailor '+st+(game.turnId===p.id&&!bidding?' turn':'')+(game.leaderId===p.id?' leader':'')+(p.id===game.playerId?' me':'')+(sweep?.winner===p.id?' collect'+(sweep.late?' late':''):'')} data-pid={p.id} key={p.id} style={{'--h':hue(p.nickname)} as CSSProperties}>{game.leaderId===p.id&&<em className="lead-tag">선</em>}<span className="av">{p.isBot?<span className="bot-mark">B</span>:ini(p.nickname)}</span><div className="who"><b>{p.nickname}{p.id===game.playerId&&<u>나</u>}</b>{bidding?<small>{p.bid===null?'고민 중…':'비드 완료'}</small>:<Tally bid={p.bid} tricks={p.tricks}/>}</div><strong>{p.score}<small>점 · {p.cardsLeft}장</small></strong><span className="order-tag">{badge(p)}</span>{sweep?.winner===p.id&&<em className="trick-plus">+1 트릭</em>}</div>;})}</section>;
 const plate=(id:string,first=false)=>{const nm=pname(game,id);return <span className={'plate'+(id===game.playerId?' me':'')} style={{'--h':hue(nm)} as CSSProperties}><i className="dot">{ini(nm)}</i>{nm}{first&&<em className="lead-mark">선</em>}</span>;};
 const lastId=log.round===game.round&&log.ids.length?log.ids[log.ids.length-1]:null;
 const needs=(c:Card)=>c.kind==='tigress'||c.isZeroFourteen||(c.kind==='wild'&&!game.trickLead);
 const canPlay=active&&!game.pendingDecision&&game.phase!=='decision';const waiting=game.phase==='decision'&&!game.pendingDecision;
 const turnLine=game.pendingDecision?'능력을 선택하세요.':active?'당신의 차례입니다.'+nextTxt:pname(game,game.turnId)+'의 차례'+nextTxt;
 if(game.phase==='bidding')return <main className="game"><GameHeader round={game.round} cards={game.cardsThisRound} onHelp={()=>setHelp(true)}/>{crew}<BidPanel/><p className="turntext sub">손패를 살피고, 선원들과 동시에 예측을 공개하세요.</p><Hand cards={game.hand} legal={game.legalCardIds} canPlay={false} mode="bid" resetKey={game.round}/>{help&&<Help close={()=>setHelp(false)}/>}</main>;
 if((game.phase==='roundScore'||game.phase==='result')&&!sweep)return <Score/>;
 return <main className="game"><GameHeader round={game.round} cards={game.cardsThisRound} onHelp={()=>setHelp(true)}/>
 {crew}
 <section className={'table'+(sweep?.winner?' won':'')} data-n={Math.min(nP,9)}>{game.peekedDeck&&<button className="peek-fab" onClick={()=>setPeek(true)}><Crest kind="coin"/> <span>비공개 덱</span></button>}<div className="lead">{game.trickLead?suits[game.trickLead].icon+' 리드 수트':game.trick.length?'특수 카드 리드':'다음 트릭'}</div><div className={'trick'+(sweep?' holding':'')}>{game.trick.length?game.trick.map((p:PlayedCard,i)=><div key={p.playerId+'-'+i} className={'played'+(p.card.kind==='tigress'&&p.declaration?' as-'+p.declaration:'')}><CardView card={p.card} small/>{declTag(p)}{plate(p.playerId,i===0)}</div>):<div className="empty"><span className="hintline">통 위에 첫 카드를 내세요</span>{lastId&&<span className="lastwin"><Crest kind="crown"/> 직전 트릭 · <b>{pname(game,lastId)}</b></span>}</div>}</div>{sweep&&<div className={'sweep'+(sweep.late?' has-late':'')} ref={sweepRef}>{sweep.cards.map((p,i)=><div key={i} className={'played sweep-card'+(p.playerId===sweep.winner?' win':'')+(p.late?' late':'')+(p.card?.kind==='tigress'&&p.declaration?' as-'+p.declaration:'')} style={{'--i':i} as CSSProperties}>{p.card?<><CardView card={p.card} small/>{declTag(p as unknown as PlayedCard)}</>:<div className="card small back" aria-label="마지막 카드">?</div>}{plate(p.playerId,i===0)}{p.playerId===sweep.winner&&<b className="crown" aria-hidden="true"><Crest kind="crown"/></b>}</div>)}{sweep.winner?<div className="trick-result"><span className="medal-crown" aria-hidden="true"><Crest kind="crown"/></span><span><b>{pname(game,sweep.winner)}</b> 님이 트릭 획득!</span></div>:<span className="sweep-note">승자 없음 · 트릭 파괴</span>}</div>}</section>
 {log.round===game.round&&log.ids.length>0&&<div className="tricklog" aria-label="트릭 기록"><span>트릭 기록</span>{log.ids.map((id,i)=>{const nm=id?pname(game,id):'파괴';return <i key={i} className={id?'':'void'} style={{'--h':hue(nm)} as CSSProperties} title={'트릭 '+(i+1)+': '+nm}>{id?ini(nm):'✕'}</i>;})}</div>}
 {waiting?<p className="turntext wait" role="status"><i className="spinner"/>{pname(game,game.pendingPlayerId??null)}님이 {abilityName[String(game.pendingKind??'')]??'능력'}{game.pendingKind==='lastVolley'?' 추가 카드를 내는 중…':' 능력을 사용하는 중…'}</p>:<p className={'turntext'+(active&&!game.pendingDecision?' mine':'')}>{turnLine}</p>}<Hand cards={game.hand} legal={game.legalCardIds} canPlay={canPlay} mode="play" resetKey={game.round} onPlay={c=>needs(c)?setChoice(c):play(c)}/>
 {choice&&<div className="modal"><div>{choice.isZeroFourteen?<><h2>0/14 선언</h2><button onClick={()=>play(choice,0)}>0</button><button className="gold" onClick={()=>play(choice,14)}>14</button></>:choice.kind==='wild'?<><h2>Wild Monkey 15</h2>{(['parrot','map','treasure'] as const).map(s=><button key={s} onClick={()=>play(choice,s)}>{suits[s].icon} {suits[s].name}</button>)}</>:<><h2>Tigress 선언</h2><button className="gold" onClick={()=>play(choice,'pirate')}>Pirate</button><button onClick={()=>play(choice,'escape')}>Escape</button></>}<button className="text" onClick={()=>setChoice(null)}>취소</button></div></div>}
 {notice&&<div className="notice" role="status">{notice}</div>}{peek&&game.peekedDeck&&<div className="modal" onClick={()=>setPeek(false)}><div className="sheet peek" onClick={e=>e.stopPropagation()}><h2>Juanita · 비공개 덱 확인</h2><p>이 정보는 당신에게만 공개됩니다.</p><p>{game.peekedDeck.length?'남은 덱 '+game.peekedDeck.length+'장':'남은 덱이 없어요.'}</p><div className="pick-row mini">{game.peekedDeck.map(c=><CardView key={c.id} card={c} small/>)}</div><button className="gold" onClick={()=>setPeek(false)}>확인</button></div></div>}{game.pendingDecision&&<Decision pending={game.pendingDecision}/>} {help&&<Help close={()=>setHelp(false)}/>}</main>;
}
const pname=(game:NonNullable<ReturnType<typeof useGame.getState>['game']>,id:string|null)=>game?.players.find(p=>p.id===id)?.nickname??'—';
const rankOf=(rows:{total:number}[],i:number)=>rows.findIndex(r=>r.total===rows[i].total)+1;
function Score(){
  const game=useGame(s=>s.game)!;const latest=game.history.at(-1);const [help,setHelp]=useState(false);const final=game.phase==='result';
  const ranking=[...(latest?.scores??[])].sort((a,b)=>b.total-a.total);const n=ranking.length;const host=game.hostId===game.playerId;
  const maxTotal=Math.max(1,...ranking.map(r=>r.total));const top=ranking[0];const champs=final&&top?ranking.filter(r=>r.total===top.total):[];
  const gain=(r:{base:number;bonus:number})=>r.base+r.bonus;const best=[...ranking].sort((a,b)=>gain(b)-gain(a))[0];
  const myIdx=ranking.findIndex(r=>r.playerId===game.playerId);const myWin=champs.some(c=>c.playerId===game.playerId);
  const pod=[1,0,2].filter(k=>ranking[k]);
  const ledger=latest&&<ol className="ledger" aria-label="점수표">{ranking.map((r,i)=>{
    const nm=pname(game,r.playerId);const g=gain(r);const hit=r.bid===r.tricks;const rk=rankOf(ranking,i);const me=r.playerId===game.playerId;const delay=(final?1.9:.35)+(n-1-i)*.3;
    return <li key={r.playerId} className={'lrow'+(rk===1?' first':'')+(me?' me':'')} style={{'--h':hue(nm),'--d':delay+'s'} as CSSProperties}>
      <span className={'medal m'+Math.min(rk,4)}>{rk===1?'♛':rk}</span><span className="av">{ini(nm)}</span>
      <div className="lmain"><b>{nm}{me&&<u>나</u>}</b><span className="lline"><em className={'res '+(hit?'ok':'no')}>{hit?(r.bid===0?'무승 성공':'적중'):'빗나감'}</em><span>예측 {r.bid} · 획득 {r.tricks}</span></span><span className="lbreak">기본 {sg(r.base)} · 보너스 {sg(r.bonus)}</span></div>
      <div className={'ldelta '+(g>0?'pos':g<0?'neg':'zero')}><strong><CountUp to={g} delay={delay*1000+250} signed/></strong><small>이번 라운드</small></div>
      <div className="ltotal"><b><CountUp to={r.total} delay={delay*1000+250}/></b><small>누적</small><i><s style={{width:Math.max(0,r.total)/maxTotal*100+'%'}}/></i></div>
    </li>;})}</ol>;
  return <main className={'game score'+(final?' final-score':'')}>
    <GameHeader round={game.round} cards={game.cardsThisRound} title={final?'최종 결산':'라운드 정산'} onHelp={()=>setHelp(true)}/>
    {final?<section className="finale">
      <div className="fx" aria-hidden="true"><i className="rays"/>{Array.from({length:18},(_,i)=><i className="coin" key={i} style={{left:(i*47+9)%100+'%',animationDelay:(i%9)*.45+'s',animationDuration:3.4+(i%5)*.5+'s'}}/>)}</div>
      <p className="eyebrow">THE CAPTAIN’S LOG · FINAL</p>
      <div className="crown-big" aria-hidden="true">♛</div>
      <p className="champ-label">{champs.length>1?'공동 우승':'새로운 바다의 지배자'}</p>
      <h1 className="champ-name">{champs.map(c=>pname(game,c.playerId)).join(' · ')||'항해의 끝'}</h1>
      {top&&<p className="champ-score"><CountUp to={top.total} delay={900} dur={1500}/><small>점</small></p>}
      <div className="podium">{pod.map(k=>{const r=ranking[k];const nm=pname(game,r.playerId);return <div key={r.playerId} className={'pod p'+k+(r.playerId===game.playerId?' me':'')} style={{'--h':hue(nm),'--d':(k===0?1.3:k===1?.5:.8)+'s'} as CSSProperties}><span className="av">{ini(nm)}</span><b>{nm}</b><strong>{r.total}</strong><div className="pillar"><em>{rankOf(ranking,k)}</em></div></div>;})}</div>
      {myIdx>=0&&<p className={'myrank'+(myWin?' win':'')}>{myWin?'🎉 당신이 이 바다의 주인입니다!':'당신의 최종 순위 '+rankOf(ranking,myIdx)+'위 · '+ranking[myIdx].total+'점'}</p>}
    </section>:<section className="roundhead"><div className="crest" aria-hidden="true">✦</div><p className="eyebrow">THE CAPTAIN’S LOG · ROUND {game.round}</p><h1>라운드 {game.round} 정산</h1>{best&&gain(best)>0&&<p className="mvp">⭐ 이번 라운드 최고 득점 <b>{pname(game,best.playerId)}</b><em>+{gain(best)}</em></p>}</section>}
    {ledger}
    {!final&&<p className="score-note">예측을 맞힌 선원만 보너스를 온전히 획득합니다.</p>}
    <div className="score-actions">
      {game.canAdvance&&!final&&<button className="gold cta-lg" onClick={()=>emit('ROUND_ADVANCE',{roomCode:game.roomCode}).catch(showError)}>다음 항해를 시작합니다 <span>→</span></button>}
      {!final&&!game.canAdvance&&<p className="waiting-captain"><i className="spinner"/>다음 항해를 준비하는 중입니다…</p>}
      {final&&(host?<><button className="gold cta-lg" onClick={()=>emit('GAME_RETURN_TO_LOBBY',{roomCode:game.roomCode}).catch(showError)}>⚓ 선원 모집으로 돌아가기</button><p className="hint">모든 선원이 대기실로 돌아가 한 판 더 즐길 수 있어요.</p></>:<p className="waiting-captain"><i className="spinner"/>선장이 대기실로 돌아가기를 기다리는 중입니다…</p>)}
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
    <header className="topbar"><button className="leave" onClick={()=>leaveRoom(game.roomCode)}><span aria-hidden="true">‹</span> 방 나가기</button><button className="help-orb" onClick={()=>setHelp(true)} aria-label="도움말 열기">?</button></header>
    <div className="harbor-head"><div><h1>선원 모집</h1><p>친구에게 방 코드를 알려 주세요.</p></div>
      <button type="button" className="roomcode" onClick={copy} aria-label={'방 코드 '+game.roomCode+' 복사'}><small>방 코드</small><strong>{game.roomCode}</strong><span>{copied?'복사했어요':'눌러서 복사'}</span></button></div>
    <div className="harbor-body">
      <ul className="roster" aria-label="선원 목록">{Array.from({length:game.config.maxPlayers},(_,i)=>{const p=game.players[i];
        if(!p)return <li className="berth vacant" key={'v'+i}><span className="avatar">＋</span><b>빈 자리</b><small>기다리는 중…</small></li>;
        return <li className={'berth'+(p.ready?' ready':'')+(p.id===game.playerId?' me':'')} key={p.id} style={{'--h':hue(p.nickname)} as CSSProperties}><span className="avatar">{p.isBot?<span className="bot-mark">B</span>:[...p.nickname][0]}</span>
          <b>{p.nickname}{p.id===game.playerId&&<em className="tag">나</em>}{p.id===game.hostId&&<em className="tag host">선장</em>}</b><small className={p.ready?'ok':''}>{p.isBot?'봇 · ':''}{p.ready?'준비 완료':'준비 중'}</small></li>;})}</ul>
      <aside className="voyage"><h2>항해 설정</h2>
        <dl><div><dt>인원</dt><dd>{game.players.length} / {game.config.maxPlayers}명</dd></div><div><dt>방식</dt><dd>{modeInfo?modeInfo[1]:game.config.roundMode}{modeInfo&&<small>{modeInfo[2]}</small>}</dd></div><div><dt>덱</dt><dd>{deckSize(cards)}장</dd></div></dl>
        <div className="chips">{on.length?on.map(([k,t])=><span className="chip" key={k}>{t}</span>):<span className="chip">Classic 기본 덱</span>}</div></aside>
    </div>
    <div className="harbor-actions"><p className="hint">{hint}</p>
      <div className="btnrow"><button className={me.ready?'':'gold'} onClick={()=>emit('PLAYER_READY',{roomCode:game.roomCode}).catch(showError)}>{me.ready?'준비 취소':'준비 완료'}</button>
        {host&&<button disabled={game.players.length>=game.config.maxPlayers} onClick={()=>emit('BOT_FILL',{roomCode:game.roomCode}).catch(showError)}>봇으로 채우기</button>}
        {host&&<button className={me.ready?'gold':''} disabled={!canStart} onClick={()=>emit('GAME_START',{roomCode:game.roomCode}).catch(showError)}>⚓ 출항</button>}</div></div>
    {help&&<Help close={()=>setHelp(false)}/>}
  </main>;
}
function App(){const game=useGame(s=>s.game);const error=useGame(s=>s.error);useEffect(()=>{if(!error)return;const timer=setTimeout(()=>useGame.getState().setError(null),3500);return()=>clearTimeout(timer);},[error]);return <><Scene mode={game?(game.phase==='lobby'?'lobby':'game'):'home'}/>{game?(game.phase==='lobby'?<Lobby/>:<Table/>):<Landing/>}{error&&game&&<div className="toast">{error}</div>}</>;}
createRoot(document.getElementById('root')!).render(<App/>);
