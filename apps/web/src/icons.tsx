import React from "react";
import { ROLE_DEFINITIONS } from "@werewolf/shared";

/* ============================================================
   아이콘 시스템 — "달빛 아래 새긴 동판화"
   · 모든 아이콘은 32×32 그리드, 1.6px 라운드 스트로크, 진영 색 그라디언트
   · <IconDefs/> 를 앱 최상단에 한 번만 마운트하면 그라디언트가 공유된다
   ============================================================ */

export function IconDefs() {
  const g = (id: string, a: string, b: string) => (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="28" y2="30">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {g("ic-gold", "#fff1bd", "#c79a3c")}
        {g("ic-rose", "#ffd6da", "#d4576a")}
        {g("ic-blue", "#e2f0ff", "#5f8fcf")}
        {g("ic-tan", "#f3d9b8", "#a87848")}
      </defs>
    </svg>
  );
}

const GRAD: Record<string, string> = {
  village: "ic-blue",
  werewolf: "ic-rose",
  minion: "ic-rose",
  tanner: "ic-tan",
};

/* 한 줄로 그린 역할 글리프. 채움(fill)은 stroke 색 + 낮은 투명도로 은은한 깊이를 준다 */
const wolf = (
  <>
    <path d="M6 5l6 4.5h8L26 5l1.5 10.5-4.5 7.5-3 3.5h-8l-3-3.5-4.5-7.5z" className="f" />
    <path d="M12.5 17l2.5 1.5M19.5 17L17 18.5M14 25l2 1.5 2-1.5" />
  </>
);

const GLYPH: Record<string, React.ReactNode> = {
  werewolf: wolf,
  alpha_wolf: (
    <>
      {wolf}
      <path d="M11 3.5l2.5 2 2.5-3 2.5 3 2.5-2" />
    </>
  ),
  mystic_wolf: (
    <>
      {wolf}
      <circle cx="16" cy="12.6" r="1.7" />
    </>
  ),
  minion: (
    <>
      <path d="M16 3.5c-5.5 0-8.5 5-8.5 10.5V28.5h17V14c0-5.500-3-10.500-8.500-10.500z" className="f" />
      <path d="M11.500 13.500c1.500-1.500 7.500-1.500 9 0M12.500 17.500h1.500M18 17.500h1.500" />
    </>
  ),
  seer: (
    <>
      <path d="M2.500 16C6 10 10.500 7.500 16 7.500S26 10 29.500 16C26 22 21.500 24.500 16 24.500S6 22 2.500 16z" className="f" />
      <circle cx="16" cy="16" r="4" />
      <path d="M16 2.500v2.500M7 5l1.500 2M25 5l-1.500 2M16 27v2.500" />
    </>
  ),
  apprentice_seer: (
    <>
      <path d="M2.500 17C6 11.500 10.500 9 16 9s10 2.500 13.500 8C26 22.500 21.500 25 16 25S6 22.500 2.500 17z" className="f" />
      <circle cx="16" cy="17" r="3.200" />
      <path d="M8 5.500l2 2.500M16 3.500V7M24 5.500L22 8" />
    </>
  ),
  robber: (
    <>
      <path d="M2.500 11.500C8 9 12 12 16 12s8-3 13.500-.5c-.5 6-3 9-6.500 9-3 0-4-3-7-3s-4 3-7 3c-3.500 0-6-3-6.500-9z" className="f" />
      <path d="M9 15.500h3M20 15.500h3" />
      <path d="M11 26.500h10l-1.500 3h-7z" />
    </>
  ),
  troublemaker: (
    <>
      <path d="M4 22.500C3 13 6 8 8 4.500c2 4 4 4.500 8 4.500s6-.5 8-4.500c2 3.500 5 8.500 4 18z" className="f" />
      <path d="M4 22.500h24v4.500H4z" />
      <circle cx="8" cy="4.500" r="1.200" />
      <circle cx="24" cy="4.500" r="1.200" />
      <path d="M12 16l8 0M16 12.500v7" />
    </>
  ),
  drunk: (
    <>
      <path d="M8 4h16l-1 8c-.7 4.500-3.500 7-7 7s-6.300-2.500-7-7z" className="f" />
      <path d="M8.600 10h14.800M16 19v7.500M10.500 28h11" />
    </>
  ),
  insomniac: (
    <>
      <path d="M11 14h10v14H11z" className="f" />
      <path d="M16 14v-2.500M16 3.500c3 3 3.500 5 0 8-3.500-3-3-5 0-8zM8 28h16" />
      <path d="M5 8l1.500 1M27 8l-1.500 1" />
    </>
  ),
  hunter: (
    <>
      <circle cx="16" cy="16" r="9.500" className="f" />
      <circle cx="16" cy="16" r="3" />
      <path d="M16 2.500v8M16 21.500v8M2.500 16h8M21.500 16h8" />
    </>
  ),
  mason: (
    <>
      <path d="M16 3.500L5 27.500M16 3.500l11 24M9 19.500h14" />
      <circle cx="16" cy="5" r="2.300" className="f" />
      <path d="M5 27.500l3.500-1.500M27 27.500l-3.500-1.500" />
    </>
  ),
  villager: (
    <>
      <path d="M3.500 15L16 4.500 28.500 15" />
      <path d="M6.500 13v15h19V13z" className="f" />
      <path d="M13 28v-8h6v8M22 8.500V5h2.500v5" />
    </>
  ),
  tanner: (
    <>
      <path d="M16 3.500c-6 0-9.500 4-9.500 9 0 3.500 1.700 5.700 3.500 7v5.500h12V19.500c1.800-1.300 3.500-3.500 3.500-7 0-5-3.500-9-9.500-9z" className="f" />
      <circle cx="12" cy="13" r="2" />
      <circle cx="20" cy="13" r="2" />
      <path d="M16 17l-1 2.500h2zM13 25v3M16 25v3M19 25v3" />
    </>
  ),
  apprentice_tanner: (
    <>
      <path d="M16 5c-5.500 0-8.500 3.700-8.500 8.200 0 3.200 1.500 5.200 3.200 6.400v5.400h11.600v-5.400c1.700-1.200 3.200-3.200 3.200-6.400C25.500 8.700 21.500 5 16 5z" strokeDasharray="3 2.400" className="f" />
      <circle cx="12.500" cy="13.500" r="1.700" />
      <circle cx="19.500" cy="13.500" r="1.700" />
      <path d="M16 3v-1M26 6l1-1" />
    </>
  ),
  bodyguard: (
    <>
      <path d="M16 3l11 4v8c0 7-4.500 11.500-11 14C9.500 26.500 5 22 5 15V7z" className="f" />
      <path d="M16 8v15M11 13h10" />
    </>
  ),
  shield_bearer: (
    <>
      <path d="M16 3l11 4v8c0 7-4.500 11.500-11 14C9.500 26.500 5 22 5 15V7z" className="f" />
      <circle cx="16" cy="14.500" r="4" />
      <circle cx="16" cy="14.500" r=".8" />
    </>
  ),
  prince: (
    <>
      <path d="M4 24L2.500 9l7.500 6.500L16 5l6 10.500L29.500 9 28 24z" className="f" />
      <path d="M4 28h24" />
      <circle cx="16" cy="18.500" r="1.500" />
    </>
  ),
  cursed: (
    <>
      <path d="M16 3.500c5 6 8 9.500 8 14a8 8 0 01-16 0c0-4.500 3-8 8-14z" className="f" />
      <path d="M16 12c-3 0-3.500 4-.5 4.500s3.500 3 .5 4M12 28h8" />
    </>
  ),
  doppelganger: (
    <>
      <path d="M11 5c-4 0-6.500 3-6.500 7 0 5.500 3 10 6.500 10s6.500-4.500 6.500-10c0-4-2.500-7-6.500-7z" className="f" />
      <path d="M21 10c4 0 6.500 3 6.500 7 0 5.500-3 10-6.500 10-2 0-3.700-1.500-4.800-3.700" strokeDasharray="3 2.400" />
      <path d="M8 12h1.500M12.500 12H14M9 17.500c1 1 3 1 4 0" />
    </>
  ),
  journalist: (
    <>
      <path d="M5 6.500h17v19H8.500a3.500 3.500 0 01-3.500-3.500z" className="f" />
      <path d="M22 11h5v11a3.500 3.500 0 01-3.500 3.500M9 11h9M9 15h9M9 19.500h5" />
    </>
  ),
  witch: (
    <>
      <path d="M16 2.500l5 16H11z" className="f" />
      <path d="M3.500 24c5-3 8.500-4 12.500-4s7.500 1 12.500 4c-4 3-8.500 4-12.500 4S7.500 27 3.500 24z" />
      <path d="M11.800 15h8.400" />
    </>
  ),
};

const FALLBACK = (
  <>
    <circle cx="16" cy="16" r="11.500" className="f" />
    <path d="M12 12.500c0-2.500 2-4 4-4s4 1.500 4 3.500-2 3-4 4v2M16 22.500v.5" />
  </>
);

export function RoleIcon({ id, size = 28, faction }: { id?: string; size?: number; faction?: string }) {
  const f = faction ?? (id ? (ROLE_DEFINITIONS as any)[id]?.faction : undefined) ?? "village";
  return (
    <svg
      className="ic role-ic"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={`url(#${GRAD[f] ?? "ic-gold"})`}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(id && GLYPH[id]) || FALLBACK}
    </svg>
  );
}

/* 카드 뒷면 인장: 달 + 여덟 방향 광선 + 이중 링 */
export function Sigil({ size = 72 }: { size?: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const [x1, y1, x2, y2] = [Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a) * (i % 2 ? 19 : 22), Math.sin(a) * (i % 2 ? 19 : 22)];
    return <path key={i} d={`M${16 + x1} ${16 + y1}L${16 + x2} ${16 + y2}`} />;
  });
  return (
    <svg className="ic sigil" width={size} height={size} viewBox="-4 -4 40 40" fill="none" stroke="url(#ic-gold)" strokeWidth="1" strokeLinecap="round" aria-hidden="true">
      <circle cx="16" cy="16" r="13" />
      <circle cx="16" cy="16" r="11" strokeDasharray="1 2.200" />
      {rays}
      <path d="M19.500 10.500a6.500 6.500 0 100 11 5.200 5.200 0 010-11z" fill="url(#ic-gold)" stroke="none" />
    </svg>
  );
}

/* UI 아이콘 — currentColor */
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "ic ui-ic" };

export const Icon = {
  Sound: () => (<svg {...base}><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4.200 4.200 0 010 6M18 6.500a8 8 0 010 11" /></svg>),
  Mute: () => (<svg {...base}><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9.500l5 5M21 9.500l-5 5" /></svg>),
  Mic: () => (<svg {...base}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.500 11a6.500 6.500 0 0013 0M12 17.500V21M9 21h6" /></svg>),
  MicOff: () => (<svg {...base}><path d="M9 9V6a3 3 0 015.500-1.700M15 10v1a3 3 0 01-4.500 2.600M5.500 11a6.500 6.500 0 0010.300 5.300M18.500 11c0 .8-.1 1.500-.4 2.200M12 17.500V21M9 21h6M3.500 3.500l17 17" /></svg>),
  Lock: () => (<svg {...base} width={14} height={14}><rect x="5" y="10.500" width="14" height="10" rx="2.500" /><path d="M8 10.500V8a4 4 0 018 0v2.500M12 14.500v2.500" /></svg>),
  News: () => (<svg {...base} width={16} height={16}><path d="M4 5h13v14H6.500A2.500 2.500 0 014 16.500zM17 9h3v8.500a1.500 1.500 0 01-3 0M7.500 9h6M7.500 12.500h6M7.500 16h3" /></svg>),
  Trophy: () => (<svg {...base}><path d="M7.500 4h9v5.500a4.500 4.500 0 01-9 0zM7.500 6H4.500c0 3 1 4.500 3.300 5M16.500 6h3c0 3-1 4.500-3.300 5M12 14v4M8.500 20h7" /></svg>),
  Skull: () => (<svg {...base} width={16} height={16}><path d="M12 3.500c-4.500 0-7 3-7 6.800 0 2.500 1.200 4.200 2.700 5.200V19h8.600v-3.500c1.500-1 2.700-2.700 2.700-5.200 0-3.800-2.500-6.800-7-6.800z" /><circle cx="9.500" cy="11" r="1.300" /><circle cx="14.500" cy="11" r="1.300" /></svg>),
  Sparkle: () => (<svg {...base} width={20} height={20} strokeWidth={1.3}><path d="M12 2.500c.8 5.200 2.500 7.700 9.500 9.500-7 1.800-8.700 4.300-9.500 9.500-.8-5.200-2.500-7.700-9.500-9.500 7-1.800 8.700-4.300 9.500-9.500z" /></svg>),
};

/* ---------- 낮 · 투표용 ---------- */

/* 닉네임에서 색과 문양을 뽑는 가면 아바타 (같은 이름 = 항상 같은 얼굴) */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function MaskAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const h = hash(name);
  const hue = h % 360;
  const kind = (h >> 3) % 4;
  const c1 = `hsl(${hue} 55% 62%)`;
  const c2 = `hsl(${(hue + 40) % 360} 45% 26%)`;
  const id = `mk${h}`;
  return (
    <svg className="ic mask-av" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx=".35" cy=".25" r=".9">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22.500" fill="#100d2a" stroke="#dcbc6a" strokeOpacity=".5" />
      <path d="M6.500 20c4-3.500 9-4.500 17.500-1.500 8.500-3 13.500-2 17.500 1.500-.5 8-4.500 12.500-9 12.500-3 0-5-3-8.500-3s-5.500 3-8.500 3c-4.500 0-8.500-4.500-9-12.500z" fill={`url(#${id})`} stroke="#fff" strokeOpacity=".35" strokeWidth=".8" />
      <ellipse cx="16.500" cy="22.500" rx="3.400" ry="2.200" fill="#100d2a" />
      <ellipse cx="31.500" cy="22.500" rx="3.400" ry="2.200" fill="#100d2a" />
      {kind === 0 && <path d="M24 12l1.800 3.500-1.800 2.500-1.800-2.500z" fill="#fff" fillOpacity=".7" />}
      {kind === 1 && <path d="M34 12c3 0 5 1.500 6 4M36 9c3 .5 5 2 6.500 5" stroke="#fff" strokeOpacity=".6" fill="none" strokeLinecap="round" />}
      {kind === 2 && <path d="M12 27h5M31 27h5M22 25.500h4" stroke="#fff" strokeOpacity=".5" fill="none" strokeLinecap="round" />}
      {kind === 3 && <circle cx="24" cy="15.500" r="1.800" fill="#fff" fillOpacity=".7" />}
      <text x="24" y="42" textAnchor="middle" fontSize="8" fontWeight="800" fill="#f4ecd2" fontFamily="'Noto Serif KR',serif">{[...name][0]}</text>
    </svg>
  );
}

/* 붉은 밀랍 도장 */
export function WaxSeal({ size = 44 }: { size?: number }) {
  return (
    <svg className="ic wax-seal" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id="wax" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#f08c96" />
          <stop offset=".6" stopColor="#b8323f" />
          <stop offset="1" stopColor="#6e1425" />
        </radialGradient>
      </defs>
      <path d="M24 2c4 0 5 3.500 8.500 4.500S41 6 43 10s0 6.500 1.500 10 4.500 5.500 3 9.500-5 4-7 7.500-1.500 7-6 8-6-2.500-10-2.500-6 3.500-10.500 2.500-3.500-4.500-6-8-5.500-3.500-6.500-7.500 2-6 2.500-10S3.500 12 6 8.500s5.500-2 9-3.500S20 2 24 2z" fill="url(#wax)" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="#ffb3ba" strokeOpacity=".45" />
      <path d="M27 15.500a9 9 0 100 17 7.200 7.200 0 010-17z" fill="#ffd6da" fillOpacity=".8" />
    </svg>
  );
}

/* 해가 궤도를 따라 진다 · p: 0(시작) → 1(끝) */
export function SunArc({ p }: { p: number }) {
  const t = Math.min(1, Math.max(0, p));
  const x = 120 - 100 * Math.cos(Math.PI * t);
  const y = 118 - 100 * Math.sin(Math.PI * t);
  return (
    <svg className="sun-arc" viewBox="0 0 240 132" aria-hidden="true">
      <path d="M20 118A100 100 0 0 1 220 118" pathLength={1} fill="none" stroke="#8a4b1266" strokeWidth="1.500" strokeDasharray=".012 .018" />
      <path d="M20 118A100 100 0 0 1 220 118" pathLength={1} fill="none" stroke="url(#ic-gold)" strokeWidth="2.500" strokeLinecap="round" strokeDasharray={`${t} 2`} />
      <path d="M6 118h228" stroke="#8a4b1255" strokeWidth="1" />
      <g transform={`translate(${x} ${y})`}>
        <circle r="20" fill="#fff2b0" fillOpacity=".35" className="sun-halo" />
        <circle r="9" fill="#ffd25e" stroke="#fff6d0" strokeWidth="1.500" />
      </g>
    </svg>
  );
}

/* 촛불: lit이면 불꽃이 켜진다 */
export function Candle({ lit }: { lit: boolean }) {
  return (
    <svg className={`candle${lit ? " lit" : ""}`} width="18" height="34" viewBox="0 0 18 34" aria-hidden="true">
      {lit && <path className="flame" d="M9 2c3.500 4 4.500 6.500 0 11-4.500-4.500-3.500-7 0-11z" fill="#ffd25e" />}
      <rect x="5" y="15" width="8" height="17" rx="1.500" fill={lit ? "#f4ecd2" : "#4a4470"} />
      <path d="M9 12.500v2.500" stroke="#8a7440" strokeWidth="1" />
    </svg>
  );
}

/* ---------- 홈 · 로비 ---------- */

/* 달빛 마을: 달 뒤로 언덕, 창에 불 켜진 마을, 달을 향해 우는 늑대 */
export function HeroScene() {
  return (
    <svg className="hero-scene" viewBox="0 0 360 300" role="img" aria-label="보름달 아래 언덕 위에서 울부짖는 늑대와 불 켜진 마을">
      <defs>
      <radialGradient id="hero-moon-g" cx=".38" cy=".3" r=".85"><stop offset="0" stopColor="#fff6c8"/><stop offset=".45" stopColor="#e9cd78"/><stop offset="1" stopColor="#a97a34"/></radialGradient>
      <radialGradient id="hero-fog-g" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#8a80c8" stopOpacity=".22"/><stop offset="1" stopColor="#8a80c8" stopOpacity="0"/></radialGradient>
      <linearGradient id="hero-hill-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2258"/><stop offset="1" stopColor="#171238"/></linearGradient>
      </defs>
      <circle className="hero-halo px px-0" cx="170" cy="118" r="104" fill="none" stroke="#dcbc6a" strokeOpacity=".14"/>
      <circle className="hero-halo b px px-0" cx="170" cy="118" r="126" fill="none" stroke="#dcbc6a" strokeOpacity=".08"/>
      <g className="hero-moon px px-0"><circle cx="170" cy="118" r="72" fill="url(#hero-moon-g)"/>
      <circle cx="146" cy="100" r="11" fill="#a97a34" fillOpacity=".22"/><circle cx="192" cy="136" r="15" fill="#a97a34" fillOpacity=".18"/><circle cx="178" cy="88" r="6" fill="#a97a34" fillOpacity=".2"/><circle cx="150" cy="140" r="7" fill="#a97a34" fillOpacity=".16"/></g>
      <path className="px px-1" d="M0 300V198C60 168 120 190 180 184C250 176 300 158 360 184V300Z" fill="url(#hero-hill-g)"/>
      <ellipse className="fog fog-a" cx="120" cy="214" rx="150" ry="16" fill="url(#hero-fog-g)"/>
      <path className="px px-2" d="M0 300V232C50 206 100 224 150 228C210 234 250 206 300 210C330 213 350 225 360 222V300Z" fill="#100c2c"/>
      <g className="px px-2" fill="#07061a">
      <path d="M288 212v-16l10-9 10 9v16z"/><path d="M312 214v-12l8-7 8 7v12z"/><path d="M262 216v-10l7-6 7 6v10z"/><path d="M336 216v-9l6-5 6 5v9z"/>
      <path d="M300 187l4-14 4 14z"/></g>
      <g className="px px-2" fill="#ffd25e"><rect className="win w1" x="295" y="198" width="4" height="5"/><rect className="win w2" x="317" y="204" width="4" height="4"/><rect className="win w3" x="267" y="207" width="3" height="4"/><rect className="win w2" x="339" y="209" width="3" height="4"/></g>
      <ellipse className="fog fog-b" cx="250" cy="238" rx="160" ry="14" fill="url(#hero-fog-g)"/>
      <path className="px px-3" d="M0 300V252C60 242 110 264 160 258C190 254 210 240 240 242C290 246 330 260 360 252V300Z" fill="#05040f"/>
      <g className="px px-3" fill="#05040f"><path d="M30 254l-11 0 11-40 11 40z"/><path d="M30 236l-9 0 9-30 9 30z"/><path d="M58 258l-9 0 9-32 9 32z"/><path d="M84 260l-8 0 8-26 8 26z"/></g>
      <g className="hero-wolf px px-3" transform="translate(178 140) scale(1.06)"><path fill="#05040f" d="M2 5C8 8 14 12 19 16L21 14L25 0L31 15L34 6L38 22C44 30 47 40 52 52C58 64 67 70 70 84C71 92 69 98 65 100L48 100C46 96 44 91 38 88L33 88L32 100L14 100L21 98L22 62C19 56 20 50 17 45L19 43L15 39C16 32 12 26 8 20C5 16 3 11 2 5Z"/><path fill="#05040f" d="M66 93C80 97 91 89 87 74C85 82 78 86 68 85Z"/></g>
      
    </svg>
  );
}

export const CopyIcon = () => (<svg {...base} width={15} height={15}><rect x="8.500" y="8.500" width="11.500" height="11.500" rx="2.500" /><path d="M15.500 8.500V6a2.500 2.500 0 00-2.500-2.500H6A2.500 2.500 0 003.500 6v7A2.500 2.500 0 006 15.500h2.500" /></svg>);
export const CheckIcon = ({ size = 15 }: { size?: number }) => (<svg {...base} width={size} height={size} strokeWidth={2.2}><path d="M5 12.500l4.500 4.500L19 7.500" /></svg>);
export const CrownIcon = () => (<svg className="ic crown-ic" width="16" height="16" viewBox="0 0 24 24" fill="url(#ic-gold)" stroke="#5a3d10" strokeWidth="1" strokeLinejoin="round" aria-hidden="true"><path d="M3 18L2 7l6 5 4-7 4 7 6-5-1 11z" /><path d="M3 21h18" fill="none" strokeLinecap="round" /></svg>);


/* ---------- 결과 엔딩 ---------- */

/* 마을 실루엣 + 창문. on: 창문이 하나씩 켜짐(마을 승리) / off: 하나씩 꺼짐(늑대 승리) */
export function VillageStrip({ mode }: { mode: "on" | "off" }) {
  const houses = [
    { x: 8, w: 34, h: 28, r: 14 }, { x: 52, w: 28, h: 20, r: 12 }, { x: 92, w: 40, h: 34, r: 16 },
    { x: 146, w: 30, h: 22, r: 12 }, { x: 190, w: 38, h: 30, r: 15 }, { x: 240, w: 28, h: 24, r: 12 },
    { x: 282, w: 36, h: 32, r: 15 }, { x: 328, w: 26, h: 20, r: 11 },
  ];
  return (
    <svg className="village-strip" viewBox="0 0 360 90" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="#05040f">
        {houses.map((h, i) => (
          <g key={i}>
            <rect x={h.x} y={90 - h.h} width={h.w} height={h.h} />
            <path d={`M${h.x - 3} ${90 - h.h}L${h.x + h.w / 2} ${90 - h.h - h.r}L${h.x + h.w + 3} ${90 - h.h}z`} />
          </g>
        ))}
        <rect x="0" y="86" width="360" height="4" />
      </g>
      {houses.map((h, i) => (
        <rect
          key={i}
          className={`vw ${mode}`}
          style={{ ["--i" as string]: i } as React.CSSProperties}
          x={h.x + h.w / 2 - 3}
          y={90 - h.h + 7}
          width="6"
          height="7"
        />
      ))}
    </svg>
  );
}

/* 늑대 실루엣 (홈 장면의 늑대와 같은 형태) */
export function WolfSilhouette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-4 -4 96 112" fill="#05040f" aria-hidden="true">
      <path d="M2 5C8 8 14 12 19 16L21 14L25 0L31 15L34 6L38 22C44 30 47 40 52 52C58 64 67 70 70 84C71 92 69 98 65 100L48 100C46 96 44 91 38 88L33 88L32 100L14 100L21 98L22 62C19 56 20 50 17 45L19 43L15 39C16 32 12 26 8 20C5 16 3 11 2 5Z" />
      <path d="M66 93C80 97 91 89 87 74C85 82 78 86 68 85Z" />
    </svg>
  );
}
