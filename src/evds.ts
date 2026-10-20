// TCMB EVDS REST client. The API key goes in the `key` request header.

export type Point = { date: string; value: number }; // date as YYYY-MM-DD

export const EVDS_URL = process.env.EVDS_BASE_URL ?? "https://evds3.tcmb.gov.tr/igmevdsms-dis";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const evdsDay = (d: Date) => isoDay(d).split("-").reverse().join("-"); // DD-MM-YYYY

/** EVDS dates: "20-10-2026" (daily/weekly), "2026-9" (monthly), "2026-Q3" (quarterly). */
export function parseEvdsDate(raw: string): string | null {
  let m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = raw.match(/^(\d{4})-?Q([1-4])$/);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  return null;
}

export async function evdsSeries(codes: string[], start: Date, end: Date, key: string) {
  const url = `${EVDS_URL}/series=${codes.join("-")}&startDate=${evdsDay(start)}&endDate=${evdsDay(end)}&type=json`;
  const res = await fetch(url, { headers: { key } });
  if (!res.ok) throw new Error(`EVDS ${res.status} for ${codes.join(",")}`);
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  const out: Record<string, Point[]> = Object.fromEntries(codes.map((c) => [c, []]));
  for (const item of body.items ?? []) {
    const date = parseEvdsDate(String(item.Tarih));
    if (!date) continue;
    for (const code of codes) {
      const raw = item[code.replaceAll(".", "_")];
      const value = raw == null || raw === "" ? NaN : Number(raw);
      if (Number.isFinite(value)) out[code].push({ date, value });
    }
  }
  return out;
}

async function evdsMeta(path: string, key: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${EVDS_URL}/${path}`, { headers: { key } });
  if (!res.ok) throw new Error(`EVDS meta ${res.status} for ${path}`);
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

/**
 * Logs EVDS series to help find codes: for each [group keyword, series keyword] pair, lists the series
 * in non-archive data groups whose names match both. Enable with EVDS_DISCOVER=1 and read the server log.
 */
export async function discoverSeries(key: string, queries: [string, string][], log = console.log) {
  const lower = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr-TR");
  const groups = (await evdsMeta("datagroups/mode=0&type=json", key)).filter((g) => !lower(g.DATAGROUP_NAME).includes("arşiv"));
  log(`[evds-discover] ${groups.length} active data groups`);
  for (const [groupWord, seriesWord] of queries) {
    const hits = groups.filter((g) => lower(g.DATAGROUP_NAME).includes(lower(groupWord))).slice(0, 8);
    log(`[evds-discover] "${groupWord}" / "${seriesWord}": ${hits.length} group(s)`);
    for (const g of hits) {
      log(`[evds-discover]   group ${g.DATAGROUP_CODE} | ${g.DATAGROUP_NAME} | freq ${g.FREQUENCY_STR ?? g.FREQUENCY ?? "?"}`);
      try {
        const series = (await evdsMeta(`serieList/type=json&code=${g.DATAGROUP_CODE}`, key)).filter((s) =>
          lower(s.SERIE_NAME).includes(lower(seriesWord)),
        );
        for (const s of series.slice(0, seriesWord ? 8 : 40)) log(`[evds-discover]     ${s.SERIE_CODE} | ${s.SERIE_NAME}`);
        // Full metadata of the first match, to see fields such as the unit.
        if (series[0]) log(`[evds-discover]     meta ${JSON.stringify(series[0])}`);
      } catch (err) {
        log(`[evds-discover]     series list failed: ${(err as Error).message}`);
      }
    }
  }
}
