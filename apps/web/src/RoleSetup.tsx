import { useState } from 'react';
import { ROLE_LIST, ROLE_DEFINITIONS, roleEdition, deckWarnings, type RoleType } from '@werewolf/shared';
import { RoleIcon } from './icons';

export function RoleSetup({ roles, count, onChange }: { roles: RoleType[]; count: number; onChange?: (roles: RoleType[]) => void }) {
  const [edition,setEdition] = useState('기본판');
  const [search,setSearch] = useState('');
  const used = ROLE_LIST.filter(r => roles.includes(r.id));
  const change = (id: RoleType,delta: number) => {
    if (!onChange) return;
    if (delta > 0 && roles.length < count+3 && roles.filter(r => r===id).length < ROLE_DEFINITIONS[id].maxCount) onChange([...roles,id]);
    if (delta < 0) onChange(roles.filter((r,i) => i !== roles.lastIndexOf(id)));
  };
  return <div className="panel deck-editor">
    <div className="panel-head"><h3>이번 밤의 역할</h3><b className={roles.length===count+3?'ok':'bad'}>{roles.length} / {count+3}장</b></div>
    <p className="deck-hint">플레이어 {count}장 + 센터 3장{roles.includes('alpha_wolf') ? ' + 별도 늑대 1장' : ''}</p>
    <div className="deck-selected">{used.map(r => <div className="deck-token" key={r.id}>
      <RoleIcon id={r.id} size={24}/><span>{r.name}<small>{roleEdition(r.id)}</small></span><b>×{roles.filter(id=>id===r.id).length}</b>
      {onChange && <button type="button" aria-label={`${r.name} 한 장 빼기`} onClick={()=>change(r.id,-1)}>−</button>}
    </div>)}</div>
    {roles.length !== count+3 && <p className="deck-warning" role="status">{count+3-roles.length}장을 더 선택해주세요.</p>}
    {deckWarnings(roles).map(w=><p className="deck-warning" key={w}>{w}</p>)}
    {onChange && <details className="deck-details"><summary>역할 편집 · 전체 역할 보기</summary>
      <input aria-label="역할 검색" placeholder="역할 이름으로 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="chips edition-tabs">{['기본판','Daybreak','보너스','커스텀'].map(label=><button type="button" className="chip" key={label} aria-pressed={edition===label} onClick={()=>setEdition(label)}>{label}</button>)}</div>
      <div className="deck-catalog">{ROLE_LIST.filter(r=>(search ? r.name.includes(search) : roleEdition(r.id)===edition)).map(r=>{
        const n=roles.filter(id=>id===r.id).length;
        return <div className="deck-role" key={r.id}><RoleIcon id={r.id} faction={r.faction} size={28}/><div><b>{r.name}</b><p>{r.description}</p></div><div className="deck-counter">
          <button type="button" disabled={!n} aria-label={`${r.name} 감소`} onClick={()=>change(r.id,-1)}>−</button><b>{n}</b>
          <button type="button" disabled={roles.length>=count+3||n>=r.maxCount} aria-label={`${r.name} 추가`} onClick={()=>change(r.id,1)}>+</button>
        </div></div>;
      })}</div>
    </details>}
  </div>;
}
