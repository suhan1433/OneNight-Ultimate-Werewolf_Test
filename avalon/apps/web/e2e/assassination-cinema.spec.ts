import {expect,test,type Page} from '@playwright/test';
import type {ClientGameState} from '../../../packages/shared/src/types';
function game(count=5):ClientGameState{return {roomCode:'BLADE',playerId:'p0',hostId:'p0',maxPlayers:count,phase:'assassination',stateVersion:1,players:Array.from({length:count},(_,i)=>({id:`p${i}`,nickname:`기사${i}`,ready:true,connected:true,isBot:false,isHost:i===0,hasVoted:false,hasQuestCard:false})),selfRole:'assassin',hasAssassinationAbility:true,roleIntel:[],options:{assassin:true,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:true},activeRoles:['merlin','assassin','loyal'],round:2,leaderId:'p0',rejectCount:0,results:['success','success','success'],roundHistory:[],roleConfirmedCount:count,continueConfirmedCount:0,hasContinued:false,questSize:2,proposedTeam:['p0','p1'],teamVotesCompleted:0,questCardsCompleted:0,chat:[]};}
async function show(page:Page,state:ClientGameState){await page.evaluate(async state=>(await import('/avalon/src/store.ts')).useGame.getState().setGame(state),state);}
async function aim(page:Page,targetId:string,locked=false){await page.evaluate(async({targetId,locked})=>{const {socket}=await import('/avalon/src/socket.ts');socket.listeners('ASSASSIN_AIM').forEach(listener=>listener({roomCode:'BLADE',targetId,actorId:'p0',locked}));},{targetId,locked});}
function result(hit:boolean,count=5){const state=game(count);state.phase='result';state.assassinTarget=hit?'p2':'p3';state.winner=hit?'evil':'good';state.winReason=hit?'멀린을 찾아냈습니다.':'멀린이 살아남았습니다.';state.revealedRoles=state.players.map((player,i)=>({id:player.id,role:i===0?'assassin':i===2?'merlin':'loyal',hasAssassinationAbility:i===0}));return state;}
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('avalon-intro-seen','1'));await page.goto('/avalon/');await expect(page.getByRole('button',{name:'음향 설정',exact:true})).toBeVisible();await page.evaluate(async()=>{const {socket}=await import('/avalon/src/socket.ts');socket.disconnect();(window as any).__commands=[];socket.emit=(event:string,...args:any[])=>{(window as any).__commands.push({event,data:args[0]});return socket;};socket.timeout=()=>({emit:(event:string,data:any,ack:any)=>{(window as any).__commands.push({event,data});(window as any).__ack=ack;}} as any);});});
for(const width of [320,390])for(const count of [5,10])test(`${count} assassination seats and controls fit at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===320?640:844});await show(page,game(count));
  const buttons=page.locator('.cs-seat button');await expect(buttons.nth(1)).toBeEnabled();await expect(buttons.nth(0)).toBeDisabled();await buttons.nth(count-1).click();
  await expect(page.locator('.assassin-target-summary strong')).toHaveText(`기사${count-1}`);await expect(page.locator('.cs-commit')).toBeEnabled();
  const action=await page.locator('.cs-commit').boundingBox();expect(action!.y+action!.height).toBeLessThanOrEqual(width===320?640:844);
  const names=await page.locator('.cs-name').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
  for(const name of names){expect(name.x).toBeGreaterThanOrEqual(0);expect(name.right).toBeLessThanOrEqual(width);}
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i]!,b=names[j]!;expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y).toBe(true);}
});
test('commit pins the chosen target, suppresses duplicates and recovers after a rejected request',async({page})=>{
  await show(page,game());await page.locator('.cs-seat button').nth(2).click();await aim(page,'p3');
  await page.locator('.cs-commit').evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  const commands=await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='ASSASSIN_COMMIT'));expect(commands).toHaveLength(1);expect(commands[0].data.targetId).toBe('p2');
  await expect(page.locator('.assassin-target-summary strong')).toHaveText('기사2');await aim(page,'p4');await expect(page.locator('.cs-commit')).toBeDisabled();await expect(page.locator('.assassin-target-summary strong')).toHaveText('기사2');
  await page.evaluate(()=>(window as any).__ack(null,{ok:false,error:'다시 시도해주세요.'}));await expect(page.locator('.cs-commit')).toBeEnabled();await page.locator('.cs-commit').click();expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='ASSASSIN_COMMIT'))).toHaveLength(2);
  await page.evaluate(()=>(window as any).__ack(null,{ok:true}));await aim(page,'p2',true);await aim(page,'p2',false);await expect(page.locator('.cs-commit')).toBeEnabled();
});
test('spectators follow the authoritative aim and lock without gaining controls',async({page})=>{
  const state=game();state.playerId='p4';state.hasAssassinationAbility=false;state.selfRole='loyal';await show(page,state);await aim(page,'p2',true);
  await expect(page.locator('.cs-assassin')).toHaveClass(/is-locked/);await expect(page.locator('.assassin-target-summary strong')).toHaveText('기사2');await expect(page.locator('.cs-commit')).toHaveCount(0);await expect(page.locator('.cs-seat button:enabled')).toHaveCount(0);
  await aim(page,'p2',false);await expect(page.locator('.cs-assassin')).not.toHaveClass(/is-locked/);
});
for(const hit of [true,false])test(`${hit?'hit':'miss'} shows the actual target then transitions into the ending`,async({page})=>{
  await show(page,result(hit));const scene=page.locator('.execution-cinema');await expect(scene).toHaveClass(new RegExp(hit?'is-hit':'is-miss'));await expect(scene.locator('.execution-name b')).toHaveText(hit?'기사2':'기사3');await expect(scene.locator('.execution-portrait')).toHaveCSS('opacity','0');
  await expect(page.locator('.cs-identity-grid')).toHaveCSS('visibility','hidden');await expect(scene.locator('.execution-verdict')).toHaveCSS('opacity','1');await expect(scene.locator('.execution-name>span')).toHaveText(hit?'멀린':'충성스러운 신하');
  if(!hit)await expect(scene.locator('.execution-survivor')).toContainText('기사2');
  const box=await scene.boundingBox();expect(box!.width).toBe(390);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  // Keep the fully revealed verdict readable for at least two seconds.
  await page.waitForTimeout(2000);await expect(scene).toBeVisible();await expect(scene).toHaveCSS('opacity','1');
  await expect(scene).toHaveCount(0,{timeout:5000});await expect(page.locator('.cs-identity-grid')).toHaveCSS('visibility','visible');
});
test('the close-up fits a short mobile viewport and can be skipped immediately',async({page})=>{
  await page.setViewportSize({width:320,height:640});await show(page,result(false,10));const focus=await page.locator('.execution-focus').boundingBox();const verdict=await page.locator('.execution-verdict').boundingBox();expect(focus!.y).toBeGreaterThan(0);expect(verdict!.y+verdict!.height).toBeLessThan(570);await page.getByRole('button',{name:'엔딩 바로 보기'}).click();await expect(page.locator('.execution-cinema')).toHaveCount(0);await expect(page.getByRole('button',{name:'새 게임 시작'})).toBeEnabled();
});
test('reduced motion and non-assassination endings do not play the close-up',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await show(page,result(true));await expect(page.locator('.execution-cinema')).toHaveCount(0);await expect(page.getByRole('button',{name:'새 게임 시작'})).toBeEnabled();await page.emulateMedia({reducedMotion:'no-preference'});const state=result(false);delete state.assassinTarget;await show(page,game());await show(page,state);await expect(page.locator('.execution-cinema')).toHaveCount(0);
});
