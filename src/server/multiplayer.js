import {randomBytes} from 'node:crypto';
import {HOLES,newBall,launch,step,clamp} from '../shared/golf.js';
import {HOOPS_SPOTS,HOOP_SHOTS,simulateHoopsShot} from '../shared/hoops.js';
export const token=()=>randomBytes(24).toString('hex');
export const COLORS=['#f17859','#629de0','#caa1e5','#e0b848'];
const fail=message=>{throw new Error(message);};
const isHoops=r=>r.game==='hoops';
export function createMatch(code,host,mode='shared',now=Date.now(),game='golf'){
 return {code,host,mode:mode==='multi'?'multi':'shared',game:game==='hoops'?'hoops':'golf',phase:'lobby',players:[],hole:0,turn:null,turnNumber:0,shot:null,pending:null,last:null,created:now,revision:0};
}
function active(r){return r.players.filter(p=>!p.forfeit&&!p.done);}
function activeHoops(r){return r.players.filter(p=>!p.forfeit);}
function beginHole(r){for(const p of r.players){p.ball=newBall();p.strokes=0;p.done=p.forfeit;p.aim=0;p.club='driver';}r.phase='ready';r.shot=null;r.last=null;r.turn=active(r)[0]?.id??null;r.turnNumber++;}
function beginHoops(r){
 for(const p of r.players){p.hscore=0;p.hmakes=0;p.hshots=[];}
 r.phase='ready';r.shot=null;r.pending=null;r.last=null;r.hole=0;r.turn=activeHoops(r)[0]?.id??null;r.turnNumber++;
}
function nextTurn(r,previous){const available=active(r);if(!available.length){r.phase=r.hole===HOLES.length-1?'finished':'hole-complete';r.turn=null;return;}const ordered=r.players.map(p=>p.id);const start=ordered.indexOf(previous);r.turn=Array.from({length:ordered.length},(_,i)=>ordered[(start+i+1)%ordered.length]).find(id=>available.some(p=>p.id===id));r.phase='ready';r.turnNumber++;}
function nextHoopsTurn(r,previous){
 const available=activeHoops(r);
 const round=r.hole;
 const remaining=available.filter(p=>(p.hshots?.length??0)<=round);
 if(!remaining.length){
  if(round>=HOOP_SHOTS-1){r.phase='finished';r.turn=null;r.turnNumber++;return;}
  r.hole=round+1;
  const next=available.find(p=>(p.hshots?.length??0)<=r.hole);
  r.turn=next?.id??null;r.phase='ready';r.turnNumber++;return;
 }
 const ordered=available.map(p=>p.id),start=ordered.indexOf(previous);
 r.turn=ordered.slice(start+1).concat(ordered.slice(0,start+1)).find(id=>remaining.some(p=>p.id===id))??remaining[0].id;
 r.phase='ready';r.turnNumber++;
}
export function settleDue(r,now){
 if(r.phase!=='flight'||!r.pending||now<r.shot.start+r.shot.duration)return false;
 if(isHoops(r)){
  const p=r.players.find(p=>p.id===r.pending.player);
  if(p){
   p.hscore=(p.hscore??0)+r.shot.points;
   p.hmakes=(p.hmakes??0)+(r.shot.result==='made'?1:0);
   p.hshots[r.hole]=r.shot.points;
  }
  r.last={id:r.shot.id,player:r.pending.player,result:r.shot.result,points:r.shot.points,swish:r.shot.swish,spot:r.hole,at:now};
  r.pending=null;
  nextHoopsTurn(r,p?.id??r.turn);
  return true;
 }
 const p=r.players.find(p=>p.id===r.pending.player);Object.assign(p,{ball:r.pending.ball,strokes:r.pending.strokes});
 if(r.pending.result==='cup'||p.strokes>=10||p.forfeit){p.done=true;p.scores[r.hole]=p.forfeit?11:p.strokes;}
 p.aim=0;const h=HOLES[r.hole],d=Math.hypot(p.ball.x-h.pin.x,p.ball.z-h.pin.z);p.club=d<14?'putter':d<38?'wedge':d<75?'iron':'driver';
 r.pending=null;nextTurn(r,p.id);return true;
}
export function mutateMatch(r,a,now=Date.now()){
 settleDue(r,now);
 const host=a.token===r.host,player=r.players.find(p=>p.token===a.token);
 if(a.op==='join'){
  if(player){player.seen=now;return {token:player.token,playerId:player.id};}
  if(r.phase!=='lobby')fail('This match has started. Rejoin with your original phone.');
  if(r.players.length>=4)fail('The lobby is full (four players).');
  const id=[0,1,2,3].find(id=>!r.players.some(p=>p.id===id));
  const name=String(a.name??'Player').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,18)||`Player ${id+1}`;
  const p={id,name,token:token(),color:COLORS[id],ready:false,seen:now,forfeit:false,ball:newBall(),strokes:0,scores:[],done:false,aim:0,club:'driver',lastShot:null,hscore:0,hmakes:0,hshots:[]};r.players.push(p);return {token:p.token,playerId:id};
 }
 if(a.op==='view'){if(!host&&r.mode!=='multi')fail('This lobby uses one shared screen. Join from your phone instead.');return {};}
 if(!host&&!player)fail('Invalid session. Join the lobby again.');
 // Heartbeats only need second-level precision; writing `seen` on every 5 Hz
 // poll would force a Redis save and race the shooter's compare-and-swap.
 if(player&&now-(player.seen??0)>4000)player.seen=now;
 if(a.op==='read')return {};
 if(a.op==='settings'){
  if(!host||r.phase!=='lobby')fail('Only the host can change lobby settings.');
  if(a.mode==='multi'||a.mode==='shared')r.mode=a.mode;
  if(a.game==='golf'||a.game==='hoops')r.game=a.game;
  return {};
 }
 if(a.op==='ready'){if(!player||r.phase!=='lobby')fail('Ready is only available in the lobby.');player.ready=Boolean(a.ready);return {};}
 if(a.op==='start'){
  if(!host||r.phase!=='lobby')fail('Only the host can start the match.');
  if(r.players.length<2||!r.players.every(p=>p.ready&&now-p.seen<25000))fail('At least two connected players must be ready.');
  for(const p of r.players){p.scores=[];p.forfeit=false;p.done=false;p.hscore=0;p.hmakes=0;p.hshots=[];}
  r.hole=0;
  if(isHoops(r))beginHoops(r);else beginHole(r);
  return {};
 }
 if(a.op==='next'){if(isHoops(r))fail('Shots advance automatically.');if(!host||r.phase!=='hole-complete')fail('Wait for everyone to finish the hole.');r.hole++;beginHole(r);return {};}
 if(a.op==='rematch'){
  if(!host||r.phase!=='finished')fail('Finish the match first.');
  r.phase='lobby';r.turn=null;r.pending=null;r.shot=null;r.last=null;r.hole=0;
  for(const p of r.players){p.ready=false;p.scores=[];p.forfeit=false;p.done=false;p.hscore=0;p.hmakes=0;p.hshots=[];}
  return {};
 }
 if(a.op==='remove'){
  if(!host)fail('Only the host can remove a player.');const target=r.players.find(p=>p.id===a.playerId);if(!target)fail('Player not found.');
  if(r.phase==='lobby')r.players=r.players.filter(p=>p!==target);
  else {if(r.phase==='flight')fail('Wait for the current shot to land.');target.forfeit=true;target.done=true;for(let i=r.hole;i<HOLES.length;i++)target.scores[i]=11;if(r.turn===target.id)isHoops(r)?nextHoopsTurn(r,target.id):nextTurn(r,target.id);}
  return {};
 }
 if(!player||player.forfeit)fail('Only an active player can control a shot.');
 if(a.op==='shot'&&a.id&&a.id===player.lastShot)return {};
 if(r.phase!=='ready'||r.turn!==player.id||a.turnNumber!==r.turnNumber)fail('Wait for your turn.');
 if(a.op==='aim'){if(Number.isFinite(a.aim))player.aim=clamp(a.aim,-60,60);return {};}
 if(a.op==='club'){if(['driver','iron','wedge','putter'].includes(a.club))player.club=a.club;return {};}
 if(a.op==='shot'){
  if(typeof a.id!=='string'||a.id.length>80||!Number.isFinite(a.power))fail('Invalid shot.');
  if(isHoops(r)){
   const spot=HOOPS_SPOTS[r.hole],sim=simulateHoopsShot(spot,a.power);
   player.lastShot=a.id;
   r.shot={id:a.id,player:player.id,start:now+200,duration:Math.max(700,(sim.end+0.25)*1000),path:sim.path,result:sim.result,points:sim.points,swish:sim.swish,power:clamp(a.power,0,1),distance:sim.distance,spot:r.hole,makeAt:sim.makeAt};
   r.pending={player:player.id,result:sim.result,points:sim.points};
   r.phase='flight';return {};
  }
  const b={...player.ball},origin={...b},h=HOLES[r.hole];
  if(!launch(b,h,a.club??player.club,a.power,a.aim))fail('Choose a valid club and power.');
  player.lastShot=a.id;player.club=a.club??player.club;player.aim=clamp(a.aim,-60,60);player.strokes++;
  const path=[[0,b.x,b.y,b.z]];let result='stop',frames=0;
  for(;frames<4800&&b.moving;frames++){result=step(b,h,1/120);if(frames%6===5||!b.moving)path.push([(frames+1)/120,b.x,b.y,b.z]);}
  b.moving=false;let strokes=player.strokes;let final={...b};if(result==='penalty'){strokes++;final={...origin,moving:false,vx:0,vy:0,vz:0};}
  r.shot={id:a.id,player:player.id,start:now+250,duration:Math.max(700,frames/120*1000)+800,path,result,power:a.power};
  r.pending={player:player.id,ball:final,strokes,result};r.phase='flight';return {};
 }
 fail('Unknown action.');
}
export function publicMatch(r,now,sinceShot){
 const players=r.players.map(({token,lastShot,seen,...p})=>({...p,connected:now-seen<25000,total:isHoops(r)?(p.hscore??0):p.scores.reduce((s,n)=>s+(n??0),0)}));
 const shot=r.shot?{...r.shot,path:r.shot.id===sinceShot?undefined:r.shot.path}:null;
 return {code:r.code,game:r.game,mode:r.mode,phase:r.phase,hole:r.hole,turn:r.turn,turnNumber:r.turnNumber,players,shot,last:r.last??null,now,holes:isHoops(r)?HOOP_SHOTS:HOLES.length,hoopShots:HOOP_SHOTS};
}
