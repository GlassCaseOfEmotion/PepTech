import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import type { InvoiceData } from '@/types/invoices'
import { formatAmount } from '@/lib/currency'

const S = StyleSheet.create({
  page:      { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  hd:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 },
  logo:      { width: 80, height: 32, objectFit: 'contain' },
  bizName:   { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  invLabel:  { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  invNum:    { fontSize: 11, color: '#555' },
  meta:      { marginBottom: 28 },
  metaRow:   { flexDirection: 'row', gap: 40, marginBottom: 16 },
  metaLbl:   { fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, color: '#888', marginBottom: 3 },
  metaVal:   { fontSize: 11 },
  tblHd:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', paddingBottom: 6, marginBottom: 6, fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.6 },
  tblRow:    { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  colName:   { flex: 3 },
  colSku:    { flex: 1.5, color: '#888' },
  colQty:    { width: 36, textAlign: 'center' },
  colPrice:  { width: 56, textAlign: 'right' },
  colTotal:  { width: 64, textAlign: 'right' },
  totalRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: '#1a1a1a' },
  totalLbl:  { fontSize: 11, fontFamily: 'Helvetica-Bold', marginRight: 64 },
  totalAmt:  { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 64, textAlign: 'right' },
  payment:   { marginTop: 32, padding: 14, backgroundColor: '#f8f8f8', borderRadius: 4 },
  payHd:     { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: '#888', marginBottom: 10 },
  payMethod: { marginBottom: 10 },
  payLabel:  { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  payRow:    { flexDirection: 'row', gap: 8, marginBottom: 2 },
  payKey:    { fontSize: 9, color: '#888', width: 72 },
  payVal:    { fontSize: 9, flex: 1 },
  footer:    { position: 'absolute', bottom: 32, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#bbb', borderTopWidth: 0.5, borderTopColor: '#e0e0e0', paddingTop: 8 },
})

export function InvoicePDF({ data }: { data: InvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.hd}>
          <View>
            {data.logoUrl
              ? <Image src={data.logoUrl} style={S.logo} />
              : <Text style={S.bizName}>{data.businessName}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.invLabel}>Invoice</Text>
            <Text style={S.invNum}>{data.invoiceNumber}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={S.metaRow}>
          <View>
            <Text style={S.metaLbl}>Issued</Text>
            <Text style={S.metaVal}>{data.issuedAt}</Text>
          </View>
          <View>
            <Text style={S.metaLbl}>Bill to</Text>
            <Text style={S.metaVal}>{data.customerName}</Text>
          </View>
          {data.logoUrl && (
            <View>
              <Text style={S.metaLbl}>From</Text>
              <Text style={S.metaVal}>{data.businessName}</Text>
            </View>
          )}
          <View>
            <Text style={S.metaLbl}>Order ref</Text>
            <Text style={S.metaVal}>{data.orderRef}</Text>
          </View>
        </View>

        {/* Line items table */}
        <View style={S.tblHd}>
          <Text style={S.colName}>Item</Text>
          <Text style={S.colSku}>SKU</Text>
          <Text style={S.colQty}>Qty</Text>
          <Text style={S.colPrice}>Unit</Text>
          <Text style={S.colTotal}>Total</Text>
        </View>
        {data.items.map((it, i) => (
          <View key={i} style={S.tblRow}>
            <Text style={S.colName}>{it.name}</Text>
            <Text style={S.colSku}>{it.sku}</Text>
            <Text style={S.colQty}>{it.qty}</Text>
            <Text style={S.colPrice}>{formatAmount(it.unitPrice, data.currency)}</Text>
            <Text style={S.colTotal}>{formatAmount(it.subtotal, data.currency)}</Text>
          </View>
        ))}
        <View style={S.totalRow}>
          <Text style={S.totalLbl}>Total</Text>
          <Text style={S.totalAmt}>{formatAmount(data.total, data.currency)}</Text>
        </View>

        {/* Payment */}
        {data.paymentMethods.length > 0 && (
          <View style={S.payment}>
            <Text style={S.payHd}>
              {data.paymentMethods.length === 1 ? 'Payment details' : 'Payment options'}
            </Text>
            {data.paymentMethods.map((m, i) => (
              <View key={i} style={S.payMethod}>
                <Text style={S.payLabel}>{m.label}</Text>
                {m.address && (
                  <View style={S.payRow}>
                    <Text style={S.payKey}>Address</Text>
                    <Text style={S.payVal}>{m.address}</Text>
                  </View>
                )}
                {m.accountName && (
                  <View style={S.payRow}>
                    <Text style={S.payKey}>Name</Text>
                    <Text style={S.payVal}>{m.accountName}</Text>
                  </View>
                )}
                {m.accountNumber && (
                  <View style={S.payRow}>
                    <Text style={S.payKey}>Account</Text>
                    <Text style={S.payVal}>{m.accountNumber}</Text>
                  </View>
                )}
                {m.sortCode && (
                  <View style={S.payRow}>
                    <Text style={S.payKey}>Sort code</Text>
                    <Text style={S.payVal}>{m.sortCode}</Text>
                  </View>
                )}
                {m.iban && (
                  <View style={S.payRow}>
                    <Text style={S.payKey}>IBAN</Text>
                    <Text style={S.payVal}>{m.iban}</Text>
                  </View>
                )}
                {m.reference && (
                  <View style={S.payRow}>
                    <Text style={S.payKey}>Reference</Text>
                    <Text style={S.payVal}>{m.reference} (please include)</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={S.footer}>
          <Text>{data.businessName}</Text>
          <Text>{data.invoiceNumber} · For research use only · Not for human consumption</Text>
        </View>

      </Page>
    </Document>
  )
}
