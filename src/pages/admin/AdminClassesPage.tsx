import { useEffect, useState } from 'react'
import { createManagedUser } from '../../lib/adminCreateUser'
import { deleteAllClassStaff, deleteManagedUser } from '../../lib/adminDeleteUser'
import {
  CLASS_DEFAULT_PASSWORD,
  classDisplayName,
  classStaffIndex,
  classStaffLogin,
  copyText,
  loginFromUsername,
  sortClasses,
} from '../../lib/classStaff'
import { supabase } from '../../lib/supabase'
import { classLabel, type Profile, type SchoolClass } from '../../lib/types'
import {
  DangerButton,
  EmptyState,
  ErrorBox,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui'

export function AdminClassesPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [displays, setDisplays] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [copied, setCopied] = useState('')

  async function reload() {
    const [c, s] = await Promise.all([
      supabase.from('classes').select('*').order('grade').order('section'),
      supabase.from('profiles').select('*').eq('role', 'CLASS_STAFF'),
    ])
    const classList = sortClasses((c.data as SchoolClass[]) ?? [])
    const byId = new Map(((s.data as Profile[]) ?? []).map((p) => [p.id, p]))
    setClasses(classList)
    setDisplays(byId)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function copyValue(label: string, value: string) {
    const ok = await copyText(value)
    setCopied(ok ? label : '')
    if (ok) window.setTimeout(() => setCopied(''), 1600)
  }

  async function toggleActive(c: SchoolClass) {
    await supabase.from('classes').update({ is_active: !c.is_active }).eq('id', c.id)
    await reload()
  }

  async function createDisplayAccount(c: SchoolClass) {
    setError('')
    setInfo('')
    setBusyId(c.id)
    try {
      const index = classStaffIndex(classes, c.id)
      if (index < 1) throw new Error('تعذر تحديد رقم الفصل.')
      const login = classStaffLogin(index)
      await createManagedUser({
        role: 'CLASS_STAFF',
        email: login.email,
        username: login.username,
        full_name: classDisplayName(c.grade, c.section),
        password: CLASS_DEFAULT_PASSWORD,
        class_id: c.id,
      })
      setInfo(
        `تم إنشاء حساب شاشة ${classLabel(c.grade, c.section)}: ${login.email} / ${CLASS_DEFAULT_PASSWORD}`,
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب الشاشة.')
    } finally {
      setBusyId(null)
    }
  }

  async function createAllMissing() {
    setError('')
    setInfo('')
    const missing = classes.filter((c) => !c.staff_profile_id)
    if (missing.length === 0) {
      setInfo('كل الفصول لديها حساب شاشة بالفعل.')
      return
    }
    if (
      !window.confirm(
        `سيتم إنشاء ${missing.length} حساب شاشة.\nكلمة المرور لكل الحسابات: ${CLASS_DEFAULT_PASSWORD}\nالمتابعة؟`,
      )
    ) {
      return
    }

    setBulkBusy(true)
    let ok = 0
    const failures: string[] = []
    try {
      for (let i = 0; i < classes.length; i++) {
        const c = classes[i]
        if (c.staff_profile_id) continue
        const login = classStaffLogin(i + 1)
        try {
          await createManagedUser({
            role: 'CLASS_STAFF',
            email: login.email,
            username: login.username,
            full_name: classDisplayName(c.grade, c.section),
            password: CLASS_DEFAULT_PASSWORD,
            class_id: c.id,
          })
          ok += 1
        } catch (err) {
          failures.push(
            `${classLabel(c.grade, c.section)}: ${err instanceof Error ? err.message : 'فشل'}`,
          )
        }
      }
      await reload()
      setInfo(
        `تم إنشاء ${ok} حساب شاشة. كلمة المرور: ${CLASS_DEFAULT_PASSWORD}` +
          (failures.length ? ' · تعذر إنشاء بعضها' : ''),
      )
      if (failures.length) setError(failures.slice(0, 4).join(' · '))
    } finally {
      setBulkBusy(false)
    }
  }

  async function deleteDisplay(c: SchoolClass) {
    if (!c.staff_profile_id) return
    const profile = displays.get(c.staff_profile_id)
    if (
      !window.confirm(
        `حذف حساب شاشة ${classLabel(c.grade, c.section)} نهائيًا؟\nلن تعمل الشاشة بعد ذلك.`,
      )
    ) {
      return
    }
    setBusyId(c.id)
    setError('')
    try {
      const result = await deleteManagedUser(c.staff_profile_id)
      if (result.failures.length) {
        setError(result.failures.map((f) => f.error).join(' · '))
      } else {
        setInfo(`تم حذف حساب شاشة ${profile?.full_name ?? classLabel(c.grade, c.section)}.`)
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحساب.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleDisplayActive(profileId: string) {
    const p = displays.get(profileId)
    if (!p) return
    await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', profileId)
    await reload()
  }

  async function deleteAllDisplays() {
    const count = classes.filter((c) => c.staff_profile_id).length
    if (count === 0) {
      setInfo('لا توجد حسابات شاشة لحذفها.')
      return
    }
    if (!window.confirm(`حذف كل حسابات الشاشة (${count})؟`)) return
    if (!window.confirm('تأكيد أخير: حذف جميع حسابات الشاشة؟')) return

    setBulkBusy(true)
    try {
      const result = await deleteAllClassStaff()
      setInfo(`تم حذف ${result.deleted_count} حسابًا.`)
      if (result.failures.length) {
        setError(result.failures.slice(0, 5).map((f) => f.error).join(' · '))
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحسابات.')
    } finally {
      setBulkBusy(false)
    }
  }

  const busy = bulkBusy || busyId !== null
  const missingCount = classes.filter((c) => !c.staff_profile_id).length

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--color-gold)]">الفصول (24)</h1>
      <p className="text-[var(--color-muted)]">
        كل فصل يحتاج <strong>حساب شاشة</strong> واحدًا يُفتح عليه{' '}
        <strong dir="ltr">/display/class</strong> على التابلت أو الشاشة في الفصل. لا حاجة
        لمشرف منفصل — الطلبات تصل مباشرة للشاشة.
      </p>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="button" disabled={busy || loading || missingCount === 0} onClick={() => void createAllMissing()}>
          {bulkBusy ? 'جاري الإنشاء...' : `إنشاء حسابات الشاشة (${missingCount} ناقص)`}
        </PrimaryButton>
        <DangerButton type="button" disabled={busy || loading} onClick={() => void deleteAllDisplays()}>
          حذف كل حسابات الشاشة
        </DangerButton>
      </div>

      <ErrorBox message={error} />
      {info ? <p className="text-sm text-[var(--color-gold-soft)]">{info}</p> : null}

      {loading ? <p className="text-[var(--color-muted)]">جاري التحميل...</p> : null}
      {!loading && classes.length === 0 ? (
        <EmptyState>لا توجد فصول. نفّذ ترحيل قاعدة البيانات.</EmptyState>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {classes.map((c) => {
          const display = c.staff_profile_id ? displays.get(c.staff_profile_id) : null
          const login = display ? loginFromUsername(display.username) : ''
          const cardBusy = busyId === c.id

          return (
            <article key={c.id} className="glass-panel glass-interactive p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold">{classLabel(c.grade, c.section)}</h2>
                  <p className="text-sm text-[var(--color-muted)]">{c.is_active ? 'نشط' : 'غير نشط'}</p>
                </div>
                <SecondaryButton type="button" disabled={cardBusy} onClick={() => void toggleActive(c)}>
                  {c.is_active ? 'تعطيل' : 'تفعيل'}
                </SecondaryButton>
              </div>

              <div className="mt-4 space-y-2 border-t border-[rgba(201,162,39,0.2)] pt-3">
                <p className="text-sm font-bold text-[var(--color-gold)]">حساب الشاشة</p>
                {display ? (
                  <>
                    <p className="text-sm text-[var(--color-muted)]">
                      اسم الدخول:{' '}
                      <strong dir="ltr" className="text-[var(--color-text)]">
                        {login}
                      </strong>
                    </p>
                    <p className="text-sm text-[var(--color-muted)]">
                      كلمة المرور الافتراضية: <strong dir="ltr">{CLASS_DEFAULT_PASSWORD}</strong>
                    </p>
                    {!display.is_active ? (
                      <p className="text-sm text-[#ffb0b0]">الحساب غير نشط</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {login ? (
                        <SecondaryButton
                          type="button"
                          disabled={cardBusy}
                          onClick={() => void copyValue(c.id, login)}
                        >
                          {copied === c.id ? 'تم النسخ' : 'نسخ اسم الدخول'}
                        </SecondaryButton>
                      ) : null}
                      <SecondaryButton
                        type="button"
                        disabled={cardBusy}
                        onClick={() => void toggleDisplayActive(display.id)}
                      >
                        {display.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                      </SecondaryButton>
                      <DangerButton type="button" disabled={cardBusy} onClick={() => void deleteDisplay(c)}>
                        {cardBusy ? 'جاري...' : 'حذف الحساب'}
                      </DangerButton>
                    </div>
                  </>
                ) : (
                  <SecondaryButton
                    type="button"
                    disabled={cardBusy || bulkBusy}
                    onClick={() => void createDisplayAccount(c)}
                  >
                    {cardBusy ? 'جاري الإنشاء...' : 'إنشاء حساب الشاشة'}
                  </SecondaryButton>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
