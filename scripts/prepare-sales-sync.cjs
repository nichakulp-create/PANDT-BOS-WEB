'use strict';
const fs=require('node:fs'),path=require('node:path');
const {planSalesSync,importSql}=require('../lib/sales-sync.cjs');
const [sourceFile,baselineFile,outputDir,asOf,...months]=process.argv.slice(2);
if(!sourceFile||!baselineFile||!outputDir||!asOf||!months.length)throw Error('Usage: node scripts/prepare-sales-sync.cjs PRIVATE_SOURCE PRIVATE_BASELINE PRIVATE_OUTPUT YYYY-MM-DD YYYY-MM ...');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
function outside(file){let p=path.resolve(file);while(!fs.existsSync(p))p=path.dirname(p);const real=fs.realpathSync(p);if(real===root||real.startsWith(root+path.sep))throw Error('PRIVATE_DATA_MUST_STAY_OUTSIDE_REPOSITORY');}
[sourceFile,baselineFile,outputDir].forEach(outside);
const plan=planSalesSync(JSON.parse(fs.readFileSync(sourceFile,'utf8')),JSON.parse(fs.readFileSync(baselineFile,'utf8')),months,asOf);
fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
for(const [name,value] of [['plan.json',JSON.stringify(plan)],['import.sql',importSql(plan)]]){const file=path.join(outputDir,name);outside(file);fs.writeFileSync(file,value,{mode:0o600});}
console.log(JSON.stringify({mode:plan.mode,months:plan.report.length,changed:plan.changed.length,unchanged:plan.report.length-plan.changed.length,sourceWriteCount:0}));
