import { createGameAudio } from '../../../game-audio/audio';
import '../../../game-audio/audio.css';
let initiallyMuted = false;
try { initiallyMuted = localStorage.getItem('tts') === 'off'; } catch { /* Use defaults when storage is unavailable. */ }
export const gameAudio = createGameAudio('werewolf.audio-settings', initiallyMuted);
