import { createHash, randomBytes } from 'node:crypto';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const validKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(key);
const token = () => randomBytes(16).toString('hex');

type QuoteRow = RowDataPacket & {
  id: string; request_id: string; patient_id: string;
  amount_minor: string | number; version: number; created_by: string;
  request_version: number; content_digest: string;
};

type LineRow = RowDataPacket & { test_id: string; price: number | string };

const minorUnits = (price: string | number): number => {
  const raw = String(price);
  if (!/^(0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) throw new Error('Invalid currency amount');
  const [whole, fraction = ''] = raw.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
};

export class InvoiceDraftStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async ensureTables(): Promise<void> {
    const conn = await this.connect();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS \`secure_invoice_drafts\` (
        \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`request_id\` VARCHAR(64) NOT NULL,
        \`patient_id\` VARCHAR(64) NOT NULL,
        \`idempotency_key\` VARCHAR(100) NOT NULL,
        \`request_version\` INT NOT NULL,
        \`content_digest\` CHAR(64) NOT NULL,
        \`amount_minor\` BIGINT NOT NULL,
        \`version\` INT NOT NULL DEFAULT 1,
        \`created_by\` VARCHAR(64) NOT NULL,
        \`created_at\` DATETIME NOT NULL,
        UNIQUE KEY \`uq_invoice_draft_idempotency\` (\`idempotency_key\`),
        INDEX \`idx_invoice_draft_request\` (\`request_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`);
    } finally { await conn.end(); }
  }

  async prepare(requestId: string, requestVersion: number, key: string, actor: ServerIdentity) {
    if (!validId(requestId) || !Number.isInteger(requestVersion) || requestVersion < 1 ||
        !validKey(key)) throw new Error('Invalid draft request or idempotency key');
    const conn = await this.connect();
    try {
      await conn.beginTransaction();
      try {
        // Same request row lock serializes financial calculations with sample/status changes.
        const [requests] = await conn.execute<RowDataPacket[]>(
          'SELECT \`id\`, \`patient_id\`, \`status\` FROM \`lab_requests\` WHERE \`id\` = ? FOR UPDATE',
          [requestId],
        );
        if (!requests[0] || !['awaiting_sample', 'sample_received', 'in_analysis', 'awaiting_approval', 'approved'].includes(String(requests[0].status))) {
          throw new Error('Request unavailable for quotation');
        }
        const [versionRows] = await conn.execute<RowDataPacket[]>(
          'SELECT \`version\` FROM \`secure_record_versions\` WHERE \`resource\` = ? AND \`record_id\` = ? FOR UPDATE',
          ['requests', requestId],
        );
        if (versionRows.length !== 1) throw new Error('Missing request version');
        const actualVersion = Number(versionRows[0].version);

        const [existing] = await conn.execute<QuoteRow[]>(
          'SELECT \`id\`, \`request_id\`, \`patient_id\`, \`amount_minor\`, \`version\`, \`request_version\`, \`created_by\`, \`content_digest\` FROM \`secure_invoice_drafts\` WHERE \`idempotency_key\` = ? LIMIT 1',
          [key],
        );
        if (existing[0]) {
          if (existing[0].request_id !== requestId || existing[0].request_version !== requestVersion ||
              existing[0].created_by !== actor.userId) throw new Error('Idempotency key reused with different request');
          await conn.commit();
          return { draft: this.publicDraft(existing[0]), replayed: true };
        }
        if (actualVersion !== requestVersion) throw new Error('Stale request version');

        const [lines] = await conn.execute<LineRow[]>(
          'SELECT \`test_id\`, \`price\` FROM \`request_items\` WHERE \`request_id\` = ? ORDER BY \`id\`',
          [requestId],
        );
        if (lines.length === 0 || lines.length > 100) throw new Error('No valid request items');
        const totalMinor = lines.reduce((sum, line) => sum + minorUnits(line.price), 0);
        if (!Number.isSafeInteger(totalMinor) || totalMinor > 1000000000) throw new Error('Quote exceeds pilot amount limit');
        const digest = createHash('sha256').update(JSON.stringify(lines.map(l => [l.test_id, String(l.price)]))).digest('hex');
        const id = 'quote_' + token();
        await conn.execute(
          'INSERT INTO \`secure_invoice_drafts\` (\`id\`, \`request_id\`, \`patient_id\`, \`idempotency_key\`, \`request_version\`, \`content_digest\`, \`amount_minor\`, \`version\`, \`created_by\`, \`created_at\`) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())',
          [id, requestId, requests[0].patient_id, key, actualVersion, digest, totalMinor, actor.userId],
        );
        const draft = {
          id, requestId, patientId: String(requests[0].patient_id), amountMinor: totalMinor,
          requestVersion: actualVersion, version: 1, createdBy: actor.userId,
          state: 'unissued_quote' as const, hasTaxOrDiscount: false, payable: false,
        };
        await conn.commit();
        return { draft, replayed: false };
      } catch (error) { await conn.rollback(); throw error; }
    } finally { await conn.end(); }
  }

  private publicDraft(row: QuoteRow) {
    return {
      id: row.id, requestId: row.request_id, patientId: row.patient_id,
      amountMinor: Number(row.amount_minor), requestVersion: Number(row.request_version),
      version: Number(row.version), createdBy: row.created_by,
      state: 'unissued_quote' as const, hasTaxOrDiscount: false, payable: false,
    };
  }

  async find(id: string) {
    if (!validId(id)) throw new Error('Invalid quotation identifier');
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<QuoteRow[]>(
        'SELECT \`id\`, \`request_id\`, \`patient_id\`, \`amount_minor\`, \`version\`, \`request_version\`, \`created_by\`, \`content_digest\` FROM \`secure_invoice_drafts\` WHERE \`id\` = ? LIMIT 1',
        [id],
      );
      return rows.length ? this.publicDraft(rows[0]) : null;
    } finally { await conn.end(); }
  }
}

export function installInvoiceDraftRoutes(
  app: Express, store: InvoiceDraftStore, permissions: ServerPermissionStore, identity: IdentityResolver
): void {
  const guarded = (action: 'view' | 'add', handler: (req: Request, res: Response, actor: ServerIdentity) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) { res.status(401).json({ ok: false }); return; }
      try {
        if (!(await permissions.can(actor.role, 'invoiceDrafts', action))) {
          res.status(403).json({ ok: false, error: 'Invoice draft permission denied' }); return;
        }
        await handler(req, res, actor);
      } catch {
        res.status(503).json({ ok: false, error: 'Invoice draft unavailable' });
      }
    };

  app.post('/api/v2/finance/quotes', guarded('add', async (req, res, actor) => {
    const body = req.body || {};
    if (Object.keys(body).sort().join(',') !== 'idempotencyKey,requestId,requestVersion') {
      res.status(422).json({ ok: false, error: 'Only requestId, requestVersion and idempotencyKey accepted' }); return;
    }
    try {
      const result = await store.prepare(body.requestId, body.requestVersion, body.idempotencyKey, actor);
      res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
    } catch {
      res.status(409).json({ ok: false, error: 'Invalid, stale, or conflicting unissued quote' });
    }
  }));
  app.get('/api/v2/finance/quotes/:id', guarded('view', async (req, res) => {
    if (!validId(req.params.id)) { res.status(400).json({ ok: false }); return; }
    const draft = await store.find(req.params.id);
    if (!draft) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: true, draft });
  }));
  // No invoice issuance, no tax/discount/insurance claims, no payment and
  // no general-ledger postings until accounting authorization and reconciliation.
}
