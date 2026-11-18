import { useRef, useState, type CSSProperties } from 'react';
import { PolicyFace } from './Art';

/** Like a ballot: first tap selects, second tap or an upward drag submits. */
export function PolicyCard({ policy, index, title, action, selected, disabled, confirmHint, onSelect, onClear, onConfirm }: {
  policy: 'liberal' | 'fascist';
  index: number;
  title: string;
  action: string;
  selected: boolean;
  disabled: boolean;
  confirmHint: string;
  onSelect: () => void;
  onClear: () => void;
  onConfirm: () => void;
}) {
  const [lift, setLift] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const reset = () => { pointer.current = null; setLift(0); setDragging(false); };
  const tap = () => { if (!disabled) selected ? onConfirm() : onSelect(); };
  return <button
    type="button"
    className={`policy-card ${policy}${selected ? ' armed' : ''}${dragging ? ' dragging' : ''}`}
    style={{ '--i': index, '--lift': `${lift}px` } as CSSProperties}
    aria-label={`${title} · ${action}`}
    aria-pressed={selected}
    disabled={disabled}
    onPointerDown={event => {
      if (disabled || !event.isPrimary || event.button !== 0 || pointer.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      setDragging(true);
    }}
    onPointerMove={event => {
      const start = pointer.current;
      if (!start || event.pointerId !== start.id) return;
      const x = event.clientX - start.x, y = start.y - event.clientY;
      if (Math.hypot(x, y) > 6) start.moved = true;
      setLift(Math.min(150, Math.max(0, y)));
    }}
    onPointerUp={event => {
      const start = pointer.current;
      if (!start || event.pointerId !== start.id) return;
      const x = event.clientX - start.x, y = start.y - event.clientY;
      const wasTap = !start.moved && Math.hypot(x, y) <= 6;
      reset();
      if (disabled) return;
      if (y >= 70 && y > Math.abs(x)) onConfirm();
      else if (wasTap) tap();
      else onClear();
    }}
    onPointerCancel={() => { reset(); onClear(); }}
    onLostPointerCapture={reset}
    onClick={event => { if (event.detail === 0) tap(); }}
    onBlur={onClear}
    onContextMenu={event => event.preventDefault()}
  >
    <PolicyFace policy={policy} title={title} sub={selected ? confirmHint : action} />
  </button>;
}
