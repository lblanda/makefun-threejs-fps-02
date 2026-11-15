// The HUD for SANDLINE: DOM overlays over the canvas. It reads the sim
// every frame and never writes to it, except through the buy callback the
// main loop hands it. All overlays live in index.html; this class only
// shows, hides and fills them.

import { ECONOMY, GRENADE, PHASE, TEAM, WEAPONS } from './config.js';

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(onBuy) {
    this.onBuy = onBuy;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      health: $('health-value'),
      healthBar: $('health-bar'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
      ammoBox: $('ammo'),
      weaponName: $('weapon-name'),
      grenades: $('grenade-count'),
      timer: $('timer-value'),
      timerBox: $('timer'),
      score: $('score-value'),
      money: $('money-value'),
      bomb: $('bomb-status'),
      feed: $('feed'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      plantBar: $('plant-bar'),
      plantFill: $('plant-fill'),
      plantLabel: $('plant-label'),
      damage: $('damage'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlayCopy: $('overlay-copy'),
      play: $('play'),
      buyMenu: $('buy-menu'),
      buyItems: $('buy-items'),
      buyMoney: $('buy-money'),
      buyMsg: $('buy-msg'),
      keys: $('keys-hint'),
    };
    this.feedItems = [];
    this.hitTimer = 0;
    this.damageTimer = 0;
    this.bannerTimer = 0;
    this.lastAmmo = '';
    this.buildBuyMenu();
  }

  buildBuyMenu() {
    const items = [
      { id: 'rifle', key: '1', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, desc: 'Auto · 30 rounds · heavy hits' },
      { id: 'smg', key: '2', name: WEAPONS.smg.name, price: WEAPONS.smg.price, desc: 'Auto · 25 rounds · fast, close' },
      { id: 'grenade', key: '3', name: 'Spark Grenade', price: GRENADE.price, desc: 'Thrown charge · blast radius 7 m' },
      { id: 'ammo', key: '4', name: 'Refill Ammo', price: 200, desc: 'Full reserve for every owned gun' },
    ];
    this.el.buyItems.innerHTML = '';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.item = item.id;
      button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
      button.addEventListener('click', () => this.buy(item.id));
      this.el.buyItems.appendChild(button);
    }
  }

  buy(item) {
    if (!this.onBuy) return;
    const msg = this.onBuy(item);
    if (msg) this.el.buyMsg.textContent = msg;
  }

  showTitle() {
    this.el.overlay.hidden = false;
    this.el.overlayTitle.textContent = 'SANDLINE';
    this.el.overlayCopy.textContent =
      'A desert freight yard at dusk. Plant the charge at Site A or Site B, or wipe out the Jackal squad — then do it again, richer, with a better gun.';
    this.el.play.textContent = 'Click to play';
    this.el.hud.style.display = 'none';
    this.el.buyMenu.hidden = true;
  }

  showMatchEnd(winner, score) {
    this.el.overlay.hidden = false;
    const won = winner === TEAM.SANDLINE;
    this.el.overlayTitle.textContent = won ? 'SANDLINE WINS THE MATCH' : 'JACKAL SQUAD WINS';
    this.el.overlayCopy.textContent =
      `Final score ${score.sandline} — ${score.jackal}. ` +
      (won ? 'The yard is yours. Play again?' : 'The Jackals hold the yard. Run it back?');
    this.el.play.textContent = 'Play again';
    this.el.hud.style.display = 'none';
    this.el.buyMenu.hidden = true;
  }

  hideOverlay() {
    this.el.overlay.hidden = true;
    this.el.hud.style.display = '';
  }

  showBanner(title, sub, ms) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.hidden = false;
    this.bannerTimer = ms / 1000;
  }

  hideBanner() {
    this.el.banner.hidden = true;
    this.bannerTimer = 0;
  }

  showBuy(money) {
    this.el.buyMenu.hidden = false;
    this.el.buyMoney.textContent = `$${money}`;
    this.el.buyMsg.textContent = 'Buy menu — press B or click Done when ready.';
  }

  hideBuy() {
    this.el.buyMenu.hidden = true;
  }

  addFeed(text, cls) {
    const item = document.createElement('div');
    item.className = `feed-item ${cls || ''}`;
    item.textContent = text;
    this.el.feed.prepend(item);
    this.feedItems.push(item);
    while (this.feedItems.length > 4) {
      const old = this.feedItems.shift();
      old.remove();
    }
    setTimeout(() => {
      item.classList.add('fade');
      setTimeout(() => item.remove(), 600);
    }, 4500);
  }

  flashHit(head) {
    this.el.hitmarker.classList.add('on');
    if (head) this.el.hitmarker.classList.add('head');
    this.hitTimer = 0.12;
  }

  flashDamage() {
    this.el.damage.classList.add('on');
    this.damageTimer = 0.35;
  }

  // One frame of HUD sync from the sim.
  update(sim, dt) {
    const p = sim.player;
    const w = p.weapons;
    const def = w.def();
    const slot = w.state();

    // Health.
    this.el.health.textContent = Math.max(0, Math.ceil(p.health));
    this.el.healthBar.style.width = `${Math.max(0, p.health)}%`;
    this.el.healthBar.classList.toggle('low', p.health <= 30);

    // Ammo and weapon.
    const ammoText = `${slot.mag}|${slot.reserve}`;
    if (ammoText !== this.lastAmmo) {
      this.el.ammoMag.textContent = slot.mag;
      this.el.ammoReserve.textContent = `/ ${slot.reserve}`;
      this.el.ammoBox.classList.toggle('empty', slot.mag === 0);
      this.lastAmmo = ammoText;
    }
    this.el.weaponName.textContent = def.name + (w.reloading ? ' — reloading…' : '');
    this.el.grenades.textContent = `◉ ${w.grenades}`;

    // Timer, score, money.
    this.el.timer.textContent = sim.bomb.planted ? fmtTime(sim.bomb.fuse) : fmtTime(sim.roundTimer);
    this.el.timerBox.classList.toggle('urgent', (sim.bomb.planted ? sim.bomb.fuse : sim.roundTimer) <= 10);
    this.el.score.textContent = `${sim.score.sandline} — ${sim.score.jackal}`;
    this.el.money.textContent = `$${p.money}`;

    // Bomb status line.
    if (sim.bomb.planted) {
      this.el.bomb.textContent = `CHARGE PLANTED — SITE ${sim.bomb.site} — ${fmtTime(sim.bomb.fuse)}`;
      this.el.bomb.className = 'planted';
    } else if (p.hasBomb) {
      this.el.bomb.textContent = 'YOU CARRY THE CHARGE — hold E at a site to plant';
      this.el.bomb.className = 'carry';
    } else {
      this.el.bomb.textContent = '';
      this.el.bomb.className = '';
    }

    // Plant progress bar.
    if (p.planting && p.plantProgress > 0) {
      this.el.plantBar.hidden = false;
      this.el.plantFill.style.width = `${(p.plantProgress / 3) * 100}%`;
      this.el.plantLabel.textContent = 'PLANTING…';
    } else {
      this.el.plantBar.hidden = true;
    }

    // Crosshair spread from the weapon state: base + bloom + movement.
    const moveFactor = Math.min(1, p.speed2D / 4.3);
    const spreadPx = 3 + w.bloom * 260 + moveFactor * 7 + (p.onGround ? 0 : 6) + (p.crouching ? -1 : 0);
    this.el.crosshair.style.setProperty('--spread', `${spreadPx.toFixed(1)}px`);
    this.el.crosshair.classList.toggle('hidden', !p.alive || sim.phase === PHASE.TITLE);

    // Decaying flashes.
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('on', 'head');
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) this.el.damage.classList.remove('on');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.hideBanner();
    }
  }

  // Consume the sim's events that the HUD cares about.
  handleEvents(events, sim) {
    for (const e of events) {
      if (e.type === 'hit' && e.shooter === sim.player) this.flashHit(e.head);
      else if (e.type === 'hurt' && e.target === sim.player) this.flashDamage();
      else if (e.type === 'kill') {
        const killer = e.shooter === sim.player ? 'You' : (e.shooter.name || 'A grenade');
        const victim = e.target === sim.player ? 'you' : e.target.name;
        this.addFeed(`${killer} ▸ ${victim}${e.head ? '  ·  HEADSHOT' : ''}`, e.shooter === sim.player ? 'good' : 'bad');
      } else if (e.type === 'round-start') {
        this.showBanner(`ROUND ${e.round}`, 'Eliminate the Jackals or plant the charge.', 2600);
      } else if (e.type === 'round-live') {
        this.hideBanner();
      } else if (e.type === 'planted') {
        this.showBanner('CHARGE PLANTED', `Defend Site ${e.site} — 30 seconds to detonation.`, 3000);
        this.addFeed(`Charge planted at Site ${e.site}`, 'good');
      } else if (e.type === 'round-end') {
        this.showBanner(
          e.won ? 'ROUND WON' : 'ROUND LOST',
          e.reason,
          3800,
        );
      } else if (e.type === 'buy-open') {
        this.showBuy(sim.player.money);
      } else if (e.type === 'buy-close') {
        this.hideBuy();
      } else if (e.type === 'bought') {
        this.el.buyMoney.textContent = `$${e.money}`;
      } else if (e.type === 'explosion') {
        this.addFeed('The charge detonated.', '');
      }
    }
  }
}
