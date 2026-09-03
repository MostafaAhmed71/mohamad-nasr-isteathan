import { type FormEvent, useState } from 'react'
import { SchoolBrand } from '../components/SchoolBrand'
import { ErrorBox, PrimaryButton, TextField } from '../components/ui'
import { useAuth } from '../lib/auth'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (!email.trim() || !password) {
        throw new Error('يرجى إدخال اسم الدخول وكلمة المرور.')
      }
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بيانات الدخول غير صحيحة.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-canvas relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div className="glass-panel relative w-full max-w-md p-6 md:p-8">
        <div className="mb-2">
          <SchoolBrand variant="hero" showAppName />
          <hr className="gold-rule mx-auto mt-4 w-24" />
          <p className="mt-3 text-center text-[var(--color-muted)]">تسجيل الدخول</p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <TextField
            label="اسم الدخول"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="مثال: gate1@gate.isteathan.local أو c1@g.com"
            required
          />
          <TextField
            label="كلمة المرور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <ErrorBox message={error} />
          <PrimaryButton type="submit" full disabled={submitting}>
            {submitting ? 'جاري الدخول...' : 'دخول'}
          </PrimaryButton>
        </form>
      </div>
    </main>
  )
}
