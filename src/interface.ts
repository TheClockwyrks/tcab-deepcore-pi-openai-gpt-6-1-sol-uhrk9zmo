import * as C from "./constants";
import {
  type State,
  type ReadState,
  slots,
  loadKg,
  maxFuel,
  maxHull,
} from "./model";
import { type Transaction, transact, start, resume, canUse } from "./rules";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Control extends Rect {
  id: string;
  subject: string | null;
  label: string;
  enabled: boolean;
  detail?: string;
}
export function menu(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (index < 0 || index >= menu(s).length) return null;
  return {
    x: 100,
    y: (s.screen === "how-to-play" ? 605 : 340) + index * 64,
    w: 475,
    h: 52,
  };
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const list: Control[] = [
    {
      id: "inventory",
      subject: null,
      label: "I  CARGO",
      enabled: true,
      x: 1012,
      y: 10,
      w: 100,
      h: 36,
    },
    {
      id: "pause",
      subject: null,
      label: "II",
      enabled: true,
      x: 1122,
      y: 10,
      w: 48,
      h: 36,
    },
    {
      id: "mute",
      subject: null,
      label: s.muted ? "OFF" : "♪",
      enabled: true,
      x: 1182,
      y: 10,
      w: 64,
      h: 36,
    },
  ];
  const add = (
    id: string,
    subject: string | null,
    label: string,
    enabled: boolean,
    detail?: string,
  ) => {
    list.push({
      id,
      subject,
      label,
      enabled,
      detail,
      x: 805,
      y: 190 + (list.length - 3) * 49,
      w: 295,
      h: 38,
    });
  };
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        null,
        `+${C.FUEL_BUY_INCREMENT} FUEL • ${C.FUEL_BUY_INCREMENT * C.FUEL_PRICE} CR`,
        s.credits >=
          Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
            C.FUEL_PRICE && s.miner.fuel < maxFuel(s),
      );
      add(
        "fill-fuel",
        null,
        "FILL TANK",
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "buy-repair",
        null,
        `+${C.REPAIR_BUY_INCREMENT} HULL • ${C.REPAIR_BUY_INCREMENT * C.REPAIR_PRICE} CR`,
        s.credits >=
          Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
            C.REPAIR_PRICE && s.miner.hull < maxHull(s),
      );
      add(
        "repair-full",
        null,
        "FULL REPAIR",
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      break;
    case "ore-market":
      add(
        "sell",
        null,
        C.SELL,
        slots(s) > 0,
        `${C.MINERALS.reduce((a, o) => a + o.value * (s.cargo[o.id] ?? 0), 0)} Credits`,
      );
      break;
    case "upgrade-shop":
      for (const t of C.TRACKS) {
        const tier = s.tiers[t],
          price = C.UPGRADE_PRICES[tier - 1];
        const next =
          t === "fuel"
            ? `${C.FUEL_TIERS[tier]} fuel`
            : t === "hull"
              ? `${C.HULL_TIERS[tier]} hull`
              : t === "cargo"
                ? `${C.CARGO_TIERS[tier]} slots`
                : t === "drill"
                  ? `power ${tier + 1}`
                  : t === "jetpack"
                    ? `${C.JETPACK_TIERS[tier]?.liftLimitKg} kg lift`
                    : t === "radiator"
                      ? `${(C.RADIATOR_TIERS[tier] ?? 0) * 100}% cooling`
                      : `${C.SCANNER_TIERS[tier]} tiles range`;
        add(
          "buy-upgrade",
          t,
          `${t.toUpperCase()} ${tier} → ${tier < C.MAX_TIER[t] ? tier + 1 : "MAX"}`,
          tier < C.MAX_TIER[t] && s.credits >= price,
          tier < C.MAX_TIER[t] ? `${next} • ${price} CR` : "Fully upgraded",
        );
      }
      break;
    case "supply-depot":
      for (const i of C.ITEMS)
        add(
          "buy-item",
          i.id,
          `${i.name} • ${s.items[i.id]} held`,
          s.credits >= i.price,
          `${i.price} CR`,
        );
      break;
    case "launch-pad": {
      const c = C.ROCKET_COMPONENTS[s.installed];
      add(
        c ? "fabricate" : "launch",
        null,
        c ? C.FABRICATE : C.LAUNCH,
        !c ||
          (s.credits >= c.credits &&
            (!c.material ||
              (c.material === "core-sample"
                ? s.satchel.coreSample
                : s.satchel[c.material] > 0))),
        c ? `${c.name} • ${c.credits} CR` : "All systems ready",
      );
      break;
    }
    case "inventory":
      for (const o of C.MINERALS)
        if (s.cargo[o.id])
          add(
            "drop-ore",
            o.id,
            `DROP ${o.name} × ${s.cargo[o.id]}`,
            true,
            `${o.weightKg} kg / unit`,
          );
      for (const i of C.ITEMS)
        if (s.items[i.id])
          add(
            "use-item",
            i.id,
            `${C.USE} ${i.name} × ${s.items[i.id]}`,
            canUse(s, i.id),
          );
      if (s.satchel.coreSample) add("jettison", null, C.JETTISON, true);
      break;
  }
  // Inventory rows pack into two columns so even a completely full hold fits.
  if (s.panel === "inventory")
    for (let i = 3; i < list.length; i++) {
      const n = i - 3;
      list[i].x = 170 + Math.floor(n / 10) * 470;
      list[i].y = 180 + (n % 10) * 43;
      list[i].w = 440;
      list[i].h = 34;
    }
  if (s.notice?.shown)
    list.push({
      id: "dismiss-notice",
      subject: null,
      label: "DISMISS",
      enabled: true,
      x: 300,
      y: 595,
      w: 680,
      h: 100,
    });
  return list;
}
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function back(s: State): State {
  if (s.screen === "paused") {
    s.screen = "in-mine";
    s.menuIndex = 0;
  } else if (s.screen === "in-mine") {
    if (s.panel) s.panel = null;
    else {
      s.screen = "paused";
      s.menuIndex = 0;
    }
  } else if (s.screen === "size-select") {
    s.screen = "mode-select";
    s.menuIndex = C.MODES.indexOf(s.mode);
  } else if (["how-to-play", "mode-select"].includes(s.screen)) {
    const how = s.screen === "how-to-play";
    s.screen = "title";
    s.menuIndex = (s.hasSave ? 1 : 0) + (how ? 1 : 0);
  }
  return s;
}
export function choose(s: State): State {
  const label = menu(s)[s.menuIndex];
  if (s.screen === "title") {
    if (label === "CONTINUE") return resume(s);
    s.screen = label === "HOW TO PLAY" ? "how-to-play" : "mode-select";
  } else if (s.screen === "mode-select") {
    if (s.menuIndex === 2) return back(s);
    s.mode = C.MODES[s.menuIndex];
    s.screen = "size-select";
  } else if (s.screen === "size-select") {
    if (s.menuIndex === 3) return back(s);
    s.worldSize = C.WORLD_SIZES[s.menuIndex];
    return start(s);
  } else if (s.screen === "how-to-play") return back(s);
  else if (s.screen === "paused") {
    if (s.menuIndex === 0) s.screen = "in-mine";
    else if (s.menuIndex === 1) return start(s);
    else {
      s.screen = "title";
      s.menuIndex = s.hasSave ? 1 : 0;
      return s;
    }
  } else if (s.screen === "game-over" || s.screen === "victory") {
    if (s.menuIndex === 0)
      return label === "CONTINUE FROM SAVE" ? resume(s) : start(s);
    s.screen = "title";
    s.menuIndex = s.hasSave ? 1 : 0;
    return s;
  }
  s.menuIndex = 0;
  return s;
}
export function controlAction(
  s: State,
  id: string,
  subject: string | null,
): void {
  if (id === "inventory")
    s.panel = s.panel === "inventory" ? null : "inventory";
  else if (id === "pause") back(s);
  else if (id !== "mute") transact(s, id as Transaction, subject);
}
export function inventoryInfo(s: ReadState): string {
  return `${slots(s)} / ${C.CARGO_TIERS[s.tiers.cargo - 1]} slots   •   ${loadKg(s)} kg   •   Resonite ${s.satchel.resonite} / Cryenite ${s.satchel.cryenite}`;
}
