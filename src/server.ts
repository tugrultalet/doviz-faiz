import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { discoverSeries } from "./evds.js";
import { fetchGold } from "./gold.js";
import { fetchIndicators } from "./indicators.js";
import { fetchDepositRates, fetchFx } from "./sources.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp().fetch, port }, () => console.log(`http://localhost:${port}`));

// Startup self-check: one log line per EVDS series, so wrong codes show up in the Render log.
const key = process.env.EVDS_API_KEY;
if (key) {
  void (async () => {
    const fx = await fetchFx(key).catch((err: Error) => ({ source: err.message, usd: [], eur: [], spread: null }));
    console.log(`[evds-check] fx ${fx.source}: usd ${fx.usd.length} pts, last ${JSON.stringify(fx.usd.at(-1))}, spread ${JSON.stringify(fx.spread)}`);
    const deposit = await fetchDepositRates(key).catch((err: Error) => err.message);
    console.log("[evds-check] deposit", JSON.stringify(deposit));
    for (const [id, r] of Object.entries(await fetchIndicators(key))) {
      const last = r.points?.at(-1);
      console.log(`[evds-check] ${id} ${r.series || "-"}: ${r.error ?? `${r.points!.length} points, last ${last!.date} = ${last!.value}`}`);
    }
    const gold = await fetchGold(key).catch((err: Error) => err.message);
    console.log(
      "[evds-check] gold",
      typeof gold === "string" ? gold : `${JSON.stringify(gold?.series)}: ${gold?.points.length} months, first ${JSON.stringify(gold?.points[0])}, last ${JSON.stringify(gold?.points.at(-1))}`,
    );
    if (process.env.EVDS_DISCOVER === "1") {
      await discoverSeries(key, [
        ["Altın Fiyatları", ""],
      ]).catch((err: Error) => console.log("[evds-discover] failed:", err.message));
    }
  })();
}
