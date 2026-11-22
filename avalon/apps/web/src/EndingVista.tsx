import React,{useId} from 'react';

/** Layered matte painting: the same kingdom at dawn and beneath an eclipse. */
export function EndingVista({good}:{good:boolean}){
  const id=useId().replace(/:/g,'');
  return <div className="ending-vista" aria-hidden="true">
    <svg viewBox="0 0 1200 680" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor={good?'#081f2c':'#170b1b'}/><stop offset=".6" stopColor={good?'#416368':'#71313c'}/><stop offset="1" stopColor={good?'#e1bb75':'#bd6248'}/></linearGradient>
        <radialGradient id={`${id}-sun`}><stop stopColor={good?'#fff6d3':'#ffae72'}/><stop offset=".2" stopColor={good?'#ffe3a5':'#db654e'} stopOpacity=".8"/><stop offset="1" stopColor={good?'#ead5a1':'#c33242'} stopOpacity="0"/></radialGradient>
        <linearGradient id={`${id}-blade`}><stop stopColor="#6c827f"/><stop offset=".48" stopColor="#f8f0cf"/><stop offset=".51" stopColor="#97aba5"/><stop offset="1" stopColor="#32434a"/></linearGradient>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h1200v680H0z"/>
      <g className="ending-heavens"><circle cx="600" cy="235" r="290" fill={`url(#${id}-sun)`}/>{good?<g fill="#ffedbc" opacity=".12"><path d="M600 190 130 680H0ZM600 190l180 490h300ZM600 190 420 680h180Z"/></g>:<><circle cx="600" cy="218" r="78" fill="#ee9370"/><circle cx="600" cy="210" r="74" fill="#1a101c"/></>}</g>
      <path d="m0 350 115-99 90 60 132-151 142 165 86-63 110 36 98-105 159 146 101-92 167 128v305H0Z" fill={good?'#223e47':'#392634'} opacity=".65"/>
      <g className="ending-kingdom" fill={good?'#142e37':'#251c2b'} stroke={good?'#e7c992':'#b16a62'} strokeOpacity=".25" strokeWidth="1.5">
        <path d="M309 480V321h36v-33l30-59 30 59v33h36v159ZM426 480V356h49V237h24v-33l27-49 28 49v33h24v119h46v124ZM621 480V313h31v-25l28-52 28 52v25h32v167ZM747 480V362h27v-42l30-66 29 66v42h41v118Z"/>
        <path d="M351 480V398h463v82ZM348 398v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16h19v-16h19v16"/>
        <path d="M559 480v-41q25-41 50 0v41" fill="#0b1922"/>
        {[375,514,680,803].map((x,i)=><path key={x} d={`M${x} ${i===1?261:342}v22`} stroke={good?'#f5d59a':'#d2745a'} strokeWidth="4"/>)}</g>
      <path d="M0 458q180-60 334 18t266 0 278-6 322-32v242H0Z" fill={good?'#102831':'#1b1723'}/>
      <path d="M0 550q180-84 370 3t380-12 450-12v151H0Z" fill="#09151e"/>
      <g className="ending-sword" transform={good?'translate(600 375)':'translate(600 375) rotate(13)'}>
        <path d="m-12-159 12-16 12 16-4 191-8 26-8-26Z" fill={`url(#${id}-blade)`}/>
        <path d="M-49 28q49 16 98 0l-5 12-35 6v44H-9V46l-35-6Z" fill={good?'#c9ae74':'#a77666'} stroke="#f0dab1" strokeOpacity=".5"/>
        <path d="M-7 51H7v35H-7Z" fill="#243039"/><circle cy="94" r="11" fill={good?'#d6b97e':'#9e685c'}/>
      </g>
      <path d="m465 680 37-132 31-28 17-23 44 9 29-13 40 24 16 33 60 130Z" fill="#07121a"/>
    </svg>
    <div className="ending-mist"/><div className="ending-vignette"/>
    <div className="ending-motes">{Array.from({length:22},(_,i)=><i key={i} style={{'--i':i,'--x':`${(i*43+9)%100}%`,'--y':`${(i*31+17)%100}%`} as React.CSSProperties}/>)}</div>
  </div>;
}
