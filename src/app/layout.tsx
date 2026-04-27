import type { Metadata } from 'next'
import '../../styles/peptech.css'
import '../../styles/inbox.css'
import '../../styles/customer.css'
import '../../styles/settings.css'
import '../../styles/orders.css'
import '../../styles/catalog.css'
import '../../styles/broadcast.css'
import '../../styles/automations.css'
import '../../styles/vault.css'

export const metadata: Metadata = {
  title: 'Peptech',
  description: 'Peptide business CRM',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
