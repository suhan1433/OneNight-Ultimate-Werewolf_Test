import { gameAudio } from './audio-settings';
let context: AudioContext | undefined;
let effects: GainNode | undefined;
let ambience: GainNode | undefined;
let phase: string | undefined;
let ducked = false;
function prepare() {
  const C = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!C) return;
  context ??= new C();
  if (!effects) { effects=context.createGain(); effects.connect(context.destination); gameAudio.bindGain(effects,'effects',.12); }
  if (!ambience) {
    const level=context.createGain(); level.connect(context.destination); gameAudio.bindGain(level,'background',.025);
    ambience=context.createGain(); ambience.gain.value=0; ambience.connect(level);
    const buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate);
    const channel=buffer.getChannelData(0);
    for(let i=0;i<channel.length;i++) channel[i]=(Math.random()*2-1);
    const wind=context.createBufferSource(); wind.buffer=buffer; wind.loop=true;
    const filter=context.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=380;
    wind.connect(filter);filter.connect(ambience);wind.start();
  }
  void context.resume().catch(()=>undefined);
  mix();
}
function mix() {
  if (!context || !ambience) return;
  const active=phase==='night'||phase==='lobby'||phase==='day';
  ambience.gain.setTargetAtTime(active ? ducked ? .12 : phase==='night' ? 1 : .45 : 0,context.currentTime,.35);
}
export function setSoundScene(value?: string) { phase=value; mix(); }
export function playCue(kind:'reveal'|'select'|'seal'|'verdict') {
  try {
    prepare(); if (!context || !effects) return;
    const tones={reveal:[220,330,440],select:[440],seal:[180,110],verdict:[196,294,392]}[kind];
    tones.forEach((frequency,i)=>{
      const osc=context!.createOscillator();const gain=context!.createGain();const at=context!.currentTime+i*.07;
      osc.type='sine';osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.25,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+.3);
      osc.connect(gain);gain.connect(effects!);osc.start(at);osc.stop(at+.32);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
  } catch { /* Sound never blocks play. */ }
}
window.addEventListener('pointerdown',()=>{try{prepare();}catch{}},{passive:true});
window.addEventListener('keydown',()=>{try{prepare();}catch{}});
window.addEventListener('werewolf:narration',(e)=>{ducked=(e as CustomEvent<boolean>).detail;mix();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(context?.state==='running')void context.suspend();}else if(context?.state==='suspended')void context.resume().catch(()=>undefined);});
