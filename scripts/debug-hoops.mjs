import {HOOPS_SPOTS, idealPower, simulateHoopsShot} from '../src/shared/hoops.js';
const spot=HOOPS_SPOTS[0];
for(const d of [-0.16,0,0.16]){
 const s=simulateHoopsShot(spot, idealPower(spot)+d);
 console.log('d',d,'result',s.result,'makeAt',s.makeAt,'points',s.points);
 const near=s.path.filter(p=>Math.abs(p[3]-(-6.4))<0.8);
 console.log(near.map(p=>`t=${p[0].toFixed(2)} x=${p[1].toFixed(2)} y=${p[2].toFixed(2)} z=${p[3].toFixed(2)}`).join('\n'));
}
