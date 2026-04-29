import { createClient } from '@/lib/supabase/server'
import { createTemplate, updateTemplate, deleteTemplate } from './actions'

const taStyle = {
  width: '100%', boxSizing: 'border-box' as const,
  background: 'var(--pt-surface)', border: '0.5px solid var(--pt-line)',
  borderRadius: 6, padding: '7px 9px', font: 'inherit', fontSize: 12.5,
  color: 'var(--pt-fg)', resize: 'vertical' as const, outline: 'none', lineHeight: 1.45,
}
const inputStyle = {
  height: 32, padding: '0 10px', borderRadius: 'var(--pt-radius-sm)',
  border: '0.5px solid var(--pt-line)', background: 'var(--pt-bg)',
  font: 'inherit', fontSize: 12.5, color: 'var(--pt-fg)', outline: 'none', width: '100%',
} as const

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = await supabase
    .from('templates')
    .select('id, tenant_id, title, content, sort_order')
    .order('sort_order')

  const platform = (templates ?? []).filter(t => t.tenant_id === null)
  const own = (templates ?? []).filter(t => t.tenant_id !== null)

  return (
    <div className="pt-st-section">
      <div className="pt-st-shd">
        <div>
          <h2>Message templates</h2>
          <p>Reusable messages for the inbox composer. Platform templates can be customised — editing creates your own copy.</p>
        </div>
      </div>

      {/* Your templates */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div><h3>Your templates</h3><p>{own.length} custom template{own.length !== 1 ? 's' : ''}</p></div>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          <ul className="pt-tpl-settings-list">
            {own.map(t => (
              <li key={t.id} className="pt-tpl-settings-row">
                <div className="pt-tpl-settings-info">
                  <div className="pt-tpl-settings-title">{t.title}</div>
                  <div className="pt-tpl-settings-body">{t.content.slice(0, 100)}{t.content.length > 100 ? '…' : ''}</div>
                </div>
                <div className="pt-tpl-settings-actions">
                  <details>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Edit</summary>
                    <form action={updateTemplate as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="isPlatform" value="false" />
                      <input name="title" defaultValue={t.title} required style={inputStyle} />
                      <textarea name="content" defaultValue={t.content} required rows={4} style={taStyle} />
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save</button>
                    </form>
                  </details>
                  <form action={deleteTemplate as never}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="pt-st-mini pt-st-mini-warn">Delete</button>
                  </form>
                </div>
              </li>
            ))}
            {own.length === 0 && (
              <li style={{ padding: '12px 16px', color: 'var(--pt-fg-4)', fontSize: 12 }}>No custom templates yet.</li>
            )}
          </ul>
        </div>
      </section>

      {/* Add new */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd"><div><h3>Add template</h3></div></header>
        <div className="pt-card-body">
          <form action={createTemplate as never} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input name="title" placeholder="Template name" required style={inputStyle} />
            <textarea name="content" placeholder="Template content — use [BRACKETS] for variables" required rows={4} style={taStyle} />
            <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Add template</button>
          </form>
        </div>
      </section>

      {/* Platform templates */}
      <section className="pt-card pt-st-card">
        <header className="pt-card-hd pt-st-card-hd">
          <div><h3>Platform templates</h3><p>Provided by Peptech. Editing creates your own copy.</p></div>
        </header>
        <div className="pt-card-body" style={{ padding: 0 }}>
          <ul className="pt-tpl-settings-list">
            {platform.map(t => (
              <li key={t.id} className="pt-tpl-settings-row">
                <div className="pt-tpl-settings-info">
                  <div className="pt-tpl-settings-title">{t.title}</div>
                  <div className="pt-tpl-settings-body">{t.content.slice(0, 100)}{t.content.length > 100 ? '…' : ''}</div>
                </div>
                <div className="pt-tpl-settings-actions">
                  <details>
                    <summary className="pt-btn pt-btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>Customise</summary>
                    <form action={updateTemplate as never} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="isPlatform" value="true" />
                      <input name="title" defaultValue={t.title} required style={inputStyle} />
                      <textarea name="content" defaultValue={t.content} required rows={4} style={taStyle} />
                      <button type="submit" className="pt-btn pt-btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>Save as my template</button>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
