import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ClientGameState } from '@werewolf/shared';
import { recordedAudio } from './recorded-audio';

export function useRecordedAudio(game: ClientGameState | null) {
  useEffect(() => recordedAudio.attach(), []);
  useLayoutEffect(() => {
    recordedAudio.setScene(game?.roomCode, game?.phase);
  }, [game?.roomCode, game?.phase]);
}

export function useEndingAudio(time: number, titleAt: number, instant: boolean) {
  const played = useRef(false);
  useEffect(() => {
    if (played.current || time < titleAt) return;
    played.current = true;
    if (instant || time - titleAt < .6) recordedAudio.play('ending');
  }, [time, titleAt, instant]);
}
