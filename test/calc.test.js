import { describe, expect, it } from "vitest";
import {
  breakEvenRate,
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
