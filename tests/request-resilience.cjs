'use strict';
// Synthetic transport tests: no credentials or business records leave this process.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('  function headers('),html.indexOf('  async function audit('));
const reply=(body,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(body)});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function harness(fetch){
  const timers=new Map();let timer=0;
  const ctx={SUPABASE_URL:'https://demo.invalid',SUPABASE_KEY:'demo',sessionRefresh:null,AbortController,
    state:{requestEpoch:0,session:{access_token:'old',refresh_token:'refresh-old'},user:{id:'demo'}},fetch,
    setTimeout(fn,ms){assert.equal(ms,20000);timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);}};
  ctx.saveSession=s=>{ctx.state.session=s;};vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,timers,logout(){ctx.state.requestEpoch++;ctx.state.session=null;ctx.state.user=null;ctx.sessionRefresh=null;}};
}
(async()=>{
  let refreshes=0;const gate=deferred(),late=deferred(),calls=[];
  const h=harness(async(url,opt)=>{
    calls.push({url,opt});
    if(url.includes('/auth/')){refreshes++;await gate.promise;return reply({access_token:'new',refresh_token:'refresh-new',user:{id:'demo'}});}
    if(opt.headers.Authorization==='Bearer old'){
      if(url.endsWith('late'))await late.promise;
      return reply({message:'expired'},401);
    }
    return reply([{ok:true}]);
  });
  const requests=Array.from({length:10},(_,i)=>h.ctx.api('cards'+i));
  const lateRequest=h.ctx.api('late');await tick();assert.equal(refreshes,1,'parallel expired reads share one refresh');
  gate.resolve();await Promise.all(requests);late.resolve();await lateRequest;
  assert.equal(refreshes,1,'late old-token 401 reuses the already rotated token');assert.equal(h.timers.size,0);
  assert.equal(calls.filter(c=>c.url.includes('/rest/')&&c.opt.headers.Authorization==='Bearer new').length,11);

  let attempts=0;const denied=harness(async()=>{attempts++;return reply({message:'forbidden'},403);});
  await assert.rejects(denied.ctx.api('cards'),e=>e.status===403);assert.equal(attempts,1,'403 is never refreshed or retried');
  attempts=0;const failed=harness(async()=>{attempts++;return reply({message:'unavailable'},503);});
  await assert.rejects(failed.ctx.api('actions',{method:'POST',body:{title:'DEMO'}}),e=>e.status===503);
  assert.equal(attempts,1,'failed writes are not automatically replayed');

  attempts=0;const expired=harness(async url=>{
    attempts++;return url.includes('/auth/')?reply({access_token:'new',refresh_token:'r'}):reply({message:'expired'},401);
  });
  await assert.rejects(expired.ctx.api('cards'),e=>e.status===401);assert.equal(attempts,3,'at most one authenticated retry');

  const pending=deferred();let authReads=0;
  const loggedOut=harness(async url=>{if(url.includes('/auth/'))authReads++;await pending.promise;return reply({message:'expired'},401);});
  const oldRead=assert.rejects(loggedOut.ctx.api('cards'),/เซสชันเปลี่ยน/);loggedOut.logout();pending.resolve();await oldRead;
  assert.equal(authReads,0,'late 401 cannot refresh after logout');
  const rotate=deferred();const stopped=harness(async()=>{await rotate.promise;return reply({access_token:'new',refresh_token:'r'});});
  const oldRefresh=assert.rejects(stopped.ctx.refresh(),/เซสชันเปลี่ยน/);stopped.logout();rotate.resolve();await oldRefresh;
  assert.equal(stopped.ctx.state.session,null,'late refresh cannot restore a logged-out session');

  // A response can deliver headers and then stall while downloading its JSON body.
  for(const mode of ['body','headers']){
    const slow=harness(async(url,opt)=>{
      const wait=()=>new Promise((resolve,reject)=>opt.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
      return mode==='headers'?wait():{ok:true,status:200,text:wait};
    });
    const outcome=assert.rejects(slow.ctx.authFetch('/auth/v1/token',{}),e=>e.code==='REQUEST_TIMEOUT'&&/20/.test(e.message));
    await tick();assert.equal(slow.timers.size,1,'deadline remains active while consuming body');
    for(const fire of [...slow.timers.values()])fire();await outcome;assert.equal(slow.timers.size,0);
  }
  let malformed=true;const invalid=harness(async()=>reply(malformed?{}:{access_token:'valid',refresh_token:'valid-r'}));
  await assert.rejects(invalid.ctx.refresh(),/ไม่ครบ/);assert.equal(invalid.ctx.state.session.access_token,'old');
  malformed=false;await invalid.ctx.refresh();assert.equal(invalid.ctx.state.session.access_token,'valid','failed refresh lock is released');
  console.log('PASS: concurrent and delayed 401s, bounded retry, no 403/write replay, logout races, header/body deadlines, malformed refresh recovery');
})().catch(err=>{console.error(err);process.exitCode=1;});
