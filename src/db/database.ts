import Dexie, { type Table } from 'dexie';
import type {
  Account,
  AuditLog,
  CashboxSession,
  CostCenter,
  DailyClosing,
  Doctor,
  DoctorCommission,
  Employee,
  Expense,
  InventoryItem,
  InventoryLot,
  Invoice,
  InvoiceItem,
  JournalEntry,
  LabRequest,
  LabResult,
  LabSettings,
  LabTest,
  Patient,
  Payment,
  PeriodClosingLock,
  PurchaseInvoice,
  RequestItem,
  ReturnNote,
  Role,
  RolePermission,
  Sample,
  StockMovement,
  StockTakingSession,
  Supplier,
  TestBOM,
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

  // ERP Version 3 Stores
  inventoryItems!: Table<InventoryItem, string>;
  inventoryLots!: Table<InventoryLot, string>;
  stockMovements!: Table<StockMovement, string>;
  testBOMs!: Table<TestBOM, string>;
  stockTakingSessions!: Table<StockTakingSession, string>;
  suppliers!: Table<Supplier, string>;
  purchaseInvoices!: Table<PurchaseInvoice, string>;
  returnNotes!: Table<ReturnNote, string>;
  costCenters!: Table<CostCenter, string>;
  periodLocks!: Table<PeriodClosingLock, string>;

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

    // Version 2: Optimized secondary indexes for search, filtering, and relational joins
    this.version(2).stores({
      users: 'id, username, role, active',
      patients: 'id, code, name, phone, nationalId, active, createdAt',
      doctors: 'id, code, type, active, commissionEnabled',
      tests: 'id, code, department, active',
      requests: 'id, requestNumber, barcode, patientId, doctorId, type, status, createdAt',
      invoices: 'id, invoiceNumber, requestId, patientId, doctorId, status, date, paidAmount',
      payments: 'id, paymentNumber, invoiceId, patientId, date, method, amount',
      commissions: 'id, doctorId, invoiceId, patientId, status, date, commissionAmount',
      auditLogs: 'id, userId, role, screen, timestamp, action',
      journalEntries: 'id, entryNumber, date, referenceType, referenceId',
    });

    // Version 3: Full ERP Inventory, Purchases, Returns, Cost Centers & IFRS Accounting
    this.version(3).stores({
      chartOfAccounts: 'id, code, parentCode, level, type',
      journalEntries: 'id, entryNumber, date, entryType, referenceType, referenceId, status, costCenter',
      inventoryItems: 'id, code, barcode, category, supplierId, active',
      inventoryLots: 'id, lotNumber, itemId, expiryDate, status, qcStatus',
      stockMovements: 'id, movementNumber, type, itemId, lotId, date, referenceType, referenceId',
      testBOMs: 'id, testId, testCode',
      stockTakingSessions: 'id, sessionNumber, date, status',
      suppliers: 'id, code, nameAr, active',
      purchaseInvoices: 'id, invoiceNumber, supplierId, date, status, stockReceived',
      returnNotes: 'id, noteNumber, type, originalInvoiceId, date, status',
      costCenters: 'id, code, active',
      periodLocks: 'id, periodMonth, locked',
    });
  }
}

export const db = new MedicalLabDatabase();

