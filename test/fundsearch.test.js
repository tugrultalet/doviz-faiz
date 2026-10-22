import { describe, expect, it } from "vitest";
import { cumulativeCurve, indexFunds, normalizeTr, returnOverDays, searchFunds, typeMatches } from "../public/fundsearch.js";

const FUNDS = [
  { code: "FI5", name: "QNB PORTFÖY PARA PİYASASI (TL) FONU", type: "Para Piyasası Şemsiye Fonu", size: 1.1e11 },
  { code: "FSK", name: "QNB PORTFÖY İKİNCİ PARA PİYASASI (TL) FONU", type: "Para Piyasası Şemsiye Fonu", size: 5e9 },
  { code: "AFT", name: "AK PORTFÖY YENİ TEKNOLOJİLER YABANCI HİSSE SENEDİ FONU", type: "Hisse Senedi Şemsiye Fonu", size: 2e10 },
  { code: "FI", name: "TEST FONU", type: null, size: 1 },
];
const index = indexFunds(FUNDS);

describe("normalizeTr", () => {
  it("removes Turkish accents and dotted capitals", () => {
    expect(normalizeTr("PARA PİYASASI İKİNCİ Şekerbank ĞÜÖÇ")).toBe("para piyasasi ikinci sekerbank guoc");
  });
});

describe("searchFunds", () => {
  it("finds funds by words typed without Turkish letters, largest first", () => {
    const r = searchFunds(index, "qnb para piyasasi");
    expect(r.items.map((f) => f.code)).toEqual(["FI5", "FSK"]);
  });

  it("puts the exact code first, then code prefixes", () => {
    expect(searchFunds(index, "fi").items.map((f) => f.code)).toEqual(["FI", "FI5"]);
  });

  it("lists the largest funds for an empty query and filters by type", () => {
    expect(searchFunds(index, "").items[0].code).toBe("FI5");
    expect(searchFunds(index, "", { typeId: "equity" }).items.map((f) => f.code)).toEqual(["AFT"]);
    expect(searchFunds(index, "", { typeId: "pp" }).total).toBe(2);
  });

  it("limits the result list but reports the total", () => {
    const r = searchFunds(index, "", { limit: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(4);
  });

  it("does not match a fund without a type to a type filter", () => {
    expect(typeMatches(FUNDS[3], "pp")).toBe(false);
    expect(typeMatches(FUNDS[3], "all")).toBe(true);
  });
});

describe("curve helpers", () => {
  const pts = [
    { date: "2025-10-22", price: 100 },
    { date: "2026-07-22", price: 130 },
    { date: "2026-09-22", price: 140 },
    { date: "2026-10-22", price: 145 },
  ];

  it("builds the total return curve from the first price", () => {
    expect(cumulativeCurve(pts).map((p) => Math.round(p.pct))).toEqual([0, 30, 40, 45]);
  });

  it("measures the return over the last N days", () => {
    expect(returnOverDays(pts, 30)).toBeCloseTo((145 / 140 - 1) * 100, 6);
    expect(returnOverDays(pts, 91)).toBeCloseTo((145 / 130 - 1) * 100, 6);
    expect(returnOverDays(pts, 400)).toBeNull();
  });
});

describe("comparison helpers", () => {
  const a = { points: [{ date: "2026-01-02", price: 100 }, { date: "2026-01-05", price: 110 }], months: [{ month: "2026-01", pct: 3, partial: false, annualized: 40 }] };
  const b = { points: [{ date: "2026-01-02", price: 10 }, { date: "2026-01-03", price: 10.5 }], months: [{ month: "2025-12", pct: 2, partial: false, annualized: 30 }, { month: "2026-01", pct: 4, partial: true, annualized: 50 }] };

  it("puts curves on the union of dates with gaps as null", async () => {
    const { alignCurves } = await import("../public/fundsearch.js");
    const r = alignCurves([a, b]);
    expect(r.dates).toEqual(["2026-01-02", "2026-01-03", "2026-01-05"]);
    expect(r.series[0].map((v) => (v == null ? null : Math.round(v)))).toEqual([0, null, 10]);
    expect(r.series[1].map((v) => (v == null ? null : Math.round(v)))).toEqual([0, 5, null]);
  });

  it("puts months on one axis", async () => {
    const { alignMonths } = await import("../public/fundsearch.js");
    const r = alignMonths([a, b]);
    expect(r.months).toEqual(["2025-12", "2026-01"]);
    expect(r.rows[0][0]).toBeNull();
    expect(r.rows[1][1].pct).toBe(4);
  });

  it("summarizes a fund, averaging only full months", async () => {
    const { fundSummary } = await import("../public/fundsearch.js");
    const s = fundSummary(b);
    expect(s.total).toBeCloseTo(5, 6);
    expect(s.avgAnnual).toBe(30);
  });
});

describe("topFunds", () => {
  const list = [
    { code: "A", name: "A", type: "Hisse Senedi Şemsiye Fonu", risk: 6, return1y: 80, return1m: -2 },
    { code: "B", name: "B", type: "Para Piyasası Şemsiye Fonu", risk: 1, return1y: 48, return1m: 3.2 },
    { code: "C", name: "C", type: "Para Piyasası Şemsiye Fonu", risk: 2, return1y: 46, return1m: 3.5 },
    { code: "D", name: "D", type: null, risk: null, return1y: null, return1m: null },
  ];

  it("ranks by the chosen period and skips funds without TEFAS data", async () => {
    const { topFunds } = await import("../public/fundsearch.js");
    expect(topFunds(list, { period: "1y" }).items.map((f) => f.code)).toEqual(["A", "B", "C"]);
    expect(topFunds(list, { period: "1m" }).items.map((f) => f.code)).toEqual(["C", "B", "A"]);
  });

  it("filters by risk group, type and limit", async () => {
    const { topFunds } = await import("../public/fundsearch.js");
    expect(topFunds(list, { riskId: "low" }).items.map((f) => f.code)).toEqual(["B", "C"]);
    expect(topFunds(list, { riskId: "high" }).items.map((f) => f.code)).toEqual(["A"]);
    expect(topFunds(list, { typeId: "pp", period: "1m", limit: 1 })).toMatchObject({ total: 2, items: [{ code: "C" }] });
  });
});
