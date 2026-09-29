// All backend responses and sessions are synthetic. No live business data or network writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{fixtures,session}=require('./ceo-browser.cjs');
const output=process.env.BOS_SCREENSHOTS||'/tmp/bos-revenue-verification';fs.mkdirSync(output,{recursive:true});
const src={spreadsheetId:'DEMO-SYNTHETIC',tab:'Folow',row:2,readAt:'2026-09-28T08:00:00Z'};
function demoRows(n,id){return Array.from({length:n},(_,i)=>({id:id+i,customer:i===2?'<img src=x onerror="window.revenueXss=1">':i%2?'DEMO Alpha':'DEMO Beta',part:id==='finSales'?'':'PART-'+i,document:'DEMO-PO-'+i,job:'',date:'2026-09-01',dueDate:id==='orders'?'2026-09-10':null,qty:10,price:id==='finSales'?null:100,valueMinor:i<5?null:100000,rawValueMinor:i<5?null:100000,status:i<5?'REVIEW':'INCLUDED',issues:i<5?['PRICE_MISSING']:[],warnings:[],deliveryStatus:id==='orders'?'OVERDUE':null,source:{...src,row:i+2},priceSource:null}));}
function newCard(id,n=1001){const rows=demoRows(n,id),sum=rows.reduce((s,r)=>s+(r.valueMinor||0),0);return {card:{revenue_snapshot_id:'demo-'+id,generation:'demo-'+id,company:'DEMO',month:'2026-09',card_id:id,title:'DEMO '+id,source_code:id==='finSales'?'FOLOW':id==='issue'?'SC':'SO',kind:'MONEY',basis:'DEMO synthetic evidence only',value_numeric:sum/100,value_status:'PARTIAL_UNBOUNDED',decision_use:'REVIEW',production_accepted:false,freshness_status:'CURRENT',data_as_of:'2026-09-28',source_read_at:src.readAt,operational_unknown_rows:5,valuation_unknown_rows:5,summary:{rows:n,valuedRows:n-5,reviewRows:5,unknownAmountRows:5,knownSubtotalMinor:sum,reviewKnownMinor:null,issues:{PRICE_MISSING:5},scope:{scopeRule:'DEMO · ข้อมูลจำลองเพื่อทดสอบ',partBreakdownAvailable:id!=='finSales',unassignedDateRows:id==='orderRegister'?12:0,overdueRows:n,openRows:0,unknownDueRows:0,urgentOrders:rows.slice(0,3)},sources:[src]}},rows};}
(async()=>{
 const legacy=fixtures(),items=['finSales','forecast','orderRegister','orders','issue'].map(id=>newCard(id,id==='orders'?80:1001));
 const cards=items.map(x=>x.card),byId=new Map(items.map(x=>[x.card.revenue_snapshot_id,x.rows]));
 const orderItem=items.find(x=>x.card.card_id==='orders');
 ['2026-07-01',null,'2026-09-30','2026-09-28'].forEach((date,i)=>{orderItem.rows[i].dueDate=date;orderItem.rows[i].deliveryStatus=i===0?'OVERDUE':date?'OPEN':'UNKNOWN_DUE';});
 Object.assign(orderItem.card.summary.scope,{overdueRows:77,openRows:2,unknownDueRows:1,urgentOrders:orderItem.rows.filter(r=>r.deliveryStatus==='OVERDUE').slice(0,3)});
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
   if(table==='bos_access')return reply([{user_id:'fixture-user',email:'demo@example.invalid',role:'OWNER',active:true}]);
   if(table==='bos_management_kpis')return reply([{current_month:'2026-09',open_actions:0}]);
   if(table==='bos_current_snapshot_cards')return reply(legacy.current);
   if(table==='bos_snapshot_card_history')return reply(legacy.history);
   if(table==='bos_revenue_cards')return control.failCards?reply({message:'fixture error'},500):reply(cards.concat([{...cards[0],company:'OTHER',value_numeric:888888888}]));
   if(table==='bos_snapshot_months')return reply([{payload:legacy.payload}]);
   if(table==='bos_revenue_snapshots'){
    control.reads++;if(control.delay)await new Promise(r=>{control.release=r;});
    if(control.failRows)return reply({message:'fixture error'},500);
    return reply([{rows:byId.get((u.searchParams.get('id')||'').replace('eq.',''))}]);
   }
   return reply([]);
  });
  await page.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.ctrl-kpi').first().waitFor();
  assert.match(await page.locator('.ctrl-kpi[data-ceo-detail=finSales] strong').textContent(),/996/);assert.equal(await page.locator('.ctrl-kpi').count(),8);
  assert.match(await page.locator('.ctrl-kpi[data-ceo-detail=orders] strong').textContent(),/75/);assert.match(await page.locator('.ctrl-kpi[data-ceo-detail=workingCapital] strong').textContent(),/—/);
  assert.ok(!(await page.locator('#view').textContent()).includes('888.88'));
  for(const [w,h] of [[1366,768],[1920,1080],[1366,600],[768,1024],[390,844],[844,390]]){
   await page.setViewportSize({width:w,height:h});
   const d=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,panels:[...document.querySelectorAll('.ctrl-panel')].filter(e=>e.getBoundingClientRect().height).map(e=>({h:e.clientHeight,sh:e.scrollHeight}))}));
   assert.equal(d.sw,w);assert.equal(d.sh,h);d.panels.forEach(p=>assert.ok(p.sh<=p.h+1,JSON.stringify({w,h,p})));
  }
  await page.setViewportSize({width:1366,height:768});await page.screenshot({path:output+'/revenue-dashboard-demo.png'});
  const ringBounds=await page.evaluate(()=>({ring:document.querySelector('.ctrl-orders .ctrl-ring').getBoundingClientRect().top,heading:document.querySelector('.ctrl-orders header').getBoundingClientRect().bottom}));assert.ok(ringBounds.ring>=ringBounds.heading,'ring overlaps heading');
  await page.locator('.ctrl-kpi[data-ceo-detail=finSales]').click();assert.match(await page.locator('#ceoDetailBody').textContent(),/ไม่มี Part/);
  await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('#revenueFilter').waitFor();assert.equal(control.reads,1);assert.equal(await page.locator('.revenue-table tbody tr').count(),50);
  assert.match(await page.locator('.revenue-pager').textContent(),/21/);assert.equal(await page.evaluate(()=>window.revenueXss),undefined);
  const links=await page.locator('.revenue-table a').evaluateAll(els=>els.map(e=>e.href));assert.ok(links.every(x=>x.startsWith('https://docs.google.com/spreadsheets/d/DEMO-SYNTHETIC/edit#gid=1640527049&range=')));
  await page.locator('#revenueFilter [name=customer]').selectOption('DEMO Alpha');await page.locator('#revenueFilter button').click();assert.match(await page.locator('.revenue-pager').textContent(),/10/);
  assert.ok((await page.locator('.revenue-table tbody tr').allTextContents()).every(x=>x.includes('DEMO Alpha')));
  await page.locator('#revenueFilter [name=customer]').selectOption('');await page.locator('#revenueFilter [name=status]').selectOption('REVIEW');await page.locator('#revenueFilter button').click();assert.equal(await page.locator('.revenue-table tbody tr').count(),5);
  await page.locator('#revenueFilter [name=status]').selectOption('');await page.locator('#revenueFilter [name=query]').fill('DEMO-PO-1000');await page.locator('#revenueFilter button').click();assert.equal(await page.locator('.revenue-table tbody tr').count(),1);assert.match(await page.locator('.revenue-table tbody').textContent(),/DEMO-PO-1000/);
  await page.locator('#revenueFilter [name=query]').fill('');await page.locator('#revenueFilter button').click();await page.locator('[data-revenue-page="1"]').click();assert.match(await page.locator('.revenue-pager').textContent(),/หน้า 2/);
  await page.screenshot({path:output+'/revenue-detail-demo.png'});await page.keyboard.press('Escape');
  // Current open orders must never appear as a historical month-end balance.
  await page.locator('#ceoMonth').selectOption('2026-08');assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail=orders] strong').textContent(),'—');await page.locator('#ceoMonth').selectOption('2026-09');
  await page.locator('.revenue-urgent button').first().click();await page.locator('#revenueFilter').waitFor();assert.equal(await page.locator('#revenueFilter [name=status]').inputValue(),'OVERDUE');assert.equal(await page.locator('#revenueFilter [name=query]').inputValue(),'DEMO-PO-0');await page.keyboard.press('Escape');
  // Priority opens the complete evidence queue, sorted by due date. All counts stay at the snapshot date.
  await page.locator('.ctrl-priorities [data-ceo-priority="orders-overdue"]').click();await page.locator('#revenueFilter').waitFor();
  assert.equal(await page.locator('#revenueFilter [name=status]').inputValue(),'OVERDUE');assert.equal(await page.locator('#revenueFilter [name=query]').inputValue(),'');
  assert.match(await page.locator('.revenue-results').textContent(),/77 \/ 80/);assert.match(await page.locator('.revenue-table tbody tr').first().textContent(),/DEMO-PO-0/);
  assert.match(await page.locator('[data-order-aging="LATER"]').getAttribute('class'),/ctrl-state-warn/,'future orders must not receive overdue risk color');
  assert.match(await page.locator('.revenue-table tbody tr').first().textContent(),/เกินกำหนด 89 วัน/);
  await page.locator('#revenueFilter [name=timing]').selectOption('DUE_SOON');assert.match(await page.locator('.revenue-results').textContent(),/2 \/ 80/);assert.equal(await page.locator('#revenueFilter [name=status]').inputValue(),'');
  await page.locator('[data-order-aging="LATE_31_PLUS"]').click();assert.match(await page.locator('.revenue-results').textContent(),/1 \/ 80/);
  assert.match(await page.locator('[data-order-aging="LATE_31_PLUS"]').textContent(),/— บาท/,'an unvalued overdue row is not zero');
  await page.locator('[data-ceo-action="orders"]').click();
  const draft=await page.locator('#actionForm [name=description]').inputValue();
  assert.match(draft,/Snapshot demo-orders/);assert.match(draft,/เกิน 30 วัน/);assert.match(draft,/พบ 1 รายการ/);assert.match(draft,/DEMO-PO-0/);assert.equal(control.writes,0);
  await page.locator('#actionDialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.locator('.ctrl-priorities [data-ceo-priority="orders-no-due"]').click();await page.locator('#revenueFilter').waitFor();
  assert.match(await page.locator('.revenue-results').textContent(),/1 \/ 80/);assert.match(await page.locator('.revenue-table tbody').textContent(),/DEMO-PO-1/);
  await page.locator('#revenueFilter [name=timing]').selectOption('DUE_SOON');assert.match(await page.locator('.revenue-results').textContent(),/2 \/ 80/,'select filters immediately');
  await page.locator('[data-revenue-reset]').click();assert.match(await page.locator('.revenue-results').textContent(),/80 \/ 80/);
  assert.equal(await page.locator('#revenueFilter [name=timing]').inputValue(),'');await page.keyboard.press('Escape');
  await page.locator('.ctrl-domains [data-ceo-detail="ai"]').click();assert.match(await page.locator('#ceoDetailBody').textContent(),/คิวติดตามตามหลักฐาน/);for(const label of ['ข้อเท็จจริง','ผลกระทบที่ทราบ','หลักฐาน / ความพร้อม','ตรวจอะไรต่อ','ข้อเสนอเพื่อบริหาร'])assert.ok((await page.locator('#ceoDetailBody').textContent()).includes(label));assert.equal(await page.locator('#ceoDetailBody [data-ceo-priority="orders-overdue"]').count(),1);await page.keyboard.press('Escape');
  await page.locator('.ctrl-domains [data-ceo-detail="confidence"]').click();
  assert.equal(await page.locator('.ceo-source-health tbody tr').count(),4);
  await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();
  assert.ok(await page.locator('.ceo-freshness tbody tr').count()>5);assert.match(await page.locator('.ceo-freshness').textContent(),/เวลาไทย/);await page.keyboard.press('Escape');
  // Evidence errors stay visible, retry succeeds, and only one read is cached.
  control.failRows=true;await page.locator('[data-ceo-detail=orderRegister]').first().click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('#revenueRetry').waitFor();control.failRows=false;await page.locator('#revenueRetry').click();await page.locator('#revenueFilter').waitFor();await page.keyboard.press('Escape');
  control.failCards=true;await page.locator('#ceoRefresh').click();await page.getByText(/โหลดข้อมูลรายได้ใหม่ไม่สำเร็จ/).waitFor();control.failCards=false;await page.locator('#ceoRefresh').click();await page.locator('.revenue-urgent button').first().waitFor();
  // Responsive detail stays inside the drawer; horizontal scrolling is table-local.
  await page.setViewportSize({width:390,height:844});await page.locator('.ctrl-kpi[data-ceo-detail=finSales]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('#revenueFilter').waitFor();
  assert.equal(Math.round((await page.locator('#ceoDetail').boundingBox()).width),390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:output+'/revenue-mobile-demo.png'});await page.keyboard.press('Escape');
  await page.locator('.ctrl-kpi[data-ceo-detail=orders]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.locator('.order-aging').waitFor();
  assert.equal(await page.locator('.order-aging button').count(),6);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.ok(await page.locator('.order-aging button').evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)));
  await page.screenshot({path:output+'/order-aging-mobile-demo.png'});await page.keyboard.press('Escape');
  await page.setViewportSize({width:1366,height:768});await page.locator('.ctrl-priorities [data-ceo-priority="orders-overdue"]').click();await page.locator('.order-aging').waitFor();
  await page.screenshot({path:output+'/order-aging-desktop-demo.png'});await page.keyboard.press('Escape');
  // A pending response after logout cannot repaint sensitive detail or reuse its cache.
  await page.setViewportSize({width:1366,height:768});control.delay=true;await page.locator('.ctrl-kpi[data-ceo-detail=forecast]').click();await page.locator('.ceo-detail-tabs [data-detail-tab=parts]').click();await page.getByText('กำลังอ่านรายการจากชุดข้อมูล…').waitFor();
  await page.keyboard.press('Escape');await page.locator('#logout').click();await page.locator('#loginScreen').waitFor();control.release();await page.waitForTimeout(200);
  assert.equal(await page.locator('#ceoDetailBody').textContent(),'');assert.equal(await page.locator('#view').textContent(),'');assert.equal(control.writes,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',synthetic:true,rowsBeyond1000:true,scopedOverlay:true,filters:true,pagination:true,evidenceLinks:true,escape:true,errorRetry:true,staleTimestampPreserved:true,logoutRace:true,priorityQueue:true,agingBuckets:true,instantSelects:true,scopedActionDraft:true,freshnessTable:true,viewports:6,productionWrites:0,consoleErrors:errors.length},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
