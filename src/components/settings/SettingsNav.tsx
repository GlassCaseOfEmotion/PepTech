'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'

const SECTIONS = [
  { id: 'profile',       label: 'Profile',              icon: Icons.user,    href: '/settings/profile',       built: true },
  { id: 'channels',      label: 'Channels',             icon: Icons.hash,    href: '/settings/channels',      built: true },
  { id: 'wallets',       label: 'Wallets & assets',     icon: Icons.wallet,  href: '/settings/wallets',       built: true },
  { id: 'currency',      label: 'Currency',             icon: Icons.card,    href: '/settings/currency',      built: true },
  { id: 'branding',      label: 'Branding',             icon: Icons.spark,   href: '/settings/branding',      built: true },
  { id: 'trust',         label: 'Trust & risk',         icon: Icons.shield,  href: '/settings/trust',         built: false },
  { id: 'inventory',     label: 'Inventory defaults',   icon: Icons.box,     href: '/settings/inventory',     built: false },
  { id: 'notifications', label: 'Notifications',        icon: Icons.bell,    href: '/settings/notifications', built: false },
  { id: 'templates',     label: 'Message templates',    icon: Icons.doc,     href: '/settings/templates',     built: true },
  { id: 'whatsapp-templates', label: 'WhatsApp templates', icon: Icons.wa,  href: '/settings/whatsapp-templates', built: true },
  { id: 'devices',       label: 'Devices & sessions',   icon: Icons.lock,    href: '/settings/devices',       built: false },
  { id: 'billing',       label: 'Plan & billing',       icon: Icons.card,    href: '/settings/billing',       built: false },
]

interface SettingsNavProps {
  displayName: string
}

export function SettingsNav({ displayName }: SettingsNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="pt-st-rail">
      <ul>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const active = pathname.startsWith(s.href)
          return (
            <li key={s.id}>
              <Link
                href={s.href}
                className={`pt-st-rail-item ${active ? 'is-active' : ''} ${!s.built ? 'is-stub' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                <Icon size={13} />
                <span>{s.label}</span>
                {!s.built && <em>soon</em>}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="pt-st-rail-foot">
        <div className="pt-st-rail-acct">
          <div className="pt-st-rail-av">{displayName.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="pt-st-rail-name">{displayName}</div>
            <div className="pt-st-rail-plan">Operator</div>
          </div>
        </div>
        <button className="pt-st-rail-signout" onClick={handleSignOut}>Sign out</button>
      </div>
    </aside>
  )
}
