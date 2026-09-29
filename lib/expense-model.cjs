'use strict';
const {createHash}=require('node:crypto');
const {multiplyMinor}=require('./money.cjs');
const text=v=>String(v??'').trim();
const HEADERS=['เดือน','ต้นทุน','รายการต้นทุน','จำนวนเงิน','ประเภทต้นทุนหลัก','เดือน (ตัวเลข)','ปี','บริษัท'];
const VERSION='1.0.0-expense-evidence';
const sum=values=>{const valid=values.filter(v=>v!==null);if(!valid.length)return null;const n=valid.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(n))throw Error('MONEY_RANGE_EXCEEDED');return n;};
function amount(v){
 if(v==null||text(v)==='')return null;
 if(typeof v!=='number'&& !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text(v)))return null;
 const n=Number(text(v).replace(/,/g,''));return Number.isFinite(n)?multiplyMinor(n):null;
}
function buildExpenseSnapshots(source,months,asOf){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||Number.isNaN(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf)throw Error('INVALID_AS_OF');
 if(!source.values?.length||!source.spreadsheetId||!Number.isInteger(source.gid)||!Number.isFinite(Date.parse(source.readAt)))throw Error('INVALID_SOURCE');
 const headers=source.values[0].map(text);
 for(const h of HEADERS)if(headers.filter(x=>x===h).length!==1)throw Error('HEADER_MISSING_OR_AMBIGUOUS:'+h);
 const confirmations=source.companyConfirmations??[],confirmedRows=new Map();
 if(!Array.isArray(confirmations))throw Error('INVALID_COMPANY_CONFIRMATIONS');
 const sourceContentHash=createHash('sha256').update(JSON.stringify(source.values)).digest('hex');
 for(const c of confirmations){
  if(!c||!text(c.id)||c.company!=='P&T'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)||!Number.isFinite(Date.parse(c.confirmedAt))||!text(c.statement)||c.sourceContentHash!==sourceContentHash||!Array.isArray(c.sourceRows)||!c.sourceRows.length)throw Error('INVALID_COMPANY_CONFIRMATION');
  for(const rowNumber of c.sourceRows){
   const cells=source.values[rowNumber-1];
   if(!Number.isInteger(rowNumber)||rowNumber<2||!cells||confirmedRows.has(rowNumber))throw Error('INVALID_CONFIRMATION_ROW');
   const period=Number(cells[headers.indexOf('ปี')])+'-'+String(Number(cells[headers.indexOf('เดือน (ตัวเลข)')])).padStart(2,'0');
   if(text(cells[headers.indexOf('บริษัท')])||period!==c.month)throw Error('CONFIRMATION_SCOPE_CONFLICT');
   confirmedRows.set(rowNumber,c);
  }
 }
 const all=[],unassigned=[];
 source.values.slice(1).forEach((cells,i)=>{
  if(!cells.some(v=>v!==null&&v!==undefined&&text(v)!==''))return;
  const row=Object.fromEntries(headers.map((h,j)=>[h,cells[j]]));
  const year=Number(row['ปี']),month=Number(row['เดือน (ตัวเลข)']);
  const validPeriod=Number.isInteger(year)&&year>=2000&&year<=2100&&Number.isInteger(month)&&month>=1&&month<=12;
  const period=validPeriod?year+'-'+String(month).padStart(2,'0'):null;
  const confirmation=confirmedRows.get(i+2),sourceCompany=text(row['บริษัท']);
  const issues=[],company=confirmation?confirmation.company:sourceCompany,category=text(row['ต้นทุน']),item=text(row['รายการต้นทุน']),mainType=text(row['ประเภทต้นทุนหลัก']);
  const rawValueMinor=amount(row['จำนวนเงิน']);
  if(!company)issues.push('COMPANY_MISSING');
  if(!validPeriod)issues.push('PERIOD_INVALID');
  const nameMonth=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].findIndex(x=>x.toLowerCase()===text(row['เดือน']).toLowerCase())+1;
  if(validPeriod&&(!nameMonth||nameMonth!==month))issues.push('PERIOD_CONFLICT');
  if(rawValueMinor===null)issues.push('AMOUNT_MISSING');
  if(!category||!item||!mainType)issues.push('CLASSIFICATION_MISSING');
  const r={id:source.tab+':'+(i+2),company,month:period,mainType,category,item,rawValueMinor,valueMinor:issues.length?null:rawValueMinor,status:issues.length?'REVIEW':'INCLUDED',issues,source:{spreadsheetId:source.spreadsheetId,tab:source.tab,gid:source.gid,row:i+2,readAt:source.readAt}};
  if(confirmation){r.sourceCompany=sourceCompany;r.companyConfirmation={id:confirmation.id,confirmedAt:confirmation.confirmedAt,statement:confirmation.statement,sourceContentHash};}
  (period?all:unassigned).push(r);
 });
 const latestMonth=all.filter(r=>r.company==='P&T'||!r.company).map(r=>r.month).sort().at(-1)||null;
 return months.map(month=>{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>asOf.slice(0,7))throw Error('INVALID_MONTH');
  const periodRows=all.filter(r=>r.month===month),rows=periodRows.filter(r=>r.company==='P&T'||!r.company);
  const included=rows.filter(r=>r.status==='INCLUDED'),review=rows.filter(r=>r.status==='REVIEW');
  const unassignedPeriodRows=unassigned.filter(r=>r.company==='P&T'||!r.company).length;
  const knownSubtotalMinor=sum(included.map(r=>r.valueMinor)),reviewKnownMinor=sum(review.map(r=>r.rawValueMinor));
  const issues=Object.fromEntries([...new Set(rows.flatMap(r=>r.issues))].map(code=>[code,rows.filter(r=>r.issues.includes(code)).length]));
  const groups=new Map();
  for(const r of rows){const key=JSON.stringify([r.mainType,r.category,r.item]);if(!groups.has(key))groups.set(key,{mainType:r.mainType,category:r.category,item:r.item,rows:0,includedRows:0,reviewRows:0,knownSubtotalMinor:null,reviewKnownMinor:null});const g=groups.get(key);g.rows++;if(r.status==='INCLUDED'){g.includedRows++;g.knownSubtotalMinor=sum([g.knownSubtotalMinor,r.valueMinor]);}else{g.reviewRows++;g.reviewKnownMinor=sum([g.reviewKnownMinor,r.rawValueMinor]);}}
  const scope={companyRule:'เฉพาะแถวระบุ P&T · แถวไม่ระบุบริษัทรอยืนยันและไม่รวมในยอด',unassignedCompanyRows:rows.filter(r=>!r.company).length,unassignedPeriodRows,excludedOtherCompanyRows:periodRows.length-rows.length,sourceLatestMonth:latestMonth,periodClosed:null,fieldsAvailable:['month','mainType','category','item','amount','company'],fieldsUnavailable:['supplier','invoice','quantity','unitPrice','transactionDate','itemCode']};
  const confirmed=rows.filter(r=>r.companyConfirmation);
  if(confirmed.length){scope.companyRule='เฉพาะ P&T ตามต้นทางหรือคำยืนยันของผู้ใช้ · คงค่าบริษัทเดิมในหลักฐาน';scope.companyConfirmedRows=confirmed.length;scope.companyConfirmations=confirmations.filter(c=>c.month===month).map(c=>({id:c.id,company:c.company,confirmedAt:c.confirmedAt,statement:c.statement,sourceContentHash:c.sourceContentHash,rows:c.sourceRows.length}));}
  const summary={version:VERSION,rows:rows.length,valuedRows:included.length,reviewRows:review.length,unknownAmountRows:rows.filter(r=>r.rawValueMinor===null).length,knownSubtotalMinor,reviewKnownMinor,knownRegisterMinor:sum(rows.map(r=>r.rawValueMinor)),issues,scope,groups:[...groups.values()],sourceWriteCount:0,businessCertified:false,refreshMode:'IMPORTED_SNAPSHOT',sources:[{spreadsheetId:source.spreadsheetId,tab:source.tab,gid:source.gid,row:1,readAt:source.readAt}]};
  const partial=review.length>0||unassignedPeriodRows>0;
  return {company:'P&T',month,card_id:'expenses',title:'ค่าใช้จ่ายตาม Monthly expenses',source_code:'EXP',kind:'MONEY',basis:'จำนวนเงินตาม Monthly expenses · หมวดเดิม · เฉพาะแถวระบุ P&T · ไม่ใช่ต้นทุนขาย',value_numeric:knownSubtotalMinor===null?null:knownSubtotalMinor/100,value_status:!rows.length?'NO_PERIOD_DATA':knownSubtotalMinor===null?'UNKNOWN_VALUE':partial?'PARTIAL_UNBOUNDED':'REGISTER_VALUE',decision_use:partial?'REVIEW':'SCOPED_USE',production_accepted:false,freshness_status:'CURRENT',data_as_of:asOf,source_read_at:source.readAt,operational_unknown_rows:review.length,valuation_unknown_rows:summary.unknownAmountRows,content_hash:createHash('sha256').update(JSON.stringify({month,rows,scope,version:VERSION})).digest('hex'),summary,rows};
 });
}
module.exports={buildExpenseSnapshots,amount,VERSION};
