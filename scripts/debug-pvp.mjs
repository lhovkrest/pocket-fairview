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
app.get('/solo',(q,r)=>r.sendFile(path.resolve('dist/solo/index.html')));
app.use(express.static('dist'));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const profile=await mkdtemp(path.join(tmpdir(),'fairway-debug-'));
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
 let active;
 for(let i=0;i<100;i++){try{active=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await pause(100);}}
 const [port,endpoint]=active.trim().split('\n');
 ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 const pending=new Map();let seq=0;const logs=[];
 ws.onmessage=ev=>{const msg=JSON.parse(ev.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')logs.push('EXC '+(msg.params.exceptionDetails.exception?.description??msg.params.exceptionDetails.text));else if(msg.method==='Runtime.consoleAPICalled')logs.push(msg.params.type+' '+msg.params.args.map(a=>a.value??a.description).join(' '));};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await call('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 await call('Page.enable',{},sessionId);await call('Runtime.enable',{},sessionId);
 const target=process.env.DEBUG_URL||'/pvp';
 await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+target},sessionId);
 await pause(4000);
 const r=await call('Runtime.evaluate',{expression:'JSON.stringify({pvp:!!window.__pvp, phone:!!window.__pvpPhone})',returnByValue:true},sessionId);
 console.log('state',r.result.value);
 console.log(logs.join('\n'));
 await call('Browser.close');
}finally{ws?.close();browser.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
