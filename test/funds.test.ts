import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { mergeFundList, monthlyReturns, typeFromName } from "../src/funds.js";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("monthlyReturns", () => {
  it("uses the last price of each month and annualizes by days", () => {
    const m = monthlyReturns([
      { date: "2026-01-15", price: 99 },
      { date: "2026-01-30", price: 100 },
      { date: "2026-02-27", price: 103 },
      { date: "2026-03-31", price: 106.09 },
    ]);
    expect(m.map((x) => x.month)).toEqual(["2026-02", "2026-03"]);
    expect(m[0].pct).toBeCloseTo(3, 6);
    expect(m[0].days).toBe(28);
    expect(m[0].annualized).toBeCloseTo((Math.pow(1.03, 365 / 28) - 1) * 100, 6);
    // Same 3 % over a longer month gives a lower annual rate.
    expect(m[1].pct).toBeCloseTo(3, 6);
    expect(m[1].annualized).toBeLessThan(m[0].annualized);
    expect(m[1].partial).toBe(false);
  });

  it("marks the last month as partial when it ends well before the month end", () => {
    const m = monthlyReturns([
      { date: "2026-09-30", price: 100 },
      { date: "2026-10-22", price: 102 },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].partial).toBe(true);
  });

  it("returns nothing for a single month", () => {
    expect(monthlyReturns([{ date: "2026-10-01", price: 1 }, { date: "2026-10-02", price: 1.01 }])).toEqual([]);
  });
});

describe("mergeFundList", () => {
  it("joins prices with TEFAS type, risk and returns; guesses the type for other funds", () => {
    const list = mergeFundList(
      [
        { fonKodu: "FI5", fonUnvan: "QNB PORTFÖY PARA PİYASASI (TL) FONU", tarih: "2026-10-21T00:00:00", fiyat: 788.3, kisiSayisi: 10, portfoyBuyukluk: 1.1e11 },
        { fonKodu: "AAL", fonUnvan: "ATA PORTFÖY PARA PİYASASI (TL) FONU", tarih: "2026-10-21", fiyat: 3.7, kisiSayisi: 4232, portfoyBuyukluk: 1.7e9 },
      ],
      [{ fonKodu: "AAL", fonUnvan: "ATA PORTFÖY PARA PİYASASI (TL) FONU", fonTurAciklama: "Para Piyasası Şemsiye Fonu", riskDegeri: "1", getiri1a: 3.1, getiri3a: 10, getiri1y: 47.1 }],
    );
    expect(list.map((f) => f.code)).toEqual(["AAL", "FI5"]);
    expect(list[0]).toMatchObject({ risk: 1, tefas: true, return1m: 3.1, return3m: 10, return1y: 47.1, date: "2026-10-21" });
    expect(list[1]).toMatchObject({ risk: null, return1m: null, tefas: false, type: "Para Piyasası Şemsiye Fonu", date: "2026-10-21" });
  });

  it("guesses types from Turkish names", () => {
    expect(typeFromName("X PORTFÖY HİSSE SENEDİ FONU")).toBe("Hisse Senedi Şemsiye Fonu");
    expect(typeFromName("X PORTFÖY ALTIN FONU")).toBe("Kıymetli Madenler Şemsiye Fonu");
    expect(typeFromName("X PORTFÖY BİRİNCİ FON")).toBeNull();
  });
});

describe("/api/funds", () => {
  it("returns the merged list and posts to TEFAS", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      if (url.endsWith("/api/funds/fonGnlBlgSiraliGetir"))
        return json({ resultList: [{ fonKodu: "AAL", fonUnvan: "ATA PORTFÖY PARA PİYASASI (TL) FONU", tarih: "2026-10-21", fiyat: 3.7, kisiSayisi: 1, portfoyBuyukluk: 1 }] });
      if (url.endsWith("/api/funds/fonGetiriBazliBilgiGetir"))
        return json({ resultList: [{ fonKodu: "AAL", fonUnvan: "ATA", fonTurAciklama: "Para Piyasası Şemsiye Fonu", riskDegeri: "1", getiri1y: 47 }] });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await createApp("").request("/api/funds");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funds).toHaveLength(1);
    expect(body.funds[0]).toMatchObject({ code: "AAL", risk: 1 });
  });

  it("goes back day by day until TEFAS has prices", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("fonGnlBlgSiraliGetir")) {
          calls++;
          return json(calls < 3 ? { resultList: [], errorMessage: "Index 0 out of bounds for length 0" } : { resultList: [{ fonKodu: "AAL", fonUnvan: "ATA", tarih: "2026-10-16", fiyat: 1, kisiSayisi: 1, portfoyBuyukluk: 1 }] });
        }
        return json({ resultList: [] });
      }),
    );
    const body = await (await createApp("").request("/api/funds")).json();
    expect(calls).toBe(3);
    expect(body.funds[0].code).toBe("AAL");
  });

  it("returns 502 when TEFAS answers with a bot-check page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>blocked</html>", { status: 200 })));
    const res = await createApp("").request("/api/funds");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/alınamadı/);
  });
});

describe("/api/funds/:code", () => {
  it("returns daily prices and monthly returns", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ fonKodu: "FI5", periyod: 12 });
      return json({
        resultList: [
          { fonKodu: "FI5", fonUnvan: "QNB PP", tarih: "2026-09-30", fiyat: 100 },
          { fonKodu: "FI5", fonUnvan: "QNB PP", tarih: "2026-08-31", fiyat: 97 },
          { fonKodu: "FI5", fonUnvan: "QNB PP", tarih: "2026-10-22", fiyat: 102 },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await createApp("").request("/api/funds/fi5")).json();
    expect(body.name).toBe("QNB PP");
    expect(body.points.map((p: { date: string }) => p.date)).toEqual(["2026-08-31", "2026-09-30", "2026-10-22"]);
    expect(body.months).toHaveLength(2);
    expect(body.months[1].partial).toBe(true);
  });

  it("rejects bad codes without calling TEFAS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await createApp("").request("/api/funds/abc-def!");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the fund has no prices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ resultList: [] })));
    const res = await createApp("").request("/api/funds/ZZZ");
    expect(res.status).toBe(404);
  });
});
