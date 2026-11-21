import React from 'react';
import type {ClientGameState} from '@werewolf/shared';
import {PlayerAvatar} from './profile';
import {RoundTrack} from './RoundTrack';
import {questDestination} from './quest-destinations';

export function GameChronicle({game,children}:{game:ClientGameState;children?:React.ReactNode}){
  const name=(id:string)=>game.players.find(player=>player.id===id)?.nickname??'기사';
  const success=game.results.filter(result=>result==='success').length,fail=game.results.filter(result=>result==='fail').length;
  return <section className="cs-ending-summary cs-glass chronicle" aria-label="원탁에 남겨진 기록">
    <header className="chronicle-heading"><small>CHRONICLE OF THE ROUND TABLE</small><h2>원탁에 남겨진 기록</h2><p>완료된 원정 {success+fail}회 <span>성공 <b>{success}</b></span><span>실패 <b>{fail}</b></span></p></header>
    <RoundTrack game={game}/>
    <ol className="chronicle-list">{[...game.roundHistory].sort((a,b)=>a.round-b.round).map((record,index)=>{
      const state=record.success===undefined?'pending':record.success?'success':'fail';
      return <li className={`chronicle-entry ${state}`} style={{'--entry-index':index} as React.CSSProperties} key={record.round}>
        <header><span className="chronicle-round">원정 {record.round+1} · {questDestination(record.round).name}</span><strong className="chronicle-outcome">{state==='pending'?'원정 미진행':state==='success'?'원정 성공':'원정 실패'}</strong></header>
        <p className="chronicle-leader"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 18h18l-1.4-8.6-4 3.2L12 6l-3.6 6.6-4-3.2L3 18Z"/></svg>리더 <span>{name(record.leaderId)}</span></p>
        <ul className="chronicle-members" aria-label={`원정 ${record.round+1}의 원정대`}>{record.team.map(id=><li key={id}><PlayerAvatar playerId={id} size={18}/><span>{name(id)}</span></li>)}</ul>
        <dl className="chronicle-metrics"><div><dt>찬성</dt><dd>{record.approveCount}<small>표</small></dd></div><div><dt>반대</dt><dd>{record.rejectCount}<small>표</small></dd></div><div><dt>실패 카드</dt><dd>{record.fails===undefined?'—':<>{record.fails}<small>장</small></>}</dd></div></dl>
      </li>;
    })}</ol>
    {children&&<footer>{children}</footer>}
  </section>;
}
