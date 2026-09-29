'use strict';
const fs=require('node:fs'),path=require('node:path');
const {buildDomainSnapshots}=require('../lib/domain-model.cjs');
const [inputFile,outputFile]=process.argv.slice(2),root=path.resolve(__dirname,'..');
if(!inputFile||!outputFile)throw Error('Usage: PRIVATE_INPUT PRIVATE_OUTPUT');
for(const file of [inputFile,outputFile])if(path.resolve(file)===root||path.resolve(file).startsWith(root+path.sep))throw Error('PRIVATE_DATA_MUST_STAY_OUTSIDE_REPOSITORY');
const snapshots=buildDomainSnapshots(JSON.parse(fs.readFileSync(inputFile,'utf8')));
fs.mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(snapshots));
console.log(JSON.stringify({snapshots:snapshots.length,cards:new Set(snapshots.map(s=>s.card_id)).size,rows:snapshots.reduce((n,s)=>n+s.rows.length,0),reviews:snapshots.reduce((n,s)=>n+s.summary.reviewRows,0)}));
