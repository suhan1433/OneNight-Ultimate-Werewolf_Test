// 서버 계약 타입. 원본 main.tsx의 정의를 그대로 옮겼습니다(필드 변경 없음).
export type Suit = 'P' | 'B' | 'G' | 'Y' | 'R';
export type Card = { id: string; suit: Suit; value: number };
export type Player = { id: string; nickname: string; isBot?: boolean; connected: boolean; ready: boolean; cardsLeft: number; wins: number; comm?: { card: Card; marker: string } | null };
export type Task = Card & { ownerId: string | null; done: boolean; order?: number | null; arrow?: number | null; omega?: boolean };
export type Mission = { tasks: number; label: string; text: string; order?: number; arrows?: number; omega?: boolean; deadZone?: boolean; special?: string; distribute?: boolean; pick?: string; commFrom?: number; tokenSwap?: boolean; tokenMove?: boolean; fiveTransfer?: boolean };
export type Game = { code: string; playerId: string; hostId: string; maxPlayers: number; missionId: number; mission: Mission; phase: string; players: Player[]; commanderId: string | null; turnId: string | null; leaderId: string | null; hand: Card[]; legalCardIds: string[]; tasks: Task[]; trick: { playerId: string; card: Card }[]; lastTrick?: { winnerId: string | null; cards?: { playerId: string; card: Card }[] }; trickNo: number; totalTricks: number; assignmentCursor: number; targetId?: string | null; targetBId?: string | null; targetStep?: number; decisionResponses?: Record<string, boolean>; distressVotes?: Record<string, boolean>; distressActive?: boolean; distressPassed?: boolean; distressPassCount?: number; result?: { win: boolean; reason: string } | null; log: string[] };
export type Session = { code: string; playerId: string; sessionToken: string };

// 화면 전용 타입
export type TrickCard = { playerId: string; card: Card | null };
export type Request = (event: string, payload?: Record<string, unknown>) => Promise<unknown>;
export type Send = (event: string, payload?: Record<string, unknown>) => void;
export type DrawerTab = 'mission' | 'log' | 'help';
