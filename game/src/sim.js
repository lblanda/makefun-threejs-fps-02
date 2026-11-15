// The fixed-step simulation for SANDLINE. One Sim owns the whole match
// state — player, bots, grenades, bomb, rounds, money — and advances it in
// 1/60 s ticks, decoupled from rendering. It never touches the DOM or
// three.js: it appends events to this.events, and the renderer, HUD and
// sounds consume them. Deterministic in its own terms: the only randomness
// is spread and bot decisions, both seeded by Math.random at play time.

import {
  ACCEL, AIR_ACCEL, BUY_TIME, CROUCH_EYE, CROUCH_SPEED, DEFUSE_TIME,
  ECONOMY, ENEMY_NAMES, ALLY_NAMES, EYE_HEIGHT, FREEZE_TIME, FRICTION,
  FUSE_TIME, GRAVITY, GRENADE, JUMP_SPEED, PHASE, PLANT_TIME,
  PLAYER_HEALTH, PLAYER_RADIUS, ROUNDS_TO_WIN, ROUND_TIME, TEAM, TICK,
  WALK_SPEED, WEAPONS,
} from './config.js';
import { angleDiff, clamp, dist2D, losClear, moveCollide, rayAABB, raySphere } from './util.js';
import { MAP } from './map.js';
import { Bot } from './bots.js';
import { Grenade, WeaponSet } from './weapons.js';

// Ray against a box with an explicit y range (fighters are not ground-anchored).
function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0;
  let tmax = Infinity;
  const slabs = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = slabs[i];
    if (d === 0) {
      if (o < lo || o > hi) return Infinity;
    } else {
      const inv = 1 / d;
      let t1 = (lo - o) * inv;
      let t2 = (hi - o) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin < 0 ? Infinity : tmin;
}

export class Player {
  constructor() {
    this.team = TEAM.SANDLINE;
    this.id = 'player';
    this.name = 'You';
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.health = PLAYER_HEALTH;
    this.alive = true;
    this.crouching = false;
    this.onGround = true;
    this.moving = false;
    this.weapons = new WeaponSet();
    this.money = ECONOMY.start;
    this.kills = 0;
    this.deaths = 0;
    this.hasBomb = true; // the player carries the charge
    this.eyeHeight = EYE_HEIGHT;
    this.recoilPitch = 0; // unrecovered kick, decays each tick
    this.plantProgress = 0;
    this.planting = false;
  }

  get eyeY() {
    return this.y + this.eyeHeight;
  }

  get speed2D() {
    return Math.sqrt(this.vx * this.vx + this.vz * this.vz);
  }

  reset(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.health = PLAYER_HEALTH;
    this.alive = true;
    this.crouching = false;
    this.onGround = true;
    this.plantProgress = 0;
    this.planting = false;
    this.recoilPitch = 0;
    this.eyeHeight = EYE_HEIGHT;
  }
}

export class Sim {
  constructor() {
    this.time = 0; // sim clock, seconds
    this.phase = PHASE.TITLE;
    this.round = 0;
    this.score = { sandline: 0, jackal: 0 };
    this.roundTimer = ROUND_TIME;
    this.phaseTimer = 0;
    this.player = new Player();
    this.bots = [];
    this.grenades = [];
    this.bomb = { planted: false, site: null, x: 0, z: 0, fuse: 0, defuseBy: null };
    this.events = [];
    this.freeze = false;
    this.roundEndReason = '';
    this.matchWinner = null;
    this.buyOpen = false;
    this.stats = { shots: 0, hits: 0, headshots: 0 };
    this._tracer = { x: 0, y: 0, z: 0 };
    this._hitNormal = { x: 0, y: 0, z: 0 };
  }

  // --- Match / round lifecycle ------------------------------------------

  startMatch() {
    this.score = { sandline: 0, jackal: 0 };
    this.round = 0;
    this.matchWinner = null;
    this.player.money = ECONOMY.start;
    this.player.weapons = new WeaponSet();
    this.player.kills = 0;
    this.player.deaths = 0;
    this.startRound();
  }

  startRound() {
    this.round += 1;
    this.bomb = { planted: false, site: null, x: 0, z: 0, fuse: 0, defuseBy: null };
    this.grenades = [];
    this.roundTimer = ROUND_TIME;
    this.phase = PHASE.FREEZE;
    this.phaseTimer = FREEZE_TIME;
    this.freeze = true;
    this.buyOpen = false;
    const ps = MAP.spawns.sandline[1];
    this.player.reset(ps.x, ps.z, ps.yaw);
    this.player.hasBomb = true;
    // Fresh squads every round.
    this.bots = [];
    const allySpawns = [MAP.spawns.sandline[0], MAP.spawns.sandline[2]];
    for (let i = 0; i < 2; i++) {
      const s = allySpawns[i];
      this.bots.push(new Bot(100 + i, ALLY_NAMES[i], TEAM.SANDLINE, i === 0 ? 'regular' : 'rookie', s.x, s.z, s.yaw));
    }
    const skills = ['veteran', 'regular', 'regular', 'rookie'];
    for (let i = 0; i < 4; i++) {
      const s = MAP.spawns.jackal[i];
      const b = new Bot(i, ENEMY_NAMES[i], TEAM.JACKAL, skills[i], s.x, s.z, s.yaw);
      b.pickObjective({ bomb: this.bomb, bots: this.bots, player: this.player });
      this.bots.push(b);
    }
    this.events.push({ type: 'round-start', round: this.round });
  }

  endRound(winner, reason) {
    if (this.phase === PHASE.ROUND_END || this.phase === PHASE.MATCH_END) return;
    this.roundEndReason = reason;
    const won = winner === TEAM.SANDLINE;
    if (won) this.score.sandline += 1;
    else this.score.jackal += 1;
    this.player.money = Math.min(
      ECONOMY.maxMoney,
      this.player.money + (won ? ECONOMY.roundWin : ECONOMY.roundLoss),
    );
    this.events.push({
      type: 'round-end', winner, reason, won,
      score: { ...this.score }, money: this.player.money,
    });
    if (this.score.sandline >= ROUNDS_TO_WIN || this.score.jackal >= ROUNDS_TO_WIN) {
      this.phase = PHASE.MATCH_END;
      this.matchWinner = winner;
      this.events.push({ type: 'match-end', winner });
    } else {
      this.phase = PHASE.ROUND_END;
      this.phaseTimer = 4;
    }
    this.freeze = true;
    this.buyOpen = false;
  }

  openBuy() {
    if (this.phase !== PHASE.BUY) return;
    this.buyOpen = true;
    this.events.push({ type: 'buy-open' });
  }

  closeBuy() {
    this.buyOpen = false;
    this.phase = PHASE.FREEZE;
    this.phaseTimer = FREEZE_TIME;
    this.freeze = true;
    this.events.push({ type: 'buy-close' });
  }

  // Buy menu actions. Returns a message for the HUD, or null when refused.
  buy(item) {
    const p = this.player;
    if (this.phase !== PHASE.BUY && this.phase !== PHASE.FREEZE) return null;
    if (item === 'ammo') {
      if (p.money < 200) return 'Not enough money.';
      let refilled = false;
      for (const id of Object.keys(p.weapons.owned)) refilled = p.weapons.refill(id) || refilled;
      if (!refilled) return 'Nothing to refill.';
      p.money -= 200;
      this.events.push({ type: 'bought', item: 'ammo', money: p.money });
      return 'Ammo refilled. -$200';
    }
    if (item === 'grenade') {
      if (p.money < GRENADE.price) return 'Not enough money.';
      if (!p.weapons.buyGrenade()) return 'Already carrying two.';
      p.money -= GRENADE.price;
      this.events.push({ type: 'bought', item: 'grenade', money: p.money });
      return 'Spark grenade bought. -$300';
    }
    const def = WEAPONS[item];
    if (!def) return null;
    if (p.weapons.has(item)) return 'Already owned.';
    if (p.money < def.price) return 'Not enough money.';
    p.money -= def.price;
    p.weapons.buy(item);
    p.weapons.switchTo(item, this.time);
    this.events.push({ type: 'bought', item, money: p.money });
    return `${def.name} bought. -$${def.price}`;
  }

  // --- Shooting -----------------------------------------------------------

  // Resolve one hitscan shot from `shooter` (Player or Bot). aimYaw and
  // aimPitch are the shooter's aim; spread is a cone radius in radians.
  resolveShot(shooter, aimYaw, aimPitch, spread) {
    const def = shooter.weapons.def();
    const ox = shooter.x;
    const oy = shooter.eyeY;
    const oz = shooter.z;
    // Forward from yaw/pitch, plus a random offset inside the spread cone.
    const cp = Math.cos(aimPitch);
    const fx = Math.sin(aimYaw) * cp;
    const fy = Math.sin(aimPitch);
    const fz = -Math.cos(aimYaw) * cp;
    const rx = Math.cos(aimYaw);
    const rz = Math.sin(aimYaw);
    const th = Math.random() * Math.PI * 2;
    const rr = spread * Math.sqrt(Math.random());
    const ox2 = Math.cos(th) * rr;
    const oy2 = Math.sin(th) * rr;
    let dx = fx + rx * ox2;
    let dy = fy + oy2;
    let dz = fz + rz * ox2;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= len;
    dy /= len;
    dz /= len;
    this.stats.shots += 1;

    // Nearest wall hit.
    let wallT = def.range;
    let wallPoint = null;
    for (const b of MAP.colliders) {
      const t = rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minZ, b.maxX, b.maxZ, b.height, this._hitNormal);
      if (t < wallT) {
        wallT = t;
        wallPoint = { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
      }
    }
    if (dy < 0) {
      const t = oy / -dy;
      if (t < wallT) {
        wallT = t;
        wallPoint = { x: ox + dx * t, y: 0.02, z: oz + dz * t };
      }
    }

    // Nearest fighter hit: head sphere first, then the body box.
    const enemies = shooter.team === TEAM.SANDLINE
      ? this.bots.filter((b) => b.team === TEAM.JACKAL && b.alive)
      : this.bots.filter((b) => b.team === TEAM.SANDLINE && b.alive);
    if (shooter !== this.player && this.player.alive) enemies.push(this.player);
    let bestT = wallT;
    let bestTarget = null;
    let bestHead = false;
    for (const e of enemies) {
      const crouch = e.crouching ? 0.62 : 1;
      const headY = e.y + 1.52 * crouch;
      const tHead = raySphere(ox, oy, oz, dx, dy, dz, e.x, headY, e.z, 0.24);
      if (tHead < bestT) {
        bestT = tHead;
        bestTarget = e;
        bestHead = true;
      }
      const bodyTop = e.y + 1.38 * crouch;
      const tBody = rayBox(ox, oy, oz, dx, dy, dz, e.x - 0.32, e.y + 0.05, e.z - 0.32, e.x + 0.32, bodyTop, e.z + 0.32);
      if (tBody < bestT) {
        bestT = tBody;
        bestTarget = e;
        bestHead = false;
      }
    }

    const endX = ox + dx * bestT;
    const endY = oy + dy * bestT;
    const endZ = oz + dz * bestT;
    this.events.push({
      type: 'tracer', from: { x: ox, y: oy, z: oz }, to: { x: endX, y: endY, z: endZ },
      color: def.tracer, by: shooter,
    });

    if (bestTarget) {
      const dist = bestT;
      const falloff = clamp(1 - Math.max(0, dist - 12) / def.range * 0.35, 0.6, 1);
      const damage = Math.round(def.damage * (bestHead ? def.headMult : 1) * falloff);
      this.stats.hits += 1;
      if (bestHead) this.stats.headshots += 1;
      const wasAlive = bestTarget.alive;
      const killed = this.damageFighter(bestTarget, damage, shooter);
      this.events.push({
        type: 'hit', shooter, target: bestTarget, head: bestHead, damage,
        point: { x: endX, y: endY, z: endZ }, killed,
      });
      if (killed && wasAlive) this.onKill(shooter, bestTarget, bestHead);
    } else if (wallPoint) {
      this.events.push({ type: 'impact', point: wallPoint });
    }
  }

  damageFighter(target, amount, shooter) {
    if (target === this.player) {
      this.player.health -= amount;
      this.events.push({ type: 'hurt', target: this.player, from: shooter });
      if (this.player.health <= 0) {
        this.player.health = 0;
        this.player.alive = false;
        this.player.deaths += 1;
        return true;
      }
      return false;
    }
    const before = target.health;
    target.takeDamage(amount, this.time);
    if (target.alive) this.events.push({ type: 'hurt', target, from: shooter });
    return before > 0 && !target.alive;
  }

  onKill(shooter, target, head) {
    this.events.push({ type: 'kill', shooter, target, head });
    if (shooter === this.player) {
      this.player.kills += 1;
      this.player.money = Math.min(ECONOMY.maxMoney, this.player.money + ECONOMY.kill);
      this.events.push({ type: 'money', money: this.player.money });
    }
    // Noise draws nearby bots toward the shot.
    for (const b of this.bots) {
      if (b.alive && b !== target) b.hear(target.x, target.z, this.time);
    }
    this.checkRoundEnd();
  }

  // --- Bomb ---------------------------------------------------------------

  siteAt(x, z) {
    for (const key of ['A', 'B']) {
      const s = MAP.sites[key];
      if (dist2D(x, z, s.x, s.z) <= s.r) return key;
    }
    return null;
  }

  updateBomb(dt, input) {
    const p = this.player;
    if (!this.bomb.planted) {
      if (p.alive && p.hasBomb && input.interact) {
        const site = this.siteAt(p.x, p.z);
        if (site) {
          p.planting = true;
          p.plantProgress += dt;
          if (Math.floor(p.plantProgress * 10) !== Math.floor((p.plantProgress - dt) * 10)) {
            this.events.push({ type: 'plant-tick', progress: p.plantProgress / PLANT_TIME });
          }
          if (p.plantProgress >= PLANT_TIME) {
            this.bomb = { planted: true, site, x: p.x, z: p.z, fuse: FUSE_TIME, defuseBy: null };
            p.hasBomb = false;
            p.planting = false;
            p.plantProgress = 0;
            p.money = Math.min(ECONOMY.maxMoney, p.money + ECONOMY.plant);
            this.events.push({ type: 'planted', site, x: p.x, z: p.z });
            this.events.push({ type: 'money', money: p.money });
            // The plant is loud: every Jackal now knows where to go.
            for (const b of this.bots) {
              if (b.team === TEAM.JACKAL && b.alive) {
                b.investigate = null;
                b.pickObjective({ bomb: this.bomb, bots: this.bots, player: this.player });
              }
            }
          }
          return;
        }
      }
      p.planting = false;
      p.plantProgress = 0;
      return;
    }
    // Planted: the fuse burns down; Jackals defuse through their own update.
    this.bomb.fuse -= dt;
    if (this.bomb.fuse <= 0) {
      this.events.push({ type: 'explosion', x: this.bomb.x, z: this.bomb.z });
      this.endRound(TEAM.SANDLINE, 'The charge detonated at Site ' + this.bomb.site + '.');
    }
  }

  checkRoundEnd() {
    if (this.phase !== PHASE.LIVE) return;
    const sandAlive = this.player.alive || this.bots.some((b) => b.team === TEAM.SANDLINE && b.alive);
    const jackAlive = this.bots.some((b) => b.team === TEAM.JACKAL && b.alive);
    if (!jackAlive) {
      this.endRound(TEAM.SANDLINE, 'Jackal squad eliminated.');
      return;
    }
    if (!sandAlive && !this.bomb.planted) {
      this.endRound(TEAM.JACKAL, 'Sandline squad eliminated.');
    }
    // With the charge planted and Sandline gone, the round plays on until
    // the fuse blows or a Jackal defuses it.
  }

  // --- Grenades -------------------------------------------------------------

  throwGrenade(shooter) {
    const yaw = shooter.yaw;
    const pitch = shooter.pitch || 0;
    const cp = Math.cos(pitch);
    const fx = Math.sin(yaw) * cp;
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * cp;
    const g = new Grenade(
      shooter.x + fx * 0.5, shooter.eyeY - 0.1, shooter.z + fz * 0.5,
      fx * GRENADE.throwSpeed, fy * GRENADE.throwSpeed + GRENADE.upSpeed, fz * GRENADE.throwSpeed,
      shooter.team, shooter.id ?? 'player',
    );
    this.grenades.push(g);
    this.events.push({ type: 'grenade-thrown', by: shooter });
  }

  updateGrenades(dt) {
    for (const g of this.grenades) {
      if (g.dead) continue;
      const res = g.step(dt, MAP.colliders, MAP.bounds, GRAVITY);
      if (res === 'explode') {
        g.dead = true;
        this.events.push({ type: 'explosion', x: g.x, z: g.z, radius: GRENADE.radius });
        // Damage everyone in the blast without a wall between them.
        const fighters = [this.player, ...this.bots];
        for (const f of fighters) {
          if (!f.alive || f.team === g.team) continue;
          const d = Math.sqrt((f.x - g.x) ** 2 + (f.eyeY - g.y) ** 2 + (f.z - g.z) ** 2);
          if (d > GRENADE.radius) continue;
          if (!losClear(g.x, g.y, g.z, f.x, f.eyeY, f.z, MAP.colliders)) continue;
          const dmg = Math.round(GRENADE.damage * (1 - (d / GRENADE.radius) * (1 - GRENADE.falloff)));
          const killed = this.damageFighter(f, dmg, { team: g.team, id: g.ownerId, name: 'grenade' });
          this.events.push({ type: 'hit', shooter: null, target: f, head: false, damage: dmg, point: { x: f.x, y: f.eyeY, z: f.z }, killed });
          if (killed) this.onKill({ team: g.team, id: g.ownerId }, f, false);
        }
      }
    }
    this.grenades = this.grenades.filter((g) => !g.dead);
  }

  // --- Player update --------------------------------------------------------

  updatePlayer(dt, input) {
    const p = this.player;
    p.weapons.update(this.time, dt);
    if (!p.alive) return;

    // Look, with recoil kick applied on top and recovered over time.
    p.yaw -= input.lookDX * 0.0022;
    p.pitch = clamp(p.pitch - input.lookDY * 0.0022 + p.recoilPitch * dt * 2, -1.5, 1.5);
    p.recoilPitch = Math.max(0, p.recoilPitch - dt * 0.09);

    // Crouch changes the eye height and the speed cap.
    const wantCrouch = input.crouch;
    p.crouching = wantCrouch;
    const targetEye = wantCrouch ? CROUCH_EYE : EYE_HEIGHT;
    p.eyeHeight += (targetEye - p.eyeHeight) * Math.min(1, dt * 12);

    // Wish direction from input, rotated by yaw.
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    let wx = sin * input.forward + cos * input.strafe;
    let wz = -cos * input.forward + sin * input.strafe;
    const wlen = Math.sqrt(wx * wx + wz * wz);
    if (wlen > 0) { wx /= wlen; wz /= wlen; }
    const maxSpeed = wantCrouch ? CROUCH_SPEED : WALK_SPEED;
    const accel = p.onGround ? ACCEL : AIR_ACCEL;
    p.vx += clamp(wx * maxSpeed - p.vx, -accel * dt, accel * dt);
    p.vz += clamp(wz * maxSpeed - p.vz, -accel * dt, accel * dt);
    if (wlen === 0 && p.onGround) {
      const f = Math.max(0, 1 - FRICTION * dt);
      p.vx *= f;
      p.vz *= f;
    }
    p.moving = p.speed2D > 0.5;

    // Jump and gravity; the yard is flat, so landing is y == 0.
    if (input.jump && p.onGround) {
      p.vy = JUMP_SPEED;
      p.onGround = false;
    }
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }

    const pos = { x: p.x, z: p.z };
    moveCollide(pos, p.vx, p.vz, dt, PLAYER_RADIUS, PLAYER_RADIUS, MAP.colliders, MAP.bounds);
    p.x = pos.x;
    p.z = pos.z;

    // Weapon switching.
    if (input.digit === 1 && p.weapons.has('rifle')) p.weapons.switchTo('rifle', this.time);
    if (input.digit === 2 && p.weapons.has('smg')) p.weapons.switchTo('smg', this.time);
    if (input.digit === 3) p.weapons.switchTo('pistol', this.time);

    // Firing.
    const moveFactor = clamp(p.speed2D / WALK_SPEED, 0, 1);
    const airFactor = p.onGround ? 0 : 1;
    if (input.reload) p.weapons.startReload(this.time);
    if (p.weapons.canFire(this.time, input.firing, input.fired)) {
      const spread = p.weapons.fire(this.time, moveFactor, airFactor);
      const aimPitch = p.pitch + p.recoilPitch * 0.4;
      this.resolveShot(p, p.yaw, aimPitch, spread);
      p.recoilPitch = Math.min(0.12, p.recoilPitch + p.weapons.def().recoil);
      p.yaw += (Math.random() - 0.5) * p.weapons.def().recoilYaw;
      this.events.push({ type: 'muzzle', by: p });
      // Shots are loud: bots nearby investigate.
      for (const b of this.bots) {
        if (b.alive && b.team === TEAM.JACKAL) b.hear(p.x, p.z, this.time);
      }
    } else if ((input.firing || input.fired) && p.weapons.state().mag === 0 && !p.weapons.reloading) {
      if (p.weapons.state().reserve > 0) p.weapons.startReload(this.time);
      else this.events.push({ type: 'dryfire', by: p });
    }

    // Grenade.
    if (input.grenade && p.weapons.grenades > 0 && p.weapons.grenadeCooldown <= 0) {
      p.weapons.grenades -= 1;
      p.weapons.grenadeCooldown = 0.8;
      this.throwGrenade(p);
    }

    this.updateBomb(dt, input);
  }

  // --- One fixed tick --------------------------------------------------------

  update(dt, input) {
    this.time += dt;
    const ctx = { player: this.player, bots: this.bots, bomb: this.bomb, events: this.events };

    if (this.phase === PHASE.TITLE) return;

    if (this.phase === PHASE.FREEZE) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = PHASE.LIVE;
        this.freeze = false;
        this.events.push({ type: 'round-live', round: this.round });
      }
      return;
    }

    if (this.phase === PHASE.ROUND_END) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = PHASE.BUY;
        this.phaseTimer = BUY_TIME;
        this.openBuy();
      }
      return;
    }

    if (this.phase === PHASE.BUY) {
      this.phaseTimer -= dt;
      // The buy phase is a breather at spawn: bots hold, the player shops.
      if (this.phaseTimer <= 0 && !this.buyOpen) this.closeBuy();
      if (this.phaseTimer <= 0) this.closeBuy();
      return;
    }

    if (this.phase === PHASE.MATCH_END) return;

    // LIVE.
    this.roundTimer -= dt;
    if (this.roundTimer <= 0 && !this.bomb.planted) {
      this.endRound(TEAM.JACKAL, 'Time expired — the charge was never planted.');
      return;
    }

    this.updatePlayer(dt, input);
    for (const b of this.bots) b.update(dt, this.time, ctx);

    // Resolve bot shots queued during their update.
    for (const e of this.events) {
      if (e.type === 'shot' && !e.resolved) {
        e.resolved = true;
        this.resolveShot(e.by, e.aimYaw, e.aimPitch, e.spread);
        this.events.push({ type: 'muzzle', by: e.by });
      }
      if (e.type === 'defused') {
        this.endRound(TEAM.JACKAL, 'The charge was defused.');
      }
    }

    this.updateGrenades(dt);
    this.checkRoundEnd();
  }
}
