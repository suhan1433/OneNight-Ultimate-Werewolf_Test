import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { Card, Game, Send } from './types';
import { cardName, cue, sortHand, useMedia } from './lib';
import { CardFace } from './ui';
import type { View } from './view';

/** 손패: 데스크톱 = 부채꼴, 모바일 = 겹침 가로 스크롤. 낼 수 있는 카드는 올라오고 못 내는 카드는 가라앉는다. */
export function Hand({ game, view, send, recordPlay, compact }: { game: Game; view: View; send: Send; recordPlay: (c: Card) => void; compact: boolean }) {
  const hand = useMemo(() => sortHand(game.hand), [game.hand]);
  const touch = useMedia('(hover: none)');
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel && !hand.some(c => c.id === sel)) setSel(null); }, [hand, sel]);
  const playable = (c: Card) => view.myTurn && view.legal.has(c.id);
  const play = (c: Card) => { if (!playable(c)) return; cue('play'); recordPlay(c); setSel(null); send('CARD_PLAY', { cardId: c.id }); };
  // 마우스 클릭(데스크톱)은 바로 내기, 터치·키보드는 "선택 → 한 번 더(또는 내기 버튼)".
  const onCard = (c: Card, e: MouseEvent<HTMLButtonElement>) => { cue('tap'); if (!touch && e.detail > 0) play(c); else if (sel === c.id) play(c); else setSel(c.id); };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'Escape') { setSel(null); return; }
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -i : e.key === 'End' ? hand.length - 1 - i : 0;
    if (!d) return; e.preventDefault();
    const next = Math.min(hand.length - 1, Math.max(0, i + d)); setFocus(next);
    box.current?.querySelectorAll<HTMLElement>('button.card')[next]?.focus();
  };
  const fi = Math.min(focus, Math.max(0, hand.length - 1));
  const picked = hand.find(c => c.id === sel);
  const why = !view.myTurn ? (view.resolving ? '판정이 끝나면 낼 수 있어요' : '내 차례가 아니에요') : '먼저 나온 카드와 같은 색을 내야 해요';

  return <section className={`hand-zone ${compact ? 'compact' : ''} ${view.canComm ? 'has-comm' : ''}`} aria-label={`내 손패 ${hand.length}장`}>
    {picked && <div className="pick-bar" role="status">
      <b>{cardName(picked)}</b>
      {playable(picked) ? <span>한 번 더 누르거나 버튼으로 내세요</span> : <span>{why}</span>}
      <button type="button" className="primary" disabled={!playable(picked)} onClick={() => play(picked)}>이 카드 내기</button>
      <button type="button" onClick={() => setSel(null)}>취소</button>
    </div>}
    <div ref={box} className={`hand ${compact ? 'row' : 'fan'} ${view.myTurn ? 'my-turn' : ''}`} style={{ '--n': hand.length, '--mid': (hand.length - 1) / 2 } as CSSProperties}>
      {hand.map((c, i) => <CardFace key={c.id} card={c} size="lg" playable={playable(c)} selected={sel === c.id} style={{ '--i': i } as CSSProperties} tabIndex={i === fi ? 0 : -1} onClick={e => onCard(c, e)} onKeyDown={e => onKey(e, i)} />)}
    </div>
  </section>;
}
