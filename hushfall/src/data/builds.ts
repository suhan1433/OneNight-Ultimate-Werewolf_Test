import type { CardId } from './flight';

export const elements = ['fire','frost','volt','gravity'] as const;
export type Element = typeof elements[number];
export const pairMaterials = [...elements,'range','field'] as const;
export type PairMaterial = typeof pairMaterials[number];
export const branches = {
  assault: { name:['집중 화력','Assault'], cards:['power','spread','rate','pierce','fire'] },
  control: { name:['탄막 제어','Control'], cards:['frost','critical','volt','gravity','magnet'] },
  escort: { name:['기체 보호','Escort'], cards:['shield','armor','range','field','dash','motor'] },
} as const satisfies Record<string,{name:readonly string[];cards:readonly CardId[]}>;
export type Branch = keyof typeof branches;
export const opening = ['power','frost','shield'] as const;
type Build = Partial<Record<CardId,number>>;
export const branchOf = (card: CardId) => (Object.keys(branches) as Branch[])
  .find(id=>(branches[id].cards as readonly CardId[]).includes(card))!;

export const evolutions = {
  skyneedle: { name:['스카이니들','Skyneedle'], info:['5번째 연사마다 관통 바늘','Every fifth volley fires a piercing needle'], requirements:{power:3,spread:2} },
  shatter: { name:['파쇄 사격','Shatter Shot'], info:['빙결 적을 파쇄하며 빙결 보스의 유효 코어 확장','Shatters chilled foes and widens the chilled boss core'], requirements:{frost:2,critical:2} },
  aegis: { name:['수호 등불','Aegis Lantern'], info:['예비 쉴드 · 링크 중 양쪽 쉴드 충전 및 보스 필드 피해 강화','Backup shield · faster linked recharge and stronger boss field'], requirements:{armor:2,shield:2} },
} as const;
export type Evolution = keyof typeof evolutions;
export const evolutionIds = Object.keys(evolutions) as Evolution[];
export const meets = (build:Build,id:Evolution) => {
  switch(id) {
    case 'skyneedle': return (build.power||0)>=evolutions.skyneedle.requirements.power && (build.spread||0)>=evolutions.skyneedle.requirements.spread;
    case 'shatter': return (build.frost||0)>=evolutions.shatter.requirements.frost && (build.critical||0)>=evolutions.shatter.requirements.critical;
    case 'aegis': return (build.armor||0)>=evolutions.aegis.requirements.armor && (build.shield||0)>=evolutions.aegis.requirements.shield;
  }
};

export const resonances = {
  steam: { name:['증기 장막','Steam Veil'], effect:['필드 안 적탄 감속 · 두 원소로 같은 적 공격 시 열충격과 쉴드 충전','Slows field shots; both elements hitting one foe trigger shock and recharge'], color:0xa8e2ed },
  plasma: { name:['플라즈마 아크','Plasma Arc'], effect:['테더 피해 증가','Stronger tether field damage'], color:0xffa969 },
  circuit: { name:['초전도','Superconductivity'], effect:['빙결된 적 사이로 전격 추가 연쇄','Lightning chains farther across chilled foes'], color:0xa4abff },
  singularity: { name:['특이점','Singularity'], effect:['필드가 적과 아이템을 중앙으로 끌어당김','The field pulls foes and drops inward'], color:0xd4a4ff },
} as const;
export type Resonance = keyof typeof resonances;
const pairs:Partial<Record<string,Resonance>> = {
  'fire+frost':'steam', 'fire+volt':'plasma', 'frost+volt':'circuit', 'volt+gravity':'singularity',
};
export const elementNames:Record<Element,readonly [string,string]> = {
  fire:['화염','Fire'],frost:['빙결','Frost'],volt:['전격','Volt'],gravity:['중력','Gravity'],
};
export const complement:Record<Element,Element> = {fire:'frost',frost:'fire',volt:'gravity',gravity:'volt'};
export function primaryElement(build:Build, preferred?:PairMaterial): Element|undefined {
  const planned=elements.find(element=>element===preferred);
  if(planned&&(build[planned]||0)>=2)return planned;
  let primary: Element|undefined;
  for(const element of elements)
    if((build[element]||0)>=(primary?(build[primary]||0)+1:2)) primary=element;
  return primary;
}
export function resonanceFor(a?:Element,b?:Element):Resonance|undefined {
  return a&&b ? pairs[a+'+'+b]||pairs[b+'+'+a] : undefined;
}

export const buildBalance = {
  anchor: { range:2,field:2,height:320,power:1.35 },
  skyneedle: { every:5,power:2.1,pierce:3,kind:4 },
  shatter: { radius:110,power:.8,interval:.6,criticalBonus:.36,bossCore:27,bossDrift:.69,bossBonus:.64,bossInterval:1.5,bossDelay:.24 },
  aegis: { delay:2,nova:10,bossField:2.4,linkedRecharge:1.28 },
  steam: { speed:.57,padding:18,shockPower:1.15,shockCooldown:.52,shieldCredit:.38 },
  plasma: { power:1.65 },
  circuit: { extraJumps:3 },
  singularity: { pull:56 },
  boss: { width:84, hold:.65, activate:4, cooldown:5, wingMultiplier:1.18, fieldMultiplier:1.45 },
} as const;
