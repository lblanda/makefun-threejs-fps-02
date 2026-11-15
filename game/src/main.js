// SANDLINE bootstrap and game loop. The loop is the only place that knows
// about time: it accumulates real time and steps the sim at a fixed 1/60 s,
// then hands the sim's events to the renderer, the HUD and the sounds.
// Rendering and simulation stay apart: the sim never sees a frame.

import { PHASE, TEAM, TICK } from './config.js';
import { Sim } from './sim.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot'); // title | play | buy | win — screenshot states
const SHOT_MODE = shot === 'title' || shot === 'play' || shot === 'buy' || shot === 'win';

const canvas = document.getElementById('game');
const sim = new Sim();
const renderer = new Renderer(canvas);
const sounds = new SoundBank();
const input = new Input(canvas);

let paused = false;
let photoTicks = 0; // screenshot states freeze the sim after a short beat
let lastTime = performance.now();
let accumulator = 0;

// --- Sounds for the sim's events. ---
function playEventSounds(events) {
  for (const e of events) {
    if (e.type === 'muzzle' && e.by === sim.player) sounds.shot(sim.player.weapons.def().id);
    else if (e.type === 'muzzle' && e.by !== sim.player) sounds.shot(e.by.weapons.def().id);
    else if (e.type === 'hit' && e.shooter === sim.player) sounds.hit(e.head);
    else if (e.type === 'hurt' && e.target === sim.player) sounds.hurt();
    else if (e.type === 'explosion') sounds.explosion();
    else if (e.type === 'planted') sounds.plantBeep();
    else if (e.type === 'round-end') {
      if (e.won) sounds.roundWin();
      else sounds.roundLose();
    } else if (e.type === 'bought') sounds.buy();
    else if (e.type === 'dryfire') sounds.dryFire();
    else if (e.type === 'grenade-thrown') sounds.grenadeThrow();
  }
}

const hud = new Hud((item) => {
  const msg = sim.buy(item);
  if (msg) sounds.buy();
  return msg;
});

// --- Menu keys (buy menu, restart) live outside the sim's input. ---
input.onKey = (code) => {
  if (SHOT_MODE) return;
  if (code === 'KeyB') {
    if (sim.phase === PHASE.BUY) {
      if (sim.buyOpen) sim.closeBuy();
      else sim.openBuy();
    }
  }
  if (code === 'Digit1' && sim.buyOpen) hud.buy('rifle');
  if (code === 'Digit2' && sim.buyOpen) hud.buy('smg');
  if (code === 'Digit3' && sim.buyOpen) hud.buy('grenade');
  if (code === 'Digit4' && sim.buyOpen) hud.buy('ammo');
};

// --- Pointer lock: losing it mid-round pauses the game. ---
input.onLockChange = (locked) => {
  if (SHOT_MODE) return;
  if (!locked && sim.phase === PHASE.LIVE && sim.player.alive) {
    paused = true;
    hud.el.overlay.hidden = false;
    hud.el.overlayTitle.textContent = 'PAUSED';
    hud.el.overlayCopy.textContent = 'Click to resume. The Jackals are waiting.';
    hud.el.play.textContent = 'Resume';
  }
};

document.getElementById('play').addEventListener('click', () => {
  sounds.ensure();
  if (SHOT_MODE) return;
  if (paused) {
    paused = false;
    hud.hideOverlay();
    input.lock();
    return;
  }
  if (sim.phase === PHASE.TITLE || sim.phase === PHASE.MATCH_END) {
    sim.startMatch();
    hud.hideOverlay();
    hud.showBanner('ROUND 1', 'Eliminate the Jackals or plant the charge.', 2600);
  }
  input.lock();
});

// --- Screenshot states: jump straight to a real game state. ---
function setupShot() {
  sim.startMatch();
  const p = sim.player;
  if (shot === 'title') {
    // A quiet yard at dusk, the title card over it.
    sim.phase = PHASE.TITLE;
    p.x = -8;
    p.z = 16;
    p.yaw = 0.32;
    p.pitch = -0.01;
    hud.showTitle();
  } else if (shot === 'play') {
    // Mid-round, rifle out, two Jackals in the mid lane ahead.
    sim.phase = PHASE.LIVE;
    sim.freeze = false;
    sim.roundTimer = 87;
    p.weapons.buy('rifle');
    p.weapons.switchTo('rifle', 0);
    p.x = 3;
    p.z = 15;
    p.yaw = 0.05;
    p.pitch = 0.01;
    const jackals = sim.bots.filter((b) => b.team === TEAM.JACKAL);
    jackals[0].x = 1.5;
    jackals[0].z = -4;
    jackals[0].yaw = Math.PI;
    jackals[1].x = -3.5;
    jackals[1].z = -9;
    jackals[1].yaw = Math.PI;
    jackals[1].state = 'hold';
    hud.hideOverlay();
  } else if (shot === 'buy') {
    // Between rounds, wallet full, the buy menu open.
    sim.phase = PHASE.BUY;
    sim.phaseTimer = 12;
    p.money = 5200;
    p.weapons.buy('rifle');
    p.x = 4;
    p.z = 19;
    p.yaw = -0.15;
    hud.hideOverlay();
    sim.openBuy();
  } else if (shot === 'win') {
    // The round just ended in a Sandline win: the Jackals lie where they fell.
    sim.score.sandline = 2;
    sim.score.jackal = 1;
    sim.endRound(TEAM.SANDLINE, 'Jackal squad eliminated.');
    for (const b of sim.bots) {
      if (b.team === TEAM.JACKAL) {
        b.alive = false;
        b.health = 0;
        b.state = 'dead';
      }
    }
    // Two of them fell in the open, where the camera can see them.
    sim.bots[2].x = 6;
    sim.bots[2].z = -6;
    sim.bots[3].x = -2;
    sim.bots[3].z = -10;
    p.x = -2;
    p.z = 8;
    p.yaw = 0.3;
    hud.hideOverlay();
  }
}

if (SHOT_MODE) {
  setupShot();
} else {
  hud.showTitle();
}

// --- The loop. ---
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;

  if (!paused) {
    const snap = input.take();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK && steps < 5) {
      if (SHOT_MODE) {
        photoTicks += 1;
        if (photoTicks > 45) break; // freeze the scene for the screenshot
      }
      sim.update(TICK, snap);
      accumulator -= TICK;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  }

  // Drain the sim's events to the renderer, HUD and sounds.
  const events = sim.events;
  sim.events = [];
  renderer.handleEvents(events, sim);
  hud.handleEvents(events, sim);
  playEventSounds(events);

  renderer.update(dt, sim, sim.time);
  hud.update(sim, dt);
}

requestAnimationFrame(frame);
