import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
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

export function createApp(key = process.env.EVDS_API_KEY) {
  const app = new Hono();
  const fx = cached(() => fetchFx(key));
  const deposit = cached(() => fetchDepositRates(key));
  const indicators = cached(() => fetchIndicators(key));
  const gold = cached(() => fetchGold(key));
  const stats = cached(() => fetchStats(key));

  app.get("/api/fx", async (c) => {
    try {
      return c.json(await fx());
    } catch (err) {
      console.error(err);
      return c.json({ error: "Kur verisi alınamadı. Daha sonra tekrar deneyin." }, 502);
    }
  });

  app.get("/api/deposit-rate", async (c) => {
    try {
      return c.json({ available: Boolean(key), rates: await deposit() });
    } catch (err) {
      console.error(err);
      return c.json({ available: false, rates: null, error: "Faiz verisi alınamadı. Oranı elle girin." });
    }
  });

  app.get("/api/gold", async (c) => {
    try {
      const data = await gold();
      if (!data?.points.length) return c.json({ error: "Altın verisi yok. EVDS anahtarı gerekli." }, 503);
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
    return c.json({
      charts: STAT_CHARTS.map(({ id, section, title, explain, unit, transform, reference }) => ({
        id, section, title, explain, unit, transform, reference, ...byId.get(id),
      })),
    });
  });

  app.get("/api/indicators", async (c) => c.json({ available: Boolean(key), indicators: await indicators() }));

  // Always revalidate page files so phones do not keep an old CSS/JS after a deploy.
  app.use("/*", async (c, next) => {
    await next();
    if (!c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-cache");
  });
  app.use("/*", serveStatic({ root: "./public" }));
  return app;
}
