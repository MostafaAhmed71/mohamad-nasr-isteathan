import { supabase } from './supabase'
import { isNativeApp } from './native'
import {
  ensureNotificationPermission,
  ensureServiceWorkerReady,
  type NotifyPermission,
} from './notify'

export type PushEnableResult = {
  permission: NotifyPermission
  subscribed: boolean
  message: string
}

export type NotifyDecisionResult = {
  sent: number
  reason?: string
  error?: string
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

async function savePushSubscription(userId: string): Promise<{ ok: boolean; message: string }> {
  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidPublic) {
    return { ok: false, message: 'مفتاح VAPID غير مضبوط على الخادم.' }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, message: 'هذا المتصفح لا يدعم إشعارات الخلفية (Web Push).' }
  }

  const reg = await ensureServiceWorkerReady()
  if (!reg?.pushManager) {
    return { ok: false, message: 'تعذر تفعيل Service Worker. أعد تحميل الصفحة ثم حاول مرة أخرى.' }
  }

  if (!navigator.serviceWorker.controller) {
    return {
      ok: false,
      message: 'تم تجهيز الإشعارات. أعد تحميل الصفحة ثم اضغط «تفعيل الإشعارات» مرة أخرى.',
    }
  }

  try {
    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      })
    }

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, message: 'تعذر إنشاء اشتراك الإشعارات.' }
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    if (error) {
      console.error('push subscribe save failed', error)
      return {
        ok: false,
        message:
          error.message.includes('does not exist') || error.code === '42P01'
            ? 'جدول الإشعارات غير موجود. نفّذ ملف supabase/migrations/004_notifications.sql في Supabase.'
            : `تعذر حفظ الجهاز: ${error.message}`,
      }
    }

    return { ok: true, message: 'تم تسجيل هذا الجهاز لإشعارات الخلفية.' }
  } catch (err) {
    console.error(err)
    // If subscribe failed due to key mismatch, drop old subscription and retry once.
    try {
      const reg = await ensureServiceWorkerReady()
      const existing = await reg?.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()
      const subscription = await reg!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic!),
      })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw err
      }
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw error
      return { ok: true, message: 'تم تسجيل هذا الجهاز لإشعارات الخلفية.' }
    } catch (retryErr) {
      console.error(retryErr)
      return {
        ok: false,
        message: retryErr instanceof Error ? retryErr.message : 'فشل تفعيل إشعارات الخلفية.',
      }
    }
  }
}

/** Enable permission + subscribe this device for background Web Push. */
export async function enablePushNotifications(): Promise<PushEnableResult> {
  const permission = await ensureNotificationPermission(true)
  if (permission !== 'granted') {
    return {
      permission,
      subscribed: false,
      message:
        permission === 'denied'
          ? isNativeApp()
            ? 'الإشعارات مرفوضة. من إعدادات الجهاز → التطبيقات → خروج → إشعارات، فعّلها ثم اضغط «تفعيل الإشعارات».'
            : 'الإشعارات مرفوضة من إعدادات المتصفح.'
          : permission === 'insecure'
            ? 'يلزم فتح الموقع عبر HTTPS لتفعيل إشعارات الخلفية.'
            : 'لم يتم منح إذن الإشعارات.',
    }
  }

  if (isNativeApp()) {
    return {
      permission,
      subscribed: true,
      message: 'تم تفعيل إشعارات التطبيق. سيصلك التنبيه في شريط الإشعارات حتى لو كان التطبيق في الخلفية.',
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { permission, subscribed: false, message: 'يجب تسجيل الدخول أولاً.' }
  }

  const saved = await savePushSubscription(user.id)
  return {
    permission,
    subscribed: saved.ok,
    message: saved.ok
      ? `${saved.message} سيصلك الإشعار حتى لو أغلقت المتصفح (يفضّل تثبيت التطبيق على الشاشة الرئيسية).`
      : saved.message,
  }
}

/** Quietly refresh subscription whenever the user opens the app. */
export async function refreshPushSubscriptionSilent(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (isNativeApp()) return false
  if (!window.isSecureContext) return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const saved = await savePushSubscription(user.id)
  return saved.ok
}

async function postNotify(
  path: string,
  body: Record<string, string>,
  token: string,
): Promise<NotifyDecisionResult> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return { sent: 0, error: 'notify_endpoint_unavailable' }
  }

  const data = (await res.json()) as {
    sent?: number
    reason?: string
    error?: string
  }

  if (!res.ok) {
    return { sent: 0, error: data.error ?? `http_${res.status}` }
  }

  return { sent: data.sent ?? 0, reason: data.reason }
}

async function withRetries(
  run: () => Promise<NotifyDecisionResult>,
  times = 3,
): Promise<NotifyDecisionResult> {
  let last: NotifyDecisionResult = { sent: 0, error: 'notify_failed' }
  for (let i = 0; i < times; i += 1) {
    last = await run()
    if (last.sent > 0) return last
    if (last.reason === 'no_subscriptions') return last
    await new Promise((r) => window.setTimeout(r, 400 * (i + 1)))
  }
  return last
}

export async function notifyStaffOfNewRequest(
  requestId: string,
): Promise<NotifyDecisionResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return { sent: 0, error: 'no_session' }

    return withRetries(() =>
      postNotify('/api/notify-new-request', { request_id: requestId }, session.access_token),
    )
  } catch (err) {
    return {
      sent: 0,
      error: err instanceof Error ? err.message : 'notify_failed',
    }
  }
}
