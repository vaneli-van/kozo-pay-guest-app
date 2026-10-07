import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { billTax, type BillTax } from '@/integrations/billing/tax'

// POS provider adapter. The mock reads the bill that a restaurant POS/order-management
// system has synced into Supabase. Swap MockPosProvider for a real adapter (Vend, Loyverse,
// a custom POS webhook sync, etc.) without changing any route or UI code.
export interface PosBillItem { name: string; qty: number; lineTotalPesewas: number }
export interface PosBill { id: string; status: string; items: PosBillItem[]; subtotalPesewas: number; serviceChargePesewas: number; totalPesewas: number; serverName?: string | null; tax: BillTax; tabLabel?: string | null }
export interface PosProvider { getActiveBillForTable(tableId: string): Promise<PosBill | null> }

export interface TableTab {
  billId: string; label: string | null; main: boolean; serverName: string | null
  itemCount: number; preview: string[]; totalPesewas: number; remainingPesewas: number; openedAt: string
}

// The bill a diner's session is on. A table can carry several bills at once (separate groups,
// each a named tab on the POS). The database decides (klown_session_bill_id): the tab the diner
// picked, or the table's only bill. Null + chooseTab when the table has several tabs and the
// diner has not picked theirs yet.
export async function getBillForSession(session: { id: string; table_id: string | null }): Promise<{ bill: PosBill | null; chooseTab: boolean; tabs: TableTab[] }> {
  if (!session.table_id) return { bill: null, chooseTab: false, tabs: [] }
  const [{ data: billId }, { data: tabsRaw }] = await Promise.all([
    supabaseAdmin.rpc('klown_session_bill_id' as any, { p_session_id: session.id } as any),
    supabaseAdmin.rpc('klown_table_tabs' as any, { p_table_id: session.table_id } as any),
  ])
  const tabs = ((tabsRaw as any) ?? []) as TableTab[]
  if (!billId) return { bill: null, chooseTab: tabs.length > 1, tabs }
  const bill = await getBillById(billId as unknown as string)
  return { bill, chooseTab: false, tabs }
}

export async function getBillById(billId: string): Promise<PosBill | null> {
  const [{ data: bill }, { data: items }] = await Promise.all([
    supabaseAdmin.from('bills').select('id,status,subtotal_pesewas,service_charge_pesewas,total_pesewas,server_name,tax_lines,tax_pesewas,tab_label').eq('id', billId).maybeSingle(),
    supabaseAdmin.from('bill_items').select('name,qty,line_total_pesewas').eq('bill_id', billId).order('sort'),
  ])
  if (!bill) return null
  return {
    id: bill.id, status: bill.status, serverName: bill.server_name ?? null, tabLabel: (bill as any).tab_label ?? null,
    subtotalPesewas: bill.subtotal_pesewas, serviceChargePesewas: bill.service_charge_pesewas, totalPesewas: bill.total_pesewas,
    tax: billTax(bill.subtotal_pesewas, bill as any),
    items: (items ?? []).map((i) => ({ name: i.name, qty: i.qty, lineTotalPesewas: i.line_total_pesewas })),
  }
}

export class MockPosProvider implements PosProvider {
  async getActiveBillForTable(tableId: string): Promise<PosBill | null> {
    const { data: bill } = await supabaseAdmin
      .from('bills').select('id,status,subtotal_pesewas,service_charge_pesewas,total_pesewas,server_name,tax_lines,tax_pesewas')
      .eq('table_id', tableId).in('status', ['open', 'ready']).order('opened_at', { ascending: false }).limit(1).maybeSingle()
    if (!bill) return null
    const { data: items } = await supabaseAdmin
      .from('bill_items').select('name,qty,line_total_pesewas').eq('bill_id', bill.id).order('sort')
    return {
      id: bill.id, status: bill.status, serverName: bill.server_name ?? null,
      subtotalPesewas: bill.subtotal_pesewas, serviceChargePesewas: bill.service_charge_pesewas, totalPesewas: bill.total_pesewas,
      tax: billTax(bill.subtotal_pesewas, bill as any),
      items: (items ?? []).map((i) => ({ name: i.name, qty: i.qty, lineTotalPesewas: i.line_total_pesewas })),
    }
  }
}

export const posProvider: PosProvider = new MockPosProvider()
