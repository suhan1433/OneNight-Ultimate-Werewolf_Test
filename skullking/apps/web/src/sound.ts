import type { Card, PlayedCard } from '@skullking/shared';

const soundFile=(card:Card,declaration?:PlayedCard['declaration'])=>{
  if(card.kind==='pirate')return ({Rosie:'pirate-rosie',Bendt:'pirate-bendt',Rascal:'pirate-rascal',Juanita:'pirate-juanita',Harry:'pirate-harry','Mary Thorne':'mary-thorne'} as Record<string,string>)[card.name];
  if(card.kind==='mermaid')return card.name==='Sirena'?'mermaid-sirena':'mermaid-alyra';
  if(card.kind==='tigress')return declaration==='pirate'?'tigress-pirate':'tigress-escape';
  return ({escape:'escape',loot:'loot',kraken:'kraken',whale:'white-whale',wild:'wild-monkey',skullKing:'skull-king',stingray:'spotted-stingray',davy:'davy-jones',con:'first-mate-con',lastVolley:'last-volley',plank:'walk-the-plank'} as Partial<Record<Card['kind'],string>>)[card.kind];
};

const url=(file:string)=>`${import.meta.env.BASE_URL}audio/${file}.mp3`;
let soundsUnlocked=false;let unlocking=false;
let unlockAttempt=0;
const activeSounds=new Set<HTMLAudioElement>();
const preferAmbientAudio=()=>{try{const session=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;if(session)session.type='ambient';}catch{/* 지원하지 않는 브라우저 */}};
const dispose=(audio:HTMLAudioElement)=>{activeSounds.delete(audio);audio.pause();audio.removeAttribute('src');audio.load();};

/** 음소거 직후에도 남아 있는 짧은 효과음을 중지해 오디오 포커스를 반납한다. */
export function stopCardSounds(){unlockAttempt++;unlocking=false;soundsUnlocked=false;[...activeSounds].forEach(dispose);}

/** Plays a disposable instance so simultaneous special-card effects never cut each other off. */
export function playCardSound({card,declaration}:PlayedCard){
  const file=soundFile(card,declaration);if(!file||typeof Audio==='undefined')return;
  preferAmbientAudio();const audio=new Audio(url(file));audio.preload='auto';audio.volume=.7;activeSounds.add(audio);
  audio.addEventListener('ended',()=>dispose(audio),{once:true});
  void audio.play().catch(()=>dispose(audio));
}

/** Unlocks media playback inside a user gesture so later socket updates can play their effects. */
export function unlockCardSounds(){
  if(soundsUnlocked||unlocking||typeof Audio==='undefined')return;unlocking=true;const attempt=++unlockAttempt;
  preferAmbientAudio();const audio=new Audio(url('escape'));audio.muted=true;audio.volume=0;activeSounds.add(audio);
  void audio.play().then(()=>{dispose(audio);if(attempt!==unlockAttempt)return;soundsUnlocked=true;unlocking=false;}).catch(()=>{dispose(audio);if(attempt===unlockAttempt)unlocking=false;/* 다음 사용자 입력에서 재시도 */});
}
