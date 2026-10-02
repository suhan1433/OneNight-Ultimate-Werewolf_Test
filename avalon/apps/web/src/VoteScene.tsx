import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';

/* 스토리보드 5. 투표 공개 — 타임라인(초). vote.css 의 변수(--R, --S, --ft …)와 같은 기준입니다.
   [예고]      각자 비공개로 투표 → 모두 같은 뒷면 코인이 원탁 '중앙 투표 영역'에 쌓인다 (좌석과 연결 없음)
   [마지막 투표] 0.0 마지막 코인이 떨어짐 · 0.35 모든 코인 1px 떨림 · 0.85 셔플(대응 관계 제거) · 조도 서서히 하강
   [공개 트리거] R=1.55  카메라가 수직 시점으로 후퇴 · 코인이 원형으로 정렬 · 촛불만 남기고 암전
   R+1.0       정적 0.5초
   R+1.5       타격: 0.35초 간격으로 한 장씩 (랜덤 순서) · 마지막 한 장은 +지연(득표 상황에 따라 0.25 / 0.6 / 1.0)
   S           결과: 가결(금빛 확정 · 코인 쓸림 · 따뜻한 확장) / 부결(붉게 갈라짐 · 왕관 굴러감 · 차가운 수축)
   S+1.2       여운: '찬성 n / 반대 n' 만 각인 · 조도 복귀
  
   익명성: 이 파일과 VoteStage 는 개별 플레이어의 투표(revealedVotes, record.votes)를 읽지 않는다.
   쓰는 것은 집계(approve, reject)와 공개 정보(방 코드·라운드·제안된 원정대)뿐이다. */
export const VT={drop:.35,tremble:.5,shuffle:.7,retreat:1.0,still:.5,strike:1.5,gap:.35,afterLast:.9,summary:1.2,cont:2.0} as const;
export const PRELUDE=VT.drop+VT.tremble+VT.shuffle;                 // = 1.55 → 공개 트리거 R

/* ---------- 결정적 난수 (모든 클라이언트가 같은 순서를 본다. 좌석·플레이어와는 무관) ---------- */
function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed:number){let a=seed;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffled<T>(arr:T[],r:()=>number){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;}

/* ---------- 마지막 코인의 지연: '이 한 표가 결과를 뒤집을 수 있는가' ----------
   a, r = 마지막 한 장을 제외하고 이미 공개된 찬성/반대 수. 통과 조건은 찬성 > 반대(동률은 부결).
   마지막이 찬성이면 a+1 > r, 반대면 a > r+1 일 때 통과 → 두 경우가 갈리는 것은 a ∈ {r, r+1} 일 때 */
export function lastDelay(a:number,r:number){
  if(a===r||a===r+1)return{extra:1.0,tier:'pivotal' as const};       // 3 / 3 / 미공개 1 — 숨 멎는 순간
  if(Math.abs(a-r)<=2)return{extra:.6,tier:'close' as const};         // 스토리보드 기본값
  return{extra:.25,tier:'decided' as const};                           // 이미 확정 — 불필요한 긴장을 줄인다
}

export type Plan={
  N:number;key:string;outcomes:boolean[];            // outcomes[k] = k번째로 뒤집히는 코인의 값(true=찬성)
  perm:number[];stepOf:number[];                      // perm[k] = k번째로 뒤집히는 코인의 인덱스 / stepOf[i] = 코인 i 의 뒤집힘 순서
  ft:number[];R:number;S:number;extra:number;tier:'pivotal'|'close'|'decided';
  revealed:Array<{a:number;r:number}>;                // revealed[k] = k장을 뒤집은 직후까지 공개된 표
};
export function buildPlan(approve:number,reject:number,seedKey:string):Plan{
  const N=approve+reject;
  const key=`${seedKey}|${approve}|${reject}`;
  const outcomes=shuffled([...Array(approve).fill(true),...Array(reject).fill(false)] as boolean[],rng(hash(`o|${key}`)));
  const perm=shuffled(Array.from({length:N},(_,i)=>i),rng(hash(`p|${key}`)));
  const stepOf=Array(N).fill(0);perm.forEach((coin,k)=>{stepOf[coin]=k;});
  const lastIsA=outcomes[N-1];
  const a0=approve-(lastIsA?1:0),r0=reject-(lastIsA?0:1);
  const{extra,tier}=lastDelay(a0,r0);
  const R=PRELUDE,first=R+VT.strike;
  const ft:number[]=[];
  for(let k=0;k<N-1;k++)ft.push(first+k*VT.gap);
  ft.push((ft[N-2]??first)+VT.gap+extra);
  const S=ft[N-1]!+VT.afterLast;
  const revealed:Array<{a:number;r:number}>=[{a:0,r:0}];
  let a=0,r=0;for(let k=0;k<N;k++){if(outcomes[k])a++;else r++;revealed.push({a,r});}
  return{N,key,outcomes,perm,stepOf,ft,R,S,extra,tier,revealed};
}

/* ---------- 코인 기하: 쌓임 → 셔플 경유점 → 새 쌓임 → 원형 ---------- */
export type Geom={pile:Array<{x:number;y:number;rot:number}>};
const pct=(n:number)=>`${(50+n*100).toFixed(2)}%`;
export function pileOf(i:number,seedKey:string){
  const r=rng(hash(`pile|${seedKey}|${i}`));
  const ang=r()*Math.PI*2,rad=.03+r()*.2;
  return{x:Math.cos(ang)*rad,y:Math.sin(ang)*rad,rot:Math.round(r()*360)};
}
export function coinStyle(i:number,seedKey:string,plan:Plan|null){
  const p=pileOf(i,seedKey);
  const st:Record<string,string|number>={'--px':pct(p.x),'--py':pct(p.y),'--rot':`${p.rot}deg`};
  if(plan){
    const r=rng(hash(`shuf|${plan.key}|${i}`));
    const pt=(rad:number)=>{const a=r()*Math.PI*2,d=r()*rad;return[Math.cos(a)*d,Math.sin(a)*d] as const;};
    const w1=pt(.3),w2=pt(.3),s=pt(.2);
    const slot=shuffled(Array.from({length:plan.N},(_,k)=>k),rng(hash(`slot|${plan.key}`)))[i]!;
    const ang=(slot/plan.N)*Math.PI*2-Math.PI/2;
    st['--w1x']=pct(w1[0]);st['--w1y']=pct(w1[1]);st['--w2x']=pct(w2[0]);st['--w2y']=pct(w2[1]);
    st['--sx']=pct(s[0]);st['--sy']=pct(s[1]);
    st['--cx']=pct(Math.cos(ang)*.38);st['--cy']=pct(Math.sin(ang)*.38);
    const step=plan.stepOf[i]!;
    st['--ft']=plan.ft[step]!.toFixed(3);
    st['--S']=plan.S.toFixed(3);
    if(step===plan.N-1)st['--lw']=((plan.ft[plan.N-2]??plan.R)+VT.gap).toFixed(3);      // 마지막 미공개 표가 숨죽이기 시작하는 시각
  }
  return st as React.CSSProperties;
}

/* ---------- 진행 중 합계 색: 공개된 표의 비율에 따라 청/적 방향으로 이동 (원탁 전체, 좌석 무관) ---------- */
const BLUE=[110,170,255],RED=[238,84,104];
export function tintOf(a:number,r:number,N:number){
  const n=a+r;if(!n)return'transparent';
  const share=a/n;
  const c=BLUE.map((b,i)=>Math.round(RED[i]!+(b-RED[i]!)*share));
  const alpha=(.16+.26*(n/N)).toFixed(3);
  return`rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/* ---------- 스테이지 상태 훅: 전환 감지·측정·햅틱·정적 ---------- */
export function useReducedMotion(){
  return useMemo(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
}

/** 원탁 중심·너비를 CSS 변수로 내려준다 (암전 오버레이의 구멍 위치) */
export function useTableMetrics(ref:React.RefObject<HTMLElement>,root:React.RefObject<HTMLElement>,active:boolean){
  useLayoutEffect(()=>{
    const upd=()=>{
      const t=ref.current,r=root.current;if(!t||!r)return;
      const b=t.getBoundingClientRect();
      r.style.setProperty('--cx',`${(b.left+b.width/2).toFixed(1)}px`);
      r.style.setProperty('--cy',`${(b.top+b.height/2).toFixed(1)}px`);
      r.style.setProperty('--tw',`${t.offsetWidth}px`);
    };
    upd();
    addEventListener('resize',upd);addEventListener('scroll',upd,{passive:true});
    const iv=active?window.setInterval(upd,400):0;                                 // 레이아웃이 움직이는 동안(배너·채팅 등) 보정
    return()=>{removeEventListener('resize',upd);removeEventListener('scroll',upd);window.clearInterval(iv);};
  },[ref,root,active]);
}

/** 공개 연출 동안: 코인별 짧은 햅틱 + 정적 구간(앰비언트 정지) */
export function useRevealEffects(plan:Plan|null,enabled:boolean){
  useEffect(()=>{
    if(!plan||!enabled)return;
    const ids:number[]=[];
    const at=(s:number,fn:()=>void)=>ids.push(window.setTimeout(fn,s*1000));
    const root=document.documentElement;
    at(plan.R+VT.retreat,()=>root.setAttribute('data-vt-still','1'));              // 정적: 모든 것이 정지
    at(plan.R+VT.strike,()=>root.removeAttribute('data-vt-still'));
    plan.ft.forEach((t,k)=>at(t,()=>navigator.vibrate?.(plan.outcomes[k]?10:18)));  // 햅틱 짧게
    return()=>{ids.forEach(id=>window.clearTimeout(id));root.removeAttribute('data-vt-still');};
  },[plan,enabled]);
}

/** 투표 코인 수 증가를 감지해서, 마운트 이후 새로 생긴 코인에만 '떨어짐'을 준다 */
export function useNewCoins(count:number){
  const base=useRef(count);
  const[,force]=useState(0);
  useEffect(()=>{force(x=>x+1);},[count]);
  return base.current;
}