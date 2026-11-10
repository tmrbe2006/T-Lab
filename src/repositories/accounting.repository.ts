import { db } from '../db/database';
import type { Account, CashboxSession, DailyClosing, Expense, JournalEntry } from '../types';

export class AccountingRepository {
  async getAccounts(): Promise<Account[]> {
    const list = await db.chartOfAccounts.toArray();
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }

  async saveAccount(account: Account): Promise<string> {
    return db.chartOfAccounts.put(account);
  }

  async getJournalEntries(): Promise<JournalEntry[]> {
    const list = await db.journalEntries.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveJournalEntry(entry: JournalEntry): Promise<string> {
    return db.journalEntries.put(entry);
  }

  async deleteJournalEntry(id: string): Promise<void> {
    await db.journalEntries.delete(id);
  }

  async getExpenses(): Promise<Expense[]> {
    const list = await db.expenses.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveExpense(expense: Expense): Promise<string> {
    return db.expenses.put(expense);
  }

  async deleteExpense(id: string): Promise<void> {
    await db.expenses.delete(id);
  }

  async getCashboxSessions(): Promise<CashboxSession[]> {
    return db.cashboxSessions.toArray();
  }

  async getDailyClosings(): Promise<DailyClosing[]> {
    const list = await db.dailyClosings.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveDailyClosing(closing: DailyClosing): Promise<string> {
    return db.dailyClosings.put(closing);
  }
}

export const accountingRepository = new AccountingRepository();
