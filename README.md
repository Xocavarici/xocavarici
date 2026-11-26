# Alvero (v3.0)

Velosiped və aksesuar alqı-satqı elanları üçün mobil veb tətbiq (PWA). Firebase Auth + Realtime Database. Build aləti lazım deyil.

## Fayllar
| Fayl | Rolu |
|---|---|
| `index.html`, `app.css`, `app.js` | İstifadəçi tətbiqi |
| `admin.html` | Admin paneli (`/admin.html`) |
| `firebase.js` | Ortaq Firebase ayarı |
| `manifest.json`, `service-worker.js`, `icon-*` | PWA |
| `database.rules.json` | **Realtime Database qaydaları (mütləq yayımlanmalıdır)** |

## 1) ƏN VACİB: Firebase qaydalarını yenilə
Realtime Database → **Rules** → köhnə mətni silib `database.rules.json` içindəkini yapışdır → **Publish**.
- `admins`, `users`, `support` qaydaları əvvəlki ilə eynidir.
- Taksi dövründəki `orders` və `driver_applications` yolları çıxarılıb (məlumat silinmir, sadəcə əlçatmaz olur).
- Yeni yollar: `listings`, `listing_photos`, `chats`, `user_chats`, `wallets` (AV), `promo_codes`, `promo_redeem`, `av_tx`, `announcements`, `config`.
- Publish zamanı xəta çıxarsa, xəta mətnini göndərin.

Admin hesabı (`admins/<uid>: true`) əvvəlki kimi qalır.

## 2) GitHub-a yüklə (Termux)
```
cd ~/xocavarici
unzip -o ~/storage/downloads/alver.zip
git add -A; git commit -m "Alver v3"
git push https://Xocavarici:TOKEN@github.com/Xocavarici/xocavarici.git main
```
Token yalnız Termux-da yazılır, söhbətə yox. Sonra sayt: `https://xocavarici.github.io/xocavarici/` (Firebase → Authentication → Settings → Authorized domains-də `xocavarici.github.io` olmalıdır).
Yeni versiya köhnə görünsə, səhifəni bağlayıb yenidən açın.

## 3) Tətbiqdə nələr var
- **Ana səhifə:** axtarış, filtr, kateqoriyalar, şəhər seçimi, yeni elanlar, VIP elanlar öndə.
- **Elan:** 4 şəkilə qədər (telefonda avtomatik sıxılır), başlıq, qiymət növü (Qiymət / Razılaşma yolu ilə / Sifarişlə), vəziyyət, şəhər, təsvir, telefonu göstər/gizlət. Elanlarım: redaktə, «Satıldı», gizlət/aktiv et, sil.
- **Söhbət:** alıcı elanda «Mesaj yaz» basır, satıcı ilə canlı yazışır. Yeni mesajda ekranın üstündə bildiriş, titrəmə, başlıqda sayğac. Brauzer bildirişi icazə verilibsə və səhifə arxa planda açıqdırsa sistem bildirişi də çıxır.
- **Dəstək/yardım:** əvvəlki kimi 24/7 canlı söhbət (admin cavab verir).
- **AV pulu:** ayrıca balans. Promokodla yüklənir, elanı önə çıxarmaq üçün xərclənir (qiymət/müddət admin tərəfindən dəyişilir). Profil → AV kartı → «Yüklə» (pul ödənişi yoxdur, yalnız promokod).
- **Admin elanı (pop-up):** admin yazır, istifadəçi sayta girəndə ekranda çıxır, «Bağla» düyməsi var.
- **Bildirişlər (zəng):** admin elanlarının siyahısı.

## 4) Admin paneli
Admin hesabı (`admins/<uid>: true`) ilə girəndə **Profil → Ayarlar**-ın ən üstündə «Admin paneli» düyməsi görünür; digər istifadəçilərə görünmür.

`/admin.html` — Ümumi statistika, Elanlar (blokla/VIP ver/sil), İstifadəçilər (AV əlavə et/çıxart), Promokodlar (yarat, limit, bitmə tarixi, aktiv/passiv), Bildiriş (pop-up mətn, növ, önizləmə, hər dəfə/bir dəfə), Dəstək, Ayarlar (önə çıxarma qiyməti və gün).
**Ayarlar** bölməsində bir dəfə «Yadda saxla» basın (standart: 3 AV, 3 gün).

## 5) Test ssenarisi
1. Admin → Promokodlar → kod yarat (məs. 10 AV).
2. İstifadəçi → Profil → Yüklə → kodu daxil et → balans artır.
3. Elan yerləşdir, Elanlarım → «Önə çıxar» → AV çıxılır, VIP nişanı.
4. İkinci hesabla elana «Mesaj yaz», birinci hesabda bildiriş gəlir.
5. Admin → Bildiriş → «Güncelləmə v1.0» yaz, dərc et → istifadəçi səhifəni açanda pop-up çıxır.

## Məhdudiyyətlər (dürüst qeydlər)
- **Tətbiq bağlı olanda push bildiriş yoxdur.** Bunun üçün Firebase Cloud Messaging və server funksiyası (Blaze plan) lazımdır. İndiki bildirişlər tətbiq/səhifə açıq və ya arxa planda olanda işləyir.
- Şəkillər Storage əvəzinə Realtime Database-də saxlanılır (Storage ödənişli plan tələb edir). Çox elan olarsa Storage-a keçmək lazım gələcək.
- AV əməliyyat tarixçəsi (`av_tx`) məlumat xarakterlidir, istifadəçi öz qeydlərini yaza bilir. Balansın özü qaydalarla qorunur: istifadəçi yalnız azalda və ya etibarlı promokodla artıra bilər.
- Admin söhbətləri (`chats`) oxuya bilər (şikayət araşdırması üçün). İstifadəçilərə bunu qaydalarda qeyd etmək məsləhətdir.
- Kod yoxlamaları Firebase-in əvəzinə yerli simulyasiya ilə aparılıb. Qaydaları real Firebase-də ilk dəfə yayımlayanda xəta çıxa bilər.
