import { Hono, type Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { GREETING, createRealtimeSecret, marketBrief, rateLimiter } from "./advisor.js";
import { FUND_CODE, fetchFundHistory, fetchFundList } from "./funds.js";
import { fetchGold } from "./gold.js";
import { fetchIndicators } from "./indicators.js";
import { fetchDepositRates, fetchFx } from "./sources.js";
import { STAT_CHARTS, fetchStats } from "./stats.js";

const TTL_MS = 60 * 60 * 1000;

// Small in-memory cache so every page view does not hit the upstream APIs.
function cached<T>(load: () => Promise<T>) {
  let value: { at: number; data: T } | null = null;
  return async () => {
    if (value && Date.now() - value.at < TTL_MS) return value.data;
    const data = await load();
    value = { at: Date.now(), data };
    return data;
  };
}

/**
 * Lets a CDN in front of the API (Netlify) keep a good answer for the same hour as the
 * in-memory cache. Serverless instances are short-lived, so their own cache often starts empty.
 * Other hosts ignore this header.
 */
function cdnCache(c: Context) {
  c.header("Netlify-CDN-Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400, durable");
}

type AppOptions = {
  /** false: the API only, for hosts that serve public/ themselves (Netlify). */
  serveFiles?: boolean;
  /** OpenAI key for the voice advisor; without it the advisor answers 503. */
  openaiKey?: string;
  /** When set, the advisor answers only requests with this value in the x-finans-app header. */
  appToken?: string;
};

export function createApp(
  key = process.env.EVDS_API_KEY,
  { serveFiles = true, openaiKey = process.env.OPENAI_API_KEY, appToken = process.env.FINANS_APP_TOKEN }: AppOptions = {},
) {
  const app = new Hono();
  const fx = cached(() => fetchFx(key));
  const deposit = cached(() => fetchDepositRates(key));
  const indicators = cached(() => fetchIndicators(key));
  const gold = cached(() => fetchGold(key));
  const stats = cached(() => fetchStats(key));
  const funds = cached(() => fetchFundList());
  // One cache entry per fund; small and bounded by the number of funds people open.
  const fundHistory = new Map<string, () => Promise<Awaited<ReturnType<typeof fetchFundHistory>>>>();

  app.get("/api/fx", async (c) => {
    try {
      const data = await fx();
      cdnCache(c);
      return c.json(data);
    } catch (err) {
      console.error(err);
      return c.json({ error: "Kur verisi alınamadı. Daha sonra tekrar deneyin." }, 502);
    }
  });

  app.get("/api/deposit-rate", async (c) => {
    try {
      const rates = await deposit();
      if (key) cdnCache(c);
      return c.json({ available: Boolean(key), rates });
    } catch (err) {
      console.error(err);
      return c.json({ available: false, rates: null, error: "Faiz verisi alınamadı. Oranı elle girin." });
    }
  });

  app.get("/api/gold", async (c) => {
    try {
      const data = await gold();
      if (!data?.points.length) return c.json({ error: "Altın verisi yok. EVDS anahtarı gerekli." }, 503);
      cdnCache(c);
      return c.json(data);
    } catch (err) {
      console.error(err);
      return c.json({ error: "Altın verisi alınamadı. Daha sonra tekrar deneyin." }, 502);
    }
  });

  // Chart definitions (titles, explanations) plus their data.
  app.get("/api/stats", async (c) => {
    const data = await stats();
    if (!data) return c.json({ error: "İstatistik verisi yok. EVDS anahtarı gerekli." }, 503);
    const byId = new Map(data.map((d) => [d.id, d]));
    cdnCache(c);
    return c.json({
      charts: STAT_CHARTS.map(({ id, section, title, explain, unit, transform, reference }) => ({
        id, section, title, explain, unit, transform, reference, ...byId.get(id),
      })),
    });
  });

  // TEFAS investment funds: the list for the picker, then 12 months of prices for one fund.
  app.get("/api/funds", async (c) => {
    try {
      const list = await funds();
      cdnCache(c);
      return c.json({ source: "TEFAS (Takasbank)", funds: list });
    } catch (err) {
      console.error(err);
      return c.json({ error: "Fon listesi alınamadı. Daha sonra tekrar deneyin." }, 502);
    }
  });

  app.get("/api/funds/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!FUND_CODE.test(code)) return c.json({ error: "Geçersiz fon kodu." }, 400);
    let load = fundHistory.get(code);
    if (!load) {
      load = cached(() => fetchFundHistory(code, 12));
      fundHistory.set(code, load);
    }
    try {
      const data = await load();
      if (!data.points.length) {
        fundHistory.delete(code);
        return c.json({ error: "Bu fon için fiyat verisi yok." }, 404);
      }
      cdnCache(c);
      return c.json(data);
    } catch (err) {
      console.error(err);
      fundHistory.delete(code);
      return c.json({ error: "Fon verisi alınamadı. Daha sonra tekrar deneyin." }, 502);
    }
  });

  // Voice advisor: a short-lived OpenAI Realtime key plus today's data in the instructions.
  const advisorLimit = rateLimiter(10, 60 * 60 * 1000);
  app.post("/api/advisor/session", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!openaiKey) return c.json({ error: "Sesli danışman şu an kapalı." }, 503);
    if (appToken && c.req.header("x-finans-app") !== appToken) return c.json({ error: "Yetkisiz istek." }, 401);
    const ip = c.req.header("x-nf-client-connection-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
    if (!advisorLimit(ip)) return c.json({ error: "Çok fazla görüşme başlattınız. Biraz sonra tekrar deneyin." }, 429);
    // Missing data only makes the brief shorter; the call still starts.
    const [fxData, depositData, indicatorData, fundData] = await Promise.allSettled([fx(), deposit(), indicators(), funds()]);
    const value = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
    const brief = marketBrief({
      fx: value(fxData),
      deposit: value(depositData) as Parameters<typeof marketBrief>[0]["deposit"],
      indicators: value(indicatorData) ?? {},
      funds: value(fundData),
    });
    try {
      const secret = await createRealtimeSecret(openaiKey, brief);
      return c.json({ clientSecret: secret.value, expiresAt: secret.expiresAt, model: secret.model, greeting: GREETING });
    } catch (err) {
      console.error(err);
      return c.json({ error: "Danışmana bağlanılamadı. Daha sonra tekrar deneyin." }, 502);
    }
  });

  app.get("/api/indicators", async (c) => {
    const data = await indicators();
    if (key) cdnCache(c);
    return c.json({ available: Boolean(key), indicators: data });
  });

  if (!serveFiles) return app;

  // Always revalidate page files so phones do not keep an old CSS/JS after a deploy.
  app.use("/*", async (c, next) => {
    await next();
    if (!c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-cache");
  });
  app.use("/*", serveStatic({ root: "./public" }));
  return app;
}
