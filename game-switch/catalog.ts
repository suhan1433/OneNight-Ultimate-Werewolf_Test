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

export function entry(game: GameId, name: string, count: number, code?: string): [string, object] {
  const nickname = name;
  if (game === 'deception') return code ? ['join', { code, name }] : ['create', { name }];
  if (game === 'secret_hitler') return [code ? 'JOIN_ROOM' : 'CREATE_ROOM', { name, avatar: 0, ...(code ? { code } : {}) }];
  if (game === 'rummikub') return [code ? 'room:join' : 'room:create', { name, clientSeq: 0, ...(code ? { roomId: code } : { maxPlayers: count }) }];
  if (code) return ['ROOM_JOIN', { nickname, ...(game === 'spacecrew' ? { code } : { roomCode: code }) }];
  if (game === 'spacecrew') return ['ROOM_CREATE', { nickname, maxPlayers: count, missionId: 1 }];
  if (game === 'skullking') return ['ROOM_CREATE', { nickname, config: { maxPlayers: count, roundMode: 'classic' } }];
  if (game === 'avalon') return ['ROOM_CREATE', { nickname, maxPlayers: count, options: { assassin: true, percival: true } }];
  const roles = ['werewolf','werewolf','seer','robber','troublemaker','villager','villager','villager','drunk','insomniac','hunter','tanner','minion'];
  return ['ROOM_CREATE', { nickname, maxPlayers: count, selectedRoles: roles.slice(0, count + 3), actionTimeLimitSeconds: 15, dayTimeLimitSeconds: 300 }];
}

