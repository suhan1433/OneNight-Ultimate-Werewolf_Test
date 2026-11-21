import React,{useId,useState} from 'react';
import {QuestLandscape} from './QuestLandscape';
import {questDestination} from './quest-destinations';
import {questBackdrop} from './quest-backdrops';
import './table-cinema.css';

export type TableShot='oath'|'departure'|'ballot'|'unseal'|'reveal'|'dawn'|'shadow';

/** Scenery never owns input or game timing. Memoization keeps the quest clock
 * from rerendering SVG landscapes while the compositor moves their layers. */
export const TableCinema=React.memo(function TableCinema({scene,cue=scene,round=0}:{scene:TableShot;cue?:string|number;round?:number}){
  const uid=useId().replace(/:/g,'');
  const destination=questDestination(round);
  const photograph=questBackdrop(round);const [loaded,setLoaded]=useState('');
  const landscape=scene==='departure'||scene==='reveal'||scene==='dawn'||scene==='shadow';
  return <div className={`table-cinema tc-${scene} tc-location-${destination.id}`} key={`${scene}:${destination.id}:${cue}`} data-shot={scene} data-destination={destination.id} aria-hidden="true">
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs><linearGradient id={`${uid}-foil`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2deb0"/><stop offset=".5" stopColor="#b49b66"/><stop offset="1" stopColor="#72603a"/></linearGradient></defs>
      {landscape?<QuestLandscape destination={destination} scene={scene} uid={uid}/>:<>
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
    {landscape&&<>
      <img className={`tc-photograph${loaded===photograph?' is-loaded':''}`} src={photograph} alt="" decoding="async" onLoad={()=>setLoaded(photograph)}/>
      <i className="tc-weather-overlay"/>
      {scene==='dawn'&&<i className="tc-success-rays"/>}
      {scene==='shadow'&&<><i className="tc-failure-shadow"/>{destination.id==='forest'&&<svg className="tc-raven-overlay" viewBox="0 0 200 100"><path d="M40 31q12-12 22 0 12-15 26-4L67 43ZM109 17q10-9 18 0 10-12 22-4l-18 14Z"/></svg>}</>}
    </>}
    <i className="tc-film-light"/><i className="tc-frame"/>
  </div>;
});
