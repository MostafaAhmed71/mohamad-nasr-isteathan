/** In-app + browser notifications for realtime request events. */

import { isNativeApp } from './native'
import {
  checkNativeNotificationPermission,
  requestNativeNotificationPermission,
  showNativeNotification,
} from './nativeNotifications'

export type NotifyPermission = NotificationPermission | 'unsupported' | 'insecure'

export function notificationSupport(): NotifyPermission {
  if (typeof window === 'undefined') return 'unsupported'
  if (isNativeApp()) return 'default'
  if (!window.isSecureContext) return 'insecure'
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Read current permission without prompting. */
export async function getNotificationPermission(): Promise<NotifyPermission> {
  if (isNativeApp()) return checkNativeNotificationPermission()
  return notificationSupport()
}

export async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  if (typeof window !== 'undefined' && !window.isSecureContext) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * Request browser notification permission.
 * Pass interactive=true only from a user tap (required on mobile).
 */
export async function ensureNotificationPermission(
  interactive = false,
): Promise<NotifyPermission> {
  if (isNativeApp()) {
    const current = await checkNativeNotificationPermission()
    if (current === 'granted' || current === 'denied' || current === 'unsupported') {
      if (current === 'granted' || !interactive) return current
    }
    if (!interactive) return current
    return requestNativeNotificationPermission()
  }

  const current = notificationSupport()
  if (current === 'unsupported' || current === 'insecure') return current
  if (current === 'denied') return current
  if (!interactive && current !== 'granted') return current

  // Mobile needs an active service worker before notifications work in background
  await ensureServiceWorkerReady()

  if (current === 'granted') return 'granted'
  if (!interactive) return current

  try {
    const result = await Notification.requestPermission()
    if (result === 'granted') {
      await ensureServiceWorkerReady()
    }
    return result
  } catch {
    return Notification.permission
  }
}

export function permissionHelpMessage(permission: NotifyPermission): string {
  if (permission === 'granted') {
    return isNativeApp()
      ? 'تم تفعيل الإشعارات. سيصلك تنبيه في شريط الإشعارات حتى لو كان التطبيق في الخلفية.'
      : 'تم تفعيل إشعارات الخلفية. سيصلك إشعار حتى لو كان المتصفح في الخلفية (بعد تفعيل Web Push).'
  }
  if (permission === 'insecure') {
    return 'إشعارات المتصفح تحتاج HTTPS. استخدم رابط الاختبار الآمن، أو اعتمد على التنبيه داخل التطبيق والتطبيق ظاهر.'
  }
  if (permission === 'unsupported') {
    return 'هذا المتصفح لا يدعم إشعارات سطح المكتب.'
  }
  if (permission === 'denied') {
    return isNativeApp()
      ? 'تم رفض الإشعارات. من إعدادات الجهاز → التطبيقات → خروج → إشعارات، فعّلها ثم اضغط «تفعيل الإشعارات».'
      : 'تم رفض الإشعارات سابقًا. من إعدادات المتصفح لهذا الموقع اختر الإشعارات ← السماح، ثم أعد تحميل الصفحة واضغط «تفعيل الإشعارات».'
  }
  return 'اضغط «تفعيل الإشعارات» للسماح بإشعارات التطبيق.'
}

export function playAlertSound() {
  try {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Background tabs often block audio; notification covers that case.
      return
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    const beep = (start: number, freq: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.25)
    }

    beep(now, 880)
    beep(now + 0.28, 1175)

    window.setTimeout(() => {
      void ctx.close()
    }, 800)
  } catch {
    // Audio may be blocked until a user gesture; ignore.
  }
}

export async function showBrowserNotification(
  title: string,
  body: string,
  url = '/',
) {
  if (isNativeApp()) {
    await showNativeNotification(title, body, url)
    return
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (!window.isSecureContext) return
  if (Notification.permission !== 'granted') return

  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `isteathan-${Date.now()}`,
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    requireInteraction: true,
    vibrate: [200, 100, 200],
  }

  try {
    const reg = await ensureServiceWorkerReady()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
  } catch {
    // fall through to Notification constructor (desktop)
  }

  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Mobile without SW cannot show notifications
  }
}

export function alertNewPermissionRequest(studentName: string) {
  playAlertSound()
  void showBrowserNotification(
    'طلب خروج جديد',
    `وصل طلب خروج للطالب: ${studentName}`,
    '/display/class',
  )
}

export function alertRequestDecision(
  studentName: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string | null,
) {
  const title = status === 'APPROVED' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب'
  const body =
    status === 'APPROVED'
      ? `تمت الموافقة على طلب خروج ${studentName}.`
      : `تم رفض طلب خروج ${studentName}${
          rejectionReason?.trim() ? `: ${rejectionReason.trim()}` : '.'
        }`
  playAlertSound()
  void showBrowserNotification(title, body, '/display/class')
}
