'use strict';
// Inputs contain private company data. Keep both input/output outside the repository.
const fs=require('node:fs'),path=require('node:path');
const {buildSnapshots}=require('../lib/revenue-model.cjs');
const [inputFile,outputDir,asOf,...months]=process.argv.slice(2);
if(!inputFile||!outputDir||!/^\d{4}-\d{2}-\d{2}$/.test(asOf||'')||!months.length||months.some(m=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)))throw Error('Usage: node scripts/prepare-revenue-import.cjs PRIVATE_INPUT PRIVATE_OUTPUT YYYY-MM-DD YYYY-MM ...');
const root=path.resolve(__dirname,'..');
for(const file of [inputFile,outputDir])if(path.resolve(file)===root||path.resolve(file).startsWith(root+path.sep))throw Error('PRIVATE_DATA_MUST_STAY_OUTSIDE_REPOSITORY');
const snapshots=buildSnapshots(JSON.parse(fs.readFileSync(inputFile,'utf8')),months,asOf);
fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,'snapshots.json'),JSON.stringify(snapshots));
console.log(JSON.stringify(snapshots.map(s=>({card:s.card_id,month:s.month,value:s.value_numeric,...s.summary})),null,2));
