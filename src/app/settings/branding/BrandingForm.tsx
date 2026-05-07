'use client'

import { useState, useTransition } from 'react'
import { uploadLogo, removeLogo } from './actions'

export function BrandingForm({ businessName, logoUrl }: { businessName: string; logoUrl: string | null }) {
  const [currentLogoUrl, setCurrentLogoUrl] = useState(logoUrl)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setSuccess('')
    const fd = new FormData()
    fd.append('logo', file)
    startTransition(async () => {
      const res = await uploadLogo(fd)
      if ('error' in res) { setError(res.error); return }
      setCurrentLogoUrl(URL.createObjectURL(file))
      setSuccess('Logo saved.')
    })
  }

  const handleRemove = () => {
    setError(''); setSuccess('')
    startTransition(async () => {
      const res = await removeLogo()
      if ('error' in res) { setError(res.error); return }
      setCurrentLogoUrl(null)
      setSuccess('Logo removed.')
    })
  }

  return (
    <section className="pt-card pt-st-card">
      <header className="pt-card-hd pt-st-card-hd">
        <div><h3>Invoice branding</h3></div>
      </header>
      <div className="pt-card-body pt-st-card-body">
        <div className="pt-st-field">
          <div className="pt-st-field-l"><label>Business name</label></div>
          <div className="pt-st-field-r">
            <input className="pt-st-input" defaultValue={businessName} disabled />
            <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 4 }}>Set via workspace name — contact support to change.</p>
          </div>
        </div>
        <div className="pt-st-field" style={{ marginTop: 16 }}>
          <div className="pt-st-field-l"><label>Logo</label></div>
          <div className="pt-st-field-r">
            {currentLogoUrl && (
              <img src={currentLogoUrl} alt="Current logo" style={{ height: 40, objectFit: 'contain', marginBottom: 10, display: 'block' }} />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer' }}>
                {pending ? 'Uploading…' : currentLogoUrl ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleUpload} disabled={pending} />
              </label>
              {currentLogoUrl && (
                <button className="pt-btn pt-btn-ghost" onClick={handleRemove} disabled={pending}>Remove</button>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--pt-fg-4)', marginTop: 6 }}>PNG, JPEG or WebP · max 2 MB. Shown at top-left of invoices.</p>
            {error && <p style={{ fontSize: 12, color: 'var(--pt-danger)', marginTop: 6 }}>{error}</p>}
            {success && <p style={{ fontSize: 12, color: 'var(--pt-ok)', marginTop: 6 }}>{success}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
