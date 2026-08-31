// Read-only Odoo POS reader over JSON-RPC. Server-only.
// Credentials are passed per call (loaded from the DB, admin-managed) — nothing here reads env.
export type OdooConfig = { base_url: string; db: string; username: string; api_key: string }

async function rpc(cfg: OdooConfig, service: string, method: string, args: unknown[]): Promise<any> {
  const res = await fetch(`${cfg.base_url.replace(/\/$/, '')}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const j = await res.json()
  if (j.error) throw new Error(`Odoo RPC error: ${JSON.stringify(j.error)}`)
  return j.result
}

const uidCache = new Map<string, number>()
async function uid(cfg: OdooConfig): Promise<number> {
  const k = `${cfg.base_url}|${cfg.db}|${cfg.username}`
  const cached = uidCache.get(k)
  if (cached) return cached
  const u = await rpc(cfg, 'common', 'authenticate', [cfg.db, cfg.username, cfg.api_key, {}])
  if (!u || typeof u !== 'number') throw new Error('Odoo authentication failed (check URL / database / API key)')
  uidCache.set(k, u)
  return u
}

// Read-only search_read. Never call a write method here.
export async function searchRead(cfg: OdooConfig, model: string, domain: unknown[], fields: string[], limit = 0): Promise<any[]> {
  const u = await uid(cfg)
  const kwargs: Record<string, unknown> = { fields }
  if (limit) kwargs['limit'] = limit
  return (await rpc(cfg, 'object', 'execute_kw', [cfg.db, u, cfg.api_key, model, 'search_read', [domain], kwargs])) as any[]
}

// Lightweight connectivity test used by the admin "Test connection" action.
export async function testConnection(cfg: OdooConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const u = await uid(cfg)
    return { ok: true, message: `Connected (uid ${u})` }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}
