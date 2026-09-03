import type { Plugin } from 'vite'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function json(res: import('http').ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(data))
}

async function readBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

function adminClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function requireAdmin(admin: SupabaseClient, authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (!profile || profile.role !== 'ADMIN' || !profile.is_active) return null
  return userData.user
}

async function deleteManagedProfile(admin: SupabaseClient, userId: string, callerId: string) {
  if (userId === callerId) {
    return { ok: false as const, error: 'لا يمكن حذف حسابك الحالي.' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return { ok: false as const, error: 'الحساب غير موجود.' }
  }
  if (profile.role !== 'CLASS_STAFF' && profile.role !== 'GATE_OFFICER') {
    return { ok: false as const, error: 'يُسمح بحذف حسابات الفصول والمناوبين فقط.' }
  }

  if (profile.role === 'CLASS_STAFF') {
    await admin.from('classes').update({ staff_profile_id: null }).eq('staff_profile_id', userId)
    await admin.from('permission_requests').update({ decided_by: null }).eq('decided_by', userId)
  }
  // Best-effort: table may be missing if migration 008 not applied yet.
  await admin.from('push_subscriptions').delete().eq('user_id', userId)

  const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId)
  if (profileErr) {
    return { ok: false as const, error: profileErr.message || 'تعذر حذف ملف المستخدم.' }
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(userId)
  if (authErr) {
    return {
      ok: false as const,
      error: authErr.message || 'تم حذف الملف لكن تعذر حذف حساب الدخول.',
    }
  }

  return { ok: true as const, id: userId, full_name: profile.full_name }
}

/**
 * Dev/local admin APIs that need the service role (user delete).
 */
export function adminApiPlugin(): Plugin {
  return {
    name: 'isteathan-admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/api/admin-delete-user') {
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
          if (!admin) {
            json(res, 500, { error: 'server_misconfigured' })
            return
          }

          const caller = await requireAdmin(admin, req.headers.authorization)
          if (!caller) {
            json(res, 401, { error: 'unauthorized' })
            return
          }

          const body = await readBody(req)
          const allClassStaff = Boolean(body.all_class_staff)
          const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
          const userIds = Array.isArray(body.user_ids)
            ? body.user_ids.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
            : []

          let targets: string[] = []
          if (allClassStaff) {
            const { data, error } = await admin
              .from('profiles')
              .select('id')
              .eq('role', 'CLASS_STAFF')
            if (error) {
              json(res, 400, { error: error.message })
              return
            }
            targets = (data ?? []).map((row) => row.id)
          } else if (userIds.length) {
            targets = userIds.map((id) => id.trim())
          } else if (userId) {
            targets = [userId]
          } else {
            json(res, 400, { error: 'user_id_required' })
            return
          }

          const deleted: string[] = []
          const failures: Array<{ id: string; error: string }> = []

          for (const id of targets) {
            const result = await deleteManagedProfile(admin, id, caller.id)
            if (result.ok) deleted.push(id)
            else failures.push({ id, error: result.error })
          }

          json(res, 200, {
            ok: failures.length === 0,
            deleted_count: deleted.length,
            deleted,
            failures,
          })
        } catch (err) {
          console.error('[admin-delete-user]', err)
          json(res, 500, {
            error: err instanceof Error ? err.message : 'unexpected_error',
          })
        }
      })
    },
  }
}
