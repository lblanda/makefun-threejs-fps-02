# SANDLINE — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/lblanda/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/lblanda/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

SANDLINE is a round-based tactical first-person shooter in three.js. You are the
last operative of the Sandline crew, holding a desert freight yard against the
Jackal squad: plant the charge at Site A or Site B, or wipe the squad out —
then do it again, richer, with a better gun.

- First-person view with mouse look, WASD movement with acceleration, crouch,
  and collision against the yard's walls, crates and containers.
- Three buyable weapons (VK-47 rifle, Hornet-9 SMG, P9 pistol) plus a spark
  grenade, with recoil, spread that punishes firing on the move, headshot
  damage and a reload that leaves you dry if you waste it.
- Bomb plant / defuse objective, money earned every round, and a buy menu
  between rounds.
- Four enemy bots that patrol routes, hold angles, investigate noise, and
  react when they see you — plus two friendly bots on your side.
- An original map: a desert freight yard at dusk, with two bomb sites, a mid
  lane, long sightlines and tight corners.
- A fixed-step simulation kept apart from rendering, in small modules with
  one job each.

## Run it

```sh
node main.ts
```

Serve the game locally with `node serve.ts`, then open
http://localhost:8080 in desktop Chrome. Click to play.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Click | Fire |
| R | Reload |
| 1 / 2 / 3 | Switch weapon |
| G | Throw grenade |
| Ctrl | Crouch |
| E | Plant / defuse the charge (hold, near a site) |
| B | Buy menu (between rounds) |
| Esc | Release mouse |

---

<sub>Entered on [make.fun](https://make.fun/?ref=3zwarjv0&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
