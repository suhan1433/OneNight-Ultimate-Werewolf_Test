import { useState, type CSSProperties } from 'react';
import type { Game, Send } from './types';
import { inviteLink } from './lib';
import { Avatar, MissionMap, Rules } from './ui';

/** 대기실: 관측선 브리지. 참가자가 앉으면 좌석 표시등이 켜지고 통신선이 이어진다. */
export function Lobby({ game, send, onLeave, onHelp }: { game: Game; send: Send; onLeave: () => void; onHelp: () => void }) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const host = game.hostId === game.playerId; const me = game.players.find(p => p.id === game.playerId)!;
  const filled = game.players.length === game.maxPlayers; const allReady = game.players.every(p => p.ready);
  const copy = async () => { try { await navigator.clipboard?.writeText(game.code); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* 클립보드 불가 */ } };
  const share = async () => { // 모바일은 공유 시트, 그 외는 링크 복사
    const url = inviteLink(game.code);
    try { if (navigator.share) { await navigator.share({ title: '더 크루: 행성 9를 찾아서', text: `방 코드 ${game.code}`, url }); return; } await navigator.clipboard?.writeText(url); setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 1600); } catch { /* 공유 취소·불가 */ }
  };
  const state = (p: Game['players'][number]) => !p.connected ? ['off', '연결 끊김'] : p.ready ? ['on', '준비됨'] : ['wait', '준비 중'];
  const seats = Array.from({ length: game.maxPlayers }, (_, i) => game.players[i]);
  return <main className="lobby">
    <header className="lobby-top">
      <button type="button" className="bar-btn leave" onClick={onLeave}>나가기</button>
      <button type="button" className="code-btn" onClick={copy} aria-label={`방 코드 ${game.code}, 눌러서 복사`}><span>방 코드</span><b>{game.code}</b><small>{copied ? '복사됨' : '눌러서 복사'}</small></button>
      <button type="button" className="bar-btn round" onClick={onHelp} aria-label="도움말">?</button>
    </header>
    <section className="bridge-sec" aria-label="관측선 브리지">
      <h2>관측선 브리지 <small>{game.players.length}/{game.maxPlayers}</small></h2>
      <button type="button" className="invite-btn" onClick={share}>{linkCopied ? '✓ 초대 링크 복사됨' : '🔗 초대 링크 보내기'}</button>
      <div className="bridge" style={{ '--n': game.maxPlayers } as CSSProperties}>
        <ul className="chairs">{seats.map((p, i) => {
          const next = seats[i + 1]; const [st, word] = p ? state(p) : ['empty', '빈 좌석'];
          return <li key={i} className={`chair ${st} ${p?.id === game.playerId ? 'me' : ''}`}>
            <span className={`lamp ${st}`} aria-hidden="true" />
            <span className="head" aria-hidden="true" />
            {p ? <Avatar name={p.nickname} /> : <span className="avatar ghost" aria-hidden="true">+</span>}
            <b>{p ? <>{p.nickname}{p.isBot && ' 🤖'}</> : '빈 좌석'}</b>
            <small>{p ? <>{p.id === game.hostId && '방장 · '}{st === 'on' ? '●' : st === 'wait' ? '○' : '×'} {word}</> : '코드를 공유하세요'}</small>
            {host && p && p.id !== game.hostId && <button type="button" className="kick-crew" onClick={() => { if (window.confirm(`${p.nickname} 님을 대기실에서 내보낼까요?`)) send('PLAYER_KICK', { playerId: p.id }); }}>내보내기</button>}
            <i className={`stem ${p ? 'lit' : ''}`} aria-hidden="true" />
            {i < seats.length - 1 && <i className={`link ${p && next ? 'lit' : ''}`} aria-hidden="true" />}
          </li>;
        })}</ul>
        <div className="bus" aria-hidden="true" />
      </div>
    </section>
    <section className="logbook">
      <div className="map-panel"><h3>미션 지도 <small>{host ? '방장이 노드를 눌러 고릅니다' : '방장이 미션을 고르는 중'}</small></h3>
        <MissionMap current={game.missionId} onPick={host ? n => send('MISSION_SET', { missionId: n }) : undefined} /></div>
      <article className="paper sheet" aria-live="polite">
        <header><span>항해일지 · 미션 {game.missionId}</span><span className="mono">{String(game.missionId).padStart(2, '0')}/50</span></header>
        <p className="brief-label">{game.mission.label}</p><h3>{game.mission.text}</h3><Rules mission={game.mission} />
      </article>
    </section>
    <footer className="lobby-actions">
      {host ? <>{!filled && <button type="button" className="secondary bot-add" onClick={() => send('TEST_BOT_ADD')}>🤖 테스트 봇 추가</button>}<button type="button" className={`big ready ${me.ready ? 'active' : 'primary'}`} aria-pressed={me.ready} onClick={() => send('PLAYER_READY')}>{me.ready ? '준비 취소' : '준비 완료'}</button><button type="button" className="primary big" disabled={!filled || !allReady} onClick={() => send('GAME_START')}>미션 시작</button>
        <p>{!filled ? `모든 좌석(${game.maxPlayers}명)이 채워져야 해요.` : !allReady ? '모든 승무원의 준비를 기다리는 중…' : '출발 준비 완료'}</p></>
      : <><button type="button" className={`big ready ${me.ready ? 'active' : 'primary'}`} aria-pressed={me.ready} onClick={() => send('PLAYER_READY')}>{me.ready ? '준비 취소' : '준비 완료'}</button><p>방장이 시작하면 손패가 배정돼요.</p></>}
    </footer>
  </main>;
}
