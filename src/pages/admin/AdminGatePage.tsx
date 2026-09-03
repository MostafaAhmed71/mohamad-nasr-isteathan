import { type FormEvent, useEffect, useState } from 'react'
import { createManagedUser } from '../../lib/adminCreateUser'
import { deleteManagedUser } from '../../lib/adminDeleteUser'
import { supabase } from '../../lib/supabase'
import { authEmailForGateOfficer, type Profile } from '../../lib/types'
import {
  DangerButton,
  EmptyState,
  ErrorBox,
  PrimaryButton,
  SecondaryButton,
  TextField,
} from '../../components/ui'

const DEFAULT_PASSWORD = 'Gate123!'

export function AdminGatePage() {
  const [officers, setOfficers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    password: DEFAULT_PASSWORD,
  })

  async function reload() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'GATE_OFFICER')
      .order('full_name')
    if (err) setError('تعذر تحميل حسابات المناوبين.')
    else {
      setError('')
      setOfficers((data as Profile[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setInfo('')
    const username = form.username.trim().toLowerCase()
    const full_name = form.full_name.trim() || `مناوب ${username}`
    try {
      if (!username || username.length < 2) {
        throw new Error('اسم الدخول مطلوب (حرفان على الأقل).')
      }
      await createManagedUser({
        email: authEmailForGateOfficer(username),
        password: form.password || DEFAULT_PASSWORD,
        full_name,
        role: 'GATE_OFFICER',
        username,
      })
      setInfo(`تم إنشاء حساب ${full_name}.`)
      setForm({ full_name: '', username: '', password: DEFAULT_PASSWORD })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب.')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('حذف هذا الحساب؟')) return
    setDeletingId(id)
    setError('')
    try {
      await deleteManagedUser(id)
      setInfo('تم حذف الحساب.')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف.')
    } finally {
      setDeletingId(null)
    }
  }

  async function toggleActive(o: Profile) {
    await supabase.from('profiles').update({ is_active: !o.is_active }).eq('id', o.id)
    await reload()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-gold)]">مناوبو البوابة</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          حسابات المناوبين على بوابة المدرسة. يبحثون عن الطالب بالاسم ويرسلون طلب الخروج إلى شاشة
          الفصل. يُفضّل إنشاء حسابين يتناوبان كل يومين.
        </p>
      </div>

      <form onSubmit={onCreate} className="glass-panel space-y-3 p-4">
        <h2 className="font-bold text-[var(--color-gold)]">إنشاء مناوب</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="الاسم (اختياري)"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            placeholder="مناوب البوابة — أ"
          />
          <TextField
            label="اسم الدخول"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="gate1"
            required
          />
          <TextField
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? 'جاري الإنشاء...' : 'إنشاء حساب مناوب'}
        </PrimaryButton>
      </form>

      <ErrorBox message={error} />
      {info ? <p className="text-sm text-[var(--color-gold-soft)]">{info}</p> : null}

      {loading ? <p className="text-[var(--color-muted)]">جاري التحميل...</p> : null}
      {!loading && officers.length === 0 ? (
        <EmptyState>لا يوجد مناوبون. أنشئ حساباً للاستخدام على جهاز البوابة.</EmptyState>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {officers.map((o) => (
          <article key={o.id} className="glass-panel p-4">
            <h3 className="font-bold">{o.full_name}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              دخول: {o.username ?? '—'}@gate.isteathan.local
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              {o.is_active ? 'نشط' : 'معطّل'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => void toggleActive(o)}>
                {o.is_active ? 'تعطيل' : 'تفعيل'}
              </SecondaryButton>
              <DangerButton
                type="button"
                disabled={deletingId === o.id}
                onClick={() => void onDelete(o.id)}
              >
                {deletingId === o.id ? 'جاري الحذف...' : 'حذف'}
              </DangerButton>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
