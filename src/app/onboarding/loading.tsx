export default function OnboardingLoading() {
  // Override the root /loading.tsx (ShellSkeleton with dashboard sidebar), which
  // otherwise paints the dashboard chrome for ~1–3s while the onboarding page's
  // server queries run — confusing for a brand-new user who hasn't seen the
  // dashboard yet. A neutral full-screen panel keeps the transition clean.
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--pt-bg, #fafaf9)',
      }}
    />
  )
}
