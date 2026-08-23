import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/profile', label: 'Profile' },
]

export function AppShell() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="text-lg font-semibold">Church Ops</div>
        <nav className="flex items-center gap-4 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive
                  ? 'font-medium text-indigo-600 dark:text-indigo-400'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }
            >
              {item.label}
            </NavLink>
          ))}
          {profile && (
            <span className="ml-2 text-neutral-500">
              {profile.first_name} {profile.last_name}
            </span>
          )}
          <button
            onClick={() => signOut()}
            className="rounded-md border border-neutral-300 px-3 py-1 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
