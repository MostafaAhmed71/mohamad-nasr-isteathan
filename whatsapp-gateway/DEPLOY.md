# رفع بوابة واتساب ELITE على VPS هوستنجر

الموقع على هوستنجر واجهة فقط. واتساب يحتاج سيرفر Node + Chromium يعمل باستمرار.

المسار:

الموقع (Hostinger) → دالة Supabase `whatsapp-notify` → VPS ELITE (WPPConnect)

الخادم: Ubuntu 24.04 + OpenLiteSpeed + Node.js  
المسار على السيرفر: `/opt/ELITE`

## 1) إصلاح Auto Close Called

WPPConnect يغلق الصفحة إذا تعذّر معرفة حالة تسجيل الدخول، لأن `deviceSyncTimeout` الافتراضي 180 ثانية و`tryAutoClose` يعمل حتى مع `autoClose: 0`.

في `server.mjs` يجب أن يكون:

- `autoClose: 0`
- `deviceSyncTimeout: 0`
- وسائط Chromium: `--no-sandbox` و`--disable-dev-shm-usage`

## 2) التثبيت على الـ VPS

```bash
apt update
apt install -y nodejs npm chromium-browser || apt install -y chromium-browser
# Ubuntu 24 غالباً:
apt install -y chromium-browser || apt install -y chromium

mkdir -p /opt/ELITE/whatsapp-gateway
# ارفع محتويات whatsapp-gateway (بدون node_modules وبدون tokens)
cd /opt/ELITE/whatsapp-gateway
npm install --omit=dev
```

`/opt/ELITE/.env`:

```env
WHATSAPP_GATEWAY_HOST=127.0.0.1
WHATSAPP_GATEWAY_PORT=3310
WHATSAPP_GATEWAY_SECRET=ضع-سرا-طويلا-هنا
WHATSAPP_SESSION_NAME=ELITE
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

إن لم يوجد `/usr/bin/chromium-browser` جرّب `/usr/bin/chromium` أو مسار `google-chrome`.

## 3) systemd

`/etc/systemd/system/elite-whatsapp.service`:

```
[Unit]
Description=ELITE WhatsApp Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ELITE/whatsapp-gateway
EnvironmentFile=/opt/ELITE/.env
Environment=PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ExecStart=/usr/bin/node /opt/ELITE/whatsapp-gateway/server.mjs
Restart=always
RestartSec=8
User=root

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now elite-whatsapp
journalctl -u elite-whatsapp -f
```

## 4) OpenLiteSpeed (عكس وكيل، لا تفتح 3310 للعالم)

في CyberPanel أو OLS أنشئ موقعاً مثل `wa.your-domain.com` ثم Reverse Proxy إلى `http://127.0.0.1:3310`.

مثال سياق OLS:

```
extprocessor elitewa {
  type                    proxy
  address                 127.0.0.1:3310
  maxConns                100
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

context / {
  type                    proxy
  handler                 elitewa
  addDefaultCharset       off
}
```

فعّل Let’s Encrypt لذلك النطاق.

جدار النار: اسمح 443 فقط، وابْقَ 3310 على localhost.

## 5) ربط Supabase

Secrets:

- `WHATSAPP_GATEWAY_URL` = `https://wpp.northelite0.com/elite-wa`
- `WHATSAPP_GATEWAY_SECRET` = نفس سر `/opt/ELITE/.env` على الـ VPS

```bash
supabase functions deploy whatsapp-notify
supabase functions deploy whatsapp-status
```

نفّذ مرة إن لم تُنفَّذ: `supabase/migrations/004_notifications.sql`

## 6) مسح QR

لوحة الإدارة → **مشرفو الخروج** → امسح الرمز بجوال المدرسة.

الجلسة تُحفظ في `/opt/ELITE/whatsapp-gateway/tokens` — لا تحذفها بعد المسح.
