'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/admin', label: 'Tenants' },
  { href: '/admin/platform-admins', label: 'Admins' },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="pt-admin-root">
      <header className="pt-admin-topbar">
        <Link href="/admin" className="pt-admin-topbar-logo">Peptech</Link>
        <span className="pt-admin-topbar-badge">Platform Admin</span>
        <nav className="pt-admin-nav">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className={pathname === n.href ? 'is-on' : ''}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/" className="pt-admin-topbar-exit">← Back to app</Link>
      </header>
      <main className="pt-admin-main">{children}</main>
    </div>
  )
}
