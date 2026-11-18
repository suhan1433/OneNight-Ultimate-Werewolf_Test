import React,{useId,useMemo} from 'react';

export function RoundTable({className='cs-tablesvg'}:{className?:string}){
  const uid=useId().replace(/:/g,'');
  const ticks=useMemo(()=>Array.from({length:60},(_,j)=>{const a=j*6*Math.PI/180,L=j%5===0?9:5;return{j,x1:200+112*Math.sin(a),y1:200-112*Math.cos(a),x2:200+(112+L)*Math.sin(a),y2:200-(112+L)*Math.cos(a)};}),[]);
  return <svg className={className} viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <linearGradient id={`${uid}-brass`} gradientUnits="userSpaceOnUse" x1="60" y1="60" x2="340" y2="340"><stop offset="0" stopColor="#fde9b4"/><stop offset=".45" stopColor="#dcb262"/><stop offset="1" stopColor="#7a5726"/></linearGradient>
      <radialGradient id={`${uid}-felt`} cx="50%" cy="42%" r="62%"><stop offset="0" stopColor="#2f6e7a"/><stop offset=".55" stopColor="#17414a"/><stop offset="1" stopColor="#09191f"/></radialGradient>
      <radialGradient id={`${uid}-oak`} cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#5a4129"/><stop offset="1" stopColor="#241810"/></radialGradient>
    </defs>
    <circle className="cs-seatring" cx="200" cy="200" r="172" fill="none" stroke={`url(#${uid}-brass)`} strokeWidth=".6" strokeDasharray="1.5 5" opacity=".35"/>
    <circle cx="200" cy="200" r="137" fill={`url(#${uid}-oak)`}/>
    <circle cx="200" cy="200" r="136" fill="none" stroke="#7a5a35" strokeWidth=".8" opacity=".7"/>
    <circle cx="200" cy="200" r="127" fill={`url(#${uid}-felt)`}/>
    <circle cx="200" cy="200" r="129" fill="none" stroke={`url(#${uid}-brass)`} strokeWidth="2.6"/>
    <circle cx="200" cy="200" r="123" fill="none" stroke={`url(#${uid}-brass)`} strokeWidth=".6" strokeDasharray="2 3" opacity=".65"/>
    <g stroke={`url(#${uid}-brass)`} strokeWidth=".8" opacity=".85">{ticks.map(t=><line key={t.j} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}/>)}</g>
    <circle cx="200" cy="200" r="64" fill="rgba(4,12,16,.35)" stroke={`url(#${uid}-brass)`} strokeWidth="1.1"/>
    <circle cx="200" cy="200" r="58" fill="none" stroke={`url(#${uid}-brass)`} strokeWidth=".5" opacity=".55"/>
  </svg>;
}
