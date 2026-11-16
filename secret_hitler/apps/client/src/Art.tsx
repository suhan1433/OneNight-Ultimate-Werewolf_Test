import React from "react";
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
export function Portrait({
  avatar = 0,
  large = false,
}: {
  avatar?: number;
  large?: boolean;
}) {
  const hat = [0, 2, 3, 8].includes(avatar),
    glasses = [4, 5, 7, 9, 11].includes(avatar);
  return (
    <svg
      className={`portrait ${large ? "large" : ""}`}
      viewBox="0 0 80 96"
      role="img"
      aria-label={ARCHETYPES[avatar]}
    >
      <defs>
        <linearGradient id={`paper-${avatar}`} x2="0" y2="1">
          <stop stopColor="#686b62" />
          <stop offset="1" stopColor="#303632" />
        </linearGradient>
      </defs>
      <rect width="80" height="96" fill={`url(#paper-${avatar})`} />
      <path
        d="M0 18H80M0 38H80M0 58H80M0 78H80"
        stroke="#1b211d"
        opacity=".25"
      />
      <path d="M8 98Q9 73 28 69L34 63H46L53 69Q72 73 73 98" fill="#1d2321" />
      <path d="M32 68 40 86 48 68 43 65H37Z" fill="#a1a095" />
      <path d="m39 73-3 15 4 7 4-7-3-15Z" fill="#292d29" />
      <ellipse cx="40" cy="44" rx={14 + (avatar % 3)} ry="21" fill="#252c28" />
      <path d="M25 40Q20 12 42 18Q60 18 55 41L50 31 27 34" fill="#181e1c" />
      {hat && (
        <>
          <path d="M17 30H63L58 26H22Z" fill="#111815" />
          <path
            d={
              avatar === 2
                ? "M24 25V18L40 14 57 18V25Z"
                : "M25 27 28 11H51L55 27Z"
            }
            fill="#202723"
          />
        </>
      )}
      {glasses && (
        <g stroke="#919588" fill="none" strokeWidth="1.3">
          <circle cx="33" cy="43" r="5" />
          <circle cx="47" cy="43" r="5" />
          <path d="M38 43h4M25 42h3M52 42h4" />
        </g>
      )}
      {avatar === 6 && (
        <path d="M37 79h6m-3-3v12" stroke="#b5b4a6" strokeWidth="2" />
      )}
      {avatar === 2 && (
        <path d="m58 78 2 4 4 1-3 3v4l-4-2-4 2 1-4-3-3 5-1Z" fill="#8c886b" />
      )}
      {avatar === 0 && (
        <rect x="55" y="80" width="12" height="9" fill="#85877c" />
      )}
      <path
        d="M4 4h14M4 4v14M76 4H62M76 4v14M4 92h14M4 92V78M76 92H62M76 92V78"
        stroke="#b9b6a1"
        opacity=".35"
        fill="none"
      />
    </svg>
  );
}
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
      <circle cx="32" cy="32" r="28" />
      <circle cx="32" cy="32" r="23" strokeDasharray="1 4" />
      {party === "liberal" ? (
        <>
          <path d="M20 45Q6 28 24 17M44 45Q58 28 40 17M22 40l-8-2m6-6-8-4m8-3-5-6m27 21 8-2m-6-6 8-4m-8-3 5-6M25 45l18-27-9 5-9 16Z" />
          <path d="M23 49h18" />
        </>
      ) : party === "fascist" ? (
        <>
          <path d="M22 47 42 17M30 20q7-9 17-2l-6 10q-6-7-11-8ZM19 27q-7 9 4 13t8 10M19 27q13-7 17 0t-6 8" />
          <path d="m15 26 5-3 3 4" />
        </>
      ) : (
        <>
          <path
            d="M20 48q0-14 12-15 12 1 12 15ZM25 26q0-16 14-10 7 13-5 18-10 0-9-8Z"
            fill="currentColor"
          />
          <path d="M15 52h34" />
        </>
      )}
    </svg>
  );
}
