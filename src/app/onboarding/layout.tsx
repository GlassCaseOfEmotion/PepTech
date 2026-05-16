import { Fraunces } from 'next/font/google'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['300'],
  style: ['italic'],
  variable: '--font-fraunces',
  display: 'swap',
})

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className={fraunces.variable} style={{ minHeight: '100vh' }}>{children}</div>
}
