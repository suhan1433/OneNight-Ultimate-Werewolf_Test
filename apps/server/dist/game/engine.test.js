import { describe, expect, it } from 'vitest';
import { advanceNight, assignRoles, buildNightActionQueue, calculateResult, calculateVotes, determineExecutions, shuffleRoles, startCurrentAction } from './engine.js';
const player = (id, role = 'villager') => ({ id, nickname: id, sessionToken: id, socketId: id, originalRole: role, currentRole: role, isReady: true, hasConfirmedCard: true, hasActedTonight: false, vote: null, connected: true });
const room = (players, votes = {}) => ({ roomCode: 'ABC234', hostId: players[0].id, maxPlayers: players.length, players, selectedRoles: [], centerCards: [], phase: 'voting', nightActionQueue: [], currentNightActionIndex: 0, actionTimeLimitSeconds: 5, dayTimeLimitSeconds: 300, ttsEnabled: true, nightLog: [], votes, processedRequestIds: [], chat: [], publicReveals: [], privateResults: {}, protectedPlayerId: null, dayExpiresAt: null, result: null, createdAt: 0, updatedAt: 0 });
describe('role assignment', () => {
    it.each([3, 5, 10])('%i players require player count + 3 cards', (count) => { const ps = Array.from({ length: count }, (_, i) => player(String(i))); const roles = Array.from({ length: count + 3 }, () => 'villager'); const result = assignRoles(ps, roles, () => .5); expect(result.players).toHaveLength(count); expect(result.centerCards).toHaveLength(3); });
    it('rejects a malformed deck', () => expect(() => assignRoles([player('a')], ['villager'])).toThrow());
    it('does not mutate input while shuffling', () => { const source = [1, 2, 3]; expect(shuffleRoles(source, () => .2)).not.toBe(source); expect(source).toEqual([1, 2, 3]); });
});
describe('night queue', () => {
    it('uses canonical order and includes roles with no owner', () => { const q = buildNightActionQueue(['seer', 'werewolf', 'drunk', 'villager'], [player('a', 'seer')]); expect(q.map(x => x.role)).toEqual(['werewolf', 'seer', 'drunk']); expect(q[0].playerIds).toEqual([]); });
    it('times out into the next action', () => { let r = room([player('a', 'seer')]); r.phase = 'night'; r.nightActionQueue = buildNightActionQueue(['seer', 'drunk'], r.players); r = startCurrentAction(r, 100); expect(r.nightActionQueue[0].expiresAt).toBe(5100); r = advanceNight(r, 'timeout', 5100); expect(r.currentNightActionIndex).toBe(1); expect(r.nightActionQueue[1].status).toBe('active'); });
});
describe('voting', () => {
    it('executes all tied leaders', () => expect(determineExecutions({ a: 2, b: 2, c: 1 })).toEqual(['a', 'b']));
    it('executes nobody when maximum is one', () => expect(determineExecutions({ a: 1, b: 1, c: 1 })).toEqual([]));
    it('bodyguard makes every vote for its target zero', () => { const r = room([player('a', 'bodyguard'), player('b'), player('c')], { a: 'b', c: 'b', b: 'c' }); expect(calculateVotes(r).b).toBe(0); });
    it('prince receives zero votes', () => { const r = room([player('a'), player('b', 'prince'), player('c')], { a: 'b', c: 'b', b: 'a' }); expect(calculateVotes(r).b).toBe(0); });
    it('hunter takes their vote target with them', () => { const r = room([player('a', 'hunter'), player('b', 'werewolf'), player('c')], { a: 'b', b: 'a', c: 'a' }); const result = calculateResult(r); expect(result.executedIds).toEqual(expect.arrayContaining(['a', 'b'])); expect(result.winners).toContain('village'); });
});
describe('victory', () => {
    it('village wins when a wolf dies', () => { const r = room([player('a', 'werewolf'), player('b'), player('c')], { a: 'b', b: 'a', c: 'a' }); expect(calculateResult(r).winners).toContain('village'); });
    it('wolves win when no wolf dies', () => { const r = room([player('a', 'werewolf'), player('b'), player('c')], { a: 'b', b: 'c', c: 'b' }); expect(calculateResult(r).winners).toContain('werewolf'); });
    it('village wins with no wolves and no execution', () => { const r = room([player('a'), player('b'), player('c')], { a: 'b', b: 'c', c: 'a' }); expect(calculateResult(r).winners).toContain('village'); });
    it('tanner can share a village win', () => { const r = room([player('a', 'werewolf'), player('b', 'tanner'), player('c'), player('d')], { a: 'b', b: 'a', c: 'a', d: 'b' }); expect(calculateResult(r).winners).toEqual(expect.arrayContaining(['village', 'tanner'])); });
    it('a cursed player becomes a wolf when voted by one', () => { const r = room([player('a', 'werewolf'), player('b', 'cursed'), player('c')], { a: 'b', b: 'a', c: 'a' }); expect(calculateResult(r).players.find(p => p.id === 'b').currentRole).toBe('werewolf'); });
});
