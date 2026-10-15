import * as C from "./constants";
import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
export interface Cell {
  /** Open depth at a downward drill face, including the in-flight hit. */
  excavated?: number;
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export const mineralColors: Record<C.OreId, string> = Object.fromEntries(
  [...C.ORE_IDS, ...C.GEMSTONE_IDS].map((id, i) => [
    id,
    [
      "#ba8d6f",
      "#cec3a0",
      "#dd8a58",
      "#b8d9de",
      "#649ce8",
      "#d2dd61",
      "#a3d5c0",
      "#ff9d55",
      "#ed6361",
      "#b8a3f2",
      "#5bf4aa",
      "#f782c2",
      "#ffe694",
    ][i],
  ]),
) as Record<C.OreId, string>;
export const bandColors: Record<C.BandName, string> = {
  topsoil: "#b19173",
  rockbed: "#a0b2b7",
  deepstone: "#8992b8",
  coreshell: "#ce797a",
};
export interface Fx {
  tint?: string;
  id: number;
  name: string;
  x: number;
  y: number;
  age: number;
}
export interface State {
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  panelIndex: number;
  launchAge: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: null | {
      col: number;
      row: number;
      dir: "down" | "left" | "right";
    };
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  notice: null | { hazard: C.NoticeHazard; shown: boolean; age: number };
  noticesFired: Record<C.NoticeHazard, boolean>;
  summary: null | {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  };
  grid: Cell[][];
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
  fx: Fx[];
  serial: number;
  shake: number;
  hurt: number;
  hitClock: number;
  animTime: number;
  accumulator: number;
  note: string;
  noteTime: number;
  presses: Record<number, string>;
}
export type ReadState = DeepReadonly<State>;
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export function bandAt(row: number, coreRow: number): C.BandName {
  return C.BANDS[Math.min(3, Math.floor((4 * (row - 1)) / (coreRow - 1)))];
}
export function cell(
  kind: C.TileKind,
  band: C.BandName | null,
  ore: C.OreId | null = null,
  material: C.MaterialId | null = null,
): Cell {
  const h =
    band && ["rock", "ore", "material", "gas", "lava"].includes(kind)
      ? C.BAND_HEALTH[band]
      : null;
  return { kind, band, ore, material, health: h, maxHealth: h };
}
export function emptyGrid(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, r) =>
    Array.from({ length: C.WORLD_COLS }, (_, c) =>
      cell(
        r === 0
          ? "tunnel"
          : r === coreRow
            ? c === C.CORE_COL
              ? "core"
              : "bedrock"
            : c === 0 || c === C.WORLD_COLS - 1
              ? "bedrock"
              : "tunnel",
        r > 0 && r < coreRow ? bandAt(r, coreRow) : null,
      ),
    ),
  );
}
export function tile(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  return (
    s.grid[row]?.[col] ??
    cell(row < 1 && col >= 0 && col < C.WORLD_COLS ? "tunnel" : "bedrock", null)
  );
}
export function put(s: State, col: number, row: number, t: Cell): void {
  s.grid[row] = s.grid[row].slice();
  s.grid[row][col] = t;
}
export function generate(coreRow: number): Cell[][] {
  const grid = emptyGrid(coreRow);
  for (let r = 1; r < coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++) {
      const f = (r - 1) / (coreRow - 1),
        band = bandAt(r, coreRow);
      let kind: C.TileKind = "rock";
      const v = Math.random();
      if (r >= C.ORE_MIN_ROW && v < C.ORE_DENSITY) kind = "ore";
      else if (
        f >= 0.25 &&
        v <
          C.ORE_DENSITY +
            C.STONE_DENSITY_MIN +
            ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (f - 0.25)) / 0.75
      )
        kind = "stone";
      else if (
        f >= 0.25 &&
        Math.random() <
          C.GAS_DENSITY_MIN +
            ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (f - 0.25)) / 0.75
      )
        kind = "gas";
      // Lava is allocated below, as connected pools instead of isolated specks.
      let ore: C.OreId | null = null;
      if (kind === "ore") {
        const weights = C.MINERALS.map(
          (o) => o.pick * Math.max(0, 1 - Math.abs(f - o.peak) / o.spread),
        );
        let draw = Math.random() * weights.reduce((a, b) => a + b, 0);
        let i = 0;
        while (i < weights.length - 1 && (draw -= weights[i]) > 0) i++;
        ore = C.MINERALS[i].id;
      }
      // A protected diggable spine and crosscuts guarantee routes to the prizes.
      if (c === C.CAVE_MOUTH_COL && ["stone", "lava"].includes(kind))
        kind = "rock";
      grid[r][c] = cell(kind, band, kind === "ore" ? ore : null);
    }
  // Quotas bound rare hazards even in a Quick world's small strata.
  // Random placement remains fresh, but no unlucky seed silently doubles the danger.
  for (const band of C.BANDS.slice(1)) {
    const cells: { c: number; r: number }[] = [];
    for (let r = 1; r < coreRow; r++)
      if (bandAt(r, coreRow) === band)
        for (let c = 1; c < C.WORLD_COLS - 1; c++) cells.push({ c, r });
    for (const kind of ["stone", "gas"] as const) {
      const min = kind === "stone" ? C.STONE_DENSITY_MIN : C.GAS_DENSITY_MIN,
        max = kind === "stone" ? C.STONE_DENSITY_MAX : C.GAS_DENSITY_MAX;
      const target = Math.round(
        cells.reduce(
          (n, p) =>
            n + min + ((max - min) * ((p.r - 1) / (coreRow - 1) - 0.25)) / 0.75,
          0,
        ),
      );
      const existing = cells.filter((p) => grid[p.r][p.c].kind === kind);
      let count = existing.length;
      while (count > target) {
        const p = existing.pop()!;
        grid[p.r][p.c] = cell("rock", band);
        count--;
      }
      while (count < target) {
        const p = cells[Math.floor(Math.random() * cells.length)];
        if (
          grid[p.r][p.c].kind !== "rock" ||
          (kind === "stone" && p.c === C.CAVE_MOUTH_COL)
        )
          continue;
        grid[p.r][p.c] = cell(kind, band);
        count++;
      }
    }
  }
  // Allocate the exact depth-weighted share as short, connected molten seams.
  for (const band of C.BANDS.slice(2)) {
    const rows = Array.from({ length: coreRow - 1 }, (_, i) => i + 1).filter(
      (r) => bandAt(r, coreRow) === band,
    );
    let left = Math.round(
      rows.reduce(
        (n, r) =>
          n +
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) *
              ((r - 1) / (coreRow - 1) - 0.5)) /
              0.5) *
            (C.WORLD_COLS - 2),
        0,
      ),
    );
    while (left > 0) {
      const r = rows[Math.floor(Math.random() * rows.length)];
      const c = 1 + Math.floor(Math.random() * (C.WORLD_COLS - 2));
      for (
        let dx = 0;
        dx < 2 + Math.floor(Math.random() * 3) && left > 0;
        dx++
      ) {
        const x = c + dx;
        if (
          x >= C.WORLD_COLS - 1 ||
          x === C.CAVE_MOUTH_COL ||
          grid[r][x].kind !== "rock"
        )
          continue;
        grid[r][x] = cell("lava", band);
        left--;
      }
    }
  }
  // Redistribute ore into short branching veins without changing its band share.
  for (const band of C.BANDS) {
    const available: { c: number; r: number; ore: C.OreId }[] = [];
    for (let r = C.ORE_MIN_ROW; r < coreRow; r++)
      for (let c = 1; c < C.WORLD_COLS - 1; c++)
        if (grid[r][c].band === band && grid[r][c].ore) {
          available.push({ c, r, ore: grid[r][c].ore! });
          grid[r][c] = cell("rock", band);
        }
    let left = available.length;
    while (left > 0) {
      const seed = available[Math.floor(Math.random() * available.length)];
      let { c, r } = seed;
      for (let n = 0; n < 2 + Math.floor(Math.random() * 4) && left > 0; n++) {
        if (
          c > 0 &&
          c < C.WORLD_COLS - 1 &&
          r >= C.ORE_MIN_ROW &&
          r < coreRow &&
          grid[r][c].band === band &&
          grid[r][c].kind === "rock"
        ) {
          grid[r][c] = cell("ore", band, seed.ore);
          left--;
        }
        if (Math.random() < 0.7) c += Math.random() < 0.5 ? -1 : 1;
        else r += Math.random() < 0.5 ? -1 : 1;
      }
    }
  }
  for (const [i, m] of C.MATERIALS.entries()) {
    const r = Math.floor(coreRow * ((i + 1) / 4 + 0.05 + Math.random() * 0.18));
    const c = 2 + Math.floor(Math.random() * 28);
    for (
      let x = Math.min(c, C.CAVE_MOUTH_COL);
      x <= Math.max(c, C.CAVE_MOUTH_COL);
      x++
    )
      if (["stone", "lava"].includes(grid[r][x].kind))
        grid[r][x] = cell("rock", bandAt(r, coreRow));
    grid[r][c] = cell("material", bandAt(r, coreRow), null, m);
  }
  for (let c = C.CORE_COL; c <= C.CAVE_MOUTH_COL; c++)
    grid[coreRow - 1][c] = cell("rock", bandAt(coreRow - 1, coreRow));
  grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
  return grid;
}
export const buildings = C.BUILDINGS.map((id, i) => ({
  id,
  x: 140 + i * 335,
  y: C.SURFACE_Y - 150,
  w: 240,
  h: 150,
}));
export function initial(
  images: State["images"] = {},
  systems: State["systems"] = {},
): State {
  return {
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow: C.STANDARD_ROWS,
    menuIndex: 0,
    panelIndex: 0,
    launchAge: 0,
    muted: false,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: false,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: -300, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as State["tiers"],
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as State["items"],
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    notice: null,
    noticesFired: { gas: false, lava: false },
    summary: null,
    grid: emptyGrid(C.STANDARD_ROWS),
    images,
    systems,
    fx: [],
    serial: 0,
    shake: 0,
    hurt: 0,
    hitClock: 0,
    animTime: 0,
    accumulator: 0,
    note: "",
    noteTime: 0,
    presses: {},
  };
}
export function copy(s: ReadState): State {
  return {
    ...s,
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    camera: { ...s.camera },
    cargo: { ...s.cargo },
    tiers: { ...s.tiers },
    items: { ...s.items },
    satchel: { ...s.satchel },
    grid: s.grid.slice() as Cell[][],
    images: s.images as State["images"],
    systems: s.systems as State["systems"],
    fx: s.fx.map((f) => ({ ...f })),
    notice: s.notice ? { ...s.notice } : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
    presses: { ...s.presses },
  };
}
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((a, o) => a + (s.cargo[o.id] ?? 0) * o.weightKg, 0);
export const jet = (s: ReadState) => C.JETPACK_TIERS[s.tiers.jetpack - 1];
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const minerCell = (s: ReadState) => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
});
export function grounded(s: ReadState): boolean {
  const m = s.miner;
  const row = Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
  const d = m.drilling;
  if (
    d?.dir === "down" &&
    tile(s, d.col, d.row).health !== null &&
    !["tunnel", "lava"].includes(tile(s, d.col, d.row + 1).kind) &&
    m.y + C.MINER_H >= d.row * C.TILE &&
    m.y + C.MINER_H <= (d.row + 1) * C.TILE
  )
    return true;
  return (
    [
      Math.floor((m.x + 1) / C.TILE),
      Math.floor((m.x + C.MINER_W - 1) / C.TILE),
    ].some((c) => tile(s, c, row).kind !== "tunnel") &&
    [
      Math.floor((m.x + 1) / C.TILE),
      Math.floor((m.x + C.MINER_W - 1) / C.TILE),
    ].some(
      (c) =>
        Math.abs(
          m.y + C.MINER_H - (row * C.TILE + (tile(s, c, row).excavated ?? 0)),
        ) < 0.2,
    )
  );
}
export function effect(
  s: State,
  name: string,
  x = s.miner.x + C.MINER_W / 2,
  y = s.miner.y + C.MINER_H / 2,
  tint?: string,
): void {
  s.fx.push({ id: ++s.serial, name, x, y, age: 0, ...(tint ? { tint } : {}) });
}
export function note(s: State, text: string): void {
  s.note = text;
  s.noteTime = 3;
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  const mc = minerCell(s);
  let best: { target: C.MaterialId; dx: number; dy: number; d: number } | null =
    null;
  if (range)
    for (
      let r = Math.max(1, mc.row - range);
      r <= Math.min(s.coreRow, mc.row + range);
      r++
    )
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = tile(s, c, r);
        if (t.material && s.satchel[t.material] === 0) {
          const dx = c - mc.col,
            dy = r - mc.row,
            d = Math.hypot(dx, dy);
          if (d <= range && (!best || d < best.d))
            best = { target: t.material, dx, dy, d };
        }
      }
  return best
    ? {
        locked: true,
        target: best.target,
        dirX: best.dx / (best.d || 1),
        dirY: best.dy / (best.d || 1),
        distanceTiles: best.d,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
