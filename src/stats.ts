// Statistics page: one chart per entry. Each chart pulls EVDS series as monthly averages.
// Every code below was checked against the EVDS series list (EVDS_DISCOVER log).

import { evdsSeries, type Point } from "./evds.js";

export type Transform = "level" | "yoy" | "sum12";
export type StatSeries = { code: string; label: string; /** Overrides the chart's transform for this series. */ transform?: Transform };
export type StatChart = {
  id: string;
  section: string;
  title: string;
  /** What the chart tells about the economy, shown under the title. */
  explain: string;
  unit: string;
  /** level: the values; yoy: % change against the same month a year earlier; sum12: rolling 12-month sum. */
  transform: Transform;
  years: number;
  series: StatSeries[];
  /** Optional: plot sum(num) / sum(den) in % as one series (e.g. FX share of deposits). */
  ratio?: { label: string; num: string[]; den: string[] };
  /** Optional horizontal reference line (e.g. 100 = neutral confidence). */
  reference?: { value: number; label: string };
};

// Deposits by type (bank deposits, thousand TL): TL types F01..F16, FX deposits F19, precious metals F22.
const DEPOSIT_ALL = ["TP.KM.F01", "TP.KM.F04", "TP.KM.F07", "TP.KM.F13", "TP.KM.F16", "TP.KM.F19", "TP.KM.F22"];

export const STAT_CHARTS: StatChart[] = [
  {
    id: "card-real",
    section: "Tüketim ve ticaret",
    title: "Kartlı ödeme endeksi (reel)",
    explain: "Kartla yapılan harcamalar, enflasyondan arındırılmış. Yükseliyorsa gerçek tüketim artıyor, düşüyorsa ticaret yavaşlıyor.",
    unit: "endeks (Nisan 2015 = 100)",
    transform: "level",
    years: 5,
    series: [
      { code: "TP.KARTMETRE.D2", label: "Genel" },
      { code: "TP.KARTMETRE.D4", label: "Hanehalkı" },
    ],
  },
  {
    id: "card-spend",
    section: "Tüketim ve ticaret",
    title: "Kart harcamaları, yıllık değişim",
    explain: "Banka kartı ve kredi kartı harcama tutarının geçen yılın aynı ayına göre değişimi (nominal). Enflasyondan yüksekse harcama gerçekten artıyor.",
    unit: "%",
    transform: "yoy",
    years: 5,
    series: [{ code: "TP.KKHARTUT.KT1", label: "Toplam kart harcaması" }],
  },
  {
    id: "consumer-confidence",
    section: "Güven ve beklentiler",
    title: "Tüketici güven endeksi",
    explain: "Hanehalkının ekonomiye ve kendi maddi durumuna bakışı. 100'ün altı kötümser, 100'ün üstü iyimser.",
    unit: "endeks",
    transform: "level",
    years: 5,
    series: [{ code: "TP.TG2.Y01", label: "Tüketici güven endeksi" }],
    reference: { value: 100, label: "Nötr (100)" },
  },
  {
    id: "business-confidence",
    section: "Güven ve beklentiler",
    title: "Reel kesim ve finans sektörü güveni",
    explain: "Şirketlerin sipariş, üretim, yatırım ve istihdam beklentisi. 100'ün üstü büyüme beklentisini gösterir.",
    unit: "endeks",
    transform: "level",
    years: 5,
    series: [
      { code: "TP.GY1.N2", label: "Reel kesim güven endeksi" },
      { code: "TP.FHGE.S01", label: "Finansal hizmetler güven endeksi" },
    ],
    reference: { value: 100, label: "Nötr (100)" },
  },
  {
    id: "hh-inflation-exp",
    section: "Güven ve beklentiler",
    title: "Hanehalkının enflasyon beklentisi",
    explain: "Halkın 12 ay sonrası için beklediği yıllık enflasyon. Yüksek beklenti dövize ve mala kaçışı artırır.",
    unit: "%",
    transform: "level",
    years: 3,
    series: [{ code: "TP.ENFBEK.HBA12ENF", label: "12 ay sonrası beklenti" }],
  },
  {
    id: "dollarization",
    section: "Para ve güven",
    title: "Döviz ve altın mevduatının payı",
    explain: "Bankalardaki tüm mevduatın yüzde kaçı döviz ve altın. Pay artıyorsa halk TL'den kaçıyor, düşüyorsa TL'ye güven artıyor.",
    unit: "% (toplam mevduat içinde)",
    transform: "level",
    years: 8,
    series: [],
    ratio: { label: "Döviz + altın payı", num: ["TP.KM.F19", "TP.KM.F22"], den: DEPOSIT_ALL },
  },
  {
    id: "reserves",
    section: "Para ve güven",
    title: "TCMB toplam rezervleri",
    explain: "Merkez Bankası'nın döviz ve altın rezervi. Rezerv artıyorsa kur baskısına karşı tampon güçleniyor.",
    unit: "milyon $",
    transform: "level",
    years: 5,
    series: [{ code: "TP.AB.TOPLAM", label: "Toplam rezerv" }],
  },
  {
    id: "rates-inflation",
    section: "Fiyatlar ve faiz",
    title: "Faiz ve enflasyon",
    explain: "Fonlama faizi enflasyonun üstündeyse reel faiz pozitiftir: TL'de durmak alım gücünü korur. Altındaysa TL eriyor.",
    unit: "%",
    transform: "level",
    years: 5,
    series: [
      { code: "TP.APIFON4", label: "TCMB fonlama faizi" },
      { code: "TP.FG.J0", label: "Yıllık enflasyon (2003=100)", transform: "yoy" },
      { code: "TP.TUKFIY2025.GENEL", label: "Yıllık enflasyon (2025=100)", transform: "yoy" },
    ],
  },
  {
    id: "cpi-yoy",
    section: "Fiyatlar ve faiz",
    title: "Yıllık enflasyon (TÜFE)",
    explain: "Tüketici fiyatlarının geçen yılın aynı ayına göre artışı. TÜİK 2026'da baz yılını 2025=100 olarak değiştirdi; iki seri birlikte gösterilir.",
    unit: "%",
    transform: "yoy",
    years: 5,
    series: [
      { code: "TP.FG.J0", label: "TÜFE (2003=100)" },
      { code: "TP.TUKFIY2025.GENEL", label: "TÜFE (2025=100)" },
    ],
  },
  {
    id: "industry",
    section: "Üretim ve istihdam",
    title: "Sanayi üretimi, yıllık değişim",
    explain: "Fabrikaların üretimi, geçen yıla göre (takvim etkisinden arındırılmış). Eksiye düşmesi ekonomide yavaşlamayı gösterir.",
    unit: "%",
    transform: "yoy",
    years: 5,
    series: [{ code: "TP.TSANAYTKVM2021.BCD", label: "Toplam sanayi" }],
    reference: { value: 0, label: "0" },
  },
  {
    id: "capacity",
    section: "Üretim ve istihdam",
    title: "Kapasite kullanım oranı",
    explain: "İmalat sanayinin kapasitesinin yüzde kaçı kullanılıyor (mevsimsellikten arındırılmış). Düşüş talebin zayıfladığını gösterir.",
    unit: "%",
    transform: "level",
    years: 5,
    series: [{ code: "TP.KKO.MA", label: "İmalat sanayi" }],
  },
  {
    id: "unemployment",
    section: "Üretim ve istihdam",
    title: "İşsizlik oranı",
    explain: "İş gücü içinde işsizlerin oranı (mevsimsellikten arındırılmış). Artış hanehalkı gelirine ve tüketime baskı yapar.",
    unit: "%",
    transform: "level",
    years: 5,
    series: [{ code: "TP.TIG08", label: "İşsizlik oranı" }],
  },
  {
    id: "current-account",
    section: "Dış denge ve varlık fiyatları",
    title: "Cari işlemler dengesi (yıllık toplam)",
    explain: "Son 12 ayın cari işlemler dengesi. Eksi değer dış açıktır: ülke döviz kazandığından fazla harcıyor ve bu kura baskı yapar.",
    unit: "milyon $",
    transform: "sum12",
    years: 6,
    series: [{ code: "TP.ODANA6.Q01", label: "Cari denge, 12 aylık" }],
    reference: { value: 0, label: "0" },
  },
  {
    id: "house-prices",
    section: "Dış denge ve varlık fiyatları",
    title: "Konut fiyatları, yıllık değişim",
    explain: "Türkiye konut fiyat endeksinin geçen yıla göre değişimi (nominal). Enflasyonla karşılaştırınca konutun reel getirisini gösterir.",
    unit: "%",
    transform: "yoy",
    years: 5,
    series: [
      { code: "TP.KFE.TR", label: "Türkiye" },
      { code: "TP.KFE.TR10", label: "İstanbul" },
    ],
  },
];

export type StatResult = { id: string; series: { label: string; points: Point[] }[]; error?: string };

/** Year-over-year % change of a monthly series (needs the value 12 months earlier). */
export function yoy(points: Point[]): Point[] {
  const byMonth = new Map(points.map((p) => [p.date.slice(0, 7), p.value]));
  return points.flatMap((p) => {
    const [y, m] = p.date.split("-");
    const prev = byMonth.get(`${Number(y) - 1}-${m}`);
    return prev ? [{ date: p.date, value: (p.value / prev - 1) * 100 }] : [];
  });
}

/** Rolling 12-month sum; a month is kept only when all 12 months are present. */
export function sum12(points: Point[]): Point[] {
  const byMonth = new Map(points.map((p) => [p.date.slice(0, 7), p.value]));
  return points.flatMap((p) => {
    let [y, m] = p.date.split("-").map(Number);
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const v = byMonth.get(`${y}-${String(m).padStart(2, "0")}`);
      if (v == null) return [];
      total += v;
      if (--m === 0) [y, m] = [y - 1, 12];
    }
    return [{ date: p.date, value: total }];
  });
}

/** % share of sum(num) in sum(den), on months where every series has a value. */
export function shareOf(raw: Record<string, Point[]>, num: string[], den: string[]): Point[] {
  const maps = Object.fromEntries(Object.entries(raw).map(([k, pts]) => [k, new Map(pts.map((p) => [p.date, p.value]))]));
  const dates = raw[den[0]].map((p) => p.date);
  return dates.flatMap((date) => {
    const pick = (codes: string[]) => codes.map((c) => maps[c]?.get(date));
    const n = pick(num);
    const d = pick(den);
    if ([...n, ...d].some((v) => v == null)) return [];
    const total = (d as number[]).reduce((a, b) => a + b, 0);
    return total ? [{ date, value: ((n as number[]).reduce((a, b) => a + b, 0) / total) * 100 }] : [];
  });
}

const TRANSFORM: Record<Transform, (p: Point[]) => Point[]> = { level: (p) => p, yoy, sum12 };

async function fetchChart(chart: StatChart, key: string, now: Date): Promise<StatResult> {
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - chart.years);
  const start = new Date(from);
  // One extra year so year-over-year changes and 12-month sums cover the whole window.
  if ([chart.transform, ...chart.series.map((s) => s.transform)].some((t) => t && t !== "level")) {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  }
  const codes = chart.ratio ? [...new Set([...chart.ratio.num, ...chart.ratio.den])] : chart.series.map((s) => s.code);
  const raw = await evdsSeries(codes, start, now, key, { frequency: 5, aggregation: "avg" });
  const cut = (pts: Point[]) => pts.filter((p) => p.date >= from.toISOString().slice(0, 10));
  if (chart.ratio) {
    return { id: chart.id, series: [{ label: chart.ratio.label, points: cut(shareOf(raw, chart.ratio.num, chart.ratio.den)) }] };
  }
  return {
    id: chart.id,
    series: chart.series.map((s) => ({ label: s.label, points: cut(TRANSFORM[s.transform ?? chart.transform](raw[s.code])) })),
  };
}

/** All charts; one failing series does not break the others. */
export async function fetchStats(key: string | undefined, now = new Date()) {
  if (!key) return null;
  const results = await Promise.allSettled(STAT_CHARTS.map((c) => fetchChart(c, key, now)));
  return results.map((r, i): StatResult => (r.status === "fulfilled" ? r.value : { id: STAT_CHARTS[i].id, series: [], error: String(r.reason) }));
}
