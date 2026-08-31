// Read-only Odoo POS reader over JSON-RPC. Server-only (uses secrets from process.env).
// Never writes to Odoo. Credentials are provided as environment secrets:
//   ODOO_URL, ODOO_DB, ODOO_USERNAME (default "admin"), ODOO_API_KEY
function cfg() {
  return {
    url: process.env['ODOO_URL'],
    db: process.env['ODOO_DB'],
    user: process.env['ODOO_USERNAME'] || 'admin',
    key: process.env['ODOO_API_KEY'],
  };
}

export function odooConfigured(): boolean {
  const c = cfg();
  return !!(c.url && c.db && c.key);
}

async function rpc(service: string, method: string, args: unknown[]): Promise<any> {
  const c = cfg();
  const res = await fetch(`${c.url!.replace(/\/$/, '')}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Odoo RPC error: ${JSON.stringify(j.error)}`);
  return j.result;
}

let _uid: number | undefined;
async function uid(): Promise<number> {
  if (_uid) return _uid;
  const c = cfg();
  const u = await rpc('common', 'authenticate', [c.db, c.user, c.key, {}]);
  if (!u || typeof u !== 'number') throw new Error('Odoo authentication failed (check ODOO_DB / ODOO_USERNAME / ODOO_API_KEY)');
  _uid = u;
  return u;
}

// Read-only search_read. Never call a write method here.
export async function searchRead(model: string, domain: unknown[], fields: string[], limit = 0): Promise<any[]> {
  const c = cfg();
  const u = await uid();
  const kwargs: Record<string, unknown> = { fields };
  if (limit) kwargs['limit'] = limit;
  return (await rpc('object', 'execute_kw', [c.db, u, c.key, model, 'search_read', [domain], kwargs])) as any[];
}
