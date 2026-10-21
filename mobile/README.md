# Finans (mobil uygulama)

Döviz mi, faiz mi? sitesinin iOS / Android uygulaması. Expo SDK 57, Expo Router.
Hesaplar sitedeki `public/calc.js` dosyasından gelir; veri sitenin API'sinden (`/api/*`) okunur.

## Expo Go ile açmak

1. iPhone'a App Store'dan **Expo Go** uygulamasını kurun.
2. Bilgisayarda (Node 22):

   ```bash
   git clone https://github.com/tugrultalet/doviz-faiz.git
   cd doviz-faiz/mobile
   git checkout claude/sharp-bohr-5bh0us
   npm install
   npx expo start
   ```

3. Terminaldeki QR kodu iPhone kamerasıyla okutun. Uygulama Expo Go'da açılır.
   Telefon ve bilgisayar aynı Wi-Fi ağında olmalı. Değilse: `npx expo start --tunnel`.

Ana ekran widget'ı Expo Go'da görünmez; onun için TestFlight sürümü gerekir.

## TestFlight

```bash
npx eas-cli@latest login            # Expo hesabı (tgrltl)
npx eas-cli@latest init             # ilk sefer: EAS proje kimliğini app.json'a yazar
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --latest
```

İlk build'de EAS, Apple hesabınızla giriş ister ve sertifikaları kendisi oluşturur.
Paket kimliği: `com.tugrultalet.finans` (`app.json`).

## Ana ekran widget'ı

`src/widgets/FxWidget.tsx` (expo-widgets). Boyutlar: küçük, orta ve kilit ekranı (dikdörtgen).
Dolar ve euro kuru, son 30 günlük değişim, gram altın (Altın sekmesi bir kez açıldıysa) ve
1 yıllık trend senaryosunun önerisini gösterir.

- Widget, verisini uygulamadan alır: uygulama her açıldığında ve veri yenilendiğinde günceller.
  Uygulama uzun süre açılmazsa widget son veriyi gösterir.
- Sadece EAS build (TestFlight / App Store) sürümünde çalışır. Expo Go'da widget kodu hiç yüklenmez
  (`src/widgets/sync.ts`), uygulama normal çalışır.
- Widget ile uygulama `group.com.tugrultalet.finans` App Group'unu paylaşır. EAS bu yeteneği
  Apple hesabında kendisi açar.

## API adresi

Varsayılan: `https://doviz-faiz.onrender.com`. Başka bir sunucu için `.env.local` dosyasına yazın:

```
EXPO_PUBLIC_API_URL=https://finans-n8x9.netlify.app
```

## Komutlar

```bash
npx tsc --noEmit   # tip denetimi
npx expo lint      # lint
```
