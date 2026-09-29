// Synthetic browser checks only. All API requests are intercepted; no production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs'),{buildExpenseSnapshots}=require('../lib/expense-model.cjs');
const output=process.env.BOS_SCREENSHOTS||'/tmp/bos-expense-verification';fs.mkdirSync(output,{recursive:true});
const source={spreadsheetId:'DEMO-SYNTHETIC',tab:'DEMO expenses',gid:123,readAt:'2026-09-28T08:00:00Z',values:[['เดือน','ต้นทุน','รายการต้นทุน','จำนวนเงิน','ประเภทต้นทุนหลัก','เดือน (ตัวเลข)','ปี','บริษัท']]};
for(let month=1;month<=8;month++)for(let i=0;i<(month===3?1101:60);i++)source.values.push([['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'][month-1],i%2?'DEMO Tooling':'DEMO operation',i===2?'<img src=x onerror="window.expenseXss=1">':'DEMO Tool '+(i===7?5:i),i===4&&month===7?null:i===3?-1.005:month*100+(i===7?5:i),i%2?'ทางตรง':'ทางอ้อม',month,2026,month>=7?'':'P&T']);
const snapshots=buildExpenseSnapshots(source,Array.from({length:9},(_,i)=>'2026-0'+(i+1)),'2026-09-28');
const cards=snapshots.map(({rows,...c})=>({...c,expense_snapshot_id:'DEMO-'+c.month}));
(async()=>{
 const legacy=fixtures();legacy.current.concat(legacy.history).forEach(c=>{if(c.company==='DEMO')c.company='P&T';});
 const control={reads:0,historyReads:0,staleHistory:false,longHistory:false,failHistory:false,badHistoryScope:false,delayHistory:false,releaseHistory:null,failRows:false,failCards:false,delay:false,release:null,writes:0};
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
    if(u.searchParams.get('select')!=='rows'){
     control.historyReads++;assert.equal(u.searchParams.get('company'),'eq.P&T');assert.equal(u.searchParams.get('card_id'),'eq.expenses');assert.equal(u.searchParams.get('limit'),'11');assert.equal(u.searchParams.get('order'),'source_read_at.desc,imported_at.desc,id.desc');assert.ok(!u.searchParams.get('select').split(',').includes('rows'));
     if(control.delayHistory)await new Promise(r=>{control.releaseHistory=r;});if(control.failHistory)return reply({message:'DEMO history failed'},500);
     const current=cards.find(c=>c.month===u.searchParams.get('month')?.slice(3));assert.ok(current);
     const version={...current,id:current.expense_snapshot_id,imported_at:'2026-09-28T08:01:00Z'},previous={...version,id:'DEMO-old-'+current.month,source_read_at:'2026-09-27T08:00:00Z',imported_at:'2026-09-27T08:01:00Z',value_status:'PARTIAL_UNBOUNDED',summary:{...current.summary,reviewRows:current.summary.rows?1:0,valuedRows:Math.max(0,current.summary.rows-1)}};
     if(control.badHistoryScope)previous.company='OTHER';if(control.staleHistory)version.id='DEMO-newer';return reply(control.longHistory?[version,...Array.from({length:10},(_,i)=>({...previous,id:previous.id+'-'+i}))]:[version,previous]);
    }
    control.reads++;if(control.delay)await new Promise(r=>{control.release=r;});if(control.failRows)return reply({message:'DEMO failed'},500);
    const snapshotId=(u.searchParams.get('id')||'').replace('eq.',''),month=cards.find(c=>c.expense_snapshot_id===snapshotId)?.month;return reply([{rows:snapshots.find(c=>c.month===month).rows}]);
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
  await page.locator('.expense-history').waitFor();assert.equal(control.historyReads,1);assert.equal(control.reads,0);assert.equal(await page.locator('.expense-history tbody tr').count(),2);assert.match(await page.locator('#ceoDetailBody').textContent(),/ความครบหรือฐานตัวเลขเทียบกันไม่ได้/);assert.match(await page.locator('.expense-history').textContent(),/ใช้อยู่ในหน้า/);
  await page.locator('[data-detail-tab=parts]').click();await page.locator('#expenseFilter').waitFor();assert.equal(control.reads,1);assert.equal(await page.locator('.revenue-table tbody tr').count(),50);assert.match(await page.locator('.revenue-pager').textContent(),/23/);
  assert.equal(await page.evaluate(()=>window.expenseXss),undefined);assert.ok((await page.locator('.revenue-table a').evaluateAll(els=>els.map(e=>e.href))).every(x=>x.startsWith('https://docs.google.com/spreadsheets/d/DEMO-SYNTHETIC/edit#gid=123&range=A')));
  await page.locator('[data-detail-tab=insight]').click();assert.match(await page.locator('#ceoDetailBody').textContent(),/ยอดติดลบ 1 รายการ/);assert.match(await page.locator('#ceoDetailBody').textContent(),/ยอดตรงกัน 1 กลุ่ม/);assert.equal(control.reads,1);
  await page.locator('[data-expense-signal=repeated]').click();assert.match(await page.locator('.expense-results').textContent(),/2 \/ 1101/);assert.match(await page.locator('#ceoDetailBody').textContent(),/ยังไม่ยืนยันว่าซ้ำ/);
  await page.locator('[data-ceo-action=expenses]').click();assert.match(await page.locator('#actionForm [name=description]').inputValue(),/รายการคล้ายกัน.*ยังไม่ยืนยันว่าซ้ำ/);assert.match(await page.locator('#actionForm [name=description]').inputValue(),/พบ 2 รายการ/);await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=insight]').click();await page.locator('[data-expense-signal=negative]').click();assert.match(await page.locator('.expense-results').textContent(),/1 \/ 1101/);assert.match(await page.locator('.revenue-table tbody').textContent(),/-1.01/);
  await page.locator('[data-expense-reset]').click();
  await page.locator('#expenseFilter [name=query]').fill('DEMO Tool 1100');await page.locator('#expenseFilter [type=submit]').click();assert.match(await page.locator('.expense-results').textContent(),/1 \/ 1101/);assert.match(await page.locator('.revenue-table tbody').textContent(),/1,400/);
  await page.locator('[data-expense-reset]').click();await page.locator('#expenseFilter [name=mainType]').selectOption('ทางตรง');assert.match(await page.locator('.expense-results').textContent(),/550 \/ 1101/);
  await page.locator('[data-expense-page="1"]').click();assert.match(await page.locator('.revenue-pager').textContent(),/หน้า 2/);
  await page.locator('[data-ceo-action=expenses]').click();assert.match(await page.locator('#actionForm [name=description]').inputValue(),/Snapshot DEMO-2026-03/);assert.match(await page.locator('#actionForm [name=description]').inputValue(),/550 รายการ/);assert.equal(control.writes,0);await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('[data-expense-item]').first().click();await page.locator('#expenseFilter').waitFor();assert.match(await page.locator('.expense-results').textContent(),/2 \/ 1101/);await page.keyboard.press('Escape');
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
  const approval={id:'DEMO-CONFIRMED',company:'P&T',month:'2026-08',confirmedAt:'2026-09-29T07:59:16Z',statement:'DEMO confirmation',sourceContentHash:require('node:crypto').createHash('sha256').update(JSON.stringify(source.values)).digest('hex'),sourceRows:source.values.flatMap((r,i)=>r[5]===8?[i+1]:[])};
  const [confirmed]=buildExpenseSnapshots({...source,companyConfirmations:[approval]},['2026-08'],'2026-09-29');
  snapshots[7]=confirmed;const {rows:confirmedRows,...confirmedCard}=confirmed;cards[7]={...confirmedCard,expense_snapshot_id:'DEMO-approved-2026-08'};
  await page.locator('#ceoRefresh').click();await page.locator('#ceoMonth').selectOption('2026-08');
  assert.match(await page.locator('.ctrl-cost-chart [data-expense-month="2026-08"]').getAttribute('aria-label'),/ผ่านกฎคำนวณ/);
  await page.locator('[data-ceo-detail=expenses]').first().click();assert.match(await page.locator('#ceoDetailBody').textContent(),/ผู้ใช้ยืนยันให้ 60 รายการเป็นของ P&T/);
  assert.match(await page.locator('.revenue-stats > div').first().textContent(),/60 \/ 60/);
  await page.locator('[data-detail-tab=parts]').click();await page.locator('#expenseFilter').waitFor();
  assert.ok((await page.locator('.revenue-table tbody tr td:nth-child(2)').allTextContents()).every(x=>/P&T.*ผู้ใช้ยืนยัน/.test(x)));
  assert.equal(await page.locator('[data-expense-issue=COMPANY_MISSING]').count(),0);
  for(const [w,h] of [[1366,768],[390,844]]){await page.setViewportSize({width:w,height:h});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);await page.screenshot({path:output+'/expense-confirmed-'+w+'-demo.png'});}
  await page.keyboard.press('Escape');await page.setViewportSize({width:1366,height:768});
  // A newer import is distinguished from the displayed card, and the visible history is bounded.
  control.staleHistory=true;control.longHistory=true;await page.locator('#ceoRefresh').click();await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=trend]').click();await page.locator('.expense-history').waitFor();assert.match(await page.locator('#ceoDetailBody').textContent(),/พบรอบนำเข้าที่ใหม่กว่า/);assert.match(await page.locator('#ceoDetailBody').textContent(),/ยังมีรอบเก่ากว่า/);assert.equal(await page.locator('.expense-history tbody tr').count(),10);
  control.staleHistory=false;control.longHistory=false;await page.locator('#ceoDetailBody [data-readiness-refresh]').click();await page.waitForFunction(()=>document.querySelectorAll('.expense-history tbody tr').length===2);assert.equal(await page.locator('.expense-history tbody tr').count(),2);assert.doesNotMatch(await page.locator('#ceoDetailBody').textContent(),/พบรอบนำเข้าที่ใหม่กว่า/);await page.keyboard.press('Escape');
  // History errors and invalid company scope fail closed; retries restore the scoped versions.
  control.failHistory=true;await page.locator('#ceoRefresh').click();await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=trend]').click();await page.locator('#expenseHistoryRetry').waitFor();assert.equal(await page.locator('.expense-history').count(),0);
  control.failHistory=false;control.badHistoryScope=true;await page.locator('#expenseHistoryRetry').click();await page.locator('#expenseHistoryRetry').waitFor();assert.equal(await page.locator('.expense-history').count(),0);
  control.badHistoryScope=false;await page.locator('#expenseHistoryRetry').click();await page.locator('.expense-history').waitFor();
  for(const [w,h] of [[1366,768],[390,844]]){await page.setViewportSize({width:w,height:h});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);await page.locator('.expense-history').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/expense-history-'+w+'-demo.png'});}
  await page.locator('[data-detail-tab=insight]').click();await page.locator('[data-expense-signal=negative]').waitFor();
  for(const [w,h] of [[1366,768],[390,844]]){await page.setViewportSize({width:w,height:h});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);await page.locator('[data-expense-signal=negative]').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/expense-review-'+w+'-demo.png'});}
  await page.keyboard.press('Escape');await page.setViewportSize({width:1366,height:768});
  control.delayHistory=true;await page.locator('#ceoMonth').selectOption('2026-07');await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=trend]').click();await page.getByText('กำลังอ่านประวัติการอัปเดต…').waitFor();await page.keyboard.press('Escape');
  control.delay=true;await page.locator('#ceoMonth').selectOption('2026-07');await page.locator('[data-ceo-detail=expenses]').first().click();await page.locator('[data-detail-tab=parts]').click();await page.getByText('กำลังอ่านหลักฐานค่าใช้จ่าย…').waitFor();await page.keyboard.press('Escape');await page.locator('#logout').click();await page.locator('#loginScreen').waitFor();control.release();control.releaseHistory();await page.waitForTimeout(200);
  assert.equal(await page.locator('#view').textContent(),'');assert.equal(await page.locator('#ceoDetailBody').textContent(),'');assert.equal(control.writes,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',synthetic:true,viewports:8,versionHistory:true,historyScopeAndRetry:true,reviewSignals:true,reasonDrilldown:true,monthlyStates:3,rowsBeyond1000:true,unknownCompanyWithheld:true,sourceLinks:true,filters:true,actionDraft:true,retry:true,failedRefreshRetainsEvidence:true,logoutRace:true,productionWrites:0,consoleErrors:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
