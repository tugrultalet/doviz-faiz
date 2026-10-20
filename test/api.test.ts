import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("/api/fx", () => {
  it("uses Frankfurter when there is no EVDS key", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const base = new URL(url).searchParams.get("base");
      return json({ rates: { "2026-10-19": { TRY: base === "USD" ? 42 : 49 }, "2026-10-20": { TRY: base === "USD" ? 42.1 : 49.2 } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await createApp("").request("/api/fx");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toMatch(/frankfurter/);
    expect(body.usd).toEqual([
      { date: "2026-10-19", value: 42 },
      { date: "2026-10-20", value: 42.1 },
    ]);
    expect(body.eur.at(-1).value).toBe(49.2);
  });

  it("uses EVDS with the key in the header and skips empty days", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).key).toBe("secret");
      return json({
        items: [
          { Tarih: "17-10-2026", TP_DK_USD_A_YTL: "42.0", TP_DK_USD_S_YTL: "42.2", TP_DK_EUR_A_YTL: "49.0", TP_DK_EUR_S_YTL: "49.2" },
          { Tarih: "18-10-2026", TP_DK_USD_A_YTL: null, TP_DK_USD_S_YTL: null, TP_DK_EUR_A_YTL: null, TP_DK_EUR_S_YTL: null },
          { Tarih: "20-10-2026", TP_DK_USD_A_YTL: "42.2", TP_DK_USD_S_YTL: "42.4", TP_DK_EUR_A_YTL: "49.3", TP_DK_EUR_S_YTL: "49.5" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = await (await createApp("secret").request("/api/fx")).json();
    expect(fetchMock.mock.calls[0][0]).toContain("evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.A.YTL-TP.DK.USD.S.YTL-TP.DK.EUR.A.YTL-TP.DK.EUR.S.YTL");
    expect(body.source).toMatch(/EVDS/);
    expect(body.usd).toEqual([
      { date: "2026-10-17", value: 42.1 },
      { date: "2026-10-20", value: 42.3 },
    ]);
    expect(body.spread.USD).toBeCloseTo((0.2 / 42.3) * 100, 6);
  });

  it("returns 502 with a Turkish message when all sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    const res = await createApp("").request("/api/fx");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/alınamadı/);
  });
});

describe("/api/deposit-rate", () => {
  it("reports unavailable without a key", async () => {
    const body = await (await createApp("").request("/api/deposit-rate")).json();
    expect(body).toEqual({ available: false, rates: null });
  });

  it("returns the latest savings deposit rate per currency and term", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: [
            { Tarih: "03-10-2026", TP_TRYTAS_MT01: "44.1", TP_TRYTAS_MT02: "42.5", TP_USDTAS_MT02: "1.9" },
            { Tarih: "10-10-2026", TP_TRYTAS_MT01: "43.9", TP_TRYTAS_MT02: null, TP_USDTAS_MT02: "1.8" },
          ],
        }),
      ),
    );
    const { rates } = await (await createApp("k").request("/api/deposit-rate")).json();
    expect(rates.TRY.upTo1Month).toMatchObject({ series: "TP.TRYTAS.MT01", date: "2026-10-10", rate: 43.9 });
    expect(rates.TRY.upTo3Months).toMatchObject({ series: "TP.TRYTAS.MT02", date: "2026-10-03", rate: 42.5 });
    expect(rates.USD.upTo3Months.rate).toBe(1.8);
    expect(rates.EUR.upTo3Months.rate).toBeUndefined();
  });
});

describe("/api/indicators", () => {
  it("marks every indicator as no-key without a key", async () => {
    const body = await (await createApp("").request("/api/indicators")).json();
    expect(body.available).toBe(false);
    expect(body.indicators.cpi).toMatchObject({ series: "TP.TUKFIY2025.GENEL", error: "no-key" });
  });

  it("parses monthly EVDS dates and reports unconfigured and failing series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("TP.TUKFIY2025.GENEL")) return json({ items: [{ Tarih: "2026-8", TP_TUKFIY2025_GENEL: "130" }, { Tarih: "2026-9", TP_TUKFIY2025_GENEL: "132.6" }] });
        if (url.includes("TP.APIFON4")) return json({}, 500);
        return json({ items: [] });
      }),
    );
    const { indicators } = await (await createApp("k").request("/api/indicators")).json();
    expect(indicators.cpi.points).toEqual([
      { date: "2026-08-01", value: 130 },
      { date: "2026-09-01", value: 132.6 },
    ]);
    expect(indicators.fundingCost.error).toMatch(/EVDS 500/);
    expect(indicators.reer.error).toBe("empty");
    expect(indicators.expUsdYearEnd.error).toBe("not-configured");
    expect(indicators.reserves.error).toBe("empty");
  });
});

describe("/api/gold", () => {
  it("needs an EVDS key", async () => {
    const res = await createApp("").request("/api/gold");
    expect(res.status).toBe(503);
  });

  it("merges monthly TL/gram and USD/ounce series by month", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        items: [
          { Tarih: "1950-12", TP_MK_KUL_YTL: "0.0000045", TP_MK_LON_YTL: null },
          { Tarih: "2026-4", TP_MK_KUL_YTL: "6100", TP_MK_LON_YTL: "3900" },
          { Tarih: "2026-5", TP_MK_KUL_YTL: "6200", TP_MK_LON_YTL: "3950" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await createApp("k").request("/api/gold")).json();
    const url = fetchMock.mock.calls[0][0] as unknown as string;
    expect(url).toContain("series=TP.MK.KUL.YTL-TP.MK.LON.YTL");
    expect(url).toContain("startDate=01-01-1950");
    expect(url).toContain("&frequency=5&aggregationTypes=avg-avg");
    expect(body.points).toEqual([
      { date: "1950-12-01", tlGram: 0.0000045, usdOunce: null },
      { date: "2026-04-01", tlGram: 6100, usdOunce: 3900 },
      { date: "2026-05-01", tlGram: 6200, usdOunce: 3950 },
    ]);
  });
});

describe("/api/stats", () => {
  it("returns every chart definition with data, keeping failures per chart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("TP.TG2.Y01")) return json({ items: [{ Tarih: "2026-8", TP_TG2_Y01: "84.1" }] });
        if (url.includes("TP.TIG08")) return json({}, 500);
        return json({ items: [] });
      }),
    );
    const { charts } = await (await createApp("k").request("/api/stats")).json();
    const conf = charts.find((c: { id: string }) => c.id === "consumer-confidence");
    expect(conf.title).toBe("Tüketici güven endeksi");
    expect(conf.reference.value).toBe(100);
    expect(conf.series[0].points.at(-1)).toEqual({ date: "2026-08-01", value: 84.1 });
    expect(charts.find((c: { id: string }) => c.id === "unemployment").error).toMatch(/EVDS 500/);
  });
});
