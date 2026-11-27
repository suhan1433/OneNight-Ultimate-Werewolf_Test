import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 3012);
const endpoint = '/api/hushfall/socket';
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codePattern = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const rooms = new Map();
const limits = new Map();
const modes = ['voyage','endless','daily'];
const ships = ['aster','vesper','rook','pico','sol'];
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req, res) => {
  if (['/health','/api/hushfall/health'].includes(req.url)) {
    res.writeHead(200, {'Content-Type':'application/json'}).end('{"ok":true}');
    return;
  }
  const path = (req.url || '').split('?')[0];
  if (path === '/hushfall') { res.writeHead(308,{Location:'/hushfall/'}).end(); return; }
  const file = resolve(root,path === '/hushfall/' ? 'index.html' : path.slice('/hushfall/'.length));
  try {
    if (!path.startsWith('/hushfall/') || !file.startsWith(resolve(root) + '/') || !(await stat(file)).isFile()) throw Error();
    res.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream'});
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end(); }
});
const socketServer = new WebSocketServer({ noServer:true, maxPayload:32768, perMessageDeflate:false });
server.on('upgrade',(req, socket, head) => {
  const configured = process.env.LUMEN_ORIGINS?.split(',').map(s=>s.trim());
  let allowed = false;
  try { const origin = new URL(req.headers.origin); allowed = configured ? configured.includes(origin.origin) : origin.host === req.headers.host; } catch {}
  if (req.url !== endpoint || !allowed) {socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  socketServer.handleUpgrade(req,socket,head,ws=>socketServer.emit('connection',ws,req));
});

const send = (ws, value) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
};
const publish = room => room.seats.forEach((seat,index)=>send(seat?.ws,{
  t:'room', code:room.code, self:index, phase:room.phase, mode:room.mode, heat:room.heat, seed:room.seed,
  seats:room.seats.map(s=>s?{name:s.name, ship:s.ship, ready:s.ready, online:!!s.ws}:null),
}));
function detach(ws, leaving) {
  const room=ws.room;
  if (!room || room.seats[ws.index]?.ws!==ws) return;
  const seat=room.seats[ws.index];
  seat.ws=null; seat.gone=Date.now(); ws.room=null;
  if (leaving && room.phase==='lobby') {
    if (ws.index===0) {
      send(room.seats[1]?.ws,{t:'error',code:'closed'});
      room.seats[1]?.ws?.close(4001);
      rooms.delete(room.code); return;
    }
    room.seats[1]=null;
  }
  if (leaving && room.phase==='run') send(room.seats[1-ws.index]?.ws,{t:'left'});
  publish(room);
}

socketServer.on('connection',(ws,req)=>{
  let windowStart=0, messages=0;
  const ip = process.env.LUMEN_TRUST_PROXY==='1' && req.socket.remoteAddress==='127.0.0.1'
    ? req.headers['x-real-ip'] || req.socket.remoteAddress : req.socket.remoteAddress;
  ws.alive=true;
  ws.on('pong',()=>ws.alive=true);
  ws.on('error',()=>{});
  ws.on('close',()=>detach(ws,false));
  ws.on('message',(raw,binary)=>{
    if (binary) return;
    const now=Date.now();
    if (now-windowStart>=1000) {windowStart=now;messages=0;}
    if (++messages>120) {ws.close(1008);return;}
    let msg;
    try {msg=JSON.parse(raw.toString());} catch {return;}
    if (!msg || typeof msg!=='object') return;
    const fail=code=>send(ws,{t:'error',code});
    if (msg.t==='ping') {send(ws,{t:'pong',at:msg.at});return;}
    if (['create','join','resume'].includes(msg.t)) {
      if (ws.room) return;
      if (msg.proto!==3) {fail('version');return;}
      const key = ip+'|'+msg.t;
      const limit=limits.get(key)||{time:now,count:0};
      if(now-limit.time>=60000){limit.time=now;limit.count=0;}
      limits.set(key,limit);
      if(++limit.count>(msg.t==='create'?5:20)) {fail('rate');return;}
      if (!['create','join'].includes(msg.t) && !/^[a-f\d-]{36}$/.test(msg.token || '')) {fail('closed');return;}
      const name = typeof msg.name==='string'?msg.name.trim().slice(0,18):'';
      if (msg.t!=='resume' && !name) {fail('name');return;}
      let room, index;
      if (msg.t==='create') {
        if (rooms.size>=2000) {fail('rate');return;}
        let code;
        do {code=Array.from({length:5},()=>alphabet[randomInt(alphabet.length)]).join('');} while(rooms.has(code));
        room={code,seats:[null,null],phase:'lobby',mode:'voyage',heat:0,seed:0,created:now};
        rooms.set(code,room); index=0;
      } else {
        if (typeof msg.code!=='string' || !codePattern.test(msg.code)) {fail('missing');return;}
        room=rooms.get(msg.code);
        if (!room) {fail('missing');return;}
        if (msg.t==='resume') {
          index=room.seats.findIndex(s=>s?.token===msg.token);
          if(index<0) {fail('closed');return;}
        } else {
          if(room.phase!=='lobby'||room.seats[1]) {fail('full');return;}
          index=1;
        }
      }
      let seat=room.seats[index];
      if (seat?.ws) seat.ws.close(4001);
      if (!seat) seat=room.seats[index]={name,token:randomUUID(),ready:index===0,ship:ships.includes(msg.ship)?msg.ship:'aster',gone:0,ws:null};
      seat.ws=ws; ws.room=room; ws.index=index;
      send(ws,{t:'session',code:room.code,token:seat.token}); publish(room); return;
    }
    const room=ws.room, index=ws.index;
    if (!room || room.seats[index]?.ws!==ws) return;
    const peer=room.seats[1-index]?.ws;
    if(msg.t==='leave') {detach(ws,true);return;}
    if(msg.t==='ready' && index===1 && room.phase==='lobby' && typeof msg.ready==='boolean') {
      room.seats[index].ready=msg.ready; publish(room); return;
    }
    if(msg.t==='ship' && room.phase==='lobby' && ships.includes(msg.ship)) {
      room.seats[index].ship=msg.ship;
      if(index===1)room.seats[1].ready=false;
      publish(room);return;
    }
    if(msg.t==='settings' && index===0 && room.phase==='lobby' && modes.includes(msg.mode) && Number.isInteger(msg.heat) && msg.heat>=(msg.mode==='daily'?0:-1) && msg.heat<=10) {
      room.mode=msg.mode; room.heat=msg.heat; publish(room); return;
    }
    if(msg.t==='start' && index===0 && room.phase==='lobby' && peer && room.seats[1].ready) {
      room.phase='run'; room.seed=randomInt(1,0xffffffff); publish(room);return;
    }
    if(msg.t==='reset' && index===0 && room.phase==='run') {
      room.phase='lobby';
      if(room.seats[1]?.ws) room.seats[1].ready=false; else room.seats[1]=null;
      publish(room);return;
    }
    if(msg.t==='signal' && raw.length<=4096 && msg.value && typeof msg.value==='object') {send(peer,msg);return;}
    if(room.phase!=='run') return;
    if(index===0 && (msg.t==='frame'||msg.t==='ended') && typeof msg.data==='string' && msg.data.length<=24576) {
      if(msg.t==='ended'||(peer?.bufferedAmount || 0)<65536) send(peer,{t:msg.t,data:msg.data});
    }
    if(index===1 && raw.length<=1024 && ['input','pick','gateway','pingpilot','pause'].includes(msg.t)) send(peer,msg);
  });
});
const timer = setInterval(()=>{
  const now=Date.now();
  for(const ws of socketServer.clients) {
    if(!ws.alive) ws.terminate(); else {ws.alive=false;ws.ping();}
  }
  for(const [code,room] of rooms) {
    if (room.phase==='lobby' && room.seats[0]?.ws && room.seats[1] && !room.seats[1].ws && now-room.seats[1].gone>30000) {
      room.seats[1]=null; publish(room);
    }
    if(now-room.created>14400000 || room.seats.every(s=>!s?.ws && (!s||now-s.gone>120000))) {
      room.seats.forEach(s=>s?.ws?.close(4001));rooms.delete(code);
    }
  }
  for(const [key,value] of limits) if(now-value.time>=60000) limits.delete(key);
},5000);
timer.unref();
server.listen(port,'0.0.0.0',()=>console.log('Lumen Tether listening on '+port));
