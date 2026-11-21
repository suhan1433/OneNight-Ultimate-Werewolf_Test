import type {CSSProperties} from 'react';
import type {ClientGameState} from '@werewolf/shared';
import {ROLE_DEFINITIONS} from '@werewolf/shared';
import {PlayerAvatar} from './profile';
import {roleArtFor} from './role-art';

export const ASSASSINATION_IMPACT_SECONDS=6.4;

/** A non-interactive close-up; the server has already resolved the target. */
export function AssassinationImpact({game}:{game:ClientGameState}){
  const target=game.players.find(player=>player.id===game.assassinTarget);
  const identity=game.revealedRoles?.find(player=>player.id===game.assassinTarget);
  const merlin=game.players.find(player=>game.revealedRoles?.some(role=>role.id===player.id&&role.role==='merlin'));
  const hit=identity?identity.role==='merlin':game.winner==='evil';
  return <div className={`execution-cinema ${hit?'is-hit':'is-miss'}`} role="status" aria-label="마지막 암살 결과">
    <div className="execution-atmosphere" aria-hidden="true"/>
    <header><small>THE LAST BLADE</small><p>마지막 암살</p></header>
    <div className="execution-focus" aria-hidden="true">
      <i className="execution-halo"/>
      <div className="execution-card">
        {identity&&<img className="execution-portrait" src={roleArtFor(identity.role,identity.id)} alt=""/>}
        <div className="execution-seal"><PlayerAvatar playerId={game.assassinTarget??''} size={72}/><span>지목된 기사</span></div>
        <i className="execution-card-shade"/>
        <div className="execution-name"><b>{target?.nickname??'지목된 기사'}</b>{identity&&<span>{ROLE_DEFINITIONS[identity.role].name}</span>}</div>
      </div>
      <svg className="execution-blade" viewBox="0 0 60 200"><path d="M30 196 23 167 25 49 35 49 37 167Z" fill="#e8e3d2"/><path d="M30 49v137" stroke="#7e929c"/><path d="M11 46q19-12 38 0l-2 8q-17-9-34 0Z" fill="#baa276"/><path d="M26 10h8v30h-8Z" fill="#563941" stroke="#baa276"/><circle cx="30" cy="8" r="6" fill="#baa276"/></svg>
      <div className="execution-candle"><i/><b/></div>
      <i className="execution-strike"/><i className="execution-shock"/>
      <div className="execution-motes">{Array.from({length:10},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>
    </div>
    <div className="execution-verdict"><h2>{hit?'멀린의 불빛이 꺼졌습니다':'멀린을 찾지 못했습니다'}</h2><p>{hit?'마지막 희망이 사라지고, 아발론에 어둠이 내립니다.':`${target?.nickname??'지목된 기사'}${identity?` · ${ROLE_DEFINITIONS[identity.role].name}`:''}`}</p>{!hit&&merlin&&<div className="execution-survivor"><PlayerAvatar playerId={merlin.id} size={22}/><span>멀린 <b>{merlin.nickname}</b> · 아발론의 빛이 살아남았습니다</span></div>}</div>
  </div>;
}
