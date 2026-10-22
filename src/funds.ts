// Investment fund data from TEFAS (Takasbank). The JSON endpoints behind tefas.gov.tr are public
// (no key) but not documented, so a site change can break them. TEFAS allows about 6 requests a minute.

export const TEFAS_URL = process.env.TEFAS_BASE_URL ?? "https://www.tefas.gov.tr";

export type FundListItem = {
  code: string;
  name: string;
  type: string | null; // e.g. "Para Piyasası Şemsiye Fonu"
  risk: number | null; // SPK risk value 1–7
  size: number | null; // portfolio size, TL
  investors: number | null;
  price: number | null;
  date: string | null; // YYYY-MM-DD of the price
  return1m: number | null; // % from TEFAS (only funds traded on TEFAS)
  return3m: number | null;
  return1y: number | null;
  tefas: boolean; // traded on TEFAS (has period returns and risk value)
};

export type PricePoint = { date: string; price: number };
export type MonthReturn = { month: string; end: string; pct: number; annualized: number; days: number; partial: boolean };

const HEADERS: Record<string, string> = {
  "content-type": "application/json",
  accept: "application/json",
  origin: TEFAS_URL,
  referer: `${TEFAS_URL}/tr`,
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
};

async function tefasPost<T>(path: string, body: unknown): Promise<T[]> {
  const res = await fetch(`${TEFAS_URL}${path}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`TEFAS ${res.status} for ${path}`);
  const text = await res.text();
  let json: { resultList?: T[]; errorMessage?: string | null };
  try {
    json = JSON.parse(text);
  } catch {
    // Bot protection answers with an HTML page instead of JSON.
    throw new Error(`TEFAS non-JSON answer for ${path}: ${text.slice(0, 80)}`);
  }
  const err = json.errorMessage;
  if (err && !/out of bounds|bulunamad/i.test(err)) throw new Error(`TEFAS error for ${path}: ${err}`);
  return json.resultList ?? [];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

type GeneralRow = { fonKodu: string; fonUnvan: string; tarih: string; fiyat: number; kisiSayisi: number; portfoyBuyukluk: number };
type ReturnRow = {
  fonKodu: string;
  fonUnvan: string;
  fonTurAciklama: string | null;
  riskDegeri: string | number | null;
  getiri1a?: number | null;
  getiri3a?: number | null;
  getiri1y: number | null;
};

/** Latest prices of all investment funds: tries today, then up to 7 days back (weekends, holidays). */
async function latestGeneral(now: Date): Promise<GeneralRow[]> {
  for (let back = 0; back <= 7; back++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - back);
    const rows = await tefasPost<GeneralRow>("/api/funds/fonGnlBlgSiraliGetir", {
      fonTipi: "YAT", fonKodu: null, aramaMetni: null, fonTurKod: null, fonGrubu: null, sfonTurKod: null,
      fonTurAciklama: null, kurucuKod: null, basTarih: ymd(d), bitTarih: ymd(d), basSira: 1, bitSira: 100000,
      dil: "TR", sFonTurKod: "", fonKod: "", fonGrup: "", fonUnvanTip: "",
    });
    if (rows.length) return rows;
  }
  return [];
}

/** Fund type, risk value and period returns of the funds traded on TEFAS. */
async function periodReturns(): Promise<ReturnRow[]> {
  return tefasPost<ReturnRow>("/api/funds/fonGetiriBazliBilgiGetir", {
    dil: "TR", fonTipi: "YAT", kurucuKodu: null, sfonTurKod: null, fonTurAciklama: null, islem: 1,
    fonTurKod: null, fonGrubu: null, donemGetiri1a: "1", donemGetiri3a: "1", donemGetiri6a: "1",
    donemGetiri1y: "1", donemGetiriyb: "1", donemGetiri3y: "1", donemGetiri5y: "1",
    basTarih: null, bitTarih: null, calismaTipi: 2, getiriOrani: "1",
  });
}

/** Funds without a TEFAS type: guess the type from the name, so filters still work. */
export function typeFromName(name: string): string | null {
  const n = name.toLocaleUpperCase("tr-TR");
  if (n.includes("PARA PİYASASI")) return "Para Piyasası Şemsiye Fonu";
  if (n.includes("SERBEST")) return "Serbest Şemsiye Fonu";
  if (n.includes("KATILIM")) return "Katılım Şemsiye Fonu";
  if (n.includes("HİSSE")) return "Hisse Senedi Şemsiye Fonu";
  if (n.includes("BORÇLANMA") || n.includes("TAHVİL") || n.includes("BONO")) return "Borçlanma Araçları Şemsiye Fonu";
  if (n.includes("ALTIN") || n.includes("KIYMETLİ MADEN")) return "Kıymetli Madenler Şemsiye Fonu";
  if (n.includes("FON SEPETİ")) return "Fon Sepeti Şemsiye Fonu";
  if (n.includes("DEĞİŞKEN")) return "Değişken Şemsiye Fonu";
  return null;
}

export function mergeFundList(general: GeneralRow[], returns: ReturnRow[]): FundListItem[] {
  const byCode = new Map(returns.map((r) => [r.fonKodu, r]));
  const seen = new Set<string>();
  const out: FundListItem[] = [];
  for (const g of general) {
    if (!g.fonKodu || seen.has(g.fonKodu)) continue;
    seen.add(g.fonKodu);
    const r = byCode.get(g.fonKodu);
    out.push({
      code: g.fonKodu,
      name: g.fonUnvan,
      type: r?.fonTurAciklama ?? typeFromName(g.fonUnvan),
      risk: num(r?.riskDegeri),
      size: num(g.portfoyBuyukluk),
      investors: num(g.kisiSayisi),
      price: num(g.fiyat),
      date: g.tarih ? g.tarih.slice(0, 10) : null,
      return1m: num(r?.getiri1a),
      return3m: num(r?.getiri3a),
      return1y: num(r?.getiri1y),
      tefas: Boolean(r),
    });
  }
  // TEFAS-only rows missing from the price list (rare): keep them so they can still be searched.
  for (const r of returns) {
    if (seen.has(r.fonKodu)) continue;
    out.push({
      code: r.fonKodu, name: r.fonUnvan, type: r.fonTurAciklama, risk: num(r.riskDegeri), size: null,
      investors: null, price: null, date: null, return1m: num(r.getiri1a), return3m: num(r.getiri3a),
      return1y: num(r.getiri1y), tefas: true,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export async function fetchFundList(now = new Date()): Promise<FundListItem[]> {
  const general = await latestGeneral(now);
  // Returns are extra information: the list still works without them.
  const returns = await periodReturns().catch((err) => {
    console.warn("TEFAS period returns failed:", err);
    return [] as ReturnRow[];
  });
  if (!general.length && !returns.length) throw new Error("TEFAS returned no funds");
  return mergeFundList(general, returns);
}

export const FUND_CODE = /^[A-Z0-9]{2,6}$/;

/** Daily prices of one fund. `months`: 1, 3, 6, 12, 36 or 60 (TEFAS periods). */
export async function fetchFundHistory(code: string, months = 12) {
  const rows = await tefasPost<{ fonKodu: string; fonUnvan: string; tarih: string; fiyat: number }>(
    "/api/funds/fonFiyatBilgiGetir",
    { fonKodu: code, dil: "TR", periyod: months },
  );
  const points = rows
    .map((r) => ({ date: String(r.tarih).slice(0, 10), price: Number(r.fiyat) }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { code, name: rows[0]?.fonUnvan ?? null, points, months: monthlyReturns(points) };
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/**
 * Return of each calendar month, from the last price of the previous month to the last price of this month.
 * `annualized` puts months of different length on the same scale (a short February is not "worse").
 * The last month is `partial` when its last price is not near the month end.
 */
export function monthlyReturns(points: PricePoint[]): MonthReturn[] {
  const lastOfMonth = new Map<string, PricePoint>();
  for (const p of points) lastOfMonth.set(p.date.slice(0, 7), p);
  const months = [...lastOfMonth.keys()].sort();
  const out: MonthReturn[] = [];
  for (let i = 1; i < months.length; i++) {
    const a = lastOfMonth.get(months[i - 1])!;
    const b = lastOfMonth.get(months[i])!;
    const days = daysBetween(a.date, b.date);
    if (days <= 0) continue;
    const ratio = b.price / a.price;
    const [y, m] = months[i].split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push({
      month: months[i],
      end: b.date,
      pct: (ratio - 1) * 100,
      annualized: (Math.pow(ratio, 365 / days) - 1) * 100,
      days,
      partial: i === months.length - 1 && daysBetween(b.date, monthEnd) > 4,
    });
  }
  return out;
}
