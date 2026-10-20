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
          { Tarih: "17-10-2026", TP_DK_USD_A_YTL: "42.0", TP_DK_EUR_A_YTL: "49.0" },
          { Tarih: "18-10-2026", TP_DK_USD_A_YTL: null, TP_DK_EUR_A_YTL: null },
          { Tarih: "20-10-2026", TP_DK_USD_A_YTL: "42.2", TP_DK_EUR_A_YTL: "49.3" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = await (await createApp("secret").request("/api/fx")).json();
    expect(fetchMock.mock.calls[0][0]).toContain("evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.A.YTL-TP.DK.EUR.A.YTL");
    expect(body.source).toMatch(/EVDS/);
    expect(body.usd).toEqual([
      { date: "2026-10-17", value: 42 },
      { date: "2026-10-20", value: 42.2 },
    ]);
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

  it("returns the latest value of each deposit series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: [
            { Tarih: "03-10-2026", TP_TRY_MT02: "39.1", TP_TRY_MT03: "40.2" },
            { Tarih: "10-10-2026", TP_TRY_MT02: "38.9", TP_TRY_MT03: null },
          ],
        }),
      ),
    );
    const body = await (await createApp("k").request("/api/deposit-rate")).json();
    expect(body.rates.upTo1Month).toEqual({ series: "TP.TRY.MT02", date: "2026-10-10", rate: 38.9 });
    expect(body.rates.upTo3Months).toEqual({ series: "TP.TRY.MT03", date: "2026-10-03", rate: 40.2 });
  });
});
