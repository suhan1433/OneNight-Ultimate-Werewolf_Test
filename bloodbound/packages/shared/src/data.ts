import characterRows from './characters.json' with { type: 'json' };
import setupRows from './setupTable.json' with { type: 'json' };
import type { AbilityId, Affiliation, Character, Clan } from './types.js';

type Row={rank:number;name:string;ability:AbilityId;rose:Affiliation[];beast:Affiliation[];clue:'own'|'opposite'};
export const CHARACTER_ROWS=characterRows as Row[];
export const SETUP_TABLE=setupRows as Record<string,{rose:number;beast:number;inquisitor:number;curse:null|{true:number;false:number}}>;
export function characterFor(clan:Extract<Clan,'rose'|'beast'>,rank:number):Character{
  const row=CHARACTER_ROWS.find(item=>item.rank===rank)!;
  const clue=row.clue==='own'?clan:(clan==='rose'?'beast':'rose');
  return {clan,rank,name:row.name,affiliations:[...(clan==='rose'?row.rose:row.beast)],clue,ability:row.ability};
}
export const inquisitorCharacter=():Character=>({clan:'secret',rank:null,name:'Inquisitor',affiliations:['unknown','unknown'],clue:'rose',ability:'inquisitor'});
