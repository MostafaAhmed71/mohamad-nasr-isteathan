import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { APP_NAME_SHORT } from '../lib/brand'
import {
  checkForAppUpdate,
  installAppUpdate,
  type RemoteAppVersion,
} from '../lib/appUpdate'
import { isNativeApp } from '../lib/native'
import { PrimaryButton, SecondaryButton } from './ui'

export function AppUpdatePrompt() {
  const [remote, setRemote] = useState<RemoteAppVersion | null>(null)
  const [installedBuild, setInstalledBuild] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    const result = await checkForAppUpdate()
    if (result.available && result.remote) {
      setRemote(result.remote)
      setInstalledBuild(result.installedBuild)
    } else {
      setRemote(null)
    }
  }

  useEffect(() => {
    if (!isNativeApp()) return
    void refresh()
    const sub = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh()
    })
    return () => {
      void sub.then((handle) => handle.remove())
    }
  }, [])

  if (!remote) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4">
      <div className="mx-auto max-w-lg rounded-2xl border border-[rgba(212,175,55,0.45)] bg-[#0b1f3f] p-4 shadow-2xl">
        <p className="font-bold text-[var(--color-gold)]">تحديث جديد متوفر</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {APP_NAME_SHORT} — الإصدار {remote.versionName} (رقم {remote.versionCode}) متاح. النسخة
          الحالية: {installedBuild}.
        </p>
        {remote.notes ? (
          <p className="mt-2 text-sm text-[var(--color-text)]">{remote.notes}</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-[#ffb0b0]">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setError('')
              void installAppUpdate(remote.apkUrl)
                .catch((err) => {
                  const message = err instanceof Error ? err.message : 'تعذر التحديث'
                  if (message.includes('install_permission_required')) {
                    setError(
                      'اسمح بتثبيت التطبيقات من هذا المصدر من إعدادات الجهاز، ثم اضغط «تحديث الآن» مرة أخرى.',
                    )
                  } else {
                    setError(message)
                  }
                })
                .finally(() => setBusy(false))
            }}
          >
            {busy ? 'جاري التحميل...' : 'تحديث الآن'}
          </PrimaryButton>
          <SecondaryButton type="button" disabled={busy} onClick={() => setRemote(null)}>
            لاحقاً
          </SecondaryButton>
        </div>
      </div>
    </div>
  )
}
