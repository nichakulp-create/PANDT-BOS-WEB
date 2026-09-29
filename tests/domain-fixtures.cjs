'use strict';
// Header contracts only. Every value/identifier below is synthetic.
const headers=require('./domain-headers.json');
const normalize=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
function fixture(){
 const input={company:'P&T',asOf:'2026-09-29',months:['2026-09'],sources:{}};
 for(const [key,header] of Object.entries(headers))input.sources[key]={sourceId:'DEMO-SYNTHETIC',tab:'DEMO '+key,gid:1,readAt:'2026-09-29T09:00:00Z',complete:true,range:'A1:BC2000',values:[header]};
 function put(key,fields){const s=input.sources[key],r=s.values[0].map(h=>{const name=Object.keys(fields).find(k=>normalize(k)===normalize(h));return name===undefined?null:fields[name];});s.values.push(r);return r;}
 put('capacityMeta',{Active_Snapshot_ID:'DEMO-ACTIVE',Validation_Status:'PASS',Last_Run_Status:'SUCCESS'});
 put('capacity',{Month:'2026-09-01',Snapshot_ID:'DEMO-OLD',Trusted_Util_Pct:99,Gross_Capacity_Hours:1000,Target_Capacity_Hours:850});
 put('capacity',{Month:'2026-09-01',Snapshot_ID:'DEMO-ACTIVE',Trusted_Util_Pct:25,Review_Load_Pct:10,Trusted_Planned_Hours:250,Review_Planned_Hours:100,Gross_Capacity_Hours:1000,Target_Capacity_Hours:1000,Primary_Status:'DATA_NOT_READY'});
 put('capacityLine',{Month:'2026-09-01',Snapshot_ID:'DEMO-ACTIVE',Line_Name:'DEMO',Machine_Count:2,Working_Days:20,Shift_Count:2,Hours_Per_Shift:11.5,Trusted_Util_Pct:25});
 put('capacityOp',{Month:'2026-09-01',Snapshot_ID:'DEMO-ACTIVE',Display_OP:'OP01',Source_OP:'OP1',Planned_Qty:100,Actual_Qty:40});
 return {input,put};
}
module.exports={fixture};
