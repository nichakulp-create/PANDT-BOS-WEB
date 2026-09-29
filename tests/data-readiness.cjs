'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),now=Date.parse('2026-09-28T10:00:00Z');
class Clock extends Date {static now(){return now;}}
const state={reads:{},cards:[],history:[],revenue:[],expenses:[],balances:[],domains:[]};
const ctx={state,Date:Clock,ceoScope:{company:'DEMO',month:'2026-09'},ceoRows:()=>[],ceoReady:c=>c.production_accepted===true,ageDays:v=>Math.floor((now-Date.parse(v))/86400000)};
vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('  function ceoSourceHealth('),html.indexOf('  function ceoReadinessView(')),ctx);
const health=key=>ctx.ceoSourceHealth().find(x=>x.key===key);
const card=(id,extra={})=>({card_id:id,company:'DEMO',month:'2026-09',source_read_at:'2026-09-28T09:00:00Z',production_accepted:false,...extra});
assert.equal(health('expenses').status,'ยังไม่ได้ตรวจ');
state.reads.expenses={status:'ok',checkedAt:'2026-09-28T10:00:00Z',successAt:'2026-09-28T10:00:00Z'};
assert.equal(health('expenses').status,'ยังไม่พบชุดข้อมูลของบริษัทนี้');
state.expenses=[card('expenses',{company:'OTHER'})];assert.equal(health('expenses').cards.length,0);
state.expenses.push(card('expenses',{month:'2026-08'}));assert.equal(health('expenses').status,'ไม่มีข้อมูลเดือนที่เลือก');
state.expenses.push(card('expenses'));assert.equal(health('expenses').status,'อ่านได้ · รอตรวจรับ');
state.expenses[2].production_accepted=true;assert.equal(health('expenses').tone,'good');
state.expenses[2].source_read_at='2026-09-20T00:00:00Z';assert.equal(health('expenses').status,'ต้นทางเกิน 3 วัน');
for(const date of [null,'invalid','2026-09-29T00:00:00Z']){state.expenses[2].source_read_at=date;assert.equal(health('expenses').oldest,null);assert.equal(health('expenses').tone,'warn');}
state.reads.expenses.status='error';assert.equal(health('expenses').status,'อ่านไม่สำเร็จ');assert.equal(health('expenses').cards.length,1,'retained data must remain visible');
state.reads.expenses.status='retained';assert.equal(health('expenses').status,'เก็บรอบก่อน · ชุดหลักอ่านไม่ครบ');
state.reads.revenue={status:'ok',successAt:'2026-09-28T10:00:00Z'};state.revenue=[card('finSales')];assert.equal(health('revenue').status,'พบชุดข้อมูลไม่ครบ');assert.equal(health('revenue').missing.length,4);
assert.equal(health('balances').missing.length,7,'missing stages are explicit even with no imported balance');
// Legacy WIP must never be used to find a raw generation from imported balances.
ctx.ceoRows=()=>[{balance_snapshot_id:'demo-balance',generation:'not-legacy',month:'2026-09',company:'DEMO'}];
vm.runInContext(html.slice(html.indexOf('  function evidenceKey('),html.indexOf('  function ceoEvidence(')),ctx);assert.equal(ctx.evidenceKey(),null);
console.log('PASS: data readiness distinguishes absent, failed, retained, missing period, incomplete, stale and uncertified sources without company/month leakage');
