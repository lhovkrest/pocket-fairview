import crypto from 'node:crypto';
import { MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/protocol.js';

export function normalizeCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function cleanName(raw, fallback) {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>&"'`]/g, '')
    .trim()
    .slice(0, 10);
  return s || fallback;
}

/**
 * Pure in-memory room bookkeeping. It never touches sockets directly, it only
 * remembers socket ids, so it can be unit-tested without a network.
 */
export class RoomManager {
  constructor({ randomInt = crypto.randomInt, now = Date.now, hostGraceMs = 60_000 } = {}) {
    this.randomInt = randomInt;
    this.now = now;
    this.hostGraceMs = hostGraceMs;
    this.rooms = new Map(); // code -> room
    this.bySocket = new Map(); // socketId -> {role, code, slot?}
  }

  generateCode() {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[this.randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a room code');
  }

  createRoom(hostSocketId) {
    const code = this.generateCode();
    const room = {
      code,
      hostSocketId,
      hostToken: crypto.randomBytes(12).toString('hex'),
      hostGoneAt: null,
      phase: 'lobby', // 'lobby' = players may join, 'game' = round in progress
      players: new Array(MAX_PLAYERS).fill(null),
    };
    this.rooms.set(code, room);
    this.bySocket.set(hostSocketId, { role: 'host', code });
    return room;
  }

  resumeRoom(rawCode, hostToken, hostSocketId) {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (!room || !hostToken || room.hostToken !== hostToken) return null;
    if (room.hostSocketId) this.bySocket.delete(room.hostSocketId);
    room.hostSocketId = hostSocketId;
    room.hostGoneAt = null;
    this.bySocket.set(hostSocketId, { role: 'host', code: room.code });
    return room;
  }

  setPhase(code, phase) {
    const room = this.rooms.get(code);
    if (room && (phase === 'lobby' || phase === 'game')) room.phase = phase;
    return room;
  }

  join(rawCode, socketId, { name, token } = {}) {
    const code = normalizeCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (!room.hostSocketId) return { ok: false, error: 'HOST_OFFLINE' };

    // A returning phone (page reload, Wi-Fi blip) reclaims its slot with its token.
    if (token) {
      const existing = room.players.find((p) => p && p.token === token);
      if (existing) {
        if (existing.socketId) this.bySocket.delete(existing.socketId);
        existing.socketId = socketId;
        existing.connected = true;
        if (name) existing.name = cleanName(name, existing.name);
        this.bySocket.set(socketId, { role: 'ctrl', code, slot: existing.slot });
        return { ok: true, room, slot: existing.slot, token: existing.token, name: existing.name, returning: true };
      }
    }

    if (room.phase !== 'lobby') return { ok: false, error: 'GAME_IN_PROGRESS' };
    const slot = room.players.findIndex((p) => p === null);
    if (slot === -1) return { ok: false, error: 'ROOM_FULL' };

    const player = {
      slot,
      socketId,
      token: crypto.randomBytes(12).toString('hex'),
      name: cleanName(name, `P${slot + 1}`),
      connected: true,
    };
    room.players[slot] = player;
    this.bySocket.set(socketId, { role: 'ctrl', code, slot });
    return { ok: true, room, slot, token: player.token, name: player.name, returning: false };
  }

  /** Called on socket disconnect. Returns what the server should tell the others. */
  leaveSocket(socketId) {
    const info = this.bySocket.get(socketId);
    if (!info) return null;
    this.bySocket.delete(socketId);
    const room = this.rooms.get(info.code);
    if (!room) return null;

    if (info.role === 'host') {
      if (room.hostSocketId !== socketId) return null; // already replaced by a resume
      room.hostSocketId = null;
      room.hostGoneAt = this.now();
      return { role: 'host', room };
    }

    const player = room.players[info.slot];
    if (!player || player.socketId !== socketId) return null; // slot already reclaimed
    player.connected = false;
    player.socketId = null;
    // Between rounds a leaver frees the slot. During a round the slot is held for a return.
    const removed = room.phase === 'lobby';
    if (removed) room.players[info.slot] = null;
    return { role: 'ctrl', room, slot: info.slot, removed };
  }

  getRoom(code) {
    return this.rooms.get(code) ?? null;
  }

  info(socketId) {
    return this.bySocket.get(socketId) ?? null;
  }

  connectedPlayers(room) {
    return room.players.filter((p) => p && p.connected);
  }

  /** Drop rooms whose host has been gone longer than the grace period. */
  sweep() {
    const dropped = [];
    for (const [code, room] of this.rooms) {
      if (room.hostGoneAt && this.now() - room.hostGoneAt > this.hostGraceMs) {
        for (const p of room.players) if (p?.socketId) this.bySocket.delete(p.socketId);
        this.rooms.delete(code);
        dropped.push(room);
      }
    }
    return dropped;
  }
}
