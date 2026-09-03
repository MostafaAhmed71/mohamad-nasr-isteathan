import type { Plugin } from 'vite'
import { createClient } from '@supabase/supabase-js'
import { dispatchWhatsAppForRequest, type WhatsAppEvent } from './vite.whatsapp-lib'

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
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function gatewayUrl() {
  return (process.env.WHATSAPP_GATEWAY_URL || 'http://127.0.0.1:3310').replace(/\/$/, '')
}

function gatewaySecret() {
  return process.env.WHATSAPP_GATEWAY_SECRET || ''
}

async function sendViaGateway(digits: string, text: string) {
  const secret = gatewaySecret()
  const res = await fetch(`${gatewayUrl()}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-WhatsApp-Secret': secret } : {}),
    },
    body: JSON.stringify({ phone: digits, text }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
  if (!res.ok) {
    throw new Error(data.error || `gateway_http_${res.status}`)
  }
}

export function whatsappNotifyPlugin(): Plugin {
  return {
    name: 'isteathan-whatsapp-notify',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (
          path !== '/api/whatsapp-notify' &&
          path !== '/api/whatsapp-status'
        ) {
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

        const admin = adminClient()
        if (!admin) {
          json(res, 500, { error: 'server_misconfigured' })
          return
        }

        if (path === '/api/whatsapp-status') {
          if (req.method !== 'GET' && req.method !== 'POST') {
            next()
            return
          }
          const authHeader = req.headers.authorization
          if (!authHeader?.startsWith('Bearer ')) {
            json(res, 401, { error: 'unauthorized' })
            return
          }
          const { data: userData } = await admin.auth.getUser(authHeader.slice('Bearer '.length))
          if (!userData.user) {
            json(res, 401, { error: 'unauthorized' })
            return
          }
          const { data: profile } = await admin
            .from('profiles')
            .select('role')
            .eq('id', userData.user.id)
            .maybeSingle()
          if (profile?.role !== 'ADMIN') {
            json(res, 403, { error: 'forbidden' })
            return
          }
          try {
            const r = await fetch(`${gatewayUrl()}/status`, {
              headers: gatewaySecret() ? { 'X-WhatsApp-Secret': gatewaySecret() } : {},
            })
            const data = (await r.json().catch(() => ({}))) as Record<string, unknown>
            json(res, r.ok ? 200 : 503, {
              connected: Boolean(data.connected),
              state: data.state ?? 'disconnected',
              qr: typeof data.qr === 'string' ? data.qr : null,
            })
          } catch {
            json(res, 200, { connected: false, state: 'gateway_offline', qr: null })
          }
          return
        }

        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const authHeader = req.headers.authorization
          if (!authHeader?.startsWith('Bearer ')) {
            json(res, 401, { error: 'unauthorized' })
            return
          }
          const token = authHeader.slice('Bearer '.length)
          const { data: userData, error: userErr } = await admin.auth.getUser(token)
          if (userErr || !userData.user) {
            json(res, 401, { error: 'unauthorized' })
            return
          }

          const { data: profile } = await admin
            .from('profiles')
            .select('role')
            .eq('id', userData.user.id)
            .maybeSingle()
          const role = profile?.role as string | undefined
          if (!role || !['GATE_OFFICER', 'CLASS_STAFF', 'ADMIN'].includes(role)) {
            json(res, 403, { error: 'forbidden' })
            return
          }

          const body = await readBody(req)
          const requestId = body.request_id?.trim()
          const event = (body.event === 'decision' ? 'decision' : 'created') as WhatsAppEvent
          if (!requestId) {
            json(res, 400, { error: 'request_id_required' })
            return
          }

          const { data: request, error: reqErr } = await admin
            .from('permission_requests')
            .select(
              'id, status, reason, rejection_reason, created_by, class_id, created_at, students(full_name, grade, classes(section)), classes(grade, section), profiles:created_by(full_name, phone)',
            )
            .eq('id', requestId)
            .maybeSingle()

          if (reqErr || !request) {
            json(res, 404, { error: 'request_not_found' })
            return
          }

          if (event === 'created') {
            if (role === 'GATE_OFFICER' && request.created_by !== userData.user.id) {
              json(res, 403, { error: 'forbidden' })
              return
            }
            if (role === 'CLASS_STAFF') {
              json(res, 403, { error: 'forbidden' })
              return
            }
          } else if (role === 'GATE_OFFICER') {
            json(res, 403, { error: 'forbidden' })
            return
          }

          const result = await dispatchWhatsAppForRequest({
            admin,
            send: sendViaGateway,
            request: request as never,
            event,
          })
          json(res, 200, { ok: true, ...result })
        } catch (err) {
          console.error('[whatsapp-notify]', err)
          json(res, 200, {
            ok: false,
            sent: 0,
            error: err instanceof Error ? err.message : 'unexpected_error',
          })
        }
      })
    },
  }
}
