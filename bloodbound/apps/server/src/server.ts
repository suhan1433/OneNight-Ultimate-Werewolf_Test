import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerHandlers } from './socket/handlers.js';

export function createGameServer(socketPath='/socket.io'){
  const app=express();const origin=process.env.WEB_ORIGIN?.split(',')??['http://localhost:5175'];app.use(cors({origin,credentials:true}));app.get('/health',(_req,res)=>res.json({ok:true,game:'bloodbound'}));
  const server=http.createServer(app);const io=new Server(server,{path:socketPath,cors:{origin,credentials:true},transports:['websocket','polling']});io.on('connection',socket=>registerHandlers(io,socket));return {server,io};
}
const standalone=process.env.RUN_STANDALONE_SERVER==='true';const current=createGameServer(standalone?'/socket.io':'/api/bloodbound/socket');
if(standalone)current.server.listen(Number(process.env.PORT??3003),()=>console.log('Blood Bound server listening on 3003'));
export default current.server;
