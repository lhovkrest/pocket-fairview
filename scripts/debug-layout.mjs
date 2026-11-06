import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import express from 'express';
import {makeHandler} from '../api/multiplayer.js';
const memory=new Map();
const app=express();app.use(express.json());
app.post('/api/multiplayer',makeHandler({get:async key=>memory.get(key),save:async(key,before,after)=>{if((memory.get(key)??null)!==before)return 0;memory.set(key,after);return 1;}}));
app.get('/pvp',(q,r)=>r.sendFile(path.resolve('dist/pvp/index.html')));
app.get('/pvp/controller',(q,r)=>r.sendFile(path.resolve('dist/pvp/controller.html')));
app.use(express.static('dist'));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const profile=await mkdtemp(path.join(tmpdir(),'fairway-layout-'));
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
 let active;
 for(let i=0;i<100;i++){try{active=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await pause(100);}}
 const [port,endpoint]=active.trim().split('\n');
 ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 const pending=new Map();let seq=0;
 ws.onmessage=ev=>{const msg=JSON.parse(ev.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await call('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 await call('Page.enable',{},sessionId);await call('Runtime.enable',{},sessionId);
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/pvp'},sessionId);
 await pause(2500);
 await call('Runtime.evaluate',{expression:"document.querySelector('[data-game=hoops]').click();document.getElementById('create').click()",awaitPromise:true,returnByValue:true},sessionId);
 await pause(2500);
 const r=await call('Runtime.evaluate',{expression:`JSON.stringify(['gamemenu','gamepicker','lobbygames','room','room-grid','startmatch'].map(id=>{const el=id.includes('-')?document.querySelector('.'+id):document.getElementById(id);if(!el)return id+':missing';const b=el.getBoundingClientRect();const cs=getComputedStyle(el);return id+': x='+Math.round(b.x)+' y='+Math.round(b.y)+' w='+Math.round(b.width)+' h='+Math.round(b.height)+' display='+cs.display+' pos='+cs.position;}))`,returnByValue:true},sessionId);
 console.log(r.result.value);
 const r2=await call('Runtime.evaluate',{expression:`JSON.stringify([...document.querySelectorAll('#lobbygames button')].map(el=>{const b=el.getBoundingClientRect();return {text:el.textContent, x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height)}}))`,returnByValue:true},sessionId);
 console.log(r2.result.value);
 await call('Browser.close');
}finally{ws?.close();browser.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
