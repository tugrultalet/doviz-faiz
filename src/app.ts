import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { fetchIndicators } from "./indicators.js";
import { fetchDepositRates, fetchFx } from "./sources.js";

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

  app.get("/api/indicators", async (c) => c.json({ available: Boolean(key), indicators: await indicators() }));

  app.use("/*", serveStatic({ root: "./public" }));
  return app;
}
