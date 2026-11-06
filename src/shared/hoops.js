import {clamp} from './golf.js';

// Arcade half-court basketball. The rim is slightly larger than real life so
// short phone flicks stay fun, and the launch angle is fixed: the only thing a
// player has to control is power, exactly like a Wii Sports-style shooting minigame.
export const HOOP_SHOTS = 5;

export const HOOPS = {
  rim: {x: 0, y: 3.05, z: -6.4, radius: 0.34, tube: 0.028},
  backboard: {z: -6.85, bottom: 2.9, top: 3.98, halfWidth: 0.9},
  ballRadius: 0.12,
  releaseY: 2.0,
  gravity: 9.81,
  angle: (52 * Math.PI) / 180,
};

export const HOOPS_SPOTS = [
  {name: 'Free throw', x: 0, z: -2.0, points: 2},
  {name: 'Left elbow', x: -3.0, z: -0.6, points: 2},
  {name: 'Right wing', x: 2.85, z: 0.35, points: 3},
  {name: 'Deep corner', x: -3.55, z: 1.5, points: 3},
  {name: 'Downtown', x: 0.6, z: 2.75, points: 3},
];

export const hoopDistance = (spot) => Math.hypot(spot.x - HOOPS.rim.x, spot.z - HOOPS.rim.z);

// Launch speed that drops the ball through the middle of the rim at the fixed
// launch angle. Used for the "sweet spot" drawn on the phone's power meter.
export function idealSpeed(spot) {
  const d = hoopDistance(spot);
  const rise = HOOPS.rim.y + 0.03 - HOOPS.releaseY;
  const tan = Math.tan(HOOPS.angle);
  const cos = Math.cos(HOOPS.angle);
  const denom = 2 * cos * cos * (d * tan - rise);
  return Math.sqrt((HOOPS.gravity * d * d) / Math.max(0.001, denom));
}

export const HOOPS_MIN_SPEED = 6.2;
export const HOOPS_MAX_SPEED = 11.4;
export const idealPower = (spot) => clamp((idealSpeed(spot) - HOOPS_MIN_SPEED) / (HOOPS_MAX_SPEED - HOOPS_MIN_SPEED), 0.06, 0.94);
export const powerForSpeed = (speed) => clamp((speed - HOOPS_MIN_SPEED) / (HOOPS_MAX_SPEED - HOOPS_MIN_SPEED), 0, 1);
export const shotSpeed = (power) => HOOPS_MIN_SPEED + clamp(power, 0, 1) * (HOOPS_MAX_SPEED - HOOPS_MIN_SPEED);

const lerp = (a, b, t) => a + (b - a) * t;

function rimNormal(ball) {
  const dx = ball.x - HOOPS.rim.x;
  const dz = ball.z - HOOPS.rim.z;
  const d = Math.hypot(dx, dz) || 0.0001;
  const px = HOOPS.rim.x + (dx / d) * HOOPS.rim.radius;
  const pz = HOOPS.rim.z + (dz / d) * HOOPS.rim.radius;
  return {
    nx: ball.x - px,
    ny: ball.y - HOOPS.rim.y,
    nz: ball.z - pz,
    length: Math.hypot(ball.x - px, ball.y - HOOPS.rim.y, ball.z - pz),
    px,
    py: HOOPS.rim.y,
    pz,
  };
}

/**
 * Simulate one shot. Returns every frame of the path so the big screen can
 * replay it from the server's authoritative result instead of trusting the
 * phone. Collisions with the rim and backboard are visual only; the scoring
 * plane is checked explicitly.
 */
export function simulateHoopsShot(spot, power) {
  const p = clamp(Number.isFinite(power) ? power : 0, 0, 1);
  const start = {x: spot.x, y: HOOPS.releaseY, z: spot.z};
  const dx = HOOPS.rim.x - start.x;
  const dz = HOOPS.rim.z - start.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  const yaw = Math.atan2(dx, dz);
  const speed = shotSpeed(p);
  const horizontal = Math.cos(HOOPS.angle) * speed;
  const ball = {
    x: start.x,
    y: start.y,
    z: start.z,
    vx: Math.sin(yaw) * horizontal,
    vy: Math.sin(HOOPS.angle) * speed,
    vz: Math.cos(yaw) * horizontal,
  };
  const dt = 1 / 240;
  const path = [[0, ball.x, ball.y, ball.z]];
  const stepPath = 4; // 60 Hz path samples are plenty for interpolation
  let t = 0;
  let made = false;
  let makeAt = null;
  let touchedRim = false;
  let touchedBoard = false;
  let stoppedAt = null;

  for (let i = 0; i < 240 * 6; i++) {
    const prev = {...ball};
    ball.vy -= HOOPS.gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    t += dt;

    if (!touchedBoard && ball.vz < 0) {
      const boardFront = HOOPS.backboard.z + HOOPS.ballRadius;
      if (prev.z >= boardFront && ball.z < boardFront) {
        const f = (prev.z - boardFront) / Math.max(0.0001, prev.z - ball.z);
        const cx = lerp(prev.x, ball.x, f);
        const cy = lerp(prev.y, ball.y, f);
        if (Math.abs(cx) <= HOOPS.backboard.halfWidth && cy <= HOOPS.backboard.top && cy >= HOOPS.backboard.bottom) {
          touchedBoard = true;
          ball.z = boardFront;
          ball.vz = Math.abs(ball.vz) * 0.48;
          ball.vx *= 0.72;
          ball.vy *= 0.76;
        }
      }
    }

    if (!made) {
      const r = rimNormal(ball);
      const reach = HOOPS.ballRadius + HOOPS.rim.tube;
      if (r.length < reach) {
        touchedRim = true;
        const length = Math.max(0.0001, r.length);
        const nx = r.nx / length;
        const ny = r.ny / length;
        const nz = r.nz / length;
        const dot = ball.vx * nx + ball.vy * ny + ball.vz * nz;
        if (dot < 0) {
          const restitution = 0.44;
          ball.vx = (ball.vx - (1 + restitution) * dot * nx) * 0.86;
          ball.vy = (ball.vy - (1 + restitution) * dot * ny) * 0.86;
          ball.vz = (ball.vz - (1 + restitution) * dot * nz) * 0.86;
        }
        ball.x = r.px + nx * (reach + 0.001);
        ball.y = r.py + ny * (reach + 0.001);
        ball.z = r.pz + nz * (reach + 0.001);
      }
    }

    if (!made && ball.vy < 0 && prev.y >= HOOPS.rim.y && ball.y < HOOPS.rim.y) {
      const f = (prev.y - HOOPS.rim.y) / Math.max(0.0001, prev.y - ball.y);
      const cx = lerp(prev.x, ball.x, f);
      const cz = lerp(prev.z, ball.z, f);
      if (Math.hypot(cx - HOOPS.rim.x, cz - HOOPS.rim.z) <= HOOPS.rim.radius - HOOPS.ballRadius * 0.5) {
        made = true;
        makeAt = t;
        // The net kills most horizontal momentum, so the ball drops through.
        ball.vx *= 0.25;
        ball.vz *= 0.25;
      }
    }

    if (ball.y <= HOOPS.ballRadius) {
      ball.y = HOOPS.ballRadius;
      if (ball.vy < -0.55) ball.vy = -ball.vy * 0.52;
      else ball.vy = 0;
      ball.vx *= 0.84;
      ball.vz *= 0.84;
      if (Math.hypot(ball.vx, ball.vy, ball.vz) < 0.6) stoppedAt = t;
    }

    if (i % stepPath === 0) path.push([t, ball.x, ball.y, ball.z]);

    // A made basket can cut away shortly after the ball clears the net.
    if (made && makeAt != null && t - makeAt > 0.85) {
      stoppedAt = t;
      break;
    }
    if (stoppedAt != null) break;
    if (t > 5.2) {
      stoppedAt = t;
      break;
    }
  }

  if (stoppedAt == null) stoppedAt = t;
  const last = path[path.length - 1];
  if (last[0] < stoppedAt) path.push([stoppedAt, ball.x, ball.y, ball.z]);

  return {
    path,
    end: stoppedAt,
    makeAt,
    result: made ? 'made' : 'miss',
    points: made ? spot.points : 0,
    swish: made && !touchedRim && !touchedBoard,
    touchedRim,
    touchedBoard,
    power: p,
    speed,
    idealPower: idealPower(spot),
    distance: Math.round(hoopDistance(spot) * 10) / 10,
  };
}

export function hoopsShotLabel(shot) {
  if (!shot) return '';
  if (shot.result === 'made') return shot.swish ? 'Nothing but net!' : 'Bucket!';
  return shot.touchedBoard ? 'Off the glass' : shot.touchedRim ? 'Rimmed out' : 'Off the mark';
}

// A player starts each round at the next spot. Keeping this server-side means
// phones cannot pick an easier shot.
export function spotForRound(round) {
  return HOOPS_SPOTS[clamp(round, 0, HOOPS_SPOTS.length - 1)];
}
