import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { entry, games } from './catalog.ts';

// Use the production URL layout, including the Nginx Socket.IO rewrites.
export async function browserCheck({ servers, connect, call, createBotLobby }) {
  const routes = Object.entries(games).map(([game, config]) => ({
    prefix: config.path.replace(/\/$/, '') + '/',
    target: new URL(servers[game]),
    path: game === 'secret_hitler' ? '/secret_hitler/socket.io/' : '/socket.io/',
  }));
  const app = express();
  const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
  app.use('/secret_hitler',express.static(fileURLToPath(new URL('../secret_hitler/apps/client/dist/',import.meta.url))));
  app.use(express.static(dist));
  const proxy = http.createServer((req, res) => {
    const route = routes.find(route => req.url.startsWith(route.prefix));
    if (!route) return app(req,res);
    const upstream = http.request({ hostname: route.target.hostname, port: route.target.port, path: req.url.replace(route.prefix,route.path), method: req.method, headers:req.headers }, reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });
  proxy.on('upgrade',(req,socket,head)=>{
    const route=routes.find(route=>req.url.startsWith(route.prefix));
    if(!route)return socket.destroy();
    const upstream=net.connect(Number(route.target.port),route.target.hostname,()=>{
      upstream.write(`${req.method} ${req.url.replace(route.prefix,route.path)} HTTP/${req.httpVersion}\r\n${Object.entries(req.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')}\r\n\r\n`);
      if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
    });
    socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy());
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${proxy.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
    // Start each real game with a participant's switch dialog open. Both the
    // trigger and the modal must disappear as soon as the lobby phase ends.
    for (const game of Object.keys(games)) {
      const seed=[]; const sessions=[]; let code;
      const count=games[game].min;
      for(let i=0;i<count;i++) {
        const socket=await connect(game); const [event,payload]=entry(game,`화면검증${i+1}`,count,code);
        const session=await call(socket,event,payload);
        await call(socket,'GAME_SWITCH_RESERVE');seed.push(socket);sessions.push(session);
        code=session.roomCode??session.code??session.roomId;
      }
      const readyEvent=game==='deception'?'ready':game==='secret_hitler'?'READY':game==='rummikub'?'room:ready':'PLAYER_READY';
      const payload=()=>({roomCode:code,code,roomId:code,requestId:crypto.randomUUID(),clientSeq:1,ready:true});
      for(const socket of seed) await call(socket,readyEvent,game==='deception'||game==='secret_hitler'?{ready:true}:payload());
      const context=await browser.newContext({viewport:{width:390,height:844}});
      try {
        const saved=game==='rummikub'?{...sessions.at(-1),name:`화면검증${count}`}:sessions.at(-1);
        await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:games[game].key,session:saved});
        const page=await context.newPage();
        await page.goto(`${origin}/${game}/`);
        const trigger=page.locator('.club-switch-trigger');
        await trigger.waitFor({state:'visible',timeout:15000});
        for(const viewport of [{width:390,height:844},{width:1440,height:900},{width:844,height:390}]) {
          await page.setViewportSize(viewport);
          await trigger.scrollIntoViewIfNeeded();
          // A normal click also checks that existing controls do not cover it.
          await trigger.click();
          await page.locator('.club-switch-dialog[open]').waitFor();
          await page.locator('.club-switch-close').click();
          const layout=await trigger.evaluate(el=>{
            const rect=el.getBoundingClientRect();
            return {position:getComputedStyle(el).position,left:rect.left,right:rect.right,width:innerWidth,slot:el.closest('.club-switch-slot')!==null,theme:el.closest('#club-game-switch').dataset.theme};
          });
          assert.equal(layout.position,'static');assert.equal(layout.slot,true);assert.equal(layout.theme,game);
          assert.ok(layout.left>=0&&layout.right<=layout.width,`${game}: button must fit viewport`);
          if(process.env.GAME_SWITCH_SCREENSHOTS) {
            await mkdir(process.env.GAME_SWITCH_SCREENSHOTS,{recursive:true});
            await page.screenshot({path:`${process.env.GAME_SWITCH_SCREENSHOTS}/${game}-${viewport.width}.png`});
          }
        }
        await trigger.click();
        const startEvent=game==='deception'?'start':game==='secret_hitler'?'START':game==='rummikub'?'game:start':'GAME_START';
        await call(seed[0],startEvent,game==='deception'||game==='secret_hitler'?{}:{...payload(),clientSeq:2});
        await trigger.waitFor({state:'hidden',timeout:15000});
        assert.equal(await page.locator('.club-switch-dialog[open]').count(),0);
        console.log(`BROWSER PASS ${game}: themed lobby control, 3 viewports, dialog closed on game start`);
      } finally {await context.close();seed.forEach(socket=>socket.disconnect());}
    }
    for(const game of Object.keys(games)) {
      const {socket,session}=await createBotLobby(game);
      await call(socket,'GAME_SWITCH_RESERVE');
      const saved=game==='rummikub'?{...session,name:'봇방 방장'}:session;
      const context=await browser.newContext({viewport:{width:390,height:844}});
      try {
        await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:games[game].key,session:saved});
        const page=await context.newPage();await page.goto(`${origin}/${game}/`);
        await page.locator('.club-switch-trigger').click();
        const choices=page.locator('.club-switch-choices button');
        assert.equal(await choices.count(),6);
        assert.equal(await page.locator('.club-switch-choices button:disabled').count(),0);
        const destination=game==='avalon'?'werewolf':'avalon';
        const previousUrl=page.url();
        await page.locator(`.club-switch-choices button[data-game="${destination}"]`).click();
        assert.equal(page.url(),previousUrl,'choosing a game must only open settings');
        await page.locator('.club-switch-settings').waitFor();
        await page.getByRole('button',{name:'게임 다시 선택'}).click();
        await page.locator(`.club-switch-choices button[data-game="${destination}"]`).click();
        if(destination==='avalon') {
          await page.locator('input[name="assassin"]').uncheck();
          assert.equal(await page.locator('.club-switch-confirm').isEnabled(),false);
          await page.locator('input[name="morgana"]').check();
          await page.locator('select[name="assassinationAbilityRole"]').selectOption(JSON.stringify('morgana'));
          await page.locator('input[name="revealVoteIdentities"]').uncheck();
        }
        await page.locator('.club-switch-confirm').click();
        await page.waitForURL(url=>url.pathname===`/${destination}/`&&!url.hash,{timeout:20000});
        await page.locator('.club-switch-trigger').waitFor({state:'visible',timeout:15000});
        await page.locator('.club-switch-trigger').click();
        assert.match(await page.locator('.club-switch-dialog p').first().textContent(),/사람 참가자 1명/);
        console.log(`BROWSER PASS ${game} → ${destination}: solo human with bots can select and move`);
      } finally {await context.close();socket.disconnect();}
    }
    for(const chain of [['werewolf','skullking','spacecrew','rummikub','werewolf'],['avalon','secret_hitler','deception','avalon']]) {
      const count=chain[0]==='avalon'?5:3;
      const contexts=[]; const pages=[];const seed=[];let code;
      for(let i=0;i<count;i++) {
        const socket=await connect(chain[0]);const [event,payload]=entry(chain[0],`브라우저${i+1}`,count,code);
        const session=await call(socket,event,payload);await call(socket,'GAME_SWITCH_RESERVE');seed.push(socket);code=session.roomCode??session.code??session.roomId;
        const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
        await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:games[chain[0]].key,session});
        const page=await context.newPage();pages.push(page);
        await page.goto(`${origin}/${chain[0]}/`);
        await page.locator('.club-switch-trigger').waitFor({state:'visible',timeout:15000});
      }
      seed.forEach(socket=>socket.disconnect());
      for(const target of chain.slice(1)) {
        const host=pages[0];
        await host.locator('.club-switch-trigger').click();
        const previousUrl=host.url();
        await host.locator(`.club-switch-choices button[data-game="${target}"]`).click();
        assert.equal(host.url(),previousUrl);
        await host.locator('.club-switch-settings').waitFor();
        if(target==='spacecrew') await host.locator('input[name="missionId"]').fill('7');
        if(target==='rummikub') await host.locator('input[name="turnSeconds"]').fill('90');
        if(target==='secret_hitler') await host.locator('select[name="timerSeconds"]').selectOption('60');
        if(target==='deception') await host.locator('select[name="cardsPerKind"]').selectOption('5');
        await host.locator('.club-switch-confirm').click();
        try {
          await Promise.all(pages.map(page=>page.waitForURL(url=>url.pathname===`/${target}/`&&!url.hash,{timeout:20000})));
        } catch(error) {
          throw Error(`${target}: ${await host.locator('[role="status"]').allTextContents()}\n${error}`);
        }
        await Promise.all(pages.map(page=>page.locator('.club-switch-trigger').waitFor({state:'visible',timeout:15000})));
        const stored=await Promise.all(pages.map(page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),games[target].key)));
        assert.equal(new Set(stored.map(s=>s.playerId??s.id)).size,count);
        console.log(`BROWSER PASS → ${target}: ${count} mobile pages navigated and resumed`);
      }
      await Promise.all(contexts.map(context=>context.close()));
    }
  } finally { await browser?.close(); proxy.closeAllConnections(); await new Promise(resolve=>proxy.close(resolve)); }
}
