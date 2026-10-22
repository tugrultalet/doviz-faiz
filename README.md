# Döviz mi, faiz mi?

TL mevduat, dolar ve euro seçeneklerini karşılaştırır.

- USD/TRY ve EUR/TRY son 1 yıl kurlarını canlı çeker (TCMB EVDS; anahtar yoksa ECB/frankfurter.dev).
- Son 30 günlük artışı önceki 11 dönemin ortalamasıyla karşılaştırır: hızlandı / yavaşladı / aynı.
- TL mevduat ortalama faizini EVDS'den çeker (elle de girilebilir).
- Stopaj ve kur makası sonrası vade sonu tutarını üç senaryoda hesaplar: 1 yıllık trend, son 30 gün trendi, sabit kur.
- Başabaş kuru gösterir.
- Piyasa göstergeleri (EVDS): TÜFE, TCMB fonlama faizi, yıl sonu USD/TRY beklentisi, hanehalkı enflasyon beklentisi, reel efektif kur, brüt rezervler, yerleşiklerin döviz mevduatı, tahvil faizi.
- Altın sayfası (`/altin.html`): 1950'den bugüne aylık gram altın (TL) ve ons altın (USD), getiri tablosu ve grafikler (EVDS `TP.MK.KUL.YTL`, `TP.MK.LON.YTL`).
- İstatistik sayfası (`/istatistik.html`): kart harcamaları, güven endeksleri, dolarizasyon, rezervler, faiz-enflasyon, sanayi, kapasite, işsizlik, cari denge ve konut fiyatları (tanımlar `src/stats.ts`).
- Fon sayfası (`/fon.html`): TEFAS'taki tüm yatırım fonları için aramalı açılır liste (kod veya ad, Türkçe harfsiz de bulur), tür filtresi, son 12 ayın kazanç eğrisi, aylık getiri (ham ve yıllık eşdeğer), risk değeri ve fon büyüklüğü (tanımlar `src/funds.ts`). TEFAS'ın JSON uç noktaları anahtarsızdır ama resmi olarak belgelenmemiştir.
- Tahvil/bono seçeneği (stopaj %0), reel getiri (enflasyon sonrası) ve "piyasa beklentisi gerçekleşirse" senaryosu.

## Komutlar

```bash
npm install
npm run dev        # http://localhost:8787
npm test
npm run typecheck
```

## Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `EVDS_API_KEY` | EVDS API anahtarı (evds3.tcmb.gov.tr → Benim Sayfam → Profilim → API KEY KOPYALA) |
| `EVDS_DEPOSIT_<CUR>_<MTxx>` | Mevduat faizi seri kodu. Varsayılan `TP.<CUR>TAS.MTxx` (tasarruf mevduatı; MT01=1 aya kadar … MT05=1 yıldan uzun) |
| `EVDS_CPI`, `EVDS_FUNDINGCOST`, `EVDS_EXPUSDYEAREND`, `EVDS_HHINFLATIONEXP`, `EVDS_REER`, `EVDS_RESERVES`, `EVDS_FXDEPOSITS`, `EVDS_BONDYIELD` | Gösterge seri kodları (varsayılanlar `src/indicators.ts` içinde). Boş kod: değer sayfada elle girilir. |
| `TEFAS_BASE_URL` | TEFAS adresi (varsayılan `https://www.tefas.gov.tr`; testte sahte sunucu için) |
| `EVDS_DISCOVER` | `1` ise sunucu açılışta EVDS veri gruplarını arar ve seri kodlarını loga yazar. |

Sunucu açılışta her EVDS serisi için bir `[evds-check]` satırı yazar. Yanlış seri kodu bu satırlarda görünür.

## Yayın

`render.yaml` ile Render'da ücretsiz web servisi olarak çalışır. `EVDS_API_KEY` değerini Render panelinden girin.

Render'ın ücretsiz servisi 15 dakika istek gelmezse uyur; ilk açılış 30–60 saniye sürer.

### Netlify (uyumaz)

`netlify.toml` sayfaları `public/` klasöründen CDN ile sunar, `/api/*` isteklerini `netlify/functions/api.mts` fonksiyonuna yollar. Fonksiyon aynı Hono uygulamasını yalnızca API olarak çalıştırır (`createApp(key, { serveFiles: false })`). Başarılı API cevapları Netlify CDN'inde 1 saat tutulur (`Netlify-CDN-Cache-Control`), böylece EVDS'ye saatte yaklaşık bir istek gider. `EVDS_API_KEY` değerini sitenin ortam değişkenlerine girin.
