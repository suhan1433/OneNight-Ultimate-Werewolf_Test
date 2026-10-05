import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';

/* 스토리보드 5. 투표 공개 — 타임라인(초). vote.css 의 변수(--R, --S, --ft …)와 같은 기준입니다.
   두 가지 흐름 (방 옵션 revealVoteIdentities = "원정 기록 투표자 공개"):
   [켜짐 · identity]  각자 자리 앞에 놓인 코인이 곧 그 사람의 선택이다. 투표하면 자기 앞에 뒷면 코인이 놓이고,
                      공개 때는 그 코인이 그대로 뒤집힌다 (섞지 않는다).
   [꺼짐 · shuffled]  코인은 중앙에 쌓이고, 개표 직전에 실제로 섞인 뒤 각자 앞으로 나뉘어 놓인다.
                      자리 앞 코인은 '섞인 표'일 뿐 그 사람의 선택이 아니다 (대응 관계 제거).
   이후 공통:
   [마지막 투표] 0.0 마지막 코인이 떨어짐 · 0.35 모든 코인 1px 떨림 · (shuffled) 0.85~1.85 셔플 · 조도 서서히 하강
   [공개 트리거] R  카메라가 수직 시점으로 후퇴 · (shuffled) 코인이 각자 앞으로 놓임 · 촛불만 남기고 암전
                    R = identity 0.85 / shuffled 1.85
   R+1.0       정적 0.5초
   R+1.5       타격: 리더 다음 좌석부터 시계방향으로 0.35초 간격 · 마지막 한 장은 +지연(득표 상황에 따라 0.25 / 0.6 / 1.0)
   S           결과: 가결(금빛 확정 · 코인 쓸림 · 따뜻한 확장) / 부결(붉게 갈라짐 · 왕관 굴러감 · 차가운 수축)
   S+1.2       여운: '찬성 n / 반대 n' 만 각인 · 조도 복귀

   익명성: identity 흐름에서만 개인별 투표를 읽는다(readVotes). 옵션이 꺼져 있으면 개별 투표(revealedVotes, record.votes)는
   읽지 않으며, 집계(approve, reject)와 공개 정보(방 코드·라운드·제안된 원정대·리더 위치)만 쓴다. */
export const VT={drop:.35,tremble:.5,shuffle:1.0,retreat:1.0,still:.5,strike:1.5,gap:.35,afterLast:.9,summary:1.2,cont:2.0} as const;
export const PRELUDE=VT.drop+VT.tremble+VT.shuffle;                 // = 1.85 : shuffled 의 공개 트리거 R
export const PRELUDE_IDENTITY=VT.drop+VT.tremble;                   // = 0.85 : identity 의 공개 트리거 R

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

export type VoteMode='identity'|'shuffled';
export type Plan={
  N:number;key:string;mode:VoteMode;outcomes:boolean[];  // outcomes[k] = k번째로 뒤집히는 코인의 값(true=찬성)
  perm:number[];stepOf:number[];                      // perm[k] = k번째로 뒤집히는 코인(=좌석)의 인덱스 / stepOf[i] = 코인 i 의 뒤집힘 순서
  ft:number[];R:number;S:number;extra:number;tier:'pivotal'|'close'|'decided';
  revealed:Array<{a:number;r:number}>;                // revealed[k] = k장을 뒤집은 직후까지 공개된 표
};
export type PlanOpts={seats?:number;leaderIndex?:number;votes?:boolean[]|null};

/** 방 옵션이 '투표자 공개'일 때만 좌석 순서의 개인별 투표를 돌려준다. 서버가 주지 않으면 null (→ shuffled 로 대체).
    찾는 위치: game.voteResult.votes → game.revealedVotes → roundHistory[현재 라운드].votes  (모두 {플레이어id: 찬성여부}) */
export function readVotes(game:any):boolean[]|null{
  if(!game?.options?.revealVoteIdentities)return null;
  const record=game.roundHistory?.find((item:any)=>item.round===game.round);
  const map=game.voteResult?.votes??game.revealedVotes??record?.votes;
  if(!map||typeof map!=='object')return null;
  const arr=game.players.map((player:any)=>map[player.id]);
  return arr.every((value:unknown)=>typeof value==='boolean')?arr as boolean[]:null;
}

export function buildPlan(approve:number,reject:number,seedKey:string,opts:PlanOpts={}):Plan{
  const N=approve+reject;
  const seats=Math.max(N,opts.seats??N);
  const lead=opts.leaderIndex??-1;
  const key=`${seedKey}|${approve}|${reject}`;
  /* 공개 순서: 리더 다음 좌석부터 시계방향 (스토리보드 5). 순서는 공개 정보(리더 위치)로만 정해진다 */
  const perm:number[]=[];
  for(let k=1;k<=seats&&perm.length<N;k++){const seat=(lead+k+seats)%seats;if(seat<N)perm.push(seat);}
  const stepOf=Array(N).fill(0);perm.forEach((coin,k)=>{stepOf[coin]=k;});
  /* identity: 실제 투표를 좌석에 그대로 / shuffled: 집계만으로 만든 시드 셔플을 좌석에 배분 */
  const votes=opts.votes;
  const real=!!votes&&votes.length>=N&&votes.slice(0,N).filter(Boolean).length===approve&&votes.slice(0,N).filter(v=>!v).length===reject;
  const mode:VoteMode=real?'identity':'shuffled';
  const outcomes=real
    ?perm.map(seat=>votes![seat]!)
    :shuffled([...Array(approve).fill(true),...Array(reject).fill(false)] as boolean[],rng(hash(`o|${key}`)));
  const lastIsA=outcomes[N-1];
  const a0=approve-(lastIsA?1:0),r0=reject-(lastIsA?0:1);
  const{extra,tier}=lastDelay(a0,r0);
  const R=mode==='identity'?PRELUDE_IDENTITY:PRELUDE,first=R+VT.strike;
  const ft:number[]=[];
  for(let k=0;k<N-1;k++)ft.push(first+k*VT.gap);
  ft.push((ft[N-2]??first)+VT.gap+extra);
  const S=ft[N-1]!+VT.afterLast;
  const revealed:Array<{a:number;r:number}>=[{a:0,r:0}];
  let a=0,r=0;for(let k=0;k<N;k++){if(outcomes[k])a++;else r++;revealed.push({a,r});}
  return{N,key,mode,outcomes,perm,stepOf,ft,R,S,extra,tier,revealed};
}

/* ---------- 코인 기하: 쌓임 → (shuffled) 셔플 경유점 → 각자 좌석 앞 ---------- */
export type Geom={pile:Array<{x:number;y:number;rot:number}>};
export type CoinLayout={seats:number;placement:'seat'|'pile'};       // placement: 투표 직후 코인이 놓이는 곳 (옵션 켜짐=자기 앞 / 꺼짐=중앙 더미)
const pct=(n:number)=>`${(50+n*100).toFixed(2)}%`;
export function pileOf(i:number,seedKey:string){
  const r=rng(hash(`pile|${seedKey}|${i}`));
  const ang=r()*Math.PI*2,rad=.03+r()*.2;
  return{x:Math.cos(ang)*rad,y:Math.sin(ang)*rad,rot:Math.round(r()*360)};
}
/** 좌석 i 의 '자기 앞' 위치: 같은 각도, 원탁 안쪽 링 (투표 영역 폭 기준 비율) */
export function seatFront(i:number,seats:number){const a=i/seats*Math.PI*2-Math.PI/2;return{x:Math.cos(a)*.4,y:Math.sin(a)*.4};}
export function coinStyle(i:number,seedKey:string,plan:Plan|null,layout?:CoinLayout){
  const seats=layout?.seats??plan?.N??1;
  const front=seatFront(i,seats);
  const p=pileOf(i,seedKey);
  const start=layout?.placement==='seat'?front:p;
  const st:Record<string,string|number>={'--px':pct(start.x),'--py':pct(start.y),'--rot':layout?.placement==='seat'?'0deg':`${p.rot}deg`};
  if(plan){
    const r=rng(hash(`shuf|${plan.key}|${i}`));
    const pt=(rad:number)=>{const a=r()*Math.PI*2,d=r()*rad;return[Math.cos(a)*d,Math.sin(a)*d] as const;};
    const w1=pt(.3),w2=pt(.3),s=pt(.2);
    st['--w1x']=pct(w1[0]);st['--w1y']=pct(w1[1]);st['--w2x']=pct(w2[0]);st['--w2y']=pct(w2[1]);
    st['--sx']=pct(s[0]);st['--sy']=pct(s[1]);
    st['--cx']=pct(front.x);st['--cy']=pct(front.y);                 // 도착점 = 자기 앞
    const step=plan.stepOf[i]!;
    st['--ft']=plan.ft[step]!.toFixed(3);
    st['--S']=`${plan.S.toFixed(3)}s`;                              // 시간 값(단위 필수)
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

/** 원탁 중심·너비를 개표 암전 레이어에 직접 내려준다.
    --cy는 전역 등록값에서 상속되지 않으므로, 부모에만 두면 화면 중앙으로 되돌아갈 수 있다. */
export function useTableMetrics(ref:React.RefObject<HTMLElement>,root:React.RefObject<HTMLElement>,active:boolean){
  useLayoutEffect(()=>{
    const upd=()=>{
      const t=ref.current,r=root.current;if(!t||!r)return;
      const b=t.getBoundingClientRect();
      const cx=`${(b.left+b.width/2).toFixed(1)}px`;
      const cy=`${(b.top+b.height/2).toFixed(1)}px`;
      // fixed 레이어는 원탁의 실제 화면상 중심을 기준으로 삼아야 한다.
      const spotlight=r.querySelector<HTMLElement>('.vt-dark');
      spotlight?.style.setProperty('--cx',cx);
      spotlight?.style.setProperty('--cy',cy);
      r.style.setProperty('--cx',cx);
      r.style.setProperty('--cy',cy);
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
