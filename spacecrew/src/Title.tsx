import { useState, type FormEvent } from 'react';
import type { Request } from './types';
import { readNick, saveNick } from './lib';
import { Starfield } from './ui';
import { HeaderActions } from './HeaderActions';

/** 타이틀/참가: 관측창 너머 태양계 외곽. 방 만들기/참가는 한 카드 안에서 전환한다. */
export function Title({ request, onSession, onHelp }: { request: Request; onSession: (reply: unknown) => void; onHelp: () => void }) {
  const invite = (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase().slice(0, 6); // 초대 링크(?code=ABC123)
  const [mode, setMode] = useState<'create' | 'join'>(invite ? 'join' : 'create');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, unknown>; // 원본과 같은 페이로드(문자열)
    if (mode === 'join') form.code = String(form.code).toUpperCase();
    setBusy(true);
    try { const reply = await request(mode === 'create' ? 'ROOM_CREATE' : 'ROOM_JOIN', form); if (reply) { saveNick(String(form.nickname ?? '')); if (invite) window.history.replaceState(null, '', window.location.pathname); onSession(reply); } }
    catch { /* 오류 토스트는 App 에서 표시 */ }
    finally { setBusy(false); }
  };
  return <main className="title-scene">
    <HeaderActions onHelp={onHelp} title />
    <div className="window" role="img" aria-label="관측창 너머 태양계 외곽. 먼 곳에서 신호가 한 번 들어옵니다.">
      <Starfield scoped />
      <svg className="solar" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><radialGradient id="sun"><stop offset="0" stopColor="#ffe9a8" /><stop offset=".25" stopColor="#ffd36f" stopOpacity=".55" /><stop offset="1" stopColor="#ffd36f" stopOpacity="0" /></radialGradient></defs>
        <circle cx="70" cy="250" r="90" fill="url(#sun)" />
        {[120, 190, 270, 360, 470].map((r, i) => <ellipse key={r} cx="70" cy="250" rx={r} ry={r * 0.34} fill="none" stroke="#6f94cf" strokeOpacity={0.32 - i * 0.04} strokeDasharray={i > 2 ? '3 6' : undefined} />)}
        <circle cx="190" cy="214" r="2.2" fill="#c9a24e" /><circle cx="340" cy="298" r="3" fill="#72adff" /><circle cx="440" cy="224" r="2.4" fill="#9fd6ff" />
        <ellipse cx="70" cy="250" rx="640" ry="190" fill="none" stroke="#5ee6d3" strokeOpacity=".35" strokeDasharray="2 7" />
        <g className="pulse" transform="translate(690 142)"><circle className="r1" r="6" /><circle className="r2" r="6" /><circle className="r3" r="6" /><circle className="dot" r="3.2" /></g>
      </svg>
      <div className="window-text">
        <p className="rx">신호 수신 · 궤도 이상 9</p>
        <h1>더 크루</h1>
        <p className="sub">행성 9를 찾아서</p>
      </div>
    </div>
    <form className="join-card" onSubmit={submit}>
      <div className="seg" role="tablist" aria-label="입장 방식">
        <button type="button" role="tab" aria-selected={mode === 'create'} onClick={() => setMode('create')}>새 탐사대</button>
        <button type="button" role="tab" aria-selected={mode === 'join'} onClick={() => setMode('join')}>합류하기</button>
      </div>
      <label>내 호출명<input name="nickname" defaultValue={readNick()} maxLength={16} required placeholder={mode === 'create' ? '예: 루나' : '예: 솔'} autoComplete="nickname" /></label>
      {mode === 'create' ? <>
        <fieldset className="pick"><legend>승무원 수</legend>{[3, 4, 5].map(n => <label key={n}><input type="radio" name="maxPlayers" value={n} defaultChecked={n === 4} /><span>{n}명</span></label>)}</fieldset>
        <label>첫 미션<select name="missionId" defaultValue="1">{Array.from({ length: 50 }, (_, i) => <option key={i} value={i + 1}>미션 {i + 1}</option>)}</select></label>
      </> : <label>방 코드<input name="code" defaultValue={invite} maxLength={6} required className="code-input" placeholder="ABC123" autoCapitalize="characters" autoComplete="off" /></label>}
      <button className="primary big" disabled={busy}>{mode === 'create' ? '탐사대 만들기' : '방에 합류하기'}</button>
      <p className="foot">3–5명의 승무원 · 총 50개 미션 · 손패는 나만 볼 수 있어요</p>
    </form>
  </main>;
}
