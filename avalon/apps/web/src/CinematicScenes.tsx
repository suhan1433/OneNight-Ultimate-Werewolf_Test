import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ROLE_DEFINITIONS,type ClientGameState} from '@werewolf/shared';
import {emit,socket,getAssassinAim,type AssassinAimState} from './socket';
import {useGame} from './store';

// Shared visual language only: no audio or vibration in these scenes.
const vars=(values:Record<string,string|number>)=>values as React.CSSProperties;
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
export function Sigil({kind='seal',size=48}:{kind?:'seal'|'good'|'evil'|'crown'|'dagger';size?:number}){
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='crown'?<path d="M10 47h44L50 24 39 33 32 17 25 33 14 24Z"/>:kind==='dagger'?<><path d="M32 7v37M23 22h18M23 44h18L32 58Z"/><circle cx="32" cy="10" r="3"/></>:<><circle cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="23"/>{kind==='good'?<><path d="m32 14-13 11v17l13 9 13-9V25ZM32 22v22M24 31h16"/></>:kind==='evil'?<><path d="m18 17 28 30M46 17 18 47M23 12h18l5 10-14 30-14-30Z"/></>:<path d="M32 13v35M20 26l12-12 12 12M22 48h20"/>}</>}
  </svg>;
}
function position(index:number,total:number,radius=40){const angle=index/total*Math.PI*2-Math.PI/2;return{x:50+radius*Math.cos(angle),y:50+radius*Math.sin(angle)};}
function Particles({count=18}:{count?:number}){return <div className="cs-particles" aria-hidden="true">{Array.from({length:count},(_,i)=><i key={i} style={vars({'--x':`${(i*37+7)%100}%`,'--drift':`${(i%2?1:-1)*(15+i*3)}px`,'--delay':`${(i%9)*.17}s`,'--duration':`${2+(i%4)*.4}s`})}/>)}</div>;}
function Candle({lit=true}:{lit?:boolean}){return <span className={`cs-candle${lit?' lit':''}`} aria-hidden="true"><i/><b/></span>;}
function SceneCaption({eyebrow,title,body}:{eyebrow:string;title:string;body:string}){return <div className="cs-caption"><small>{eyebrow}</small><h2>{title}</h2><p>{body}</p></div>;}

export function TeamScene({game}:{game:ClientGameState}){
  const[team,setTeam]=useState<string[]>([]);const[leaving,setLeaving]=useState<string[]>([]);const[submitting,setSubmitting]=useState(false);
  const timer=useRef<number>();const reduced=useMotion();const leader=game.playerId===game.leaderId;
  const leaderIndex=Math.max(0,game.players.findIndex(player=>player.id===game.leaderId));const origin=position(leaderIndex,game.players.length);
  const selected=game.players.filter(player=>team.includes(player.id));const ready=team.length===game.questSize;
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  const toggle=(id:string)=>{if(!leader||submitting)return;if(team.includes(id)){setTeam(team.filter(value=>value!==id));setLeaving(previous=>[...previous.filter(value=>value!==id),id]);}else if(!ready){setLeaving(previous=>previous.filter(value=>value!==id));setTeam([...team,id]);}};
  const propose=()=>{if(!ready||submitting)return;setSubmitting(true);timer.current=window.setTimeout(()=>{void emit('TEAM_PROPOSE',{roomCode:game.roomCode,team}).catch(error=>{setSubmitting(false);useGame.getState().setError(error.message);});},reduced?0:750);};
  return <section className={`cs cs-team${ready?' is-ready':''}${submitting?' is-proposing':''}${reduced?' cs-final':''}`}>
    <SceneCaption eyebrow={`ROUND ${game.round+1} · THE EXPEDITION`} title="원정대를 지명하세요" body={leader?`${game.questSize}명의 기사를 선택하세요. 당신이 이번 원정의 리더입니다.`:`${game.players.find(player=>player.id===game.leaderId)?.nickname??'리더'}이(가) ${game.questSize}명의 원정대를 구성하고 있습니다.`}/>
    <div className="cs-camera"><div className="cs-table">
      <div className="cs-leader-light" style={vars({'--lx':`${origin.x}%`,'--ly':`${origin.y}%`})}/>
      <svg className="cs-geometry" viewBox="0 0 100 100" aria-hidden="true">
        {team.filter(id=>id!==game.leaderId).map(id=>{const target=position(game.players.findIndex(player=>player.id===id),game.players.length);return <path className="cs-thread" pathLength="1" d={`M${origin.x} ${origin.y}L${target.x} ${target.y}`} key={id}/>;})}
        {leaving.filter(id=>id!==game.leaderId).map(id=>{const target=position(game.players.findIndex(player=>player.id===id),game.players.length);return <path className="cs-thread is-unwinding" pathLength="1" d={`M${origin.x} ${origin.y}L${target.x} ${target.y}`} key={`out-${id}`} onAnimationEnd={()=>setLeaving(previous=>previous.filter(value=>value!==id))}/>;})}
        {submitting&&<polygon className="cs-team-poly" points={selected.map(player=>{const p=position(game.players.indexOf(player),game.players.length);return`${p.x},${p.y}`;}).join(' ')} pathLength="1"/>}
      </svg>
      <div className="cs-core"><Sigil size={46}/><strong>{team.length}<span> / {game.questSize}</span></strong><small>{ready?'원정대 구성 완료':'선택된 기사'}</small></div>
      {game.players.map((player,index)=>{const p=position(index,game.players.length);return <div className={`cs-seat${team.includes(player.id)?' selected':''}${player.id===game.leaderId?' leader':''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} key={player.id}>
        {player.id===game.leaderId&&<span className="cs-crown"><Sigil kind="crown" size={27}/></span>}
        <button type="button" disabled={!leader||submitting||(!team.includes(player.id)&&ready)} aria-pressed={team.includes(player.id)} onClick={()=>toggle(player.id)}><span className="cs-avatar">{[...player.nickname][0]}</span><span className="cs-name">{player.nickname}</span></button><Candle/>
      </div>;})}
    </div></div>
    <div className="cs-selection" aria-live="polite"><small>선택된 기사 · {team.length}/{game.questSize}</small><div>{selected.length?selected.map(player=><span key={player.id}>{player.nickname}</span>):<em>아직 선택된 기사가 없습니다</em>}</div></div>
    {leader&&<button className="primary cs-propose" disabled={!ready||submitting} onClick={propose}><Sigil kind="crown" size={20}/>{submitting?'원정대를 제안하고 있습니다':'원정대 제안'}</button>}
  </section>;
}

// The seed and outcomes depend only on aggregate counts and public quest info.
// Never read individual quest cards or associate a card with a player.
export function questOrder(total:number,fails:number,seed:string){
  const cards=Array.from({length:total},(_,i)=>i<fails);let state=2166136261;
  for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  for(let i=cards.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[cards[i],cards[j]]=[cards[j]!,cards[i]!];}return cards;
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
  return <section className={`cs cs-quest${reveal?' is-reveal':''}${resolved?' is-resolved':''}${fails?' has-fail':' flawless'}${game.questResult?.success?' quest-success':' quest-failure'}${clock.final?' cs-final':''}${still?' is-still':''}`} style={vars({'--result-at':`${resultAt}s`,'--after-at':`${end-.5}s`,'--count':total})}>
    <SceneCaption eyebrow={`QUEST ${game.round+1} · THE ALTAR`} title={reveal?'원정의 진실':'중앙 제단에 카드를 봉인합니다'} body={reveal?'카드를 섞어 한 장씩 공개합니다. 누가 제출했는지는 공개되지 않습니다.':`봉인된 카드 ${count} / ${total}장 · 원정대원만 카드를 제출할 수 있습니다.`}/>
    <div className="cs-altar-camera"><div className="cs-altar"><div className="cs-altar-ring"/><div className="cs-altar-seal"><Sigil size={120}/></div>
      {[20,50,80].map(left=><div className="cs-altar-lamp" style={{left:`${left}%`}} key={left}><Candle/></div>)}
      {shownFails>0&&<div className="cs-failure-flash" key={shownFails} aria-hidden="true"/>}
      <div className="cs-quest-cards" aria-hidden="true">{Array.from({length:count},(_,index)=><div className={`cs-qcard${reveal&&order[index]?' fail':' success'}${index<revealed?' turned':''}`} style={vars({'--i':index,'--slot':index-(total-1)/2,'--pile-x':`${((index*23)%43)-21}px`,'--pile-y':`${((index*11)%31)-15}px`,'--rotation':`${index*29-30}deg`,'--flip-at':`${strike+index*gap}s`})} key={index}>
        <div className="cs-qcard-inner"><div className="cs-card-back"><Sigil size={42}/><small>AVALON</small></div><div className="cs-card-front"><Sigil kind={order[index]?'evil':'good'} size={44}/><strong>{order[index]?'실패':'성공'}</strong><small>{order[index]?'BETRAYAL':'LOYALTY'}</small><i className="cs-card-crack"/></div></div><i className="cs-card-burst"/>
      </div>)}</div>
      {reveal&&<><div className="cs-beam"/><svg className="cs-altar-crack" viewBox="0 0 400 300" aria-hidden="true"><path d="M0 171 78 143 113 161 161 113 186 141 226 128 249 162 302 140 340 165 400 147M161 113 157 67 191 34M249 162 270 223 247 268" pathLength="1"/></svg><Particles count={14}/></>}
    </div></div>
    {reveal?<>
      <p className="cs-progress" role="status">{resolved?`성공 ${total-fails}장 · 실패 ${fails}장`:still?'봉인을 깨기 직전, 원탁이 숨을 멈춥니다.':revealed?`공개된 카드: 성공 ${revealed-shownFails}장 / 실패 ${shownFails}장 / 미공개 ${total-revealed}장`:'카드를 섞고 있습니다.'}</p>
      {resolved&&<div className="cs-quest-verdict cs-glass"><small>ROUND {game.round+1} · 원정 보고</small><h2>{game.questResult?.success?'원정 성공':'원정 실패'}</h2><p>실패 카드 {fails}장{game.round===3&&game.maxPlayers>=7?' · 이번 원정은 실패 2장부터 실패':''}</p><div className="cs-score" aria-label="원정 진행 점수">{Array.from({length:5},(_,i)=><span className={game.results[i]??'pending'} key={i}>{i+1}<small>{game.results[i]==='success'?'성공':game.results[i]==='fail'?'실패':'대기'}</small></span>)}</div><button className="primary" disabled={game.hasContinued||clock.time<end-.5} onClick={()=>void emit('QUEST_RESULT_CONTINUE',{roomCode:game.roomCode}).catch(error=>useGame.getState().setError(error.message))}>{game.hasContinued?'계속 확인 완료':'계속'} ({game.continueConfirmedCount}/{game.players.length})</button></div>}
      {!resolved&&<button className="cs-skip" onClick={clock.skip}>결과 바로 보기</button>}
    </>:children}
  </section>;
}

export function AssassinScene({game}:{game:ClientGameState}){
  const[aim,setAim]=useState<string|null>(()=>getAssassinAim(game.roomCode)?.targetId??null);const[chosen,setChosen]=useState<string|null>(null);const[locked,setLocked]=useState(()=>!!getAssassinAim(game.roomCode)?.locked);
  const[actor,setActor]=useState<string|null>(()=>getAssassinAim(game.roomCode)?.actorId??(game.hasAssassinationAbility?game.playerId:null));
  const reduced=useMotion();const authority=game.hasAssassinationAbility;const ready=useClock(true,2).time>=2;
  const aimTimer=useRef<number>();
  useEffect(()=>{if(locked)document.documentElement.setAttribute('data-cs-still','1');return()=>document.documentElement.removeAttribute('data-cs-still');},[locked]);
  useEffect(()=>{const receive=(message:AssassinAimState)=>{if(message.roomCode!==game.roomCode)return;setAim(message.targetId);setLocked(!!message.locked);if(message.actorId)setActor(message.actorId);if(message.locked)window.clearTimeout(aimTimer.current);};socket.on('ASSASSIN_AIM',receive);const cached=getAssassinAim(game.roomCode);if(cached)receive(cached);return()=>{socket.off('ASSASSIN_AIM',receive);window.clearTimeout(aimTimer.current);};},[game.roomCode]);
  const sendAim=(targetId:string|null)=>{if(!authority||locked)return;setAim(targetId);window.clearTimeout(aimTimer.current);aimTimer.current=window.setTimeout(()=>socket.emit('ASSASSIN_AIM',{roomCode:game.roomCode,targetId}),100);};
  const confirm=async()=>{if(!chosen||locked)return;window.clearTimeout(aimTimer.current);setLocked(true);try{await emit('ASSASSIN_COMMIT',{roomCode:game.roomCode,targetId:chosen});}catch(error){setLocked(false);useGame.getState().setError(error instanceof Error?error.message:'암살 대상을 확정하지 못했습니다.');}};
  return <section className={`cs cs-assassin${locked?' is-locked':''}${reduced?' cs-final':''}`}>
    <div className="cs-assassin-dark" aria-hidden="true"/>
    <SceneCaption eyebrow="THE LAST SHADOW" title="빛이 닿지 않는 마지막 선택" body={locked?'대상이 확정되었습니다. 원탁이 숨을 멈춥니다.':authority?'멀린이라고 생각하는 기사를 지목하세요. 조준은 모두에게 보입니다.':'암살 능력 보유자가 선택 중입니다. 붉은 조준 링이 의심받는 기사를 가리킵니다.'}/>
    <div className="cs-camera"><div className="cs-table">
      <div className="cs-core"><Sigil kind="dagger" size={62}/><small>{locked?'운명이 결정됩니다':'마지막 암살'}</small></div>
      {game.players.map((player,index)=>{const p=position(index,game.players.length);const targeted=aim===player.id;return <div className={`cs-seat${targeted?' targeted':''}${chosen===player.id?' is-chosen':''}${player.id===actor?' assassin':''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} key={player.id}>
        <button type="button" disabled={!authority||!ready||locked||player.id===game.playerId} aria-pressed={chosen===player.id} onPointerEnter={()=>sendAim(player.id)} onPointerLeave={()=>sendAim(chosen)} onFocus={()=>sendAim(player.id)} onBlur={()=>sendAim(chosen)} onClick={()=>{setChosen(player.id);sendAim(player.id);}}><span className="cs-avatar">{[...player.nickname][0]}</span><span className="cs-name">{player.nickname}</span><i className="cs-target-ring"/></button><Candle lit={targeted}/>
      </div>;})}
    </div></div>
    <p className="cs-progress" role="status">{aim?`조준 중: ${game.players.find(player=>player.id===aim)?.nickname??'기사'}`:'아직 조준 대상이 없습니다.'}</p>
    {authority&&<div className="cs-assassin-actions"><p>{chosen?`${game.players.find(player=>player.id===chosen)?.nickname}님을 지목합니다. 확정 후에는 되돌릴 수 없습니다.`:'좌석을 선택한 뒤 암살을 확정하세요.'}</p><button className="cs-commit" disabled={!chosen||locked||!ready} onClick={()=>void confirm()}><Sigil kind="dagger" size={22}/>{locked?'운명이 결정되고 있습니다':'암살 확정'}</button></div>}
  </section>;
}

export function EndingScene({game}:{game:ClientGameState}){
  const good=game.winner==='good';const impact=!!game.assassinTarget;const offset=impact?2:0;const end=6+offset;
  const clock=useClock(true,end);const merlin=game.revealedRoles?.find(item=>item.role==='merlin');
  const target=game.players.find(player=>player.id===game.assassinTarget);const name=(id:string)=>game.players.find(player=>player.id===id)?.nickname??'기사';
  return <section className={`cs cs-ending ${good?'good':'evil'}${clock.final?' cs-final':''}${impact?' after-assassination':''}`} style={vars({'--ending-offset':`${offset}s`})}>
    {impact&&clock.time<offset&&<div className={`cs-assassin-impact ${good?'miss':'hit'}`} role="status"><div className="cs-impact-table" aria-hidden="true">{game.players.map((player,i)=>{const p=position(i,game.players.length);return <div className={`cs-impact-seat${player.id===game.assassinTarget?' is-target':''}${player.id===merlin?.id?' is-merlin':''}`} style={{left:`${p.x}%`,top:`${p.y}%`}} key={player.id}><span>{[...player.nickname][0]}</span><small>{player.nickname}</small><Candle/></div>;})}<Sigil kind={good?'good':'dagger'} size={65}/></div><strong>{good?'단검이 빗나갔습니다':'멀린의 촛불이 꺼졌습니다'}</strong><span>{good?`멀린 ${merlin?name(merlin.id):''} · 청백색 빛이 다시 켜집니다`:`${target?.nickname??'멀린'} · 붉은 파편이 원탁에 퍼집니다`}</span><Particles count={20}/></div>}
    <div className="cs-ending-world" aria-hidden="true"><div className="cs-ending-camera"><div className="cs-ending-table"><svg viewBox="0 0 400 400" className="cs-ending-cracks"><path pathLength="1" d="m35 225 72-19 29-34 45 27 35-44 44 38 51-19 48 35M181 199l-21 61 16 55M216 155l-9-52 21-56"/></svg>{game.players.map((player,i)=>{const p=position(i,game.players.length,38);return <div className="cs-ending-candle" style={{left:`${p.x}%`,top:`${p.y}%`,...vars({'--i':i})}} key={player.id}><Candle/></div>;})}<div className="cs-ending-sigil"><Sigil kind={good?'good':'evil'} size={115}/></div></div></div><Particles count={good?30:16}/><div className="cs-ending-ray"/></div>
    <div className="cs-ending-title"><small>THE RESISTANCE · AVALON</small><h1>{good?'선의 승리':'악의 승리'}</h1><p>{game.winReason}</p></div>
    <div className="cs-identity-grid" aria-label="모든 기사의 정체 공개">{game.players.map((player,index)=>{const info=game.revealedRoles?.find(item=>item.id===player.id);const definition=info?ROLE_DEFINITIONS[info.role]:undefined;const won=definition?.team===game.winner;return <article className={`cs-identity ${definition?.team??'good'}${won?' winner':''}`} style={vars({'--i':index})} key={player.id} aria-label={`${player.nickname}, ${definition?.name??'역할 정보 없음'}, ${won?'승리':'패배'}`}><div className="cs-identity-inner"><div className="cs-card-back" aria-hidden="true"><Sigil size={48}/><small>AVALON</small></div><div className="cs-card-front"><small>{definition?.team==='good'?'LOYAL TO THE LIGHT':'BOUND TO THE SHADOW'}</small><Sigil kind={info?.role==='merlin'?'seal':info?.hasAssassinationAbility?'dagger':definition?.team??'seal'} size={50}/><h3>{definition?.name??'—'}</h3><p>{player.nickname}</p>{info?.hasAssassinationAbility&&info.role!=='assassin'&&<small>암살 능력 보유</small>}<span className="cs-outcome">{won?'승리':'패배'}</span></div></div>{definition?.team==='evil'&&<Particles count={6}/>}</article>;})}</div>
    <div className="cs-ending-summary cs-glass"><small>CHRONICLE OF THE ROUND TABLE</small><h2>원탁에 남겨진 기록</h2><div className="cs-score">{Array.from({length:5},(_,round)=>{const record=game.roundHistory.find(item=>item.round===round);return <span className={record?.success===true?'success':record?.success===false?'fail':'pending'} key={round}>{round+1}<small>{record?.success===undefined?'미완료':record.success?'성공':'실패'}</small></span>;})}</div><div className="cs-chronicle">{game.roundHistory.map(record=><div key={record.round}><b>ROUND {record.round+1}</b><span>{record.team.map(name).join(' · ')}</span><small>찬성 {record.approveCount} / 반대 {record.rejectCount}{record.fails!==undefined?` · 실패 카드 ${record.fails}장`:''}</small><em>{record.success===undefined?'원정 미완료':record.success?'원정 성공':'원정 실패'}</em></div>)}</div>{game.playerId===game.hostId&&<button className="primary" disabled={clock.time<end} onClick={()=>void emit('GAME_RESTART',{roomCode:game.roomCode}).catch(error=>useGame.getState().setError(error.message))}>새 게임 시작</button>}</div>
    {clock.time<end&&<button className="cs-skip" onClick={clock.skip}>엔딩 바로 보기</button>}
  </section>;
}
