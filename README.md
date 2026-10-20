# Döviz mi, faiz mi?

TL mevduat, dolar ve euro seçeneklerini karşılaştırır.

- USD/TRY ve EUR/TRY son 1 yıl kurlarını canlı çeker (TCMB EVDS; anahtar yoksa ECB/frankfurter.dev).
- Son 30 günlük artışı önceki 11 dönemin ortalamasıyla karşılaştırır: hızlandı / yavaşladı / aynı.
- TL mevduat ortalama faizini EVDS'den çeker (elle de girilebilir).
- Stopaj ve kur makası sonrası vade sonu tutarını üç senaryoda hesaplar: 1 yıllık trend, son 30 gün trendi, sabit kur.
- Başabaş kuru gösterir.

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
| `EVDS_DEPOSIT_1M` | 1 aya kadar vadeli TL mevduat faizi seri kodu (varsayılan `TP.TRY.MT02`) |
| `EVDS_DEPOSIT_3M` | 3 aya kadar vadeli TL mevduat faizi seri kodu (varsayılan `TP.TRY.MT03`) |

## Yayın

`render.yaml` ile Render'da ücretsiz web servisi olarak çalışır. `EVDS_API_KEY` değerini Render panelinden girin.
