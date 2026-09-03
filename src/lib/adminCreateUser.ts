import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { UserRole } from './types'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** Isolated client so signUp does not replace the admin session. */
function ephemeralAuthClient() {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  })
}

export interface CreateManagedUserInput {
  email: string
  password: string
  full_name: string
  role: Extract<UserRole, 'CLASS_STAFF' | 'ADMIN' | 'GATE_OFFICER'>
  username?: string | null
  phone?: string | null
  class_id?: string | null
}

/**
 * Creates an Auth user (via anon signUp on an ephemeral client),
 * then inserts the profile using the current admin session (RLS).
 */
export async function createManagedUser(input: CreateManagedUserInput): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const full_name = input.full_name.trim()

  if (!email || !full_name || password.length < 6) {
    throw new Error('البريد والاسم وكلمة المرور (6 أحرف على الأقل) مطلوبة.')
  }

  const temp = ephemeralAuthClient()
  const { data, error: signUpError } = await temp.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: input.role,
        full_name,
      },
    },
  })

  if (signUpError) {
    const msg = signUpError.message.toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      throw new Error('هذا البريد مسجّل مسبقًا.')
    }
    if (msg.includes('invalid') && msg.includes('email')) {
      throw new Error('البريد الإلكتروني غير مقبول من Supabase. جرّب بريدًا آخر أو راجع إعدادات Auth.')
    }
    if (msg.includes('rate limit')) {
      throw new Error('تم تجاوز حد إنشاء الحسابات مؤقتًا. انتظر دقيقة ثم أعد المحاولة.')
    }
    throw new Error(signUpError.message || 'تعذر إنشاء حساب الدخول.')
  }

  const userId = data.user?.id
  if (!userId) {
    throw new Error('تعذر إنشاء المستخدم.')
  }

  const username = input.username?.trim().toLowerCase() || email.split('@')[0] || null

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    full_name,
    role: input.role,
    username,
    phone: input.phone?.trim() || null,
    is_active: true,
  })

  if (profileError) {
    if (profileError.code === '23505') {
      throw new Error('اسم المستخدم مستخدم مسبقًا.')
    }
    throw new Error(profileError.message || 'تعذر حفظ ملف المستخدم.')
  }

  if (input.role === 'CLASS_STAFF' && input.class_id) {
    await supabase
      .from('classes')
      .update({ staff_profile_id: null })
      .eq('staff_profile_id', userId)
    const { error: classError } = await supabase
      .from('classes')
      .update({ staff_profile_id: userId })
      .eq('id', input.class_id)
    if (classError) {
      throw new Error('تم إنشاء الحساب لكن تعذر تعيين الفصل.')
    }
  }

  return { id: userId }
}
