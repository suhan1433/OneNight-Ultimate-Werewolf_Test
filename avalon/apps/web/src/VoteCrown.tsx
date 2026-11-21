import React,{useEffect,useRef,useState,type RefObject} from 'react';
import type {ClientGameState} from '@werewolf/shared';
import type {Plan} from './VoteScene';

/** One physical crown: it waits over the proposer, then travels to the next seat. */
export function VoteCrown({table,game,plan,reduced,children}:{table:RefObject<HTMLDivElement>;game:ClientGameState;plan:Plan|null;reduced:boolean;children:React.ReactNode}){
  const crown=useRef<HTMLSpanElement>(null);
  const [stage,setStage]=useState<'holding'|'passing'|'arrived'>('holding');
  const ids=game.players.map(player=>player.id).join(',');
  const from=Math.max(0,game.players.findIndex(player=>player.id===game.leaderId));
  const to=(from+1)%game.players.length;
  const rejected=game.phase==='vote_result'&&!!plan&&!game.voteResult?.passed&&game.rejectCount<4;
  const delay=(plan?.S??0)*1000+300,duration=1100;
  useEffect(()=>{
    const root=table.current,el=crown.current;if(!root||!el)return;
    const started=performance.now();let animation:Animation|undefined,frame=0,timer=0;
    setStage(rejected&&reduced?'arrived':'holding');
    if(rejected&&!reduced)timer=window.setTimeout(()=>setStage('passing'),delay);
    const measure=()=>{
      frame=0;
      const seats=[...root.querySelectorAll<HTMLElement>('.vt-seat')];
      const source=seats[from],target=seats[to];if(!source||!target)return;
      const anchor=(seat:HTMLElement)=>({x:seat.offsetLeft,y:seat.offsetTop-seat.offsetHeight/2-2});
      const a=anchor(source),b=anchor(target),at=rejected&&reduced?b:a;
      el.dataset.ready='true';
      el.style.left=`${at.x}px`;el.style.top=`${at.y}px`;
      const elapsed=performance.now()-started;
      animation?.cancel();
      if(!rejected||reduced)return;
      const angle=from/seats.length*Math.PI*2-Math.PI/2,step=Math.PI*2/seats.length;
      const frames=Array.from({length:33},(_,index)=>{
        const t=index/32,theta=angle+step*t;
        // The same seat ring and portrait heights used by the static crown.
        const x=index===0?a.x:index===32?b.x:root.clientWidth*(.5+.43*Math.cos(theta));
        const y=index===0?a.y:index===32?b.y:root.clientHeight*(.5+.43*Math.sin(theta))-(source.offsetHeight*(1-t)+target.offsetHeight*t)/2-2-Math.sin(Math.PI*t)*7;
        return {left:`${x}px`,top:`${y}px`,transform:`translate(-50%,-100%) rotate(${Math.sin(Math.PI*t)*-12}deg)`};
      });
      animation=el.animate(frames,{duration,delay,easing:'cubic-bezier(.45,0,.2,1)',fill:'both'});
      animation.id='crown-pass';animation.currentTime=elapsed;
      animation.onfinish=()=>{window.clearTimeout(timer);setStage('arrived');};
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(schedule);observer.observe(root);
    root.querySelectorAll('.vt-seat').forEach(seat=>observer.observe(seat));
    measure();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.clearTimeout(timer);animation?.cancel();};
  },[table,ids,from,to,rejected,reduced,delay]);
  const owner=game.players[stage==='arrived'&&rejected?to:from];
  return <span ref={crown} className="leader-crown vote-crown" data-state={stage} data-from={game.players[from]?.id} data-to={rejected?game.players[to]?.id:undefined} title={`${stage==='arrived'&&rejected?'다음 리더':'리더'} · ${owner?.nickname??''}`} aria-label={`${stage==='passing'?'왕관 인계 중':stage==='arrived'&&rejected?'다음 리더':'리더'} · ${owner?.nickname??''}`} role="img">{children}</span>;
}
