'use strict';
// Read-only valuation of current balances. No transaction writes or cross-stage totals.
const {createHash}=require('node:crypto');
const {folowModel:F}=require('./folow-model.cjs');
const {multiplyMinor,multiplyFactorsMinor}=require('./money.cjs');
const VERSION='1.0.0-balance-evidence';
const text=F.text,norm=v=>text(v).toUpperCase().replace(/\s+/g,' '),key=(...v)=>JSON.stringify(v.map(norm));
function numeric(v){
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 if(typeof v!=='string')return null;
 const s=v.trim(),n=/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)?Number(s.replace(/,/g,'')):NaN;return Number.isFinite(n)?n:null;
}
function grid(s,required){
 if(!s?.values?.length||!s.sourceId||!Number.isFinite(Date.parse(s.readAt)))throw Error('SOURCE_INVALID');
 const h=s.values[0].map(norm),ix={};
 for(const name of required){const matches=h.flatMap((x,i)=>x===norm(name)?[i]:[]);if(matches.length!==1)throw Error('HEADER_MISSING_OR_AMBIGUOUS:'+name);ix[name]=matches[0];}
 return s.values.slice(1).map((r,i)=>({r,row:i+2,get:name=>r[ix[name]]})).filter(x=>x.r.some(v=>text(v)!==''));
}
function source(s,row=1){return {spreadsheetId:s.sourceId,tab:s.tab,gid:s.gid,row,readAt:s.readAt};}
function unit(v){return ({'ชิ้น':'PCS','PCS':'PCS','เส้น':'BAR','BAR':'BAR','กิโลกรัม':'KG','KG':'KG','MM.':'MM','MM':'MM'})[norm(v)]||null;}
function uniqueMap(rows,keyOf,valueOf){const m=new Map();for(const r of rows){const k=keyOf(r);if(!m.has(k))m.set(k,new Set());m.get(k).add(valueOf(r));}return m;}
function resolver(s){
 const customers=grid(s.customers,['canonical_name','alias','status']).filter(r=>norm(r.get('status'))==='APPROVED');
 const cm=uniqueMap(customers,r=>norm(r.get('alias')),r=>norm(r.get('canonical_name')));
 const customer=v=>{const k=norm(v),hits=cm.get(k);return hits?.size===1?[...hits][0]:k;};
 const parts=grid(s.parts,['customer','source_part_no','master_part_no','status']).filter(r=>norm(r.get('status'))==='APPROVED');
 const pm=uniqueMap(parts,r=>key(customer(r.get('customer')),r.get('source_part_no')),r=>norm(r.get('master_part_no')));
 const part=(c,p)=>{const hits=pm.get(key(customer(c),p));return hits?.size===1?[...hits][0]:norm(p);};
 const prices=grid(s.prices,['Customer','Part no.','ราคาต่อชิ้น']),map=new Map();
 for(const r of prices){const k=key(customer(r.get('Customer')),r.get('Part no.'));if(!map.has(k))map.set(k,[]);map.get(k).push({price:numeric(r.get('ราคาต่อชิ้น')),source:source(s.prices,r.row)});}
 return {
  identity:(c,p)=>key(customer(c),part(c,p)),
  price(c,p){
   if(cm.get(norm(c))?.size>1||pm.get(key(customer(c),p))?.size>1)return {issue:'ALIAS_CONFLICT'};
   const hits=map.get(key(customer(c),part(c,p)))||[];
   if(!hits.length)return {issue:'PRICE_MISSING'};
   // Even identical duplicate master rows require review; do not pick the first.
   if(hits.length!==1)return {issue:'PRICE_CONFLICT'};
   return hits[0].price!==null&&hits[0].price>0?hits[0]:{issue:'PRICE_MISSING'};
  }
 };
}
function rowBase(s,n){return {id:s.tab+':'+n,customer:'',part:'',partName:'',job:'',qty:null,unit:null,price:null,priceUnit:null,valueMinor:null,issues:[],source:source(s,n),priceSource:null};}
function finish(r){
 if(r.qty===null)r.issues.push('BALANCE_MISSING');
 if(r.qty!==null&&r.qty<0)r.issues.push('NEGATIVE_BALANCE');
 if(!r.unit)r.issues.push('UNIT_UNKNOWN');
 if(!r.part)r.issues.push('PART_MISSING');
 if(r.qty!==0&&(r.price===null||r.price<=0))r.issues.push('PRICE_MISSING');
 if(r.qty!==0&&!r.materialFormula&&r.unit&&r.priceUnit&&r.unit!==r.priceUnit)r.issues.push('UNIT_CONVERSION_UNVERIFIED');
 r.issues=[...new Set(r.issues)];r.status=r.issues.length?'REVIEW':'INCLUDED';
 r.valueMinor=r.status==='INCLUDED'?(r.qty===0?0:r.materialFormula==='WEIGHT_PRICE'?multiplyFactorsMinor([r.qty,r.sourceWeight,r.price]):multiplyMinor(r.qty,r.price)):null;return r;
}
function dedup(rows,res){
 const counts=new Map();for(const r of rows){const k=res.identity(r.customer,r.part);counts.set(k,(counts.get(k)||0)+1);}
 for(const r of rows)if(counts.get(res.identity(r.customer,r.part))>1){r.issues.push('DUPLICATE_BALANCE');r.status='REVIEW';r.valueMinor=null;}return rows;
}
function stockRows(s,id,res){
 const mat=id==='material',tool=id==='tooling';
 const fields=mat?['ประเภทวัตถุดิบ','เกรดวัตถุดิบ','คงเหลือ','ราคา']:tool?['ประเภท Tooling','เกรด Tooling','คงเหลือ','หน่วย','ราคาต่อหน่วย']:['Customer','Part name','Part no.','คงเหลือ'];
 // Material and QA have repeated unit headers. Require their inspected positional schema.
 const expected=mat?['ประเภทวัตถุดิบ','เกรดวัตถุดิบ','คงเหลือ','หน่วย','น้ำหนัก','หน่วย','ราคา','หน่วย']:id==='qaFinal'||id==='qaWip'?['Customer','Part name','Part no.','คงเหลือ','หน่วย','จำนวนเศษ FG','หน่วย']:null;
 if(expected&&expected.some((v,i)=>norm(s.values[0]?.[i])!==norm(v)))throw Error('POSITIONAL_HEADER_MISMATCH:'+id);
 const rows=grid(s,fields).map(raw=>{
  const r=rowBase(s,raw.row);r.qty=numeric(raw.get('คงเหลือ'));
  if(mat||tool){
   r.part=text(raw.r[1]);r.partName=text(raw.r[0]);r.unit=unit(raw.r[3]);r.price=numeric(raw.r[mat?6:5]);r.priceUnit=mat?unit(raw.r[7]):r.unit;r.priceSource=source(s,raw.row);
   if(mat){r.sourceWeight=numeric(raw.r[4]);r.weightUnit=unit(raw.r[5]);if(!r.priceUnit&&r.qty!==0)r.issues.push('PRICE_UNIT_UNKNOWN');
    // Existing stock valuation contract: KG uses weight per stock unit; PCS/BAR uses stock quantity.
    // Read the current register values; never embed historical item/price overrides.
    if(r.priceUnit==='KG'){r.materialFormula='WEIGHT_PRICE';r.formula='คงเหลือ × น้ำหนักต่อหน่วย × ราคาต่อกิโลกรัม';if(r.qty!==0&&(r.sourceWeight===null||r.sourceWeight<=0))r.issues.push('WEIGHT_MISSING');}
    else if(['PCS','BAR'].includes(r.priceUnit)){r.materialFormula='STOCK_UNIT_PRICE';r.formula='คงเหลือ × ราคาต่อหน่วยคลังตาม Stock Material';}
    else if(r.qty!==0)r.issues.push('UNIT_CONVERSION_UNVERIFIED');}
  }else{
   r.customer=text(raw.get('Customer'));r.part=text(raw.get('Part no.'));r.partName=text(raw.get('Part name'));r.unit=unit(raw.r[4]);r.priceUnit='PCS';
   if(!r.customer)r.issues.push('CUSTOMER_MISSING');
   const p=res.price(r.customer,r.part);r.price=p.price??null;r.priceSource=p.source??null;if(p.issue&&r.qty!==0)r.issues.push(p.issue);
  }
  return finish(r);
 });return dedup(rows,res);
}
function sumQuantity(values){
 const terms=values.map(v=>{const [m,e='0']=String(v).split('e');return [BigInt(m.replace('.','')),(m.split('.')[1]||'').length-Number(e)];});
 const scale=Math.max(0,...terms.map(t=>t[1]));
 const n=terms.reduce((sum,[value,s])=>sum+value*10n**BigInt(scale-s),0n);
 const result=Number(String(n)+'e-'+scale);return Number.isFinite(result)&&Math.abs(result)<=Number.MAX_SAFE_INTEGER?result:null;
}
function ledgerRows(s,res,asOf){
 const fields=['Transaction ID','Timestamp','Department','Action','Job No.','DWG. No.','Customer','Part Name','From Process','To Process','Qty'];
 const raw=grid(s,fields),ids=new Map(),groups=new Map();
 for(const r of raw){const id=text(r.get('Transaction ID'));ids.set(id,(ids.get(id)||0)+1);}
 for(const x of raw){
  const c=text(x.get('Customer')),p=text(x.get('DWG. No.')),j=text(x.get('Job No.')),k=key(j,res.identity(c,p));
  if(!groups.has(k)){const r=rowBase(s,x.row);Object.assign(r,{id:k,customer:c,part:p,partName:text(x.get('Part Name')),job:j,unit:'PCS',priceUnit:'PCS',movements:[],received:0,issued:0});groups.set(k,r);}
  const r=groups.get(k),id=text(x.get('Transaction ID')),date=F.day(x.get('Timestamp')),q=numeric(x.get('Qty')),action=text(x.get('Action'));
  r.movements.push({id,date,action,qty:q,from:text(x.get('From Process')),to:text(x.get('To Process')),source:source(s,x.row)});
  if(!c||!p||!j)r.issues.push('LEDGER_IDENTITY_MISSING');
  if(!id||ids.get(id)!==1)r.issues.push('DUPLICATE_TRANSACTION');
  if(!date||date>asOf)r.issues.push('LEDGER_DATE_INVALID');
  if(q===null||q<0)r.issues.push('LEDGER_QUANTITY_INVALID');
  const inbound=action==='รับเข้า'&&norm(x.get('To Process'))==='WIP',outbound=action==='เบิกจ่าย'&&norm(x.get('From Process'))==='WIP';
  if(norm(x.get('Department'))!=='FAC2'||(!inbound&&!outbound))r.issues.push('LEDGER_ACTION_UNKNOWN');
  if(q!==null&&q>=0){if(inbound)r.received+=q;else if(outbound)r.issued+=q;}
 }
 return [...groups.values()].map(r=>{
  // Invalid/duplicate movements invalidate the entire job balance, never a partial net.
  r.received=sumQuantity(r.movements.filter(m=>m.action==='รับเข้า').map(m=>m.qty??0));
  r.issued=sumQuantity(r.movements.filter(m=>m.action==='เบิกจ่าย').map(m=>m.qty??0));
  r.qty=r.issues.length?null:sumQuantity(r.movements.map(m=>m.action==='รับเข้า'?m.qty:-m.qty));
  if(!Number.isFinite(r.qty)||Math.abs(r.qty)>Number.MAX_SAFE_INTEGER){r.qty=null;r.issues.push('LEDGER_QUANTITY_INVALID');}
  const p=res.price(r.customer,r.part);r.price=p.price??null;r.priceSource=p.source??null;if(p.issue&&r.qty!==0)r.issues.push(p.issue);
  return finish(r);
 });
}
const definitions={
 material:['วัตถุดิบคงเหลือ','SC','COST_REFERENCE','ราคาต่อกิโลกรัม: คงเหลือ × น้ำหนักต่อหน่วย × ราคา · ราคาต่อหน่วยคลัง: คงเหลือ × ราคา'],
 tooling:['Tooling คงเหลือ','SC','COST_REFERENCE','คงเหลือ × ราคาต่อหน่วยใน Stock Tooling'],
 fg:['สินค้าสำเร็จคงเหลือ','SC','SALES_REFERENCE','คงเหลือ Stock FG × Sales Price · ไม่ใช่ราคาทุน'],
 qaFinal:['QA Final คงเหลือ','QA','SALES_REFERENCE','คงเหลือ Final Check QA × Sales Price · ไม่รวมเศษ FG / WIP QA / FG'],
 qaWip:['งานรอตรวจ QA','QA','SALES_REFERENCE','คงเหลือ WIP QA × Sales Price · แสดงแยก ไม่บวกรวม QA Final / FG'],
 fac2:['งานคงเหลือ Fac2','FAC2','SALES_REFERENCE','รับเข้า − เบิกจ่ายสะสมต่อ Job / ลูกค้า / Part × Sales Price · ไม่ใช่ราคาทุน'],
 wip:['งานระหว่างผลิต PC','PC','UNAVAILABLE','ยังไม่มีหลักฐาน Balance ของ PC · ไม่ใช้จำนวนแผนหรือมูลค่าเต็ม Job แทน']
};
function buildBalanceSnapshots(input){
 const {sources:s,asOf}=input;if(input.company!=='P&T'||F.day(asOf)!==asOf)throw Error('INVALID_SCOPE');
 const res=resolver(s),out=[];
 for(const [id,[title,source_code,valueType,basis]] of Object.entries(definitions)){
  const src=s[id];if(!src)throw Error('SOURCE_MISSING:'+id);
  const rows=id==='wip'?[]:id==='fac2'?ledgerRows(src,res,asOf):stockRows(src,id,res);
  const valued=rows.filter(r=>r.status==='INCLUDED'),review=rows.filter(r=>r.status==='REVIEW');
  const value=F.sum(valued.map(r=>r.valueMinor)),issues={};for(const r of rows)for(const issue of r.issues)issues[issue]=(issues[issue]||0)+1;
  const sourceKeys=['wip','material','tooling'].includes(id)?[id]:[id,'prices','customers','parts'];
  const sources=sourceKeys.map(k=>({...source(s[k]),range:s[k].range}));
  for(const x of sources)if(!Number.isFinite(Date.parse(x.readAt))||new Date(new Date(x.readAt).getTime()+7*3600000).toISOString().slice(0,10)!==asOf)throw Error('SOURCE_DATE_MISMATCH');
  const units=[...new Set(rows.map(r=>r.unit).filter(Boolean))].map(u=>({unit:u,qty:rows.filter(r=>r.unit===u&&r.status==='INCLUDED').reduce((n,r)=>n+r.qty,0),knownRows:rows.filter(r=>r.unit===u&&r.status==='INCLUDED').length}));
  const summary={version:VERSION,rows:rows.length,valuedRows:valued.length,reviewRows:review.length,knownSubtotalMinor:value,unknownAmountRows:review.length,issues,sources,quantity:units,valueType,asOf,scope:{company:'P&T',currentBalanceOnly:true,notHistoricalMonthEnd:true,crossStageTotalAllowed:false,scopeRule:basis},businessCertified:false,sourceWriteCount:0};
  const snapshot={company:'P&T',month:asOf.slice(0,7),card_id:id,title,source_code,kind:'REFERENCE',basis,value_numeric:value===null?null:value/100,value_status:id==='wip'?'NO_BALANCE_DATA':!rows.length?'NO_SOURCE_ROWS':value===null?'UNKNOWN_VALUE':review.length?'PARTIAL_UNBOUNDED':'REFERENCE_ONLY',decision_use:'REVIEW',production_accepted:false,freshness_status:'CURRENT',data_as_of:asOf,source_read_at:sources.map(x=>x.readAt).sort()[0],operational_unknown_rows:review.length,valuation_unknown_rows:review.length,summary,rows};
  snapshot.content_hash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');out.push(snapshot);
 }
 return out;
}
module.exports={buildBalanceSnapshots,numeric,unit,resolver,VERSION};
