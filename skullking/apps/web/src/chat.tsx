/**
 * 채팅 = 말풍선. 채팅창 목록은 없고, 말은 해당 플레이어의 초상화 위에 잠깐 떴다 사라진다.
 *  - 보내기  : emit('CHAT_SEND',{roomCode,text})  (내 말풍선은 즉시 먼저 띄운다)
 *  - 받기    : 서버가 게임 상태에 chat:[{id,playerId,text,at}] (최근 N개)를 실어 준다. 새 id만 말풍선으로 띄운다.
 *  - 한 사람당 말풍선은 하나(새 말이 오면 교체). 입장 직후 이미 있던 말은 다시 띄우지 않는다.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import { emit } from './socket';
import { Icon } from './icons';
import { useGame } from './store';

export type ChatMsg = { id: string; playerId: string; text: string; at: number };
type B = { key: number; text: string; ms: number; at: number };

const bubbles = new Map<string, B>();
const timers = new Map<string, number>();
const subs = new Set<() => void>();
let version = 0, seq = 0;
const notify = () => { version++; subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function pushBubble(playerId: string, raw: string, fromServer = false) {
  const text = raw.trim().slice(0, 80);
  if (!text) return;
  const cur = bubbles.get(playerId);
  if (fromServer && cur && cur.text === text && Date.now() - cur.at < 5000) return; // 내가 먼저 띄운 말이 서버에서 돌아온 경우
  const ms = Math.min(8000, 3600 + text.length * 90);
  const key = ++seq;
  bubbles.set(playerId, { key, text, ms, at: Date.now() });
  window.clearTimeout(timers.get(playerId));
  timers.set(playerId, window.setTimeout(() => { if (bubbles.get(playerId)?.key === key) { bubbles.delete(playerId); notify(); } }, ms));
  notify();
}
function clearBubbles() { timers.forEach(t => window.clearTimeout(t)); timers.clear(); bubbles.clear(); notify(); }

/** App 최상단에서 한 번 호출 */
export function useChatSync() {
  const game = useGame(s => s.game) as unknown as { roomCode: string; playerId: string; chat?: ChatMsg[] } | null;
  const seen = useRef<{ room: string; ids: Set<string> }>({ room: '', ids: new Set() });
  useEffect(() => {
    if (!game) { seen.current = { room: '', ids: new Set() }; clearBubbles(); return; }
    const s = seen.current;
    if (s.room !== game.roomCode) { seen.current = { room: game.roomCode, ids: new Set((game.chat ?? []).map(m => m.id)) }; clearBubbles(); return; }
    for (const m of game.chat ?? []) {
      if (s.ids.has(m.id)) continue;
      s.ids.add(m.id);
      pushBubble(m.playerId, m.text, m.playerId === game.playerId);
    }
  }, [game?.chat, game?.roomCode, game?.playerId]);
}

export function Bubble({ playerId }: { playerId: string }) {
  useSyncExternalStore(subscribe, () => version);
  const me = useGame(s => s.game?.playerId) as string | undefined;
  const b = bubbles.get(playerId);
  if (!b) return null;
  return <span key={b.key} className={'bubble' + (playerId === me ? ' mine' : '')} role="status" style={{ '--life': b.ms + 'ms' } as CSSProperties}>{b.text}</span>;
}

/**
 * iOS처럼 키보드가 layout viewport를 줄이지 않는 브라우저에서는 입력창에
 * 포커스될 때 화면이 손패 쪽으로만 밀린다. 실제 보이는 높이(visual viewport)에
 * 게임판을 맞추고 손패를 잠시 접어서, 초상화와 그 위 말풍선을 계속 볼 수 있게 한다.
 */
function useMobileChatView(focused: boolean) {
  useEffect(() => {
    if (!focused || !window.matchMedia('(max-width: 640px)').matches) return;
    const game = document.querySelector<HTMLElement>('.game.is-play');
    if (!game) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        game.style.setProperty('--chat-viewport-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`);
        game.classList.add('chat-focus');
        // 브라우저가 입력창을 보이게 하려고 밀어 둔 페이지를 게임판의 위쪽으로 되돌린다.
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    };
    sync();
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      game.classList.remove('chat-focus');
      game.style.removeProperty('--chat-viewport-height');
    };
  }, [focused]);
}

export function ChatInput({ roomCode, meId, wide }: { roomCode: string; meId: string; wide?: boolean }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const last = useRef(0);
  useMobileChatView(focused);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim().slice(0, 60);
    const now = Date.now();
    if (!t || now - last.current < 900) return;        // 도배 방지(서버에서도 제한 권장)
    last.current = now;
    setText('');
    pushBubble(meId, t);
    try { await (emit as unknown as (e: string, p: unknown) => Promise<unknown>)('CHAT_SEND', { roomCode, text: t }); }
    catch (err) { useGame.getState().setError(err instanceof Error ? err.message : '메시지를 보낼 수 없습니다.'); }
  };
  return <form className={'chat' + (wide ? ' wide' : '')} onSubmit={submit}>
    <Icon name="chat" />
    <input value={text} onChange={e => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={60} placeholder="한마디…" aria-label="채팅 입력" autoComplete="off" autoCorrect="off" enterKeyHint="send" />
    <button type="submit" disabled={!text.trim()} aria-label="보내기"><Icon name="send" /></button>
  </form>;
}
