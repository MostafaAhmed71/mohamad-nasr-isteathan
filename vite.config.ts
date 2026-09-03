import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { adminApiPlugin } from './vite.admin-plugin'
import { notifyDecisionPlugin } from './vite.notify-plugin'
import { whatsappNotifyPlugin } from './vite.whatsapp-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Expose server-side env to the notify plugin middleware
  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY
  process.env.VITE_VAPID_PUBLIC_KEY ??= env.VITE_VAPID_PUBLIC_KEY
  process.env.VAPID_PUBLIC_KEY ??= env.VAPID_PUBLIC_KEY
  process.env.VAPID_PRIVATE_KEY ??= env.VAPID_PRIVATE_KEY
  process.env.VAPID_SUBJECT ??= env.VAPID_SUBJECT
  process.env.WHATSAPP_GATEWAY_URL ??= env.WHATSAPP_GATEWAY_URL
  process.env.WHATSAPP_GATEWAY_SECRET ??= env.WHATSAPP_GATEWAY_SECRET

  return {
  server: {
    host: true,
    port: 5173,
    // Allow phone testing via LAN IP and temporary HTTPS tunnels
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    notifyDecisionPlugin(),
    adminApiPlugin(),
    whatsappNotifyPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: [
        'offline.html',
        'icons/*.png',
        'favicon.ico',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'school-logo.jpeg',
        'app-version.json',
      ],
      manifest: {
        name: 'تطبيق خروج متوسطة وثانوية نخبة الشمال الأهلية',
        short_name: 'خروج — نخبة الشمال',
        description: 'نظام خروج — مدارس نخبة الشمال الأهلية',
        lang: 'ar',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        theme_color: '#0b1f3f',
        background_color: '#0b1f3f',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Precache app shell only (static assets). No API responses.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        // Never enable SW in Vite dev — CacheFirst poisons HMR and causes duplicate React.
        enabled: false,
      },
    }),
  ],
  }
})
