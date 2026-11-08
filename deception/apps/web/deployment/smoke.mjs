import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.env.RENDER_TEST_URL || 'http://127.0.0.1:18880';
const browser = await chromium.launch();
const contexts = [];
try {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(hostContext, guestContext);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  const socketRequests = [];
  for (const page of [host, guest]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes('socket.io') || pathname.includes('/socket/')) socketRequests.push(pathname);
    });
  }
  const health = await hostContext.request.get(`${origin}/api/deception/health`);
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).game, 'neon-casefiles');
  const redirect = await hostContext.request.get(`${origin}/deception?room=4321`, { maxRedirects: 0 });
  assert.equal(redirect.status(), 301);
  assert.equal(redirect.headers().location, '/deception/?room=4321');

  await host.goto(origin);
  assert.equal(await host.locator('.game-card').count(), 6);
  assert.equal(await host.locator('.game-card.deception').getAttribute('href'), '/deception/');
  await host.evaluate(async () => {
    const cache = await caches.open('after-hours-deployment-probe');
    await cache.put('/deployment-probe', new Response('preserve other games'));
  });
  await host.screenshot({ path: '../../docs/screenshots/selector-render-mobile.png', fullPage: true });
  await host.locator('.game-card.deception').click();
  await host.getByLabel('닉네임').waitFor();
  await host.evaluate(async () => { await navigator.serviceWorker.ready; });
  const registrations = await host.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname));
  assert.deepEqual(registrations, ['/deception/']);
  assert.equal(await host.evaluate(() => caches.has('after-hours-deployment-probe')), true);
  const manifestURL = await host.locator('link[rel="manifest"]').getAttribute('href');
  assert.equal(manifestURL, '/deception/manifest.webmanifest');
  const manifestResponse = await hostContext.request.get(`${origin}${manifestURL}`);
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  assert.equal(new URL(manifest.start_url, `${origin}${manifestURL}`).pathname, '/deception/');
  const icon = await hostContext.request.get(`${origin}/deception/${manifest.icons[0].src}`);
  assert.match(icon.headers()['content-type'], /image\/svg\+xml/);

  await host.getByLabel('닉네임').fill('배포테스트방장');
  await host.getByRole('button', { name: '수사실 만들기' }).click();
  await host.locator('.room-code').waitFor();
  const code = (await host.locator('.room-code').innerText()).match(/\d{4}/)[0];
  await host.locator('.invite-card').click();
  assert.equal(await host.getByLabel('초대 링크').inputValue(), `${origin}/deception/?room=${code}`);
  await host.getByRole('button', { name: '닫기', exact: true }).click();
  await guest.goto(`${origin}/deception/?room=${code}`);
  assert.equal(await guest.getByLabel('방 코드', { exact: true }).inputValue(), code);
  await guest.getByLabel('닉네임').fill('배포테스트참가자');
  await guest.getByRole('button', { name: '코드로 입장' }).click();
  await guest.locator('.room-code').waitFor();
  await host.getByLabel('채팅 메시지').fill('Nginx 경유 채팅 연결 확인');
  await host.getByRole('button', { name: '메시지 보내기' }).click();
  await guest.getByText('Nginx 경유 채팅 연결 확인', { exact: true }).waitFor();
  await guest.reload();
  await guest.locator('.room-code').waitFor();
  assert.equal(await guest.locator('.room-code').innerText(), `ROOM ${code}`);
  await host.screenshot({ path: '../../docs/screenshots/lobby-render-mobile.png' });
  assert.ok(socketRequests.length > 0);
  assert.ok(socketRequests.every(path => path.startsWith('/api/deception/socket/')));
  assert.deepEqual(errors, []);
  await host.goto(origin);
  assert.equal(await host.locator('.game-card').count(), 6);
  assert.equal(await host.evaluate(() => navigator.serviceWorker.controller), null);
  console.log('PASS: selector, redirect, assets, scoped PWA, invitation, Socket.IO chat and reconnect through Render Nginx');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
