export const QUEST_DESTINATIONS=[
  {id:'forest',name:'안개숲',chapter:'THE WHISPERING WOODS',sky:['#0b2528','#46675e','#102e2b'],dawn:['#bcd3b1','#648b73','#173f35'],shadow:['#2b202f','#61414f','#162b2a']},
  {id:'strait',name:'폭풍 해협',chapter:'THE STORM STRAIT',sky:['#122032','#566779','#142b3b'],dawn:['#c1dae1','#6995aa','#254b61'],shadow:['#211e34','#554353','#152238']},
  {id:'pass',name:'빙설 고개',chapter:'THE FROZEN PASS',sky:['#344b65','#a3bfcc','#415e74'],dawn:['#e4e3cc','#a6ced9','#597e95'],shadow:['#292a46','#7e7b99','#2f435b']},
  {id:'ruins',name:'잿빛 폐허',chapter:'THE ASHEN RUINS',sky:['#35242c','#98735a','#352e30'],dawn:['#e8cfa0','#b29466','#554335'],shadow:['#2d1c2c','#7b4544','#33232e']},
  {id:'sanctum',name:'성배의 성소',chapter:'THE GRAIL SANCTUM',sky:['#28233e','#847483','#352d42'],dawn:['#eee3c0','#c5ac74','#62533f'],shadow:['#21182e','#624157','#2b2239']},
] as const;
export type QuestDestination=typeof QUEST_DESTINATIONS[number];
export function questDestination(round:number):QuestDestination{return QUEST_DESTINATIONS[Math.max(0,Math.min(4,Math.floor(Number.isFinite(round)?round:0)))]!;}
