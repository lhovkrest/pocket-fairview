import {HOOPS_SPOTS, idealPower, simulateHoopsShot} from '../src/shared/hoops.js';
for (const spot of HOOPS_SPOTS) {
  const ideal = idealPower(spot);
  const rows = [];
  for (const d of [-0.16,-0.12,-0.08,-0.04,-0.02,0,0.02,0.04,0.08,0.12,0.16]) {
    const p = Math.max(0, Math.min(1, ideal+d));
    const s = simulateHoopsShot(spot, p);
    rows.push(`${d>=0?'+':''}${d.toFixed(2)}:${s.result==='made'?'IN':'--'}${s.swish?'*':''}${s.touchedRim?'r':''}${s.touchedBoard?'b':''} ${s.end.toFixed(1)}s`);
  }
  console.log(spot.name, 'ideal', (ideal*100).toFixed(1)+'%', rows.join(' '));
}
