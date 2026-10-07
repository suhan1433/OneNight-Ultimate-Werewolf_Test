import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {type AvatarId,type ClientGameState} from '@werewolf/shared';
import {emit} from './socket';
import {useGame} from './store';

/* ============================================================
   프로필 캐릭터 — 로비에서 고르면 원탁 좌석 · 채팅에 같은 캐릭터로 나온다
   · 선택값은 이 브라우저(localStorage)에 저장하고 서버(PROFILE_UPDATE)에도 알린다
   · 서버가 players[].avatar 를 내려주면 모든 참가자에게 같은 캐릭터가 보인다
   ============================================================ */
export type Character={id:AvatarId;name:string;emoji:string;bg:string};
export const CHARACTERS:Character[]=[
  {id:'king',name:'왕',emoji:'🤴',bg:'linear-gradient(135deg,#f6dc98,#a8782a)'},
  {id:'queen',name:'여왕',emoji:'👸',bg:'linear-gradient(135deg,#f5a9c8,#a8456f)'},
  {id:'wizard',name:'마법사',emoji:'🧙',bg:'linear-gradient(135deg,#8f86e8,#3b2f8f)'},
  {id:'elf',name:'엘프',emoji:'🧝',bg:'linear-gradient(135deg,#8fe0b0,#2f7d57)'},
  {id:'fairy',name:'요정',emoji:'🧚',bg:'linear-gradient(135deg,#b6e3ff,#4a85c4)'},
  {id:'dragon',name:'용',emoji:'🐉',bg:'linear-gradient(135deg,#ff9a7a,#a63a24)'},
  {id:'unicorn',name:'유니콘',emoji:'🦄',bg:'linear-gradient(135deg,#f0c8ff,#8a5cc4)'},
  {id:'wolf',name:'늑대',emoji:'🐺',bg:'linear-gradient(135deg,#9ca3af,#3f4756)'},
  {id:'eagle',name:'독수리',emoji:'🦅',bg:'linear-gradient(135deg,#d6b27a,#6b4a22)'},
  {id:'lion',name:'사자',emoji:'🦁',bg:'linear-gradient(135deg,#fcd34d,#b8791a)'},
  {id:'fox',name:'여우',emoji:'🦊',bg:'linear-gradient(135deg,#f59e0b,#a8470f)'},
  {id:'owl',name:'올빼미',emoji:'🦉',bg:'linear-gradient(135deg,#b59a7a,#5d4630)'},
  {id:'bear',name:'곰',emoji:'🐻',bg:'linear-gradient(135deg,#b4783c,#5f3a1c)'},
  {id:'archer',name:'궁수',emoji:'🏹',bg:'linear-gradient(135deg,#86c98f,#2f6b3c)'},
  {id:'knight',name:'기사',emoji:'🛡️',bg:'linear-gradient(135deg,#7da7e0,#2a4d86)'},
  {id:'swordsman',name:'검사',emoji:'⚔️',bg:'linear-gradient(135deg,#cbd5e1,#59657a)'},
];
const PROFILE_KEY='avalon-profile-avatar';
export const characterById=(id?:string|null)=>CHARACTERS.find(c=>c.id===id);
const characterFallback=(key:string)=>{let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;return CHARACTERS[h%CHARACTERS.length]!;};
export let myAvatarId:string|null=(()=>{try{return localStorage.getItem(PROFILE_KEY);}catch{return null;}})();
const profileListeners=new Set<()=>void>();
export const setMyAvatarId=(id:string)=>{myAvatarId=id;try{localStorage.setItem(PROFILE_KEY,id);}catch{}profileListeners.forEach(fn=>fn());};
const useMyAvatarId=()=>useSyncExternalStore(fn=>{profileListeners.add(fn);return()=>{profileListeners.delete(fn);};},()=>myAvatarId,()=>null);
// 서버가 players[].avatar 를 내려주면 그 값을 쓴다(아직 없으면 undefined)
export const serverAvatarId=(p?:unknown)=>(p as {avatar?:string}|undefined)?.avatar;
// 서버가 아직 이 이벤트를 몰라도 오류 토스트 없이 로컬 프로필만 유지한다
export const syncAvatar=(roomCode:string,avatar:string)=>{emit('PROFILE_UPDATE',{roomCode,avatar}).catch(()=>{});};
/* playerId → 캐릭터: 내 것은 로컬 선택 우선, 그 외는 서버 값, 없으면 playerId 기반 고정 기본값 */
export function useCharacterResolver(players?:ClientGameState['players'],myId?:string){
  const mine=useMyAvatarId();
  const g=useGame(s=>s.game); // players/myId 를 안 넘겨도 현재 게임 상태에서 찾는다 → 어느 화면에서든 같은 캐릭터
  const list=players??g?.players??[];const me=myId??g?.playerId;
  return(playerId:string):Character=>{
    const server=serverAvatarId(list.find(p=>p.id===playerId));
    const id=playerId===me?mine??server:server;
    return characterById(id)??characterFallback(playerId);
  };
}
export function CharacterAvatar({c,size=40}:{c:Character;size?:number}){
  return <span className="pf-avatar" style={{width:size,height:size,fontSize:size*.56,background:c.bg}} aria-hidden="true">{c.emoji}</span>;
}
/* playerId 만 주면 그 사람의 프로필 캐릭터를 그려준다 */
export function PlayerAvatar({playerId,size=20}:{playerId:string;size?:number}){const resolve=useCharacterResolver();return <CharacterAvatar c={resolve(playerId)} size={size}/>;}
export function PlayerEmoji({playerId}:{playerId:string}){const resolve=useCharacterResolver();return <>{resolve(playerId).emoji}</>;}
export function ProfileDialog({game,close}:{game:ClientGameState;close:()=>void}){
  const me=game.players.find(p=>p.id===game.playerId);
  const resolve=useCharacterResolver(game.players,game.playerId);
  const current=resolve(game.playerId);
  const[picked,setPicked]=useState(current.id);
  const taken=new Set(game.players.filter(p=>p.id!==game.playerId).map(p=>serverAvatarId(p)).filter(Boolean) as string[]);
  const chosen=characterById(picked)??current;
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[close]);
  const save=()=>{setMyAvatarId(picked);syncAvatar(game.roomCode,picked);close();};
  return createPortal(
    <div className="pf-scrim" onClick={close}>
      <section className="pf-dialog" role="dialog" aria-modal="true" aria-label="프로필 수정" onClick={e=>e.stopPropagation()}>
        <small>PROFILE</small>
        <h3>프로필 수정</h3>
        <div className="pf-preview"><CharacterAvatar c={chosen} size={76}/><div><b>{me?.nickname??''}</b><em>{chosen.name}</em></div></div>
        <p className="pf-sub">원탁과 채팅에서 이 캐릭터로 표시돼요.</p>
        <div className="pf-grid" role="radiogroup" aria-label="캐릭터 선택">
          {CHARACTERS.map(c=>{const used=taken.has(c.id);return <button type="button" key={c.id} role="radio" aria-checked={picked===c.id} aria-label={`${c.name}${used?' (사용 중)':''}`} className={`pf-option${picked===c.id?' on':''}`} disabled={used} onClick={()=>setPicked(c.id)}><CharacterAvatar c={c} size={46}/><span>{used?'사용 중':c.name}</span></button>;})}
        </div>
        <div className="pf-actions"><button type="button" className="pf-cancel" onClick={close}>취소</button><button type="button" className="pf-save" onClick={save}>저장</button></div>
      </section>
    </div>,
    document.body);
}

