import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const profile=await mkdtemp(path.join(tmpdir(),'fairway-browser-'));
const browser=spawn(process.env.BROWSER_BIN || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
 '--headless','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-gpu','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
 let active;
 for(let i=0;i<100;i++){try{active=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await pause(100);}}
 if(!active)throw Error('Browser debugger did not start');
 const [port,endpoint]=active.trim().split('\n');
 ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const pending=new Map();let seq=0;const errors=[];
 ws.onmessage=ev=>{const msg=JSON.parse(ev.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text+': '+msg.params.exceptionDetails.exception?.description);};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const evaluate=async(s,expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;};
 const wait=async(s,expression)=>{for(let i=0;i<450;i++){if(await evaluate(s,expression))return;await pause(100);}throw Error('Timed out: '+expression);};
 async function tab(url,width,height){const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});await call('Page.enable',{},sessionId);await call('Runtime.enable',{},sessionId);await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500},sessionId);await call('Page.navigate',{url},sessionId);return sessionId;}
 async function screenshot(s,name){await mkdir('artifacts',{recursive:true});const r=await call('Page.captureScreenshot',{format:'png'},s);await writeFile('artifacts/'+name+'.png',Buffer.from(r.data,'base64'));}
 const base=process.env.GOLF_URL||'http://localhost:3001';
 const desktop=await tab(base,1440,900);
 if(process.env.PRACTICE_ONLY){
  await wait(desktop,"!!window.__golf");await evaluate(desktop,"document.getElementById('practice').click();document.getElementById('hit').click()");
  await wait(desktop,"window.__golf.state==='flight'");await pause(1000);await screenshot(desktop,'public-shot');
  await wait(desktop,"window.__golf.state==='ready'||window.__golf.state==='complete'");assert.deepEqual(errors,[]);console.log('PASS: public desktop practice, shot effects, shot simulation, no browser exceptions.');await call('Browser.close');
 }else{
 await wait(desktop,"window.__golf && /^[A-Z2-9]{4}$/.test(document.getElementById('code').textContent)");
 await pause(1500);await screenshot(desktop,'lobby');
 const code=await evaluate(desktop,"document.getElementById('code').textContent");
 const phone=await tab(base+'/controller?code='+code,390,844);
 await wait(phone,"!!window.__golfController");await evaluate(phone,"document.getElementById('connect').click()");
 await wait(phone,"!document.getElementById('controller').hidden");
 await wait(desktop,"!document.getElementById('start').disabled");
 await evaluate(desktop,"document.getElementById('start').click()");
 await wait(phone,"window.__golfController.hud.state==='ready'");
 await pause(1500);await screenshot(desktop,'course');await screenshot(phone,'controller');
 const orientation=a=>`window.__testAlpha=${a};window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:window.__testAlpha,beta:70,gamma:0}));window.__testOrientationTimer??=setInterval(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:window.__testAlpha,beta:70,gamma:0})),40)`;
 await evaluate(phone,orientation(100));await evaluate(phone,"document.getElementById('motionaim').click()");
 await wait(phone,"window.__golfController.turnAim");await pause(100);
 await evaluate(phone,orientation(120));await wait(phone,"window.__golfController.aim===20");
 await wait(desktop,"Number(document.getElementById('aim').value)===20");
 await evaluate(phone,orientation(80));await wait(desktop,"Number(document.getElementById('aim').value)===-20");
 await evaluate(phone,"document.getElementById('recenter').click()");await wait(desktop,"Number(document.getElementById('aim').value)===0");
 console.log('PASS: relative left/right aiming and recenter on both screens.');
 const sensor="window.dispatchEvent(new DeviceMotionEvent('devicemotion',{rotationRate:{alpha:180,beta:10,gamma:5},interval:20}))";
 await evaluate(phone,sensor);
 await evaluate(phone,"document.getElementById('swing').scrollIntoView({block:'center'})");
 const point=await evaluate(phone,"(()=>{const r=document.getElementById('swing').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},phone);
 await evaluate(phone,orientation(140));assert.equal(await evaluate(phone,'window.__golfController.aim'),0);
 for(let i=0;i<12;i++){await pause(25);await evaluate(phone,sensor);}
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},phone);
 await call('Page.bringToFront',{},desktop);
 await wait(desktop,"window.__golf.state==='flight'");
 assert.equal(await evaluate(desktop,"Number(document.getElementById('strokes').textContent)"),1);
 await wait(desktop,"window.__golf.state==='ready'||window.__golf.state==='complete'");
 assert.ok(await evaluate(desktop,"window.__golf.ball.z<5"));
 console.log('PASS: swing holds its aim despite turning during the gesture.');
 // Finish each hole using a full-power real putt, then verify scorecard progression.
 for(let hole=0;hole<6;hole++){
   await wait(phone,`window.__golfController.hud.state==='ready'&&window.__golfController.hud.hole===${hole+1}`);
   await evaluate(desktop,"Object.assign(window.__golf.ball,{x:window.__golf.holes[window.__golf.hole].pin.x,z:window.__golf.holes[window.__golf.hole].pin.z+4,y:.22});document.querySelector('[data-club=putter]').click()");
   await wait(phone,"window.__golfController.hud.club==='putter'");
   await evaluate(phone,"document.getElementById('power').value=100;document.getElementById('touchhit').click()");
   await wait(desktop,"window.__golf.state==='complete'");
   console.log('PASS: hole '+(hole+1));
   if(hole<5){await evaluate(phone,"document.getElementById('next').click()");await wait(desktop,"window.__golf.state==='ready'");}
 }
 assert.equal(await evaluate(desktop,"document.getElementById('resulttitle').textContent"),'Round complete');
 await pause(2100);await screenshot(desktop,'scorecard');
 assert.deepEqual(errors,[]);
 console.log('PASS: 3D render, phone pairing, simulated motion swing, touch putts, all six holes, scorecard.');
 await call('Browser.close');
 }
}finally{ws?.close();browser.kill();}
