// Rendering for SANDLINE: the three.js scene, the map, the fighters and
// the effects. The renderer reads the sim and never writes to it. Geometry
// and materials are shared and reused; the hot loop allocates nothing.

import * as THREE from 'three';
import { EYE_HEIGHT, TEAM } from './config.js';
import { buildMap, MAP } from './map.js';

const TEAM_COLORS = {
  [TEAM.SANDLINE]: { body: 0xb59a5e, dark: 0x6b5a33, head: 0xd9b98a },
  [TEAM.JACKAL]: { body: 0x8f3b28, dark: 0x4a1f16, head: 0xc98a6a },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.08, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    buildMap(this.scene);

    // Shared geometry and materials for fighters.
    this.botGeo = {
      torso: new THREE.BoxGeometry(0.52, 0.62, 0.3),
      head: new THREE.BoxGeometry(0.3, 0.3, 0.3),
      leg: new THREE.BoxGeometry(0.2, 0.55, 0.22),
      arm: new THREE.BoxGeometry(0.16, 0.5, 0.18),
      gun: new THREE.BoxGeometry(0.09, 0.12, 0.72),
    };
    this.botMats = {};
    for (const team of [TEAM.SANDLINE, TEAM.JACKAL]) {
      const c = TEAM_COLORS[team];
      this.botMats[team] = {
        body: new THREE.MeshLambertMaterial({ color: c.body }),
        dark: new THREE.MeshLambertMaterial({ color: c.dark }),
        head: new THREE.MeshLambertMaterial({ color: c.head }),
      };
    }
    this.botMeshes = new Map(); // bot id -> { group, parts }
    this._v = new THREE.Vector3();

    // The player's gun, a few boxes hung under the camera.
    this.gun = this.buildGun();
    this.camera.add(this.gun.group);
    this.gunKick = 0;
    this.bobPhase = 0;

    // Tracer pool: 24 lines, reused in order, fading out over 90 ms.
    this.tracers = [];
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const line = new THREE.Line(tracerGeo.clone(), mat);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIndex = 0;

    // Impact sparks: one small Points cloud, repositioned per impact.
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0 }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.sparkLife = 0;

    // Muzzle flash: a small additive quad at the gun tip.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.position.set(0.28, -0.18, -1.05);
    this.camera.add(this.flash);
    this.flashLife = 0;

    // Explosion: an expanding shell plus a point light.
    this.blast = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8c2e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(this.blast);
    this.blastLight = new THREE.PointLight(0xff7a1e, 0, 30);
    this.scene.add(this.blastLight);
    this.blastLife = 0;

    // The planted charge: a dark box with a blinking lamp.
    this.charge = new THREE.Group();
    const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.36), new THREE.MeshLambertMaterial({ color: 0x1e2226 }));
    const chargeLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2e2e }),
    );
    chargeLamp.position.set(0, 0.18, 0);
    this.charge.add(chargeBody);
    this.charge.add(chargeLamp);
    this.chargeLamp = chargeLamp;
    this.charge.visible = false;
    this.scene.add(this.charge);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildGun() {
    const group = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x23262b });
    const mid = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.34), mid);
    barrel.position.set(0, 0.02, -0.46);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), wood);
    grip.position.set(0, -0.14, 0.16);
    grip.rotation.x = 0.35;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.09), mid);
    mag.position.set(0, -0.16, -0.08);
    mag.rotation.x = 0.15;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), mid);
    sight.position.set(0, 0.09, -0.1);
    group.add(body, barrel, grip, mag, sight);
    group.scale.setScalar(0.62);
    group.position.set(0.3, -0.28, -0.6);
    return { group, body };
  }

  // Build (or rebuild) the mesh for one bot.
  botMesh(bot) {
    let entry = this.botMeshes.get(bot.id);
    if (entry) return entry;
    const mats = this.botMats[bot.team];
    const group = new THREE.Group();
    const torso = new THREE.Mesh(this.botGeo.torso, mats.body);
    torso.position.y = 1.02;
    const head = new THREE.Mesh(this.botGeo.head, mats.head);
    head.position.y = 1.5;
    const legL = new THREE.Mesh(this.botGeo.leg, mats.dark);
    legL.position.set(-0.14, 0.42, 0);
    const legR = new THREE.Mesh(this.botGeo.leg, mats.dark);
    legR.position.set(0.14, 0.42, 0);
    const armL = new THREE.Mesh(this.botGeo.arm, mats.body);
    armL.position.set(-0.33, 1.05, 0.08);
    armL.rotation.x = -1.1;
    const armR = new THREE.Mesh(this.botGeo.arm, mats.body);
    armR.position.set(0.33, 1.05, 0.08);
    armR.rotation.x = -1.1;
    const gun = new THREE.Mesh(this.botGeo.gun, mats.dark);
    gun.position.set(0.08, 1.12, -0.32);
    // A small team band so sides read at a glance.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.09, 0.32),
      new THREE.MeshBasicMaterial({ color: bot.team === TEAM.SANDLINE ? 0x7fb069 : 0xe4572e }),
    );
    band.position.y = 1.28;
    group.add(torso, head, legL, legR, armL, armR, gun, band);
    this.scene.add(group);
    entry = { group, legL, legR, armL, armR, head, torso, fall: 0 };
    this.botMeshes.set(bot.id, entry);
    return entry;
  }

  // Sync one bot's mesh to its sim state. Dead bots fall over.
  syncBot(bot, dt, now) {
    const entry = this.botMesh(bot);
    const g = entry.group;
    if (!bot.alive) {
      entry.fall = Math.min(1, entry.fall + dt * 4);
      g.position.set(bot.x, 0.15, bot.z);
      g.rotation.set(-Math.PI / 2 * entry.fall, bot.yaw, 0);
      return;
    }
    g.position.set(bot.x, bot.y, bot.z);
    g.rotation.set(0, bot.yaw, 0);
    // Walk cycle: legs swing while moving, arms steady on the gun.
    const phase = now * 9;
    const swing = bot.moving ? Math.sin(phase) * 0.5 : 0;
    entry.legL.rotation.x = swing;
    entry.legR.rotation.x = -swing;
    entry.armL.rotation.x = -1.1 + (bot.moving ? Math.sin(phase) * 0.06 : 0);
    entry.armR.rotation.x = -1.1 - (bot.moving ? Math.sin(phase) * 0.06 : 0);
    // Aim the head at the bot's pitch.
    entry.head.rotation.x = bot.aimPitch || 0;
  }

  spawnTracer(from, to, color) {
    const t = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }

  spawnSparks(p) {
    const pos = this.sparks.geometry.attributes.position;
    for (let i = 0; i < 12; i++) {
      pos.setXYZ(i, p.x + (Math.random() - 0.5) * 0.3, p.y + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.3);
    }
    pos.needsUpdate = true;
    this.sparks.material.opacity = 0.95;
    this.sparkLife = 0.25;
  }

  spawnBlast(x, y, z, radius) {
    this.blast.position.set(x, Math.max(1.2, y), z);
    this.blast.scale.setScalar(0.4);
    this.blast.material.opacity = 0.85;
    this.blast.userData.radius = radius || 7;
    this.blastLight.position.set(x, 2.5, z);
    this.blastLight.intensity = 60;
    this.blastLife = 0.55;
  }

  // Consume the sim's events for this frame.
  handleEvents(events, sim) {
    for (const e of events) {
      if (e.type === 'tracer') this.spawnTracer(e.from, e.to, e.color);
      else if (e.type === 'impact') this.spawnSparks(e.point);
      else if (e.type === 'explosion') this.spawnBlast(e.x, 0.6, e.z, e.radius);
      else if (e.type === 'muzzle' && e.by === sim.player) {
        this.flashLife = 0.05;
        this.flash.material.opacity = 0.95;
        this.flash.rotation.z = Math.random() * Math.PI;
        this.gunKick = 0.06;
      } else if (e.type === 'planted') {
        this.charge.position.set(e.x, 0.15, e.z);
        this.charge.visible = true;
      } else if (e.type === 'defused' || (e.type === 'round-end' && !sim.bomb.planted)) {
        this.charge.visible = false;
      }
    }
  }

  update(dt, sim, now) {
    const p = sim.player;
    // Camera follows the player's head, with recoil and walk bob.
    this.camera.position.set(p.x, p.eyeY, p.z);
    this.camera.rotation.y = p.yaw;
    this.camera.rotation.x = p.pitch;
    this.camera.rotation.z = 0;
    this.bobPhase += dt * (p.moving ? 9 : 0);
    const bob = p.moving && p.onGround ? Math.sin(this.bobPhase) * 0.02 : 0;
    this.camera.position.y += bob;
    // Gun kick and bob.
    this.gunKick = Math.max(0, this.gunKick - dt * 0.5);
    this.gun.group.position.z = -0.6 + this.gunKick;
    this.gun.group.position.y = -0.28 + (p.moving ? Math.sin(this.bobPhase) * 0.008 : 0);
    this.gun.group.visible = p.alive && sim.phase !== 'title';
    // Muzzle flash decay.
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.material.opacity = 0;
    }
    // Tracers fade.
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (this.sparkLife > 0) {
      this.sparkLife -= dt;
      this.sparks.material.opacity = Math.max(0, this.sparkLife / 0.25) * 0.95;
    }
    if (this.blastLife > 0) {
      this.blastLife -= dt;
      const k = 1 - Math.max(0, this.blastLife / 0.55);
      this.blast.scale.setScalar(0.4 + k * (this.blast.userData.radius || 7));
      this.blast.material.opacity = Math.max(0, this.blastLife / 0.55) * 0.85;
      this.blastLight.intensity = Math.max(0, this.blastLife / 0.55) * 60;
    }
    // Charge lamp blinks faster as the fuse burns down.
    if (this.charge.visible && sim.bomb.planted) {
      const rate = sim.bomb.fuse > 10 ? 2 : 8;
      this.chargeLamp.material.color.setHex(Math.sin(now * rate * Math.PI) > 0 ? 0xff2e2e : 0x551111);
    }
    // Bots.
    for (const b of sim.bots) this.syncBot(b, dt, now);
    // Site rings pulse gently so the sites read from across the yard.
    for (const key of ['A', 'B']) {
      const ring = this.scene.getObjectByName(`site-${key}`);
      if (ring) ring.material.opacity = 0.4 + Math.sin(now * 2 + (key === 'A' ? 0 : 2)) * 0.15;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
