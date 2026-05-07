import { Shell } from '@/components/shell/Shell'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <Shell section="Agent">{children}</Shell>
}
