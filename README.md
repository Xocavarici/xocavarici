# Xocavar İçi — Kurulum ve Test Rehberi

## Dosyalar
| Dosya | Görevi |
|---|---|
| `index.html`, `app.css`, `app.js` | Müşteri uygulaması |
| `admin.html` | Admin paneli (`/admin.html`) |
| `firebase.js` | Ortak Firebase ayarı (SDK 10.14.1 sabit) |
| `manifest.json`, `service-worker.js`, `icon-*.png`, `icon.svg` | PWA |
| `firebase.json` | Firebase Hosting ayarı |

Tüm dosyalar **aynı klasörde** durmalı. Build aracı gerekmez.

## Veri yapısı (yalnızca kurallardaki yollar)
- `users/<uid>`: name, phone, email, balance, createdAt, `home`/`work` {name,lat,lon}, `favorites/<id>`, `promos/<KOD>`, `settings`
- `orders/<uid>/<id>`: status (`active`/`cancelled`/`completed`), from, to, cls, pay, km, price, createdAt (+ ileride `driverId`, `driverLocation` eklenebilir)
- `driver_applications/<uid>`: ad, telefon, şəhər, marka, model, il, rəng, plate, license, **status**, reason
- `support/<uid>/messages/<id>` ve `support/<uid>/meta`

## Yayınlama (HTTPS şart — konum izni için)

### A) Firebase Hosting
1. Bilgisayarda Node.js kur, sonra: `npm i -g firebase-tools`
2. `firebase login`
3. Dosyaların olduğu klasörde: `firebase init hosting` → mevcut projeyi seç (`xocavar-ici`), public directory: `.`, single-page app: **No**, `index.html` üzerine yazma: **No**
4. `firebase deploy --only hosting`
5. Adres: `https://xocavar-ici.web.app` (bu alan adı Authorized domains'e zaten ekli gelir). Özel alan adı kullanırsan Firebase Console → Authentication → Settings → **Authorized domains**'e ekle.

### B) GitHub Pages (telefondan yapılabilir)
1. github.com'da yeni **public** depo aç (ör. `xocavar-ici`).
2. Tarayıcıdan *Add file → Upload files* ile tüm dosyaları yükle, commit et.
3. *Settings → Pages* → Branch: `main`, klasör `/ (root)` → Save.
4. 1–2 dakika sonra adres: `https://KULLANICI.github.io/xocavar-ici/`
5. **Önemli:** Firebase Console → Authentication → Settings → Authorized domains → **Add domain** → `KULLANICI.github.io` ekle. Yoksa giriş çalışmaz.

## Test listesi
1. Siteyi telefondan HTTPS ile aç → Qeydiyyat → hesap oluştur.
2. Ana səhifə: konum iznine **İcazə ver** de; mavi nokta ve doğruluk dairesi görünmeli. İzni reddedip tekrar dene: uyarı + IP konumu çıkmalı.
3. Adres ara, haritaya dokun, Ev/İş kaydet (Sevimlilər sekmesinde düzenle), "Taksi çağır" → Sifarişlər > Aktiv'de görünmeli, iptal et → Tarixçə'de görünmeli.
4. Profil → **Şoför ol** → formu gönder (Firebase'de `driver_applications/<uid>/status = pending`).
5. `/admin.html` → admin hesabıyla gir → Ərizələr → Qəbul et / Rədd et (sebep yaz). Müşteri tarafında durum anında değişmeli. Rədd sonrası "Dəstək ilə əlaqə saxlayın" düğmesi çıkar.
6. Profil → 24/7 Dəstək → mesaj yaz; admin → Dəstək'te okunmamış göstergesi → cevapla; müşteride canlı görünmeli.
7. Tarayıcı menüsünden **Ana ekrana ekle** (Hakkında sayfasında da düğme var).

## Bilmen gerekenler
- **Yüklə** düğmesi bilerek sadece "tezliklə" mesajı verir. Balans değeri `users/<uid>/balance`'da tutulur.
- Promokodlar şimdilik uygulama içinde sabit listedir (`XOCAVAR10`, `XOSGELDIN`, `YENI2026`); aktifleştirilenler `users/<uid>/promos` altına yazılır. Kurallar yeni kök yola izin vermediği için liste kodda.
- Mevcut kurallarda kullanıcı kendi `users/<uid>` kaydını (balans dahil) yazabilir. Ödeme eklerken bunu sunucu taraflı bir yapıya taşıman gerekir.
- Admin Dəstək listesi `support` kökünü okur; çok sayıda mesaj birikirse yavaşlayabilir (sonradan sohbet özetlerini ayrı tutmak gerekir, bunun için yeni kural yolu lazım).
- Nominatim ücretsiz ve yoğun kullanıma uygun değildir; kullanıcı sayısı artarsa ücretli bir geocoding servisine geç.
- Ekran görüntülerindeki sahte taksi ikonları bilerek konmadı; canlı şoför takibi eklenince gerçek veriyle gösterilecek.

---

# v2 Güncellemesi (ÖNEMLİ: önce Firebase kurallarını güncelle)

v2 yeni özellikler için **iki yeni veri yolu** kullanır: `live_orders` (sürücülərin gördüyü açık sifarişlər, telefonsuz) və `order_private` (müştəri/sürücü telefonu + sifariş söhbəti). Mevcut kurallar aynen duruyor, sadece bu ikisi eklendi. Dosya: `database.rules.json`.

## Kuralları yayınla
1. Firebase Console → Realtime Database → **Rules** sekmesi.
2. `database.rules.json` içindeki tüm metni kopyalayıp yapıştır → **Publish**.
Bunu yapmazsan sifariş sürücülərə göndərilməz (müştəriyə uyarı çıkar), sürücü paneli boş kalır.

## Yenilikler
- Harita: CARTO "API key required" hatası vardı; OpenStreetMap karolarına geçildi.
- Hara gedirik paneli: yer seçince küçülür (sadece arama + Taksi çağır). Tutamacı (üstteki gri çizgi) çekerek/dokunarak aç-kapa.
- **Şoför paneli:** qəbul edilmiş sürücü Profil'de "Şoför paneli" görür (haritada da yeşil "Sifarişlər" düğməsi). Açık sifarişler: neçə dəqiqə əvvəl, haradan, hara, qiymət, sizdən uzaqlıq. **Qəbul et** ilə sifariş götürülür (ilk basan alır).
- **Arama:** müşteri sürücünün, sürücü müştərinin telefonunu görür; "Zəng et" doğrudan telefon uygulamasını açar. Admin panelinde de zəng düğməsi var.
- **Mesajlaşma:** sifariş kabul edilince müşteri ve sürücü arasında canlı sohbet, yeni mesajda bildirim.
- Sürücü: Tamamla, İmtina et, Götürmə yeri / Təyinat için Google Maps yol tarifi.
- 30 dəqiqədən köhnə açık sifarişlər sürücü listesinde gösterilmez.

## Güncellemeyi GitHub'a yükle (Termux)
```
cd ~/xocavarici
unzip -o ~/storage/downloads/xocavar-ici-v2.zip
git add . && git commit -m "v2" 
git push https://KULLANICI:TOKEN@github.com/muradhasanov4400-droid/xocavarici.git main
```
Sonra telefonda siteyi aç, sayfayı yenile (gerekirse tarayıcıda siteyi kapatıp aç; service worker v2 yüklenir).

## Sınırlar
- Sürücü şu an yalnız kabul etmiş ərizəsi olan hesapla görür; canlı şoför takibi ve otomatik eşleştirme hâlâ yok.
- Gerçek "aranma" telefon uygulaması üzerinden yapılır (tel: bağlantısı), uygulama içi sesli arama değildir.
