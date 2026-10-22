import { afterEach, describe, expect, it, vi } from "vitest";
import { GREETING, marketBrief, rateLimiter, safeFunds } from "../src/advisor.js";
import { createApp } from "../src/app.js";
import type { FundListItem } from "../src/funds.js";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fund = (code: string, over: Partial<FundListItem>): FundListItem => ({
  code, name: `${code} FON`, type: null, risk: 1, size: 1e9, investors: 1000, price: 1, date: "2026-10-21",
  return1m: 3, return3m: 9, return1y: 45, tefas: true, ...over,
});

describe("safeFunds", () => {
  it("lists big money market funds by 1-month return, then other risk 1-2 funds", () => {
    const funds = [
      fund("AAA", { type: "Para Piyasası Şemsiye Fonu", return1m: 3.1 }),
      fund("BBB", { type: "Para Piyasası Şemsiye Fonu", return1m: 3.4 }),
      fund("TINY", { type: "Para Piyasası Şemsiye Fonu", return1m: 9, size: 1e6 }), // too small
      fund("BOND", { type: "Borçlanma Araçları Şemsiye Fonu", risk: 2, return1m: 3.0 }),
      fund("EQ", { type: "Hisse Senedi Şemsiye Fonu", risk: 6, return1m: 8 }),
    ];
    const { moneyMarket, lowRisk } = safeFunds(funds);
    expect(moneyMarket.map((f) => f.code)).toEqual(["BBB", "AAA"]);
    expect(lowRisk.map((f) => f.code)).toEqual(["BOND"]);
  });
});

describe("marketBrief", () => {
  it("writes rates, deposit rates, inflation, funds and taxes in Turkish", () => {
    const days = (n: number, start: number, step: number) =>
      Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 1) + i * 86400000).toISOString().slice(0, 10), value: start + i * step }));
    const brief = marketBrief(
      {
        fx: { source: "x", usd: days(400, 40, 0.02), eur: days(400, 47, 0.03), spread: { USD: 0.18, EUR: 0.2 } },
        deposit: { TRY: { upTo3Months: { rate: 43.4, date: "2026-10-09" } }, USD: { upTo3Months: { rate: 1 } }, EUR: {} },
        indicators: { cpi: { label: "", series: "", points: days(14, 100, 2) }, fundingCost: { label: "", series: "", points: [{ date: "2026-10-20", value: 37 }] } },
        funds: [fund("PPF", { type: "Para Piyasası Şemsiye Fonu", return1m: 3.2, return1y: 48.5 })],
      },
      new Date("2026-10-22T09:00:00Z"),
    );
    expect(brief).toContain("Bugün: 2026-10-22.");
    expect(brief).toMatch(/USD\/TRY: 47,9800 .*Son 30 gün \+/);
    expect(brief).toContain("- TRY: 3 aya kadar %43,40.");
    expect(brief).toContain("TCMB ortalama fonlama faizi: %37,00.");
    expect(brief).toMatch(/PPF PPF FON \(risk 1\): 1 ay %3,20, 1 yıl %48,50/);
    expect(brief).toContain("Döviz mevduatı stopajı %25");
  });
});

describe("rateLimiter", () => {
  it("allows `limit` calls per window and per id", () => {
    const allow = rateLimiter(2, 1000);
    expect([allow("a", 0), allow("a", 10), allow("a", 20), allow("b", 20), allow("a", 1500)]).toEqual([true, true, false, true, true]);
  });
});

describe("POST /api/advisor/session", () => {
  it("is closed without an OpenAI key", async () => {
    const res = await createApp("", { openaiKey: "" }).request("/api/advisor/session", { method: "POST" });
    expect(res.status).toBe(503);
  });

  it("needs the app token when one is set", async () => {
    const res = await createApp("", { openaiKey: "sk", appToken: "t" }).request("/api/advisor/session", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("asks OpenAI for a realtime client secret with today's data and the tools", async () => {
    let sent: { session: { model: string; instructions: string; tools: { name: string }[]; audio: { output: { voice: string } } } } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/realtime/client_secrets")) {
          expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
          sent = JSON.parse(String(init?.body));
          return json({ value: "ek_123", expires_at: 1792800000 });
        }
        return json({}, 500); // market data down: the call still starts with a shorter brief
      }),
    );
    const res = await createApp("", { openaiKey: "sk-test", appToken: "t" }).request("/api/advisor/session", {
      method: "POST",
      headers: { "x-finans-app": "t" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: "ek_123", expiresAt: 1792800000, model: "gpt-realtime-2.1", greeting: GREETING });
    expect(sent!.session.model).toBe("gpt-realtime-2.1");
    expect(sent!.session.tools.map((t) => t.name)).toEqual(["hesapla", "fon_ara"]);
    expect(sent!.session.instructions).toContain("sesli yatırım danışmanısın");
    expect(sent!.session.instructions).toContain("Döviz alırken %0,2 kambiyo vergisi");
  });

  it("limits calls per IP", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/realtime/client_secrets") ? json({ value: "ek" }) : json({}, 500))));
    const app = createApp("", { openaiKey: "sk" });
    const call = () => app.request("/api/advisor/session", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } });
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });
});
