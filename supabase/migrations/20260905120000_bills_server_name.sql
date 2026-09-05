-- Personalised tip: carry the POS server/waiter name onto the live bill so the
-- diner app can address the tip prompt ("Leave a tip for Vera?"). Populated by
-- the Odoo sync from pos.order.employee_id (falls back to the cashier field).
alter table bills add column if not exists server_name text;
