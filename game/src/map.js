// The map: "Dustworks Yard", an original desert freight yard at dusk.
// Two bomb sites (A: the warehouse, B: the silo yard), a mid lane and long
// lanes down each flank. The data here is the source of truth for the sim:
// colliders, spawn points, bomb sites and the waypoint graph the bots walk.
// buildMap() turns the same data into three.js meshes.

import * as THREE from 'three';

export const MAP = {
  name: 'Dustworks Yard',
  bounds: { minX: -35, minZ: -25, maxX: 35, maxZ: 25 },
  // Bomb sites: the charge is planted inside the site rectangle.
  sites: {
    A: { x: -26, z: -15, r: 5, label: 'SITE A — WAREHOUSE' },
    B: { x: 26, z: -15, r: 5, label: 'SITE B — SILO YARD' },
  },
  spawns: {
    // Yaw 0 faces north (-z), toward the Jackal side; yaw PI faces south.
    sandline: [
      { x: -4, z: 21, yaw: 0 },
      { x: 0, z: 22, yaw: 0 },
      { x: 4, z: 21, yaw: 0 },
    ],
    jackal: [
      { x: -8, z: -21, yaw: Math.PI },
      { x: 0, z: -22, yaw: Math.PI },
      { x: 8, z: -21, yaw: Math.PI },
      { x: -16, z: -20, yaw: Math.PI },
      { x: 16, z: -20, yaw: Math.PI },
    ],
  },
  // Axis-aligned colliders. Every wall, container and crate the sim can hit.
  // { minX, minZ, maxX, maxZ, height }
  colliders: [
    // Perimeter walls.
    { minX: -35, minZ: -25, maxX: -34, maxZ: 25, height: 4 },
    { minX: 34, minZ: -25, maxX: 35, maxZ: 25, height: 4 },
    { minX: -35, minZ: -25, maxX: 35, maxZ: -24, height: 4 },
    { minX: -35, minZ: 24, maxX: 35, maxZ: 25, height: 4 },
    // Warehouse (Site A): three walls with a south door and an east door.
    { minX: -33, minZ: -21, maxX: -32, maxZ: -9, height: 5 },
    { minX: -32, minZ: -21, maxX: -19, maxZ: -20, height: 5 },
    { minX: -32, minZ: -9, maxX: -27, maxZ: -8, height: 5 },
    { minX: -22, minZ: -9, maxX: -19, maxZ: -8, height: 5 },
    { minX: -20, minZ: -20, maxX: -19, maxZ: -12, height: 5 },
    { minX: -20, minZ: -11, maxX: -19, maxZ: -8, height: 5 },
    // Silo yard (Site B): low wall with two gaps, silos as square footings.
    { minX: 19, minZ: -21, maxX: 20, maxZ: -13, height: 3.5 },
    { minX: 20, minZ: -21, maxX: 33, maxZ: -20, height: 3.5 },
    { minX: 20, minZ: -9, maxX: 26, maxZ: -8, height: 3.5 },
    { minX: 29, minZ: -9, maxX: 33, maxZ: -8, height: 3.5 },
    { minX: 23, minZ: -18, maxX: 25, maxZ: -16, height: 4 },
    { minX: 28, minZ: -18, maxX: 30, maxZ: -16, height: 4 },
    // Mid wall with a central double-door gap.
    { minX: -12, minZ: -0.6, maxX: -2, maxZ: 0.6, height: 3.2 },
    { minX: 2, minZ: -0.6, maxX: 12, maxZ: 0.6, height: 3.2 },
    // Containers (cover on the long lanes and mid).
    { minX: -33, minZ: 4, maxX: -27, maxZ: 6.4, height: 2.6 },
    { minX: -33, minZ: 6.4, maxX: -27, maxZ: 8.8, height: 2.6 },
    { minX: 27, minZ: 4, maxX: 33, maxZ: 6.4, height: 2.6 },
    { minX: 27, minZ: 6.4, maxX: 33, maxZ: 8.8, height: 2.6 },
    { minX: -6, minZ: 12, maxX: 0, maxZ: 14.4, height: 2.6 },
    { minX: 4, minZ: -6, maxX: 10, maxZ: -3.6, height: 2.6 },
    { minX: -12, minZ: -14, maxX: -6, maxZ: -11.6, height: 2.6 },
    { minX: 8, minZ: 10, maxX: 14, maxZ: 12.4, height: 2.6 },
    // Crates.
    { minX: -16, minZ: 2, maxX: -14.8, maxZ: 3.2, height: 1.2 },
    { minX: -15.9, minZ: 3.2, maxX: -14.7, maxZ: 4.4, height: 1.2 },
    { minX: 14.8, minZ: 2, maxX: 16, maxZ: 3.2, height: 1.2 },
    { minX: -3, minZ: -12, maxX: -1.8, maxZ: -10.8, height: 1.2 },
    { minX: 1.8, minZ: -12, maxX: 3, maxZ: -10.8, height: 1.2 },
    { minX: -28, minZ: 16, maxX: -26.8, maxZ: 17.2, height: 1.2 },
    { minX: 26.8, minZ: 16, maxX: 28, maxZ: 17.2, height: 1.2 },
  ],
  // Waypoint graph the bots walk. Nodes are ground points; edges are
  // walkable links. Bots pathfind with a breadth-first search.
  waypoints: [
    { x: 0, z: 21 }, { x: -6, z: 21 }, { x: 6, z: 21 },
    { x: -30, z: 12 }, { x: -30, z: 0 }, { x: -30, z: -8 },
    { x: 30, z: 12 }, { x: 30, z: 0 }, { x: 30, z: -8 },
    { x: 0, z: 14 }, { x: 0, z: 6 }, { x: 0, z: -2 }, { x: 0, z: -10 },
    { x: -26, z: -15 }, { x: -22, z: -17 }, { x: -28, z: -18 },
    { x: 26, z: -15 }, { x: 22, z: -17 }, { x: 28, z: -18 },
    { x: 0, z: -21 }, { x: -10, z: -21 }, { x: 10, z: -21 },
    { x: -18, z: -6 }, { x: -12, z: -12 },
    { x: 18, z: -6 }, { x: 12, z: -12 },
    { x: -14, z: 18 }, { x: 14, z: 18 }, { x: -22, z: 8 }, { x: 22, z: 8 },
  ],
  // Edges as index pairs into waypoints.
  edges: [
    [0, 1], [0, 2], [0, 9], [1, 27], [2, 28], [9, 10], [9, 27], [9, 28],
    [3, 4], [4, 5], [3, 27], [3, 29], [4, 29], [4, 30], [5, 13], [5, 23],
    [6, 7], [7, 8], [6, 28], [6, 30], [7, 29], [7, 30], [8, 16], [8, 25],
    [10, 11], [11, 12], [12, 19], [12, 23], [12, 25], [11, 23], [11, 25],
    [13, 14], [13, 15], [14, 23], [15, 23], [16, 17], [16, 18], [17, 25],
    [18, 25], [19, 20], [19, 21], [20, 23], [21, 25], [23, 24], [24, 14],
    [25, 26], [26, 17], [10, 29], [10, 30], [27, 29], [28, 30],
    [5, 15], [8, 18], [13, 24], [16, 26], [19, 12], [0, 27], [0, 28],
  ],
};

// --- Procedural textures -------------------------------------------------
// Everything is painted at runtime from canvas, so the game ships no image
// assets and loads nothing over the network.

function canvasTexture(size, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, base, dots, dotAlpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5
      ? `rgba(255,255,255,${dotAlpha * Math.random()})`
      : `rgba(0,0,0,${dotAlpha * Math.random()})`;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

function makeTextures() {
  const sand = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#b98d5e', 2600, 0.10);
    ctx.strokeStyle = 'rgba(90,60,30,0.25)';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      const y = Math.random() * s;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + 8, s * 0.7, y - 8, s, y + 4);
      ctx.stroke();
    }
  });
  sand.repeat.set(14, 10);
  const concrete = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#8a7f70', 1800, 0.08);
    ctx.strokeStyle = 'rgba(40,30,20,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  });
  concrete.repeat.set(2, 1);
  const rust = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#7d4a2d', 2200, 0.16);
    ctx.fillStyle = 'rgba(60,30,15,0.35)';
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * s, 0, 6 + Math.random() * 10, s);
  });
  const teal = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#2f5d5a', 2000, 0.14);
    ctx.fillStyle = 'rgba(20,40,38,0.3)';
    for (let i = 0; i < 10; i++) ctx.fillRect(0, Math.random() * s, s, 4 + Math.random() * 8);
  });
  const crate = canvasTexture(128, (ctx, s) => {
    speckle(ctx, s, '#a67c4e', 900, 0.10);
    ctx.strokeStyle = 'rgba(60,40,18,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.moveTo(s, 0);
    ctx.lineTo(0, s);
    ctx.stroke();
  });
  return { sand, concrete, rust, teal, crate };
}

// --- Geometry ------------------------------------------------------------

export function buildMap(scene) {
  const tex = makeTextures();
  const matSand = new THREE.MeshLambertMaterial({ map: tex.sand });
  const matConcrete = new THREE.MeshLambertMaterial({ map: tex.concrete });
  const matRust = new THREE.MeshLambertMaterial({ map: tex.rust });
  const matTeal = new THREE.MeshLambertMaterial({ map: tex.teal });
  const matCrate = new THREE.MeshLambertMaterial({ map: tex.crate });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x3a3230 });
  const matSilo = new THREE.MeshLambertMaterial({ color: 0x9aa0a4 });

  const group = new THREE.Group();
  group.name = 'map';

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), matSand);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Every collider becomes a box mesh. Containers and crates get their own
  // materials; walls get concrete.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const containerMats = [matRust, matTeal];
  let containerIndex = 0;
  for (const c of MAP.colliders) {
    const w = c.maxX - c.minX;
    const d = c.maxZ - c.minZ;
    const h = c.height;
    let mat = matConcrete;
    if (h <= 1.2) mat = matCrate;
    else if (h === 2.6) mat = containerMats[containerIndex++ % 2];
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set((c.minX + c.maxX) / 2, h / 2, (c.minZ + c.maxZ) / 2);
    group.add(mesh);
    // A darker cap on containers reads as a lid from above.
    if (h === 2.6) {
      const cap = new THREE.Mesh(boxGeo, matDark);
      cap.scale.set(w * 0.98, 0.08, d * 0.98);
      cap.position.set(mesh.position.x, h + 0.04, mesh.position.z);
      group.add(cap);
    }
  }

  // Silos at Site B: cylinders standing on the square footings.
  const siloGeo = new THREE.CylinderGeometry(1.4, 1.4, 6, 18);
  for (const [x, z] of [[24, -17], [29, -17]]) {
    const silo = new THREE.Mesh(siloGeo, matSilo);
    silo.position.set(x, 3, z);
    group.add(silo);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.2, 18), matRust);
    cap.position.set(x, 6.6, z);
    group.add(cap);
  }

  // Warehouse roof beams over Site A (visual only, high enough to walk under).
  const beamGeo = new THREE.BoxGeometry(13, 0.3, 0.5);
  for (const z of [-11, -14, -17, -20]) {
    const beam = new THREE.Mesh(beamGeo, matDark);
    beam.position.set(-25.5, 5.1, z);
    group.add(beam);
  }

  // Site markers: flat glowing rings on the ground so a site reads at a glance.
  const ringGeo = new THREE.RingGeometry(3.4, 4, 40);
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    ring.name = `site-${key}`;
    group.add(ring);
  }

  // A warm dusk sun and a cool sky fill, plus distance haze.
  const sun = new THREE.DirectionalLight(0xffb36b, 3.0);
  sun.position.set(-30, 38, 18);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x9a8bc8, 0x7a5638, 1.5);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0x453848, 55, 130);
  scene.background = new THREE.Color(0x382c44);

  // Distant dunes: a ring of low dark hills so the horizon is not a void.
  const duneGeo = new THREE.ConeGeometry(18, 7, 7);
  const duneMat = new THREE.MeshLambertMaterial({ color: 0x4a3428 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const dune = new THREE.Mesh(duneGeo, duneMat);
    dune.position.set(Math.cos(a) * 95, 0, Math.sin(a) * 95);
    dune.scale.y = 0.6 + Math.random() * 0.7;
    group.add(dune);
  }

  scene.add(group);
  return group;
}
