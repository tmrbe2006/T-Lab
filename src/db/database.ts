import Dexie, { type Table } from 'dexie';
import type {
  Account,
  AuditLog,
  CashboxSession,
  CostCenter,
  DailyClosing,
  Doctor,
  DoctorCommission,
  DoctorSpecialty,
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
  SampleTube,
  ScientificDepartment,
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

  // Version 4 Master Lookups Stores
  doctorSpecialties!: Table<DoctorSpecialty, string>;
  scientificDepartments!: Table<ScientificDepartment, string>;
  sampleTubes!: Table<SampleTube, string>;

  // Version 5 & 6 Digital Microscopy & Intelligent Recognition Stores
  microscopyScans!: Table<import('../types').MicroscopyScanRecord, string>;
  aiImageAnalyses!: Table<import('../types').AiImageAnalysisRecord, string>;
  aiRecognitionFindings!: Table<import('../types').AiRecognitionFindingRecord, string>;
  aiCorrections!: Table<import('../types').AiUserCorrectionRecord, string>;

  // Version 7 Enterprise Global Lab Modules (Critical Logs, Microbiology, QC Westgard, Home Visits, Corporate Contracts)
  criticalValueLogs!: Table<import('../types').CriticalValueLog, string>;
  cultureResults!: Table<import('../types').CultureSensitivityRecord, string>;
  qcControlLots!: Table<import('../types').QcControlLot, string>;
  qcRuns!: Table<import('../types').QcRunRecord, string>;
  homeVisits!: Table<import('../types').HomeVisitRecord, string>;
  corporateContracts!: Table<import('../types').CorporateContract, string>;

  // Version 8 Antibiotics Master Catalog for Culture & Sensitivity (CLSI / EUCAST)
  antibioticsCatalog!: Table<import('../types').AntibioticCatalogItem, string>;

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

    // Version 4: Doctor Specialties, Scientific Departments & Sample Tubes
    this.version(4).stores({
      patients: 'id, code, name, nameEn, phone, nationalId, active, createdAt',
      doctorSpecialties: 'id, code, nameAr, active',
      scientificDepartments: 'id, code, nameAr, active',
      sampleTubes: 'id, code, nameAr, active',
    });

    // Version 5: Digital Microscopy Vision Scans (Blood Film, Urine Sediment, Stool Parasitology)
    this.version(5).stores({
      microscopyScans: 'id, scanNumber, modality, patientId, requestId, createdAt',
    });

    // Version 6: Dedicated 3-Table AI Microscopy Architecture (Analyses, Recognition Findings, User Corrections)
    this.version(6).stores({
      aiImageAnalyses: 'id, analysisNumber, modality, patientId, requestId, status, hasCriticalAlert, createdAt',
      aiRecognitionFindings: 'id, analysisId, analysisNumber, modality, groupKey, code, semanticColor, confidence, createdAt',
      aiCorrections: 'id, analysisId, findingId, modality, groupKey, originalCode, correctedCode, correctedBy, createdAt',
    });

    // Version 7: Global Enterprise Modules (Critical Value Logs, Cultures & Antibiogram, Westgard QC, Home Visits, Corporate Contracts)
    this.version(7).stores({
      criticalValueLogs: 'id, logNumber, resultId, requestId, patientId, notifiedAt, status',
      cultureResults: 'id, reportNumber, requestId, patientId, specimenType, organismCode, status, createdAt',
      qcControlLots: 'id, lotNumber, analyzerName, testId, level, active',
      qcRuns: 'id, lotId, testId, level, runDate, westgardRule, status',
      homeVisits: 'id, visitNumber, patientId, phlebotomistId, scheduledDate, status',
      corporateContracts: 'id, code, category, active',
    });

    // Version 8: Master Antibiotics Catalog for Culture & Sensitivity Reports
    this.version(8).stores({
      antibioticsCatalog: 'id, code, nameEn, antibioticClass, targetGroup, active',
    });
  }
}

export const db = new MedicalLabDatabase();

