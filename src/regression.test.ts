import { describe, expect, it } from "vitest";
import { initial, tile, emptyGrid } from "./model";
import { advance, camera } from "./rules";
import { debug } from "./debug";
import * as C from "./constants";
const still = { left: 0, right: 0, down: 0, up: 0 };
function bore() {
  let s = debug.setScreen(initial(), "in-mine");
  s = debug.setTile(s, 4, 1, "rock");
  s = debug.setTile(s, 4, 2, "rock");
  return s;
}
describe("regressions and invariants", () => {
  it("can stop halfway down a face and jet out through the excavated space", () => {
    let s = bore();
    s = advance(s, { ...still, down: 1 }, 0.45);
    const y = s.miner.y;
    expect(y).toBeGreaterThan(C.SURFACE_Y - C.MINER_H);
    s = advance(s, still, 0.025);
    expect(s.miner.y).toBeCloseTo(y, 5);
    s = advance(s, { ...still, up: 1 }, 0.3);
    expect(s.miner.y).toBeLessThan(y);
    expect(tile(s, 4, 1).health).toBe(1);
  });
  it("unwinds through zero before ramping in the opposite camera direction", () => {
    const a = bore(),
      b = bore();
    a.camera.lead = C.CAM_LEAD_MAX;
    b.camera.lead = C.CAM_LEAD_MAX;
    a.miner.vy = -100;
    b.miner.vy = -100;
    camera(a, 1);
    for (let i = 0; i < 60; i++) camera(b, 1 / 60);
    expect(a.camera.lead).toBeCloseTo(b.camera.lead, 8);
    expect(a.camera.lead).toBeCloseTo(-C.CAM_LEAD_MAX / 4, 8);
  });
  it("reports every snapshot field and rejects undefined debug states", () => {
    let s = bore();
    s = debug.setFacing(s, "west");
    s = debug.setMinerVelocity(s, 3, 4);
    s = debug.setElapsed(s, 34);
    s = debug.setCameraLead(s, -100);
    s = debug.setNoticeFired(s, "gas", true);
    s = debug.setItemCount(s, "dynamite", 2);
    expect(debug.snapshot(s).items.dynamite).toBe(2);
    expect(debug.buildings(s)).toHaveLength(6);
    expect(debug.findTile(s, "core")).toEqual({
      col: C.CORE_COL,
      row: C.STANDARD_ROWS,
    });
    expect(() => debug.setCredits(s, -1)).toThrow();
    expect(() => debug.setCargo(s, "ferron", 1.5)).toThrow();
    expect(() => debug.setCoreTimer(s, 2)).toThrow();
    expect(() => debug.setCameraLead(s, 999)).toThrow();
    expect(() => debug.setNextTeleportHeight(s, 0)).toThrow();
    s = debug.clearCargo(debug.clearItems(s));
    expect(debug.snapshot(s).cargo.slotsUsed).toBe(0);
    expect(debug.snapshot(s).items.dynamite).toBe(0);
  });
  it("raises the same band quotas across repeated randomized Quick mines", () => {
    for (let i = 0; i < 4; i++) {
      const s = debug.generateMine(debug.setWorldSize(initial(), "quick"));
      for (const band of C.BANDS.slice(1)) {
        const cells = s.grid
          .flat()
          .filter((t) => t.band === band && t.kind !== "bedrock");
        for (const kind of ["stone", "gas"] as const) {
          const lo = kind === "stone" ? C.STONE_DENSITY_MIN : C.GAS_DENSITY_MIN,
            hi = kind === "stone" ? C.STONE_DENSITY_MAX : C.GAS_DENSITY_MAX;
          const rows = s.grid
            .map((row, r) => (row[1].band === band ? r : 0))
            .filter(Boolean);
          const f =
            rows.reduce((n, r) => n + (r - 1) / (s.coreRow - 1), 0) /
            rows.length;
          const expected = lo + ((hi - lo) * (f - 0.25)) / 0.75;
          expect(
            cells.filter((t) => t.kind === kind).length / cells.length,
          ).toBeGreaterThan(expected * (1 - C.DENSITY_TOLERANCE));
        }
      }
    }
  });
  it("resizes the border without regenerating terrain and leaves the original grid independent", () => {
    const s = initial();
    const t = debug.setWorldSize(s, "quick");
    expect(t.grid.length).toBe(251);
    expect(s.grid.length).toBe(501);
    expect(emptyGrid(250)[250][C.CORE_COL].kind).toBe("core");
  });
});
