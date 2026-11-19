import { randomBytes } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const validId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(x);
const validKey = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(x);
const validLot = (x: unknown): x is string => typeof x === 'string' &&
  x.length >= 1 && x.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(x);
const guid = () => randomBytes(16).toString('hex');
function milli(value: unknown): number {
  const raw = String(value);
  if (!/^(0|[1-9]\d{0,7})(?:\.\d{1,3})?$/.test(raw)) throw new Error('Invalid quantity');
  const [whole, part = ''] = raw.split('.');
  const number = Number(whole) * 1000 + Number((part + '000').slice(0,3));
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid quantity');
  return number;
}
const decimal = (value: number) => String(Math.floor(value / 1000)) + '.' + String(value % 1000).padStart(3, '0');
type ReceiptRow = RowDataPacket & {
  id: string; item_id: string; lot_id: string; lot_number: string; quantity_milli: number | string;
  actor_id: string;
};

export class StockReceiptStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTable() {
    const conn = await this.connect();
    try {
      await conn.query(
        'CREATE TABLE IF NOT EXISTS secure_stock_receipts (' +
          'id VARCHAR(64) NOT NULL PRIMARY KEY,' +
          'idempotency_key VARCHAR(100) NOT NULL,' +
          'item_id VARCHAR(64) NOT NULL,' +
          'lot_id VARCHAR(64) NOT NULL,' +
          'lot_number VARCHAR(64) NOT NULL,' +
          'quantity_milli BIGINT NOT NULL,' +
          'actor_id VARCHAR(64) NOT NULL,' +
          'created_at DATETIME NOT NULL,' +
          'UNIQUE KEY uq_receipt_idempotency (idempotency_key),' +
          'UNIQUE KEY uq_receipt_lot (item_id, lot_number),' +
          'UNIQUE KEY uq_receipt_lotid (lot_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
    } finally { await conn.end(); }
  }

  async receive(itemId: string, lotNumber: string, quantity: unknown, expires: string,
    key: string, actor: ServerIdentity) {
    if (!validId(itemId) || !validLot(lotNumber) || !validKey(key)) throw new Error('Invalid identifiers');
    const qty = milli(quantity);
    if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires) ||
        !Number.isFinite(Date.parse(expires + 'T00:00:00Z')) ||
        new Date(expires + 'T00:00:00Z').toISOString().slice(0,10) !== expires ||
        expires <= new Date().toISOString().slice(0,10)) {
      throw new Error('Missing, invalid or expired date');
    }
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        const [items] = await conn.execute<RowDataPacket[]>(
          'SELECT id, active FROM inventory_items WHERE id = ? FOR UPDATE', [itemId],
        );
        if (items.length !== 1 || Number(items[0].active) !== 1) throw new Error('Inactive stock item');

        const [previous] = await conn.execute<ReceiptRow[]>(
          'SELECT id, item_id, lot_id, lot_number, quantity_milli, actor_id FROM secure_stock_receipts WHERE idempotency_key = ?',
          [key],
        );
        if (previous.length) {
          const row = previous[0];
          if (row.item_id !== itemId || row.lot_number !== lotNumber ||
            Number(row.quantity_milli) !== qty || row.actor_id !== actor.userId) {
            throw new Error('Idempotency mismatch');
          }
          const [lots] = await conn.execute<RowDataPacket[]>(
            'SELECT expiry_date FROM inventory_lots WHERE id = ?', [row.lot_id],
          );
          if (String(lots[0]?.expiry_date) !== expires) throw new Error('Idempotency expiry mismatch');
          await conn.commit();
          return { receiptId: row.id, lotId: row.lot_id, replayed: true, status: 'quarantined' as const };
        }

        const [priorLots] = await conn.execute<RowDataPacket[]>(
          'SELECT id FROM inventory_lots WHERE item_id = ? AND lot_number = ? LIMIT 1',
          [itemId, lotNumber],
        );
        if (priorLots.length) throw new Error('Existing lot cannot be silently merged');

        const lotId = 'lot_' + guid(), receiptId = 'receipt_' + guid();
        // Quarantined stock is intentionally NOT available to be issued.
        // Independent QC release requires a separately validated workflow.
        await conn.execute(
          'INSERT INTO inventory_lots (id, lot_number, item_id, expiry_date, initial_qty, remaining_qty, unit_cost, status, qc_status) ' +
          'VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)',
          [lotId, lotNumber, itemId, expires, decimal(qty), 'quarantine', 'pending'],
        );
        await conn.execute(
          'INSERT INTO secure_stock_receipts (id, idempotency_key, item_id, lot_id, lot_number, quantity_milli, actor_id, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
          [receiptId, key, itemId, lotId, lotNumber, qty, actor.userId],
        );
        await conn.commit();
        return { receiptId, lotId, replayed: false, status: 'quarantined' as const, quantity: decimal(qty) };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }
}

export function installStockReceiptRoutes(
  app: Express, store: StockReceiptStore, grants: ServerPermissionStore, identity: IdentityResolver
): void {
  app.post('/api/v2/inventory/receipts/quarantine', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await grants.can(actor.role, 'inventoryReceipts', 'add'))) {
        return res.status(403).json({ ok: false, error: 'Stock receipt denied' });
      }
      const body = req.body || {};
      if (Object.keys(body).sort().join(',') !== 'expiryDate,idempotencyKey,itemId,lotNumber,quantity') {
        return res.status(422).json({ ok: false, error: 'Unexpected receipt fields' });
      }
      const result = await store.receive(body.itemId, body.lotNumber, body.quantity,
        body.expiryDate, body.idempotencyKey, actor);
      return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch {
      return res.status(409).json({ ok: false, error: 'Quarantined receipt refused by validation or duplicate checks' });
    }
  });
  // No QC release, supplier payable, purchase invoice, or available-stock credit.
}
