// Calendar boundaries and valuation exclusions are independent of the viewer's date/timezone.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const code=html.slice(html.indexOf('  function orderDay('),html.indexOf('  function orderAgingView('));
const context={};vm.createContext(context);vm.runInContext(code,context);
const {orderDay,orderTiming,revenueFilteredRows,orderAging}=context;
const card={card_id:'orders',data_as_of:'2026-09-28'};
assert.equal(orderDay('2026-02-29'),null);assert.equal(orderDay('2026-13-01'),null);assert.equal(orderDay(''),null);
assert.equal(orderTiming({dueDate:'2024-02-29'},{data_as_of:'2024-03-01'}).days,1);
assert.equal(orderTiming({dueDate:'2025-12-31'},{data_as_of:'2026-01-01'}).days,1);
for(const [due,bucket,days] of [['2026-09-27','LATE_1_7',1],['2026-09-21','LATE_1_7',7],['2026-09-20','LATE_8_30',8],['2026-08-29','LATE_8_30',30],['2026-08-28','LATE_31_PLUS',31],['2026-09-28','DUE_SOON',0],['2026-10-05','DUE_SOON',-7],['2026-10-06','LATER',-8],['','UNKNOWN_DUE',null]]){
 const result=orderTiming({dueDate:due},card);assert.equal(result.bucket,bucket,due);assert.equal(result.days,days,due);
}
assert.equal(orderTiming({dueDate:'2026-09-01'},{data_as_of:null}).bucket,'UNKNOWN_DUE');
const rows=[
 {id:'unknown',dueDate:null,customer:'B',status:'REVIEW',valueMinor:null},
 {id:'old',dueDate:'2026-08-28',customer:'A',document:'PO-10',status:'INCLUDED',valueMinor:10025},
 {id:'review',dueDate:'2026-08-28',customer:'A',document:'PO-11',status:'REVIEW',valueMinor:99999},
 {id:'due-today',dueDate:'2026-09-28',customer:'A',status:'INCLUDED',valueMinor:0},
 {id:'late',dueDate:'2026-09-25',customer:'B',document:'PO-12',status:'INCLUDED',valueMinor:1125}
];
const ids=f=>Array.from(revenueFilteredRows(card,rows,f),r=>r.id);
assert.deepEqual(ids({}),['old','review','late','due-today','unknown']);
assert.deepEqual(ids({status:'OVERDUE'}),['old','review','late']);
assert.deepEqual(ids({timing:'LATE_31_PLUS',status:'INCLUDED',customer:'A',query:'po-1'}),['old']);
assert.deepEqual(ids({timing:'UNKNOWN_DUE'}),['unknown']);
assert.deepEqual(ids({timing:'DUE_SOON'}),['due-today']);
assert.deepEqual(ids({sort:'source'}),rows.map(r=>r.id));
assert.equal(rows[0].id,'unknown','sorting must not mutate the cached source');
const groups=orderAging(card,rows);
assert.equal(groups.LATE_31_PLUS.rows,2);assert.equal(groups.LATE_31_PLUS.knownRows,1);assert.equal(groups.LATE_31_PLUS.minor,10025,'review amounts must not enter the valued subtotal');
assert.equal(groups.UNKNOWN_DUE.knownRows,0);assert.equal(groups.DUE_SOON.knownRows,1);assert.equal(groups.DUE_SOON.minor,0,'known zero must remain known');
assert.equal(Object.values(groups).reduce((n,g)=>n+g.rows,0),rows.length);
console.log('PASS: calendar boundaries, snapshot date, combined filters, stable sorting, no mutation, review exclusion, known zero and bucket reconciliation');
