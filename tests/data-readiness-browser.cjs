// Synthetic browser acceptance. All remote requests are intercepted; no business data is written.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs'),{buildExpenseSnapshots}=require('../lib/expense-model.cjs');
const output=process.env.BOS_SCREENSHOTS||'/tmp/bos-readiness-verification';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const data=fixtures(),control={reads:0,writes:0,fail:new Set(),expense:false,delay:false,release:null,hidden:false};
 const expense=buildExpenseSnapshots({spreadsheetId:'DEMO-SYNTHETIC',gid:123,tab:'DEMO expenses',readAt:'2026-09-28T08:00:00Z',values:[['เดือน','ต้นทุน','รายการต้นทุน','จำนวนเงิน','ประเภทต้นทุนหลัก','เดือน (ตัวเลข)','ปี','บริษัท'],['Sep','DEMO','DEMO Tool',12.34,'DEMO',9,2026,'P&T']]},['2026-09'],'2026-09-28')[0];
 expense.company='DEMO';expense.expense_snapshot_id='DEMO-expense';
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOS_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').at(-1),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname.includes('/auth/'))return reply(session);
   if(req.method()!=='GET'){if(table!=='bos_audit_events')control.writes++;return reply([]);}
   if(table==='bos_access')return reply([{user_id:'fixture-user',role:'OWNER',active:true}]);
   if(table==='bos_management_kpis'){control.reads++;if(control.delay)await new Promise(r=>{control.release=r;});}
   if(control.fail.has(table))return reply({message:'DEMO failure'},503);
   if(table==='bos_management_kpis')return reply([{current_month:'2026-09'}]);
   if(table==='bos_current_snapshot_cards')return reply(data.current);
   if(table==='bos_snapshot_card_history')return reply(data.history);
   if(table==='bos_snapshot_months')return reply([{payload:data.payload}]);
   if(table==='bos_expense_cards')return reply(control.expense?[expense,{...expense,company:'OTHER',value_numeric:88888888}]:[]);
   return reply([]);
  });
  await page.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);
  await page.clock.install({time:new Date('2026-09-28T10:00:00Z')});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ctrl-kpi').first().waitFor();
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#appScreen').classList.contains('loading'));
  const open=()=>page.locator('.ctrl-domains [data-ceo-detail=confidence]').click();
  const source=key=>page.locator('[data-source-health='+key+']');
  await open();assert.equal(await page.locator('.ceo-source-health tbody tr').count(),4);assert.match(await source('expenses').textContent(),/ยังไม่พบชุดข้อมูล/);assert.match(await source('core').textContent(),/เกิน 3 วัน/);assert.equal(await page.locator('#ceoAutoRefresh').isChecked(),false);
  for(const [width,height] of [[1366,768],[1920,1080],[768,1024],[390,844],[844,390]]){
   await page.setViewportSize({width,height});assert.ok(Math.abs((await page.locator('#ceoDetail').boundingBox()).width-(width>=1280?width*.75:width))<1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.screenshot({path:output+'/readiness-'+width+'-demo.png'});
  }
  await page.setViewportSize({width:1366,height:768});await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();assert.equal(await page.locator('.ceo-readiness-queue tbody tr').count(),13);assert.match(await page.locator('.ceo-readiness-queue').textContent(),/คงเหลือ PC/);
  await page.locator('[data-detail-tab=summary]').click();control.expense=true;await page.locator('[data-readiness-refresh]').click();await ready();assert.match(await source('expenses').textContent(),/1 ชุดในเดือนนี้/);assert.match(await source('expenses').textContent(),/รอตรวจรับ/);assert.equal(await page.locator('[data-readiness-refresh]').isEnabled(),true);
  control.fail.add('bos_expense_cards');control.fail.add('bos_balance_cards');await page.locator('[data-readiness-refresh]').click();await ready();assert.match(await source('expenses').textContent(),/อ่านไม่สำเร็จ/);assert.match(await source('expenses').textContent(),/1 ชุดในเดือนนี้/);assert.match(await source('balances').textContent(),/อ่านไม่สำเร็จ/);assert.ok(!(await source('revenue').textContent()).includes('อ่านไม่สำเร็จ'));
  control.fail.clear();control.fail.add('bos_current_snapshot_cards');await page.locator('[data-readiness-refresh]').click();await ready();assert.match(await source('core').textContent(),/อ่านไม่สำเร็จ/);assert.match(await source('expenses').textContent(),/ชุดหลักอ่านไม่ครบ/);control.fail.clear();await page.locator('[data-readiness-refresh]').click();await ready();
  await page.locator('#ceoAutoRefresh').check();let n=control.reads;await page.clock.runFor(300000);assert.equal(control.reads,n,'pause while drawer is open');
  await page.keyboard.press('Escape');await page.clock.runFor(300000);await ready();assert.equal(control.reads,n+1,'visible dashboard reads after five minutes');
  // Hiding the tab cancels the timer; returning restarts a full interval.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});n=control.reads;await page.clock.runFor(600000);assert.equal(control.reads,n);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('[data-page=cards]').click();assert.equal(await page.locator('#view tbody tr').count(),data.current.length,'legacy WIP must not crash non-CEO cards');await page.clock.runFor(300000);assert.equal(control.reads,n,'pause on other pages');await page.locator('[data-page=dashboard]').click();
  await open();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('[data-ceo-action=confidence]').click();await page.locator('#actionForm [name=title]').fill('DEMO unsaved');await page.clock.runFor(300000);assert.equal(control.reads,n,'pause on an unsaved form');assert.equal(await page.locator('#actionForm [name=title]').inputValue(),'DEMO unsaved');await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('#ceoMonth').selectOption('2026-08');await open();assert.match(await source('expenses').textContent(),/ไม่มีข้อมูลเดือนที่เลือก/);assert.match(await source('expenses').textContent(),/0 ชุดในเดือนนี้/);await page.keyboard.press('Escape');
  // Logout invalidates an in-flight automatic read and disables future reads.
  control.delay=true;await page.clock.runFor(300000);await page.waitForFunction(()=>document.querySelector('#appScreen').classList.contains('loading'));await page.locator('#logout').evaluate(el=>el.click());await page.locator('#loginScreen').waitFor();assert.ok(control.release);control.release();await page.waitForFunction(()=>document.querySelector('#view').textContent==='');n=control.reads;await page.clock.runFor(600000);assert.equal(control.reads,n);assert.equal(await page.locator('#ceoDetailBody').textContent(),'');
  assert.equal(control.writes,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',synthetic:true,viewports:5,expectedSources:4,readinessChecks:13,isolatedCompanyMonth:true,multipleFailures:true,lastGoodData:true,autoRefresh:true,hiddenDrawerAndFormPause:true,nonCeoWipRegression:true,logoutRace:true,productionWrites:0,consoleErrors:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
