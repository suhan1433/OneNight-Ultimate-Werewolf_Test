import { createGameAudio } from '../../../../game-audio/audio';
import '../../../../game-audio/audio.css';
let initiallyMuted = false;
try { initiallyMuted = false; } catch { /* Use defaults when storage is unavailable. */ }
export const gameAudio = createGameAudio('avalon.audio-settings', initiallyMuted);
