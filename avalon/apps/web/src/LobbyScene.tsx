import React,{forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Table} from './GateIntro';

/* 스토리보드 2. 로비 — 타임라인(초). lobby.css 의 숫자와 같은 기준입니다.
   0.0 카메라 상승(홈 원탁 → 로비 원탁) · 패널이 유리처럼 떠오름 · 촛불이 테이블 중심으로 이동
   0.8 방 코드가 놋쇠 활자로 한 글자씩(0.14s 간격) 찍힘, 찍힐 때마다 미세 흔들림 + 글자 하이라이트
   상시 입장: 촛불 점등 · 아바타 링이 놋쇠로 채워짐 · 이름표 하강 · 촛불이 그 좌석 쪽으로 기울었다 복귀 · 약한 햅틱
   상시 퇴장: 촛불이 꺼지며 연기 · 좌석 어두워짐
   시작 시: 모든 촛불이 한 번 크게 일렁임 → 전체 조도 20% → 역할 공개로 연결 */
export const LOBBY_TL={
  codeStart:.8,stamp:.14,stampImpact:.225,          // 글자 i 의 타격 시각 = codeStart + i*stamp + stampImpact
  rise:1.2,joinFx:2.6,leaveFx:2.4,
  surge:.6,swap:1.5,curtainEnd:3.9,                  // 시작: 일렁임 0.6s → 조도 하강 → 1.5s 에 역할 공개로 교체 → 3.9s 에 커튼 해제
} as const;

/* ---------- 방 코드: 놋쇠 활자 ---------- */
function shakeCss(n:number){
  const D=(n-1)*LOBBY_TL.stamp+LOBBY_TL.stampImpact+.14;
  const kf:string[]=['0%{transform:translate(0,0)}'];
  for(let i=0;i<n;i++){
    const t=i*LOBBY_TL.stamp+LOBBY_TL.stampImpact;
    const pct=(s:number)=>((t+s)/D*100).toFixed(3);
    const sx=i%2?1:-1;
    kf.push(`${pct(0)}%{transform:translate(0,0)}`,`${pct(.014)}%{transform:translate(${1.6*sx}px,1.2px)}`,`${pct(.034)}%{transform:translate(${-1.1*sx}px,-.7px)}`,`${pct(.056)}%{transform:translate(${.5*sx}px,.3px)}`,`${pct(.08)}%{transform:translate(0,0)}`);
  }
  kf.push('100%{transform:translate(0,0)}');
  return{name:`lbShake${n}`,dur:D,css:`@keyframes lbShake${n}{${kf.join('')}}`};
}
export function shakeVars(n:number){const s=shakeCss(n);return{'--shake-name':s.name,'--shake-d':`${s.dur.toFixed(3)}s`} as React.CSSProperties;}
export function RoomCode({code}:{code:string}){
  const chars=[...code];
  const css=useMemo(()=>shakeCss(chars.length).css,[chars.length]);
  return <><style>{css}</style><span className="code" aria-label={code}>{chars.map((ch,i)=><span className="ch" aria-hidden="true" style={{'--i':i} as React.CSSProperties} key={i}>{ch}</span>)}</span></>;
}

/* ---------- 촛불빛: 홈의 원탁 중심 → 로비 원탁 중심으로 이동 / 입장 때 그 좌석 쪽으로 기울었다 복귀 ---------- */
export type GlowHandle={lean:(dx:number,dy:number)=>void};
export const LobbyGlow=forwardRef<GlowHandle>(function LobbyGlow(_,ref){
  const el=useRef<HTMLDivElement>(null);
  useImperativeHandle(ref,()=>({
    lean:(dx,dy)=>{el.current?.animate?.([{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx}px,${dy}px) scale(1.1)`,offset:.32},{transform:'translate(0,0) scale(1)'}],{duration:1500,easing:'ease-in-out'});},
  }),[]);
  useLayoutEffect(()=>{
    const e=el.current;if(!e||!e.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const r=e.getBoundingClientRect();
    const dx=innerWidth/2-(r.left+r.width/2),dy=innerHeight*.64-(r.top+r.height/2);     // 홈 원탁의 중심(화면 중앙 + 14vh)
    e.animate([{transform:`translate(${dx}px,${dy}px) scale(.62)`},{transform:'translate(0,0) scale(1)'}],{duration:900,easing:'cubic-bezier(.3,.1,.2,1)',fill:'backwards'});
  },[]);
  return <div className="lb-glow" ref={el} aria-hidden="true"/>;
});

/* ---------- 0.0 카메라 상승: 홈의 기울어진 원탁이 위로 올라가며 수평이 된다 ---------- */
export function LobbyBackdrop(){
  const[on,setOn]=useState(true);
  useEffect(()=>{const t=window.setTimeout(()=>setOn(false),LOBBY_TL.rise*1000+250);return()=>window.clearTimeout(t);},[]);
  if(!on)return null;
  return <div className="intro-scene lb-backdrop" aria-hidden="true"><div className="intro-rig"><Table/></div></div>;
}

/* ---------- 입장/퇴장 감지 ---------- */
export type Ghost={key:string;index:number;name:string};
export function useRoster(players:Array<{id:string;nickname:string}>,meId:string,onJoin:(index:number)=>void){
  const prev=useRef<Map<string,{i:number;name:string}>|null>(null);
  const timers=useRef<number[]>([]);
  const[fresh,setFresh]=useState<string[]>([]);
  const[ghosts,setGhosts]=useState<Ghost[]>([]);
  const[message,setMessage]=useState('');
  const sig=players.map(p=>p.id).join(',');
  const join=useRef(onJoin);join.current=onJoin;
  useEffect(()=>{
    const cur=new Map(players.map((p,i)=>[p.id,{i,name:p.nickname}] as const));
    const before=prev.current;prev.current=cur;
    if(!before)return;
    const joined=players.filter(p=>!before.has(p.id));
    const left=[...before].filter(([id])=>!cur.has(id));
    const later=(fn:()=>void,s:number)=>{timers.current.push(window.setTimeout(fn,s*1000));};
    if(joined.length){
      const ids=joined.map(p=>p.id);
      setFresh(f=>[...f,...ids]);
      later(()=>setFresh(f=>f.filter(id=>!ids.includes(id))),LOBBY_TL.joinFx);
      const first=cur.get(joined[0]!.id)!;
      join.current(first.i);
      if(joined.some(p=>p.id!==meId))navigator.vibrate?.(10);        // 햅틱 약
      setMessage(`${joined.map(p=>p.nickname).join(', ')}님이 입장했습니다. 현재 ${players.length}명.`);
    }
    if(left.length){
      const gs=left.map(([id,v])=>({key:`${id}-${Date.now()}`,index:v.i,name:v.name}));
      setGhosts(g=>[...g,...gs]);
      later(()=>setGhosts(g=>g.filter(x=>!gs.some(y=>y.key===x.key))),LOBBY_TL.leaveFx);
      setMessage(`${left.map(([,v])=>v.name).join(', ')}님이 나갔습니다. 현재 ${players.length}명.`);
    }
  },[sig]);
  useEffect(()=>()=>{timers.current.forEach(t=>window.clearTimeout(t));},[]);
  return{fresh,ghosts,message};
}

/* ---------- 시작: 전체 조도 20%로 하강했다가 역할 공개 화면이 자리잡은 뒤 걷힌다 ---------- */
/* 교체·해제 시점을 벽시계 타이머가 아니라 커튼 애니메이션 자체의 시작/종료 이벤트에 묶는다
   (느린 기기에서 첫 프레임이 늦어져도 '20%에 도달한 뒤' 교체되도록) */
export function StartCurtain({onStart,onEnd}:{onStart:()=>void;onEnd:()=>void}){
  return <div className="lb-curtain" aria-hidden="true"><i onAnimationStart={onStart} onAnimationEnd={onEnd}/></div>;
}
