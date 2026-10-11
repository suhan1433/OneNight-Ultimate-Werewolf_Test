import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ROLE_DEFINITIONS,type ClientGameState} from '@werewolf/shared';
import {emit,socket,getAssassinAim,getTeamSelection,type AssassinAimState,type TeamSelectionState} from './socket';
import {useGame} from './store';
import {PlayerAvatar,useCharacterResolver} from './profile';
import {roleArtFor} from './role-art';

/* 스토리보드 4(팀 구성) · 6(퀘스트 결과) · 7(암살) · 8(엔딩). 소리·햅틱 없음 — 시각 언어만.
   3·5번 장면과 같은 문법: 놋쇠 인레이 원탁 · 스포트라이트 암전 · 정적 → 타격 → 여운 · 캔버스 입자.
   원탁은 '촛불이 놓인 원탁 + 그 둘레에 앉은 기사들' 구조다: 좌석은 바깥 링(SEAT_R), 촛불은 원탁 위(CANDLE_R).
   모든 시간(초)은 cinematic.css 의 숫자와 같은 기준이다. */
const vars=(values:Record<string,string|number>)=>values as React.CSSProperties;
const SEAT_R=43,CANDLE_R=25;

function useMotion(){
  const[reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
  return reduced;
}
function useClock(active:boolean,end:number){
  const reduced=useMotion();const[elapsed,setElapsed]=useState(0);const[skipped,setSkipped]=useState(false);
  useEffect(()=>{setElapsed(0);setSkipped(false);if(!active||reduced)return;const started=performance.now();const timer=window.setInterval(()=>{const time=(performance.now()-started)/1000;setElapsed(time);if(time>=end)window.clearInterval(timer);},80);return()=>window.clearInterval(timer);},[active,reduced,end]);
  return {time:reduced||skipped?end:elapsed,final:reduced||skipped,reduced,skip:()=>setSkipped(true)};
}
/** 대상 요소의 화면 중심을 --ax/--ay 로 내려준다 (스포트라이트 암전의 구멍 위치) */
function useAnchor(target:React.RefObject<HTMLElement>,root:React.RefObject<HTMLElement>,active=true){
  useLayoutEffect(()=>{
    const upd=()=>{const t=target.current,r=root.current;if(!t||!r)return;const b=t.getBoundingClientRect();
      r.style.setProperty('--ax',`${(b.left+b.width/2).toFixed(1)}px`);r.style.setProperty('--ay',`${(b.top+b.height/2).toFixed(1)}px`);};
    upd();addEventListener('resize',upd);addEventListener('scroll',upd,{passive:true});
    const iv=active?window.setInterval(upd,500):0;
    return()=>{removeEventListener('resize',upd);removeEventListener('scroll',upd);window.clearInterval(iv);};
  },[target,root,active]);
}

export function Sigil({kind='seal',size=48}:{kind?:'seal'|'good'|'evil'|'crown'|'dagger';size?:number}){
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='crown'?<path d="M10 47h44L50 24 39 33 32 17 25 33 14 24Z"/>:kind==='dagger'?<><path d="M32 7v37M23 22h18M23 44h18L32 58Z"/><circle cx="32" cy="10" r="3"/></>:<><circle cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="23"/>{kind==='good'?<><path d="m32 14-13 11v17l13 9 13-9V25ZM32 22v22M24 31h16"/></>:kind==='evil'?<><path d="m18 17 28 30M46 17 18 47M23 12h18l5 10-14 30-14-30Z"/></>:<path d="M32 13v35M20 26l12-12 12 12M22 48h20"/>}</>}
  </svg>;
}
function position(index:number,total:number,radius=SEAT_R){const angle=index/total*Math.PI*2-Math.PI/2;return{x:50+radius*Math.cos(angle),y:50+radius*Math.sin(angle)};}

/* ---------- 공용 소품 ---------- */
function Particles({count=18}:{count?:number}){return <div className="cs-particles" aria-hidden="true">{Array.from({length:count},(_,i)=><i key={i} style={vars({'--x':`${(i*37+7)%100}%`,'--drift':`${(i%2?1:-1)*(15+i*3)}px`,'--delay':`${(i%9)*.17}s`,'--duration':`${2+(i%4)*.4}s`})}/>)}</div>;}
/** 촛불: 밀랍 + 불꽃 + 빛무리. (x,y)는 밀랍 밑동의 위치(%) */
function Flame({x,y,lit=true,lean=0,s=1,cls='',style,children}:{x:number;y:number;lit?:boolean;lean?:number;s?:number;cls?:string;style?:React.CSSProperties;children?:React.ReactNode}){
  return <span className={`cs-flame${lit?' lit':''}${cls?' '+cls:''}`} style={{left:`${x}%`,top:`${y}%`,...vars({'--lean':`${lean}deg`,'--s':s}),...style}} aria-hidden="true"><b/><i className="wax"/><i className="fl"/>{children}</span>;
}
function Smoke(){return <span className="cs-smoke" aria-hidden="true">{[0,1,2].map(k=><i key={k} style={vars({'--k':k})}/>)}</span>;}
function SceneCaption({eyebrow,title,body}:{eyebrow:string;title:string;body:string}){return <div className="cs-caption"><small>{eyebrow}</small><h2>{title}</h2><p>{body}</p></div>;}

/* ---------- 놋쇠 인레이 원탁 (장면 전용) ----------
   벨벳 위 놋쇠 링·눈금, 중앙은 비워 둔다(수치·문양이 올라간다). 좌석 링(점선)이 둘레를 감싼다. */
function RoundTable(){
  const ticks=useMemo(()=>Array.from({length:60},(_,j)=>{const a=j*6*Math.PI/180,L=j%5===0?9:5;return{j,x1:200+112*Math.sin(a),y1:200-112*Math.cos(a),x2:200+(112+L)*Math.sin(a),y2:200-(112+L)*Math.cos(a)};}),[]);
  return <svg className="cs-tablesvg" viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <linearGradient id="cs-t-brass" gradientUnits="userSpaceOnUse" x1="60" y1="60" x2="340" y2="340"><stop offset="0" stopColor="#fde9b4"/><stop offset=".45" stopColor="#dcb262"/><stop offset="1" stopColor="#7a5726"/></linearGradient>
      <radialGradient id="cs-t-felt" cx="50%" cy="42%" r="62%"><stop offset="0" stopColor="#2f6e7a"/><stop offset=".55" stopColor="#17414a"/><stop offset="1" stopColor="#09191f"/></radialGradient>
      <radialGradient id="cs-t-oak" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#5a4129"/><stop offset="1" stopColor="#241810"/></radialGradient>
    </defs>
    <circle className="cs-seatring" cx="200" cy="200" r="172" fill="none" stroke="url(#cs-t-brass)" strokeWidth=".6" strokeDasharray="1.5 5" opacity=".35"/>
    <circle cx="200" cy="200" r="137" fill="url(#cs-t-oak)"/>
    <circle cx="200" cy="200" r="136" fill="none" stroke="#7a5a35" strokeWidth=".8" opacity=".7"/>
    <circle cx="200" cy="200" r="127" fill="url(#cs-t-felt)"/>
    <circle cx="200" cy="200" r="129" fill="none" stroke="url(#cs-t-brass)" strokeWidth="2.6"/>
    <circle cx="200" cy="200" r="123" fill="none" stroke="url(#cs-t-brass)" strokeWidth=".6" strokeDasharray="2 3" opacity=".65"/>
    <g stroke="url(#cs-t-brass)" strokeWidth=".8" opacity=".85">{ticks.map(t=><line key={t.j} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}/>)}</g>
    <circle cx="200" cy="200" r="64" fill="rgba(4,12,16,.35)" stroke="url(#cs-t-brass)" strokeWidth="1.1"/>
    <circle cx="200" cy="200" r="58" fill="none" stroke="url(#cs-t-brass)" strokeWidth=".5" opacity=".55"/>
  </svg>;
}
/** 균열: 틈(어둠) · 열(붉은 용융) · 심(백열) 3겹. 가는 선 하나가 아니라 '갈라져서 안에서 빛이 새는' 깊이를 만든다 */
function Fissure({paths,className=''}:{paths:string[];className?:string}){
  return <svg className={`cs-fissure ${className}`} viewBox={className.includes('altar')?'0 0 300 200':'0 0 400 400'} aria-hidden="true">
    {(['heat','gap','core'] as const).map(layer=><g className={layer} key={layer}>{paths.map((d,i)=><path key={i} d={d} pathLength="1" className={i?'br':'main'} style={vars({'--bi':i})}/>)}</g>)}
  </svg>;
}
const ALTAR_CRACK=['M14 112 L44 103 L64 115 L90 97 L108 109 L131 90 L150 101 L171 86 L190 98 L213 83 L238 98 L256 89 L286 101','M131 90 L125 71 L136 55 L129 38','M190 98 L198 121 L187 139 L196 160 L189 178','M90 97 L82 122 L90 141','M238 98 L248 117 L241 134','M213 83 L219 63 L212 47'];
const END_CRACK=['M58 232 L104 214 L132 236 L170 196 L196 214 L226 184 L254 210 L290 196 L342 226','M170 196 L162 150 L186 118 L176 78','M254 210 L270 252 L252 290 L268 330','M132 236 L118 272 L132 306 L124 338','M226 184 L232 140 L216 108','M104 214 L84 188 L88 160'];
const DEBRIS=Array.from({length:14},(_,i)=>({x:22+((i*47)%56),dx:((i*29)%70)-35,h:46+((i*37)%70),s:3+(i%3),d:(i%7)*.09}));
/* 기존 .cs-avatar(링·호버·선택 연출)는 그대로 두고, 글자 대신 프로필 캐릭터를 넣는다 */
function Avatar({playerId}:{playerId:string}){const ch=useCharacterResolver()(playerId);return <span className="cs-avatar has-char" style={vars({'--pf-bg':ch.bg})} aria-hidden="true">{ch.emoji}</span>;}
function SeatEmoji({playerId}:{playerId:string}){return <>{useCharacterResolver()(playerId).emoji}</>;}

/* =========================================================
   4. 팀 구성 — 일부러 절제한다. 5번(투표 공개)과 대비되는 구간
   라운드 판 슬라이드 인 → 왕관 안착(리더 한 단계 밝음 · 촛불빛이 리더 쪽으로) →
   지명: 놋쇠 선이 그려지고 광택이 흐름 + 좌석 링이 채워짐 → 취소: 선이 감김 →
   인원 충족: 코어 링 완성 + 버튼 맥동 → 제안: 다각형 완성 + 카메라 후퇴
   ========================================================= */
export function TeamScene({game}:{game:ClientGameState}){
  const[team,setTeam]=useState<string[]>(()=>getTeamSelection(game.roomCode)?.team??[]);const[leaving,setLeaving]=useState<string[]>([]);const[submitting,setSubmitting]=useState(false);
  const timer=useRef<number>();const reduced=useMotion();const leader=game.playerId===game.leaderId;
  const n=game.players.length;
  const leaderIndex=Math.max(0,game.players.findIndex(player=>player.id===game.leaderId));const origin=position(leaderIndex,n);const lightAt=position(leaderIndex,n,30);
  const selected=game.players.filter(player=>team.includes(player.id));const ready=team.length===game.questSize;
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  useEffect(()=>{const receive=(message:TeamSelectionState)=>{if(message.roomCode===game.roomCode)setTeam(message.team);};socket.on('TEAM_SELECTION',receive);const cached=getTeamSelection(game.roomCode);if(cached)receive(cached);return()=>{socket.off('TEAM_SELECTION',receive);};},[game.roomCode]);
  const shareSelection=(next:string[])=>{setTeam(next);socket.emit('TEAM_SELECTION',{roomCode:game.roomCode,team:next});};
  const toggle=(id:string)=>{if(!leader||submitting)return;if(team.includes(id)){shareSelection(team.filter(value=>value!==id));setLeaving(previous=>[...previous.filter(value=>value!==id),id]);}else if(!ready){setLeaving(previous=>previous.filter(value=>value!==id));shareSelection([...team,id]);}};
  const propose=()=>{if(!ready||submitting)return;setSubmitting(true);timer.current=window.setTimeout(()=>{void emit('TEAM_PROPOSE',{roomCode:game.roomCode,team}).catch(error=>{setSubmitting(false);useGame.getState().setError(error.message);});},reduced?0:1150);};
  const at=(id:string)=>position(Math.max(0,game.players.findIndex(player=>player.id===id)),n);
  const pts=selected.map(player=>{const p=position(game.players.indexOf(player),n);return`${p.x},${p.y}`;}).join(' ');
  return <section className={`cs cs-team${ready?' is-ready':''}${submitting?' is-proposing':''}${reduced?' cs-final':''}`}>
    <SceneCaption eyebrow={`ROUND ${game.round+1} · THE EXPEDITION`} title="원정대를 지명하세요" body={leader?`${game.questSize}명의 기사를 선택하세요. 당신이 이번 원정의 리더입니다.`:`${game.players.find(player=>player.id===game.leaderId)?.nickname??'리더'}이(가) ${game.questSize}명의 원정대를 구성하고 있습니다.`}/>
    <div className="cs-camera"><div className="cs-table">
      <RoundTable/>
      <div className="cs-leader-light" key={game.leaderId} style={vars({'--tlx':`${lightAt.x}%`,'--tly':`${lightAt.y}%`})}/>
      {game.players.map((player,index)=>{const p=position(index,n,CANDLE_R);const isLeader=player.id===game.leaderId;return <Flame key={`f-${player.id}`} x={p.x} y={p.y} lean={isLeader?-12:0} s={isLeader?1.25:1} cls={team.includes(player.id)?'picked':''}/>;})}
      <svg className="cs-geometry" viewBox="0 0 100 100" aria-hidden="true">
        {team.filter(id=>id!==game.leaderId).map(id=>{const t=at(id);const d=`M${origin.x} ${origin.y}L${t.x} ${t.y}`;return <g key={id}><path className="cs-thread" pathLength="1" d={d}/><path className="cs-thread-sheen" pathLength="1" d={d}/></g>;})}
        {leaving.filter(id=>id!==game.leaderId).map(id=>{const t=at(id);return <path className="cs-thread is-unwinding" pathLength="1" d={`M${origin.x} ${origin.y}L${t.x} ${t.y}`} key={`out-${id}`} onAnimationEnd={()=>setLeaving(previous=>previous.filter(value=>value!==id))}/>;})}
        {submitting&&<><polygon className="cs-team-poly-fill" points={pts}/><polygon className="cs-team-poly" pathLength="1" points={pts}/>{selected.map((player,i)=>{const p=position(game.players.indexOf(player),n);return <circle className="cs-node" cx={p.x} cy={p.y} r="1.5" style={vars({'--i':i})} key={player.id}/>;})}</>}
      </svg>
      <div className="cs-core">
        <svg className="cs-core-ring" viewBox="0 0 100 100" aria-hidden="true"><circle className="track" cx="50" cy="50" r="48.5" pathLength="1"/><circle className="fill" cx="50" cy="50" r="48.5" pathLength="1" transform="rotate(-90 50 50)" style={{strokeDasharray:`${Math.min(1,team.length/Math.max(1,game.questSize))} 1`}}/></svg>
        <span className="cs-core-mark"><Sigil size={74}/></span>
        <strong>{team.length}<span>/{game.questSize}</span></strong><small>{ready?'구성 완료':'선택된 기사'}</small>
      </div>
      {game.players.map((player,index)=>{const p=position(index,n);return <div className={`cs-seat${team.includes(player.id)?' selected':''}${player.id===game.leaderId?' leader':''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} key={player.id}>
        {player.id===game.leaderId&&<span className="cs-crown"><Sigil kind="crown" size={24}/></span>}
        <button type="button" disabled={!leader||submitting||(!team.includes(player.id)&&ready)} aria-pressed={team.includes(player.id)} onClick={()=>toggle(player.id)}><Avatar playerId={player.id}/><span className="cs-name">{player.nickname}</span></button>
      </div>;})}
    </div></div>
    <div className="cs-selection" aria-live="polite"><small>선택된 기사 · {team.length}/{game.questSize}</small><div>{selected.length?selected.map(player=><span key={player.id}><PlayerAvatar playerId={player.id} size={18}/>{player.nickname}</span>):<em>아직 선택된 기사가 없습니다</em>}</div></div>
    {leader&&<button className="primary cs-propose" disabled={!ready||submitting} onClick={propose}><Sigil kind="crown" size={20}/>{submitting?'원정대를 제안하고 있습니다':'원정대 제안'}</button>}
  </section>;
}

/* =========================================================
   6. 퀘스트 결과 — 중앙 제단
   [예고]  카드가 뒷면으로 제단에 모인다 (누가 냈는지 알 수 없음)
   0.0     스포트라이트가 제단으로 조여오고 카메라 클로즈업
   1.0     카드 셔플(추적 불가) · 촛불 흔들림 강해짐
   2.2     정적 0.6초 — 카드 일렬 정렬, 모든 빛·움직임 정지, 조도 최저
   2.8     타격: 한 장씩(무작위 순서). 성공=청백 광채+충격 고리+빛줄기 / 실패=균열+붉은 불씨+촛불 깜빡+제단 흔들림
   result  실패 0장=카드가 하나로 융합해 청백 빛기둥 / 1장 이상=붉은 균열이 제단을 가로지름
   여운    원정 보고 인장 + 진행 점수에 이번 라운드 인장
   익명성: 개별 카드·제출자와 연결되는 정보는 읽지 않는다. 집계(fails)와 공개 정보만 쓴다.
   ========================================================= */
// The seed and outcomes depend only on aggregate counts and public quest info.
// Never read individual quest cards or associate a card with a player.
export function questOrder(total:number,fails:number,seed:string){
  const cards=Array.from({length:total},(_,i)=>i<fails);let state=2166136261;
  for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  for(let i=cards.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[cards[i],cards[j]]=[cards[j]!,cards[i]!];}return cards;
}
function AltarFace(){
  const ticks=useMemo(()=>Array.from({length:72},(_,j)=>{const a=j*5*Math.PI/180,L=j%6===0?7:4;return{j,x1:150+126*Math.sin(a),y1:100-79*Math.cos(a),x2:150+(126-L)*Math.sin(a),y2:100-(79-L*.63)*Math.cos(a)};}),[]);
  return <svg className="cs-altar-face" viewBox="0 0 300 200" aria-hidden="true">
    <defs>
      <linearGradient id="cs-a-brass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="200"><stop offset="0" stopColor="#fde9b4"/><stop offset=".45" stopColor="#dcb262"/><stop offset="1" stopColor="#7a5726"/></linearGradient>
      <radialGradient id="cs-a-stone" cx="50%" cy="46%" r="60%"><stop offset="0" stopColor="#2b616b"/><stop offset=".6" stopColor="#143840"/><stop offset="1" stopColor="#081a20"/></radialGradient>
      <radialGradient id="cs-a-oak" cx="50%" cy="40%" r="62%"><stop offset="0" stopColor="#5a4129"/><stop offset="1" stopColor="#221710"/></radialGradient>
    </defs>
    <ellipse cx="150" cy="100" rx="149" ry="99" fill="url(#cs-a-oak)"/>
    <ellipse cx="150" cy="100" rx="147.5" ry="97.5" fill="none" stroke="#7a5a35" strokeWidth=".9" opacity=".7"/>
    <ellipse cx="150" cy="100" rx="138" ry="89" fill="url(#cs-a-stone)"/>
    <ellipse cx="150" cy="100" rx="140" ry="91" fill="none" stroke="url(#cs-a-brass)" strokeWidth="2.4"/>
    <g stroke="url(#cs-a-brass)" strokeWidth=".7" opacity=".8">{ticks.map(t=><line key={t.j} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}/>)}</g>
    <ellipse cx="150" cy="100" rx="96" ry="60" fill="none" stroke="url(#cs-a-brass)" strokeWidth=".7" strokeDasharray="2 3.5" opacity=".6"/>
    <ellipse cx="150" cy="100" rx="56" ry="35" fill="none" stroke="url(#cs-a-brass)" strokeWidth=".6" opacity=".4"/>
  </svg>;
}
export function QuestScene({game,children,onResolved}:{game:ClientGameState;children:React.ReactNode;onResolved?:(resolved:boolean)=>void}){
  const reveal=game.phase==='quest_result';const total=game.proposedTeam.length||game.questSize;const fails=game.questResult?.fails??0;
  const order=useMemo(()=>questOrder(total,fails,`${game.roomCode}|${game.round}|${fails}`),[total,fails,game.roomCode,game.round]);
  const strike=2.8,gap=.65,resultAt=strike+(total-1)*gap+.85,end=resultAt+1.5;
  const clock=useClock(reveal,end);const revealed=reveal?Math.min(total,Math.max(0,Math.floor((clock.time-strike)/gap)+1)):0;
  const shownFails=order.slice(0,revealed).filter(Boolean).length;const resolved=reveal&&clock.time>=resultAt;
  const count=reveal?total:game.questCardsCompleted;
  useEffect(()=>{onResolved?.(resolved);},[resolved,onResolved]);
  const still=reveal&&clock.time>=2.2&&clock.time<2.8&&!clock.final;
  useEffect(()=>{if(still)document.documentElement.setAttribute('data-cs-still','1');return()=>document.documentElement.removeAttribute('data-cs-still');},[still]);
  const root=useRef<HTMLElement>(null);const altar=useRef<HTMLDivElement>(null);useAnchor(altar,root,reveal);
  /* 실패 카드가 뒤집히는 시각마다: 제단 흔들림 · 촛불 깜빡 · 가장자리 붉은 암전 (카드 순서는 공개 시드로만 정해진다) */
  const failTimes=reveal?order.map((f,i)=>f?strike+i*gap:-1).filter(t=>t>=0):[];
  const anim=(name:string,dur:number,lag:number)=>failTimes.length?{animation:failTimes.map(t=>`${name} ${dur}s ease ${(t+lag).toFixed(2)}s both`).join(',')}:undefined;
  return <section ref={root} className={`cs cs-quest${reveal?' is-reveal':''}${resolved?' is-resolved':''}${fails?' has-fail':' flawless'}${game.questResult?.success?' quest-success':' quest-failure'}${clock.final?' cs-final':''}${still?' is-still':''}`} style={vars({'--result-at':`${resultAt}s`,'--after-at':`${end-.5}s`,'--count':total})}>
    <div className="cs-spot" aria-hidden="true"/>
    <SceneCaption eyebrow={`QUEST ${game.round+1} · THE ALTAR`} title={reveal?'원정의 진실':'중앙 제단에 카드를 봉인합니다'} body={reveal?'카드를 섞어 한 장씩 공개합니다. 누가 제출했는지는 공개되지 않습니다.':`봉인된 카드 ${count} / ${total}장 · 원정대원만 카드를 제출할 수 있습니다.`}/>
    <div className="cs-altar-camera"><div className="cs-altar-quake" style={reveal&&failTimes.length?{animation:[...failTimes.map(x=>`csQuake .5s ease ${(x+.08).toFixed(2)}s both`),`csQuakeBig .9s ease ${resultAt.toFixed(2)}s both`].join(',')}:undefined}><div className="cs-altar" ref={altar}>
      <AltarFace/><div className="cs-altar-glow"/><div className="cs-altar-seal"><Sigil size={150}/></div>
      {[15,50,85].map((left,k)=><Flame key={left} x={left} y={k===1?25:30} s={1.35} cls="lamp" style={{...vars({'--lk':k}),...(reveal?anim('csLampDip',1.1,.04):{})}}>{fails>0&&<Smoke/>}</Flame>)}
      <div className="cs-failflash" style={reveal?anim('csFailLight',.8,0):undefined} aria-hidden="true"/>
      <div className="cs-quest-cards" aria-hidden="true">{Array.from({length:count},(_,index)=><div className={`cs-qcard${reveal&&order[index]?' fail':' success'}${index<revealed?' turned':''}`} style={vars({'--i':index,'--slot':index-(total-1)/2,'--pile-x':`${((index*23)%43)-21}px`,'--pile-y':`${((index*11)%31)-15}px`,'--rotation':`${index*29-30}deg`,'--flip-at':`${strike+index*gap}s`})} key={index}>
        <i className="cs-card-land"/>
        <div className="cs-qcard-inner">
          <div className="cs-card-back"><span className="cs-medal"><Sigil size={26}/></span><small>AVALON</small></div>
          <div className="cs-card-front"><span className="cs-medal"><Sigil kind={order[index]?'evil':'good'} size={26}/></span><strong>{order[index]?'실패':'성공'}</strong><small>{order[index]?'BETRAYAL':'LOYALTY'}</small><i className="cs-card-crack"/><i className="cs-foil"/></div>
        </div>
        <i className="cs-card-burst"/><i className="cs-card-shock"/>
        {reveal&&(order[index]?<span className="cs-sparks">{Array.from({length:9},(_,k)=><b key={k} style={vars({'--a':`${k*40+((index*17)%25)}deg`,'--d':`${46+((k*29+index*13)%34)}px`})}/>)}</span>:<i className="cs-card-flare"/>)}
      </div>)}</div>
      {reveal&&<><div className="cs-leak"/>{fails>0&&resolved&&<Fissure className="altar" paths={ALTAR_CRACK}/>}<div className="cs-orb"/><i className="cs-ring"/><i className="cs-ring r2"/><i className="cs-ring r3"/><div className="cs-beam"><i className="halo"/><i className="col"/><i className="core"/></div><i className="cs-bloom"/>
        {!clock.final&&<Field mode={fails?'ember':'moon'} delay={resultAt}/>}</>}
    </div></div></div>
    {reveal?<>
      <p className="cs-progress" role="status">{resolved?`성공 ${total-fails}장 · 실패 ${fails}장`:still?'봉인을 깨기 직전, 원탁이 숨을 멈춥니다.':revealed?<>공개 · 성공 <b className="ok">{revealed-shownFails}</b> · 실패 <b className="no">{shownFails}</b> · 미공개 <b>{total-revealed}</b></>:'카드를 섞고 있습니다.'}</p>
      {resolved&&<div className="cs-quest-verdict cs-glass">
        <div className="cs-verdict-seal" aria-hidden="true"><Sigil kind={game.questResult?.success?'good':'evil'} size={30}/></div>
        <small>ROUND {game.round+1} · 원정 보고</small><h2>{game.questResult?.success?'원정 성공':'원정 실패'}</h2><p>실패 카드 {fails}장{game.round===3&&game.maxPlayers>=7?' · 이번 원정은 실패 2장부터 실패':''}</p>
        <div className="cs-score" aria-label="원정 진행 점수">{Array.from({length:5},(_,i)=><span className={`${game.results[i]??'pending'}${i===game.round?' now':''}`} key={i}>{i+1}<small>{game.results[i]==='success'?'성공':game.results[i]==='fail'?'실패':'대기'}</small></span>)}</div>
        <button className="primary" disabled={game.hasContinued||clock.time<end-.5} onClick={()=>void emit('QUEST_RESULT_CONTINUE',{roomCode:game.roomCode}).catch(error=>useGame.getState().setError(error.message))}>{game.hasContinued?'계속 확인 완료':'계속'} ({game.continueConfirmedCount}/{game.players.length})</button></div>}
      {!resolved&&<button className="cs-skip" onClick={clock.skip}>결과 바로 보기</button>}
    </>:children}
  </section>;
}

/* =========================================================
   7. 암살 단계 — 게임에서 가장 어두운 장면
   0.0 청백 승리의 빛이 올라오다 → 0.6 뚝 끊김(암전) · 붉은 베임선 → 0.8 단검 · 암살자 좌석에만 붉은 스포트라이트
   2.0 카메라가 암살자 시점으로 접근 → 선택 중: 붉은 조준 링 + 암살자→대상 선 + 붉은 빛이 대상 쪽으로 (모두에게 실시간 공유)
   확정: 정적 1초 · 대상 한 점만 남기고 완전 암전
   ========================================================= */
export function AssassinScene({game}:{game:ClientGameState}){
  const[aim,setAim]=useState<string|null>(()=>getAssassinAim(game.roomCode)?.targetId??null);const[chosen,setChosen]=useState<string|null>(null);const[locked,setLocked]=useState(()=>!!getAssassinAim(game.roomCode)?.locked);
  const[actor,setActor]=useState<string|null>(()=>getAssassinAim(game.roomCode)?.actorId??(game.hasAssassinationAbility?game.playerId:null));
  const reduced=useMotion();const authority=game.hasAssassinationAbility;const ready=useClock(true,2).time>=2;
  const aimTimer=useRef<number>();const root=useRef<HTMLElement>(null);
  useEffect(()=>{if(locked)document.documentElement.setAttribute('data-cs-still','1');return()=>document.documentElement.removeAttribute('data-cs-still');},[locked]);
  useEffect(()=>{const receive=(message:AssassinAimState)=>{if(message.roomCode!==game.roomCode)return;setAim(message.targetId);setLocked(!!message.locked);if(message.actorId)setActor(message.actorId);if(message.locked)window.clearTimeout(aimTimer.current);};socket.on('ASSASSIN_AIM',receive);const cached=getAssassinAim(game.roomCode);if(cached)receive(cached);return()=>{socket.off('ASSASSIN_AIM',receive);window.clearTimeout(aimTimer.current);};},[game.roomCode]);
  const sendAim=(targetId:string|null)=>{if(!authority||locked)return;setAim(targetId);window.clearTimeout(aimTimer.current);aimTimer.current=window.setTimeout(()=>socket.emit('ASSASSIN_AIM',{roomCode:game.roomCode,targetId}),100);};
  const confirm=async()=>{if(!chosen||locked)return;window.clearTimeout(aimTimer.current);setLocked(true);try{await emit('ASSASSIN_COMMIT',{roomCode:game.roomCode,targetId:chosen});}catch(error){setLocked(false);useGame.getState().setError(error instanceof Error?error.message:'암살 대상을 확정하지 못했습니다.');}};
  const n=game.players.length;
  const posOf=(id:string|null,r=SEAT_R)=>{const i=id?game.players.findIndex(player=>player.id===id):-1;return i<0?null:position(i,n,r);};
  const aimPos=posOf(aim),actorPos=posOf(actor),aimLight=posOf(aim,32),actorLight=posOf(actor,34);
  useLayoutEffect(()=>{
    if(!locked)return;const r=root.current;if(!r)return;
    const i=aim?game.players.findIndex(player=>player.id===aim):-1;
    const seat=i>=0?r.querySelector<HTMLElement>(`[data-seat-index="${i}"]`):null;if(!seat)return;
    const b=seat.getBoundingClientRect();r.style.setProperty('--tx',`${(b.left+b.width/2).toFixed(1)}px`);r.style.setProperty('--ty',`${(b.top+b.height/2-8).toFixed(1)}px`);
  },[locked,aim,game.players]);
  return <section ref={root} className={`cs cs-assassin${locked?' is-locked':''}${aim?' has-aim':''}${reduced?' cs-final':''}`}>
    <div className="cs-assassin-dark" aria-hidden="true"/>
    <div className="cs-lockdark" aria-hidden="true"/>
    <div className="cs-dawn" aria-hidden="true"/><div className="cs-cutblack" aria-hidden="true"/><i className="cs-slash" aria-hidden="true"/>
    <SceneCaption eyebrow="THE LAST SHADOW" title="빛이 닿지 않는 마지막 선택" body={locked?'대상이 확정되었습니다. 원탁이 숨을 멈춥니다.':authority?'멀린이라고 생각하는 기사를 지목하세요. 조준은 모두에게 보입니다.':'암살 능력 보유자가 선택 중입니다. 붉은 조준 링이 의심받는 기사를 가리킵니다.'}/>
    <div className="cs-camera"><div className="cs-table">
      <RoundTable/>
      {actorLight&&<div className="cs-assassin-spot" style={{left:`${actorLight.x}%`,top:`${actorLight.y}%`}}/>}
      <div className={`cs-aim-glow${aimLight?' on':''}`} style={aimLight?{left:`${aimLight.x}%`,top:`${aimLight.y}%`}:undefined}/>
      {game.players.map((player,index)=>{const p=position(index,n,CANDLE_R);return <Flame key={`f-${player.id}`} x={p.x} y={p.y} lit={aim===player.id||player.id===actor} cls={aim===player.id?'targeted':player.id===actor?'actor':''}/>;})}
      <svg className="cs-geometry" viewBox="0 0 100 100" aria-hidden="true">
        {actorPos&&aimPos&&aim!==actor&&<g key={`${actor}>${aim}`}><path className="cs-aim-line" pathLength="1" d={`M${actorPos.x} ${actorPos.y}L${aimPos.x} ${aimPos.y}`}/><path className="cs-aim-line dash" pathLength="1" d={`M${actorPos.x} ${actorPos.y}L${aimPos.x} ${aimPos.y}`}/></g>}
      </svg>
      <div className="cs-core"><i className="cs-heart"/><span className="cs-core-dagger"><Sigil kind="dagger" size={50}/></span><small>{locked?'운명이 결정됩니다':'마지막 암살'}</small></div>
      {game.players.map((player,index)=>{const p=position(index,n);const targeted=aim===player.id;return <div data-seat-index={index} className={`cs-seat${targeted?' targeted':''}${chosen===player.id?' is-chosen':''}${player.id===actor?' assassin':''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} key={player.id}>
        <button type="button" disabled={!authority||!ready||locked||player.id===game.playerId} aria-pressed={chosen===player.id} onPointerEnter={()=>sendAim(player.id)} onPointerLeave={()=>sendAim(chosen)} onFocus={()=>sendAim(player.id)} onBlur={()=>sendAim(chosen)} onClick={()=>{setChosen(player.id);sendAim(player.id);}}><Avatar playerId={player.id}/><span className="cs-name">{player.nickname}</span><i className="cs-target-ring"/></button>
      </div>;})}
    </div></div>
    <p className="cs-progress" role="status">{aim?`조준 중: ${game.players.find(player=>player.id===aim)?.nickname??'기사'}`:'아직 조준 대상이 없습니다.'}</p>
    {authority&&<div className="cs-assassin-actions"><p>{chosen?`${game.players.find(player=>player.id===chosen)?.nickname}님을 지목합니다. 확정 후에는 되돌릴 수 없습니다.`:'좌석을 선택한 뒤 암살을 확정하세요.'}</p><button className="cs-commit" disabled={!chosen||locked||!ready} onClick={()=>void confirm()}><Sigil kind="dagger" size={22}/>{locked?'운명이 결정되고 있습니다':'암살 확정'}</button></div>}
  </section>;
}

/* =========================================================
   8. 엔딩 — 선은 '빛이 채워지고', 악은 '빛이 꺼진다'
   (암살 단계를 거쳤다면 앞에 3.2초의 타격 장면이 붙고, 홍채가 열리며 엔딩으로 이어진다)
   선: 0.0 촛불이 한 번에 켜짐 · 카메라 상승 / 1.5 황금 먼지 / 3.0 타이틀 각인 · 정체 카드 0.25s 간격 / 6.0 기록 패널
   악: 0.0 촛불이 하나씩 꺼짐(선 진영부터) · 마지막 하나는 붉게 / 1.5 카메라 하강 · 균열 / 3.0 붉은 놋쇠 타이틀 · 악인 카드 불꽃 / 6.0 기록 패널
   ========================================================= */
export function EndingScene({game}:{game:ClientGameState}){
  const good=game.winner==='good';const impact=!!game.assassinTarget;const offset=impact?3.2:0;const end=6+offset;
  const clock=useClock(true,end);const merlin=game.revealedRoles?.find(item=>item.role==='merlin');
  const target=game.players.find(player=>player.id===game.assassinTarget);const name=(id:string)=>game.players.find(player=>player.id===id)?.nickname??'기사';
  const n=game.players.length;
  const teamOf=(id:string)=>{const info=game.revealedRoles?.find(item=>item.id===id);return info?ROLE_DEFINITIONS[info.role]?.team:undefined;};
  const snuff=useMemo(()=>{
    const isGood=(i:number)=>teamOf(game.players[i]!.id)!=='evil';
    const order=[...game.players.keys()].sort((a,b)=>Number(isGood(b))-Number(isGood(a))||a-b);
    const rank:number[]=Array(game.players.length).fill(0);order.forEach((idx,r)=>{rank[idx]=r;});
    return{rank,step:Math.min(.38,2.2/Math.max(1,game.players.length))};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[game.players,game.revealedRoles]);
  const shards=useMemo(()=>Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2+((i*37)%11)*.05,d=70+((i*53)%110);return{dx:Math.cos(a)*d,dy:Math.sin(a)*d*.8,s:2+(i%3),lag:(i%5)*.012};}),[]);
  const tIndex=target?game.players.indexOf(target):-1;const tpos=tIndex<0?{x:50,y:50}:position(tIndex,n);
  const mIndex=merlin?game.players.findIndex(player=>player.id===merlin.id):-1;
  return <section className={`cs cs-ending ${good?'good':'evil'}${clock.final?' cs-final':''}${impact?' after-assassination':''}`} style={vars({'--ending-offset':`${offset}s`,'--snuff-step':`${snuff.step}s`})}>
    {impact&&clock.time<offset&&<div className={`cs-assassin-impact ${good?'miss':'hit'}`} role="status" style={vars({'--impact':`${offset}s`})}>
      <div className="cs-impact-table" aria-hidden="true">
        <RoundTable/>
        {game.players.map((player,i)=>{const p=position(i,n,CANDLE_R);return <Flame key={`f-${player.id}`} x={p.x} y={p.y} cls={player.id===game.assassinTarget?'is-target':player.id===merlin?.id?'is-merlin':''}/>;})}
        {game.players.map((player,i)=>{const p=position(i,n);return <div className={`cs-impact-seat${player.id===game.assassinTarget?' is-target':''}${player.id===merlin?.id?' is-merlin':''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} key={player.id}><span className="has-char"><SeatEmoji playerId={player.id}/></span><small>{player.nickname}</small></div>;})}
        <div className="cs-impact-fx" style={{left:`${tpos.x}%`,top:`${tpos.y}%`}}>
          <i className="cs-dagger"/><i className="cs-hitring"/><i className="cs-hitring r2"/>
          {shards.map((s,i)=><b className="cs-shard" style={vars({'--dx':`${s.dx}px`,'--dy':`${s.dy}px`,'--s':`${s.s}px`,'--lag':`${s.lag}s`})} key={i}/>)}
        </div>
        {good&&mIndex>=0&&(()=>{const mp=position(mIndex,n);return <div className="cs-merlin-return" style={{left:`${mp.x}%`,top:`${mp.y}%`}}><i className="cs-hitring m"/><i className="cs-merlin-rays"/></div>;})()}
        <div className="cs-impact-sigil"><Sigil kind={good?'good':'dagger'} size={56}/></div>
      </div>
      <strong>{good?'단검이 빗나갔습니다':'멀린의 촛불이 꺼졌습니다'}</strong><span>{good?`멀린 ${merlin?name(merlin.id):''} · 청백색 빛이 다시 켜집니다`:`${target?.nickname??'멀린'} · 붉은 파편이 원탁에 퍼집니다`}</span>
      <i className="cs-impact-flash"/>
    </div>}
    <div className="cs-ending-world" aria-hidden="true">
      <div className="cs-ending-ray"/><div className="cs-ending-rays"/><div className="cs-ending-pillar"><i/></div>
      <div className="cs-ending-camera"><div className="cs-ending-table">
        <RoundTable/>
        <i className="cs-ending-shock"/><Fissure className="ending" paths={END_CRACK}/>
        <i className="cs-ending-leak"/>{!good&&<div className="cs-debris-field">{DEBRIS.map((d,i)=><b key={i} className="cs-debris" style={vars({'--x':`${d.x}%`,'--dx':`${d.dx}px`,'--h':`${d.h}px`,'--s':`${d.s}px`,'--dl':`${d.d}s`})}/>)}</div>}
        <div className="cs-ending-sigil"><Sigil kind={good?'good':'evil'} size={86}/></div>
        {game.players.map((player,i)=>{const p=position(i,n,CANDLE_R);return <Flame key={`f-${player.id}`} x={p.x} y={p.y} s={good?1.3:1.1} cls={`end${!good&&snuff.rank[i]===n-1?' last':''}`} style={vars({'--i':snuff.rank[i]!})}>{!good&&<Smoke/>}</Flame>;})}
        {game.players.map((player,i)=>{const p=position(i,n);const team=teamOf(player.id);return <div className={`cs-ending-seat ${team??'good'}${team===game.winner?' winner':''}`} style={vars({left:`${p.x}%`,top:`${p.y}%`,'--i':snuff.rank[i]!})} key={`s-${player.id}`}><Avatar playerId={player.id}/></div>;})}
      </div></div>
      {!clock.final&&<Field mode={good?'gold':'ember'} delay={offset+(good?1.5:3)}/>}
    </div>
    <div className="cs-ending-title"><small>THE RESISTANCE · AVALON</small><h1>{good?'선의 승리':'악의 승리'}</h1><p>{game.winReason}</p></div>
    <div className="cs-identity-grid" aria-label="모든 기사의 정체 공개">{game.players.map((player,index)=>{const info=game.revealedRoles?.find(item=>item.id===player.id);const definition=info?ROLE_DEFINITIONS[info.role]:undefined;const won=definition?.team===game.winner;return <article className={`cs-identity ${definition?.team??'good'}${won?' winner':''}`} style={vars({'--i':index})} key={player.id} aria-label={`${player.nickname}, ${definition?.name??'역할 정보 없음'}, ${won?'승리':'패배'}`}><i className="cs-identity-halo" aria-hidden="true"/><p className="cs-identity-player">{player.nickname}</p><div className="cs-identity-inner"><div className="cs-card-back" aria-hidden="true"><span className="cs-medal"><Sigil size={30}/></span><small>AVALON</small></div><div className="cs-card-front">{info&&<img className="cs-role-card-art" src={roleArtFor(info.role,player.id)} alt="" aria-hidden="true" loading="eager"/>}<i className="cs-foil"/></div></div><div className="cs-identity-meta"><span className="cs-outcome">{won?'승리':'패배'}</span>{info?.hasAssassinationAbility&&info.role!=='assassin'&&<small className="cs-ability">암살 능력</small>}</div>{definition?.team==='evil'&&<Particles count={8}/>}</article>;})}</div>
    <div className="cs-ending-summary cs-glass"><small>CHRONICLE OF THE ROUND TABLE</small><h2>원탁에 남겨진 기록</h2><div className="cs-score">{Array.from({length:5},(_,round)=>{const record=game.roundHistory.find(item=>item.round===round);return <span className={record?.success===true?'success':record?.success===false?'fail':'pending'} style={vars({'--ri':round})} key={round}>{round+1}<small>{record?.success===undefined?'미완료':record.success?'성공':'실패'}</small></span>;})}</div><div className="cs-chronicle">{game.roundHistory.map((record,ri)=><div style={vars({'--ri':ri})} key={record.round}><b className={record.success===undefined?'pending':record.success?'success':'fail'}><i>{record.round+1}</i></b><span>{record.team.map(name).join(' · ')}</span><small>찬성 {record.approveCount} / 반대 {record.rejectCount}{record.fails!==undefined?` · 실패 카드 ${record.fails}장`:''}</small><em>{record.success===undefined?'원정 미완료':record.success?'원정 성공':'원정 실패'}</em></div>)}</div>{game.playerId===game.hostId&&<button className="primary" disabled={clock.time<end} onClick={()=>void emit('GAME_RESTART',{roomCode:game.roomCode}).catch(error=>useGame.getState().setError(error.message))}>새 게임 시작</button>}</div>
    {clock.time<end&&<button className="cs-skip" onClick={clock.skip}>엔딩 바로 보기</button>}
  </section>;
}

/* ---------- 캔버스 입자: 빛줄기 속 먼지와 같은 방식 ----------
   gold = 황금 먼지가 바람 방향을 바꾸며 내려옴 / ember = 붉은 불씨가 올라감 / moon = 청백 입자가 빛기둥 따라 올라감 */
type FieldMode='gold'|'ember'|'moon';
const FIELD={
  gold:{rgb:'255,226,160',dir:1,n:64,v:[.05,.13],r:[.6,1.7],wind:.07},
  ember:{rgb:'255,98,122',dir:-1,n:52,v:[.07,.2],r:[.7,1.9],wind:.035},
  moon:{rgb:'190,226,255',dir:-1,n:46,v:[.06,.17],r:[.7,1.9],wind:.02},
} as const;
function Field({mode,delay=0}:{mode:FieldMode;delay?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const cv=ref.current;const g=cv?.getContext('2d');if(!cv||!g)return;
    const c=FIELD[mode];const dpr=Math.min(window.devicePixelRatio||1,2);
    let w=0,h=0,raf=0;const t0=performance.now();let last=t0;
    const P=Array.from({length:c.n},()=>({x:Math.random(),y:Math.random(),r:c.r[0]+Math.random()*(c.r[1]-c.r[0]),v:c.v[0]+Math.random()*(c.v[1]-c.v[0]),ph:Math.random()*6.28,sp:.5+Math.random()*1.2,k:Math.random()}));
    const size=()=>{w=cv.clientWidth;h=cv.clientHeight;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);};
    const frame=(now:number)=>{
      raf=requestAnimationFrame(frame);
      if(document.hidden)return;
      const dt=Math.min(.1,(now-last)/1000);last=now;
      const el=(now-t0)/1000-delay;if(el<0)return;
      const fade=Math.min(1,el/1.4);
      const gust=Math.sin(el*.35)*.7+Math.sin(el*.9+1.3)*.3;
      g.clearRect(0,0,w,h);
      for(const p of P){
        p.y+=c.dir*p.v*dt;p.x+=(gust*c.wind+Math.sin(el*p.sp+p.ph)*.012)*dt;
        if(p.y>1.05)p.y=-.05;if(p.y<-.05)p.y=1.05;if(p.x>1.03)p.x=-.03;if(p.x<-.03)p.x=1.03;
        const tw=.5+.5*Math.sin(el*3*p.sp+p.ph);
        const a=fade*(.25+.75*tw)*(.4+.6*p.k);
        const x=p.x*w,y=p.y*h,rad=p.r*(1+tw*.5);
        g.fillStyle=`rgba(${c.rgb},${(a*.22).toFixed(3)})`;g.beginPath();g.arc(x,y,rad*2.6,0,6.2832);g.fill();
        g.fillStyle=`rgba(${c.rgb},${a.toFixed(3)})`;g.beginPath();g.arc(x,y,rad,0,6.2832);g.fill();
      }
    };
    size();addEventListener('resize',size);raf=requestAnimationFrame(frame);
    return()=>{cancelAnimationFrame(raf);removeEventListener('resize',size);};
  },[mode,delay]);
  return <canvas ref={ref} className={`cs-field ${mode}`} aria-hidden="true"/>;
}
