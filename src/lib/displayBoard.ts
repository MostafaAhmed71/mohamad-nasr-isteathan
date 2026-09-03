import { useCallback, useEffect, useRef, useState } from 'react'
import {
  announceDecision,
  announceNewRequest,
  requestDisplayWakeLock,
} from './displayAlert'
import { supabase } from './supabase'
import type { PermissionRequest, RequestStatus } from './types'

/** Pending longer than this is shown as متأخر on display screens. */
export const DISPLAY_LATE_MS = 10 * 60 * 1000
/** Keep decided requests on screen for this long. */
export const DISPLAY_KEEP_DECISION_MS = 10 * 60 * 1000

export type DisplaySplash =
  | { kind: 'new'; id: string; name: string }
  | { kind: 'decision'; id: string; name: string; status: 'APPROVED' | 'REJECTED' }

const SELECT =
  '*, students(*), classes(*), gate_officer:profiles!created_by(full_name)'

export function isDisplayLate(request: PermissionRequest, now = Date.now()): boolean {
  if (request.status !== 'PENDING') return false
  return now - new Date(request.created_at).getTime() >= DISPLAY_LATE_MS
}

function studentName(row: PermissionRequest): string {
  return row.students?.full_name ?? 'طالب'
}

export function useDisplayBoard(options: { classId?: string | null }) {
  const { classId } = options
  const [pending, setPending] = useState<PermissionRequest[]>([])
  const [recent, setRecent] = useState<PermissionRequest[]>([])
  const [flashId, setFlashId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [splash, setSplash] = useState<DisplaySplash | null>(null)
  const knownStatus = useRef<Map<string, RequestStatus>>(new Map())
  const primed = useRef(false)
  const timers = useRef<number[]>([])

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }

  function afterSplash(rowId: string) {
    setFlashId(rowId)
    const t = window.setTimeout(() => {
      setFlashId((id) => (id === rowId ? null : id))
    }, 9000)
    timers.current.push(t)
  }

  function playNewSequence(row: PermissionRequest) {
    clearTimers()
    const name = studentName(row)
    setSplash({ kind: 'new', id: row.id, name })
    setSelectedId(row.id)
    setFlashId(null)
    void announceNewRequest(name)
    const t1 = window.setTimeout(() => {
      setSplash(null)
      afterSplash(row.id)
    }, 2800)
    timers.current.push(t1)
  }

  function playDecisionSequence(row: PermissionRequest) {
    if (row.status !== 'APPROVED' && row.status !== 'REJECTED') return
    clearTimers()
    const name = studentName(row)
    setSplash({ kind: 'decision', id: row.id, name, status: row.status })
    setSelectedId(row.id)
    setFlashId(null)
    void announceDecision(name, row.status)
    const t1 = window.setTimeout(() => {
      setSplash(null)
      afterSplash(row.id)
    }, 3000)
    timers.current.push(t1)
  }

  const load = useCallback(async () => {
    if (classId === null) return

    const since = new Date(Date.now() - DISPLAY_KEEP_DECISION_MS).toISOString()
    let pendingQ = supabase
      .from('permission_requests')
      .select(SELECT)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(20)
    let recentQ = supabase
      .from('permission_requests')
      .select(SELECT)
      .in('status', ['APPROVED', 'REJECTED'])
      .gte('decided_at', since)
      .order('decided_at', { ascending: false })
      .limit(20)

    if (classId) {
      pendingQ = pendingQ.eq('class_id', classId)
      recentQ = recentQ.eq('class_id', classId)
    }

    const [pendingRes, recentRes] = await Promise.all([pendingQ, recentQ])
    if (pendingRes.error || recentRes.error) {
      setError('تعذر تحميل الطلبات.')
      return
    }

    const pendingRows = (pendingRes.data as PermissionRequest[]) ?? []
    const recentRows = (recentRes.data as PermissionRequest[]) ?? []

    if (primed.current) {
      let handled = false
      for (const row of pendingRows) {
        if (!knownStatus.current.has(row.id)) {
          playNewSequence(row)
          handled = true
          break
        }
      }
      if (!handled) {
        for (const row of recentRows) {
          const prev = knownStatus.current.get(row.id)
          if (
            prev === 'PENDING' &&
            (row.status === 'APPROVED' || row.status === 'REJECTED')
          ) {
            playDecisionSequence(row)
            break
          }
        }
      }
    }

    primed.current = true
    const next = new Map(knownStatus.current)
    for (const row of [...pendingRows, ...recentRows]) {
      next.set(row.id, row.status)
    }
    knownStatus.current = next
    setPending(pendingRows)
    setRecent(recentRows)
    setError('')
  }, [classId])

  useEffect(() => {
    if (classId === null) return
    let wake: WakeLockSentinel | null = null
    void (async () => {
      await load()
      wake = await requestDisplayWakeLock()
    })()

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void requestDisplayWakeLock().then((w) => {
          wake = w
        })
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    const channelName = classId ? `class-display-board-${classId}` : 'lobby-display-board'
    let channel = supabase.channel(channelName)
    if (classId) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'permission_requests',
          filter: `class_id=eq.${classId}`,
        },
        () => {
          void load()
        },
      )
    } else {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'permission_requests' },
        () => {
          void load()
        },
      )
    }
    channel.subscribe()

    const poll = window.setInterval(() => {
      void load()
    }, 8000)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(poll)
      void wake?.release()
      void supabase.removeChannel(channel)
      clearTimers()
    }
  }, [classId, load])

  function selectRequest(row: PermissionRequest) {
    setSelectedId(row.id)
    setFlashId(row.id)
    if (row.status === 'APPROVED' || row.status === 'REJECTED') {
      void announceDecision(studentName(row), row.status)
    } else {
      void announceNewRequest(studentName(row))
    }
  }

  const board = [...pending, ...recent]
  const hero =
    board.find((r) => r.id === selectedId) ??
    board.find((r) => r.id === flashId) ??
    pending[0] ??
    recent[0] ??
    null
  const pendingRest = pending.filter((r) => r.id !== hero?.id)
  const recentRest = recent.filter((r) => r.id !== hero?.id)

  return {
    pending,
    recent,
    pendingRest,
    recentRest,
    hero,
    flashId,
    selectedId,
    splash,
    error,
    selectRequest,
    lateCount: pending.filter((r) => isDisplayLate(r)).length,
  }
}
