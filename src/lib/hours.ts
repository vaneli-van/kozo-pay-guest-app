// Opening-hours model: { mon: { open: "11:00", close: "23:00" } | null, ... } keyed by short weekday.
// A missing/null day = closed. close < open means the window runs past midnight.
export type DayHours = { open?: string; close?: string } | null
export type Hours = Record<string, DayHours>

const ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function inWindow(day: DayHours, ref: number, overnightTail = false): boolean {
  if (!day || !day.open || !day.close) return false
  const openParts = String(day.open).split(':')
  const closeParts = String(day.close).split(':')
  if (openParts.length < 2 || closeParts.length < 2) return false
  const oh = Number(openParts[0])
  const om = Number(openParts[1])
  const ch = Number(closeParts[0])
  const cm = Number(closeParts[1])
  if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return false
  const o = oh * 60 + om
  const c = ch * 60 + cm
  if (c > o) return overnightTail ? false : ref >= o && ref < c
  // overnight window (e.g. 18:00 -> 02:00)
  return overnightTail ? ref < c : ref >= o
}

// Returns whether the venue is open now in Africa/Accra (UTC+0, no DST), or null if hours are unknown.
export function openState(hours: any): { open: boolean } | null {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours) || Object.keys(hours).length === 0) return null
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Accra',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const wd = (parts.find((p) => p.type === 'weekday')?.value || '').toLowerCase()
    const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
    const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
    const now = (hh % 24) * 60 + mm
    const idx = ORDER.indexOf(wd)
    if (idx < 0) return null
    const yday = ORDER[(idx + 6) % 7]!
    const open = inWindow(hours[wd] ?? null, now) || inWindow(hours[yday] ?? null, now, true)
    return { open }
  } catch {
    return null
  }
}

// A short human summary of opening hours for the welcome screen, or null if unknown.
export function hoursLine(hours: any): string | null {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return null
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const has = days.filter((d) => hours[d] && hours[d].open && hours[d].close)
  if (!has.length) return null
  const to12 = (t: string) => {
    const parts = String(t).split(':')
    if (parts.length < 2) return t
    const H = Number(parts[0])
    const M = Number(parts[1])
    const ap = H < 12 ? 'am' : 'pm'
    const h = (H % 12) || 12
    return `${h}${M ? ':' + String(M).padStart(2, '0') : ''}${ap}`
  }
  const is24 = days.every((d) => hours[d] && hours[d].open === '00:00' && ['23:59', '00:00', '24:00'].includes(hours[d].close))
  if (is24) return 'Open 24 hours, daily'
  const norm = (d: string) => (hours[d] && hours[d].open && hours[d].close ? `${hours[d].open}-${hours[d].close}` : 'x')
  const allSame = norm('mon') !== 'x' && days.every((d) => norm(d) === norm('mon'))
  if (allSame) return `Open daily ${to12(hours.mon.open)}–${to12(hours.mon.close)}`
  return null
}
