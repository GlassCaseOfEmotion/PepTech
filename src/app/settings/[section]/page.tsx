const LABELS: Record<string, string> = {
  trust:         'Trust & risk',
  inventory:     'Inventory defaults',
  notifications: 'Notifications',
  templates:     'Message templates',
  devices:       'Devices & sessions',
  billing:       'Plan & billing',
}

export default async function SettingsSectionStubPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  const label = LABELS[section] ?? section

  return (
    <div className="pt-st-section pt-st-stub">
      <div className="pt-st-shd">
        <div><h2>{label}</h2></div>
      </div>
      <div className="pt-st-stub-body">
        <div className="pt-st-stub-mark">{label}</div>
        <div className="pt-st-stub-cap">This section will land in the next iteration.</div>
      </div>
    </div>
  )
}
