import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Mode, Ship } from '../data/flight';
import type { Frame, Input } from '../core/sim/flight';

export type Room = {
  t:'room'; code:string; self:0|1; phase:'lobby'|'run'; mode:Mode; heat:number; seed:number;
  seats:({name:string; ship:Ship; ready:boolean; online:boolean}|null)[];
};
export type Wire =
  | Room | {t:'error';code:string} | {t:'input';input:Input;seq:number}
  | {t:'frame'|'ended';frame:Frame} | {t:'pick';id:string;action:string}
  | {t:'gateway';relic:number;route:number;purchase:boolean;eventChoice:number}
  | {t:'pingpilot';kind:number} | {t:'pause'} | {t:'left'};

const storageKey = 'lt.room';
export class RoomLink {
  private ws?: WebSocket;
  private rtc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private candidates: RTCIceCandidateInit[] = [];
  private retry?: number;
  private pulse?: number;
  private heartbeatAt = 0;
  private intentional = false;
  private credentials?: {code:string;token:string};
  private entry?: object;
  private queued: number[] = [];
  private netsim = new URLSearchParams(location.search).get('netsim')?.split(',').map(Number);
  private allowSignals = true;
  private attempts=0;

  constructor(private receive:(value:Wire)=>void, private status:(online:boolean,rtt:number,direct:boolean)=>void) {}
  connect(entry?: object) {
    this.entry=entry;
    this.intentional=false;this.attempts=0;
    if (!entry && !this.credentials) {
      try { this.credentials=JSON.parse(sessionStorage.getItem(storageKey)||'null') || undefined; } catch {}
    }
    if (!entry && !this.credentials) return;
    this.open();
  }
  private open() {
    const ws = this.ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/hushfall/socket');
    ws.onopen=()=>{
      if(this.ws!==ws)return;
      this.send(this.entry || {t:'resume',...this.credentials,proto:3});
      if (this.pulse !== undefined) clearInterval(this.pulse);
      this.heartbeatAt=performance.now();
      this.pulse=window.setInterval(()=>{
        if(performance.now()-this.heartbeatAt>3500) {ws.close(); return;}
        this.send({t:'ping',at:performance.now()});
      },1000);
    };
    ws.onmessage=e=>{
      const value=JSON.parse(e.data);
      if (value.t==='pong') {this.heartbeatAt=performance.now();this.status(true,Math.round(this.heartbeatAt-value.at),this.channel?.readyState==='open');return;}
      if (value.t==='session') {
        this.credentials={code:value.code,token:value.token}; this.entry=undefined;
        try {sessionStorage.setItem(storageKey,JSON.stringify(this.credentials));} catch {}
        this.status(true,0,this.channel?.readyState==='open');return;
      }
      if (value.t==='room') {
        const both=value.seats.every((s:Room['seats'][number])=>s?.online);
        if(!both) this.closeRtc();
        this.receive(value);
        if(both && value.self===0 && !this.rtc && this.allowSignals) void this.negotiate();
        return;
      }
      if(value.t==='signal') {void this.signal(value.value);return;}
      if(value.t==='error') {
        this.receive(value);this.disconnect(false);return;
      }
      this.incoming(value);
    };
    ws.onclose=e=>{
      if(this.ws!==ws)return;
      clearInterval(this.pulse);
      this.closeRtc();
      this.status(false,0,false);
      if(!this.intentional && e.code!==4001) {
        if(this.credentials || ++this.attempts<6) this.retry=window.setTimeout(()=>this.open(),850);
        else this.receive({t:'error',code:'unavailable'});
      }
      if(!this.intentional && e.code===4001) this.receive({t:'error',code:'closed'});
    };
  }
  sendFrame(frame:Frame,ended=false) {
    const bytes=deflateSync(strToU8(JSON.stringify(frame)),{level:1});
    this.send({t:ended?'ended':'frame',data:btoa(strFromU8(bytes,true))},!ended);
  }
  private incoming(packet:unknown) {
    if(!packet || typeof packet!=='object' || !('t' in packet)) return;
    let value=packet as Wire;
    if(packet.t==='frame'||packet.t==='ended') {
      if(!('data' in packet)||typeof packet.data!=='string'||packet.data.length>24576) return;
      try {
        const frame=JSON.parse(strFromU8(inflateSync(strToU8(atob(packet.data),true),{out:new Uint8Array(32768)})));
        if(!Array.isArray(frame.pilots)||frame.pilots.length!==2||!Array.isArray(frame.enemies)||!Array.isArray(frame.bullets)||!Array.isArray(frame.drops)||!Number.isSafeInteger(frame.t)) return;
        value={t:packet.t,frame};
      } catch {return;}
    }
    if(this.netsim && (value.t==='input'||value.t==='frame')) {
      const [latency=120,jitter=30,loss=5]=this.netsim;
      if(Math.random()*100<loss) return;
      const timer=window.setTimeout(()=>{
        this.queued=this.queued.filter(id=>id!==timer);
        this.receive(value);
      }, Math.min(2000, Math.max(0,latency/2+(Math.random()-.5)*jitter)));
      this.queued.push(timer);
    } else this.receive(value);
  }
  private closeRtc() {
    this.channel?.close();
    this.rtc?.close();
    this.channel=undefined; this.rtc=undefined; this.candidates=[];
  }
  private setupRtc() {
    const pc=this.rtc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    pc.onicecandidate=e=>{if(e.candidate)this.send({t:'signal',value:{candidate:e.candidate.toJSON()}});};
    pc.ondatachannel=e=>this.bind(e.channel);
    return pc;
  }
  private bind(channel:RTCDataChannel) {
    this.channel=channel;
    channel.onmessage=e=>{try {this.incoming(JSON.parse(e.data));} catch {}};
  }
  private async negotiate() {
    try {
      const pc=this.setupRtc();
      this.bind(pc.createDataChannel('flight',{ordered:false,maxRetransmits:0}));
      await pc.setLocalDescription(await pc.createOffer());
      this.send({t:'signal',value:{description:pc.localDescription}});
    } catch {this.closeRtc();this.allowSignals=false;}
  }
  private async signal(value:{description?:RTCSessionDescriptionInit;candidate?:RTCIceCandidateInit}) {
    try {
      const pc=this.rtc || this.setupRtc();
      if(value.description) {
        await pc.setRemoteDescription(value.description);
        for(const candidate of this.candidates) await pc.addIceCandidate(candidate);
        this.candidates=[];
        if(value.description.type==='offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this.send({t:'signal',value:{description:pc.localDescription}});
        }
      } else if(value.candidate) {
        if(pc.remoteDescription) await pc.addIceCandidate(value.candidate);
        else this.candidates.push(value.candidate);
      }
    } catch {this.closeRtc();this.allowSignals=false;}
  }
  send(value:object, fast=false) {
    const data=JSON.stringify(value);
    if(fast && this.channel?.readyState==='open' && this.channel.bufferedAmount<32768) {
      try {this.channel.send(data);return;} catch {}
    }
    if(this.ws?.readyState===WebSocket.OPEN) this.ws.send(data);
  }
  disconnect(leave=true) {
    this.intentional=true;
    if(leave) this.send({t:'leave'});
    const ws=this.ws;this.ws=undefined;ws?.close();this.closeRtc(); this.entry=undefined;this.credentials=undefined;
    clearTimeout(this.retry);clearInterval(this.pulse);
    this.queued.forEach(clearTimeout);this.queued=[];this.allowSignals=true;
    try {sessionStorage.removeItem(storageKey);} catch {}
  }
}
