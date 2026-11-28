'use strict';
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const fixture = JSON.parse(fs.readFileSync('tmp/week4-fixture.json','utf8').replace(/^\uFEFF/,''));
assert.match(fixture.database,/^equipify_week4_test_[a-z0-9_]+$/);
assert.equal(process.env.EQUIPIFY_DB_PORT,'13307');
const ids = fixture.ids;
let checks = 0;
function check(value,label) { assert.ok(value,label); checks++; }
async function race(jobs) {
  const barrier = crypto.randomBytes(8).toString('hex');
  const file = path.resolve('tmp/week4-barrier-' + barrier);
  const workers = jobs.map(job => {
    const child = spawn(process.env.EQUIPIFY_TEST_PHP || 'C:/xampp1/php/php.exe',
      ['backend/tests/week4_assignment_worker.php',fixture.database,Buffer.from(JSON.stringify({...job,barrier})).toString('base64')],
      {env:{...process.env,EQUIPIFY_MAIL_ENABLE_SEND:'0'},windowsHide:true});
    let stdout = '', stderr = '';
    let readyResolve, readyReject;
    const ready = new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    child.stdout.on('data',data=>{stdout+=data; if(stdout.includes('READY\n') || stdout.includes('READY\r\n')) readyResolve();});
    child.stderr.on('data',data=>{stderr+=data;});
    const result = new Promise((resolve,reject)=>{
      child.once('error',error=>{readyReject(error);reject(error);});
      child.once('exit',code=>{
        if(code!==0) { const error=new Error('Worker failed: '+stderr);readyReject(error);reject(error); }
        else { try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1))); } catch(error) {readyReject(error);reject(error);} }
      });
    });
    // Attach immediately so an early worker failure cannot become unhandled.
    result.catch(()=>{});
    return {child,ready,result};
  });
  const timeout = setTimeout(()=>workers.forEach(w=>w.child.kill()),20000);
  try {
    await Promise.all(workers.map(w=>w.ready)); fs.writeFileSync(file,'start');
    return await Promise.all(workers.map(w=>w.result));
  } finally { clearTimeout(timeout); if(fs.existsSync(file)) fs.unlinkSync(file); workers.forEach(w=>{if(w.child.exitCode===null)w.child.kill();}); }
}
function assignment(delivery,manager,start,end,driver=ids.delivery_personnel,version=0) {
  return {action:'assign',delivery,manager,driver,start,end,version};
}
(async()=>{
  const d=fixture.races;
  let results=await race([assignment(d[0],ids.area_manager,'2091-01-01T10:00','2091-01-01T12:00'),assignment(d[1],ids.manager_peer,'2091-01-01T11:00','2091-01-01T13:00')]);
  check(results.filter(r=>r.status===200).length===1 && results.filter(r=>r.status===409).length===1,'same-area managers cannot double book overlapping driver');
  check(results.find(r=>r.status===200).data.delivery.status==='pending','concurrent winner remains pending');
  results=await race([assignment(d[2],ids.area_manager,'2091-02-01T10:00','2091-02-01T11:00'),assignment(d[3],ids.manager_peer,'2091-02-01T11:00','2091-02-01T12:00')]);
  check(results.every(r=>r.status===200),'adjacent concurrent reservations both succeed');
  results=await race([assignment(d[4],ids.area_manager,'2091-03-01T10:00','2091-03-01T11:00'),assignment(d[4],ids.manager_peer,'2091-03-01T12:00','2091-03-01T13:00',ids.driver_two)]);
  check(results.filter(r=>r.status===200).length===1 && results.filter(r=>r.status===409).length===1,'stale same-delivery edit is rejected');
  results=await race([assignment(d[5],ids.area_manager,'2091-04-01T10:00','2091-04-01T11:00'),{action:'cancel',delivery:d[5],manager:ids.manager_peer,version:0}]);
  check(results.filter(r=>r.status===200).length===1 && results.filter(r=>r.status===409).length===1,'cancellation and assignment cannot overwrite each other');
  const v=fixture.vehicles, r=fixture.vehicle_races;
  // A fleet edit and reservation must share the area mutex as well.
  for (const action of ['retire','maintenance']) {
    const delivery=action==='retire'?r[6]:r[7];
    results=await race([{...assignment(delivery,ids.area_manager,'2096-05-01T10:00','2096-05-01T11:00'),vehicle:v.first},
      {action,vehicle:v.first,manager:ids.manager_peer}]);
    check(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,'vehicle '+action+' cannot race a reservation');
    const cleanup=results[0].status===200
      ? {action:'cancel',delivery,manager:ids.area_manager,version:1}
      : {action:action==='retire'?'restore':'available',vehicle:v.first,manager:ids.manager_peer};
    const cleaned=await race([cleanup]);check(cleaned[0].status===200,'fleet race cleanup releases only its own synthetic resource');
  }
  results=await race([{...assignment(r[0],ids.area_manager,'2096-01-01T10:00','2096-01-01T12:00'),vehicle:v.first},
    {...assignment(r[1],ids.manager_peer,'2096-01-01T11:00','2096-01-01T13:00',ids.driver_two),vehicle:v.first}]);
  check(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,'different drivers cannot double book a vehicle');
  check(results.find(x=>x.status===200).data.delivery.status==='assigned','combined concurrent winner assigned');
  results=await race([{...assignment(r[2],ids.area_manager,'2096-02-01T10:00','2096-02-01T11:00'),vehicle:v.first},
    {...assignment(r[3],ids.manager_peer,'2096-02-01T11:00','2096-02-01T12:00',ids.driver_two),vehicle:v.first}]);
  check(results.every(x=>x.status===200),'adjacent vehicle windows both reserve successfully: '+JSON.stringify(results));
  results=await race([{...assignment(r[4],ids.area_manager,'2096-03-01T10:00','2096-03-01T11:00'),vehicle:v.first},
    {...assignment(r[4],ids.manager_peer,'2096-03-01T12:00','2096-03-01T13:00',ids.driver_two),vehicle:v.peer}]);
  check(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,'both-resource stale edit rejected');
  results=await race([{...assignment(r[5],ids.area_manager,'2096-04-01T10:00','2096-04-01T11:00'),vehicle:v.first},
    {action:'cancel',delivery:r[5],manager:ids.manager_peer,version:0}]);
  check(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,'combined assignment versus cancellation is atomic');
  console.log('PASS: '+checks+' actual multi-process concurrency checks (22 worker transactions).');
})().catch(error=>{console.error(error);process.exitCode=1;});
