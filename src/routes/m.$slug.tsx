import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/m/$slug')({ component: PublicMenu })

type MenuData = {
  ok: boolean
  menu_name?: string
  currency?: string
  theme?: any
  digital?: any
  sections?: { id: string; name: string; items: any[] }[]
}

function fmtPrice(pesewas: number | null | undefined, currency: string) {
  if (pesewas == null) return ''
  const sym = currency === 'GHS' ? 'GH₵' : currency ? currency + ' ' : '₵'
  return sym + (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function PublicMenu() {
  const { slug } = Route.useParams()
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [data, setData] = useState<MenuData | null>(null)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    fetch('/api/public/menu-by-slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
      .then((r) => r.json())
      .then((j: MenuData) => {
        if (!alive) return
        if (j?.ok) {
          setData(j)
          setActive(j.sections?.[0]?.id ?? null)
          setStatus('ok')
        } else {
          setStatus('error')
        }
      })
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [slug])

  const dig = data?.digital || {}
  const th = data?.theme || {}
  const currency = data?.currency || 'GHS'
  const t = useMemo(
    () => ({
      fonts: {
        title: th.fonts?.title || 'Georgia, serif',
        heading: th.fonts?.heading || 'Georgia, serif',
        item: th.fonts?.item || '"Helvetica Neue", Arial, sans-serif',
        body: th.fonts?.body || 'Arial, sans-serif',
      },
      colors: {
        ink: th.colors?.ink || '#171717',
        paper: th.colors?.paper || '#f7f5f0',
        accent: th.colors?.accent || '#f3c744',
        heading: th.colors?.heading || '#171717',
        price: th.colors?.price || '#171717',
      },
      layout: { item_photos: th.layout?.item_photos || 'small' },
    }),
    [data],
  )

  useEffect(() => {
    const name = dig.biz_name || data?.menu_name
    if (name) document.title = name + ' · Menu'
  }, [data])

  const sections = data?.sections ?? []
  const sec = sections.find((x) => x.id === active) ?? sections[0]
  const priceOf = (it: any) =>
    it?.price_display && String(it.price_display).trim() ? String(it.price_display).trim() : fmtPrice(it?.price_pesewas, currency)

  const imgFallback = (e: any) => {
    if (e?.currentTarget) e.currentTarget.style.display = 'none'
  }

  if (status === 'loading') {
    return (
      <div style={frame}>
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#8a857c', fontFamily: 'Arial, sans-serif' }}>Loading menu…</div>
      </div>
    )
  }

  if (status === 'error' || !data) {
    return (
      <div style={frame}>
        <div style={{ textAlign: 'center', padding: '80px 20px', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, marginBottom: 8 }}>Menu not found</div>
          <p style={{ color: '#8a857c', fontSize: 14 }}>This menu link is not available. It may have been unpublished, or the link is incorrect.</p>
        </div>
        <PoweredBy />
      </div>
    )
  }

  return (
    <div style={{ ...frame, background: t.colors.paper, color: t.colors.ink }}>
      <div style={{ padding: '22px 20px', fontFamily: t.fonts.body }}>
        {dig.welcome_alert && (
          <div style={{ background: dig.banner_bg || t.colors.accent, color: '#fff', margin: '-22px -20px 14px', padding: '9px 20px', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textAlign: 'center' }}>{dig.welcome_alert}</div>
        )}
        {dig.banner_url && (
          <div style={{ height: 150, margin: (dig.welcome_alert ? '0' : '-22px') + ' -20px 14px', backgroundImage: `url(${dig.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        )}
        {!dig.banner_url && dig.logo_url && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <img src={dig.logo_url} alt={dig.biz_name || ''} style={{ height: 54, objectFit: 'contain' }} onError={imgFallback} />
          </div>
        )}
        {(dig.biz_name || dig.info || dig.phone || dig.link_url) && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            {dig.biz_name && <div style={{ fontFamily: t.fonts.title, fontSize: 20, color: t.colors.heading }}>{dig.biz_name}</div>}
            {dig.info && <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{dig.info}</div>}
            {(dig.phone || dig.link_url) && (
              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>
                {dig.phone}
                {dig.phone && dig.link_url ? ' · ' : ''}
                {dig.link_url && (
                  <a href={dig.link_url} target="_blank" rel="noopener noreferrer" style={{ color: t.colors.accent }}>{dig.link_text || 'Website'}</a>
                )}
              </div>
            )}
          </div>
        )}

        {!dig.biz_name && (
          <header className="page-header">
            <div>
              <h1 style={{ fontFamily: t.fonts.title, color: t.colors.heading }}>{data.menu_name || 'Our menu'}</h1>
            </div>
          </header>
        )}

        {sections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#8a857c' }}>This menu has no items yet.</div>
        ) : (
          <>
            <div className="tabs">
              {sections.map((x) => (
                <button
                  key={x.id}
                  className={x.id === sec?.id ? 'active' : ''}
                  onClick={() => setActive(x.id)}
                  style={x.id === sec?.id ? { color: t.colors.heading, borderBottomColor: t.colors.accent, fontFamily: t.fonts.item } : { fontFamily: t.fonts.item }}
                >
                  {x.name}
                </button>
              ))}
            </div>
            <div className="menu-group">
              <div className="section-label" style={{ fontFamily: t.fonts.heading, color: t.colors.heading }}>
                {(sec?.name || '').toUpperCase()} <span>{(sec?.items ?? []).length} items</span>
              </div>
              {(sec?.items ?? []).map((it: any) => (
                <div className="dish-row" key={it.id} style={{ opacity: it.sold_out || it.available === false ? 0.5 : 1, cursor: 'default' }}>
                  {t.layout.item_photos !== 'none' && it.image_url && <img src={it.image_url} alt={it.name} onError={imgFallback} />}
                  <span>
                    <strong style={{ fontFamily: t.fonts.item, color: t.colors.ink }}>
                      {it.name}
                      {it.sold_out ? ' · Sold out' : ''}
                    </strong>
                    {it.description && <small style={{ fontFamily: t.fonts.body }}>{it.description}</small>}
                  </span>
                  <b style={{ color: t.colors.price, fontFamily: t.fonts.item }}>{priceOf(it)}</b>
                </div>
              ))}
            </div>
          </>
        )}
        <PoweredBy />
      </div>
    </div>
  )
}

const frame: React.CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  minHeight: '100dvh',
  background: '#f7f5f0',
}

function PoweredBy() {
  return (
    <div style={{ textAlign: 'center', margin: '28px 0 8px', fontSize: 11, letterSpacing: '.08em', color: '#a29d93', fontFamily: 'Arial, sans-serif' }}>
      POWERED BY <strong style={{ color: '#171717' }}>KLOWN</strong>
    </div>
  )
}
