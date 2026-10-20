import { describe, expect, it } from "vitest";
import {
  roundTrip,
  breakEvenRate,
  changeOver,
  daysUntilYearEnd,
  inflationStats,
  percentileOf,
  projectToTarget,
  rateDirection,
  compareOptions,
  convert,
  netInterestFactor,
  projectRate,
  tlStopajForDays,
  trendStats,
  verdict,
} from "../public/calc.js";

// Daily series that grows by `daily` per day for `days` days, ending on 2026-10-20.
function series(days, start, dailyFn) {
  const out = [];
  let v = start;
  for (let i = days; i >= 0; i--) {
    const date = new Date(Date.UTC(2026, 9, 20) - i * 86400000).toISOString().slice(0, 10);
    out.push({ date, value: v });
    v *= dailyFn(i);
  }
  return out;
}

describe("trendStats", () => {
  it("finds a steady trend as the same speed", () => {
    const s = trendStats(series(400, 30, () => 1.001));
    expect(s.lastMonth).toBeCloseTo(Math.pow(1.001, 30) - 1, 6);
    expect(s.prevAvg).toBeCloseTo(s.lastMonth, 6);
    expect(s.yearChange).toBeCloseTo(Math.pow(1.001, 365) - 1, 6);
    expect(s.verdict).toBe("same");
    expect(s.months).toHaveLength(12);
  });

  it("detects acceleration in the last 30 days", () => {
    const s = trendStats(series(400, 30, (daysLeft) => (daysLeft <= 30 ? 1.003 : 1.001)));
    expect(s.verdict).toBe("faster");
  });

  it("detects slowdown in the last 30 days", () => {
    const s = trendStats(series(400, 30, (daysLeft) => (daysLeft <= 30 ? 1.0002 : 1.001)));
    expect(s.verdict).toBe("slower");
  });

  it("uses the last rate before a missing day (weekends)", () => {
    const full = series(400, 30, () => 1.001);
    const gappy = full.filter((p) => ![0, 6].includes(new Date(p.date).getUTCDay()));
    const s = trendStats(gappy);
    expect(s.lastMonth).toBeGreaterThan(0.02);
    expect(s.lastMonth).toBeLessThan(0.04);
  });
});

describe("verdict", () => {
  it("handles a flat previous average", () => {
    expect(verdict(0.01, 0)).toBe("faster");
    expect(verdict(-0.01, 0)).toBe("slower");
    expect(verdict(0.0005, 0)).toBe("same");
  });
});

describe("interest", () => {
  it("applies withholding by term", () => {
    expect(tlStopajForDays(32)).toBe(17.5);
    expect(tlStopajForDays(182)).toBe(17.5);
    expect(tlStopajForDays(183)).toBe(15);
    expect(tlStopajForDays(366)).toBe(10);
  });

  it("computes net simple interest", () => {
    // 1,000,000 TL, 40% yearly, 32 days, 17.5% stopaj
    const net = 1_000_000 * netInterestFactor(40, 17.5, 32);
    expect(net).toBeCloseTo(1_000_000 + 1_000_000 * 0.4 * (32 / 365) * 0.825, 2);
  });
});

describe("convert", () => {
  const rates = { USD: 40, EUR: 50 };
  it("costs half the spread per leg", () => {
    expect(convert(100, "USD", "TRY", rates, 1)).toBeCloseTo(100 * 40 * 0.995, 6);
    expect(convert(4000, "TRY", "USD", rates, 1)).toBeCloseTo(4000 / (40 * 1.005), 6);
    expect(convert(100, "USD", "USD", rates, 1)).toBe(100);
  });
});

describe("compareOptions", () => {
  const base = {
    amount: 1_000_000,
    days: 32,
    tlRate: 40,
    tlStopaj: 17.5,
    fxRate: 0,
    fxStopaj: 25,
    spread: 0,
    now: { USD: 40, EUR: 50 },
  };

  it("TL input: flat FX makes the TL deposit win", () => {
    const r = compareOptions({ ...base, currency: "TRY", end: { USD: 40, EUR: 50 } });
    expect(r.TRY.final).toBeCloseTo(1_000_000 * netInterestFactor(40, 17.5, 32), 4);
    expect(r.USD.final).toBeCloseTo(1_000_000, 4);
    expect(r.TRY.final).toBeGreaterThan(r.USD.final);
  });

  it("TL input: a big FX rise makes USD win", () => {
    const r = compareOptions({ ...base, currency: "TRY", end: { USD: 44, EUR: 50 } });
    expect(r.USD.final).toBeCloseTo(1_100_000, 4);
    expect(r.USD.final).toBeGreaterThan(r.TRY.final);
  });

  it("USD input: staying in USD keeps the amount, TL deposit is measured back in USD", () => {
    const r = compareOptions({ ...base, amount: 10_000, currency: "USD", end: { USD: 41, EUR: 50 } });
    expect(r.USD.final).toBe(10_000);
    expect(r.TRY.final).toBeCloseTo((10_000 * 40 * netInterestFactor(40, 17.5, 32)) / 41, 4);
    expect(r.TRY.tlValue).toBeCloseTo(r.TRY.final * 41, 4);
  });

  it("break-even rate makes TL and USD equal", () => {
    const input = { ...base, currency: "TRY", spread: 1, fxRate: 1 };
    const be = breakEvenRate(40, input);
    const r = compareOptions({ ...input, end: { USD: be, EUR: 50 } });
    expect(r.USD.final).toBeCloseTo(r.TRY.final, 4);
  });
});

describe("projectRate", () => {
  it("compounds daily growth", () => {
    expect(projectRate(40, 1.001, 30)).toBeCloseTo(40 * Math.pow(1.001, 30), 10);
  });
});

describe("compareOptions extras", () => {
  const base = {
    amount: 1_000_000,
    currency: "TRY",
    days: 30,
    tlRate: 40,
    tlStopaj: 17.5,
    fxRate: 0,
    fxStopaj: 25,
    spread: 0,
    now: { USD: 40, EUR: 50 },
    end: { USD: 40, EUR: 50 },
  };

  it("adds the bond option only when a bond rate is set", () => {
    expect(compareOptions(base).BOND).toBeUndefined();
    const r = compareOptions({ ...base, bondRate: 38, bondStopaj: 0 });
    expect(r.BOND.final).toBeCloseTo(1_000_000 * netInterestFactor(38, 0, 30), 4);
    // 38% with no stopaj beats 40% with 17.5% stopaj
    expect(r.BOND.final).toBeGreaterThan(r.TRY.final);
  });

  it("computes the real return after inflation", () => {
    const r = compareOptions({ ...base, monthlyInflation: 2 });
    expect(r.TRY.realPct).toBeCloseTo(netInterestFactor(40, 17.5, 30) / 1.02 - 1, 8);
    expect(r.USD.realPct).toBeCloseTo(1 / 1.02 - 1, 8);
    expect(compareOptions(base).TRY.realPct).toBeNull();
  });

  it("measures the real return in TL for a USD amount", () => {
    const r = compareOptions({ ...base, amount: 1000, currency: "USD", end: { USD: 42, EUR: 50 }, monthlyInflation: 2 });
    expect(r.USD.realPct).toBeCloseTo((1000 * 42) / (1000 * 40) / 1.02 - 1, 8);
  });
});

describe("indicator helpers", () => {
  const monthly = (values) => values.map((value, i) => ({ date: `2025-${String(i + 1).padStart(2, "0")}-01`, value }));

  it("projects toward a target rate", () => {
    expect(projectToTarget(40, 44, 70, 70)).toBeCloseTo(44, 10);
    expect(projectToTarget(40, 44, 70, 0)).toBeCloseTo(40, 10);
    expect(projectToTarget(40, 44, 70, 35)).toBeCloseTo(40 * Math.sqrt(1.1), 10);
  });

  it("counts days to year end", () => {
    expect(daysUntilYearEnd("2026-10-20")).toBe(72);
    expect(daysUntilYearEnd("2026-12-31")).toBe(0);
  });

  it("computes monthly and annual inflation from an index", () => {
    const idx = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 125.0];
    const pts = idx.map((value, i) => ({ date: `20${i < 12 ? "25" : "26"}-${String((i % 12) + 1).padStart(2, "0")}-01`, value }));
    const s = inflationStats(pts);
    expect(s.monthly).toBeCloseTo(125 / 122 - 1, 10);
    expect(s.annual).toBeCloseTo(0.25, 10);
    expect(inflationStats(pts.slice(0, 5)).annual).toBeNull();
  });

  it("finds the rate direction over 90 days", () => {
    const pts = [
      { date: "2026-07-01", value: 45 },
      { date: "2026-10-20", value: 41 },
    ];
    expect(rateDirection(pts, 90).direction).toBe("down");
    expect(rateDirection([pts[0], { date: "2026-10-20", value: 45.2 }], 90).direction).toBe("flat");
    expect(changeOver(pts, 90).diff).toBe(-4);
  });

  it("ranks a value in its history", () => {
    expect(percentileOf(monthly([1, 2, 3, 4]), 3)).toBe(0.75);
  });
});

describe("roundTrip (100,000 USD -> TL deposit -> USD)", () => {
  const input = {
    amount: 100_000,
    currency: "USD",
    days: 32,
    tlRate: 36,
    tlStopaj: 17.5,
    fxRate: 4,
    fxStopaj: 25,
    spread: 1,
    fxBuyTax: 0.2,
    now: { USD: 42, EUR: 49 },
  };
  const end = { USD: 43, EUR: 49 };
  const r = roundTrip(input, end, "TRY");

  it("walks every step by hand", () => {
    const tl = 100_000 * 42 * 0.995; // sell USD at the bank's buying rate
    expect(r.out.net).toBeCloseTo(tl, 6);
    expect(r.out.spreadCostTl).toBeCloseTo(100_000 * 42 * 0.005, 6);
    expect(r.grossInterest).toBeCloseTo((tl * 0.36 * 32) / 365, 6);
    expect(r.stopajAmount).toBeCloseTo(r.grossInterest * 0.175, 6);
    const maturity = tl + r.grossInterest * 0.825;
    expect(r.atMaturity).toBeCloseTo(maturity, 6);
    // buy USD back at the selling rate, paying 0.2% kambiyo vergisi on the purchase
    expect(r.back.taxTl).toBeCloseTo(maturity - maturity / 1.002, 6);
    expect(r.final).toBeCloseTo(maturity / 1.002 / (43 * 1.005), 6);
    expect(r.stay).toBeCloseTo(100_000 * (1 + 0.04 * (32 / 365) * 0.75), 6);
    expect(r.diff).toBeCloseTo(r.final - r.stay, 6);
  });

  it("matches compareOptions", () => {
    const c = compareOptions({ ...input, end });
    expect(c.TRY.final).toBeCloseTo(r.final, 6);
    expect(c.USD.final).toBeCloseTo(r.stay, 6);
  });

  it("break-even for an FX holder makes both paths equal", () => {
    const be = breakEvenRate(42, input, true);
    const atBe = roundTrip(input, { USD: be, EUR: 49 }, "TRY");
    expect(atBe.final).toBeCloseTo(atBe.stay, 4);
  });

  it("break-even for a TL holder includes the purchase tax", () => {
    const tlInput = { ...input, amount: 4_200_000, currency: "TRY" };
    const be = breakEvenRate(42, tlInput, false);
    const atBe = roundTrip(tlInput, { USD: be, EUR: 49 }, "USD");
    expect(atBe.final).toBeCloseTo(atBe.stay, 2);
  });
});
