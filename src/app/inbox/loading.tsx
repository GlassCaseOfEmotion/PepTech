export default function Loading() {
  return (
    <div className="pt-inbox">
      <div className="pt-ix-list">
        <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="pt-skel" style={{ height: 32, borderRadius: 6 }} />
          <div className="pt-skel" style={{ height: 20, width: '60%', animationDelay: '0.1s' }} />
          <div className="pt-skel" style={{ height: 20, width: '80%', animationDelay: '0.15s' }} />
          <div className="pt-skel" style={{ height: 20, width: '70%', animationDelay: '0.2s' }} />
        </div>
      </div>
      <div style={{ flex: 1 }} />
    </div>
  )
}
