'use client'

import { Icons } from '@/lib/icons'
import { NotificationBell } from './NotificationBell'

interface TopBarProps {
  section?: string
  connectedChannels?: string[]
  rightOpen?: boolean
  onRightToggle?: () => void
}

export function TopBar({ section = 'Inbox', connectedChannels = [], rightOpen, onRightToggle }: TopBarProps) {
  return (
    <header className="pt-top">
      <div className="pt-top-crumbs">
        <span className="pt-crumb-home">Workspace</span>
        <span className="pt-crumb-sep">/</span>
        <span className="pt-crumb-now">{section}</span>
      </div>

      <div className="pt-top-mid">
        {connectedChannels.includes('whatsapp') && (
          <div className="pt-chip pt-chip-wa"><Icons.wa size={12} /><span>WhatsApp</span><i className="pt-chip-dot" /></div>
        )}
        {connectedChannels.includes('telegram') && (
          <div className="pt-chip pt-chip-tg"><Icons.tg size={12} /><span>Telegram</span><i className="pt-chip-dot" /></div>
        )}
        {connectedChannels.includes('email') && (
          <div className="pt-chip pt-chip-em"><Icons.em size={12} /><span>Email</span><i className="pt-chip-dot" /></div>
        )}
      </div>

      <div className="pt-top-actions">
        <button
          className="pt-iconbtn pt-iconbtn-ai"
          title="AI Assistant (⌘K)"
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
        >
          <Icons.bot size={15} />
        </button>
<NotificationBell />
        {onRightToggle !== undefined && (
          <button
            data-tour="right-panel"
            className={`pt-iconbtn pt-topbar-right-toggle ${rightOpen ? 'is-on' : ''}`}
            title="Toggle right panel"
            onClick={onRightToggle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2"/>
              <line x1="15" y1="4" x2="15" y2="20"/>
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}
