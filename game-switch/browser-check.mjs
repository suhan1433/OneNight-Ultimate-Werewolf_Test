import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import express from 'express';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { entry, games } from './catalog.ts';

// Use the production URL layout, including the Nginx Socket.IO rewrites.
export async function browserCheck({ servers, connect, call }) {
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
        await host.locator('.club-switch-trigger').click({force:true});
        await host.locator(`.club-switch-choices button[data-game="${target}"]`).click();
        await Promise.all(pages.map(page=>page.waitForURL(url=>url.pathname===`/${target}/`&&!url.hash,{timeout:20000})));
        await Promise.all(pages.map(page=>page.locator('.club-switch-trigger').waitFor({state:'visible',timeout:15000})));
        const stored=await Promise.all(pages.map(page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),games[target].key)));
        assert.equal(new Set(stored.map(s=>s.playerId??s.id)).size,count);
        console.log(`BROWSER PASS → ${target}: ${count} mobile pages navigated and resumed`);
      }
      await Promise.all(contexts.map(context=>context.close()));
    }
  } finally { await browser?.close(); proxy.closeAllConnections(); await new Promise(resolve=>proxy.close(resolve)); }
}
