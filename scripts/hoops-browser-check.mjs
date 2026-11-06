import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import express from 'express';
import {makeHandler} from '../api/multiplayer.js';
const memory=new Map();let testServer;
if(!process.env.GOLF_URL){const app=express();app.use(express.json());app.post('/api/multiplayer',makeHandler({get:async key=>memory.get(key),save:async(key,before,after)=>{if((memory.get(key)??null)!==before)return 0;memory.set(key,after);return 1;}}));app.get('/pvp',(q,r)=>r.sendFile(path.resolve('dist/pvp/index.html')));app.get('/pvp/controller',(q,r)=>r.sendFile(path.resolve('dist/pvp/controller.html')));app.get('/solo',(q,r)=>r.sendFile(path.resolve('dist/solo/index.html')));app.use(express.static('dist'));testServer=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});}

const profile=await mkdtemp(path.join(tmpdir(),'hoops-browser-'));
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
 ws.onmessage=ev=>{const msg=JSON.parse(ev.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text+' | '+(msg.params.exceptionDetails.exception?.description??''));};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const evaluate=async(s,expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Browser evaluation failed');return r.result.value;};
 const wait=async(s,expression,loops=700)=>{for(let i=0;i<loops;i++){if(await evaluate(s,expression))return;await pause(100);}throw Error('Timed out: '+expression);};
 async function tab(url,width,height){const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});await call('Page.enable',{},sessionId);await call('Runtime.enable',{},sessionId);await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500},sessionId);await call('Page.navigate',{url},sessionId);return sessionId;}
 async function screenshot(s,name){await mkdir('artifacts',{recursive:true});const r=await call('Page.captureScreenshot',{format:'png'},s);await writeFile('artifacts/'+name+'.png',Buffer.from(r.data,'base64'));}
 const base=process.env.GOLF_URL||'http://127.0.0.1:'+testServer.address().port;
 const desktop=await tab(base,1440,900);await wait(desktop,'!!window.__pvp');
 await evaluate(desktop,"document.querySelector('[data-game=hoops]').click();document.getElementById('create').click()");
 await wait(desktop,'!!window.__pvp.match');const code=await evaluate(desktop,'window.__pvp.match.code');
 assert.equal(await evaluate(desktop,'window.__pvp.match.game'),'hoops');
 // Host can flip the lobby between games before tip-off.
 await evaluate(desktop,"document.querySelector('[data-lobby-game=golf]').click()");await wait(desktop,"window.__pvp.match.game==='golf'");
 await evaluate(desktop,"document.querySelector('[data-lobby-game=hoops]').click()");await wait(desktop,"window.__pvp.match.game==='hoops'");
 console.log('PASS: hoops picked at creation and switched live in the lobby.');
 const phones=[];
 for(let i=0;i<2;i++){
  const phone=await tab(base+'/pvp/controller?code='+code,390,900);phones.push(phone);
  await wait(phone,'!!window.__pvpPhone');await evaluate(phone,`document.getElementById('name').value='Shooter ${i+1}';document.getElementById('connect').click()`);
  await wait(phone,'!!window.__pvpPhone.player');await evaluate(phone,"document.getElementById('ready').click()");
 }
 await wait(desktop,"window.__pvp.match.players.length===2&&window.__pvp.match.players.every(p=>p.ready)");
 await screenshot(desktop,'hoops-lobby');
 await evaluate(desktop,"document.getElementById('startmatch').click()");
 await wait(phones[0],"window.__pvpPhone.match?.phase==='ready'");
 await wait(phones[1],"window.__pvpPhone.match?.phase==='ready'");
 const ui=await evaluate(phones[0],"JSON.stringify({hoops:!document.getElementById('hoops-controls').hidden,golf:document.getElementById('golf-controls').hidden,zone:!document.getElementById('meterzone').hidden,swing:document.getElementById('swingtext').textContent})");
 assert.equal(ui,'{"hoops":true,"golf":true,"zone":true,"swing":"HOLD TO CHARGE"}');
 await screenshot(phones[0],'hoops-phone');
 console.log('PASS: phone swaps to the hoops flick controller with a target power zone.');
 if(testServer){const r=JSON.parse(memory.get('pvp:'+code));console.log('shots scheduled:',r.game,r.phase);}
 for(let i=0;i<10;i++){
  const turn=await evaluate(desktop,'window.__pvp.match.turn');
  const phone=phones[i%2];
  await wait(phone,`window.__pvpPhone.match?.phase==='ready'&&window.__pvpPhone.match.turn===${turn}`);
  await evaluate(phone,"document.getElementById('swing').scrollIntoView({block:'center'})");
  const point=await evaluate(phone,"(()=>{const r=document.getElementById('swing').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},phone);
  await pause(70);
  const rate=await evaluate(phone,'12+window.__pvpPhone.targetPower*260');
  for(let n=0;n<7;n++){await pause(30);await evaluate(phone,`window.dispatchEvent(new DeviceMotionEvent('devicemotion',{rotationRate:{alpha:${rate},beta:0,gamma:0},interval:30}))`);}
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},phone);
  await wait(phone,"window.__pvpPhone.match?.phase==='flight'");
  await wait(desktop,`window.__pvp.match?.phase==='flight'&&window.__pvp.match.shot?.player===${turn}`);
  if(i===0)await screenshot(desktop,'hoops-flight');
  await wait(desktop,"window.__pvp.match?.phase!=='flight'");
  if(i===0)await screenshot(desktop,'hoops-basket');
  console.log('PASS: shot '+(i+1)+' flicked from the phone and settled on the big screen.');
 }
 await wait(desktop,"window.__pvp.match?.phase==='finished'");
 const scores=await evaluate(desktop,"window.__pvp.match.players.map(p=>p.hscore)");
 assert.deepEqual(scores,[13,13],'perfect power from every spot should score every point');
 await screenshot(desktop,'hoops-final');
 const desktopHud=await evaluate(desktop,"document.getElementById('turn').textContent+' / '+document.getElementById('hole').textContent");
 assert.ok(desktopHud.includes('Shot'),'hoops HUD replaces hole language: '+desktopHud);
 assert.deepEqual(errors,[]);
 console.log('PASS: gyro flick power, 5-spot shootout, scoreboard and tie finish; no browser exceptions.');
 await call('Browser.close');
}finally{ws?.close();browser.kill();if(testServer)await new Promise(resolve=>{testServer.closeAllConnections();testServer.close(resolve);});}
