import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import * as C from "./constants";
import {
  type ReadState,
  type State,
  buildings,
  tile,
  clamp,
  maxFuel,
  maxHull,
  depth,
  slots,
  loadKg,
  jet,
  scanner,
} from "./model";
import { menu, menuRect, controls, inventoryInfo } from "./interface";
export const BACKGROUND = "#0c1721";
const gold = "#ddbd80",
  ink = "#e4e6d7",
  dim = "#8ba5aa",
  teal = "#78d4c7";
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size = 18,
  color = ink,
  font = "monospace",
): void {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = "#142a36",
  stroke = "#47616a",
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function image(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const img = s.images[path];
  if (img) ctx.drawImage(img as ImageBitmap, x, y, w, h);
}
const frameCounts: Record<C.MinerState, number> = {
  idle: 4,
  walk: 6,
  "drill-down": 4,
  "drill-side": 4,
  jetpack: 4,
  fall: 4,
  hurt: 3,
  "fuel-out": 3,
};
function opening(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  c: number,
  r: number,
  lava: boolean,
): void {
  const same = (x: number, y: number) =>
    tile(s, x, y).kind === (lava ? "lava" : "tunnel");
  const x = c * C.TILE,
    y = r * C.TILE;
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 8, C.TILE - 16, C.TILE - 16, 15);
  if (same(c - 1, r)) ctx.rect(x, y + 8, 42, C.TILE - 16);
  if (same(c + 1, r)) ctx.rect(x + 38, y + 8, 42, C.TILE - 16);
  if (same(c, r - 1)) ctx.rect(x + 8, y, C.TILE - 16, 42);
  if (same(c, r + 1)) ctx.rect(x + 8, y + 38, C.TILE - 16, 42);
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    if (same(c + dx, r) && same(c, r + dy)) {
      ctx.rect(x + (dx > 0 ? 40 : 0), y + (dy > 0 ? 40 : 0), 40, 40);
    }
}
function world(s: ReadState, ctx: CanvasRenderingContext2D): void {
  const cam =
    s.screen === "victory"
      ? {
          x: clamp(
            buildings[5].x + 120 - C.VIEW_W / 2,
            0,
            C.WORLD_W - C.VIEW_W,
          ),
          y: -300,
          lead: 0,
        }
      : s.camera;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, 56, 0, 720);
  sky.addColorStop(0, "#101e2b");
  sky.addColorStop(1, "#203644");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 56, 1280, 664);
  // The authored skyline uses slow parallax while the camp itself remains in world space.
  if (cam.y < 200)
    image(
      s,
      ctx,
      "surface/sky.png",
      -(cam.x * 0.15) % 1280,
      Math.min(56, 56 - cam.y * 0.16 - 70),
      1400,
      525,
    );
  const jitter =
    s.shake > 0 ? Math.sin(s.simTime * 113) * Math.min(15, s.shake * 11) : 0;
  ctx.translate(-cam.x + jitter, C.HUD_H - cam.y + jitter * 0.6);
  const c0 = Math.max(0, Math.floor(cam.x / C.TILE)),
    c1 = Math.min(C.WORLD_COLS - 1, Math.ceil((cam.x + C.VIEW_W) / C.TILE));
  const r0 = Math.max(1, Math.floor(cam.y / C.TILE)),
    r1 = Math.min(s.coreRow, Math.ceil((cam.y + C.VIEW_H) / C.TILE));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = tile(s, c, r),
        x = c * C.TILE,
        y = r * C.TILE;
      const variation = (c * 17 + r * 31) % C.TILE_VARIANTS;
      const band = t.band ?? "coreshell";
      image(s, ctx, `tiles/${band}-${variation}.png`, x, y, C.TILE, C.TILE);
      if (t.kind === "tunnel" || t.kind === "lava") {
        ctx.save();
        opening(s, ctx, c, r, t.kind === "lava");
        ctx.clip();
        image(
          s,
          ctx,
          t.kind === "lava"
            ? `hazards/lava/frame0${Math.floor(s.simTime * 5) % 3}.png`
            : "tiles/tunnel.png",
          x,
          y,
          C.TILE,
          C.TILE,
        );
        ctx.restore();
        // A diagonally solid corner retains a convex, textured dirt nub.
        const same = (dx: number, dy: number) =>
          tile(s, c + dx, r + dy).kind === t.kind;
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          if (same(dx, 0) && same(0, dy) && !same(dx, dy)) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, C.TILE, C.TILE);
            ctx.clip();
            ctx.beginPath();
            ctx.arc(
              x + (dx > 0 ? C.TILE : 0),
              y + (dy > 0 ? C.TILE : 0),
              12,
              0,
              Math.PI * 2,
            );
            ctx.clip();
            image(
              s,
              ctx,
              `tiles/${band}-${variation}.png`,
              x,
              y,
              C.TILE,
              C.TILE,
            );
            ctx.restore();
          }
      } else if (t.kind === "bedrock")
        image(s, ctx, "tiles/bedrock.png", x, y, C.TILE, C.TILE);
      else if (t.kind === "stone")
        image(s, ctx, `tiles/stone-${variation % 2}.png`, x, y, C.TILE, C.TILE);
      else if (t.ore) image(s, ctx, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
      else if (t.material)
        image(s, ctx, `materials/${t.material}.png`, x, y, C.TILE, C.TILE);
      else if (t.kind === "core")
        image(s, ctx, "materials/core.png", x, y, C.TILE, C.TILE);
      if (t.health !== null && t.maxHealth && t.health < t.maxHealth)
        image(
          s,
          ctx,
          `tiles/crack/frame0${Math.min(C.CRACK_FRAMES - 1, Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES))}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
      if (t.excavated && t.health !== null) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 8, y - 18, C.TILE - 16, t.excavated + 18, 10);
        ctx.clip();
        image(s, ctx, "tiles/tunnel.png", x, y, C.TILE, C.TILE);
        ctx.restore();
      }
      ctx.strokeStyle = "#b8c8b00b";
      ctx.strokeRect(x + 0.5, y + 0.5, C.TILE - 1, C.TILE - 1);
    }
  if (cam.y < 180) {
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      image(
        s,
        ctx,
        c === C.CAVE_MOUTH_COL
          ? "surface/cave-mouth.png"
          : "surface/ground.png",
        c * C.TILE,
        C.SURFACE_Y - 6,
        C.TILE,
        c === C.CAVE_MOUTH_COL ? C.TILE : 12,
      );
    for (const [i, b] of buildings.entries()) {
      image(s, ctx, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      if (b.id === "launch-pad") {
        if (s.screen === "victory") {
          image(s, ctx, "rocket/stage0.png", b.x + 30, b.y - 87, 210, 227);
          const rocket = s.images["rocket/stage5.png"];
          if (rocket)
            ctx.drawImage(
              rocket as ImageBitmap,
              70,
              35,
              110,
              190,
              b.x + 30 + (70 * 210) / 240,
              b.y - 87 + (35 * 227) / 260 - s.launchAge * s.launchAge * 150,
              (110 * 210) / 240,
              (190 * 227) / 260,
            );
        } else
          image(
            s,
            ctx,
            `rocket/stage${s.installed}.png`,
            b.x + 30,
            b.y - 87,
            210,
            227,
          );
      }
      text(
        ctx,
        String(i + 1).padStart(2, "0") +
          " / " +
          b.id.replace(/-/g, " ").toUpperCase(),
        b.x,
        b.y - 15,
        14,
        gold,
      );
      if (
        s.screen === "in-mine" &&
        !s.panel &&
        s.miner.x + C.MINER_W > b.x &&
        s.miner.x < b.x + b.w &&
        s.miner.y < C.SURFACE_Y
      ) {
        box(ctx, b.x + 30, 92, 180, 31, "#122936");
        text(
          ctx,
          "[E] " + (b.id === "save-pad" ? "SAVE" : "ENTER"),
          b.x + 50,
          113,
          16,
          teal,
        );
      }
    }
    text(ctx, "↓  MINE ACCESS", C.CAVE_MOUTH_COL * C.TILE - 35, 49, 15, gold);
  }
  if (s.coreGround) {
    image(
      s,
      ctx,
      "materials/core-sample.png",
      s.coreGround.col * C.TILE,
      s.coreGround.row * C.TILE,
      C.TILE,
      C.TILE,
    );
    text(
      ctx,
      `${Math.ceil(s.coreTimer ?? 0)}s`,
      s.coreGround.col * C.TILE,
      s.coreGround.row * C.TILE - 10,
      26,
      gold,
    );
  }
  if (s.screen !== "victory") {
    const m = s.miner;
    let frame = Math.floor(s.animTime * C.ANIM_FPS);
    frame =
      m.state === "hurt"
        ? Math.min(frame, frameCounts[m.state] - 1)
        : frame % frameCounts[m.state];
    ctx.save();
    ctx.translate(m.x + C.MINER_W / 2, m.y + C.MINER_H / 2);
    if (m.facing === "west") ctx.scale(-1, 1);
    image(
      s,
      ctx,
      `miner/${m.state}/frame${String(frame).padStart(2, "0")}.png`,
      -C.MINER_SPRITE / 2,
      -C.MINER_SPRITE / 2,
      C.MINER_SPRITE,
      C.MINER_SPRITE,
    );
    ctx.restore();
    const lamp = ctx.createRadialGradient(
      m.x + 35,
      m.y + 24,
      8,
      m.x + 35,
      m.y + 24,
      150,
    );
    lamp.addColorStop(0, "#f4e4ac12");
    lamp.addColorStop(1, "#f4e4ac00");
    ctx.fillStyle = lamp;
    ctx.fillRect(m.x - 120, m.y - 130, 310, 310);
  }
  // Runtime consumes produced systems, resimulated to their state-carried age.
  // A logical 400px canvas facade prevents device-pixel dimensions affecting VFX.
  let particleVisible = false;
  const particleCtx = new Proxy(ctx, {
    get(target, key) {
      if (!particleVisible && (key === "fill" || key === "fillRect"))
        return () => undefined;
      if (key === "canvas") return { width: 400, height: 400 };
      const v = Reflect.get(target, key, target) as unknown;
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  const drawFx = (
    name: string,
    x: number,
    y: number,
    age: number,
    seed: number,
    tint?: string,
  ) => {
    const authored = s.systems[name];
    if (!authored) return;
    const system = tint
      ? {
          ...authored,
          emitters: authored.emitters.map((e) => ({
            ...e,
            particle: {
              ...e.particle,
              colorGradient: [
                { color: tint, at: 0 },
                { color: "#445867", at: 1 },
              ],
            },
          })),
        }
      : authored;
    ctx.save();
    ctx.translate(x - 200, y - 200);
    particleVisible = false;
    const player = new ParticleCanvasPlayer(
      system as State["systems"][string],
      particleCtx,
      {
        clear: false,
        seed,
        pixelRadius: name === "gas-seep" ? 13 : name === "drill-debris" ? 3 : 7,
        composite: ["gas-seep", "drill-debris", "impact-dust"].includes(name)
          ? "source-over"
          : "lighter",
      },
    );
    particleVisible = true;
    // Integrate in small steps: forces and subemitters follow the same live path.
    for (let t = 0; t < age; t += 1 / 60) {
      player.simulator.step(Math.min(1 / 60, age - t) * 1000);
    }
    player.update(0);
    ctx.restore();
  };
  for (const f of s.fx) drawFx(f.name, f.x, f.y, f.age, f.id, f.tint);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (tile(s, c, r).kind === "gas")
        drawFx(
          "gas-seep",
          (c + 0.5) * C.TILE,
          (r + 0.5) * C.TILE,
          (s.simTime + (r + c) * 0.13) % C.GAS_SEEP_PERIOD,
          r * C.WORLD_COLS + c,
        );
  ctx.restore();
  // Depth-side annotations are UI, not world sprites.
  if (depth(s) > 15) {
    text(
      ctx,
      (
        tile(s, Math.floor(s.miner.x / C.TILE), Math.floor(s.miner.y / C.TILE))
          .band ?? "deepcore"
      ).toUpperCase(),
      28,
      94,
      15,
      dim,
    );
    text(
      ctx,
      "SECTOR " + String(Math.floor(depth(s) / 100)).padStart(2, "0"),
      28,
      115,
      12,
      "#667e88",
    );
  }
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D): void {
  box(ctx, 0, 0, 1280, C.HUD_H, "#0b1924", "#38505b");
  const gauge = (
    name: string,
    x: number,
    value: number,
    max: number,
    color: string,
  ) => {
    image(s, ctx, `icons/${name}.png`, x, 16, 24, 24);
    text(
      ctx,
      `${name.toUpperCase()} ${Math.ceil(value)}/${max}`,
      x + 34,
      23,
      13,
      ink,
    );
    ctx.fillStyle = "#243d48";
    ctx.fillRect(x + 34, 32, 130, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x + 34, 32, 130 * clamp(value / max, 0, 1), 5);
  };
  gauge(
    "fuel",
    20,
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel / maxFuel(s) < C.LOW_FUEL_FRACTION ? "#e07862" : gold,
  );
  gauge(
    "hull",
    215,
    s.miner.hull,
    maxHull(s),
    s.miner.hull / maxHull(s) < C.LOW_HULL_FRACTION ? "#e07862" : teal,
  );
  image(s, ctx, "icons/cargo.png", 409, 15, 24, 24);
  text(
    ctx,
    `${slots(s)}/${C.CARGO_TIERS[s.tiers.cargo - 1]}  ${loadKg(s)}kg`,
    443,
    24,
    14,
    gold,
  );
  text(
    ctx,
    loadKg(s) >= jet(s).liftLimitKg ? C.OVERLOAD : "CARGO",
    443,
    42,
    11,
    loadKg(s) >= jet(s).liftLimitKg ? "#f18d6e" : dim,
  );
  image(s, ctx, "icons/credits.png", 600, 15, 24, 24);
  text(ctx, Math.floor(s.credits).toLocaleString(), 632, 33, 19, gold);
  image(s, ctx, "icons/depth.png", 755, 15, 24, 24);
  text(ctx, `${Math.floor(depth(s))} m`, 787, 33, 19, ink);
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] > 0 ? 1 : 0.25;
    image(s, ctx, `icons/${m}.png`, 900 + i * 36, 15, 24, 24);
    ctx.globalAlpha = 1;
  }
  for (const b of controls(s).filter((c) => c.y < 56)) {
    box(ctx, b.x, b.y, b.w, b.h, "#152c38");
    text(ctx, b.label, b.x + 12, b.y + 23, 13, gold);
  }
}
function supplyIcon(
  ctx: CanvasRenderingContext2D,
  id: C.ItemId,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = teal;
  ctx.fillStyle = gold;
  if (id === "dynamite" || id === "plastic-explosives") {
    ctx.fillStyle = id === "dynamite" ? "#d58166" : "#9ca88d";
    for (let i = 0; i < 3; i++) ctx.fillRect(i * 6, 3, 5, 19);
    ctx.strokeStyle = "#dfc994";
    ctx.beginPath();
    ctx.moveTo(8, 3);
    ctx.lineTo(8, -3);
    ctx.lineTo(18, -6);
    ctx.stroke();
    ctx.fillStyle = "#243a43";
    ctx.fillRect(0, 9, 17, 4);
  } else if (id === "nanobots") {
    ctx.fillStyle = teal;
    ctx.fillRect(7, 1, 6, 22);
    ctx.fillRect(0, 9, 20, 6);
  } else if (id === "emergency-fuel") {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.bezierCurveTo(-10, 17, 3, 28, 10, 24);
    ctx.bezierCurveTo(28, 24, 24, 13, 10, -2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(10, 11, id === "quantum-teleporter" ? 12 : 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, 11, 4, 0, Math.PI * 2);
    ctx.fill();
    if (id === "matter-transmitter") ctx.strokeRect(-4, -3, 28, 28);
  }
  ctx.restore();
}
function panels(s: ReadState, ctx: CanvasRenderingContext2D): void {
  if (!s.panel) return;
  ctx.fillStyle = "#07121caa";
  ctx.fillRect(0, 56, 1280, 664);
  box(ctx, 130, 110, 1020, 545, "#102531", "#57717a");
  ctx.fillStyle = gold;
  ctx.fillRect(130, 110, 5, 70);
  text(ctx, s.panel.replace(/-/g, " ").toUpperCase(), 168, 151, 25, gold);
  text(ctx, "ESC / I   CLOSE", 941, 150, 13, dim);
  text(ctx, inventoryInfo(s), 168, 175, 13, dim);
  const x = 170,
    y = 235;
  if (s.panel === "fuel-depot") {
    text(ctx, "KEEP THE RETURN TRIP IN RESERVE", x, y, 18, gold);
    text(ctx, "Fuel and hull never replenish on their own.", x, y + 40, 16);
    text(ctx, "Fuel 1 CR / unit     Repair 2 CR / point", x, y + 75, 15, dim);
    text(
      ctx,
      `Tank ${Math.ceil(s.miner.fuel)} / ${maxFuel(s)}`,
      x,
      y + 130,
      22,
      teal,
    );
    text(
      ctx,
      `Hull ${Math.ceil(s.miner.hull)} / ${maxHull(s)}`,
      x,
      y + 170,
      22,
      teal,
    );
  }
  if (s.panel === "ore-market") {
    text(ctx, "TODAY’S MANIFEST", x, y, 18, gold);
    let yy = y + 35;
    for (const o of C.MINERALS)
      if (s.cargo[o.id]) {
        image(s, ctx, `ore/${o.id}.png`, x - 8, yy - 26, 36, 36);
        text(
          ctx,
          `${o.name.padEnd(11)} ×${s.cargo[o.id]}   ${o.value * (s.cargo[o.id] ?? 0)} CR`,
          x + 35,
          yy,
          16,
        );
        yy += 25;
      }
    if (!slots(s))
      text(ctx, "The hold is empty. Find a vein below.", x, yy + 30, 16, dim);
  }
  if (s.panel === "upgrade-shop") {
    text(ctx, "BUILT FOR A DEEPER RUN", x, y, 20, gold);
    text(ctx, "Seven systems. One way home.", x, y + 40, 17);
    image(s, ctx, "miner/jetpack/frame00.png", x + 125, y + 70, 220, 220);
    text(
      ctx,
      "Tank / hull upgrades add the capacity gained.",
      x,
      y + 335,
      13,
      dim,
    );
  }
  if (s.panel === "supply-depot") {
    text(ctx, "INSURANCE FOR THE UNKNOWN", x, y, 20, gold);
    const lines = [
      "1  Dynamite       clears 3 × 3",
      "2  Plastic charge clears 5 × 5",
      "3  Quantum jump   uncertain landing",
      "4  Matter beam    safe surface return",
      "5  Nanobots       +20 hull",
      "6  Fuel reserve   +30 fuel",
    ];
    lines.forEach((l, i) => {
      supplyIcon(ctx, C.ITEM_IDS[i], x, y + 32 + i * 40);
      text(ctx, l, x + 35, y + 50 + i * 40, 16, i % 2 ? dim : ink);
    });
  }
  if (s.panel === "launch-pad") {
    text(ctx, "ESCAPE VEHICLE / ASSEMBLY", x, y, 18, gold);
    for (const [i, c] of C.ROCKET_COMPONENTS.entries()) {
      text(
        ctx,
        `${i < s.installed ? "✓" : "○"} ${c.name}    ${c.credits} CR`,
        x,
        y + 45 + i * 47,
        17,
        i < s.installed ? teal : ink,
      );
      if (c.material)
        text(ctx, `requires ${c.material}`, x + 30, y + 65 + i * 47, 12, dim);
    }
    image(s, ctx, `rocket/stage${s.installed}.png`, 885, 290, 170, 184);
  }
  for (const c of controls(s).filter(
    (c) => c.y >= 180 && c.id !== "dismiss-notice",
  )) {
    box(
      ctx,
      c.x,
      c.y,
      c.w,
      c.h,
      c.enabled ? "#233e48" : "#172c35",
      c.enabled ? "#72918b" : "#304853",
    );
    const enabled = controls(s).filter((c) => c.y > 100 && c.enabled);
    const selected = enabled[s.panelIndex % enabled.length];
    if (c.enabled && selected?.id === c.id && selected?.subject === c.subject) {
      ctx.strokeStyle = gold;
      ctx.strokeRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
    }
    text(
      ctx,
      c.label,
      c.x + 12,
      c.y + (c.detail ? 16 : 24),
      c.label.length > 32 ? 12 : 14,
      c.enabled ? ink : "#607c85",
    );
    if (c.detail)
      text(ctx, c.detail, c.x + 12, c.y + 31, 11, c.enabled ? gold : "#607c85");
  }
}
function menus(s: ReadState, ctx: CanvasRenderingContext2D): void {
  const main = ["title", "mode-select", "size-select", "how-to-play"].includes(
    s.screen,
  );
  ctx.fillStyle = main ? "#081621d9" : "#07131cce";
  ctx.fillRect(0, 0, 1280, 720);
  if (main) {
    ctx.strokeStyle = "#41616a";
    ctx.beginPath();
    ctx.moveTo(650, 90);
    ctx.lineTo(650, 640);
    ctx.stroke();
    image(s, ctx, "rocket/stage5.png", 825, 205, 250, 271);
    image(s, ctx, "miner/drill-side/frame00.png", 765, 430, 120, 120);
    text(ctx, "STRANDED // MINING WORLD 07", 720, 115, 14, teal);
    text(ctx, "DEPTH IS CHEAP.", 720, 160, 29, gold);
    text(ctx, "HEIGHT IS EXPENSIVE.", 720, 197, 29, gold);
    text(ctx, "Dig. Sell. Build your way off the rock.", 720, 602, 16, ink);
    text(ctx, "A lone prospector. A planet’s last light.", 720, 630, 14, dim);
  }
  text(ctx, "D E E P   /   S P A C E   I N D U S T R I E S", 100, 82, 12, teal);
  const heading =
    s.screen === "title"
      ? C.TITLE_TEXT
      : s.screen === "mode-select"
        ? "CHOOSE YOUR RISK"
        : s.screen === "size-select"
          ? "CHOOSE YOUR DEPTH"
          : s.screen === "how-to-play"
            ? "FIELD MANUAL"
            : s.screen === "paused"
              ? "TRANSMISSION HELD"
              : s.screen === "victory"
                ? "YOU MADE IT HOME"
                : "SIGNAL LOST";
  text(
    ctx,
    heading,
    94,
    170,
    s.screen === "title" ? 76 : 38,
    gold,
    "sans-serif",
  );
  if (s.screen === "title") {
    text(ctx, "THE ONLY WAY OUT IS THROUGH.", 100, 220, 18, ink);
    text(ctx, "A subterranean dig-and-build expedition", 100, 252, 15, dim);
    text(ctx, "↑ ↓  SELECT    ENTER  CONFIRM", 100, 630, 13, dim);
    text(ctx, "01 / DEEPCORE", 100, 667, 11, teal);
  }
  if (s.screen === "mode-select") {
    text(ctx, "STANDARD  •  restore the last surface save", 100, 235, 15);
    text(ctx, "HARDCORE  •  death deletes your save", 100, 265, 15, "#e29d78");
  }
  if (s.screen === "size-select") {
    text(ctx, "QUICK  1250m   /   STANDARD  2500m", 100, 235, 15);
    text(
      ctx,
      "MARATHON  5000m   •   The same brutal economy.",
      100,
      266,
      14,
      dim,
    );
  }
  if (s.screen === "how-to-play") {
    const lines = [
      "A / D  move & drill sideways    S  drill down",
      "W / SPACE  jetpack    E  enter building / save",
      "I  cargo & supplies    P / ESC  pause    M  mute",
      "Fill your hold, climb home, sell, buy fuel & upgrades.",
      "The drill never cuts up. Keep a shaft open to return.",
      "Slots limit cargo; weight limits lift. Drop ore with I.",
      "Gas wisps warn of blasts. Lava burns. Brake hard falls.",
      "Find Resonite & Cryenite with an upgraded scanner.",
      "Build five rocket parts. Fetch the Core Sample last:",
      "you have 90 seconds to install it. J  jettisons it.",
      "Save at the surface pad. Standard restores that save;",
      "Hardcore death erases it. Launch to escape.",
    ];
    lines.forEach((l, i) =>
      text(ctx, l, 100, 223 + i * 28, 13, i % 2 ? dim : ink),
    );
  }
  if (s.summary) {
    const q = s.summary;
    text(
      ctx,
      `${Math.floor(q.deepestDepthMeters)} m deepest  /  ${q.creditsEarned} CR earned`,
      100,
      226,
      18,
      ink,
    );
    text(
      ctx,
      `${Math.floor(q.elapsedSeconds / 60)}m ${Math.floor(q.elapsedSeconds % 60)}s  •  ${q.mode.toUpperCase()}  •  ${q.componentsInstalled}/5 parts`,
      100,
      260,
      16,
      dim,
    );
    if (q.deathCause)
      text(
        ctx,
        q.deathCause.replace(/-/g, " ").toUpperCase(),
        100,
        292,
        15,
        "#ef9b7c",
      );
  }
  for (const [i, label] of menu(s).entries()) {
    const r = menuRect(s, i);
    if (!r) continue;
    const active = i === s.menuIndex;
    box(
      ctx,
      r.x,
      r.y,
      r.w,
      r.h,
      active ? "#29434c" : "#102633",
      active ? gold : "#2f4a56",
    );
    if (active) {
      ctx.fillStyle = gold;
      ctx.fillRect(r.x, r.y, 4, r.h);
    }
    text(
      ctx,
      (active ? "›  " : "   ") + label,
      r.x + 20,
      r.y + 33,
      18,
      active ? gold : dim,
    );
  }
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  world(s, ctx);
  if (s.screen === "in-mine") {
    hud(s, ctx);
    panels(s, ctx);
    if (!s.panel) {
      text(
        ctx,
        "A D  MOVE / CUT    S  DIG    SPACE  THRUST    E  INTERACT    I  CARGO",
        27,
        696,
        12,
        dim,
      );
      const sc = scanner(s);
      if (sc.locked) {
        box(ctx, 915, 78, 330, 56, "#102b35");
        text(
          ctx,
          `${sc.target?.toUpperCase()}  ${sc.distanceTiles?.toFixed(1)} tiles`,
          935,
          102,
          16,
          teal,
        );
        text(ctx, "MATERIAL LOCK / FOLLOW BEARING", 935, 121, 12, dim);
        ctx.save();
        ctx.translate(1213, 105);
        ctx.strokeStyle = teal;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.rotate(Math.atan2(sc.dirY, sc.dirX));
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.lineTo(12, 0);
        ctx.lineTo(5, -6);
        ctx.moveTo(12, 0);
        ctx.lineTo(5, 6);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (s.satchel.coreSample && s.coreTimer !== null) {
      box(ctx, 415, 76, 450, 66, "#3b2d31", "#df9566");
      text(
        ctx,
        `CORE UNSTABLE  ${s.coreTimer.toFixed(1)}s`,
        435,
        107,
        26,
        gold,
      );
      text(ctx, "RETURN TO LAUNCH PAD   •   J TO JETTISON", 435, 129, 13, ink);
    }
    if (s.notice?.shown) {
      box(ctx, 300, 595, 680, 90, "#203640", gold);
      text(
        ctx,
        s.notice.hazard === "gas"
          ? "VOLATILE GAS / watch for the pale seep."
          : "MOLTEN ROCK / fit a radiator before the next run.",
        320,
        625,
        17,
        gold,
      );
      text(
        ctx,
        s.notice.hazard === "gas"
          ? "Gas ignores cooling. Upgrade the hull or plan around it."
          : "Heat drains hull. Drill around pools, not through them.",
        320,
        654,
        14,
        ink,
      );
    }
    if (s.noteTime > 0) {
      box(ctx, 360, 645, 560, 33, "#102734");
      text(ctx, s.note, 380, 667, 14, teal);
    }
  } else if (s.screen === "victory" && s.launchAge < 3) {
    text(ctx, "LAUNCH SEQUENCE / ALL SYSTEMS NOMINAL", 100, 120, 24, gold);
  } else menus(s, ctx);
}
