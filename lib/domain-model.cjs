'use strict';
// Private, immutable evidence adapters. Source spreadsheets are never modified.
const {createHash}=require('node:crypto');
const {folowModel:F}=require('./folow-model.cjs');
const {multiplyMinor}=require('./money.cjs');
const VERSION='1.0.0-domain-evidence';
const text=F.text,num=F.numeric,normal=v=>text(v).replace(/\s+/g,' ').toUpperCase();
function day(v){return F.day(v)||(/^\d{4}-\d{2}-\d{2}[ T]/.test(text(v))?F.day(text(v).slice(0,10)):null);}
function month(v){return /^20\d\d-(0[1-9]|1[0-2])$/.test(text(v))?text(v):day(v)?.slice(0,7)||null;}
function total(a){const n=a.filter(x=>x!==null&&Number.isFinite(x));return n.length?n.reduce((s,v)=>s+v,0):null;}
function source(s,row=1){return {spreadsheetId:s.sourceId,tab:s.tab,gid:s.gid,row,readAt:s.readAt,range:s.range};}
function grid(s,columns){
 if(!s?.complete||!s.sourceId||!s.values?.length||!Number.isFinite(Date.parse(s.readAt)))throw Error('INCOMPLETE_SOURCE');
 const header=s.values[0].map(normal),indexes=columns.map(([key,label,type,required=true])=>{const hits=header.flatMap((h,i)=>h===normal(label)?[i]:[]);if(hits.length!==1)throw Error('HEADER_MISSING_OR_AMBIGUOUS:'+s.tab+':'+label);return {key,label,type,required,index:hits[0]};});
 return s.values.slice(1).map((raw,i)=>({raw,row:i+2})).filter(x=>indexes.some(c=>text(x.raw[c.index])!=='')).map(({raw,row})=>{
  const r={id:s.tab+':'+row,source:source(s,row),fields:{},issues:[]};
  for(const c of indexes){const v=raw[c.index],value=c.type==='number'?num(v):c.type==='money'?F.cents(num(v)):c.type==='date'?day(v):c.type==='month'?month(v):text(v);r.fields[c.key]=value;
   if(c.required&&(value===null||value===''))r.issues.push('MISSING_'+c.key);
   if(['number','money','date','month'].includes(c.type)&&text(v)!==''&&value===null)r.issues.push('INVALID_'+c.key);
  }return r;
 });
}
function issue(r,s){if(!r.issues.includes(s))r.issues.push(s);}
function duplicates(rows,field){const counts=new Map();for(const r of rows){const v=r.fields[field];if(v)counts.set(v,(counts.get(v)||0)+1);}for(const r of rows)if(counts.get(r.fields[field])>1)issue(r,'DUPLICATE_ID');return rows;}
const C=(key,label,type='text',required=false)=>[key,label,type,required];
function snapshot(ctx,id,title,code,basis,rows,opts={}){
 const period=opts.month||ctx.asOf.slice(0,7),issues={};
 rows=rows.map(r=>({...r,issues:[...new Set(r.issues||[])],status:r.issues?.length?'REVIEW':'INCLUDED'}));
 for(const r of rows)for(const x of r.issues)issues[x]=(issues[x]||0)+1;
 const reviewed=rows.filter(r=>r.status==='REVIEW'),known=rows.filter(r=>Number.isSafeInteger(r.valueMinor)&&r.valueIncluded!==false);
 const sources=opts.sources.map(k=>source(ctx.sources[k]));
 const sum=F.sum(known.map(r=>r.valueMinor)),kind=opts.kind||'COUNT';
 const value=Object.hasOwn(opts,'value')?opts.value:rows.length?(kind==='MONEY'?(sum===null?null:sum/100):rows.length):null;
 const sourceDate=rows.map(r=>day(r.fields.date)).filter(Boolean).sort().at(-1)||null;
 const summary={version:VERSION,rows:rows.length,reviewRows:reviewed.length,valuedRows:known.length,knownSubtotalMinor:sum,issues,sources,columns:opts.columns||[],groups:opts.groups||[],metrics:opts.metrics||[],notes:opts.notes||[],scope:{company:'P&T',month:period,currentBalanceOnly:!!opts.current,notHistoricalMonthEnd:!!opts.current,sourceLatestDate:sourceDate,unassignedPeriodRows:opts.unassigned||0,scopeRule:basis},businessCertified:false,sourceWriteCount:0,...opts.summary};
 const result={company:'P&T',month:period,card_id:id,title,source_code:code,kind,basis,value_numeric:value,value_status:opts.status||(!rows.length?'NO_SOURCE_ROWS':value===null?'UNAVAILABLE':reviewed.length?'PARTIAL_UNBOUNDED':'REGISTER_VALUE'),decision_use:'REVIEW',production_accepted:false,freshness_status:'CURRENT',data_as_of:opts.current?ctx.asOf:sourceDate||ctx.asOf,source_read_at:sources.map(s=>s.readAt).sort()[0],operational_unknown_rows:reviewed.length,valuation_unknown_rows:kind==='MONEY'?rows.length-known.length:0,summary,rows};
 result.content_hash=createHash('sha256').update(JSON.stringify(result)).digest('hex');return result;
}
function monthly(ctx,id,title,code,basis,rows,opts){
 const unassigned=rows.filter(r=>!day(r.fields.date)).length;
 return ctx.months.map(m=>snapshot(ctx,id,title,code,basis,rows.filter(r=>day(r.fields.date)?.startsWith(m)),{...opts,month:m,unassigned,...(typeof opts.forMonth==='function'?opts.forMonth(m,rows.filter(r=>day(r.fields.date)?.startsWith(m))):{})}));
}
function grouping(rows,field){return [...new Set(rows.map(r=>text(r.fields[field])||'ไม่ระบุ'))].map(name=>{const selected=rows.filter(r=>(text(r.fields[field])||'ไม่ระบุ')===name);return {name,rows:selected.length,reviewRows:selected.filter(r=>r.issues.length).length,knownSubtotalMinor:F.sum(selected.filter(r=>r.valueIncluded!==false).map(r=>r.valueMinor??null))};});}
function finance(ctx){
 const defs={
 finSales:[C('date','วันที่ขายสินค้า (กรอก)','date',true),C('item','ชื่อสินค้า (เลือก)'),C('qty','จำนวนที่ขาย (กรอก)','number'),C('amount','มูลค่ารวม (ห้ามแก้ไข)','money',true),C('party','ชื่อลูกค้า (เลือก)','text',true),C('credit','Credit Day (ห้ามแก้ไข)','number'),C('due','วันที่ต้องได้รับเงิน (ห้ามแก้ไข)','date'),C('paid','วันที่ได้รับเงินจริง (กรอก)','date'),C('account','บัญชีที่รับเงิน (เลือก)'),C('state','สถานะ (ห้ามแก้ไข)')],
 finPurchases:[C('date','วันที่ (กรอก)','date',true),C('item','สินค้า'),C('qty','จำนวนที่ซื้อ (กรอก)','number'),C('amount','มูลค่ารวม (ห้ามแก้ไข)','money',true),C('party','Supplier (เลือก)','text',true),C('credit','Credit Day (ห้ามแก้ไข)','number'),C('due','วันที่ต้องจ่าย (ห้ามแก้ไข)','date'),C('paid','วันที่จ่ายเงินจริง (กรอก)','date'),C('account','บัญชีที่จ่ายเงิน (เลือก)'),C('state','สถานะ (ห้ามแก้ไข)')],
 finExpenses:[C('date','วันที่ (กรอก)','date',true),C('item','รายการ (เลือก)'),C('amount','มูลค่ารวม (ห้ามแก้ไข)','money',true),C('party','ชื่อ supplier (เลือก)'),C('document','เลขที่บิล'),C('paid','วันที่โอนเงิน (กรอก)','date'),C('account','บัญชีที่โอนเงินจาก (เลือก)'),C('state','สถานะ (เลือก)')],
 finOther:[C('date','วันที่ (กรอก)','date',true),C('item','รายการ (เลือก)'),C('amount','มูลค่ารวม (ห้ามแก้ไข)','money',true),C('paid','วันที่รับเงิน (กรอก)','date'),C('account','บัญชีที่รับเงิน (เลือก)')]
 };
 const sets={};for(const [key,cols] of Object.entries(defs))sets[key]=grid(ctx.sources[key],cols).map(r=>{r.fields.ledger=ctx.sources[key].tab;r.valueMinor=r.fields.amount;r.valueIncluded=!!r.fields.date&&r.fields.date<=ctx.asOf&&!r.issues.includes('INVALID_paid');if(r.fields.amount<0)issue(r,'NEGATIVE_AMOUNT');if(r.fields.date>ctx.asOf)issue(r,'FUTURE_DOCUMENT');return r;});
 const columns=[C('date','วันที่เอกสาร','date'),C('party','ลูกค้า / ผู้ขาย'),C('item','รายการ'),C('document','เอกสาร'),C('amount','ยอดทะเบียน (บาท)','money'),C('due','ครบกำหนด','date'),C('paid','รับ / จ่ายจริง','date'),C('account','บัญชี'),C('state','สถานะต้นทาง'),C('ledger','ทะเบียน')];
 const out=[];
 for(const [key,id,title,unpaid] of [['finSales','ar','ลูกหนี้ตามทะเบียน FIN','ยังไม่ได้รับเงิน'],['finPurchases','ap','เจ้าหนี้ตามทะเบียน FIN','ยังไม่ชำระเงิน']]){
  const candidates=sets[key].filter(r=>!r.fields.paid||r.fields.paid>ctx.asOf||r.issues.includes('INVALID_paid')).map(r=>({...r,issues:[...r.issues]}));
  for(const r of candidates){if(r.fields.state!==text(unpaid)&&!r.fields.paid){issue(r,'PAYMENT_STATUS_CONFLICT');r.valueIncluded=false;}if(!r.fields.due)issue(r,'DUE_MISSING');r.fields.overdueDays=r.fields.due&&r.fields.due<ctx.asOf?Math.floor((Date.parse(ctx.asOf)-Date.parse(r.fields.due))/86400000):r.fields.due?0:null;}
  out.push(snapshot(ctx,id,title,'FIN','ยอดค้างตามทะเบียน ณ วันอ่าน · ไม่ใช่ยอดกระทบธนาคารหรือยอดสิ้นเดือนย้อนหลัง',candidates,{sources:[key],kind:'MONEY',current:true,columns:[...columns,C('overdueDays','เลยกำหนด (วัน)','number')],groups:grouping(candidates,'party')}));
  const eligible=candidates.filter(r=>!r.issues.length&&r.fields.amount>0&&r.fields.credit!==null),base=F.sum(eligible.map(r=>r.fields.amount));
  out.push(snapshot(ctx,id==='ar'?'creditAr':'creditAp',id==='ar'?'เครดิตลูกหนี้':'เครดิตเจ้าหนี้','FIN','เครดิตตามทะเบียน ถ่วงน้ำหนักยอดค้างบวกที่ระบุเครดิต · ไม่ใช่ DSO / DPO',candidates,{sources:[key],kind:'CREDIT',current:true,columns:[...columns,C('credit','เครดิต (วัน)','number')],value:base?eligible.reduce((s,r)=>s+r.fields.credit*r.fields.amount,0)/base:null,notes:['รายการที่ไม่ระบุเครดิตไม่รวมตัวหาร · แสดงจำนวนครอบคลุม'],metrics:[{label:'รายการที่ใช้ถ่วงน้ำหนัก',value:eligible.length,unit:'รายการ'},{label:'รายการค้างทั้งหมด',value:candidates.length,unit:'รายการ'}]}));
 }
 const events=[];
 for(const [key,rows] of Object.entries(sets))for(const r of rows){if(!r.fields.paid||r.fields.paid>ctx.asOf)continue;const x={...r,issues:[...r.issues],fields:{...r.fields,documentDate:r.fields.date,date:r.fields.paid,direction:['finSales','finOther'].includes(key)?'รับ':'จ่าย'}};if(!r.fields.account)issue(x,'ACCOUNT_MISSING');events.push(x);}
 const cashColumns=[C('date','วันรับ / จ่าย','date'),C('direction','ทิศทาง'),...columns.filter(c=>c[0]!=='date'),C('documentDate','วันเอกสาร','date')];
 for(const [id,title,dir] of [['finReceived','เงินรับตามทะเบียน','รับ'],['finPaid','เงินจ่ายตามทะเบียน','จ่าย']]){
  const rows=events.filter(r=>r.fields.direction===dir);
  out.push(...monthly(ctx,id,title,'FIN','ยอดเต็มรายการผูกวันที่รับ / จ่ายที่บันทึก · แยกทะเบียน ยังไม่กระทบการจ่ายบางส่วนหรือรายการซ้ำ',rows,{sources:dir==='รับ'?['finSales','finOther']:['finPurchases','finExpenses'],kind:'MONEY',columns:cashColumns,value:null,status:'RECONCILIATION_REQUIRED',forMonth:(m,rs)=>({groups:grouping(rs,'ledger')}),notes:['อ่านยอดที่บันทึก ไม่ยืนยันเงินเข้าหรือออกธนาคารจริง','ไม่รวมข้ามทะเบียนเป็นยอดเงินสดสุทธิจนกว่าจะกระทบรายการซ้ำและการชำระบางส่วน']}));
 }
 const obligations=out.filter(s=>['ar','ap'].includes(s.card_id)).flatMap(s=>s.rows.map(r=>({...r,id:'due:'+r.id,fields:{...r.fields,date:r.fields.due,direction:s.card_id==='ar'?'คาดรับ':'คาดจ่าย'}})));
 out.push(...monthly(ctx,'cashCalendar','ปฏิทินเงินรับ–จ่าย','FIN','วันที่รับ–จ่ายจริงแยกจากวันครบกำหนดของยอดค้างปัจจุบัน · ไม่ใช่ Bank Cash',events.concat(obligations),{sources:['finSales','finPurchases','finExpenses','finOther'],columns:cashColumns,forMonth:(m,rs)=>({groups:grouping(rs,'direction')}),notes:['ยอดคาดรับ / คาดจ่ายมาจากทะเบียนค้าง ณ วันอ่าน ไม่ใช่สถานะย้อนหลัง','รายการไม่ทราบวันครบกำหนดดูในลูกหนี้ / เจ้าหนี้','วันที่ชำระผูกกับยอดเต็มทะเบียน ยังไม่ยืนยันจำนวนเงินที่ชำระจริง']}));
 out.push(...monthly(ctx,'finCost','รายการซื้อและค่าใช้จ่าย FIN','FIN','ทะเบียนซื้อและค่าใช้จ่าย FIN แยกกัน · ไม่ใช่ COGS และไม่บวกซ้ำกับ Monthly expenses',sets.finPurchases.concat(sets.finExpenses),{sources:['finPurchases','finExpenses'],columns,value:null,status:'RECONCILIATION_REQUIRED',forMonth:(m,rs)=>({groups:grouping(rs,'ledger')})}));
 const transfer=grid(ctx.sources.finTransfers,[C('date','วันที่ (กรอก)','date',true),C('amount','จำนวนเงิน (กรอก)','money',true),C('from','บัญชีจาก (เลือก)','text',true),C('to','บัญชีถึง (เลือก)','text',true),C('note','หมายเหตุ (กรอก)')]);
 const adjust=grid(ctx.sources.finAdjust,[C('date','วันที่ (กรอก)','date',true),C('account','ชื่อบัญชีที่ต้องการปรับปรุงจำนวนเงิน (เลือก)','text',true),C('amount','จำนวนเงิน (กรอก)','money',true),C('note','หมายเหตุ (กรอก)')]);
 out.push(...monthly(ctx,'cashAdjustments','โอนระหว่างบัญชีและปรับยอด','FIN','แสดงแยกจากรายได้ / ค่าใช้จ่าย · ไม่สมมติว่าทุกบัญชีอยู่ในขอบเขตบริษัท',transfer.concat(adjust),{sources:['finTransfers','finAdjust'],columns:[C('date','วันที่','date'),C('amount','จำนวนเงิน','money'),C('from','บัญชีจาก'),C('to','บัญชีถึง'),C('account','บัญชีปรับยอด'),C('note','หมายเหตุ')],value:null,status:'REVIEW'}));
 return out;
}
function procurement(ctx){
 const cols=[C('date','วันที่เปิด PR','date',true),C('item','รายการ','text',true),C('qty','จำนวน','number',true),C('unit','หน่วย'),C('state','สถานะ'),C('party','บริษัท'),C('document','PO NO.'),C('poDate','วันที่เปิด PO','date'),C('price','ราคา','number'),C('amount','TOTAL','money'),C('gross','GRAND TOTAL','money'),C('due','DUE DATE','date'),C('receivedDate','วันที่ได้รับ','date'),C('received','Q\'TY','number'),C('closed','สถานะ PO'),C('balance','BALANCE','number')];
 const rows=grid(ctx.sources.pr,cols).map(r=>{r.valueMinor=r.fields.amount;return r;});
 const columns=[C('date','วันที่ PR','date'),C('document','PO'),C('party','ผู้ขาย'),C('item','รายการ'),C('qty','จำนวนขอ','number'),C('received','รับตามทะเบียน','number'),C('balance','คงค้างต้นทาง','number'),C('unit','หน่วย'),C('amount','มูลค่าก่อน VAT','money'),C('due','ครบกำหนด','date'),C('closed','สถานะ PO'),C('state','สถานะ PR')];
 const out=monthly(ctx,'prRegister','ทะเบียน PR','PR','ใช้รวม PR 2026 เป็นทะเบียนหลัก · ไม่บวกสำเนา PU staging ซ้ำ',rows,{sources:['pr'],columns});
 const open=rows.filter(r=>r.fields.state!=='ยกเลิก'&&r.fields.closed!=='ปิด PO').map(r=>({...r,issues:[...r.issues],fields:{...r.fields},valueMinor:null}));
 for(const r of open){const f=r.fields;
  if(!f.document)issue(r,'PO_MISSING');if(!f.due)issue(r,'DUE_MISSING');
  if(f.received===null)issue(r,'RECEIPT_UNKNOWN');
  if(f.balance===null&&f.qty!==null&&f.received!==null){f.balance=f.qty-f.received;f.balanceBasis='จำนวนขอ − จำนวนรับที่ระบุ';}
  if(f.balance===null)issue(r,'BALANCE_MISSING');
  if(f.qty!==null&&f.received!==null&&f.balance!==null&&Math.abs(f.qty-f.received-f.balance)>1e-6)issue(r,'QUANTITY_RECONCILIATION');
  if(f.balance<0||f.received<0||f.qty<0)issue(r,'NEGATIVE_QUANTITY');
  if(f.price===null||f.price<0)issue(r,'PRICE_MISSING');
  if(f.document&&f.date&&f.date<=ctx.asOf&&f.balance!==null&&f.price!==null&&f.balance>=0&&f.price>=0&&!r.issues.some(x=>/QUANTITY|RECEIPT|INVALID_(qty|received|balance|price)/.test(x)))r.valueMinor=multiplyMinor(f.balance,f.price);
  f.upperBound=f.amount!==null&&f.amount>=0?f.amount:null;f.outstanding=r.valueMinor;f.balanceBasis=f.balanceBasis||'คงค้างตามช่อง BALANCE';
 }
 out.push(snapshot(ctx,'purchase','จัดซื้อค้างรับ','PR','คงค้างที่กระทบจำนวนแล้ว × ราคาต่อหน่วยก่อน VAT · ไม่แทนช่องรับว่างด้วยศูนย์',open,{sources:['pr','receiving'],kind:'MONEY',current:true,columns:[...columns,C('balanceBasis','ที่มาคงค้าง'),C('outstanding','ยอดค้างที่ตรวจได้','money'),C('upperBound','เพดานเต็มรายการ','money')],groups:grouping(open,'party'),notes:['คงค้างคำนวณจากจำนวนขอ − จำนวนรับได้เฉพาะเมื่อทั้งสองช่องระบุจำนวนจริง','เพดานเต็มรายการเป็นขอบเขตสูงสุดของมูลค่าขอซื้อ ไม่ใช่ยอดค้างที่ยืนยัน','PR ที่ไม่เคยเปิด PO ยังไม่ใช่ภาระผูกพันที่ยืนยัน']}));
 const approval=grid(ctx.sources.approval,[C('document','approval_id','text',true),C('record','record_key'),C('amount','requested_amount','money'),C('state','status'),C('date','requested_at','date'),C('note','decision_note')]).map(r=>{if(/เทส|test|ทดสอบ/i.test(r.fields.note))issue(r,'TEST_RECORD');return r;});
 out.push(snapshot(ctx,'approval','หลักฐานอนุมัติจัดซื้อ','PU','อ่านสถานะต้นทาง · รายการทดสอบไม่ใช้เป็นวงเงินอนุมัติธุรกิจ',approval,{sources:['approval'],current:true,columns:[C('document','เลขอนุมัติ'),C('record','รายการอ้างอิง'),C('amount','วงเงิน','money'),C('state','สถานะ'),C('note','หมายเหตุ')],value:approval.filter(r=>!r.issues.length).length||null}));
 const budget=grid(ctx.sources.budget,[C('period','budget_month','month',true),C('department','department_name'),C('amount','budget_amount','money',true),C('warning','warning_percent','number'),C('note','note')]);
 out.push(snapshot(ctx,'purchaseBudget','งบจัดซื้อตามต้นทาง','PU','ยังไม่กำหนดงบแทนเจ้าของ · เปรียบเทียบได้เมื่อมีงบช่วงและหน่วยงานเดียวกัน',budget,{sources:['budget'],current:true,columns:[C('period','เดือน'),C('department','หน่วยงาน'),C('amount','งบ','money'),C('warning','เตือน (%)','number'),C('note','หมายเหตุ')]}));
 return out;
}
function production(ctx){
 const cols=[C('date','วันที่ผลิต','date',true),C('shift','กะ'),C('machine','เครื่องจักร','text',true),C('job','Job no.','text',true),C('part','Part no.','text',true),C('customer','Customer','text',true),C('item','Part name'),C('po','P/O'),C('plan','Q\'ty','number'),C('ok','OK','number',true),C('ng','NG','number'),C('op','OP','text',true),C('employee','ชื่อพนักงาน'),C('hours','เวลาทำงาน_ชม.','number'),C('record','PR Record ID','text',true),C('state','PR Record Status','text',true)];
 let rows=duplicates(grid(ctx.sources.production,cols),'record').filter(r=>r.fields.state!=='DELETED');
 for(const r of rows){if(r.fields.state!=='ACTIVE')issue(r,'RECORD_STATUS_UNKNOWN');if(r.fields.ok<0||r.fields.ng<0)issue(r,'NEGATIVE_QUANTITY');if(!r.fields.ng&&r.fields.ng!==0)issue(r,'NG_UNKNOWN');if(r.fields.date>ctx.asOf)issue(r,'FUTURE_DATE');}
 const columns=[C('date','วันที่ผลิต','date'),C('shift','กะ'),C('machine','เครื่อง'),C('job','Job'),C('part','Part'),C('customer','ลูกค้า'),C('po','PO'),C('op','OP'),C('plan','จำนวนเต็ม Job','number'),C('ok','OK','number'),C('ng','NG','number'),C('hours','ชั่วโมงรายงาน','number'),C('employee','พนักงาน')];
 const aggregate=rs=>[...new Set(rs.map(r=>r.fields.op||'ไม่ระบุ OP'))].map(op=>{const selected=rs.filter(r=>(r.fields.op||'ไม่ระบุ OP')===op);return {name:op,rows:selected.length,reviewRows:selected.filter(r=>r.issues.length).length,ok:total(selected.map(r=>r.fields.ok)),ng:total(selected.map(r=>r.fields.ng)),unknownNg:selected.filter(r=>r.fields.ng===null).length};});
 const out=monthly(ctx,'productionRegister','ผลผลิตตามรายงาน PC','PC','รายการ ACTIVE แยก OP / เครื่อง / กะ · ไม่บวก OP1 และ OP2 เป็นชิ้นสำเร็จ และไม่ใช้จำนวนเต็ม Job เป็น WIP',rows,{sources:['production'],columns,forMonth:(m,rs)=>({groups:aggregate(rs)}),notes:['ผลรวม OK/NG ในแต่ละ OP เป็นยอดที่รายงาน ไม่ใช่ยอดคงเหลือ','กรณีรูปแบบรายงานสะสมยังไม่ยืนยัน ใช้เป็นหลักฐานและไม่ออกพยากรณ์ส่งมอบที่รับรอง']});
 const plan=grid(ctx.sources.plan,[C('date','วันที่','date',true),C('type','ประเภทงาน'),C('job','Job no.','text',true),C('part','Part no.','text',true),C('customer','Customer'),C('item','Part name'),C('po','PO no.'),C('qty','Qty.','number',true),C('due','Due date','date'),C('process1','Process (1)'),C('process2','Process (2)'),C('process3','Process (3)'),C('process4','Process (4)'),C('process5','Process (5)')]);
 const planCols=[C('date','วันที่เปิดแผน','date'),C('job','Job'),C('part','Part'),C('customer','ลูกค้า'),C('item','ชื่อชิ้นงาน'),C('po','PO'),C('qty','จำนวนเต็มแผน','number'),C('due','กำหนดส่ง','date'),C('type','ประเภท'),C('process1','ขั้น 1'),C('process2','ขั้น 2'),C('process3','ขั้น 3'),C('process4','ขั้น 4'),C('process5','ขั้น 5')];
 out.push(...monthly(ctx,'planRegister','ทะเบียนแผนผลิต','PC','เดือนวันที่เปิดแผนตามต้นทาง · ไม่ใช่เดือนที่ผลิตเสร็จหรือจำนวนคงเหลือ',plan,{sources:['plan'],columns:planCols}));
 out.push(snapshot(ctx,'stockplan','แผนผลิตทั้งหมดตามทะเบียน','PC','จำนวนเต็ม Job แสดงเพื่อค้นแผนเท่านั้น · ห้ามใช้แทน Balance',plan,{sources:['plan'],columns:planCols,current:true}));
 const ng=grid(ctx.sources.ng,[C('date','Date','date',true),C('job','Job No.'),C('part','Part no.'),C('customer','Customer'),C('item','Part name'),C('defect','ปัญหาที่พบ'),C('qty','จำนวนที่พบ','number',true),C('disposition','การดำเนินการ'),C('machine','Machine no.'),C('shift','Shift'),C('record','NG Record ID'),C('state','NG Record Status')]).filter(r=>r.fields.state!=='DELETED');
 out.push(...monthly(ctx,'ngRegister','ทะเบียนปัญหา NG','PC','จำนวนที่พบตามวันที่จริง · ไม่บวกกับ NG ในรายงานผลิตซ้ำ และไม่แปลงเป็นมูลค่าสูญเสีย',ng,{sources:['ng'],columns:[C('date','วันที่','date'),C('job','Job'),C('part','Part'),C('customer','ลูกค้า'),C('defect','อาการ'),C('qty','จำนวนพบ','number'),C('disposition','การดำเนินการ'),C('machine','เครื่อง'),C('shift','กะ')]}));
 const unknown=rows.concat(plan,ng).filter(r=>!r.fields.date);
 out.push(snapshot(ctx,'productionUnassigned','รายการผลิตที่ยังระบุวันไม่ได้','PC','เก็บแถววันที่ผิดหรือว่างไว้ตรวจสอบ · ไม่เดาวันหรือจัดเข้าเดือนจากเลข Job',unknown,{sources:['production','plan','ng'],current:true,columns:[C('date','วันที่','date'),C('job','Job'),C('part','Part'),C('customer','ลูกค้า'),C('ok','OK','number'),C('qty','จำนวน','number'),C('defect','อาการ')]}));
 return out;
}
function capacity(ctx){
 const meta=grid(ctx.sources.capacityMeta,[C('active','Active_Snapshot_ID','text',true),C('validation','Validation_Status','text',true),C('status','Last_Run_Status','text',true)]);
 if(meta.length!==1||meta[0].fields.validation!=='PASS'||meta[0].fields.status!=='SUCCESS')throw Error('CAPACITY_SNAPSHOT_NOT_COMMITTED');
 const active=meta[0].fields.active;
 const cols=[C('date','Month','date',true),C('jobs','Plan_Jobs','number'),C('qty','Plan_Qty','number'),C('planned','Planned_Std_Hours','number'),C('gross','Gross_Capacity_Hours','number'),C('target','Target_Capacity_Hours','number'),C('actual','Actual_Used_Hours','number'),C('runtime','Actual_Runtime_Hours','number'),C('reported','Actual_Report_Hours','number'),C('trusted','Trusted_Planned_Hours','number'),C('review','Review_Planned_Hours','number'),C('load','Trusted_Util_Pct','number'),C('reviewLoad','Review_Load_Pct','number'),C('trust','ST_Trust_Pct','number'),C('state','Primary_Status'),C('snapshot','Snapshot_ID','text',true)];
 const rows=grid(ctx.sources.capacity,cols).filter(r=>r.fields.snapshot===active);
 if(!rows.length)throw Error('CAPACITY_ACTIVE_VERSION_MISSING');
 if(new Set(rows.map(r=>r.fields.date)).size!==rows.length)throw Error('CAPACITY_DUPLICATE_PERIOD');
 for(const r of rows){if(r.fields.gross!==r.fields.target)issue(r,'CAPACITY_TARGET_NOT_100');if(r.fields.state==='DATA_NOT_READY')issue(r,'CAPACITY_DATA_NOT_READY');}
 const months=[...new Set([...ctx.months,...rows.map(r=>r.fields.date?.slice(0,7)).filter(m=>m&&m>=ctx.months[0])])].sort();
 const out=months.map(m=>{const rs=rows.filter(r=>r.fields.date?.startsWith(m));return snapshot(ctx,'capacity','กำลังผลิตจาก Trusted Load','OEE','รุ่นที่ต้นทาง Commit และ PASS เท่านั้น · Trusted Load ที่เป้ากำลังผลิต 100% · แยก Review Load',rs,{sources:['capacity','capacityMeta'],kind:'CAPACITY',month:m,value:rs.length===1&&!rs[0].issues.includes('CAPACITY_TARGET_NOT_100')?rs[0].fields.load:null,columns:[C('date','เดือน','date'),C('jobs','Job','number'),C('qty','จำนวนแผน','number'),C('trusted','ชั่วโมงเชื่อถือได้','number'),C('review','ชั่วโมงรอตรวจ','number'),C('load','Trusted Load (%)','number'),C('reviewLoad','Review Load (%)','number'),C('gross','กำลังเต็ม (ชม.)','number'),C('actual','เวลาใช้ตามต้นทาง','number'),C('runtime','เวลาเครื่อง','number'),C('reported','เวลารายงาน','number'),C('trust','ST Trust (%)','number'),C('state','สถานะ'),C('snapshot','รุ่น')],summary:{activeSnapshot:active},notes:['ยอด Trusted Load ไม่รวมภาระงานที่ ST ยังรอตรวจ','เวลาเครื่องและเวลารายงานแสดงแยก ไม่ถือว่าเป็นเวลาเดียวกัน']});});
 const lines=grid(ctx.sources.capacityLine,[C('date','Month','date',true),C('line','Line_Name'),C('machines','Machine_Count','number'),C('days','Working_Days','number'),C('shifts','Shift_Count','number'),C('hours','Hours_Per_Shift','number'),C('gross','Gross_Capacity_Hours','number'),C('trusted','Trusted_Planned_Hours','number'),C('review','Review_Planned_Hours','number'),C('load','Trusted_Util_Pct','number'),C('actual','Actual_Used_Hours','number'),C('state','Primary_Status'),C('snapshot','Snapshot_ID')]).filter(r=>r.fields.snapshot===active);
 for(const r of lines){const f=r.fields;f.noOtHours=[f.machines,f.days,f.shifts].every(v=>v!==null)?f.machines*f.days*f.shifts*8:null;f.normalHours=[f.machines,f.days,f.shifts].every(v=>v!==null)?f.machines*f.days*f.shifts*11.5:null;}
 out.push(...monthly({...ctx,months},'capacityLines','กำลังผลิตแยกไลน์','OEE','8 ชั่วโมงไม่มี OT / 11.5 ชั่วโมงปกติ × จำนวนกะ × วันทำงาน × เครื่องในต้นทาง ที่ 100%',lines,{sources:['capacityLine','capacityMeta'],columns:[C('date','เดือน','date'),C('line','ไลน์'),C('machines','เครื่อง','number'),C('days','วันทำงาน','number'),C('shifts','กะ','number'),C('noOtHours','ไม่มี OT (ชม.)','number'),C('normalHours','ปกติ (ชม.)','number'),C('trusted','โหลดเชื่อถือได้ (ชม.)','number'),C('review','โหลดรอตรวจ (ชม.)','number'),C('load','Trusted Load (%)','number'),C('state','สถานะ')]}));
 const ops=grid(ctx.sources.capacityOp,[C('date','Month','date',true),C('op','Display_OP'),C('sourceOp','Source_OP'),C('process','Process_Name'),C('line','Line_Name'),C('qty','Planned_Qty','number'),C('actual','Actual_Qty','number'),C('trusted','Trusted_Planned_Hours','number'),C('review','Review_Planned_Hours','number'),C('included','Capacity_Included'),C('state','Trust_Status'),C('snapshot','Snapshot_ID')]).filter(r=>r.fields.snapshot===active);
 out.push(...monthly({...ctx,months},'capacityOperations','แผนเทียบผลจริงแยกกระบวนการ','OEE','ข้อมูลรุ่นใช้งานเดียวกับ Capacity · แยก Source OP / ไลน์ ไม่บวกจำนวนข้ามกระบวนการ',ops,{sources:['capacityOp','capacityMeta'],columns:[C('date','เดือน','date'),C('op','OP'),C('sourceOp','OP ต้นทาง'),C('process','กระบวนการ'),C('line','ไลน์'),C('qty','แผน (ชิ้น)','number'),C('actual','รายงานจริง (ชิ้น)','number'),C('trusted','โหลดเชื่อถือได้ (ชม.)','number'),C('review','โหลดรอตรวจ (ชม.)','number'),C('included','ใช้กำลังผลิต'),C('state','สถานะ')]}));
 return out;
}
function oee(ctx){
 const monthlyRows=grid(ctx.sources.oeeMonthly,[C('date','Month','month',true),C('revision','Revision'),C('state','Status'),C('oee','OEE %','number'),C('a','A %','number'),C('p','P %','number'),C('q','Q %','number'),C('ready','Ready To Close'),C('blockers','Blockers'),C('hash','Hash')]);
 // A published monthly KPI remains source evidence; never average daily percentages to fill a gap.
 const out=ctx.months.map(m=>{const rs=monthlyRows.filter(r=>r.fields.date===m);const valid=rs.length===1&&rs[0].fields.oee!==null;return snapshot(ctx,'oee','OEE รายเดือนตามต้นทาง','OEE','อ่าน OEE_MONTHLY_KPI ตามงวด · ไม่เฉลี่ยเปอร์เซ็นต์รายวันหรือแทน Q ที่ไม่ทราบด้วย 100%',rs,{sources:['oeeMonthly'],month:m,kind:'OEE',value:valid?rs[0].fields.oee:null,columns:[C('date','เดือน'),C('revision','รุ่น'),C('state','สถานะ'),C('oee','OEE (%)','number'),C('a','A (%)','number'),C('p','P (%)','number'),C('q','Q (%)','number'),C('ready','พร้อมปิดงวด'),C('blockers','ข้อจำกัด')],notes:['หากยังไม่มี Monthly KPI ให้ตรวจข้อมูลรายเครื่องใน OEE รายวัน','หลายรุ่นในเดือนเดียวกันต้องตรวจรุ่นใช้งานก่อนเลือกค่า']} );});
 const daily=grid(ctx.sources.oeeDaily,[C('date','date','date',true),C('shift','shift'),C('machine','machine'),C('line','lineLabel'),C('job','jobNo'),C('part','partNo'),C('customer','customer'),C('op','operation'),C('planned','plannedMin','number'),C('runtime','runtimeMin','number'),C('ok','ok','number'),C('ng','ng','number'),C('coverage','stCoveragePct','number'),C('a','availability','number'),C('p','performance','number'),C('q','quality','number'),C('oee','oee','number'),C('aState','aStatus'),C('pState','pStatus'),C('qState','qStatus'),C('state','oeeStatus')]);
 for(const r of daily)if(r.fields.state==='WAITING')issue(r,'OEE_WAITING');
 out.push(...monthly(ctx,'oeeDaily','OEE รายวัน / เครื่อง / กะ','OEE','ข้อเท็จจริงและสถานะ A/P/Q จาก OEE · ค่า WAITING ไม่ใช่ OEE 0%',daily,{sources:['oeeDaily'],columns:[C('date','วันที่','date'),C('machine','เครื่อง'),C('shift','กะ'),C('job','Job'),C('part','Part'),C('op','OP'),C('planned','แผน (นาที)','number'),C('runtime','เดินเครื่อง (นาที)','number'),C('ok','OK','number'),C('ng','NG','number'),C('coverage','ST Coverage (%)','number'),C('a','A ต้นทาง','number'),C('p','P ต้นทาง','number'),C('q','Q ต้นทาง','number'),C('oee','OEE ต้นทาง','number'),C('aState','สถานะ A'),C('pState','สถานะ P'),C('qState','สถานะ Q'),C('state','สถานะ OEE')],forMonth:(m,rs)=>({groups:grouping(rs,'aState')})}));
 const st=grid(ctx.sources.st,[C('record','ST_Key','text',true),C('part','Part_No'),C('customer','Customer'),C('op','OP'),C('machine','Machine'),C('st','Official_ST_Sec','number'),C('mode','Evidence_Mode'),C('confidence','Confidence_Score','number'),C('samples','Sample_Windows','number'),C('state','Status'),C('decision','Decision'),C('date','Last_Evidence_Date','date')]);
 for(const r of st){if(r.fields.mode==='LEGACY_BASELINE')issue(r,'ST_LEGACY_BASELINE');if(r.fields.st===null||r.fields.st<=0)issue(r,'ST_MISSING');r.fields.output8=r.fields.st>0?Math.floor(8*3600/r.fields.st):null;r.fields.output11=r.fields.st>0?Math.floor(11.5*3600/r.fields.st):null;}
 out.push(snapshot(ctx,'standardTime','มาตรฐานเวลาและที่มา','OEE','ใช้ Official ST ของ OEE · กำลังเชิงทฤษฎี 100% แยก 8 / 11.5 ชั่วโมงต่อเครื่องต่อกะ',st,{sources:['st'],current:true,columns:[C('part','Part'),C('customer','ลูกค้า'),C('op','OP'),C('machine','เครื่อง'),C('st','วินาที / ชิ้น','number'),C('output8','8 ชม. (ชิ้น)','number'),C('output11','11.5 ชม. (ชิ้น)','number'),C('mode','หลักฐาน'),C('confidence','คะแนนต้นทาง','number'),C('samples','ช่วงตัวอย่าง','number'),C('date','หลักฐานล่าสุด','date'),C('state','สถานะ')],notes:['ไม่ใช่กำลังส่งมอบที่รับรอง และไม่ใช้คอลัมน์ output 85% เดิม']}));
 const bom=duplicates(grid(ctx.sources.bom,[C('record','Routing_ID','text',true),C('bom','BOM_ID','text',true),C('revision','BOM_Revision'),C('sequence','Sequence','number'),C('op','Operation_No'),C('sourceOp','Source_OP'),C('type','Step_Type'),C('process','Process_Name'),C('machine','Main_Machine'),C('st','Standard_Time_Sec','number'),C('supplier','Supplier'),C('state','Operation_Status'),C('confidence','Confidence_Score','number')]),'record');
 for(const r of bom)if(r.fields.state!=='READY')issue(r,'BOM_INCOMPLETE');
 out.push(snapshot(ctx,'bom','BOM และเส้นทางผลิต','OEE','Routing ERP ตามรุ่นต้นทาง · READY เป็นสถานะข้อมูล ไม่ใช่การรับรองต้นทุนหรืออนุมัติ BOM',bom,{sources:['bom'],current:true,columns:[C('bom','BOM'),C('revision','รุ่น'),C('sequence','ลำดับ','number'),C('op','OP'),C('sourceOp','Source OP'),C('type','ชนิด'),C('process','กระบวนการ'),C('machine','เครื่อง'),C('st','ST (วินาที)','number'),C('supplier','ผู้รับจ้าง'),C('state','สถานะ')],groups:grouping(bom,'state')}));
 const epm=grid(ctx.sources.epm,[C('key','Key','text',true),C('value','Value'),C('description','Description')]);
 out.push(snapshot(ctx,'epm','กติกา EPM จากต้นทาง','OEE','แสดงกติกา EPM เป้า 100% · ยังไม่สร้างคะแนนพนักงานจากกติกาเพียงอย่างเดียว',epm,{sources:['epm'],current:true,value:null,status:'NO_RESULT_DATA',columns:[C('key','ตัวกำหนด'),C('value','ค่า'),C('description','คำอธิบาย')]}));
 return out;
}
function quality(ctx){
 const specs=[['qaNg','qaDefects','NG ที่ QA บันทึก',[C('date','วันที่พบ','date',true),C('record','NG ID','text',true),C('customer','Customer'),C('job','Job no.'),C('part','Part No.'),C('defect','อาการ NG'),C('qty','จำนวน NG','number'),C('state','Status')]],['qaInspection','qaInspection','บันทึกตรวจคุณภาพ',[C('date','วันที่ตรวจ','date',true),C('record','Inspection_ID','text',true),C('customer','ลูกค้า'),C('part','Part No.'),C('qty','จำนวนตรวจ','number'),C('ok','จำนวนผ่าน','number'),C('ng','จำนวน NG','number'),C('state','ผลการตรวจ')]],['qaComplaint','qaComplaint','ข้อร้องเรียนลูกค้า',[C('date','วันที่รับเรื่อง','date',true),C('record','Complaint_ID','text',true),C('customer','ลูกค้า'),C('part','Part No.'),C('defect','ปัญหาที่ลูกค้าแจ้ง'),C('qty','จำนวน','number'),C('state','สถานะ')]]];
 return specs.flatMap(([key,id,title,cols])=>monthly(ctx,id,title,'QA','เฉพาะบันทึกจริงในตาราง QA · ตารางว่างไม่ยืนยันว่าไม่มีปัญหาหรือ NG เป็นศูนย์',duplicates(grid(ctx.sources[key],cols),'record'),{sources:[key],columns:cols.map(c=>C(c[0],({date:'วันที่',record:'เลขรายการ',customer:'ลูกค้า',job:'Job',part:'Part',defect:'อาการ',qty:'จำนวน',state:'สถานะ',ok:'ผ่าน',ng:'NG'})[c[0]],c[2]))}));
}
function plating(ctx){
 const rows=duplicates(grid(ctx.sources.plating,[C('record','Transaction ID','text',true),C('date','Timestamp','date',true),C('actualDate','Actual Movement Date','date'),C('action','Action','text',true),C('job','Job No.','text',true),C('part','DWG. No.','text',true),C('customer','Customer','text',true),C('po','P/O'),C('supplier','Supplier'),C('type','Plating Type'),C('qty','Qty','number',true),C('ref','Cancel Ref Transaction ID'),C('originalAction','Cancel Original Action')]),'record');
 const byId=new Map(rows.map(r=>[r.fields.record,r])),cancelled=new Set(),inbound=text('ส่งออกไปชุบ'),outbound=text('รับกลับจากชุบ'),cancel=text('ยกเลิกรายการ');
 const identity=r=>JSON.stringify(['job','part','customer','po','supplier','type'].map(k=>normal(r.fields[k])));
 for(const r of rows){if(r.fields.actualDate)r.fields.date=r.fields.actualDate;if(r.fields.qty<0)issue(r,'NEGATIVE_QUANTITY');if(r.fields.date>ctx.asOf)issue(r,'FUTURE_DATE');
  if(![inbound,outbound,cancel].includes(r.fields.action))issue(r,'MOVEMENT_UNKNOWN');
  if(r.fields.action===cancel){const ref=byId.get(r.fields.ref);if(!ref||ref.issues.length||identity(ref)!==identity(r)||ref.fields.qty!==r.fields.qty||ref.fields.action!==r.fields.originalAction||cancelled.has(r.fields.ref)||!ref.fields.date||ref.fields.date>r.fields.date){issue(r,'CANCEL_UNVERIFIED');if(ref)issue(ref,'CANCEL_UNVERIFIED');}else cancelled.add(r.fields.ref);}
 }
 const resolver=require('./balance-model.cjs').resolver(ctx.sources),groups=new Map();
 for(const r of rows){const key=identity(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const balances=[...groups.entries()].map(([key,moves])=>{const first=moves[0],problems=[...new Set(moves.flatMap(r=>r.issues))],active=moves.filter(r=>r.fields.action!==cancel&&!cancelled.has(r.fields.record));
  const qty=problems.length?null:total(active.map(r=>r.fields.action===inbound?r.fields.qty:-r.fields.qty));
  const p=resolver.price(first.fields.customer,first.fields.part),r={id:key,source:first.source,fields:{...first.fields,qty:qty===null&&active.length===0&&!problems.length?0:qty,price:p.price??null,date:active.map(r=>r.fields.date).filter(Boolean).sort().at(-1)||null},issues:problems,valueMinor:null,movements:moves.map(r=>({record:r.fields.record,action:r.fields.action,qty:r.fields.qty,date:r.fields.date,cancelled:cancelled.has(r.fields.record),source:r.source}))};
  if(r.fields.qty<0)issue(r,'NEGATIVE_BALANCE');if(p.issue&&r.fields.qty!==0)issue(r,p.issue);if(!r.issues.length&&r.fields.qty!==null)r.valueMinor=r.fields.qty===0?0:multiplyMinor(r.fields.qty,r.fields.price);
  r.fields.amount=r.valueMinor;r.fields.daysSinceMovement=r.fields.date?Math.floor((Date.parse(ctx.asOf)-Date.parse(r.fields.date))/86400000):null;return r;
 });
 const cols=[C('job','Job'),C('customer','ลูกค้า'),C('part','Part'),C('po','PO'),C('supplier','ผู้รับชุบ'),C('type','ชนิดชุบ'),C('qty','คงค้าง (ชิ้น)','number'),C('price','ราคาขายอ้างอิง','number'),C('amount','มูลค่าขายอ้างอิง','money'),C('date','เคลื่อนไหวล่าสุด','date'),C('daysSinceMovement','วันจากครั้งล่าสุด','number')];
 return [snapshot(ctx,'plating','งานค้างที่ชุบภายนอก','SC','ส่งออก − รับกลับหลังตรวจรายการยกเลิก × ราคาขายอ้างอิง · ไม่ใช่ต้นทุน',balances,{sources:['plating','prices','customers','parts'],current:true,kind:'MONEY',columns:cols,notes:['วันจากการเคลื่อนไหวล่าสุดไม่ใช่อายุของชิ้นงานแต่ละ Lot','แยกจาก FG / Fac2 / QA และไม่บวกรวมเป็นทุนรวม']}),snapshot(ctx,'platingMovements','ทะเบียนรับ–ส่งชุบ','SC','หลักฐานการรับ ส่ง และยกเลิกทั้งหมด · ไม่รวม Qty ทุกการเคลื่อนไหวเป็นยอดคงเหลือ',rows,{sources:['plating'],current:true,columns:[C('date','วันที่','date'),C('record','เลขรายการ'),C('action','ประเภท'),...cols.slice(0,6),C('qty','จำนวน','number'),C('ref','ยกเลิกรายการอ้างอิง') ]})];
}
function planning(ctx){
 const calendar=grid(ctx.sources.calendar,[C('date','Date','date',true),C('work','Is Working Day','text',true),C('type','Work Type'),C('holiday','Holiday Name'),C('ot','Is OT Day')]);
 const machines=grid(ctx.sources.machines,[C('machine','Machine','text',true),C('line','Line'),C('state','Active Status'),C('hours','Default Machine Hours/Day','number'),C('capacity','Is Capacity Machine')]);
 const active=machines.filter(r=>r.fields.state==='ACTIVE'&&r.fields.capacity==='YES');
 const expected={'Cincom':35,'CNC/MN':9,'MC':4},machineCheck=Object.entries(expected).every(([line,count])=>active.filter(r=>r.fields.line===line).length===count)&&active.length===48;
 if(!machineCheck)for(const r of machines)issue(r,'MACHINE_BASE_MISMATCH');
 const schedule=grid(ctx.sources.schedule,[C('record','Plan ID','text',true),C('date','Plan Date','date',true),C('machine','Machine'),C('job','Job No.'),C('customer','Customer'),C('part','Part No.'),C('qty','Plan Qty','number'),C('start','Start Date','date'),C('end','End Date','date'),C('shift','Shift'),C('state','Plan Status')]);
 const out=[snapshot(ctx,'machineBase','ฐานเครื่องจักร','PC','ตรวจฐาน CINCOM 35 / CNC 9 / MC 4 · ใช้เครื่อง ACTIVE และ Is Capacity Machine เท่านั้น',machines,{sources:['machines'],current:true,columns:[C('machine','เครื่อง'),C('line','ไลน์'),C('state','สถานะ'),C('capacity','ใช้ Capacity'),C('hours','ชั่วโมงต้นทาง','number')],value:machineCheck?active.length:null}),...monthly(ctx,'productionSchedule','ตารางจัดเครื่องผลิต','PC','ตารางจัดเครื่องตามวันที่แผน · NEXT_AVAILABLE ยังไม่ใช่กะที่ยืนยัน',schedule,{sources:['schedule'],columns:[C('date','วันที่แผน','date'),C('machine','เครื่อง'),C('job','Job'),C('part','Part'),C('customer','ลูกค้า'),C('qty','จำนวน','number'),C('start','เริ่ม','date'),C('end','จบ','date'),C('shift','กะ'),C('state','สถานะ')]})];
 const next=new Date(ctx.asOf.slice(0,7)+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 for(const m of [ctx.asOf.slice(0,7),next.toISOString().slice(0,7)]){
  const rs=calendar.filter(r=>r.fields.date?.startsWith(m)),end=new Date(Date.UTC(+m.slice(0,4),+m.slice(5),0)).getUTCDate(),complete=rs.length===end&&new Set(rs.map(r=>r.fields.date)).size===end;
  const remaining=complete?rs.filter(r=>r.fields.date>ctx.asOf&&r.fields.work==='YES').length:null;
  out.push(snapshot(ctx,'productionForecast','ความพร้อมคาดการณ์ผลผลิต','PC','เดือนนี้และเดือนหน้า: ต้องใช้ผลผลิตจริง OP1/OP2 × วันทำงานคงเหลือ · แยก 8 / 11.5 ชั่วโมง ไม่แปลงด้วยอัตราส่วนโดยไม่มีหลักฐานชั่วโมง',rs,{sources:['calendar','production','machines','schedule'],month:m,value:null,status:'FORECAST_INPUT_REVIEW',columns:[C('date','วันที่','date'),C('work','วันทำงาน'),C('type','ประเภทวัน'),C('holiday','วันหยุด'),C('ot','วัน OT')],metrics:[{label:'วันทำงานที่เหลือหลังวันข้อมูล',value:remaining,unit:'วัน'},{label:'เครื่องตามฐานที่ตรวจได้',value:machineCheck?48:null,unit:'เครื่อง'}],notes:['วันปัจจุบันไม่ถูกนับเป็นวันเต็มที่เหลือ','ฐานรายงาน PC ยังไม่ยืนยันการบันทึกแบบรายครั้งหรือยอดสะสม และแผนส่วนใหญ่ระบุ NEXT_AVAILABLE จึงยังไม่คำนวณยอดส่งมอบจากการเฉลี่ย','ไม่มีผลผลิตฐาน 8 และ 11.5 ชั่วโมงที่แยกยืนยัน จึงไม่สมมติสัดส่วนกำลังผลิต']}));
 }
 return out;
}
function deliveryEvidence(ctx){
 const cols=[C('record','order_id','text',true),C('customer','customer'),C('po','po_no'),C('part','part_no'),C('qty','order_qty','number'),C('issued','issued_qty','number'),C('remaining','remaining_po_qty','number'),C('date','due_date','date'),C('lastDate','transaction_last_date','date'),C('transactions','transaction_count','number'),C('state','delivery_status'),C('sourceType','source_type'),C('closed','closed_flag')];
 const rows=grid(ctx.sources.delivery,cols);
 return monthly(ctx,'otd','หลักฐานตรวจส่งมอบตรงเวลา','SO','จัดตามเดือนกำหนดส่ง · วันเคลื่อนไหวล่าสุดไม่ยืนยันวันส่งครบต่อออเดอร์ จึงยังไม่ใช้แทน OTD',rows,{sources:['delivery','shipments'],value:null,status:'OTD_RECONCILIATION_REQUIRED',columns:[C('record','ออเดอร์'),C('customer','ลูกค้า'),C('po','PO'),C('part','Part'),C('qty','สั่ง','number'),C('issued','จ่ายตาม SO','number'),C('remaining','ค้างตาม SO','number'),C('date','กำหนดส่ง','date'),C('lastDate','เคลื่อนไหวล่าสุด','date'),C('transactions','รายการเชื่อม','number'),C('state','สถานะ'),C('closed','ปิดออเดอร์')],notes:['ยังไม่ใช้วันปิดออเดอร์เป็นวันส่งจริง','การคำนวณอัตรา OTD ต้องกระทบการส่งครบและรายการยกเลิกโดยไม่จับคู่ PO/Part ซ้ำ']});
}
function sourceCoverage(ctx){
 const rows=Object.entries(ctx.sources).map(([key,s])=>({id:key,source:source(s),fields:{key,tab:s.tab,range:s.range,readAt:s.readAt,rows:s.values.slice(1).filter(r=>r.some(v=>text(v)!=='')).length,complete:s.complete?'อ่านครบช่วง':'อ่านไม่ครบ'},issues:s.complete?[]:['SOURCE_INCOMPLETE']}));
 return snapshot(ctx,'sourceCoverage','ความครอบคลุมแหล่งข้อมูล','HUB','ทะเบียนแหล่งที่อ่านสำหรับรอบนี้ · ตารางสำเนา ประวัติระบบ และ Log ไม่บวกซ้ำเป็นข้อมูลธุรกิจ',rows,{sources:Object.keys(ctx.sources),current:true,columns:[C('key','ชุดข้อมูล'),C('tab','ชีต'),C('range','ช่วงที่อ่าน'),C('rows','แถวไม่ว่าง','number'),C('readAt','เวลาอ่าน (UTC)'),C('complete','ความครบของช่วง')],notes:['อ่านครบช่วงไม่เท่ากับข้อมูลธุรกิจครบหรือปิดงวด','ใช้วันที่รายการและข้อจำกัดในรายละเอียดแต่ละส่วน · เวลาที่อ่านไม่ใช่เวลาที่ต้นทางปรับปรุง','การนำเข้ารอบนี้เป็นข้อมูลที่ตรวจแล้ว ยังไม่มีการซิงก์ Sheets อัตโนมัติที่ยืนยันผล']});
}
function buildDomainSnapshots(input){
 if(input.company!=='P&T'||day(input.asOf)!==input.asOf||!input.months?.length||input.months.some(m=>month(m)!==m))throw Error('INVALID_SCOPE');
 const out=[...finance(input),...procurement(input),...production(input),...capacity(input),...oee(input),...quality(input),...plating(input),...planning(input),...deliveryEvidence(input),sourceCoverage(input)];
 if(new Set(out.map(s=>s.company+'|'+s.month+'|'+s.card_id)).size!==out.length)throw Error('DUPLICATE_SNAPSHOT');
 return out;
}
module.exports={buildDomainSnapshots,grid,snapshot,source,day,month,total,C,VERSION};
