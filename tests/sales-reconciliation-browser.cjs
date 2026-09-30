'use strict';
// Synthetic-only acceptance: every Supabase request is intercepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs');
const {buildSalesSnapshots}=require('../lib/revenue-model.cjs');
const out=process.env.BOS_SCREENSHOTS||'/tmp/bos-sales-verification';fs.mkdirSync(out,{recursive:true});
const source={sourceId:'DEMO',tab:'Folow',readAt:'2026-09-30T09:00:00Z',range:'A1:K5',values:[['DATE','INV.','Customer','Qty','Net Total','Value Added Tax 7%','Grand Total','บริษัท','หมายเหตุ','Month (no.)','Year'],['2026-07-01','DEMO-JUL','DEMO',1,100,7,107,'P&T','',7,2026],['2026-08-01','DEMO-DUP','DEMO',1,50,3.5,53.5,'P&T','',8,2026],['2026-08-02','DEMO-DUP','DEMO',1,50,3.5,53.5,'P&T','',8,2026],['2026-09-01','DEMO-SEP','DEMO',1,200,14,214,'P&T','',9,2026]]};
const data=fixtures(),cards=buildSalesSnapshots(source,['2026-07','2026-08','2026-09'],'2026-09-30').map(s=>({...s,company:'DEMO',revenue_snapshot_id:'demo-'+s.month}));
(async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOS_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];let businessWrites=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').at(-1),reply=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname.includes('/auth/'))return reply(session);
   if(req.method()!=='GET'){if(table!=='bos_audit_events')businessWrites++;return reply([]);}
   if(table==='bos_access')return reply([{user_id:'fixture-user',role:'OWNER',active:true}]);
   if(table==='bos_management_kpis')return reply([{current_month:'2026-09'}]);
   if(table==='bos_current_snapshot_cards')return reply(data.current);
   if(table==='bos_snapshot_card_history')return reply(data.history);
   if(table==='bos_snapshot_months')return reply([{payload:data.payload}]);
   if(table==='bos_revenue_cards')return reply(cards.concat([{...cards[0],company:'OTHER',value_numeric:999999}]));
   if(table==='bos_revenue_snapshots'){const c=cards.find(c=>'eq.'+c.revenue_snapshot_id===u.searchParams.get('id'));return reply(c?[{rows:c.rows}]:[]);}
   return reply([]);
  });
  await page.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ctrl-kpi').first().waitFor();
  await page.locator('.ctrl-domains [data-ceo-detail=confidence]').click();
  assert.equal(await page.locator('.ceo-sales-reconcile tbody tr').count(),3);
  assert.match(await page.locator('[data-sales-month="2026-07"]').textContent(),/100\.00/);
  assert.match(await page.locator('[data-sales-month="2026-08"]').textContent(),/มีรายการรอตรวจ/);
  assert.ok(!(await page.locator('.ceo-sales-reconcile').textContent()).includes('999,999'));
  for(const [width,height] of [[1366,768],[1920,1080],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});await page.locator('.ceo-sales-reconcile').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   assert.ok(Math.abs((await page.locator('#ceoDetail').boundingBox()).width-(width>=1280?width*.75:width))<1);
   await page.screenshot({path:path.join(out,'sales-reconciliation-'+width+'-demo.png')});
  }
  await page.setViewportSize({width:1366,height:768});await page.locator('[data-sales-audit-month="2026-08"][data-sales-review]').click();
  await page.locator('#revenueFilter').waitFor();assert.equal(await page.locator('#ceoMonth').inputValue(),'2026-08');assert.equal(await page.locator('#revenueFilter [name=status]').inputValue(),'REVIEW');
  assert.match(await page.locator('#ceoDetailBody').textContent(),/DEMO-DUP/);
  await page.keyboard.press('Escape');await page.locator('.ctrl-domains [data-ceo-detail=confidence]').click();await page.locator('[data-sales-audit-month="2026-07"]').click();await page.locator('#revenueFilter').waitFor();
  assert.equal(await page.locator('#ceoMonth').inputValue(),'2026-07');assert.match(await page.locator('#ceoDetailBody').textContent(),/DEMO-JUL/);
  assert.equal(businessWrites,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',synthetic:true,viewports:4,monthScope:true,reviewDrilldown:true,productionWrites:0,consoleErrors:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
