import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

const accountPattern = /^[A-Za-z0-9_-]{1,64}$/;
function dateValid(input: unknown): input is string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(input + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === input;
}
type PeriodRow = RowDataPacket & { locked: number | string };
type AccountRow = RowDataPacket & { code: string; type: string; parent_code: string | null };

export class FinancialPostingPreflightStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async inspect(entryDate: string, accountCodes: string[]) {
    if (!dateValid(entryDate) ||
        !Array.isArray(accountCodes) || accountCodes.length < 2 ||
        accountCodes.length > 50 ||
        accountCodes.some(code => typeof code !== 'string' || !accountPattern.test(code))) {
      throw new Error('Invalid posting-preflight inputs');
    }
    const db = await this.connect();
    try {
      const reasons: string[] = [];
      const period = entryDate.slice(0, 7);
      const [periods] = await db.execute<PeriodRow[]>(
        'SELECT locked FROM period_locks WHERE period_month = ? LIMIT 2',
        [period],
      );
      if (periods.length !== 1) reasons.push('NO_UNAMBIGUOUS_OPEN_PERIOD');
      else if (Number(periods[0].locked) !== 0) reasons.push('PERIOD_LOCKED');
      const today = new Date().toISOString().slice(0,10);
      if (entryDate > today) reasons.push('FUTURE_DATE_REQUIRES_REVIEW');
      const codes = [...new Set(accountCodes)];
      const [accounts] = await db.query<AccountRow[]>(
        'SELECT code, type, parent_code FROM chart_of_accounts WHERE code IN (' +
        codes.map(() => '?').join(',') + ')',
        codes,
      );
      for (const code of codes) {
        const matching = accounts.filter(row => row.code === code);
        if (matching.length !== 1) {
          reasons.push('ACCOUNT_MISSING_OR_DUPLICATE:' + code);
          continue;
        }
        const account = matching[0];
        if (!['asset', 'liability', 'equity', 'revenue', 'expense',
          'assets', 'liabilities', 'expenses', 'income'].includes(String(account.type).toLowerCase())) {
          reasons.push('ACCOUNT_TYPE_UNVERIFIED:' + code);
        }
        const [children] = await db.execute<RowDataPacket[]>(
          'SELECT id FROM chart_of_accounts WHERE parent_code = ? LIMIT 1', [code],
        );
        if (children.length) reasons.push('PARENT_ACCOUNT_NOT_POSTABLE:' + code);
      }
      return {
        entryDate, period, accountCount: codes.length,
        status: 'blocked' as const,
        approvedForPosting: false as const,
        manualReviewRequired: true as const,
        reasons: [...new Set(reasons)],
        // Even with no simple rule violations, never claim fiscal approval.
        basicStructureChecksPassed: reasons.length === 0,
      };
    } finally { await db.end(); }
  }
}

export function installFinancialPreflightRoutes(
  app: Express, store: FinancialPostingPreflightStore,
  permissions: ServerPermissionStore, identity: IdentityResolver,
): void {
  app.post('/api/v2/finance/posting-preflight', async (req: Request, res: Response) => {
    const actor = await identity(req);
    if (!actor) return res.status(401).json({ ok: false });
    try {
      if (!(await permissions.can(actor.role, 'journalDrafts', 'view'))) {
        return res.status(403).json({ ok: false });
      }
      const body = req.body || {};
      if (Object.keys(body).sort().join(',') !== 'accountCodes,entryDate') {
        return res.status(422).json({ ok: false });
      }
      const report = await store.inspect(body.entryDate, body.accountCodes);
      return res.json({ ok: true, report });
    } catch {
      return res.status(422).json({ ok: false, error: 'Posting preflight input rejected or database unavailable' });
    }
  });
}
