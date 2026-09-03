import { supabase } from './supabase'

export interface DeleteUsersResult {
  deleted_count: number
  deleted: string[]
  failures: Array<{ id: string; error: string }>
}

async function postDelete(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<(DeleteUsersResult & { ok: true }) | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Partial<DeleteUsersResult> & {
      error?: string
    }
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` }
    }
    return {
      ok: true,
      deleted_count: data.deleted_count ?? 0,
      deleted: data.deleted ?? [],
      failures: data.failures ?? [],
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'network_error',
    }
  }
}

async function invokeDelete(body: Record<string, unknown>): Promise<DeleteUsersResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('يجب تسجيل الدخول كمدير.')
  }
  const token = session.access_token

  const local = await postDelete('/api/admin-delete-user', body, token)
  if (local.ok) {
    return {
      deleted_count: local.deleted_count,
      deleted: local.deleted,
      failures: local.failures,
    }
  }

  const { data, error } = await supabase.functions.invoke('admin-delete-user', { body })
  if (!error) {
    const payload = data as (Partial<DeleteUsersResult> & { error?: string }) | null
    if (payload?.error) throw new Error(payload.error)
    return {
      deleted_count: payload?.deleted_count ?? 0,
      deleted: payload?.deleted ?? [],
      failures: payload?.failures ?? [],
    }
  }

  throw new Error(
    local.error === 'server_misconfigured'
      ? 'تعذر الحذف: مفتاح الخدمة غير مضبوط على السيرفر، وEdge Function غير متاحة.'
      : `تعذر حذف الحساب: ${local.error}`,
  )
}

/** Delete one staff, gate, or admin account (Auth + profile + related cleanup). */
export async function deleteManagedUser(userId: string): Promise<DeleteUsersResult> {
  if (!userId.trim()) throw new Error('معرّف المستخدم مطلوب.')
  return invokeDelete({ user_id: userId.trim() })
}

/** Delete every CLASS_STAFF account. */
export async function deleteAllClassStaff(): Promise<DeleteUsersResult> {
  return invokeDelete({ all_class_staff: true })
}
