# Dutch A2 İnburgering Pratik v2 (Türkçe arayüz)

DUO **inburgering A2** sınavına hazırlık uygulaması. Arayüz, açıklamalar ve ipuçları **Türkçe**; alıştırmalar **Hollandaca**.

## Açılış

- Klasörü açıp `index.html` dosyasına çift tıkla, veya
- `python3 -m http.server 8080` ile sun: http://localhost:8080
- Mikrofon, konuşmayı yazıya çevirme (STT) ve PWA için **https** veya **localhost** gerekir (telefonda dosya:// sınırlı olabilir).

## İçerik sayıları

| Bölüm | Adet |
|-------|------|
| Lezen | 30 metin × 3 soru |
| Luisteren | 25 dinleme (TTS nl-NL) |
| Schrijven | 25 yazma görevi |
| Spreken | 25 konuşma görevi |
| KNM | 120 soru · 8 tema |
| Kelime | 500+ (Leitner) |
| Deneme | Her bölüm için ≥2 sürüm |

## Araştırılan sınav formatı (2025–2026)

Kaynak: [inburgeren.nl taalexamens](https://www.inburgeren.nl/examen-doen/inhoud-taalexamens-a2-b1-b2.jsp), [kennisexamens](https://www.inburgeren.nl/examen-doen/inhoud-kennisexamens.jsp), [oefenen](https://www.inburgeren.nl/examen-doen/oefenen.jsp), Staatscourant 2024/15802 (KNM eindtermen), Cito/Rijksoverheid (KNM 1 Temmuz 2025).

| Bölüm | Süre | Biçim | Oefenexamen ipucu |
|-------|------|-------|-------------------|
| Spreken | 35 dk | Bilgisayar + mikrofon; film/görüntü sonrası konuşma | ~16 soru |
| Luisteren | 45 dk | Bilgisayar; film/ses + MC | ~25 soru |
| Lezen | 65 dk | Bilgisayar; metin + MC | ~25 soru |
| Schrijven | 40 dk | **Kalem-kâğıt**; 4 görev (form, kısa mesaj/mail) | 4 görev |
| KNM | 45 dk | Bilgisayar; temalar, bilgi soruları (görsel destek) | pratikte ~40; resmi sayı sabit açıklanmaz |

**Geçme eşiği (cesuur):** DUO resmi sayıyı yayımlamaz; pratikte sık kullanılan kılavuz ~%70 (ör. Lezen/Luisteren ~18/25, KNM ~28/40). Uygulamadaki “geçti” tahmini buna göredir.

**KNM 8 tema (2025):** Werk en inkomen; Omgangsvormen, waarden en normen; Wonen; Gezondheid en gezondheidszorg; Geschiedenis en geografie; Instanties; Staatsinrichting en rechtsstaat; Onderwijs en opvoeding.

Tüm sorular **orijinaldir**; resmi sınav soruları kopyalanmamıştır.

## Özellikler

- Bölüm bazlı deneme sınavları (süre + sonuç incelemesi)
- Kişisel plan (sınav tarihleri + günlük dakika; zayıf alan önceliği)
- Leitner kelime kutuları, seri (streak), ilerleme panosu
- JSON dışa/içe aktarma
- İsteğe bağlı YZ öğretmen (xAI / OpenAI; anahtar yalnızca localStorage)

## Dosyalar

- `index.html` — kabuk + CSS
- `app.js` — uygulama
- `data/all-data.js` — tüm içerik
- `sw.js`, `manifest.webmanifest` — PWA
