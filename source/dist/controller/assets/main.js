import {connectGame} from '/shared/connection.js';
import {EV} from '/shared/protocol.js';
import {CLUBS,SwingMeter,clamp} from '/shared/golf.js';
import {MotionAim,rotationMatrix} from '/shared/motion-aim.js';
const $=id=>document.getElementById(id),socket=connectGame(),meter=new SwingMeter();let session=null,hud={state:'lobby'},joined=false,lastMotion=0,motionCount=0,pointer=null,hostOnline=true;
try{session=JSON.parse(sessionStorage.getItem('fairway.session'));}catch{}
$('code').value=new URLSearchParams(location.search).get('code')??session?.code??'';
const motionAim=new MotionAim();let orientation=null,lastOrientation=0,turnAim=false,localAim=0,lockedAim=0,sentAim=null,readyKey='';
async function permission(){try{const requests=[];if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function')requests.push(DeviceMotionEvent.requestPermission());if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function')requests.push(DeviceOrientationEvent.requestPermission());await Promise.all(requests);navigator.wakeLock?.request('screen').catch(()=>{});}catch{} }
function showAim(){const value=turnAim?localAim:(hud.aim??0);$('aim').value=value;$('aimlabel').textContent=value?`${Math.abs(value).toFixed(1)}° ${value>0?'left':'right'}`:'at the flag';}
function aimStatus(){
 $('motionaim').textContent=turnAim?'Turn to aim: ON':'Turn to aim';$('motionaim').setAttribute('aria-pressed',String(turnAim));$('recenter').disabled=!turnAim||!available()||meter.active;
 $('aimhelp').textContent=!turnAim?'Use the slider, or enable Turn to aim. Your current grip becomes the center.':meter.active?'Aim locked for this swing.':performance.now()-lastOrientation>1500?'Waiting for orientation. Allow motion access, or use the slider.':'Turn your body or phone left / right to aim. Recenter makes your current direction face the flag.';
}
function recenter(value=0){if(!orientation||performance.now()-lastOrientation>1500){aimStatus();return false;}motionAim.recenter(orientation,value);localAim=value;sentAim=null;showAim();return true;}
window.addEventListener('deviceorientation',e=>{
 const r=rotationMatrix(e.alpha,e.beta,e.gamma);if(!r)return;orientation=r;lastOrientation=performance.now();
 if(!turnAim||!available()||meter.active||document.hidden)return;
 if(!motionAim.local)recenter(localAim);
 localAim=motionAim.sample(r);showAim();
});
// Send only the latest angle; never queue an entire sensor history.
setInterval(()=>{if(turnAim&&available()&&!meter.active&&!document.hidden&&performance.now()-lastOrientation<1500&&localAim!==sentAim){send('aim',{aim:localAim});sentAim=localAim;}},80);
$('motionaim').onclick=async()=>{if(meter.active)return;turnAim=!turnAim;if(turnAim){localAim=hud.aim??0;motionAim.local=null;await permission();recenter(localAim);}aimStatus();showAim();};
$('recenter').onclick=()=>{if(available()&&!meter.active&&recenter()){send('aim',{aim:0});sentAim=0;}aimStatus();};
screen.orientation?.addEventListener('change',()=>{motionAim.local=null;});
window.addEventListener('devicemotion',e=>{const r=e.rotationRate;if(!r||![r.alpha,r.beta,r.gamma].some(Number.isFinite))return;lastMotion=performance.now();motionCount++;const speed=Math.hypot(r.alpha??0,r.beta??0,r.gamma??0);meter.sample(speed,lastMotion);if(meter.active)$('meter').style.width=Math.round(meter.power()*100)+'%';});
function connect(){if(!socket.connected){$('error').textContent='Connecting to the server. Try again in a moment.';return;}
 const code=$('code').value.trim().toUpperCase();if(code.length!==4){$('error').textContent='Enter the four-character room code.';return;}
 socket.timeout(6000).emit(EV.CTRL_JOIN,{code,name:'Golfer',token:session?.code===code?session.token:null},(err,res)=>{if(err||!res?.ok){$('error').textContent=res?.message??'Connection timed out. Check the room code.';return;}session={code,token:res.token};sessionStorage.setItem('fairway.session',JSON.stringify(session));joined=true;hostOnline=true;$('join').hidden=true;$('controller').hidden=false;socket.emit(EV.CONFIG,{calibrated:true});render();});}
$('connect').onclick=async()=>{await permission();connect();};$('motion').onclick=permission;
socket.on('connect',()=>{if(joined)connect();});socket.on('disconnect',()=>{meter.cancel();pointer=null;render();});socket.on(EV.HOST_LEFT,()=>{hostOnline=false;render();});socket.on(EV.HOST_BACK,()=>{hostOnline=true;socket.emit(EV.CONFIG,{});render();});
function available(){return socket.connected&&hostOnline&&joined&&hud.state==='ready';}
function send(kind,data={}){if(socket.connected)socket.emit(EV.TRIGGER,{kind,...data});}
function fire(power,shotAim=turnAim?localAim:(hud.aim??0)){if(!available())return;send('swing',{power:clamp(power,.08,1),aim:shotAim,id:Date.now()});hud.state='flight';render();}
$('clubs').innerHTML=Object.entries(CLUBS).map(([id,c])=>`<button data-club="${id}">${c.label}</button>`).join('');document.querySelectorAll('[data-club]').forEach(b=>b.onclick=()=>{if(available())send('club',{club:b.dataset.club});});
$('aim').oninput=()=>{if(available()&&!meter.active){turnAim=false;hud.aim=Number($('aim').value);send('aim',{aim:hud.aim});showAim();aimStatus();}};$('power').oninput=()=>$('powerlabel').textContent=$('power').value+'%';$('touchhit').onclick=()=>fire(Number($('power').value)/100);$('next').onclick=()=>socket.emit(EV.CTRL_START,{});
const swing=$('swing');swing.addEventListener('pointerdown',e=>{e.preventDefault();if(!available()||pointer!==null)return;if(performance.now()-lastMotion>1500||!motionCount){$('feedback').textContent='No motion readings. Open Touch controls below or enable motion.';return;}lockedAim=turnAim?localAim:(hud.aim??0);pointer=e.pointerId;swing.setPointerCapture(pointer);meter.start(performance.now());swing.classList.add('armed');$('swingtext').textContent='SWING, THEN RELEASE';$('meter').style.width='0%';render(false);});
swing.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;pointer=null;const power=meter.finish(performance.now());swing.classList.remove('armed');if(power===null){if(turnAim)recenter(lockedAim);$('feedback').textContent='Swing not detected. Hold, make a short swing, then release.';render(false);}else fire(power,lockedAim);});
function cancel(){const armed=meter.active;pointer=null;meter.cancel();if(armed&&turnAim)recenter(lockedAim);swing.classList.remove('armed');render(false);}swing.addEventListener('pointercancel',cancel);swing.addEventListener('lostpointercapture',()=>{if(pointer!==null)cancel();});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else if(turnAim){motionAim.local=null;}});
socket.on(EV.HUD,m=>{if(!m)return;const key=`${m.hole}:${m.strokes}`;if(m.state==='ready'&&key!==readyKey){readyKey=key;localAim=m.aim??0;motionAim.local=null;if(turnAim)recenter(localAim);}hud=m;render();});socket.on(EV.HAPTIC,m=>{navigator.vibrate?.(m.pattern);});
function render(feedback=true){$('connection').textContent=!socket.connected?'Reconnecting…':!hostOnline?'Big screen offline':'Connected to the clubhouse';$('holelabel').textContent=hud.hole?`Hole ${hud.hole} of ${hud.totalHoles??6} · par ${hud.par}`:'Waiting at the first tee';$('holename').textContent=hud.name??'Morning Meadow';$('distance').textContent=hud.distance==null?'—':hud.distance+' m';$('strokes').textContent=hud.strokes??0;$('lie').textContent=hud.lie??'Tee';$('aim').value=hud.aim??0;$('aimlabel').textContent=hud.aim?`${Math.abs(hud.aim)}° ${hud.aim>0?'left':'right'}`:'at the flag';
 showAim();aimStatus();swing.disabled=!available();$('touchhit').disabled=!available()||meter.active;$('aim').disabled=!available()||meter.active;$('motionaim').disabled=meter.active;$('swingtext').textContent=meter.active?'SWING, THEN RELEASE':hud.state==='flight'?'BALL IN PLAY':'HOLD TO SWING';$('next').hidden=!['lobby','complete'].includes(hud.state);$('next').textContent=hud.state==='complete'?(hud.hole===(hud.totalHoles??6)?'Play again ↗':'Next hole ↗'):'Start round ↗';$('next').disabled=!socket.connected||!hostOnline;
 document.querySelectorAll('[data-club]').forEach(b=>{b.classList.toggle('selected',b.dataset.club===hud.club);b.disabled=!available();});if(feedback)$('feedback').textContent=hud.state==='ready'?'Aim first. Hold, swing gently, and release.':hud.state==='flight'?'Watch your shot on the big screen.':hud.state==='complete'?'In the cup! Ready for the next tee?':'Start the round when you’re ready.';
}
setInterval(()=>{const live=motionCount&&performance.now()-lastMotion<1500;$('mode').textContent=live?'Motion ready':'Touch available';$('sensor').textContent=live?'Motion sensor is active. Swing speed controls shot power.':'No active motion sensor. Use HTTPS and allow motion, or use touch power below.';},700);
setInterval(aimStatus,700);
window.__golfController={meter,get hud(){return hud;},get aim(){return localAim;},get turnAim(){return turnAim;},fire};
