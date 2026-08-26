import { useEffect, useState } from 'react'
import App from './App'

// The diner experience is client-only (uses window, sessionStorage, history).
// Render nothing on the server / first paint, then mount the full app.
export default function DiningApp() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <App />
}
