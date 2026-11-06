import * as THREE from 'three';
import {HOOPS, HOOPS_SPOTS, HOOP_SHOTS, hoopDistance} from '/shared/hoops.js';
import {Effects} from '/desktop/effects.js';

const TAU = Math.PI * 2;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.85, ...extra});
const lineMat = (color, opacity = 1) => new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity});

function ringPoints(radius, y, segments = 64, start = 0, end = TAU) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + (end - start) * (i / segments);
    points.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return points;
}

export function createHoopsView(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#070d16');
  scene.fog = new THREE.FogExp2('#070d16', 0.022);
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160);
  camera.position.set(8.2, 5.6, 11.5);

  scene.add(new THREE.HemisphereLight(0xcfe7ff, 0x1b1109, 1.5));
  const key = new THREE.DirectionalLight(0xfff3d6, 3.1);
  key.position.set(-6, 12, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40});
  scene.add(key);
  const glow = new THREE.PointLight(0xff8e42, 5, 12);
  glow.position.set(0, 3.4, -6.1);
  scene.add(glow);

  const arena = new THREE.Group();
  scene.add(arena);

  // Court floor and planks.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.18, 19), mat('#7b4a27', {roughness: 0.72}));
  floor.position.set(0, -0.1, 1.2);
  floor.receiveShadow = true;
  arena.add(floor);
  for (let i = 0; i < 13; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(15.4 / 13 - 0.015, 0.012, 19),
      mat(i % 2 ? '#8a562d' : '#956033', {roughness: 0.8}),
    );
    plank.position.set(-7.7 + (i + 0.5) * (15.4 / 13), 0.012, 1.2);
    arena.add(plank);
  }

  const paint = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 5.8), mat('#214c40', {roughness: 0.9}));
  paint.rotation.x = -Math.PI / 2;
  paint.position.set(0, 0.025, -4.3);
  arena.add(paint);
  const laneEdge = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 5.8), mat('#f0ead9'));
  laneEdge.rotation.x = -Math.PI / 2;
  laneEdge.position.set(-2.45, 0.032, -4.3);
  arena.add(laneEdge);
  const laneEdge2 = laneEdge.clone();
  laneEdge2.position.x = 2.45;
  arena.add(laneEdge2);

  function floorLine(points, color = '#efe8d8', opacity = 1) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat(color, opacity));
    arena.add(line);
    return line;
  }
  function flatRect(x, z, w, d, y = 0.032, color = '#efe8d8') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    arena.add(m);
    return m;
  }
  flatRect(0, -7.12, 14.2, 0.055);
  flatRect(-7.08, 1.2, 0.055, 16.7);
  flatRect(7.08, 1.2, 0.055, 16.7);
  floorLine(ringPoints(1.8, 0.034).map(p => new THREE.Vector3(p.x, p.y, p.z - 1.48)));
  floorLine(ringPoints(1.8, 0.034, 64, Math.PI / 2, Math.PI * 1.5).map(p => new THREE.Vector3(p.x, p.y, p.z - 1.48)));
  const arc = [];
  for (let i = 0; i <= 80; i++) {
    const a = 0.22 + (Math.PI - 0.44) * (i / 80);
    arc.push(new THREE.Vector3(Math.cos(a) * 6.75, 0.034, HOOPS.rim.z + Math.sin(a) * 6.75));
  }
  floorLine(arc);

  // Center-court mark, mostly seen in the wide lobby shot.
  floorLine(ringPoints(1.9, 0.034).map(p => new THREE.Vector3(p.x, p.y, p.z + 6.4)));
  flatRect(0, 6.4, 0.055, 3.8);

  // Backboard, rim, net and stanchion.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.84, 1.08, 0.055),
    new THREE.MeshStandardMaterial({color: 0xd7efff, transparent: true, opacity: 0.28, roughness: 0.15, metalness: 0.1}),
  );
  board.position.set(0, 3.44, HOOPS.backboard.z);
  arena.add(board);
  const frame = new THREE.Group();
  arena.add(frame);
  for (const [w, h, x, y] of [[1.96, 0.07, 0, 3.995], [1.96, 0.07, 0, 2.885], [0.07, 1.18, -0.965, 3.44], [0.07, 1.18, 0.965, 3.44]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat('#dce9ef', {metalness: 0.35, roughness: 0.35}));
    bar.position.set(x, y, HOOPS.backboard.z - 0.01);
    frame.add(bar);
  }
  for (const [w, h, x, y] of [[0.63, 0.045, 0, 3.3], [0.63, 0.045, 0, 3.02], [0.045, 0.33, -0.29, 3.16], [0.045, 0.33, 0.29, 3.16]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), mat('#ef7541', {emissive: 0x6b1f0b, emissiveIntensity: 0.25}));
    bar.position.set(x, y, HOOPS.backboard.z + 0.055);
    frame.add(bar);
  }
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(HOOPS.rim.radius, HOOPS.rim.tube, 10, 48),
    mat('#ff6b2c', {metalness: 0.45, roughness: 0.36, emissive: 0x5d1c08, emissiveIntensity: 0.35}),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(HOOPS.rim.x, HOOPS.rim.y, HOOPS.rim.z);
  rim.castShadow = true;
  arena.add(rim);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.34), mat('#d84f20'));
  bracket.position.set(0, 3.05, -6.68);
  arena.add(bracket);

  const net = new THREE.Group();
  net.position.set(0, HOOPS.rim.y, HOOPS.rim.z);
  arena.add(net);
  const netLines = [];
  const netBottomY = -0.48;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const a2 = ((i + 1) / 12) * TAU;
    const top = [Math.cos(a) * 0.325, -0.02, Math.sin(a) * 0.325];
    const bottom = [Math.cos(a + 0.14) * 0.19, netBottomY, Math.sin(a + 0.14) * 0.19];
    netLines.push(...top, ...bottom);
    const top2 = [Math.cos(a2) * 0.325, -0.02, Math.sin(a2) * 0.325];
    const bottom2 = [Math.cos(a2 + 0.14) * 0.19, netBottomY, Math.sin(a2 + 0.14) * 0.19];
    netLines.push(...bottom, ...bottom2);
  }
  for (const [radius, y] of [[0.255, -0.16], [0.21, -0.32], [0.19, netBottomY]]) {
    const ring = ringPoints(radius, y, 24);
    for (let i = 0; i < ring.length - 1; i++) netLines.push(ring[i].x, ring[i].y, ring[i].z, ring[i + 1].x, ring[i + 1].y, ring[i + 1].z);
  }
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(netLines, 3));
  net.add(new THREE.LineSegments(netGeo, lineMat('#eef5ff', 0.62)));

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 3.95, 10), mat('#202b38', {metalness: 0.4, roughness: 0.4}));
  pole.position.set(0, 1.98, -7.62);
  pole.castShadow = true;
  arena.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.9), mat('#202b38', {metalness: 0.4}));
  arm.position.set(0, 4.0, -7.16);
  arena.add(arm);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 2.0), mat('#182431', {metalness: 0.25, roughness: 0.55}));
  base.position.set(0, 0.08, -8.2);
  arena.add(base);

  // Hanging scoreboard.
  const scoreCanvas = document.createElement('canvas');
  scoreCanvas.width = 512;
  scoreCanvas.height = 220;
  const scoreCtx = scoreCanvas.getContext('2d');
  const scoreTexture = new THREE.CanvasTexture(scoreCanvas);
  const scoreboard = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.16), new THREE.MeshBasicMaterial({map: scoreTexture}));
  scoreboard.position.set(0, 5.5, -8.2);
  scene.add(scoreboard);
  const hangerMat = mat('#111a25', {metalness: 0.5});
  for (const x of [-1.05, 1.05]) {
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.1, 5), hangerMat);
    hanger.position.set(x, 6.7, -8.2);
    scene.add(hanger);
  }
  function drawScoreboard(match) {
    scoreCtx.clearRect(0, 0, 512, 220);
    scoreCtx.fillStyle = '#060b12';
    scoreCtx.fillRect(0, 0, 512, 220);
    scoreCtx.strokeStyle = '#ff7438';
    scoreCtx.lineWidth = 8;
    scoreCtx.strokeRect(4, 4, 504, 212);
    scoreCtx.textAlign = 'center';
    scoreCtx.fillStyle = '#ff8a52';
    scoreCtx.font = '700 36px Outfit, sans-serif';
    scoreCtx.fillText('POCKET HOOPS', 256, 53);
    if (!match) {
      scoreCtx.fillStyle = '#e9f1f8';
      scoreCtx.font = '700 52px Outfit, sans-serif';
      scoreCtx.fillText('READY', 256, 130);
      scoreCtx.fillStyle = '#6e879d';
      scoreCtx.font = '600 22px DM Sans, sans-serif';
      scoreCtx.fillText('WAITING FOR TIP-OFF', 256, 174);
    } else if (match.phase === 'lobby') {
      scoreCtx.fillStyle = '#e9f1f8';
      scoreCtx.font = '700 52px Outfit, sans-serif';
      scoreCtx.fillText('LOBBY', 256, 130);
      scoreCtx.fillStyle = '#6e879d';
      scoreCtx.font = '600 22px DM Sans, sans-serif';
      scoreCtx.fillText('PICK YOUR SHOT · 5 ROUNDS', 256, 174);
    } else {
      const p = match.players.find(p => p.id === match.turn);
      scoreCtx.fillStyle = '#e9f1f8';
      scoreCtx.font = '700 48px Outfit, sans-serif';
      scoreCtx.fillText(match.phase === 'finished' ? 'FINAL' : `SHOT ${Math.min(match.hole + 1, HOOP_SHOTS)} / ${HOOP_SHOTS}`, 256, 124);
      scoreCtx.fillStyle = '#ffb38d';
      scoreCtx.font = '600 24px DM Sans, sans-serif';
      scoreCtx.fillText(match.phase === 'finished' ? 'GREAT GAME' : p ? p.name.toUpperCase() : 'NEXT PLAYER', 256, 170);
    }
    scoreTexture.needsUpdate = true;
  }
  drawScoreboard(null);

  // Stands and a living crowd.
  const standMat = mat('#111c2b', {roughness: 0.95});
  for (const [z, y] of [[-11.2, 1.4], [-13.4, 2.2], [-15.4, 3.0]]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(25, 0.8, 2.8), standMat);
    stand.position.set(0, y, z);
    arena.add(stand);
  }
  const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshStandardMaterial({roughness: 0.9}), 150);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = ['#e2734f', '#5d8ccc', '#cba0dc', '#e0b84d', '#78a875', '#d7dce2'];
  for (let i = 0; i < 150; i++) {
    const row = i % 3;
    dummy.position.set(-11.5 + ((i * 7.31) % 23), 1.9 + row * 0.8 + (i % 2) * 0.12, -11.9 - row * 1.9);
    dummy.scale.setScalar(0.75 + ((i * 13) % 7) * 0.05);
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    crowd.setColorAt(i, color.set(palette[i % palette.length]));
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  scene.add(crowd);

  // Arena signage / light strips.
  for (const x of [-11, 11]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 20), new THREE.MeshBasicMaterial({color: 0x2f7c95}));
    strip.position.set(x, 4.8, 0);
    scene.add(strip);
  }
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(32, 12, 0.2), new THREE.MeshBasicMaterial({color: 0x060a10}));
  backWall.position.set(0, 6, -17);
  scene.add(backWall);

  // Ball, shooter and spot marker.
  const ballGroup = new THREE.Group();
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(HOOPS.ballRadius, 24, 18), mat('#e86b2c', {roughness: 0.72}));
  ballMesh.castShadow = true;
  ballGroup.add(ballMesh);
  const seamMat = new THREE.MeshBasicMaterial({color: 0x24120a});
  const seamA = new THREE.Mesh(new THREE.TorusGeometry(HOOPS.ballRadius * 1.001, 0.005, 4, 32), seamMat);
  seamA.rotation.x = Math.PI / 2;
  ballGroup.add(seamA);
  const seamB = new THREE.Mesh(new THREE.TorusGeometry(HOOPS.ballRadius * 1.001, 0.005, 4, 32), seamMat);
  seamB.rotation.y = Math.PI / 2;
  ballGroup.add(seamB);
  scene.add(ballGroup);

  const shooter = new THREE.Group();
  scene.add(shooter);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.85, 5, 10), mat('#e2734f'));
  body.position.y = 1.38;
  body.castShadow = true;
  shooter.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), mat('#c98762'));
  head.position.y = 2.09;
  head.castShadow = true;
  shooter.add(head);
  for (const x of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.62, 4, 7), mat('#26394a'));
    leg.position.set(x, 0.48, 0);
    leg.castShadow = true;
    shooter.add(leg);
  }
  for (const x of [-0.38, 0.38]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 7), mat('#c98762'));
    arm.position.set(x, 1.65, -0.12);
    arm.rotation.z = x < 0 ? -0.45 : 0.45;
    arm.rotation.x = -0.7;
    shooter.add(arm);
  }
  const jerseyNumber = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({color: 0xf7f5ee}));
  jerseyNumber.position.set(0, 1.55, 0.305);
  shooter.add(jerseyNumber);

  const spotMarker = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.8, 40), new THREE.MeshBasicMaterial({color: 0xffb37a, transparent: true, opacity: 0.78, side: THREE.DoubleSide}));
  spotMarker.rotation.x = -Math.PI / 2;
  spotMarker.position.y = 0.045;
  scene.add(spotMarker);
  const spotBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.15, 0.03, 32, 1, true),
    new THREE.MeshBasicMaterial({color: 0xffb37a, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false}),
  );
  spotBeam.position.y = 0.06;
  scene.add(spotBeam);

  const effects = new Effects(scene);
  let current = null;
  let active = true;
  let last = performance.now();
  let shotId = null;
  let celebrated = null;
  let netKick = 0;
  let rimFlash = 0;
  const look = new THREE.Vector3(0, 2.4, -3.4);
  const desired = new THREE.Vector3(8.2, 5.6, 11.5);
  const focus = new THREE.Vector3();
  const point = new THREE.Vector3();

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  function pathAt(path, time, fallback) {
    if (!path?.length) return {...fallback};
    if (time <= path[0][0]) return {x: path[0][1], y: path[0][2], z: path[0][3], moving: false};
    let i = path.findIndex(p => p[0] >= time);
    if (i < 0) i = path.length - 1;
    const to = path[i], from = path[Math.max(0, i - 1)];
    const t = to[0] === from[0] ? 1 : Math.min(1, Math.max(0, (time - from[0]) / (to[0] - from[0])));
    return {
      x: from[1] + (to[1] - from[1]) * t,
      y: from[2] + (to[2] - from[2]) * t,
      z: from[3] + (to[3] - from[3]) * t,
      moving: time < path[path.length - 1][0],
    };
  }

  function update(match) {
    if (!match) return;
    current = match;
    drawScoreboard(match);
    const spot = HOOPS_SPOTS[Math.min(match.hole ?? 0, HOOPS_SPOTS.length - 1)];
    const shooterId = match.phase === 'flight' ? match.shot?.player : match.turn;
    const p = match.players.find(p => p.id === shooterId);
    const showPlayer = match.phase === 'ready' || match.phase === 'flight' || match.phase === 'finished';
    shooter.visible = showPlayer && !!p;
    spotMarker.visible = showPlayer;
    spotBeam.visible = showPlayer;
    if (showPlayer) {
      const colorValue = p?.color ?? '#ffb37a';
      body.material.color.set(colorValue);
      spotMarker.material.color.set(colorValue);
      spotBeam.material.color.set(colorValue);
      shooter.position.set(spot.x, 0, spot.z);
      shooter.rotation.y = Math.atan2(HOOPS.rim.x - spot.x, HOOPS.rim.z - spot.z);
      spotMarker.position.set(spot.x, 0.045, spot.z);
      spotBeam.position.set(spot.x, 0.06, spot.z);
    }
    if (match.phase === 'flight' && match.shot) {
      if (shotId !== match.shot.id) {
        shotId = match.shot.id;
        celebrated = null;
        const startPos = pathAt(match.shot.path, 0, spot);
        effects.burst(startPos, 0xffd08a, 18, 3);
      }
      const t = (Date.now() + (match.offset ?? 0) - match.shot.start) / 1000;
      const b = pathAt(match.shot.path, t, spot);
      ballGroup.position.set(b.x, b.y, b.z);
      ballGroup.rotation.x += b.moving ? 0.12 : 0;
      ballGroup.rotation.z += b.moving ? 0.06 : 0;
      if (match.shot.result === 'made' && match.shot.makeAt != null && t >= match.shot.makeAt && celebrated !== match.shot.id) {
        celebrated = match.shot.id;
        netKick = 1;
        rimFlash = 1;
        effects.celebrate({x: HOOPS.rim.x, y: HOOPS.rim.y, z: HOOPS.rim.z});
      }
      desired.set(7.6 + b.x * 0.12, 5.25 + Math.min(1.2, Math.max(-0.2, b.y) * 0.16), 11.6);
      focus.set(b.x * 0.35, Math.max(1.5, Math.min(3.8, b.y)), b.z * 0.4 - 2.6);
    } else if (showPlayer) {
      ballGroup.position.set(spot.x, 2.48, spot.z + 0.05);
      desired.set(8.2 + spot.x * 0.08, 5.6, 11.5);
      focus.set(spot.x * 0.2, 2.1, spot.z * 0.1 - 2.4);
    } else {
      ballGroup.visible = false;
      desired.set(8.2, 5.6, 11.5);
      focus.set(0, 2.4, -3.4);
    }
    ballGroup.visible = showPlayer;
  }

  function frame(now) {
    if (!active) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (current && current.phase === 'flight') {
      // Keep the ball visible if the match update moved from flight while the
      // local animation was mid-air; the next poll will replace this.
    }
    camera.position.lerp(desired, 1 - Math.exp(-dt * 2.4));
    look.lerp(focus, 1 - Math.exp(-dt * 3.2));
    camera.lookAt(look);
    camera.fov = 48 + rimFlash * 1.8;
    camera.updateProjectionMatrix();
    netKick = Math.max(0, netKick - dt * 2.8);
    rimFlash = Math.max(0, rimFlash - dt * 2.2);
    net.scale.y = 1 + Math.sin((1 - netKick) * Math.PI) * netKick * 0.2;
    net.position.y = HOOPS.rim.y - (1 - Math.cos((1 - netKick) * Math.PI * 0.5)) * 0.03;
    glow.intensity = 4.5 + rimFlash * 22;
    crowd.position.y = Math.sin(now * 0.0015) * 0.04;
    spotBeam.material.opacity = 0.06 + Math.sin(now * 0.002) * 0.025;
    effects.update(dt, {x: ballGroup.position.x, y: ballGroup.position.y, z: ballGroup.position.z}, current?.phase === 'flight');
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    update,
    renderer,
    destroy() {
      active = false;
      removeEventListener('resize', resize);
      effects.clear();
      renderer.dispose();
      scoreTexture.dispose();
    },
  };
}
