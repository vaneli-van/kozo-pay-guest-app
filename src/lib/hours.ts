// Opening-hours model: { mon: { open: "11:00", close: "23:00" } | null, ... } keyed by short weekday.
// A missing/null day = closed. close < open means the window runs past midnight.
export type DayHours = { open?: string; close?: string } | null
export type Hours = Record<string, DayHours>

const ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function inWindow(day: DayHours, ref: number, overnightTail = false): boolean {
  if (!day || !day.open || !day.close) return false
  const [oh, om] = String(day.open).split(':').map(Number)
  const [ch, cm] = String(day.close).split(':').map(Number)
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
    const yday = ORDER[(idx + 6) % 7]
    const open = inWindow(hours[wd], now) || inWindow(hours[yday], now, true)
    return { open }
  } catch {
    return null
  }
}
