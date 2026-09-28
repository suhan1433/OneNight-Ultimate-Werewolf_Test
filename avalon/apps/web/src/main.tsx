import React,{useEffect,useRef,useState} from 'react';
import ReactDOM from 'react-dom/client';
import {ROLE_DEFINITIONS,type AvalonOptions,type ClientGameState} from '@werewolf/shared';
import {useGame} from './store';
import {emit,saveSession} from './socket';
import './styles.css';

const base={percival:false,morgana:false,mordred:false,oberon:false};
const call=(name:string,data:any)=>emit(name,data).catch(e=>useGame.getState().setError(e.message));

// official Avalon quest-size chart (players -> required team size per round)
const QUEST_SIZES:Record<number,number[]>={5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};
const TEAM_BALANCE:Record<number,{good:number;evil:number}>={5:{good:3,evil:2},6:{good:4,evil:2},7:{good:4,evil:3},8:{good:5,evil:3},9:{good:6,evil:3},10:{good:6,evil:4}};

function seatPos(i:number,total:number,radius=42){
  const angle=(i/total)*Math.PI*2-Math.PI/2;
  return {left:`${50+radius*Math.cos(angle)}%`,top:`${50+radius*Math.sin(angle)}%`};
}

/* ---------- icons ---------- */
function Icon({children,size=20}:{children:React.ReactNode;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
function ShieldIcon({size}:{size?:number}){return <Icon size={size}><path d="M12 2 4 5v6c0 5.2 3.4 8.7 8 9.6 4.6-.9 8-4.4 8-9.6V5l-8-3Z"/></Icon>;}
function SwordsIcon({size}:{size?:number}){return <Icon size={size}><path d="M5 5l14 14M19 5 5 19"/><path d="M5 5v3M5 5h3M19 5v3M19 5h-3"/></Icon>;}
function CrownIcon({size}:{size?:number}){return <Icon size={size}><path d="M3 18h18l-1.4-8.6-4 3.2L12 6l-3.6 6.6-4-3.2L3 18Z"/></Icon>;}
function CheckIcon({size}:{size?:number}){return <Icon size={size}><path d="M4 12.5 9 17 20 6"/></Icon>;}
function EyeIcon({size}:{size?:number}){return <Icon size={size}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/></Icon>;}
function DaggerIcon({size}:{size?:number}){return <Icon size={size}><path d="M12 2v12.5"/><path d="M7.5 14.5h9L12 21l-4.5-6.5Z"/><path d="M8.5 6h7"/></Icon>;}
function SpearIcon({size}:{size?:number}){return <Icon size={size}><path d="M4 20 17 7"/><path d="M14.5 3.5l6 6-3 1.2-4.2-4.2Z"/></Icon>;}
function MaskIcon({size}:{size?:number}){return <Icon size={size}><path d="M4.5 9c0-4 3.8-6.2 7.5-6.2S19.5 5 19.5 9c0 6-3.1 11.2-7.5 11.2S4.5 15 4.5 9Z"/><path d="M8 10.2c.5 1 1.5 1 2 0M14 10.2c.5 1 1.5 1 2 0"/></Icon>;}
function ChainIcon({size}:{size?:number}){return <Icon size={size}><rect x="3.5" y="8" width="7.5" height="9.5" rx="3.75"/><rect x="13" y="6.5" width="7.5" height="9.5" rx="3.75"/></Icon>;}
function SealIcon({size=96}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className="seal">
    <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="50" cy="50" r="37" stroke="currentColor" strokeWidth="1"/>
    <path d="M50 19v44M37 33l13-13 13 13M39 63h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function FactionSeal({team,size=44}:{team:'good'|'evil';size?:number}){
  const good=team==='good';
  return <svg className={`faction-seal ${team}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="23"/>
    {good?<><path d="M32 13 19 25v17l13 9 13-9V25L32 13Z"/><path d="M32 22v22M24 31h16"/></>:<><path d="m18 17 28 30M46 17 18 47"/><path d="M23 12h18l5 10-14 30-14-30 5-10Z"/></>}
  </svg>;
}
function RoleIcon({role,team,size}:{role:string;team:'good'|'evil';size?:number}){
  const r=role.toLowerCase();
  if(r.includes('merlin'))return <EyeIcon size={size}/>;
  if(r.includes('assassin'))return <DaggerIcon size={size}/>;
  if(r.includes('percival'))return <SpearIcon size={size}/>;
  if(r.includes('morgana'))return <MaskIcon size={size}/>;
  if(r.includes('mordred'))return <CrownIcon size={size}/>;
  if(r.includes('oberon'))return <ChainIcon size={size}/>;
  return <ShieldIcon size={size}/>;
}
function Dots(){return <span className="dots"><i/><i/><i/></span>;}
function PhaseRibbon({game}:{game:ClientGameState}){
  const copy:Record<string,[string,string]>={
    team_build:['원정대 구성','리더가 이번 원정에 나설 기사를 지명합니다.'],
    team_vote:['신뢰의 투표','모든 기사가 찬성 또는 반대를 비밀리에 선택합니다.'],
    vote_result:['원탁의 판결','투표 토큰을 공개하고 원정 승인 여부를 확인합니다.'],
    quest:['원정의 결단','원정대원만 자신의 원정 카드를 비밀리에 제출합니다.'],
    quest_result:['원정 보고','섞인 원정 카드의 결과가 공개됩니다.'],
    assassination:['마지막 암살','암살자는 멀린이라고 생각하는 기사를 지목합니다.'],
  };
  const [title,description]=copy[game.phase]??['원탁','기사들이 다음 행동을 기다립니다.'];
  return <div className="phase-ribbon"><span className="ribbon-kicker">ROUND {game.round+1}</span><div><strong>{title}</strong><small>{description}</small></div></div>;
}

/* ---------- shared round-table layout ---------- */
function RoundTable({players,center,renderSeat}:{players:any[];center:React.ReactNode;renderSeat:(p:any,i:number)=>React.ReactNode}){
  const radius=players.length>=8?39:42;
  return <div className={`table table--${players.length}`}>
    <div className="table-center">{center}</div>
    {players.map((p,i)=><div className="seat" style={seatPos(i,players.length,radius)} key={p.id}>{renderSeat(p,i)}</div>)}
  </div>;
}

/* ---------- screens ---------- */
function Home(){
  const[nickname,setNickname]=useState('');
  const[code,setCode]=useState('');
  const[count,setCount]=useState(5);
  const[opts,setOpts]=useState<AvalonOptions>(base);
  const balance=TEAM_BALANCE[count]!;
  const evilSpecialLimit=balance.evil-1;
  const evilSpecialSelected=['morgana','mordred','oberon'].filter(key=>opts[key as keyof AvalonOptions]).length;
  const create=async()=>{try{const s=await emit('ROOM_CREATE',{nickname,maxPlayers:count,options:opts});saveSession(s);}catch(e:any){useGame.getState().setError(e.message);}};
  const join=async()=>{try{const s=await emit('ROOM_JOIN',{roomCode:code,nickname});saveSession(s);}catch(e:any){useGame.getState().setError(e.message);}};
  return <section className="home">
    <SealIcon/>
    <h1>아 발 론</h1>
    <p>원탁은 하나, 충성은 둘로 갈렸다</p>
    <div className="panel">
      <input placeholder="내 닉네임" value={nickname} onChange={e=>setNickname(e.target.value)}/>
      <div className="row">
        <label>인원 <b>{count}명</b></label>
        <input type="range" min="5" max="10" value={count} onChange={e=>setCount(+e.target.value)}/>
      </div>
      <div className="ticks">{[5,6,7,8,9,10].map(n=><span className={n===count?'active':''} key={n}>{n}</span>)}</div>
      <div className="role-limit-card">
        <div><FactionSeal team="good" size={28}/><span>선 <b>{balance.good}명</b></span><small>멀린 필수 · 퍼시벌 선택 가능</small></div>
        <div><FactionSeal team="evil" size={28}/><span>악 <b>{balance.evil}명</b></span><small>암살자 필수 · 특수 역할 {evilSpecialSelected}/{evilSpecialLimit}</small></div>
      </div>
      <p className="role-limit-hint">특수 역할은 기본 역할(멀린·암살자)을 대체합니다. 악 특수 역할은 최대 {evilSpecialLimit}명까지 선택할 수 있습니다.</p>
      <div className="options">
        {Object.entries(opts).map(([key,on])=>{
          const def=ROLE_DEFINITIONS[key as keyof typeof ROLE_DEFINITIONS];
          const blocked=def.team==='evil'&&!on&&evilSpecialSelected>=evilSpecialLimit;
          return <button disabled={blocked} className={`role-chip ${on?'chosen':''}`} onClick={()=>setOpts({...opts,[key]:!on})} key={key}>
            <RoleIcon role={key} team={def.team} size={18}/><span>{def.name}</span>
          </button>;
        })}
      </div>
      <button className="primary seal-btn" onClick={create}><ShieldIcon size={16}/> 원탁 만들기</button>
      <div className="divider"><span>또는</span></div>
      <div className="join">
        <input placeholder="초대 코드" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
        <button onClick={join}>참가</button>
      </div>
    </div>
  </section>;
}

function Role({game}:{game:ClientGameState}){
  const role=game.selfRole!;
  const def=ROLE_DEFINITIONS[role];
  return <section className="center">
    <div className={`role ${def.team}`}>
      <RoleIcon role={role} team={def.team} size={32}/>
      <small>{def.team==='good'?'선의 세력':'악의 세력'}</small>
      <h2>{def.name}</h2>
      <p>{def.description}</p>
      {game.roleIntel.length>0&&<div className="intel">{game.roleIntel.map(x=><div key={x}>{x}</div>)}</div>}
    </div>
    <button className="primary" onClick={()=>call('ROLE_CONFIRM',{roomCode:game.roomCode})}>역할 확인 완료 ({game.roleConfirmedCount}/{game.players.length})</button>
    <p className="muted">다른 사람에게 화면을 보여주지 마세요.</p>
  </section>;
}

function Lobby({game}:{game:ClientGameState}){
  const me=game.players.find(p=>p.id===game.playerId)!;
  const[copied,setCopied]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(game.roomCode);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{}};
  return <section className="center">
    <h2>원탁 대기실</h2>
    <div className="lobby-layout">
      <div className="lobby-code"><small>ROOM CODE</small><div className="code" onClick={copy}>{game.roomCode}</div><span className="copy-hint">{copied?'복사됨!':'눌러서 코드 복사'}</span><span className="muted">{game.players.length}/{game.maxPlayers}명 참가</span></div>
      <div className="lobby-roles"><b>이번 게임의 캐릭터</b><div>{game.activeRoles.map((role,index)=><span key={`${role}-${index}`} className={ROLE_DEFINITIONS[role].team}><RoleIcon role={role} team={ROLE_DEFINITIONS[role].team} size={14}/>{ROLE_DEFINITIONS[role].name}</span>)}</div></div>
      <div className="lobby-players">{game.players.map(p=><div className={`plate${p.ready?' ready':''}${p.isBot?' bot':''}`} key={p.id}>{p.ready?<CheckIcon size={14}/>:<i className="dot"/>}<span>{p.nickname}</span>{p.isBot&&<small>TEST BOT</small>}</div>)}</div>
    </div>
    <button onClick={()=>call('PLAYER_READY',{roomCode:game.roomCode})}>{me.ready?'준비 취소':'준비 완료'}</button>
    {game.playerId===game.hostId&&<button className="primary" onClick={()=>call('GAME_START',{roomCode:game.roomCode})}>게임 시작</button>}
  </section>;
}

function RoundHistory({game,open,setOpen,showSlots=true}:{game:ClientGameState;open:number|null;setOpen:(round:number|null)=>void;showSlots?:boolean}){
  const name=(id:string)=>game.players.find(player=>player.id===id)?.nickname??'알 수 없음';
  const record=open===null?undefined:game.roundHistory.find(item=>item.round===open);
  return <section className={`round-history ${showSlots?'':'round-history-detail-only'}`} aria-label="원정 라운드 기록">{showSlots&&Array.from({length:5},(_,round)=>{const item=game.roundHistory.find(entry=>entry.round===round);const state=item?.success===true?'success':item?.success===false?'fail':'pending';return <div className="round-history-item" key={round}><button type="button" disabled={!item} className={`${state} ${round===game.round?'current':''}`} onClick={()=>setOpen(open===round?null:round)}><span>{QUEST_SIZES[game.maxPlayers]?.[round]}명</span><small>{item?(item.success===undefined?'진행 중':item.success?'성공':'실패'):`ROUND ${round+1}`}</small></button></div>;})}{record&&<div className="round-detail"><p><b>원정대</b> 리더 {name(record.leaderId)} · {record.team.map(name).join(', ')}</p><p><b>찬반</b> {Object.keys(record.votes).length===game.players.length?game.players.map(player=>`${player.nickname} ${record.votes[player.id]?'찬성':'반대'}`).join(' · '):'투표 진행 중'}</p><p><b>결과</b> {record.fails===undefined?'원정 결과 대기 중':`성공 카드 ${record.team.length-record.fails}장 · 실패 카드 ${record.fails}장`}</p></div>}</section>;
}

function ActiveRoles({game}:{game:ClientGameState}){
  return <section className="active-roles"><b>사용 캐릭터</b>{game.activeRoles.map((role,index)=>{const def=ROLE_DEFINITIONS[role];return <span className={def.team} key={`${role}-${index}`} title={def.description}><RoleIcon role={role} team={def.team} size={14}/>{def.name}</span>;})}</section>;
}

function Board({game}:{game:ClientGameState}){
  const[team,setTeam]=useState<string[]>([]);
  const[approve,setApprove]=useState<boolean|null>(null);
  const[questCard,setQuestCard]=useState<'success'|'fail'|null>(null);
  const[openRound,setOpenRound]=useState<number|null>(null);
  const me=game.playerId,leader=game.leaderId===me;
  const phase=game.phase;
  const leaderName=game.players.find(p=>p.id===game.leaderId)?.nickname;
  const teamChips=(ids:string[])=><div className="team-chips">{ids.map(id=><span className="chip" key={id}>{game.players.find(p=>p.id===id)?.nickname}</span>)}</div>;
  useEffect(()=>{setTeam([]);setApprove(null);setQuestCard(null);},[phase,game.round,game.proposedTeam.join(',')]);

  return <>
    <header className="game-status" aria-label="현재 원정 현황">
      <div className="leader-row" aria-label="현재 리더와 부결 횟수">
        <CrownIcon size={15}/><span>리더 <b>{leaderName}</b></span>
        <div className="reject-track">{Array.from({length:5}).map((_,i)=><i className={i<game.rejectCount?'used':''} key={i}/>)}</div>
      </div>
      <RoundHistory game={game} open={openRound} setOpen={setOpenRound}/>
    </header>

    <main className={`board${phase==='assassination'?' tense':''}`}>
      <PhaseRibbon game={game}/>
      <ActiveRoles game={game}/>

      {phase==='team_build'&&<>
        <h2>원정대 구성 ({game.questSize}명)</h2>
        <RoundTable
          players={game.players}
          center={<div className="selection-core"><FactionSeal team="good" size={38}/><strong>{team.length} <small>/ {game.questSize}</small></strong><span>{leader?'원정대를 지명하세요':'리더가 원정대를 구성 중입니다'}{!leader&&<Dots/>}</span></div>}
          renderSeat={p=><button disabled={!leader} className={team.includes(p.id)?'selected':''} onClick={()=>setTeam(team.includes(p.id)?team.filter(x=>x!==p.id):team.length<game.questSize?[...team,p.id]:team)}>{p.nickname}</button>}
        />
        {leader&&<div className="selection-summary"><span>선택된 기사</span>{team.length?teamChips(team):<em>아직 선택된 기사가 없습니다</em>}</div>}
        {leader&&<button className="primary seal-btn" disabled={team.length!==game.questSize} onClick={()=>call('TEAM_PROPOSE',{roomCode:game.roomCode,team})}><ShieldIcon size={16}/> 원정대 제안</button>}
      </>}

      {phase==='team_vote'&&<div className="vote-stage">
        <h2>원정대 투표</h2>
        {teamChips(game.proposedTeam)}
        {game.players.find(p=>p.id===me)?.hasVoted?
          <div className="token-back"><CheckIcon size={18}/><span>제출 완료</span></div>
        :<>
          <div className="vote-tokens">
            <button className={`token approve${approve===true?' active':''}`} onClick={()=>setApprove(true)}><ShieldIcon size={26}/><span>찬성</span></button>
            <button className={`token reject${approve===false?' active':''}`} onClick={()=>setApprove(false)}><SwordsIcon size={26}/><span>반대</span></button>
          </div>
          <button className="primary seal-btn" disabled={approve===null} onClick={()=>approve!==null&&call('TEAM_VOTE',{roomCode:game.roomCode,approve})}>원정 투표하기 ({game.teamVotesCompleted}/{game.players.length})</button>
        </>}
      </div>}

      {phase==='vote_result'&&<>
        <h2 className={`reveal-pop ${game.voteResult?.passed?'goodtext':'eviltext'}`}>{game.voteResult?.passed?'원정대 승인':'원정대 부결'}</h2>
        <div className="revealed-votes">{game.revealedVotes?.map(v=>{const player=game.players.find(p=>p.id===v.id);return <div className={v.approve?'approve':'reject'} key={v.id}>{v.approve?<CheckIcon size={15}/>:<SwordsIcon size={15}/>}<span>{player?.nickname}</span></div>})}</div>
        <div className="tally-row"><ShieldIcon size={16}/><b>{game.voteResult?.approve}</b><SwordsIcon size={16}/><b>{game.voteResult?.reject}</b></div>
        {me===game.hostId&&<button className="primary" onClick={()=>call('VOTE_RESULT_CONTINUE',{roomCode:game.roomCode})}>계속</button>}
      </>}

      {phase==='quest'&&<div className="quest-stage">
        <h2>원정 카드 제출</h2>
        {teamChips(game.proposedTeam)}
        {game.proposedTeam.includes(me)?
          game.players.find(p=>p.id===me)?.hasQuestCard?
            <div className="card-back"><CheckIcon size={18}/><span>제출 완료</span></div>
          :<><div className="quest-cards">
            <button className={`qcard success${questCard==='success'?' active':''}`} onClick={()=>setQuestCard('success')}><FactionSeal team="good" size={42}/><span>원정 성공</span><small>SUCCESS</small></button>
            {ROLE_DEFINITIONS[game.selfRole!].team==='evil'&&<button className={`qcard fail${questCard==='fail'?' active':''}`} onClick={()=>setQuestCard('fail')}><FactionSeal team="evil" size={42}/><span>원정 실패</span><small>FAIL</small></button>}
          </div><button className="primary seal-btn" disabled={!questCard} onClick={()=>questCard&&call('QUEST_CARD',{roomCode:game.roomCode,card:questCard})}>원정 {questCard==='success'?'성공':'실패'} 선택하기 ({game.questCardsCompleted}/{game.proposedTeam.length})</button></>
        :<div className="card-back"><span>원정대가 제출 중</span><Dots/></div>}
      </div>}

      {phase==='quest_result'&&<>
        <h2 className={`reveal-pop ${game.questResult?.success?'goodtext':'eviltext'}`}>{game.questResult?.success?'원정 성공!':'원정 실패'}</h2>
        <div className="tally-row">{Array.from({length:game.questResult?.fails??0}).map((_,i)=><SwordsIcon size={16} key={i}/>)}{!game.questResult?.fails&&<ShieldIcon size={16}/>}</div>
        <p className="muted">실패 카드 {game.questResult?.fails}장{game.round===3&&game.maxPlayers>=7?' · 이번 원정은 실패 2장부터 실패':''}</p>
        {me===game.hostId&&<button className="primary" onClick={()=>call('QUEST_RESULT_CONTINUE',{roomCode:game.roomCode})}>계속</button>}
      </>}

      {phase==='assassination'&&<>
        <h2>암살자의 마지막 기회</h2>
        <RoundTable
          players={game.players.filter(p=>p.id!==me)}
          center={<DaggerIcon size={30}/>}
          renderSeat={p=>game.selfRole==='assassin'?
            <button className="target" onClick={()=>call('ASSASSIN_TARGET',{roomCode:game.roomCode,targetId:p.id})}>{p.nickname}</button>
          :<div className="plate">{p.nickname}</div>}
        />
        {game.selfRole!=='assassin'&&<p className="waiting">암살자가 멀린을 지목하고 있습니다<Dots/></p>}
      </>}

    </main>
  </>;
}

function Result({game}:{game:ClientGameState}){
  const winners=game.revealedRoles?.filter(item=>ROLE_DEFINITIONS[item.role].team===game.winner)??[];
  return <section className="center">
    <div className={`crest ${game.winner==='good'?'goodtext':'eviltext'}`}>{game.winner==='good'?<ShieldIcon size={34}/>:<CrownIcon size={34}/>}</div>
    <h1 className={game.winner==='good'?'goodtext':'eviltext'}>{game.winner==='good'?'선의 승리':'악의 승리'}</h1>
    <p>{game.winReason}</p>
    <div className={`victory-summary ${game.winner==='good'?'good':'evil'}`}><FactionSeal team={game.winner??'good'} size={30}/><span><b>{game.winner==='good'?'선의 세력':'악의 세력'} {winners.length}명 승리</b><small>아래 역할 공개에서 각 기사의 결과를 확인하세요.</small></span></div>
    <div className="roster">
      {game.players.map(p=>{
        const role=game.revealedRoles?.find(x=>x.id===p.id)?.role;
        const def=role?ROLE_DEFINITIONS[role]:null;
        const won=!!def&&def.team===game.winner;
        return <div className={won?`winner ${def?.team}`:'loser'} key={p.id}>
          {def?<RoleIcon role={role!} team={def.team} size={18}/>:<span/>}
          <span>{p.nickname}</span>
          <span className="muted">{def?def.name:'—'}</span>
          <strong className={`result-badge ${won?'won':'lost'}`}>{won?'승리':'패배'}</strong>
        </div>;
      })}
    </div>
    {game.playerId===game.hostId&&<button className="primary" onClick={()=>call('GAME_RESTART',{roomCode:game.roomCode})}>새 게임</button>}
  </section>;
}

function ChatPanel({game,close}:{game:ClientGameState;close:()=>void}){
  const[draft,setDraft]=useState('');
  const latestRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{latestRef.current?.scrollIntoView({block:'end'});},[game.chat?.length]);
  const send=(event:React.FormEvent)=>{event.preventDefault();const text=draft.trim();if(!text)return;setDraft('');call('CHAT_SEND',{roomCode:game.roomCode,text});};
  return <aside className="chat-panel" aria-label="원탁 채팅">
    <div className="chat-title"><span>원탁의 대화</span><small>DISCUSSION</small><button type="button" onClick={close} aria-label="채팅 닫기">×</button></div>
    <div className="chat-log" aria-live="polite">
      {game.chat?.length?game.chat.map(message=><div className={`chat-message ${message.playerId===game.playerId?'mine':''}`} key={message.id}><b>{message.nickname}</b><p>{message.text}</p></div>):<div className="chat-empty">아직 대화가 없습니다.<br/>원정대를 논의해보세요.</div>}<div ref={latestRef}/>
    </div>
    <form className="chat-compose" onSubmit={send}>
      <input value={draft} maxLength={300} onChange={event=>setDraft(event.target.value)} placeholder="원탁에 메시지 보내기" aria-label="채팅 메시지"/>
      <button type="submit" disabled={!draft.trim()} aria-label="전송"><SpearIcon size={17}/></button>
    </form>
  </aside>;
}

function HelpModal({close}:{close:()=>void}){
  const roles=Object.entries(ROLE_DEFINITIONS) as Array<[keyof typeof ROLE_DEFINITIONS,(typeof ROLE_DEFINITIONS)[keyof typeof ROLE_DEFINITIONS]]>;
  return <div className="help-scrim" role="dialog" aria-modal="true" aria-label="아발론 도움말" onClick={close}>
    <section className="help-modal" onClick={event=>event.stopPropagation()}>
      <header><div><small>THE RESISTANCE: AVALON</small><h2>게임 도움말</h2></div><button onClick={close} aria-label="도움말 닫기">×</button></header>
      <div className="help-scroll">
        <section><h3>승리 조건</h3><div className="help-rule-grid"><div><FactionSeal team="good" size={30}/><p><b>선의 승리</b><br/>원정 3회 성공 후 암살자가 멀린을 찾지 못하면 승리합니다.</p></div><div><FactionSeal team="evil" size={30}/><p><b>악의 승리</b><br/>원정 3회 실패, 5회 연속 부결, 또는 멀린 암살 성공 시 승리합니다.</p></div></div></section>
        <section><h3>한 라운드의 흐름</h3><ol className="help-flow"><li>리더가 정해진 인원의 원정대를 지명합니다.</li><li>전원이 찬성·반대를 비밀리에 투표하고 함께 공개합니다.</li><li>승인된 원정대원만 비밀 원정 카드를 냅니다.</li><li>성공/실패 카드 수를 공개하고 다음 리더에게 넘깁니다.</li></ol><p className="help-note">선은 반드시 <b>성공</b> 카드를 냅니다. 악은 성공 또는 실패를 선택합니다. 7명 이상 게임의 4번째 원정은 실패 카드 2장부터 실패입니다.</p></section>
        <section><h3>역할 도감</h3><div className="help-roles">{roles.map(([id,role])=><article className={role.team} key={id}><RoleIcon role={id} team={role.team} size={20}/><div><b>{role.name}</b><small>{role.team==='good'?'선의 세력':'악의 세력'}</small><p>{role.description}</p></div></article>)}</div></section>
      </div>
    </section>
  </div>;
}

function RoleDossier({game,close}:{game:ClientGameState;close:()=>void}){
  const role=game.selfRole!;const def=ROLE_DEFINITIONS[role];
  return <aside className={`role-dossier ${def.team}`} aria-label="내 역할 정보"><button className="dossier-close" onClick={close} aria-label="내 역할 닫기">×</button><FactionSeal team={def.team} size={34}/><small>내 비밀 역할</small><h3>{def.name}</h3><p>{def.description}</p><div className="dossier-intel"><b>능력 · 확인한 정보</b>{game.roleIntel.length?<ul>{game.roleIntel.map(item=><li key={item}>{item}</li>)}</ul>:<p>확인할 추가 정보가 없습니다.</p>}</div></aside>;
}

function App(){
  const{game,error,setError,setGame}=useGame();
  const[chatOpen,setChatOpen]=useState(false);
  const[helpOpen,setHelpOpen]=useState(false);
  const[dossierOpen,setDossierOpen]=useState(false);
  useEffect(()=>{if(!error)return;const timer=window.setTimeout(()=>setError(null),3000);return()=>window.clearTimeout(timer);},[error,setError]);
  const leave=async()=>{
    if(!game)return;
    const ongoing=!['lobby','result'].includes(game.phase);
    const message=ongoing?'진행 중인 게임에서 나갈까요? 이 기기에서는 재접속 정보가 삭제되며, 다른 참가자에게는 연결 해제로 표시됩니다.':'방에서 나갈까요?';
    if(!window.confirm(message))return;
    try{await emit('ROOM_LEAVE',{roomCode:game.roomCode});}catch(e:any){setError(e.message);return;}
    localStorage.removeItem('avalon-session');setGame(null);
  };
  return <>
    <div className="app">
      <div className="utility-actions"><button className="help-button" onClick={()=>setHelpOpen(true)} aria-label="게임 도움말">?</button>{game?.selfRole&&game.phase!=='result'&&<button className="dossier-button" onClick={()=>setDossierOpen(value=>!value)}><EyeIcon size={15}/> 내 역할</button>}</div>
      {game&&<button className="leave-room" onClick={leave} aria-label="방 나가기"><span>↗</span> 방 나가기</button>}
      {!game?<Home/>
        :game.phase==='lobby'?<Lobby game={game}/>
        :game.phase==='role_reveal'?<Role game={game}/>
        :game.phase==='result'?<Result game={game}/>
        :<Board game={game}/>} 
    </div>
    {game&&['lobby','team_build','team_vote','vote_result','quest_result'].includes(game.phase)&&<>
      {!chatOpen&&<button className="chat-toggle" onClick={()=>setChatOpen(true)}><span>✦</span> 원탁 채팅 {game.chat?.length?`(${game.chat.length})`:''}</button>}
      {chatOpen&&<ChatPanel game={game} close={()=>setChatOpen(false)}/>} 
    </>} 
    {helpOpen&&<HelpModal close={()=>setHelpOpen(false)}/>} 
    {game?.selfRole&&dossierOpen&&<RoleDossier game={game} close={()=>setDossierOpen(false)}/>} 
    {error&&<div className="toast" key={error} onClick={()=>setError(null)}>{error}</div>}
  </>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
