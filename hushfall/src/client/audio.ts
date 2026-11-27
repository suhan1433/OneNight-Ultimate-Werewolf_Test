import type { Frame } from '../core/sim/flight';
export class FlightAudio {
  private ctx?: AudioContext;
  private previous?: Frame;
  volume = .35;
  unlock() {
    try { this.ctx ||= new AudioContext(); if(this.ctx.state==='suspended') void this.ctx.resume(); } catch {}
  }
  update(f:Frame) {
    const last=this.previous;
    this.previous=f;
    if(!last || last.id!==f.id || last.t===f.t) return;
    if (f.level>last.level) {this.tone(440,.13);this.tone(660,.18,.08);this.tone(880,.18,.16);}
    else if (f.flash>last.flash+.3) this.tone(104,.4);
    else if (f.phase==='boss' && last.phase!=='boss') this.tone(72,.65);
    else if(f.pilots.some((p,i)=>p.hull<last.pilots[i].hull)) this.tone(132,.23);
    else if (f.pilots.some((p,i)=>p.shield>last.pilots[i].shield+5)) this.tone(215,.14);
    else if (f.pilots.some((p,i)=>p.grazes>last.pilots[i].grazes)) this.tone(750,.07);
    else if (f.duet>=0&&last.duet<0) {this.tone(353,.13);this.tone(529,.12,.06);}
    else if (f.bossPhase>last.bossPhase&&f.bossPhase>1) this.tone(93,.3);
    else if(f.chain>last.chain) this.tone(330+(f.chain%8)*40,.06);
  }
  tone(hz:number,duration:number,delay=0) {
    if(!this.ctx || !this.volume) return;
    const at=this.ctx.currentTime+delay,tone=this.ctx.createOscillator(),amp=this.ctx.createGain();
    tone.type='sine';tone.frequency.setValueAtTime(hz,at);
    tone.frequency.exponentialRampToValueAtTime(hz*.7,at+duration);
    amp.gain.setValueAtTime(.001,at);amp.gain.exponentialRampToValueAtTime(this.volume*.13,at+.015);
    amp.gain.exponentialRampToValueAtTime(.001,at+duration);tone.connect(amp).connect(this.ctx.destination);
    tone.start(at);tone.stop(at+duration+.02);
  }
}
