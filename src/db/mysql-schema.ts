/**
 * MySQL 5.5 & MySQL 8.0.28 Compatible Schema & SQL Dump Engine
 * - Uses ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci (100% compatible with MySQL 5.5, 5.6, 5.7, and 8.0.28+)
 * - Avoids MySQL 5.7+ only JSON column type (uses LONGTEXT for nested arrays/objects)
 * - Keeps indexed VARCHAR columns <= 191 chars to respect MySQL 5.5 InnoDB 767-byte index key limit
 * - Provides real relational columns for querying in MySQL Workbench / phpMyAdmin / HeidiSQL + lossless raw_json
 */

export interface MySQLColumnDef {
  name: string;
  sqlType: string;
  extract: (row: Record<string, unknown>) => string | number | null;
}

export interface MySQLTableMapping {
  dexieTable: string;
  mysqlTable: string;
  titleAr: string;
  columns: MySQLColumnDef[];
  indexes?: string[];
}

const str = (v: unknown, maxLen = 255): string => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const boolInt = (v: unknown): number => (v ? 1 : 0);

export const MYSQL_TABLES_CONFIG: MySQLTableMapping[] = [
  {
    dexieTable: 'patients',
    mysqlTable: 'patients',
    titleAr: 'المرضى (Patients)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.name, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'gender', sqlType: 'VARCHAR(16)', extract: (r) => str(r.gender, 16) },
      { name: 'age', sqlType: 'INT DEFAULT 0', extract: (r) => num(r.age) },
      { name: 'birth_date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.birthDate, 32) },
      { name: 'phone', sqlType: 'VARCHAR(64)', extract: (r) => str(r.phone, 64) },
      { name: 'national_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.nationalId, 64) },
      { name: 'address', sqlType: 'VARCHAR(255)', extract: (r) => str(r.address, 255) },
      { name: 'default_discount', sqlType: 'DECIMAL(10,2) DEFAULT 0.00', extract: (r) => num(r.defaultDiscountRate) },
      { name: 'created_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.createdAt, 32) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_patients_code (code)', 'INDEX idx_patients_phone (phone)', 'INDEX idx_patients_name (name)'],
  },
  {
    dexieTable: 'doctorSpecialties',
    mysqlTable: 'doctor_specialties',
    titleAr: 'تخصصات الأطباء (Doctor Specialties)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'notes', sqlType: 'VARCHAR(255)', extract: (r) => str(r.notes, 255) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_doc_spec_code (code)'],
  },
  {
    dexieTable: 'doctors',
    mysqlTable: 'doctors',
    titleAr: 'الأطباء المحولون والداخليون (Doctors)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'specialty', sqlType: 'VARCHAR(128)', extract: (r) => str(r.specialty, 128) },
      { name: 'phone', sqlType: 'VARCHAR(64)', extract: (r) => str(r.phone, 64) },
      { name: 'type', sqlType: 'VARCHAR(32)', extract: (r) => str(r.type, 32) },
      { name: 'commission_rate', sqlType: 'DECIMAL(10,2) DEFAULT 0.00', extract: (r) => num(r.commissionRate) },
      { name: 'commission_enabled', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.commissionEnabled) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_doctors_code (code)', 'INDEX idx_doctors_type (type)'],
  },
  {
    dexieTable: 'scientificDepartments',
    mysqlTable: 'scientific_departments',
    titleAr: 'الأقسام العلمية للتحاليل (Scientific Departments)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'notes', sqlType: 'VARCHAR(255)', extract: (r) => str(r.notes, 255) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_sci_dept_code (code)'],
  },
  {
    dexieTable: 'sampleTubes',
    mysqlTable: 'sample_tubes',
    titleAr: 'أنابيب سحب العينات (Sample Collection Tubes)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'cap_color', sqlType: 'VARCHAR(64)', extract: (r) => str(r.capColor, 64) },
      { name: 'additive', sqlType: 'VARCHAR(128)', extract: (r) => str(r.additive, 128) },
      { name: 'notes', sqlType: 'VARCHAR(255)', extract: (r) => str(r.notes, 255) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_sample_tubes_code (code)'],
  },
  {
    dexieTable: 'tests',
    mysqlTable: 'lab_tests',
    titleAr: 'كتالوج التحاليل الطبية (Lab Tests)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'department', sqlType: 'VARCHAR(128)', extract: (r) => str(r.department, 128) },
      { name: 'sample_type', sqlType: 'VARCHAR(128)', extract: (r) => str(r.sampleType, 128) },
      { name: 'tube_type', sqlType: 'VARCHAR(128)', extract: (r) => str(r.tubeType, 128) },
      { name: 'price', sqlType: 'DECIMAL(12,2) DEFAULT 0.00', extract: (r) => num(r.price) },
      { name: 'tat_hours', sqlType: 'INT DEFAULT 24', extract: (r) => num(r.tatHours) },
      { name: 'commission_eligible', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.commissionEligible) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_tests_code (code)', 'INDEX idx_tests_dept (department)'],
  },
  {
    dexieTable: 'testParameters',
    mysqlTable: 'test_parameters',
    titleAr: 'بارامترات التحاليل والمعدلات الطبيعية (Test Parameters)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'test_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.testId, 64) },
      { name: 'code', sqlType: 'VARCHAR(64)', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'unit', sqlType: 'VARCHAR(64)', extract: (r) => str(r.unit, 64) },
      { name: 'normal_min', sqlType: 'DECIMAL(12,4) DEFAULT 0', extract: (r) => num(r.normalMin) },
      { name: 'normal_max', sqlType: 'DECIMAL(12,4) DEFAULT 0', extract: (r) => num(r.normalMax) },
      { name: 'sort_order', sqlType: 'INT DEFAULT 1', extract: (r) => num(r.sortOrder) },
    ],
    indexes: ['INDEX idx_test_params_test (test_id)'],
  },
  {
    dexieTable: 'requests',
    mysqlTable: 'lab_requests',
    titleAr: 'طلبات التحاليل (Lab Requests)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'request_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.requestNumber, 64) },
      { name: 'barcode', sqlType: 'VARCHAR(64)', extract: (r) => str(r.barcode, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.patientId, 64) },
      { name: 'doctor_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.doctorId, 64) },
      { name: 'type', sqlType: 'VARCHAR(32)', extract: (r) => str(r.type, 32) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'priority', sqlType: 'VARCHAR(32)', extract: (r) => str(r.priority, 32) },
      { name: 'created_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.createdAt, 32) },
    ],
    indexes: [
      'INDEX idx_req_number (request_number)',
      'INDEX idx_req_patient (patient_id)',
      'INDEX idx_req_status (status)',
      'INDEX idx_req_created (created_at)',
    ],
  },
  {
    dexieTable: 'requestItems',
    mysqlTable: 'request_items',
    titleAr: 'بنود طلبات التحاليل (Request Items)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'request_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.requestId, 64) },
      { name: 'test_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.testId, 64) },
      { name: 'price', sqlType: 'DECIMAL(12,2) DEFAULT 0.00', extract: (r) => num(r.price) },
    ],
    indexes: ['INDEX idx_req_items_req (request_id)', 'INDEX idx_req_items_test (test_id)'],
  },
  {
    dexieTable: 'samples',
    mysqlTable: 'samples',
    titleAr: 'العينات والباركود (Samples)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'sample_code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.sampleCode, 64) },
      { name: 'request_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.requestId, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.patientId, 64) },
      { name: 'sample_type', sqlType: 'VARCHAR(128)', extract: (r) => str(r.sampleType, 128) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'collected_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.collectedAt, 32) },
    ],
    indexes: ['INDEX idx_samples_code (sample_code)', 'INDEX idx_samples_req (request_id)'],
  },
  {
    dexieTable: 'results',
    mysqlTable: 'lab_results',
    titleAr: 'نتائج التحاليل الطبية (Lab Results)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'request_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.requestId, 64) },
      { name: 'test_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.testId, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.patientId, 64) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'has_critical', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.hasCritical) },
      { name: 'approved_by', sqlType: 'VARCHAR(64)', extract: (r) => str(r.approvedBy, 64) },
      { name: 'approved_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.approvedAt, 32) },
    ],
    indexes: ['INDEX idx_results_req (request_id)', 'INDEX idx_results_patient (patient_id)'],
  },
  {
    dexieTable: 'invoices',
    mysqlTable: 'invoices',
    titleAr: 'فواتير المرضى (Invoices)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'invoice_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.invoiceNumber, 64) },
      { name: 'request_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.requestId, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.patientId, 64) },
      { name: 'doctor_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.doctorId, 64) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
      { name: 'subtotal', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.subtotal) },
      { name: 'discount_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.discountAmount) },
      { name: 'tax_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.taxAmount) },
      { name: 'net_total', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.netTotal) },
      { name: 'paid_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.paidAmount) },
      { name: 'remaining_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.remainingAmount) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
    ],
    indexes: [
      'INDEX idx_inv_num (invoice_number)',
      'INDEX idx_inv_patient (patient_id)',
      'INDEX idx_inv_date (date)',
      'INDEX idx_inv_status (status)',
    ],
  },
  {
    dexieTable: 'invoiceItems',
    mysqlTable: 'invoice_items',
    titleAr: 'بنود الفواتير (Invoice Items)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'invoice_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.invoiceId, 64) },
      { name: 'test_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.testId, 64) },
      { name: 'test_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.testNameAr, 191) },
      { name: 'price', sqlType: 'DECIMAL(12,2) DEFAULT 0.00', extract: (r) => num(r.price) },
      { name: 'net_after_discount_tax', sqlType: 'DECIMAL(12,2) DEFAULT 0.00', extract: (r) => num(r.netAfterDiscountAndTax) },
    ],
    indexes: ['INDEX idx_inv_items_inv (invoice_id)'],
  },
  {
    dexieTable: 'payments',
    mysqlTable: 'payments',
    titleAr: 'سندات القبض والمدفوعات (Payments)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'payment_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.paymentNumber, 64) },
      { name: 'invoice_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.invoiceId, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.patientId, 64) },
      { name: 'amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.amount) },
      { name: 'method', sqlType: 'VARCHAR(32)', extract: (r) => str(r.method, 32) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
    ],
    indexes: ['INDEX idx_pay_inv (invoice_id)', 'INDEX idx_pay_date (date)'],
  },
  {
    dexieTable: 'expenses',
    mysqlTable: 'expenses',
    titleAr: 'المصروفات (Expenses)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'expense_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.expenseNumber, 64) },
      { name: 'category', sqlType: 'VARCHAR(128) NOT NULL', extract: (r) => str(r.category, 128) },
      { name: 'amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.amount) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
      { name: 'notes', sqlType: 'VARCHAR(255)', extract: (r) => str(r.notes, 255) },
      { name: 'created_by', sqlType: 'VARCHAR(64)', extract: (r) => str(r.createdBy, 64) },
    ],
    indexes: ['INDEX idx_exp_date (date)', 'INDEX idx_exp_cat (category)'],
  },
  {
    dexieTable: 'commissions',
    mysqlTable: 'doctor_commissions',
    titleAr: 'عمولات الأطباء (Doctor Commissions)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'doctor_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.doctorId, 64) },
      { name: 'invoice_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.invoiceId, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.patientId, 64) },
      { name: 'commission_rate', sqlType: 'DECIMAL(10,2) DEFAULT 0.00', extract: (r) => num(r.commissionRate) },
      { name: 'commission_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.commissionAmount) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
    ],
    indexes: ['INDEX idx_comm_doc (doctor_id)', 'INDEX idx_comm_inv (invoice_id)'],
  },
  {
    dexieTable: 'inventoryItems',
    mysqlTable: 'inventory_items',
    titleAr: 'أصناف المخزون والكواشف (Inventory Items)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'barcode', sqlType: 'VARCHAR(64)', extract: (r) => str(r.barcode, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'category', sqlType: 'VARCHAR(64)', extract: (r) => str(r.category, 64) },
      { name: 'current_stock', sqlType: 'DECIMAL(14,3) DEFAULT 0.000', extract: (r) => num(r.currentStock) },
      { name: 'min_stock_level', sqlType: 'DECIMAL(14,3) DEFAULT 0.000', extract: (r) => num(r.minStockLevel) },
      { name: 'average_cost', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.averageCost) },
      { name: 'supplier_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.supplierId, 64) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_inv_item_code (code)', 'INDEX idx_inv_item_cat (category)'],
  },
  {
    dexieTable: 'inventoryLots',
    mysqlTable: 'inventory_lots',
    titleAr: 'التشغيلات وتواريخ الصلاحية (Inventory Lots / FEFO)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'lot_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.lotNumber, 64) },
      { name: 'item_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.itemId, 64) },
      { name: 'expiry_date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.expiryDate, 32) },
      { name: 'initial_qty', sqlType: 'DECIMAL(14,3) DEFAULT 0.000', extract: (r) => num(r.initialQuantity) },
      { name: 'remaining_qty', sqlType: 'DECIMAL(14,3) DEFAULT 0.000', extract: (r) => num(r.remainingQuantity) },
      { name: 'unit_cost', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.unitCost) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'qc_status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.qcStatus, 32) },
    ],
    indexes: ['INDEX idx_lots_item (item_id)', 'INDEX idx_lots_expiry (expiry_date)'],
  },
  {
    dexieTable: 'stockMovements',
    mysqlTable: 'stock_movements',
    titleAr: 'حركات المخزون (Stock Movements)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'movement_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.movementNumber, 64) },
      { name: 'type', sqlType: 'VARCHAR(32)', extract: (r) => str(r.type, 32) },
      { name: 'item_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.itemId, 64) },
      { name: 'lot_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.lotId, 64) },
      { name: 'quantity', sqlType: 'DECIMAL(14,3) DEFAULT 0.000', extract: (r) => num(r.quantity) },
      { name: 'total_cost', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.totalCost) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
    ],
    indexes: ['INDEX idx_mov_item (item_id)', 'INDEX idx_mov_date (date)'],
  },
  {
    dexieTable: 'testBOMs',
    mysqlTable: 'test_boms',
    titleAr: 'قوائم استهلاك الكواشف للتحاليل (Test BOMs)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'test_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.testId, 64) },
      { name: 'test_code', sqlType: 'VARCHAR(64)', extract: (r) => str(r.testCode, 64) },
      { name: 'test_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.testNameAr, 191) },
      { name: 'direct_reagent_cost', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.directReagentCost) },
    ],
    indexes: ['INDEX idx_bom_test (test_id)'],
  },
  {
    dexieTable: 'stockTakingSessions',
    mysqlTable: 'stock_taking_sessions',
    titleAr: 'جلسات الجرد الدوري للمخزون (Stock Taking Sessions)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'session_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.sessionNumber, 64) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
      { name: 'warehouse', sqlType: 'VARCHAR(128)', extract: (r) => str(r.warehouse, 128) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'total_variance_value', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.totalVarianceValue) },
    ],
    indexes: ['INDEX idx_stock_take_date (date)'],
  },
  {
    dexieTable: 'suppliers',
    mysqlTable: 'suppliers',
    titleAr: 'الموردون والشركات (Suppliers)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'phone', sqlType: 'VARCHAR(64)', extract: (r) => str(r.phone, 64) },
      { name: 'tax_number', sqlType: 'VARCHAR(64)', extract: (r) => str(r.taxNumber, 64) },
      { name: 'current_balance', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.currentBalance) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_sup_code (code)'],
  },
  {
    dexieTable: 'purchaseInvoices',
    mysqlTable: 'purchase_invoices',
    titleAr: 'فواتير المشتريات والتوريد (Purchase Invoices)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'invoice_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.invoiceNumber, 64) },
      { name: 'supplier_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.supplierId, 64) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
      { name: 'net_total', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.netTotal) },
      { name: 'paid_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.paidAmount) },
      { name: 'remaining_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.remainingAmount) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
    ],
    indexes: ['INDEX idx_pur_sup (supplier_id)', 'INDEX idx_pur_date (date)'],
  },
  {
    dexieTable: 'returnNotes',
    mysqlTable: 'return_notes',
    titleAr: 'إشعارات المرتجعات الدائنة والمدينة (Return Notes)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'note_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.noteNumber, 64) },
      { name: 'type', sqlType: 'VARCHAR(32)', extract: (r) => str(r.type, 32) },
      { name: 'original_invoice_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.originalInvoiceId, 64) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
      { name: 'net_return_amount', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.netReturnAmount) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
    ],
    indexes: ['INDEX idx_ret_date (date)'],
  },
  {
    dexieTable: 'chartOfAccounts',
    mysqlTable: 'chart_of_accounts',
    titleAr: 'شجرة الحسابات المحاسبية (Chart of Accounts)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'parent_code', sqlType: 'VARCHAR(64)', extract: (r) => str(r.parentCode, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191) NOT NULL', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'type', sqlType: 'VARCHAR(32)', extract: (r) => str(r.type, 32) },
      { name: 'balance', sqlType: 'DECIMAL(16,2) DEFAULT 0.00', extract: (r) => num(r.balance) },
    ],
    indexes: ['INDEX idx_coa_code (code)', 'INDEX idx_coa_type (type)'],
  },
  {
    dexieTable: 'journalEntries',
    mysqlTable: 'journal_entries',
    titleAr: 'قيود اليومية المحاسبية (Journal Entries)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'entry_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.entryNumber, 64) },
      { name: 'date', sqlType: 'VARCHAR(32)', extract: (r) => str(r.date, 32) },
      { name: 'description', sqlType: 'VARCHAR(255)', extract: (r) => str(r.description, 255) },
      { name: 'reference_type', sqlType: 'VARCHAR(64)', extract: (r) => str(r.referenceType, 64) },
      { name: 'reference_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.referenceId, 64) },
      { name: 'total_debit', sqlType: 'DECIMAL(16,2) DEFAULT 0.00', extract: (r) => num(r.totalDebit) },
      { name: 'total_credit', sqlType: 'DECIMAL(16,2) DEFAULT 0.00', extract: (r) => num(r.totalCredit) },
    ],
    indexes: ['INDEX idx_je_num (entry_number)', 'INDEX idx_je_date (date)', 'INDEX idx_je_ref (reference_id)'],
  },
  {
    dexieTable: 'costCenters',
    mysqlTable: 'cost_centers',
    titleAr: 'مراكز التكلفة (Cost Centers)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameAr, 191) },
      { name: 'budget_monthly', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.budgetMonthly) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
  },
  {
    dexieTable: 'periodLocks',
    mysqlTable: 'period_locks',
    titleAr: 'إقفال الفترات المحاسبية (Period Closing Locks)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'period_month', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.periodMonth, 32) },
      { name: 'locked', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.locked) },
    ],
  },
  {
    dexieTable: 'cashboxSessions',
    mysqlTable: 'cashbox_sessions',
    titleAr: 'ورديات الخزينة (Cashbox Sessions)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'opened_by', sqlType: 'VARCHAR(64)', extract: (r) => str(r.openedBy, 64) },
      { name: 'opened_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.openedAt, 32) },
      { name: 'opening_balance', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.openingBalance) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
    ],
  },
  {
    dexieTable: 'dailyClosings',
    mysqlTable: 'daily_closings',
    titleAr: 'التقفيل اليومي (Daily Closings)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'date', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.date, 32) },
      { name: 'total_collected', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.totalCollected) },
      { name: 'total_expenses', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.totalExpenses) },
      { name: 'net_cash', sqlType: 'DECIMAL(14,2) DEFAULT 0.00', extract: (r) => num(r.netCash) },
    ],
  },
  {
    dexieTable: 'employees',
    mysqlTable: 'employees',
    titleAr: 'الموظفون (Employees)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameAr, 191) },
      { name: 'role', sqlType: 'VARCHAR(64)', extract: (r) => str(r.role, 64) },
      { name: 'department', sqlType: 'VARCHAR(128)', extract: (r) => str(r.department, 128) },
      { name: 'salary', sqlType: 'DECIMAL(12,2) DEFAULT 0.00', extract: (r) => num(r.salary) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
  },
  {
    dexieTable: 'users',
    mysqlTable: 'users',
    titleAr: 'حسابات المستخدمين (Users)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'username', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.username, 64) },
      { name: 'full_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.fullNameAr, 191) },
      { name: 'role', sqlType: 'VARCHAR(64)', extract: (r) => str(r.role, 64) },
      { name: 'active', sqlType: 'TINYINT(1) DEFAULT 1', extract: (r) => boolInt(r.active) },
    ],
    indexes: ['INDEX idx_users_username (username)'],
  },
  {
    dexieTable: 'roles',
    mysqlTable: 'roles',
    titleAr: 'الأدوار الوظيفية (Roles)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'name', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.name, 64) },
      { name: 'label_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.labelAr, 191) },
    ],
  },
  {
    dexieTable: 'permissions',
    mysqlTable: 'role_permissions',
    titleAr: 'صلاحيات الأدوار (Role Permissions)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'role', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.role, 64) },
      { name: 'resource', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.resource, 64) },
      { name: 'can_view', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.view) },
      { name: 'can_create', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.create) },
      { name: 'can_edit', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.edit) },
      { name: 'can_delete', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.delete) },
    ],
    indexes: ['INDEX idx_perm_role (role, resource)'],
  },
  {
    dexieTable: 'settings',
    mysqlTable: 'lab_settings',
    titleAr: 'إعدادات المعمل (Lab Settings)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'lab_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.labNameAr, 191) },
      { name: 'lab_name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.labNameEn, 191) },
      { name: 'phone', sqlType: 'VARCHAR(64)', extract: (r) => str(r.phone, 64) },
      { name: 'currency', sqlType: 'VARCHAR(16)', extract: (r) => str(r.currency, 16) },
      { name: 'default_tax_rate', sqlType: 'DECIMAL(8,2) DEFAULT 14.00', extract: (r) => num(r.defaultTaxRate) },
    ],
  },
  {
    dexieTable: 'auditLogs',
    mysqlTable: 'audit_logs',
    titleAr: 'سجل المراجعة الأمني (Audit Logs)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'user_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.userId, 64) },
      { name: 'username', sqlType: 'VARCHAR(64)', extract: (r) => str(r.username, 64) },
      { name: 'role', sqlType: 'VARCHAR(64)', extract: (r) => str(r.role, 64) },
      { name: 'screen', sqlType: 'VARCHAR(64)', extract: (r) => str(r.screen, 64) },
      { name: 'action', sqlType: 'VARCHAR(191)', extract: (r) => str(r.action, 191) },
      { name: 'record_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.recordId, 64) },
      { name: 'timestamp', sqlType: 'VARCHAR(32)', extract: (r) => str(r.timestamp, 32) },
    ],
    indexes: ['INDEX idx_audit_time (timestamp)', 'INDEX idx_audit_screen (screen)'],
  },
  {
    dexieTable: 'microscopyScans',
    mysqlTable: 'microscopy_scans',
    titleAr: 'فحوصات الميكروسكوب الرقمي الذكي (Digital Microscopy Vision Scans)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'scan_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.scanNumber, 64) },
      { name: 'modality', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.modality, 32) },
      { name: 'engine_mode', sqlType: 'VARCHAR(64)', extract: (r) => str(r.engineMode, 64) },
      { name: 'patient_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.patientId, 64) },
      { name: 'patient_name', sqlType: 'VARCHAR(191)', extract: (r) => str(r.patientName, 191) },
      { name: 'request_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.requestId, 64) },
      { name: 'stain_or_prep', sqlType: 'VARCHAR(128)', extract: (r) => str(r.stainOrPrep, 128) },
      { name: 'magnification', sqlType: 'VARCHAR(64)', extract: (r) => str(r.magnification, 64) },
      { name: 'overall_diagnosis_ar', sqlType: 'VARCHAR(255)', extract: (r) => str(r.overallDiagnosisAr, 255) },
      { name: 'analyzed_by', sqlType: 'VARCHAR(64)', extract: (r) => str(r.analyzedBy, 64) },
      { name: 'created_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.createdAt, 32) },
    ],
    indexes: ['INDEX idx_micro_scan_mod (modality)', 'INDEX idx_micro_scan_pat (patient_id)'],
  },
  {
    dexieTable: 'aiImageAnalyses',
    mysqlTable: 'ai_image_analyses',
    titleAr: 'جدول تحليلات الصور المجهرية الذكية (AI Image Analyses)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'analysis_number', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.analysisNumber, 64) },
      { name: 'modality', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.modality, 32) },
      { name: 'engine_system_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.engineSystemNameAr, 191) },
      { name: 'patient_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.patientId, 64) },
      { name: 'patient_name', sqlType: 'VARCHAR(191)', extract: (r) => str(r.patientName, 191) },
      { name: 'request_id', sqlType: 'VARCHAR(64)', extract: (r) => str(r.requestId, 64) },
      { name: 'overall_confidence', sqlType: 'DECIMAL(6,2) DEFAULT 0.00', extract: (r) => num(r.overallConfidence) },
      { name: 'requires_specialist_review', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.requiresSpecialistReview) },
      { name: 'has_critical_alert', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.hasCriticalAlert) },
      { name: 'image_deleted', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.imageDeleted) },
      { name: 'findings_count', sqlType: 'INT DEFAULT 0', extract: (r) => num(r.findingsCount) },
      { name: 'status', sqlType: 'VARCHAR(32)', extract: (r) => str(r.status, 32) },
      { name: 'analyzed_by', sqlType: 'VARCHAR(64)', extract: (r) => str(r.analyzedBy, 64) },
      { name: 'created_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.createdAt, 32) },
    ],
    indexes: [
      'INDEX idx_aia_num (analysis_number)',
      'INDEX idx_aia_mod (modality)',
      'INDEX idx_aia_pat (patient_id)',
    ],
  },
  {
    dexieTable: 'aiRecognitionFindings',
    mysqlTable: 'ai_recognition_findings',
    titleAr: 'جدول نتائج التعرف الآلي (AI Recognition Findings)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'analysis_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.analysisId, 64) },
      { name: 'analysis_number', sqlType: 'VARCHAR(64)', extract: (r) => str(r.analysisNumber, 64) },
      { name: 'modality', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.modality, 32) },
      { name: 'group_key', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.groupKey, 32) },
      { name: 'code', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.code, 64) },
      { name: 'name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameAr, 191) },
      { name: 'name_en', sqlType: 'VARCHAR(191)', extract: (r) => str(r.nameEn, 191) },
      { name: 'count_or_grade', sqlType: 'VARCHAR(64)', extract: (r) => str(r.countOrGrade, 64) },
      { name: 'confidence', sqlType: 'DECIMAL(6,2) DEFAULT 0.00', extract: (r) => num(r.confidence) },
      { name: 'semantic_color', sqlType: 'VARCHAR(16)', extract: (r) => str(r.semanticColor, 16) },
      { name: 'is_corrected', sqlType: 'TINYINT(1) DEFAULT 0', extract: (r) => boolInt(r.isCorrected) },
      { name: 'created_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.createdAt, 32) },
    ],
    indexes: [
      'INDEX idx_arf_analysis (analysis_id)',
      'INDEX idx_arf_group (group_key)',
      'INDEX idx_arf_code (code)',
    ],
  },
  {
    dexieTable: 'aiCorrections',
    mysqlTable: 'ai_corrections',
    titleAr: 'جدول تصحيحات المستخدمين للتعلم المستمر (AI User Corrections)',
    columns: [
      { name: 'id', sqlType: 'VARCHAR(64) NOT NULL PRIMARY KEY', extract: (r) => str(r.id, 64) },
      { name: 'analysis_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.analysisId, 64) },
      { name: 'finding_id', sqlType: 'VARCHAR(64) NOT NULL', extract: (r) => str(r.findingId, 64) },
      { name: 'modality', sqlType: 'VARCHAR(32) NOT NULL', extract: (r) => str(r.modality, 32) },
      { name: 'group_key', sqlType: 'VARCHAR(32)', extract: (r) => str(r.groupKey, 32) },
      { name: 'original_code', sqlType: 'VARCHAR(64)', extract: (r) => str(r.originalCode, 64) },
      { name: 'original_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.originalNameAr, 191) },
      { name: 'corrected_code', sqlType: 'VARCHAR(64)', extract: (r) => str(r.correctedCode, 64) },
      { name: 'corrected_name_ar', sqlType: 'VARCHAR(191)', extract: (r) => str(r.correctedNameAr, 191) },
      { name: 'corrected_count_or_grade', sqlType: 'VARCHAR(64)', extract: (r) => str(r.correctedCountOrGrade, 64) },
      { name: 'correction_reason', sqlType: 'VARCHAR(255)', extract: (r) => str(r.correctionReason, 255) },
      { name: 'corrected_by', sqlType: 'VARCHAR(64)', extract: (r) => str(r.correctedBy, 64) },
      { name: 'created_at', sqlType: 'VARCHAR(32)', extract: (r) => str(r.createdAt, 32) },
    ],
    indexes: [
      'INDEX idx_aic_analysis (analysis_id)',
      'INDEX idx_aic_mod (modality)',
      'INDEX idx_aic_orig (original_code)',
    ],
  },
];

export function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  if (typeof val === 'boolean') return val ? '1' : '0';
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\0/g, '\\0');
  return `'${escaped}'`;
}

export function buildCreateTableSQL(mapping: MySQLTableMapping): string {
  const colLines = [
    ...mapping.columns.map((c) => `  \`${c.name}\` ${c.sqlType}`),
    '  `raw_json` LONGTEXT',
    ...(mapping.indexes || []).map((idx) => `  ${idx}`),
  ];
  return `CREATE TABLE IF NOT EXISTS \`${mapping.mysqlTable}\` (\n${colLines.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;`;
}

export function buildFullMySQLDump(
  databaseName: string,
  tablesData: Record<string, Record<string, unknown>[]>,
  includeData = true
): string {
  const safeDb = databaseName.replace(/[^a-zA-Z0-9_]/g, '') || 'tlab_db';
  const lines: string[] = [
    '-- ============================================================================',
    '-- T-Lab Medical Laboratory & ERP System - Full MySQL Database Dump',
    `-- Compatible with: MySQL 5.5, 5.6, 5.7, and MySQL 8.0.28+ (Community Server)`,
    `-- Generated At: ${new Date().toISOString()}`,
    `-- Target Database: ${safeDb}`,
    '-- ============================================================================',
    '',
    'SET NAMES utf8;',
    'SET time_zone = "+00:00";',
    'SET foreign_key_checks = 0;',
    'SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";',
    '',
    `CREATE DATABASE IF NOT EXISTS \`${safeDb}\` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;`,
    `USE \`${safeDb}\`;`,
    '',
  ];

  for (const mapping of MYSQL_TABLES_CONFIG) {
    lines.push(`-- --------------------------------------------------------`);
    lines.push(`-- Table structure for table \`${mapping.mysqlTable}\` (${mapping.titleAr})`);
    lines.push(`-- --------------------------------------------------------`);
    lines.push(buildCreateTableSQL(mapping));
    lines.push('');

    if (includeData) {
      const rows = tablesData[mapping.dexieTable] || [];
      if (rows.length > 0) {
        const colNames = [...mapping.columns.map((c) => `\`${c.name}\``), '`raw_json`'].join(', ');
        lines.push(`-- Dumping data for table \`${mapping.mysqlTable}\` (${rows.length} rows)`);

        // Batch INSERT in chunks of 100 rows for MySQL 5.5 max_allowed_packet safety
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const valuesList = chunk.map((row) => {
            const vals = [
              ...mapping.columns.map((c) => escapeSqlValue(c.extract(row))),
              escapeSqlValue(JSON.stringify(row)),
            ];
            return `(${vals.join(', ')})`;
          });
          lines.push(
            `REPLACE INTO \`${mapping.mysqlTable}\` (${colNames}) VALUES\n${valuesList.join(',\n')};`
          );
        }
        lines.push('');
      }
    }
  }

  lines.push('SET foreign_key_checks = 1;');
  lines.push('-- End of T-Lab MySQL Dump');
  return lines.join('\n');
}

/**
 * Generates a MySQL 5.5 & 8.0.28 script with ALL 26 tables created and emptied (TRUNCATED),
 * EXCEPT the `users` table which is populated with the user accounts.
 */
export function buildEmptyExceptUsersMySQLDump(
  databaseName: string,
  usersRows: Record<string, unknown>[]
): string {
  const safeDb = databaseName.replace(/[^a-zA-Z0-9_]/g, '') || 'tlab_db';
  const defaultUsers: Record<string, unknown>[] =
    usersRows && usersRows.length > 0
      ? usersRows
      : [
          { id: 'usr_1', username: 'owner', passwordHash: 'owner123', fullNameAr: 'د. طارق المنشاوي (المالك)', fullNameEn: 'Dr. Tarek El-Menshawy (Owner)', role: 'Owner', employeeId: 'emp_1', active: true, createdAt: '2022-01-10' },
          { id: 'usr_2', username: 'doctor', passwordHash: 'doctor123', fullNameAr: 'د. سلمى عبد الرحمن', fullNameEn: 'Dr. Salma Abdelrahman', role: 'Doctor', employeeId: 'emp_2', active: true, createdAt: '2022-03-15' },
          { id: 'usr_3', username: 'chemist', passwordHash: 'chemist123', fullNameAr: 'ك. محمود الشافعي', fullNameEn: 'Mahmoud El-Shafei', role: 'Chemist', employeeId: 'emp_3', active: true, createdAt: '2023-01-20' },
          { id: 'usr_4', username: 'technician', passwordHash: 'tech123', fullNameAr: 'أحمد حسن فؤاد', fullNameEn: 'Ahmed Hassan Fouad', role: 'Technician', employeeId: 'emp_4', active: true, createdAt: '2023-05-01' },
          { id: 'usr_5', username: 'admin', passwordHash: 'admin123', fullNameAr: 'مريم عادل نصار', fullNameEn: 'Mariam Adel Nassar', role: 'Receptionist', employeeId: 'emp_5', active: true, createdAt: '2023-07-12' },
          { id: 'usr_6', username: 'accountant', passwordHash: 'accountant123', fullNameAr: 'خالد سعيد منصور', fullNameEn: 'Khaled Saeed Mansour', role: 'Accountant', employeeId: 'emp_6', active: true, createdAt: '2022-11-01' },
        ];

  const lines: string[] = [
    '-- ============================================================================',
    '-- T-Lab Medical Laboratory & ERP System - EMPTY DATABASE (EXCEPT USERS TABLE)',
    '-- اسكريبت قاعدة بيانات فارغة الجداول بالكامل ماعدا جدول المستخدمين (users)',
    '-- Compatible with: MySQL 5.5, 5.6, 5.7, and MySQL 8.0.28+ (Community Server)',
    `-- Generated At: ${new Date().toISOString()}`,
    `-- Target Database: ${safeDb}`,
    '-- ============================================================================',
    '',
    'SET NAMES utf8;',
    'SET time_zone = "+00:00";',
    'SET foreign_key_checks = 0;',
    'SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";',
    '',
    `CREATE DATABASE IF NOT EXISTS \`${safeDb}\` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;`,
    `USE \`${safeDb}\`;`,
    '',
  ];

  for (const mapping of MYSQL_TABLES_CONFIG) {
    lines.push(`-- --------------------------------------------------------`);
    lines.push(`-- Table structure for table \`${mapping.mysqlTable}\` (${mapping.titleAr})`);
    lines.push(`-- --------------------------------------------------------`);
    lines.push(buildCreateTableSQL(mapping));
    lines.push(`TRUNCATE TABLE \`${mapping.mysqlTable}\`;`);
    lines.push('');

    if (mapping.dexieTable === 'users') {
      const colNames = [...mapping.columns.map((c) => `\`${c.name}\``), '`raw_json`'].join(', ');
      lines.push(`-- Dumping data ONLY for table \`users\` (${defaultUsers.length} user accounts)`);
      const valuesList = defaultUsers.map((row) => {
        const vals = [
          ...mapping.columns.map((c) => escapeSqlValue(c.extract(row))),
          escapeSqlValue(JSON.stringify(row)),
        ];
        return `(${vals.join(', ')})`;
      });
      lines.push(
        `REPLACE INTO \`${mapping.mysqlTable}\` (${colNames}) VALUES\n${valuesList.join(',\n')};`
      );
      lines.push('');
    }
  }

  lines.push('SET foreign_key_checks = 1;');
  lines.push('-- End of T-Lab Empty Database (Users Only) SQL Script');
  return lines.join('\n');
}

