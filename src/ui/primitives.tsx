import * as React from 'react'
import { ArrowLeft, ChevronRight, ReceiptText, Utensils } from 'lucide-react'
import { go, type State } from '../session/machine'
import { money } from '../lib/format'

export function accentStyle(accentColor?: string) {
  return { ['--accent' as any]: accentColor || '#f3c744' } as React.CSSProperties
}

export function Shell({ children, s, dispatch }: { children: React.ReactNode; s: State; dispatch: React.Dispatch<any> }) {
  const style = accentStyle(s?.accentColor)
  return <><main className="app-shell" style={style}>{!(s?.screen === 'menu' && s?.menu?.source === 'studio') && <div className="topline"><img className="wordmark-logo" src={s?.logoUrl || '/klown-logo.png'} alt={s?.restaurantName || 'Klown'} /><span className="table-pill">TABLE {s?.tableLabel ?? '07'} <span className="dot" /></span></div>}{children}</main><nav className="bottom-nav" style={style}><button onClick={() => dispatch(go('menu'))}><Utensils />Menu</button><button onClick={() => dispatch(go(s.hasOrder ? 'bill' : 'empty'))}><ReceiptText />Bill</button></nav></>
}

export function Back({ dispatch, to = 'menu' }: any) { return <button className="back" onClick={() => dispatch(go(to))}><ArrowLeft />Back</button> }

export function Action({ children, onClick, secondary = false }: any) { return <button className={`action ${secondary ? 'secondary' : ''}`} onClick={onClick}>{children}<ChevronRight /></button> }

export function Center({ eyebrow, title, copy, children, icon = 'K', logoUrl, alt }: any) { return <section className="center-screen"><div className="brand-mark"><img src={logoUrl || '/klown-logo.png'} alt={alt || 'Klown'} /></div><p className="eyebrow">{eyebrow}</p><h1 dangerouslySetInnerHTML={{ __html: title }} /><p className="muted">{copy}</p>{children}</section> }

export function BillRow({ name, qty, price }: any) { return <div className="bill-row"><span><small>{qty} ×</small>{name}</span><b>{money(price)}</b></div> }
