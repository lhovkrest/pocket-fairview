import * as THREE from 'three';
import {HOLES} from '/shared/golf.js';
import {Effects} from '/desktop/effects.js';
export function createView(canvas){let index=0;
const scene=new THREE.Scene();scene.background=new THREE.Color('#d8e8d4');scene.fog=new THREE.Fog('#d8e8d4',120,280);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
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

 let last=performance.now(),current=null,shotId=null,celebrated=null;const look=new THREE.Vector3(),desired=new THREE.Vector3();
 const otherBalls=Array.from({length:4},()=>mesh(new THREE.SphereGeometry(.25,12,10),'#ffffff',scene));
 function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;
  let b={x:0,y:.22,z:5},moving=false,aim=0;
  if(current){const h=HOLES[current.hole];if(index!==current.hole){index=current.hole;buildCourse();effects.clear();}
   const p=current.players.find(p=>p.id===current.turn)??current.players[0];if(p){b={...p.ball};aim=p.aim;}
   const shot=current.shot;if(current.phase==='flight'&&shot?.path){const time=Math.max(0,(Date.now()+current.offset-shot.start)/1000),path=shot.path;
    let i=path.findIndex(p=>p[0]>=time);if(i<0)i=path.length-1;const to=path[i],from=path[Math.max(0,i-1)],t=to[0]===from[0]?1:Math.min(1,(time-from[0])/(to[0]-from[0]));b={x:from[1]+(to[1]-from[1])*t,y:from[2]+(to[2]-from[2])*t,z:from[3]+(to[3]-from[3])*t};moving=time<path.at(-1)[0];
    if(shotId!==shot.id){shotId=shot.id;effects.burst(b,0xffe9a6,36,5);effects.kick=shot.power;}
    if(!moving&&celebrated!==shot.id){celebrated=shot.id;if(shot.result==='cup')effects.celebrate(h.pin);else if(shot.result==='penalty')effects.burst(b,0x7ae7ff,90,8);}
   }
   otherBalls.forEach((m,i)=>{const q=current.players[i];m.visible=!!q&&!q.done&&q.id!==current.turn;if(q){m.position.set(q.ball.x,.25,q.ball.z);m.material.color.set(q.color);}});
   ballMesh.material.color.set(p?.color??'#ffffff');
  }
  ballMesh.position.set(b.x,b.y,b.z);shadow.position.set(b.x,.025,b.z);effects.update(dt,b,moving);flag.rotation.y=Math.sin(now*.002)*.12;ripples.forEach((r,i)=>r.scale.setScalar(1+Math.sin(now*.0013+i)*.08));
  const h=HOLES[index],dx=h.pin.x-b.x,dz=h.pin.z-b.z,len=Math.max(1,Math.hypot(dx,dz));
  if(!current||current.phase==='lobby'){desired.set(44,37,28);look.set(0,0,-42);aimLine.visible=false;}else{desired.set(b.x-dx/len*18,Math.max(12,b.y+9),b.z-dz/len*18);look.set(b.x+dx/len*9,b.y*.4,b.z+dz/len*9);aimLine.visible=current.phase==='ready';}
  if(aimLine.visible){const angle=Math.atan2(dx,dz)+aim*Math.PI/180;aimLine.geometry.dispose();aimLine.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.x,.15,b.z),new THREE.Vector3(b.x+Math.sin(angle)*35,.15,b.z+Math.cos(angle)*35)]);aimLine.computeLineDistances();}
  camera.position.lerp(desired,1-Math.exp(-dt*3));camera.lookAt(look);camera.fov=48+effects.kick*4;camera.updateProjectionMatrix();renderer.render(scene,camera);
 }requestAnimationFrame(frame);
 return {update(match){current=match;},renderer};
}
