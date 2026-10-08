import type { BloodBoundRoom } from '@bloodbound/shared';
const rooms=new Map<string,BloodBoundRoom>();const locks=new Map<string,Promise<void>>();
export async function getRoom(code:string){return rooms.get(code)??null;}
export async function saveRoom(room:BloodBoundRoom){rooms.set(room.roomCode,room);}
export async function deleteRoom(code:string){rooms.delete(code);}
export async function withRoomLock<T>(code:string,fn:(room:BloodBoundRoom)=>Promise<T>|T){const previous=locks.get(code)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const queued=previous.then(()=>gate);locks.set(code,queued);await previous;try{const room=await getRoom(code);if(!room)throw Error('방을 찾을 수 없습니다.');return await fn(room);}finally{release();void queued.then(()=>{if(locks.get(code)===queued)locks.delete(code);});}}
