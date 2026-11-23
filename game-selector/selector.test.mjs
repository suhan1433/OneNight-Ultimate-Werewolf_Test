import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createGame } from '../gomoku/shared/engine.ts';
import { games as actualGames } from '../game-switch/catalog.ts';

const root=fileURLToPath(new URL('./',import.meta.url));
const html=await readFile(join(root,'index.html'),'utf8');
const css=await readFile(join(root,'launcher.css'),'utf8');
const games=JSON.parse(html.match(/<script id="game-data" type="application\/json">(.*?)<\/script>/s)[1]);
let server,browser,origin;
const screenshots=process.env.SELECTOR_SCREENSHOTS||join(tmpdir(),'after-hours-selector','screenshots');
before(async()=>{
  server=http.createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/launcher.css'||path==='/game-selector/launcher.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(path==='/'||path==='/game-selector/'||path==='/game-selector/index.html')res.end(html);
    else if(games.some(game=>game.href===path))res.end('<!doctype html><html lang="ko"><title>게임 입장 경로 확인</title><h1>게임 입장 경로 확인</h1></html>');
    else{res.statusCode=404;res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
  await mkdir(screenshots,{recursive:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
const open=async(options={})=>{
  const context=await browser.newContext(options);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  return {context,page,errors};
};
const visibleIds=page=>page.locator('.game-card:visible').evaluateAll(cards=>cards.map(card=>card.dataset.game));

test('launcher styles load at the root, in its folder and from a local HTML file',async()=>{
  const {context,page}=await open();
  try{
    for(const url of [origin,`${origin}/game-selector/`,`${origin}/game-selector/index.html`,new URL('./index.html',import.meta.url).href]){
      await page.goto(url,{waitUntil:'load'});
      assert.equal(await page.locator('.hero').evaluate(el=>getComputedStyle(el).display),'grid',`${url}: hero stylesheet missing`);
      assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(11, 20, 21)',`${url}: theme stylesheet missing`);
    }
  }finally{await context.close();}
});

test('eight destinations and player ranges match the game implementations',()=>{
  assert.equal(games.length,8);
  assert.equal(new Set(games.map(game=>game.id)).size,8);
  for(const game of games){
    const id=game.id.replaceAll('-','_');
    assert.equal(game.href,`/${id}/`);
    if(id==='gomoku'){
      const state=createGame([{id:'one',name:'흑'},{id:'two',name:'백'}],1,0);
      assert.equal(game.min,state.players.length);
      assert.equal(game.max,state.players.length);
      assert.throws(()=>createGame([{id:'one',name:'혼자'}],1,0));
      continue;
    }
    assert.ok(actualGames[id],game.id);
    assert.equal(game.min,actualGames[id].min);
    assert.equal(game.max,actualGames[id].max);
  }
});
test('responsive layouts, readable cards and unique SVG ids',async()=>{
  for(const width of [1440,1024,768,701,700,390,320]){
    const {context,page,errors}=await open({viewport:{width,height:950}});
    try{
      await page.locator('html.is-ready').waitFor();
      assert.equal((await visibleIds(page)).length,8);
      if(width<=700) assert.equal(await page.locator(".title-star").evaluate(el=>getComputedStyle(el).position),"absolute","decorative star must not wrap onto its own headline line");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: horizontal overflow`);
      const layoutProblems=await page.evaluate(()=>{
        const problems=[];
        for(const element of document.querySelectorAll('.title-line, .spotlight-content, .spotlight-footer, .card-body')){
          if(element.scrollWidth>element.clientWidth+1) problems.push(`${element.className}: clipped content`);
        }
        const text=document.querySelector('.spotlight-content>div').getBoundingClientRect();
        const play=document.querySelector('.spotlight-play').getBoundingClientRect();
        if(text.left<play.right&&text.right>play.left&&text.top<play.bottom&&text.bottom>play.top) problems.push('preview text overlaps play button');
        for(const card of document.querySelectorAll('.game-card')){
          const facts=card.querySelector('.card-facts').getBoundingClientRect();
          const action=card.querySelector('.card-bottom').getBoundingClientRect();
          if(facts.bottom>action.top+1) problems.push(`${card.dataset.game}: details overlap action`);
        }
        return problems;
      });
      assert.deepEqual(layoutProblems,[],`${width}: text and actions must fit without overlapping`);
      const ids=await page.locator('[id]').evaluateAll(elements=>elements.map(element=>element.id));
      assert.equal(ids.length,new Set(ids).size,`${width}: SVG ids must be unique`);
      const overlap=await page.locator('.spotlight-play').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});
      // Small screens place the preview below the fold; check its target after scrolling.
      if(!overlap){await page.locator('.spotlight-play').scrollIntoViewIfNeeded();await page.locator('.spotlight-play').click({trial:true});}
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:join(screenshots,`selector-${width}.png`),fullPage:true,animations:'disabled'});
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
});
test('manual spotlight selection and details preserve the selected destination',async()=>{
  const {context,page,errors}=await open({viewport:{width:390,height:844}});
  try{
    for(const game of games){
      await page.locator(`[data-preview="${game.id}"]`).click();
      assert.equal(await page.locator('#spotlight-title').textContent(),game.title+(game.subtitle?` · ${game.subtitle}`:''));
      assert.equal(await page.locator('[data-preview][aria-pressed="true"]').count(),1);
      assert.equal(await page.locator('#spotlight-play').getAttribute('href'),game.href);
      await page.locator('#spotlight-details').click();
      assert.equal(await page.locator('#dialog-title').textContent(),game.title+(game.subtitle?` · ${game.subtitle}`:''));
      assert.equal(await page.locator('#dialog-how li').count(),3);
      assert.equal(await page.locator('#dialog-play').getAttribute('href'),game.href);
      assert.equal(await page.locator('#dialog-people').textContent(),game.min===game.max?`${game.min}명`:`${game.min}–${game.max}명`);
      assert.ok(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog[open]').count(),0);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'spotlight-details');
    }
    const ids=await page.locator('[id]').evaluateAll(elements=>elements.map(element=>element.id));
    assert.equal(ids.length,new Set(ids).size);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('filters, shareable URLs, browser back, empty state and honest random picks',async()=>{
  const {context,page,errors}=await open();
  try{
    await page.locator('[data-mood="strategy"]').click();
    assert.deepEqual(await visibleIds(page),['skullking','rummikub','gomoku']);
    await page.locator('#people-filter').selectOption('2');
    assert.equal(new URL(page.url()).searchParams.get('players'),'2');
    await page.locator('[data-mood="cooperative"]').click();
    assert.deepEqual(await visibleIds(page),[]);
    assert.equal(await page.locator('#empty-state').isVisible(),true);
    assert.equal(await page.locator('#pick-game').isDisabled(),true);
    await page.goBack();
    assert.deepEqual(await visibleIds(page),['skullking','rummikub','gomoku']);
    await page.locator('#reset-filters').click();
    assert.equal((await visibleIds(page)).length,8);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.mood),'all');
    await page.locator('#people-filter').selectOption('12');
    assert.deepEqual(await visibleIds(page),['deception']);
    await page.locator('#pick-game').click();
    assert.match(await page.locator('#dialog-title').textContent(),/네온 사건파일/);
    assert.match(await page.locator('#dialog-kicker').textContent(),/조건에 맞춰/);
    await page.screenshot({path:join(screenshots,'selector-details.png'),animations:'disabled'});
    await page.keyboard.press('Escape');
    await page.locator('#people-filter').selectOption('1');
    assert.equal((await visibleIds(page)).length,8);
    await page.goto(`${origin}/?mood=cooperative&players=4`);
    assert.deepEqual(await visibleIds(page),['spacecrew']);
    await page.goto(`${origin}/?mood=invalid&players=999`);
    assert.equal((await visibleIds(page)).length,8);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('card details are separate from navigation and recently selected means a real click',async()=>{
  const {context,page}=await open();
  try{
    assert.equal(await page.locator('#recent-link').isVisible(),false);
    const info=page.locator('[data-info="avalon"]');
    await info.click();assert.equal(new URL(page.url()).pathname,'/');
    await page.locator('#dialog-close').click();
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.info),'avalon');
    await page.locator('[data-game="avalon"] .card-main').click();
    await page.waitForURL(`${origin}/avalon/`);
    assert.equal(await page.evaluate(()=>localStorage.getItem('after-hours:last-game')),'avalon');
    await page.goto(origin);
    assert.match(await page.locator('#recent-link').textContent(),/아발론/);
    assert.equal(await page.locator('#recent-link').getAttribute('href'),'/avalon/');
    assert.equal(await page.locator('#spotlight-title').textContent(),'아발론');
    assert.equal(await page.locator('.recent-badge:visible').count(),1);
  }finally{await context.close();}
});
test('navigation works without JavaScript or browser storage; reduced motion is respected',async()=>{
  const noScript=await open({javaScriptEnabled:false});
  try{
    assert.equal((await visibleIds(noScript.page)).length,8);
    assert.equal(await noScript.page.locator('.card-info:visible').count(),0);
    await noScript.page.locator('[data-game="rummikub"] .card-main').click();
    await noScript.page.waitForURL(`${origin}/rummikub/`);
  }finally{await noScript.context.close();}
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Unavailable','SecurityError');}}));
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(origin);await page.locator('html.is-ready').waitFor();
    await page.locator('[data-preview="avalon"]').click();
    assert.equal(await page.locator('#spotlight-title').textContent(),'아발론');
    assert.equal(await page.locator('#spotlight-art').evaluate(el=>el.getAnimations().length),0);
    await page.locator('[data-game="avalon"] .card-main').click();
    await page.waitForURL(`${origin}/avalon/`);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('a slow external font stylesheet cannot block game selection',async()=>{
  const context=await browser.newContext();
  await context.route('https://fonts.googleapis.com/**',()=>{});
  const page=await context.newPage();
  try{
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:5000});
    await page.locator('html.is-ready').waitFor({timeout:5000});
    await page.locator('[data-mood="strategy"]').click();
    assert.deepEqual(await visibleIds(page),['skullking','rummikub','gomoku']);
    await page.locator('[data-game="rummikub"] .card-main').click();
    await page.waitForURL(`${origin}/rummikub/`);
  }finally{await context.close();}
});

test('gomoku appears for two players, has its own preview and supports direct navigation',async()=>{
  const {context,page,errors}=await open({viewport:{width:390,height:844}});
  try{
    await page.locator('#people-filter').selectOption('2');
    assert.ok((await visibleIds(page)).includes('gomoku'));
    await page.locator('#people-filter').selectOption('3');
    assert.equal(await page.locator('[data-game="gomoku"]').isVisible(),false);
    await page.locator('#people-filter').selectOption('2');
    await page.locator('[data-preview="gomoku"]').click();
    assert.equal(await page.locator('#spotlight-title').textContent(),'천원 · 오목 택틱스');
    assert.equal(await page.locator('#spotlight-people').textContent(),'2명');
    await page.locator('[data-info="gomoku"]').click();
    assert.equal(await page.locator('#dialog-play').getAttribute('href'),'/gomoku/');
    await page.locator('#dialog-play').click();
    await page.waitForURL(`${origin}/gomoku/`);
    await page.goto(origin);
    assert.equal(await page.locator('#recent-link').getAttribute('href'),'/gomoku/');
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
