import { gameAudio } from './audio-settings';
import { preferAmbientAudio } from '../../../../game-audio/audio';
import type { Card, PlayedCard } from '@skullking/shared';

const soundFile=(card:Card,declaration?:PlayedCard['declaration'])=>{
  if(card.kind==='pirate')return ({Rosie:'pirate-rosie',Bendt:'pirate-bendt',Rascal:'pirate-rascal',Juanita:'pirate-juanita',Harry:'pirate-harry','Mary Thorne':'mary-thorne'} as Record<string,string>)[card.name];
  if(card.kind==='mermaid')return card.name==='Sirena'?'mermaid-sirena':'mermaid-alyra';
  if(card.kind==='tigress')return declaration==='pirate'?'tigress-pirate':'tigress-escape';
  return ({escape:'escape',loot:'loot',kraken:'kraken',whale:'white-whale',wild:'wild-monkey',skullKing:'skull-king',stingray:'spotted-stingray',davy:'davy-jones',con:'first-mate-con',lastVolley:'last-volley',plank:'walk-the-plank'} as Partial<Record<Card['kind'],string>>)[card.kind];
};

const url=(file:string)=>`${import.meta.env.BASE_URL}audio/${file}.mp3`;
const activeSounds=new Set<HTMLAudioElement>();
const dispose=(audio:HTMLAudioElement)=>{gameAudio.untrackMedia(audio);activeSounds.delete(audio);audio.pause();audio.removeAttribute('src');audio.load();};

/** 음소거 직후에도 남아 있는 짧은 효과음을 중지해 오디오 포커스를 반납한다. */
export function stopCardSounds(){[...activeSounds].forEach(dispose);}

/** Plays a disposable instance so simultaneous special-card effects never cut each other off. */
export function playCardSound({card,declaration}:PlayedCard){
  const file=soundFile(card,declaration);if(!file||typeof Audio==='undefined')return;
  preferAmbientAudio();const audio=new Audio(url(file));audio.preload='auto';gameAudio.trackMedia(audio,'effects',.7);activeSounds.add(audio);
  audio.addEventListener('ended',()=>dispose(audio),{once:true});
  gameAudio.unlock();void audio.play().catch(()=>dispose(audio));
}

/** Unlocks media playback inside a user gesture so later socket updates can play their effects. */
export function unlockCardSounds(){ gameAudio.unlockMedia(); }
