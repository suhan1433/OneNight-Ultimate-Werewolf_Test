import {useEffect} from 'react';
import {questDestination} from './quest-destinations';
import forest from './assets/quest-scenes/forest.jpg';
import strait from './assets/quest-scenes/strait.jpg';
import pass from './assets/quest-scenes/pass.jpg';
import ruins from './assets/quest-scenes/ruins.jpg';
import sanctum from './assets/quest-scenes/sanctum.jpg';
const backgrounds={forest,strait,pass,ruins,sanctum};
const requested=new Set<string>();
export const questBackdrop=(round:number)=>backgrounds[questDestination(round).id];
/** Warm only the current destination during discussion, never all five scenes. */
export function useQuestBackdrop(round:number){
  const source=questBackdrop(round);
  useEffect(()=>{if(requested.has(source))return;requested.add(source);const image=new Image();image.decoding='async';image.onerror=()=>requested.delete(source);image.src=source;},[source]);
}
