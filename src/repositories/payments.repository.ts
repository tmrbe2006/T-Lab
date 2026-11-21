import { db } from '../db/database';
import { financeMySQLRows, inMySQLFinancePilot, requireMySQLFinancialWrite } from './mysql-finance.read';
import type { Payment } from '../types';

export class PaymentsRepository {
  async getAll(): Promise<Payment[]> {
    const list = inMySQLFinancePilot() ? await financeMySQLRows<Payment>('payments') : await db.payments.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getByInvoiceId(invoiceId: string): Promise<Payment[]> {
    return inMySQLFinancePilot() ? (await this.getAll()).filter(payment=>payment.invoiceId===invoiceId) : db.payments.where('invoiceId').equals(invoiceId).toArray();
  }

  async save(payment: Payment): Promise<string> {
    requireMySQLFinancialWrite();
    return db.payments.put(payment);
  }

  async delete(id: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.payments.delete(id);
  }
}

export const paymentsRepository = new PaymentsRepository();
