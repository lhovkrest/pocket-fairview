import {EV} from './protocol.js';
export function connectGame(){return window.GOLF_CLOUD?new CloudConnection():window.io();}
class CloudConnection{
 constructor(){this.handlers=new Map();this.connected=true;this.session=null;this.queue=[];this.cursor=0;this.version=-1;this.peer=false;this.id=Date.now()*100;this.pendingHUD=null;this.busy=false;queueMicrotask(()=>this.dispatch('connect'));}
 on(ev,fn){if(!this.handlers.has(ev))this.handlers.set(ev,[]);this.handlers.get(ev).push(fn);return this;}
 dispatch(ev,data){for(const fn of this.handlers.get(ev)??[])fn(data);}
 timeout(){return {emit:(ev,data,cb)=>this.emit(ev,data,res=>cb(res?.ok?null:Error(res?.message),res))};}
 async request(body){const response=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return response.json();}
 async emit(ev,data,cb){
  try{
   if(ev===EV.HOST_CREATE){const r=await this.request({op:'create'});if(r.ok){this.session={code:r.code,token:r.hostToken,role:'host'};this.poll();}cb?.(r);return;}
   if(ev===EV.CTRL_JOIN){const r=await this.request({op:'join',code:data.code,token:data.token});if(r.ok){this.session={code:r.code,token:r.token,role:'phone'};this.version=-1;this.poll();}cb?.(r);return;}
   if(ev===EV.HOST_SEND){if(data.ev===EV.HUD)this.pendingHUD=data.data;return;}
   if([EV.TRIGGER,EV.CTRL_START,EV.CONFIG].includes(ev)){
    if(ev===EV.TRIGGER&&data.kind==='aim')this.queue=this.queue.filter(e=>e.ev!==EV.TRIGGER||e.data.kind!=='aim');
    this.queue.push({id:++this.id,ev,data,sentAt:Date.now()});this.poll();
   }
  }catch{cb?.({ok:false,message:'Could not reach the clubhouse. Please retry.'});}
 }
 async poll(){
  if(!this.session||this.busy)return;clearTimeout(this.timer);this.busy=true;
  const expired=this.queue.some(e=>Date.now()-e.sentAt>5000);
  this.queue=this.queue.filter(e=>Date.now()-e.sentAt<=5000);
  const batch=this.queue.slice(0,32),hud=this.pendingHUD;this.pendingHUD=null;
  try{
   const r=await this.request({op:'poll',...this.session,cursor:this.cursor,events:batch,hud});
   if(!r.ok)throw Error(r.message);
   const recovered=!this.connected;this.connected=true;const sent=new Set(batch.map(e=>e.id));this.queue=this.queue.filter(e=>!sent.has(e.id));
   if(this.session.role==='host'){
    if(r.phoneOnline!==this.peer){this.peer=r.phoneOnline;this.dispatch(this.peer?EV.PLAYER_JOINED:EV.PLAYER_LEFT,{slot:0,name:'Golfer',connected:this.peer});}
    for(const e of Array.isArray(r.events)?r.events:[]){if(e.seq>this.cursor){if(r.now-e.at<5000)this.dispatch(e.ev,{...e.data,slot:0});this.cursor=e.seq;}}
   }else{
    if(r.hostOnline!==this.peer||recovered){this.peer=r.hostOnline;this.dispatch(this.peer?EV.HOST_BACK:EV.HOST_LEFT);}
    if(r.version!==this.version||recovered||expired){this.version=r.version;this.dispatch(EV.HUD,r.hud);}
   }
  }catch{if(hud&&!this.pendingHUD)this.pendingHUD=hud;if(this.connected){this.connected=false;this.dispatch('disconnect');}}
  finally{this.busy=false;this.timer=setTimeout(()=>this.poll(),this.connected?(this.queue.length?20:document.hidden?2000:350):2000);}
 }
}
