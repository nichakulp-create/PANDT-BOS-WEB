'use strict';
// Pure incremental planner. No credentials, network, timers, or source writes.
const {buildSalesSnapshots}=require('./revenue-model.cjs');
const {createHash}=require('node:crypto');
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
function fingerprint(s){
 const rows=s.rows.map(r=>{const copy=JSON.parse(JSON.stringify(r));for(const key of ['source','priceSource'])if(copy[key])delete copy[key].readAt;return copy;});
 return createHash('sha256').update(JSON.stringify(canonical({company:s.company,month:s.month,card_id:s.card_id,basis:s.basis,rows,scope:s.summary.scope,version:s.summary.version}))).digest('hex');
}
function planSalesSync(source,baseline,months,asOf){
 if(!Array.isArray(baseline))throw Error('INVALID_BASELINE');
 const current=new Map();
 for(const s of baseline){
  if(s.company!=='P&T'||s.card_id!=='finSales'||!Array.isArray(s.rows)||s.rows.length!==s.summary?.rows||!s.id)throw Error('INVALID_BASELINE');
  if(current.has(s.month))throw Error('DUPLICATE_BASELINE_MONTH');current.set(s.month,s);
 }
 const next=buildSalesSnapshots(source,months,asOf),changed=[],report=[];
 for(const s of next){
  const old=current.get(s.month);
  if(old&&Date.parse(source.readAt)<Date.parse(old.source_read_at))throw Error('SOURCE_OLDER_THAN_BASELINE');
  if(old&&s.rows.length<old.rows.length)throw Error('SOURCE_ROW_COUNT_SHRANK:'+s.month);
  const same=old&&fingerprint(old)===fingerprint(s);
  const delta=s.value_numeric!==null&&old?.value_numeric!=null?Math.round((s.value_numeric-Number(old.value_numeric))*100)/100:null;
  report.push({month:s.month,status:same?'UNCHANGED':'CHANGED',before:old?.value_numeric??null,after:s.value_numeric,delta,rows:s.rows.length,reviewRows:s.summary.reviewRows,unknownAmountRows:s.summary.unknownAmountRows,sourceReadAt:s.source_read_at});
  if(!same)changed.push({snapshot:s,expectedId:old?.id??null});
 }
 return {version:1,mode:'PREPARED_NOT_SCHEDULED',sourceWriteCount:0,changed,report};
}
const columns=['company','month','card_id','title','source_code','kind','basis','value_numeric','value_status','decision_use','production_accepted','freshness_status','data_as_of','source_read_at','operational_unknown_rows','valuation_unknown_rows','content_hash','summary','rows'];
function sqlLiteral(value){return "'"+String(value).replace(/'/g,"''")+"'";}
function importSql(plan){
 if(!plan.changed.length)return '-- No changed sales snapshots.';
 const body=plan.changed.map(({snapshot:s,expectedId})=>{
  if(s.company!=='P&T'||s.card_id!=='finSales'||s.production_accepted!==false||s.summary.sourceWriteCount!==0||s.rows.length!==s.summary.rows)throw Error('INVALID_IMPORT_SCOPE');
  return `if not exists(select 1 from public.bos_revenue_snapshots where company='P&T' and month=${sqlLiteral(s.month)} and card_id='finSales' and content_hash=${sqlLiteral(s.content_hash)}) then
 if (select revenue_snapshot_id::text from public.bos_revenue_cards where company='P&T' and month=${sqlLiteral(s.month)} and card_id='finSales') is distinct from ${expectedId===null?'null':sqlLiteral(expectedId)} then raise exception 'SALES_BASELINE_CHANGED'; end if;
 insert into public.bos_revenue_snapshots (${columns.join(',')}) select ${columns.join(',')} from jsonb_populate_record(null::public.bos_revenue_snapshots,${sqlLiteral(JSON.stringify(s))}::jsonb) on conflict (company,month,card_id,content_hash) do nothing;
end if;`;
 }).join('\n');
 // JSON is held in a quoted SQL literal; choose a DO delimiter absent from all data.
 let tag='$bos_sales$';while(body.includes(tag))tag=tag.replace('$','$_');
 return `begin;\nset local standard_conforming_strings=on;\nset local lock_timeout='3s';\nset local statement_timeout='20s';\nselect pg_advisory_xact_lock(hashtext('bos_sales_sync'));\nlock table public.bos_revenue_snapshots in share row exclusive mode;\nDO ${tag}\nbegin\n${body}\nend;\n${tag};\ncommit;`;
}
module.exports={planSalesSync,importSql,fingerprint};
