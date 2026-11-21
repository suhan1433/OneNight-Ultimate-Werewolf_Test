import React from 'react';
import type {ClientGameState} from '@werewolf/shared';
import {PlayerAvatar} from './profile';

export function ExpeditionRoster({game,team=game.proposedTeam,selecting=false}:{game:ClientGameState;team?:string[];selecting?:boolean}){
  const participating=team.includes(game.playerId);
  return <section className="expedition-roster" aria-label="이번 원정대 구성" aria-live="polite" style={{'--roster-count':Math.max(1,team.length)} as React.CSSProperties}>
    <header><div><small>ROUND {game.round+1} · EXPEDITION</small><h3>{selecting?'선택 중인 원정대':'이번 원정대'} <b>{team.length}<span> / {game.questSize}명</span></b></h3></div><span className={`expedition-status${participating?' participating':''}`}>{participating?'나도 참여':'나는 대기'}</span></header>
    <ul>{team.map((id,index)=>{const player=game.players.find(p=>p.id===id);return <li key={id} className={id===game.playerId?'is-me':''}><span className="expedition-number">{index+1}</span><PlayerAvatar playerId={id} size={32}/><span className="expedition-name" title={player?.nickname}>{player?.nickname??'기사'}<small>{id===game.leaderId?'리더 · 원정대원':'원정대원'}</small></span>{id===game.playerId&&<b className="expedition-me">나</b>}</li>;})}</ul>
    {!team.length&&<p>원탁에서 원정에 나설 기사를 선택하세요.</p>}
  </section>;
}
