import { type ReactNode } from 'react'
import Link from 'next/link'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  body?: string
  action?: { label: string; href?: string; onClick?: () => void }
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function EmptyState({ icon, title, body, action, size = 'md', className = '' }: EmptyStateProps) {
  return (
    <div className={`pt-empty pt-empty-${size} ${className}`}>
      <div className="pt-empty-icon">{icon}</div>
      <div className="pt-empty-text">
        <div className="pt-empty-title">{title}</div>
        {body && <div className="pt-empty-body">{body}</div>}
      </div>
      {action && (
        action.href
          ? <Link href={action.href} className="pt-btn pt-btn-primary pt-empty-action">{action.label}</Link>
          : <button onClick={action.onClick} className="pt-btn pt-btn-primary pt-empty-action">{action.label}</button>
      )}
    </div>
  )
}
