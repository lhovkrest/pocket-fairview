import express from 'express';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { RoomManager } from './RoomManager.js';
import { loadOrCreateCert } from './certs.js';
import { EV, C2H_EVENTS, H2C_EVENTS, ERRORS, MAX_PLAYERS } from '../shared/protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const ROOT = path.resolve(SRC, '..');

/** Best guess at the address a phone on the same Wi-Fi can reach this machine on. */
export function getLanAddresses() {
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [p, q] = a.address.split('.').map(Number);
      let rank = 3;
      if (p === 192 && q === 168) rank = 0;
      else if (p === 10) rank = 1;
      else if (p === 172 && q >= 16 && q <= 31) rank = 2;
      if (/^(docker|br-|veth|virbr|vmnet|vboxnet)/i.test(name)) rank += 10;
      found.push({ address: a.address, rank });
    }
  }
  return found.sort((a, b) => a.rank - b.rank).map((f) => f.address);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export async function startServer({
  port = Number(process.env.PORT ?? 3001),
  httpsPort = process.env.NO_HTTPS ? null : Number(process.env.HTTPS_PORT ?? 3444),
  host = process.env.HOST ?? '0.0.0.0',
  quiet = false,
} = {}) {
  const log = (...a) => (quiet ? undefined : console.log(...a));
  const lanIps = getLanAddresses();
  const lanIp = process.env.PUBLIC_HOST || lanIps[0] || 'localhost';
  const rooms = new RoomManager();

  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

  // Static assets. Absolute URLs everywhere so the pages work with or without trailing slashes.
  app.use('/shared', express.static(path.join(SRC, 'shared')));
  app.use('/styles', express.static(path.join(SRC, 'styles')));
  app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three')));
  app.use('/desktop', express.static(path.join(SRC, 'client-desktop')));
  app.use('/controller/assets', express.static(path.join(SRC, 'client-mobile')));
  app.get('/', (_req, res) => res.sendFile(path.join(SRC, 'client-desktop/index.html')));
  app.get('/controller', (_req, res) => res.sendFile(path.join(SRC, 'client-mobile/index.html')));
  app.get('/play', (req, res) => res.redirect(302, `/controller${req.url.slice(req.path.length)}`));

  const httpServer = http.createServer(app);
  let httpsServer = null;
  let certSource = null;
  if (httpsPort != null) {
    const cert = await loadOrCreateCert({ ips: lanIps, dir: path.join(ROOT, '.certs') });
    certSource = cert.source;
    httpsServer = https.createServer({ key: cert.key, cert: cert.cert }, app);
  }

  const io = new Server({ cors: { origin: false }, pingInterval: 5000, pingTimeout: 8000 });
  io.attach(httpServer);
  if (httpsServer) io.attach(httpsServer);

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, resolve);
  });
  const actualPort = httpServer.address().port;
  if (httpsServer) {
    await new Promise((resolve, reject) => {
      httpsServer.once('error', reject);
      httpsServer.listen(httpsPort, host, resolve);
    });
  }
  const actualHttpsPort = httpsServer ? httpsServer.address().port : null;

  const controllerBase =
    process.env.PUBLIC_URL?.replace(/\/$/, '') ??
    (httpsServer ? `https://${lanIp}:${actualHttpsPort}` : `http://${lanIp}:${actualPort}`);
  const joinUrlFor = (code) => `${controllerBase}/controller?code=${code}`;

  const toHost = (room) => (room.hostSocketId ? io.to(room.hostSocketId) : null);

  io.on('connection', (socket) => {
    socket.on(EV.HOST_CREATE, async (_opts, ack) => {
      if (typeof ack !== 'function') return;
      const room = rooms.createRoom(socket.id);
      const joinUrl = joinUrlFor(room.code);
      const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      ack({ ok: true, code: room.code, hostToken: room.hostToken, joinUrl, qrSvg, maxPlayers: MAX_PLAYERS });
    });

    socket.on(EV.HOST_RESUME, async (msg, ack) => {
      if (typeof ack !== 'function') return;
      const room = rooms.resumeRoom(msg?.code, msg?.hostToken, socket.id);
      if (!room) return ack({ ok: false });
      rooms.setPhase(room.code, 'lobby'); // a reloaded host starts in the lobby
      const joinUrl = joinUrlFor(room.code);
      const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      const players = room.players.filter(Boolean).map((p) => ({ slot: p.slot, name: p.name, connected: p.connected }));
      ack({ ok: true, code: room.code, joinUrl, qrSvg, players, maxPlayers: MAX_PLAYERS });
      for (const p of rooms.connectedPlayers(room)) io.to(p.socketId).emit(EV.HOST_BACK);
    });

    socket.on(EV.HOST_PHASE, (phase) => {
      const info = rooms.info(socket.id);
      if (info?.role === 'host') rooms.setPhase(info.code, phase);
    });

    socket.on(EV.HOST_SEND, (msg) => {
      const info = rooms.info(socket.id);
      if (info?.role !== 'host' || !msg || !H2C_EVENTS.includes(msg.ev)) return;
      const room = rooms.getRoom(info.code);
      if (!room) return;
      const targets =
        msg.slot === 'all' || msg.slot == null
          ? rooms.connectedPlayers(room)
          : [room.players[msg.slot]].filter((p) => p?.connected);
      for (const p of targets) io.to(p.socketId).emit(msg.ev, msg.data ?? {});
    });

    socket.on(EV.CTRL_JOIN, (msg, ack) => {
      if (typeof ack !== 'function') return;
      if (!msg || typeof msg !== 'object') return ack({ ok: false, error: 'BAD_REQUEST', message: ERRORS.BAD_REQUEST });
      const res = rooms.join(msg.code, socket.id, { name: msg.name, token: msg.token });
      if (!res.ok) return ack({ ok: false, error: res.error, message: ERRORS[res.error] });
      toHost(res.room)?.emit(EV.PLAYER_JOINED, { slot: res.slot, name: res.name, returning: res.returning });
      ack({ ok: true, slot: res.slot, token: res.token, name: res.name, code: res.room.code });
    });

    // phone -> host relay. The server stamps the slot so a phone cannot pose as the other player.
    for (const ev of C2H_EVENTS) {
      socket.on(ev, (data) => {
        const info = rooms.info(socket.id);
        if (info?.role !== 'ctrl') return;
        const room = rooms.getRoom(info.code);
        const target = room && toHost(room);
        if (!target) return;
        if (ev === EV.AIM) {
          if (!data || !isNum(data.x) || !isNum(data.y)) return;
          target.volatile.emit(ev, { slot: info.slot, x: data.x, y: data.y });
          return;
        }
        const payload = data && typeof data === 'object' ? { ...data } : {};
        payload.slot = info.slot;
        target.emit(ev, payload);
      });
    }

    socket.on(EV.RTT, (ack) => typeof ack === 'function' && ack());

    socket.on('disconnect', () => {
      const res = rooms.leaveSocket(socket.id);
      if (!res) return;
      if (res.role === 'host') {
        for (const p of rooms.connectedPlayers(res.room)) io.to(p.socketId).emit(EV.HOST_LEFT);
      } else {
        toHost(res.room)?.emit(EV.PLAYER_LEFT, { slot: res.slot, removed: res.removed });
      }
    });
  });

  const sweeper = setInterval(() => rooms.sweep(), 15_000);
  sweeper.unref();

  // socket.io only knows about the last server it was attached to, so close both explicitly.
  const closeServer = (s) =>
    new Promise((resolve) => {
      if (!s) return resolve();
      s.closeAllConnections?.();
      s.close(() => resolve());
    });
  const close = async () => {
    clearInterval(sweeper);
    await Promise.all([new Promise((resolve) => io.close(() => resolve())), closeServer(httpServer), closeServer(httpsServer)]);
  };

  if (!quiet) {
    const line = '─'.repeat(64);
    console.log(`\n${line}\n  POCKET FAIRWAY\n${line}`);
    console.log(`  Big screen (open on your PC):   http://localhost:${actualPort}`);
    console.log(`  Phone controller base URL:      ${controllerBase}/controller`);
    if (httpsServer) {
      console.log(`  HTTPS certificate:              ${certSource}`);
      if (certSource !== 'env') {
        console.log('  Your phone will warn about the certificate: tap Advanced > Proceed.');
        console.log('  (Motion sensors only work on HTTPS pages. See README for trusted-cert options.)');
      }
    } else {
      console.log('  HTTPS is OFF: phones will not expose motion sensors over plain HTTP on a LAN address.');
    }
    if (lanIps.length > 1) console.log(`  Other addresses on this machine: ${lanIps.slice(1).join(', ')} (set PUBLIC_HOST to change)`);
    console.log(`${line}\n`);
  }

  return { app, io, rooms, httpServer, httpsServer, port: actualPort, httpsPort: actualHttpsPort, close, joinUrlFor };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
