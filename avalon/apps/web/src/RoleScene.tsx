import React,{useEffect,useRef,useCallback} from 'react';

/* 스토리보드 3. 역할 공개 — 타임라인(초). reveal.css 의 숫자와 같은 기준입니다.
   장면 시작을 0.0 으로 두고, 홀드는 1.0 에서 시작해 2.6 에 완료됩니다(= 홀드 1.6초).
   0.0 예고: 원탁이 어둠에 잠기고 내 앞의 뒷면 카드 한 장만 스포트라이트
   1.0 카드가 떠오르고 카메라 접근 · 꾹 누르면 테두리에 놋쇠 열이 차오름(진영 암시 없음)
   2.2 정적: 홀드 완료 직전 0.4초 — 모든 빛·움직임·진동 정지
   2.6 타격: 3D 과회전 뒤 안착 · 호일 반사 · 진영 색 폭발 후 수렴 · 강한 햅틱
   3.2 일러스트·이름 각인(자간 .5em → .06em) · 카드 뒤 후광(진영 색)
   4.5 설명 패널 상승 · 원탁 조도 서서히 복귀 · (악) 동료 좌석에 붉은 불씨가 하나씩
   → 시간 기준은 '홀드 완료 시점(타격)'을 T 로 두면 3.2=T+.6, 4.5=T+1.9 */
export const RV={ready:1.0,hold:1.6,still:.4,drain:.5,nameDelay:.6,panelDelay:1.9,kindleStep:.55} as const;

/* ---------- 홀드 제스처 ---------- */
type HoldOpts={enabled:boolean;onComplete:()=>void;onAbort:()=>void};
export function useHold({enabled,onComplete,onAbort}:HoldOpts){
  const el=useRef<HTMLButtonElement>(null);
  const s=useRef({holding:false,p:0,last:0,raf:0,hap:0,done:false});
  const cb=useRef({onComplete,onAbort,enabled});cb.current={onComplete,onAbort,enabled};
  const lim=1-RV.still/RV.hold;                                  // 이 지점부터 '정적'

  const paint=useCallback((p:number,holding:boolean)=>{
    const node=el.current;if(!node)return;
    const heat=Math.min(p/lim,1);
    const still=holding&&p>=lim;
    const amp=holding&&!still?heat*1.8:0;                        // 긴장: 열이 오를수록 떨림이 커지다가, 정적에서 뚝 멈춘다
    node.style.setProperty('--heat',heat.toFixed(3));
    node.style.setProperty('--jx',`${((Math.random()-.5)*2*amp).toFixed(2)}px`);
    node.style.setProperty('--jy',`${((Math.random()-.5)*2*amp).toFixed(2)}px`);
    if(holding)node.dataset.hold=still?'still':'on';else if(p>0)node.dataset.hold='drain';else delete node.dataset.hold;
    document.documentElement.toggleAttribute('data-rv-still',still);
  },[lim]);

  const loop=useCallback((now:number)=>{
    const st=s.current;
    const dt=Math.min(.1,(now-st.last)/1000);st.last=now;
    st.p=st.holding?Math.min(1,st.p+dt/RV.hold):Math.max(0,st.p-dt/RV.drain);
    const heat=Math.min(st.p/lim,1);
    /* 햅틱: 열이 오를수록 더 잦고 더 길게. 정적 구간에는 없음 */
    if(st.holding&&st.p<lim){
      const gap=280-190*heat;
      if(now-st.hap>gap){st.hap=now;navigator.vibrate?.(Math.round(6+20*heat));}
    }
    if(st.holding&&st.p>=1){
      st.holding=false;st.done=true;paint(1,false);
      const node=el.current;if(node){node.dataset.hold='done';}
      document.documentElement.removeAttribute('data-rv-still');
      cb.current.onComplete();
      return;
    }
    paint(st.p,st.holding);
    if(st.holding||st.p>0)st.raf=requestAnimationFrame(loop);
  },[lim,paint]);

  const start=useCallback(()=>{
    const st=s.current;
    if(!cb.current.enabled||st.done||st.holding)return;
    st.holding=true;st.last=performance.now();st.hap=0;
    cancelAnimationFrame(st.raf);st.raf=requestAnimationFrame(loop);
  },[loop]);
  const end=useCallback(()=>{
    const st=s.current;
    if(!st.holding)return;
    st.holding=false;
    if(st.p<1)cb.current.onAbort();
    cancelAnimationFrame(st.raf);st.last=performance.now();st.raf=requestAnimationFrame(loop);
  },[loop]);
  const reset=useCallback(()=>{
    const st=s.current;st.done=false;st.p=0;st.holding=false;cancelAnimationFrame(st.raf);paint(0,false);
  },[paint]);
  useEffect(()=>()=>{cancelAnimationFrame(s.current.raf);document.documentElement.removeAttribute('data-rv-still');},[]);

  const bind={
    onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{if(e.button!==0&&e.pointerType==='mouse')return;try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}start();},
    onPointerUp:end,onPointerCancel:end,onLostPointerCapture:end,onBlur:end,
    onKeyDown:(e:React.KeyboardEvent)=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start();}},
    onKeyUp:(e:React.KeyboardEvent)=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();end();}},
    onContextMenu:(e:React.SyntheticEvent)=>e.preventDefault(),
    onClick:(e:React.MouseEvent)=>e.preventDefault(),            // 탭만으로는 뒤집히지 않는다 — 반드시 홀드
  };
  return{el,bind,reset};
}

/* ---------- 확인한 정보에서 '악의 동료' 좌석 찾기 ----------
   서버는 roleIntel 을 문장으로만 내려주므로, 문장 안에 닉네임이 들어 있는 플레이어를 동료로 본다.
   (문장 자체도 화면에 그대로 보여주므로, 이 매칭이 빗나가도 정보 손실은 없다) */
export function findMates(intel:string[],players:Array<{id:string;nickname:string}>,meId:string){
  const out=new Set<string>();
  const tokens=intel.flatMap(x=>x.split(/[\s,，、:：·()\[\]/]+/)).filter(Boolean);
  for(const p of players){
    if(p.id===meId||!p.nickname)continue;
    const n=p.nickname;
    const hit=n.length>=2?intel.some(x=>x.includes(n)):tokens.includes(n);
    if(hit)out.add(p.id);
  }
  return out;
}
