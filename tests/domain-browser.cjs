'use strict';
// Full UI flow with synthetic data. No production authentication or business writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs'),{fixture}=require('./domain-fixtures.cjs'),{buildDomainSnapshots}=require('../lib/domain-model.cjs');
const {input,put}=fixture();
for(let i=0;i<1101;i++)put('production',{'วันที่ผลิต':'2026-09-10','เครื่องจักร':'DEMO-M','Job no.':'DEMO-J'+i,'Part no.':'DEMO-P','Customer':'DEMO-C','OK':i,'NG':i===3?null:0,'OP':i%2?'OP2':'OP1','PR Record ID':'DEMO-'+i,'PR Record Status':'ACTIVE','ชื่อพนักงาน':i===2?'<img src=x onerror="window.domainXss=1">':'DEMO'});
put('finSales',{'วันที่ขายสินค้า (กรอก)':'2026-09-01','มูลค่ารวม (ห้ามแก้ไข)':100,'ชื่อลูกค้า (เลือก)':'DEMO','วันที่ได้รับเงินจริง (กรอก)':'2026-09-10','สถานะ (ห้ามแก้ไข)':'รับเงินเรียบร้อย'});
const snapshots=buildDomainSnapshots(input),cards=snapshots.map(({rows,...s},i)=>({...s,domain_snapshot_id:'DEMO-DOMAIN-'+i}));
const output=process.env.BOS_SCREENSHOTS||'/tmp/bos-domain-verification';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const old=fixtures();old.current.concat(old.history).forEach(c=>{if(c.company==='DEMO')c.company='P&T';});
 const control={failCards:false,failRows:false,badScope:false,delay:false,release:null,reads:0,writes:0};
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOS_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),u=new URL(req.url()),table=u.pathname.split('/').at(-1),reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname.includes('/auth/'))return reply(session);if(req.method()!=='GET'){if(table!=='bos_audit_events')control.writes++;return reply([]);}
   if(table==='bos_access')return reply([{user_id:'fixture-user',role:'OWNER',active:true}]);
   if(table==='bos_management_kpis')return reply([{current_month:'2026-09',open_actions:0}]);
   if(table==='bos_current_snapshot_cards')return reply(old.current);if(table==='bos_snapshot_card_history')return reply(old.history);if(table==='bos_snapshot_months')return reply([{payload:old.payload}]);
   if(table==='bos_domain_cards')return control.failCards?reply({message:'DEMO fail'},500):reply(cards.concat([{...cards[0],company:'OTHER',value_numeric:999999999}]));
   if(table==='bos_domain_snapshots'){
    control.reads++;assert.equal(u.searchParams.get('company'),'eq.P&T');assert.equal(u.searchParams.get('month'),'eq.2026-09');assert.equal(u.searchParams.get('limit'),'1');
    if(control.delay)await new Promise(r=>{control.release=r;});if(control.failRows)return reply({message:'DEMO fail'},500);
    const index=cards.findIndex(c=>c.domain_snapshot_id===u.searchParams.get('id')?.slice(3)),s=snapshots[index];assert.ok(s);assert.equal(u.searchParams.get('card_id'),'eq.'+s.card_id);return reply([{...s,company:control.badScope?'OTHER':s.company}]);
   }return reply([]);
  });
  await page.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ctrl-kpis').waitFor();
  await page.locator('[data-ceo-detail=production]').first().click();await page.locator('#ceoDetailBody [data-ceo-detail=productionRegister]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('#domainFilter').waitFor();
  assert.equal(await page.locator('.domain-table tbody tr').count(),50);assert.match(await page.locator('.domain-results').textContent(),/1,101/);assert.equal(await page.evaluate(()=>window.domainXss),undefined);
  await page.locator('#domainFilter [name=query]').fill('DEMO-J1100');await page.locator('#domainFilter [type=submit]').click();assert.match(await page.locator('.domain-results').textContent(),/1 \/ 1,101/);assert.match(await page.locator('.domain-table').textContent(),/1,100/);
  await page.locator('[data-domain-reset]').click();await page.locator('[data-domain-page="1"]').click();assert.match(await page.locator('.revenue-pager').textContent(),/หน้า 2/);
  await page.locator('[data-detail-tab=insight]').click();await page.locator('[data-domain-issue=NG_UNKNOWN]').click();assert.match(await page.locator('.domain-results').textContent(),/1 \/ 1,101/);
  await page.locator('[data-ceo-action=productionRegister]').click();assert.match(await page.locator('#actionForm [name=description]').inputValue(),/DEMO-DOMAIN/);assert.match(await page.locator('#actionForm [name=description]').inputValue(),/NG_UNKNOWN/);await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('[data-ceo-detail=finance]').first().click();await page.locator('#ceoDetailBody [data-ceo-detail=cashCalendar]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('.domain-calendar').waitFor();assert.match(await page.locator('.domain-calendar').textContent(),/100/);await page.locator('[data-domain-date]').first().click();assert.equal(await page.locator('#domainFilter [name=date]').inputValue(),'2026-09-10');
  for(const [w,h] of [[1366,768],[1920,1080],[1280,720],[768,1024],[390,844],[844,390]]){await page.setViewportSize({width:w,height:h});assert.ok(Math.abs((await page.locator('#ceoDetail').boundingBox()).width-(w>=1280?w*.75:w))<1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),w);await page.screenshot({path:output+'/domain-cash-'+w+'-demo.png'});}
  await page.keyboard.press('Escape');await page.setViewportSize({width:1366,height:768});await page.screenshot({path:output+'/domain-dashboard-demo.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),768);
  // Every imported domain is reachable from confidence and renders all four tabs.
  for(const c of cards.filter(c=>c.month==='2026-09')){
   await page.locator('[data-ceo-detail=confidence]').first().click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('.ceo-freshness [data-ceo-detail="'+c.card_id+'"]').click();
   for(const tab of ['summary','insight','trend','parts']){await page.locator('[data-detail-tab='+tab+']').click();if(tab==='parts')await page.locator('#domainFilter').waitFor();assert.ok((await page.locator('#ceoDetailBody').textContent()).length>100);}
   await page.keyboard.press('Escape');
  }
  control.failCards=true;await page.locator('#ceoRefresh').click();await page.getByText(/โหลดข้อมูลส่วนงานไม่สำเร็จ/).waitFor();await page.locator('[data-ceo-detail=production]').first().click();await page.locator('#ceoDetailBody [data-ceo-detail=productionRegister]').click();assert.match(await page.locator('.revenue-stats').textContent(),/1,101/);await page.keyboard.press('Escape');
  control.failCards=false;control.badScope=true;await page.locator('#ceoRefresh').click();await page.locator('[data-ceo-detail=production]').first().click();await page.locator('#ceoDetailBody [data-ceo-detail=productionRegister]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('#domainRetry').waitFor();assert.equal(await page.locator('.domain-table').count(),0);control.badScope=false;await page.locator('#domainRetry').click();await page.locator('#domainFilter').waitFor();await page.keyboard.press('Escape');
  control.delay=true;await page.locator('#ceoRefresh').click();await page.locator('[data-ceo-detail=production]').first().click();await page.locator('#ceoDetailBody [data-ceo-detail=productionRegister]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.getByText('กำลังอ่านรายละเอียดส่วนงาน…').waitFor();await page.keyboard.press('Escape');await page.locator('#logout').click();control.release();await page.locator('#loginScreen').waitFor();await page.waitForTimeout(100);assert.equal(await page.locator('#view').textContent(),'');assert.equal(await page.locator('#ceoDetailBody').textContent(),'');assert.equal(control.writes,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',synthetic:true,domains:cards.filter(c=>c.month==='2026-09').length,tabs:4,viewports:6,over1000Rows:true,scopeAndHash:true,filters:true,cashCalendar:true,sourceLinks:true,actionDraft:true,retainedOnFailure:true,logoutRace:true,businessWrites:0,consoleErrors:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
