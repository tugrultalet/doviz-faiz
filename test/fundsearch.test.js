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
