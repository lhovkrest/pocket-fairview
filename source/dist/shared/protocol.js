// Shared wire protocol. Imported by the server, the desktop host and the phone controller.
// Keep this file dependency-free: it is served to browsers as-is at /shared/protocol.js.

export const MAX_PLAYERS = 1;
export const ROOM_CODE_LENGTH = 4;
// No I, L, O, 0, 1: easy to misread when typed from a TV across the room.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PLAYER_COLORS = ['#ff3b3b', '#3b8bff']; // P1 red, P2 blue
export const PLAYER_COLOR_NAMES = ['RED', 'BLUE'];
export const SEND_INTERVAL_MS = 8; // up to ~120 Hz; do not halve 90/120 Hz sensor streams

export const EV = {
  // desktop host -> server
  HOST_CREATE: 'host:create',
  HOST_RESUME: 'host:resume',
  HOST_PHASE: 'host:phase', // tells the server whether new players may still join
  HOST_SEND: 'host:send', // {slot|'all', ev, data} relayed to phones

  // phone -> server
  CTRL_JOIN: 'ctrl:join',

  // server -> desktop host
  PLAYER_JOINED: 'player:joined', // {slot, name, returning}
  PLAYER_LEFT: 'player:left', // {slot, removed}

  // server -> phone
  HOST_LEFT: 'host:left',
  HOST_BACK: 'host:back',

  // phone -> desktop host (relayed by the server, which stamps `slot`)
  AIM: 'aim', // {x, y} normalised 0..1 screen fractions (volatile)
  TRIGGER: 'trigger', // {kind: 'shoot'|'reload', x, y}
  CALIB_STEP: 'calib:step', // {step}
  CONFIG: 'ctrl:config', // {calibrated, summary}
  CTRL_START: 'ctrl:start',
  CTRL_PAUSE: 'ctrl:pause', // {paused}

  // desktop host -> phone (sent through HOST_SEND)
  HAPTIC: 'haptic', // {pattern}
  HUD: 'hud', // {mag, mags, reloading, health, score, combo, down}
  PHASE: 'phase', // {phase, ...}
  LOBBY: 'lobby', // {players, canStart}
  TOAST: 'toast', // {text}

  // latency probe (phone -> server, answered with an ack)
  RTT: 'rtt',
};

export const C2H_EVENTS = [EV.AIM, EV.TRIGGER, EV.CALIB_STEP, EV.CONFIG, EV.CTRL_START, EV.CTRL_PAUSE];
export const H2C_EVENTS = [EV.HAPTIC, EV.HUD, EV.PHASE, EV.LOBBY, EV.TOAST];

export const CALIB_STEPS = ['intro', 'center', 'sweep', 'tilt', 'tune', 'ready'];

export const ERRORS = {
  ROOM_NOT_FOUND: 'No game found with that code. Check the code on the big screen.',
  ROOM_FULL: 'This game already has a golfer.',
  GAME_IN_PROGRESS: 'A round is in progress. Join between rounds.',
  HOST_OFFLINE: 'The big screen went away. Refresh it and scan the new code.',
  BAD_REQUEST: 'Bad request.',
};
