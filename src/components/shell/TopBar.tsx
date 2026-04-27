'use client'

import { Icons } from '@/lib/icons'

interface TopBarProps {
  section?: string
  connectedChannels?: string[]
}

export function TopBar({ section = 'Inbox', connectedChannels = [] }: TopBarProps) {
  return (
    <header className="pt-top">
      <div className="pt-top-crumbs">
        <span className="pt-crumb-home">Workspace</span>
        <span className="pt-crumb-sep">/</span>
        <span className="pt-crumb-now">{section}</span>
      </div>

      <div className="pt-top-mid">
        {connectedChannels.includes('whatsapp') && (
          <div className="pt-chip pt-chip-wa">
            <Icons.wa size={12} />
            <span>WhatsApp</span>
            <i className="pt-chip-dot" />
          </div>
        )}
        {connectedChannels.includes('telegram') && (
          <div className="pt-chip pt-chip-tg">
            <Icons.tg size={12} />
            <span>Telegram</span>
            <i className="pt-chip-dot" />
          </div>
        )}
        {connectedChannels.includes('email') && (
          <div className="pt-chip pt-chip-em">
            <Icons.em size={12} />
            <span>Email</span>
            <i className="pt-chip-dot" />
          </div>
        )}
      </div>

      <div className="pt-top-actions">
        <button className="pt-iconbtn" title="Notifications">
          <Icons.bell size={14} />
        </button>
      </div>
    </header>
  )
}
