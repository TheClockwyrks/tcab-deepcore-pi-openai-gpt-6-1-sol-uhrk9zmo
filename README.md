# Deepcore

A self-contained browser dig-and-build game. A stranded prospector drills through four strata of a dead mining world, sells weighted cargo, upgrades a suit, and assembles a five-part escape rocket. Fuel never refills by itself: every descent needs a funded return trip. The final Core Sample gives you ninety seconds to get home.

## Run

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. No backend, account, external art service, or network connection is needed by the built game.

## Production

```sh
npm ci
npm run build
npm run preview
```

Serve `dist/` using any static HTTP server. `dist/index.html` is the entry point. Assets resolve relative to the deployed page, including when deployed below a path such as `/games/deepcore/`.

The committed PNGs, particle definitions, WAVs, and MIDI in `assets/` are the finished assets. The build only bundles them; it never runs generation tools. `tools/art.py`, `tools/sound.py`, and `tools/finish-audio.py` document the one-time authoring process and require the asset-generation tools **only if you choose to re-author assets**. Run the sound script before its finishing pass. Drawing operation logs and audio/particle authoring logs are preserved under `tools/`.

## Controls

| Key | Action |
| --- | --- |
| A / D or Left / Right | Walk, drift, and drill sideways against a wall |
| S or Down | Drill down while grounded |
| W / Up / Space | Hold to thrust |
| E / Enter | Enter a surface building, save at the pad, confirm a selection |
| I | Inventory; drop ore, use supplies, or jettison the Sample |
| Escape / P | Close a panel, pause, resume, or go back |
| M | Mute / unmute all sound |
| J | Jettison the unstable Core Sample |
| 1–6 | Dynamite, plastic explosives, Quantum Teleporter, Matter Transmitter, nanobots, emergency fuel |
| Backtick | Engine diagnostic overlay |

Menus use Up / Down and Enter. Panel controls can also be selected with Up / Down and activated with Enter. Every menu, panel, and HUD control accepts mouse, pen, and touch. The miner itself uses the keyboard.

Fuel and hull repair are bought at the Fuel Depot. Sell at the Ore Market, save at the Save Pad, buy upgrades and supplies at their respective shops, and fabricate rocket components at the Launch Pad. The drill never cuts upward. Keep an open route home, watch cargo weight as well as slots, and consider buying a scanner before hunting for the two exotic materials.

## Saves and modes

One local browser save slot is written **only** at the Save Pad. Saving is refused while a Core Sample is live. Standard deaths allow restoration of the last save; Hardcore deaths delete it. A new expedition replaces the slot, and victory consumes it. If browser storage is unavailable, the game still runs but cannot save.

## Development and tests

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Simulation uses a fixed 120 Hz core over the engine-provided delta time. All authoritative state is returned by value; rendering has no simulation side effects. The debug surface is returned through `engine.debug`, not installed on the page. Tests exercise both pure transitions and the real Simple 2D engine over a native canvas and scripted clock, including loaded assets, input, collision, economy, hazards, saves, resizing, and expedition outcomes.

`showcase/` contains real screenshots and a short, 166-frame engine drawing replay. `tools/capture.html` and `tools/capture.ts` stage those captures in development; they are not entry points in the production bundle. The replay includes its captured image data and needs no game installation to reproduce its frames.
