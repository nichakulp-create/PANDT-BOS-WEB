/* Local-only browser acceptance test. All data and sessions below are synthetic.
   No request is sent to the production Supabase project. No product test bypass.
   Run with Playwright on NODE_PATH; optional BOS_CHROMIUM_PATH and BOS_SCREENSHOTS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.BOS_SCREENSHOTS || '/tmp/bos-verification';
fs.mkdirSync(artifacts, { recursive: true });
const month = '2026-09';
const readAt = '2026-09-20T10:00:00Z';
const specs = [
  ['finSales','ยอดขายเดิม','FIN',1234567,'MONEY','REGISTER_VALUE','วันขาย / มูลค่าตาม FIN'],
  ['orders','ออเดอร์ค้างส่ง','SO',4200000,'MONEY','PARTIAL_UNBOUNDED','จำนวนค้างส่ง × ราคาขาย'],
  ['forecast','ยอดคาดการณ์','SO',5000000,'MONEY','REGISTER_VALUE','ความต้องการที่คาดการณ์'],
  ['orderRegister','ใบสั่งซื้อ','SO',3800000,'REFERENCE','PARTIAL_UNBOUNDED','มูลค่าใบสั่งซื้อเต็ม'],
  ['issue','จ่ายสินค้า FG','SC',3100000,'MONEY','REGISTER_VALUE','การจ่าย FG ไม่ใช่ Invoice'],
  ['material','วัตถุดิบ','SC',1200000,'MONEY','PARTIAL_UNBOUNDED','คงเหลือ × ราคาทุน'],
  ['wip','งาน Active','PC',2200000,'REFERENCE','REFERENCE_ONLY','มูลค่าเต็ม Job Active'],
  ['fac2','ผลิตขั้นที่ 2','FAC2',null,'REFERENCE','PARTIAL_UNBOUNDED','หลักฐานปฏิบัติงาน'],
  ['qaFinal','ตรวจคุณภาพ','QA',800000,'QA_FINAL','PARTIAL_UNBOUNDED','Final QA'],
  ['fg','สินค้าสำเร็จรูป','SC',1400000,'MONEY','PARTIAL_UNBOUNDED','คงเหลือ × ราคาขายอ้างอิง'],
  ['expenses','ค่าใช้จ่าย','EXP',null,'MONEY','NO_PERIOD_DATA','ค่าใช้จ่ายตามหมวด'],
  ['finCost','ต้นทุนตาม FIN','FIN',null,'MONEY','NO_PERIOD_DATA','ต้นทุนตาม FIN'],
  ['purchase','ค้างรับจัดซื้อ','PR',250000,'MONEY','PARTIAL_UNBOUNDED','ค้างรับตามหลักฐาน'],
  ['capacity','กำลังการผลิต','OEE',48,'CAPACITY','NON_MONETARY','Capacity ไม่ใช่ OEE'],
  ['oee','ประสิทธิภาพการผลิต','OEE',null,'OEE','NON_MONETARY','OEE'],
  ['ar','ลูกหนี้','FIN',2000000,'MONEY','PARTIAL_UNBOUNDED','ทะเบียนลูกหนี้'],
  ['ap','เจ้าหนี้','FIN',1000000,'MONEY','REGISTER_VALUE','ทะเบียนเจ้าหนี้']
];
function card(s,m=month){return {card_id:s[0],title:s[1],source_code:s[2],value_numeric:s[3],kind:s[4],value_status:s[5],basis:s[6],company:'DEMO',month:m,generation:'fixture-current',source_read_at:readAt,production_accepted:false,freshness_status:'CURRENT',data_as_of:m+'-20',operational_unknown_rows:2,valuation_unknown_rows:3,decision_use:'REVIEW'};}
function fixtures(){
  const current=specs.map(s=>card(s));
  const history=['2026-07','2026-08',month].flatMap(m=>specs.map(s=>{
    const c=card(s,m);if(m!==month&&c.card_id==='expenses'){c.value_numeric=m==='2026-07'?850000:900000;c.value_status='REGISTER_VALUE';}return c;
  }));
  // Poison rows must never contaminate the selected generation or company.
  history.push({...card(specs[1],'2026-08'),generation:'older',source_read_at:'2026-09-01T00:00:00Z',value_numeric:999999999});
  history.push({...card(specs[1]),company:'OTHER',value_numeric:888888888});
  const payload={cards:current.map(c=>({id:c.card_id,rows:20,valuationKnownRows:17,valuationUnknownRows:3,operationalUnknownRows:2,evidenceRowCoveragePct:85,moneyCoverage:{pct:null},freshness:{tableKeys:['fixture-orders']},unknownReasonBreakdown:[{reason:'ไม่มีราคา <script>window.fixtureXss=1</script>',count:3}]})),sourceCoverage:[{key:'fixture-orders',sheet:'DEMO orders',rows:20,status:'OK',readAt}]};
  return {current,history,payload};
}
const session={access_token:'fixture-only-not-a-real-token',refresh_token:'fixture-refresh',user:{id:'fixture-user'}};
module.exports={fixtures,session};
if(require.main===module)(async()=>{
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(root,'index.html')));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.BOS_CHROMIUM_PATH?{executablePath:process.env.BOS_CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}: {})});
  const results=[],contexts=[];
  async function makePage({authenticated=true,role='OWNER',denied=false}={}){
    const data=fixtures(),control={failEvidence:false,failReload:false,evidenceReads:0,writes:[],requests:[]};
    const context=await browser.newContext({viewport:{width:1366,height:768}});contexts.push(context);
    await context.route('https://*.supabase.co/**',async route=>{
      const req=route.request(),u=new URL(req.url());control.requests.push(u.pathname);
      const table=u.pathname.split('/').at(-1);
      const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(u.pathname.includes('/auth/'))return denied?respond({message:'Invalid login credentials'},400):respond(session);
      if(table==='bos_access')return respond(denied?[]:[{user_id:'fixture-user',email:'demo@example.invalid',role,active:true}]);
      if(req.method()!=='GET'){
        control.writes.push({table,body:req.postDataJSON()});return respond([{id:'fixture-write',...req.postDataJSON()}]);
      }
      if(control.failReload&&table==='bos_current_snapshot_cards')return respond({message:'Fixture read unavailable'},503);
      if(table==='bos_snapshot_months'){
        control.evidenceReads++;if(control.failEvidence)return respond({message:'Fixture evidence unavailable'},503);
        assert.equal(u.searchParams.get('company'),'eq.DEMO');assert.ok(u.searchParams.get('generation').startsWith('eq.fixture-'));
        return respond([{payload:data.payload}]);
      }
      return respond({bos_management_kpis:[{current_month:month,current_cards:data.current.length,data_issues:3,open_actions:0}],bos_current_snapshot_cards:data.current,bos_snapshot_card_history:data.history,bos_current_data_issues:[],bos_action_items:[],bos_decisions:[]}[table]||[]);
    });
    if(authenticated)await context.addInitScript(s=>sessionStorage.setItem('pandt_bos_management_session_v1',JSON.stringify(s)),session);
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url);if(authenticated&&!denied)await page.locator('.ctrl-kpi').first().waitFor();else await page.locator('#loginScreen').waitFor({state:'visible'});
    return {page,data,control,errors,context};
  }
  try{
    const {page,control,errors}=await makePage();
    for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[1280,720],[1366,600],[1024,768]]){
      await page.setViewportSize({width,height});
      await page.screenshot({path:path.join(artifacts,`dashboard-${width}x${height}.png`)});
      const dims=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,kpis:[...document.querySelectorAll('.ctrl-kpi')].map(e=>e.getBoundingClientRect().y),panels:[...document.querySelectorAll('.ctrl-panel')].map(e=>({name:e.className,scroll:e.scrollHeight,height:e.clientHeight,bottom:e.getBoundingClientRect().bottom}))}));
      assert.equal(dims.sw,width);assert.equal(dims.sh,height);assert.equal(new Set(dims.kpis).size,1);assert.equal(dims.kpis.length,8);assert.ok(await page.locator('.ctrl-kpi').evaluateAll(els=>els.every(e=>e.scrollHeight<=e.clientHeight+1)),'KPI content clipped '+JSON.stringify(await page.locator('.ctrl-kpi').evaluateAll(els=>els.map(e=>({id:e.dataset.ceoDetail,scroll:e.scrollHeight,height:e.clientHeight,children:[...e.children].map(c=>({cls:c.className.baseVal||c.className,h:c.getBoundingClientRect().height}))})))));assert.equal(dims.panels.length,6);
      const nested=await page.locator('.ctrl-priorities, .ctrl-confidence-main, .ctrl-cost-chart, .ctrl-orders-summary').evaluateAll(els=>els.map(e=>({name:e.className,height:e.clientHeight,scroll:e.scrollHeight})));
      nested.forEach(item=>assert.ok(item.scroll<=item.height+1,JSON.stringify({width,height,item})));
      for(const panel of dims.panels){assert.ok(panel.bottom<=height);assert.ok(panel.scroll<=panel.height+1,JSON.stringify({width,height,panel}));}
      await page.locator('.ctrl-kpi[data-ceo-detail="workingCapital"]').click();
      const box=await page.locator('#ceoDetail').boundingBox();const expectedWidth=width>=1280?width*.75:width;assert.ok(Math.abs(box.width-expectedWidth)<2);assert.ok(Math.abs(box.x-(width-expectedWidth))<2);
      await page.screenshot({path:path.join(artifacts,`drawer-${width}x${height}.png`)});
      await page.keyboard.press('Escape');results.push({viewport:`${width}x${height}`,bodyScroll:false,drawerWidth:box.width});
    }
    await page.setViewportSize({width:1366,height:768});
    assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail="finSales"] strong').textContent(),'—','FIN must not be presented as Folow');
    assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail="workingCapital"] strong').textContent(),'—','incompatible bases must not be summed');
    assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail="totalCost"] strong').textContent(),'—','expenses must not be relabeled total cost');
    assert.match(await page.locator('.ctrl-kpi[data-ceo-detail="orders"] strong').textContent(),/4\.2/,'known old snapshot remains visible');
    assert.match(await page.locator('.ctrl-kpi[data-ceo-detail="orders"]').textContent(),/Snapshot/);
    assert.ok(!(await page.locator('#view').textContent()).includes('999.99'));
    // Every primary interactive entry must open meaningful detail; reads are cached per scope.
    const ids=await page.locator('#view [data-ceo-detail]').evaluateAll(els=>[...new Set(els.map(e=>e.dataset.ceoDetail))]);
    for(const id of ids){await page.locator('#view [data-ceo-detail="'+id+'"]').first().click();assert.ok((await page.locator('#ceoDetailBody').textContent()).length>80);await page.keyboard.press('Escape');}
    assert.equal(control.evidenceReads,1,'detail fetch must be reused across cards');
    await page.locator('.ctrl-kpi[data-ceo-detail="orders"]').click();
    await page.locator('[data-detail-tab="parts"]').click();
    await page.locator('#ceoDetailBody').getByText('DEMO orders',{exact:true}).waitFor();
    assert.match(await page.locator('#ceoDetailBody').textContent(),/85/);assert.equal(await page.evaluate(()=>window.fixtureXss),undefined);
    await page.locator('[data-detail-tab="parts"]').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-detail-tab="trend"]').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');assert.equal(await page.locator('[data-detail-tab="summary"]').getAttribute('aria-selected'),'true');
    await page.keyboard.press('Escape');assert.equal(await page.locator('.ctrl-kpi[data-ceo-detail="orders"]').evaluate(e=>e===document.activeElement),true);
    await page.locator('#ceoMonth').selectOption('2026-08');
    assert.match(await page.locator('.ctrl-kpi[data-ceo-detail="orders"] strong').textContent(),/4\.2/,'latest generation only');
    await page.locator('.ctrl-kpi[data-ceo-detail="orders"]').click();await page.locator('[data-detail-tab="parts"]').click();await page.locator('#ceoDetailBody').getByText('DEMO orders',{exact:true}).waitFor();assert.equal(control.evidenceReads,2);
    await page.keyboard.press('Escape');await page.locator('#ceoMonth').selectOption(month);
    await page.locator('.ctrl-kpi[data-ceo-detail="orders"]').click();await page.locator('[data-ceo-action="orders"]').click();
    assert.equal(await page.locator('#actionForm [name=related_card_id]').inputValue(),'orders');assert.match(await page.locator('#actionForm [name=description]').inputValue(),/DEMO/);
    assert.equal(control.writes.length,0,'opening a draft must never write');
    await page.locator('#actionForm button[type=submit]').click();await page.locator('#actionDialog').waitFor({state:'hidden'});
    const action=control.writes.find(w=>w.table==='bos_action_items');assert.equal(action.body.related_card_id,'orders');assert.equal(action.body.source_code,'SO');
    await page.locator('.ctrl-kpi[data-ceo-detail="orders"]').click();await page.locator('[data-ceo-decision="orders"]').click();
    await page.locator('#decisionForm [name=decision_text]').fill('Synthetic review decision');await page.locator('#decisionForm button[type=submit]').click();await page.locator('#decisionDialog').waitFor({state:'hidden'});
    assert.equal(control.writes.find(w=>w.table==='bos_decisions').body.status,'DRAFT');
    assert.ok(control.writes.every(w=>['bos_action_items','bos_decisions','bos_audit_events'].includes(w.table)),'source data must remain read only');
    await page.waitForFunction(()=>!document.querySelector('#toast').textContent);
    // No scrolling in tablet overview or compact panels, including short laptop windows.
    for(const [width,height] of [[768,1024],[390,844],[390,667],[844,390],[820,780]]){
      await page.setViewportSize({width,height});
      const compact=await page.locator('.ctrl-panel-tabs').isVisible();
      if(compact){
        for(let i=0;i<6;i++){
          await page.locator('[data-ceo-panel="'+i+'"]').click();
          assert.equal(await page.locator('.ctrl-panel:visible').count(),1);
          const metrics=await page.locator('.ctrl-panel:visible').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,bottom:e.getBoundingClientRect().bottom}));
          assert.ok(metrics.scroll<=metrics.height+1,JSON.stringify({width,height,panel:i,metrics}));
          assert.ok(metrics.bottom<=height);
        }
        await page.locator('[data-ceo-panel="5"]').focus();await page.keyboard.press('Home');
        assert.equal(await page.locator('[data-ceo-panel="0"]').getAttribute('aria-selected'),'true');
      }else{assert.equal(await page.locator('.ctrl-panel:visible').count(),6);assert.ok(await page.locator('.ctrl-panel').evaluateAll(els=>els.every(e=>e.scrollHeight<=e.clientHeight+1)));}
      const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,kpis:[...document.querySelectorAll('.ctrl-kpi')].map(e=>({height:e.clientHeight,scroll:e.scrollHeight,bottom:e.getBoundingClientRect().bottom}))}));
      assert.equal(layout.width,width);assert.equal(layout.height,height);
      layout.kpis.forEach(k=>assert.ok(k.scroll<=k.height+1&&k.bottom<=height,JSON.stringify({width,height,k})));
      await page.evaluate(()=>window.scrollTo(9999,9999));
      assert.deepEqual(await page.evaluate(()=>[scrollX,scrollY]),[0,0]);
      await page.screenshot({path:path.join(artifacts,`dashboard-${width}x${height}.png`)});
      await page.locator('.ctrl-kpi[data-ceo-detail="workingCapital"]').click();assert.equal(Math.round((await page.locator('#ceoDetail').boundingBox()).width),width);
      assert.ok(await page.locator('#ceoDetailBody').evaluate(e=>e.scrollHeight>e.clientHeight));
      await page.screenshot({path:path.join(artifacts,`drawer-${width}x${height}.png`)});await page.keyboard.press('Escape');
      results.push({viewport:`${width}x${height}`,bodyScroll:false,layout:compact?'panel tabs':'six-panel overview',drawerWidth:width});
    }
    await page.setViewportSize({width:1366,height:768});
    await page.locator('#ceoFullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
    assert.equal(await page.locator('#ceoFullscreen').getAttribute('aria-pressed'),'true');
    await page.locator('#ceoFullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
    assert.equal(await page.locator('#ceoFullscreen').getAttribute('aria-pressed'),'false');
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:1366,height:768});await page.locator('#logout').click();
    await page.locator('#loginScreen').waitFor({state:'visible'});assert.equal(await page.locator('#view').textContent(),'');assert.equal(await page.evaluate(()=>sessionStorage.length),0);assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('ceo-dashboard')),false);
    const edge=await makePage();
    const order=edge.data.current.find(c=>c.card_id==='orders');order.value_numeric=0;
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="orders"] strong').textContent==='0');
    order.value_numeric='not-a-number';await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="orders"] strong').textContent==='—');
    const sale=edge.data.current.find(c=>c.card_id==='finSales');sale.source_code='NOTFOLOW';sale.basis='Folow mentioned in a note only';
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>!document.querySelector('#appScreen').classList.contains('loading'));
    assert.equal(await edge.page.locator('.ctrl-kpi[data-ceo-detail="finSales"] strong').textContent(),'—');
    sale.source_code='FOLOW';sale.value_numeric=1200000;sale.basis='Net Total before VAT';sale.production_accepted=true;
    const prior=edge.data.history.find(c=>c.card_id==='finSales'&&c.month==='2026-08');Object.assign(prior,{source_code:'FOLOW',basis:sale.basis,production_accepted:true,value_numeric:1000000});
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="finSales"] strong').textContent.includes('1.2'));
    assert.match(await edge.page.locator('.ctrl-kpi[data-ceo-detail="finSales"] .ctrl-kpi-foot').textContent(),/\+20%/);
    prior.data_as_of=sale.data_as_of;await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="finSales"] .ctrl-kpi-foot').textContent.includes('—'));
    // Evidence status must change after refresh without implying business performance.
    const now=new Date().toISOString();
    edge.data.current.forEach(c=>{c.source_read_at=now;c.data_as_of=now.slice(0,10);});
    Object.assign(sale,{operational_unknown_rows:0,valuation_unknown_rows:0});
    Object.assign(order,{value_numeric:4200000,source_read_at:readAt});
    const statusCard=id=>edge.page.locator('.ctrl-kpi[data-ceo-detail="'+id+'"]');
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="finSales"]').classList.contains('ctrl-state-good'));
    assert.match(await statusCard('finSales').getAttribute('aria-label'),/ข้อมูลพร้อม/);
    assert.match(await statusCard('orders').getAttribute('class'),/ctrl-state-risk/);
    assert.match(await statusCard('forecast').getAttribute('class'),/ctrl-state-warn/);
    assert.match(await statusCard('oee').getAttribute('class'),/ctrl-state-missing/);
    assert.equal(await edge.page.locator('.ctrl-legend .ctrl-status-chip').count(),4);
    await edge.page.screenshot({path:path.join(artifacts,'dashboard-status-colors.png')});
    await statusCard('finSales').click();
    assert.match(await edge.page.locator('.ctrl-detail-hero').getAttribute('class'),/ctrl-state-good/);
    await edge.page.screenshot({path:path.join(artifacts,'drawer-status-colors.png')});
    await edge.page.keyboard.press('Escape');
    sale.value_status='PARTIAL_UNBOUNDED';
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="finSales"]').classList.contains('ctrl-state-warn'));
    sale.value_status='BLOCKED';
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="finSales"]').classList.contains('ctrl-state-risk'));
    assert.equal(await statusCard('finSales').locator('strong').textContent(),'—');
    assert.match(await statusCard('finSales').textContent(),/ข้อมูลถูกระงับใช้/);
    sale.value_numeric=null;sale.value_status='NO_PERIOD_DATA';
    await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-kpi[data-ceo-detail="finSales"]').classList.contains('ctrl-state-missing'));
    results.push({statusColors:true,statusRefresh:true,drawerStatus:true,readinessNotPerformance:true});
    edge.data.current.length=0;edge.data.history.length=0;await edge.page.locator('#ceoRefresh').click();await edge.page.waitForFunction(()=>document.querySelector('.ctrl-scope').textContent.includes('ยังไม่มี Snapshot'));
    assert.ok(!(await edge.page.locator('#view').textContent()).match(/NaN|Infinity/));assert.deepEqual(edge.errors,[]);
    const reader=await makePage({role:'VIEWER'});await reader.page.locator('.ctrl-kpi').first().click();assert.equal(await reader.page.locator('[data-ceo-action]').count(),0);assert.equal(await reader.page.locator('[data-ceo-decision]').count(),0);
    const anonymous=await makePage({authenticated:false});assert.equal(anonymous.control.requests.length,0);await anonymous.page.locator('#email').fill('demo@example.invalid');await anonymous.page.locator('#password').fill('fixture-only-password');await anonymous.page.locator('#loginForm button[type=submit]').click();await anonymous.page.locator('.ctrl-kpi').first().waitFor();assert.deepEqual(anonymous.errors,[]);
    const denied=await makePage({denied:true});assert.equal(denied.control.requests.some(p=>p.includes('bos_current_snapshot_cards')),false);
    const failure=await makePage();failure.control.failEvidence=true;await failure.page.locator('.ctrl-kpi[data-ceo-detail="orders"]').click();await failure.page.locator('[data-detail-tab="parts"]').click();await failure.page.locator('#ceoRetryEvidence').waitFor();failure.control.failEvidence=false;await failure.page.locator('#ceoRetryEvidence').click();await failure.page.locator('#ceoDetailBody').getByText('DEMO orders',{exact:true}).waitFor();await failure.page.keyboard.press('Escape');
    failure.control.failReload=true;await failure.page.locator('#ceoRefresh').click();await failure.page.locator('.ctrl-error').waitFor();assert.match(await failure.page.locator('.ctrl-kpi[data-ceo-detail="orders"] strong').textContent(),/4\.2/);
    // Errors here are expected HTTP 503 console diagnostics from failure fixtures only.
    assert.ok(failure.errors.every(e=>/503/.test(e)),JSON.stringify(failure.errors));
    results.push({primaryEntries:ids.length,monthIsolation:true,evidenceCache:true,escapedEvidence:true,keyboard:true,followupWrites:'mock only',roleGates:true,anonymousNoReads:true,login:'mock only',errorRecovery:true,productionWrites:0,consoleErrors:0,missingZeroInvalid:true,salesSourceGate:true,comparableDelta:true,emptySnapshot:true,fullscreenToggle:true,compactPanels:true});
    fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
