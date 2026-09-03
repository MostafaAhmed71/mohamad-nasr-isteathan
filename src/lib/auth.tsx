import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { syncBackgroundMonitor, stopBackgroundMonitor } from './backgroundMonitor'
import type { Profile, UserRole } from './types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSession = useCallback(async (next: Session | null) => {
    setSession(next)
    if (!next?.user) {
      setProfile(null)
      void stopBackgroundMonitor()
      return
    }
    try {
      const p = await fetchProfile(next.user.id)
      if (p && !p.is_active) {
        await stopBackgroundMonitor()
        await supabase.auth.signOut()
        setProfile(null)
        setSession(null)
        throw new Error('هذا الحساب غير نشط. راجع إدارة المدرسة.')
      }
      setProfile(p)
      void syncBackgroundMonitor(p)
    } catch (err) {
      console.error(err)
      setProfile(null)
      void stopBackgroundMonitor()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      loadSession(data.session).finally(() => {
        if (mounted) setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void loadSession(next)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadSession])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) {
      throw new Error('بيانات الدخول غير صحيحة.')
    }
  }, [])

  const signOut = useCallback(async () => {
    await stopBackgroundMonitor()
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    const p = await fetchProfile(session.user.id)
    setProfile(p)
  }, [session])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useRequireRole(roles: UserRole[]): Profile | null {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role)) return null
  return profile
}
