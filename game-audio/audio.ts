export type AudioChannel = 'background' | 'effects';
export type AudioSettings = { master: number; background: number; effects: number; muted: boolean };

/** Ambient sessions allow game audio to mix with music from other applications. */
export function preferAmbientAudio() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
  } catch { /* The browser controls mixing when the API is unavailable. */ }
}

export function createGameAudio(key: string, initiallyMuted = false) {
  const defaults: AudioSettings = { master: 1, background: 1, effects: 1, muted: initiallyMuted };
  const clamp = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  let settings = defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved) settings = { master: clamp(saved.master, 1), background: clamp(saved.background, 1), effects: clamp(saved.effects, 1), muted: typeof saved.muted === 'boolean' ? saved.muted : initiallyMuted };
  } catch { /* Private browsing and invalid stored values use defaults. */ }
  const listeners = new Set<() => void>();
  const volume = (channel: AudioChannel) => settings.muted ? 0 : settings.master * settings[channel];
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const update = (next: Partial<AudioSettings>) => {
    settings = { master: clamp(next.master, settings.master), background: clamp(next.background, settings.background), effects: clamp(next.effects, settings.effects), muted: next.muted ?? settings.muted };
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Keep in-memory settings. */ }
    listeners.forEach(listener => listener());
  };
  const bindGain = (gain: GainNode, channel: AudioChannel, base = 1) => {
    const apply = () => { gain.gain.value = base * volume(channel); };
    apply();
    return subscribe(apply);
  };
  // Use a gain node for recordings too: iOS ignores HTMLMediaElement.volume.
  let mediaContext: AudioContext | undefined;
  const media = new Map<HTMLMediaElement, { source?: MediaElementAudioSourceNode; gain?: GainNode; unsubscribe: () => void }>();
  const prepareMedia = () => {
    preferAmbientAudio();
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) mediaContext ??= new C();
  };
  const trackMedia = (element: HTMLMediaElement, channel: AudioChannel, base = 1) => {
    if (media.has(element)) return;
    preferAmbientAudio();
    try {
      prepareMedia();
      if (!mediaContext) throw new Error('Web Audio unavailable');
      const source = mediaContext.createMediaElementSource(element);
      const gain = mediaContext.createGain();
      source.connect(gain); gain.connect(mediaContext.destination);
      element.volume = 1;
      media.set(element, { source, gain, unsubscribe: bindGain(gain, channel, base) });
    } catch {
      const apply = () => { element.volume = base * volume(channel); element.muted = volume(channel) === 0; };
      apply(); media.set(element, { unsubscribe: subscribe(apply) });
    }
  };
  const untrackMedia = (element: HTMLMediaElement) => {
    const entry = media.get(element);
    entry?.unsubscribe(); entry?.source?.disconnect(); entry?.gain?.disconnect(); media.delete(element);
  };
  const unlock = () => {
    preferAmbientAudio();
    if (mediaContext && mediaContext.state !== 'running' && mediaContext.state !== 'closed') void mediaContext.resume().catch(() => undefined);
  };
  const unlockMedia = () => {
    try { prepareMedia(); unlock(); } catch { /* Media elements remain available as a fallback. */ }
  };
  preferAmbientAudio();
  window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) unlock(); });
  window.addEventListener('pageshow', unlock);
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    try {
      const saved = JSON.parse(event.newValue ?? 'null');
      if (saved) update(saved);
    } catch { /* Ignore invalid values from other tabs. */ }
  });

  let dialog: HTMLDialogElement | undefined;
  const openSettings = (event?: { currentTarget: EventTarget | null }) => {
    unlock();
    if (dialog?.open) return;
    const opener = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement as HTMLElement | null;
    dialog = document.createElement('dialog');
    dialog.className = 'game-audio-dialog';
    dialog.setAttribute('aria-label', '음향 설정');
    dialog.innerHTML = `<form method="dialog"><div class="ga-heading"><h2>음향 설정</h2><button class="ga-close" aria-label="음향 설정 닫기">×</button></div><label class="ga-mute"><input type="checkbox"> 전체 음소거</label>${(['master', 'background', 'effects'] as const).map((name, index) => `<label class="ga-slider"><span>${['전체 음량', '배경음', '효과음 · 안내 음성'][index]} <output></output></span><input type="range" min="0" max="100" step="1" data-channel="${name}" aria-label="${['전체 음량', '배경음', '효과음 및 안내 음성'][index]}"></label>`).join('')}</form>`;
    const checkbox = dialog.querySelector<HTMLInputElement>('[type="checkbox"]')!;
    checkbox.onchange = () => update({ muted: checkbox.checked });
    const sliders = dialog.querySelectorAll<HTMLInputElement>('[type="range"]');
    sliders.forEach(input => { input.oninput = () => update({ [input.dataset.channel!]: Number(input.value) / 100 }); });
    const render = () => {
      checkbox.checked = settings.muted;
      sliders.forEach(input => {
        const value = Math.round(settings[input.dataset.channel as 'master' | AudioChannel] * 100);
        input.value = String(value); input.previousElementSibling!.querySelector('output')!.textContent = `${value}%`;
      });
    };
    render(); const unsubscribe = subscribe(render);
    const activeDialog = dialog;
    activeDialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); activeDialog.close(); } });
    activeDialog.addEventListener('click', event => { if (event.target === activeDialog) { const box = activeDialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) activeDialog.close(); } });
    activeDialog.addEventListener('close', () => { unsubscribe(); activeDialog.remove(); opener?.focus(); }, { once: true });
    document.body.append(activeDialog); activeDialog.showModal();
  };
  return { getSettings: () => settings, volume, subscribe, update, bindGain, trackMedia, untrackMedia, unlock, unlockMedia, openSettings };
}
