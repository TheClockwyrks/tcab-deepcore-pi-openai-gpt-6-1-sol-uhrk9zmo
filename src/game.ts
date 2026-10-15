import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { type State, copy, initial, buildings, effect, depth } from "./model";
import { debug, snapshot } from "./debug";
import { advance, camera, hasSave, transact, checkDeath } from "./rules";
import {
  menu,
  menuRect,
  controls,
  contains,
  choose,
  back,
  controlAction,
} from "./interface";
import { render, BACKGROUND } from "./render";
export { BACKGROUND };
export type DeepcoreState = State;
export type DeepcoreDebugApi = typeof debug;
// Vite emits every committed file. No asset-generation executable runs in a build.
const files = import.meta.glob("../assets/**/*.{png,wav,json}", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
}) as Record<string, string>;
function assetPath(url: string): string {
  // A relative-base Vite bundle may express an emitted URL via import.meta.url.
  // Give the engine only its path under assets/, never that absolute URL.
  const marker = url.lastIndexOf("/assets/");
  return marker >= 0
    ? url.slice(marker + "/assets/".length)
    : url.replace(/^assets\//, "");
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const state = initial();
    state.hasSave = hasSave();
    await Promise.all(
      Object.entries(files).map(async ([key, url]) => {
        const path = key.replace("../assets/", "");
        if (path.endsWith(".png"))
          state.images[path] = await api.assets.loadImage(assetPath(url));
        else if (path.endsWith(".json"))
          state.systems[path.replace("fx/", "").replace(".json", "")] =
            JSON.parse(
              await (await api.assets.load(assetPath(url))).text(),
            ) as State["systems"][string];
        else if (path.endsWith(".wav"))
          await api.audio.load(
            path.replace("audio/", "").replace(".wav", ""),
            assetPath(url),
          );
      }),
    );
    for (const name of [
      "screen",
      "panel",
      "mode",
      "worldSize",
      "credits",
      "depthMeters",
      "coreTimer",
      "tiers",
      "satchel",
      "scanner",
      "cargo",
    ] as const)
      api.diagnostics.register(name, (s) => {
        const v = snapshot(s)[name];
        return typeof v === "string" || typeof v === "number"
          ? v
          : JSON.stringify(v);
      });
    for (const name of [
      "x",
      "y",
      "vx",
      "vy",
      "state",
      "facing",
      "grounded",
      "fuel",
      "maxFuel",
      "hull",
      "maxHull",
      "overloaded",
      "drilling",
    ] as const)
      api.diagnostics.register("miner." + name, (s) => {
        const v = snapshot(s).miner[name];
        return typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
          ? v
          : JSON.stringify(v);
      });
    camera(state, 0);
    return [state, debug];
  },
  update(state, api, dt) {
    let s = copy(state);
    s.simTime += dt;
    checkDeath(s);
    if (state.screen === "in-mine" && s.screen !== "in-mine") {
      api.audio.play(C.CUES.death);
      api.audio.stop(C.CUES.drill);
      api.audio.stop(C.CUES.thrust);
      s.muted = api.audio.muted();
      return s;
    }
    if (s.screen === "victory") {
      s.launchAge += dt;
      if (
        s.launchAge < 3 &&
        Math.floor(s.launchAge * 10) !== Math.floor(state.launchAge * 10)
      )
        effect(
          s,
          "launch-exhaust",
          buildings[5].x + 135,
          buildings[5].y -
            87 +
            (225 * 227) / 260 -
            s.launchAge * s.launchAge * 150,
        );
    }
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    api.audio.loop(C.CUES.music);
    s.fx = s.fx
      .map((f) => ({ ...f, age: f.age + dt }))
      .filter(
        (f) =>
          f.age <
          Math.max(
            ...(s.systems[f.name]?.emitters.map(
              (e) => (e.lifetimeMs + (e.lifetimeSpread ?? 0)) / 1000,
            ) ?? [2.6]),
          ) +
            0.1,
      );
    s.shake = Math.max(0, s.shake - dt);
    s.noteTime = Math.max(0, s.noteTime - dt);
    const hitControls = controls(s);
    const items = menu(s);
    let confirm = false;
    for (const p of api.input.pointerSamples()) {
      const i = items.findIndex((_, i) => {
        const r = menuRect(s, i);
        return r && contains(r, p.x, p.y);
      });
      if (i >= 0 && (p.type === "move" || p.type === "down")) s.menuIndex = i;
      const c = hitControls.find((c) => c.enabled && contains(c, p.x, p.y));
      if (c && c.y > 100 && p.type === "move")
        s.panelIndex = hitControls
          .filter((c) => c.y > 100 && c.enabled)
          .indexOf(c);
      const building =
        s.screen === "in-mine" && !s.panel
          ? buildings.find(
              (b) =>
                contains(
                  {
                    x: b.x - s.camera.x,
                    y: b.y - s.camera.y + C.HUD_H,
                    w: b.w,
                    h: b.h,
                  },
                  p.x,
                  p.y,
                ) &&
                s.miner.x + C.MINER_W > b.x &&
                s.miner.x < b.x + b.w &&
                depth(s) < 1,
            )
          : null;
      if (p.type === "down") {
        s.presses[p.id] =
          i >= 0
            ? `menu:${i}`
            : c
              ? `${c.id}:${c.subject ?? ""}`
              : building
                ? `building:${building.id}`
                : "";
        if (c?.id === "dismiss-notice") s.notice = null;
      }
      if (p.type === "up") {
        const was = s.presses[p.id];
        delete s.presses[p.id];
        if (i >= 0 && was === `menu:${i}`) {
          s.menuIndex = i;
          confirm = true;
        } else if (c && was === `${c.id}:${c.subject ?? ""}`) {
          if (c.id === "mute") api.audio.setMuted(!api.audio.muted());
          else controlAction(s, c.id, c.subject);
        } else if (s.screen === "in-mine" && !s.panel) {
          const b = buildings.find(
            (b) =>
              contains(
                {
                  x: b.x - s.camera.x,
                  y: b.y - s.camera.y + C.HUD_H,
                  w: b.w,
                  h: b.h,
                },
                p.x,
                p.y,
              ) &&
              s.miner.x + C.MINER_W > b.x &&
              s.miner.x < b.x + b.w &&
              depth(s) < 1,
          );
          if (b && was === `building:${b.id}`) {
            if (b.id === "save-pad") transact(s, "save");
            else s.panel = b.id;
          }
        }
      }
    }
    if (s.screen !== "in-mine") {
      if (api.input.pressed("down") && items.length)
        s.menuIndex = (s.menuIndex + 1) % items.length;
      if (api.input.pressed("up") && items.length)
        s.menuIndex = (s.menuIndex + items.length - 1) % items.length;
      if (api.input.pressed("pause")) s = back(s);
      else if (confirm || api.input.pressed("activate")) s = choose(s);
    } else {
      checkDeath(s);
      if (s.screen === "in-mine") {
        if (api.input.pressed("pause")) s = back(s);
        if (api.input.pressed("inventory"))
          s.panel = s.panel === "inventory" ? null : "inventory";
        if (s.panel) {
          const available = controls(s).filter((c) => c.y > 100 && c.enabled);
          if (available.length) {
            if (api.input.pressed("down"))
              s.panelIndex = (s.panelIndex + 1) % available.length;
            if (api.input.pressed("up"))
              s.panelIndex =
                (s.panelIndex + available.length - 1) % available.length;
          }
        } else s.panelIndex = 0;
        if (api.input.pressed("jettison")) transact(s, "jettison");
        for (const [i, item] of C.ITEM_IDS.entries())
          if (api.input.pressed(`supply${i + 1}`))
            transact(s, "use-item", item);
        if (api.input.pressed("activate")) {
          if (s.panel) {
            const available = controls(s).filter((c) => c.y > 100 && c.enabled);
            const selected = available[s.panelIndex % available.length];
            if (selected) controlAction(s, selected.id, selected.subject);
          } else if (depth(s) < 0.1) {
            const b = buildings.find(
              (b) => s.miner.x + C.MINER_W > b.x && s.miner.x < b.x + b.w,
            );
            if (b) {
              if (b.id === "save-pad") transact(s, "save");
              else s.panel = b.id;
            }
          }
        }
        if (s.screen === "in-mine")
          s = advance(
            s,
            {
              left: api.input.value("left"),
              right: api.input.value("right"),
              down: api.input.value("down"),
              up: api.input.value("up"),
            },
            dt,
          );
      }
    }
    const drill = s.screen === "in-mine" && !s.panel && !!s.miner.drilling;
    const thrust =
      s.screen === "in-mine" && !s.panel && s.miner.state === "jetpack";
    for (const [cue, on] of [
      [C.CUES.drill, drill],
      [C.CUES.thrust, thrust],
      [
        C.CUES.alarmFuel,
        s.screen === "in-mine" &&
          s.miner.fuel < C.FUEL_TIERS[s.tiers.fuel - 1] * C.LOW_FUEL_FRACTION,
      ],
    ] as const) {
      if (on) api.audio.loop(cue);
      else api.audio.stop(cue);
    }
    const cueByFx: Record<string, C.CueName> = {
      "ore-sparkle": C.CUES.orePickup,
      "material-shimmer": C.CUES.materialChime,
      "gas-explosion": C.CUES.gasExplosion,
      "lava-embers": C.CUES.lavaSizzle,
      "impact-dust": C.CUES.impact,
      "core-extract": C.CUES.materialChime,
      "core-detonation": C.CUES.gasExplosion,
      "launch-exhaust": C.CUES.launch,
      "death-burst": C.CUES.death,
    };
    for (const f of s.fx)
      if (f.id > state.serial && cueByFx[f.name])
        api.audio.play(cueByFx[f.name]);
    if (s.credits < state.credits) api.audio.play(C.CUES.fabricate);
    if (
      s.coreTimer !== null &&
      s.screen === "in-mine" &&
      Math.floor(s.simTime * (s.coreTimer < 15 ? 4 : 1)) !==
        Math.floor(state.simTime * (s.coreTimer < 15 ? 4 : 1))
    )
      api.audio.play(C.CUES.alarmCore);
    // The rocket itself takes over the pad on victory; its exhaust continues to play.
    if (s.screen === "victory" && state.screen !== "victory")
      effect(s, "launch-exhaust", 1935, C.SURFACE_Y);
    s.muted = api.audio.muted();
    return s;
  },
  render,
};
