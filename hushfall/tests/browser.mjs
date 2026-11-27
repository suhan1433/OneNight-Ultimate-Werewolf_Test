import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

const port=Number(process.env.LUMEN_TEST_PORT||4312);
const external=process.env.LUMEN_TEST_ORIGIN;
const origin=external||'http://localhost:'+port;
const path='/hushfall/'+(process.env.LUMEN_TEST_RELAY==='1'?'?netsim=120,30,5':'');
const server=external?undefined:spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port)},stdio:'inherit'});
let browser;
try {
  for(let i=0;i<40;i++){
    if(await fetch(origin+'/api/hushfall/health').then(r=>r.ok,()=>false))break;
    if(i===39)throw Error('Relay did not start');
    await delay(100);
  }
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const hostContext=await browser.newContext({viewport:{width:1360,height:850}});
  const guestContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if(process.env.LUMEN_TEST_RELAY==='1') {
    for(const context of [hostContext,guestContext]) await context.addInitScript(()=>{window.RTCPeerConnection=undefined;});
  }
  const host=await hostContext.newPage(), guest=await guestContext.newPage();
  const errors=[];
  host.on('pageerror',e=>errors.push(e.message));guest.on('pageerror',e=>errors.push(e.message));
  if(external) {
    await host.goto(origin+'/');
    await host.locator('.game-card[data-game="hushfall"] .card-main').click();
    await host.waitForURL(origin+'/hushfall/');
    if(process.env.LUMEN_TEST_RELAY==='1')await host.goto(origin+path);
  } else await host.goto(origin+path);
  await host.getByRole('button',{name:'온라인 2인'}).click();
  await host.getByLabel('조종사 이름').fill('Mint Pilot');
  await host.getByRole('button',{name:'방 만들기'}).click();
  await host.getByRole('heading',{name:'비행 대기실'}).waitFor();
  const invite=await host.getByLabel('초대 링크').inputValue();
  assert.match(invite,/#\/join\/[A-Z2-9]{5}$/);
  await guest.goto(origin+path+new URL(invite).hash);
  await guest.getByLabel('조종사 이름').fill('Peach Pilot');
  await guest.getByRole('button',{name:'참가',exact:true}).click();
  await guest.getByRole('button',{name:'준비 완료',exact:true}).click();
  await host.getByRole('combobox',{name:'난이도'}).selectOption('5');
  await guest.waitForFunction(()=>document.querySelector('.config select:last-of-type') && [...document.querySelectorAll('.config select')].at(-1).value==='5');
  await host.getByRole('combobox',{name:'난이도'}).selectOption('0');
  await host.getByRole('button',{name:'출격',exact:true}).click();
  await Promise.all([host.locator('canvas').waitFor(),guest.locator('canvas').waitFor()]);
  await host.getByText(/전투 중/).waitFor();
  await guest.getByText(/전투 중/).waitFor();
  await guest.keyboard.down('ArrowRight');await delay(750);await guest.keyboard.up('ArrowRight');
  await guest.locator('.mobile-link').getByText('테더 단절',{exact:true}).waitFor();
  const canvas=await guest.locator('canvas').boundingBox();
  const touch=await guestContext.newCDPSession(guest);
  const y=canvas.y+canvas.height*.71;
  let x=canvas.x+canvas.width*.64;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=0;i<8;i++) {
    x-=canvas.width*.043;
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
    await delay(50);
  }
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await guest.locator('.mobile-link').getByText('테더 연결',{exact:true}).waitFor();
  await guest.setViewportSize({width:1040,height:844});
  const hostPlan=host.locator('.side.right .pair-plan');
  const guestPlan=guest.locator('.side.right .pair-plan');
  await hostPlan.locator('summary').click();
  await guestPlan.locator('summary').click();
  await hostPlan.getByRole('combobox').selectOption('frost');
  await guestPlan.getByText(/파트너 · 빙결/).waitFor();
  await guestPlan.getByRole('combobox').selectOption('fire');
  await hostPlan.locator('.evolution-tag').filter({hasText:'증기 장막'}).waitFor();
  await guest.setViewportSize({width:390,height:844});
  await host.getByRole('button',{name:'일시정지',exact:true}).click();
  await guest.getByRole('heading',{name:'일시정지',exact:true}).waitFor();
  await host.getByRole('button',{name:'계속',exact:true}).click();
  await guest.reload();
  await guest.locator('canvas').waitFor();
  assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await host.getByRole('button',{name:'항해 포기',exact:true}).click();
  await host.getByRole('button',{name:'포기',exact:true}).click();
  await guest.getByRole('heading',{name:'항해 종료',exact:true}).waitFor();
  await host.getByRole('button',{name:'대기실로',exact:true}).click();
  await guest.getByRole('button',{name:'준비 완료',exact:true}).waitFor();
  await guest.getByRole('button',{name:'방 나가기',exact:true}).click();
  assert.deepEqual(errors,[]);
  await guest.goto(origin+'/hushfall/');
  await guest.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await guestContext.setOffline(true);
  await guest.reload();
  await guest.getByRole('button',{name:'솔로 비행',exact:true}).click();
  await guest.getByRole('button',{name:'출격',exact:true}).click();
  await guest.locator('canvas').waitFor();
  await guest.reload();
  await guest.getByRole('button',{name:/솔로 이어하기/}).click();
  await guest.locator('canvas').waitFor();
  const firstDraft=guest.getByRole('region',{name:'강화 선택'});
  await firstDraft.waitFor({timeout:45000});
  for(const name of ['증폭 탄두','빙결 탄','쉴드 코어']) await firstDraft.getByRole('button',{name:new RegExp(name)}).waitFor();
  await firstDraft.getByRole('button',{name:/빙결 탄/}).click();
  await firstDraft.waitFor({state:'hidden'});
  await guest.getByRole('button',{name:'일시정지',exact:true}).click();
  await guest.getByRole('button',{name:'항해 포기',exact:true}).click();
  await guest.getByRole('button',{name:'포기',exact:true}).click();
  await guest.getByText('이번 항해의 빌드',{exact:true}).click();
  await guest.locator('.result-build').getByText('빙결 탄',{exact:false}).first().waitFor();
  console.log('Two-browser lobby, relay, touch, reconnect, and offline build selection passed');
} finally {
  await browser?.close();
  if(server) {server.kill();await once(server,'exit');}
}
