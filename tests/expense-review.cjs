'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ctx={};vm.createContext(ctx);
for(const [start,end] of [['expenseVersionDelta','expenseVersionHistory'],['expenseReviewSignals','expenseReviewPanel'],['expenseMatch','expenseGroupTable']])vm.runInContext(html.slice(html.indexOf('  function '+start+'('),html.indexOf('  function '+end+'(')),ctx);
const card={company:'P&T',month:'2026-07',basis:'DEMO',value_status:'REGISTER_VALUE',summary:{rows:3,reviewRows:0,knownSubtotalMinor:10000,scope:{unassignedPeriodRows:0}}};
assert.equal(ctx.expenseVersionDelta(card,{...card,summary:{...card.summary,knownSubtotalMinor:9000}}),1000);
assert.equal(ctx.expenseVersionDelta(card,card),0);
for(const patch of [{company:'OTHER'},{month:'2026-08'},{basis:'OTHER'},{value_status:'PARTIAL_UNBOUNDED'},...[
 {rows:0},{reviewRows:1},{knownSubtotalMinor:null},{knownSubtotalMinor:undefined},{knownSubtotalMinor:NaN},{scope:{unassignedPeriodRows:1}}
].map(x=>({summary:{...card.summary,...x}}))])assert.equal(ctx.expenseVersionDelta(card,{...card,...patch}),null);
assert.equal(ctx.expenseVersionDelta(card,null),null);
assert.equal(ctx.expenseVersionDelta({...card,summary:{...card.summary,knownSubtotalMinor:Number.MAX_SAFE_INTEGER}},{...card,summary:{...card.summary,knownSubtotalMinor:-10000}}),null);
const row=(id,extra={})=>({id,company:'P&T',month:'2026-07',mainType:'DEMO type',category:'DEMO category',item:'DEMO item',rawValueMinor:100,status:'INCLUDED',...extra});
const rows=[row('a'),row('b'),row('negative',{rawValueMinor:-101}),row('zero1',{rawValueMinor:0}),row('zero2',{rawValueMinor:0}),row('unknown1',{rawValueMinor:null}),row('unknown2',{rawValueMinor:null}),row('other',{company:'OTHER'}),row('other-month',{month:'2026-08'}),row('review',{company:'',rawValueMinor:-200,status:'REVIEW'}),row('blank',{item:''}),row('different-category',{category:'other'}),row('different-company',{company:''})],before=JSON.stringify(rows);
const result=ctx.expenseReviewSignals(card,rows);
assert.deepEqual(Array.from(result.negative,r=>r.id),['negative','review']);
assert.deepEqual(Array.from(result.repeated,g=>Array.from(g,r=>r.id)),[['a','b'],['zero1','zero2']]);
assert.equal(JSON.stringify(rows),before,'review signals never edit, discard or deduplicate source records');
assert.equal(ctx.expenseMatch(rows[0],{rowIds:['b']}),false);
assert.equal(ctx.expenseMatch(rows[0],{rowIds:[]}),false);
assert.equal(ctx.expenseMatch(rows[0],{rowIds:['a'],query:'missing'}),false);
assert.equal(ctx.expenseMatch(rows[0],{rowIds:['a'],query:'DEMO'}),true);
console.log('PASS: version deltas gate company/month/basis/completeness; review signals preserve signs, zero, unknowns, duplicates and scope');
