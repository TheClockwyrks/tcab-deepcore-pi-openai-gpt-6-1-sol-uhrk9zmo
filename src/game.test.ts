/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreState, type DeepcoreDebugApi } from "./game";
import {
  initial,
  generate,
  bandAt,
  tile,
  copy,
  cell,
  put,
  grounded,
  loadKg,
} from "./model";
import { advance, transact, camera, simulate, start } from "./rules";
import { debug } from "./debug";
import * as C from "./constants";
import { menu, choose, back, controls } from "./interface";
const engines: Engine<DeepcoreState, DeepcoreDebugApi>[] = [];
const memory = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  });
  vi.stubGlobal("fetch", async (url: string) => {
    const path = url.replace(/^\//, "").split("?")[0];
    const bytes = await readFile(path);
    return new Response(bytes);
  });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({ duration: 1 });
      }
      resume() {
        return Promise.resolve();
      }
    },
  );
});
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
  memory.clear();
});
async function harness(step = 1000 / 60) {
  const events = new EventTarget();
  const e = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(e);
  await e.initialize();
  const key = (code: string, down = true) =>
    events.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const tap = async (code: string) => {
    key(code);
    await e.advance(1);
    key(code, false);
  };
  return { e, key, tap, events };
}
const still = { left: 0, right: 0, down: 0, up: 0 };
function scene() {
  let s = debug.setScreen(initial(), "in-mine");
  s = debug.setWorldSize(s, "quick");
  s = debug.clearMine(s);
  s = debug.setMinerPosition(s, 4 * C.TILE + 12, 8 * C.TILE - C.MINER_H);
  s = debug.setTile(s, 4, 8, "rock");
  s = debug.setTile(s, 4, 9, "rock");
  return s;
}
describe("engine integration", () => {
  it("loads every authored asset, registers diagnostics, navigates the expedition menus", async () => {
    const { e, tap } = await harness();
    expect(Object.keys(e.state.images).length).toBeGreaterThan(80);
    expect(Object.keys(e.state.systems)).toHaveLength(12);
    expect(e.debug.snapshot(e.state).screen).toBe("title");
    await tap("Enter");
    expect(e.state.screen).toBe("mode-select");
    await tap("ArrowDown");
    await tap("Enter");
    expect(e.state.mode).toBe("hardcore");
    await tap("Enter");
    expect(e.state.worldSize).toBe("quick");
    expect(e.state.screen).toBe("in-mine");
    expect(e.diagnostics().every((d) => d.error === undefined)).toBe(true);
    await tap("KeyP");
    const elapsed = e.state.elapsedSeconds;
    await e.advance(12);
    expect(e.state.elapsedSeconds).toBe(elapsed);
    await tap("Escape");
    expect(e.state.screen).toBe("in-mine");
    await tap("KeyM");
    expect(e.state.muted).toBe(true);
  });
  it("runs held drill actions through the actual engine and leaves old states untouched", async () => {
    const { e, key } = await harness();
    e.apply((s) => ({
      ...scene(),
      images: s.images as DeepcoreState["images"],
      systems: s.systems as DeepcoreState["systems"],
    }));
    const old = e.state;
    key("KeyS");
    await e.advance(30);
    key("KeyS", false);
    expect(e.debug.tileAt(e.state, 4, 8).kind).toBe("tunnel");
    expect(e.debug.tileAt(old, 4, 8).health).toBe(C.BAND_HEALTH.topsoil);
    expect(e.state.miner.y).toBeCloseTo(9 * C.TILE - C.MINER_H, 3);
    expect(e.state.miner.fuel).toBeLessThan(100);
  });
  it("accepts matching pointer edges, rejects mismatches and exposes exact hit regions", async () => {
    const { e, events } = await harness();
    const send = (type: string, x: number, y: number) =>
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    const r = e.debug.menuItemRect(e.state, 1)!;
    send("pointerdown", r.x + 5, r.y + 5);
    send("pointerup", r.x + 5, r.y + 5);
    await e.advance(1);
    expect(e.state.screen).toBe("how-to-play");
    const b = e.debug.menuItemRect(e.state, 0)!;
    send("pointerdown", 10, 10);
    send("pointerup", b.x + 5, b.y + 5);
    await e.advance(1);
    expect(e.state.screen).toBe("how-to-play");
    send("pointerdown", b.x + 5, b.y + 5);
    send("pointerup", b.x + 5, b.y + 5);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
  });
  it("checks death continuously before an open panel can repair a destroyed hull", async () => {
    const { e, tap } = await harness();
    e.apply((s) => debug.setScreen(s, "in-mine"));
    e.apply((s) => debug.setPanel(s, "fuel-depot"));
    e.apply((s) => debug.setCredits(s, 1000));
    e.apply((s) => debug.setHull(s, 0));
    await tap("Enter");
    expect(e.state.screen).toBe("game-over");
    expect(e.state.summary?.deathCause).toBe("hull-destroyed");
  });
});
describe("rendering and panel input", () => {
  it("renders every populated panel over the engine canvas and selects enabled keyboard controls", async () => {
    const { e, tap } = await harness();
    e.apply((s) => debug.setScreen(s, "in-mine"));
    e.apply((s) => debug.setCredits(s, 50000));
    e.apply((s) => debug.setFuel(s, 20));
    e.apply((s) => debug.setHull(s, 20));
    for (const o of C.MINERALS) e.apply((s) => debug.setCargo(s, o.id, 1));
    for (const id of C.ITEM_IDS) e.apply((s) => debug.setItemCount(s, id, 1));
    e.apply((s) => debug.setMaterial(s, "resonite", 1));
    e.apply((s) => debug.setMaterial(s, "cryenite", 1));
    e.apply((s) => debug.setCoreCarried(s, true));
    for (const panel of C.PANELS) {
      e.apply((s) => debug.setPanel(s, panel));
      await e.advance(1);
      expect(e.debug.controlRect(e.state, "pause", null)).not.toBeNull();
    }
    e.apply((s) => debug.setPanel(s, "upgrade-shop"));
    await tap("ArrowDown");
    await tap("Enter");
    expect(e.state.tiers.drill).toBe(2);
    await tap("Escape");
    expect(e.state.panel).toBeNull();
    await tap("KeyI");
    expect(e.state.panel).toBe("inventory");
    await tap("Digit5");
    expect(e.state.items.nanobots).toBe(0);
    expect(e.state.miner.hull).toBe(40);
    await tap("KeyJ");
    expect(e.state.coreGround).not.toBeNull();
    e.apply((s) => debug.setCoreTimer(s, 0.01));
    await e.advance(2);
    expect(e.state.screen).toBe("game-over");
  });
});
describe("world generation and poses", () => {
  for (const size of C.WORLD_SIZES)
    it(`builds the ${size} world with all bands, materials and a protected route`, () => {
      const rows = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
        grid = generate(rows);
      expect(grid).toHaveLength(rows + 1);
      expect(grid[rows][C.CORE_COL].kind).toBe("core");
      for (const material of C.MATERIALS) {
        const matches = grid.flat().filter((t) => t.material === material);
        expect(matches).toHaveLength(1);
        expect(matches[0].band).toBe(C.MATERIAL_BAND[material]);
      }
      for (let r = 1; r < rows; r++) {
        expect(["lava", "stone"]).not.toContain(grid[r][C.CAVE_MOUTH_COL].kind);
        expect(grid[r][0].kind).toBe("bedrock");
      }
      expect(grid[1][C.CAVE_MOUTH_COL].kind).toBe("tunnel");
      for (const band of C.BANDS) {
        const cells = grid
          .flat()
          .filter((t) => t.band === band && t.kind !== "bedrock");
        const share =
          cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(share).toBeGreaterThan(
          C.ORE_DENSITY * (1 - C.DENSITY_TOLERANCE),
        );
        expect(share).toBeLessThan(C.ORE_DENSITY * (1 + C.DENSITY_TOLERANCE));
      }
      expect(grid[3].some((t) => t.ore)).toBe(false);
    });
  it("preserves cell bands and damage when resizing, opens the old chamber, and validates poses", () => {
    let s = scene();
    s = debug.setOreTile(s, 8, 100, "cuprite");
    s = debug.setTileHealth(s, 8, 100, 2);
    const before = debug.tileAt(s, 8, 100);
    s = debug.setWorldSize(s, "marathon");
    expect(debug.tileAt(s, 8, 100)).toEqual(before);
    expect(debug.tileAt(s, C.CORE_COL, 250).kind).toBe("tunnel");
    expect(debug.tileAt(s, C.CORE_COL, 1000).kind).toBe("core");
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 8, 900).kind).toBe("bedrock");
    expect(() => debug.setTier(s, "scanner", 4)).toThrow();
    expect(() => debug.setTile(s, -1, 3, "rock")).toThrow();
    expect(() => debug.setTileHealth(s, 1, 1, 3)).toThrow();
    expect(debug.reconcile(s)).toEqual(s);
    expect(bandAt(249, 250)).toBe("coreshell");
  });
  it("resets every session value but not mute preference or the save slot", () => {
    let s = scene();
    s.muted = true;
    transact(s, "save");
    s = debug.setCredits(s, 700);
    s = debug.setCoreCarried(s, true);
    s = debug.reset(s);
    const q = debug.snapshot(s);
    expect(q.screen).toBe("title");
    expect(q.muted).toBe(true);
    expect(q.hasSave).toBe(true);
    expect(q.credits).toBe(0);
    expect(q.coreTimer).toBeNull();
    expect(q.miner.travel).toBe(true);
    expect(q.camera.lead).toBe(0);
  });
});
describe("simulation", () => {
  it("persists partial cuts, sinks smoothly, and spends exactly one charge per hit", () => {
    let s = scene();
    const original = s;
    s = advance(s, { ...still, down: 1 }, 0.25);
    expect(tile(s, 4, 8).health).toBe(2);
    expect(tile(original, 4, 8).health).toBe(4);
    expect(s.miner.y).toBeCloseTo(8.5 * C.TILE - C.MINER_H, 2);
    expect(grounded(s)).toBe(true);
    expect(s.miner.fuel).toBeCloseTo(
      100 - 2 * C.DRILL_HIT_FUEL - 0.25 * C.LIFE_SUPPORT_BURN,
      3,
    );
    s = advance(s, { ...still, down: 1 }, 0.25);
    expect(tile(s, 4, 8).kind).toBe("tunnel");
  });
  it("integrates uneven frame partitions through the same fixed timestep", () => {
    const a = scene(),
      b = scene();
    a.miner.travel = false;
    b.miner.travel = false;
    let A = a,
      B = b;
    for (let i = 0; i < 60; i++) A = advance(A, { ...still, down: 1 }, 1 / 60);
    for (const t of [0.07, 0.13, 0.2, 0.11, 0.09, 0.4])
      B = advance(B, { ...still, down: 1 }, t);
    expect(B.miner.fuel).toBeCloseTo(A.miner.fuel, 8);
    expect(tile(B, 4, 8)).toEqual(tile(A, 4, 8));
    expect(B.elapsedSeconds).toBeCloseTo(A.elapsedSeconds, 8);
    expect(B.miner.y).toBe(A.miner.y);
  });
  it("respects independent drill/travel faculties", () => {
    let s = scene();
    s = debug.setMinerTravel(s, false);
    s = debug.setMinerVelocity(s, 20, 40);
    const y = s.miner.y;
    s = advance(s, { ...still, down: 1, up: 0 }, 0.5);
    expect(s.miner.y).toBe(y);
    expect(s.miner.vy).toBe(40);
    expect(tile(s, 4, 8).kind).toBe("tunnel");
    s = debug.setTile(s, 4, 8, "rock");
    s = debug.setMinerDrill(s, false);
    s = advance(s, { ...still, down: 1 }, 1);
    expect(tile(s, 4, 8).health).toBe(4);
  });
  it("banks ore only when space is free and exotic material without slots", () => {
    let s = scene();
    s = debug.setOreTile(s, 4, 8, "ferron");
    s = debug.setMinerTravel(s, false);
    s = advance(s, { ...still, down: 1 }, 0.5);
    expect(s.cargo.ferron).toBe(1);
    s = debug.setCargo(s, "adamite", C.CARGO_TIERS[0]);
    s = debug.setOreTile(s, 4, 8, "roselite");
    s = advance(s, { ...still, down: 1 }, 0.5);
    expect(s.cargo.roselite).toBeUndefined();
    s = debug.setMaterialTile(s, 4, 8, "resonite");
    s = advance(s, { ...still, down: 1 }, 0.5);
    expect(s.satchel.resonite).toBe(1);
  });
  it("does not cut unbreakable stone or start a cut in the air", () => {
    let s = scene();
    s = debug.setTile(s, 4, 8, "stone");
    s = advance(s, { ...still, down: 1 }, 1);
    expect(s.miner.drilling).toBeNull();
    expect(tile(s, 4, 8).kind).toBe("stone");
    s = debug.setMinerPosition(s, s.miner.x, 5 * C.TILE);
    s = debug.setMinerTravel(s, false);
    s = debug.setTile(s, 5, 5, "rock");
    s = advance(s, { ...still, right: 1 }, 1);
    expect(tile(s, 5, 5).health).toBe(4);
  });
  it("scales thrust by cargo weight and retains the overload wall", () => {
    let s = scene();
    s = debug.clearMine(s);
    s = debug.setMinerPosition(s, 400, 400);
    const empty = advance(s, { ...still, up: 1 }, 0.25);
    s = debug.setCargo(s, "adamite", 5);
    expect(loadKg(s)).toBeGreaterThan(C.JETPACK_TIERS[0].liftLimitKg);
    const loaded = advance(s, { ...still, up: 1 }, 0.25);
    expect(empty.miner.vy).toBeLessThan(0);
    expect(loaded.miner.vy).toBe(0);
    expect(debug.snapshot(loaded).miner.overloaded).toBe(true);
    const after = debug.dropOre(debug.dropOre(loaded, "adamite"), "adamite");
    expect(debug.snapshot(after).miner.overloaded).toBe(false);
  });
  it("charges hard landings and radiator-reduced lava, with delayed first-hit notices", () => {
    let s = scene();
    s.miner.y = 8 * C.TILE - C.MINER_H - 3;
    s.miner.vy = 950;
    simulate(s, still, 1 / 120);
    expect(s.miner.hull).toBeLessThan(100);
    expect(s.fx.some((f) => f.name === "impact-dust")).toBe(true);
    s = scene();
    s = debug.setTile(s, 4, 8, "lava");
    s = debug.setTier(s, "radiator", 5);
    s = debug.setMinerTravel(s, false);
    s = advance(s, still, 1);
    expect(s.miner.hull).toBeCloseTo(
      100 - C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[4]),
      3,
    );
    expect(s.notice?.shown).toBe(false);
    s = advance(s, still, 1);
    expect(s.notice?.shown).toBe(true);
    s = debug.dismissNotice(s);
    expect(s.notice).toBeNull();
  });
  it("detonates gas at full force, without radiator protection", () => {
    let s = scene();
    s = debug.setTile(s, 4, 8, "gas");
    s = debug.setMinerTravel(s, false);
    s = debug.setTier(s, "radiator", 5);
    s = advance(s, { ...still, down: 1 }, 0.5);
    expect(s.miner.hull).toBeCloseTo(40, 2);
    expect(s.noticesFired.gas).toBe(true);
    expect(s.shake).toBeGreaterThan(0);
  });
  it("extracts an inexhaustible Core, ticks in panels, and locates ground detonations", () => {
    let s = scene();
    s = debug.setTile(s, 4, 8, "core");
    s = debug.setMinerTravel(s, false);
    s = advance(s, { ...still, down: 1 }, C.DRILL_HIT_INTERVAL);
    expect(s.satchel.coreSample).toBe(true);
    expect(tile(s, 4, 8).kind).toBe("core");
    s = debug.setPanel(s, "inventory");
    s = debug.setCoreTimer(s, 0.1);
    s = advance(s, still, 0.2);
    expect(s.screen).toBe("game-over");
    expect(s.summary?.deathCause).toBe("core-detonation");
    s = scene();
    s = debug.setTile(s, 10, 10, "tunnel");
    s = debug.placeCoreSample(s, 10, 10);
    s = debug.setCoreTimer(s, 0.01);
    s = advance(s, still, 0.05);
    expect(s.screen).toBe("in-mine");
    expect(s.coreTimer).toBeNull();
  });
  it("ramps and unwinds camera lead by time rather than speed", () => {
    const s = scene();
    s.miner.vy = 100;
    camera(s, 1);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX / 2);
    camera(s, 1);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX);
    s.miner.vy = 0;
    camera(s, 0.25);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX / 2);
  });
  it("locks the scanner only to a nearby needed material", () => {
    let s = scene();
    s = debug.setMaterialTile(s, 8, 10, "resonite");
    s = debug.setTier(s, "scanner", 2);
    expect(debug.snapshot(s).scanner.target).toBe("resonite");
    s = debug.setMaterial(s, "resonite", 1);
    expect(debug.snapshot(s).scanner.locked).toBe(false);
  });
});
describe("economy, supplies and expedition outcomes", () => {
  it("sells, buys tiers in order and adds only newly gained capacity", () => {
    let s = scene();
    s = debug.setCargo(s, "ferron", 15);
    s = debug.sell(s);
    expect(s.credits).toBe(15 * 28);
    expect(s.creditsEarned).toBe(420);
    expect(s.cargo).toEqual({});
    s = debug.setFuel(s, 30);
    s = debug.buyUpgrade(s, "fuel");
    expect(s.tiers.fuel).toBe(2);
    expect(s.miner.fuel).toBe(105);
    expect(s.credits).toBe(120);
    s = debug.buyUpgrade(s, "fuel");
    expect(s.tiers.fuel).toBe(2);
    s = debug.fillFuel(s);
    expect(s.miner.fuel).toBe(175);
    expect(s.credits).toBe(50);
  });
  it("buys and uses all supply types, preserving immune material cells", () => {
    let s = scene();
    s = debug.setCredits(s, 50000);
    for (const id of C.ITEM_IDS) {
      s = debug.buyItem(s, id);
      expect(s.items[id]).toBe(1);
    }
    s = debug.setTile(s, 3, 7, "stone");
    s = debug.setMaterialTile(s, 5, 7, "resonite");
    s = debug.useItem(s, "dynamite");
    expect(tile(s, 3, 7).kind).toBe("tunnel");
    expect(tile(s, 5, 7).kind).toBe("material");
    s = debug.useItem(s, "plastic-explosives");
    expect(s.items["plastic-explosives"]).toBe(0);
    s = debug.useItem(s, "nanobots");
    expect(s.items.nanobots).toBe(1);
    s = debug.setHull(s, 50);
    s = debug.useItem(s, "nanobots");
    expect(s.miner.hull).toBe(70);
    s = debug.setFuel(s, 50);
    s = debug.useItem(s, "emergency-fuel");
    expect(s.miner.fuel).toBe(80);
    s = debug.setNextTeleportHeight(s, 8);
    s = debug.setNextTeleportSpeed(s, 700);
    s = debug.useItem(s, "quantum-teleporter");
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(s.miner.vy).toBe(700);
    expect(s.nextTeleportSpeed).toBeNull();
    s = debug.useItem(s, "matter-transmitter");
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y);
    expect(s.miner.vy).toBe(0);
  });
  it("fabricates the five ordered components, consumes the timed sample and launches", () => {
    let s = scene();
    s = debug.setCredits(s, C.ROCKET_TOTAL_CREDITS);
    s = debug.setMaterial(s, "resonite", 1);
    s = debug.setMaterial(s, "cryenite", 1);
    for (let i = 0; i < 4; i++) s = debug.fabricate(s);
    expect(s.installed).toBe(4);
    s = debug.fabricate(s);
    expect(s.installed).toBe(4);
    s = debug.setCoreCarried(s, true);
    s = debug.fabricate(s);
    expect(s.coreTimer).toBeNull();
    expect(s.credits).toBe(0);
    s = debug.launch(s);
    expect(s.screen).toBe("victory");
    expect(debug.snapshot(s).rocket.nextComponent).toBeNull();
    expect(s.summary?.componentsInstalled).toBe(5);
  });
  it("saves the mine and holdings, refuses a live sample, and deletes saves on Hardcore death", () => {
    let s = scene();
    s = debug.setCredits(s, 123);
    s = debug.setOreTile(s, 8, 12, "cuprite");
    s = debug.save(s);
    expect(s.hasSave).toBe(true);
    s = debug.setCoreCarried(s, true);
    s = debug.save(s);
    expect(s.note).toContain("Cannot save");
    s = debug.setCoreCarried(s, false);
    s = debug.setMode(s, "hardcore");
    s = debug.setHull(s, 0);
    s = advance(s, still, 0.1);
    expect(s.hasSave).toBe(false);
    expect(memory.size).toBe(0);
  });
  it("keeps Standard saves and restores from the title without a running sample", () => {
    let s = scene();
    s = debug.setCredits(s, 500);
    s = debug.setCargo(s, "marlite", 5);
    s = debug.save(s);
    s = debug.setFuel(s, 0);
    s = advance(s, still, 0.1);
    expect(s.screen).toBe("game-over");
    expect(menu(s)[0]).toBe("CONTINUE FROM SAVE");
    s = choose(s);
    expect(s.screen).toBe("in-mine");
    expect(s.credits).toBe(500);
    expect(s.cargo.marlite).toBe(5);
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y);
  });
  it("supports back navigation, complete controls and fresh replay choices", () => {
    let s = scene();
    s.screen = "paused";
    s.menuIndex = 1;
    s = choose(s);
    expect(s.screen).toBe("in-mine");
    expect(s.credits).toBe(0);
    s = back(s);
    expect(s.screen).toBe("paused");
    s = back(s);
    expect(s.screen).toBe("in-mine");
    for (const p of C.PANELS) {
      s = debug.setPanel(s, p);
      expect(controls(s).length).toBeGreaterThanOrEqual(3);
      expect(debug.controlRect(s, "inventory", null)).not.toBeNull();
    }
    s = start(s);
    expect(s.hasSave).toBe(false);
    const t = copy(s);
    put(t, 4, 4, cell("gas", "rockbed"));
    expect(tile(s, 4, 4)).not.toEqual(tile(t, 4, 4));
  });
});
