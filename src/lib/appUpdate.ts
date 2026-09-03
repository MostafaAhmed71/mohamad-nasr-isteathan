import { App } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isNativeApp } from './native'

export interface RemoteAppVersion {
  versionCode: number
  versionName: string
  apkUrl: string
  notes?: string
}

interface AppUpdatePlugin {
  installApk(options: { url: string }): Promise<{ ok: boolean }>
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate', {
  web: () =>
    Promise.resolve({
      installApk: async () => ({ ok: false }),
    }),
})

function updateManifestUrl(): string {
  const configured = String(import.meta.env.VITE_APP_UPDATE_URL ?? '').trim()
  if (configured) return configured
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/app-version.json`
  }
  return '/app-version.json'
}

export async function fetchRemoteAppVersion(): Promise<RemoteAppVersion | null> {
  try {
    const res = await fetch(`${updateManifestUrl()}?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<RemoteAppVersion>
    if (!data.versionCode || !data.apkUrl) return null
    return {
      versionCode: Number(data.versionCode),
      versionName: String(data.versionName ?? ''),
      apkUrl: String(data.apkUrl),
      notes: data.notes ? String(data.notes) : undefined,
    }
  } catch {
    return null
  }
}

export async function getInstalledBuildNumber(): Promise<number> {
  if (!isNativeApp()) return 0
  const info = await App.getInfo()
  const build = Number.parseInt(info.build, 10)
  return Number.isFinite(build) ? build : 0
}

export async function checkForAppUpdate(): Promise<{
  available: boolean
  remote: RemoteAppVersion | null
  installedBuild: number
}> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') {
    return { available: false, remote: null, installedBuild: 0 }
  }

  const [remote, installedBuild] = await Promise.all([
    fetchRemoteAppVersion(),
    getInstalledBuildNumber(),
  ])

  if (!remote) {
    return { available: false, remote: null, installedBuild }
  }

  return {
    available: remote.versionCode > installedBuild,
    remote,
    installedBuild,
  }
}

export async function installAppUpdate(apkUrl: string): Promise<void> {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') {
    window.open(apkUrl, '_blank', 'noopener,noreferrer')
    return
  }

  const result = await AppUpdate.installApk({ url: apkUrl })
  if (!result.ok) {
    throw new Error('تعذر بدء التحديث.')
  }
}
