import { createHash, randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver, ServerIdentity } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const idempotencyPattern = /^[A-Za-z0-9_-]{16,100}$/;
const allowedAccount = (input: unknown): input is string =>
  typeof input === 'string' && idPattern.test(input);
const asMinor = (input: unknown): number => {
  if (typeof input !== 'string' || !/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(input)) {
    throw new Error('Invalid money amount');
  }
  const [whole, part = ''] = input.split('.');
  const value = Number(whole) * 100 + Number((part + '00').slice(0, 2));
  if (!Number.isSafeInteger(value) || value > 10000000000) throw new Error('Amount outside permitted draft range');
  return value;
};
type JournalLine = { accountCode: string; debit: string; credit: string };
type ValidatedLine = { accountCode: string; debitMinor: number; creditMinor: number };
type DraftRow = RowDataPacket & {
  id: string; created_by: string; idempotency_key: string;
  content_hash: string; total_minor: number | string; line_count: number | string;
};

export class JournalDraftStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async ensureTables(): Promise<void> {
    const db = await this.connect();
    try {
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_journal_drafts (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY,' +
        'idempotency_key VARCHAR(100) NOT NULL,' +
        'created_by VARCHAR(64) NOT NULL,' +
        'content_hash CHAR(64) NOT NULL,' +
        'memo VARCHAR(240) NOT NULL,' +
        'total_minor BIGINT NOT NULL,' +
        'line_count INT NOT NULL,' +
        'created_at DATETIME NOT NULL,' +
        'UNIQUE KEY uq_journal_draft_key (idempotency_key)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
      await db.query(
        'CREATE TABLE IF NOT EXISTS secure_journal_draft_lines (' +
        'id VARCHAR(64) NOT NULL PRIMARY KEY,' +
        'draft_id VARCHAR(64) NOT NULL,' +
        'line_no INT NOT NULL,' +
        'account_code VARCHAR(64) NOT NULL,' +
        'debit_minor BIGINT NOT NULL,' +
        'credit_minor BIGINT NOT NULL,' +
        'UNIQUE KEY uq_journal_draft_line (draft_id, line_no),' +
        'KEY idx_journal_draft_lines_parent (draft_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
      );
    } finally { await db.end(); }
  }

  async prepare(memo: unknown, lines: unknown, key: unknown, actor: ServerIdentity) {
    if (typeof memo !== 'string' || memo.trim().length < 6 ||
        memo.length > 240 || /[\x00-\x1f]/.test(memo) ||
        typeof key !== 'string' || !idempotencyPattern.test(key) ||
        !Array.isArray(lines) || lines.length < 2 || lines.length > 50) {
      throw new Error('Invalid journal draft');
    }
    let debit = 0, credit = 0;
    const processed: ValidatedLine[] = lines.map((line: JournalLine) => {
      if (!line || typeof line !== 'object' ||
          Object.keys(line).sort().join(',') !== 'accountCode,credit,debit' ||
          !allowedAccount(line.accountCode)) {
        throw new Error('Unexpected line fields');
      }
      const debitMinor = asMinor(line.debit), creditMinor = asMinor(line.credit);
      if ((debitMinor > 0) === (creditMinor > 0)) {
        throw new Error('A line must have exactly one positive side');
      }
      debit += debitMinor; credit += creditMinor;
      if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
        throw new Error('Journal overflow');
      }
      return { accountCode: line.accountCode, debitMinor, creditMinor };
    });
    if (debit < 1 || debit !== credit || debit > 10000000000) {
      throw new Error('Unbalanced or invalid journal');
    }
    const normalizedMemo = memo.trim();
    const digest = createHash('sha256')
      .update(JSON.stringify([normalizedMemo, processed])).digest('hex');
    const db = await this.connect();
    try {
      await db.beginTransaction();
      try {
        const [existing] = await db.execute<DraftRow[]>(
          'SELECT id, created_by, idempotency_key, content_hash, total_minor, line_count ' +
          'FROM secure_journal_drafts WHERE idempotency_key = ? LIMIT 1 FOR UPDATE', [key],
        );
        if (existing.length) {
          const prior = existing[0];
          if (prior.created_by !== actor.userId || prior.content_hash !== digest) {
            throw new Error('Idempotency key conflict');
          }
          await db.commit();
          return { draftId: prior.id, totalMinor: Number(prior.total_minor),
            lineCount: Number(prior.line_count), replayed: true, posted: false as const };
        }
        const draftId = 'journal_draft_' + randomBytes(16).toString('hex');
        await db.execute(
          'INSERT INTO secure_journal_drafts ' +
          '(id, idempotency_key, created_by, content_hash, memo, total_minor, line_count, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
          [draftId, key, actor.userId, digest, normalizedMemo, debit, processed.length],
        );
        for (let i = 0; i < processed.length; i++) {
          const line = processed[i];
          await db.execute(
            'INSERT INTO secure_journal_draft_lines ' +
            '(id, draft_id, line_no, account_code, debit_minor, credit_minor) ' +
            'VALUES (?, ?, ?, ?, ?, ?)',
            ['journal_line_' + randomBytes(16).toString('hex'), draftId,
              i + 1, line.accountCode, line.debitMinor, line.creditMinor],
          );
        }
        await db.commit();
        return { draftId, totalMinor: debit, lineCount: processed.length,
          replayed: false, posted: false as const };
      } catch (error) { await db.rollback(); throw error; }
    } finally { await db.end(); }
  }
}

export function installJournalDraftRoutes(
  app: Express, store: JournalDraftStore,
  grants: ServerPermissionStore, identity: IdentityResolver,
): void {
  app.post('/api/v2/finance/journal-drafts', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await grants.can(actor.role, 'journalDrafts', 'add'))) {
        return res.status(403).json({ ok: false });
      }
      const body = req.body || {};
      if (Object.keys(body).sort().join(',') !== 'idempotencyKey,lines,memo') {
        return res.status(422).json({ ok: false, error: 'Unexpected fields' });
      }
      const draft = await store.prepare(body.memo, body.lines, body.idempotencyKey, actor);
      return res.status(draft.replayed ? 200 : 201).json({ ok: true, ...draft });
    } catch {
      return res.status(409).json({ ok: false, error: 'Unbalanced, invalid or duplicate accounting draft' });
    }
  });
  // Deliberately no POST/PUT/DELETE to general-ledger or posted journal tables.
}
