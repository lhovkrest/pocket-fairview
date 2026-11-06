export const $=id=>document.getElementById(id);
export const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class MatchClient{
 constructor(onChange,onError){this.onChange=onChange;this.onError=onError;this.session=null;this.match=null;this.chain=Promise.resolve();this.timer=null;this.online=true;}
 request(data){const run=async()=>{const start=Date.now();const response=await fetch('/api/multiplayer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...this.session,sinceShot:this.match?.shot?.id,...data}),signal:AbortSignal.timeout(12000)});const r=await response.json();if(!r.ok)throw Error(r.error);if(r.match){if(r.match.shot&&r.match.shot.id===this.match?.shot?.id&&!r.match.shot.path)r.match.shot.path=this.match.shot.path;r.match.offset=r.match.now-(start+Date.now())/2;this.match=r.match;this.online=true;this.onChange(r.match);}return r;};const p=this.chain.then(run);this.chain=p.catch(()=>{});return p;}
 async action(data){try{return await this.request(data);}catch(e){this.onError(e.message);return null;}}
 start(session,viewer=false){this.session=session;this.viewer=viewer;clearTimeout(this.timer);this.poll();}
 async poll(){if(!this.session)return;try{await this.request({op:this.viewer?'view':'read'});}catch(e){this.online=false;this.onError(e.message);}this.timer=setTimeout(()=>this.poll(),document.hidden?1200:this.match?.phase==='flight'?250:500);}
}
