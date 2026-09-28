'use strict';
const fs=require('node:fs'),path=require('node:path');
const {buildExpenseSnapshots}=require('../lib/expense-model.cjs');
const [inputFile,outputFile,asOf,...months]=process.argv.slice(2),root=path.resolve(__dirname,'..');
if(!inputFile||!outputFile||!months.length)throw Error('Usage: PRIVATE_INPUT PRIVATE_OUTPUT YYYY-MM-DD YYYY-MM ...');
for(const file of [inputFile,outputFile])if(path.resolve(file)===root||path.resolve(file).startsWith(root+path.sep))throw Error('PRIVATE_DATA_MUST_STAY_OUTSIDE_REPOSITORY');
const snapshots=buildExpenseSnapshots(JSON.parse(fs.readFileSync(inputFile,'utf8')),months,asOf);
fs.mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(snapshots));
console.log(JSON.stringify(snapshots.map(s=>({month:s.month,rows:s.summary.rows,included:s.summary.valuedRows,review:s.summary.reviewRows,unknownCompany:s.summary.scope.unassignedCompanyRows,amountUnknown:s.summary.unknownAmountRows,status:s.value_status}))));
