// Weapons for SANDLINE. A WeaponSet owns one fighter's guns: the equipped
// weapon, its magazine and reserve, reload timing and the bloom that makes
// spray-and-pray miss. Firing itself is hitscan and lives in sim.js; this
// module only decides whether a shot may leave the barrel and what it costs.

import { WEAPONS, GRENADE } from './config.js';

export class WeaponSet {
  constructor() {
    // Every fighter starts with the sidearm; rifles and SMGs come from the
    // buy menu between rounds.
    this.owned = {
      pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    };
    this.current = 'pistol';
    this.cooldown = 0; // seconds until the next shot may fire
    this.reloadEnd = 0; // sim time when the reload finishes, 0 = not reloading
    this.reloadWeapon = null;
    this.bloom = 0; // extra spread from recent shots, decays over time
    this.grenades = 0;
    this.grenadeCooldown = 0;
    this.switchEnd = 0; // brief draw delay after switching weapons
  }

  def() {
    return WEAPONS[this.current];
  }

  state() {
    return this.owned[this.current];
  }

  has(id) {
    return !!this.owned[id];
  }

  buy(id) {
    if (this.owned[id]) return false;
    const def = WEAPONS[id];
    this.owned[id] = { mag: def.mag, reserve: def.reserve };
    return true;
  }

  refill(id) {
    const slot = this.owned[id];
    if (!slot) return false;
    const def = WEAPONS[id];
    slot.reserve = def.reserve;
    return true;
  }

  buyGrenade() {
    if (this.grenades >= GRENADE.maxCarry) return false;
    this.grenades += 1;
    return true;
  }

  switchTo(id, now) {
    if (!this.owned[id] || id === this.current) return false;
    if (this.reloadEnd > 0) return false;
    this.current = id;
    this.switchEnd = now + 0.35;
    this.bloom = Math.min(this.bloom, 0.02);
    return true;
  }

  startReload(now) {
    const slot = this.state();
    const def = this.def();
    if (this.reloadEnd > 0) return false;
    if (slot.mag >= def.mag || slot.reserve <= 0) return false;
    this.reloadEnd = now + def.reloadTime;
    this.reloadWeapon = this.current;
    return true;
  }

  // Called every tick with the sim clock. Finishes reloads when due.
  update(now, dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.055);
    if (this.reloadEnd > 0 && now >= this.reloadEnd) {
      const slot = this.owned[this.reloadWeapon];
      const def = WEAPONS[this.reloadWeapon];
      const need = def.mag - slot.mag;
      const take = Math.min(need, slot.reserve);
      slot.mag += take;
      slot.reserve -= take;
      this.reloadEnd = 0;
      this.reloadWeapon = null;
    }
  }

  // Can a shot be fired right now? `held` is true while the trigger is held
  // (automatic weapons fire on hold; semi-automatic ones need a fresh press).
  canFire(now, held, pressed) {
    if (this.reloadEnd > 0 || now < this.switchEnd) return false;
    if (this.cooldown > 0) return false;
    const slot = this.state();
    if (slot.mag <= 0) return false;
    return this.def().auto ? held : pressed;
  }

  // Spend one round and return the spread (radians) this shot leaves with.
  // Spread grows with movement and air time and with every shot in the burst.
  fire(now, moveFactor, airFactor) {
    const def = this.def();
    const slot = this.state();
    slot.mag -= 1;
    this.cooldown = 60 / def.rpm;
    this.bloom = Math.min(def.bloomMax, this.bloom + def.bloom);
    return def.spreadBase + def.spreadMove * moveFactor + def.spreadAir * airFactor + this.bloom;
  }

  get reloading() {
    return this.reloadEnd > 0;
  }
}

// --- Grenades ------------------------------------------------------------
// A thrown spark charge: a small ballistic body with one bounce, then a
// burst. The sim owns the list; this class is one grenade's state.

export class Grenade {
  constructor(x, y, z, vx, vy, vz, team, ownerId) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.team = team;
    this.ownerId = ownerId;
    this.age = 0;
    this.bounced = false;
    this.dead = false;
  }

  // One fixed step. Returns 'explode' when the fuse is spent.
  step(dt, boxes, bounds, gravity) {
    this.age += dt;
    this.vy -= gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    // Ground bounce: lose energy, keep rolling forward once.
    if (this.y < 0.12) {
      this.y = 0.12;
      if (!this.bounced) {
        this.vy = Math.abs(this.vy) * 0.45;
        this.vx *= 0.6;
        this.vz *= 0.6;
        this.bounced = true;
      } else {
        this.vy = 0;
        this.vx *= 0.94;
        this.vz *= 0.94;
      }
    }
    // Walls: a cheap reflect against the map bounds and tall boxes.
    if (this.x < bounds.minX + 0.12 || this.x > bounds.maxX - 0.12) {
      this.vx = -this.vx * 0.5;
      this.x = Math.max(bounds.minX + 0.12, Math.min(bounds.maxX - 0.12, this.x));
    }
    if (this.z < bounds.minZ + 0.12 || this.z > bounds.maxZ - 0.12) {
      this.vz = -this.vz * 0.5;
      this.z = Math.max(bounds.minZ + 0.12, Math.min(bounds.maxZ - 0.12, this.z));
    }
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.height < 1.5) continue;
      if (this.x > b.minX - 0.12 && this.x < b.maxX + 0.12 && this.z > b.minZ - 0.12 && this.z < b.maxZ + 0.12 && this.y < b.height) {
        // Push out along the smallest penetration axis and reflect.
        const dxl = this.x - (b.minX - 0.12);
        const dxr = (b.maxX + 0.12) - this.x;
        const dzl = this.z - (b.minZ - 0.12);
        const dzr = (b.maxZ + 0.12) - this.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl || m === dxr) { this.vx = -this.vx * 0.5; this.x += m === dxl ? -dxl - 0.01 : dxr + 0.01; }
        else { this.vz = -this.vz * 0.5; this.z += m === dzl ? -dzl - 0.01 : dzr + 0.01; }
      }
    }
    if (this.age >= GRENADE.fuse) return 'explode';
    return null;
  }
}
