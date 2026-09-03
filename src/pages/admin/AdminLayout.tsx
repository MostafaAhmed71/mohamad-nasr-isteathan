import { Link, NavLink, Outlet } from 'react-router-dom'
import { SchoolBrand } from '../../components/SchoolBrand'
import { SecondaryButton } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { APP_NAME } from '../../lib/brand'

const links = [
  { to: '/admin', label: 'لوحة التحكم', end: true },
  { to: '/admin/requests', label: 'الطلبات' },
  { to: '/admin/students', label: 'الطلاب' },
  { to: '/admin/gate', label: 'مناوبو البوابة' },
  { to: '/admin/classes', label: 'الفصول' },
  { to: '/admin/import', label: 'استيراد' },
  { to: '/admin/guide', label: 'الدليل' },
  { to: '/display/lobby', label: 'شاشة البهو' },
]

export function AdminLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="app-canvas min-h-dvh">
      <header className="glass-panel mx-4 mt-4 overflow-hidden md:mx-auto md:max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <Link to="/admin" className="min-w-0">
              <SchoolBrand variant="compact" />
            </Link>
            <div className="min-w-0">
              <p className="brand-title text-lg md:text-xl">{APP_NAME} — الإدارة</p>
              <p className="text-sm text-[var(--color-muted)]">{profile?.full_name}</p>
            </div>
          </div>
          <SecondaryButton type="button" onClick={() => void signOut()}>
            تسجيل الخروج
          </SecondaryButton>
        </div>
        <hr className="gold-rule mx-4" />
        <nav className="flex gap-2 overflow-x-auto px-4 py-3">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `nav-chip shrink-0 ${isActive ? 'nav-chip-active' : 'nav-chip-idle'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
