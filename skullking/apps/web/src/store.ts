import { create } from 'zustand';import type { ClientGameState } from '@skullking/shared';

/* Socket payloads are external mutable values.  Keep a fresh snapshot in the
   store: a later packet (or a transport implementation that reuses an array)
   must not mutate the value Zustand selectors are currently holding. */
const snapshot=(game:ClientGameState|null)=>game&&({...game,
  players:[...game.players],hand:[...game.hand],legalCardIds:[...game.legalCardIds],
  trick:[...game.trick],lastTrick:game.lastTrick&&{...game.lastTrick,cards:[...game.lastTrick.cards]},
  pendingDecision:game.pendingDecision&&{...game.pendingDecision},
  peekedDeck:game.peekedDeck&&[...game.peekedDeck],history:[...game.history],log:[...game.log],
});
export const useGame=create<{game:ClientGameState|null;error:string|null;online:boolean;setGame:(game:ClientGameState|null)=>void;setError:(error:string|null)=>void;setOnline:(online:boolean)=>void}>((set)=>({game:null,error:null,online:true,setGame:game=>set({game:snapshot(game)}),setError:error=>set({error}),setOnline:online=>set({online})}));
