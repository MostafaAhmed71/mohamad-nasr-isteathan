import { useCallback, useEffect, useState } from 'react'
import { SchoolBrand } from '../../components/SchoolBrand'
import { Toast } from '../../components/Toast'
import { useAuth } from '../../lib/auth'
import { notifyStaffOfNewRequest } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { GRADE_LABELS, SECTIONS } from '../../lib/types'
import {
  EmptyState,
  ErrorBox,
  PageShell,
  PrimaryButton,
  SecondaryButton,
  TextField,
} from '../../components/ui'

interface GateSearchRow {
  id: string
  full_name: string
  grade: number
  class_id: string
  class_label: string
  has_pending: boolean
}

function formatClassLabel(grade: number, sectionFromLabel: string): string {
  const section = sectionFromLabel.trim().split(/\s+/).pop() ?? ''
  const sec = (SECTIONS as readonly string[]).includes(section) ? section : sectionFromLabel
  return `الصف ${GRADE_LABELS[grade] ?? grade} — ${sec}`
}

export function GatePage() {
  const { profile, signOut } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GateSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [sentToday, setSentToday] = useState(0)

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setError('')
      return
    }
    setSearching(true)
    setError('')
    const { data, error: err } = await supabase.rpc('search_students_for_gate', {
      p_query: trimmed,
    })
    setSearching(false)
    if (err) {
      setError(
        err.message.includes('does not exist') || err.code === '42883'
          ? 'نفّذ ملفات supabase/migrations/ (001–003) في Supabase.'
          : 'تعذر البحث. حاول مرة أخرى.',
      )
      setResults([])
      return
    }
    setResults((data as GateSearchRow[]) ?? [])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search(query)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query, search])

  async function sendExit(student: GateSearchRow) {
    if (student.has_pending) {
      setError('يوجد طلب خروج قيد الانتظار لهذا الطالب.')
      return
    }
    setBusyId(student.id)
    setError('')
    const { data, error: err } = await supabase.rpc('create_gate_exit_request', {
      p_student_id: student.id,
    })
    if (err) {
      setBusyId(null)
      setError(err.message || 'تعذر إرسال طلب الخروج.')
      return
    }
    const requestId = (data as { id?: string })?.id
    if (requestId) void notifyStaffOfNewRequest(requestId)
    setBusyId(null)
    setSentToday((n) => n + 1)
    setToast(`تم إرسال ${student.full_name} إلى شاشة الفصل`)
    setResults((rows) =>
      rows.map((r) => (r.id === student.id ? { ...r, has_pending: true } : r)),
    )
  }

  return (
    <PageShell
      title="بوابة الخروج"
      subtitle={profile?.full_name ?? ''}
      actions={
        <SecondaryButton type="button" onClick={() => void signOut()}>
          تسجيل الخروج
        </SecondaryButton>
      }
    >
      <div className="mb-6 flex justify-center">
        <SchoolBrand variant="compact" />
      </div>

      <article className="glass-panel glass-interactive space-y-4 p-5">
        <p className="text-center text-[var(--color-muted)]">
          اكتب جزءاً من اسم الطالب، ثم اضغط <strong className="text-[var(--color-gold)]">خروج</strong>{' '}
          ليظهر الطلب فوراً على شاشة الفصل.
        </p>
        <TextField
          label="بحث عن طالب"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="مثال: محمد أو أحمد"
          autoComplete="off"
          autoFocus
        />
        {searching ? (
          <p className="text-center text-sm text-[var(--color-muted)]">جاري البحث...</p>
        ) : null}
        {sentToday > 0 ? (
          <p className="text-center text-sm text-[var(--color-gold-soft)]">
            طلبات اليوم: {sentToday}
          </p>
        ) : null}
      </article>

      <ErrorBox message={error} />

      {query.trim().length >= 2 && !searching && results.length === 0 ? (
        <EmptyState>لا يوجد طالب بهذا الاسم.</EmptyState>
      ) : null}

      <div className="mt-4 space-y-3">
        {results.map((student) => (
          <article
            key={student.id}
            className="glass-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)]">{student.full_name}</h2>
              <p className="mt-1 text-[var(--color-muted)]">
                {formatClassLabel(student.grade, student.class_label)}
              </p>
              {student.has_pending ? (
                <p className="mt-2 text-sm text-amber-300">طلب خروج قيد الانتظار</p>
              ) : null}
            </div>
            <PrimaryButton
              type="button"
              className="min-h-14 min-w-[8rem] text-lg"
              disabled={busyId === student.id || student.has_pending}
              onClick={() => void sendExit(student)}
            >
              {busyId === student.id ? 'جاري الإرسال...' : student.has_pending ? 'مُرسَل' : 'خروج'}
            </PrimaryButton>
          </article>
        ))}
      </div>

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </PageShell>
  )
}
