'use strict';
const {folowModel:F}=require('./folow-model.cjs');
const {createHash}=require('node:crypto');
const {multiplyMinor}=require('./money.cjs');
const VERSION='1.0.0-revenue-evidence';
const norm=v=>F.text(v).toUpperCase().replace(/\s+/g,'');
const header=v=>F.text(v).replace(/\s+/g,' ').toLowerCase();
const key=(customer,part)=>JSON.stringify([norm(customer),norm(part)]);
const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const definitions={
 finSales:['ยอดขายจริงก่อน VAT','FOLOW','MONEY','Net Total ก่อน VAT จาก Folow · บริษัท P&T · วันที่เอกสารตรงปี/เดือน'],
 forecast:['ยอดคาดการณ์','SO','REFERENCE','FC รายเดือน × ราคาขายอ้างอิงตรงลูกค้าและ Part · แยกจาก OR'],
 orderRegister:['ใบสั่งซื้อที่รับในเดือน','SO','REFERENCE','จำนวนเต็มใบ × ราคา · จัดเดือนตาม received_date ไม่หักการส่ง'],
 orders:['ออเดอร์ค้างส่ง ณ วันอ่าน','SO','MONEY','remaining_po_qty × ราคา · ยอดคงค้างปัจจุบัน ไม่ใช่ยอดสิ้นเดือนย้อนหลัง'],
 issue:['จ่าย FG ตามรายการ','SC','REFERENCE','จำนวนจ่าย × ราคาที่บันทึกในรายการ · หักรายการยกเลิกตามวันที่ · ไม่ใช่ยอดขาย Invoice']
};
function grid(source,required){
 if(!source?.values?.length)throw Error('SOURCE_EMPTY');
 const headers=source.values[0].map(header);
 for(const field of required)if(headers.filter(h=>h===header(field)).length!==1)throw Error('HEADER_MISSING_OR_AMBIGUOUS:'+source.tab+':'+field);
 return source.values.slice(1).map((r,i)=>({...Object.fromEntries(headers.map((h,j)=>[h,r[j]])),_row:i+2,_source:source}));
}
function link(source,row){return {spreadsheetId:source.sourceId,tab:source.tab,row,readAt:source.readAt};}
function base(raw,kind,id){return {id,customer:F.text(raw.customer),part:F.text(raw['part no.']??raw.part_no),partName:F.text(raw['part name']??raw.part_name),document:F.text(raw.po_no??raw['customer po no.']),job:F.text(raw.mass_order_no??raw['job no.']),date:null,dueDate:null,qty:null,unit:'ชิ้น',price:null,valueMinor:null,rawValueMinor:null,status:'REVIEW',issues:[],warnings:[],source:link(raw._source,raw._row),formula:definitions[kind][3],priceSource:null};}
function resolvePrice(prices,customer,part){
 const hits=prices.get(key(customer,part));if(!hits)return {price:null,issue:'PRICE_MISSING',source:null};
 if(hits.size!==1)return {price:null,issue:'PRICE_CONFLICT',source:null};
 const value=[...hits.values()][0];return {price:value.price,issue:null,source:value.source};
}
function pricesOf(source){const out=new Map();for(const r of grid(source,['Customer','Part no.','ราคาต่อชิ้น'])){const n=F.numeric(r['ราคาต่อชิ้น']);if(n===null||n<=0||!F.text(r.customer)||!F.text(r['part no.']))continue;const k=key(r.customer,r['part no.']);if(!out.has(k))out.set(k,new Map());out.get(k).set(n,{price:n,source:link(source,r._row)});}return out;}
function poPrice(note){const m=/\bUnit Price:\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(F.text(note)),n=m?F.numeric(m[1]):null;return n!==null&&n>0?n:null;}
function priceRow(r,raw,prices,masterPart){
 const explicit=F.numeric(raw.unit_price),remark=poPrice(raw.remark??raw.note);
 if(explicit!==null&&explicit>0){r.price=explicit;r.priceSource={...r.source,basis:'ราคาจากรายการ'};}
 else if(remark!==null){r.price=remark;r.priceSource={...r.source,basis:'Unit Price จาก PO Upload'};}
 else {const p=resolvePrice(prices,r.customer,masterPart||r.part);r.price=p.price;r.priceSource=p.source?{...p.source,basis:'Sales Price · ลูกค้า + Part ตรงกัน'}:null;if(p.issue&&r.qty!==0)r.issues.push(p.issue);}
}
function finish(r){
 if(!r.customer)r.issues.push('CUSTOMER_MISSING');
 if(!r.part&&r.qty!==0)r.issues.push('PART_MISSING');
 if(r.qty===null)r.issues.push('QUANTITY_MISSING');
 if(r.qty!==null&&r.qty<0&&!r.reversal)r.issues.push('NEGATIVE_QUANTITY');
 r.rawValueMinor=r.qty===0?0:r.qty!==null&&r.price!==null?multiplyMinor(r.qty,r.price):null;
 r.issues=[...new Set(r.issues)];r.status=r.issues.length?'REVIEW':'INCLUDED';r.valueMinor=r.status==='INCLUDED'?r.rawValueMinor:null;return r;
}
function duplicateRows(rows){const counts=new Map();rows.forEach(r=>counts.set(r.id,(counts.get(r.id)||0)+1));for(const r of rows)if(counts.get(r.id)>1){r.issues.push('DUPLICATE_DOCUMENT_REVIEW');r.status='REVIEW';r.valueMinor=null;}return rows;}
function monthScope(date,month){return date?.slice(0,7)===month;}
function folowRows(source,month,asOf){
 const result=F.analyze(source.values,month,asOf,'P&T');
 const rows=result.rows.filter(r=>r.status!=='RESERVED').map(r=>({id:r.id,customer:r.customer,part:'',partName:'',document:r.invoice,job:'',date:r.date,dueDate:null,qty:r.qty,unit:'ชิ้น',price:null,valueMinor:r.valueMinor,rawValueMinor:r.netMinor,status:r.status,issues:r.issues,warnings:r.warnings,source:link(source,r.row),formula:definitions.finSales[3],priceSource:null,note:r.note,period:r.period,sourceCompany:r.company,type:r.type}));
 return {rows,scope:{excludedOtherCompanyRows:result.otherCompanyRows,reservedRows:result.reservedRows,sourceRegisterMinor:result.registerMinor,partBreakdownAvailable:false,scopeRule:'P&T เท่านั้น · ไม่รวม TSP · ไม่กระจายยอด Invoice ลง Part ที่ไม่มีใน Folow'}};
}
function forecastRows(source,prices,month){
 const [year,m]=month.split('-').map(Number),field='fc-'+monthNames[m-1].toLowerCase();
 const rows=[];
 for(const raw of grid(source,['Part no.','Customer','Year',field])){
  if(!F.text(raw['part no.'])&&!F.text(raw.customer))continue;
  if(F.year(raw.year)!==year)continue;
  const r=base(raw,'forecast','FC:'+key(raw.customer,raw['part no.'])+':'+month);r.qty=F.numeric(raw[field]);r.date=month+'-01';
  r.priceSource=null;priceRow(r,raw,prices);rows.push(finish(r));
 }
 return {rows:duplicateRows(rows),scope:{scopeRule:'FC เท่านั้น · ไม่รวม OR · ราคาปัจจุบันใช้เป็นราคาอ้างอิงของแต่ละเดือน ไม่ใช่ราคาย้อนหลังที่รับรอง'}};
}
function orderRows(ordersSource,historySource,deliverySource,prices,month,asOf){
 const required=['order_id','customer','po_no','part_no','received_date','order_qty','order_status','remark'];
 const active=grid(ordersSource,required),history=grid(historySource,required),delivery=grid(deliverySource,['order_id','source_type','closed_flag','remaining_po_qty','due_date','customer','part_no','unit_price']);
 const merged=new Map();for(const r of history)if(F.text(r.order_id))merged.set(F.text(r.order_id),r);for(const r of active)if(F.text(r.order_id))merged.set(F.text(r.order_id),r);
 const mapped=new Map(delivery.map(r=>[F.text(r.order_id),r]));
 const newRows=[];let unassignedDateRows=0;
 for(const raw of merged.values()){
  if(/CANCEL/.test(F.text(raw.order_status).toUpperCase()))continue;
  const date=F.day(raw.received_date);if(!date){unassignedDateRows++;continue;}if(!monthScope(date,month))continue;
  const r=base(raw,'orderRegister','SO:new:'+F.text(raw.order_id));r.date=date;r.dueDate=F.day(raw.due_date);r.qty=F.numeric(raw.order_qty);
  if(!date)r.issues.push('DATE_INVALID');if(date&&date>asOf)r.issues.push('FUTURE_DOCUMENT');
  const mapping=mapped.get(F.text(raw.order_id));const master=mapping&&norm(mapping.customer)===norm(r.customer)?F.text(mapping.master_part_no):'';
  priceRow(r,raw,prices,master);newRows.push(finish(r));
 }
 const openRows=[];
 if(month===asOf.slice(0,7))for(const raw of delivery){
  if(!F.text(raw.order_id)||F.text(raw.source_type).toUpperCase()!=='ACTIVE'||F.text(raw.closed_flag).toUpperCase()==='YES'||/CANCEL/.test(F.text(raw.order_status_original).toUpperCase()))continue;
  const qty=F.numeric(raw.remaining_po_qty);if(qty===0)continue;
  const r=base(raw,'orders','SO:open:'+F.text(raw.order_id));r.qty=qty;r.date=asOf;r.dueDate=F.day(raw.due_date);r.note=F.text(raw.delivery_status);r.deliveryStatus=r.dueDate&&r.dueDate<asOf?'OVERDUE':r.dueDate?'OPEN':'UNKNOWN';
  if(!r.dueDate)r.warnings.push('DUE_DATE_MISSING');if(r.deliveryStatus==='OVERDUE')r.warnings.push('ORDER_OVERDUE');
  priceRow(r,raw,prices,F.text(raw.master_part_no));openRows.push(finish(r));
 }
 return {newRows:duplicateRows(newRows),openRows:duplicateRows(openRows),scope:{scopeRule:'เดือนรับ Order ตาม received_date · แถวไม่มีวันที่รับแยกออกจากยอดทุกเดือน ไม่แทนด้วยวันสร้าง',unassignedDateRows},openScope:{scopeRule:'ยอดค้างส่ง ณ วันอ่านจริง ไม่ใช่ยอดสิ้นเดือนย้อนหลัง',historicalOpenAvailable:true,overdueRows:openRows.filter(r=>r.deliveryStatus==='OVERDUE').length,openRows:openRows.filter(r=>r.deliveryStatus==='OPEN').length,unknownDueRows:openRows.filter(r=>r.deliveryStatus==='UNKNOWN').length,urgentOrders:openRows.filter(r=>r.deliveryStatus==='OVERDUE').sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,3).map(r=>({customer:r.customer,document:r.document,part:r.part,dueDate:r.dueDate,valueMinor:r.valueMinor}))}};
}
function issueRows(source,month,asOf){
 const all=grid(source,['Transaction ID','Timestamp','Action','Customer','Part No.','Qty','Unit Price','Cancel Ref Transaction ID','Cancel Original Action']);
 const originals=new Map(),reversals=new Map();
 for(const raw of all){const id=F.text(raw['transaction id']);if(!originals.has(id))originals.set(id,[]);originals.get(id).push(raw);const ref=F.text(raw['cancel ref transaction id']);if(ref){if(!reversals.has(ref))reversals.set(ref,[]);reversals.get(ref).push(raw);}}
 const out=[];let unassignedDateRows=0;
 for(const raw of all){
  const action=F.text(raw.action),cancel=action==='ยกเลิกรายการ Stock FG';
  if(action!=='เบิก/จ่าย Stock FG'&&!(cancel&&F.text(raw['cancel original action'])==='เบิก/จ่าย Stock FG'))continue;
  const date=F.day(raw.timestamp);if(!date){unassignedDateRows++;continue;}if(!monthScope(date,month))continue;
  const r=base(raw,'issue','SC:'+F.text(raw['transaction id']));r.date=date;r.document=F.text(raw['customer po no.']);r.qty=F.numeric(raw.qty);r.price=F.numeric(raw['unit price']);r.note=F.text(raw.remark);r.transactionId=F.text(raw['transaction id']);
  if(!date)r.issues.push('DATE_INVALID');if(date&&date>asOf)r.issues.push('FUTURE_DOCUMENT');if(originals.get(r.transactionId)?.length!==1)r.issues.push('DUPLICATE_DOCUMENT_REVIEW');
  if(r.price===null||r.price<=0){if(r.qty!==0)r.issues.push('PRICE_MISSING');r.price=null;}
  r.priceSource={...r.source,basis:'ราคาที่บันทึกใน StockFG_Transaction · ไม่ใช้ Stock Value หลังรายการ'};
  if(cancel){
   r.reversal=true;const ref=F.text(raw['cancel ref transaction id']),candidates=originals.get(ref)||[];r.cancelRef=ref;
   if(candidates.length!==1||reversals.get(ref)?.length!==1)r.issues.push('CANCEL_REFERENCE_REVIEW');
   else {const original=candidates[0];if(F.text(original.action)!=='เบิก/จ่าย Stock FG'||norm(original.customer)!==norm(raw.customer)||norm(original['part no.'])!==norm(raw['part no.'])||F.numeric(original.qty)!==r.qty||F.numeric(original['unit price'])!==r.price||!F.day(original.timestamp)||!date||F.day(original.timestamp)>date)r.issues.push('CANCEL_REFERENCE_REVIEW');}
   if(r.qty!==null)r.qty=-r.qty;
  }
  if(/\btest\b|ทดสอบ|เทสระบบ/i.test(r.note))r.issues.push('TEST_RECORD_REVIEW');
  out.push(finish(r));
 }
 return {rows:duplicateRows(out),scope:{scopeRule:'รายการจ่าย FG ตามเดือน Timestamp · รวมกลับรายการยกเลิกที่ตรวจต้นทางได้ · ไม่ยืนยันยอด Invoice หรือการรับของลูกค้า',unassignedDateRows}};
}
function snapshot(cardId,month,source,rows,scope,asOf){
 const [title,source_code,kind,basis]=definitions[cardId],valued=rows.filter(r=>r.status==='INCLUDED'),review=rows.filter(r=>r.status==='REVIEW');
 const value=F.sum(valued.map(r=>r.valueMinor)),raw=F.sum(rows.map(r=>r.rawValueMinor)),reviewValue=F.sum(review.map(r=>r.rawValueMinor));
 const sums=Object.fromEntries([...new Set(rows.flatMap(r=>r.issues))].map(k=>[k,rows.filter(r=>r.issues.includes(k)).length]));
 const maxDate=rows.map(r=>r.date).filter(Boolean).sort().at(-1)||null;
 const summary={version:VERSION,rows:rows.length,valuedRows:valued.length,reviewRows:review.length,unknownAmountRows:rows.filter(r=>r.rawValueMinor===null).length,knownSubtotalMinor:value,knownRegisterMinor:raw,reviewKnownMinor:reviewValue,issues:sums,sourceLatestDate:maxDate,amountReconciled:raw===null?null:(value??0)+(reviewValue??0)===raw,businessCertified:false,sourceWriteCount:0,refreshMode:'IMPORTED_SNAPSHOT',scope};
 const contentHash=createHash('sha256').update(JSON.stringify({cardId,month,rows,scope})).digest('hex');
 const partial=review.length||scope.unassignedDateRows;
 return {company:'P&T',month,card_id:cardId,title,source_code,kind,basis,value_numeric:value===null?null:value/100,value_status:!rows.length?'NO_PERIOD_DATA':value===null?'UNKNOWN_VALUE':partial?'PARTIAL_UNBOUNDED':kind==='REFERENCE'?'REFERENCE_ONLY':'REGISTER_VALUE',decision_use:partial?'REVIEW':'SCOPED_USE',production_accepted:false,freshness_status:'CURRENT',data_as_of:asOf,source_read_at:source.readAt,operational_unknown_rows:review.length,valuation_unknown_rows:summary.unknownAmountRows,content_hash:contentHash,summary,rows};
}
function buildSnapshots(input,months,asOf){
 const sources={...input,folow:{...input.folow_a,values:input.folow_a.values.concat(input.folow_b.values)},sc:{...input.sc_a,values:input.sc_a.values.concat(input.sc_b.values)}};
 const prices=pricesOf(sources.prices),out=[];
 for(const month of months){
  const f=folowRows(sources.folow,month,asOf);out.push(snapshot('finSales',month,sources.folow,f.rows,f.scope,asOf));
  const fc=forecastRows(sources.forecast,prices,month);out.push(snapshot('forecast',month,sources.forecast,fc.rows,fc.scope,asOf));
  const so=orderRows(sources.orders,sources.history,sources.delivery,prices,month,asOf);out.push(snapshot('orderRegister',month,sources.orders,so.newRows,so.scope,asOf));
  if(month===asOf.slice(0,7))out.push(snapshot('orders',month,sources.delivery,so.openRows,so.openScope,asOf));
  const sc=issueRows(sources.sc,month,asOf);out.push(snapshot('issue',month,sources.sc,sc.rows,sc.scope,asOf));
 }
 const coverage={finSales:['folow_a','folow_b'],forecast:['forecast','prices'],orderRegister:['orders','history','delivery','prices'],orders:['delivery','prices'],issue:['sc_a','sc_b']};
 for(const s of out){s.summary.sources=coverage[s.card_id].map(k=>({...link(input[k],1),range:input[k].range}));s.source_read_at=s.summary.sources.map(x=>x.readAt).sort()[0];}
 return out;
}
// Standalone sales refresh uses the same business rules as the combined import.
function buildSalesSnapshots(source,months,asOf){
 if(!source||!/^[-\w]+$/.test(source.sourceId||'')||source.tab!=='Folow'||!Number.isFinite(Date.parse(source.readAt)))throw Error('INVALID_SALES_SOURCE');
 if(!Array.isArray(months)||!months.length||new Set(months).size!==months.length)throw Error('INVALID_MONTHS');
 return months.map(month=>{
  const f=folowRows(source,month,asOf),s=snapshot('finSales',month,source,f.rows,f.scope,asOf);
  s.summary.sources=[{...link(source,1),range:source.range}];return s;
 });
}
module.exports={buildSnapshots,buildSalesSnapshots,pricesOf,resolvePrice,issueRows,forecastRows,VERSION};
