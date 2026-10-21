import {useEffect} from 'react';

/* immersion.css 와 짝. App 최상위 컴포넌트에서 useImmersion() 을 한 번만 호출하세요. */
export function useImmersion(){
  useEffect(()=>{
    const root=document.documentElement;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf=0,tx=50,ty=30,cx=50,cy=30;

    /* 1. 촛불빛이 커서(모바일은 기기 기울기)를 부드럽게 따라온다 */
    const loop=()=>{
      cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;
      root.style.setProperty('--mx',`${cx.toFixed(2)}%`);
      root.style.setProperty('--my',`${cy.toFixed(2)}%`);
      raf=requestAnimationFrame(loop);
    };
    const move=(e:PointerEvent)=>{tx=e.clientX/innerWidth*100;ty=e.clientY/innerHeight*100;};
    const tilt=(e:DeviceOrientationEvent)=>{
      if(e.gamma==null||e.beta==null)return;
      tx=50+Math.max(-30,Math.min(30,e.gamma))*1.2;
      ty=35+Math.max(-30,Math.min(30,e.beta-40))*.9;
    };
    if(!reduced){
      raf=requestAnimationFrame(loop);
      addEventListener('pointermove',move,{passive:true});
      addEventListener('deviceorientation',tilt);
    }

    /* 2. 버튼 파문 + 짧은 햅틱 */
    const press=(e:PointerEvent)=>{
      const b=(e.target as HTMLElement).closest('button');const rip=!!b&&b.matches('.primary,.pf-save,.ac-act-go');
      if(!b||(b as HTMLButtonElement).disabled)return;
      navigator.vibrate?.(b.matches('.token.reject')?[18,40,18]:b.matches('.qcard.fail')?[40,50,90]:b.matches('.token,.qcard')?[14]:8);
      if(reduced||!rip)return;
      const r=b.getBoundingClientRect(),s=document.createElement('span');
      s.className='im-ripple';s.style.left=`${e.clientX-r.left}px`;s.style.top=`${e.clientY-r.top}px`;
      b.appendChild(s);setTimeout(()=>s.remove(),700);
    };
    addEventListener('pointerdown',press,{passive:true});

    /* 정적(숨 멎는) 구간마다 심장 박동 햅틱 */
    const beat=new MutationObserver(()=>{if(root.hasAttribute('data-cs-still')||root.hasAttribute('data-vt-still'))navigator.vibrate?.([50,90,50]);});
    beat.observe(root,{attributes:true,attributeFilter:['data-cs-still','data-vt-still']});

    return()=>{beat.disconnect();
      cancelAnimationFrame(raf);
      removeEventListener('pointermove',move);removeEventListener('deviceorientation',tilt);
      removeEventListener('pointerdown',press);
    };
  },[]);
}
