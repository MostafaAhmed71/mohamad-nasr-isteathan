/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
clientsClaim()

void self.skipWaiting()

function isDevOrViteAsset(url: URL): boolean {
  return (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('/.vite/')
  )
}

// App shell assets — never API / student data, never Vite HMR modules
registerRoute(
  ({ request, url }) =>
    !isDevOrViteAsset(url) &&
    (request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'worker'),
  new CacheFirst({
    cacheName: 'isteathan-app-shell',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  }),
)

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'isteathan-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 32,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  }),
)

registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'isteathan-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 16,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
)

// Supabase Auth / REST / Realtime / Storage — never cache
registerRoute(
  ({ url }) => url.hostname.endsWith('supabase.co') || url.hostname.includes('supabase'),
  new NetworkOnly(),
)

// Navigations: network only; on failure show Arabic offline page (no stale entity data)
async function navigationHandler({ request }: { request: Request }): Promise<Response> {
  try {
    const response = await fetch(request)
    if (response.ok) return response
  } catch {
    // network failure — fall through to offline page
  }

  const offline = await caches.match('/offline.html', { ignoreSearch: true })
  if (offline) return offline

  return Response.error()
}

registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api/, /supabase/i],
  }),
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly(),
)

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {}
  try {
    data = event.data ? (event.data.json() as typeof data) : {}
  } catch {
    data = { title: 'خروج', body: event.data?.text() ?? 'لديك تحديث جديد' }
  }

  const title = data.title ?? 'خروج'
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body ?? 'لديك تحديث على طلب الخروج',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag ?? 'isteathan-push',
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url ?? '/display/class' },
    requireInteraction: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url ?? '/display/class'
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            await (client as unknown as { navigate: (url: string) => Promise<unknown> }).navigate(
              targetUrl,
            )
          }
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
