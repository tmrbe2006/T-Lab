
import { randomBytes } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const validId = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
const validKey = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(x);
const token = () => randomBytes(16).toString('hex');

function toMilli(value: unknown, positive = true): number {
  const raw = String(value);
  if (!/^(0|[1-9]\d{0,7})(?:\.\d{1,3})?$/.test(raw)) throw new Error('Invalid stock quantity');
  const parts = raw.split('.');
  const milli = Number(parts[0]) * 1000 + Number(((parts[1] || '') + '000').slice(0, 3));
  if (!Number.isSafeInteger(milli) || (positive ? milli < 1 : milli < 0)) throw new Error('Invalid quantity');
  return milli;
}
function asDecimal(milli: number): string {
  return String(Math.floor(milli / 1000)) + '.' + String(milli % 1000).padStart(3, '0');
}

interface ItemRow extends RowDataPacket { id: string; active: number; current_stock: string }
interface LotRow extends RowDataPacket {
  id: string; item_id: string; expiry_date: string; remaining_qty: string;
  status: string; qc_status: string;
}
interface OpRow extends RowDataPacket {
  movement_id: string; item_id: string; lot_id: string;
  quantity_milli: string | number; actor_id: string;
}

export class SafeInventoryStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async ensureTables(): Promise<void> {
    const conn = await this.connect();
    try {
      await conn.query('CREATE TABLE IF NOT EXISTS secure_stock_operations (' +
        'idempotency_key VARCHAR(100) NOT NULL PRIMARY KEY,' +
        'movement_id VARCHAR(64) NOT NULL,' +
        'item_id VARCHAR(64) NOT NULL,' +
        'lot_id VARCHAR(64) NOT NULL,' +
        'quantity_milli BIGINT NOT NULL,' +
        'actor_id VARCHAR(64) NOT NULL,' +
        'created_at DATETIME NOT NULL,' +
        'UNIQUE KEY uq_stock_movement (movement_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci');
    } finally { await conn.end(); }
  }

  async issue(itemId: string, lotId: string, quantity: unknown, key: string, actor: ServerIdentity) {
    if (!validId(itemId) || !validId(lotId) || !validKey(key)) throw new Error('Invalid stock identifiers');
    const qty = toMilli(quantity);
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        // Item lock serializes consumption across lots by concurrent operators.
        const [items] = await conn.execute<ItemRow[]>(
          'SELECT id, active, current_stock FROM inventory_items WHERE id = ? FOR UPDATE', [itemId]);
        if (!items.length || Number(items[0].active) !== 1) throw new Error('Inactive stock item');

        const [prior] = await conn.execute<OpRow[]>(
          'SELECT movement_id, item_id, lot_id, quantity_milli, actor_id FROM secure_stock_operations WHERE idempotency_key = ? LIMIT 1',
          [key]);
        if (prior.length) {
          if (prior[0].item_id !== itemId || prior[0].lot_id !== lotId ||
              Number(prior[0].quantity_milli) !== qty || prior[0].actor_id !== actor.userId) {
            throw new Error('Idempotency key mismatch');
          }
          await conn.commit();
          return { movementId: prior[0].movement_id, replayed: true, quantity: asDecimal(qty) };
        }

        const [lots] = await conn.execute<LotRow[]>(
          'SELECT id, item_id, expiry_date, remaining_qty, status, qc_status FROM inventory_lots WHERE id = ? FOR UPDATE',
          [lotId]);
        const lot = lots[0];
        if (!lot || lot.item_id !== itemId) throw new Error('Lot not found');
        const today = new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(lot.expiry_date) || lot.expiry_date < today) {
          throw new Error('Lot expired or missing expiry');
        }
        if (!['approved','released'].includes(lot.qc_status) ||
            !['active','available'].includes(lot.status)) throw new Error('Lot not QC released');

        const lotBalance = toMilli(lot.remaining_qty, false);
        const itemBalance = toMilli(items[0].current_stock, false);
        if (lotBalance < qty || itemBalance < qty) throw new Error('Insufficient stock');

        // Conservative FEFO: reject later batch while earlier eligible lot
        // can satisfy the requested quantity.
        const [earlier] = await conn.execute<RowDataPacket[]>(
          'SELECT id FROM inventory_lots WHERE item_id = ? AND id <> ? ' +
          "AND status IN ('active','available') AND qc_status IN ('approved','released') " +
          'AND expiry_date >= ? AND expiry_date < ? AND remaining_qty >= ? ' +
          'ORDER BY expiry_date ASC, id ASC LIMIT 1',
          [itemId, lotId, today, lot.expiry_date, asDecimal(qty)]);
        if (earlier.length) throw new Error('Use earlier-expiry available batch');

        const movementId = 'stock_' + token();
        const nextLot = asDecimal(lotBalance - qty);
        const nextItem = asDecimal(itemBalance - qty);
        await conn.execute('UPDATE inventory_lots SET remaining_qty = ? WHERE id = ?', [nextLot, lotId]);
        await conn.execute('UPDATE inventory_items SET current_stock = ? WHERE id = ?', [nextItem, itemId]);
        await conn.execute(
          'INSERT INTO stock_movements (id, movement_number, type, item_id, lot_id, quantity, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [movementId, 'SM-' + movementId.slice(-12).toUpperCase(), 'issue',
            itemId, lotId, asDecimal(qty), today]);
        await conn.execute(
          'INSERT INTO secure_stock_operations (idempotency_key, movement_id, item_id, lot_id, quantity_milli, actor_id, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [key, movementId, itemId, lotId, qty, actor.userId]);
        await conn.commit();
        return { movementId, replayed: false, quantity: asDecimal(qty),
          remainingLot: nextLot, remainingItem: nextItem };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }
}

export function installSafeInventoryRoutes(
  app: Express, store: SafeInventoryStore,
  permissions: ServerPermissionStore, identity: IdentityResolver
): void {
  app.post('/api/v2/inventory/issue', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await permissions.can(actor.role, 'inventoryMovements', 'add'))) {
        return res.status(403).json({ ok: false, error: 'Inventory permission denied' });
      }
      const body = req.body || {};
      if (Object.keys(body).sort().join(',') !== 'idempotencyKey,itemId,lotId,quantity') {
        return res.status(422).json({ ok: false, error: 'Unexpected fields' });
      }
      const outcome = await store.issue(body.itemId, body.lotId, body.quantity, body.idempotencyKey, actor);
      return res.status(outcome.replayed ? 200 : 201).json({ ok: true, ...outcome });
    } catch {
      return res.status(409).json({ ok: false, error: 'Stock issue failed FEFO, QC or quantity check' });
    }
  });
}
