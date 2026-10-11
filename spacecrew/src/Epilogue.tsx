import type { Game, Send } from './types';

/** 에필로그(미션 50): 궤도선이 한 점으로 모이고 행성 9의 실루엣이 나타난다. */
const ORBITS: [number, number, number][] = [[-24, 150, 62], [18, 138, 50], [62, 126, 42], [-58, 118, 36], [92, 142, 56], [-84, 130, 46]];
export function Epilogue({ game, send }: { game: Game; send: Send }) {
  return <div className="layer epilogue" role="dialog" aria-label="에필로그">
    <svg viewBox="0 0 400 300" role="img" aria-label="외곽 궤도들이 한 지점으로 모이며 행성 9의 실루엣이 나타납니다">
      <defs>
        <radialGradient id="p9" cx="38%" cy="34%" r="75%"><stop offset="0" stopColor="#1b2a4a" /><stop offset=".6" stopColor="#070d1c" /><stop offset="1" stopColor="#02040a" /></radialGradient>
        <radialGradient id="p9glow"><stop offset="0" stopColor="#5ee6d3" stopOpacity=".45" /><stop offset="1" stopColor="#5ee6d3" stopOpacity="0" /></radialGradient>
      </defs>
      <g fill="none" stroke="#5ee6d3" strokeWidth="1">{ORBITS.map(([a, rx, ry], i) => <ellipse key={i} className="orbit-line" cx="200" cy="150" rx={rx} ry={ry} transform={`rotate(${a} 200 150)`} style={{ animationDelay: `${0.4 + i * 0.25}s` }} />)}</g>
      <circle className="p9-glow" cx="200" cy="150" r="70" fill="url(#p9glow)" />
      <circle className="p9" cx="200" cy="150" r="26" fill="url(#p9)" stroke="#5ee6d3" strokeOpacity=".55" strokeWidth="1" />
    </svg>
    <div className="epi-text"><h2>행성 9</h2><p>흩어져 있던 궤도 자료가 한 점을 가리켰어요. 어둠 속에서 윤곽이 드러났습니다.</p>
      {game.playerId === game.hostId ? <button type="button" className="primary" autoFocus onClick={() => send('GAME_RESTART')}>대기실로 돌아가기</button> : <p className="wait-host">방장이 대기실로 돌아가면 이어서 진행해요.</p>}</div>
  </div>;
}
