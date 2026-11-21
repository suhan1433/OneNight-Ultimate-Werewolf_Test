import {useLayoutEffect,type RefObject} from 'react';

/** Fit the table to the real controls, including wrapped names and chat drafts. */
export function useCouncilLayout(board:RefObject<HTMLElement>,phase:string){
  useLayoutEffect(()=>{
    const root=board.current,app=root?.closest<HTMLElement>('.app');
    if(!root||!app)return;
    const mobile=matchMedia('(max-width:640px), (pointer:coarse) and (max-width:900px)');
    let frame=0,disposed=false;
    const fit=()=>{
      frame=0;
      if(!mobile.matches){app.style.removeProperty('--council-size');delete app.dataset.councilCompact;return;}
      // Keep the board stable while a keyboard or expanded chat sheet is open.
      if(innerHeight-(visualViewport?.height??innerHeight)>120)return;
      const scene=root.querySelector<HTMLElement>('.cs-team,.vt,.cs-quest');
      const table=scene?.querySelector<HTMLElement>('.cs-table,.vt-wrap,.cs-altar-camera');
      if(!scene||!table){app.style.removeProperty('--council-size');return;}
      const sceneBox=scene.getBoundingClientRect(),tableBox=table.getBoundingClientRect();
      const compose=document.querySelector<HTMLElement>('.chat-panel[data-size="mini"] .ac-compose');
      const dock=document.querySelector('.chat-panel')?Math.max(50,compose?.getBoundingClientRect().height??50):0;
      const safeBottom=Math.max(0,innerHeight-(compose?.getBoundingClientRect().bottom??innerHeight));
      const controls=sceneBox.height-tableBox.height;
      const available=innerHeight-dock-safeBottom-12-(sceneBox.top+scrollY)-controls;
      const width=Math.min(420,innerWidth-40,root.getBoundingClientRect().width-16);
      const size=Math.floor(Math.max(200,Math.min(width,available)));
      const compact=String(size<250);if(app.dataset.councilCompact!==compact)app.dataset.councilCompact=compact;
      const previous=parseFloat(app.style.getPropertyValue('--council-size'));
      if(!Number.isFinite(previous)||Math.abs(previous-size)>1)app.style.setProperty('--council-size',`${size}px`);
    };
    const schedule=()=>{if(disposed)return;if(!frame)frame=requestAnimationFrame(fit);};
    const observer=new ResizeObserver(schedule);
    observer.observe(root);observer.observe(app);
    const chat=document.querySelector('.chat-panel');if(chat)observer.observe(chat);
    const mutation=new MutationObserver(schedule);
    mutation.observe(root,{childList:true,subtree:true});
    addEventListener('resize',schedule);mobile.addEventListener('change',schedule);
    document.fonts.ready.then(schedule);
    fit();
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();mutation.disconnect();removeEventListener('resize',schedule);mobile.removeEventListener('change',schedule);app.style.removeProperty('--council-size');delete app.dataset.councilCompact;};
  },[board,phase]);
}
