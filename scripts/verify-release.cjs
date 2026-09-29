'use strict';
// Dependency-free release gate. Browser acceptance is also required before merging.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length);scripts.forEach(s=>new vm.Script(s[1]));
for(const marker of ['P&T BOS Management','AI Manager','function ceoDashboard','function expenseDetail','function orderAging'])assert.ok(html.includes(marker),marker);
assert.ok(!/service[._-]role|SUPABASE_SERVICE_ROLE|sb_secret_/i.test(html),'server credential marker in client');
for(const test of ['revenue-model.cjs','order-followup.cjs','expense-model.cjs','balance-model.cjs','data-readiness.cjs','evidence-explanation.cjs'])execFileSync(process.execPath,[path.join(root,'tests',test)],{stdio:'inherit'});
console.log('PASS: static application release gate');
