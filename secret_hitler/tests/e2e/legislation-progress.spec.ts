import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../../apps/server/src/server';
import { createGame, transition, eligibleChancellors } from '../../packages/rules-engine/src/index';
import type { RoomView } from '../../packages/shared-types/src/index';

for (const [width, height, reduced] of [[390,844,false],[1440,1050,false],[844,390,true]] as const) {
  test(`입법 대기 ${width}px: 비공개 진행 표시·2장 전달·즉시 조작·모션 ${reduced ? '줄임' : '기본'}`, async ({ page, browser }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const dataDir = mkdtempSync(join(tmpdir(), 'sh-progress-'));
    const token = `test-${'x'.repeat(40)}`, code = 'ABCDEF', rng = () => .42;
    const players = Array.from({length:5},(_,i)=>({id:randomUUID(),name:`의원 ${i+1}`,avatar:i}));
    let game = createGame(players,rng);
    for(const p of players) game=transition(game,p.id,{type:'acknowledge'},rng);
    game.president=players[0].id;
    game=transition(game,game.president,{type:'nominate',target:eligibleChancellors(game)[0]},rng);
    for(const p of players) game=transition(game,p.id,{type:'vote',ja:true},rng);
    for(const p of players) game=transition(game,p.id,{type:'acknowledge'},rng);
    const president=game.president, chancellor=game.chancellor!, observer=players.find(p=>p.id!==president&&p.id!==chancellor)!;
    const session=(id:string)=>({code,id,token});
    const room={code,version:1,hostId:president,members:players.map(p=>({...p,tokenHash:createHash('sha256').update(token).digest('hex'),ready:true,connected:true,bot:![president,chancellor,observer.id].includes(p.id),spectator:false})),settings:{maxPlayers:5,timerSeconds:0,language:'ko'},game,chat:[],paused:false,deadline:null,updated:Date.now(),created:Date.now(),processed:{}};
    writeFileSync(join(dataDir,`${code}.jsonl`),JSON.stringify({state:room})+'\n');
    const server=createGameServer({dataDir,botDelayMs:1000000});
    await new Promise<void>(resolve=>server.server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${(server.server.address() as {port:number}).port}`;
    const call=(socket:Socket,event:string,data:unknown)=>new Promise<void>((resolve,reject)=>socket.timeout(5000).emit(event,data,(err:Error|null,ack:{ok:boolean;error?:string})=>err?reject(err):ack.ok?resolve():reject(Error(ack.error))));
    const actor=io(origin,{path:'/secret_hitler/socket.io',transports:['websocket'],forceNew:true,autoConnect:false});
    let presidentView:RoomView|undefined, publicView:RoomView|undefined;
    actor.on('ROOM_STATE',(value:RoomView)=>presidentView=value);
    const actorContext=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
    try {
      await new Promise<void>((resolve,reject)=>{actor.once('connect',resolve);actor.once('connect_error',reject);actor.connect();});
      await call(actor,'RESUME',session(president));
      page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
        if(typeof payload!=='string'||!payload.startsWith('42'))return;
        try {const [event,value]=JSON.parse(payload.slice(2));if(event==='ROOM_STATE')publicView=value;}catch{}
      }));
      await page.addInitScript(value=>localStorage.setItem('sh-session',JSON.stringify(value)),session(observer.id));
      await actorContext.addInitScript(value=>localStorage.setItem('sh-session',JSON.stringify(value)),session(chancellor));
      const chancellorPage=await actorContext.newPage();
      await chancellorPage.goto(`${origin}/secret_hitler/`);
      await page.goto(`${origin}/secret_hitler/`);
      const progress=page.locator('.legislation-progress');
      const namesUncovered=async()=>{
        await progress.scrollIntoViewIfNeeded();
        await expect.poll(()=>progress.locator('.legislation-official b').evaluateAll(names=>names.every(name=>{
          const rect=name.getBoundingClientRect();
          return document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===name;
        }))).toBe(true);
      };
      await expect(progress.locator('[role="status"] strong')).toHaveText('대통령이 정책을 검토 중입니다.');
      await expect(progress.locator('.legislation-paper')).toHaveCount(3);
      await expect(progress.locator('[aria-current="step"]')).toContainText('대통령 검토');
      await expect(page.locator('.policy-hand')).toHaveCount(0);
      expect(publicView?.game?.hand).toBeUndefined();
      expect(presidentView?.game?.hand).toHaveLength(3);
      await namesUncovered();
      await page.screenshot({path:`test-results/legislation-review-${width}.png`});
      await call(actor,'ACTION',{version:presidentView!.game!.version,requestId:randomUUID(),action:{type:'discard',index:0}});
      await expect(progress.locator('[role="status"] strong')).toHaveText('수상에게 정책 2장이 전달되었습니다.');
      await expect(progress.locator('.legislation-paper')).toHaveCount(2);
      await expect(progress.locator('[aria-current="step"]')).toContainText('2장 전달');
      // The recipient can act immediately, even while others see the handoff.
      await expect(chancellorPage.locator('.policy-hand .policy-card')).toHaveCount(2);
      await expect(chancellorPage.locator('.policy-card').first()).toBeEnabled();
      await expect(chancellorPage.locator('.legislation-progress')).toHaveCount(0);
      expect(publicView?.game?.hand).toBeUndefined();
      expect(await progress.locator('.policy-face,.policy-card,.liberal,.fascist').count()).toBe(0);
      const animation=await progress.locator('.legislation-papers').evaluate(el=>getComputedStyle(el).animationName);
      expect(animation).toBe(reduced?'none':'legislation-pass');
      await page.screenshot({path:`test-results/legislation-handoff-${width}.png`});
      await expect(progress.locator('[role="status"] strong')).toHaveText('수상이 제정할 정책을 고르는 중입니다.');
      await expect(progress.locator('[aria-current="step"]')).toContainText('수상 검토');
      await namesUncovered();
      expect(await progress.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await progress.scrollIntoViewIfNeeded();
      await expect(progress).toBeInViewport();
      await page.screenshot({path:`test-results/legislation-chancellor-${width}.png`});
      // Reconnecting at the current phase must not replay an old card transfer.
      await page.reload();
      await expect(progress.locator('[role="status"] strong')).toHaveText('수상이 제정할 정책을 고르는 중입니다.');
      await expect(progress).not.toHaveClass(/is-transferring/);
      await chancellorPage.locator('.policy-card').first().dblclick();
      await expect(progress).toHaveCount(0,{timeout:15000});
    } finally {
      await page.goto('about:blank');await actorContext.close();actor.disconnect();await server.close();rmSync(dataDir,{recursive:true,force:true});
    }
  });
}
