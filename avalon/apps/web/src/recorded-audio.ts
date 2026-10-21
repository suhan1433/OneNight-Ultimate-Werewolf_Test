import type { Phase, RoleType } from '@werewolf/shared';
import { gameAudio } from './audio-settings';
import fireplace from '../../../avalon_mp3/대기실_벽난로.mp3?url';
import discussion from '../../../avalon_mp3/토론.mp3?url';
import assassination from '../../../avalon_mp3/암살.mp3?url';
import start from '../../../avalon_mp3/게임시작_종소리.mp3?url';
import coin from '../../../avalon_mp3/투표_코인착지음.mp3?url';
import ending from '../../../avalon_mp3/엔딩.mp3?url';
import merlin from '../../../avalon_role_mp3/멀린.mp3?url';
import percival from '../../../avalon_role_mp3/퍼시벌.mp3?url';
import assassin from '../../../avalon_role_mp3/암살자.mp3?url';
import morgana from '../../../avalon_role_mp3/모르가나.mp3?url';
import mordred from '../../../avalon_role_mp3/모드레드.mp3?url';
import oberon from '../../../avalon_role_mp3/오베론.mp3?url';

const backgrounds = { fireplace, discussion, assassination };
const effects = { start, coin, ending };
const roleVoices: Partial<Record<RoleType, string>> = { merlin, percival, assassin, morgana, mordred, oberon };
type Background = keyof typeof backgrounds;
type Effect = keyof typeof effects;
const scenes: Record<Phase, Background | null> = {
  lobby: 'fireplace', role_reveal: 'fireplace', team_build: 'discussion', team_vote: 'discussion',
  vote_result: 'discussion', quest: 'discussion', quest_result: 'discussion',
  assassination: 'assassination', result: 'discussion',
};

/** Recordings are imported as Vite assets, including in both Docker layouts.
 * All volume control passes through the shared Web Audio gains for iOS too. */
class RecordedAudio {
  private room?: string;
  private phase?: Phase;
  private desired: Background | null = null;
  private current?: HTMLAudioElement;
  private pending?: HTMLAudioElement;
  private tracks = new Map<Background, HTMLAudioElement>();
  private activeEffects = new Set<HTMLAudioElement>();
  private roleVoice?: HTMLAudioElement;
  private unlocked = false;

  attach() {
    const unlock = () => {
      this.unlocked = true;
      gameAudio.unlockMedia();
      this.sync();
    };
    const visibility = () => {
      if (document.hidden) { this.current?.pause(); this.pending?.pause(); this.stopEffects(); }
      else this.sync();
    };
    const unsubscribe = gameAudio.subscribe(() => {
      if (gameAudio.volume('effects') === 0) this.stopEffects();
      this.sync();
    });
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', visibility);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', visibility);
      unsubscribe(); this.stopEffects();
      this.tracks.forEach(audio => this.release(audio)); this.tracks.clear();
      this.current = undefined; this.pending = undefined; this.desired = null; this.unlocked = false;
      this.room = undefined; this.phase = undefined;
    };
  }

  setScene(room?: string, phase?: Phase) {
    const newRoom = room !== this.room;
    const started = !newRoom && this.phase === 'lobby' && phase === 'role_reveal';
    if (newRoom || phase !== this.phase) this.stopEffects();
    const desired = phase ? scenes[phase] : null;
    if (newRoom || desired !== this.desired) {
      if (this.pending && this.pending !== this.current) this.pending.pause();
      this.pending = undefined;
    }
    if (newRoom || !desired) {
      if (this.current) { this.current.pause(); this.current.currentTime = 0; }
      this.current = undefined;
    }
    this.room = room; this.phase = phase; this.desired = desired;
    this.sync();
    if (started) this.play('start');
  }

  private sync() {
    if (!this.desired || !this.unlocked || document.hidden || gameAudio.volume('background') === 0) {
      this.current?.pause(); this.pending?.pause(); return;
    }
    let audio = this.tracks.get(this.desired);
    if (!audio) {
      audio = new Audio(backgrounds[this.desired]);
      audio.loop = true; audio.preload = 'none';
      gameAudio.trackMedia(audio, 'background', this.desired === 'discussion' ? .22 : .32);
      this.tracks.set(this.desired, audio);
    }
    if (this.current === audio && !audio.paused) return;
    if (this.pending === audio && !audio.paused) return;
    gameAudio.unlock();
    const playing = audio;
    this.pending = playing;
    void playing.play().then(() => {
      if (!this.desired || this.tracks.get(this.desired) !== playing || document.hidden || gameAudio.volume('background') === 0) {
        // A rapid phase change may have returned to the outgoing track.
        if (this.current !== playing || document.hidden || gameAudio.volume('background') === 0) playing.pause();
        return;
      }
      // Keep the previous background playing until the replacement is audible.
      const outgoing = this.current;
      this.current = playing;
      if (outgoing && outgoing !== playing) { outgoing.pause(); outgoing.currentTime = 0; }
    }).catch(() => { /* Keep the outgoing music; retry on the next gesture. */ }).finally(() => {
      if (this.pending === playing) this.pending = undefined;
    });
  }

  play(effect: Effect) {
    return this.playRecording(effects[effect], effect === 'coin' ? .45 : .65);
  }

  playRole(role: RoleType) {
    if (this.roleVoice) {
      this.activeEffects.delete(this.roleVoice);
      this.release(this.roleVoice);
      this.roleVoice = undefined;
    }
    const src = roleVoices[role];
    if (src) this.roleVoice = this.playRecording(src, .65);
  }

  private playRecording(src: string, volume: number) {
    // Do not queue missed effects when autoplay is blocked or a tab is hidden.
    if (!this.phase || !this.unlocked || document.hidden || gameAudio.volume('effects') === 0) return;
    // Bound simultaneous recordings when several votes arrive together.
    if (this.activeEffects.size >= 4) return;
    const audio = new Audio(src);
    audio.preload = 'auto';
    gameAudio.trackMedia(audio, 'effects', volume);
    this.activeEffects.add(audio);
    const cleanup = () => {
      if (this.roleVoice === audio) this.roleVoice = undefined;
      if (this.activeEffects.delete(audio)) this.release(audio);
    };
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    gameAudio.unlock();
    void audio.play().catch(cleanup);
    return audio;
  }

  private release(audio: HTMLAudioElement) {
    audio.pause(); gameAudio.untrackMedia(audio);
    audio.removeAttribute('src'); audio.load();
  }

  private stopEffects() {
    this.activeEffects.forEach(audio => this.release(audio));
    this.activeEffects.clear();
    this.roleVoice = undefined;
  }
}

export const recordedAudio = new RecordedAudio();
