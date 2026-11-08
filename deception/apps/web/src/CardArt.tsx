import type { Card } from "@deception/shared";

/** Local vector art stays crisp in both the card list and enlarged evidence view. */
export function CardArt({ card }: { card: Card }) {
  return (
    <img
      className="card-art"
      src={`${import.meta.env.BASE_URL}cards/${card.id}.svg`}
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

export function CardFace({ card }: { card: Card | undefined }) {
  if (!card) return null;
  return <><CardArt card={card} /><strong className="card-label">{card.label}</strong></>;
}
