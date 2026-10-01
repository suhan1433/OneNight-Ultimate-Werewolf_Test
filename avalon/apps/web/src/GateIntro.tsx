import React,{useEffect,useMemo,useRef,useState} from 'react';

/* 스토리보드 1. 입장 인트로(홈) — 타임라인(초). intro.css 의 숫자와 같은 기준입니다.
   0.0 암전·불씨 / 0.6 촛불·놋쇠 라인 / 1.6 카메라 하강 / 2.2 정적 / 2.6 타이틀 각인
   3.4 시일·부제·패널 / 4.0 여운(먼지·빛줄기·햅틱) */
export const TIMELINE={wave:3.4,afterglow:4.0,end:4.8} as const;
const SEEN='avalon-intro-seen';
let playedThisPage=false;

export type IntroMode='full'|'quick'|'static';
export type IntroState={
  mode:IntroMode;live:boolean;scale:number;overlay:boolean;canSkip:boolean;
  reduced:boolean;runKey:string;skip:()=>void;
};

export function useGateIntro():IntroState{
  const reduced=useMemo(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
  const returning=useMemo(()=>{try{return localStorage.getItem(SEEN)==='1';}catch{return false;}},[]);
  const[mode,setMode]=useState<IntroMode>(()=>playedThisPage||reduced?'static':'full');
  const[overlay,setOverlay]=useState(mode!=='static');
  const scale=mode==='quick'?.25:1;

  useEffect(()=>{
    if(mode==='static')return;
    playedThisPage=true;
    const root=document.documentElement;
    root.dataset.intro='playing';                       // 3.4 전까지 평상시 flicker 보류
    const ms=(s:number)=>s*scale*1000;
    const timers=[
      window.setTimeout(()=>{delete root.dataset.intro;},ms(TIMELINE.wave)),                 // 평상시 flicker 시작
      window.setTimeout(()=>{navigator.vibrate?.(16);},ms(TIMELINE.afterglow)),              // 모바일 짧은 햅틱 1회
      window.setTimeout(()=>{setOverlay(false);try{localStorage.setItem(SEEN,'1');}catch{}},ms(TIMELINE.end)),
    ];
    return()=>{timers.forEach(t=>window.clearTimeout(t));delete root.dataset.intro;};
  },[mode,scale]);

  return{
    mode,live:mode!=='static',scale,overlay,reduced,
    canSkip:returning&&mode==='full'&&overlay,
    runKey:mode,
    skip:()=>{setMode('quick');setOverlay(true);try{localStorage.setItem(SEEN,'1');}catch{}},
  };
}

/* ---------- 원탁(천장 시점 → 정면) ---------- */
export function Table(){
  const ticks=Array.from({length:72},(_,j)=>{
    const a=j*5*Math.PI/180,r2=j%6===0?91:88.5;
    return{j,x1:100+84*Math.sin(a),y1:100-84*Math.cos(a),x2:100+r2*Math.sin(a),y2:100-r2*Math.cos(a)};
  });
  const spokes=Array.from({length:8},(_,j)=>{
    const a=j*45*Math.PI/180;
    return{j,x1:100+14*Math.sin(a),y1:100-14*Math.cos(a),x2:100+44*Math.sin(a),y2:100-44*Math.cos(a)};
  });
  const k=(n:number,j?:number)=>({'--k':n,...(j===undefined?{}:{'--j':j})} as React.CSSProperties);
  /* 놋쇠 라인은 안쪽 → 바깥쪽 순서(촛불 빛이 퍼지는 방향)로 한 줄씩 그려진다 */
  return <svg className="intro-table" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="intro-brass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="200">
        <stop offset="0" stopColor="#fde9b4"/><stop offset=".45" stopColor="#dcb262"/><stop offset="1" stopColor="#7a5726"/>
      </linearGradient>
      <radialGradient id="intro-felt"><stop offset="0" stopColor="#245861"/><stop offset=".7" stopColor="#12323a"/><stop offset="1" stopColor="#0a1a20"/></radialGradient>
    </defs>
    <g className="intro-body">
      <circle cx="100" cy="100" r="100" fill="#2d2016"/>
      <circle cx="100" cy="100" r="98.6" fill="none" stroke="#5a4129" strokeWidth="1.6"/>
      <circle cx="100" cy="100" r="90" fill="url(#intro-felt)"/>
    </g>
    <g stroke="url(#intro-brass)" fill="none">
      {spokes.map(s=><line key={s.j} className="intro-ring" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} pathLength={1} strokeWidth=".7" style={k(0)}/>)}
      <circle className="intro-ring" cx="100" cy="100" r="9" pathLength={1} strokeWidth="1" transform="rotate(-90 100 100)" style={k(0)}/>
      <circle className="intro-ring" cx="100" cy="100" r="44" pathLength={1} strokeWidth=".9" transform="rotate(-90 100 100)" style={k(1)}/>
      <circle className="intro-ring" cx="100" cy="100" r="76" pathLength={1} strokeWidth=".8" transform="rotate(-90 100 100)" style={k(2)}/>
      {ticks.map(t=><line key={t.j} className="intro-ring" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} pathLength={1} strokeWidth=".6" style={k(3,t.j)}/>)}
      <circle className="intro-ring" cx="100" cy="100" r="92.5" pathLength={1} strokeWidth=".6" transform="rotate(-90 100 100)" style={k(4)}/>
      <circle className="intro-ring" cx="100" cy="100" r="96" pathLength={1} strokeWidth="1.6" transform="rotate(-90 100 100)" style={k(5)}/>
    </g>
  </svg>;
}

/* ---------- 4.0s 여운: 빛줄기 속에 떠다니는 먼지 ---------- */
function Dust({still}:{still:boolean}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const cv=ref.current;const g=cv?.getContext('2d');
    if(!cv||!g)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    let w=0,h=0,raf=0,last=performance.now();
    const beams=[{x:.68,a:18,hw:.095,k:1},{x:.30,a:13,hw:.07,k:.6}];      // intro.css 의 .intro-shaft 와 같은 기하
    const P=Array.from({length:52},()=>({x:Math.random(),y:Math.random(),r:.6+Math.random()*1.3,vx:(Math.random()-.5)*.006,vy:-(.003+Math.random()*.008),ph:Math.random()*6.28,sp:.4+Math.random()*.8}));
    const size=()=>{w=cv.clientWidth;h=cv.clientHeight;cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);};
    const lit=(px:number,py:number)=>{
      let b=0;const m=Math.max(w,h);
      for(const s of beams){
        const a=s.a*Math.PI/180,dx=px-s.x*w,dy=py+.12*h;
        const dist=Math.abs(dx*Math.cos(a)+dy*Math.sin(a));
        const along=-dx*Math.sin(a)+dy*Math.cos(a);
        const f=Math.max(0,1-along/(h*1.05)),side=Math.max(0,1-dist/(s.hw*m));
        b+=s.k*f*Math.pow(side,1.6);
      }
      return Math.min(1,b);
    };
    const draw=(now:number)=>{
      const dt=Math.min(.1,(now-last)/1000);last=now;
      g.clearRect(0,0,w,h);
      for(const p of P){
        p.x+=p.vx*dt;p.y+=p.vy*dt;
        if(p.y<-.02)p.y=1.02;if(p.x<-.02)p.x=1.02;if(p.x>1.02)p.x=-.02;
        const px=p.x*w+Math.sin(now*.0004*p.sp+p.ph)*10,py=p.y*h;
        const b=lit(px,py);
        const a=(.06+.8*b)*(.6+.4*Math.sin(now*.0012*p.sp+p.ph));
        g.fillStyle=`rgba(255,226,170,${a.toFixed(3)})`;
        g.beginPath();g.arc(px,py,p.r*(1+b*.6),0,6.2832);g.fill();
      }
    };
    const loop=(now:number)=>{if(!document.hidden)draw(now);raf=requestAnimationFrame(loop);};
    size();window.addEventListener('resize',size);
    if(still)draw(performance.now());else raf=requestAnimationFrame(loop);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',size);};
  },[still]);
  return <canvas ref={ref} className="intro-dust"/>;
}


export function GateIntro({intro}:{intro:IntroState}){
  const scene=useRef<HTMLDivElement>(null);

  /* 4.0 이후 마우스를 따라 촛불빛이 기울어진다 */
  useEffect(()=>{
    const el=scene.current;if(!el)return;
    let on=!intro.live;
    const timer=intro.live?window.setTimeout(()=>{on=true;},TIMELINE.afterglow*intro.scale*1000):0;
    const move=(e:PointerEvent)=>{
      if(!on)return;
      el.style.setProperty('--lx',String((e.clientX/window.innerWidth-.5)*2));
      el.style.setProperty('--ly',String((e.clientY/window.innerHeight-.5)*2));
    };
    window.addEventListener('pointermove',move,{passive:true});
    return()=>{window.clearTimeout(timer);window.removeEventListener('pointermove',move);};
  },[intro.live,intro.scale,intro.runKey]);

  return <>
    <div className="intro-scene" ref={scene} key={`scene-${intro.runKey}`} aria-hidden="true">
      <div className="intro-rig">
        <div className="intro-glow"/>
        <Table/>
        <div className="intro-sheen"/>
      </div>
      <i className="intro-shaft s1"/><i className="intro-shaft s2"/>
      <Dust still={intro.reduced}/>
    </div>
    {intro.overlay&&<>
      <div className="intro-dark" key={`dark-${intro.runKey}`} aria-hidden="true"/>
      <i className="intro-flame" key={`flame-${intro.runKey}`} aria-hidden="true"/>
    </>}
    {intro.live&&<p className="intro-sr" role="status">어둠 속에서 촛불이 켜지고, 원탁이 드러납니다. 아발론에 오신 것을 환영합니다.</p>}
    {intro.canSkip&&<button type="button" className="intro-skip" onClick={intro.skip}>건너뛰기</button>}
  </>;
}
