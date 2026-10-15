import * as C from "./constants";
import {
  type State,
  type ReadState,
  copy,
  initial,
  generate,
  cell,
  tile,
  put,
  grounded,
  clamp,
  maxFuel,
  maxHull,
  loadKg,
  slots,
  jet,
  depth,
  minerCell,
  effect,
  note,
  mineralColors,
  bandColors,
} from "./model";
const SAVE_KEY = "deepcore.expedition.v1";
export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Storage is optional. */
  }
}
export function save(s: State): void {
  if (s.coreTimer !== null) {
    note(s, "Cannot save an unstable Core Sample.");
    return;
  }
  try {
    const { images: _i, systems: _p, ...payload } = s;
    void _i;
    void _p;
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    s.hasSave = true;
    note(s, "Expedition secured • single slot saved");
  } catch {
    note(s, "Storage unavailable • expedition not saved");
  }
}
export function resume(s: ReadState): State {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const n = {
        ...initial(s.images as State["images"], s.systems as State["systems"]),
        ...JSON.parse(raw),
      } as State;
      n.images = s.images as State["images"];
      n.systems = s.systems as State["systems"];
      n.screen = "in-mine";
      n.panel = null;
      n.hasSave = true;
      n.summary = null;
      n.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
      n.miner.y = C.SURFACE_Y - C.MINER_H;
      n.miner.vx = 0;
      n.miner.vy = 0;
      n.miner.state = "idle";
      n.miner.drilling = null;
      n.hitClock = 0;
      n.animTime = 0;
      n.camera.lead = 0;
      camera(n, 0);
      n.muted = s.muted;
      n.simTime = s.simTime;
      return n;
    }
  } catch {
    /* Corrupt saves never prevent a fresh expedition. */
  }
  return start(s);
}
export function start(s: ReadState): State {
  clearSave();
  const n = initial(s.images as State["images"], s.systems as State["systems"]);
  n.mode = s.mode;
  n.simTime = s.simTime;
  n.worldSize = s.worldSize;
  n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
  n.grid = generate(n.coreRow);
  n.screen = "in-mine";
  n.muted = s.muted;
  return n;
}
export function end(s: State, cause: C.DeathCause | null): void {
  if (s.summary) return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.panel = null;
  s.menuIndex = 0;
  s.screen = cause ? "game-over" : "victory";
  if (cause === "fuel-out" && !s.miner.drilling) s.miner.state = "fuel-out";
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (cause) {
    effect(s, "death-burst");
    if (s.mode === "hardcore") {
      clearSave();
      s.hasSave = false;
    }
  } else {
    clearSave();
    s.hasSave = false;
    effect(s, "launch-exhaust", 1935, C.SURFACE_Y);
  }
}
export function checkDeath(s: State): void {
  if (s.screen !== "in-mine") return;
  if (s.miner.hull <= 0) end(s, "hull-destroyed");
  else if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.1)
    end(s, "fuel-out");
}
export function damage(
  s: State,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0, shown: false };
  }
  checkDeath(s);
}
export function detonateGas(s: State, c: number, r: number): void {
  effect(s, "gas-explosion", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
  s.shake = 1;
  const dx = s.miner.x + C.MINER_W / 2 - (c + 0.5) * C.TILE,
    dy = s.miner.y + C.MINER_H / 2 - (r + 0.5) * C.TILE,
    d = Math.hypot(dx, dy);
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, (r - 1) / (s.coreRow - 1) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (d || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function breakTile(s: State, c: number, r: number, bank = true): void {
  const t = tile(s, c, r);
  if (
    ["bedrock", "core", "tunnel"].includes(t.kind) ||
    (!bank && t.kind === "material")
  )
    return;
  if (bank && t.ore) {
    if (slots(s) < C.CARGO_TIERS[s.tiers.cargo - 1]) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      effect(
        s,
        "ore-sparkle",
        (c + 0.5) * C.TILE,
        (r + 0.5) * C.TILE,
        mineralColors[t.ore],
      );
      note(s, "+1 " + t.ore);
    } else note(s, "cargo full");
  }
  if (bank && t.material) {
    s.satchel[t.material]++;
    effect(
      s,
      "material-shimmer",
      (c + 0.5) * C.TILE,
      (r + 0.5) * C.TILE,
      t.material === "resonite" ? "#8fffe1" : "#c8a6ff",
    );
    note(s, t.material + " recovered");
  }
  put(s, c, r, cell("tunnel", t.band));
  if (t.kind === "gas") detonateGas(s, c, r);
  if (bank && t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    effect(s, "lava-embers");
  }
}
export function canUse(s: ReadState, id: C.ItemId): boolean {
  if (!s.items[id]) return false;
  if (id === "nanobots") return s.miner.hull < maxHull(s);
  if (id === "emergency-fuel") return s.miner.fuel < maxFuel(s);
  if (id === "matter-transmitter")
    return (
      s.miner.x !== C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2 ||
      s.miner.y !== C.SURFACE_Y - C.MINER_H ||
      s.miner.vx !== 0 ||
      s.miner.vy !== 0
    );
  if (id === "quantum-teleporter") return true;
  const mc = minerCell(s),
    radius =
      id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
  for (
    let r = Math.max(1, mc.row - radius);
    r <= Math.min(s.coreRow - 1, mc.row + radius);
    r++
  )
    for (
      let c = Math.max(1, mc.col - radius);
      c <= Math.min(C.WORLD_COLS - 2, mc.col + radius);
      c++
    )
      if (
        !["tunnel", "material", "bedrock", "core"].includes(tile(s, c, r).kind)
      )
        return true;
  return false;
}
export type Transaction =
  | "drop-ore"
  | "sell"
  | "buy-fuel"
  | "fill-fuel"
  | "buy-repair"
  | "repair-full"
  | "buy-upgrade"
  | "buy-item"
  | "use-item"
  | "jettison"
  | "fabricate"
  | "launch"
  | "save"
  | "dismiss-notice";
export function transact(
  s: State,
  action: Transaction,
  subject: string | null = null,
): void {
  if (action === "drop-ore") {
    if (!C.MINERALS.some((o) => o.id === subject))
      throw new Error("Unknown ore");
    const id = subject as C.OreId;
    s.cargo[id] = Math.max(0, (s.cargo[id] ?? 0) - 1);
    if (!s.cargo[id]) delete s.cargo[id];
  }
  if (action === "sell") {
    const value = C.MINERALS.reduce(
      (v, o) => v + (s.cargo[o.id] ?? 0) * o.value,
      0,
    );
    s.credits += value;
    s.creditsEarned += value;
    s.cargo = {};
    note(s, `Cargo sold • +${value} Credits`);
  }
  if (["buy-fuel", "fill-fuel", "buy-repair", "repair-full"].includes(action)) {
    const fuel = action.endsWith("fuel"),
      max = fuel ? maxFuel(s) : maxHull(s),
      held = fuel ? s.miner.fuel : s.miner.hull,
      price = fuel ? C.FUEL_PRICE : C.REPAIR_PRICE;
    const limit = action.startsWith("buy")
      ? fuel
        ? C.FUEL_BUY_INCREMENT
        : C.REPAIR_BUY_INCREMENT
      : Infinity;
    const requested = Math.max(0, Math.min(max - held, limit));
    const amount = action.startsWith("buy")
      ? s.credits >= requested * price
        ? requested
        : 0
      : Math.max(0, Math.min(max - held, s.credits / price));
    s.credits -= amount * price;
    if (fuel) s.miner.fuel += amount;
    else s.miner.hull += amount;
    note(s, amount > 0 ? "Service complete" : "No service available");
  }
  if (action === "buy-upgrade") {
    if (!C.TRACKS.includes(subject as C.TrackName))
      throw new Error("Unknown track");
    const id = subject as C.TrackName,
      t = s.tiers[id],
      price = C.UPGRADE_PRICES[t - 1];
    if (t < C.MAX_TIER[id] && s.credits >= price) {
      const oldF = maxFuel(s),
        oldH = maxHull(s);
      s.credits -= price;
      s.tiers[id]++;
      s.miner.fuel += maxFuel(s) - oldF;
      s.miner.hull += maxHull(s) - oldH;
      note(s, id + " upgraded");
    } else note(s, "Upgrade unavailable");
  }
  if (action === "buy-item") {
    const item = C.ITEMS.find((i) => i.id === subject);
    if (!item) throw new Error("Unknown supply");
    if (s.credits >= item.price) {
      s.credits -= item.price;
      s.items[item.id]++;
      note(s, item.name + " purchased");
    } else note(s, "Insufficient Credits");
  }
  if (action === "use-item") {
    if (!C.ITEM_IDS.includes(subject as C.ItemId))
      throw new Error("Unknown supply");
    const id = subject as C.ItemId;
    if (!s.items[id]) {
      note(s, "No supply held");
      return;
    }
    let used = true;
    if (id === "nanobots") {
      used = s.miner.hull < maxHull(s);
      if (used)
        s.miner.hull = Math.min(maxHull(s), s.miner.hull + C.NANOBOT_HULL);
      if (used) effect(s, "material-shimmer");
    }
    if (id === "emergency-fuel") {
      used = s.miner.fuel < maxFuel(s);
      if (used)
        s.miner.fuel = Math.min(maxFuel(s), s.miner.fuel + C.EMERGENCY_FUEL);
      if (used) effect(s, "material-shimmer");
    }
    if (id === "matter-transmitter" || id === "quantum-teleporter") {
      if (id === "matter-transmitter")
        used =
          s.miner.x !== C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2 ||
          s.miner.y !== C.SURFACE_Y - C.MINER_H ||
          s.miner.vx !== 0 ||
          s.miner.vy !== 0;
      s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
      s.miner.y = C.SURFACE_Y - C.MINER_H;
      s.miner.vx = 0;
      s.miner.vy = 0;
      if (id === "quantum-teleporter") {
        s.miner.y -=
          (s.nextTeleportHeight ??
            C.TELEPORT_HEIGHT_TILES_MIN +
              Math.random() *
                (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN)) *
          C.TILE;
        s.miner.vy =
          s.nextTeleportSpeed ??
          C.TELEPORT_SPEED_MIN +
            Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
        s.nextTeleportHeight = null;
        s.nextTeleportSpeed = null;
      }
      if (used) effect(s, "core-extract");
      if (used) s.miner.drilling = null;
    }
    if (id === "dynamite" || id === "plastic-explosives") {
      const mc = minerCell(s),
        radius =
          id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
      used = false;
      for (let r = mc.row - radius; r <= mc.row + radius; r++)
        for (let c = mc.col - radius; c <= mc.col + radius; c++)
          if (
            r > 0 &&
            r < s.coreRow &&
            c > 0 &&
            c < C.WORLD_COLS - 1 &&
            !["core", "bedrock", "material", "tunnel"].includes(
              tile(s, c, r).kind,
            )
          ) {
            used = true;
            breakTile(s, c, r, false);
          }
      if (used) {
        effect(s, "gas-explosion");
        s.shake = 1;
      }
    }
    if (used) {
      s.items[id]--;
      note(s, "Supply deployed");
    } else note(s, "Supply would change nothing");
    checkDeath(s);
  }
  if (action === "jettison" && s.satchel.coreSample) {
    s.satchel.coreSample = false;
    s.coreGround = minerCell(s);
    note(s, "Sample jettisoned • move clear");
  }
  if (action === "fabricate") {
    const component = C.ROCKET_COMPONENTS[s.installed];
    if (!component) {
      note(s, "Rocket ready");
      return;
    }
    const m = component.material,
      held =
        !m || (m === "core-sample" ? s.satchel.coreSample : s.satchel[m] > 0);
    if (held && s.credits >= component.credits) {
      s.credits -= component.credits;
      if (m === "core-sample") {
        s.satchel.coreSample = false;
        s.coreTimer = null;
      } else if (m) s.satchel[m]--;
      s.installed++;
      effect(s, "material-shimmer");
      note(s, component.name + " installed");
    } else note(s, "Missing Credits or material");
  }
  if (action === "launch") {
    if (s.installed === C.ROCKET_COMPONENT_IDS.length) end(s, null);
    else note(s, "Rocket incomplete");
  }
  if (action === "save") save(s);
  if (action === "dismiss-notice") s.notice = null;
}
export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
/** Small deterministic substeps keep collision and drill cadence independent of render rate. */
export function simulate(s: State, input: Held, dt: number): void {
  s.elapsedSeconds += dt;
  if (s.coreTimer !== null) {
    s.coreTimer = Math.max(0, s.coreTimer - dt);
    if (s.coreTimer <= 0) {
      const g = s.coreGround;
      const p = g
        ? { x: (g.col + 0.5) * C.TILE, y: (g.row + 0.5) * C.TILE }
        : { x: s.miner.x + C.MINER_W / 2, y: s.miner.y + C.MINER_H / 2 };
      effect(s, "core-detonation", p.x, p.y);
      s.shake = 2.5;
      const hit =
        s.satchel.coreSample ||
        Math.hypot(
          s.miner.x + C.MINER_W / 2 - p.x,
          s.miner.y + C.MINER_H / 2 - p.y,
        ) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (hit) end(s, "core-detonation");
    }
  }
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (s.notice) {
    s.notice.age += dt;
    s.notice.shown = s.notice.age >= C.NOTICE_DELAY;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  if (s.panel) return;
  const m = s.miner;
  const previousTarget = m.drilling;
  const continuingDown = !!(
    input.down &&
    !input.up &&
    m.drill &&
    previousTarget?.dir === "down" &&
    tile(s, previousTarget.col, previousTarget.row).health !== null &&
    !["tunnel", "lava"].includes(
      tile(s, previousTarget.col, previousTarget.row + 1).kind,
    )
  );
  const wasGrounded = grounded(s) || continuingDown;
  const dir = input.right - input.left;
  const thrust = input.up > 0 && m.fuel > 0;
  const load = loadKg(s) / jet(s).liftLimitKg;
  if (dir) m.facing = dir > 0 ? "east" : "west";
  if (m.y + C.MINER_H > C.SURFACE_Y + 0.1)
    m.fuel = Math.max(0, m.fuel - C.LIFE_SUPPORT_BURN * dt);
  if (thrust)
    m.fuel = Math.max(
      0,
      m.fuel -
        (C.THRUST_BURN_MAX +
          (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
            Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
          C.THRUST_BURN_SIZE_MULT[s.worldSize] *
          dt,
    );
  if (dir && !wasGrounded) m.fuel = Math.max(0, m.fuel - C.AIR_BURN * dt);
  if (m.travel && !continuingDown) {
    if (s.hurt <= 0) m.vx = dir * C.WALK_SPEED;
    if (thrust)
      m.vy = Math.max(
        -jet(s).emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
        m.vy - jet(s).emptyAccel * Math.max(0, 1 - load) * dt,
      );
    else
      m.vy = Math.min(
        C.FALL_TERMINAL_EMPTY +
          (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) * Math.min(1, load),
        m.vy + C.GRAVITY * dt,
      );
    // Sweep the leading edges on each axis. Substeps are smaller than a collision box.
    let x = m.x + m.vx * dt;
    const col = Math.floor((x + (m.vx > 0 ? C.MINER_W : 0)) / C.TILE);
    if (m.vx !== 0)
      for (
        let r = Math.floor((m.y + 0.1) / C.TILE);
        r <= Math.floor((m.y + C.MINER_H - 0.1) / C.TILE);
        r++
      )
        if (
          tile(s, col, r).kind !== "tunnel" &&
          m.y + C.MINER_H > r * C.TILE + (tile(s, col, r).excavated ?? 0) + 0.1
        ) {
          x = m.vx > 0 ? col * C.TILE - C.MINER_W : (col + 1) * C.TILE;
          m.vx = 0;
          break;
        }
    m.x = clamp(x, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
    let y = m.y + m.vy * dt;
    const row = Math.floor((y + (m.vy > 0 ? C.MINER_H : 0)) / C.TILE);
    const impact = m.vy;
    for (
      let c = Math.floor((m.x + 0.1) / C.TILE);
      c <= Math.floor((m.x + C.MINER_W - 0.1) / C.TILE);
      c++
    )
      if (
        tile(s, c, row).kind !== "tunnel" &&
        (m.vy > 0 ||
          m.y + C.MINER_H >
            row * C.TILE + (tile(s, c, row).excavated ?? 0) + 0.1)
      ) {
        y =
          m.vy > 0
            ? row * C.TILE + (tile(s, c, row).excavated ?? 0) - C.MINER_H
            : (row + 1) * C.TILE;
        m.vy = 0;
        break;
      }
    m.y = y;
    if (impact > C.IMPACT_SAFE_SPEED && m.vy === 0) {
      const impactDamage =
        (impact - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
      damage(s, impactDamage);
      effect(s, "impact-dust", m.x + C.MINER_W / 2, m.y + C.MINER_H);
      s.shake = clamp(impactDamage / 60, 0.2, 1);
    }
  }
  m.drilling = null;
  const ground = grounded(s) || continuingDown;
  if (m.drill && ground && !thrust && m.fuel > 0) {
    let c =
        continuingDown && previousTarget
          ? previousTarget.col
          : Math.floor((m.x + C.MINER_W / 2) / C.TILE),
      r =
        continuingDown && previousTarget
          ? previousTarget.row
          : Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
    let direction: "down" | "left" | "right" = "down";
    let target = !!input.down;
    if (!target && dir) {
      direction = dir < 0 ? "left" : "right";
      const edge = m.x + (dir > 0 ? C.MINER_W : 0);
      c = Math.floor((edge + (dir > 0 ? 0.1 : -0.1)) / C.TILE);
      r = Math.floor((m.y + C.MINER_H / 2) / C.TILE);
      target = Math.abs(edge / C.TILE - Math.round(edge / C.TILE)) < 0.01;
    }
    const t = tile(s, c, r);
    if (
      target &&
      (t.health !== null ||
        (t.kind === "core" && direction === "down" && s.coreTimer === null))
    ) {
      m.drilling = { col: c, row: r, dir: direction };
      s.hitClock += dt;
      while (
        s.hitClock + 1e-9 >= C.DRILL_HIT_INTERVAL &&
        m.fuel > 0 &&
        s.screen === "in-mine"
      ) {
        s.hitClock -= C.DRILL_HIT_INTERVAL;
        m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
        if (t.kind === "core") {
          s.satchel.coreSample = true;
          s.coreTimer = C.CORE_TIMER;
          effect(s, "core-extract");
          note(s, "CORE SAMPLE • return to the launch pad");
          break;
        }
        const current = tile(s, c, r);
        const health =
          (current.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
        if (health <= 0) {
          breakTile(s, c, r);
          if (
            m.travel &&
            direction === "down" &&
            tile(s, c, r + 1).kind !== "tunnel" &&
            tile(s, c, r + 1).kind !== "lava"
          )
            m.y = (r + 1) * C.TILE - C.MINER_H;
          break;
        } else put(s, c, r, { ...current, health });
      }
      const remaining = tile(s, c, r);
      if (
        m.travel &&
        direction === "down" &&
        remaining.health !== null &&
        remaining.maxHealth &&
        !["tunnel", "lava"].includes(tile(s, c, r + 1).kind)
      ) {
        const progress = Math.min(
          1,
          1 -
            remaining.health / remaining.maxHealth +
            ((s.hitClock / C.DRILL_HIT_INTERVAL) *
              C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
              remaining.maxHealth,
        );
        put(s, c, r, { ...remaining, excavated: progress * C.TILE });
        m.y = (r + progress) * C.TILE - C.MINER_H;
        m.vy = 0;
        m.vx = 0;
      }
      if (
        Math.floor(s.elapsedSeconds * 24) !==
        Math.floor((s.elapsedSeconds - dt) * 24)
      )
        effect(
          s,
          "drill-debris",
          (c + 0.5) * C.TILE,
          direction === "down" ? m.y + C.MINER_H + 3 : (r + 0.5) * C.TILE,
          bandColors[t.band ?? "topsoil"],
        );
    } else s.hitClock = 0;
  } else s.hitClock = 0;
  // Heat while touching a pool, excluding the active drill face.
  let lava = false;
  for (
    let r = Math.floor(m.y / C.TILE);
    r <= Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
    r++
  )
    for (
      let c = Math.floor(m.x / C.TILE);
      c <= Math.floor((m.x + C.MINER_W) / C.TILE);
      c++
    )
      if (
        tile(s, c, r).kind === "lava" &&
        !(m.drilling?.col === c && m.drilling.row === r)
      )
        lava = true;
  if (lava) {
    damage(
      s,
      C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
      "lava",
    );
    if (
      Math.floor(s.elapsedSeconds * 8) !==
      Math.floor((s.elapsedSeconds - dt) * 8)
    )
      effect(s, "lava-embers");
  }
  if (
    thrust &&
    Math.floor(s.elapsedSeconds * 20) !==
      Math.floor((s.elapsedSeconds - dt) * 20)
  )
    effect(s, "jetpack-exhaust", m.x + 14, m.y + C.MINER_H - 10);
  const old = m.state;
  m.state = m.drilling
    ? m.drilling.dir === "down"
      ? "drill-down"
      : "drill-side"
    : s.hurt > 0
      ? "hurt"
      : m.fuel <= 0 && depth(s) > 0
        ? "fuel-out"
        : thrust
          ? "jetpack"
          : !ground && m.vy > 0
            ? "fall"
            : dir && ground
              ? "walk"
              : "idle";
  if (m.state !== old) s.animTime = 0;
  else s.animTime += dt;
  s.hurt = Math.max(0, s.hurt - dt);
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  checkDeath(s);
}
export function camera(s: State, dt: number): void {
  const m = s.miner,
    target =
      Math.abs(m.vy) <= C.CAM_STILL_SPEED
        ? 0
        : Math.sign(m.vy) * C.CAM_LEAD_MAX;
  const rate =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (s.camera.lead !== 0 &&
    (Math.sign(s.camera.lead) !== Math.sign(target) ||
      Math.abs(target) < Math.abs(s.camera.lead))
      ? C.CAM_UNWIND_MULT
      : 1);
  let remaining = dt;
  if (s.camera.lead * target < 0) {
    const unwindTime = Math.abs(s.camera.lead) / rate;
    const spend = Math.min(remaining, unwindTime);
    s.camera.lead += -Math.sign(s.camera.lead) * rate * spend;
    remaining -= spend;
    if (remaining > 0) s.camera.lead = 0;
  }
  const moveRate =
    s.camera.lead === 0 ? C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP : rate;
  s.camera.lead += clamp(
    target - s.camera.lead,
    -moveRate * remaining,
    moveRate * remaining,
  );
  s.camera.x = clamp(
    m.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    m.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
}
export function advance(state: ReadState, input: Held, dt: number): State {
  const s = copy(state);
  s.accumulator += dt;
  const step = 1 / 120;
  while (s.accumulator + 1e-10 >= step) {
    simulate(s, input, step);
    s.accumulator -= step;
    if (s.screen !== "in-mine") {
      s.accumulator = 0;
      break;
    }
  }
  if (!s.panel) camera(s, dt);
  return s;
}
