import {MatchClient,$,escape} from './client.js';
import {CLUBS,HOLES} from '/shared/golf.js';
import {HOOPS_SPOTS,HOOP_SHOTS,idealPower,hoopDistance,hoopsShotLabel} from '/shared/hoops.js';
import {ClubSwing,rotationSpeed} from '/shared/club-swing.js';
import {MotionAim,rotationMatrix} from '/shared/motion-aim.js';
let session=null,match=null,me=null,aim=0,club='driver',turnKey=-1,turnAim=false,orientation=null,orientationAt=0,motionAt=0,pointer=null,lockedAim=0,lockedClub='driver',sending=false,lastSent=null,lastResultId=null;
const meter=new ClubSwing(),steer=new MotionAim();let gyroAt=-Infinity,lastSensorSource='';
const onHoops=()=>match?.game==='hoops';
// Hoops made easy: "timing" mode needs no motion sensors at all. Hold the button, the bar sweeps up and down
// on its own, release inside the green zone. Power is also pulled toward the ideal value (shot assist), so a
// release anywhere in the wide green zone lands as a clean shot.
let charge=null,hoopsMode='timing';try{hoopsMode=sessionStorage.getItem('fairway.hoops.mode')==='motion'?'motion':'timing';}catch{}
const busy=()=>meter.active||charge!==null;
const easyMode=()=>onHoops()&&hoopsMode==='timing';
const ASSIST={window:.14,slope:.3},SWEEP=1.3;
const idealNow=()=>idealPower(HOOPS_SPOTS[Math.min(match?.hole??0,HOOPS_SPOTS.length-1)]);
function assistPower(raw,ideal){const d=raw-ideal,a=Math.abs(d),w=ASSIST.window,out=a<=w?a*ASSIST.slope:w*ASSIST.slope+(a-w);return Math.min(1,Math.max(.08,ideal+Math.sign(d)*out));}
const sweepLevel=ms=>{const p=(ms/1000/SWEEP)%2;return p<=1?p:2-p;};
function stopCharge(){if(charge){cancelAnimationFrame(charge.raf);charge=null;}$('meterwrap').classList.remove('hot');}
function startCharge(){stopCharge();charge={start:performance.now(),level:0,raf:0,hot:false};$('meter').style.width='0%';$('hooppower').textContent='0%';error('Release when the bar is inside the green zone.');
 const tick=()=>{if(!charge)return;const level=sweepLevel(performance.now()-charge.start),inZone=Math.abs(level-idealNow())<=ASSIST.window;charge.level=level;$('meter').style.width=Math.round(level*100)+'%';$('hooppower').textContent=Math.round(level*100)+'%';$('meterwrap').classList.toggle('hot',inZone);if(inZone&&!charge.hot)navigator.vibrate?.(12);charge.hot=inZone;$('swing-feedback').textContent=inZone?'In the zone — release now!':'Wait for the bar to reach the green…';charge.raf=requestAnimationFrame(tick);};
 charge.raf=requestAnimationFrame(tick);}
function error(message){$('phone-error').textContent=message;if($('swing-feedback'))$('swing-feedback').textContent=message;}
const client=new MatchClient(render,error);
try{session=JSON.parse(sessionStorage.getItem('fairway.pvp.player'));}catch{}
$('code').value=new URLSearchParams(location.search).get('code')??session?.code??'';$('name').value=session?.name??'';
async function permission(){try{const requests=[];for(const type of [globalThis.DeviceMotionEvent,globalThis.DeviceOrientationEvent])if(typeof type?.requestPermission==='function')requests.push(type.requestPermission());const results=await Promise.all(requests);if(results.some(r=>r==='denied'))error('Motion access was denied. You can still use Touch shot below.');navigator.wakeLock?.request('screen').catch(()=>{});}catch{error('Motion permission was not granted. Touch controls are available.');}}
function canPlay(){return client.online&&!sending&&match?.phase==='ready'&&match.turn===session?.playerId&&!me?.forfeit;}
function aimUI(){$('aim').value=aim;$('aimlabel').textContent=aim?`${Math.abs(aim).toFixed(1)}° ${aim>0?'left':'right'}`:'at the flag';$('motionaim').textContent=turnAim?'Turn to aim: ON':'Turn to aim';$('recenter').disabled=!turnAim||!canPlay()||meter.active;}
function recenter(value=0){if(!orientation||performance.now()-orientationAt>1500){error('No orientation readings yet. Allow motion access or use the slider.');return;}steer.recenter(orientation,value);aim=value;lastSent=null;aimUI();}
async function join(){await permission();const code=$('code').value.trim().toUpperCase(),name=$('name').value.trim()||'Player';const r=await client.action({op:'join',code,name,token:session?.code===code?session.token:undefined});if(!r)return;session={code,token:r.token,playerId:r.playerId,name};sessionStorage.setItem('fairway.pvp.player',JSON.stringify(session));$('join').hidden=true;$('controller').hidden=false;client.start({code,token:r.token});render(r.match);}
$('connect').onclick=join;$('enable').onclick=permission;
$('ready').onclick=()=>client.action({op:'ready',ready:!me?.ready});
$('clubs').innerHTML=Object.entries(CLUBS).map(([id,c])=>`<button data-club="${id}">${c.label}</button>`).join('');
document.querySelectorAll('[data-club]').forEach(b=>b.onclick=()=>{if(!canPlay()||meter.active)return;club=b.dataset.club;client.action({op:'club',club,turnNumber:match.turnNumber});controls();});
$('aim').oninput=()=>{if(!canPlay()||meter.active)return;turnAim=false;aim=Number($('aim').value);lastSent=null;aimUI();};
$('motionaim').onclick=async()=>{if(meter.active||onHoops())return;turnAim=!turnAim;if(turnAim){await permission();recenter(aim);}aimUI();};$('recenter').onclick=()=>{if(canPlay()&&!meter.active)recenter();};
function sampleSwing(speed,time,source){motionAt=time;lastSensorSource=source;meter.sample(speed,time);if(meter.active){const power=meter.power();$('meter').style.width=Math.round(power*100)+'%';if(onHoops()){$('hooppower').textContent=Math.round(power*100)+'%';$('swing-feedback').textContent=power>=.08?`${Math.round(power*100)}% power · release in the green zone`:'Flick the phone up while holding.';}else $('swing-feedback').textContent=power>=.08?`${Math.round(power*100)}% power · release to shoot`:'Swing gently, then release to shoot.';}}
window.addEventListener('deviceorientation',e=>{const r=rotationMatrix(e.alpha,e.beta,e.gamma);if(!r)return;const now=performance.now(),speed=rotationSpeed(orientation,r,(now-orientationAt)/1000);orientation=r;orientationAt=now;if(now-gyroAt>200&&speed!==null)sampleSwing(speed,now,'orientation');if(!onHoops()&&turnAim&&canPlay()&&!meter.active&&!document.hidden){if(!steer.local)recenter(aim);aim=steer.sample(r);aimUI();}});
window.addEventListener('devicemotion',e=>{const r=e.rotationRate;if(!r||![r.alpha,r.beta,r.gamma].some(Number.isFinite))return;gyroAt=performance.now();sampleSwing(Math.hypot(r.alpha??0,r.beta??0,r.gamma??0),gyroAt,'gyroscope');});
let aimBusy=false;setInterval(async()=>{if(onHoops()||aimBusy||!canPlay()||meter.active||document.hidden||aim===lastSent)return;aimBusy=true;const value=aim;lastSent=value;await client.action({op:'aim',aim:value,turnNumber:match.turnNumber});aimBusy=false;},180);
async function fire(power,shotAim=aim,shotClub=club){if(!canPlay())return;const hoops=onHoops(),turnNumber=match.turnNumber;if(hoops)power=assistPower(power,idealNow());sending=true;controls();error('Sending your shot…');try{const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');const payload={op:'shot',id,power,turnNumber};if(!hoops){payload.aim=shotAim;payload.club=shotClub;}const r=await client.action(payload);if(r){navigator.vibrate?.(25);error(hoops?'Shot away! Watch the big screen.':'Shot sent! Watch the game screen.');}}catch{error('Shot could not be sent. Please try again.');}finally{sending=false;controls();}}
$('power').oninput=()=>$('powerlabel').textContent=$('power').value+'%';$('touchhit').onclick=()=>fire(Number($('power').value)/100);
const swing=$('swing');swing.onpointerdown=e=>{e.preventDefault();if(!canPlay()||pointer!==null)return;pointer=e.pointerId;lockedAim=aim;lockedClub=club;if(easyMode())startCharge();else{meter.start(performance.now());error(onHoops()?'Keep holding, flick the phone up, then release to shoot.':'Keep holding, swing gently, then release to shoot.');$('meter').style.width='0%';if(onHoops())$('hooppower').textContent='0%';}swing.setPointerCapture(pointer);swing.classList.add('armed');controls();};
swing.onpointerup=e=>{if(pointer!==e.pointerId)return;pointer=null;
 if(charge){const held=performance.now()-charge.start,level=charge.level;stopCharge();swing.classList.remove('armed');if(held<140){error('Keep holding until the bar reaches the green zone, then release.');controls();return;}fire(level,lockedAim,lockedClub);return;}
 const power=meter.finish(performance.now());swing.classList.remove('armed');if(power===null){const reason=meter.reason;if(!onHoops()&&turnAim)recenter(lockedAim);const copy=onHoops()?{tap:'Hold the button, flick the phone up, then release.',long:'That hold was too long. Try a quick flick and release.',sensor:'No usable motion readings. Tap Enable motion, or use Touch shot.',gentle:'Flick a little harder while holding, then release.'}:{tap:'Hold the button while swinging, then release. A tap does not shoot.',long:'That hold was too long. Try a short swing and release.',sensor:'No usable motion readings. Tap Enable motion, or use Touch shot.',gentle:'Swing a little farther while holding, then release.'};error(copy[reason]??'Swing cancelled. Try again.');if(reason==='sensor')$('touch-controls').open=true;controls();}else fire(power,lockedAim,lockedClub);};
function cancel(){pointer=null;stopCharge();meter.cancel();swing.classList.remove('armed');if(turnAim)steer.local=null;controls();}swing.onpointercancel=cancel;swing.onlostpointercapture=()=>{if(pointer!==null)cancel();};document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else steer.local=null;});screen.orientation?.addEventListener('change',()=>{steer.local=null;});
function controls(){const enabled=canPlay(),hoops=onHoops(),b=busy(),easy=easyMode();swing.disabled=!enabled;$('touchhit').disabled=!enabled||b;$('aim').disabled=!enabled||b;$('motionaim').disabled=!enabled||b||hoops;document.querySelectorAll('[data-club]').forEach(btn=>{btn.disabled=!enabled||b;btn.classList.toggle('selected',btn.dataset.club===club);});$('hoopsmode').disabled=b;$('hoopsmode').textContent=easy?'Controls: Easy timing · tap for motion flick':'Controls: Motion flick · tap for easy timing';$('swingtext').textContent=b?(hoops?(easy?'RELEASE IN THE GREEN':'FLICK UP, THEN RELEASE'):'SWING, THEN RELEASE'):sending?'SENDING SHOT…':enabled?(hoops?(easy?'HOLD, THEN RELEASE':'HOLD & FLICK'):'HOLD TO SWING'):'WAIT FOR YOUR TURN';$('swingsub').textContent=hoops?(easy?'Hold · bar fills by itself · release in the green':'Hold · flick the phone up · release'):'Hold · swing gently · release';aimUI();}
$('hoopsmode').onclick=()=>{if(busy())return;hoopsMode=hoopsMode==='timing'?'motion':'timing';try{sessionStorage.setItem('fairway.hoops.mode',hoopsMode);}catch{}if(hoopsMode==='motion')permission();error(hoopsMode==='timing'?'Easy timing on: hold, then release in the green zone.':'Motion flick on: hold, flick the phone up, then release.');controls();};
function render(m){
 match=m;me=m.players.find(p=>p.id===session?.playerId);if(!session)return;if(!me){error('You were removed from the lobby. Reload to join again.');client.session=null;$('controller').hidden=true;$('join').hidden=false;session=null;sessionStorage.removeItem('fairway.pvp.player');return;}
 const hoops=m.game==='hoops',mine=m.turn===me.id;
 if(turnKey!==m.turnNumber){turnKey=m.turnNumber;stopCharge();meter.cancel();pointer=null;swing.classList.remove('armed');aim=me.aim;club=me.club;steer.local=null;lastSent=null;if(turnAim&&orientation&&!hoops)recenter(aim);if(hoops){$('power').value=Math.round(idealNow()*100);$('powerlabel').textContent=$('power').value+'%';}}
 $('phone-lobby').hidden=m.phase!=='lobby';$('play').hidden=m.phase==='lobby';$('golf-controls').hidden=hoops;$('hoops-controls').hidden=!hoops;$('touchhit').textContent=hoops?'Quick shot with this power':'Hit with touch power';
 $('lobbycode').textContent=`Lobby ${m.code}`;$('ready').textContent=me.ready?'Ready ✓ · tap to undo':'Ready to play ↗';
 $('phone-roster').innerHTML=m.players.map(p=>`<div class="roster-row"><i class="dot" style="background:${p.color}"></i><span class="grow">${escape(p.name)}</span><small>${!p.connected?'Offline':p.ready?'Ready ✓':'Not ready'}</small></div>`).join('');
 const current=m.players.find(p=>p.id===m.turn);
 $('turnstatus').classList.toggle('waiting',!mine);
 $('turnstatus').textContent=m.phase==='lobby'?`Welcome, ${me.name}`:me.forfeit?'You have sat out':m.phase==='finished'?'Game complete':hoops?(m.phase==='flight'?'Your ball is in the air':mine?(easyMode()?'Your shot · hold, then release in the green':'Your shot · hold and flick to charge'):`${current?.name??'Player'} is shooting · watch the screen`):(m.phase==='hole-complete'?'Hole complete · waiting for host':m.phase==='flight'?`${current?.name??'Player'}’s ball is in play`:mine?'Your turn · line up your shot':`${current?.name??'Player'}’s turn · watch the screen`);
 if(hoops){
  const spot=HOOPS_SPOTS[Math.min(m.hole??0,HOOPS_SPOTS.length-1)],ideal=idealPower(spot);
  $('holelabel').textContent=`Shot ${Math.min(m.hole+1,HOOP_SHOTS)} / ${HOOP_SHOTS} · ${spot.points} points`;
  $('holename').textContent=spot.name;
  $('stat1label').textContent='Spot value';$('strokes').textContent=spot.points;
  $('stat2label').textContent='Your score';$('distance').textContent=me.hscore??0;
  $('stat3label').textContent='Makes';$('total').textContent=me.hmakes??0;
  $('shotlabel').textContent=`Shot ${Math.min(m.hole+1,HOOP_SHOTS)} of ${HOOP_SHOTS}`;$('shotspot').textContent=`${spot.name} · ${hoopDistance(spot).toFixed(1)} m`;$('shotpoints').textContent=spot.points;$('hscore').textContent=me.hscore??0;$('hmakes').textContent=me.hmakes??0;
  const zoneLeft=Math.max(0,ideal-ASSIST.window),zoneRight=Math.min(1,ideal+ASSIST.window);
  $('meterzone').hidden=false;$('meterzone').style.left=`${zoneLeft*100}%`;$('meterzone').style.width=`${(zoneRight-zoneLeft)*100}%`;
  if(!busy())$('hooppower').textContent='0%';
  $('targethint').textContent=easyMode()?'Hold the big button. The bar fills by itself — release while it is inside the green zone.':`Green zone ≈ ${Math.round(ideal*100)}% power. A soft flick for close shots, a strong one for deep spots.`;
  $('phone-scores').innerHTML='<div class="eyebrow">Shootout scorecard</div>'+m.players.map(p=>`<div class="score-line"><span>${escape(p.name)}${p.forfeit?' · DNF':''}</span><strong>${p.hscore??0}</strong></div>`).join('');
 }else{
  const h=HOLES[m.hole];
  $('holelabel').textContent=`Hole ${m.hole+1} / 6 · Par ${h.par}`;$('holename').textContent=h.name;
  $('stat1label').textContent='Your strokes';$('strokes').textContent=me.strokes;
  $('stat2label').textContent='Your distance';$('distance').textContent=Math.round(Math.hypot(me.ball.x-h.pin.x,me.ball.z-h.pin.z))+' m';
  $('stat3label').textContent='Total';$('total').textContent=me.total+(me.done?0:me.strokes);
  $('meterzone').hidden=true;
  $('phone-scores').innerHTML='<div class="eyebrow">Match scorecard</div>'+m.players.map(p=>`<div class="score-line"><span>${escape(p.name)}${p.forfeit?' · DNF':''}</span><strong>${p.total+(p.done?0:p.strokes)}</strong></div>`).join('');
 }
 if(hoops&&m.last&&m.last.id!==lastResultId&&m.phase!=='flight'){
  lastResultId=m.last.id;const mineResult=m.last.player===me.id,label=hoopsShotLabel(m.last);
  error(m.last.result==='made'?(mineResult?`You scored ${m.last.points} points! ${label}`:`${label} · +${m.last.points} for ${m.players.find(p=>p.id===m.last.player)?.name??'them'}`):(mineResult?`Missed. ${label} — adjust your power next shot.`:`${m.players.find(p=>p.id===m.last.player)?.name??'They'} missed.`));
 }
 controls();
}
setInterval(()=>{$('sensor').textContent=performance.now()-motionAt<1500?'Motion is active. Phone motion controls shot power.':'Use HTTPS and allow motion, or use touch power.';if(!client.online)error('Reconnecting to the match…');controls();},1000);
window.__pvpPhone={client,get match(){return match;},get player(){return me;},get meter(){return meter;},get targetPower(){return onHoops()?idealPower(HOOPS_SPOTS[Math.min(match?.hole??0,HOOPS_SPOTS.length-1)]):0.5;},fire};
