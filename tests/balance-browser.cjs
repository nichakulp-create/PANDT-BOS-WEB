// Synthetic only; every API call is intercepted. No production business writes.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs'),{fixture}=require('./balance-model.cjs'),{buildBalanceSnapshots}=require('../lib/balance-model.cjs');
const input=fixture();input.sources.material.values[1][4]=null;input.sources.tooling.values=input.sources.tooling.values.slice(0,1);
for(let i=0;i<1101;i++)input.sources.tooling.values.push(['DEMO',i===2?'<img src=x onerror="window.balanceXss=1">':'DEMO Tool '+i,i===4?null:5,'ชิ้น',0,i===3?null:10]);
const snapshots=buildBalanceSnapshots(input),cards=snapshots.map(({rows,...c})=>({...c,balance_snapshot_id:'DEMO-'+c.card_id}));
const output=process.env.BOS_SCREENSHOTS||'/tmp/bos-balance-verification';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const legacy=fixtures();legacy.current.concat(legacy.history).forEach(c=>{if(c.company==='DEMO')c.company='P&T';});
 const control={failRows:false,failCards:false,delay:false,release:null,writes:0,reads:0};
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOS_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').at(-1),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname.includes('/auth/'))return reply(session);
   if(req.method()!=='GET'){if(table!=='bos_audit_events')control.writes++;return reply([]);}
   if(table==='bos_access')return reply([{user_id:'fixture-user',role:'OWNER',active:true}]);
   if(table==='bos_management_kpis')return reply([{current_month:'2026-09',open_actions:0}]);
   if(table==='bos_current_snapshot_cards')return reply(legacy.current);
   if(table==='bos_snapshot_card_history')return reply(legacy.history);
   if(table==='bos_snapshot_months')return reply([{payload:legacy.payload}]);
   if(table==='bos_balance_cards')return control.failCards?reply({message:'DEMO failure'},500):reply(cards.concat([{...cards[0],company:'OTHER',value_numeric:88888888}]));
   if(table==='bos_balance_snapshots'){
    control.reads++;if(control.delay)await new Promise(r=>{control.release=r;});if(control.failRows)return reply({message:'DEMO failure'},500);
    const id=(u.searchParams.get('id')||'').replace('eq.DEMO-','');return reply([{rows:snapshots.find(c=>c.card_id===id).rows}]);
   }return reply([]);
  });
  await page.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ctrl-kpi').first().waitFor();
  assert.equal(await page.locator('.ctrl-flow-item[data-ceo-detail=wip] strong').textContent(),'—');assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail=workingCapital] strong').textContent(),'—');
  assert.ok(!(await page.locator('#view').textContent()).includes('88.88'));
  const viewports=[[1366,768],[1440,900],[1920,1080],[1366,600],[1280,720],[768,1024],[390,844],[844,390]];
  for(const [w,h] of viewports){await page.setViewportSize({width:w,height:h});if(await page.locator('[data-ceo-panel="1"]').isVisible())await page.locator('[data-ceo-panel="1"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),h);}
  await page.setViewportSize({width:1366,height:768});await page.screenshot({path:output+'/balance-dashboard-demo.png'});
  await page.locator('.ctrl-kpi[data-ceo-detail=workingCapital]').click();await page.locator('[data-detail-tab=parts]').click();await page.locator('#ceoDetailBody [data-ceo-detail=tooling]').click();await page.locator('[data-detail-tab=parts]').click();await page.locator('#balanceFilter').waitFor();
  assert.equal(await page.locator('.revenue-table tbody tr').count(),50);assert.match(await page.locator('.revenue-pager').textContent(),/23/);assert.equal(await page.evaluate(()=>window.balanceXss),undefined);
  assert.ok((await page.locator('.revenue-table a').evaluateAll(els=>els.map(e=>e.href))).every(x=>x.startsWith('https://docs.google.com/spreadsheets/d/DEMO-SYNTHETIC/edit#gid=123&range=A')));
  await page.locator('#balanceFilter [name=query]').fill('DEMO Tool 1100');await page.locator('#balanceFilter [type=submit]').click();assert.match(await page.locator('.balance-results').textContent(),/1 \/ 1,101/);
  await page.locator('[data-balance-reset]').click();await page.locator('[data-balance-page="1"]').click();assert.match(await page.locator('.revenue-pager').textContent(),/หน้า 2/);
  await page.locator('#balanceFilter [name=status]').selectOption('REVIEW');assert.match(await page.locator('.balance-results').textContent(),/2 \/ 1,101/);assert.ok((await page.locator('.revenue-table tbody tr td:nth-child(4)').allTextContents()).every(t=>t==='—'));
  await page.locator('[data-ceo-action=tooling]').click();assert.match(await page.locator('#actionForm [name=description]').inputValue(),/Snapshot DEMO-tooling/);assert.match(await page.locator('#actionForm [name=description]').inputValue(),/2 รายการ/);await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('.ctrl-flow-item[data-ceo-detail=fac2]').click();control.failRows=true;await page.locator('[data-detail-tab=insight]').click();await page.locator('#balanceRetry').waitFor();control.failRows=false;await page.locator('#balanceRetry').click();await page.locator('.balance-aging').waitFor();assert.match(await page.locator('.balance-aging').textContent(),/2026-09-02/);await page.locator('[data-balance-row]').click();await page.locator('#balanceFilter').waitFor();assert.match(await page.locator('.balance-results').textContent(),/1 \/ 1/);await page.locator('.revenue-table details summary').click();assert.match(await page.locator('.revenue-table').textContent(),/DEMO-IN/);assert.match(await page.locator('.revenue-table').textContent(),/0.2/);
  await page.locator('[data-detail-tab=insight]').click();await page.locator('.balance-aging').waitFor();assert.equal(await page.locator('#balanceFilter').count(),0);assert.match(await page.locator('#ceoDetailBody').textContent(),/ไม่ใช่อายุของชิ้นงาน/);assert.match(await page.locator('.balance-aging').textContent(),/DEMO/);
  for(const [w,h] of [[1366,768],[768,1024],[390,844]]){await page.setViewportSize({width:w,height:h});assert.ok(Math.abs((await page.locator('#ceoDetail').boundingBox()).width-(w>=1280?w*.75:w))<1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);await page.screenshot({path:output+'/balance-detail-'+w+'-demo.png'});}
  await page.keyboard.press('Escape');await page.setViewportSize({width:1366,height:768});await page.locator('.ctrl-flow-item[data-ceo-detail=material]').click();await page.locator('[data-detail-tab=insight]').click();assert.equal(await page.locator('#balanceFilter').count(),0);assert.match(await page.locator('#ceoDetailBody').textContent(),/ผลกระทบที่ทราบ/);await page.locator('[data-balance-issue=WEIGHT_MISSING]').click();await page.locator('#balanceFilter').waitFor();assert.match(await page.locator('.balance-results').textContent(),/1 \/ 3/);await page.keyboard.press('Escape');
  // A current balance must not turn into an earlier month's stock value.
  await page.locator('#ceoMonth').selectOption('2026-08');assert.equal(await page.locator('.ctrl-flow-item[data-ceo-detail=fg] strong').textContent(),'—');await page.locator('#ceoMonth').selectOption('2026-09');
  control.failCards=true;await page.locator('#ceoRefresh').click();await page.getByText(/โหลดคงเหลือใหม่ไม่สำเร็จ/).waitFor();await page.locator('.ctrl-flow-item[data-ceo-detail=fac2]').click();assert.match(await page.locator('#ceoDetailBody').textContent(),/0.20/);await page.keyboard.press('Escape');
  control.failCards=false;await page.locator('#ceoRefresh').click();await page.locator('.ctrl-flow-item[data-ceo-detail=qaFinal]').click();control.failRows=true;await page.locator('[data-detail-tab=parts]').click();await page.locator('#balanceRetry').waitFor();control.failRows=false;await page.locator('#balanceRetry').click();await page.locator('#balanceFilter').waitFor();await page.keyboard.press('Escape');
  control.delay=true;await page.locator('.ctrl-flow-item[data-ceo-detail=fg]').click();await page.locator('[data-detail-tab=parts]').click();await page.getByText('กำลังอ่านรายละเอียดคงเหลือ…').waitFor();await page.keyboard.press('Escape');await page.locator('#logout').click();await page.locator('#loginScreen').waitFor();control.release();await page.waitForTimeout(200);
  assert.equal(await page.locator('#view').textContent(),'');assert.equal(await page.locator('#ceoDetailBody').textContent(),'');assert.equal(control.writes,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',synthetic:true,viewports:8,balanceInsightTab:true,lastMovement:true,sourceLinks:true,unitWarnings:true,rowsBeyond1000:true,ledgerDrilldown:true,filters:true,actionDraft:true,companyMonthIsolation:true,failedRefreshRetainsEvidence:true,retry:true,logoutRace:true,productionWrites:0,consoleErrors:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
