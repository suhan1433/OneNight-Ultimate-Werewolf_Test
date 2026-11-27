import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Frame } from '../core/sim/flight';
import { buildBalance, resonances } from '../data/builds';
import { combat, patterns, rules as R, stages } from '../data/flight';

export const pilotColors = [0x9bffda,0xffaa89];
const hostileColors=[0xff7fb6,0xb7a0ff,0xfcb38b,0x8fc7fd,0xfe9a73,0xddafe9,0xfda18b,0xbe93ff];
const stars = Array.from({length:120},(_,i)=>({
  x:((i*193+36)%541),y:(i*139+81)%960,layer:i%3, radius:i%7===0?1.8:.9,
}));
export class FlightRender {
  private app = new Application();
  private scenery = new Graphics();
  private stars = new Graphics();
  private ink = new Graphics();
  private ships = new Graphics();
  private projectileLayer = new Container();
  private projectiles:Sprite[] = [];
  private textures:Texture[] = [];
  private theme=0;
  private previousFrame?:Frame;
  private previousOptions='';
  private pulseUntil=[0,0];
  private pulseColors=[0xffc264,0xffc264];
  private activeProjectiles=0;
  private ready = false;
  private closed = false;
  async attach(element:HTMLElement) {
    await this.app.init({width:R.width,height:R.height,background:0x090e19,resolution:Math.min(devicePixelRatio*element.clientWidth/R.width,1.65),antialias:false,preference:'webgl',autoStart:false, powerPreference:'low-power'});
    if (this.closed) {this.app.destroy(true,{children:true});return;}
    this.ready=true;
    const round=(outline:number)=>new Graphics().circle(10,10,7).fill(0xff789f).stroke({color:outline,width:2}).circle(10,10,2).fill(0xffe5ee);
    for(const graphic of [round(0xffc2d1),round(0xffffff)]) {
      this.textures.push(this.app.renderer.generateTexture(graphic));
      graphic.destroy();
    }
    this.app.stage.addChild(this.scenery,this.stars,this.ink,this.projectileLayer,this.ships);
    this.app.canvas.setAttribute('aria-hidden','true');
    element.append(this.app.canvas);
  }
  destroy() {
    this.closed=true;
    if(this.ready) {
      this.app.destroy(true,{children:true});
      this.textures.forEach(texture=>texture.destroy(true));
    }
  }
  draw(f:Frame, contrast:boolean, reduce:boolean, previous?:Frame, alpha=1, predicted?:{index:number;x:number}) {
    if(!this.ready) return;
    const options=String(contrast)+String(reduce);
    if(this.previousFrame===f && options===this.previousOptions && (f.paused||!previous))return;
    const last=this.previousFrame;
    if(last?.id===f.id && f.t>last.t) for(const [i,p] of f.pilots.entries()) {
      const previous=last.pilots[i];
      if(p.hits>previous.hits || p.shield>previous.shield+4 || p.grazes>previous.grazes) {
        this.pulseUntil[i]=f.t+22;
        this.pulseColors[i]=p.hits>previous.hits?0xff779f:p.shield>previous.shield+4?0x8bccff:0xffc264;
      }
    }
    this.previousFrame=f;this.previousOptions=options;
    let g=this.ink.clear();
    const age=f.t/R.hz;
    const theme=stages[(f.stage-1)%stages.length], tint=theme.tint;
    const X = (index:number) => predicted?.index===index?predicted.x:
      previous ? previous.pilots[index].x+(f.pilots[index].x-previous.pilots[index].x)*alpha:f.pilots[index].x;
    if(this.theme!==f.stage) {
      this.theme=f.stage;
      const background=this.scenery.clear();
      for(let i=0;i<5;i++) background.circle(270,328,430-i*82).fill({color:tint,alpha:.022});
      for(let i=0;i<7;i++) background.ellipse(270,370,75+i*58,133+i*55).stroke({color:tint,alpha:.09,width:1});
    }
    const dust=this.stars.clear();
    for(const s of stars) {
      const y=(s.y+(reduce?0:age*[20,38,68][s.layer]))%R.height;
      dust.rect(s.x,y,s.radius,s.radius).fill({color:s.layer===1?tint:0xe7f1fb,alpha:[.25,.36,.65][s.layer]});
    }
    g.moveTo(0,R.flightY).lineTo(R.width,R.flightY).stroke({color:tint,alpha:.22,width:1});
    for(let x=30;x<=510;x+=30) g.moveTo(x,R.flightY-6).lineTo(x,R.flightY+6).stroke({color:tint,alpha:.25,width:1});

    const [a,b]=f.pilots, y=R.flightY, ax=X(0), bx=X(1);
    if(f.linked) {
      const fieldTint=f.strategy.active?resonances[f.strategy.active].color:tint;
      const fieldHeight=f.strategy.anchor?buildBalance.anchor.height:R.linkHeight;
      g.rect(Math.min(ax,bx),y-fieldHeight,Math.abs(ax-bx),fieldHeight).fill({color:fieldTint,alpha:f.strategy.active?.11:.045});
      g.moveTo(ax,y).quadraticCurveTo((ax+bx)/2,y-120,bx,y).stroke({color:tint,width:10,alpha:.14});
      g.moveTo(ax,y).quadraticCurveTo((ax+bx)/2,y-120,bx,y).stroke({color:0xd1fff2,width:2,alpha:.85});
      g.circle((ax+bx)/2,y-60,4).fill(fieldTint);
    } else if(a.hull&&b.hull) {
      const start=Math.min(ax,bx),end=Math.max(ax,bx);
      for(let pos=start;pos<end;pos+=14) g.moveTo(pos,y).lineTo(Math.min(pos+6,end),y).stroke({color:0x9bb4c3,width:2,alpha:.45});
    }
    if(f.warning>=0) {
      const gap=patterns.wall.gap, left=f.warning-gap/2,right=f.warning+gap/2;
      g.rect(0,240,left,540).fill({color:0xff6ea5,alpha:.085});
      g.rect(right,240,R.width-right,540).fill({color:0xff6ea5,alpha:.085});
      g.rect(left,240,gap,R.flightY-217).fill({color:tint,alpha:.1}).stroke({color:tint,alpha:.8,width:2});
      g.moveTo(left,R.flightY).lineTo(right,R.flightY).stroke({color:tint,alpha:.9,width:5});
    }
    for(const [x,yDrop,type] of f.drops) {
      const color=[0x9dffe0,0xffda93,0xf9acc4,0xaf95ff][type];
      g.poly([x,yDrop-7,x+5,yDrop,x,yDrop+7,x-5,yDrop]).fill(color);
    }
    for(const enemy of f.enemies) {
      const [id,type,x,yEnemy,hp,tell,shell,shock]=enemy;
      const x0=x,y0=yEnemy,color=hostileColors[type], r=type===7?85:type===6?38:17+type;
      if(tell) {
        g.rect(x0-combat.ramWidth/2,104,combat.ramWidth,R.flightY-75).fill({color,alpha:.2});
        g.moveTo(x0-combat.ramWidth/2,104).lineTo(x0-combat.ramWidth/2,R.flightY+18).stroke({color,alpha:.8,width:2});
        g.moveTo(x0+combat.ramWidth/2,104).lineTo(x0+combat.ramWidth/2,R.flightY+18).stroke({color,alpha:.8,width:2});
        g.poly([x0-10,R.flightY-24,x0+10,R.flightY-24,x0,R.flightY-12]).fill(color);
      }
      if(type===7) {
        if(f.strategy.exposed>0)g.circle(x0,y0,106).stroke({color:0xffe6a0,width:4,alpha:.9});
        g.circle(x0,y0,f.bossCore).stroke({color:f.bossCore>theme.core?0x9eeaff:0xffecd6,width:2,alpha:.7});
        g.circle(x0,y0,104).stroke({color,width:2,alpha:.25});
        const variant=(f.stage-1)%stages.length;
        if(variant===1)for(const side of [-1,1])for(let i=0;i<3;i++) {
          const anchor=side*(54+i*18);
          g.moveTo(x0+side*24,y0-20).quadraticCurveTo(x0+anchor,y0+16,x0+anchor+side*16,y0+80-i*13)
            .stroke({color,width:8-i*2,alpha:.7});
        }
        if(variant===2)for(const side of [-1,1]) {
          g.roundRect(x0+side*78-22,y0-58,44,111,10).fill({color,alpha:.35}).stroke({color,width:3});
          g.moveTo(x0+side*78,y0+52).lineTo(x0+side*32,y0+93).stroke({color,width:6,alpha:.6});
        }
        if(variant===3)for(const side of [-1,1]) {
          const center=x0+side*79;
          g.poly([center,y0-80,center+29,y0,center,y0+70,center-29,y0]).fill({color,alpha:.35}).stroke({color,width:2});
        }
        if(variant===4)for(const ring of [57,77,113])g.ellipse(x0,y0,ring,ring*.41).stroke({color,width:2,alpha:.72});
        if(variant===0)for(const s of [-1,1]) {
          g.poly([x0,y0-22,x0+s*106,y0-54,x0+s*76,y0+21,x0+s*29,y0+65]).fill({color,alpha:.23}).stroke({color,width:2});
          g.moveTo(x0,y0).lineTo(x0+s*103,y0-52).stroke({color,width:2,alpha:.55});
        }
      }
      g.poly([x0,y0-r*.85,x0+r,y0-r*.13,x0+r*.42,y0+r*.64,x0,y0+r*.95,x0-r*.42,y0+r*.64,x0-r,y0-r*.13])
        .fill({color,alpha:.22}).stroke({color,width:type>=6?3:1.5});
      g.circle(x0,y0,r*.24).fill({color,alpha:.9});
      if(type!==7 && hp<100) {
        g.rect(x0-r,y0-r-8,r*2,3).fill({color,alpha:.23});
        g.rect(x0-r,y0-r-8,r*2*hp/100,3).fill(color);
      }
      if(shock>24)g.circle(x0,y0,r+8+(52-shock)/1.4).stroke({color:0xcef4ff,width:2,alpha:.7});
      if(shell)g.circle(x0,y0,r+8).stroke({color:0xb58aff,width:3,alpha:.9});
      if(type===7) g.circle(x0,y0,8+((id+f.bossPhase)*3)%12).fill(0xfbe5ff);
    }
    let count=0;
    for(const [x,bY,owner,kind] of f.bullets) {
      let sprite=this.projectiles[count];
      if(!sprite) {
        sprite=new Sprite(Texture.WHITE);sprite.anchor.set(.5);
        this.projectiles.push(sprite);this.projectileLayer.addChild(sprite);
      }
      if(owner>=0) {
        sprite.texture=Texture.WHITE;sprite.width=kind===buildBalance.skyneedle.kind?9:4;sprite.height=kind===buildBalance.skyneedle.kind?29:19;
        sprite.tint=pilotColors[owner];sprite.alpha=contrast?.42:.88;
      } else {
        sprite.texture=this.textures[Number(contrast)];sprite.width=sprite.height=kind===2?20:14;
        sprite.tint=0xffffff;sprite.alpha=1;
      }
      sprite.position.set(x,bY);sprite.visible=true;count++;
    }
    for(let i=count;i<this.activeProjectiles;i++) this.projectiles[i].visible=false;
    this.activeProjectiles=count;
    g=this.ships.clear();
    for(const [i,p] of f.pilots.entries()) {
      const x=X(i), color=pilotColors[i];
      if(!p.hull) {
        if(p.wreck>0) {
          g.circle(x,y,23).stroke({color,width:2,alpha:.6});
          g.moveTo(x-8,y).lineTo(x+8,y).moveTo(x,y-8).lineTo(x,y+8).stroke({color,width:2});
          g.arc(x,y,29,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,p.revive/(f.linked?R.linkRevive:R.revive))).stroke({color:0xffffff,width:3});
        }
        continue;
      }
      g.ellipse(x,y+11,27,9).fill({color,alpha:.16});
      g.poly([x-7,y+14,x,y+(p.dash?63:36),x+7,y+14]).fill({color,alpha:.6});
      g.poly([x,y-28,x+23,y+18,x+8,y+12,x,y+16,x-8,y+12,x-23,y+18])
        .fill({color,alpha:.26}).stroke({color,width:2.5});
      g.poly([x,y-24,x+8,y+7,x,y+13,x-8,y+7]).fill(color);
      if(p.shield===0||p.inv>0) g.circle(x,y,30).stroke({color,width:p.inv?2:1,alpha:p.inv?.85:.44});
      g.circle(x,y,3.5).fill(0xffffff);
      const left=this.pulseUntil[i]-f.t;
      if(left>0) g.circle(x,y,20+(reduce?8:(22-left)*1.25)).stroke({color:this.pulseColors[i],width:3,alpha:left/22*.85});
      if(p.drive>0)g.circle(x,y,34).stroke({color:0xffc264,width:2,alpha:.8});
    }
    if(f.flash>0) {
      const center=(ax+bx)/2;
      g.rect(center-42,0,84,y).fill({color:0xdafef6,alpha:Math.min(.22,f.flash*.2)});
      g.rect(center-5,0,10,y).fill({color:0xdafef6,alpha:Math.min(.6,f.flash*.6)});
    }
    const [kind,x,,until]=f.signal;
    if(kind>=0&&until>f.t) g.circle(x,y-66,18).stroke({color:[0xa2ffd7,0xff9eb9,0xffd48e,0xb8a9ff][kind],width:4});
    this.app.render();
  }
}
