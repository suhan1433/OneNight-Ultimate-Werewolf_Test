import { ROLE_DEFINITIONS } from '../packages/shared/src/roles';
import { COUNT_TABLE } from '../avalon/packages/shared/src/roles';
import { games, type GameId } from './catalog';

export type SettingValue = string | number | boolean | null;
export type SwitchSetup = { maxPlayers: number; values: Record<string, SettingValue>; selectedRoles: string[] };
export type SettingField = { key: string; label: string; options?: [SettingValue, string][]; min?: number; max?: number; checkbox?: boolean; hint?: string };
export const werewolfRoles = Object.values(ROLE_DEFINITIONS);
export const skullCards: [string, string][] = [
  ['kraken','크라켄'], ['whale','화이트 웨일'], ['loot','전리품'], ['pirateAbilities','해적 능력'],
  ['expansionSuitCards','수트 확장 12장'], ['wildMonkey','와일드 몽키'], ['maryThorne','메리 손'],
  ['lastVolley','라스트 발리'], ['firstMateCon','퍼스트 메이트 콘'], ['stingray','스팅레이'],
  ['davyJones','데비 존스'], ['walkThePlank','널빤지 걷기'],
];
export const avalonRoles: [string, string][] = [['assassin','암살자'], ['percival','퍼시벌'], ['morgana','모르가나'], ['mordred','모드레드'], ['oberon','오베론']];
const times = (values: number[]): [number, string][] => values.map(n => [n, `${n}초`]);
const bool = (key: string, label: string, hint?: string): SettingField => ({ key, label, checkbox: true, hint });
export const defaultWerewolfDeck = (count: number) => ['werewolf','werewolf','seer','robber','troublemaker','villager','villager','villager','drunk','insomniac','hunter','tanner','minion'].slice(0, count + 3);

export function defaultSetup(game: GameId, count: number): SwitchSetup {
  const maxPlayers = Math.max(count, games[game].min);
  const defaults: Record<GameId, Record<string, SettingValue>> = {
    werewolf: { actionTimeLimitSeconds: 15, dayTimeLimitSeconds: 300 },
    avalon: { assassin: true, percival: true, morgana: false, mordred: false, oberon: false, assassinationAbilityRole: null, revealVoteIdentities: true },
    skullking: { roundMode: 'classic', ...Object.fromEntries(skullCards.map(([key]) => [key, false])) },
    spacecrew: { missionId: 1 },
    rummikub: { initialMeldMin: 30, turnSeconds: 120, penaltyDraw: 3, jokerPenalty: 30, jokerReuse: 'free', allowJokerMeldManipulation: true, allowTwoJokersInMeld: true, allowManipulationOnInitialMeldTurn: false },
    deception: { cardsPerKind: 4, events: false, presentationSeconds: 30, discussionSeconds: 10, crimeSeconds: 25, accomplice: count >= 6, witness: count >= 8, forensicPlayer: '' },
    secret_hitler: { timerSeconds: 0, language: 'ko' },
  };
  return { maxPlayers, values: defaults[game], selectedRoles: game === 'werewolf' ? defaultWerewolfDeck(maxPlayers) : [] };
}

export function settingFields(game: GameId): SettingField[] {
  switch (game) {
    case 'werewolf': return [
      { key: 'actionTimeLimitSeconds', label: '밤 행동 제한 시간', options: times([8,10,15]) },
      { key: 'dayTimeLimitSeconds', label: '낮 토론 시간', options: [[300,'5분'],[600,'10분'],[1200,'20분'],[1800,'30분']] },
    ];
    case 'avalon': return [
      ...avalonRoles.map(([key,label]) => bool(key,label)),
      { key: 'assassinationAbilityRole', label: '암살 능력을 맡길 역할', options: [[null,'위임하지 않음'],['morgana','모르가나'],['mordred','모드레드'],['oberon','오베론']], hint: '암살자를 제외했다면 선택한 악 역할 중 하나에 암살 능력을 맡겨 주세요.' },
      bool('revealVoteIdentities','원정 기록에 투표자 공개'),
    ];
    case 'skullking': return [
      { key: 'roundMode', label: '라운드 방식', options: [['classic','클래식 · 1~10장'],['evenKeeled','이븐 킬드 · 2·4·6·8·10장'],['brawl','브롤 · 6~10장'],['swift','스위프트 · 5장씩 5회'],['broadside','브로드사이드 · 10장씩 10회'],['whirlpool','월풀 · 9·7·5·3·1장 각 2회'],['bedtime','베드타임 · 1장 1회']] },
      ...skullCards.map(([key,label]) => bool(key,label)),
    ];
    case 'spacecrew': return [{ key: 'missionId', label: '시작 미션', min: 1, max: 50, hint: '1~50번 미션 중 선택해 주세요. 대기실에서도 바꿀 수 있습니다.' }];
    case 'rummikub': return [
      { key: 'initialMeldMin', label: '첫 등록 최소 점수', min: 1, max: 104 },
      { key: 'turnSeconds', label: '턴 제한 시간', min: 20, max: 600 },
      { key: 'penaltyDraw', label: '시간 초과 시 벌칙 타일', min: 1, max: 10 },
      { key: 'jokerPenalty', label: '남은 조커 벌점', min: 1, max: 100 },
      { key: 'jokerReuse', label: '회수한 조커 재사용', options: [['free','자유롭게 사용'],['newMeld','새 조합에 사용'],['newMeldFromHand','손패로 만든 새 조합에 사용']] },
      bool('allowJokerMeldManipulation','조커가 있는 조합 재배치 허용'), bool('allowTwoJokersInMeld','한 조합에 조커 2장 허용'), bool('allowManipulationOnInitialMeldTurn','첫 등록 턴에 기존 조합 재배치 허용'),
    ];
    case 'deception': return [
      { key: 'cardsPerKind', label: '종류별 카드 수', options: [[3,'3장'],[4,'4장'],[5,'5장']] }, bool('events','사건 이벤트 사용'),
      { key: 'crimeSeconds', label: '범행 선택 시간', min: 5, max: 300 },
      { key: 'discussionSeconds', label: '토론 시간', options: [[null,'제한 없음'],...times([10,30,60,120,300,600])] },
      { key: 'presentationSeconds', label: '개인 발표 시간', options: [[null,'제한 없음'],...times([20,30,45,60])] },
      bool('accomplice','공범 포함','이동하는 사람이 6명 이상일 때 선택할 수 있습니다.'), bool('witness','목격자 포함','6명 이상이며 공범이 포함되어야 합니다.'),
    ];
    case 'secret_hitler': return [
      { key: 'timerSeconds', label: '단계 제한 시간', options: [[0,'제한 없음'],...times([30,60,120])] },
      { key: 'language', label: '게임 언어', options: [['ko','한국어'],['en','English']] },
    ];
  }
}

export function validateSetup(game: GameId, setup: SwitchSetup, count: number): string | null {
  if (!Number.isInteger(count) || count < 1 || count > games[game].max) return '현재 참가 인원으로 이동할 수 없습니다.';
  if (!Number.isInteger(setup.maxPlayers) || setup.maxPlayers < Math.max(count, games[game].min) || setup.maxPlayers > games[game].max) return `정원은 현재 참가자를 포함해 ${Math.max(count,games[game].min)}~${games[game].max}명으로 설정해 주세요.`;
  for (const field of settingFields(game)) {
    const value = setup.values[field.key];
    if (field.checkbox && typeof value !== 'boolean') return `${field.label} 설정을 확인해 주세요.`;
    if (field.options && !field.options.some(([option]) => option === value)) return `${field.label} 항목을 선택해 주세요.`;
    if (field.min !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < field.min || value > field.max!)) return `${field.label}: ${field.min}~${field.max} 사이의 정수를 입력해 주세요.`;
  }
  const v = setup.values;
  if (game === 'avalon') {
    const evil = ['assassin','morgana','mordred','oberon'].filter(key => v[key]).length;
    if (evil > COUNT_TABLE[setup.maxPlayers]!.evil) return `이 인원에서 악 역할은 ${COUNT_TABLE[setup.maxPlayers]!.evil}개까지 선택할 수 있습니다.`;
    if (v.assassin && v.assassinationAbilityRole !== null) return '암살자를 포함하면 암살 능력 위임을 해제해 주세요.';
    if (!v.assassin && (!v.assassinationAbilityRole || !v[String(v.assassinationAbilityRole)])) return '암살자를 포함하거나, 선택한 악 역할에 암살 능력을 맡겨 주세요.';
  }
  if (game === 'werewolf') {
    if (setup.selectedRoles.length !== setup.maxPlayers + 3) return `역할 카드를 정원 + 중앙 3장, 총 ${setup.maxPlayers + 3}장 선택해 주세요. (현재 ${setup.selectedRoles.length}장)`;
    for (const id of new Set(setup.selectedRoles)) {
      const role = werewolfRoles.find(role => role.id === id);
      if (!role || setup.selectedRoles.filter(value => value === id).length > role.maxCount) return '역할 카드의 종류와 허용 수량을 확인해 주세요.';
    }
  }
  if (game === 'skullking' && setup.maxPlayers < 3 && skullCards.some(([key]) => v[key])) return '스컬킹 특수 카드와 확장 규칙은 정원 3명 이상에서 사용할 수 있습니다.';
  if (game === 'deception') {
    if (count < 6 && (v.accomplice || v.witness)) return '공범과 목격자는 이동하는 사람이 6명 이상일 때 사용할 수 있습니다.';
    if (v.witness && !v.accomplice) return '목격자를 포함하려면 공범도 포함해 주세요.';
  }
  return null;
}

export function setupSummary(game: GameId, setup: SwitchSetup): string {
  const v = setup.values;
  if (game === 'avalon') return `정원 ${setup.maxPlayers}명 · 선 ${COUNT_TABLE[setup.maxPlayers]?.good ?? '?'} / 악 ${COUNT_TABLE[setup.maxPlayers]?.evil ?? '?'} · 멀린 필수 · ${avalonRoles.filter(([key]) => v[key]).map(([,label]) => label).join(', ') || '선택 역할 없음'} · 나머지는 충신·악의 하수인`;
  if (game === 'werewolf') return `정원 ${setup.maxPlayers}명 · 역할 카드 ${setup.selectedRoles.length}/${setup.maxPlayers + 3}장`;
  if (game === 'deception') return '법의학자·범인은 필수이며, 나머지 수사관과 선택 역할은 시작할 때 배정됩니다.';
  return `정원 ${setup.maxPlayers}명 · 설정한 규칙으로 새 대기실을 만듭니다.`;
}

/** These games expose lobby settings separately from room creation. */
export function lobbySettings(game: GameId, setup: SwitchSetup, sessions: Record<string, { playerId?: string }> = {}): [string, object] | null {
  if (game === 'secret_hitler') return ['SETTINGS', { maxPlayers: setup.maxPlayers, timerSeconds: setup.values.timerSeconds, language: setup.values.language }];
  if (game === 'deception') {
    const { forensicPlayer, ...settings } = setup.values;
    if (forensicPlayer && !sessions[String(forensicPlayer)]?.playerId) throw Error('선택한 법의학자가 이동 참가자 목록에 없습니다.');
    return ['settings', { settings, forensicChoice: forensicPlayer ? sessions[String(forensicPlayer)]!.playerId : null }];
  }
  return null;
}
