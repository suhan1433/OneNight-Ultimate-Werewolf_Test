import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import type { AbilityId, Affiliation, ClientGameState, Token } from '@bloodbound/shared';
import { useGame } from './store';
import { emit, saveSession } from './socket';
import './styles.css';

/* ───────────── 타입 · 상수 · 헬퍼 ───────────── */

type Game = ClientGameState;
type Player = Game['players'][number];
type Character = NonNullable<Game['privateCharacter']>;

const NICK_KEY = 'bloodbound-nickname';
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
};
const toast = (message: string) => useGame.getState().setError(message);
const errorText = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.');

const CLAN: Record<string, { name: string; icon: string; glyph: string }> = {
  rose: { name: '장미', icon: '✦', glyph: '♕' },
  beast: { name: '야수', icon: '♜', glyph: '♞' },
  secret: { name: '비밀 결사', icon: '✥', glyph: '✥' },
};
const clanName = (c: string) => CLAN[c]?.name ?? c;
const clanIcon = (c: string) => CLAN[c]?.icon ?? '✥';

const AFF: Record<string, { icon: string; name: string }> = {
  rose: { icon: '🌹', name: '장미' },
  beast: { icon: '🐺', name: '야수' },
  unknown: { icon: '?', name: '불명' },
};
const aff = (v: string) => AFF[v] ?? AFF.unknown!;
const rankText = (v: unknown) => (v === 'fleur' ? '⚜' : String(v));

const abilityNames: Record<AbilityId, string> = {
  elder: '깃펜 (Quill)',
  assassin: '암살자 (Assassin)',
  harlequin: '광대 (Harlequin)',
  alchemist: '연금술사 (Alchemist)',
  mentalist: '멘탈리스트 (Mentalist)',
  guardian: '수호자 (Guardian)',
  berserker: '광전사 (Berserker)',
  mage: '마법사 (Mage)',
  courtesan: '코르티잔 (Courtesan)',
  inquisitor: '저주 배분 (Curse Distribution)',
};

const PHASE: Record<string, string> = {
  action: '행동',
  intervention_offer: '개입 제안',
  intervention_decide: '개입 결정',
  token_select: '토큰 공개',
  ability_decide: '능력 선택',
  ability_input: '능력 사용',
};

/** 요청 중 중복 클릭 방지 + 실패 시 토스트. 성공 여부를 돌려준다. */
function useCall() {
  const [busy, setBusy] = useState(false);
  const run = async (name: string, data: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(true);
    try {
      await emit(name, data);
      return true;
    } catch (e) {
      toast(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** 보드의 좌석 하이라이트용. 대상 선택기가 선택 중인 id를 알려준다. */
const FocusCtx = createContext<(ids: string[]) => void>(() => {});

/* ───────────── 공통 컴포넌트 ───────────── */

function Brand({ compact }: { compact?: boolean }) {
  return (
    <header className={`brand ${compact ? 'compact' : ''}`}>
      <span aria-hidden="true">✦</span>
      <h1>BLOOD BOUND</h1>
      {!compact && <small>장미와 야수, 그리고 비밀 결사</small>}
    </header>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current?.();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="sheet-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header>
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
              ×
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="게임 안내" onClose={onClose}>
      <p className="lead">상대 클랜의 리더를 포획하면 이겨요.</p>
      <h3>진행 순서</h3>
      <ol className="flow">
        <li>
          <b>정체 확인</b>
          <span>나만 볼 수 있는 가면(캐릭터)을 확인해요.</span>
        </li>
        <li>
          <b>단서 확인</b>
          <span>왼쪽 이웃이 건넨 단서를 받아요. 실제 소속과 다를 수 있어요.</span>
        </li>
        <li>
          <b>단검 차례</b>
          <span>단검을 가진 사람이 누군가를 공격하거나 단검을 넘겨요.</span>
        </li>
        <li>
          <b>개입</b>
          <span>공격받는 사람을 대신하겠다고 제안할 수 있고, 공격받는 사람이 수락 여부를 정해요.</span>
        </li>
        <li>
          <b>토큰 공개</b>
          <span>상처를 받으면 토큰을 공개해요. 랭크 토큰을 공개하면 능력을 쓸 수 있어요.</span>
        </li>
      </ol>
      <h3>기호</h3>
      <dl className="legend">
        <dt>🌹 🐺 ?</dt>
        <dd>장미 · 야수 · 불명 (소속)</dd>
        <dt>● ○</dt>
        <dd>상처 칸. 채워진 만큼 상처를 받았어요</dd>
        <dt>⬡ † ϟ ◒ ✒</dt>
        <dd>방패 · 검 · 지팡이 · 부채 · 깃펜 (장비)</dd>
        <dt>†</dt>
        <dd>좌석 위의 † 표시는 단검을 가진 사람이에요</dd>
      </dl>
    </Sheet>
  );
}

/** 카드 뒤집기. 주변 시선을 피할 수 있도록 기본은 가려진 상태. */
function Flip({
  shown,
  onToggle,
  hint,
  children,
}: {
  shown: boolean;
  onToggle: () => void;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className={`flip ${shown ? 'shown' : ''}`}>
      <div className="face back" aria-hidden={shown} onClick={shown ? undefined : onToggle}>
        <span aria-hidden="true">✦</span>
        <b>{hint}</b>
      </div>
      <div className="face front" aria-hidden={!shown}>
        {children}
      </div>
    </div>
  );
}

/** 열람 전용(상태 보관). 내 정체 다시 보기, 광대 능력에서 사용 */
function Peek({ character }: { character: Character }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="peek">
      <Flip shown={shown} onToggle={() => setShown(true)} hint="탭해서 확인">
        <CharacterCard character={character} />
      </Flip>
      <button type="button" className="ghost" onClick={() => setShown(s => !s)}>
        {shown ? '가리기' : '카드 보기'}
      </button>
    </div>
  );
}

function CharacterCard({ character }: { character: Character }) {
  return (
    <article className={`character-card ${character.clan}`}>
      <div className="card-top">
        <span aria-hidden="true">{clanIcon(character.clan)}</span>
        <b>{clanName(character.clan)}</b>
        <strong aria-label={`랭크 ${character.rank ?? '없음'}`}>{character.rank ?? '✥'}</strong>
      </div>
      <div className="silhouette" aria-hidden="true">
        {CLAN[character.clan]?.glyph ?? '✥'}
      </div>
      <h2>{character.name}</h2>
      <p className="card-aff">
        {character.affiliations.map((item, index) => (
          <span className="aff" key={index}>
            <i aria-hidden="true">{aff(item).icon}</i>
            <em>{aff(item).name}</em>
          </span>
        ))}
      </p>
      <small className="card-clue">전달되는 단서 {aff(character.clue).icon} {aff(character.clue).name}</small>
      <footer>{abilityNames[character.ability]}</footer>
    </article>
  );
}

/* ───────────── 홈 ───────────── */

function Home({ onHelp }: { onHelp: () => void }) {
  const link = useGame(s => s.link);
  const urlRoom =
    new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '';
  const [mode, setMode] = useState<'create' | 'join'>(urlRoom ? 'join' : 'create');
  const [nickname, setNickname] = useState(() => read(NICK_KEY) ?? '');
  const [roomCode, setRoomCode] = useState(urlRoom);
  const [count, setCount] = useState(6);
  const [seed, setSeed] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const nickError = tried && !nickname.trim() ? '이름을 입력해 주세요.' : '';
  const roomError = tried && mode === 'join' && roomCode.length < 6 ? '방 코드 6자리를 입력해 주세요.' : '';
  const online = link === 'online';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const name = nickname.trim();
    if (!name || (mode === 'join' && roomCode.length < 6) || busy) return;
    setBusy(true);
    write(NICK_KEY, name);
    try {
      saveSession(
        mode === 'create'
          ? await emit('ROOM_CREATE', { nickname: name, maxPlayers: count, seed: Number(seed) || Date.now() })
          : await emit('ROOM_JOIN', { nickname: name, roomCode }),
      );
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const label = !online
    ? link === 'connecting'
      ? '서버에 연결하는 중…'
      : '연결을 기다리는 중…'
    : busy
      ? '잠시만요…'
      : mode === 'create'
        ? '방 만들기'
        : '방에 입장';

  return (
    <main className="home">
      <div className="orb rose-orb" />
      <div className="orb beast-orb" />
      <header>
        <span className="sigil" aria-hidden="true">
          ✦
        </span>
        <h1>
          BLOOD
          <br />
          <i>BOUND</i>
        </h1>
        <p>가면 뒤에 숨은 두 불멸 클랜의 암투</p>
      </header>

      <form className="gate" onSubmit={submit} noValidate>
        <div className="tabs" role="tablist" aria-label="입장 방식">
          <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>
            새 방 만들기
          </button>
          <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>
            방 코드로 참가
          </button>
        </div>

        <label className="field">
          <span>이름</span>
          <input
            value={nickname}
            maxLength={16}
            autoComplete="nickname"
            enterKeyHint={mode === 'join' ? 'next' : 'done'}
            aria-invalid={!!nickError}
            onChange={e => setNickname(e.target.value)}
            placeholder="다른 사람에게 보일 이름"
          />
          {nickError && <small className="field-error" role="alert">{nickError}</small>}
        </label>

        {mode === 'create' ? (
          <>
            <fieldset className="field">
              <legend>참가 인원 <em>방장 포함</em></legend>
              <div className="count">
                {[6, 7, 8, 9, 10, 11, 12].map(n => (
                  <button type="button" key={n} aria-pressed={count === n} className={count === n ? 'selected' : ''} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
            <details className="advanced">
              <summary>고급 설정</summary>
              <label className="field">
                <span>게임 번호(시드) <em>선택</em></span>
                <input value={seed} inputMode="numeric" onChange={e => setSeed(e.target.value.replace(/\D/g, ''))} placeholder="같은 배정을 다시 하고 싶을 때" />
              </label>
            </details>
          </>
        ) : (
          <label className="field">
            <span>방 코드</span>
            <input
              className="code-input"
              value={roomCode}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!roomError}
              onChange={e => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABC123"
            />
            {roomError && <small className="field-error" role="alert">{roomError}</small>}
          </label>
        )}

        <button type="submit" className="primary wide" disabled={!online || busy}>
          {label}
        </button>
      </form>

      <p className="hint">6–12명 · 같은 방 코드로 모여 함께 플레이해요</p>
      <button type="button" className="link-btn" onClick={onHelp}>
        처음이신가요? 게임 안내 보기
      </button>
    </main>
  );
}

/* ───────────── 로비 ───────────── */

function Lobby({ game }: { game: Game }) {
  const { busy, run } = useCall();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const me = game.players.find(p => p.id === game.playerId);
  const host = game.hostId === game.playerId;
  const missing = game.maxPlayers - game.players.length;
  const notReady = game.players.filter(p => !p.ready).map(p => p.nickname);
  const readyCount = game.players.length - notReady.length;
  const canStart = missing === 0 && notReady.length === 0;
  const link = `${location.origin}${location.pathname}?room=${game.roomCode}`;

  const reason =
    missing > 0
      ? `${missing}명이 더 들어와야 시작할 수 있어요.`
      : notReady.length > 0
        ? `${notReady.slice(0, 3).join(', ')}${notReady.length > 3 ? ` 외 ${notReady.length - 3}명` : ''}님이 아직 준비하지 않았어요.`
        : '모두 준비됐어요. 지금 시작할 수 있어요.';

  const copy = async (kind: 'code' | 'link') => {
    try {
      if (kind === 'link' && navigator.share) {
        await navigator.share({ title: 'Blood Bound', text: `방 코드 ${game.roomCode}`, url: link });
        return;
      }
      await navigator.clipboard.writeText(kind === 'code' ? game.roomCode : link);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast('복사하지 못했어요. 코드를 직접 선택해 주세요.');
    }
  };

  return (
    <main className="lobby">
      <Brand />
      <section className="room-code" aria-label="방 코드">
        <span className="label">방 코드</span>
        <strong>{game.roomCode}</strong>
        <div className="code-actions">
          <button type="button" onClick={() => copy('code')}>{copied === 'code' ? '복사했어요 ✓' : '코드 복사'}</button>
          <button type="button" onClick={() => copy('link')}>{copied === 'link' ? '복사했어요 ✓' : '초대 링크'}</button>
        </div>
      </section>

      <h2>
        가면무도회에 모인 사람들 <span className="progress">준비 {readyCount}/{game.maxPlayers}</span>
      </h2>
      <div className="roster">
        {game.players.map((p, index) => (
          <article key={p.id} className={`${p.id === game.playerId ? 'me' : ''} ${p.connected ? '' : 'off'}`}>
            <b>{index + 1}</b>
            <span className="name">
              {p.nickname}
              {p.id === game.hostId && <em className="tag">방장</em>}
              {p.id === game.playerId && <em className="tag me-tag">나</em>}
            </span>
            <i className={p.connected ? 'on' : ''} aria-label={p.connected ? '접속 중' : '접속 끊김'}>{p.connected ? '●' : '○'}</i>
            <small className={p.ready ? 'ok' : ''}>{!p.connected ? '접속이 끊겼어요' : p.ready ? '✓ 준비 완료' : '준비 중…'}</small>
          </article>
        ))}
        {Array.from({ length: Math.max(0, missing) }, (_, i) => (
          <article className="empty" key={i}>
            <span>빈 좌석 · 코드를 공유해 주세요</span>
          </article>
        ))}
      </div>

      <div className="lobby-actions">
        <button
          type="button"
          className={me?.ready ? 'ready on' : 'ready primary'}
          aria-pressed={!!me?.ready}
          disabled={busy || !me}
          onClick={() => run('PLAYER_READY', { roomCode: game.roomCode })}
        >
          {me?.ready ? '준비 취소' : '준비 완료'}
        </button>
        {host && (
          <button type="button" className="primary" disabled={!canStart || busy} onClick={() => run('GAME_START', { roomCode: game.roomCode })}>
            게임 시작
          </button>
        )}
      </div>
      <p className="reason" aria-live="polite">
        {host ? reason : '방장이 게임을 시작하면 가면이 배분돼요.'}
      </p>
      <p className="hint">좌석은 입장 순서대로 시계 방향으로 이어져요. 단서는 왼쪽 이웃에게서 받아요.</p>
    </main>
  );
}

/* ───────────── 정체 · 단서 확인 ───────────── */

function Reveal({ game }: { game: Game }) {
  const { busy, run } = useCall();
  const isRole = game.phase === 'role_reveal';
  const char = game.privateCharacter;
  const clue = game.visibleClue;
  const [shown, setShown] = useState(false);
  const [seen, setSeen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const from = game.players.find(p => p.id === clue?.fromPlayerId)?.nickname;
  const toggle = () => {
    setShown(s => !s);
    setSeen(true);
  };
  const confirm = async () => {
    setConfirmed(true);
    setShown(false);
    if (!(await run(isRole ? 'ROLE_CONFIRM' : 'CLUE_CONFIRM', { roomCode: game.roomCode }))) setConfirmed(false);
  };
  const info = aff(clue?.clue ?? 'unknown');

  return (
    <main className="reveal">
      <Brand compact />
      <section>
        <ol className="steps" aria-label="진행 단계">
          <li className={isRole ? 'now' : 'done'}>내 정체</li>
          <li className={isRole ? '' : 'now'}>받은 단서</li>
        </ol>
        <h2 className="reveal-title">{isRole ? '당신에게만 보이는 정체' : `${from ?? '이웃'}님이 건넨 단서`}</h2>
        <p className="reveal-sub">{isRole ? '주변 사람이 화면을 보지 못하게 한 뒤 카드를 뒤집어 주세요.' : '왼쪽 이웃에게서 받은 단서예요.'}</p>

        <Flip shown={shown} onToggle={toggle} hint={isRole ? '탭해서 정체 확인' : '탭해서 단서 확인'}>
          {isRole ? (
            char && <CharacterCard character={char} />
          ) : (
            <div className={`clue ${clue?.clue ?? ''}`}>
              <span aria-hidden="true">{info.icon}</span>
              <h3>{info.name} 단서</h3>
              <p>이 단서는 실제 소속과 다를 수 있어요.</p>
            </div>
          )}
        </Flip>

        {confirmed ? (
          <p className="wait-note" role="status">확인했어요. 다른 플레이어를 기다리는 중이에요…</p>
        ) : (
          <>
            <div className="reveal-actions">
              <button type="button" onClick={toggle}>{shown ? '다시 가리기' : isRole ? '카드 뒤집기' : '단서 보기'}</button>
              <button type="button" className="primary" disabled={!seen || busy} onClick={confirm}>
                {isRole ? '정체를 확인했어요' : '단서를 확인했어요'}
              </button>
            </div>
            {!seen && <p className="hint">먼저 {isRole ? '카드를' : '단서를'} 확인해 주세요.</p>}
          </>
        )}
      </section>
    </main>
  );
}

/* ───────────── 대상 선택 (선택 → 확정 2단계) ───────────── */

function Picker({
  game,
  filter,
  count = 1,
  confirmLabel,
  onConfirm,
  tone = 'primary',
  badge,
  busy,
  onBack,
}: {
  game: Game;
  filter?: (p: Player) => boolean;
  count?: number;
  confirmLabel: (names: string[]) => string;
  onConfirm: (ids: string[]) => void;
  tone?: 'primary' | 'danger';
  badge?: (index: number) => string;
  busy?: boolean;
  onBack?: () => void;
}) {
  const setFocus = useContext(FocusCtx);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => {
    setFocus(sel);
    return () => setFocus([]);
  }, [sel, setFocus]);

  const list = game.players.filter(filter ?? (p => p.id !== game.playerId));
  const toggle = (id: string) =>
    setSel(old => (old.includes(id) ? old.filter(x => x !== id) : count === 1 ? [id] : old.length < count ? [...old, id] : old));
  const names = sel.map(id => game.players.find(p => p.id === id)?.nickname ?? '');
  const ready = sel.length === count;

  return (
    <>
      {list.length === 0 ? (
        <p className="empty-note">아직 선택할 수 있는 사람이 없어요.</p>
      ) : (
        <div className="target-list">
          {list.map(p => {
            const on = sel.includes(p.id);
            return (
              <button type="button" key={p.id} className={`chip ${on ? 'chosen' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)}>
                <span className="avatar" aria-hidden="true">{p.nickname.slice(0, 1)}</span>
                <span className="chip-name">{p.nickname}</span>
                <span className="mini-wounds" aria-label={`상처 ${p.wounds}개`}>
                  {[0, 1, 2, 3].map(i => <i key={i} className={p.wounds > i ? 'filled' : ''} />)}
                </span>
                {on && badge && <em className="badge">{badge(sel.indexOf(p.id))}</em>}
              </button>
            );
          })}
        </div>
      )}
      {count > 1 && <p className="count-note">{sel.length}/{count}명 선택</p>}
      <div className="confirm-row">
        {onBack && <button type="button" className="ghost" onClick={onBack}>뒤로</button>}
        <button type="button" className={tone} disabled={!ready || busy} onClick={() => onConfirm(sel)}>
          {ready ? confirmLabel(names) : count === 1 ? '대상을 선택하세요' : `${count}명을 선택하세요`}
        </button>
      </div>
    </>
  );
}

function TokenPick({ game }: { game: Game }) {
  const { busy, run } = useCall();
  const [picked, setPicked] = useState<number | null>(null);
  const character = game.privateCharacter;
  const self = game.players.find(p => p.id === game.playerId);
  if (!character || !self) return null;

  const rank: Token = { kind: 'rank', value: character.clan === 'secret' ? 'fleur' : character.rank! };
  const affs: Affiliation[] = character.clan === 'secret' ? ['rose', 'beast', 'unknown'] : character.affiliations;
  const candidates: Token[] = [];
  if (!self.tokens.some(t => t.kind === 'rank')) candidates.push(rank);
  for (const value of [...new Set(affs)]) {
    const allowed = character.clan === 'secret' ? 2 : affs.filter(x => x === value).length;
    const have = self.tokens.filter(t => t.kind === 'affiliation' && t.value === value).length;
    if (have < allowed && !(self.equipment.staffs > 0 && value !== 'unknown')) candidates.push({ kind: 'affiliation', value });
  }
  if (candidates.length === 0) return <p className="empty-note">공개할 수 있는 토큰이 없어요.</p>;

  return (
    <>
      <div className="choices">
        {candidates.map((token, i) => (
          <button type="button" key={i} className={`choice ${picked === i ? 'chosen' : ''}`} aria-pressed={picked === i} onClick={() => setPicked(i)}>
            {token.kind === 'rank' ? (
              <>
                <b aria-hidden="true">{rankText(token.value)}</b>
                <span>랭크 토큰</span>
                <small>공개하면 능력을 쓸 수 있어요</small>
              </>
            ) : (
              <>
                <b aria-hidden="true">{aff(String(token.value)).icon}</b>
                <span>소속 · {aff(String(token.value)).name}</span>
                <small>소속을 공개해요</small>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="confirm-row">
        <button
          type="button"
          className="primary"
          disabled={picked === null || busy}
          onClick={() => picked !== null && run('TOKEN_SELECT', { roomCode: game.roomCode, token: candidates[picked] })}
        >
          {picked === null ? '공개할 토큰을 고르세요' : '이 토큰 공개하기'}
        </button>
      </div>
    </>
  );
}

function AbilityInput({ game, ability }: { game: Game; ability: AbilityId }) {
  const { busy, run } = useCall();
  const submit = (kind: string, extra: Record<string, unknown>) => run('ABILITY_INPUT', { roomCode: game.roomCode, kind, ...extra });

  if (ability === 'alchemist')
    return (
      <div className="actions two">
        <button type="button" disabled={busy} onClick={() => submit('alchemist_effect', { targetIds: [], choice: 'wound' })}>원래 대상에게 상처 +1</button>
        <button type="button" disabled={busy} onClick={() => submit('alchemist_effect', { targetIds: [], choice: 'heal' })}>원래 대상 치유</button>
      </div>
    );

  if (ability === 'harlequin')
    return (
      <>
        <p>서로 다른 두 명을 골라 가면을 몰래 확인해요.</p>
        <Picker game={game} count={2} busy={busy} confirmLabel={n => `${n.join(', ')}님 비공개 확인`} onConfirm={ids => submit('harlequin_targets', { targetIds: ids })} />
      </>
    );

  if (ability === 'inquisitor') return <CurseInput game={game} />;

  const kind: Partial<Record<AbilityId, string>> = {
    assassin: 'assassin_target',
    mentalist: 'mentalist_target',
    guardian: 'guardian_target',
    mage: 'mage_target',
    courtesan: 'courtesan_target',
  };
  const k = kind[ability];
  if (!k) return <p className="empty-note">이 능력은 추가로 입력할 내용이 없어요.</p>;
  return (
    <Picker
      game={game}
      busy={busy}
      filter={p => ability === 'assassin' || p.id !== game.playerId}
      confirmLabel={n => `${n[0]}님 지정하기`}
      onConfirm={ids => submit(k, { targetIds: ids })}
    />
  );
}

function CurseInput({ game }: { game: Game }) {
  const { busy, run } = useCall();
  const curseCount = Math.floor((game.maxPlayers - 1) / 2);
  return (
    <>
      <p>{curseCount}명에게 저주를 나눠요. 가장 먼저 고른 사람이 진짜 저주(True Curse)를 받아요.</p>
      <Picker
        game={game}
        count={curseCount}
        busy={busy}
        badge={i => (i === 0 ? '진짜 저주' : '가짜 저주')}
        confirmLabel={() => '저주 배분하기'}
        onConfirm={ids =>
          run('ABILITY_INPUT', {
            roomCode: game.roomCode,
            kind: 'inquisitor_curses',
            targetIds: ids,
            curses: Object.fromEntries(ids.map((id, index) => [id, index === 0 ? 'true' : 'false'])),
          })
        }
      />
    </>
  );
}

/* ───────────── 보드 ───────────── */

function ActionPanel({ game, needsMe }: { game: Game; needsMe: boolean }) {
  const { busy, run } = useCall();
  const [mode, setMode] = useState<'attack' | 'pass' | null>(null);
  useEffect(() => {
    setMode(null);
  }, [game.phase, game.daggerHolderId]);

  const room = game.roomCode;
  const pending = game.pendingAbility;
  const nameOf = (id?: string) => game.players.find(p => p.id === id)?.nickname ?? '누군가';
  const holder = nameOf(game.daggerHolderId);

  let title = '다른 플레이어를 기다리는 중';
  let body: ReactNode = (
    <p>
      {game.phase === 'action'
        ? `${holder}님이 공격하거나 단검을 넘길 차례예요.`
        : game.phase === 'intervention_decide'
          ? '공격받는 사람이 개입 여부를 정하고 있어요.'
          : game.phase === 'token_select'
            ? '상처를 받은 사람이 공개할 토큰을 고르고 있어요.'
            : (game.phase === 'ability_decide' || game.phase === 'ability_input') && pending
              ? `${nameOf(pending.actorId)}님이 ${abilityNames[pending.ability]} 능력을 처리하고 있어요.`
              : '곧 내 차례가 올 수 있어요. 이 화면을 켜 두세요.'}
    </p>
  );

  if (game.phase === 'action' && game.permittedActions.includes('ATTACK')) {
    title = '당신의 차례';
    body =
      mode === null ? (
        <>
          <p>공격하거나, 단검을 다른 사람에게 넘기세요.</p>
          <div className="actions two">
            <button type="button" onClick={() => setMode('pass')}>단검 넘기기</button>
            <button type="button" className="danger" onClick={() => setMode('attack')}>공격하기</button>
          </div>
        </>
      ) : (
        <Picker
          key={mode}
          game={game}
          tone={mode === 'attack' ? 'danger' : 'primary'}
          busy={busy}
          onBack={() => setMode(null)}
          confirmLabel={n => (mode === 'attack' ? `${n[0]}님 공격하기` : `${n[0]}님에게 단검 넘기기`)}
          onConfirm={ids => run(mode === 'attack' ? 'ATTACK' : 'PASS', { roomCode: room, targetId: ids[0] })}
        />
      );
  } else if ((game.phase === 'intervention_offer' || game.phase === 'intervention_decide') && game.permittedActions.includes('INTERVENE_DECIDE')) {
    title = '개입을 수락할까요?';
    body = (
      <>
        <p>개입을 제안한 사람을 수락하거나, 모두 거절하고 직접 상처를 받으세요.</p>
        <Picker
          game={game}
          busy={busy}
          filter={p => !!game.offers?.includes(p.id)}
          confirmLabel={n => `${n[0]}님의 개입 수락`}
          onConfirm={ids => run('INTERVENE_DECIDE', { roomCode: room, intervenerId: ids[0] })}
        />
        <button type="button" className="ghost wide" disabled={busy} onClick={() => run('INTERVENE_DECIDE', { roomCode: room })}>
          모두 거절하고 직접 받기
        </button>
      </>
    );
  } else if (game.phase === 'intervention_offer') {
    title = '개입 제안';
    body = game.permittedActions.includes('INTERVENE_OFFER') ? (
      <>
        <p>공격받는 사람을 대신하고 싶다면 제안하세요. 수락 여부는 공격받는 사람이 정해요.</p>
        <button type="button" className="primary wide" disabled={busy} onClick={() => run('INTERVENE_OFFER', { roomCode: room })}>
          내가 개입할게요
        </button>
      </>
    ) : (
      <p>공격받는 사람이 제안을 기다리고 있어요. 지금까지 {game.offers?.length ?? 0}명이 제안했어요.</p>
    );
  } else if (game.phase === 'token_select' && game.permittedActions.includes('TOKEN_SELECT')) {
    title = '공개할 토큰 선택';
    body = <TokenPick game={game} />;
  } else if (game.phase === 'ability_decide' && pending?.actorId === game.playerId) {
    title = `${abilityNames[pending.ability]} 능력`;
    body = (
      <>
        <p>랭크 토큰을 공개했어요. 능력을 사용할까요?</p>
        <div className="actions two">
          <button type="button" disabled={busy} onClick={() => run('ABILITY_DECIDE', { roomCode: room, use: false })}>사용 안 함</button>
          <button type="button" className="primary" disabled={busy} onClick={() => run('ABILITY_DECIDE', { roomCode: room, use: true })}>능력 사용</button>
        </div>
      </>
    );
  } else if (game.phase === 'ability_input' && pending?.actorId === game.playerId) {
    title = `${abilityNames[pending.ability]} · 대상 선택`;
    body = <AbilityInput game={game} ability={pending.ability} />;
  }

  return (
    <div className="dock">
      <section className={`action-panel ${needsMe ? 'mine' : 'waiting'}`} aria-label="행동">
        <small className="phase-label">{PHASE[game.phase] ?? '진행 중'} 단계</small>
        <h2 aria-live="polite">{title}</h2>
        {body}
      </section>
    </div>
  );
}

function Seat({ game, p, angle, focused }: { game: Game; p: Player; angle: number; focused: boolean }) {
  const active = game.daggerHolderId === p.id;
  const self = p.id === game.playerId;
  return (
    <article
      className={`seat ${active ? 'active' : ''} ${self ? 'self' : ''} ${focused ? 'focus' : ''} ${p.connected ? '' : 'offline'}`}
      style={{ '--a': `${angle}deg` } as CSSProperties}
      aria-label={`${p.nickname}${self ? ' (나)' : ''}, 상처 ${p.wounds}개${active ? ', 단검 보유' : ''}${p.connected ? '' : ', 접속 끊김'}`}
    >
      <div className="seat-face">
        {active && <b className="dagger" aria-hidden="true">†</b>}
        <span aria-hidden="true">{p.nickname.slice(0, 1)}</span>
      </div>
      <strong>{p.nickname}</strong>
      {self && <em className="me-tag">나</em>}
      {!p.connected && <em className="off-tag">끊김</em>}
      <div className="wounds" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <i key={i} className={p.wounds > i ? 'filled' : ''} />)}
      </div>
      <div className="tokens" aria-hidden="true">
        {p.tokens.map((token, i) => <b key={i}>{token.kind === 'rank' ? rankText(token.value) : aff(String(token.value)).icon}</b>)}
      </div>
      <div className="gear" aria-hidden="true">
        {p.equipment.shields.length > 0 && <i title="방패">⬡</i>}
        {p.equipment.swords.length > 0 && <i title="검">†</i>}
        {p.equipment.staffs > 0 && <i title="지팡이">ϟ</i>}
        {p.equipment.fans > 0 && <i title="부채">◒</i>}
        {p.equipment.quill && <i title="깃펜">✒</i>}
      </div>
    </article>
  );
}

function Board({ game }: { game: Game }) {
  const [focus, setFocus] = useState<string[]>([]);
  const [cardOpen, setCardOpen] = useState(false);
  const pending = game.pendingAbility;
  const myTurn = game.daggerHolderId === game.playerId;
  const holder = game.players.find(p => p.id === game.daggerHolderId)?.nickname;
  const selfIndex = Math.max(0, game.players.findIndex(p => p.id === game.playerId));
  const harlequinCards = game.harlequinCards ?? [];
  const latest = game.publicLog[game.publicLog.length - 1];
  const needsMe =
    game.permittedActions.some(a => a !== 'INTERVENE_OFFER') ||
    (pending?.actorId === game.playerId && (game.phase === 'ability_decide' || game.phase === 'ability_input'));

  const prev = useRef(false);
  const baseTitle = useRef(document.title);
  useEffect(() => {
    if (needsMe && !prev.current) navigator.vibrate?.(80);
    prev.current = needsMe;
    document.title = needsMe ? `● 내 차례 · ${baseTitle.current}` : baseTitle.current;
    return () => {
      document.title = baseTitle.current;
    };
  }, [needsMe]);

  return (
    <FocusCtx.Provider value={setFocus}>
      <main className="board">
        <header className="board-head">
          <button type="button" className="peek-btn" onClick={() => setCardOpen(true)} disabled={!game.privateCharacter}>
            내 정체
          </button>
          <Brand compact />
          <span />
        </header>

        <section className="table" aria-label="연회 테이블">
          <div className="table-core">
            <span>{PHASE[game.phase] ?? '진행 중'}</span>
            <b>{myTurn ? '당신의 차례' : holder ? `${holder}님의 차례` : '진행 중'}</b>
            <small>{game.attack ? '공격이 선언되었어요' : '상대 클랜의 리더를 포획하세요'}</small>
          </div>
          {game.players.map((p, index) => (
            <Seat
              key={p.id}
              game={game}
              p={p}
              focused={focus.includes(p.id)}
              /* 내 좌석이 항상 화면 아래(90°)에 오고, 시계 방향으로 이어진다 */
              angle={(((index - selfIndex + game.players.length) % game.players.length) / game.players.length) * 360 + 90}
            />
          ))}
        </section>

        {latest && <p className="ticker" aria-live="polite">{latest.message}</p>}

        <ActionPanel game={game} needsMe={needsMe} />

        <details className="log">
          <summary>공개 기록 전체 보기</summary>
          {game.publicLog.slice().reverse().slice(0, 15).map(item => <p key={item.id}>{item.message}</p>)}
        </details>

        {cardOpen && game.privateCharacter && (
          <Sheet title="내 정체" onClose={() => setCardOpen(false)}>
            <p className="lead">다른 사람이 볼 수 없는지 확인한 뒤 카드를 열어 주세요.</p>
            <Peek character={game.privateCharacter} />
          </Sheet>
        )}

        {harlequinCards.length > 0 && (
          <Sheet title="광대가 몰래 확인한 두 가면">
            <p className="lead">카드를 각각 열어 확인하고, 기억했다면 닫아 주세요.</p>
            <div className="private-read">
              {harlequinCards.map((card, index) => <Peek character={card} key={index} />)}
            </div>
            <HarlequinAck game={game} />
          </Sheet>
        )}
      </main>
    </FocusCtx.Provider>
  );
}

function HarlequinAck({ game }: { game: Game }) {
  const { busy, run } = useCall();
  return (
    <button type="button" className="primary wide" disabled={busy} onClick={() => run('HARLEQUIN_ACK', { roomCode: game.roomCode })}>
      기억했어요 · 가리기
    </button>
  );
}

/* ───────────── 결과 ───────────── */

function Result({ game }: { game: Game }) {
  const { busy, run } = useCall();
  const result = game.result;
  if (!result) return null;
  const host = game.hostId === game.playerId;
  return (
    <main className="result">
      <Brand />
      <section className={`victory ${result.winningClan}`} role="status">
        <span aria-hidden="true">{clanIcon(result.winningClan)}</span>
        <h2>{clanName(result.winningClan)} 승리</h2>
        <p>{result.victoryReason}</p>
      </section>
      <h2 className="section-title">가면이 벗겨졌어요</h2>
      <div className="revealed">
        {game.revealedCharacters?.map(p => {
          const mine = p.id === game.playerId;
          return (
            <article key={p.id} className={`${p.character.clan} ${mine ? 'me' : ''}`}>
              <b>{game.players.find(x => x.id === p.id)?.nickname}{mine && <em className="tag me-tag">나</em>}</b>
              <span>{clanIcon(p.character.clan)} {p.character.rank ?? '✥'} {p.character.name}</span>
              {p.curse && <small>{String(p.curse) === 'true' ? '진짜 저주' : String(p.curse) === 'false' ? '가짜 저주' : `저주: ${String(p.curse)}`}</small>}
            </article>
          );
        })}
      </div>
      {host ? (
        <button type="button" className="primary wide" disabled={busy} onClick={() => run('GAME_RESTART', { roomCode: game.roomCode })}>
          같은 멤버로 다시 하기
        </button>
      ) : (
        <p className="hint">방장이 다시 시작하기를 기다리는 중이에요.</p>
      )}
    </main>
  );
}

/* ───────────── 앱 ───────────── */

function App() {
  const game = useGame(s => s.game);
  const error = useGame(s => s.error);
  const link = useGame(s => s.link);
  const restoring = useGame(s => s.restoring);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    document.documentElement.lang = 'ko';
  }, []);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => useGame.getState().setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!restoring) return;
    const t = setTimeout(() => useGame.getState().setRestoring(false), 7000);
    return () => clearTimeout(t);
  }, [restoring]);

  let page: ReactNode;
  if (game) {
    if (game.phase === 'lobby') page = <Lobby game={game} />;
    else if (game.phase === 'role_reveal' || game.phase === 'clue_reveal') page = <Reveal key={game.phase} game={game} />;
    else if (game.phase === 'result') page = <Result game={game} />;
    else page = <Board game={game} />;
  } else if (restoring) {
    page = (
      <main className="splash" role="status">
        <span aria-hidden="true">✦</span>
        <p>연회장으로 돌아가는 중이에요…</p>
      </main>
    );
  } else {
    page = <Home onHelp={() => setHelp(true)} />;
  }

  return (
    <>
      {link === 'offline' && (
        <div className="banner" role="status">연결이 끊겼어요. 다시 연결하는 중이에요. 잠시 후 자동으로 이어져요.</div>
      )}
      {page}
      <button type="button" className="help-fab" aria-label="게임 안내" onClick={() => setHelp(true)}>?</button>
      {help && <Help onClose={() => setHelp(false)} />}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="알림 닫기" onClick={() => useGame.getState().setError(null)}>×</button>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
