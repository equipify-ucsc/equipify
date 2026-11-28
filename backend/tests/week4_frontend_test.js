/* Live Chrome/CDP regression: real local API and isolated synthetic DB only.
 * Start a disposable Chrome profile with --remote-debugging-port=19223 first.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {setTimeout: pause} = require('node:timers/promises');
const fixture = JSON.parse(fs.readFileSync('tmp/week4-active.json','utf8').replace(/^\uFEFF/,''));
assert.match(fixture.database,/^equipify_week4_test_[a-z0-9_]+$/);
const base = 'http://127.0.0.1:18086';
const output = path.resolve('tmp/week4-browser-' + Date.now()); fs.mkdirSync(output,{recursive:true});
let checks=0, sequence=0;
const jobs=new Map(), errors=[], requests=[];
function check(value,label){assert.ok(value,label);checks++;}
(async()=>{
  const targets=await(await fetch('http://127.0.0.1:19223/json')).json();
  const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const job=jobs.get(message.id);if(!job)return;jobs.delete(message.id);clearTimeout(job.timer);message.error?job.reject(new Error(JSON.stringify(message.error))):job.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    else if(message.method==='Network.requestWillBeSent'&&message.params.request.url.includes('/backend/api/area-manager/deliveries'))requests.push(message.params.request);
  });
  function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{jobs.delete(id);reject(new Error('CDP timeout '+method));},15000);jobs.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
  async function wait(expression){for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Timed out: '+expression);}
  async function click(selector){await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');}
  async function screenshot(name){fs.writeFileSync(path.join(output,name+'.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));}
  const panel='.delivery-assignment-dialog', find=panel+' .delivery-dialog-fields > button', save=panel+' .delivery-dialog-actions button:last-child';
  async function dates(start,end){await evaluate(`(() => {const inputs=document.querySelectorAll('${panel} input');inputs[0].value='${start}';inputs[1].value='${end}';for(const input of inputs)input.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
  async function choose(driver){await click(find);await wait(`!document.querySelector('${panel} select').disabled`);await evaluate(`(() => {const select=document.querySelector('${panel} select');select.value='${driver}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
  async function confirm(){await click(save);await click(save);await wait(`!document.querySelector('${panel}') && !!document.querySelector('.delivery-feedback') && document.querySelector('.assignment-list').getAttribute('aria-busy')==='false'`);}
  async function login(role){const result=await evaluate(`fetch('${base}/backend/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'${role}@week4.test',password:'Week4-Test-Only!42',portal:'${role}'})}).then(r=>r.json())`);check(result.success===true,'synthetic '+role+' login succeeds');}
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  try{
    const marker=(await fetch(base+'/frontend/shared/api.js')).headers.get('x-equipify-test-database');check(marker===fixture.database,'browser targets current isolated test database');
    await command('Page.navigate',{url:base+'/frontend/shared/api.js'});await wait("document.readyState==='complete'");await login('area_manager');
    await command('Page.navigate',{url:base+'/frontend/Area%20Manager/Delivery%20Assignments/index.html'});await wait("!!document.querySelector('.delivery-assignment-actions')");await evaluate('document.fonts.ready');
    const deliveryId=await evaluate("Number(document.querySelector('.delivery-title').textContent.replace('Delivery #',''))");
    const card="[data-week4-target]";
    await evaluate("document.querySelector('.delivery-card').setAttribute('data-week4-target','true')");
    check(await evaluate("document.querySelector('.delivery-view-only').textContent==='Delivery reservations'"),'assignment mode advertised from real schema');
    await click(card+' .delivery-action');
    check(await evaluate(`document.querySelector('${panel}').open && document.activeElement===document.querySelector('${panel} input')`),'native modal focuses schedule field');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait(`!document.querySelector('${panel}')`);
    check(await evaluate(`document.activeElement===document.querySelector('${card} .delivery-action')`),'Escape closes and restores focus');
    await click(card+' .delivery-action');await click(find);
    check(await evaluate(`document.querySelector('${panel} .delivery-dialog-feedback').getAttribute('role')==='alert'`),'missing schedule has accessible validation');
    await dates('2100-01-01T10:00','2100-01-01T11:00');await click(find);
    await wait(`document.querySelector('${panel} .delivery-dialog-feedback').textContent.includes('No eligible personnel')`);
    check(await evaluate(`document.querySelector('${panel} select').disabled && document.querySelector('${save}').disabled`),'empty availability disables reservation');
    await dates('2093-01-01T10:00','2093-01-01T11:00');
    await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await click(find);await wait(`document.querySelector('${panel} .delivery-dialog-feedback').getAttribute('role')==='alert'`);
    check(await evaluate(`document.querySelector('${panel} select').disabled`),'availability network error cannot submit');
    await command('Network.emulateNetworkConditions',{offline:false,latency:1000,downloadThroughput:-1,uploadThroughput:-1});
    await click(find);
    check(await evaluate(`document.querySelector('${panel} .delivery-dialog-feedback').textContent==='Checking available personnel…' && document.querySelector('${find}').disabled`),'availability has a real loading state');
    await wait(`!document.querySelector('${panel} select').disabled`);
    await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await evaluate(`(() => {const select=document.querySelector('${panel} select');select.value='${fixture.ids.delivery_personnel}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    check(await evaluate(`document.querySelector('${panel} select').options.length===3`),'only two eligible real personnel offered');
    const postsBefore=requests.filter(r=>r.method==='POST').length;
    await click(save);
    check(requests.filter(r=>r.method==='POST').length===postsBefore,'review stage sends no mutation');
    check(await evaluate(`document.querySelector('${save}').textContent==='Confirm reservation'`),'explicit confirmation required');
    for(const width of [1440,768,390,320]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:940,deviceScaleFactor:1,mobile:width<768});await pause(350);
      check(await evaluate(`(() => {const d=document.querySelector('${panel}'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&d.scrollWidth<=d.clientWidth&&document.documentElement.scrollWidth<=innerWidth;})()`),'dialog and page fit '+width+'px');
      await screenshot('reservation-'+width);
    }
    // Verify the browser's native dialog keeps keyboard focus inside it.
    for(let i=0;i<9;i++)await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    check(await evaluate(`document.querySelector('${panel}').contains(document.activeElement)`),'native modal traps Tab navigation');
    await click(save);await wait(`!document.querySelector('${panel}') && !!document.querySelector('.delivery-feedback')`);
    await wait("document.querySelector('.assignment-list').getAttribute('aria-busy')==='false'");
    check(await evaluate("document.querySelector('.delivery-card').textContent.includes('Synthetic delivery_personnel') && document.querySelector('.delivery-card').textContent.includes('vehicle confirmation pending')"),'saved reservation reflects real driver and pending vehicle state');
    check(await evaluate("document.querySelector('.delivery-card .delivery-status').textContent==='Pending'"),'personnel reservation is not fully assigned');
    check(await evaluate("document.activeElement===document.getElementById('refreshBtn')"),'save restores useful page focus');
    await click('.delivery-card .delivery-action');await choose(fixture.ids.driver_two);await confirm();
    check(await evaluate("document.querySelector('.delivery-card').textContent.includes('Synthetic driver_two')"),'real reassignment persisted');
    // External edit makes the open form stale; its version must be rejected.
    await click('.delivery-card .delivery-action');await choose(fixture.ids.delivery_personnel);
    const external=await evaluate(`fetch('${base}/backend/api/area-manager/deliveries/${deliveryId}/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delivery_personnel_id:${fixture.ids.driver_two},scheduled_at:'2093-01-01T12:00',scheduled_end_at:'2093-01-01T13:00',expected_version:2})}).then(r=>r.status)`);
    check(external===200,'independent real edit advances assignment version');
    await click(save);await click(save);await wait(`document.querySelector('${panel} .delivery-dialog-feedback').getAttribute('role')==='alert'`);
    check(await evaluate(`document.querySelector('${panel} .delivery-dialog-feedback').textContent.includes('delivery changed')`),'stale form shows conflict without overwriting');
    await click(panel+' .delivery-dialog-actions button:first-child');await click('#refreshBtn');await wait("!!document.querySelector('.delivery-assignment-actions')");
    await click('.delivery-card .delivery-action--danger');
    await evaluate(`document.querySelector('${panel} textarea').value='Synthetic browser cancellation'`);await confirm();
    check(await evaluate("document.querySelector('.delivery-card .delivery-status').textContent==='Cancelled' && !document.querySelector('.delivery-card').querySelector('.delivery-assignment-actions')"),'cancellation persists and removes edit controls');
    await click('#deliveryNext');await wait("document.getElementById('deliveryPage').textContent.startsWith('Page 2')");
    check(await evaluate("!document.getElementById('deliveryPrevious').disabled"),'pagination retained');
    await click('[data-filter=pending]');await wait("document.getElementById('deliveryPage').textContent.startsWith('Page 1')");
    check(await evaluate("[...document.querySelectorAll('.delivery-card .delivery-status')].every(n=>n.textContent==='Pending')"),'real pending filter retained');
    await click('[data-filter=in_transit]');await wait("document.querySelector('.assignment-list').getAttribute('aria-busy')==='false'");
    check(await evaluate("[...document.querySelectorAll('.delivery-card .delivery-status')].every(n=>n.textContent==='In transit')"),'in-transit filter remains accurate with legacy fixtures');
    await click('[data-filter=all]');await wait("!!document.querySelector('.delivery-card')");
    await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await click('#refreshBtn');await wait("!!document.querySelector('.delivery-state--error')");check(true,'offline list shows error with retry');
    await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await click('.delivery-state-button');await wait("!!document.querySelector('.delivery-card')");
    check(true,'error retry returns to real data');
    // Vehicle phase: same real /assign API, full lifecycle and resource release.
    const vehicleDelivery=await evaluate("Number(document.querySelector('.delivery-assignment-actions .delivery-action').closest('.delivery-card').querySelector('.delivery-title').textContent.replace('Delivery #',''))");
    const vehicleCard=`[...document.querySelectorAll('.delivery-card')].find(c=>c.querySelector('.delivery-title').textContent==='Delivery #${vehicleDelivery}')`;
    await click('.delivery-assignment-actions .delivery-action');
    await dates('2098-01-01T10:00','2098-01-01T11:00');await choose(fixture.ids.delivery_personnel);
    check(await evaluate(`document.querySelector('${panel} .delivery-vehicle-select').options.length===3`),'vehicle selector contains only two eligible area vehicles');
    async function pickVehicle(id){await evaluate(`(() => {const s=document.querySelector('${panel} .delivery-vehicle-select');s.value='${id}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
    await pickVehicle(fixture.vehicles.first);
    for(const width of [1440,390,320]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:940,deviceScaleFactor:1,mobile:width<768});await pause(350);
      check(await evaluate(`(() => {const d=document.querySelector('${panel}'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&d.scrollWidth<=d.clientWidth;})()`),'vehicle modal fits '+width+'px');
      await screenshot('vehicle-'+width);
    }
    await confirm();
    check(await evaluate(`${vehicleCard}.querySelector('.delivery-status').textContent==='Assigned' && ${vehicleCard}.textContent.includes('W4-VAN-1')`),'combined UI save assigns both resources');
    await evaluate(`${vehicleCard}.querySelector('.delivery-action').click()`);await choose(fixture.ids.delivery_personnel);await pickVehicle(fixture.vehicles.peer);await confirm();
    check(await evaluate(`${vehicleCard}.textContent.includes('W4-VAN-2')`),'vehicle reassignment persists through real API');
    await evaluate(`${vehicleCard}.querySelector('.delivery-action').click()`);await dates('2098-01-02T10:00','2098-01-02T11:00');await choose(fixture.ids.delivery_personnel);await confirm();
    check(await evaluate(`${vehicleCard}.querySelector('.delivery-status').textContent==='Assigned'`),'rescheduling preserves explicit vehicle selection and Assigned');
    await evaluate(`${vehicleCard}.querySelector('.delivery-action--danger').click()`);
    await evaluate(`document.querySelector('${panel} textarea').value='Synthetic vehicle browser release'`);await confirm();
    check(await evaluate(`${vehicleCard}.querySelector('.delivery-status').textContent==='Cancelled'`),'combined cancellation persists');
    const released=await evaluate(`fetch('${base}/backend/api/area-manager/deliveries/${fixture.vehicle_races[8]}/available-vehicles?scheduled_at=2098-01-02T10%3A00&scheduled_end_at=2098-01-02T11%3A00').then(r=>r.json())`);
    check(released.success && released.data.items.some(v=>v.vehicle_id===fixture.vehicles.peer),'cancelled vehicle window is available again');
    await click('[data-filter=assigned]');await wait("document.querySelector('.assignment-list').getAttribute('aria-busy')==='false'");
    const lifecycleCard=`[...document.querySelectorAll('.delivery-card')].find(c=>c.querySelector('.delivery-title').textContent==='Delivery #${fixture.vehicle_lifecycle}')`;
    await evaluate(`${lifecycleCard}.querySelectorAll('.delivery-assignment-actions button')[2].click()`);await confirm();
    await click('[data-filter=in_transit]');await wait("!!document.querySelector('.delivery-card')");
    check(await evaluate("document.querySelector('.delivery-status').textContent==='In transit'"),'start delivery control performs real lifecycle transition');
    await click('.delivery-card .delivery-action');await confirm();
    check(await evaluate(`!${lifecycleCard}`),'completion releases in-transit delivery from filter');
    await click('[data-filter=all]');await wait("!!document.querySelector('.delivery-card')");
    const editable=await evaluate("!!document.querySelector('.delivery-assignment-actions .delivery-action')");check(editable,'an editable synthetic record remains');
    await click('.delivery-assignment-actions .delivery-action');
    await dates('2094-01-01T10:00','2094-01-01T11:00');
    await command('Network.emulateNetworkConditions',{offline:false,latency:1000,downloadThroughput:-1,uploadThroughput:-1});await click(find);
    await evaluate("EquipifyApi.invalidateSession()");
    check(await evaluate(`!document.querySelector('${panel}') && !document.querySelector('.delivery-card') && !document.querySelector('.delivery-feedback')`),'session invalidation removes private list, dialog and messages');
    await pause(1200);
    check(await evaluate(`!document.querySelector('${panel}') && !document.querySelector('.delivery-card')`),'late availability response cannot restore private session UI');
    await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await login('delivery_personnel');
    const notifications=await evaluate(`fetch('${base}/backend/api/notifications?type=delivery').then(r=>r.json())`);
    check(notifications.success && notifications.data.items.some(n=>n.body.includes('delivery #'+deliveryId)||n.body.includes('Delivery #'+deliveryId)),'personnel receive real database-backed assignment notifications');
    check(requests.some(r=>r.url.endsWith('/assign')&&r.method==='POST')&&requests.some(r=>r.url.endsWith('/cancel')&&r.method==='POST'),'browser uses actual assignment and cancellation endpoints');
    check(errors.length===0,'no uncaught JavaScript exceptions');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,errors,requests:requests.map(r=>({url:r.url,method:r.method}))},null,2));
    console.log('PASS: '+checks+' live Week 4 browser/frontend checks. Artifacts: '+output);
  }finally{socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
