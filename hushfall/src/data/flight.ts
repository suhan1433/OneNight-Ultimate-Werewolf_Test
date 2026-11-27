export const rules = {
  hz: 60, width: 540, height: 960, flightY: 820, edge: 30,
  speed: 420, touch: 1.15, acceleration: .08, hull: 4, damage: 8, fireRate: 2.8,
  shotSpeed: 750, shotGap: 9, hitRadius: 7, grazeRadius: 16,
  dashTime: .22, dashDistance: 170, dashCool: 6,
  shield: 14, shieldFloor: 6, immunity: 1.4, mercy: 120,
  linkRange: 260, linkHeight: 240, linkRate: 1.1, linkShield: .8, linkSlow: .8,
  fieldTick: .25, resonance: 4, linkPoints: 100, revive: 2, linkRevive: 1.2,
  wreckTime: 12, reviveHull: 2, reviveImmune: 2, reviveRadius: 28,
  charge: 100, duetWindow: 1, duetPower: 60, novaPower: 30, novaCap: .03,
  overdriveGain: 1.5, overdriveTime: 8, overdriveRate: 1.4,
  act: 80, lull: 8, intro: 4, bossBreak: 1.5,
  xp: 30, xpScale: 1.12, magnet: 90, gemFall: 235, gemSeek: 580,
  comboTime: 2.5, comboGain: .04, comboMax: 100, grazePoints: 25,
  maxBullets: 700, maxEnemies: 40, maxDrops: 100, eliteHull: 600,
  countdown: 3, pauseLimit: 60, perfectPoints: 50000,
  shardsChance: .18, repairChance: .008, rerolls: 2, bans: 1,
};

export const enemies = [
  { name: ['드리프터', 'Drifter'], hp: 30, speed: 90, radius: 16, points: 100, xp: 10, behavior: 'drift', fire: 0, count: 0 },
  { name: ['스파크', 'Spark'], hp: 24, speed: 120, radius: 15, points: 150, xp: 11, behavior: 'zig', fire: 1.8, count: 1 },
  { name: ['펄 포드', 'Pearl Pod'], hp: 60, speed: 80, radius: 25, points: 200, xp: 16, behavior: 'pod', fire: 2.4, count: 3 },
  { name: ['윙러너', 'Wingrunner'], hp: 36, speed: 106, radius: 20, points: 180, xp: 12, behavior: 'wing', fire: 2.5, count: 2 },
  { name: ['램퍼', 'Ramper'], hp: 70, speed: 360, radius: 24, points: 250, xp: 16, behavior: 'ram', fire: 0, count: 0 },
  { name: ['스포어 구름', 'Spore Cloud'], hp: 50, speed: 66, radius: 21, points: 220, xp: 14, behavior: 'spore', fire: 0, count: 8 },
] as const;

type Wave = [at: number, type: number, count: number, interval: number, formation: 'line'|'vee'|'edges'|'rain'];
const emberWaves: Wave[] = [
  [0,0,5,1.0,'line'],[9,0,7,1.5,'vee'],[8,1,2,2.2,'edges'],[17,1,2,2,'edges'],[25,3,6,2,'edges'],
  [40,2,2,1,'edges'],[45,0,7,1.2,'line'],[55,1,5,2.5,'rain'],[62,4,1,0,'line'],
  [70,0,12,.75,'rain'],[88,2,3,2,'line'],[92,3,6,2,'edges'],[110,4,2,5,'edges'],
  [112,1,6,2,'rain'],[130,6,1,0,'line'],[133,0,10,1,'vee'],[151,3,10,1.55,'edges'],
];

export const sectorWaves:Wave[][] = [
  emberWaves,
  [[0,3,8,1.1,'edges'],[12,5,6,2,'vee'],[25,2,4,2.2,'line'],[39,0,12,1.05,'rain'],
    [55,1,8,1.1,'edges'],[66,5,10,1.25,'rain'],[88,2,4,1.5,'vee'],[95,3,13,1,'edges'],
    [112,5,8,1.4,'line'],[130,6,1,0,'line'],[133,4,3,6,'edges'],[151,5,12,1.2,'rain']],
  [[0,0,10,.9,'rain'],[12,4,4,3,'edges'],[26,1,8,1.1,'line'],[38,2,5,1.4,'vee'],
    [50,5,7,1.3,'rain'],[62,4,5,3,'line'],[88,4,4,3,'edges'],[100,3,12,.8,'vee'],
    [114,2,6,1.6,'line'],[130,6,1,0,'line'],[131,4,4,3.5,'edges'],[148,1,14,1.25,'rain']],
  [[0,1,10,.9,'edges'],[11,2,5,1.3,'line'],[22,3,12,1,'vee'],[37,5,9,1.3,'edges'],
    [52,1,9,1.3,'rain'],[65,4,5,2.8,'edges'],[88,2,6,1.55,'line'],[100,3,13,1.1,'edges'],
    [116,4,4,3,'vee'],[130,6,1,0,'line'],[132,1,12,1.2,'rain'],[151,5,12,1.2,'vee']],
  [[0,5,9,1,'rain'],[10,4,4,3,'edges'],[24,3,12,1.1,'vee'],[40,2,5,1.6,'line'],
    [51,1,12,1,'edges'],[66,5,11,1.2,'rain'],[88,4,5,2.8,'edges'],[104,2,6,1.7,'line'],
    [118,3,11,.9,'vee'],[130,6,1,0,'line'],[131,5,12,1.4,'rain'],[150,4,6,2.6,'edges']],
];

export const stages = [
  { name: ['잿빛 성운','Ember Nebula'], boss: ['어미나방','Brood Moth'], tint: 0x49e6ba, hp: 1, bossHp: 5500, drift: [64,133,104], core: 45, bulletSpeed: 1, pattern: ['fan','wall','spiral'], reward: 120 },
  { name: ['유리 암초','Glass Reef'], boss: ['말미잘 여왕','Anemone Queen'], tint: 0x6cb5fb, hp: 1.25, bossHp: 7000, drift: [44,78,139], core: 52, bulletSpeed: 1.08, pattern: ['ring','wall','rain'], reward: 160 },
  { name: ['부서진 궤도','Broken Orbit'], boss: ['닻 거신','Anchor Titan'], tint: 0xf1ae71, hp: 1.6, bossHp: 12100, drift: [27,110,57], core: 50, bulletSpeed: 1.16, pattern: ['aim','wall','ring'], reward: 220 },
  { name: ['굴절 성역','Prism Sanctuary'], boss: ['프리즘 성가대','Prism Choir'], tint: 0xbc9afb, hp: 2, bossHp: 19000, drift: [95,125,64], core: 54, bulletSpeed: 1.25, pattern: ['wall','fan','spiral'], reward: 300 },
  { name: ['정적의 핵','Heart of Silence'], boss: ['정적','The Hush'], tint: 0xf284ad, hp: 2.5, bossHp: 28700, drift: [85,114,138], core: 60, bulletSpeed: 1.35, pattern: ['spiral','rain','ring'], reward: 420 },
] as const;

export const patterns = {
  aim: { every: 1.55, count: 3, speed: 175, tell: .35 },
  fan: { every: 1.4, count: 7, speed: 170, tell: .4 },
  ring: { every: 1.65, count: 12, speed: 145, tell: .45 },
  wall: { every: 3, count: 19, speed: 165, tell: 1, gap: 130 },
  rain: { every: 2.1, count: 11, speed: 185, tell: .7 },
  spiral: { every: .43, count: 3, speed: 150, tell: .17 },
};

export const cards = [
  { id:'power', name:['증폭 탄두','Amplified Warhead'], effect:['공격력 +10%','Damage +10%'], max:5, value:.10 },
  { id:'rate', name:['속사 코일','Rapid Coil'], effect:['공격 속도 +10%','Fire rate +10%'], max:5, value:.1 },
  { id:'spread', name:['이중 사격','Split Shot'], effect:['투사체 +1 · 탄당 피해 −12%','+1 projectile · damage per shot −12%'], max:3, value:.12 },
  { id:'pierce', name:['관통 탄심','Piercing Core'], effect:['관통 +1','Pierce +1'], max:3, value:1 },
  { id:'critical', name:['정밀 조준','Precision Aim'], effect:['치명타 확률 +6%','Critical chance +6%'], max:5, value:.06 },
  { id:'armor', name:['장갑 보강','Hull Plating'], effect:['최대 체력 +1 · 즉시 회복 1','Max hull +1 · repair 1'], max:2, value:1 },
  { id:'shield', name:['쉴드 코어','Shield Core'], effect:['쉴드 재충전 −1.6초','Shield recharge −1.6s'], max:5, value:1.6 },
  { id:'dash', name:['회피 기동','Evasive Drive'], effect:['대시 재사용 대기 −12%','Dash cooldown −12%'], max:5, value:.12 },
  { id:'magnet', name:['자력','Magnet'], effect:['젬 흡수 범위 +25%','Gem pickup range +25%'], max:4, value:.25 },
  { id:'motor', name:['이동 모터','Flight Motor'], effect:['이동 속도 +6%','Move speed +6%'], max:5, value:.06 },
  { id:'range', name:['긴 실','Long Thread'], effect:['테더 범위 +40','Tether range +40'], max:3, value:40 },
  { id:'field', name:['날 선 실','Keen Thread'], effect:['테더 필드 피해 +25%','Tether field damage +25%'], max:4, value:.25 },
  { id:'fire', name:['화염 탄','Ember Round'], effect:['화상 피해','Applies burn'], max:3, value:.25 },
  { id:'frost', name:['빙결 탄','Frost Round'], effect:['적 이동 저하','Slows enemies'], max:3, value:.15 },
  { id:'volt', name:['전격 탄','Volt Round'], effect:['주변 적에게 연쇄 피해','Chains damage to nearby enemies'], max:3, value:.5 },
  { id:'gravity', name:['중력 탄','Gravity Round'], effect:['주변 적 끌어당김','Pulls nearby enemies together'], max:3, value:18 },
] as const;

type Relic = {name:readonly [string,string]; effect:readonly [string,string]; damage:number; rate:number; hull:number;
  shieldDelay?:number; linkCharge?:number; field?:number; core?:number };
export const relics: readonly Relic[] = [
  { name:['유리 등불','Glass Lantern'], effect:['공격력 +60% · 최대 체력 −2','Damage +60% · max hull −2'], damage:.6, rate:0, hull:-2 },
  { name:['별빛 합금','Starlight Alloy'], effect:['최대 체력 +1 · 완전 수리','Max hull +1 · full repair'], damage:0, rate:0, hull:1 },
  { name:['맥동 코어','Pulse Core'], effect:['공격 속도 +20%','Fire rate +20%'], damage:0, rate:.2, hull:0 },
  { name:['조준 렌즈','Core Lens'], effect:['보스 코어 피해 +25% · 연사 −10%','Boss core damage +25% · fire rate −10%'], damage:0, rate:-.1, hull:0, core:.25 },
  { name:['은빛 피뢰침','Silver Conductor'], effect:['필드 피해 +25% · 쉴드 충전 +2초','Field damage +25% · shield recharge +2s'], damage:0, rate:0, hull:0, shieldDelay:2, field:.25 },
  { name:['공명 축전기','Resonant Capacitor'], effect:['링크 중 공명 충전 +40% · 공격력 −10%','Resonance charge +40% while linked · damage −10%'], damage:-.1, rate:0, hull:0, linkCharge:.4 },
  { name:['반사 장갑','Reflective Hull'], effect:['쉴드 충전 −2.5초 · 연사 −10%','Shield recharge −2.5s · fire rate −10%'], damage:0, rate:-.1, hull:0, shieldDelay:-2.5 },
] as const;

export const modes = ['voyage', 'endless', 'daily'] as const;
export type Mode = typeof modes[number];
export type CardId = typeof cards[number]['id'];
export type Pattern = keyof typeof patterns;
export const stats = Object.fromEntries(cards.map(card => [card.id,card.value])) as Record<CardId, number>;

export const ships = {
  aster: { name:['아스터','Aster'], hull:4, speed:420, damage:8, rate:2.8, count:2, cooldown:6, unlock:0 },
  vesper: { name:['베스퍼','Vesper'], hull:3, speed:440, damage:5, rate:3, count:3, cooldown:9, unlock:120 },
  rook: { name:['룩','Rook'], hull:5, speed:340, damage:38, rate:.9, count:1, cooldown:10, unlock:280 },
  pico: { name:['피코','Pico'], hull:3, speed:520, damage:6, rate:3.5, count:2, cooldown:7, unlock:500 },
  sol: { name:['솔','Sol'], hull:4, speed:400, damage:10, rate:3, count:1, cooldown:25, unlock:800 },
} as const;
export type Ship = keyof typeof ships;

export function difficulty(heat:number) {
  if(heat<0) return {
    hull:2, enemyHp:.85, bulletSpeed:.8, shieldDelay:0, extraElites:0, repair:1,
    bossExtra:false, extraSpawns:false, lull:8, bossHp:1, voidChance:0, score:.5, dust:.6,
  };
  return {
    hull:heat>=10?-1:0, enemyHp:heat>=1?1.1:1, bulletSpeed:(heat>=2?1.06:1)*(heat>=9?1.06:1),
    shieldDelay:heat>=7?4:0, extraElites:heat>=3?1:0, repair:heat>=4?.6:1,
    bossExtra:heat>=5, extraSpawns:heat>=6, lull:heat>=8?5:8, bossHp:heat>=9?1.2:1,
    voidChance:heat>=10?.1:0, score:1, dust:1+.12*heat,
  };
}
export const combat = {
  ramTell: .8, ramWidth: 44, volleyVariation: 3, voidShell: .32, bossDuetCap: .09, wingDamage:.29, voidShards:1.5, heatReinforcementXp:.30,
};
