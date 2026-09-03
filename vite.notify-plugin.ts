import type { Plugin } from 'vite'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

function json(res: import('http').ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(data))
}

async function readBody(req: import('http').IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, string>
}

function adminClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}

function vapidReady() {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || ''
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ''
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@isteathan.local'
  if (!vapidPublic || !vapidPrivate) return null
  return { vapidPublic, vapidPrivate, vapidSubject }
}

async function requireUser(
  admin: SupabaseClient,
  authHeader: string | undefined,
  roles: Array<'GATE_OFFICER' | 'CLASS_STAFF' | 'ADMIN'>,
) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!profile || !roles.includes(profile.role as 'GATE_OFFICER' | 'CLASS_STAFF' | 'ADMIN')) {
    return null
  }
  return userData.user
}

async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  tag: string,
) {
  const vapid = vapidReady()
  if (!vapid) return { sent: 0, error: 'server_misconfigured' as const }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return { sent: 0, reason: 'no_subscriptions' as const }

  webpush.setVapidDetails(vapid.vapidSubject, vapid.vapidPublic, vapid.vapidPrivate)
  const payload = JSON.stringify({
    title,
    body,
    url: '/display/class',
    tag,
  })

  let sent = 0
  const stale: string[] = []

  for (const sub of subs as SubRow[]) {
    let ok = false
    for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 * 60, urgency: 'high' },
        )
        sent += 1
        ok = true
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        console.error('[notify] webpush failed', statusCode, err)
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id)
          break
        }
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 300))
        }
      }
    }
  }

  if (stale.length) {
    await admin.from('push_subscriptions').delete().in('id', stale)
  }

  return { sent }
}

function studentNameOf(row: { students?: { full_name?: string } | { full_name?: string }[] | null }) {
  const s = row.students
  if (Array.isArray(s)) return s[0]?.full_name ?? 'الطالب'
  return s?.full_name ?? 'الطالب'
}

/**
 * Dev/test relay: send Web Push for new gate requests to class staff.
 */
export function notifyDecisionPlugin(): Plugin {
  return {
    name: 'isteathan-notify-decision',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/notify-decision' && url !== '/api/notify-new-request') {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey')
          res.end()
          return
        }

        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const admin = adminClient()
          if (!admin || !vapidReady()) {
            json(res, 500, { error: 'server_misconfigured' })
            return
          }

          const body = await readBody(req)
          const requestId = body.request_id?.trim()
          if (!requestId) {
            json(res, 400, { error: 'request_id_required' })
            return
          }

          if (url === '/api/notify-decision') {
            json(res, 200, { ok: true, sent: 0, reason: 'no_recipients' })
            return
          }

          const user = await requireUser(admin, req.headers.authorization, ['GATE_OFFICER', 'ADMIN'])
          if (!user) {
            json(res, 401, { error: 'unauthorized' })
            return
          }

          const { data: request, error: reqErr } = await admin
            .from('permission_requests')
            .select(
              'id, status, created_by, class_id, students(full_name), classes(staff_profile_id)',
            )
            .eq('id', requestId)
            .maybeSingle()

          if (reqErr || !request) {
            json(res, 404, { error: 'request_not_found' })
            return
          }

          if (request.created_by !== user.id) {
            const { data: profile } = await admin
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle()
            if (profile?.role !== 'ADMIN') {
              json(res, 403, { error: 'forbidden' })
              return
            }
          }

          const staffId =
            (request.classes as { staff_profile_id?: string | null } | null)?.staff_profile_id ??
            null
          if (!staffId) {
            json(res, 200, { ok: true, sent: 0, reason: 'no_staff' })
            return
          }

          const name = studentNameOf(request)
          const result = await sendPushToUser(
            admin,
            staffId,
            'طلب خروج جديد',
            `وصل طلب خروج للطالب: ${name}`,
            `new-${request.id}`,
          )
          json(res, 200, { ok: true, ...result })
        } catch (err) {
          console.error('[notify] unexpected', err)
          json(res, 500, {
            error: err instanceof Error ? err.message : 'unexpected_error',
          })
        }
      })
    },
  }
}
