'use strict';
const assert=require('node:assert/strict');
const {buildBalanceSnapshots,numeric}=require('../lib/balance-model.cjs');
function fixture(){
 const source=(tab,values)=>({sourceId:'DEMO-SYNTHETIC',gid:123,tab,range:'A1:Z2000',readAt:'2026-09-28T08:00:00Z',values});
 return {company:'P&T',asOf:'2026-09-28',sources:{
  material:source('Stock Material',[['ประเภทวัตถุดิบ','เกรดวัตถุดิบ','คงเหลือ','หน่วย','น้ำหนัก','หน่วย','ราคา','หน่วย'],['DEMO','bar',10,'เส้น',2,'กิโลกรัม',20,'กิโลกรัม'],['DEMO','piece',3,'ชิ้น',null,null,1.005,'ชิ้น'],['DEMO','zero',0,'เส้น',null,null,null,'กิโลกรัม']]),
  tooling:source('Stock Tooling',[['ประเภท Tooling','เกรด Tooling','คงเหลือ','หน่วย','Minimum Stock','ราคาต่อหน่วย'],['DEMO','tool',5,'ชิ้น',0,10]]),
  fg:source('Stock FG',[['Customer','Part name','Part no.','คงเหลือ','หน่วย','ราคาต่อชิ้น'],['DEMO Alias','DEMO part','P',3,'ชิ้น',999]]),
  qaFinal:source('Final Check QA',[['Customer','Part name','Part no.','คงเหลือ','หน่วย','จำนวนเศษ FG','หน่วย'],['DEMO','DEMO part','P',null,'ชิ้น',999,'ชิ้น']]),
  qaWip:source('WIP QA',[['Customer','Part name','Part no.','คงเหลือ','หน่วย','จำนวนเศษ FG','หน่วย'],['DEMO','DEMO part','P',2,'ชิ้น',999,'ชิ้น']]),
  prices:source('Sales Price',[['Customer','Part name','Part no.','ราคาต่อชิ้น'],['DEMO','DEMO part','P',1.005]]),
  customers:source('CUSTOMER_ALIAS',[['canonical_name','alias','status'],['DEMO','DEMO Alias','APPROVED']]),
  parts:source('PART_ALIAS',[['customer','source_part_no','master_part_no','status'],['DEMO','P-rev','P','APPROVED']]),
  fac2:source('Fac2_Transaction',[['Transaction ID','Timestamp','Department','Action','Job No.','DWG. No.','Customer','Part Name','From Process','To Process','Qty'],['DEMO-IN','2026-09-01','Fac2','รับเข้า','JOB1','P-rev','DEMO','DEMO part','CNC','WIP',0.3],['DEMO-OUT','2026-09-02','Fac2','เบิกจ่าย','JOB1','P-rev','DEMO','DEMO part','WIP','QA',0.1]]),
  wip:source('Plan production Data',[['Job no.','Qty.'],['DEMO JOB',999999]])
 }};
}
function verify(){
 for(const [value,expected] of [[null,null],['',null],['1,23',null],[true,null],['1,234.5',1234.5],[0,0],[-2,-2]])assert.equal(numeric(value),expected);
 const input=fixture(),byId=Object.fromEntries(buildBalanceSnapshots(input).map(x=>[x.card_id,x]));
 assert.equal(byId.material.summary.knownSubtotalMinor,40302);assert.equal(byId.material.rows[0].valueMinor,40000);assert.equal(byId.material.rows[0].materialFormula,'WEIGHT_PRICE');assert.equal(byId.material.rows[2].valueMinor,0);
 assert.equal(byId.fg.summary.knownSubtotalMinor,302,'SO authority and approved customer alias; ignore stock sales-price mirror');
 assert.equal(byId.qaFinal.value_numeric,null,'blank balance and FG scraps are not zero/QA balance');assert.equal(byId.qaWip.value_numeric,2.01);
 assert.equal(byId.fac2.rows[0].qty,0.2);assert.equal(byId.fac2.rows[0].valueMinor,20);assert.equal(byId.fac2.rows[0].movements.length,2);
 assert.equal(byId.wip.value_numeric,null);assert.equal(byId.wip.value_status,'NO_BALANCE_DATA');
 assert.ok(Object.values(byId).every(s=>s.production_accepted===false&&s.summary.scope.crossStageTotalAllowed===false));
 const run=(change,id)=>{const x=fixture();change(x.sources);return buildBalanceSnapshots(x).find(s=>s.card_id===id);};
 assert.equal(run(s=>s.material.values[1][4]=null,'material').rows[0].valueMinor,null,'missing weight is not zero');
 assert.equal(run(s=>s.material.values[1][4]=0,'material').rows[0].valueMinor,null,'zero weight on positive stock needs review');
 assert.equal(run(s=>s.material.values[1][7]='ชิ้น','material').rows[0].valueMinor,20000,'preserve stock-unit pricing contract for bars');
 assert.equal(run(s=>s.prices.values.push([...s.prices.values[1]]),'fg').value_numeric,null,'duplicate prices withheld');
 assert.equal(run(s=>s.fg.values.push(['DEMO','duplicate','P',3,'ชิ้น']),'fg').summary.valuedRows,0,'canonical duplicate balances withheld');
 assert.equal(run(s=>s.fac2.values.push([...s.fac2.values[1]]),'fac2').rows[0].qty,null,'duplicate movement blocks entire job');
 assert.equal(run(s=>s.fac2.values[2][10]=1,'fac2').value_numeric,null,'negative remaining stock withheld');
 assert.equal(run(s=>s.fac2.values[2][3]='unknown','fac2').rows[0].qty,null,'unknown action not silently omitted');
 assert.equal(run(s=>s.fac2.values[2][10]=null,'fac2').rows[0].qty,null,'missing movement is not zero');
 assert.equal(run(s=>s.fac2.values[2][1]='2026-10-01','fac2').rows[0].qty,null,'future movement invalidates current balance');
 assert.equal(run(s=>s.parts.values[1][3]='REVIEW','fac2').value_numeric,null,'unapproved alias not applied');
 assert.equal(run(s=>s.customers.values.push(['OTHER','DEMO Alias','APPROVED']),'fg').value_numeric,null,'conflicting alias is not guessed');
 assert.equal(run(s=>s.fg.values[1][4]='เส้น','fg').value_numeric,null,'sales price per piece cannot value bars');
 assert.throws(()=>run(s=>s.fg.readAt='2026-08-28T00:00:00Z','fg'),/SOURCE_DATE_MISMATCH/);
 assert.throws(()=>run(s=>s.qaFinal.values[0][3]='different','qaFinal'),/HEADER/);
 assert.throws(()=>buildBalanceSnapshots({...fixture(),company:'OTHER'}),/INVALID_SCOPE/);
 assert.throws(()=>buildBalanceSnapshots({...fixture(),asOf:'2026-02-30'}),/INVALID_SCOPE/);
 console.log('PASS: balance units/unknown/zero, exact money, source authority/aliases, duplicates, Fac2 movement integrity, no QA/FG total, no plan-as-WIP, current-date scope');
}
if(require.main===module)verify();module.exports={fixture};
