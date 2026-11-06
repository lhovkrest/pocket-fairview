import {clamp} from './golf.js';
// Short, intentional swings should also work with lower-rate phone sensors.
export class ClubSwing{
 constructor(){this.cancel();}
 start(t){this.started=t;this.peak=0;this.samples=0;this.active=true;}
 sample(rate,t){if(!this.active||!Number.isFinite(rate)||t-this.started<40)return;this.peak=Math.max(this.peak,Math.min(Math.abs(rate),900));this.samples++;}
 power(){return clamp((this.peak-12)/260,0,1);}
 finish(t){const duration=t-this.started,power=this.power();this.reason=!this.active?'cancelled':duration<120?'tap':duration>6000?'long':this.samples<2?'sensor':power<.08?'gentle':null;this.active=false;return this.reason?null:power;}
 cancel(){this.active=false;this.started=0;this.peak=0;this.samples=0;this.reason='cancelled';}
}
export function rotationSpeed(previous,current,dt){
 if(!previous||!current||dt<.008||dt>.3)return null;
 const trace=previous.reduce((sum,v,i)=>sum+v*current[i],0);
 return Math.acos(clamp((trace-1)/2,-1,1))*180/Math.PI/dt;
}
