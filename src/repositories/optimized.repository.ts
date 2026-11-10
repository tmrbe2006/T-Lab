import { db } from '../db/database';
import type {
  AuditLog,
  Invoice,
  InvoiceStatus,
  JournalEntry,
  LabRequest,
  Patient,
  RequestStatus,
} from '../types';

export class OptimizedInvoicesRepository {
  // استخدام Indexes للبحث السريع حسب النطاق الزمني
  async getByDateRange(startDate: string, endDate: string): Promise<Invoice[]> {
    return db.invoices
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  }

  // البحث السريع حسب حالة الفاتورة
  async getByStatus(status: InvoiceStatus): Promise<Invoice[]> {
    return db.invoices
      .where('status')
      .equals(status)
      .toArray();
  }

  // استرجاع الفواتير غير المسددة أو المسددة جزئيًا عبر فهرس status
  async getUnpaid(): Promise<Invoice[]> {
    return db.invoices
      .where('status')
      .anyOf(['unpaid', 'partial'])
      .toArray();
  }

  // استرجاع فواتير مريض محدد عبر فهرس patientId
  async getByPatientId(patientId: string): Promise<Invoice[]> {
    return db.invoices
      .where('patientId')
      .equals(patientId)
      .toArray();
  }

  // استرجاع فواتير طبيب محدد عبر فهرس doctorId
  async getByDoctorId(doctorId: string): Promise<Invoice[]> {
    return db.invoices
      .where('doctorId')
      .equals(doctorId)
      .toArray();
  }
}

export class OptimizedRequestsRepository {
  async getByStatus(status: RequestStatus): Promise<LabRequest[]> {
    return db.requests
      .where('status')
      .equals(status)
      .toArray();
  }

  async getByPatientId(patientId: string): Promise<LabRequest[]> {
    return db.requests
      .where('patientId')
      .equals(patientId)
      .toArray();
  }

  async getByBarcode(barcode: string): Promise<LabRequest | undefined> {
    return db.requests
      .where('barcode')
      .equals(barcode)
      .first();
  }
}

export class OptimizedPatientsRepository {
  async searchByCodeOrPhone(query: string): Promise<Patient[]> {
    const q = query.trim();
    if (!q) return db.patients.toArray();
    const [byCode, byPhone] = await Promise.all([
      db.patients.where('code').startsWithIgnoreCase(q).toArray(),
      db.patients.where('phone').startsWith(q).toArray(),
    ]);
    const map = new Map<string, Patient>();
    for (const p of [...byCode, ...byPhone]) {
      map.set(p.id, p);
    }
    return Array.from(map.values());
  }
}

export class OptimizedAuditLogsRepository {
  async getByScreen(screen: string): Promise<AuditLog[]> {
    return db.auditLogs
      .where('screen')
      .equals(screen)
      .reverse()
      .sortBy('timestamp');
  }

  async getRecent(limit = 100): Promise<AuditLog[]> {
    return db.auditLogs
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }
}

export class OptimizedJournalEntriesRepository {
  async getByDateRange(startDate: string, endDate: string): Promise<JournalEntry[]> {
    return db.journalEntries
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  }

  async getByReferenceType(referenceType: JournalEntry['referenceType']): Promise<JournalEntry[]> {
    return db.journalEntries
      .where('referenceType')
      .equals(referenceType)
      .toArray();
  }
}

export const optimizedInvoicesRepository = new OptimizedInvoicesRepository();
export const optimizedRequestsRepository = new OptimizedRequestsRepository();
export const optimizedPatientsRepository = new OptimizedPatientsRepository();
export const optimizedAuditLogsRepository = new OptimizedAuditLogsRepository();
export const optimizedJournalEntriesRepository = new OptimizedJournalEntriesRepository();
