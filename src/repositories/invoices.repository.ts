import { db } from '../db/database';
import { financeMySQLRows, inMySQLFinancePilot, requireMySQLFinancialWrite } from './mysql-finance.read';
import type { Invoice, InvoiceItem } from '../types';

export class InvoicesRepository {
  async getAll(): Promise<Invoice[]> {
    const list = inMySQLFinancePilot() ? await financeMySQLRows<Invoice>('invoices') : await db.invoices.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getById(id: string): Promise<Invoice | undefined> {
    return inMySQLFinancePilot() ? (await this.getAll()).find(invoice=>invoice.id===id) : db.invoices.get(id);
  }

  async getItemsByInvoiceId(invoiceId: string): Promise<InvoiceItem[]> {
    return inMySQLFinancePilot() ? (await financeMySQLRows<InvoiceItem>('invoiceItems')).filter(item=>item.invoiceId===invoiceId) : db.invoiceItems.where('invoiceId').equals(invoiceId).toArray();
  }

  async getAllItems(): Promise<InvoiceItem[]> {
    return inMySQLFinancePilot() ? financeMySQLRows<InvoiceItem>('invoiceItems') : db.invoiceItems.toArray();
  }

  async save(invoice: Invoice, items?: InvoiceItem[]): Promise<void> {
    requireMySQLFinancialWrite();
    await db.transaction('rw', [db.invoices, db.invoiceItems], async () => {
      await db.invoices.put(invoice);
      if (items) {
        await db.invoiceItems.where('invoiceId').equals(invoice.id).delete();
        if (items.length > 0) {
          await db.invoiceItems.bulkPut(items);
        }
      }
    });
  }

  async delete(id: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.transaction('rw', [db.invoices, db.invoiceItems], async () => {
      await db.invoiceItems.where('invoiceId').equals(id).delete();
      await db.invoices.delete(id);
    });
  }
}

export const invoicesRepository = new InvoicesRepository();
