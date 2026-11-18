import { useId, useMemo } from "react";

/**
 * Art direction v1 ("The Interrogation Room").
 * - Portraits: 1930s ID-photo look, one overhead lamp, duotone + halftone.
 *   Each of the 12 archetypes has its own face shape, brows, nose, age lines
 *   and silhouette prop so they stay distinguishable at 32px without colour.
 * - Emblems: fictional symbols only (no real hate symbols).
 */
export const ARCHETYPES = [
  "기자 · Journalist",
  "노조 대표 · Unionist",
  "퇴역 장군 · General",
  "귀족 · Noble",
  "학자 · Scholar",
  "변호사 · Lawyer",
  "성직자 · Cleric",
  "의사 · Physician",
  "외교관 · Diplomat",
  "편집장 · Editor",
  "기술자 · Engineer",
  "사서 · Archivist",
];

type Spec = {
  c: string; // clothes
  s: string; // skin
  h: [number, number, number, number, number]; // rx, ry, age, female, mouth(-1..1)
  pre?: string; // drawn before the head (behind)
  post: string; // hair, hats, glasses, props (in front)
};
const SIDE = (c: string) =>
  `<path d="M25 44Q23 34 27 30M55 44Q57 34 53 30" stroke="${c}" stroke-width="4" fill="none"/>`;
const HAIR = (c: string) =>
  `<path d="M25 44Q22 22 40 22Q58 22 55 44Q50 30 40 30Q30 30 25 44Z" fill="${c}"/>`;

const SPECS: Spec[] = [
  { c: "#2a2e2c", s: "#c9b594", h: [14, 18, 0, 1, 1],
    pre: '<path d="M37 67l3 18 3-18z" fill="#6a3a34"/>',
    post: '<path d="M24 50V32Q40 20 56 32V50L51 44V34H29V44Z" fill="#231c18"/><path d="M14 29Q40 20 66 29Q40 35 14 29Z" fill="#13110e"/><path d="M26 28Q27 9 40 9Q53 9 54 28Z" fill="#1c1a17"/><rect x="44" y="19" width="8" height="5" fill="#d3c9a8"/>' },
  { c: "#3b3d38", s: "#b09872", h: [16, 19, 1, 0, -1],
    pre: '<path d="M30 68V96M50 68V96" stroke="#1d1e1b" stroke-width="3"/><circle cx="26" cy="80" r="2.5" fill="#a8894f"/>',
    post: '<path d="M29 40h8M43 40h8" stroke="#1a1814" stroke-width="3"/><path d="M27 49Q40 70 53 49Q40 56 27 49Z" fill="#2a2620" opacity=".55"/><path d="M23 33Q40 15 57 33L65 36H23Z" fill="#22241f"/>' },
  { c: "#2a2f2a", s: "#c4b497", h: [15, 20, 2, 0, -1],
    pre: '<path d="M31 68l3-6h12l3 6z" fill="#3d433a"/><path d="M54 78h12M54 82h12M54 86h12" stroke="#a8894f" stroke-width="2"/>',
    post: SIDE("#cfc9bb") + '<path d="M30 51Q40 46 50 51Q40 56 30 51Z" fill="#d6d1c4"/><path d="M22 29Q40 7 58 29Z" fill="#1f231f"/><path d="M22 29H58L63 33H17Z" fill="#101210"/><circle cx="40" cy="22" r="2.6" fill="#a8894f"/>' },
  { c: "#2e2a2e", s: "#cdb99a", h: [13, 19, 1, 1, 0],
    pre: '<path d="M29 68Q40 80 51 68" stroke="#d3c9a8" stroke-width="2.4" stroke-dasharray="1.6 2.2" fill="none"/>',
    post: '<path d="M25 44Q22 28 40 24Q58 28 55 44Q50 32 40 32Q30 32 25 44Z" fill="#b5b0a2"/><path d="M24 30Q40 12 58 26L60 31H24Z" fill="#1a171a"/><path d="M24 31H58V44H24Z" fill="#000" opacity=".22"/><circle cx="47" cy="43" r="5.2" fill="none" stroke="#a8894f" stroke-width="1.2"/><path d="M52 46Q56 56 54 66" stroke="#a8894f" fill="none"/>' },
  { c: "#4a4538", s: "#c2ad8a", h: [15, 19, 2, 0, 0],
    post: SIDE("#bdb8aa") + '<path d="M26 47Q40 78 54 47Q40 58 26 47Z" fill="#cfc9bb"/><g fill="none" stroke="#8f8f80" stroke-width="1.4"><circle cx="33" cy="43" r="5.2"/><circle cx="47" cy="43" r="5.2"/><path d="M38 43h4"/></g><rect x="56" y="80" width="20" height="6" fill="#6a5a3a"/><rect x="58" y="86" width="18" height="6" fill="#3a4a54"/>' },
  { c: "#20242a", s: "#c9b594", h: [14, 18, 1, 1, -1],
    pre: '<path d="M32 66l8 9 8-9-2-5H34z" fill="#d3c9a8"/>',
    post: HAIR("#17120f") + '<g fill="none" stroke="#a8894f" stroke-width="1.3"><circle cx="35" cy="43" r="4"/><circle cx="45" cy="43" r="4"/><path d="M49 45Q58 50 58 62"/></g><path d="M52 80Q60 86 66 80" stroke="#a8894f" fill="none"/>' },
  { c: "#141615", s: "#b9a583", h: [14, 20, 1, 0, 0],
    pre: '<rect x="36" y="63" width="8" height="5" fill="#d3c9a8"/><path d="M40 76v14M35 81h10" stroke="#a8894f" stroke-width="2.2"/>',
    post: SIDE("#a9a699") + '<path d="M25 29L29 12H51L55 29Z" fill="#0f100f"/><path d="M40 12V7" stroke="#0f100f" stroke-width="3"/>' },
  { c: "#bdb8a6", s: "#c9b594", h: [14, 19, 1, 1, 1],
    pre: '<path d="M30 68L40 92 50 68Z" fill="#2c2e2b"/><path d="M30 68Q24 88 40 90Q56 88 50 68" stroke="#1f201e" stroke-width="1.8" fill="none"/>',
    post: HAIR("#3a2a20") + '<circle cx="40" cy="17" r="6" fill="#3a2a20"/><path d="M26 31Q40 21 54 31" stroke="#1f201e" stroke-width="2" fill="none"/><circle cx="40" cy="26" r="5" fill="#a8a89a"/><circle cx="40" cy="26" r="1.5" fill="#1f201e"/>' },
  { c: "#1c2024", s: "#c2ad8a", h: [14, 19, 0, 0, 0],
    pre: '<path d="M24 70L60 94" stroke="#6f8795" stroke-width="5"/><path d="M55 78h9v4h-9z" fill="#d3c9a8"/>',
    post: '<path d="M33 52Q40 49 47 52" stroke="#2a2420" stroke-width="2" fill="none"/><rect x="28" y="5" width="24" height="21" fill="#121413"/><rect x="28" y="19" width="24" height="3" fill="#6f8795"/><rect x="19" y="26" width="42" height="4" fill="#121413"/>' },
  { c: "#8c8a7a", s: "#b09872", h: [16, 18, 2, 0, -1],
    pre: '<path d="M30 68L40 96 50 68Z" fill="#2b2d2a"/>',
    post: '<path d="M25 42Q23 32 27 30M55 42Q57 32 53 30" stroke="#a9a699" stroke-width="5" fill="none"/><path d="M23 36Q40 26 57 36L62 40H18Z" fill="#2d4a3a"/><path d="M44 55L58 58" stroke="#d3c9a8" stroke-width="2"/><circle cx="59" cy="58" r="1.5" fill="#b0564b"/>' },
  { c: "#3f4033", s: "#c9b594", h: [13, 18, 0, 1, 1],
    pre: '<rect x="48" y="78" width="10" height="9" fill="#2f3025"/>',
    post: HAIR("#2a1f18") + '<path d="M54 42Q62 60 57 78" stroke="#2a1f18" stroke-width="5" fill="none"/><path d="M27 32H53" stroke="#3a3a36" stroke-width="3"/><circle cx="34" cy="30" r="5" fill="#8f9a96" opacity=".7"/><circle cx="46" cy="30" r="5" fill="#8f9a96" opacity=".7"/><path d="M44 50h5" stroke="#2a2a28" stroke-width="2"/><rect x="8" y="76" width="24" height="4" fill="#cfc9bb" transform="rotate(-20 8 76)"/>' },
  { c: "#4a3f3a", s: "#cdb99a", h: [13, 19, 2, 1, 0],
    pre: '<path d="M40 68V96" stroke="#2a2220" stroke-width="2"/>',
    post: HAIR("#b5b0a2") + '<circle cx="40" cy="19" r="7" fill="#b5b0a2"/><g fill="none" stroke="#2a2a28" stroke-width="1.3"><rect x="28" y="38" width="10" height="8" rx="2"/><rect x="42" y="38" width="10" height="8" rx="2"/><path d="M38 42h4M28 43Q20 56 31 68M52 43Q60 56 49 68"/></g><circle cx="62" cy="82" r="3" fill="none" stroke="#a8894f" stroke-width="1.5"/><path d="M62 85v9" stroke="#a8894f" stroke-width="1.5"/>' },
];

const dk = (c: string, k: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(c.slice(i, i + 2), 16) * k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

function body(c: string) {
  return (
    `<path d="M4 96Q6 72 30 67H50Q74 72 76 96Z" fill="${c}"/>` +
    '<path d="M30 68L37 96H28ZM50 68L43 96H52Z" fill="#000" opacity=".22"/>' +
    '<path d="M33 66L40 76 47 66 44 63H36Z" fill="#cfc7ae" opacity=".9"/>' +
    '<path d="M4 96Q6 72 30 67M76 96Q74 72 50 67" stroke="#fff" opacity=".16" fill="none" stroke-width="1.2"/>'
  );
}
function head(s: string, [rx, ry, age, f, m]: Spec["h"], thickBrow: boolean) {
  const d = dk(s, 0.78),
    cy = 42;
  const eyes = [34.5, 45.5]
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="43" rx="3" ry="1.5" fill="#e3dcc8"/><circle cx="${x + 0.2}" cy="43" r="1.25" fill="#1b1a17"/><path d="M${x - 3.4} 42.6Q${x} 40.8 ${x + 3.4} 42.6" stroke="#000" stroke-width=".8" fill="none" opacity=".5"/><ellipse cx="${x}" cy="42.4" rx="4.2" ry="2.6" fill="#000" opacity=".16"/>`,
    )
    .join("");
  const brow = thickBrow
    ? ""
    : `<path d="M30.5 38.5Q34.5 ${f ? 37.6 : 36.8} 38.5 38.5M41.5 38.5Q45.5 ${f ? 37.6 : 36.8} 49.5 38.5" stroke="#2a221b" stroke-width="${f ? 1 : 1.5}" fill="none" opacity=".8"/>`;
  const ages =
    (age ? '<path d="M31 35.5h18M32.5 32.5h15" stroke="#000" opacity=".13" fill="none"/>' : "") +
    (age >= 2
      ? '<path d="M35 49Q33.5 53 35.5 57M45 49Q46.5 53 44.5 57" stroke="#000" opacity=".2" fill="none"/>'
      : "");
  return (
    `<rect x="34" y="56" width="12" height="16" fill="${s}"/><path d="M34 61Q40 68 46 61V56H34Z" fill="#000" opacity=".4"/>` +
    `<ellipse cx="${40 - rx}" cy="44" rx="2.4" ry="4" fill="${d}"/><ellipse cx="${40 + rx}" cy="44" rx="2.4" ry="4" fill="${d}"/>` +
    `<ellipse cx="40" cy="${cy}" rx="${rx}" ry="${ry}" fill="${s}"/>` +
    `<path d="M${40 + rx - 1} 34Q${40 + rx + 2} 52 40 ${cy + ry}Q${40 + rx - 7} 50 ${40 + rx - 1} 34Z" fill="#000" opacity=".2"/>` +
    `<path d="M${40 - rx + 2} ${cy + ry - 7}Q40 ${cy + ry + 2} ${40 + rx - 2} ${cy + ry - 7}" stroke="#000" opacity=".12" fill="none"/>` +
    eyes +
    brow +
    '<path d="M40 43L38.2 50.6Q40 52.2 41.8 50.6" stroke="#000" stroke-width="1" opacity=".38" fill="none"/><path d="M41.2 44L42.4 50Q41.4 51 40.4 50.6Z" fill="#000" opacity=".15"/>' +
    `<ellipse cx="40" cy="56.4" rx="${f ? 3.6 : 3}" ry="${f ? 1.2 : 0.8}" fill="${f ? "#8c4f48" : "#7a5248"}" opacity=".55"/>` +
    `<path d="M36 55.5Q40 ${55.5 + m * 1.2} 44 55.5" stroke="#3a2020" stroke-width="1.2" fill="none"/>` +
    ages
  );
}

export function Portrait({
  avatar = 0,
  large = false,
}: {
  avatar?: number;
  large?: boolean;
}) {
  const i = ((avatar % 12) + 12) % 12,
    uid = useId().replace(/:/g, ""),
    inner = useMemo(() => {
      const sp = SPECS[i];
      return body(sp.c) + (sp.pre ?? "") + head(sp.s, sp.h, i === 1) + sp.post;
    }, [i]);
  return (
    <svg
      className={`portrait ${large ? "large" : ""}`}
      viewBox="0 0 80 96"
      role="img"
      aria-label={ARCHETYPES[i]}
    >
      <defs>
        <linearGradient id={`w${uid}`} x2="0" y2="1">
          <stop stopColor="#555a54" />
          <stop offset="1" stopColor="#363a36" />
        </linearGradient>
        <pattern id={`h${uid}`} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r=".55" fill="#000" opacity=".16" />
        </pattern>
      </defs>
      <rect width="80" height="96" fill={`url(#w${uid})`} />
      <g dangerouslySetInnerHTML={{ __html: inner }} />
      <rect width="80" height="96" fill={`url(#h${uid})`} />
      <path
        d="M4 4h14M4 4v14M76 4H62M76 4v14M4 92h14M4 92V78M76 92H62M76 92V78"
        stroke="#b9b6a1"
        opacity=".3"
        fill="none"
      />
    </svg>
  );
}

/** Liberal: olive sprig + fountain pen. Fascist: axe + serpent. Hitler: redacted bust + broken seal. */
export function Emblem({
  party = "liberal",
  size = 40,
}: {
  party?: "liberal" | "fascist" | "hitler";
  size?: number;
}) {
  return (
    <svg
      className={`emblem ${party}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {party === "liberal" ? (
        <>
          <circle cx="32" cy="32" r="28" />
          <circle cx="32" cy="32" r="23" strokeDasharray="1 4" />
          <g transform="translate(-6 0)">
            <path d="M30 50Q24 36 31 15" />
            <path
              d="M29 44q-8-1-10-8 8-1 10 8zM28 36q-8-2-9-9 8 0 9 9zM30 28q-7-3-7-10 7 2 7 10zM31 40q8-2 10-9-8-1-10 9zM32 32q8-3 8-10-8 3-8 10z"
              fill="currentColor"
            />
          </g>
          <rect x="43" y="14" width="7" height="25" rx="3" fill="currentColor" />
          <path d="M43 41H50L46.5 54Z" fill="currentColor" />
          <path d="M46.5 43V50M43 36H50" stroke="#16181a" />
        </>
      ) : party === "fascist" ? (
        <>
          <path d="M8 8h48v36l-24 14-24-14z" strokeDasharray="1 4" />
          <path d="M24 56L43 17" strokeWidth="3.5" />
          <path d="M37 21L42 13L47 11Q61 14 59 36Q55 28 47 27L40 29Z" fill="currentColor" />
          <path d="M47 14Q54 17 55 28" stroke="#16181a" strokeWidth="1" />
          <path d="M34 57Q19 52 28 45Q38 38 26 34Q17 30 23 24" strokeWidth="3.2" />
          <path d="M19 25Q22 19 28 22Q27 28 21 29Z" fill="currentColor" />
          <path d="M22 21l-3-5M22 21l1-5" strokeWidth="1.1" />
          <circle cx="25" cy="24.5" r=".9" fill="#16181a" stroke="none" />
        </>
      ) : (
        <>
          <path d="M8 8h48v36l-24 14-24-14z" strokeDasharray="1 4" />
          <circle cx="32" cy="24" r="8" fill="currentColor" />
          <path d="M16 52Q16 36 32 34Q48 36 48 52Z" fill="currentColor" />
          <rect x="21" y="21" width="22" height="5" fill="#0a0a0a" stroke="none" />
          <path d="M34 6L29 17 35 24 30 36" stroke="#d3c9a8" />
        </>
      )}
    </svg>
  );
}

/**
 * Policy card face (2.5:3.5). Liberal = round corners, ruled lines, double rule.
 * Fascist = notched corners, hatch, redaction bars, wax seal.
 * Shape + pattern carry the meaning, colour is secondary (colour-blind safe).
 */
export function PolicyFace({
  policy,
  title,
  sub,
  size = 54,
}: {
  policy: "liberal" | "fascist";
  title: string;
  sub?: string;
  size?: number;
}) {
  return (
    <span className={`policy-face ${policy}`}>
      <Emblem party={policy} size={size} />
      <strong>{title}</strong>
      {policy === "fascist" && (
        <span className="redactions" aria-hidden="true">
          <i />
          <i />
          <i className="wax" />
        </span>
      )}
      {sub && <small>{sub}</small>}
    </span>
  );
}
