import { supabaseAdmin } from '@/integrations/supabase/client.server'

// POS provider adapter. The mock reads the bill that a restaurant POS/order-management
// system has synced into Supabase. Swap MockPosProvider for a real adapter (Vend, Loyverse,
// a custom POS webhook sync, etc.) without changing any route or UI code.
export interface PosBillItem { name: string; qty: number; lineTotalPesewas: number }
export interface PosBill { id: string; status: string; items: PosBillItem[]; subtotalPesewas: number; serviceChargePesewas: number; totalPesewas: number }
export interface PosProvider { getActiveBillForTable(tableId: string): Promise<PosBill | null> }

export class MockPosProvider implements PosProvider {
  async getActiveBillForTable(tableId: string): Promise<PosBill | null> {
    const { data: bill } = await supabaseAdmin
      .from('bills').select('id,status,subtotal_pesewas,service_charge_pesewas,total_pesewas')
      .eq('table_id', tableId).in('status', ['open', 'ready']).order('opened_at', { ascending: false }).maybeSingle()
    if (!bill) return null
    const { data: items } = await supabaseAdmin
      .from('bill_items').select('name,qty,line_total_pesewas').eq('bill_id', bill.id).order('sort')
    return {
      id: bill.id, status: bill.status,
      subtotalPesewas: bill.subtotal_pesewas, serviceChargePesewas: bill.service_charge_pesewas, totalPesewas: bill.total_pesewas,
      items: (items ?? []).map((i) => ({ name: i.name, qty: i.qty, lineTotalPesewas: i.line_total_pesewas })),
    }
  }
}

export const posProvider: PosProvider = new MockPosProvider()
