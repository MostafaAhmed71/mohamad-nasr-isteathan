import type { CSSProperties } from 'react'
import { isDisplayLate } from '../lib/displayBoard'
import {
  classLabel,
  formatDateTime,
  requestOriginLabel,
  type PermissionRequest,
  type RequestStatus,
} from '../lib/types'

function classText(r: PermissionRequest): string {
  if (r.classes) return classLabel(r.classes.grade, r.classes.section)
  if (r.students) return classLabel(r.students.grade, '')
  return '—'
}

function timeOnly(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return formatDateTime(iso)
  }
}

export function displayStatusMeta(
  status: RequestStatus,
  late: boolean,
): { label: string; tone: string; callLabel: string; pill: string } {
  if (status === 'PENDING' && late) {
    return { label: 'متأخر', tone: 'late', callLabel: 'طلب متأخر', pill: 'متأخر' }
  }
  switch (status) {
    case 'APPROVED':
      return { label: 'مقبول', tone: 'approved', callLabel: 'تمت الموافقة', pill: 'مقبول' }
    case 'REJECTED':
      return { label: 'مرفوض', tone: 'rejected', callLabel: 'تم الرفض', pill: 'مرفوض' }
    case 'CANCELLED':
      return { label: 'ملغي', tone: 'cancelled', callLabel: 'ملغي', pill: 'ملغي' }
    default:
      return { label: 'انتظار', tone: 'pending', callLabel: 'طلب خروج جديد', pill: 'انتظار' }
  }
}

/** Large “now calling” panel for class and lobby screens. */
export function DisplayNowCalling({
  request,
  isNew = false,
  onActivate,
  now = Date.now(),
  onApprove,
  approving = false,
}: {
  request: PermissionRequest
  isNew?: boolean
  onActivate: () => void
  now?: number
  onApprove?: () => void
  approving?: boolean
}) {
  const name = request.students?.full_name ?? 'طالب'
  const origin = requestOriginLabel(request)
  const klass = classText(request)
  const late = isDisplayLate(request, now)
  const meta = displayStatusMeta(request.status, late)
  const when =
    request.status === 'PENDING'
      ? timeOnly(request.created_at)
      : timeOnly(request.decided_at ?? request.updated_at)
  const showApprove = Boolean(onApprove) && request.status === 'PENDING'

  return (
    <article className={`rx-call rx-call--${meta.tone} ${isNew ? 'rx-call--flash' : ''}`}>
      <button type="button" className="rx-call__main" onClick={onActivate}>
        <div className="rx-call__band">
          <span className="rx-call__band-label">{meta.callLabel}</span>
          {isNew ? <span className="rx-call__live">مباشر</span> : null}
        </div>
        <div className="rx-call__body">
          <p className="rx-call__eyebrow">اسم الطالب</p>
          <h2 className="rx-call__name">{name}</h2>
          <div className="rx-call__meta">
            <span>{klass}</span>
            <span className="rx-call__dot" aria-hidden />
            <span>{origin}</span>
            <span className="rx-call__dot" aria-hidden />
            <span>{when}</span>
          </div>
          <p className="rx-call__hint">اضغط لإعادة الإعلان الصوتي</p>
        </div>
      </button>
      {showApprove ? (
        <div className="rx-call__actions">
          <button
            type="button"
            className="rx-call__approve"
            onClick={onApprove}
            disabled={approving}
          >
            {approving ? 'جاري الموافقة...' : 'موافقة'}
          </button>
        </div>
      ) : null}
    </article>
  )
}

/** Single queue row for waiting / recent lists. */
export function DisplayQueueRow({
  request,
  index,
  isActive = false,
  isNew = false,
  onActivate,
  now = Date.now(),
  style,
}: {
  request: PermissionRequest
  index: number
  isActive?: boolean
  isNew?: boolean
  onActivate: () => void
  now?: number
  style?: CSSProperties
}) {
  const name = request.students?.full_name ?? 'طالب'
  const klass = classText(request)
  const late = isDisplayLate(request, now)
  const meta = displayStatusMeta(request.status, late)
  const when =
    request.status === 'PENDING'
      ? timeOnly(request.created_at)
      : timeOnly(request.decided_at ?? request.updated_at)

  return (
    <button
      type="button"
      style={style}
      onClick={onActivate}
      className={`rx-row rx-row--${meta.tone} ${isActive ? 'rx-row--active' : ''} ${
        isNew ? 'rx-row--flash' : ''
      }`}
    >
      <span className="rx-row__num">{String(index).padStart(2, '0')}</span>
      <span className="rx-row__name">{name}</span>
      <span className="rx-row__class">{klass}</span>
      <span className={`rx-row__status rx-status rx-status--${meta.tone}`}>{meta.label}</span>
      <span className="rx-row__time">{when}</span>
    </button>
  )
}

export function DisplayQueueTable({
  title,
  rows,
  heroId,
  flashId,
  selectedId,
  onActivate,
  now,
  startIndex = 1,
  showWhenEmpty = false,
}: {
  title: string
  rows: PermissionRequest[]
  heroId?: string | null
  flashId?: string | null
  selectedId?: string | null
  onActivate: (r: PermissionRequest) => void
  now: number
  startIndex?: number
  showWhenEmpty?: boolean
}) {
  if (rows.length === 0 && !showWhenEmpty) return null
  return (
    <section className="rx-panel">
      <header className="rx-panel__head">
        <h3>{title}</h3>
        <span>{rows.length}</span>
      </header>
      <div className="rx-table-head" aria-hidden>
        <span>#</span>
        <span>الاسم</span>
        <span>الفصل</span>
        <span>الحالة</span>
        <span>الوقت</span>
      </div>
      <div className="rx-table-body">
        {rows.length === 0 ? (
          <p className="rx-empty-row">لا توجد عناصر</p>
        ) : (
          rows.map((r, i) => (
            <DisplayQueueRow
              key={r.id}
              request={r}
              index={startIndex + i}
              now={now}
              isActive={selectedId === r.id || heroId === r.id}
              isNew={flashId === r.id}
              onActivate={() => onActivate(r)}
            />
          ))
        )}
      </div>
    </section>
  )
}

export function DisplayEmptyState() {
  return (
    <div className="rx-idle">
      <p className="rx-idle__label">لا توجد طلبات حالياً</p>
      <p className="rx-idle__sub">ستظهر أسماء الطلاب هنا فور وصول طلب خروج جديد</p>
    </div>
  )
}

export function DisplaySplashOverlay({
  kind,
  name,
  status,
}: {
  kind: 'new' | 'decision'
  name: string
  status?: 'APPROVED' | 'REJECTED'
}) {
  const tone =
    kind === 'new' ? 'pending' : status === 'APPROVED' ? 'approved' : 'rejected'
  const title =
    kind === 'new' ? 'طلب جديد' : status === 'APPROVED' ? 'تمت الموافقة' : 'تم الرفض'

  return (
    <div className={`rx-splash rx-splash--${tone}`} role="status" aria-live="assertive">
      <p className="rx-splash__title">{title}</p>
      <p className="rx-splash__caption">اسم الطالب</p>
      <p className="rx-splash__name">{name}</p>
    </div>
  )
}

/** @deprecated alias kept for older imports */
export function DisplayRequestCard(props: {
  request: PermissionRequest
  variant?: 'hero' | 'tile'
  isNew?: boolean
  isSelected?: boolean
  onActivate: () => void
  style?: CSSProperties
  now?: number
}) {
  if (props.variant === 'tile') {
    return (
      <DisplayQueueRow
        request={props.request}
        index={1}
        isActive={props.isSelected}
        isNew={props.isNew}
        onActivate={props.onActivate}
        now={props.now}
        style={props.style}
      />
    )
  }
  return (
    <DisplayNowCalling
      request={props.request}
      isNew={props.isNew}
      onActivate={props.onActivate}
      now={props.now}
    />
  )
}
