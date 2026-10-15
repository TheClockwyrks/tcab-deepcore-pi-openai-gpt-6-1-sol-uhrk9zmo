import * as C from "./constants";
import {
  type ReadState,
  type State,
  type Cell,
  copy,
  initial,
  emptyGrid,
  generate,
  cell,
  tile,
  put,
  bandAt,
  buildings,
  maxFuel,
  maxHull,
  depth,
  grounded,
  minerCell,
  slots,
  loadKg,
  jet,
  scanner,
} from "./model";
import { hasSave, clearSave, transact, type Transaction } from "./rules";
import { menu, menuRect, controls } from "./interface";
function valid(ok: boolean): void {
  if (!ok) throw new RangeError("Deepcore: invalid debug argument or subject");
}
function number(n: number, min = -Infinity, max = Infinity): void {
  valid(Number.isFinite(n) && n >= min && n <= max);
}
function integer(n: number, min: number, max = Infinity): void {
  number(n, min, max);
  valid(Number.isInteger(n));
}
function enumValue<T extends string>(value: T, values: readonly T[]): void {
  valid(values.includes(value));
}
function pose(s: ReadState, fn: (n: State) => void): State {
  const n = copy(s);
  fn(n);
  return n;
}
function coordinate(s: ReadState, c: number, r: number): void {
  integer(c, 0, C.WORLD_COLS - 1);
  integer(r, 1, s.coreRow);
}
function transaction(
  s: ReadState,
  id: Transaction,
  subject: string | null = null,
): State {
  return pose(s, (n) => transact(n, id, subject));
}
export function snapshot(s: ReadState) {
  const mc = minerCell(s),
    ore = Object.fromEntries(Object.entries(s.cargo).filter(([, v]) => !!v));
  const drilling = s.miner.drilling;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...mc,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= jet(s).liftLimitKg,
      drilling: drilling
        ? {
            ...drilling,
            progress:
              1 -
              (tile(s, drilling.col, drilling.row).health ?? 0) /
                (tile(s, drilling.col, drilling.row).maxHealth ?? 1),
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
      loadKg: loadKg(s),
      liftLimitKg: jet(s).liftLimitKg,
      ore,
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.shown }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export const debug = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt: (s: ReadState, c: number, r: number) => {
    const { kind, band, ore, material, health, maxHealth } = tile(s, c, r);
    return { kind, band, ore, material, health, maxHealth };
  },
  findTile(s: ReadState, kind: C.TileKind) {
    enumValue(kind, C.TILE_KINDS);
    const mc = minerCell(s);
    let best: { col: number; row: number } | null = null,
      distance = Infinity;
    for (let r = 1; r <= s.coreRow; r++)
      for (let c = 0; c < C.WORLD_COLS; c++)
        if (tile(s, c, r).kind === kind) {
          const d = Math.hypot(c - mc.col, r - mc.row);
          if (d < distance) {
            distance = d;
            best = { col: c, row: r };
          }
        }
    return best;
  },
  buildings: (_s: ReadState) => buildings.map((b) => ({ ...b })),
  menuItemRect: menuRect,
  controlRect(s: ReadState, control: string, subject: string | null) {
    const r = controls(s).find(
      (c) => c.id === control && c.subject === subject,
    );
    return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
  },
  reset: (s: ReadState) => ({
    ...initial(s.images as State["images"], s.systems as State["systems"]),
    muted: s.muted,
    hasSave: hasSave(),
  }),
  reconcile: (s: ReadState) => copy(s),
  generateMine: (s: ReadState) => ({ ...copy(s), grid: generate(s.coreRow) }),
  clearMine: (s: ReadState) => ({ ...copy(s), grid: emptyGrid(s.coreRow) }),
  clearCargo: (s: ReadState) => ({ ...copy(s), cargo: {} }),
  clearItems: (s: ReadState) => ({
    ...copy(s),
    items: Object.fromEntries(C.ITEM_IDS.map((i) => [i, 0])) as State["items"],
  }),
  setTile(s: ReadState, c: number, r: number, kind: C.TileKind) {
    coordinate(s, c, r);
    enumValue(kind, [
      "rock",
      "gas",
      "lava",
      "stone",
      "bedrock",
      "tunnel",
      "core",
    ]);
    return pose(s, (n) =>
      put(n, c, r, cell(kind, r < s.coreRow ? bandAt(r, s.coreRow) : null)),
    );
  },
  setOreTile(s: ReadState, c: number, r: number, ore: C.OreId) {
    coordinate(s, c, r);
    enumValue(
      ore,
      C.MINERALS.map((o) => o.id),
    );
    return pose(s, (n) => put(n, c, r, cell("ore", bandAt(r, s.coreRow), ore)));
  },
  setMaterialTile(s: ReadState, c: number, r: number, material: C.MaterialId) {
    coordinate(s, c, r);
    enumValue(material, C.MATERIALS);
    return pose(s, (n) =>
      put(n, c, r, cell("material", bandAt(r, s.coreRow), null, material)),
    );
  },
  setTileHealth(s: ReadState, c: number, r: number, health: number) {
    coordinate(s, c, r);
    const t = tile(s, c, r);
    valid(t.health !== null);
    number(health, Number.MIN_VALUE, t.maxHealth ?? 0);
    return pose(s, (n) => put(n, c, r, { ...t, health }));
  },
  placeCoreSample(s: ReadState, c: number, r: number) {
    coordinate(s, c, r);
    valid(s.coreTimer === null && tile(s, c, r).kind === "tunnel");
    return {
      ...copy(s),
      coreTimer: C.CORE_TIMER,
      coreGround: { col: c, row: r },
    };
  },
  setMinerPosition(s: ReadState, x: number, y: number) {
    number(x);
    number(y);
    return pose(s, (n) => {
      n.miner.x = x;
      n.miner.y = y;
    });
  },
  setMinerVelocity(s: ReadState, vx: number, vy: number) {
    number(vx);
    number(vy);
    return pose(s, (n) => {
      n.miner.vx = vx;
      n.miner.vy = vy;
    });
  },
  setFacing(s: ReadState, facing: C.Facing) {
    enumValue(facing, C.FACINGS);
    return pose(s, (n) => {
      n.miner.facing = facing;
    });
  },
  setFuel(s: ReadState, value: number) {
    number(value, 0);
    return pose(s, (n) => {
      n.miner.fuel = value;
    });
  },
  setHull(s: ReadState, value: number) {
    number(value, 0);
    return pose(s, (n) => {
      n.miner.hull = value;
    });
  },
  setMinerTravel(s: ReadState, enabled: boolean) {
    valid(typeof enabled === "boolean");
    return pose(s, (n) => {
      n.miner.travel = enabled;
    });
  },
  setMinerDrill(s: ReadState, enabled: boolean) {
    valid(typeof enabled === "boolean");
    return pose(s, (n) => {
      n.miner.drill = enabled;
    });
  },
  setScreen(s: ReadState, screen: C.ScreenName) {
    enumValue(screen, C.SCREENS);
    return { ...copy(s), screen };
  },
  setPanel(s: ReadState, panel: C.PanelId | null) {
    if (panel !== null) enumValue(panel, C.PANELS);
    return { ...copy(s), panel };
  },
  setMenuIndex(s: ReadState, index: number) {
    integer(index, 0, menu(s).length - 1);
    return { ...copy(s), menuIndex: index };
  },
  setMode(s: ReadState, mode: C.Mode) {
    enumValue(mode, C.MODES);
    return { ...copy(s), mode };
  },
  setWorldSize(s: ReadState, size: C.WorldSize) {
    enumValue(size, C.WORLD_SIZES);
    const n = copy(s),
      rows = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
      grid = emptyGrid(rows);
    for (let r = 1; r < Math.min(s.coreRow, rows); r++)
      grid[r] = s.grid[r].slice() as Cell[];
    n.grid = grid;
    n.coreRow = rows;
    n.worldSize = size;
    return n;
  },
  setCredits(s: ReadState, value: number) {
    number(value, 0);
    return { ...copy(s), credits: value };
  },
  setTier(s: ReadState, track: C.TrackName, tier: number) {
    enumValue(track, C.TRACKS);
    integer(tier, 1, C.MAX_TIER[track]);
    return pose(s, (n) => {
      n.tiers[track] = tier;
      n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
      n.miner.hull = Math.min(n.miner.hull, maxHull(n));
    });
  },
  setCargo(s: ReadState, ore: C.OreId, count: number) {
    enumValue(
      ore,
      C.MINERALS.map((o) => o.id),
    );
    integer(count, 0);
    return pose(s, (n) => {
      if (count) n.cargo[ore] = count;
      else delete n.cargo[ore];
    });
  },
  setMaterial(s: ReadState, material: C.MaterialId, count: number) {
    enumValue(material, C.MATERIALS);
    integer(count, 0);
    return pose(s, (n) => {
      n.satchel[material] = count;
    });
  },
  setCoreCarried(s: ReadState, carried: boolean) {
    valid(typeof carried === "boolean");
    if (carried) valid(s.coreTimer === null);
    return pose(s, (n) => {
      if (carried) n.coreTimer = C.CORE_TIMER;
      else if (n.satchel.coreSample) n.coreTimer = null;
      n.satchel.coreSample = carried;
    });
  },
  setCoreTimer(s: ReadState, seconds: number) {
    valid(s.coreTimer !== null);
    number(seconds, Number.MIN_VALUE);
    return { ...copy(s), coreTimer: seconds };
  },
  setItemCount(s: ReadState, item: C.ItemId, count: number) {
    enumValue(item, C.ITEM_IDS);
    integer(count, 0);
    return pose(s, (n) => {
      n.items[item] = count;
    });
  },
  setRocketInstalled(s: ReadState, count: number) {
    integer(count, 0, C.ROCKET_COMPONENT_IDS.length);
    return { ...copy(s), installed: count };
  },
  setNoticeFired(s: ReadState, hazard: C.NoticeHazard, fired: boolean) {
    enumValue(hazard, C.NOTICE_HAZARDS);
    valid(typeof fired === "boolean");
    return pose(s, (n) => {
      n.noticesFired[hazard] = fired;
    });
  },
  setCameraLead(s: ReadState, lead: number) {
    number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
    return pose(s, (n) => {
      n.camera.lead = lead;
    });
  },
  setElapsed(s: ReadState, seconds: number) {
    number(seconds, 0);
    return { ...copy(s), elapsedSeconds: seconds };
  },
  clearSave(s: ReadState) {
    clearSave();
    return { ...copy(s), hasSave: false };
  },
  setNextTeleportHeight(s: ReadState, tiles: number | null) {
    if (tiles !== null)
      number(tiles, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
    return { ...copy(s), nextTeleportHeight: tiles };
  },
  setNextTeleportSpeed(s: ReadState, speed: number | null) {
    if (speed !== null)
      number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
    return { ...copy(s), nextTeleportSpeed: speed };
  },
  dropOre: (s: ReadState, ore: C.OreId) => transaction(s, "drop-ore", ore),
  sell: (s: ReadState) => transaction(s, "sell"),
  buyFuel: (s: ReadState) => transaction(s, "buy-fuel"),
  fillFuel: (s: ReadState) => transaction(s, "fill-fuel"),
  buyRepair: (s: ReadState) => transaction(s, "buy-repair"),
  repairFull: (s: ReadState) => transaction(s, "repair-full"),
  buyUpgrade: (s: ReadState, track: C.TrackName) =>
    transaction(s, "buy-upgrade", track),
  buyItem: (s: ReadState, item: C.ItemId) => transaction(s, "buy-item", item),
  useItem: (s: ReadState, item: C.ItemId) => transaction(s, "use-item", item),
  jettison: (s: ReadState) => transaction(s, "jettison"),
  fabricate: (s: ReadState) => transaction(s, "fabricate"),
  launch: (s: ReadState) => transaction(s, "launch"),
  save: (s: ReadState) => transaction(s, "save"),
  dismissNotice: (s: ReadState) => transaction(s, "dismiss-notice"),
};
