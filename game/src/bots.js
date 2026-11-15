// Bot AI for SANDLINE. Each bot is a small state machine over a waypoint
// graph: patrol a route, hold an angle, engage what it sees, investigate
// noise, and — once the charge is planted — converge on the site to defuse
// it (Jackals) or hold the site (Sandline). Bots see through line of sight
// only, react after a human-ish delay, and shoot in bursts with aim error.

import { BOT_SKILL, DEFUSE_TIME, EYE_HEIGHT, TEAM } from './config.js';
import { angleDiff, angleLerp, clamp, dist2D, losClear, moveCollide } from './util.js';
import { WeaponSet } from './weapons.js';
import { MAP } from './map.js';

function bfs(start, goal, edges, count) {
  if (start === goal) return [goal];
  const prev = new Array(count).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [a, b] of edges) {
      const next = a === cur ? b : b === cur ? a : -1;
      if (next === -1 || prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === goal) {
        const path = [goal];
        let node = goal;
        while (node !== start) {
          node = prev[node];
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [goal];
}

function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i++) {
    const w = MAP.waypoints[i];
    const d = dist2D(x, z, w.x, w.z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export class Bot {
  constructor(id, name, team, skillKey, x, z, yaw) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.skill = BOT_SKILL[skillKey];
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vx = 0;
    this.vz = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.weapons = new WeaponSet();
    this.weapons.buy('rifle');
    this.weapons.switchTo('rifle', 0);
    // Give the SMG to one Jackal for variety.
    if (id % 3 === 2) {
      this.weapons.buy('smg');
      this.weapons.switchTo('smg', 0);
    }
    this.state = 'patrol';
    this.path = [];
    this.pathIndex = 0;
    this.destination = -1;
    this.target = null;
    this.lastSeen = null; // {x, z, t}
    this.reactUntil = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.investigate = null; // {x, z, until}
    this.holdPoint = null; // {x, z, yaw}
    this.holdUntil = 0;
    this.defuseProgress = 0;
    this.defusing = false;
    this.heardAt = 0;
    this.thinkTimer = Math.random() * 0.2;
    this.speed = this.skill.speed;
    this.crouching = false;
    this.moving = false;
    this.onGround = true;
    this.lastDamageAt = -10;
    this.aimYaw = yaw;
    this.aimPitch = 0;
  }

  get eyeY() {
    return this.y + EYE_HEIGHT;
  }

  setRoute(destIndex) {
    const from = nearestWaypoint(this.x, this.z);
    this.path = bfs(from, destIndex, MAP.edges, MAP.waypoints.length);
    this.pathIndex = 0;
    this.destination = destIndex;
  }

  // Pick a destination for the bot's role. Jackals defend the sites; the
  // Sandline bots push with the player toward the nearer site.
  pickObjective(ctx) {
    if (this.team === TEAM.JACKAL) {
      if (ctx.bomb.planted) {
        // Everyone converges on the planted site; the nearest defuses.
        const site = MAP.sites[ctx.bomb.site];
        const d = dist2D(this.x, this.z, site.x, site.z);
        const others = ctx.bots.filter((b) => b.team === TEAM.JACKAL && b.alive && b !== this);
        const nearest = others.every((b) => dist2D(b.x, b.z, site.x, site.z) >= d);
        this.defuser = nearest;
        this.setRoute(nearestWaypoint(site.x, site.z));
        return;
      }
      // Pre-plant: spread across the two sites and mid.
      const role = this.id % 4;
      if (role === 0) this.setRoute(nearestWaypoint(MAP.sites.A.x - 2, MAP.sites.A.z + 2));
      else if (role === 1) this.setRoute(nearestWaypoint(MAP.sites.B.x + 2, MAP.sites.B.z + 2));
      else if (role === 2) this.setRoute(nearestWaypoint(0, -6));
      else this.setRoute(nearestWaypoint(MAP.sites.A.x + 3, MAP.sites.A.z - 3));
    } else {
      // Allies push toward the site the player is closest to.
      const pa = dist2D(ctx.player.x, ctx.player.z, MAP.sites.A.x, MAP.sites.A.z);
      const pb = dist2D(ctx.player.x, ctx.player.z, MAP.sites.B.x, MAP.sites.B.z);
      const site = pa <= pb ? MAP.sites.A : MAP.sites.B;
      const jitter = this.id % 2 === 0 ? -3 : 3;
      this.setRoute(nearestWaypoint(site.x + jitter, site.z + 4));
    }
  }

  // Can this bot see the fighter? Range, field of view and a clear line.
  canSee(fighter, now) {
    const d = dist2D(this.x, this.z, fighter.x, fighter.z);
    if (d > 42) return false;
    const dy = fighter.eyeY - this.eyeY;
    if (Math.abs(dy) > 6) return false;
    const want = Math.atan2(-(fighter.x - this.x), -(fighter.z - this.z));
    if (Math.abs(angleDiff(this.yaw, want)) > 1.15 && d > 4) return false;
    return losClear(this.x, this.eyeY, this.z, fighter.x, fighter.eyeY, fighter.z, MAP.colliders);
  }

  hear(x, z, now) {
    if (!this.alive) return;
    const d = dist2D(this.x, this.z, x, z);
    if (d > 26) return;
    if (this.state === 'engage') return;
    this.investigate = { x, z, until: now + 4 };
    this.heardAt = now;
  }

  takeDamage(amount, now) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamageAt = now;
    if (this.defusing) {
      this.defusing = false;
      this.defuseProgress = 0;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.state = 'dead';
    }
  }

  // One fixed step. ctx carries the world the bot reads: player, bots,
  // bomb, time, noise and an events list it appends to.
  update(dt, now, ctx) {
    if (!this.alive) return;
    this.weapons.update(now, dt);
    this.thinkTimer -= dt;

    // --- Perception: find the nearest visible enemy. ---
    const enemies = this.team === TEAM.JACKAL
      ? [ctx.player, ...ctx.bots.filter((b) => b.team === TEAM.SANDLINE && b.alive)]
      : ctx.bots.filter((b) => b.team === TEAM.JACKAL && b.alive);
    let seen = null;
    let seenD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (!this.canSee(e, now)) continue;
      const d = dist2D(this.x, this.z, e.x, e.z);
      if (d < seenD) { seenD = d; seen = e; }
    }
    if (seen) {
      this.lastSeen = { x: seen.x, z: seen.z, t: now };
      if (this.state !== 'engage') {
        this.state = 'engage';
        this.reactUntil = now + this.skill.react;
        this.burstLeft = 0;
        this.burstPause = 0;
      }
      this.target = seen;
    } else if (this.state === 'engage') {
      // Lost sight: keep the last known position briefly, then give up.
      if (!this.lastSeen || now - this.lastSeen.t > 1.6) {
        this.state = 'patrol';
        this.target = null;
        if (this.lastSeen) {
          this.investigate = { x: this.lastSeen.x, z: this.lastSeen.z, until: now + 3 };
        }
        this.pickObjective(ctx);
      }
    }

    // --- Objective: after a plant the Jackals defuse, Sandline holds. ---
    if (ctx.bomb.planted && this.team === TEAM.JACKAL && this.state !== 'engage') {
      const site = MAP.sites[ctx.bomb.site];
      const d = dist2D(this.x, this.z, ctx.bomb.x, ctx.bomb.z);
      if (this.defuser && d < 2.2) {
        this.defusing = true;
        this.defuseProgress += dt;
        if (this.defuseProgress >= DEFUSE_TIME) {
          ctx.events.push({ type: 'defused', by: this });
          this.defusing = false;
          this.defuseProgress = 0;
        }
        this.vx = 0;
        this.vz = 0;
        return;
      }
      if (this.destination !== nearestWaypoint(site.x, site.z) && this.thinkTimer <= 0) {
        this.pickObjective(ctx);
      }
    }

    // --- Movement intent by state. ---
    let wantX = 0;
    let wantZ = 0;
    let wantSpeed = this.speed;
    let wantYaw = this.yaw;

    if (this.state === 'engage' && this.target) {
      const t = this.target;
      const d = dist2D(this.x, this.z, t.x, t.z);
      wantYaw = Math.atan2(-(t.x - this.x), -(t.z - this.z));
      // Strafe sideways while fighting; close in when far, back off when close.
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.strafeTimer = 0.7 + Math.random() * 0.9;
      }
      const toward = d > 16 ? 0.8 : d < 6 ? -0.5 : 0;
      const fx = Math.sin(wantYaw);
      const fz = -Math.cos(wantYaw);
      const rx = Math.cos(wantYaw);
      const rz = Math.sin(wantYaw);
      wantX = fx * toward + rx * this.strafeDir * 0.9;
      wantZ = fz * toward + rz * this.strafeDir * 0.9;
      wantSpeed = this.speed * 0.7;
      this.crouching = d > 18 && Math.random() < 0.02;
    } else if (this.investigate && now < this.investigate.until) {
      const d = dist2D(this.x, this.z, this.investigate.x, this.investigate.z);
      if (d < 1.2) {
        // Arrived: look around, then drop the investigation.
        wantYaw += dt * 1.4;
        if (now > this.investigate.until - 1.5) this.investigate = null;
      } else {
        wantYaw = Math.atan2(-(this.investigate.x - this.x), -(this.investigate.z - this.z));
        wantX = Math.sin(wantYaw);
        wantZ = -Math.cos(wantYaw);
      }
    } else if (this.path.length > 0 && this.pathIndex < this.path.length) {
      const node = MAP.waypoints[this.path[this.pathIndex]];
      const d = dist2D(this.x, this.z, node.x, node.z);
      if (d < 1.0) {
        this.pathIndex += 1;
        if (this.pathIndex >= this.path.length) {
          // Arrived: hold this spot and watch the lane.
          this.holdPoint = { x: node.x, z: node.z, yaw: this.yaw };
          this.holdUntil = now + 2.5 + Math.random() * 3;
          if (this.team === TEAM.JACKAL || this.thinkTimer <= 0) this.pickObjective(ctx);
        }
      } else {
        wantYaw = Math.atan2(-(node.x - this.x), -(node.z - this.z));
        wantX = Math.sin(wantYaw);
        wantZ = -Math.cos(wantYaw);
      }
    } else if (this.holdPoint && now < this.holdUntil) {
      // Hold and scan: slow yaw sweep across the lane.
      wantYaw = this.holdPoint.yaw + Math.sin(now * 0.7) * 0.7;
    } else if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.4 + Math.random() * 0.4;
      this.pickObjective(ctx);
    }

    // --- Steering: accelerate toward the wanted velocity, then collide. ---
    const mag = Math.sqrt(wantX * wantX + wantZ * wantZ) || 1;
    const tx = (wantX / mag) * wantSpeed * (wantX || wantZ ? 1 : 0);
    const tz = (wantZ / mag) * wantSpeed * (wantX || wantZ ? 1 : 0);
    const accel = 26;
    this.vx += clamp(tx - this.vx, -accel * dt, accel * dt);
    this.vz += clamp(tz - this.vz, -accel * dt, accel * dt);
    this.moving = Math.abs(this.vx) + Math.abs(this.vz) > 0.4;
    const pos = { x: this.x, z: this.z };
    moveCollide(pos, this.vx, this.vz, dt, 0.35, 0.35, MAP.colliders, MAP.bounds);
    this.x = pos.x;
    this.z = pos.z;

    // --- Facing: turn toward the wanted yaw at a limited rate. ---
    const turnRate = this.state === 'engage' ? 9 : 4.5;
    this.yaw = angleLerp(this.yaw, wantYaw, Math.min(1, turnRate * dt));
    if (this.state === 'engage' && this.target) {
      const t = this.target;
      const dy = t.eyeY - this.eyeY;
      const d = Math.max(0.1, dist2D(this.x, this.z, t.x, t.z));
      this.aimPitch = clamp(Math.atan2(dy, d) + (Math.random() - 0.5) * this.skill.aimErr, -0.5, 0.5);
      this.aimYaw = this.yaw + (Math.random() - 0.5) * this.skill.aimErr * 2;
    }

    // --- Shooting: bursts with pauses, only after the reaction delay. ---
    if (this.state === 'engage' && this.target && now >= this.reactUntil) {
      const d = dist2D(this.x, this.z, this.target.x, this.target.z);
      if (d < 45) {
        if (this.burstLeft <= 0) {
          this.burstPause -= dt;
          if (this.burstPause <= 0) {
            this.burstLeft = 2 + Math.floor(Math.random() * this.skill.burst);
            this.burstPause = 0.35 + Math.random() * 0.5;
          }
        } else if (this.weapons.canFire(now, true, true)) {
          const spread = this.weapons.fire(now, this.moving ? 1 : 0.2, 0);
          ctx.events.push({
            type: 'shot', by: this, spread, target: this.target,
            aimYaw: this.aimYaw, aimPitch: this.aimPitch,
          });
          this.burstLeft -= 1;
          if (this.weapons.state().mag === 0) this.weapons.startReload(now);
        }
      }
    }
    if (this.weapons.reloading && this.weapons.state().mag === 0) {
      // Reloading mid-fight: back off a step.
      this.vx *= 0.98;
      this.vz *= 0.98;
    }
  }
}
