import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { chromium } from 'playwright';
import { createGameServer } from '../gomoku/build/server/app.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFile(join(root,path),'utf8');
const config=await read('infra/render-nginx.conf.template');
const block=path=>{
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const result=config.match(new RegExp(`location ${escaped} \\{([^}]+)\\}`));
  assert.ok(result,`missing Nginx location ${path}`);return result[1];
};
test('Render Docker installs, builds, starts and routes Gomoku with its original socket path',async()=>{
 const pkg=JSON.parse(await read('package.json'));
 assert.match(pkg.scripts['build:render'],/npm run build:gomoku/);
 assert.match(pkg.scripts['build:gomoku'],/npm --prefix gomoku run build/);
 assert.match(pkg.scripts['build:gomoku'],/apps\/web\/dist\/gomoku/);
 for(const path of ['Dockerfile','apps/server/Dockerfile','apps/web/Dockerfile'])assert.match(await read(path),/npm --prefix gomoku ci --include=dev/,path);
 assert.match(await read('apps/server/Dockerfile'),/COPY gomoku gomoku/);
 assert.match(await read('docker-start.sh'),/PORT=3011 node gomoku\/build\/server\/index\.js &/);
 const socket=block('/api/gomoku/socket/');assert.match(socket,/proxy_pass http:\/\/127\.0\.0\.1:3011;/);
 assert.match(socket,/proxy_set_header Upgrade \$http_upgrade/);assert.match(socket,/proxy_set_header Connection \$connection_upgrade/);
 assert.match(block('= /api/gomoku/health'),/proxy_pass http:\/\/127\.0\.0\.1:3011\/health;/);
 assert.match(block('/gomoku/'),/alias \/app\/apps\/web\/dist\/gomoku\//);
 assert.match(block('= /gomoku'),/return 301 \/gomoku\/\$is_args\$args/);
 assert.ok((await stat(join(root,'gomoku/build/server/index.js'))).size>0);
 for(const path of ['index.html','manifest.webmanifest','sw.js','icon-192.png','icon-512.png'])assert.ok((await stat(join(root,'apps/web/dist/gomoku',path))).size>0,path);
 assert.match(await read('apps/web/dist/index.html'),/data-game="gomoku"/);
 assert.equal(await read('apps/web/dist/index.html'),await read('game-selector/index.html'));
});

test('integrated static output launches Gomoku and serves two real clients over polling and WebSocket',async()=>{
 const service=createGameServer();const clients=[];let browser;const network=new Set();
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const port=service.server.address().port;
 // The public gateway follows the checked Render routes. Docker/Nginx itself is
 // still a separate deployment check; this verifies built assets and the backend contract.
 const gateway=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/api/gomoku/socket/')||path==='/api/gomoku/health'){
   const upstream=http.request({host:'127.0.0.1',port,path:path==='/api/gomoku/health'?'/health':req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
   upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;
  }
  if(path==='/gomoku'){res.writeHead(301,{Location:`/gomoku/${new URL(req.url,'http://localhost').search}`});res.end();return;}
  const relative=path==='/'?'index.html':path==='/gomoku/'?'gomoku/index.html':path.slice(1);
  try{const body=await readFile(join(root,'apps/web/dist',relative));const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};res.setHeader('Content-Type',types[extname(relative)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}
 });
 gateway.on('connection',socket=>{network.add(socket);socket.on('close',()=>network.delete(socket));});
 gateway.on('upgrade',(req,downstream,head)=>{
  if(!req.url.startsWith('/api/gomoku/socket/')){downstream.destroy();return;}
  const upstream=http.request({host:'127.0.0.1',port,path:req.url,headers:req.headers});
  upstream.on('upgrade',(response,target,targetHead)=>{
   downstream.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${response.rawHeaders.reduce((s,v,i)=>s+v+(i%2?'\r\n':': '),'')}\r\n`);
   if(head.length)target.write(head);if(targetHead.length)downstream.write(targetHead);
   target.pipe(downstream);downstream.pipe(target);
   target.on('error',()=>downstream.destroy());downstream.on('error',()=>target.destroy());downstream.on('close',()=>target.destroy());
  });upstream.on('error',()=>downstream.destroy());upstream.end();
 });
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${gateway.address().port}`;
 const call=(s,event,data={})=>s.timeout(5000).emitWithAck(event,data).then(ack=>{assert.equal(ack.ok,true,ack.error);return ack;});
 const connect=async transport=>{const s=io(origin,{path:'/api/gomoku/socket',transports:[transport],upgrade:false,forceNew:true,reconnection:false});clients.push(s);await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;};
 try{
  assert.equal((await fetch(`${origin}/gomoku`,{redirect:'manual'})).headers.get('location'),'/gomoku/');
  assert.equal((await (await fetch(`${origin}/api/gomoku/health`)).json()).game,'gomoku');
  const html=await (await fetch(`${origin}/gomoku/`)).text();assert.match(html,/천원/);
  for(const asset of [...html.matchAll(/(?:src|href)="(\/gomoku\/[^\"]+)"/g)].map(m=>m[1]))assert.equal((await fetch(origin+asset)).status,200,asset);
  const a=await connect('polling'),b=await connect('websocket');
  const room=await call(a,'room:create',{name:'흑석'});await call(b,'room:join',{name:'백석',code:room.code});
  await call(a,'room:ready');await call(b,'room:ready');await call(a,'room:start');await call(a,'game:action',{type:'ready'});await call(b,'game:action',{type:'ready'});
  const game=service.rooms.get(room.code).game;const actor=game.turn===room.playerId?a:b;
  await call(actor,'game:action',{type:'place',cell:84});assert.ok(service.rooms.get(room.code).game.board[84]);
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.locator('[data-game="gomoku"] .card-main').click();await page.waitForURL(`${origin}/gomoku/`);
  await page.getByLabel('대국자 이름').fill('Render 대국자');await page.getByRole('button',{name:'대국 시작 · 방 만들기',exact:true}).click();
  await page.getByRole('heading',{name:'달이 머무는 대기실'}).waitFor();assert.deepEqual(errors,[]);
 }finally{clients.forEach(s=>s.disconnect());await browser?.close();network.forEach(s=>s.destroy());await new Promise(resolve=>gateway.close(resolve));await service.close();}
});
