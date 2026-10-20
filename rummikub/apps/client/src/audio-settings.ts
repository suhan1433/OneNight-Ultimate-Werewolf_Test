import { createGameAudio } from '../../../../game-audio/audio';
import '../../../../game-audio/audio.css';
let initiallyMuted = false;
try { initiallyMuted = localStorage.getItem('rk-mute') === '1'; } catch { /* Use defaults when storage is unavailable. */ }
export const gameAudio = createGameAudio('rummikub.audio-settings', initiallyMuted);
