import * as React from 'react'
import { ArrowLeft, ChevronRight, ReceiptText, Send, Utensils } from 'lucide-react'
import { go, type State } from '../session/machine'
import { money } from '../lib/format'

export function Shell({ children, s, dispatch }: { children: React.ReactNode; s: State; dispatch: React.Dispatch<any> }) {
  return <main className="app-shell"><div className="topline"><img className="wordmark-logo" src="/klown-logo.png" alt="Klown" /><span className="table-pill">TABLE 07 <span className="dot" /></span></div>{children}<nav className="bottom-nav"><button onClick={() => dispatch(go('menu'))}><Utensils />Menu</button><button onClick={() => dispatch(go(s.hasOrder ? 'bill' : 'empty'))}><ReceiptText />Bill</button><button onClick={() => dispatch(go('waiter'))}><Send />Waiter</button></nav></main>
}

export function Back({ dispatch, to = 'menu' }: any) { return <button className="back" onClick={() => dispatch(go(to))}><ArrowLeft />Back</button> }

export function Action({ children, onClick, secondary = false }: any) { return <button className={`action ${secondary ? 'secondary' : ''}`} onClick={onClick}>{children}<ChevronRight /></button> }

export function Center({ eyebrow, title, copy, children, icon = 'K' }: any) { return <section className="center-screen"><div className="brand-mark"><img src="/klown-logo.png" alt="Klown" /></div><p className="eyebrow">{eyebrow}</p><h1 dangerouslySetInnerHTML={{ __html: title }} /><p className="muted">{copy}</p>{children}</section> }

export function BillRow({ name, qty, price }: any) { return <div className="bill-row"><span><small>{qty} ×</small>{name}</span><b>{money(price)}</b></div> }
