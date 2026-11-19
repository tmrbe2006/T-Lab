import { randomBytes } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const goodId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const goodKey = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(v);
const uid = () => 'qc_' + randomBytes(16).toString('hex');
type LotReceipt = RowDataPacket & {
  id: string; lot_id: string; item_id: string; actor_id: string; quantity_milli: string | number;
  status: string; qc_status: string; expiry_date: string;
};
type Review = RowDataPacket & {
  id: string; receipt_id: string; reviewer_id: string; verdict: string; evidence: string;
  idempotency_key: string;
};

export class StockQcReviewStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async ensureTables(): Promise<void> {
    const db = await this.connect();
    try {
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_stock_qc_reviews (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY,' +
        'receipt_id VARCHAR(64) NOT NULL,' +
        'reviewer_id VARCHAR(64) NOT NULL,' +
        'verdict VARCHAR(16) NOT NULL,' +
        'evidence VARCHAR(500) NOT NULL,' +
        'idempotency_key VARCHAR(100) NOT NULL,' +
        'created_at DATETIME NOT NULL,' +
        'UNIQUE KEY uq_stock_qc_receipt (receipt_id),' +
        'UNIQUE KEY uq_stock_qc_key (idempotency_key)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
    } finally { await db.end(); }
  }

  async decide(receiptId: string, verdict: string, evidence: string, key: string, actor: ServerIdentity) {
    if (!goodId(receiptId) || !goodKey(key) ||
        !['pass', 'fail'].includes(verdict) ||
        typeof evidence !== 'string' || evidence.trim().length < 12 ||
        evidence.length > 500 || /[\u0000-\u001f]/.test(evidence)) {
      throw new Error('Invalid QC review input');
    }
    const db = await this.connect();
    try {
      await db.beginTransaction();
      try {
        // Lock item first: aligns with stock issue/receipt lock ordering.
        const [initial] = await db.execute<RowDataPacket[]>(
          'SELECT item_id FROM secure_stock_receipts WHERE id = ? LIMIT 1', [receiptId],
        );
        if (initial.length !== 1) throw new Error('Receipt not found');
        const itemId = String(initial[0].item_id);
        const [items] = await db.execute<RowDataPacket[]>(
          'SELECT id, active FROM inventory_items WHERE id = ? FOR UPDATE', [itemId],
        );
        if (items.length !== 1 || Number(items[0].active) !== 1) throw new Error('Item inactive');
        const [receipts] = await db.execute<LotReceipt[]>(
          'SELECT r.id, r.lot_id, r.item_id, r.actor_id, r.quantity_milli, ' +
          'l.status, l.qc_status, l.expiry_date ' +
          'FROM secure_stock_receipts r INNER JOIN inventory_lots l ON l.id = r.lot_id ' +
          'WHERE r.id = ? FOR UPDATE', [receiptId],
        );
        const receipt = receipts[0];
        if (!receipt || receipt.item_id !== itemId) throw new Error('Receipt changed');
        if (receipt.actor_id === actor.userId) throw new Error('Independent reviewer required');

        const [existing] = await db.execute<Review[]>(
          'SELECT id, receipt_id, reviewer_id, verdict, evidence, idempotency_key ' +
          'FROM secure_stock_qc_reviews WHERE receipt_id = ? LIMIT 1', [receiptId],
        );
        if (existing.length) {
          const saved = existing[0];
          if (saved.idempotency_key !== key || saved.reviewer_id !== actor.userId ||
              saved.verdict !== verdict || saved.evidence !== evidence) {
            throw new Error('A different QC decision already exists');
          }
          await db.commit();
          return { reviewId: saved.id, receiptId, verdict: saved.verdict,
            releasedForUse: false as const, replayed: true };
        }
        if (receipt.status !== 'quarantine' || receipt.qc_status !== 'pending') {
          throw new Error('Lot not pending independent QC');
        }
        const expires = String(receipt.expiry_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) ||
            expires <= new Date().toISOString().slice(0, 10)) {
          throw new Error('Lot expired or expiry invalid');
        }
        const reviewId = uid();
        await db.execute(
          'INSERT INTO secure_stock_qc_reviews ' +
          '(id, receipt_id, reviewer_id, verdict, evidence, idempotency_key, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [reviewId, receiptId, actor.userId, verdict, evidence.trim(), key],
        );
        // PASS is a documented QC review ONLY; status stays quarantined.
        // A FAIL rejects the lot permanently until a separate correction workflow.
        if (verdict === 'fail') {
          await db.execute(
            "UPDATE inventory_lots SET status = 'rejected', qc_status = 'rejected' " +
            'WHERE id = ? AND status = ? AND qc_status = ?',
            [receipt.lot_id, 'quarantine', 'pending'],
          );
        } else {
          await db.execute(
            "UPDATE inventory_lots SET qc_status = 'reviewed_pass' " +
            'WHERE id = ? AND status = ? AND qc_status = ?',
            [receipt.lot_id, 'quarantine', 'pending'],
          );
        }
        await db.commit();
        return { reviewId, receiptId, verdict, releasedForUse: false as const, replayed: false };
      } catch (error) { await db.rollback(); throw error; }
    } finally { await db.end(); }
  }
}

export function installStockQcReviewRoutes(
  app: Express, store: StockQcReviewStore, grants: ServerPermissionStore,
  identity: IdentityResolver,
): void {
  app.post('/api/v2/inventory/qc/reviews', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await grants.can(actor.role, 'inventoryQc', 'add'))) {
        return res.status(403).json({ ok: false });
      }
      const body = req.body || {};
      if (Object.keys(body).sort().join(',') !== 'evidence,idempotencyKey,receiptId,verdict') {
        return res.status(422).json({ ok: false });
      }
      const outcome = await store.decide(
        body.receiptId, body.verdict, body.evidence, body.idempotencyKey, actor,
      );
      return res.status(outcome.replayed ? 200 : 201).json({ ok: true, ...outcome });
    } catch {
      return res.status(409).json({ ok: false, error: 'QC review blocked by independent-actor, status or duplicate validation' });
    }
  });
}
