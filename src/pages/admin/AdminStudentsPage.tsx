import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  GRADE_LABELS,
  SECTIONS,
  classLabel,
  type SchoolClass,
  type Student,
} from '../../lib/types'
import {
  DangerButton,
  EmptyState,
  ErrorBox,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextField,
} from '../../components/ui'

export function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [form, setForm] = useState({
    national_id: '',
    full_name: '',
    grade: '1',
    class_id: '',
  })

  async function reload() {
    const [s, c] = await Promise.all([
      supabase.from('students').select('*, classes(*)').order('full_name'),
      supabase.from('classes').select('*').order('grade').order('section'),
    ])
    setStudents((s.data as Student[]) ?? [])
    setClasses((c.data as SchoolClass[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  const filteredClasses = classes.filter((c) => String(c.grade) === form.grade)

  function startCreate() {
    setEditing(null)
    setForm({
      national_id: '',
      full_name: '',
      grade: '1',
      class_id: '',
    })
  }

  function startEdit(student: Student) {
    setEditing(student)
    setForm({
      national_id: student.national_id,
      full_name: student.full_name,
      grade: String(student.grade),
      class_id: student.class_id,
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!form.national_id || !form.full_name || !form.class_id) {
      setError('رقم الهوية والاسم والفصل مطلوبة.')
      return
    }
    const payload = {
      national_id: form.national_id.trim(),
      full_name: form.full_name.trim(),
      grade: Number(form.grade),
      class_id: form.class_id,
      is_active: true,
    }
    const res = editing
      ? await supabase.from('students').update(payload).eq('id', editing.id)
      : await supabase.from('students').insert(payload)
    if (res.error) {
      setError('تعذر حفظ الطالب. تحقق من رقم الهوية والفصل.')
      return
    }
    startCreate()
    await reload()
  }

  async function removeStudent(student: Student) {
    const ok = window.confirm(`حذف الطالب ${student.full_name} نهائياً؟ لا يمكن التراجع.`)
    if (!ok) return
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const { error: reqErr } = await supabase
        .from('permission_requests')
        .delete()
        .eq('student_id', student.id)
      if (reqErr) {
        setError('تعذر حذف طلبات الخروج المرتبطة بالطالب.')
        return
      }
      const { error: delErr } = await supabase.from('students').delete().eq('id', student.id)
      if (delErr) {
        setError('تعذر حذف الطالب.')
        return
      }
      if (editing?.id === student.id) startCreate()
      setInfo(`تم حذف «${student.full_name}».`)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function removeAllStudents() {
    setError('')
    setInfo('')
    if (students.length === 0) {
      setInfo('لا يوجد طلاب لحذفهم.')
      return
    }
    if (
      !window.confirm(
        `سيتم حذف كل الطلاب (${students.length}) وطلبات الخروج المرتبطة بهم.\nلا يمكن التراجع. المتابعة؟`,
      )
    ) {
      return
    }
    if (!window.confirm('تأكيد أخير: حذف جميع الطلاب نهائياً؟')) {
      return
    }

    setBusy(true)
    try {
      const { error: reqErr } = await supabase
        .from('permission_requests')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (reqErr) {
        setError('تعذر حذف طلبات الخروج قبل حذف الطلاب.')
        return
      }
      const { error: delErr } = await supabase
        .from('students')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (delErr) {
        setError('تعذر حذف الطلاب.')
        return
      }
      startCreate()
      setInfo(`تم حذف جميع الطلاب (${students.length}).`)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-gold)]">الطلاب</h1>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton type="button" disabled={busy} onClick={startCreate}>
            طالب جديد
          </SecondaryButton>
          <DangerButton
            type="button"
            disabled={busy || loading || students.length === 0}
            onClick={() => void removeAllStudents()}
          >
            {busy ? 'جاري الحذف...' : `حذف الكل (${students.length})`}
          </DangerButton>
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 glass-panel glass-interactive p-4 sm:grid-cols-2">
        <TextField label="رقم هوية الطالب" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} required />
        <TextField label="الاسم الكامل" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        <SelectField label="الصف" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value, class_id: '' })}>
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <option key={g} value={g}>{GRADE_LABELS[g]}</option>
          ))}
        </SelectField>
        <SelectField label="الفصل" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} required>
          <option value="">اختر الفصل</option>
          {filteredClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.section}</option>
          ))}
        </SelectField>
        <div className="flex items-end sm:col-span-2">
          <PrimaryButton type="submit" full disabled={busy}>
            {editing ? 'تحديث' : 'إضافة'}
          </PrimaryButton>
        </div>
        <div className="sm:col-span-2 space-y-2">
          <ErrorBox message={error} />
          {info ? <p className="text-sm text-[var(--color-gold-soft)]">{info}</p> : null}
        </div>
      </form>

      {loading ? <p className="text-[var(--color-muted)]">جاري التحميل...</p> : null}
      {!loading && students.length === 0 ? <EmptyState>لا يوجد طلاب.</EmptyState> : null}

      <div className="space-y-2">
        {students.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 glass-panel glass-interactive p-3">
            <div>
              <p className="font-bold">{s.full_name}</p>
              <p className="text-sm text-[var(--color-muted)]">
                {s.national_id} — {s.classes ? classLabel(s.classes.grade, s.classes.section) : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <SecondaryButton type="button" disabled={busy} onClick={() => startEdit(s)}>
                تعديل
              </SecondaryButton>
              <DangerButton type="button" disabled={busy} onClick={() => void removeStudent(s)}>
                حذف
              </DangerButton>
            </div>
          </div>
        ))}
      </div>
      <span className="hidden">{SECTIONS.join('')}</span>
    </div>
  )
}
