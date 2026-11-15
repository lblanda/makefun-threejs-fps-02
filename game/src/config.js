// Static tuning for SANDLINE: weapons, economy, rounds and bot behaviour.
// Everything the sim reads lives here so a balance pass touches one file.

export const TICK = 1 / 60; // fixed simulation step, seconds
export const ROUND_TIME = 100; // seconds before the round ends unplanted
export const PLANT_TIME = 3.0; // seconds holding E to plant the charge
export const DEFUSE_TIME = 5.0; // seconds holding E to defuse it
export const FUSE_TIME = 30; // seconds from plant to detonation
export const FREEZE_TIME = 3.0; // seconds at round start before play
export const BUY_TIME = 12; // seconds the buy menu stays open after a round
export const ROUNDS_TO_WIN = 5;

export const PLAYER_HEALTH = 100;
export const BOT_HEALTH = 100;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE = 1.12;
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 4.3;
export const CROUCH_SPEED = 2.1;
export const ACCEL = 34; // ground acceleration, m/s^2
export const AIR_ACCEL = 8;
export const FRICTION = 10; // ground friction, 1/s
export const GRAVITY = 18;
export const JUMP_SPEED = 6.2;

// Weapons. damage is per body hit; headshots multiply by headMult.
// spread is in radians: base + move + air + bloom per shot, capped.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 2, price: 0, auto: false,
    rpm: 380, mag: 12, reserve: 48, damage: 30, headMult: 2.0,
    spreadBase: 0.006, spreadMove: 0.030, spreadAir: 0.045, bloom: 0.012,
    bloomMax: 0.05, recoil: 0.011, recoilYaw: 0.004, range: 60,
    reloadTime: 1.3, tracer: 0xffd27a,
  },
  smg: {
    id: 'smg', name: 'Hornet-9 SMG', slot: 1, price: 900, auto: true,
    rpm: 780, mag: 25, reserve: 100, damage: 22, headMult: 2.0,
    spreadBase: 0.011, spreadMove: 0.038, spreadAir: 0.055, bloom: 0.010,
    bloomMax: 0.075, recoil: 0.008, recoilYaw: 0.006, range: 45,
    reloadTime: 1.9, tracer: 0xffe9a8,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', slot: 0, price: 2500, auto: true,
    rpm: 600, mag: 30, reserve: 90, damage: 34, headMult: 2.0,
    spreadBase: 0.004, spreadMove: 0.026, spreadAir: 0.050, bloom: 0.009,
    bloomMax: 0.06, recoil: 0.014, recoilYaw: 0.005, range: 80,
    reloadTime: 2.4, tracer: 0xfff2c0,
  },
};

// Grenade: a spark charge. Thrown with gravity, bounces once, then bursts.
export const GRENADE = {
  price: 300, fuse: 1.9, throwSpeed: 15, upSpeed: 5.5,
  radius: 7, damage: 85, falloff: 0.35, maxCarry: 2,
};

// Economy.
export const ECONOMY = {
  start: 800, roundWin: 2000, roundLoss: 1400, kill: 300, plant: 300,
  defuse: 300, maxMoney: 16000,
};

// Bot personalities: reaction time, aim error and aggression shape how each
// bot plays. Skill is 0..1; higher is faster and steadier.
export const BOT_SKILL = {
  rookie: { react: 0.55, aimErr: 0.055, burst: 3, hold: 0.35, speed: 3.4 },
  regular: { react: 0.38, aimErr: 0.038, burst: 4, hold: 0.5, speed: 3.8 },
  veteran: { react: 0.26, aimErr: 0.026, burst: 5, hold: 0.65, speed: 4.1 },
};

export const ENEMY_NAMES = ['Vex', 'Rook', 'Mara', 'Dune'];
export const ALLY_NAMES = ['Halo', 'Bishop'];

export const TEAM = { SANDLINE: 0, JACKAL: 1 };

export const PHASE = {
  TITLE: 'title',
  FREEZE: 'freeze',
  LIVE: 'live',
  BUY: 'buy',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};
