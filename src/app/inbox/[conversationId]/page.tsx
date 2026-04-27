import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { InboxView } from '@/components/inbox/InboxView'

export default async function InboxConversationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <Shell section="Inbox" isInbox>
      <InboxView />
    </Shell>
  )
}
