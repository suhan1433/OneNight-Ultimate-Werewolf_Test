import React from 'react';
import type {QuestDestination} from './quest-destinations';
import './quest-landscape.css';

type LandscapeShot='departure'|'reveal'|'dawn'|'shadow';
const TREES=Array.from({length:10},(_,i)=>({x:i<5?i*10-5:165+(i-5)*10,y:103+(i%3)*12,s:.7+(i%4)*.18}));
const FLAKES=Array.from({length:12},(_,i)=>({x:(i*43+11)%200,y:(i*31+14)%180,r:.7+(i%3)*.4}));

/** Five original locations, with separate foregrounds for cinematic parallax. */
export function QuestLandscape({destination,scene,uid}:{destination:QuestDestination;scene:LandscapeShot;uid:string}){
  const colors=scene==='dawn'?destination.dawn:scene==='shadow'?destination.shadow:destination.sky;
  return <>
    <defs>
      <linearGradient id={`${uid}-landscape`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={colors[0]}/><stop offset=".56" stopColor={colors[1]}/><stop offset="1" stopColor={colors[2]}/></linearGradient>
      <radialGradient id={`${uid}-halo`}><stop stopColor="#f3e6bd" stopOpacity=".6"/><stop offset="1" stopColor="#f3e6bd" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6c95a5"/><stop offset="1" stopColor="#091d30"/></linearGradient>
    </defs>
    <rect width="200" height="200" fill={`url(#${uid}-landscape)`}/>
    {destination.id==='forest'?<>
      <g className="ql-depth"><circle cx="137" cy="47" r="37" fill={`url(#${uid}-halo)`}/><circle cx="137" cy="47" r="12" fill="#e0e3bd" opacity=".8"/>
        <path d="M-5 115 28 80 57 108 87 76 125 110 170 83 205 116v90H-5Z" fill="#294a43"/>
        <g fill="#1c3a35"><path d="M17 132V58l7-17 7 17v74M46 135V76l6-16 5 16v59M165 140V62l7-19 8 19v78M137 129V84l5-13 5 13v45"/></g>
        <path d="M-5 145Q45 107 97 131t108-10v84H-5Z" fill="#102e2b"/>
        <path className="ql-route" d="M81 205Q77 166 111 145t10-43" fill="none" stroke="#b9c3a1" strokeWidth="5" opacity=".4"/>
        <g fill="#52625a" stroke="#a5b09a55" strokeWidth=".6"><path d="m87 135-2-31 8-9 8 6 2 28ZM122 128l4-35 7-7 9 8-4 30Z"/><path d="m101 100 22-6 3 7-25 6Z"/></g>
      </g>
      <g className="ql-foreground" fill="#061c1c">{TREES.map((t,i)=><g transform={`translate(${t.x} ${t.y}) scale(${t.s})`} key={i}><path d="M0-44-12-18h6L-17 2h11l-15 18h18v18h6V20h18L6 2h11L6-18h6Z"/></g>)}</g>
      <g className="ql-weather ql-fog" fill="#cad6b9" opacity=".16"><ellipse cx="44" cy="131" rx="78" ry="7"/><ellipse cx="155" cy="158" rx="89" ry="8"/></g>
      {scene==='dawn'&&<g className="ql-result-light" fill="#e9edb8" opacity=".2"><path d="m137 47-90 153H6ZM137 47l4 153H87Z"/></g>}
    </>:destination.id==='strait'?<>
      <g className="ql-depth"><circle cx="61" cy="42" r="30" fill={`url(#${uid}-halo)`}/><circle cx="61" cy="42" r="10" fill="#bccbd5" opacity=".5"/>
        <g fill="#283d50"><path d="M-10 48Q31 30 77 49t95-4l42 16v13H-10ZM-10 77Q51 57 108 77t99-2v14H-10Z"/></g>
        <path d="M0 119 17 86 30 100 49 74 66 114 99 111 133 121 160 104 179 112 200 95v47H0Z" fill="#1c3344"/>
        <g fill="#172d3c" stroke="#aab6b44d" strokeWidth=".7"><path d="m143 115 4-37h13l5 37ZM145 78V70h17v8ZM143 69l11-9 11 9Z"/><path d="M150 84h6v5h-6Z" fill="#e8d4a3"/></g>
        <path className="ql-beacon" d="m153 85-91 31 15-29Z" fill="#ece3b4" opacity=".2"/>
      </g>
      <path d="M0 119Q35 111 69 121t68 0 63-3v82H0Z" fill={`url(#${uid}-water)`}/>
      <g className="ql-waves" fill="none" stroke="#c0d4dc" strokeWidth="1" opacity=".5"><path d="M-14 140q22-8 44 0t44 0 44 0 44 0 44 0M-28 161q28-9 55 0t55 0 55 0 55 0M-8 185q35-11 69 0t69 0 69 0"/></g>
      <g className="ql-foreground" fill="#071a2a"><path d="M-8 207V142l17-13 13 23 11-9 9 22 21 8 4 34ZM151 207l14-24 13-8 7-23 23-14v69Z"/></g>
      <g className="ql-weather ql-rain" stroke="#c8dde0" strokeWidth=".7" opacity=".4">{FLAKES.map((p,i)=><path key={i} d={`M${p.x} ${p.y}l-4 12`}/>)}</g>
      {scene==='dawn'&&<g className="ql-result-light" fill="#f1ead4"><path d="m119 13-31 108H42ZM135 19l31 102h-42Z" opacity=".2"/><path d="M69 124h70v2H69Z" opacity=".6"/></g>}
      {scene==='shadow'&&<path className="ql-result-shadow ql-lightning" d="m108 21-17 29 15-3-21 43 42-50-19 5 12-24Z" fill="#d5b8cb" opacity=".6"/>}
    </>:destination.id==='pass'?<>
      <g className="ql-depth"><circle cx="146" cy="31" r="31" fill={`url(#${uid}-halo)`}/>
        <path d="M-8 148 35 49 62 89 94 15 127 83 158 40 209 145v66H-8Z" fill="#638194"/>
        <path d="m18 90 17-41 17 26-16-7-6 14ZM65 76l29-61 25 51-20-19-9 12-7-11ZM141 70l17-30 19 38-21-16-4 10Z" fill="#e1e8e2"/>
        <path d="M-5 166 36 109 64 141 98 68 137 135 171 95 206 164v41H-5Z" fill="#35566b"/>
        <path d="m80 111 18-43 14 26-15-10-8 24Z" fill="#b6ced5"/>
        <path className="ql-route" d="m90 119 13-24 11 27 12 14" fill="none" stroke="#d8d9be" strokeWidth="2" opacity=".6"/>
      </g>
      <g className="ql-foreground"><path d="M-8 146 30 130 48 148 66 143 83 163l-8 43H-8ZM122 206l-7-42 15-24 21 7 23-27 34 25v61Z" fill="#142f44"/>
        <path d="M60 151Q100 174 139 148l-3 10Q100 185 64 161Z" fill="#92a7a9" stroke="#dce2cd" strokeWidth=".7"/><path d="M65 148v15M81 155v15M98 157v18M116 154v18M133 146v17" stroke="#576c79" strokeWidth="2"/>
        <path d="M-8 146 30 130 48 148l-19-7-21 13ZM130 140l21 7 23-27 23 19-21-7-18 24Z" fill="#d4e1dd"/>
      </g>
      <g className="ql-weather ql-snow" fill="#edf2e8" opacity=".75">{FLAKES.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={p.r}/>)}</g>
      {scene==='dawn'&&<path className="ql-result-light" d="m146 24-70 176H39ZM146 24l20 176h-38Z" fill="#f4edd4" opacity=".2"/>}
      {scene==='shadow'&&<g className="ql-result-shadow" fill="#c1ced5" opacity=".3"><path d="m94 36-24 61 27 35-21 66h63l-25-64 14-30Z"/><path d="m158 57-26 45 39 62 26-13Z"/></g>}
    </>:destination.id==='ruins'?<>
      <g className="ql-depth"><circle cx="130" cy="47" r="37" fill={`url(#${uid}-halo)`}/><circle cx="130" cy="47" r="17" fill="#c7b093" opacity=".5"/>
        <path d="M-5 119 26 96l19 12 31-28 18 22 31-9 20 18 32-23 31 26v91H-5Z" fill="#4c4240"/>
        <path d="M56 151V81l9-8 8 9v69M123 151V69l11-12 12 9v85M83 151V56l12-8 7 20v83" fill="#353638"/>
        <path d="M-8 171q74-44 120-24t96 3v55H-8Z" fill="#282b2d"/>
        <path d="M61 198 110 145l18-3-28 56Z" fill="#81705a" opacity=".5"/>
      </g>
      <g className="ql-foreground" fill="#192328" stroke="#bc9c7055" strokeWidth=".7"><path d="M6 201V79h9V63h19v16h9v12H33v110ZM157 201V92h-9V79h10V64h20l9 15h13v13h-13v109Z"/>
        <path d="M25 90V76a70 70 0 0 1 99-48l-8 17A52 52 0 0 0 43 81v10ZM148 70l-10-19 9-10 20 31Z"/><path d="m75 176 22-6 9 9-9 23H64ZM119 186l16-15 17 9 9 22h-42Z"/>
        <path d="M162 97h19v42l-10-11-9 5Z" fill="#79544a"/>
      </g>
      <g className="ql-weather ql-ash" fill="#c0a28a" opacity=".65">{FLAKES.map((p,i)=><path key={i} d={`m${p.x} ${p.y} 2-1-1 3-2 1Z`}/>)}</g>
      {scene==='dawn'&&<path className="ql-result-light" d="m101 23-37 177H25ZM119 31l20 169h-36Z" fill="#f2d5a3" opacity=".25"/>}
      {scene==='shadow'&&<g className="ql-result-shadow" fill="#ad6f61" opacity=".5"><path d="m113 66 5-10 5 8-4 11ZM97 98l7-13 6 6-3 14ZM130 113l9-6 5 14-9 5Z"/><ellipse cx="102" cy="181" rx="64" ry="9" opacity=".3"/></g>}
    </>:<>
      <g className="ql-depth"><path d="M25 202V85Q25 40 100 4q75 36 75 81v117Z" fill="#463c53" stroke="#c9b58a88" strokeWidth="1"/>
        <path d="M46 202V89Q46 57 100 25q54 32 54 64v113Z" fill="#2d2c40" stroke="#d3c09577"/>
        <path d="M65 202V94Q65 73 100 47q35 26 35 47v108Z" fill="#1b2932" stroke="#dcc89777"/>
        <circle cx="100" cy="82" r="25" fill={`url(#${uid}-halo)`}/><circle cx="100" cy="82" r="17" fill="#d6c9a632" stroke="#d4be8b" strokeWidth=".7"/>
        <g stroke="#d4be8b88" strokeWidth=".7"><path d="M83 82h34M100 65v34M88 70l24 24M112 70 88 94"/><circle cx="100" cy="82" r="8" fill="none"/></g>
        <path d="M52 202 88 130h24l36 72Z" fill="#b59b7144"/><path d="M70 202 94 130M130 202l-24-72" stroke="#cdb78a55"/>
        <circle className="ql-grail-halo" cx="100" cy="122" r="32" fill={`url(#${uid}-halo)`}/>
        <g className="ql-grail" fill="#ddc48a" stroke="#fae7ae" strokeWidth=".7"><path d="M89 112h22q-1 15-11 17-10-2-11-17ZM98 129h4v9l8 3H90l8-3Z"/><path d="M90 115h-5q-2 8 10 9M110 115h5q2 8-10 9" fill="none"/></g>
        <path d="M80 145h40l7 10H73ZM72 157h56l8 11H64Z" fill="#8b7c68"/>
      </g>
      <g className="ql-foreground" fill="#17212e" stroke="#b8a48066" strokeWidth="1"><path d="M9 201V15h13v186ZM178 201V15h13v186Z"/><path d="M4 18h24V9H4ZM172 18h24V9h-24ZM4 194h24v8H4ZM172 194h24v8h-24Z"/></g>
      <g className="ql-weather ql-incense" fill="#dcc9a3" opacity=".15"><path d="M50 182q-18-29 3-44t-2-48q18 15 8 37t5 55ZM144 182q18-29-3-44t2-48q-18 15-8 37t-5 55Z"/></g>
      {scene==='dawn'&&<g className="ql-result-light" fill="#faeac0"><path d="m100 82-34 120h68Z" opacity=".16"/><path d="M97 119 94 0h12l-3 119Z" opacity=".4"/></g>}
      {scene==='shadow'&&<path className="ql-result-shadow" d="M66 0h68l-26 128H92Z" fill="#080f22" opacity=".7"/>}
    </>}
  </>;
}
