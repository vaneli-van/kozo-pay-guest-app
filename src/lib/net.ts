// Resilient POST helpers for the diner app.
//
// The plain POST used elsewhere swallows every failure to `null`. For the
// payment path that is dangerous: a dropped connection during an *idempotent*
// init should be retried (the server dedupes on the idempotency key, so a retry
// never double-charges), not shown to the diner as "payment failed". These
// helpers separate a real HTTP response (even ok:false) from a transport
// failure so the UI can react correctly.

export class NetworkError extends Error {
  constructor(msg = 'network') {
    super(msg)
    this.name = 'NetworkError'
  }
}

// POST JSON with a timeout. Resolves with parsed JSON for ANY HTTP response
// (the API always returns a JSON body, even on ok:false). Throws NetworkError
// only when the request never produced a usable response (offline, DNS, reset,
// timeout, or a non-JSON edge/proxy error page).
export async function postJSON(url: string, body: unknown, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch {
    throw new NetworkError()
  } finally {
    clearTimeout(t)
  }
  try {
    return await res.json()
  } catch {
    throw new NetworkError('bad_response')
  }
}

// Retry on NetworkError with linear backoff. Safe ONLY for idempotent requests
// (e.g. payment-init, which dedupes on its idempotency key).
export async function postResilient(
  url: string,
  body: unknown,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<any> {
  const retries = opts.retries ?? 3
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await postJSON(url, body, opts.timeoutMs)
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise((r) => setTimeout(r, 800 * (i + 1)))
    }
  }
  throw lastErr
}
