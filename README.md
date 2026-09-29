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
| Jump | tap anywhere on the bottom strip (other thumb while running) | Space, W or up arrow |
| Place / re-aim tower | tower button | T or E |
| Use a supply | round buttons bottom left | 1 (nuke), 2 (time slow), 3 (shield cell) |
| Pause / mute | buttons top right | P or Esc / M |

The blaster and towers fire on their own whenever meteors are in the sky.

## Rules

- A meteor that lands explodes. Red marks on the ground show where and how wide.
- Landed meteors leave rocks. Meteors shot apart in the air pay out 50% more, and big
  ones split in two first.
- Rocks vanish after ~16 s, so go get them. Anything still on the ground when the stage
  ends is swept up for you.
- A shield soaks up one hit per level before you lose hearts, and recharges every stage.
- Towers take 3 blasts (more with tower armor). A tower shield soaks up blasts first and
  refills 12 s after the last hit. A destroyed tower is gone; surviving towers come back next stage.
- **Special meteors** arrive on a schedule: cluster (stage 3), golden (6, rare jackpot), ice (8),
  fire (13), armored (18), seeker (23). The trading post warns you before each first appears.
- **Richer ore** appears deeper in: emerald (stage 12), ruby (20), diamond (30), star core (45).
- **Endless upgrades**: blaster damage, tower damage, tower armor and armor never max out.
- **Expeditions**: from stage 15 you can restart at stage 1 for star shards, which buy
  permanent perks. Shards and perks survive "New game" too.
- **Boulders** appear from stage 3 (one more every two stages). They block the way; one jump
  clears any of them. Towers can't be planted on a boulder.
- **Blaster auto-targeting** (from stage 6) aims the blaster for you. Touching the sky, or
  holding the mouse button, takes manual control while held.
- Tower insurance replaces destroyed towers for free at the end of the stage, one per level.
- With tower repair, damaged towers mend 1 health every few seconds (the timer restarts when hit).
- **Bosses** arrive on every 10th stage, taking turns: the Mothership (fires spreads, drops
  meteors, escapes 45 s after the shower) and the Titan meteor (falls slowly; costs 2 hearts if
  it lands). Beating one and clearing the stage pays 1 star shard.
- **Supplies**: nuke, time slow and shield cell are one-use items bought at the trading post
  (carry up to 3 of each). Used items are gone even if you die.
- **Event stages** turn up at random: meteor storm (short, dense, double rocks), gold rush
  (richest ore only) and bonus round (harmless meteors). The trading post announces them.
- **Missions**: three are always active, progress counts when a stage is cleared, and each
  pays cash.
- **Bonus picks**: after every 5th stage choose 1 of 3 bonuses. They stack and last until the
  next expedition or new game.
- **Planets** change every 10 stages, then repeat: Luna, Glacia (slippery), Cinder (faster
  meteors, longer fires), Aether (low gravity), Dune (wind).
- **UFOs** arrive on stages 5, 15, 25... (one on stage 5, two on 15, and so on up to six). They hover over
  you and fire at you and your towers. Shoot them down for crystals and gold; if you can't,
  they leave 15 s after the shower ends.
- **Auto-targeting** (from stage 6) makes towers track and lead the nearest threat.
  **Blaster rockets** (from stage 6) and tower **rocket launchers** (from stage 8) add
  exploding rockets, and
  **Homing rockets** make them steer onto the nearest target.
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
