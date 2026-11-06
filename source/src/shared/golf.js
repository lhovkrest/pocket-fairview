export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const CLUBS={driver:{label:'Driver',speed:26,loft:0.52},iron:{label:'Iron',speed:21,loft:0.72},wedge:{label:'Wedge',speed:15,loft:0.95},putter:{label:'Putter',speed:12,loft:0}};
export const HOLES=[
 {name:'Morning Meadow',par:3,pin:{x:0,z:-78},sand:[{x:12,z:-60,rx:8,rz:11}],water:[]},
 {name:'Willow Bend',par:4,width:10,wind:0.35,pin:{x:14,z:-112},sand:[{x:1,z:-95,rx:9,rz:8}],water:[{x:-8,z:-51,rx:12,rz:16}]},
 {name:'Sunset Crossing',par:4,width:8,wind:-0.65,pin:{x:-12,z:-125},sand:[{x:-25,z:-107,rx:8,rz:13}],water:[{x:8,z:-73,rx:15,rz:13}]},
 {name:'Needle Valley',par:4,width:7,wind:0.9,pin:{x:20,z:-145},sand:[{x:13,z:-125,rx:7,rz:9},{x:-7,z:-88,rx:8,rz:11}],water:[{x:6,z:-61,rx:16,rz:10}]},
 {name:'Island Approach',par:5,width:6,wind:-1.1,pin:{x:-18,z:-165},sand:[{x:-28,z:-147,rx:7,rz:10}],water:[{x:4,z:-72,rx:20,rz:12},{x:-5,z:-127,rx:19,rz:9}]},
 {name:'The Final Carry',par:5,width:5.5,wind:1.35,pin:{x:12,z:-185},sand:[{x:0,z:-166,rx:7,rz:11},{x:24,z:-177,rx:6,rz:9}],water:[{x:-5,z:-60,rx:18,rz:11},{x:12,z:-124,rx:23,rz:12}]},
];
const inside=(p,e)=>((p.x-e.x)/e.rx)**2+((p.z-e.z)/e.rz)**2<1;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function surfaceAt(p,hole){
 if(Math.abs(p.x)>48||p.z>25||p.z<hole.pin.z-28)return 'out';
 if(hole.water.some(e=>inside(p,e)))return 'water';
 if(hole.sand.some(e=>inside(p,e)))return 'sand';
 if(distance(p,hole.pin)<12)return 'green';
 const t=clamp(p.z/hole.pin.z,0,1);return Math.abs(p.x-hole.pin.x*t)<(hole.width??13)?'fairway':'rough';
}
export function newBall(){return {x:0,y:0.22,z:5,vx:0,vy:0,vz:0,moving:false};}
export function launch(ball,hole,club,power,aim){
 if(ball.moving||!CLUBS[club]||!Number.isFinite(power)||!Number.isFinite(aim))return false;
 const c=CLUBS[club], angle=Math.atan2(hole.pin.x-ball.x,hole.pin.z-ball.z)+clamp(aim,-80,80)*Math.PI/180;
 const surface=surfaceAt(ball,hole),lie=surface==='sand'?0.62:surface==='rough'?0.85:1;
 const speed=c.speed*clamp(power,0.08,1)*lie;
 Object.assign(ball,{vx:Math.sin(angle)*speed*Math.cos(c.loft),vz:Math.cos(angle)*speed*Math.cos(c.loft),vy:Math.sin(c.loft)*speed,moving:true});return true;
}
/** Fixed-step simulation. Returns rolling/flying/stop/cup/penalty. */
export function step(ball,hole,dt){
 if(!ball.moving)return 'stop';
 const old={x:ball.x,y:ball.y,z:ball.z};
 const flying=ball.y>0.221||ball.vy>0;
 if(flying){ball.vy-=9.81*dt;ball.vx+=(hole.wind??0)*dt;}
 ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.y+=ball.vy*dt;
 // Test the whole path, not only its endpoint. Any low ball overlapping the
 // visible cup scores, even when a hard putt crosses it within a single step.
 const dx=ball.x-old.x,dz=ball.z-old.z,length=dx*dx+dz*dz;
 const t=length?clamp(((hole.pin.x-old.x)*dx+(hole.pin.z-old.z)*dz)/length,0,1):1;
 const height=old.y+(ball.y-old.y)*t;
 if(ball.vy<=0&&height<=.35&&distance({x:old.x+dx*t,z:old.z+dz*t},hole.pin)<=.65){
  Object.assign(ball,{x:hole.pin.x,y:.22,z:hole.pin.z,moving:false,vx:0,vy:0,vz:0});return 'cup';
 }
 if(ball.y<=0.22){
  ball.y=0.22;const s=surfaceAt(ball,hole);
  if(s==='water'||s==='out'){ball.moving=false;return 'penalty';}
  if(ball.vy < -3 && s!=='sand')ball.vy=-ball.vy*0.28;else ball.vy=0;
  const speed=Math.hypot(ball.vx,ball.vz), decel=({green:1.4,fairway:2.3,rough:5.5,sand:10}[s]??2.3)*dt;
  const scale=Math.max(0,1-decel/Math.max(speed,0.001));ball.vx*=scale;ball.vz*=scale;
  if(Math.hypot(ball.vx,ball.vz)<0.15&&ball.vy===0){ball.moving=false;return 'stop';}
 }
 return ball.y>0.23?'flying':'rolling';
}
export class SwingMeter{
 constructor(){this.cancel();}
 start(t){this.started=t;this.peak=0;this.samples=0;this.active=true;}
 sample(rate,t){if(!this.active||!Number.isFinite(rate)||t-this.started<80)return;this.peak=Math.max(this.peak,Math.min(Math.abs(rate),900));this.samples++;}
 power(){return clamp((this.peak-20)/330,0,1);}
 finish(t){const power=this.power(),valid=this.active&&t-this.started>=180&&t-this.started<6000&&this.samples>=3&&power>=0.08;this.cancel();return valid?power:null;}
 cancel(){this.active=false;this.started=0;this.samples=0;this.peak=0;}
}
