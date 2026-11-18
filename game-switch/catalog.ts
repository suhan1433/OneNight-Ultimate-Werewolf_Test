import { defaultSetup, validateSetup, type SwitchSetup } from './settings';
export type GameId = 'werewolf' | 'avalon' | 'skullking' | 'spacecrew' | 'rummikub' | 'deception' | 'secret_hitler';
export type Member = { id: string; name: string };
export const games: Record<GameId, { label: string; min: number; max: number; port: number; path: string; key: string }> = {
  werewolf: { label: '한밤의 늑대인간', min: 3, max: 10, port: 3001, path: '/api/socket', key: 'werewolf-session' },
  avalon: { label: '아발론', min: 5, max: 10, port: 3002, path: '/api/avalon/socket', key: 'avalon-session' },
  skullking: { label: '스컬 킹', min: 2, max: 9, port: 3004, path: '/api/skullking/socket', key: 'skullking-session' },
  spacecrew: { label: '더 크루', min: 3, max: 5, port: 3005, path: '/api/spacecrew/socket/', key: 'planet-nine-online-session' },
  rummikub: { label: '루미큐브', min: 2, max: 4, port: 3010, path: '/api/rummikub/socket', key: 'rummikub-neon-session' },
  deception: { label: '네온 사건파일 (디셉션)', min: 4, max: 12, port: 3007, path: '/api/deception/socket/', key: 'neon.session.v1' },
  secret_hitler: { label: '시크릿 히틀러', min: 5, max: 10, port: 3008, path: '/secret_hitler/socket.io', key: 'sh-session' },
};

export function entry(game: GameId, name: string, count: number, code?: string, setup?: SwitchSetup): [string, object] {
  if (code) {
    if (game === 'deception') return ['join', { code, name }];
    if (game === 'secret_hitler') return ['JOIN_ROOM', { name, avatar: 0, code }];
    if (game === 'rummikub') return ['room:join', { name, clientSeq: 0, roomId: code }];
    return ['ROOM_JOIN', { nickname: name, ...(game === 'spacecrew' ? { code } : { roomCode: code }) }];
  }
  const config = setup ?? defaultSetup(game, count);
  const error = validateSetup(game, config, count);
  if (error) throw Error(error);
  const { maxPlayers, values } = config;
  if (game === 'deception') return ['create', { name }];
  if (game === 'secret_hitler') return ['CREATE_ROOM', { name, avatar: 0, language: values.language }];
  if (game === 'rummikub') return ['room:create', { name, clientSeq: 0, maxPlayers, config: values }];
  if (game === 'spacecrew') return ['ROOM_CREATE', { nickname: name, maxPlayers, missionId: values.missionId }];
  if (game === 'skullking') {
    const { roundMode, ...cards } = values;
    return ['ROOM_CREATE', { nickname: name, config: { maxPlayers, roundMode, cards } }];
  }
  if (game === 'avalon') return ['ROOM_CREATE', { nickname: name, maxPlayers, options: values }];
  return ['ROOM_CREATE', { nickname: name, maxPlayers, selectedRoles: config.selectedRoles, ...values }];
}
