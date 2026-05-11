import { NextResponse } from 'next/server'
import { createClient, getServerUser } from '@/lib/supabase/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import React from 'react'
import { InvoicePDF } from '@/components/invoices/InvoicePDF'
import { buildInvoiceData } from '@/types/invoices'
import type { TenantPaymentConfig } from '@/types/payments'

const ORDER_SELECT = `
  id, ref_number, payment_asset, payment_amount, payment_address, created_at,
  customers ( display_name ),
  order_items ( qty, unit_price_snapshot, products ( name, sku ) )
`

export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await request.json() as { orderId?: string }
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const supabase = await createClient()

  // Resolve tenant
  const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = userRow.tenant_id

  // Fetch order (RLS ensures it belongs to tenant)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single()
  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Fetch tenant branding
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_path')
    .eq('id', tenantId)
    .single()

  let logoUrl: string | null = null
  if (tenant?.logo_path) {
    const { data: signed } = await supabase.storage.from('logos').createSignedUrl(tenant.logo_path, 3600)
    logoUrl = signed?.signedUrl ?? null
  }

  const { data: paymentConfigs } = await supabase
    .from('tenant_payment_configs')
    .select('*')
    .eq('is_active', true)

  const invoiceData = buildInvoiceData(
    order as never,
    tenant?.name ?? 'My Business',
    logoUrl,
    (paymentConfigs ?? []) as TenantPaymentConfig[],
  )

  // Render PDF
  const buffer = await renderToBuffer(
    React.createElement(InvoicePDF, { data: invoiceData }) as React.ReactElement<DocumentProps>
  )

  // Upload to invoices bucket: {tenantId}/{orderId}/{invoiceNumber}.pdf
  const pdfPath = `${tenantId}/${orderId}/${invoiceData.invoiceNumber}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('invoices')
    .upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
  if (uploadErr) return NextResponse.json({ error: 'PDF upload failed' }, { status: 500 })

  // Create invoice record
  const { error: insertErr } = await supabase.from('invoices').upsert(
    { tenant_id: tenantId, order_id: orderId, invoice_number: invoiceData.invoiceNumber, pdf_path: pdfPath },
    { onConflict: 'tenant_id,invoice_number' }
  )
  if (insertErr) return NextResponse.json({ error: 'Invoice record failed' }, { status: 500 })

  // Return signed URL valid for 1 hour
  const { data: signed, error: signedErr } = await supabase.storage.from('invoices').createSignedUrl(pdfPath, 3600)
  if (signedErr || !signed) return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })

  return NextResponse.json({
    invoiceNumber: invoiceData.invoiceNumber,
    pdfPath,
    signedUrl: signed.signedUrl,
  })
}
