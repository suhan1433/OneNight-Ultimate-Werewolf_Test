import React,{useId} from 'react';
import './table-cinema.css';

export type TableShot='oath'|'departure'|'ballot'|'unseal'|'reveal'|'dawn'|'shadow';
const TREES=Array.from({length:10},(_,i)=>({x:i<5?i*10-5:165+(i-5)*10,y:100+(i%3)*12,s:.7+(i%4)*.18}));

/** Silent, finite scenic inserts painted on the felt, beneath all game information.
 * No timers, input handlers, network requests or game-state changes live here. */
export function TableCinema({scene,cue=scene}:{scene:TableShot;cue?:string|number}){
  const uid=useId().replace(/:/g,'');
  const landscape=scene==='departure'||scene==='dawn'||scene==='shadow';
  return <div className={`table-cinema tc-${scene}`} key={`${scene}:${cue}`} data-shot={scene} aria-hidden="true">
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#111e31"/><stop offset=".6" stopColor="#32474c"/><stop offset="1" stopColor="#142324"/></linearGradient>
        <linearGradient id={`${uid}-dawn`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b9d9d3"/><stop offset=".5" stopColor="#596d68"/><stop offset="1" stopColor="#172b29"/></linearGradient>
        <linearGradient id={`${uid}-storm`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#30202b"/><stop offset=".55" stopColor="#69404a"/><stop offset="1" stopColor="#181f24"/></linearGradient>
        <radialGradient id={`${uid}-moon`}><stop stopColor="#e4e6ca" stopOpacity=".5"/><stop offset="1" stopColor="#dce6ce" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${uid}-foil`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2deb0"/><stop offset=".5" stopColor="#b49b66"/><stop offset="1" stopColor="#72603a"/></linearGradient>
      </defs>
      {landscape?<>
        <rect width="200" height="200" fill={`url(#${uid}-${scene==='dawn'?'dawn':scene==='shadow'?'storm':'sky'})`}/>
        <g className="tc-distance">
          <circle cx="143" cy="53" r="39" fill={`url(#${uid}-moon)`}/><circle className="tc-moon" cx="143" cy="53" r="13" fill="#e4e6c8" opacity=".8"/>
          <path d="M-8 119 25 86 46 107 75 77 105 104 131 79 168 107 207 80V200H-8Z" fill="#263b3e"/>
          <g className="tc-castle" fill="#102528" stroke="#becab03b" strokeWidth=".6"><path d="M119 112V79h5v-7h5v7h6V65h4v-7h4v7h5v14h6v-7h5v7h5v33Z"/><path d="M130 112V98a9 9 0 0 1 18 0v14" fill="#b5c9b52b"/><path d="m137 58 4-10 4 10M121 72l5-9 5 9M151 72l5-9 5 9" fill="#172b2e"/></g>
          <path d="M-5 139 Q43 101 95 127T208 123V200H-5Z" fill="#10292c"/>
          <path className="tc-road" d="M79 211 Q91 167 122 142T139 111" fill="none" stroke="#d6c79b" strokeWidth="5" opacity=".35"/>
          <path className="tc-road-light" d="M79 211 Q91 167 122 142T139 111" fill="none" stroke="#ede4bc" strokeWidth="1" pathLength="1"/>
        </g>
        <g className="tc-forest" fill="#06181d">{TREES.map((t,i)=><g transform={`translate(${t.x} ${t.y}) scale(${t.s})`} key={i}><path d="M0-42-12-17h6L-17 2h11l-15 17h18v18h6V19h18L6 2h11L6-17h6Z"/></g>)}</g>
        {scene==='departure'&&<g className="tc-gateway" stroke="#b2a78255" strokeWidth="1"><path d="M47 209V92a53 53 0 0 1 106 0v117h-12V93a41 41 0 0 0-82 0v116Z" fill="#122329"/><path className="tc-door tc-door-left" d="M60 201V94a40 40 0 0 1 40-40v147Z" fill="#1f3033"/><path className="tc-door tc-door-right" d="M100 201V54a40 40 0 0 1 40 40v107Z" fill="#1f3033"/><path d="M48 105h11M48 133h11M141 105h11M141 133h11"/></g>}
        {scene==='dawn'&&<g className="tc-sunbeams" fill="#eee6c4"><path d="m143 53-80 147H7ZM143 53l4 147h-41ZM143 53l57 81v57Z" opacity=".15"/></g>}
        {scene==='shadow'&&<g className="tc-ravens" fill="#050e14">{[0,1,2].map(i=><path key={i} transform={`translate(${54+i*31} ${44+(i%2)*13}) scale(${1-i*.12})`} d="M-20-5Q-9-13 0 1 9-12 22-8L8 2 1 9-6 2Z"/>)}</g>}
        <g className="tc-mist" fill="#b8cec3" opacity=".1"><ellipse cx="45" cy="139" rx="74" ry="8"/><ellipse cx="155" cy="159" rx="88" ry="7"/></g>
      </>:<>
        <circle cx="100" cy="100" r="96" fill="#071416" opacity=".32"/>
        <g className="tc-engraving" fill="none" stroke={`url(#${uid}-foil)`} strokeWidth=".7">
          <circle cx="100" cy="100" r="87" strokeDasharray="2 5"/>
          <circle className="tc-inscription" cx="100" cy="100" r="78" pathLength="1"/>
          {[0,1,2,3,4,5,6,7].map(i=><path key={i} transform={`rotate(${i*45} 100 100)`} d="M100 12v26m-4-6h8m-8-13 4-7 4 7m-7 19h6"/>)}
        </g>
        {(scene==='ballot'||scene==='unseal')&&<g className="tc-wax" fill="none" stroke={`url(#${uid}-foil)`} strokeWidth="1.2"><circle cx="100" cy="100" r="40"/><circle cx="100" cy="100" r="33" strokeDasharray="1 4"/><path d="m100 75-15 8v16c0 12 15 23 15 23s15-11 15-23V83ZM93 96l6 6 11-14"/></g>}
        <path className="tc-grazing-light" d="M-60 0H0l210 200h-60Z" fill="#ead39a" opacity=".13"/>
      </>}
    </svg>
    <i className="tc-film-light"/><i className="tc-frame"/>
  </div>;
}
