import { randomBytes, randomUUID } from 'node:crypto';
import { NARRATOR_LINES, ROLE_DEFINITIONS } from '@werewolf/shared';
import { z } from 'zod';
import { applyNightAction, assignRoles, buildNightActionQueue, buildPlayerGameState, calculateResult, startNightIntro, validateNightAction } from '../game/engine.js';
import { appendChat, consumeRateLimit, deleteRoom, getChatHistory, getRoom, saveRoom, withRoomLock } from '../services/redis.js';
import { processExpiredRoom } from '../services/scheduler.js';
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
const nicknameSchema = z.string().trim().min(1).max(16);
const requestSchema = z.object({ roomCode: codeSchema, requestId: z.string().min(8).max(100) });
const roomChannel = (code) => `game:${code}`;
const voiceChannel = (code) => `voice:${code}`;
const playerChannel = (id) => `player:${id}`;
const safe = (schema, data) => { const parsed = schema.safeParse(data); if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? '잘못된 요청입니다.'); return parsed.data; };
const token = () => randomBytes(24).toString('base64url');
const LOBBY_TTL_MS = 60 * 60 * 1000;
const ALL_OFFLINE_GRACE_MS = 10 * 60 * 1000;
const RESULT_TTL_MS = 30 * 60 * 1000;
export async function emitRoomState(io, room) {
    for (const p of room.players)
        io.to(playerChannel(p.id)).emit('ROOM_STATE', buildPlayerGameState(room, p.id, room.privateResults));
}
function bind(socket, room, playerId) {
    socket.data.roomCode = room.roomCode;
    socket.data.playerId = playerId;
    socket.join(roomChannel(room.roomCode));
    socket.join(playerChannel(playerId));
}
function assertSession(socket, code) {
    if (socket.data.roomCode !== code || !socket.data.playerId)
        throw new Error('플레이어 세션이 유효하지 않습니다.');
    return socket.data.playerId;
}
function on(socket, event, handler) {
    socket.on(event, async (payload, callback) => {
        try {
            const data = await handler(payload);
            callback?.({ ok: true, data });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
            callback?.({ ok: false, error: message });
            socket.emit('ERROR', { message });
        }
    });
}
export function registerHandlers(io, socket) {
    // On Vercel, this heartbeat is the durable scheduler trigger. It only checks
    // the room persisted in Redis and is safe when every connected client sends it.
    socket.on('ROOM_SYNC', async () => {
        const code = socket.data.roomCode;
        const playerId = socket.data.playerId;
        if (!code || !playerId)
            return;
        // A broadcast can be lost during a reconnect/function hand-off. Return the
        // authoritative per-player view on every sync so no client remains on an
        // old role/action while everyone else advances.
        try {
            const room = await processExpiredRoom(io, code) ?? await getRoom(code);
            const player = room?.players.find((candidate) => candidate.id === playerId);
            if (room && player?.connected && player.socketId === socket.id)
                socket.emit('ROOM_STATE', buildPlayerGameState(room, playerId, room.privateResults));
        }
        catch { /* a later sync or Socket.IO reconnect will reconcile state */ }
    });
    // WebRTC media never passes through Socket.IO. These handlers only relay
    // connection offers, answers and ICE candidates to authenticated room peers.
    on(socket, 'VOICE_JOIN', async (raw) => {
        const data = safe(z.object({ roomCode: codeSchema }).passthrough(), raw);
        const playerId = assertSession(socket, data.roomCode);
        const room = await getRoom(data.roomCode);
        if (!room || !['lobby', 'day'].includes(room.phase))
            throw new Error('음성 대화는 대기실과 낮에만 사용할 수 있습니다.');
        socket.data.voiceRoomCode = data.roomCode;
        socket.join(voiceChannel(data.roomCode));
        const voiceSockets = await io.in(voiceChannel(data.roomCode)).allSockets();
        socket.to(voiceChannel(data.roomCode)).emit('VOICE_PEER_JOINED', { playerId });
        return room.players.filter((player) => player.id !== playerId && player.socketId && voiceSockets.has(player.socketId)).map((player) => player.id);
    });
    const relayVoiceSignal = (event) => on(socket, event, async (raw) => {
        const data = safe(z.object({ roomCode: codeSchema, targetPlayerId: z.string().uuid(), payload: z.unknown() }).passthrough(), raw);
        const playerId = assertSession(socket, data.roomCode);
        // ICE candidates are numerous. VOICE_JOIN has already validated the sender,
        // so avoid a Redis GET and Redis-adapter room lookup on this hot path.
        if (event === 'VOICE_ICE') {
            if (socket.data.voiceRoomCode !== data.roomCode)
                throw new Error('음성 대화에 참가해주세요.');
            io.to(playerChannel(data.targetPlayerId)).emit(event, { senderId: playerId, payload: data.payload });
            return {};
        }
        const room = await getRoom(data.roomCode);
        if (!room || !['lobby', 'day'].includes(room.phase) || !room.players.some((player) => player.id === data.targetPlayerId && player.socketId && player.connected))
            throw new Error('현재 음성 연결을 만들 수 없습니다.');
        io.to(playerChannel(data.targetPlayerId)).emit(event, { senderId: playerId, payload: data.payload });
        return {};
    });
    relayVoiceSignal('VOICE_OFFER');
    relayVoiceSignal('VOICE_ANSWER');
    relayVoiceSignal('VOICE_ICE');
    on(socket, 'ROOM_CREATE', async (raw) => {
        const data = safe(z.object({ nickname: nicknameSchema, maxPlayers: z.number().int().min(3).max(10), selectedRoles: z.array(z.string()).min(6).max(13), actionTimeLimitSeconds: z.number().int().refine((v) => [8, 10, 15].includes(v)), dayTimeLimitSeconds: z.number().int().refine((v) => [300, 600, 1200, 1800].includes(v)), moderatorMode: z.boolean().optional().default(false) }), raw);
        if (data.selectedRoles.length !== data.maxPlayers + 3 || data.selectedRoles.some((r) => !(r in ROLE_DEFINITIONS)))
            throw new Error('역할 카드는 인원수 + 3장이어야 합니다.');
        for (const definition of Object.values(ROLE_DEFINITIONS))
            if (data.selectedRoles.filter((r) => r === definition.id).length > definition.maxCount)
                throw new Error(`${definition.name} 역할이 허용 수량을 초과했습니다.`);
        let roomCode = '';
        do {
            roomCode = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
        } while (await getRoom(roomCode));
        const playerId = randomUUID();
        const sessionToken = token();
        const now = Date.now();
        const room = { roomCode, hostId: playerId, maxPlayers: data.maxPlayers, moderatorMode: data.moderatorMode, players: [{ id: playerId, nickname: data.nickname, sessionToken, socketId: socket.id, originalRole: null, currentRole: null, isReady: false, hasConfirmedCard: false, hasActedTonight: false, vote: null, connected: true }], selectedRoles: data.selectedRoles, centerCards: [], phase: 'lobby', nightActionQueue: [], currentNightActionIndex: 0, actionTimeLimitSeconds: data.actionTimeLimitSeconds, dayTimeLimitSeconds: data.dayTimeLimitSeconds, ttsEnabled: true, nightLog: [], votes: {}, voteStartRequests: [], processedRequestIds: [], chat: [], publicReveals: [], privateResults: {}, protectedPlayerId: null, dayExpiresAt: null, result: null, lobbyExpiresAt: now + LOBBY_TTL_MS, allOfflineExpiresAt: null, resultExpiresAt: null, createdAt: now, updatedAt: now };
        await saveRoom(room);
        bind(socket, room, playerId);
        await emitRoomState(io, room);
        return { roomCode, playerId, sessionToken };
    });
    on(socket, 'ROOM_JOIN', async (raw) => {
        const data = safe(z.object({ roomCode: codeSchema, nickname: nicknameSchema.optional(), playerId: z.string().uuid().optional(), sessionToken: z.string().optional() }), raw);
        let joinedId = '';
        let joinedToken = '';
        const room = await withRoomLock(data.roomCode, async (room) => {
            const reconnect = data.playerId && room.players.find((p) => p.id === data.playerId && p.sessionToken === data.sessionToken);
            if (reconnect) {
                reconnect.socketId = socket.id;
                reconnect.connected = true;
                reconnect.disconnectedAt = null;
                room.allOfflineExpiresAt = null;
                joinedId = reconnect.id;
                joinedToken = reconnect.sessionToken;
            }
            else {
                if (room.phase !== 'lobby')
                    throw new Error('이미 시작된 게임입니다. 재접속 정보가 필요합니다.');
                if (room.moderatorMode)
                    throw new Error('오프라인 사회자 방에는 다른 기기로 참가할 수 없습니다.');
                if (room.players.length >= room.maxPlayers)
                    throw new Error('방이 가득 찼습니다.');
                if (!data.nickname)
                    throw new Error('닉네임을 입력해주세요.');
                if (room.players.some((p) => p.nickname === data.nickname))
                    throw new Error('이미 사용 중인 닉네임입니다.');
                joinedId = randomUUID();
                joinedToken = token();
                room.players.push({ id: joinedId, nickname: data.nickname, sessionToken: joinedToken, socketId: socket.id, originalRole: null, currentRole: null, isReady: false, hasConfirmedCard: false, hasActedTonight: false, vote: null, connected: true });
            }
            room.allOfflineExpiresAt = null;
            room.updatedAt = Date.now();
            await saveRoom(room);
            return room;
        });
        bind(socket, room, joinedId);
        await emitRoomState(io, room);
        socket.emit('CHAT_HISTORY', await getChatHistory(room.roomCode));
        socket.to(roomChannel(room.roomCode)).emit('PLAYER_JOINED', { playerId: joinedId });
        await processExpiredRoom(io, room.roomCode);
        return { roomCode: room.roomCode, playerId: joinedId, sessionToken: joinedToken };
    });
    on(socket, 'ROOM_LEAVE', async (raw) => {
        const data = safe(requestSchema, raw);
        const playerId = assertSession(socket, data.roomCode);
        const room = await withRoomLock(data.roomCode, async (room, alreadyProcessed) => {
            if (alreadyProcessed)
                return room;
            room.players = room.players.filter((p) => p.id !== playerId);
            room.nightActionQueue = room.nightActionQueue.map((action) => ({ ...action, playerIds: action.playerIds.filter((id) => id !== playerId), actedPlayerIds: action.actedPlayerIds.filter((id) => id !== playerId) }));
            delete room.votes[playerId];
            for (const [voterId, targetId] of Object.entries(room.votes))
                if (targetId === playerId)
                    delete room.votes[voterId];
            delete room.privateResults[playerId];
            if (room.hostId === playerId && room.players.length)
                room.hostId = room.players.find((p) => p.connected)?.id ?? room.players[0].id;
            if (room.phase === 'card_reveal' && room.players.length && room.players.every((p) => p.hasConfirmedCard)) {
                room.phase = 'night';
                room.nightActionQueue = buildNightActionQueue(room.selectedRoles, room.players);
                room.currentNightActionIndex = 0;
                Object.assign(room, startNightIntro(room));
            }
            if (room.phase === 'voting' && room.players.length && Object.keys(room.votes).length === room.players.length) {
                room.result = calculateResult(room);
                room.phase = 'result';
                room.resultExpiresAt = Date.now() + RESULT_TTL_MS;
            }
            if (room.players.every((player) => !player.connected))
                room.allOfflineExpiresAt = Date.now() + ALL_OFFLINE_GRACE_MS;
            room.updatedAt = Date.now();
            if (room.players.length) {
                await saveRoom(room, data.requestId);
            }
            else
                await deleteRoom(room.roomCode);
            return room;
        }, data.requestId);
        socket.leave(roomChannel(data.roomCode));
        socket.leave(playerChannel(playerId));
        socket.data.roomCode = undefined;
        socket.data.playerId = undefined;
        if (room.players.length) {
            await emitRoomState(io, room);
            io.to(roomChannel(room.roomCode)).emit('PLAYER_LEFT', { playerId });
        }
        return {};
    });
    on(socket, 'PLAYER_READY', async (raw) => mutate(io, socket, raw, (room, playerId) => { if (room.phase !== 'lobby')
        throw new Error('로비에서만 준비할 수 있습니다.'); const p = room.players.find((x) => x.id === playerId); p.isReady = !p.isReady; }));
    on(socket, 'ROOM_SETTINGS', async (raw) => mutate(io, socket, raw, (room, playerId, payload) => {
        if (room.hostId !== playerId || room.phase !== 'lobby')
            throw new Error('방장만 설정할 수 있습니다.');
        // Accept a legacy room's old 3/5-second value once, then migrate it to
        // the new 8-second minimum when any lobby setting is saved.
        const settings = safe(z.object({ actionTimeLimitSeconds: z.number().int().refine((v) => [3, 5, 8, 10, 15].includes(v)), dayTimeLimitSeconds: z.number().int().refine((v) => [300, 600, 1200, 1800].includes(v)), selectedRoles: z.array(z.string()).max(13).optional() }), payload);
        if (settings.selectedRoles) {
            if (settings.selectedRoles.some((role) => !(role in ROLE_DEFINITIONS)))
                throw new Error('유효하지 않은 역할 카드가 있습니다.');
            for (const definition of Object.values(ROLE_DEFINITIONS))
                if (settings.selectedRoles.filter((role) => role === definition.id).length > definition.maxCount)
                    throw new Error(`${definition.name} 역할이 허용 수량을 초과했습니다.`);
            room.selectedRoles = settings.selectedRoles;
        }
        room.actionTimeLimitSeconds = Math.max(8, settings.actionTimeLimitSeconds);
        room.dayTimeLimitSeconds = settings.dayTimeLimitSeconds;
    }));
    on(socket, 'GAME_START', async (raw) => mutate(io, socket, raw, (room, playerId) => {
        if (room.hostId !== playerId)
            throw new Error('방장만 시작할 수 있습니다.');
        if (room.moderatorMode) {
            if (room.phase !== 'lobby')
                throw new Error('로비에서만 시작할 수 있습니다.');
            room.players = room.players.map((player) => ({ ...player, originalRole: null, currentRole: null, hasConfirmedCard: false, hasActedTonight: false, vote: null }));
            room.centerCards = [];
            room.phase = 'night';
            room.nightActionQueue = buildNightActionQueue(room.selectedRoles, []);
            room.currentNightActionIndex = 0;
            Object.assign(room, startNightIntro(room));
            room.result = null;
            room.votes = {};
            room.voteStartRequests = [];
            room.privateResults = {};
            room.publicReveals = [];
            room.nightLog = [];
            room.protectedPlayerId = null;
            room.dayExpiresAt = null;
            room.lobbyExpiresAt = null;
            room.allOfflineExpiresAt = null;
            room.resultExpiresAt = null;
            return;
        }
        if (room.phase !== 'lobby' || room.players.length !== room.maxPlayers || !room.players.every((p) => p.isReady))
            throw new Error('정원이 모두 입장하고 준비해야 합니다.');
        if (room.selectedRoles.length !== room.players.length + 3)
            throw new Error('역할 카드는 인원수 + 3장 모두 선택해야 시작할 수 있습니다.');
        const assigned = assignRoles(room.players, room.selectedRoles);
        room.players = assigned.players.map((player) => ({ ...player, vote: null }));
        room.centerCards = assigned.centerCards;
        room.phase = 'card_reveal';
        room.result = null;
        room.votes = {};
        room.voteStartRequests = [];
        room.privateResults = {};
        room.publicReveals = [];
        room.nightLog = [];
        room.protectedPlayerId = null;
        room.dayExpiresAt = null;
        room.lobbyExpiresAt = null;
        room.allOfflineExpiresAt = null;
        room.resultExpiresAt = null;
    }, 'GAME_STARTED', (room) => { if (room.moderatorMode)
        io.to(roomChannel(room.roomCode)).emit('NARRATOR_SPEECH', { text: NARRATOR_LINES.nightStart, audioKey: 'night-start', actionId: 'night-start', timestamp: Date.now() }); }));
    on(socket, 'CARD_CONFIRM', async (raw) => mutate(io, socket, raw, (room, playerId) => {
        if (room.phase !== 'card_reveal')
            throw new Error('카드 확인 단계가 아닙니다.');
        const p = room.players.find((x) => x.id === playerId);
        p.hasConfirmedCard = true;
        if (room.players.every((x) => x.hasConfirmedCard)) {
            room.phase = 'night';
            room.nightActionQueue = buildNightActionQueue(room.selectedRoles, room.players);
            room.currentNightActionIndex = 0;
            Object.assign(room, startNightIntro(room));
        }
    }, 'CARD_CONFIRM_PROGRESS', (room) => { if (room.phase === 'night')
        io.to(roomChannel(room.roomCode)).emit('NARRATOR_SPEECH', { text: NARRATOR_LINES.nightStart, audioKey: 'night-start', actionId: 'night-start', timestamp: Date.now() }); }));
    on(socket, 'NIGHT_ACTION_SUBMIT', async (raw) => {
        const base = safe(requestSchema.extend({ actionId: z.string().uuid(), command: z.custom() }), raw);
        const playerId = assertSession(socket, base.roomCode);
        let duplicate = false;
        const room = await withRoomLock(base.roomCode, async (room, alreadyProcessed) => {
            if (alreadyProcessed) {
                duplicate = true;
                return room;
            }
            const player = room.players.find((p) => p.id === playerId);
            if (!player || !player.connected || player.socketId !== socket.id)
                throw new Error('다른 기기에서 세션이 갱신되었습니다.');
            const error = validateNightAction(room, playerId, base.actionId, base.command);
            if (error)
                throw new Error(error);
            const applied = applyNightAction(room, playerId, base.command);
            room = applied.room;
            room.privateResults[playerId] = applied.result;
            room.updatedAt = Date.now();
            await saveRoom(room, base.requestId);
            return room;
        }, base.requestId);
        if (duplicate)
            return {};
        const nextAction = room.phase === 'night' && room.nightActionQueue[room.currentNightActionIndex]?.id !== base.actionId;
        if (nextAction)
            emitActionStart(io, room);
        await emitRoomState(io, room);
        io.to(roomChannel(room.roomCode)).emit('NIGHT_ACTION_COMPLETED', { actionId: base.actionId });
        if (room.phase === 'day')
            emitDayStart(io, room);
        return {};
    });
    on(socket, 'NIGHT_ACTION_CONFIRM', async (raw) => {
        const base = safe(requestSchema.extend({ actionId: z.string().uuid() }), raw);
        const playerId = assertSession(socket, base.roomCode);
        let duplicate = false;
        const room = await withRoomLock(base.roomCode, async (room, alreadyProcessed) => {
            if (alreadyProcessed) {
                duplicate = true;
                return room;
            }
            const player = room.players.find((p) => p.id === playerId);
            if (!player || !player.connected || player.socketId !== socket.id)
                throw new Error('다른 기기에서 세션이 갱신되었습니다.');
            const command = { type: 'confirm' };
            const error = validateNightAction(room, playerId, base.actionId, command);
            if (error)
                throw new Error(error);
            const applied = applyNightAction(room, playerId, command);
            room = applied.room;
            room.privateResults[playerId] = applied.result;
            room.updatedAt = Date.now();
            await saveRoom(room, base.requestId);
            return room;
        }, base.requestId);
        if (duplicate)
            return {};
        const nextAction = room.phase === 'night' && room.nightActionQueue[room.currentNightActionIndex]?.id !== base.actionId;
        if (nextAction)
            emitActionStart(io, room);
        await emitRoomState(io, room);
        if (room.phase === 'day')
            emitDayStart(io, room);
        return {};
    });
    on(socket, 'DAY_START', async (raw) => mutate(io, socket, raw, (room, playerId) => {
        if (room.phase !== 'day')
            throw new Error('토론 단계가 아닙니다.');
        if (room.moderatorMode)
            throw new Error('오프라인 사회자 모드는 투표를 진행하지 않습니다.');
        const requests = new Set(room.voteStartRequests ?? []);
        requests.add(playerId);
        room.voteStartRequests = [...requests];
        if (room.voteStartRequests.length >= room.players.filter((p) => p.connected).length) {
            room.phase = 'voting';
            room.dayExpiresAt = null;
        }
    }, 'VOTE_PROGRESS'));
    on(socket, 'CHAT_SEND', async (raw) => {
        const data = safe(requestSchema.extend({ messageId: z.string().uuid(), text: z.string().trim().min(1).max(300) }), raw);
        const playerId = assertSession(socket, data.roomCode);
        const [allowed, room] = await Promise.all([consumeRateLimit(`rate:chat:${data.roomCode}:${playerId}`, 6, 5), getRoom(data.roomCode)]);
        if (!allowed)
            throw new Error('채팅을 너무 빠르게 보내고 있습니다.');
        const player = room?.players.find((p) => p.id === playerId);
        if (!room || !player || !player.connected || player.socketId !== socket.id)
            throw new Error('다른 기기에서 세션이 갱신되었습니다.');
        if (room.phase !== 'day')
            throw new Error('낮에만 채팅할 수 있습니다.');
        const message = { id: data.messageId, playerId, nickname: player.nickname, text: data.text, at: Date.now() };
        if (await appendChat(data.roomCode, message))
            io.to(roomChannel(data.roomCode)).emit('CHAT_MESSAGE', message);
        return {};
    });
    on(socket, 'VOTE_SELECT', async (raw) => { const data = safe(z.object({ roomCode: codeSchema, targetPlayerId: z.string().uuid() }), raw); const playerId = assertSession(socket, data.roomCode); const room = await getRoom(data.roomCode); if (!room || room.phase !== 'voting' || data.targetPlayerId === playerId || !room.players.some((p) => p.id === data.targetPlayerId))
        throw new Error('유효하지 않은 투표 대상입니다.'); return {}; });
    on(socket, 'VOTE_CONFIRM', async (raw) => mutate(io, socket, raw, (room, playerId, payload) => {
        if (room.phase !== 'voting')
            throw new Error('투표 단계가 아닙니다.');
        const { targetPlayerId } = safe(z.object({ targetPlayerId: z.string().uuid() }), payload);
        if (targetPlayerId === playerId || !room.players.some((p) => p.id === targetPlayerId))
            throw new Error('유효하지 않은 투표 대상입니다.');
        if (room.votes[playerId])
            throw new Error('이미 투표했습니다.');
        room.votes[playerId] = targetPlayerId;
        if (Object.keys(room.votes).length === room.players.length) {
            room.result = calculateResult(room);
            room.players = room.players.map((p) => ({ ...p, currentRole: room.result.players.find((x) => x.id === p.id).currentRole }));
            room.phase = 'result';
            room.resultExpiresAt = Date.now() + RESULT_TTL_MS;
        }
    }, 'VOTE_PROGRESS', (room) => { if (room.phase === 'result')
        io.to(roomChannel(room.roomCode)).emit('GAME_RESULT', room.result); }));
    on(socket, 'GAME_RESTART', async (raw) => mutate(io, socket, raw, (room, playerId) => {
        if (room.hostId !== playerId || (room.phase !== 'result' && !(room.moderatorMode && room.phase === 'day')))
            throw new Error('방장만 대기실로 돌아갈 수 있습니다.');
        room.players = room.players.map((p) => ({ ...p, originalRole: null, currentRole: null, isReady: false, hasConfirmedCard: false, hasActedTonight: false, vote: null }));
        room.centerCards = [];
        room.phase = 'lobby';
        room.nightActionQueue = [];
        room.currentNightActionIndex = 0;
        room.votes = {};
        room.voteStartRequests = [];
        room.privateResults = {};
        room.publicReveals = [];
        room.nightLog = [];
        room.chat = [];
        room.dayExpiresAt = null;
        room.result = null;
        room.protectedPlayerId = null;
        room.lobbyExpiresAt = Date.now() + LOBBY_TTL_MS;
        room.allOfflineExpiresAt = null;
        room.resultExpiresAt = null;
    }, 'PHASE_CHANGED'));
    socket.on('disconnect', async () => {
        const code = socket.data.roomCode;
        const playerId = socket.data.playerId;
        if (!code || !playerId)
            return;
        try {
            const room = await withRoomLock(code, async (room) => { const p = room.players.find((x) => x.id === playerId); if (p && p.socketId === socket.id) {
                p.connected = false;
                p.socketId = null;
                p.disconnectedAt = Date.now();
                const action = room.nightActionQueue[room.currentNightActionIndex];
                if (room.phase === 'night' && action?.status === 'active' && action.playerIds.includes(playerId))
                    action.expiresAt = Math.min(action.expiresAt, Date.now() + 5_000);
                if (room.hostId === playerId)
                    room.hostId = room.players.find((x) => x.id !== playerId && x.connected)?.id ?? room.hostId;
                if (room.players.every((player) => !player.connected))
                    room.allOfflineExpiresAt = Date.now() + ALL_OFFLINE_GRACE_MS;
                await saveRoom(room);
            } return room; });
            await emitRoomState(io, room);
            io.to(roomChannel(code)).emit('PLAYER_LEFT', { playerId });
        }
        catch { /* expired room */ }
    });
}
async function mutate(io, socket, raw, change, event, after) {
    const data = safe(requestSchema.passthrough(), raw);
    const playerId = assertSession(socket, data.roomCode);
    const room = await withRoomLock(data.roomCode, async (room, alreadyProcessed) => {
        if (alreadyProcessed)
            return room;
        const player = room.players.find((p) => p.id === playerId);
        if (!player || !player.connected || player.socketId !== socket.id)
            throw new Error('다른 기기에서 세션이 갱신되었습니다.');
        change(room, playerId, data);
        room.updatedAt = Date.now();
        await saveRoom(room, data.requestId);
        return room;
    }, data.requestId);
    await emitRoomState(io, room);
    if (event)
        io.to(roomChannel(room.roomCode)).emit(event, { at: Date.now() });
    after?.(room);
    return {};
}
export function emitActionStart(io, room) {
    const action = room.nightActionQueue[room.currentNightActionIndex];
    if (!action)
        return;
    io.to(roomChannel(room.roomCode)).emit('NARRATOR_SPEECH', { text: NARRATOR_LINES.action(action.role), audioKey: action.role, actionId: action.id, timestamp: Date.now() });
    io.to(roomChannel(room.roomCode)).emit('NIGHT_ACTION_STARTED', { actionId: action.id, role: action.role, expiresAt: action.expiresAt });
}
export function emitDayStart(io, room) { io.to(roomChannel(room.roomCode)).emit('NARRATOR_SPEECH', { text: NARRATOR_LINES.dayStart, audioKey: 'day-start', actionId: 'day-start', timestamp: Date.now() }); io.to(roomChannel(room.roomCode)).emit('DAY_STARTED', { expiresAt: room.dayExpiresAt }); }
