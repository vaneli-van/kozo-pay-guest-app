import { test, expect } from "@playwright/test";
import { planTableMoves, type MoveBill } from "../../src/integrations/pos/table-moves";

// A waiter moves an open order to another table. The Klown bill (with any payments, split and
// diners on it) must follow the order, never be voided and recreated for the full amount.

const T3 = "t3", T7 = "t7", T9 = "t9";
const bill = (id: string, table: string, tab: string, orders: number[], lines: number[] = []): MoveBill =>
  ({ id, table_id: table, tab_key: tab, odoo_order_ids: orders, odoo_line_ids: lines });
const keyed = (entries: [string, number[]][]) => new Map(entries.map(([k, ids]) => [k, ids.map((id) => ({ id }))]));
const linesOf = (entries: [number, number[]][]) => new Map(entries.map(([o, ids]) => [o, ids.map((id) => ({ id }))]));
const plan = (liveBills: MoveBill[], ordersByKey: Map<string, { id: number }[]>, lines = new Map(), pending: string[] = []) =>
  planTableMoves({ liveBills, ordersByKey, linesByOrder: lines, pendingBillIds: new Set(pending) });

test.describe("planTableMoves", () => {
  test("nothing moved: no actions", () => {
    const p = plan([bill("A", T3, "", [101])], keyed([[`${T3}|`, [101]]]));
    expect(p).toEqual({ rehome: [], merge: [], hold: [] });
  });

  test("order moved to a free table: the same bill moves with it", () => {
    const p = plan([bill("A", T3, "", [101])], keyed([[`${T7}|`, [101]]]));
    expect(p.rehome).toEqual([{ billId: "A", key: `${T7}|`, tableId: T7, tabKey: "" }]);
    expect(p.merge).toEqual([]);
  });

  test("moved as a separate bill in a guest's name: the bill moves onto that tab", () => {
    const p = plan([bill("A", T3, "", [101]), bill("B", T9, "", [202])],
      keyed([[`${T9}|`, [202]], [`${T9}|name:ama`, [101]]]));
    expect(p.rehome).toEqual([{ billId: "A", key: `${T9}|name:ama`, tableId: T9, tabKey: "name:ama" }]);
    expect(p.merge).toEqual([]);
  });

  test("a named bill moved to a free table keeps its tab", () => {
    const p = plan([bill("A", T3, "name:ama", [101])], keyed([[`${T7}|name:ama`, [101]]]));
    expect(p.rehome[0]).toMatchObject({ billId: "A", tableId: T7, tabKey: "name:ama" });
  });

  test("merged at the POS (order cancelled, its lines now in the other order): folds into that table's bill", () => {
    const p = plan([bill("A", T7, "", [101], [11, 12]), bill("B", T9, "", [202], [21])],
      keyed([[`${T9}|`, [202]]]), linesOf([[202, [21, 11, 12]]]));
    expect(p.merge).toEqual([{ fromBillId: "A", intoBillId: "B", key: `${T9}|` }]);
    expect(p.rehome).toEqual([]);
  });

  test("both orders left on one table (not merged at the POS): still one bill, the one already there", () => {
    const p = plan([bill("A", T7, "", [101]), bill("B", T9, "", [202])], keyed([[`${T9}|`, [202, 101]]]));
    expect(p.merge).toEqual([{ fromBillId: "A", intoBillId: "B", key: `${T9}|` }]);
  });

  test("two tables moved onto one free table: the older bill moves, the other folds into it", () => {
    const p = plan([bill("A", T3, "", [101]), bill("B", T7, "", [202])], keyed([[`${T9}|`, [101, 202]]]));
    expect(p.rehome).toEqual([{ billId: "A", key: `${T9}|`, tableId: T9, tabKey: "" }]);
    expect(p.merge).toEqual([{ fromBillId: "B", intoBillId: "A", key: `${T9}|` }]);
  });

  test("a MoMo prompt still waiting on the bill: hold it for a cycle, don't move money mid-payment", () => {
    const p = plan([bill("A", T3, "", [101]), bill("B", T9, "", [202])], keyed([[`${T9}|`, [202, 101]]]), new Map(), ["A"]);
    expect(p.hold).toEqual(["A"]);
    expect(p.merge).toEqual([]);
  });

  test("order closed at the POS (gone everywhere): not a move, the sync closes the bill as before", () => {
    const p = plan([bill("A", T3, "", [101], [11])], keyed([[`${T9}|`, [202]]]), linesOf([[202, [21]]]));
    expect(p).toEqual({ rehome: [], merge: [], hold: [] });
  });

  test("legacy bill with only odoo_order_id (no list) still follows", () => {
    const legacy: MoveBill = { id: "A", table_id: T3, tab_key: null, odoo_order_id: 101, odoo_order_ids: null };
    const p = plan([legacy], keyed([[`${T7}|`, [101]]]));
    expect(p.rehome[0]).toMatchObject({ billId: "A", tableId: T7 });
  });
});
