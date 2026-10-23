import { create } from 'zustand';
import type { ClientGameState } from '@werewolf/shared';
import { socket } from './socket';
import { useGame } from './store';

// The board and chat dock submit the same ballot. Share its in-flight state so
// a slow connection cannot leave a second, apparently usable vote button.
const useSubmission = create<{ key: string | null }>(() => ({ key: null }));
const ballotKey = (game: ClientGameState) =>
  `${game.roomCode}:${game.playerId}:${game.round}:${game.rejectCount}:${game.proposedTeam.join(',')}`;

export function useTeamVote(game: ClientGameState) {
  const key = ballotKey(game);
  const submitting = useSubmission(state => state.key === key);
  const hasVoted = !!game.players.find(player => player.id === game.playerId)?.hasVoted;
  const submit = (approve: boolean) => {
    if (game.phase !== 'team_vote' || hasVoted || useSubmission.getState().key === key) return;
    useSubmission.setState({ key });
    socket.timeout(10_000).emit('TEAM_VOTE', { roomCode: game.roomCode, approve }, (error: Error | null, ack: { ok: boolean; error?: string }) => {
      if (useSubmission.getState().key === key) useSubmission.setState({ key: null });
      const current = useGame.getState().game;
      // ROOM_STATE can confirm the ballot before its ack arrives. Ignore old
      // callbacks after leaving the room or moving to another proposal, too.
      if (!current || ballotKey(current) !== key || current.phase !== 'team_vote' || current.players.some(player => player.id === current.playerId && player.hasVoted)) return;
      if (error || !ack?.ok) useGame.getState().setError(error ? '투표 응답이 늦어지고 있습니다. 연결을 확인하고 다시 시도해주세요.' : ack.error ?? '투표를 제출하지 못했습니다.');
    });
  };
  return { submitting: submitting && !hasVoted && game.phase === 'team_vote', hasVoted, submit };
}
