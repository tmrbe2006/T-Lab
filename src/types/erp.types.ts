export type InventoryCategory = 'chemical' | 'consumable' | 'equipment' | 'packaging';
export type CostMethod = 'FIFO' | 'LIFO' | 'AVG';

export interface InventoryItem {
  id: string;
  code: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  scientificName?: string;
  category: InventoryCategory;
  subCategory: string;
  unit: 'piece' | 'ml' | 'l' | 'g' | 'kg' | 'test' | 'strip' | 'box' | 'roll';
  purchaseUnit: string;
  conversionFactor: number;
  storageTemp: '15-25°C' | '2-8°C' | '-20°C';
  storageNotes: string;
  hazardClass?: 'none' | 'flammable' | 'corrosive' | 'biohazard' | 'toxic';
  msdsNumber?: string;
  expiryAfterOpeningDays?: number;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  reorderQty: number;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  costMethod: CostMethod;
  unitCost: number;
  lastPurchasePrice: number;
  supplierId: string;
  active: boolean;
  createdAt: string;
}

export type LotStatus = 'active' | 'expired' | 'quarantined' | 'disposed' | 'depleted';
export type LotQCStatus = 'pending' | 'passed' | 'failed';

export interface InventoryLot {
  id: string;
  lotNumber: string;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  itemNameEn: string;
  supplierId: string;
  supplierName: string;
  purchaseInvoiceId?: string;
  productionDate: string;
  expiryDate: string;
  openedDate?: string;
  effectiveExpiryDate?: string;
  receivedDate: string;
  initialQty: number;
  remainingQty: number;
  reservedQty: number;
  unitCost: number;
  storageLocation: string;
  qcStatus: LotQCStatus;
  qcTestedBy?: string;
  qcDate?: string;
  status: LotStatus;
}

export type StockMovementType =
  | 'goods_receipt'
  | 'issue_to_test'
  | 'internal_transfer'
  | 'return_from_dept'
  | 'disposal'
  | 'adjustment'
  | 'transfer'
  | 'reservation';

export interface StockMovement {
  id: string;
  movementNumber: string;
  date: string;
  type: StockMovementType;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  itemNameEn: string;
  lotId?: string;
  lotNumber?: string;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  unitCost: number;
  totalCost: number;
  referenceType: 'purchase_invoice' | 'lab_request' | 'disposal_order' | 'stock_taking' | 'manual';
  referenceId: string;
  department?: string;
  performedBy: string;
  approvedBy?: string;
  journalEntryId?: string;
  notes: string;
}

export interface TestBOMItem {
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  itemNameEn: string;
  quantity: number;
  unit: string;
  wastePercent: number;
  unitCost: number;
}

export interface TestBOM {
  id: string;
  testId: string;
  testCode: string;
  testNameAr: string;
  testNameEn: string;
  items: TestBOMItem[];
  directMaterialCost: number;
  laborCostEstimate: number;
  overheadCostEstimate: number;
}

export interface StockTakingLine {
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  itemNameEn: string;
  bookQty: number;
  actualQty: number;
  varianceQty: number;
  unitCost: number;
  varianceValue: number;
  reason?: string;
}

export interface StockTakingSession {
  id: string;
  sessionNumber: string;
  date: string;
  warehouseName: string;
  status: 'draft' | 'approved';
  lines: StockTakingLine[];
  totalVarianceValue: number;
  createdBy: string;
  approvedBy?: string;
  notes: string;
}

export interface Supplier {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  taxNumber: string;
  commercialRegister: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTermsDays: number;
  creditLimit: number;
  currentBalance: number;
  rating: number;
  active: boolean;
}

export interface PurchaseInvoiceLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemNameAr: string;
  itemNameEn: string;
  lotNumber: string;
  productionDate: string;
  expiryDate: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  storageLocation: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string;
  purchaseOrderNumber?: string;
  supplierId: string;
  supplierName: string;
  date: string;
  dueDate: string;
  currency: 'EGP' | 'USD' | 'EUR' | 'SAR';
  exchangeRate: number;
  items: PurchaseInvoiceLine[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  shippingCost: number;
  netTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  status: 'unpaid' | 'partial' | 'paid' | 'cancelled';
  stockReceived: boolean;
  createdBy: string;
  notes: string;
}

export interface ReturnNoteItem {
  itemId?: string;
  lotNumber?: string;
  descriptionAr: string;
  descriptionEn: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  totalAmount: number;
}

export interface ReturnNote {
  id: string;
  noteNumber: string;
  type: 'sales_return' | 'purchase_return' | 'credit_note' | 'debit_note';
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  partyId: string;
  partyName: string;
  date: string;
  reason: string;
  items: ReturnNoteItem[];
  subtotal: number;
  taxAmount: number;
  netTotal: number;
  refundMethod: 'cash' | 'account_credit';
  status: 'draft' | 'approved';
  createdBy: string;
}

export interface CostCenter {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  departmentAr: string;
  budgetMonthly: number;
  actualSpent: number;
  active: boolean;
}

export interface PeriodClosingLock {
  id: string;
  periodMonth: string; // 'YYYY-MM'
  locked: boolean;
  closedBy?: string;
  closedAt?: string;
  retainedEarningsTransferred?: number;
  notes?: string;
}

export interface AccountingMappingRule {
  operation:
    | 'sales_invoice'
    | 'customer_payment'
    | 'purchase_invoice'
    | 'supplier_payment'
    | 'stock_receipt'
    | 'stock_issue'
    | 'stock_disposal'
    | 'doctor_commission';
  titleAr: string;
  titleEn: string;
  debitAccountCode: string;
  debitAccountNameAr: string;
  creditAccountCode: string;
  creditAccountNameAr: string;
}
