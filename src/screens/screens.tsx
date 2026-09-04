import { useState } from 'react'
import { Check, ChevronRight, Clock3, CreditCard, Heart, Info, Minus, Plus, QrCode, RotateCcw, Search, Send, Star, Users, X } from 'lucide-react'
import { go, screens, type Screen } from '../session/machine'
import { money } from '../lib/format'
import { Back, Action, Center, BillRow } from '../ui/primitives'

const pes = (v?: number | null) => money((v ?? 0) / 100)
// Real photo when the item has one; a neutral plate otherwise — never the wrong dish's image.
// image_key may be a full URL (hosted) or a bundled /assets/menu filename.
const menuImg = (item?: { image_key?: string | null }) => {
  const k = item?.image_key
  if (!k) return '/assets/menu/_plate.png'
  return /^https?:\/\//.test(k) ? k : `/assets/menu/${k}`
}
// If a hosted photo ever fails to load, fall back to the neutral plate — never a broken image.
const imgFallback = (e: any) => { if (e?.currentTarget && !e.currentTarget.src.endsWith('_plate.png')) e.currentTarget.src = '/assets/menu/_plate.png' }

export function Connect({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="A BETTER WAY TO DINE" title={'Making the<br /><em>table</em> feel closer.'} copy="Connecting to your table…"><div className="loader" /><button className="text-link" onClick={() => dispatch(go('welcome'))}>Skip connection</button></Center> }

export function Welcome({ s, dispatch }: any) { return <section className="welcome"><div className="hero-image" {...(s?.heroUrl ? { style: { backgroundImage: `url(${s.heroUrl})` } } : {})} /><div className="welcome-copy"><p className="eyebrow">WELCOME TO {(s?.restaurantName || 'the restaurant').toUpperCase()}</p><h1>{s?.taglineTop || 'Good food.'}<br /><em>{s?.taglineBottom || 'Good company.'}</em></h1><p className="muted">{s.tableLabel ? `You are at table ${s.tableLabel}.` : 'You are at your table.'} {s?.welcomeCopy || 'Explore the menu, call your waiter, or settle your bill when you are ready.'}</p><Action onClick={() => dispatch(go(s.hasOrder ? 'bill' : 'empty'))}>{s.hasOrder ? 'View your live bill' : 'Explore the menu'}</Action></div></section> }

export function Empty({ s, dispatch }: any) { return <section><Back dispatch={dispatch} to="welcome" /><p className="eyebrow">{s?.tableLabel ? `TABLE ${s.tableLabel} · READY WHEN YOU ARE` : 'READY WHEN YOU ARE'}</p><h1>Your table,<br /><em>your pace.</em></h1><p className="muted">Nothing has been added yet. Browse the menu, or call someone over if you need a recommendation.</p><div className="empty-card"><QrCode /><strong>No order yet</strong><span>Your bill will appear here once the first order is placed.</span></div><Action onClick={() => dispatch(go('menu'))}>Explore the menu</Action><button className="waiter-link" onClick={() => dispatch(go('waiter'))}><Send />Ask for a recommendation</button></section> }

export function Menu({ s, dispatch }: any) { if (s?.menu?.source === 'studio') return <StudioMenu s={s} dispatch={dispatch} />; const [group, setGroup] = useState('Food'); const cats = s?.menu?.categories ?? []; const allItems = s?.menu?.items ?? []; const rec = (s?.menu?.recommendations ?? [])[0]; const GROUPS: [string, (n: number) => boolean][] = [['Food', (n) => n < 100], ['Drinks', (n) => n >= 200 && n < 300], ['Spirits', (n) => n >= 300 && n < 400], ['Wine', (n) => n >= 400]]; const test = (GROUPS.find((g) => g[0] === group) ?? GROUPS[0]!)[1]; const groupCats = cats.filter((c: any) => test(c.sort)); return <section><header className="page-header"><div><p className="eyebrow">{(s?.restaurantName || '').toUpperCase()} · TABLE {s?.tableLabel ?? ''}</p><h1>What are you<br /><em>in the mood for?</em></h1></div><button className="icon-button"><Search /></button></header><div className="tabs">{GROUPS.map(([key]) => <button key={key} className={key === group ? 'active' : ''} onClick={() => setGroup(key)}>{key}</button>)}</div>{rec && <div className="recommend"><div><p className="eyebrow">CHEF'S NOTE</p><h2>{rec.title}</h2><p>{rec.subtitle}</p></div><Star /></div>}{groupCats.map((c: any) => { const items = allItems.filter((i: any) => i.category_id === c.id); return <div className="menu-group" key={c.id}><div className="section-label">{c.name.toUpperCase()} <span>{items.length} items</span></div>{items.map((i: any) => <button className="dish-row" key={i.id} onClick={() => dispatch({ type: 'patch-go', value: { selectedItem: i, dish: i.name }, to: 'dish' })}><img src={menuImg(i)} alt={i.name} onError={imgFallback} /><span><strong>{i.name}</strong><small>{i.tags?.sub ?? (i.tags?.signature ? 'Chef’s signature' : `${s?.restaurantName || 'the'} kitchen`)}</small></span><b>{pes(i.price_pesewas)}</b><ChevronRight /></button>)}</div> })}<Action secondary onClick={() => dispatch(go('bill'))}>View live bill</Action></section> }

export function Category({ s, dispatch }: any) { const cats = s?.menu?.categories ?? []; const activeId = s?.activeCategoryId ?? cats[0]?.id; const cat = cats.find((c: any) => c.id === activeId); const shown = (s?.menu?.items ?? []).filter((i: any) => i.category_id === activeId); return <section><Back dispatch={dispatch} to="menu" /><p className="eyebrow">{(s?.restaurantName || '').toUpperCase()} MENU</p><h1>{cat?.name ?? 'Menu'}</h1><p className="muted">A little something for everyone at the table.</p><div className="section-label">ALL {(cat?.name ?? 'ITEMS').toUpperCase()}</div><div className="simple-list">{shown.map((i: any) => <p key={i.id} onClick={() => dispatch({ type: 'patch-go', value: { selectedItem: i, dish: i.name }, to: 'dish' })}>{i.name} <b>{pes(i.price_pesewas)}</b></p>)}</div></section> }

export function Dish({ s, dispatch }: any) { const it = s?.selectedItem ?? (s?.menu?.items ?? []).find((i: any) => i.name === s?.dish); const t = it?.tags ?? {}; return <section><Back dispatch={dispatch} to="menu" /><img className="dish-hero" src={menuImg(it)} alt={it?.name ?? s?.dish} onError={imgFallback} /><p className="eyebrow">{(s?.restaurantName || '').toUpperCase()} KITCHEN</p><h1>{it?.name ?? s?.dish}</h1><p className="price">{pes(it?.price_pesewas)}</p>{t.sub && <p className="muted">{t.sub}</p>}<p className="muted">{t.desc ?? `A beautiful plate, thoughtfully prepared by the ${s?.restaurantName || 'house'} kitchen.`}</p><div className="tags">{t.veg && <span>Vegan</span>}{t.signature && <span>Chef’s signature</span>}{t.origin && <span>{t.origin}</span>}</div><Action onClick={() => dispatch(go('waiter'))}>Ask your waiter about this dish</Action></section> }

export function Waiter({ s, dispatch }: any) { return <section><Back dispatch={dispatch} to="empty" /><p className="eyebrow">WAITER ASSISTANCE</p><h1>What can we<br /><em>help with?</em></h1><p className="muted">A member of the {s?.restaurantName || 'restaurant'} team will be with you shortly.</p><div className="sheet-options"><button onClick={() => dispatch({ type: 'waiter' })}><Send /><span><b>Call my waiter</b><small>Someone will come to your table</small></span><ChevronRight /></button><button onClick={() => dispatch({ type: 'waiter' })}><Info /><span><b>Recommend a dish</b><small>Get a little local expertise</small></span><ChevronRight /></button></div></section> }

export function WaiterNotified({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="REQUEST SENT" title={'On the<br /><em>way.</em>'} copy="Your waiter has been notified. No need to wave — we will come to you."><div className="notice-card"><Clock3 /><span>Usually within 2–3 minutes</span></div><Action onClick={() => dispatch(go('waiting-bill'))}>Wait for my bill</Action><button className="text-link" onClick={() => dispatch(go('menu'))}>Back to menu</button></Center> }

export function WaitingBill({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="BILL REQUESTED" title={'We are<br /><em>on it.</em>'} copy="Your bill will appear here once your waiter closes the table."><div className="loader" /><button className="text-link" onClick={() => dispatch(go('welcome'))}>Back to your table</button></Center> }

export function Bill({ s, dispatch, ready = false }: any) { const b = s?.bill; const items = b?.items ?? []; return <section><Back dispatch={dispatch} to={ready ? 'bill-ready' : 'welcome'} /><p className="eyebrow">TABLE {s?.tableLabel ?? ''} · LIVE BILL</p><h1>Your table,<br /><em>so far.</em></h1><div className="bill-card"><div className="status"><span className="pulse" />{ready ? `Bill ready from ${s?.restaurantName || ''} POS` : `Live from ${s?.restaurantName || ''} POS`} <Clock3 /></div><p>{s?.people ?? 2} guests · Started 7:42 PM</p>{items.map((i: any, n: number) => <BillRow key={`${i.name}-${n}`} name={i.name} qty={String(i.qty)} price={i.lineTotalPesewas / 100} />)}<div className="bill-total"><span>Subtotal</span><b>{pes(b?.subtotalPesewas)}</b></div><div className="bill-total"><span>Service charge</span><span>{pes(b?.serviceChargePesewas)}</span></div><div className="grand-total"><span>Total so far</span><b>{pes(b?.totalPesewas)}</b></div></div><button className="waiter-link" onClick={() => dispatch(go('waiter'))}><Send />Call your waiter</button><button className="waiter-link" onClick={() => dispatch(go('bill-issue'))}><Info />Report a problem with the bill</button><Action onClick={() => dispatch(go('full-check'))}>See full check</Action></section> }

export function FullCheck({ s, dispatch }: any) { const b = s?.bill; return <section><Back dispatch={dispatch} to="bill" /><p className="eyebrow">FULL CHECK · TABLE 07</p><h1>Everything<br /><em>looks good.</em></h1><div className="receipt-card"><BillRow name={`Dinner for ${s?.people ?? 2}`} qty="" price={(b?.subtotalPesewas ?? 0) / 100} /><BillRow name="Service charge" qty="" price={(b?.serviceChargePesewas ?? 0) / 100} /><div className="grand-total"><span>Total</span><b>{pes(b?.totalPesewas)}</b></div></div><Action onClick={() => dispatch(go('recommendation'))}>Continue</Action></section> }

export function Recommendation({ s, dispatch }: any) { const recs = s?.menu?.recommendations ?? []; const rec = recs.find((r: any) => r.kind === 'dessert') ?? recs[0]; const it = rec ? (s?.menu?.items ?? []).find((i: any) => i.id === rec.item_id) : undefined; return <section><Back dispatch={dispatch} to="full-check" /><p className="eyebrow">BEFORE YOU GO</p><h1>One last<br /><em>little thing?</em></h1><div className="recommend-card"><img src={menuImg(it)} alt={it?.name ?? 'Chef recommendation'} onError={imgFallback} /><div><p className="eyebrow">{(rec?.kind ?? 'CHEF').toUpperCase()}</p><h2>{it?.name ?? rec?.title ?? 'Chef’s pick'}</h2><p>{rec?.subtitle ?? ''}</p><b>{pes(it?.price_pesewas)}</b></div></div><Action onClick={() => dispatch(go('pay'))}>Settle the bill</Action>{it && <button className="outline-button" onClick={() => dispatch({ type: 'patch-go', value: { selectedItem: it, dish: it.name }, to: 'dish' })}>View details</button>}</section> }

export function Pay({ s, dispatch }: any) { const due = s?.quote?.remainingPesewas ?? s?.bill?.totalPesewas ?? 0; return <section><Back dispatch={dispatch} to="recommendation" /><p className="eyebrow">SETTLE UP</p><h1>How would you<br /><em>like to pay?</em></h1><div className="pay-total"><span>Your share</span><strong>{pes(due)}</strong></div><button className="choice" onClick={() => dispatch({ type: 'patch-go', value: { shareMode: 'full' }, to: 'tip' })}><span className="choice-icon"><CreditCard /></span><span><b>Pay the full bill</b><small>One simple payment</small></span><ChevronRight /></button><button className="choice" onClick={() => dispatch(go('split'))}><span className="choice-icon"><Users /></span><span><b>Split the bill</b><small>Everyone pays their share</small></span><ChevronRight /></button></section> }

export function Split({ s, dispatch }: any) {
  const due = s?.bill?.totalPesewas ?? s?.quote?.remainingPesewas ?? 0
  const [mode, setMode] = useState<'even' | 'amounts' | 'items'>('even')
  const [people, setPeople] = useState(s?.people ?? 2)
  const [rows, setRows] = useState<{ label: string; amount: string }[]>([{ label: '', amount: '' }, { label: '', amount: '' }])
  const assigned = rows.reduce((n, r) => n + Math.round((parseFloat(r.amount) || 0) * 100), 0)
  const reconciled = assigned === due && rows.every((r) => (parseFloat(r.amount) || 0) > 0)
  const setRow = (i: number, k: 'label' | 'amount', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return <section><Back dispatch={dispatch} to="pay" /><p className="eyebrow">SPLIT THE BILL</p><h1>Make it <em>easy.</em></h1><p className="muted">Bill total {pes(due)}. Choose how to split it.</p>
    <div className="split-modes">
      <button className={mode === 'even' ? 'selected' : ''} onClick={() => setMode('even')}>Even split<small>Everyone pays the same</small></button>
      <button className={mode === 'amounts' ? 'selected' : ''} onClick={() => setMode('amounts')}>By amount<small>Set each share</small></button>
      <button className={mode === 'items' ? 'selected' : ''} onClick={() => setMode('items')}>By item<small>Everyone pays for what they had</small></button>
    </div>
    {mode === 'even' && (<>
      <div className="stepper"><button aria-label="Fewer people" onClick={() => setPeople(Math.max(2, people - 1))}><Minus /></button><strong>{people}</strong><button aria-label="More people" onClick={() => setPeople(people + 1)}><Plus /></button></div>
      <div className="split-share"><span>Each person pays about</span><b>{pes(Math.floor(due / Math.max(2, people)))}</b></div>
    </>)}
    {mode === 'amounts' && (<>
      <div className="amount-rows">{rows.map((r, i) => (
        <div className="amount-row" key={i}>
          <input placeholder={`Name ${i + 1}`} value={r.label} onChange={(e) => setRow(i, 'label', e.target.value)} />
          <input placeholder="0.00" inputMode="decimal" value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} />
          {rows.length > 2 && <button className="row-x" aria-label="Remove share" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X /></button>}
        </div>))}
      </div>
      <button className="text-link" onClick={() => setRows([...rows, { label: '', amount: '' }])}>+ Add a share</button>
      <div className="split-share"><span>Assigned</span><b>{pes(assigned)} / {pes(due)}</b></div>
    </>)}
    {mode === 'items' && (
      <div className="notice-card"><Info /><span>Each person opens the bill, taps the items they had, and pays for just those. The table clears once every item is covered.</span></div>
    )}
    {s?.splitError && <div className="error"><X />{s.splitError}</div>}
    <Action onClick={() => dispatch(mode === 'even'
      ? { type: 'split-create', mode: 'even', people }
      : mode === 'items' ? { type: 'split-create', mode: 'items' }
      : reconciled ? { type: 'split-create', mode: 'amounts', amounts: rows.map((r) => ({ label: r.label, amount: Math.round((parseFloat(r.amount) || 0) * 100) })) } : { type: 'noop' })}>
      {mode === 'amounts' && !reconciled ? `Assign ${pes(Math.max(0, due - assigned))} more` : mode === 'items' ? 'Start picking items' : 'Start split'}</Action>
  </section>
}

export function SplitItems({ s, dispatch }: any) {
  const split = s?.split
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  const copyInvite = () => { try { navigator.clipboard?.writeText(base) } catch {} }
  const waInvite = () => { try { window.open(`https://wa.me/?text=${encodeURIComponent(`Join our bill and pick your items: ${base}`)}`, '_blank', 'noopener') } catch {} }
  if (!split || split.mode !== 'items') return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="SPLIT BY ITEM" title={'Setting up<br /><em>the split…</em>'} copy="One moment."><div className="loader" /></Center>
  const items = split.items ?? []
  const myId = split.myShareId ?? null
  const myAmount = split.myShareAmountPesewas ?? 0
  const total = split.totalPesewas ?? 0
  const paid = split.paidPesewas ?? 0
  const unassigned = split.unassignedPesewas ?? 0
  const iPaid = (split.shares ?? []).some((sh: any) => sh.mine && sh.status === 'paid')
  const done = total > 0 && paid >= total
  const myUnitsOn = (it: any) => (it.takers.find((t: any) => t.shareId === myId)?.units ?? 0)
  return <section><Back dispatch={dispatch} to="pay" /><p className="eyebrow">CHOOSE YOUR ITEMS · TABLE {s?.tableLabel ?? ''}</p><h1>Pick what<br /><em>you had.</em></h1>
    <p className="muted">Tap the items you ordered. Everyone at the table picks theirs, and the bill clears once it all adds up.</p>
    <div className="item-board">{items.map((it: any) => {
      const mine = myUnitsOn(it)
      const others = it.takers.filter((t: any) => t.shareId !== myId)
      const canAdd = it.unitsFree > 0 && !iPaid
      const soldOut = it.unitsFree <= 0 && mine === 0
      return <div className={`item-row${soldOut ? ' dim' : ''}`} key={it.billItemId}>
        <div className="item-main">
          <strong>{it.qty > 1 ? `${it.qty}× ` : ''}{it.name}</strong>
          <small>{pes(it.lineTotalPesewas)}{others.length ? ` · ${others.map((t: any) => `${t.name}${t.units > 1 ? ` ×${t.units}` : ''}${t.paid ? ' ✓' : ''}`).join(', ')}` : ''}</small>
        </div>
        {it.qty > 1
          ? <div className="item-step">
              <button aria-label="Remove one" disabled={mine <= 0 || iPaid} onClick={() => dispatch({ type: 'split-assign', billItemId: it.billItemId, units: mine - 1 })}><Minus /></button>
              <strong>{mine}</strong>
              <button aria-label="Add one" disabled={!canAdd} onClick={() => dispatch({ type: 'split-assign', billItemId: it.billItemId, units: mine + 1 })}><Plus /></button>
            </div>
          : <button className={`item-take${mine > 0 ? ' on' : ''}`} disabled={mine === 0 && !canAdd} onClick={() => dispatch(mine > 0 ? { type: 'split-unassign', billItemId: it.billItemId } : { type: 'split-assign', billItemId: it.billItemId, units: 1 })}>{mine > 0 ? <Check /> : 'Take'}</button>}
      </div>
    })}</div>
    <div className="split-share"><span>You&apos;re paying</span><b>{pes(myAmount)}</b></div>
    <div className="split-progress"><span>{pes(paid)} of {pes(total)} settled{unassigned > 0 ? ` · ${pes(unassigned)} unassigned` : ''}</span><div className="bar"><i style={{ width: `${total ? Math.min(100, Math.round((paid / total) * 100)) : 0}%` }} /></div></div>
    {unassigned > 0 && !iPaid && <button className="text-link" onClick={() => dispatch({ type: 'assign-remaining' })}>I&apos;ll cover the rest</button>}
    {done ? <div className="notice-card"><Check /><span>Every item is in — thank you.</span></div>
      : iPaid ? <div className="notice-card"><Check /><span>Your part is paid. Waiting on the rest of the table.</span></div>
      : <Action onClick={() => { if (myId && myAmount > 0) dispatch({ type: 'patch-go', value: { claimedShareId: myId }, to: 'tip' }) }}>{myAmount > 0 ? `Pay my share · ${pes(myAmount)}` : 'Pick an item to pay'}</Action>}
    <div className="split-actions"><button className="text-link" onClick={copyInvite}>Copy table link</button><button className="text-link" onClick={waInvite}>Invite on WhatsApp</button></div>
  </section>
}

export function SplitLobby({ s, dispatch }: any) {
  const split = s?.split
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  const invite = (tok: string) => `${base}?claim=${tok}`
  const copyInvite = (tok: string) => { try { navigator.clipboard?.writeText(invite(tok)) } catch {} }
  const waInvite = (tok: string, amt: number) => { try { window.open(`https://wa.me/?text=${encodeURIComponent(`Your share of the bill is ${pes(amt)}. Tap to pay: ${invite(tok)}`)}`, '_blank', 'noopener') } catch {} }
  if (!split) return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="SPLIT" title={'Setting up<br /><em>the split…</em>'} copy="One moment."><div className="loader" /></Center>
  const paid = split.paidPesewas ?? 0, total = split.totalPesewas ?? 0
  const done = total > 0 && paid >= total
  return <section><Back dispatch={dispatch} to="pay" /><p className="eyebrow">SPLIT THE BILL · TABLE {s?.tableLabel ?? ''}</p><h1>Everyone pays<br /><em>their share.</em></h1>
    <div className="split-lobby">{(split.shares ?? []).map((sh: any) => (
      <div className={`share-row ${sh.status}`} key={sh.id}>
        <span className="share-name">{sh.claimedByName || sh.label}<small>{sh.status === 'paid' ? 'Paid' : sh.status === 'claimed' ? (sh.mine ? 'You' : 'Claimed') : 'Open'}</small></span>
        <b>{pes(sh.amountPesewas)}</b>
        <div className="share-actions">
          {sh.status === 'unclaimed' && <button onClick={() => dispatch({ type: 'split-claim', shareId: sh.id })}>Claim</button>}
          {sh.status === 'unclaimed' && <button className="ghost" onClick={() => copyInvite(sh.shareToken)}>Invite</button>}
          {sh.status === 'claimed' && sh.mine && <button onClick={() => dispatch({ type: 'patch-go', value: { claimedShareId: sh.id }, to: 'tip' })}>Pay</button>}
          {sh.status === 'claimed' && sh.mine && <button className="ghost" onClick={() => dispatch({ type: 'split-release', shareId: sh.id })}>Release</button>}
          {sh.status === 'claimed' && !sh.mine && <button className="ghost" onClick={() => waInvite(sh.shareToken, sh.amountPesewas)}>Remind</button>}
          {sh.status === 'paid' && <Check />}
        </div>
      </div>))}
    </div>
    <div className="split-progress"><span>{pes(paid)} of {pes(total)} settled</span><div className="bar"><i style={{ width: `${total ? Math.min(100, Math.round((paid / total) * 100)) : 0}%` }} /></div></div>
    {done && <div className="notice-card"><Check /><span>Every share is in — thank you.</span></div>}
  </section>
}

export function Tip({ s, dispatch }: any) { const share = s?.quote?.sharePesewas ?? s?.bill?.totalPesewas ?? 0; const chosen = s?.tipPercent ?? 10; return <section><Back dispatch={dispatch} to="pay" /><p className="eyebrow">A LITTLE EXTRA</p><h1>Leave a<br /><em>tip?</em></h1><p className="muted">100% goes directly to the {s?.restaurantName || ''} team.</p><div className="tip-grid">{[0, 5, 10, 15].map(n => <button className={n === chosen ? 'selected' : ''} key={n} onClick={() => dispatch({ type: 'patch-go', value: { tipPercent: n }, to: 'review' })}>{n === 0 ? 'No tip' : `${n}%`}<small>{n ? pes(Math.round(share * n / 100)) : ''}</small></button>)}</div><Action onClick={() => dispatch({ type: 'patch-go', value: { tipPercent: chosen }, to: 'review' })}>Review payment</Action></section> }

export function Review({ s, dispatch }: any) { const q = s?.quote; return <section><Back dispatch={dispatch} to="tip" /><p className="eyebrow">REVIEW PAYMENT</p><h1>Ready when<br /><em>you are.</em></h1><div className="summary-card"><div><span>Bill</span><b>{pes(q?.sharePesewas)}</b></div><div><span>Tip · {s?.tipPercent ?? 10}%</span><b>{pes(q?.tipPesewas)}</b></div><div className="grand-total"><span>Total</span><b>{pes(q?.grandTotalPesewas)}</b></div></div><Action onClick={() => dispatch(go('method'))}>Choose payment method</Action></section> }

export function Method({ s, dispatch }: any) { return <section><Back dispatch={dispatch} to="review" /><p className="eyebrow">PAYMENT METHOD</p><h1>Almost<br /><em>there.</em></h1><div className="summary-line"><span>Total</span><b>{pes(s?.quote?.grandTotalPesewas)}</b></div><button className="choice selected"><span className="choice-icon momo">M</span><span><b>Mobile Money</b><small>MTN MoMo, Telecel, AirtelTigo</small></span><Check /></button><button className="choice" onClick={() => dispatch({ type: 'patch-go', value: { method: 'card' }, to: 'processing' })}><span className="choice-icon"><CreditCard /></span><span><b>Bank card</b><small>Visa, Mastercard</small></span><ChevronRight /></button><Action onClick={() => dispatch({ type: 'patch-go', value: { method: 'momo' }, to: 'momo' })}>Continue</Action></section> }

export function Momo({ dispatch, error = false }: any) { const [number, setNumber] = useState(''); return <section><Back dispatch={dispatch} to="method" /><p className="eyebrow">MOBILE MONEY · TRANSACTION ONLY</p><h1>Enter your<br /><em>number.</em></h1><p className="muted">This number is only used to send the payment prompt. We will not save it.</p>{error && <div className="error"><X />Payment didn&apos;t go through. Check your balance and try again.<div className="error-actions"><button onClick={() => dispatch(go('authorise'))}>Retry payment</button><button onClick={() => dispatch(go('method'))}>Change method</button></div></div>}<label className="field-label">Mobile number<input value={number} onChange={e => setNumber(e.target.value)} placeholder="024 000 0000" inputMode="tel" /></label><Action onClick={() => dispatch(number ? { type: 'patch-go', value: { momoNumber: number, method: 'momo' }, to: 'authorise' } : { type: 'error' })}>Continue</Action></section> }

export function PaymentOtp({ dispatch }: any) { const [otp, setOtp] = useState(''); return <section><Back dispatch={dispatch} to="method" /><p className="eyebrow">CARD VERIFICATION</p><h1>Check your<br /><em>messages.</em></h1><p className="muted">Enter the one-time code from your bank to continue. This is only for this payment.</p><input className="otp" value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" inputMode="numeric" aria-label="Payment verification code" /><Action onClick={() => dispatch({ type: 'pay-otp', value: { otp } })}>Verify payment</Action></section> }

export function Authorise({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="CHECK YOUR PHONE" title={'Approve the<br /><em>payment.</em>'} copy={`A prompt is waiting on your mobile money phone. Enter your PIN to approve ${pes(s?.quote?.grandTotalPesewas)}.`} icon="M"><Action onClick={() => dispatch(go('processing'))}>I&apos;ve approved it</Action><button className="text-link" onClick={() => dispatch(go('momo'))}>Use a different number</button></Center> }

export function Processing({ s }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="SECURE PAYMENT" title={'Making it<br /><em>official.</em>'} copy={s?.method === 'card' ? 'Confirming your payment with your bank...' : 'Confirming your payment with mobile money...'}><div className="loader large" /></Center> }

export function Success({ s, dispatch }: any) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(s?.phone ?? s?.momoNumber ?? '')
  return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="PAYMENT COMPLETE" title={'You&apos;re all<br /><em>settled.</em>'} copy={`Thanks for dining at ${s?.restaurantName || 'us'}. Your receipt is ready whenever you are.`} icon="✓">
    <Action onClick={() => dispatch(go('receipt-choice'))}>View receipt options</Action>
    {!open && <Action secondary onClick={() => setOpen(true)}>Send receipt to WhatsApp</Action>}
    {open && <>
      <label className="field-label">WhatsApp number<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="024 000 0000" inputMode="tel" /></label>
      {s?.waStatus === 'sending' && <div className="notice-card"><span>Sending…</span></div>}
      {s?.waStatus === 'sent' && <div className="notice-card"><span>Receipt sent to WhatsApp ✓</span></div>}
      {s?.waStatus === 'error' && <div className="error"><X />{s?.waError ?? 'We could not send your receipt.'}</div>}
      <Action onClick={() => dispatch({ type: 'whatsapp-receipt', value: { phone } })}>Send receipt</Action>
    </>}
  </Center>
}


export function DownloadReceiptButton({ s }: any) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | undefined>(undefined)
  const onClick = () => {
    if (busy) return
    setErr(undefined); setBusy(true)
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
    fetch('/api/public/receipt-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionToken: s?.sessionToken }) })
      .then((r) => r.json()).catch(() => null)
      .then((r) => {
        setBusy(false)
        if (r?.ok && r.url) { if (win) win.location.href = r.url; else if (typeof window !== 'undefined') window.location.href = r.url }
        else { try { win?.close() } catch { /* noop */ } setErr('Could not prepare the receipt. Please try again.') }
      })
  }
  return <><button className="outline-button" onClick={onClick} disabled={busy}>{busy ? 'Preparing receipt…' : 'Download / print receipt'}</button>{err && <p className="muted receipt-error">{err}</p>}</>
}

export function ReceiptChoice({ s, dispatch }: any) { return <section><p className="eyebrow">{(s?.restaurantName || '').toUpperCase()} · RECEIPT {s?.receiptNumber ?? '#2841'}</p><h1>Keep a little<br /><em>memory.</em></h1><div className="receipt-card"><div className="receipt-head"><span>{s?.restaurantName || ''}</span><b>PAID</b></div><p>Tuesday, 26 August 2026 · 9:16 PM</p><div className="grand-total"><span>Total paid</span><b>{money((s?.totalPaidPesewas ?? 38115) / 100)}</b></div></div><Action onClick={() => dispatch(go('phone'))}>Save receipt & earn rewards</Action><button className="outline-button" onClick={() => dispatch(go('guest-receipt'))}>Continue as guest</button><DownloadReceiptButton s={s} /></section> }

export function Phone({ s, dispatch }: any) { const [phone, setPhone] = useState(''); return <section><Back dispatch={dispatch} to="receipt-choice" /><p className="eyebrow">OPTIONAL · REWARDS</p><h1>Where should we<br /><em>send it?</em></h1><p className="muted">We&apos;ll send your receipt straight to this number on WhatsApp, and collect {s?.restaurantName || ''} rewards. No account or sign-in needed.</p><label className="field-label">Phone number<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="024 000 0000" inputMode="tel" /></label><Action onClick={() => dispatch({ type: 'otp-send', value: { phone } })}>Send receipt to WhatsApp</Action></section> }

export function OtpRewards({ dispatch }: any) { const [code, setCode] = useState(''); return <section><Back dispatch={dispatch} to="phone" /><p className="eyebrow">VERIFY YOUR NUMBER</p><h1>Check your<br /><em>messages.</em></h1><p className="muted">Enter the six-digit demo code sent to your phone.</p><input className="otp" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric" /><Action onClick={() => dispatch({ type: 'otp-verify', value: { code } })}>Verify number</Action></section> }

export function Name({ s, dispatch }: any) { const [name, setName] = useState(''); return <section><Back dispatch={dispatch} to="phone" /><p className="eyebrow">OPTIONAL</p><h1>One name,<br /><em>if you like.</em></h1><p className="muted">Personalise your next {s?.restaurantName || ''} visit. You can skip this.</p><label className="field-label">Your name<input value={name} onChange={e => setName(e.target.value)} placeholder="Ama" /></label><Action onClick={() => dispatch({ type: 'rewards-consent', value: { firstName: name } })}>Save rewards</Action><button className="outline-button" onClick={() => dispatch({ type: 'rewards-consent', value: {} })}>Skip for now</button></section> }

export function Rewards({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="REWARDS SAVED" title={'See you<br /><em>again.</em>'} copy={`Your receipt is saved and 120 ${s?.restaurantName || ''} points have been added.`} icon="★"><Action onClick={() => dispatch(go('feedback'))}>Share feedback</Action></Center> }

export function GuestReceipt({ s, dispatch }: any) { return <section><p className="eyebrow">GUEST RECEIPT · {s?.receiptNumber ?? '#2841'}</p><h1>All <em>done.</em></h1><div className="receipt-card"><div className="receipt-head"><span>{s?.restaurantName || ''}</span><b>PAID</b></div><p>Your receipt is available for this session.</p><div className="grand-total"><span>Total paid</span><b>{money((s?.totalPaidPesewas ?? 38115) / 100)}</b></div></div><DownloadReceiptButton s={s} /><Action onClick={() => dispatch(go('feedback'))}>Continue</Action></section> }

export function Feedback({ s, dispatch }: any) { return <section className="center-screen"><Heart className="heart" /><p className="eyebrow">ONE LAST THING</p><h1>How was your<br /><em>{s?.restaurantName || 'your'} moment?</em></h1><div className="stars">{[1,2,3,4,5].map(i => <button key={i} onClick={() => dispatch({ type: 'feedback', value: { rating: i } })}><Star /></button>)}</div><p className="muted">Tap a star to share how it felt.</p><button className="text-link" onClick={() => dispatch(go('complete'))}>Maybe later</button></section> }

export function ReviewHandoff({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="THANK YOU" title={'Would you tell<br /><em>Google too?</em>'} copy={`Thanks for your feedback. If you have a moment, a quick Google review helps other diners find ${s?.restaurantName || 'us'}. It opens in a new tab.`} icon="★"><Action onClick={() => { try { if (s?.reviewUrl) window.open(s.reviewUrl, '_blank', 'noopener') } catch {} dispatch(go('complete')) }}>Leave a Google review</Action><button className="text-link" onClick={() => dispatch(go('complete'))}>No thanks</button></Center> }

export function Complete({ s, dispatch }: any) { return <Center logoUrl={s?.logoUrl} alt={s?.restaurantName} eyebrow="THANK YOU" title={'Until the<br /><em>next one.</em>'} copy="Your feedback helps us make every table feel closer."><button className="demo-control" onClick={() => dispatch({ type: 'reset' })}><RotateCcw />Start again</button></Center> }

export function SplitShare({ s, dispatch }: any) { return <section><Back dispatch={dispatch} to="split" /><p className="eyebrow">YOUR SHARE</p><h1>That&apos;s <em>fair.</em></h1><div className="pay-total"><span>{s?.people ?? 2} people splitting</span><strong>{pes(s?.quote?.sharePesewas)}</strong></div><Action onClick={() => dispatch(go('tip'))}>Continue</Action></section> }

export function Handoff({ dispatch }: any) { return <div className="review-page"><header><p className="eyebrow">KLOWN PAY · UX HANDOFF</p><h1>Thirty-five screens.<br /><em>One closer table.</em></h1><p className="muted">A presentation-layer prototype for Claude implementation. Every state is simulated locally.</p></header><div className="handoff-grid"><section><h2>Flow map</h2><p>QR arrival → menu or bill → assistance → check → recommendation → split/full pay → MoMo → receipt → rewards → feedback.</p><div className="flow-lines">{['Journey A · No order yet','Journey B · Bill available','Post-payment · Rewards or guest'].map((x, i) => <button key={x} onClick={() => { window.location.hash = ''; dispatch(go(i === 0 ? 'empty' : i === 1 ? 'bill' : 'receipt-choice')) }}>{x}<ChevronRight /></button>)}</div></section><section><h2>Design system</h2><div className="token-row"><span className="token swatch-brand" />Ink / #181816</div><div className="token-row"><span className="token swatch-accent" />Kozo yellow / #F3C744</div><div className="token-row"><span className="token swatch-bg" />Warm paper / #F7F5F0</div><p className="handoff-copy">Typography uses a crisp sans for utility and an editorial serif italic for emotional moments. Actions are full-width, sticky in the mobile safe area, and limited to one primary CTA.</p></section></div><h2>Screen inventory</h2><div className="inventory">{screens.map(([id, name, section, entry, primary, next]) => <button key={id} onClick={() => { window.location.hash = ''; dispatch(go(id)) }}><span>{name}</span><small>{section} · {entry}</small><b>{primary} → {next}</b></button>)}</div></div> }

export function BillIssue({ s, dispatch }: any) { const reasons = ['An item looks wrong', 'I was charged twice', "This isn't our table's bill", 'Something else']; return <section><Back dispatch={dispatch} to="bill" /><p className="eyebrow">BILL SUPPORT</p><h1>What looks<br /><em>off?</em></h1><p className="muted">Tell us what to check and a {s?.restaurantName || ''} team member will come over. Your bill is never changed from your phone.</p><div className="sheet-options">{reasons.map((r) => <button key={r} onClick={() => dispatch({ type: 'dispute', note: r })}><Info /><span><b>{r}</b></span><ChevronRight /></button>)}</div></section> }

export const map: Record<string, any> = { connect: Connect, welcome: Welcome, empty: Empty, menu: Menu, category: Category, dish: Dish, waiter: Waiter, 'waiter-notified': WaiterNotified, 'waiting-bill': WaitingBill, 'bill-ready': (p: any) => <Bill {...p} ready />, bill: Bill, 'bill-issue': BillIssue, 'full-check': FullCheck, recommendation: Recommendation, pay: Pay, split: Split, 'split-share': (p: any) => <SplitShare {...p} />, 'split-lobby': (p: any) => <SplitLobby {...p} />, 'split-items': (p: any) => <SplitItems {...p} />, tip: Tip, review: Review, method: Method, momo: Momo, otp: PaymentOtp, authorise: Authorise, processing: Processing, 'payment-error': (p: any) => <Momo {...p} error />, success: Success, 'receipt-choice': ReceiptChoice, phone: Phone, 'otp-rewards': OtpRewards, name: Name, rewards: Rewards, 'guest-receipt': GuestReceipt, feedback: Feedback, 'review-handoff': ReviewHandoff, complete: Complete }

// Diner render for a published Menu Studio menu (themed). Display-only; bill/pay unchanged.
function StudioMenu({ s, dispatch }: any) {
  const sections = s?.menu?.sections ?? []
  const th = s?.menu?.theme || {}
  const t = {
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
  }
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null)
  const sec = sections.find((x: any) => x.id === active) ?? sections[0]
  const priceOf = (it: any) =>
    it?.price_display && String(it.price_display).trim() ? String(it.price_display).trim() : it?.price_pesewas != null ? pes(it.price_pesewas) : ''

  if (!sections.length) {
    return (
      <section>
        <header className="page-header"><div><p className="eyebrow">{(s?.restaurantName || '').toUpperCase()} · TABLE {s?.tableLabel ?? ''}</p><h1>Menu<br /><em>coming soon.</em></h1></div></header>
        <Action secondary onClick={() => dispatch(go('bill'))}>View live bill</Action>
      </section>
    )
  }

  return (
    <section className="studio-menu" style={{ background: t.colors.paper, color: t.colors.ink, fontFamily: t.fonts.body, margin: '-22px -20px 0', padding: '22px 20px', minHeight: 'calc(100dvh - 60px)' }}>
      <header className="page-header">
        <div>
          <p className="eyebrow" style={{ color: t.colors.accent }}>{(s?.restaurantName || '').toUpperCase()} · TABLE {s?.tableLabel ?? ''}</p>
          <h1 style={{ fontFamily: t.fonts.title, color: t.colors.heading }}>What are you<br /><em>in the mood for?</em></h1>
        </div>
        <button className="icon-button" style={{ borderColor: t.colors.accent }}><Search /></button>
      </header>
      <div className="tabs">
        {sections.map((x: any) => (
          <button key={x.id} className={x.id === sec?.id ? 'active' : ''} onClick={() => setActive(x.id)}
            style={x.id === sec?.id ? { color: t.colors.heading, borderBottomColor: t.colors.accent, fontFamily: t.fonts.item } : { fontFamily: t.fonts.item }}>{x.name}</button>
        ))}
      </div>
      <div className="menu-group">
        <div className="section-label" style={{ fontFamily: t.fonts.heading, color: t.colors.heading }}>{(sec?.name || '').toUpperCase()} <span>{(sec?.items ?? []).length} items</span></div>
        {(sec?.items ?? []).map((it: any) => (
          <div className="dish-row" key={it.id} style={{ opacity: it.sold_out || it.available === false ? 0.5 : 1, cursor: 'default' }}>
            {t.layout.item_photos !== 'none' && it.image_url && <img src={it.image_url} alt={it.name} onError={imgFallback} />}
            <span>
              <strong style={{ fontFamily: t.fonts.item, color: t.colors.ink }}>{it.name}{it.sold_out ? ' · Sold out' : ''}</strong>
              {it.description && <small style={{ fontFamily: t.fonts.body }}>{it.description}</small>}
            </span>
            <b style={{ color: t.colors.price, fontFamily: t.fonts.item }}>{priceOf(it)}</b>
          </div>
        ))}
      </div>
      <Action secondary onClick={() => dispatch(go('bill'))}>View live bill</Action>
    </section>
  )
}
