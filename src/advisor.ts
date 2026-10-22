// Voice investment advisor: the server gives the phone a short-lived OpenAI Realtime key and the
// session setup (instructions with today's data, tools). The OpenAI API key never leaves the server.

import type { FundListItem } from "./funds.js";
import type { IndicatorResult } from "./indicators.js";
import type { FxData, Point } from "./sources.js";

export const OPENAI_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
/** The phone says this first, word for word, when the call opens. */
export const GREETING = "Yatırım danışmanınızla görüşüyorsunuz, buyrun.";

type DepositRates = Record<string, Record<string, { rate?: number; date?: string }>> | null;
export type MarketData = {
  fx: FxData | null;
  deposit: DepositRates;
  indicators: Partial<Record<string, IndicatorResult>>;
  funds: FundListItem[] | null;
};

const fmt = (v: number, digits = 2) => v.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${fmt(v * 100, digits)}%`;

/** Value on the day `days` before the last point, or the closest earlier one. */
function changeOver(series: Point[], days: number) {
  const last = series.at(-1);
  if (!last) return null;
  const target = new Date(Date.parse(last.date) - days * 86400000).toISOString().slice(0, 10);
  const past = [...series].reverse().find((p) => p.date <= target) ?? series[0];
  return { last, change: last.value / past.value - 1 };
}

const TERM_LABELS: Record<string, string> = {
  upTo1Month: "1 aya kadar",
  upTo3Months: "3 aya kadar",
  upTo6Months: "6 aya kadar",
  upTo1Year: "1 yıla kadar",
  over1Year: "1 yıldan uzun",
};

/** Funds a cautious saver asks about: money market funds first, then other risk 1–2 funds. */
export function safeFunds(funds: FundListItem[], limit = 8) {
  const usable = funds.filter((f) => f.tefas && f.return1m != null && (f.size ?? 0) > 50_000_000);
  const moneyMarket = usable.filter((f) => /para piyasas/i.test(f.type ?? "") || /PARA PİYASASI/.test(f.name));
  const lowRisk = usable.filter((f) => (f.risk ?? 9) <= 2 && !moneyMarket.includes(f));
  const byMonth = (a: FundListItem, b: FundListItem) => (b.return1m ?? 0) - (a.return1m ?? 0);
  return { moneyMarket: moneyMarket.sort(byMonth).slice(0, limit), lowRisk: lowRisk.sort(byMonth).slice(0, 4) };
}

/** Today's market in short Turkish lines, for the advisor's instructions. */
export function marketBrief({ fx, deposit, indicators, funds }: MarketData, today = new Date()) {
  const lines: string[] = [`Bugün: ${today.toISOString().slice(0, 10)}.`];

  if (fx?.usd.length && fx.eur.length) {
    for (const [name, s] of [["USD/TRY", fx.usd], ["EUR/TRY", fx.eur]] as const) {
      const m = changeOver(s, 30);
      const y = changeOver(s, 365);
      if (m && y) lines.push(`${name}: ${fmt(m.last.value, 4)} (${m.last.date}). Son 30 gün ${pct(m.change)}, son 1 yıl ${pct(y.change)}.`);
    }
    const spread = [fx.spread?.USD, fx.spread?.EUR].filter((v): v is number => v != null);
    if (spread.length) lines.push(`TCMB alış-satış makası yaklaşık %${fmt(spread[0])}; bankalarda genelde daha yüksek.`);
  }

  if (deposit) {
    lines.push("TCMB ortalama mevduat faizleri (yıllık, brüt, yeni açılan hesaplar):");
    for (const cur of ["TRY", "USD", "EUR"]) {
      const terms = Object.entries(deposit[cur] ?? {})
        .filter(([, r]) => r.rate != null)
        .map(([id, r]) => `${TERM_LABELS[id] ?? id} %${fmt(r.rate!)}`);
      if (terms.length) lines.push(`- ${cur}: ${terms.join(", ")}.`);
    }
    lines.push("Bankaların ilan ettiği TL faizi genelde TCMB ortalamasının yaklaşık 4 puan altındadır.");
  }

  const cpi = indicators.cpi?.points;
  if (cpi && cpi.length >= 13) {
    const last = cpi.at(-1)!;
    lines.push(`TÜFE: aylık ${pct(last.value / cpi.at(-2)!.value - 1)}, yıllık ${pct(last.value / cpi.at(-13)!.value - 1)} (${last.date.slice(0, 7)}).`);
  }
  const funding = indicators.fundingCost?.points?.at(-1);
  if (funding) lines.push(`TCMB ortalama fonlama faizi: %${fmt(funding.value)}.`);
  const hh = indicators.hhInflationExp?.points?.at(-1);
  if (hh) lines.push(`Hanehalkının 12 ay sonrası enflasyon beklentisi: %${fmt(hh.value, 1)}.`);

  if (funds?.length) {
    const { moneyMarket, lowRisk } = safeFunds(funds);
    const row = (f: FundListItem) =>
      `- ${f.code} ${f.name.slice(0, 60)} (risk ${f.risk ?? "?"}): 1 ay ${f.return1m == null ? "?" : `%${fmt(f.return1m)}`}, 1 yıl ${f.return1y == null ? "?" : `%${fmt(f.return1y)}`}`;
    if (moneyMarket.length) lines.push("En çok getiren para piyasası fonları (TEFAS, getiriler net, fon ücreti düşülmüş):", ...moneyMarket.map(row));
    if (lowRisk.length) lines.push("Diğer düşük riskli (1–2) fonlar:", ...lowRisk.map(row));
  }

  lines.push(
    "Vergi: TL mevduat stopajı 6 aya kadar %17,5, 1 yıla kadar %15, daha uzun %10. Döviz mevduatı stopajı %25.",
    "Para piyasası fonlarında stopaj fonun türüne göre değişir; TEFAS getirileri stopaj öncesidir.",
    "Döviz alırken %0,2 kambiyo vergisi (BSMV) ödenir.",
  );
  return lines.join("\n");
}

export function advisorInstructions(brief: string) {
  return `Sen Finans uygulamasının sesli yatırım danışmanısın. Kullanıcıyla Türkçe, telefonda konuşur gibi doğal ve sıcak konuş.

Konuşma biçimi:
- Kısa cümleler kur. Bir seferde en fazla 3-4 cümle söyle, sonra kullanıcıya söz ver.
- Rakamları sesli okunacak şekilde söyle: "yüzde kırk iki", "bir milyon iki yüz bin lira".
- Liste okuma. Önemli 2-3 noktayı söyle, gerekirse "detayını ister misiniz?" diye sor.
- Kullanıcının sözünü keserse hemen dur ve dinle.

Danışmanlık:
- Önce eksik bilgiyi sor: tutar, ne kadar süre bekleyebileceği, parayı ne zaman kullanacağı, risk alıp alamayacağı, dövize ihtiyacı olup olmadığı.
- Seçenekleri karşılaştır: TL mevduat, dolar veya euro mevduatı, para piyasası fonları ve düşük riskli fonlar. Gerekirse altını da an.
- Kesin rakam gerektiğinde mutlaka "hesapla" aracını kullan. Bu araç uygulamanın hesaplayıcısıdır: stopajı, kur makasını ve kambiyo vergisini düşer, üç kur senaryosu verir. Kendi kafandan faiz hesabı yapma.
- Fon önerirken aşağıdaki TEFAS listesini veya "fon_ara" aracını kullan. Fon kodunu ve son getirisini söyle.
- Geçmiş getirinin geleceği garanti etmediğini, kur tahminlerinin geçmiş trende dayandığını kısaca belirt.
- Bir seçeneği açıkça öne çıkarabilirsin, ama gerekçesini ve riskini de söyle.
- Konuşma başında bir kez, kısaca: söylediklerin genel bilgi ve senaryo karşılaştırmasıdır, kişiye özel yatırım tavsiyesi değildir.
- Finans dışı konulara kibarca girme, konuyu yatırıma geri getir.
- Bilmediğin bir veriyi uydurma. Listede olmayan bir şeyi soruyorsa bilmediğini söyle.

Güncel veriler (uygulamanın sunucusundan, TCMB EVDS ve TEFAS):
${brief}`;
}

/** Tools the phone runs locally (with the app's own calculator and fund list). */
export const ADVISOR_TOOLS = [
  {
    type: "function",
    name: "hesapla",
    description:
      "Uygulamanın hesaplayıcısı: tutarı vade sonunda TL mevduat, dolar mevduatı, euro mevduatı ve (varsa) tahvilde tutmanın net sonucunu üç kur senaryosuyla verir. Stopaj, makas ve kambiyo vergisi düşülür.",
    parameters: {
      type: "object",
      properties: {
        tutar: { type: "number", description: "Yatırılacak tutar, örneğin 1000000." },
        para_birimi: { type: "string", enum: ["TRY", "USD", "EUR"], description: "Tutarın para birimi." },
        gun: { type: "number", description: "Vade, gün olarak. Örneğin 3 ay için 91, 1 yıl için 365." },
      },
      required: ["tutar", "para_birimi", "gun"],
    },
  },
  {
    type: "function",
    name: "fon_ara",
    description: "TEFAS fon listesinde arama yapar ve getirisi en yüksek fonları döndürür.",
    parameters: {
      type: "object",
      properties: {
        tur: { type: "string", description: "Fon türünden bir kelime, örneğin 'para piyasası', 'altın', 'borçlanma', 'hisse', 'katılım'. Boş bırakılabilir." },
        en_fazla_risk: { type: "number", description: "SPK risk değeri üst sınırı (1-7). Risksiz isteyen için 1 veya 2." },
        siralama: { type: "string", enum: ["1ay", "3ay", "1yil"], description: "Hangi döneme göre sıralanacağı." },
        kod: { type: "string", description: "Tek bir fonun kodu, örneğin 'TP2'. Verilirse sadece o fon döner." },
      },
    },
  },
] as const;

/** Asks OpenAI for a client secret: the phone uses it once to open the voice call (WebRTC). */
export async function createRealtimeSecret(apiKey: string, brief: string) {
  const res = await fetch(`${OPENAI_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Only long enough to start the call; the call itself can last longer.
      expires_after: { anchor: "created_at", seconds: 120 },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: advisorInstructions(brief),
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "tr" },
            turn_detection: { type: "semantic_vad", eagerness: "medium" },
            noise_reduction: { type: "near_field" },
          },
          output: { voice: REALTIME_VOICE },
        },
        tools: ADVISOR_TOOLS,
        tool_choice: "auto",
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { value?: string; expires_at?: number; error?: { message?: string } };
  if (!res.ok || !body.value) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? "no client secret"}`);
  return { value: body.value, expiresAt: body.expires_at ?? null, model: REALTIME_MODEL };
}

/**
 * Best-effort guard against strangers spending the OpenAI budget: a few calls per IP per hour.
 * It lives in memory, so each serverless instance counts on its own.
 */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (id: string, now = Date.now()) => {
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(id, recent);
      return false;
    }
    recent.push(now);
    hits.set(id, recent);
    return true;
  };
}
