import { describe, expect, it } from "vitest";
import { shareOf, sum12, yoy } from "../src/stats.js";

const monthly = (from: string, values: number[]) => {
  const [y0, m0] = from.split("-").map(Number);
  return values.map((value, i) => {
    const m = m0 - 1 + i;
    return { date: `${y0 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`, value };
  });
};

describe("stats transforms", () => {
  it("yoy compares with the same month a year earlier", () => {
    const pts = monthly("2024-01", Array.from({ length: 14 }, (_, i) => 100 + i * 10));
    const r = yoy(pts);
    expect(r.map((p) => p.date)).toEqual(["2025-01-01", "2025-02-01"]);
    expect(r[0].value).toBeCloseTo((220 / 100 - 1) * 100, 10);
  });

  it("sum12 needs 12 consecutive months", () => {
    const pts = monthly("2025-01", Array.from({ length: 13 }, () => -2));
    const r = sum12(pts);
    expect(r).toEqual([
      { date: "2025-12-01", value: -24 },
      { date: "2026-01-01", value: -24 },
    ]);
    expect(sum12(pts.filter((p) => p.date !== "2025-06-01"))).toEqual([]);
  });

  it("shareOf divides summed series on common months", () => {
    const raw = {
      A: monthly("2026-01", [10, 20]),
      B: monthly("2026-01", [5, 5]),
      C: monthly("2026-01", [85]),
    };
    expect(shareOf(raw, ["A", "B"], ["A", "B", "C"])).toEqual([{ date: "2026-01-01", value: 15 }]);
  });
});
