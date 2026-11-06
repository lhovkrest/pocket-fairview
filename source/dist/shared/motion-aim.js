import {clamp} from './golf.js';
// DeviceOrientation's intrinsic Z-X'-Y'' convention:
// https://www.w3.org/TR/orientation-event/#deviceorientation
export function rotationMatrix(alpha,beta,gamma){
 if(![alpha,beta,gamma].every(Number.isFinite))return null;
 const [a,b,g]=[alpha,beta,gamma].map(v=>v*Math.PI/180);
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
 return [ca*cg-sa*sb*sg,-sa*cb,ca*sg+sa*sb*cg,sa*cg+ca*sb*sg,ca*cb,sa*sg-ca*sb*cg,-cb*sg,sb,cb*cg];
}
const wrap=a=>((a+180)%360+360)%360-180;
export class MotionAim{
 constructor(){this.local=null;this.value=0;}
 recenter(r,value=0){
  if(!r)return false;
  // Choose a horizontal forward direction at calibration, then express it
  // in the phone's coordinates. This supports upright, flat and sideways grips.
  let x=-r[2],y=-r[5];
  if(Math.hypot(x,y)<.3){x=r[1];y=r[4];}
  const length=Math.hypot(x,y);x/=length;y/=length;
  this.local=[r[0]*x+r[3]*y,r[1]*x+r[4]*y,r[2]*x+r[5]*y];
  this.last=Math.atan2(y,x)*180/Math.PI;this.angle=0;this.offset=value;this.value=value;return true;
 }
 sample(r){
  if(!this.local||!r)return this.value;
  const d=this.local,x=r[0]*d[0]+r[1]*d[1]+r[2]*d[2],y=r[3]*d[0]+r[4]*d[1]+r[5]*d[2];
  // Heading is undefined when pointing almost vertically. Hold the last aim
  // instead of turning a tiny sensor change into a 180-degree snap.
  if(Math.hypot(x,y)<.25){this.last=null;return this.value;}
  const heading=Math.atan2(y,x)*180/Math.PI;
  if(this.last!==null)this.angle+=wrap(heading-this.last);
  this.last=heading;
  const next=clamp(this.offset+this.angle,-60,60);
  // Small hysteresis removes resting jitter without a lagging smoothing filter.
  if(Math.abs(next-this.value)>=.35)this.value=Math.round(next*10)/10;
  return this.value;
 }
}
