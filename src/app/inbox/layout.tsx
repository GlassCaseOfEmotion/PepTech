import { Shell } from '@/components/shell/Shell'

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <Shell section="Inbox" isInbox>{children}</Shell>
}
