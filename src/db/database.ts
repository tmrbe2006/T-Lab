import Dexie, { type Table } from 'dexie';
import type {
  Account,
  AuditLog,
  CashboxSession,
  DailyClosing,
  Doctor,
  DoctorCommission,
  Employee,
  Expense,
  Invoice,
  InvoiceItem,
  JournalEntry,
  LabRequest,
  LabResult,
  LabSettings,
  LabTest,
  Patient,
  Payment,
  RequestItem,
  Role,
  RolePermission,
  Sample,
  TestParameter,
  User,
} from '../types';

export class MedicalLabDatabase extends Dexie {
  users!: Table<User, string>;
  roles!: Table<Role, string>;
  permissions!: Table<RolePermission, string>;
  employees!: Table<Employee, string>;
  doctors!: Table<Doctor, string>;
  patients!: Table<Patient, string>;
  tests!: Table<LabTest, string>;
  testParameters!: Table<TestParameter, string>;
  requests!: Table<LabRequest, string>;
  requestItems!: Table<RequestItem, string>;
  samples!: Table<Sample, string>;
  results!: Table<LabResult, string>;
  invoices!: Table<Invoice, string>;
  invoiceItems!: Table<InvoiceItem, string>;
  payments!: Table<Payment, string>;
  expenses!: Table<Expense, string>;
  commissions!: Table<DoctorCommission, string>;
  settings!: Table<LabSettings, string>;
  auditLogs!: Table<AuditLog, string>;
  chartOfAccounts!: Table<Account, string>;
  journalEntries!: Table<JournalEntry, string>;
  cashboxSessions!: Table<CashboxSession, string>;
  dailyClosings!: Table<DailyClosing, string>;

  constructor() {
    super('MedicalLabDB_v1');

    this.version(1).stores({
      users: 'id, username, role, active',
      roles: 'id, name',
      permissions: 'id, role, resource',
      employees: 'id, code, role, department, active',
      doctors: 'id, code, type, active',
      patients: 'id, code, name, phone, nationalId, active',
      tests: 'id, code, department, active',
      testParameters: 'id, testId, code, sortOrder, active',
      requests: 'id, requestNumber, barcode, patientId, doctorId, type, status, createdAt',
      requestItems: 'id, requestId, testId',
      samples: 'id, sampleCode, requestId, patientId, status',
      results: 'id, requestId, testId, patientId, status',
      invoices: 'id, invoiceNumber, requestId, patientId, doctorId, status, date',
      invoiceItems: 'id, invoiceId, testId',
      payments: 'id, paymentNumber, invoiceId, patientId, date, method',
      expenses: 'id, expenseNumber, category, date',
      commissions: 'id, doctorId, invoiceId, patientId, status, date',
      settings: 'id',
      auditLogs: 'id, userId, role, screen, timestamp',
      chartOfAccounts: 'id, code, type',
      journalEntries: 'id, entryNumber, date, referenceType, referenceId',
      cashboxSessions: 'id, status, openedAt',
      dailyClosings: 'id, date',
    });
  }
}

export const db = new MedicalLabDatabase();
