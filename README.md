# Meteor Miner

Galaga-style arcade game, mobile first. Run along the bottom of the screen, dodge falling
meteors, collect the rocks they break into, sell them, and buy a blaster, towers and upgrades.
Each stage the map gets wider and the meteors get bigger and tougher.

Plain HTML + canvas + JavaScript modules. No build step, no dependencies, no art files
(everything is drawn in code, sounds are synthesized).

## Play it

Live at **https://dmatthiesen86.github.io/meteor-miner/** (PC or phone, portrait on phones).

Works offline after the first visit. On a phone, use the browser's **Add to Home Screen**
and launch it from the icon once while online; after that it runs with no internet.

**Publishing changes**: bump `CACHE` in `sw.js`, commit and push to `main`. Devices pick up
the new version the next time the game is opened with internet (it applies on the launch after).

## Run it locally

```bash
cd MeteorMiner
python -m http.server 5174
```

- **PC**: open http://localhost:5174
- **Phone**: put it on the same Wi-Fi as the PC and open `http://<PC's IP address>:5174`
  (find the IP with `ipconfig`; allow Python through Windows Firewall if asked).
  Play in portrait.

## Controls

| | Touch | Desktop |
|---|---|---|
| Run | drag in the strip below the ground | A / D or arrow keys |
| Aim | touch the sky (aim stays where you left it) | mouse |
| Place / re-aim tower | tower button | T, E or Space |
| Pause / mute | buttons top right | P or Esc / M |

The blaster and towers fire on their own whenever meteors are in the sky.

## Rules

- A meteor that lands explodes. Red marks on the ground show where and how wide.
- Landed meteors leave rocks. Meteors shot apart in the air pay out 50% more, and big
  ones split in two first.
- Rocks vanish after ~16 s, so go get them. Anything still on the ground when the stage
  ends is swept up for you.
- A shield soaks up one hit per level before you lose hearts, and recharges every stage.
- Towers take 3 blasts (more with tower armor). A destroyed tower is gone; surviving towers come back next stage.
- Dying loses the rocks from that stage only. Cash, gear and towers are kept.
- Progress saves in the browser (per device).

## Where things are

| File | What |
|---|---|
| `js/config.js` | **All tuning**: ore values, stage scaling, shop prices |
| `js/game.js` | Simulation: player, meteors, rocks, bullets, towers, stage flow |
| `js/render.js` | Canvas drawing |
| `js/input.js` | Touch, mouse and keyboard |
| `js/ui.js` | HUD, menu, shop, pause and game-over panels |
| `js/audio.js` | Sound effects |
| `js/state.js` | Shared state and the save file |

For quick tuning, open the browser console: `G.profile.money = 5000`, `G.profile.stage = 8`.
