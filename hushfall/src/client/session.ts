import { Flight, clamp, type Checkpoint, type Frame, type Input } from '../core/sim/flight';
import { rules as R, ships, type Mode, type Ship } from '../data/flight';
import { RoomLink, type Room, type Wire } from './room';
import { FlightRender } from './render';
import { storeCheckpoint } from './storage';
import { FlightAudio } from './audio';

type Change = {frame?:Frame|null;room?:Room|null;fault?:string;online?:boolean;rtt?:number;direct?:boolean;waiting?:boolean;notice?:string; local?:boolean};
export type Settings = {lang:0|1;volume:number;contrast:boolean;reduce:boolean};
const blank = ():[Input,Input] => [{axis:0},{axis:0}];
const dailySeed = () => Number(new Date().toISOString().slice(0,10).replaceAll('-',''));
export class Session {
  private link:RoomLink;
  private flight?:Flight;
  private view?:FlightRender;
  private frame?:Frame;
  private room?:Room;
  private controls=blank();
  private remote:Input={axis:0};
  private lastInput=0;
  private sequence=0;
  private remoteSeq=-1;
  private peersLost=0;
  private lastConnectionNotice='';
  private lostPaused=false;
  private pauseRequest=0;
  private loop=0;
  private last=0;
  private acc=0;
  private netAt=0;
  private uiAt=0;
  private sentResult=false;
  private lastSnap=0;
  private predicted?:{index:number;x:number};
  private lastHistory?:Frame;
  private audio=new FlightAudio();
  private pan=new Map<number,{index:number;x:number;target:number}>();
  private keys=new Set<string>();
  private local=false;
  private checkpointStage=0;
  private heldUntil=[{dash:0,burst:0},{dash:0,burst:0}];
  settings:Settings={lang:0,volume:.35,contrast:false,reduce:false};

  constructor(private update:(change:Change)=>void) {
    this.link=new RoomLink(value=>this.message(value),(online,rtt,direct)=>{
      this.update({online,rtt,direct});
      if(!online && this.room?.phase==='run' && !this.peersLost && this.frame?.phase!=='result') this.peersLost=performance.now();
    });
  }
  get index(){return this.room?.self||0;}
  enter(name:string,code?:string,ship:Ship='aster') {
    this.link.disconnect(false);
    this.update({fault:'',waiting:true});
    this.link.connect({t:code?'join':'create',code,name,ship,proto:3});
  }
  resume() { this.link.connect(); }
  leave() {
    this.link.disconnect();this.room=undefined;this.flight=undefined;this.frame=undefined;this.local=false;
    this.lastHistory=undefined;this.peersLost=0;this.lastConnectionNotice='';this.lostPaused=false;this.sentResult=false;this.pauseRequest=0;this.resetInput();
    this.update({room:null,frame:null,fault:'',notice:'',waiting:false,online:false,local:false});
  }
  configure(mode:Mode,heat:number) {this.link.send({t:'settings',mode,heat});}
  ship(ship:Ship) {this.link.send({t:'ship',ship});}
  ready(ready:boolean) {this.audio.unlock();this.link.send({t:'ready',ready});}
  launch() {this.audio.unlock();this.link.send({t:'start'});}
  replay() {
    if(this.room) this.link.send({t:'reset'});
    else if(this.frame) this.play(this.frame.mode,this.frame.heat,this.local,[this.frame.pilots[0].ship,this.frame.pilots[1].ship]);
  }
  play(mode:Mode,heat:number,local:boolean,shipIds:[Ship,Ship]=['aster','aster']) {
    this.leave();
    this.local=local;
    const seed=mode==='daily'?dailySeed():crypto.getRandomValues(new Uint32Array(1))[0];
    this.begin(seed,mode,heat,!local,shipIds);
    this.flight!.id=crypto.getRandomValues(new Uint32Array(4)).join('-');
    if(!local)void storeCheckpoint(this.flight!.checkpoint());
  }
  restore(save:Checkpoint) {
    this.leave();
    this.flight=Flight.restore(save);this.checkpointStage=save.stage;this.audio.unlock();
    this.frame=this.flight.frame();
    this.update({frame:this.frame,notice:'',local:false});
  }
  private begin(seed:number,mode:Mode,heat:number,drone:boolean,shipIds:[Ship,Ship]) {
    this.audio.unlock(); this.resetInput();
    this.flight=new Flight(mode==='daily'?dailySeed():seed,mode,heat,drone,shipIds);
    this.flight.id=String(seed);
    this.frame=this.flight.frame();this.checkpointStage=this.frame.stage;this.lastHistory=undefined;this.sentResult=false;this.pauseRequest=0;
    this.update({frame:this.frame,notice:'',local:this.local});
  }
  private message(value:Wire) {
    if(value.t==='error') {
      this.leave();this.update({fault:value.code});return;
    }
    if(value.t==='room') {
      const previous=this.room;
      this.room=value;
      this.update({room:value,waiting:false});
      if(value.phase==='lobby') {
        this.flight=undefined;this.frame=undefined;this.predicted=undefined;this.lastHistory=undefined;this.pauseRequest=0;
        this.update({frame:null,notice:''});return;
      }
      if(value.self===0 && (!this.flight || previous?.seed!==value.seed)) {
        if(!previous) {this.link.send({t:'reset'});this.update({notice:'restored'});return;}
        this.begin(value.seed,value.mode,value.heat,false,[value.seats[0]?.ship||'aster',value.seats[1]?.ship||'aster']);
      }
      if(value.seats[1-value.self]?.online) {
        if(this.lostPaused && this.flight) {this.flight.pause();this.lostPaused=false;}
        if(this.peersLost) {
          this.peersLost=0;this.lastConnectionNotice='';
          this.remoteSeq=-1;
          this.update({notice:''});
        }
      } else if(!this.peersLost && this.frame?.phase!=='result') this.peersLost=performance.now();
      return;
    }
    if(!this.room || this.room.phase!=='run') return;
    if(value.t==='left') {
      this.peersLost=performance.now()-30001;return;
    }
    if(value.t==='frame'||value.t==='ended') {
      if(this.index!==1 || value.frame?.id!==String(this.room.seed) || !value.frame?.pilots?.[1] || (this.frame && value.frame.t<this.frame.t)) return;
      if(!this.frame || this.frame.t!==value.frame.t) this.lastHistory=this.frame;
      this.frame=value.frame;this.lastSnap=performance.now();
      if(!this.predicted) this.predicted={index:1,x:this.frame.pilots[1].x};
      return;
    }
    if(!this.flight || this.index!==0 || this.flight.drone) return;
    if(value.t==='input') {
      if(!Number.isSafeInteger(value.seq) || value.seq<=this.remoteSeq || !value.input || !Number.isFinite(value.input.axis)) return;
      this.remoteSeq=value.seq;this.lastInput=performance.now();
      this.remote={axis:clamp(value.input.axis,-1,1),dash:value.input.dash===true||this.remote.dash,burst:value.input.burst===true||this.remote.burst};
      if(typeof value.input.target==='number' && Number.isFinite(value.input.target)) this.remote.target=clamp(value.input.target,R.edge,R.width-R.edge);
      return;
    }
    if(value.t==='pick') this.flight.pick(1,value.id,value.action);
    if(value.t==='gateway' && Number.isInteger(value.relic) && Number.isInteger(value.route)) this.flight.gateway(1,value.relic,value.route,value.purchase===true,value.eventChoice);
    if(value.t==='pingpilot' && Number.isInteger(value.kind)) this.flight.ping(1,value.kind);
    if(value.t==='pause' && performance.now()>=this.pauseRequest) {
      this.pauseRequest=performance.now()+1500;
      this.update({notice:'pauseRequest'});
    }
  }
  pick(i:number,id:string,action='pick') {
    if(this.flight) this.flight.pick(i,id,action);else this.link.send({t:'pick',id,action});
  }
  gateway(i:number,relic:number,route:number,purchase:boolean,eventChoice:number) {
    if(this.flight) this.flight.gateway(i,relic,route,purchase,eventChoice);else this.link.send({t:'gateway',relic,route,purchase,eventChoice});
  }
  signal(kind:number) {
    if(this.flight) this.flight.ping(this.index,kind);else this.link.send({t:'pingpilot',kind});
  }
  pause() {
    if(this.flight) {this.flight.pause(!!this.room);this.lostPaused=false;this.update({notice:''});}
    else {this.link.send({t:'pause'});this.update({notice:'pauseSent'});}
  }
  abandon() {if(this.flight)this.flight.abandon();else this.leave();}
  async attach(el:HTMLElement) {
    const renderer=new FlightRender();
    this.view=renderer;
    try {await renderer.attach(el);}
    catch {if(this.view===renderer) this.update({fault:'graphics'});}
  }
  detach() {this.view?.destroy();this.view=undefined;}
  private resetInput() {this.keys.clear();this.pan.clear();this.controls=blank();this.remote={axis:0};this.heldUntil=[{dash:0,burst:0},{dash:0,burst:0}];this.remoteSeq=-1;}
  private visibility = () => {
    if(document.hidden) {
      this.resetInput();
      if(this.flight && !this.frame?.paused && this.frame?.phase!=='result') {this.flight.pause(!!this.room);}
      if(this.room?.self===1) this.link.send({t:'pause'});
      this.acc=0;
    }
  };
  private onDown=(e:KeyboardEvent) => {
    if(!this.frame || this.frame.phase==='result' || (e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
    const key=e.code;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyA','KeyD','KeyW','KeyS','KeyE','ShiftLeft','ShiftRight','Escape','KeyP'].includes(key)) return;
    if(e.target instanceof HTMLButtonElement && key==='Space') return;
    e.preventDefault();
    if(key==='Escape'||key==='KeyP') {if(!e.repeat)this.pause();return;}
    this.keys.add(key);
    if(e.repeat) return;
    if(this.local) {
      if(key==='KeyW'||key==='ArrowUp') this.skill('dash',key==='KeyW'?0:1);
      if(key==='KeyS'||key==='ArrowDown') this.skill('burst',key==='KeyS'?0:1);
    } else {
      if(key==='Space')this.skill('dash');
      if(key==='KeyE'||key.startsWith('Shift')) this.skill('burst');
    }
  };
  private onUp=(e:KeyboardEvent)=>this.keys.delete(e.code);
  private onBlur=()=>{
    this.keys.clear();this.pan.clear();
    for(const input of this.controls) {input.axis=0;delete input.target;}
  };
  skill(kind:'dash'|'burst',index=this.index) {
    this.controls[index][kind]=true;
    this.heldUntil[index][kind]=performance.now()+92;
  }
  pointerDown(e:PointerEvent) {
    if(!this.frame || this.frame.paused || this.frame.phase==='result') return;
    const target=e.currentTarget as HTMLElement, rect=target.getBoundingClientRect();
    if(e.clientY<rect.top+rect.height*.37) return;
    const index=this.local?Number(e.clientX>rect.left+rect.width/2):this.index;
    if([...this.pan.values()].some(p=>p.index===index)) return;
    e.preventDefault(); target.setPointerCapture(e.pointerId);
    this.pan.set(e.pointerId,{index,x:e.clientX,target:this.predicted?.index===index?this.predicted.x:this.frame.pilots[index].x});
  }
  pointerMove(e:PointerEvent) {
    const p=this.pan.get(e.pointerId);
    if(!p) return;
    p.target=clamp(p.target+(e.clientX-p.x)*R.width/(e.currentTarget as HTMLElement).clientWidth*R.touch,R.edge,R.width-R.edge);
    p.x=e.clientX;this.controls[p.index].target=p.target;
  }
  pointerEnd(e:PointerEvent) {
    const p=this.pan.get(e.pointerId);
    if(!p) return;
    delete this.controls[p.index].target;this.pan.delete(e.pointerId);
  }
  private sample(index:number) {
    const k=this.keys;
    const axis=(Number(k.has('KeyD'))-Number(k.has('KeyA')))*(this.local?Number(index===0):1)
      +(Number(k.has('ArrowRight'))-Number(k.has('ArrowLeft')))*(this.local?Number(index===1):1);
    const pad=navigator.getGamepads?.()[this.local?index:0];
    const joy=pad && Math.abs(pad.axes[0])>.15?pad.axes[0]:0;
    this.controls[index].axis=clamp(axis||joy,-1,1);
    if(pad?.buttons[0]?.pressed) this.controls[index].dash=true;
    if(pad?.buttons[2]?.pressed) this.controls[index].burst=true;
  }
  private pulse=(now:number)=>{
    this.loop=requestAnimationFrame(this.pulse);
    const elapsed=Math.min(.1,(now-this.last)/1000);
    this.last=now;
    if(!this.frame && !this.flight && !this.peersLost) return;
    if(this.peersLost && this.room && this.frame?.phase!=='result') {
      const gap=now-this.peersLost;
      if(gap>30000) {
        if(this.flight) {
          this.flight.drone=true;
          if(this.lostPaused) this.flight.pause();
          this.lostPaused=false;
          this.update({notice:'drone'});
        } else if(this.frame) {
          this.frame={...this.frame,phase:'result',result:'abandoned',paused:false,dust:Math.floor(this.frame.dust*.7)};
          this.update({notice:'hostLeft',frame:this.frame});
        } else {this.leave();this.update({fault:'closed'});}
        this.peersLost=0;this.lastConnectionNotice='';
      } else {
        if(gap>3000 && this.lastConnectionNotice!=='unstable') {this.lastConnectionNotice='unstable';this.update({notice:'unstable'});}
        if(gap>10000 && this.flight && !this.frame?.paused) {this.flight.pause();this.lostPaused=true;}
      }
    }
    this.sample(this.index);if(this.local)this.sample(1);
    if(this.flight) {
      if(!document.hidden) this.acc+=elapsed;
      while(this.acc>=1/R.hz) {
        this.acc-=1/R.hz;
        const second=this.local?this.controls[1]:now-this.lastInput<300?this.remote:{axis:0};
        this.flight.step([this.controls[0],second]);
        this.controls.forEach(input=>{input.dash=false;input.burst=false;});
        this.remote.dash=false;this.remote.burst=false;
      }
      const prior=this.frame;
      this.frame=this.flight.frame();
      if(!this.room && !this.local) {
        if(this.frame.phase==='result' && prior?.phase!=='result') void storeCheckpoint(null);
        if(this.frame.stage>this.checkpointStage) {
          this.checkpointStage=this.frame.stage;void storeCheckpoint(this.flight.checkpoint());
        }
      }
      if(this.room && now>=this.netAt) {
        this.netAt=now+50;
        if(this.frame.phase!=='result') this.link.sendFrame(this.frame);
        else if(!this.sentResult) {this.sentResult=true;this.link.sendFrame(this.frame,true);}
        else this.link.sendFrame(this.frame);
      }
    } else if(this.room?.self===1 && this.frame && now>=this.netAt && this.frame.phase!=='result') {
      const input=this.controls[1];
      this.netAt=now+33;
      this.link.send({t:'input',seq:++this.sequence,input:{...input,dash:input.dash||this.heldUntil[1].dash>now,burst:input.burst||this.heldUntil[1].burst>now}},true);
      input.dash=false;input.burst=false;
    }
    const frame=this.frame;
    if(!frame)return;
    const alpha=clamp((now-this.lastSnap)/50,0,1);
    if(this.predicted && !this.flight) {
      const p=frame.pilots[1], input=this.controls[1];
      const axis=typeof input.target==='number'?clamp((input.target-this.predicted.x)/24,-1,1):input.axis;
      if(!frame.paused && frame.phase!=='countdown' && p.hull>0) this.predicted.x=clamp(this.predicted.x+axis*ships[p.ship].speed*elapsed,R.edge,R.width-R.edge);
      const diff=p.x-this.predicted.x;
      if(Math.abs(diff)>40 || frame.paused) this.predicted.x=p.x;
      else if(Math.abs(diff)>6) this.predicted.x+=diff*Math.min(1,elapsed/.08);
    }
    this.view?.draw(frame,this.settings.contrast,this.settings.reduce,this.flight?undefined:this.lastHistory,alpha,this.flight?undefined:this.predicted);
    this.audio.volume=this.settings.volume;this.audio.update(frame);
    if(now>=this.uiAt) {this.uiAt=now+80;this.update({frame});}
  };
  start() {
    this.last=performance.now();this.loop=requestAnimationFrame(this.pulse);
    window.addEventListener('keydown',this.onDown);window.addEventListener('keyup',this.onUp);
    window.addEventListener('blur',this.onBlur);document.addEventListener('visibilitychange',this.visibility);
  }
  stop() {
    cancelAnimationFrame(this.loop);this.link.disconnect(false);this.detach();
    window.removeEventListener('keydown',this.onDown);window.removeEventListener('keyup',this.onUp);
    window.removeEventListener('blur',this.onBlur);document.removeEventListener('visibilitychange',this.visibility);
  }
}
