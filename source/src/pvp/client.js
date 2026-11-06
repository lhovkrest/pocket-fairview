export const $=id=>document.getElementById(id);
export const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The cloud build has to talk to a serverless function, so a poll is the only
// transport available. Keep reads short and frequent while a shot is live, and
// let writes (shots, ready taps, turns) run independently of an in-flight read
// so a slow poll can never sit in front of a shot.
export class MatchClient{
 constructor(onChange,onError){this.onChange=onChange;this.onError=onError;this.session=null;this.match=null;this.writeChain=Promise.resolve();this.writing=0;this.reading=false;this.timer=null;this.online=true;this.latency=0;}
 async request(data){
  const start=Date.now();
  const response=await fetch('/api/multiplayer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...this.session,sinceShot:this.match?.shot?.id,...data}),signal:AbortSignal.timeout(12000)});
  const r=await response.json();
  if(!r.ok)throw Error(r.error);
  this.latency=Date.now()-start;
  if(r.match){
   if(r.match.shot&&r.match.shot.id===this.match?.shot?.id&&!r.match.shot.path)r.match.shot.path=this.match.shot.path;
   // Estimate the server clock once per poll. The view uses it to keep the
   // ball at the right point of its flight path.
   r.match.offset=r.match.now-(start+Date.now())/2;
   this.match=r.match;this.online=true;this.onChange(r.match);
  }
  return r;
 }
 action(data){
  const run=()=>this.request(data);
  const p=this.writeChain.then(run);
  this.writeChain=p.catch(()=>{});
  this.writing++;
  return p.catch(e=>{this.onError(e.message);return null;}).finally(()=>{this.writing=Math.max(0,this.writing-1);});
 }
 start(session,viewer=false){this.session=session;this.viewer=viewer;clearTimeout(this.timer);this.poll();}
 interval(){
  if(document.hidden)return 1200;
  const phase=this.match?.phase;
  if(phase==='flight')return this.viewer?90:150;
  if(phase==='ready')return this.viewer?100:170;
  if(phase==='finished')return 550;
  return this.viewer?380:420;
 }
 schedule(ms=this.interval()){clearTimeout(this.timer);this.timer=setTimeout(()=>this.poll(),ms);}
 async poll(){
  if(!this.session)return;
  if(this.reading){return;}
  if(this.writing){this.schedule(60);return;}
  this.reading=true;
  try{await this.request({op:this.viewer?'view':'read'});}catch(e){this.online=false;this.onError(e.message);}
  finally{this.reading=false;this.schedule();}
 }
}
