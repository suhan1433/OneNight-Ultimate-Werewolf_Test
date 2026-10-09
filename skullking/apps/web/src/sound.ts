import type { Card, PlayedCard } from '@skullking/shared';

const soundFile=(card:Card,declaration?:PlayedCard['declaration'])=>{
  if(card.kind==='pirate')return ({Rosie:'pirate-rosie',Bendt:'pirate-bendt',Rascal:'pirate-rascal',Juanita:'pirate-juanita',Harry:'pirate-harry','Mary Thorne':'mary-thorne'} as Record<string,string>)[card.name];
  if(card.kind==='mermaid')return card.name==='Sirena'?'mermaid-sirena':'mermaid-alyra';
  if(card.kind==='tigress')return declaration==='pirate'?'tigress-pirate':'tigress-escape';
  return ({escape:'escape',loot:'loot',kraken:'kraken',whale:'white-whale',wild:'wild-monkey',skullKing:'skull-king',stingray:'spotted-stingray',davy:'davy-jones',con:'first-mate-con',lastVolley:'last-volley',plank:'walk-the-plank'} as Partial<Record<Card['kind'],string>>)[card.kind];
};

const url=(file:string)=>`${import.meta.env.BASE_URL}audio/${file}.mp3`;
let soundsUnlocked=false;let unlocking=false;

/** Plays a disposable instance so simultaneous special-card effects never cut each other off. */
export function playCardSound({card,declaration}:PlayedCard){
  const file=soundFile(card,declaration);if(!file||typeof Audio==='undefined')return;
  const audio=new Audio(url(file));audio.preload='auto';audio.volume=.7;
  audio.addEventListener('ended',()=>{audio.removeAttribute('src');audio.load();},{once:true});
  void audio.play().catch(()=>{/* A browser may block audio until the player's first interaction. */});
}

/** Unlocks media playback inside a user gesture so later socket updates can play their effects. */
export function unlockCardSounds(){
  if(soundsUnlocked||unlocking||typeof Audio==='undefined')return;unlocking=true;
  const audio=new Audio(url('escape'));audio.muted=true;audio.volume=0;
  void audio.play().then(()=>{audio.pause();audio.removeAttribute('src');audio.load();soundsUnlocked=true;unlocking=false;}).catch(()=>{unlocking=false;/* The next user gesture will retry. */});
}
