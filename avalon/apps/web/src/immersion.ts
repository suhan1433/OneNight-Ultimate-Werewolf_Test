import {useEffect} from 'react';

/* immersion.css 와 짝. App 최상위 컴포넌트에서 useImmersion() 을 한 번만 호출하세요. */
export function useImmersion(){
  useEffect(()=>{
    const root=document.documentElement;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const fine=matchMedia('(pointer: fine)');
    let raf=0,tx=50,ty=32,cx=50,cy=32;
    // Animate only while a mouse moves; resting council screens stay idle.
    const loop=()=>{
      cx+=(tx-cx)*.1;cy+=(ty-cy)*.1;
      root.style.setProperty('--mx',`${cx.toFixed(2)}%`);
      root.style.setProperty('--my',`${cy.toFixed(2)}%`);
      raf=Math.abs(tx-cx)+Math.abs(ty-cy)>.1?requestAnimationFrame(loop):0;
    };
    const move=(e:PointerEvent)=>{
      if(motion.matches||!fine.matches)return;
      tx=e.clientX/innerWidth*100;ty=e.clientY/innerHeight*100;
      if(!raf)raf=requestAnimationFrame(loop);
    };
    addEventListener('pointermove',move,{passive:true});

    /* 2. 버튼 파문 + 짧은 햅틱 */
    const press=(e:PointerEvent)=>{
      const b=(e.target as HTMLElement).closest('button');const rip=!!b&&b.matches('.primary,.pf-save,.ac-act-go');
      if(!b||(b as HTMLButtonElement).disabled)return;
      if(motion.matches)return;
      if(b.matches('.token,.qcard,.primary,.pf-save,.ac-act-go'))navigator.vibrate?.(12);
      if(!rip)return;
      const r=b.getBoundingClientRect(),s=document.createElement('span');
      s.className='im-ripple';s.style.left=`${e.clientX-r.left}px`;s.style.top=`${e.clientY-r.top}px`;
      b.appendChild(s);setTimeout(()=>s.remove(),700);
    };
    addEventListener('pointerdown',press,{passive:true});

    /* 정적(숨 멎는) 구간마다 심장 박동 햅틱 */
    const beat=new MutationObserver(()=>{if(!motion.matches&&(root.hasAttribute('data-cs-still')||root.hasAttribute('data-vt-still')))navigator.vibrate?.([25,70,25]);});
    beat.observe(root,{attributes:true,attributeFilter:['data-cs-still','data-vt-still']});

    return()=>{beat.disconnect();
      cancelAnimationFrame(raf);
      removeEventListener('pointermove',move);
      removeEventListener('pointerdown',press);
    };
  },[]);
}
