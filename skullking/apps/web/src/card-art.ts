import type { Card, Suit } from '@skullking/shared';

/** Original file names matched explicitly to their in-game card variables. */
export const CARD_ART_SOURCE = {
  number: { parrot: '앵무새수트카드{rank}.png', map: '지도수트카드{rank}.png', treasure: '보물수트카드{rank}.png', jolly: '해적수트카드{rank}.png' } satisfies Record<Suit, string>,
  expansionNumber: {
    parrot: { seven: '앵무새수트카드7,-5점.png', eight: '앵무새수트카드8,+5점.png', zeroFourteen: '앵무새수트카드0:14.png' },
    map: { seven: '지도수트카드7,-5점.png', eight: '지도수트카드8,+5점.png', zeroFourteen: '지도수트카드0:14.png' },
    treasure: { seven: '보물수트카드7,-5점.png', eight: '보물수트카드8,+5점.png', zeroFourteen: '보물수트카드0:14.png' },
    jolly: { seven: '해적수트카드7,-5점.png', eight: '해적수트카드8,+5점.png', zeroFourteen: '해적수트카드0:14.png' },
  },
  pirate: { Rosie: '로지드레이니.png', Bendt: '강도바히즈.png', Rascal: '로아탄의라스칼.png', Juanita: '후아니타하데.png', Harry: '거인해리.png' },
  expansion: { wildMonkey: '후트카드15.png', maryThorne: 'marythorne.png', lastVolley: 'TheLastVolley .png', firstMateCon: 'firstmatecon.png', stingray: 'Spotted Stingray.png', davyJones: 'davyjones.png', walkThePlank: 'WalkthePlank.png' },
  tigress: '티그리스.png', skullKing: '스컬킹.png', mermaid: { Alyra: '알리라.png', Sirena: '시레나.png' }, escape: '백기.png', kraken: '크라켄.png', whale: '고래.png', loot: '약탈.png',
} as const;

const asset = (name: string) => `${import.meta.env.BASE_URL}card-art/${name}`;
const suits: Record<Suit, string> = { parrot: 'parrot', map: 'map', treasure: 'treasure', jolly: 'jolly' };
const pirates: Record<string, string> = { Rosie: 'pirate-rosie', Bendt: 'pirate-bendt', Rascal: 'pirate-rascal', Juanita: 'pirate-juanita', Harry: 'pirate-harry' };

export function cardArt(card: Card): string | null {
  if (card.kind === 'number') {
    if (!card.suit) return null;
    if (card.isZeroFourteen) return asset(`${suits[card.suit]}-zero-fourteen.jpg`);
    if (card.isExpansion && card.rank === 7) return asset(`${suits[card.suit]}-7-expansion.jpg`);
    if (card.isExpansion && card.rank === 8) return asset(`${suits[card.suit]}-8-expansion.jpg`);
    return card.rank ? asset(`${suits[card.suit]}-${card.rank}.jpg`) : null;
  }
  if (card.kind === 'pirate') return card.name === 'Mary Thorne' ? asset('mary-thorne.jpg') : pirates[card.name] ? asset(`${pirates[card.name]}.jpg`) : null;
  if (card.kind === 'mermaid') return card.name === 'Alyra' ? asset('mermaid-alyra.jpg') : card.name === 'Sirena' ? asset('mermaid-sirena.jpg') : null;
  const names = { wild: 'wild-monkey-15', tigress: 'tigress', skullKing: 'skull-king', escape: 'escape', kraken: 'kraken', whale: 'white-whale', stingray: 'spotted-stingray', davy: 'davy-jones', con: 'first-mate-con', lastVolley: 'last-volley', plank: 'walk-the-plank', loot: 'loot' } as const;
  return card.kind in names ? asset(`${names[card.kind as keyof typeof names]}.jpg`) : null;
}
