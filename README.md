# خروج

تطبيق ويب عربي (RTL) لإدارة طلبات خروج الطلاب — مدارس نخبة الشمال الأهلية.

المسار الأساسي: مناوب البوابة يرسل طلبًا → يظهر فورًا عند الفصل → موافقة/رفض.

## المتطلبات

- Node.js 20+
- مشروع Supabase

## الإعداد السريع

```bash
cp .env.example .env
# عبّئ VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY
# للبذرة: SUPABASE_SERVICE_ROLE_KEY (من Project Settings → API)
```

### 1) قاعدة البيانات

في Supabase Dashboard → SQL Editor نفّذ بالترتيب:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_rpc.sql`
4. `supabase/migrations/004_notifications.sql` *(Push — اختياري)*

أو مع رابط Postgres:

```bash
SUPABASE_DB_URL='postgresql://...' npm run db:apply
```

فعّل Realtime لجدول `permission_requests` إن لم يُفعَّل تلقائيًا.

### 2) البذرة التجريبية

```bash
npm run db:seed
```

حسابات تجريبية:

| الدور | المعرف | كلمة المرور |
|--------|---------|-------------|
| إدارة | `admin` | `Admin123!` |
| موظف فصل (شاشة) | `c1@g.com` … `c24@g.com` | `c123456` |
| مناوب بوابة | `gate1` | `Gate123!` |

### 3) تشغيل الواجهة

```bash
npm run dev
```

يفتح: http://127.0.0.1:5173/

نفس الأوامر تعمل على ويندوز ولينكس:

- **ويندوز:** Vite يعمل محليًا في مجلد المشروع (`npm run vite:dev` / `vite:build`).
- **لينكس — `/mnt/E` (NTFS):** `npm install` و`vite` يفشلون هناك (`vite: not found` / `esbuild EACCES`). `npm run dev` و`npm run build` ينسخان المشروع تلقائيًا إلى `~/work/isteathan` ويشغّلان منه.

أو مباشرة على لينكس:
```bash
cd ~/work/isteathan && npm run vite:dev
```

### 4) إنشاء الحسابات من لوحة الإدارة

انشر الدالة:

```bash
supabase functions deploy admin-create-user
```

بدونها يمكن إنشاء الحسابات عبر `npm run db:seed` فقط.

## المسارات

- `/login`
- `/gate` — مناوبو البوابة
- `/display/class` — شاشة الفصل
- `/admin` · طلبات · طلاب · مناوبو البوابة · فصول · استيراد

## النشر على استضافة (هوستنجر / Apache / LiteSpeed)

```bash
npm run build
```

ارفع **محتويات** مجلد `dist` إلى `public_html` (وليس المجلد نفسه).

`public/.htaccess` يُنسخ تلقائيًا إلى `dist` وهو ضروري: بدونه يظهر
«Page Not Found» عند تحديث أي صفحة داخلية مثل `/admin/guide`، لأن الخادم
يبحث عن مجلد بهذا الاسم بدل تسليم `index.html` للتطبيق.

بعد كل رفع جديد: افتح الموقع واعمل تحديثًا قسريًا (Ctrl+Shift+R) مرة واحدة
حتى يحدّث الـ Service Worker نفسه.

> حذف الحسابات من لوحة الإدارة يمر عبر `/api/admin-delete-user` أثناء التطوير فقط.
> على الاستضافة يجب نشر دالة Supabase:
> ```bash
> supabase functions deploy admin-delete-user
> ```

## إشعارات Push (اختياري)

نفّذ `supabase/migrations/004_notifications.sql` لتفعيل اشتراكات Web Push لشاشات الفصول.

## متغيرات البيئة

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # سكربتات فقط — لا تضعها في Vite
SUPABASE_DB_URL=             # اختياري لتطبيق الترحيلات
```

## PWA

قابلة للتثبيت (app shell فقط). بدون push أو كاش لبيانات الطلاب/الطلبات.

```bash
npm run build
npm run check:pwa
```

النشر يتطلب HTTPS.

## تطبيق iOS (Capacitor + TestFlight)

الواجهة نفسها تُغلَّف في مشروع Xcode عبر Capacitor. البناء والتوقيع والرفع إلى TestFlight يتمّون على [Codemagic](https://codemagic.io) (ماك سحابي) — لا تحتاج ماك محليًا.

معرّف التطبيق (Bundle ID): `sa.isteathan.app`

```bash
npm run vite:build
npx cap sync ios
```

`codemagic.yaml` في جذر المستودع يبني IPA ويرفعه TestFlight عند الدفع إلى `main` / `master`.

### ما الذي تفعله يدويًا مرة واحدة

1. **حساب Apple Developer Program** (مدفوع) على [developer.apple.com](https://developer.apple.com).
2. في [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list): أنشئ App ID من نوع App باسم خروج وـ Bundle ID `sa.isteathan.app`.
3. في [App Store Connect](https://appstoreconnect.apple.com) → My Apps → New App: منصة iOS، الاسم، Bundle ID نفسه، وSKU اختياري مثل `isteathan`. انسخ **Apple ID** الرقمي من App Information — هذا هو `APP_STORE_APPLE_ID`.
4. ارفع المستودع إلى GitHub (أو GitLab/Bitbucket) بعد تضمين مجلد `ios/` و`codemagic.yaml`.
5. أنشئ مفتاح API: App Store Connect → Users and Access → Integrations → App Store Connect API → مفتاح بصلاحية **App Manager**. حمّل ملف `.p8` مرة واحدة واحفظ **Issuer ID** و**Key ID**.
6. في [Codemagic](https://codemagic.io): Add application ← اربط GitHub ← اختر هذا المستودع ← project type **Ionic Capacitor**.
7. Team settings → Team integrations → Developer Portal: أضف المفتاح باسم **`Isteathan`** تمامًا (نفس الاسم في `codemagic.yaml`) مع ملف `.p8` وIssuer ID وKey ID.
8. Team settings → Code signing identities:
   - iOS certificates → **Generate certificate** من نوع **Apple Distribution** باستخدام نفس مفتاح API.
   - iOS provisioning profiles → **Fetch profiles** واختر بروفايل **App Store** لمعرّف `sa.isteathan.app`. إن لم يظهر، أنشئ App Store provisioning profile في بوابة Apple ثم Fetch مرة أخرى.
9. في التطبيق على Codemagic → Environment variables: مجموعة اسمها **`isteathan`** (Secret حيث يلزم) وفيها:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `APP_STORE_APPLE_ID` (الرقم من الخطوة 3)
   - اختياري: `VITE_VAPID_PUBLIC_KEY`
10. Start new build → workflow **iOS TestFlight**. بعد نجاح البناء يظهر التطبيق في TestFlight خلال دقائق (المعالجة عند أبل قد تستغرق أطول في المرة الأولى). أضف نفسك كـ Internal Tester من App Store Connect → TestFlight.

البناء الحالي معلَّم **TestFlight Internal Only** (بدون مراجعة أبل للبيتا الخارجية). لإتاحته لمجموعات خارجية أو للمتجر: احذف `--custom-export-options` من `codemagic.yaml` وأضف `beta_groups` إن لزم.

## تطبيق Android (APK)

نفس الواجهة تُغلَّف عبر Capacitor. معرّف التطبيق: `sa.isteathan.app`  
اسم التطبيق على الجهاز: **تطبيق خروج متوسطة وثانوية نخبة الشمال الأهلية**

### مفتاح التوقيع (مرة واحدة)

```bash
npm run apk:keystore
```

يُنشئ `android/keystore/khurooj-release.jks` و`keystore.properties`. **احفظهما احتياطياً** — بدونهما لا يمكن تحديث التطبيق على الأجهزة دون حذف النسخة القديمة. نسخة التجربة (debug) تُوقَّع بنفس المفتاح تلقائياً.

### بناء ونشر

في `.env` عيّن عنوان موقعك:

```env
APP_UPDATE_BASE_URL=https://your-school-domain.com
```

```bash
npm run apk:release
```

الملف الناتج: `apk/khurooj-release.apk`. ارفع مع موقعك:

- `apk/khurooj-release.apk` (أو انسخه إلى مجلد عام على الخادم)
- `app-version.json` (يُحدَّث تلقائياً في `public/` و`apk/`)

عند فتح التطبيق على الجهاز، إذا وُجد `versionCode` أحدث على الخادم يظهر زر **تحديث الآن** ويُثبّت فوق النسخة الحالية **بدون حذف**.

```bash
npm run apk:update
```

يبني نسخة النشر ثم يشغّل `adb install -r` فوق التطبيق الحالي (USB).

```bash
npm run apk:debug
```

نسخة تجريبية بنفس مفتاح التوقيع.

## الرخصة

استخدام داخلي للمدرسة.
