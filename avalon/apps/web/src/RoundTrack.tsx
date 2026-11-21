import React from 'react';
import type {ClientGameState} from '@werewolf/shared';

export const QUEST_SIZES:Record<number,number[]>={5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};

/** Shared public progress, with optional history controls. */
export function RoundTrack({game,open=null,onSelect}:{game:ClientGameState;open?:number|null;onSelect?:(round:number|null)=>void}){
  return <section className="round-history" aria-label="원정 라운드 기록" aria-live="polite" aria-atomic="true">{Array.from({length:5},(_,round)=>{
    const item=game.roundHistory.find(entry=>entry.round===round);
    const state=item?.success===true||game.results[round]==='success'?'success':item?.success===false||game.results[round]==='fail'?'fail':'pending';
    const status=state==='success'?'성공':state==='fail'?'실패':game.phase==='result'?'미진행':item?'진행 중':'대기';
    const justResolved=game.phase==='quest_result'&&round===game.round&&state!=='pending';
    const content=<><span className="round-seal" aria-hidden="true">{state==='pending'?['I','II','III','IV','V'][round]:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{state==='success'?<path d="M12 3 4 7v6c0 4 8 8 8 8s8-4 8-8V7L12 3Zm-4 9 3 3 5-6"/>:<path d="m5 4 15 16M19 4 4 20M4 16l4 4m8-16 4 4M4 4l4 1-3 3m15-4-4 1 3 3"/>}</svg>}</span><span className="round-label">원정 {round+1}</span><span className="round-meta"><span className="round-party-size">{QUEST_SIZES[game.maxPlayers]?.[round]}명</span><span className="round-outcome">{status}</span></span></>;
    const label=`${round+1}번째 원정, ${QUEST_SIZES[game.maxPlayers]?.[round]}명, ${status}`;
    return <div className={`round-history-item${justResolved?` result-arrived result-${state}`:''}`} key={`${round}-${state}`}>{onSelect?<button type="button" disabled={!item} className={`${state} ${round===game.round?'current':''}`} aria-label={label} aria-current={round===game.round?'step':undefined} onClick={()=>onSelect(open===round?null:round)} aria-expanded={open===round}>{content}</button>:<div className={`round-track-slot ${state} ${round===game.round?'current':''}`} aria-label={label} aria-current={round===game.round?'step':undefined}>{content}</div>}</div>;
  })}</section>;
}
