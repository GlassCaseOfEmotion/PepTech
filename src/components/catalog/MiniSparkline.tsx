export function MiniSparkline({ data, width = 44, height = 16 }: { data: number[]; width?: number; height?: number }) {
  const max = Math.max(...data, 1)
  const step = (width - 1) / Math.max(1, data.length - 1)
  const pts = data.map((v, i) =>
    `${(i * step).toFixed(1)},${(height - (v / max) * height * 0.88).toFixed(1)}`
  ).join(' ')
  const lastX = ((data.length - 1) * step).toFixed(1)
  const area = `0,${height} ${pts} ${lastX},${height}`
  return (
    <svg className="pt-cat-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={area} fill="var(--pt-accent-soft)" stroke="none" />
      <polyline points={pts} fill="none" stroke="var(--pt-accent)" strokeWidth="1.2"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
