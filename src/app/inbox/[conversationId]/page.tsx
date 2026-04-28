import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { InboxView } from '@/components/inbox/InboxView'

export default async function InboxConversationPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <Shell section="Inbox" isInbox>
      <InboxView />
    </Shell>
  )
}
