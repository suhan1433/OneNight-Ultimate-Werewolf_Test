import { useMemo, useState } from 'react';
import { ROLE_DEFINITIONS, type GameResult, type RoleType } from '@werewolf/shared';
import { RoleIcon } from './icons';

export function NightReplay({ result }: { result: GameResult }) {
  const replay=result.replay??[];
  const [step,setStep]=useState(0);
  const cards=useMemo(()=>{
    const out: Record<string,RoleType> = Object.fromEntries(result.players.map(p=>[p.id,p.originalRole]));
    result.centerCards?.forEach((c,i)=>{out[`center-${i}`]=c.originalRole;});
    replay.slice(0,step).forEach(entry=>entry.changes.forEach(c=>{out[c.location]=c.after;}));
    return out;
  },[result,step]);
  const name=(id:string)=>id.startsWith('center-')?result.centerCards?.[Number(id.slice(7))]?.label??id:result.players.find(p=>p.id===id)?.nickname??id;
  const entry=replay[step-1];
  return <div className="panel night-replay">
    <div className="panel-head"><h3>밤의 진실</h3><small>게임 종료 후 전체 공개</small></div>
    <p>역할이 움직인 순서를 되짚어보세요.</p>
    <div className="replay-controls">
      <button type="button" aria-label="이전 밤 행동" disabled={step===0} onClick={()=>setStep(s=>s-1)}>←</button>
      <output aria-live="polite">{step===0?'처음 배정된 카드':`${step} / ${replay.length} · ${name(entry!.actorId)}`}</output>
      <button type="button" aria-label="다음 밤 행동" disabled={step===replay.length} onClick={()=>setStep(s=>s+1)}>→</button>
    </div>
    <input type="range" min="0" max={replay.length} value={step} aria-label="밤 행동 복기 단계" onChange={e=>setStep(Number(e.target.value))}/>
    {entry&&<div className="replay-event" aria-live="polite"><b>{ROLE_DEFINITIONS[entry.role].name}</b>
      <p>{describe(entry.result,name(entry.actorId))}</p>
      {entry.changes.map((c,i)=><p key={`${c.location}-${i}`}>{name(c.location)}: <span>{ROLE_DEFINITIONS[c.before].name}</span> → <strong>{ROLE_DEFINITIONS[c.after].name}</strong></p>)}
    </div>}
    <div className="replay-cards">{Object.entries(cards).map(([id,role])=><div key={id} className={entry?.changes.some(c=>c.location===id)?'changed':''}>
      <small>{name(id)}</small><RoleIcon id={role} faction={ROLE_DEFINITIONS[role].faction} size={30}/><b>{ROLE_DEFINITIONS[role].name}</b>
    </div>)}</div>
    {!replay.length&&<p className="tiny">이번 게임에는 기록된 밤 행동이 없습니다.</p>}
  </div>;
}
function describe(data:Record<string,unknown>,actor:string) {
  switch(data.kind){
    case 'cards': return `${actor}님이 ${(data.cards as {label:string;role:RoleType}[]??[]).map(c=>`${c.label}의 ${ROLE_DEFINITIONS[c.role].name}`).join(', ')}을 확인했습니다.`;
    case 'people': return `${String(data.title)}: ${(data.people as {nickname:string}[]??[]).map(p=>p.nickname).join(', ')||'없음'}`;
    case 'copied':return `${String(data.targetNickname)}님의 ${ROLE_DEFINITIONS[data.role as RoleType].name} 역할을 복사했습니다.`;
    case 'protected':return `${String(data.nickname)}님의 카드를 보호했습니다.`;
    case 'witch_seen':return `센터 카드 ${Number(data.centerIndex)+1}의 ${ROLE_DEFINITIONS[data.seenRole as RoleType].name}을 먼저 확인했습니다.`;
    case 'witch_swap':return `${String(data.targetNickname)}님에게 확인한 센터 카드를 주었습니다.`;
    case 'robber_swap':return `${String(data.targetNickname)}님과 교환하고 자신의 새 카드를 확인했습니다.`;
    case 'troublemaker_swap':return `${String(data.firstNickname)}님과 ${String(data.secondNickname)}님의 카드를 보지 않고 교환했습니다.`;
    case 'alpha_swap':return `${String(data.targetNickname)}님과 별도 센터 늑대 카드를 교환했습니다.`;
    case 'drunk_swap':return `자신의 카드와 센터 ${String(data.centerIndex)}번을 보지 않고 교환했습니다.`;
    case 'skipped':return '능력을 사용하지 않았습니다.';
    case 'blocked':return '방패로 보호되어 능력을 사용할 수 없었습니다.';
    default:return '정보를 확인했습니다.';
  }
}
