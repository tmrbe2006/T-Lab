export type Language = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export type RoleName =
  | 'Owner'
  | 'Doctor'
  | 'Chemist'
  | 'Technician'
  | 'Receptionist'
  | 'Accountant';

export type PermissionAction =
  | 'view'
  | 'add'
  | 'edit'
  | 'delete'
  | 'print'
  | 'export'
  | 'approve'
  | 'cancel'
  | 'discount'
  | 'editPrices'
  | 'closeDay'
  | 'reopenResult'
  | 'managePermissions'
  | 'addPayment'
  | 'payCommission'
  | 'addJournalEntry';

export type ResourceScreen =
  | 'dashboard'
  | 'patients'
  | 'doctors'
  | 'employees'
  | 'users'
  | 'permissions'
  | 'tests'
  | 'testParameters'
  | 'requests'
  | 'samples'
  | 'results'
  | 'resultReview'
  | 'reports'
  | 'invoices'
  | 'payments'
  | 'accounts'
  | 'journalEntries'
  | 'cashbox'
  | 'expenses'
  | 'commissions'
  | 'settings'
  | 'printing';

export interface Role {
  id: string;
  name: RoleName;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
}

export interface RolePermission {
  id: string; // `${roleName}_${resource}`
  role: RoleName;
  resource: ResourceScreen;
  actions: Record<PermissionAction, boolean>;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  fullNameAr: string;
  fullNameEn: string;
  role: RoleName;
  employeeId?: string;
  active: boolean;
  createdAt: string;
}

export interface Employee {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  role: RoleName;
  department: string;
  phone: string;
  salary: number;
  active: boolean;
  joinedAt: string;
}

export type DiscountType = 'percentage' | 'fixed' | 'none';

export interface Patient {
  id: string;
  code: string;
  name: string;
  phone: string;
  gender: 'male' | 'female';
  birthDate: string;
  age: number;
  nationalId: string;
  address: string;
  notes: string;
  hasDefaultDiscount: boolean;
  defaultDiscountType: DiscountType;
  defaultDiscountValue: number;
  active: boolean;
  createdAt: string;
}

export type DoctorType = 'internal' | 'referred' | 'contracted';

export interface Doctor {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  specialty: string;
  phone: string;
  type: DoctorType;
  commissionRate: number; // Percentage e.g. 15 for 15%
  commissionEnabled: boolean;
  notes: string;
  active: boolean;
}

export interface LabTest {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  department: string;
  sampleType: string;
  tubeType: string;
  turnaroundTime: string;
  price: number;
  estimatedCost: number;
  active: boolean;
  commissionEligible: boolean;
  notes: string;
}

export type ParameterResultType = 'numeric' | 'text' | 'boolean' | 'select';

export interface TestParameter {
  id: string;
  testId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  unit: string;
  normalMaleMin: number;
  normalMaleMax: number;
  normalFemaleMin: number;
  normalFemaleMax: number;
  normalRangeText: string;
  criticalLow: number;
  criticalHigh: number;
  resultType: ParameterResultType;
  options?: string[];
  decimalPlaces: number;
  sortOrder: number;
  active: boolean;
}

export type RequestType = 'internal' | 'referred';

export type RequestStatus =
  | 'draft'
  | 'awaiting_sample'
  | 'sample_received'
  | 'in_analysis'
  | 'awaiting_approval'
  | 'approved'
  | 'cancelled'
  | 'rejected';

export interface LabRequest {
  id: string;
  requestNumber: string;
  barcode: string;
  patientId: string;
  doctorId?: string;
  type: RequestType;
  status: RequestStatus;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  createdBy: string;
  createdAt: string;
  notes: string;
}

export interface RequestItem {
  id: string;
  requestId: string;
  testId: string;
  price: number;
  commissionEligible: boolean;
}

export type SampleStatus =
  | 'received'
  | 'insufficient'
  | 'hemolyzed'
  | 'wrong_sample'
  | 'recollection_needed'
  | 'rejected';

export interface Sample {
  id: string;
  sampleCode: string;
  requestId: string;
  patientId: string;
  sampleType: string;
  tubeType: string;
  status: SampleStatus;
  rejectionReason?: string;
  receivedAt: string;
  receivedBy: string;
}

export type ResultFlag = 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';
export type ResultStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export interface ParameterResultValue {
  parameterId: string;
  parameterNameEn: string;
  parameterNameAr: string;
  value: string | number;
  unit: string;
  normalRange: string;
  flag: ResultFlag;
}

export interface LabResult {
  id: string;
  requestId: string;
  testId: string;
  patientId: string;
  status: ResultStatus;
  values: ParameterResultValue[];
  enteredBy: string;
  enteredAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  notes: string;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'credit';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  requestId: string;
  patientId: string;
  doctorId?: string;
  requestType: RequestType;
  date: string;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
  notes: string;
  createdBy: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  testId: string;
  testNameAr: string;
  testNameEn: string;
  price: number;
  netAfterDiscountAndTax: number;
  commissionEligible: boolean;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  createdBy: string;
  status: 'active' | 'cancelled';
  notes: string;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  category: string;
  accountCode: string;
  amount: number;
  date: string;
  paidBy: string;
  paymentMethod: 'cash' | 'bank_transfer';
  description: string;
}

export interface DoctorCommission {
  id: string;
  doctorId: string;
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  date: string;
  invoiceNetTotal: number;
  referredItemsNet: number;
  collectedAmount: number;
  collectionRatio: number; // e.g. 0.5 for 50%
  collectedReferredBasis: number;
  commissionRate: number;
  commissionAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'accrued' | 'partial' | 'paid';
}

export type AccountType = 'asset' | 'liability' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  balance: number;
}

export interface JournalEntryLine {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  referenceType: 'invoice' | 'payment' | 'expense' | 'commission_accrual' | 'commission_payout' | 'manual';
  referenceId: string;
  descriptionAr: string;
  descriptionEn: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  createdBy: string;
}

export interface CashboxSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  openedBy: string;
  status: 'open' | 'closed';
}

export interface DailyClosing {
  id: string;
  date: string;
  totalInvoices: number;
  totalCollectedCash: number;
  totalCollectedCard: number;
  totalCollectedBank: number;
  totalExpenses: number;
  netCashInBox: number;
  closedBy: string;
  closedAt: string;
  notes: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  role: RoleName;
  action: string;
  screen: ResourceScreen | 'auth';
  recordId: string;
  timestamp: string;
  details: string;
}

export interface LabSettings {
  id: string;
  labNameAr: string;
  labNameEn: string;
  branchNameAr: string;
  branchNameEn: string;
  addressAr: string;
  addressEn: string;
  phone: string;
  currency: string;
  defaultTaxRate: number;
  defaultLanguage: Language;
  enableCriticalAlerts: boolean;
  commissionIncludesTax: boolean;
  commissionFromCollectedOnly: boolean;
  barcodeFormat: 'CODE128';
  printFooterAr: string;
  printFooterEn: string;
}
