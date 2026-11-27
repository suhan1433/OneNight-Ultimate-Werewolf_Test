import { openDB } from 'idb';
import { compressSync, decompressSync, strFromU8, strToU8 } from 'fflate';
import type { Checkpoint } from '../core/sim/flight';

export type Profile = { dust:number; best:number; rewarded:string[] };
export const emptyProfile:Profile={dust:0,best:0,rewarded:[]};
const DB = 'lumen-tether';
const mirror = 'lt.mirror';
const table=Array.from({length:256},(_,n)=>{
  for(let i=0;i<8;i++) n=(n>>>1)^((n&1)?0xedb88320:0);
  return n;
});
function crc(value:string) {
  let result=0xffffffff;
  for(const byte of strToU8(value)) result=(result>>>8)^table[(result^byte)&255];
  return ((result^0xffffffff)>>>0).toString(16).padStart(8,'0');
}
function encode(value:unknown) {
  const json=JSON.stringify(value);
  const bytes=compressSync(strToU8(json));
  return 'LT1.'+btoa(strFromU8(bytes,true)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')+'.'+crc(json);
}
function decode(value:string) {
  const [schema,payload,check]=value.split('.');
  if(schema!=='LT1'||!payload||value.length>25000)throw Error('Invalid backup');
  const text=strFromU8(decompressSync(strToU8(atob(payload.replaceAll('-','+').replaceAll('_','/')),true),{out:new Uint8Array(32768)}));
  if(crc(text)!==check)throw Error('Invalid checksum');
  return JSON.parse(text) as unknown;
}
function profile(value:unknown):Profile {
  const p=value as Profile;
  if(!p||![p.dust,p.best].every(n=>Number.isSafeInteger(n)&&n>=0) || !Array.isArray(p.rewarded) || !p.rewarded.every(id=>typeof id==='string'&&id.length<=60))throw Error('Invalid profile');
  return {dust:p.dust,best:p.best,rewarded:p.rewarded.slice(-96)};
}
let opening:ReturnType<typeof openDB>|undefined;
const db=()=>opening ||= openDB(DB,1,{upgrade(db){db.createObjectStore('kv');}});
let fallback=emptyProfile;
let checkpointFallback:Checkpoint|null=null;

function mirrored() {
  try{return profile(decode(localStorage.getItem(mirror)||''));}catch{return fallback;}
}
async function readProfile(database:Awaited<ReturnType<typeof db>>) {
  const stored=await database.get('kv','profile');
  if(stored===undefined)return mirrored();
  try{return profile(decode(stored));}
  catch {
    await database.put('kv',stored,'profile.corrupt');
    return mirrored();
  }
}
export async function loadProfile() {
  try {return await readProfile(await db());}catch{return mirrored();}
}
let writes=Promise.resolve<unknown>(undefined);
function update(updateProfile:(previous:Profile)=>Profile) {
  async function save() {
    let next;
    try {
      const database=await db(), before=await readProfile(database);
      next=updateProfile(before);
      await database.put('kv',encode(next),'profile');
    } catch {next=updateProfile(mirrored());}
    fallback=next;
    try{localStorage.setItem(mirror,encode(next));}catch{}
    return next;
  }
  const result=writes.then(async ():Promise<Profile>=>navigator.locks ? await navigator.locks.request('lt.profile',save) : await save());
  writes=result.catch(()=>{});
  return result;
}
export const award=(id:string,dust:number,score:number)=>update(p=>p.rewarded.includes(id)?p:{
  dust:p.dust+Math.max(0,Math.min(5000,Math.trunc(dust))),best:Math.max(p.best,Math.trunc(score)),rewarded:[...p.rewarded,id].slice(-96),
});
export const exportProfile=encode;
export const importProfile=(code:string)=>profile(decode(code.trim()));
export const mergeProfile=(next:Profile)=>update(current=>({
  dust:Math.max(current.dust,next.dust),best:Math.max(current.best,next.best),
  rewarded:[...new Set([...current.rewarded,...next.rewarded])].slice(-96),
}));

export async function storeCheckpoint(value:Checkpoint|null) {
  checkpointFallback=value;
  try {
    if(value)await (await db()).put('kv',encode(value),'runSave');
    else await (await db()).delete('kv','runSave');
  } catch {}
}
export async function loadCheckpoint():Promise<Checkpoint|null> {
  try {
    const database=await db(), raw=await database.get('kv','runSave');
    if(!raw)return checkpointFallback;
    try {
      const value=decode(raw) as Checkpoint;
      if(value.version!==1)throw Error('Old checkpoint');
      return value;
    } catch {await database.put('kv',raw,'runSave.corrupt');return null;}
  } catch {return checkpointFallback;}
}
