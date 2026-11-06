import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import express from 'express';
import {makeHandler} from '../api/multiplayer.js';
const memory=new Map();let testServer;
if(!process.env.GOLF_URL){const app=express();app.use(express.json());app.post('/api/multiplayer',makeHandler({get:async key=>memory.get(key),save:async(key,before,after)=>{if((memory.get(key)??null)!==before)return 0;memory.set(key,after);return 1;}}));app.get('/pvp',(q,r)=>r.sendFile(path.resolve('dist/pvp/index.html')));app.get('/pvp/controller',(q,r)=>r.sendFile(path.resolve('dist/pvp/controller.html')));app.get('/solo',(q,r)=>r.sendFile(path.resolve('dist/solo/index.html')));app.use(express.static('dist'));testServer=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});}

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
 const base=process.env.GOLF_URL||'http://127.0.0.1:'+testServer.address().port;
 const desktop=await tab(base,1440,900);await wait(desktop,'!!window.__pvp');
 await evaluate(desktop,"document.getElementById('mode').value='multi';document.getElementById('create').click()");
 await wait(desktop,'!!window.__pvp.match');const code=await evaluate(desktop,'window.__pvp.match.code');
 const phones=[];
 for(let i=0;i<4;i++){
  const phone=await tab(base+'/pvp/controller?code='+code,390,900);phones.push(phone);
  await wait(phone,'!!window.__pvpPhone');await evaluate(phone,`document.getElementById('name').value='Golfer ${i+1}';document.getElementById('connect').click()`);
  await wait(phone,'!!window.__pvpPhone.player');await evaluate(phone,"document.getElementById('ready').click()");
 }
 await wait(desktop,"window.__pvp.match.players.length===4&&window.__pvp.match.players.every(p=>p.ready)");
 await screenshot(desktop,'pvp-lobby');await screenshot(phones[0],'pvp-phone-lobby');
 const viewer=await tab(base+'/pvp?code='+code,1280,800);await wait(viewer,"window.__pvp?.match?.players.length===4");
 await evaluate(desktop,"document.getElementById('startmatch').click()");await wait(phones[0],"window.__pvpPhone.match?.phase==='ready'");
 await wait(phones[1],"window.__pvpPhone.match?.phase==='ready'");assert.equal(await evaluate(phones[1],"document.getElementById('touchhit').disabled"),true);
 const denied=await evaluate(phones[1],"window.__pvpPhone.client.request({op:'shot',id:'wrong-turn',turnNumber:window.__pvpPhone.match.turnNumber,power:.5,aim:0,club:'putter'}).then(()=>false).catch(()=>true)");assert.equal(denied,true);
 console.log('PASS: four named golfers, ready lobby, second screen and wrong-turn enforcement.');
 // For local browser verification, place the four balls near the cup through
 // the isolated test store. Production has no mutation endpoint or test hook.
 if(testServer){const r=JSON.parse(memory.get('pvp:'+code));for(const p of r.players)p.ball={x:0,y:.22,z:-74,vx:0,vy:0,vz:0,moving:false};memory.set('pvp:'+code,JSON.stringify(r));}
 for(let i=0;i<4;i++){
  await wait(phones[i],`window.__pvpPhone.match?.phase==='ready'&&window.__pvpPhone.match.turn===${i}`);
  await evaluate(phones[i],"document.querySelector('[data-club=putter]').click()");
  if(i===1||i===2){
   await evaluate(phones[i],"document.getElementById('swing').scrollIntoView({block:'center'})");
   const point=await evaluate(phones[i],"(()=>{const r=document.getElementById('swing').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
   if(i===2)await evaluate(phones[i],"window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:70,gamma:0}))");
   await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},phones[i]);
   for(let n=1;n<=7;n++){await pause(40);await evaluate(phones[i],i===1?"window.dispatchEvent(new DeviceMotionEvent('devicemotion',{rotationRate:{alpha:180,beta:0,gamma:0},interval:40}))":`window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:${n*10},beta:70,gamma:0}))`);}
   await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},phones[i]);
  }else await evaluate(phones[i],"document.getElementById('power').value=100;document.getElementById('touchhit').click()");
  await wait(viewer,`window.__pvp.match?.phase==='flight'&&window.__pvp.match.turn===${i}`);
  if(i===0){await screenshot(viewer,'pvp-live-screen');await screenshot(phones[1],'pvp-waiting-phone');}
  await wait(desktop,"window.__pvp.match?.phase!=='flight'");console.log('PASS: golfer '+(i+1)+' '+(i===1?'gyro swing':i===2?'orientation fallback swing':'touch shot')+' synchronized to second screen.');
 }
 if(testServer){await wait(desktop,"window.__pvp.match?.phase==='hole-complete'");await evaluate(desktop,"document.getElementById('nextHole').click()");await wait(viewer,"window.__pvp.match?.hole===1&&window.__pvp.match.phase==='ready'");}
 // A phone can refresh and reclaim its original seat.
 await call('Page.reload',{},phones[0]);await wait(phones[0],'!!window.__pvpPhone');await evaluate(phones[0],"document.getElementById('connect').click()");await wait(phones[0],"window.__pvpPhone.player?.id===0");
 assert.deepEqual(errors,[]);console.log('PASS: controller reconnect; no browser exceptions.');await call('Browser.close');
}finally{ws?.close();browser.kill();if(testServer)await new Promise(resolve=>{testServer.closeAllConnections();testServer.close(resolve);});}
