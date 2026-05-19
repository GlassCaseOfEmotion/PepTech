export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { Shell } from '@/components/shell/Shell'
import { OrderDetailView } from '@/components/orders/OrderDetailView'
import type { DbOrderRow, DbOrderEvent, OrderAttachment } from '@/types/orders'
import type { TenantPaymentConfig } from '@/types/payments'

const ORDER_SELECT = `
  id, ref_number, customer_id, conversation_id, status,
  payment_asset, payment_amount, currency, exchange_rate, payment_address, tx_hash,
  shipping_address, carrier, tracking_number, tracking_url, notes,
  created_at, updated_at,
  customers (
    id, display_name, trust_score, ltv,
    customer_channels (channel_type, display_handle, is_primary)
  ),
  order_items (
    id, qty, unit_price_snapshot,
    products (sku, name),
    batches (batch_number, coa_path)
  )
`

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: order }, { data: events }, { data: paymentConfigs }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', orderId).single(),
    supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
    supabase.from('tenant_payment_configs').select('*').eq('is_active', true),
  ])

  if (!order) notFound()

  const orderRow = order as unknown as DbOrderRow

  // Parallel: customer stats + invoice + attachments
  const [
    { count: customerOrderCount, data: latestOrders },
    { data: invoiceRow },
    { data: attachmentsRaw },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('created_at', { count: 'exact' })
      .eq('customer_id', orderRow.customer_id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('invoices')
      .select('id, invoice_number, pdf_path')
      .eq('order_id', orderId)
      .maybeSingle(),
    supabase
      .from('order_attachments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
  ])

  const customerStats = {
    orderCount: customerOrderCount ?? 0,
    lastOrderAt: latestOrders?.[0]?.created_at ?? null,
  }

  // Generate signed URL for invoice PDF (invoices bucket, 1 hour TTL)
  let invoice: { id: string; invoice_number: string; pdf_path: string; signedUrl: string } | null = null
  if (invoiceRow?.pdf_path) {
    const { data: signed } = await supabase.storage
      .from('invoices')
      .createSignedUrl(invoiceRow.pdf_path, 3600)
    if (signed) invoice = { ...invoiceRow, signedUrl: signed.signedUrl }
  }

  // Generate full + thumbnail signed URLs for all attachments
  const attachments = (attachmentsRaw ?? []) as OrderAttachment[]
  const attachmentSignedUrls: Record<string, string> = {}
  const attachmentThumbnailUrls: Record<string, string> = {}
  if (attachments.length > 0) {
    const imageAttachments = attachments.filter(a => a.mime_type.startsWith('image/'))
    const [{ data: signedList }, ...thumbResults] = await Promise.all([
      supabase.storage.from('media').createSignedUrls(attachments.map(a => a.storage_path), 3600),
      ...imageAttachments.map(a =>
        supabase.storage.from('media').createSignedUrl(a.storage_path, 3600, {
          transform: { width: 300, height: 300, quality: 85, resize: 'cover' },
        })
      ),
    ])
    signedList?.forEach((item, i) => {
      if (item.signedUrl) attachmentSignedUrls[attachments[i].id] = item.signedUrl
    })
    thumbResults.forEach((res, i) => {
      if (res.data?.signedUrl) attachmentThumbnailUrls[imageAttachments[i].id] = res.data.signedUrl
    })
  }

  // Fetch last 3 messages from linked conversation if present
  let chatExcerpt: { id: string; direction: string; content: string; sent_at: string }[] = []
  if (orderRow.conversation_id) {
    const { data: messages } = await supabase
      .from('messages')
      .select('id, direction, content, sent_at')
      .eq('conversation_id', orderRow.conversation_id)
      .order('sent_at', { ascending: false })
      .limit(3)
    chatExcerpt = (messages ?? []).reverse()
  }

  return (
    <Shell section="Orders">
      <OrderDetailView
        order={orderRow}
        events={(events ?? []) as DbOrderEvent[]}
        chatExcerpt={chatExcerpt}
        paymentConfigs={(paymentConfigs ?? []) as TenantPaymentConfig[]}
        customerStats={customerStats}
        invoice={invoice}
        attachments={attachments}
        attachmentSignedUrls={attachmentSignedUrls}
        attachmentThumbnailUrls={attachmentThumbnailUrls}
      />
    </Shell>
  )
}
