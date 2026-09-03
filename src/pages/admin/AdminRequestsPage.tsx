import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  GRADE_LABELS,
  SECTIONS,
  STATUS_LABELS,
  classLabel,
  formatDateTime,
  requestOriginLabel,
  type PermissionRequest,
  type RequestStatus,
  type SchoolClass,
} from '../../lib/types'
import { EmptyState, SelectField, StatusBadge, TextField } from '../../components/ui'

export function AdminRequestsPage() {
  const [rows, setRows] = useState<PermissionRequest[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState('')
  const [classId, setClassId] = useState('')
  const [status, setStatus] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    async function load() {
      const [reqRes, classRes] = await Promise.all([
        supabase
          .from('permission_requests')
          .select(
            '*, students(full_name, grade), classes(*), gate_officer:profiles!created_by(full_name)',
          )
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('classes').select('*').order('grade').order('section'),
      ])
      setRows((reqRes.data as PermissionRequest[]) ?? [])
      setClasses((classRes.data as SchoolClass[]) ?? [])
      setLoading(false)
    }
    void load()
  }, [])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const studentName = r.students?.full_name ?? ''
      const origin = requestOriginLabel(r)
      if (q && !`${studentName} ${origin}`.includes(q.trim())) return false
      if (grade && String(r.classes?.grade ?? r.students?.grade) !== grade) return false
      if (classId && r.class_id !== classId) return false
      if (status && r.status !== status) return false
      if (date) {
        const d = r.created_at.slice(0, 10)
        if (d !== date) return false
      }
      return true
    })
  }, [rows, q, grade, classId, status, date])

  const classOptions = grade
    ? classes.filter((c) => String(c.grade) === grade)
    : classes

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--color-gold)]">الطلبات</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TextField label="بحث (طالب / مصدر)" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label="الصف" value={grade} onChange={(e) => { setGrade(e.target.value); setClassId('') }}>
          <option value="">الكل</option>
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <option key={g} value={g}>{GRADE_LABELS[g]}</option>
          ))}
        </SelectField>
        <SelectField label="الفصل" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">الكل</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>{classLabel(c.grade, c.section)}</option>
          ))}
        </SelectField>
        <SelectField label="الحالة" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">الكل</option>
          {(Object.keys(STATUS_LABELS) as RequestStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </SelectField>
        <TextField label="التاريخ" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {loading ? <p className="text-[var(--color-muted)]">جاري التحميل...</p> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState>لا توجد نتائج مطابقة للبحث.</EmptyState>
      ) : null}

      <div className="overflow-x-auto glass-panel">
        <table className="min-w-full text-sm">
          <thead className="bg-[rgba(15,42,92,0.35)] text-[var(--color-muted)]">
            <tr>
              {['الطالب', 'الصف', 'الفصل', 'المصدر', 'الحالة', 'وقت الطلب', 'وقت القرار'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-right font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-[rgba(201,162,39,0.15)]">
                <td className="px-3 py-2">{r.students?.full_name}</td>
                <td className="px-3 py-2">{r.classes ? GRADE_LABELS[r.classes.grade] : '—'}</td>
                <td className="px-3 py-2">{r.classes?.section ?? '—'}</td>
                <td className="px-3 py-2">{requestOriginLabel(r)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(r.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.decided_at ? formatDateTime(r.decided_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="hidden">{SECTIONS.join('')}</span>
    </div>
  )
}
