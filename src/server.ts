import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { discoverSeries } from "./evds.js";
import { fetchIndicators } from "./indicators.js";
import { fetchDepositRates } from "./sources.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp().fetch, port }, () => console.log(`http://localhost:${port}`));

// Startup self-check: one log line per EVDS series, so wrong codes show up in the Render log.
const key = process.env.EVDS_API_KEY;
if (key) {
  void (async () => {
    const deposit = await fetchDepositRates(key).catch((err: Error) => err.message);
    console.log("[evds-check] deposit", JSON.stringify(deposit));
    for (const [id, r] of Object.entries(await fetchIndicators(key))) {
      const last = r.points?.at(-1);
      console.log(`[evds-check] ${id} ${r.series || "-"}: ${r.error ?? `${r.points!.length} points, last ${last!.date} = ${last!.value}`}`);
    }
    if (process.env.EVDS_DISCOVER === "1") {
      await discoverSeries(key, [
        "Piyasa Katılımcıları",
        "Hanehalkı",
        "Rezerv",
        "Döviz Tevdiat",
        "Yabancı Para Mevduat",
        "Reel Efektif",
        "Fonlama",
        "Mevduat Faiz",
        "Gösterge",
        "Devlet İç Borçlanma",
      ]).catch((err: Error) => console.log("[evds-discover] failed:", err.message));
    }
  })();
}
