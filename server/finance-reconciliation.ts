import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Express, Request, Response } from 'express';
import type { IdentityResolver } from './patient-domain';
import { ServerPermissionStore } from './server-permissions';

function idOk(input: unknown): input is string {
  return typeof input === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(input);
}
function cents(input: unknown): number | null {
  const text = String(input);
  if (!/^-?(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(text)) return null;
  const neg = text.startsWith('-');
  const parts = (neg ? text.slice(1) : text).split('.');
  const minor = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0,2));
  return Number.isSafeInteger(minor) ? (neg ? -minor : minor) : null;
}
type InvoiceRow = RowDataPacket & {
  id: string; net_total: string; paid_amount: string; remaining_amount: string;
  subtotal: string; discount_amount: string; tax_amount: string;
};
type JournalRow = RowDataPacket & { id: string; total_debit: string; total_credit: string };

export class FinancialReconciliationStore {
  constructor(private readonly connect: () => Promise<Connection>) {}

  async invoicePage(cursor: string, limit: number) {
    if ((cursor && !idOk(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new Error('Invalid pagination');
    }
    const conn = await this.connect();
    try {
      const [invoices] = await conn.execute<InvoiceRow[]>(
        'SELECT id, net_total, paid_amount, remaining_amount, subtotal, discount_amount, tax_amount ' +
        'FROM invoices WHERE id > ? ORDER BY id LIMIT ?', [cursor, limit],
      );
      const rows = [];
      for (const invoice of invoices) {
        const [paid] = await conn.execute<RowDataPacket[]>(
          'SELECT COALESCE(SUM(amount), 0) AS total_amount FROM payments WHERE invoice_id = ?',
          [invoice.id],
        );
        const net = cents(invoice.net_total);
        const storedPaid = cents(invoice.paid_amount);
        const remaining = cents(invoice.remaining_amount);
        const subtotal = cents(invoice.subtotal);
        const discount = cents(invoice.discount_amount);
        const tax = cents(invoice.tax_amount);
        const realPaid = cents(paid[0]?.total_amount || '0');
        const errors: string[] = [];
        if ([net, storedPaid, remaining, subtotal, discount, tax, realPaid].some(v => v === null)) {
          errors.push('INVALID_CURRENCY');
        } else {
          if (subtotal! - discount! + tax! !== net!) errors.push('INVOICE_TOTAL_MISMATCH');
          if (storedPaid! !== realPaid!) errors.push('PAYMENTS_SUM_MISMATCH');
          if (net! - storedPaid! !== remaining!) errors.push('REMAINING_BALANCE_MISMATCH');
          if (net! < 0 || discount! < 0 || tax! < 0 || storedPaid! < 0 || remaining! < 0) {
            errors.push('UNEXPECTED_NEGATIVE_VALUE');
          }
          if (storedPaid! > net!) errors.push('OVERPAID_INVOICE');
        }
        rows.push({
          invoiceId: invoice.id, errors,
          status: errors.length ? 'attention_required' as const : 'balanced' as const,
        });
      }
      return { items: rows,
        nextCursor: invoices.length === limit ? invoices[invoices.length - 1].id : null,
        readOnly: true, scope: 'legacy_invoice_header_and_payment_sum' as const };
    } finally { await conn.end(); }
  }

  async journalPage(cursor: string, limit: number) {
    if ((cursor && !idOk(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new Error('Invalid pagination');
    }
    const conn = await this.connect();
    try {
      const [rows] = await conn.execute<JournalRow[]>(
        'SELECT id, total_debit, total_credit FROM journal_entries ' +
        'WHERE id > ? ORDER BY id LIMIT ?', [cursor, limit],
      );
      return {
        items: rows.map(row => {
          const debit = cents(row.total_debit), credit = cents(row.total_credit);
          return { journalId: row.id, status:
            debit !== null && credit !== null && debit >= 0 && debit === credit
              ? 'header_balanced' as const : 'attention_required' as const,
            errors: debit === null || credit === null ? ['INVALID_CURRENCY']
              : debit < 0 || credit < 0 ? ['UNEXPECTED_NEGATIVE_VALUE']
              : debit !== credit ? ['JOURNAL_HEADER_UNBALANCED'] : [] };
        }),
        nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
        readOnly: true, lineItemsVerified: false,
      };
    } finally { await conn.end(); }
  }
}

export function installFinancialReconciliationRoutes(
  app: Express, store: FinancialReconciliationStore,
  permissions: ServerPermissionStore, identity: IdentityResolver,
): void {
  for (const kind of ['invoices', 'journals'] as const) {
    app.get('/api/v2/finance/audit/' + kind, async (req: Request, res: Response) => {
      const actor = await identity(req);
      if (!actor) return res.status(401).json({ ok: false });
      try {
        if (!(await permissions.can(actor.role, 'financeAudit', 'view'))) {
          return res.status(403).json({ ok: false });
        }
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
        const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
        if ((cursor && !idOk(cursor)) || !Number.isInteger(limit) || limit < 1 || limit > 25) {
          return res.status(400).json({ ok: false });
        }
        const data = kind === 'invoices'
          ? await store.invoicePage(cursor, limit)
          : await store.journalPage(cursor, limit);
        return res.json({ ok: true, ...data });
      } catch {
        return res.status(503).json({ ok: false, error: 'Financial audit unavailable' });
      }
    });
  }
  // Read-only. No invoice issue, cash collection, refund or journal posting.
}
