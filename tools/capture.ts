// Offline showcase staging. This is not an entry point of the distributed game.
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "../src/game";
import * as C from "../src/constants";
import { start } from "../src/rules";
export const engine = createEngine({
  canvas: document.querySelector("#capture") as HTMLCanvasElement,
  width: C.STAGE_W,
  height: C.STAGE_H,
  game,
  background: BACKGROUND,
  assetRoot: "../assets/",
  clock: new ConstantClock(1000 / 30),
});
await engine.initialize();
function removeNode(material: C.MaterialId) {
  for (let r = 1; r < engine.state.coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      if (engine.state.grid[r][c].material === material)
        engine.apply((s) => engine.debug.setTile(s, c, r, "rock"));
}
export async function surface() {
  engine.apply((s) => start(engine.debug.setWorldSize(s, "quick")));
  await engine.advance(1);
}
export async function rockbed() {
  const d = engine.debug;
  engine.apply((s) => start(d.setWorldSize(s, "quick")));
  for (const track of C.TRACKS)
    engine.apply((s) => d.setTier(s, track, track === "scanner" ? 3 : 3));
  engine.apply((s) => d.setFuel(s, C.FUEL_TIERS[2]));
  engine.apply((s) => d.setHull(s, C.HULL_TIERS[2]));
  engine.apply((s) => d.setCredits(s, 1860));
  // A route already excavated on an earlier haul, with a fresh ore face at its foot.
  for (let r = 68; r <= 83; r++)
    engine.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 13; c <= 20; c++)
    engine.apply((s) => d.setTile(s, c, 76, "tunnel"));
  for (let c = 14; c <= 21; c++)
    engine.apply((s) => d.setTile(s, c, 80, "tunnel"));
  for (let c = 17; c <= 22; c++)
    engine.apply((s) => d.setTile(s, c, 84, "rock"));
  for (let c = 17; c <= 19; c++)
    engine.apply((s) => d.setOreTile(s, c, 83, "argenite"));
  for (let c = 19; c <= 21; c++)
    engine.apply((s) => d.setOreTile(s, c, 85, "cobaltine"));
  removeNode("resonite");
  engine.apply((s) => d.setMaterialTile(s, 22, 81, "resonite"));
  engine.apply((s) => d.setOreTile(s, 12, 78, "verdite"));
  engine.apply((s) => d.setTile(s, 21, 79, "gas"));
  engine.apply((s) =>
    d.setMinerPosition(s, 16 * C.TILE + 12, 84 * C.TILE - C.MINER_H),
  );
  engine.apply((s) => d.setMinerVelocity(s, 0, 0));
  engine.apply((s) => d.setCargo(s, "cuprite", 9));
  engine.apply((s) => d.setCargo(s, "argenite", 4));
  await engine.advance(1);
}
export async function deepstone() {
  await rockbed();
  const d = engine.debug;
  for (let r = 151; r <= 166; r++)
    engine.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 13; c <= 21; c++)
    engine.apply((s) => d.setTile(s, c, 163, "tunnel"));
  for (let c = 17; c <= 22; c++)
    engine.apply((s) => d.setTile(s, c, 164, "lava"));
  for (let c = 18; c <= 20; c++)
    engine.apply((s) => d.setTile(s, c, 165, "lava"));
  removeNode("cryenite");
  engine.apply((s) => d.setMaterialTile(s, 23, 163, "cryenite"));
  engine.apply((s) => d.setOreTile(s, 14, 160, "roselite"));
  engine.apply((s) => d.setOreTile(s, 12, 162, "voltite"));
  engine.apply((s) =>
    d.setMinerPosition(s, 16 * C.TILE + 12, 164 * C.TILE - C.MINER_H),
  );
  engine.apply((s) => d.setMinerVelocity(s, 0, 0));
  await engine.advance(1);
}
export async function launch() {
  await surface();
  const d = engine.debug;
  engine.apply((s) => d.setMinerPosition(s, 1950, 8));
  engine.apply((s) => d.setRocketInstalled(s, 5));
  engine.apply((s) => d.launch(s));
  await engine.advance(30);
}
export function key(code: string, down: boolean) {
  document.dispatchEvent(
    new KeyboardEvent(down ? "keydown" : "keyup", { code }),
  );
}
export async function record() {
  await rockbed();
  engine.startRecording();
  key("KeyD", true);
  await engine.advance(75);
  key("KeyD", false);
  key("KeyA", true);
  for (let i = 0; i < 120 && engine.state.miner.x > 16 * C.TILE + 12; i++)
    await engine.advance(1);
  key("KeyA", false);
  key("Space", true);
  await engine.advance(45);
  key("Space", false);
  await engine.advance(15);
  return engine.stopRecording();
}
