'use strict';
const fs=require('node:fs'),path=require('node:path');
const {buildBalanceSnapshots}=require('../lib/balance-model.cjs');
const [inputFile,outputFile]=process.argv.slice(2),root=path.resolve(__dirname,'..');
if(!inputFile||!outputFile)throw Error('Usage: PRIVATE_INPUT PRIVATE_OUTPUT');
for(const file of [inputFile,outputFile])if(path.resolve(file)===root||path.resolve(file).startsWith(root+path.sep))throw Error('PRIVATE_DATA_MUST_STAY_OUTSIDE_REPOSITORY');
const snapshots=buildBalanceSnapshots(JSON.parse(fs.readFileSync(inputFile,'utf8')));
fs.mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(snapshots));
console.log(JSON.stringify(snapshots.map(s=>({card:s.card_id,rows:s.summary.rows,valued:s.summary.valuedRows,review:s.summary.reviewRows,status:s.value_status,issues:s.summary.issues}))));
