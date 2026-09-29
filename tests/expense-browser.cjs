// Synthetic browser checks only. All API requests are intercepted; no production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs'),{buildExpenseSnapshots}=require('../lib/expense-model.cjs');
const output=process.env.BOS_SCREENSHOTS||'/tmp/bos-expense-verification';fs.mkdirSync(output,{recursive:true});
const source={spreadsheetId:'DEMO-SYNTHETIC',tab:'DEMO expenses',gid:123,readAt:'2026-09-28T08:00:00Z',values:[['เดือน','ต้นทุน','รายการต้นทุน','จำนวนเงิน','ประเภทต้นทุนหลัก','เดือน (ตัวเลข)','ปี','บริษัท']]};
for(let month=1;month<=8;month++)for(let i=0;i<(month===3?1101:60);i++)source.values.push([['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'][month-1],i%2?'DEMO Tooling':'DEMO operation',i===2?'<img src=x onerror="window.expenseXss=1">':'DEMO Tool '+i,i===4&&month===7?null:i===3?-1.005:month*100+i,i%2?'ทางตรง':'ทางอ้อม',month,2026,month>=7?'':'P&T']);
const snapshots=buildExpenseSnapshots(source,Array.from({length:9},(_,i)=>'2026-0'+(i+1)),'2026-09-28');
const cards=snapshots.map(({rows,...c})=>({...c,expense_snapshot_id:'DEMO-'+c.month}));
(async()=>{
 const legacy=fixtures();legacy.current.concat(legacy.history).forEach(c=>{if(c.company==='DEMO')c.company='P&T';});
 const control={reads:0,failRows:false,failCards:false,delay:false,release:null,writes:0};
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
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
   if(table==='bos_expense_cards')return control.failCards?reply({message:'DEMO failed'},500):reply(cards.concat([{...cards.at(-1),company:'OTHER',value_numeric:888888888}]));
   if(table==='bos_expense_snapshots'){
    control.reads++;if(control.delay)await new Promise(r=>{control.release=r;});if(control.failRows)return reply({message:'DEMO failed'},500);
    const month=(u.searchParams.get('id')||'').replace('eq.DEMO-','');return reply([{rows:snapshots.find(c=>c.month===month).rows}]);
   }
   return reply([]);
  });
  await page.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ctrl-kpi').first().waitFor();
  assert.ok(!(await page.locator('#view').textContent()).includes('888.88'));
  assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail=totalCost] strong').textContent(),'—');
  assert.match(await page.locator('.ctrl-cost-chart [data-expense-month="2026-08"]').getAttribute('aria-label'),/มี 60 รายการ · รอยืนยันบริษัท/);
  assert.match(await page.locator('.ctrl-cost-chart [data-expense-month="2026-09"]').getAttribute('title'),/ไม่มีรายการเดือนนี้/);
  await page.locator('.ctrl-cost-chart [data-expense-month="2026-08"]').click();assert.equal(await page.locator('#ceoMonth').inputValue(),'2026-08');
  assert.match(await page.locator('#ceoDetailBody').textContent(),/15:00 เวลาไทย/);assert.match(await page.locator('.revenue-stats').textContent(),/ไม่ระบุบริษัท 60/);assert.match(await page.locator('.revenue-stats > div').first().textContent(),/—/);await page.keyboard.press('Escape');
  const viewports=[[1366,768],[1440,900],[1920,1080],[1366,600],[1280,720],[768,1024],[390,844],[844,390]];
  for(const month of ['2026-09','2026-08','2026-03']){
   await page.locator('#ceoMonth').selectOption(month);
   for(const [w,h] of viewports){await page.setViewportSize({width:w,height:h});if(await page.locator('[data-ceo-panel="3"]').isVisible())await page.locator('[data-ceo-panel="3"]').click();const d=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,panels:[...document.querySelectorAll('.ctrl-panel')].filter(e=>e.getBoundingClientRect().height).map(e=>({name:e.className,h:e.clientHeight,sh:e.scrollHeight}))}));assert.equal(d.sw,w);assert.equal(d.sh,h);d.panels.forEach(p=>assert.ok(p.sh<=p.h+1,JSON.stringify({month,w,h,p})));}
   await page.setViewportSize({width:1366,height:768});await page.screenshot({path:output+'/expense-'+month+'-dashboard-demo.png'});
  }
  await page.screenshot({path:output+'/expense-dashboard-demo.png'});
  await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=trend]').click();assert.match(await page.locator('#ceoDetailBody').textContent(),/เดือนเดียวกันปีก่อน/);assert.match(await page.locator('#ceoDetailBody').textContent(),/ข้อมูลเดือนเปรียบเทียบไม่ครบ/);
  await page.locator('[data-detail-tab=parts]').click();await page.locator('#expenseFilter').waitFor();assert.equal(control.reads,1);assert.equal(await page.locator('.revenue-table tbody tr').count(),50);assert.match(await page.locator('.revenue-pager').textContent(),/23/);
  assert.equal(await page.evaluate(()=>window.expenseXss),undefined);assert.ok((await page.locator('.revenue-table a').evaluateAll(els=>els.map(e=>e.href))).every(x=>x.startsWith('https://docs.google.com/spreadsheets/d/DEMO-SYNTHETIC/edit#gid=123&range=A')));
  await page.locator('#expenseFilter [name=query]').fill('DEMO Tool 1100');await page.locator('#expenseFilter [type=submit]').click();assert.match(await page.locator('.expense-results').textContent(),/1 \/ 1101/);assert.match(await page.locator('.revenue-table tbody').textContent(),/1,400/);
  await page.locator('[data-expense-reset]').click();await page.locator('#expenseFilter [name=mainType]').selectOption('ทางตรง');assert.match(await page.locator('.expense-results').textContent(),/550 \/ 1101/);
  await page.locator('[data-expense-page="1"]').click();assert.match(await page.locator('.revenue-pager').textContent(),/หน้า 2/);
  await page.locator('[data-ceo-action=expenses]').click();assert.match(await page.locator('#actionForm [name=description]').inputValue(),/Snapshot DEMO-2026-03/);assert.match(await page.locator('#actionForm [name=description]').inputValue(),/550 รายการ/);assert.equal(control.writes,0);await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('[data-expense-item]').first().click();await page.locator('#expenseFilter').waitFor();assert.match(await page.locator('.expense-results').textContent(),/1 \/ 1101/);await page.keyboard.press('Escape');
  // Real known negative values are retained; unassigned company amounts stay withheld.
  await page.locator('#ceoMonth').selectOption('2026-08');await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=parts]').click();await page.locator('#expenseFilter').waitFor();
  assert.ok((await page.locator('.revenue-table tbody tr td:nth-child(2)').allTextContents()).every(x=>x==='ไม่ระบุบริษัท'));
  assert.ok((await page.locator('.revenue-table tbody tr td:nth-child(3)').allTextContents()).every(x=>x==='—'));
  assert.match(await page.locator('.revenue-table tbody').textContent(),/-1.01/);
  await page.locator('[data-expense-issue=COMPANY_MISSING]').click();assert.match(await page.locator('.expense-results').textContent(),/60 \/ 60/);assert.match(await page.locator('#ceoDetailBody').textContent(),/เหตุผลที่เลือก: ไม่ระบุบริษัท/);
  for(const [w,h] of [[1366,768],[768,1024],[390,844]]){await page.setViewportSize({width:w,height:h});assert.ok(Math.abs((await page.locator('#ceoDetail').boundingBox()).width-(w>=1280?w*.75:w))<1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);await page.screenshot({path:output+'/expense-detail-'+w+'-demo.png'});}
  await page.keyboard.press('Escape');await page.setViewportSize({width:1366,height:768});
  control.failCards=true;await page.locator('#ceoRefresh').click();await page.getByText(/โหลดรายละเอียดต้นทุนไม่สำเร็จ/).waitFor();await page.locator('[data-ceo-detail=expenses]').first().click();assert.match(await page.locator('.revenue-stats').textContent(),/ไม่ระบุบริษัท 60/,'failed reload retains the prior source instead of falling back to legacy');await page.keyboard.press('Escape');
  control.failCards=false;await page.locator('#ceoRefresh').click();await page.locator('[data-ceo-detail=expenses]').first().click();control.failRows=true;await page.locator('[data-detail-tab=parts]').click();await page.locator('#expenseRetry').waitFor();control.failRows=false;await page.locator('#expenseRetry').click();await page.locator('#expenseFilter').waitFor();await page.keyboard.press('Escape');
  await page.locator('#ceoMonth').selectOption('2026-09');await page.locator('[data-ceo-detail=expenses]').first().click();assert.match(await page.locator('#ceoDetailBody').textContent(),/ไม่ได้หมายความว่าค่าใช้จ่ายเป็นศูนย์/);await page.keyboard.press('Escape');
  control.delay=true;await page.locator('#ceoMonth').selectOption('2026-07');await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=parts]').click();await page.getByText('กำลังอ่านหลักฐานค่าใช้จ่าย…').waitFor();await page.keyboard.press('Escape');await page.locator('#logout').click();await page.locator('#loginScreen').waitFor();control.release();await page.waitForTimeout(200);
  assert.equal(await page.locator('#view').textContent(),'');assert.equal(await page.locator('#ceoDetailBody').textContent(),'');assert.equal(control.writes,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',synthetic:true,viewports:8,reasonDrilldown:true,monthlyStates:3,rowsBeyond1000:true,unknownCompanyWithheld:true,sourceLinks:true,filters:true,actionDraft:true,retry:true,failedRefreshRetainsEvidence:true,logoutRace:true,productionWrites:0,consoleErrors:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
