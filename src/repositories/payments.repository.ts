import { db } from '../db/database';
import type { Payment } from '../types';

export class PaymentsRepository {
  async getAll(): Promise<Payment[]> {
    const list = await db.payments.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getByInvoiceId(invoiceId: string): Promise<Payment[]> {
    return db.payments.where('invoiceId').equals(invoiceId).toArray();
  }

  async save(payment: Payment): Promise<string> {
    return db.payments.put(payment);
  }

  async delete(id: string): Promise<void> {
    await db.payments.delete(id);
  }
}

export const paymentsRepository = new PaymentsRepository();
