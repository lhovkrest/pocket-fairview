import * as THREE from 'three';
import {EV} from '/shared/protocol.js';
import {connectGame} from '/shared/connection.js';
import {HOLES,CLUBS,newBall,launch,step,distance,surfaceAt,clamp} from '/shared/golf.js';
import {Effects} from '/desktop/effects.js';
const $=id=>document.getElementById(id);
const socket=connectGame();socket.setPollInterval?.(260);let hostSession=null,phone=null,practice=false,index=0,strokes=0,scores=[],club='driver',aim=0,state='lobby',ball=newBall(),launchPoint={...ball},lastId=0;
let messageUntil=0,elapsed=0,accumulator=0,lastHUD=0,celebrationUntil=0;
const scene=new THREE.Scene();scene.background=new THREE.Color('#d8e8d4');scene.fog=new THREE.Fog('#d8e8d4',120,280);
const renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.PerspectiveCamera(48,1,.1,500);camera.position.set(55,45,75);
scene.add(new THREE.HemisphereLight(0xf9ffe7,0x456349,2.4));const sun=new THREE.DirectionalLight(0xffedc8,3);sun.position.set(-35,75,30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.autoUpdate=false;Object.assign(sun.shadow.camera,{left:-100,right:100,top:100,bottom:-210,far:300});scene.add(sun);
const course=new THREE.Group();scene.add(course);const effects=new Effects(scene);
const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.95});
function mesh(geo,color,parent=course){const m=new THREE.Mesh(geo,mat(color));m.receiveShadow=true;parent.add(m);return m;}
function disk(x,z,rx,rz,color,y=.03){const m=mesh(new THREE.CircleGeometry(1,64),color);m.rotation.x=-Math.PI/2;m.scale.set(rx,rz,1);m.position.set(x,y,z);return m;}
const ballMesh=mesh(new THREE.SphereGeometry(.23,20,16),'#fffef2',scene);
const shadow=disk(0,5,.5,.5,'#456e45',.025);course.remove(shadow);scene.add(shadow);
const aimLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xfffce0,dashSize:1,gapSize:.7}));scene.add(aimLine);
let flag,ripples=[];
function tree(x,z,size=1){const g=new THREE.Group();course.add(g);g.position.set(x,0,z);const trunk=mesh(new THREE.CylinderGeometry(.25,.4,3,6),'#82775a',g);trunk.position.y=1.5;const crown=mesh(new THREE.IcosahedronGeometry(2.7,1),'#4c8057',g);crown.position.y=4.4;crown.castShadow=true;g.scale.setScalar(size);}
function buildCourse(){
 while(course.children.length){const o=course.children[0];course.remove(o);o.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});}ripples=[];sun.shadow.needsUpdate=true;
 const h=HOLES[index];const ground=mesh(new THREE.PlaneGeometry(500,500),'#8fae6b');ground.rotation.x=-Math.PI/2;ground.position.z=-60;
 const len=-h.pin.z;for(let i=0;i<Math.ceil(len/10);i++){const t=(i+.5)*10/len;const fair=mesh(new THREE.PlaneGeometry((h.width??13)*2,10.1),i%2?'#77a95c':'#80b264');fair.rotation.x=-Math.PI/2;fair.position.set(h.pin.x*t,.015,-(i+.5)*10);}
 disk(h.pin.x,h.pin.z,12,12,'#9cc77b',.04);disk(0,5,4,4,'#a5c97e',.05);
 for(const s of h.sand){disk(s.x,s.z,s.rx+1,s.rz+1,'#c4bc86',.045);disk(s.x,s.z,s.rx,s.rz,'#eee0b4',.055);}
 for(const w of h.water){disk(w.x,w.z,w.rx+1,w.rz+1,'#a2bd8a',.05);disk(w.x,w.z,w.rx,w.rz,'#69aeb0',.065);for(let i=0;i<4;i++){const r=mesh(new THREE.RingGeometry(1.8+i*1.4,1.84+i*1.4,48),'#b6e3db');r.rotation.x=-Math.PI/2;r.position.set(w.x,.07,w.z);ripples.push(r);}}
 for(let i=0;i<Math.ceil(len/4)+8;i++)tree((i%2?1:-1)*(28+Math.sin(i*3.7)*8),12-i*4,.8+(i%5)*.13);
 disk(h.pin.x,h.pin.z,.48,.48,'#244334',.08);
 const pole=mesh(new THREE.CylinderGeometry(.06,.06,4,8),'#fffce6');pole.position.set(h.pin.x,2,h.pin.z);
 flag=mesh(new THREE.PlaneGeometry(1.9,1,12,3),'#de734c');flag.material.side=THREE.DoubleSide;flag.position.set(h.pin.x+.95,3.5,h.pin.z);
 for(const x of [-2,2]){const m=mesh(new THREE.BoxGeometry(.4,.3,.4),'#f8f3d5');m.position.set(x,.15,5);}
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();buildCourse();
function tell(ev,data){if(socket.connected)socket.emit(EV.HOST_SEND,{slot:'all',ev,data});}
function hud(){const h=HOLES[index],d=distance(ball,h.pin);$('holelabel').textContent=`Hole ${index+1} / ${HOLES.length}`;$('holename').textContent=h.name;$('par').textContent=h.par;$('strokes').textContent=strokes;$('distance').textContent=`${d.toFixed(0)} m`;
 $('wind').textContent=h.wind?`${h.wind>0?'→':'←'} ${Math.abs(h.wind).toFixed(1)} m/s crosswind`:'Calm wind';
 $('aimvalue').textContent=aim===0?'Straight at flag':`${Math.abs(aim).toFixed(0)}° ${aim>0?'left':'right'}`;$('aim').value=aim;
 $('hit').disabled=state!=='ready';document.querySelectorAll('[data-club]').forEach(b=>{b.classList.toggle('selected',b.dataset.club===club);b.disabled=state!=='ready';});
 tell(EV.HUD,{state,totalHoles:HOLES.length,hole:index+1,name:h.name,par:h.par,strokes,distance:Math.round(d),club,aim,lie:surfaceAt(ball,h),wind:h.wind??0});
}
function message(text,seconds=3){$('message').textContent=text;messageUntil=elapsed+seconds;}
function setClub(value){if(state!=='ready'||!CLUBS[value])return;club=value;hud();}
$('clubs').innerHTML=Object.entries(CLUBS).map(([key,c])=>`<button data-club="${key}">${c.label}</button>`).join('');document.querySelectorAll('[data-club]').forEach(b=>b.onclick=()=>setClub(b.dataset.club));
$('aim').oninput=()=>{if(state==='ready'){aim=Number($('aim').value);hud();}};$('power').oninput=()=>$('powervalue').textContent=$('power').value+'%';
function nextHole(){effects.clear();celebrationUntil=0;ball=newBall();strokes=0;aim=0;club='driver';state='ready';buildCourse();$('result').classList.add('hidden');hud();message(HOLES[index].name,3);}
function start(local){practice=local;if(!local&&!phone?.connected)return;scores=[];index=0;lastId=0;$('lobby').classList.add('hidden');$('hud').classList.remove('hidden');$('powercontrol').classList.toggle('hidden',!local);$('hit').classList.toggle('hidden',!local);$('hint').textContent=local?'Adjust aim and power, then swing. Space also hits.':'On your phone: hold SWING, make a gentle swing, then release.';socket.setPollInterval?.(70);socket.emit(EV.HOST_PHASE,'game');nextHole();}
$('start').onclick=()=>start(false);$('practice').onclick=()=>start(true);$('hit').onclick=()=>strike(Number($('power').value)/100);
addEventListener('keydown',e=>{if(e.code==='Space'&&practice&&state==='ready'&&!['INPUT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();strike(Number($('power').value)/100);}});
function strike(power){if(state!=='ready'||!Number.isFinite(power))return;launchPoint={...ball};if(!launch(ball,HOLES[index],club,power,aim))return;strokes++;state='flight';effects.burst(ball,0xffe9a6,36,5);effects.kick=power;message(`${CLUBS[club].label} · ${Math.round(power*100)}%`,2);tell(EV.HAPTIC,{pattern:[20]});hud();}
function settle(){state='ready';aim=0;const d=distance(ball,HOLES[index].pin);club=d<14?'putter':d<38?'wedge':d<75?'iron':'driver';if(strokes>=10){finishHole(true);return;}message(`${surfaceAt(ball,HOLES[index]).toUpperCase()} · ${Math.round(d)} m to pin`,3);hud();}
function finishHole(limit=false){state='complete';scores[index]=strokes;const diff=strokes-HOLES[index].par;const label=limit?'Stroke limit':strokes===1?'Hole in one!':diff<=-2?'Eagle!':diff===-1?'Birdie!':diff===0?'Par. Beautiful.':diff===1?'Bogey':'In the cup!';message(label,8);tell(EV.HAPTIC,{pattern:[30,60,30]});celebrationUntil=elapsed+(limit?0:1.8);if(!limit)effects.celebrate(HOLES[index].pin);$('resulttitle').textContent=index===HOLES.length-1?'Round complete':label;$('resultlabel').textContent=index===HOLES.length-1?'The Meadow Challenge':HOLES[index].name;
 $('scorecard').innerHTML=scores.map((n,i)=>`<div class="score-row"><span>${i+1}. ${HOLES[i].name}</span><strong>${n} / par ${HOLES[i].par}</strong></div>`).join('');const total=scores.reduce((sum,n,i)=>sum+n-HOLES[i].par,0);$('resultscore').textContent=total===0?'Even par':`${total>0?'+':''}${total}`;$('next').textContent=index===HOLES.length-1?'Play another round ↗':'Next hole ↗';hud();}
function advance(){if(state!=='complete')return;if(index===HOLES.length-1){scores=[];index=0;}else index++;nextHole();}$('next').onclick=advance;
function roomReady(res){if(!res?.ok){$('status').textContent=res?.message??'Pairing unavailable. PC practice is ready.';return;}$('qr').innerHTML=res.qrSvg;$('code').textContent=res.code;$('joinurl').textContent=res.joinUrl;$('joinurl').href=res.joinUrl;$('status').textContent='Ready when you are. Connect your phone or play on this PC.';}
socket.on('connect',()=>{if(hostSession){socket.emit(EV.HOST_RESUME,hostSession,res=>{if(res.ok){roomReady(res);phone=res.players?.[0]??null;socket.emit(EV.HOST_PHASE,state==='lobby'?'lobby':'game');hud();}else createRoom();});}else createRoom();});
function createRoom(){socket.emit(EV.HOST_CREATE,{},res=>{if(res.ok)hostSession={code:res.code,hostToken:res.hostToken};roomReady(res);});}
socket.on(EV.PLAYER_JOINED,p=>{phone={...p,connected:true};$('status').textContent='Phone connected. Ready for your first tee?';$('start').disabled=false;setTimeout(hud,200);});
socket.on(EV.PLAYER_LEFT,()=>{if(phone)phone.connected=false;$('start').disabled=true;if(!practice)message('Phone disconnected · reconnect to continue',10);});
socket.on(EV.CONFIG,()=>hud());socket.on(EV.CTRL_START,()=>{if(state==='lobby')start(false);else if(state==='complete')advance();});
socket.on(EV.TRIGGER,m=>{if(practice||!phone?.connected)return;if(m.kind==='club')setClub(m.club);if(m.kind==='aim'&&state==='ready'&&Number.isFinite(m.aim)){aim=clamp(m.aim,-60,60);hud();}if(m.kind==='swing'&&Number.isSafeInteger(m.id)&&m.id>lastId){lastId=m.id;if(state==='ready'&&Number.isFinite(m.aim))aim=clamp(m.aim,-60,60);strike(m.power);}});
socket.on('disconnect',()=>{message('Connecting to clubhouse…',10);$('status').textContent='Reconnecting to server…';});
const look=new THREE.Vector3(),desired=new THREE.Vector3();let last=performance.now();
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.1);last=now;elapsed+=dt;
 if(state==='flight'){accumulator+=dt;let outcome;while(accumulator>=1/120&&ball.moving){const falling=ball.vy<-3;outcome=step(ball,HOLES[index],1/120);if(falling&&ball.y<=.22&&!['penalty','cup'].includes(outcome))effects.burst(ball,surfaceAt(ball,HOLES[index])==='sand'?0xf4d898:0xc8ee96,18,3);accumulator-=1/120;}if(!ball.moving){accumulator=0;if(outcome==='cup')finishHole();else if(outcome==='penalty'){effects.burst(ball,surfaceAt(ball,HOLES[index])==='water'?0x7ae7ff:0xe3d2a1,90,10);strokes++;ball={...launchPoint,moving:false,vx:0,vy:0,vz:0};settle();message('Water / out of bounds · +1 penalty',4);}else settle();}}
 if(state==='complete'&&elapsed>=celebrationUntil)$('result').classList.remove('hidden');effects.update(dt,ball,state==='flight');ballMesh.rotation.x+=ball.vz*dt;ballMesh.rotation.z-=ball.vx*dt;
 ballMesh.position.set(ball.x,ball.y,ball.z);shadow.position.set(ball.x,.025,ball.z);shadow.visible=state!=='complete';shadow.scale.setScalar(1+ball.y*.06);
 const fp=flag.geometry.attributes.position;for(let i=0;i<fp.count;i++){const x=fp.getX(i);fp.setZ(i,Math.sin(elapsed*5+x*3)*(x+.95)*.12);}fp.needsUpdate=true;
 ripples.forEach((r,i)=>r.scale.setScalar(1+Math.sin(elapsed*1.3+i)*.08));
 if(state==='lobby'){desired.set(44,37,28);look.set(0,0,-42);}else{const h=HOLES[index],dx=h.pin.x-ball.x,dz=h.pin.z-ball.z,len=Math.max(1,Math.hypot(dx,dz));desired.set(ball.x-dx/len*18,Math.max(12,ball.y+9),ball.z-dz/len*18);look.set(ball.x+dx/len*9,Math.max(0,ball.y*.45),ball.z+dz/len*9);if(state==='complete'&&elapsed<celebrationUntil){desired.set(ball.x+Math.sin(elapsed)*14,9,ball.z+Math.cos(elapsed)*14);look.set(ball.x,2,ball.z);}}
 camera.fov=48+effects.kick*4;camera.updateProjectionMatrix();camera.position.lerp(desired,1-Math.exp(-dt*3));camera.lookAt(look);
 aimLine.visible=state==='ready';if(aimLine.visible){const h=HOLES[index],angle=Math.atan2(h.pin.x-ball.x,h.pin.z-ball.z)+aim*Math.PI/180;const len=club==='putter'?12:club==='wedge'?25:club==='iron'?45:65;aimLine.geometry.dispose();aimLine.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ball.x,.15,ball.z),new THREE.Vector3(ball.x+Math.sin(angle)*len,.15,ball.z+Math.cos(angle)*len)]);aimLine.computeLineDistances();}
 if(elapsed>messageUntil)$('message').textContent='';if(elapsed-lastHUD>1&&state==='flight'){lastHUD=elapsed;hud();}renderer.render(scene,camera);
}requestAnimationFrame(animate);
window.__golf={get state(){return state;},get ball(){return ball;},get hole(){return index;},get holes(){return HOLES;},start,strike,advance,renderer};
