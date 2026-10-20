# Döviz mi, faiz mi?

TL mevduat, dolar ve euro seçeneklerini karşılaştırır.

- USD/TRY ve EUR/TRY son 1 yıl kurlarını canlı çeker (TCMB EVDS; anahtar yoksa ECB/frankfurter.dev).
- Son 30 günlük artışı önceki 11 dönemin ortalamasıyla karşılaştırır: hızlandı / yavaşladı / aynı.
- TL mevduat ortalama faizini EVDS'den çeker (elle de girilebilir).
- Stopaj ve kur makası sonrası vade sonu tutarını üç senaryoda hesaplar: 1 yıllık trend, son 30 gün trendi, sabit kur.
- Başabaş kuru gösterir.
- Piyasa göstergeleri (EVDS): TÜFE, TCMB fonlama faizi, yıl sonu USD/TRY beklentisi, hanehalkı enflasyon beklentisi, reel efektif kur, brüt rezervler, yerleşiklerin döviz mevduatı, tahvil faizi.
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
| `EVDS_DISCOVER` | `1` ise sunucu açılışta EVDS veri gruplarını arar ve seri kodlarını loga yazar. |

Sunucu açılışta her EVDS serisi için bir `[evds-check]` satırı yazar. Yanlış seri kodu bu satırlarda görünür.

## Yayın

`render.yaml` ile Render'da ücretsiz web servisi olarak çalışır. `EVDS_API_KEY` değerini Render panelinden girin.
