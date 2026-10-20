const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const ts = require('typescript');
const { webkit } = require('@playwright/test');

// Exercise real Web Audio nodes and the native dialog in a browser.
const source = ts.transpileModule(fs.readFileSync(`${__dirname}/audio.ts`, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const server = http.createServer((req, res) => {
  if (req.url === '/audio.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(source); }
  else if (req.url === '/audio.css') { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(`${__dirname}/audio.css`)); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/audio.css"><button id="open">음향 설정</button><script type="module">import {createGameAudio} from "/audio.js"; window.audio = createGameAudio("test.audio"); document.querySelector("button").onclick = audio.openSettings;</script>'); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Object.defineProperty(navigator, 'audioSession', { configurable: true, value: { type: 'auto' } }); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.audio);
    assert.equal(await page.evaluate(() => navigator.audioSession.type), 'ambient');
    const volumes = await page.evaluate(() => {
      const context = new AudioContext();
      const background = context.createGain(), effects = context.createGain();
      audio.bindGain(background, 'background'); audio.bindGain(effects, 'effects', .8);
      audio.update({ master: .5, background: .2, effects: .8 });
      const playing = [background.gain.value, effects.gain.value];
      audio.update({ muted: true });
      const muted = [background.gain.value, effects.gain.value];
      audio.update({ muted: false });
      const restored = [background.gain.value, effects.gain.value];
      context.close();
      return { playing, muted, restored };
    });
    assert.ok(Math.abs(volumes.playing[0] - .1) < .00001);
    assert.ok(Math.abs(volumes.playing[1] - .32) < .00001);
    assert.deepEqual(volumes.muted, [0, 0]);
    assert.deepEqual(volumes.restored, volumes.playing);
    await page.getByRole('button', { name: '음향 설정', exact: true }).click();
    await page.getByRole('slider', { name: '배경음', exact: true }).fill('35');
    await page.getByRole('slider', { name: '효과음 및 안내 음성', exact: true }).fill('65');
    assert.equal(await page.getByRole('slider', { name: '배경음', exact: true }).inputValue(), '35');
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog') && document.activeElement === document.querySelector('#open'));
    await page.reload(); await page.waitForFunction(() => window.audio);
    assert.equal(await page.evaluate(() => audio.getSettings().background), .35);
    assert.equal(await page.evaluate(() => audio.getSettings().effects), .65);
    await page.evaluate(() => {
      audio.update({ master: -1, background: Number.NaN, effects: 100 });
      const s = audio.getSettings();
      if (s.master !== 0 || s.background !== .35 || s.effects !== 1) throw new Error('Invalid volume handling');
    });
    // Recordings use a live gain node, preserving independent volume on iOS.
    const media = await page.evaluate(() => {
      const gains = [];
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () { const node = createGain.call(this); gains.push(node); return node; };
      const element = new Audio();
      audio.update({ master: .5, effects: .4 });
      audio.trackMedia(element, 'effects', .9);
      const initial = gains.at(-1).gain.value;
      audio.update({ effects: .2 });
      const changed = gains.at(-1).gain.value;
      audio.untrackMedia(element);
      audio.update({ effects: .8 });
      const detached = gains.at(-1).gain.value;
      AudioContext.prototype.createGain = createGain;
      return { initial, changed, detached, volume: element.volume };
    });
    assert.ok(Math.abs(media.initial - .18) < .00001);
    assert.ok(Math.abs(media.changed - .09) < .00001);
    assert.equal(media.detached, media.changed);
    assert.equal(media.volume, 1);
    assert.deepEqual(errors, []);
    console.log('PASS: ambient session, independent live gains, mute/restore, mobile dialog, keyboard/focus, persistence, validation, recording gain and cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
