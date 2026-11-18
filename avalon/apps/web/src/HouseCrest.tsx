import React from 'react';
import type {AvatarId} from '@werewolf/shared';

// Public house insignia are deliberately independent of secret role and faction.
const marks:Record<AvatarId,React.ReactNode>={
  king:<><path d="m19 37-3-15 10 7 6-14 6 14 10-7-3 15ZM20 43h24"/><circle cx="32" cy="34" r="2"/></>,
  queen:<><path d="m18 36 3-15 11 9 11-9 3 15ZM22 42h20M26 47h12"/><path d="m32 13 3 5-3 5-3-5Z"/></>,
  wizard:<><path d="m32 13 5 11 12 2-9 9 2 13-10-6-10 6 2-13-9-9 12-2Z"/><circle cx="32" cy="31" r="5"/></>,
  elf:<><path d="M32 49V24M32 39C13 39 14 23 18 16c14 2 18 11 14 23ZM32 32c0-13 9-17 15-17 3 13-3 23-15 23M23 25l9 14M42 24 32 34"/></>,
  fairy:<><path d="M32 45V20M32 31C16 13 9 23 18 32l14 5c-17-5-17 12-8 11l8-11M32 31c16-18 23-8 14 1l-14 5c17-5 17 12 8 11l-8-11"/><circle cx="32" cy="17" r="2"/></>,
  dragon:<><path d="m18 43 10-1 3-8-8-5 8-13 11 5-5 4 8 6-9 4-2 12H22l-5-6 2-8M24 26l-9-8 2 15M31 16l3-5M39 21h1"/></>,
  unicorn:<><path d="m22 46 3-14-5-3 11-11 11 6-2 9-7-3-1 16M31 18l9-9-3 12M25 32l8 2M35 25h1M21 46h17"/></>,
  wolf:<><path d="m18 17 12 7h4l12-7-3 22-11 10-11-10ZM24 31l4 2M40 31l-4 2M29 39h6l-3 5Z"/></>,
  eagle:<><path d="M32 46V26M29 24l3-6 6 4-4 4M30 30 13 20l6 13 10 5M34 30l17-10-6 13-10 5M22 42l10-5 10 5M27 47l5-6 5 6"/></>,
  lion:<><path d="m32 13 13 8 5 14-9 14H23L14 35l5-14ZM25 24l-3 10 5 8h10l5-8-3-10ZM25 31h3M36 31h3M29 37h6l-3 5Z"/></>,
  fox:<><path d="m17 16 15 10 15-10-4 23-11 10-11-10ZM21 32l8 6-5-1M43 32l-8 6 5-1M29 43h6l-3 4Z"/></>,
  owl:<><path d="M18 18v19l14 12 14-12V18l-14 7ZM18 20l9 6M46 20l-9 6M29 39l3 4 3-4"/><circle cx="25" cy="32" r="5"/><circle cx="39" cy="32" r="5"/></>,
  bear:<><path d="M22 22c-9-8-13 6-5 9l2 12 13 7 13-7 2-12c8-3 4-17-5-9l-10-3ZM23 32h3M38 32h3M27 39h10l-5 6ZM32 45v4"/></>,
  archer:<><path d="M20 15c27 0 27 34 0 34l14-17ZM17 32h33M43 25l7 7-7 7"/></>,
  knight:<><path d="m32 14 15 6v15c0 9-15 16-15 16s-15-7-15-16V20ZM32 23v18M24 31h16"/></>,
  swordsman:<><path d="m20 16 26 27M44 16 18 43M17 14l8 3-5 5ZM47 14l-8 3 5 5ZM17 37l9 9M38 46l9-9M16 46l5-5M43 41l5 5"/></>,
};

export function HouseCrest({id,className=''}:{id:AvatarId;className?:string}){
  return <svg className={`house-crest ${className}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path className="crest-frame" d="M32 3 57 12v21c0 14-15 23-25 28C22 56 7 47 7 33V12Z"/>
    <path className="crest-inlay" d="M32 7 53 15v18c0 11-12 20-21 24-9-4-21-13-21-24V15Z"/>
    <g className="crest-mark">{marks[id]}</g>
  </svg>;
}
