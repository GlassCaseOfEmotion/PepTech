import { permanentRedirect } from 'next/navigation'

export default function CustomersIndexPage() {
  permanentRedirect('/contacts')
}
