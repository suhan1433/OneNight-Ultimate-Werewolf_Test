import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, webkit } from "@playwright/test";
import { io } from "socket.io-client";
import { createGameServer } from "../server/app.ts";
import { createGame, gameView } from "../shared/engine.ts";

const artifacts = fileURLToPath(
  new URL(
    `../artifacts/tactical-${process.env.MOBILE_BROWSER || "chromium"}/`,
    import.meta.url,
  ),
);
await mkdir(artifacts, { recursive: true });
const backend = createGameServer();
await new Promise((resolve) => backend.server.listen(0, "127.0.0.1", resolve));
const vite = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    proxy: {
      "/api/gomoku/socket": {
        target: `http://127.0.0.1:${backend.server.address().port}`,
        ws: true,
      },
    },
  },
});
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const engine = process.env.MOBILE_BROWSER === "webkit" ? webkit : chromium;
let browser;
try {
  browser = await engine.launch({
    headless: true,
    ...(engine === chromium
      ? { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }
      : {}),
  });
} catch (error) {
  if (engine === webkit) {
    await vite.close();
    await backend.close();
    throw error;
  }
  browser = await chromium.launch({ headless: true });
}
const peers = [];
const errors = [];
function publish(room) {
  for (const p of room.seats) {
    if (p.socketId)
      backend.io
        .to(p.socketId)
        .emit("state", {
          code: room.code,
          host: room.host,
          self: p.id,
          public: room.public,
          tutorial: room.tutorial,
          serverTime: Date.now(),
          seats: room.seats.map(({ token, socketId, ...s }) => s),
          chat: room.chat,
          game: room.game ? gameView(room.game, p.id) : null,
        });
  }
}
async function check(page,label) {
  const layout=await page.evaluate(()=>{
    const box=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,board:box('.board'),controls:box('.turn-controls'),arena:box('.arena')};
  });
  assert.ok(layout.scroll<=layout.width+1,`${label}: horizontal overflow`);
  if(layout.controls?.h && label.includes('turn') && layout.width<=700) {
    assert.ok(layout.controls.y>=0,`${label}: controls outside viewport`);
    assert.ok(layout.controls.y+layout.controls.h<=layout.height+1,`${label}: controls below viewport`);
    assert.ok(layout.board.w>layout.width*.7 || layout.width>layout.height,`${label}: board shrunk`);
  }
  await page.screenshot({path:`${artifacts}/${label}.png`,fullPage:true});
  console.log(label,JSON.stringify(layout));
}
function tacticalFixture(room) {
 const g=createGame(room.seats.map(p=>({id:p.id,name:p.name})),123,Date.now(),{ruleset:'focused',prepSeconds:25,turnSeconds:45});
 const id=room.host,enemy=g.players.find(p=>p.id!==id).id;
 g.phase='turn';g.turn=id;g.ply=10;g.round=2;g.deadline=Date.now()+45000;
 function put(c,owner,hero='plain',protection=-1) {g.board[c]={uid:`s${c}`,owner,hero,star:1,copies:hero==='plain'?0:1,paid:0,placed:0,protectedUntil:protection,sealedUntil:0,shield:false,shieldRegen:0,cooldown:0,uses:0,tokenUntil:0};}
 put(68,id,'thunder');put(70,id,'ember');for(const c of [81,82,83]) put(c,enemy);put(95,enemy,'plain',11);put(168,enemy);
 room.game=g;publish(room);return g;
}
try {
for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[667,375],[768,1024],[1024,768]].filter(([w])=>!process.env.MOBILE_WIDTH || w===Number(process.env.MOBILE_WIDTH))) {
 const context=await browser.newContext({viewport:{width,height},isMobile:width<=700,hasTouch:true});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/gomoku/`);
 await page.locator('.connection-banner').waitFor({state:'hidden'});
 await page.getByLabel('대국자 이름').fill('전술 검토');
 await page.getByRole('button',{name:'대국 시작 · 방 만들기',exact:true}).click();
 await page.locator('.lobby').waitFor();
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('cheonwon-session')));
 const room=backend.rooms.get(session.code);
 const peer=io(origin,{path:'/api/gomoku/socket',transports:['websocket'],forceNew:true});peers.push(peer);
 await new Promise(r=>peer.once('connect',r));
 await peer.timeout(5000).emitWithAck('room:join',{code:session.code,name:'상대'});
 await peer.timeout(5000).emitWithAck('room:ready',{});
 await page.getByRole('button',{name:'준비 완료',exact:true}).click();
 await page.getByRole('button',{name:'대국 시작',exact:true}).click();
 await page.locator('.supply-panel').waitFor();
 await page.locator('.act-card').waitFor({state:'hidden'});
 assert.equal(room.game.ruleset,'focused');
 await check(page,`${width}-supply`);
 const me=room.game.players.find(p=>p.id===room.host);
 await page.getByRole('button',{name:'보호 구매',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.supply-inventory>b')?.textContent.includes('4/6'));
 assert.equal(me.gold,3); // reducer replaces the state; original object stays immutable
 assert.equal(room.game.players.find(p=>p.id===room.host).gold,2);
 await page.getByRole('button',{name:'이 구성으로 대국 시작',exact:true}).click();
 await peer.timeout(5000).emitWithAck('game:action',{type:'ready'});
 await page.locator('.phase-turn').waitFor();
 tacticalFixture(room);
 await page.locator('.intersection').nth(82).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.skill-chip').length===2);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(100);
 await check(page,`${width}-turn`);
 const stone=page.locator('.intersection').nth(68);
 await stone.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true,button:0});
 await page.waitForTimeout(300);
 await stone.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',isPrimary:true,button:0});
 await page.waitForTimeout(200);
 assert.equal(await page.getByRole('dialog',{name:'석혼 상세',exact:true}).count(),0);
 await stone.dispatchEvent('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:true,button:0});
 await page.waitForTimeout(500);
 await stone.dispatchEvent('pointerup',{pointerId:2,pointerType:'touch',isPrimary:true,button:0});
 await page.getByRole('dialog',{name:'석혼 상세',exact:true}).waitFor();
 await page.getByRole('dialog',{name:'석혼 상세',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
 // Deployment location sets the next skill's reach.
 await page.locator('.bench-main').filter({has:page.locator('b',{hasText:'밀기'})}).first().click();
 await page.locator('.intersection').nth(14).click();
 assert.ok(await page.locator('.deployment-range').count()>1);
 await page.getByRole('button',{name:'취소',exact:true}).click();
 // Bench choice, exact placement, one-cell correction, and explicit end turn.
 await page.locator('.bench-main').filter({has:page.locator('b',{hasText:'보호'})}).first().click();
 await page.locator('.intersection').nth(14).click();
 await page.getByRole('button',{name:'한 칸 오른쪽',exact:true}).click();
 assert.equal(await page.locator('.intersection').nth(15).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'착수 확정',exact:true}).click();
 await page.getByRole('button',{name:'턴 마치기',exact:true}).waitFor();
 assert.equal(room.game.turn,room.host);
 assert.equal(room.game.board[15].hero,'guard');
 await check(page,`${width}-placed`);
 await page.reload();
 await page.locator('.phase-turn').waitFor();
 assert.ok((await page.locator('.intersection').nth(15).getAttribute('aria-label')).includes('견습 수호병'));
 await page.getByRole('button',{name:'턴 마치기',exact:true}).click();
 await page.getByRole('button',{name:'상대 차례',exact:true}).waitFor();
 tacticalFixture(room);
 await page.getByRole('button',{name:/^스킬 \d+$/}).click();
 await page.getByRole('button',{name:/봉인 · D8.*지금 사용/}).click();
 assert.equal(await page.locator('.intersection').nth(95).evaluate(e=>e.classList.contains('valid')),false);
 assert.equal(await page.locator('.intersection').nth(168).evaluate(e=>e.classList.contains('valid')),false);
 assert.equal(await page.locator('.intersection').nth(82).evaluate(e=>e.classList.contains('valid')),true);
 await page.locator('.intersection').nth(82).click();
 await page.getByRole('button',{name:'스킬 확정',exact:true}).waitFor();
 assert.ok((await page.locator('.tactical-preview').textContent()).includes('3목'));
 await check(page,`${width}-seal-preview`);
 await page.getByRole('button',{name:'스킬 확정',exact:true}).click();
 await page.locator('.tactical-feedback').filter({hasText:'3목'}).waitFor();
 assert.ok(room.game.board[82].sealedUntil>room.game.ply);
 tacticalFixture(room);
 await page.getByRole('button',{name:/^스킬 \d+$/}).click();
 await page.getByRole('button',{name:/밀기 · F8.*지금 사용/}).click();
 await page.locator('.intersection').nth(82).click();
 assert.equal(await page.locator('.intersection').nth(168).evaluate(e=>e.classList.contains('valid')),false);
 await page.locator('.intersection').nth(69).click();
 assert.ok((await page.locator('.tactical-preview').textContent()).includes('3목'));
 await page.getByRole('button',{name:'스킬 확정',exact:true}).click();
 await page.locator('.tactical-feedback').filter({hasText:'3목'}).waitFor();
 assert.equal(room.game.board[82],null);assert.ok(room.game.board[69]);
 if(width<=700) {
  await page.getByRole('button',{name:'상대·기록',exact:true}).click();
  await page.getByRole('button',{name:'기록 닫기',exact:true}).click();
 }
 room.game.phase='result';room.game.winner=room.host;room.game.reason='전술 검증 완료';publish(room);
 await page.locator('.result-overlay').waitFor();
 await check(page,`${width}-result`);
 await context.close();peer.disconnect();
}
assert.deepEqual(errors,[]);console.log('Tactical browser flows passed');
} finally {peers.forEach(p=>p.disconnect());await browser.close();await vite.close();await backend.close();}
