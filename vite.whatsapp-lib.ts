export function normalizeWhatsAppNumber(raw: string, defaultCountry = '966'): string | null {
  let value = String(raw ?? '').trim()
  if (!value) return null
  value = value.replace(/[^\d+]/g, '')
  if (value.startsWith('00')) value = value.slice(2)
  if (value.startsWith('+')) value = value.slice(1)
  value = value.replace(/\D/g, '')
  if (!value) return null

  if (value.startsWith('966') && value.length >= 12) return value.slice(0, 12)
  if (value.startsWith('20') && value.length >= 11) return value
  if (value.startsWith('05') && value.length === 10) return `966${value.slice(1)}`
  if (value.startsWith('5') && value.length === 9) return `966${value}`
  if (value.startsWith('01') && value.length >= 10) return `20${value.slice(1)}`
  if (value.length >= 10 && value.length <= 15) {
    if (defaultCountry === '966' && value.startsWith('0')) return `966${value.slice(1)}`
    if (!value.startsWith('966') && !value.startsWith('20') && defaultCountry) {
      const local = value.startsWith('0') ? value.slice(1) : value
      return `${defaultCountry}${local}`
    }
    return value
  }
  return null
}

const GRADE_LABELS: Record<number, string> = {
  1: 'الأول المتوسط',
  2: 'الثاني المتوسط',
  3: 'الثالث المتوسط',
  4: 'الأول الثانوي',
  5: 'الثاني الثانوي',
  6: 'الثالث الثانوي',
}

export function gradeLabel(grade: number): string {
  return GRADE_LABELS[grade] ?? String(grade)
}

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function riyadhWeekday(at = new Date()): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
  }).format(at)
  return WEEKDAY_SHORT[short] ?? at.getDay()
}

export async function loadSupervisorContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { grade: number; classId?: string | null },
): Promise<{ supervisor_name: string; whatsapp_number: string } | null> {
  if (opts.grade >= 1 && opts.grade <= 3) {
    if (!opts.classId) return null
    const { data } = await admin
      .from('supervisor_class_contacts')
      .select('supervisor_name, whatsapp_number')
      .eq('class_id', opts.classId)
      .maybeSingle()
    if (!data) return null
    return {
      supervisor_name: String(data.supervisor_name ?? ''),
      whatsapp_number: String(data.whatsapp_number ?? ''),
    }
  }
  if (opts.grade >= 4 && opts.grade <= 6) {
    const { data } = await admin
      .from('supervisor_daily_roster')
      .select('supervisor_name, whatsapp_number')
      .eq('grade', opts.grade)
      .eq('weekday', riyadhWeekday())
      .maybeSingle()
    if (!data) return null
    return {
      supervisor_name: String(data.supervisor_name ?? ''),
      whatsapp_number: String(data.whatsapp_number ?? ''),
    }
  }
  return null
}

export function formatRequestTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function supervisorNewRequestMessage(input: {
  studentName: string
  grade: number
  section: string
  gateOfficerName: string
  reason: string
  requestTime: string
}): string {
  const reason = input.reason.trim() || 'بدون سبب'
  return [
    'طلب خروج جديد',
    '',
    `الطالب: ${input.studentName}`,
    `الصف: ${gradeLabel(input.grade)}`,
    `الفصل: ${input.section}`,
    '',
    `مناوب البوابة: ${input.gateOfficerName}`,
    '',
    'سبب الخروج:',
    reason,
    '',
    `وقت الطلب: ${formatRequestTime(input.requestTime)}`,
    '',
    'يرجى الدخول إلى نظام خروج لمراجعة الطلب.',
  ].join('\n')
}

export type WhatsAppEvent = 'created' | 'decision'
export type RecipientType = 'SUPERVISOR'
export type MessageType = 'REQUEST_CREATED' | 'REQUEST_APPROVED' | 'REQUEST_REJECTED'

type Job = {
  recipientType: RecipientType
  messageType: MessageType
  phoneRaw: string
  text: string
}

async function claimAndSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  send: (digits: string, text: string) => Promise<void>,
  requestId: string,
  job: Job,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const digits = normalizeWhatsAppNumber(job.phoneRaw)
  if (!digits) {
    await logSkip(admin, requestId, job, 'missing_or_invalid_phone')
    return { ok: false, error: 'invalid_phone' }
  }

  const { data: existing } = await admin
    .from('whatsapp_notifications')
    .select('id, status')
    .eq('permission_request_id', requestId)
    .eq('message_type', job.messageType)
    .eq('recipient_type', job.recipientType)
    .maybeSingle()

  if (existing?.status === 'sent') {
    return { ok: true, skipped: true }
  }

  let rowId = typeof existing?.id === 'string' ? existing.id : ''
  if (!rowId) {
    const insert = await admin.from('whatsapp_notifications').insert({
      permission_request_id: requestId,
      recipient_type: job.recipientType,
      recipient_phone: digits,
      message_type: job.messageType,
      status: 'pending',
      attempts: 0,
    })
    if (insert.error && insert.error.code !== '23505') {
      console.error('[whatsapp] insert log failed', insert.error.message)
      return { ok: false, error: insert.error.message }
    }
    const again = await admin
      .from('whatsapp_notifications')
      .select('id, status')
      .eq('permission_request_id', requestId)
      .eq('message_type', job.messageType)
      .eq('recipient_type', job.recipientType)
      .maybeSingle()
    if (again.data?.status === 'sent') return { ok: true, skipped: true }
    rowId = typeof again.data?.id === 'string' ? again.data.id : ''
  }

  if (!rowId) return { ok: false, error: 'log_row_missing' }

  try {
    await send(digits, job.text)
    await admin.from('whatsapp_notifications').update({
      status: 'sent',
      recipient_phone: digits,
      attempts: Number(existing?.status === 'failed' ? 1 : 0) + 1,
      sent_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', rowId)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed'
    console.error('[whatsapp] send failed', job.messageType, job.recipientType, message)
    await admin.from('whatsapp_notifications').update({
      status: 'failed',
      recipient_phone: digits,
      attempts: Number((existing as { attempts?: number } | null)?.attempts ?? 0) + 1,
      error_message: message.slice(0, 500),
    }).eq('id', rowId)
    return { ok: false, error: message }
  }
}

async function logSkip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  requestId: string,
  job: Job,
  reason: string,
) {
  const { data: existing } = await admin
    .from('whatsapp_notifications')
    .select('id, status')
    .eq('permission_request_id', requestId)
    .eq('message_type', job.messageType)
    .eq('recipient_type', job.recipientType)
    .maybeSingle()
  if (existing?.status === 'sent') return
  if (existing?.id) {
    await admin.from('whatsapp_notifications').update({
      status: 'skipped',
      error_message: reason,
    }).eq('id', String(existing.id))
    return
  }
  await admin.from('whatsapp_notifications').insert({
    permission_request_id: requestId,
    recipient_type: job.recipientType,
    recipient_phone: '',
    message_type: job.messageType,
    status: 'skipped',
    attempts: 0,
    error_message: reason,
  })
}

type RequestRow = {
  id: string
  status: string
  reason: string | null
  rejection_reason: string | null
  created_by: string | null
  class_id?: string | null
  created_at: string
  students:
    | {
        full_name: string
        grade: number
        classes?: { section?: string } | { section?: string }[] | null
      }
    | {
        full_name: string
        grade: number
        classes?: { section?: string } | { section?: string }[] | null
      }[]
    | null
  classes: { grade?: number; section?: string } | { grade?: number; section?: string }[] | null
  profiles:
    | { full_name?: string; phone?: string | null }
    | { full_name?: string; phone?: string | null }[]
    | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function dispatchWhatsAppForRequest(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
  send: (digits: string, text: string) => Promise<void>
  request: RequestRow
  event: WhatsAppEvent
}): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const student = one(opts.request.students)
  const cls = one(opts.request.classes)
  const gateOfficer = one(opts.request.profiles)
  const grade = student?.grade ?? cls?.grade ?? 0
  const section = one(student?.classes)?.section ?? cls?.section ?? ''
  const studentName = student?.full_name ?? 'الطالب'
  const gateOfficerName = gateOfficer?.full_name ?? 'مناوب البوابة'

  const jobs: Job[] = []

  if (opts.event === 'created' && opts.request.status === 'PENDING') {
    const supervisor = await loadSupervisorContact(opts.admin, {
      grade,
      classId: opts.request.class_id,
    })
    if (supervisor) {
      jobs.push({
        recipientType: 'SUPERVISOR',
        messageType: 'REQUEST_CREATED',
        phoneRaw: supervisor.whatsapp_number,
        text: supervisorNewRequestMessage({
          studentName,
          grade,
          section,
          gateOfficerName,
          reason: opts.request.reason ?? '',
          requestTime: opts.request.created_at,
        }),
      })
    }
  }

  let sent = 0
  let skipped = 0
  const errors: string[] = []
  for (const job of jobs) {
    const result = await claimAndSend(opts.admin, opts.send, opts.request.id, job)
    if (result.skipped) skipped += 1
    else if (result.ok) sent += 1
    else if (result.error) errors.push(result.error)
  }
  return { sent, skipped, errors }
}
