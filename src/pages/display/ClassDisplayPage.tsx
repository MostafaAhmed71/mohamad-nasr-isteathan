import { useEffect, useState } from 'react'
import {
  DisplayEmptyState,
  DisplayNowCalling,
  DisplayQueueTable,
  DisplaySplashOverlay,
} from '../../components/DisplayRequestCard'
import { unlockDisplayAudio } from '../../lib/displayAlert'
import { useDisplayBoard } from '../../lib/displayBoard'
import { SCHOOL_LOGO_SRC, SCHOOL_NAME } from '../../lib/brand'
import { supabase } from '../../lib/supabase'
import { classLabel, type SchoolClass } from '../../lib/types'
import { useAuth } from '../../lib/auth'

export function ClassDisplayPage() {
  const { profile } = useAuth()
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null)
  const [classError, setClassError] = useState('')
  const [soundReady, setSoundReady] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('classes')
        .select('*')
        .eq('staff_profile_id', profile.id)
        .maybeSingle()
      if (cancelled) return
      if (!data) {
        setClassError('لا يوجد فصل مرتبط بهذا الحساب.')
        return
      }
      setSchoolClass(data as SchoolClass)
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  const {
    pending,
    pendingRest,
    recentRest,
    hero,
    flashId,
    selectedId,
    splash,
    error,
    selectRequest,
    lateCount,
  } = useDisplayBoard({ classId: schoolClass?.id ?? null })

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  async function enableSound() {
    setSoundReady(await unlockDisplayAudio())
  }

  async function approveRequest(requestId: string) {
    setActionError('')
    setBusyId(requestId)
    void unlockDisplayAudio().then(setSoundReady)
    const { error: err } = await supabase.rpc('decide_permission_request', {
      p_request_id: requestId,
      p_decision: 'APPROVED',
      p_rejection_reason: null,
    })
    if (err) {
      setBusyId(null)
      setActionError(
        err.message.includes('تمت معالجته')
          ? 'تمت معالجة هذا الطلب مسبقاً.'
          : 'تعذر اعتماد الطلب، حاول مرة أخرى.',
      )
      return
    }
    setBusyId(null)
  }

  const clockLabel = new Intl.DateTimeFormat('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(clock)
  const now = clock.getTime()
  const showError = classError || error || actionError
  const screenTitle = schoolClass
    ? classLabel(schoolClass.grade, schoolClass.section)
    : 'شاشة الفصل'

  return (
    <div className="display-screen">
      {splash?.kind === 'new' ? (
        <DisplaySplashOverlay kind="new" name={splash.name} />
      ) : null}
      {splash?.kind === 'decision' ? (
        <DisplaySplashOverlay kind="decision" name={splash.name} status={splash.status} />
      ) : null}

      <header className="rx-topbar">
        <div className="rx-topbar__brand">
          <img src={SCHOOL_LOGO_SRC} alt="" className="rx-topbar__logo" />
          <div>
            <p className="rx-topbar__school">{SCHOOL_NAME}</p>
            <p className="rx-topbar__screen">شاشة الفصل · {screenTitle}</p>
          </div>
        </div>
        <div className="rx-topbar__stats">
          <div className="rx-stat rx-stat--clock">
            <span className="rx-stat__label">الوقت</span>
            <span className="rx-stat__value">{clockLabel}</span>
          </div>
          <div className="rx-stat">
            <span className="rx-stat__label">انتظار</span>
            <span className="rx-stat__value">{pending.length}</span>
          </div>
          {lateCount > 0 ? (
            <div className="rx-stat rx-stat--late">
              <span className="rx-stat__label">متأخر</span>
              <span className="rx-stat__value">{lateCount}</span>
            </div>
          ) : null}
          <div className="rx-stat rx-stat--live">
            <span className="rx-live-dot" />
            مباشر
          </div>
          {!soundReady ? (
            <button type="button" className="rx-topbar__sound" onClick={() => void enableSound()}>
              تفعيل الصوت
            </button>
          ) : null}
        </div>
      </header>

      {showError ? <p className="rx-error">{showError}</p> : null}

      <main className={`rx-body ${hero ? 'rx-body--split' : ''}`}>
        {splash ? null : !hero ? (
          <DisplayEmptyState />
        ) : (
          <>
            <DisplayNowCalling
              request={hero}
              isNew={flashId === hero.id}
              onActivate={() => selectRequest(hero)}
              now={now}
              onApprove={
                hero.status === 'PENDING' ? () => void approveRequest(hero.id) : undefined
              }
              approving={busyId === hero.id}
            />
            <DisplayQueueTable
              title="قائمة الانتظار"
              rows={pendingRest}
              heroId={hero.id}
              flashId={flashId}
              selectedId={selectedId}
              onActivate={selectRequest}
              now={now}
            />
            <DisplayQueueTable
              title="آخر القرارات"
              rows={recentRest}
              heroId={hero.id}
              flashId={flashId}
              selectedId={selectedId}
              onActivate={selectRequest}
              now={now}
            />
          </>
        )}
      </main>
    </div>
  )
}
