import { createGameAudio } from '../../game-audio/audio';
import '../../game-audio/audio.css';
let initiallyMuted = false;
try { initiallyMuted = JSON.parse(localStorage.getItem('planet-nine-fx') ?? '{}').sound !== true; } catch { /* Use defaults when storage is unavailable. */ }
export const gameAudio = createGameAudio('spacecrew.audio-settings', initiallyMuted);
