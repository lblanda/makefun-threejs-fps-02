// Shared math helpers for SANDLINE. No allocations in the hot paths: the
// callers pass scratch objects in, and every function here is pure.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed difference between two yaw angles, in radians.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * clamp(t, 0, 1);
}

// 2D distance on the ground plane.
export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

// Ray (origin + t * dir, t >= 0) against an axis-aligned box given by its
// ground-plane bounds and a height. Returns the smallest t >= 0 of entry,
// or Infinity when the ray misses. `out` receives the hit normal on a hit.
export function rayAABB(ox, oy, oz, dx, dy, dz, minX, minZ, maxX, maxZ, height, out) {
  let tmin = 0;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  // X slab
  if (dx === 0) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Z slab
  if (dz === 0) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Y slab (0..height)
  if (dy === 0) {
    if (oy < 0 || oy > height) return Infinity;
  } else {
    const inv = 1 / dy;
    let t1 = (0 - oy) * inv;
    let t2 = (height - oy) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (tmin < 0) return Infinity;
  if (out) {
    out.x = axis === 0 ? sign : 0;
    out.y = axis === 1 ? sign : 0;
    out.z = axis === 2 ? sign : 0;
  }
  return tmin;
}

// Ray against a sphere. Returns smallest t >= 0 or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// Does segment (ax,az)->(bx,bz) at eye height clear all AABBs? Used for
// line-of-sight checks. Samples the segment against every box's 2D bounds
// and requires the line to pass above the box or miss it.
export function losClear(ax, ay, az, bx, by, bz, boxes) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len === 0) return true;
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    // Quick 2D reject: segment's bounding box vs box bounds.
    const minSx = Math.min(ax, bx);
    const maxSx = Math.max(ax, bx);
    const minSz = Math.min(az, bz);
    const maxSz = Math.max(az, bz);
    if (maxSx < b.minX || minSx > b.maxX || maxSz < b.minZ || minSz > b.maxZ) continue;
    const t = rayAABB(ax, ay, az, nx, ny, nz, b.minX, b.minZ, b.maxX, b.maxZ, b.height, null);
    if (t < len) return false;
  }
  return true;
}

// Move an AABB (half extents hx, hz) against the map's colliders, axis by
// axis. `p` is the position object {x, z} mutated in place; returns true
// when any axis was blocked.
export function moveCollide(p, vx, vz, dt, hx, hz, boxes, bounds) {
  let blocked = false;
  let nx = p.x + vx * dt;
  nx = clamp(nx, bounds.minX + hx, bounds.maxX - hx);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (nx + hx > b.minX && nx - hx < b.maxX && p.z + hz > b.minZ && p.z - hz < b.maxZ) {
      nx = vx > 0 ? b.minX - hx : b.maxX + hx;
      blocked = true;
    }
  }
  p.x = nx;
  let nz = p.z + vz * dt;
  nz = clamp(nz, bounds.minZ + hz, bounds.maxZ - hz);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (p.x + hx > b.minX && p.x - hx < b.maxX && nz + hz > b.minZ && nz - hz < b.maxZ) {
      nz = vz > 0 ? b.minZ - hz : b.maxZ + hz;
      blocked = true;
    }
  }
  p.z = nz;
  return blocked;
}
