import { Capacitor, registerPlugin } from '@capacitor/core'
import { isNativeApp } from './native'
import { supabase } from './supabase'
import type { Profile } from './types'

interface MonitorStartOptions {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  refreshToken: string
  userId: string
  role: string
  classId: string
}

interface BackgroundMonitorPlugin {
  start(options: MonitorStartOptions): Promise<void>
  stop(): Promise<void>
  requestIgnoreBatteryOptimizations(): Promise<{ unrestricted: boolean }>
  checkOverlayPermission(): Promise<{ granted: boolean }>
  requestOverlayPermission(): Promise<{ granted: boolean }>
  consumeLaunchPath(): Promise<{ path: string }>
}

class BackgroundMonitorWeb {
  async start(_options: MonitorStartOptions) {}
  async stop() {}
  async requestIgnoreBatteryOptimizations() {
    return { unrestricted: true }
  }
  async checkOverlayPermission() {
    return { granted: false }
  }
  async requestOverlayPermission() {
    return { granted: false }
  }
  async consumeLaunchPath() {
    return { path: '' }
  }
}

const BackgroundMonitor = registerPlugin<BackgroundMonitorPlugin>('BackgroundMonitor', {
  web: () => Promise.resolve(new BackgroundMonitorWeb()),
})

export async function checkOverlayPermission(): Promise<boolean> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return false
  try {
    const result = await BackgroundMonitor.checkOverlayPermission()
    return result.granted
  } catch {
    return false
  }
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return false
  try {
    const result = await BackgroundMonitor.requestOverlayPermission()
    return result.granted
  } catch (err) {
    console.error('overlay permission failed', err)
    return false
  }
}

const CLASS_DISPLAY_PATH = '/display/class'
const ALLOWED_LAUNCH_PATHS = new Set([
  CLASS_DISPLAY_PATH,
  '/gate',
])

export function listenNativeLaunchPath(onNavigate: (path: string) => void): () => void {
  const onEvent = (event: Event) => {
    const path = (event as CustomEvent<string>).detail
    if (typeof path === 'string' && ALLOWED_LAUNCH_PATHS.has(path)) {
      onNavigate(path)
    }
  }
  window.addEventListener('isteathan:navigate', onEvent)
  return () => window.removeEventListener('isteathan:navigate', onEvent)
}

export async function consumeNativeLaunchPath(): Promise<string | null> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return null
  try {
    const result = await BackgroundMonitor.consumeLaunchPath()
    const path = result.path?.trim()
    return path && ALLOWED_LAUNCH_PATHS.has(path) ? path : null
  } catch {
    return null
  }
}

export async function stopBackgroundMonitor(): Promise<void> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return
  try {
    await BackgroundMonitor.stop()
  } catch (err) {
    console.error('stop background monitor failed', err)
  }
}

export async function syncBackgroundMonitor(profile: Profile | null): Promise<void> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return
  if (!profile || profile.role !== 'CLASS_STAFF') {
    await stopBackgroundMonitor()
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    await stopBackgroundMonitor()
    return
  }

  let classId = ''
  if (profile.role === 'CLASS_STAFF') {
    const { data } = await supabase
      .from('classes')
      .select('id')
      .eq('staff_profile_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()
    classId = data?.id ?? ''
    if (!classId) {
      await stopBackgroundMonitor()
      return
    }
  }

  try {
    await BackgroundMonitor.start({
      supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''),
      anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
      accessToken: session.access_token,
      refreshToken: session.refresh_token ?? '',
      userId: profile.id,
      role: profile.role,
      classId,
    })
    await BackgroundMonitor.requestIgnoreBatteryOptimizations()
  } catch (err) {
    console.error('start background monitor failed', err)
  }
}
