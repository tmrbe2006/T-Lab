import { db } from './database';
import type {
  Account,
  CostCenter,
  InventoryCategory,
  InventoryItem,
  InventoryLot,
  JournalEntry,
  PeriodClosingLock,
  PurchaseInvoice,
  ReturnNote,
  StockMovement,
  StockMovementType,
  StockTakingSession,
  Supplier,
  TestBOM,
} from '../types';

export async function seedErpData(forceReset = false): Promise<void> {
  if (!forceReset) {
    const existingItems = await db.inventoryItems.count();
    if (existingItems > 0) return;
  }

  // 1. Hierarchical IFRS Chart of Accounts (Levels 1 to 4 + compatibility codes)
  const hierarchicalAccounts: Account[] = [
    // Level 1
    { id: 'ifrs_1', code: '1', nameAr: 'الأصول (Assets)', nameEn: 'Assets', type: 'asset', level: 1, isGroup: true, balance: 642800 },
    { id: 'ifrs_2', code: '2', nameAr: 'الخصوم والالتزامات (Liabilities)', nameEn: 'Liabilities', type: 'liability', level: 1, isGroup: true, balance: 148500 },
    { id: 'ifrs_3', code: '3', nameAr: 'حقوق الملكية (Equity)', nameEn: 'Equity', type: 'equity', level: 1, isGroup: true, balance: 420000 },
    { id: 'ifrs_4', code: '4', nameAr: 'الإيرادات (Revenues)', nameEn: 'Revenues', type: 'revenue', level: 1, isGroup: true, balance: 245000 },
    { id: 'ifrs_5', code: '5', nameAr: 'المصروفات والتكاليف (Expenses)', nameEn: 'Expenses', type: 'expense', level: 1, isGroup: true, balance: 170700 },

    // Level 2 - Assets
    { id: 'ifrs_1_1', code: '1.1', parentCode: '1', nameAr: 'الأصول المتداولة', nameEn: 'Current Assets', type: 'asset', level: 2, isGroup: true, balance: 392800 },
    { id: 'ifrs_1_2', code: '1.2', parentCode: '1', nameAr: 'الأصول غير المتداولة (الثابتة)', nameEn: 'Non-Current Assets', type: 'asset', level: 2, isGroup: true, balance: 250000 },

    // Level 3 & 4 - Current Assets
    { id: 'ifrs_1_1_1', code: '1.1.1', parentCode: '1.1', nameAr: 'النقدية وما في حكمها', nameEn: 'Cash & Cash Equivalents', type: 'asset', level: 3, isGroup: true, balance: 180900 },
    { id: 'acc_1', code: '1101', parentCode: '1.1.1', nameAr: '1.1.1.1 الصندوق النقدي الرئيسي', nameEn: 'Main Cashbox (1.1.1.1)', type: 'asset', level: 4, isGroup: false, balance: 68400 },
    { id: 'acc_2', code: '1102', parentCode: '1.1.1', nameAr: '1.1.1.2 البنك والحسابات الجارية', nameEn: 'Bank & POS Accounts (1.1.1.2)', type: 'asset', level: 4, isGroup: false, balance: 112500 },

    { id: 'ifrs_1_1_2', code: '1.1.2', parentCode: '1.1', nameAr: 'العملاء والمدينون', nameEn: 'Trade & Other Receivables', type: 'asset', level: 3, isGroup: true, balance: 42420 },
    { id: 'acc_3', code: '1103', parentCode: '1.1.2', nameAr: '1.1.2.1 ذمم المرضى والعملاء الآجلين', nameEn: 'Patients Receivable (1.1.2.1)', type: 'asset', level: 4, isGroup: false, balance: 18420 },
    { id: 'ifrs_1_1_2_2', code: '1.1.2.2', parentCode: '1.1.2', nameAr: 'شركات التأمين الطبي المتعاقدة', nameEn: 'Insurance Companies Receivable', type: 'asset', level: 4, isGroup: false, balance: 24000 },

    { id: 'ifrs_1_1_3', code: '1.1.3', parentCode: '1.1', nameAr: 'المخزون الطبي والمعملي', nameEn: 'Medical Lab Inventory', type: 'asset', level: 3, isGroup: true, balance: 154800 },
    { id: 'ifrs_1_1_3_1', code: '1.1.3.1', parentCode: '1.1.3', nameAr: 'مخزون الكواشف والمحاليل الكيميائية', nameEn: 'Chemical Reagents Inventory', type: 'asset', level: 4, isGroup: false, balance: 108500 },
    { id: 'ifrs_1_1_3_2', code: '1.1.3.2', parentCode: '1.1.3', nameAr: 'مخزون المستهلكات والأنابيب الطبية', nameEn: 'Lab Consumables Inventory', type: 'asset', level: 4, isGroup: false, balance: 38200 },
    { id: 'ifrs_1_1_3_3', code: '1.1.3.3', parentCode: '1.1.3', nameAr: 'مخزون مواد التعبئة والباركود', nameEn: 'Packaging & Labels Inventory', type: 'asset', level: 4, isGroup: false, balance: 8100 },

    { id: 'ifrs_1_1_4', code: '1.1.4', parentCode: '1.1', nameAr: 'مصروفات مدفوعة مقدماً وضرائب مدخلات', nameEn: 'Prepayments & Input Tax', type: 'asset', level: 3, isGroup: true, balance: 14680 },
    { id: 'ifrs_1_1_4_2', code: '1.1.4.2', parentCode: '1.1.4', nameAr: 'ضريبة القيمة المضافة للمشتريات (مدخلات)', nameEn: 'VAT Input Tax Receivable', type: 'asset', level: 4, isGroup: false, balance: 14680 },

    // Fixed Assets
    { id: 'ifrs_1_2_1', code: '1.2.1', parentCode: '1.2', nameAr: 'أجهزة ومعدات المختبر التحليلية', nameEn: 'Analytical Lab Equipment', type: 'asset', level: 3, isGroup: false, balance: 295000 },
    { id: 'ifrs_1_2_4', code: '1.2.4', parentCode: '1.2', nameAr: 'مجمع إهلاك الأجهزة والمعدات', nameEn: 'Accumulated Depreciation', type: 'asset', level: 3, isGroup: false, balance: -45000 },

    // Level 2 & 3 - Liabilities
    { id: 'ifrs_2_1', code: '2.1', parentCode: '2', nameAr: 'الخصوم المتداولة', nameEn: 'Current Liabilities', type: 'liability', level: 2, isGroup: true, balance: 148500 },
    { id: 'ifrs_2_1_1', code: '2.1.1', parentCode: '2.1', nameAr: 'الموردون والدائنون التجاريون', nameEn: 'Suppliers & Accounts Payable', type: 'liability', level: 3, isGroup: false, balance: 94720 },
    { id: 'acc_4', code: '2101', parentCode: '2.1', nameAr: '2.1.3.1 ضريبة القيمة المضافة المستحقة (مخرجات)', nameEn: 'VAT Output Payable (2.1.3.1)', type: 'liability', level: 4, isGroup: false, balance: 19860 },
    { id: 'acc_5', code: '2102', parentCode: '2.1', nameAr: '2.1.2.2 ذمم الأطباء المحولين (عمولات مستحقة)', nameEn: 'Doctors Commissions Payable', type: 'liability', level: 4, isGroup: false, balance: 18920 },
    { id: 'ifrs_2_1_2_1', code: '2.1.2.1', parentCode: '2.1', nameAr: 'رواتب وأجور مستحقة الدفع', nameEn: 'Accrued Salaries Payable', type: 'liability', level: 4, isGroup: false, balance: 15000 },

    // Level 2 & 3 - Equity
    { id: 'ifrs_3_1', code: '3.1', parentCode: '3', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', type: 'equity', level: 2, isGroup: false, balance: 350000 },
    { id: 'ifrs_3_2', code: '3.2', parentCode: '3', nameAr: 'الأرباح المحتجزة', nameEn: 'Retained Earnings', type: 'equity', level: 2, isGroup: false, balance: 50000 },
    { id: 'ifrs_3_3', code: '3.3', parentCode: '3', nameAr: 'احتياطي نظامي', nameEn: 'Statutory Reserve', type: 'equity', level: 2, isGroup: false, balance: 20000 },

    // Level 2 & 3 - Revenues
    { id: 'ifrs_4_1', code: '4.1', parentCode: '4', nameAr: 'إيرادات النشاط الرئيسي', nameEn: 'Operating Lab Revenues', type: 'revenue', level: 2, isGroup: true, balance: 251200 },
    { id: 'acc_6', code: '4101', parentCode: '4.1', nameAr: '4.1.1 إيرادات التحاليل الطبية', nameEn: 'Medical Lab Tests Revenue', type: 'revenue', level: 3, isGroup: false, balance: 218500 },
    { id: 'acc_7', code: '4102', parentCode: '4.1', nameAr: '4.1.2 إيرادات السحب المنزلي والتعاقدات', nameEn: 'Home Visit & Contract Revenue', type: 'revenue', level: 3, isGroup: false, balance: 32700 },
    { id: 'ifrs_4_2', code: '4.2', parentCode: '4', nameAr: 'مردودات ومسموحات وخصومات المبيعات', nameEn: 'Sales Returns & Allowances', type: 'revenue', level: 2, isGroup: false, balance: -6200 },

    // Level 2 & 3 - Expenses & COGS
    { id: 'ifrs_5_1', code: '5.1', parentCode: '5', nameAr: 'تكلفة الإيرادات (COGS)', nameEn: 'Cost of Goods & Services Sold', type: 'expense', level: 2, isGroup: true, balance: 78400 },
    { id: 'ifrs_5_1_1', code: '5.1.1', parentCode: '5.1', nameAr: 'تكلفة الكواشف والمحاليل المستهلكة بالتحاليل', nameEn: 'Consumed Reagents Cost (COGS)', type: 'expense', level: 3, isGroup: false, balance: 46200 },
    { id: 'ifrs_5_1_2', code: '5.1.2', parentCode: '5.1', nameAr: 'تكلفة المستهلكات والأنابيب الطبية', nameEn: 'Consumed Tubes & Disposables Cost', type: 'expense', level: 3, isGroup: false, balance: 14100 },
    { id: 'acc_11', code: '5104', parentCode: '5.1', nameAr: '5.1.3 مصروف المحاليل والمستلزمات المباشرة', nameEn: 'Direct Reagents & Supplies Expense', type: 'expense', level: 3, isGroup: false, balance: 14200 },
    { id: 'ifrs_5_1_4', code: '5.1.4', parentCode: '5.1', nameAr: 'خسائر تلف وانتهاء صلاحية المخزون', nameEn: 'Expired & Damaged Stock Write-off', type: 'expense', level: 3, isGroup: false, balance: 3900 },

    { id: 'ifrs_5_2', code: '5.2', parentCode: '5', nameAr: 'المصروفات التشغيلية والطبية', nameEn: 'Operating Lab Expenses', type: 'expense', level: 2, isGroup: true, balance: 92300 },
    { id: 'acc_8', code: '5101', parentCode: '5.2', nameAr: '5.2.1 مصروف عمولات الأطباء المحولين', nameEn: 'Doctor Commissions Expense', type: 'expense', level: 3, isGroup: false, balance: 16450 },
    { id: 'acc_9', code: '5102', parentCode: '5.2', nameAr: '5.2.2 مصروف الرواتب والأجور', nameEn: 'Salaries & Wages Expense', type: 'expense', level: 3, isGroup: false, balance: 45000 },
    { id: 'acc_10', code: '5103', parentCode: '5.2', nameAr: '5.2.3 مصروف الإيجار الشهري للمختبر', nameEn: 'Facility Rent Expense', type: 'expense', level: 3, isGroup: false, balance: 16000 },
    { id: 'acc_12', code: '5105', parentCode: '5.2', nameAr: '5.2.4 مصروف الكهرباء والمياه والمرافق', nameEn: 'Utilities Expense', type: 'expense', level: 3, isGroup: false, balance: 5900 },
    { id: 'acc_13', code: '5106', parentCode: '5.2', nameAr: '5.2.5 مصروف صيانة ومعايرة الأجهزة', nameEn: 'Analyzer Calibration & Maintenance', type: 'expense', level: 3, isGroup: false, balance: 6600 },
    { id: 'acc_14', code: '5107', parentCode: '5.2', nameAr: '5.3.1 مصروفات إدارية وعمومية أخرى', nameEn: 'General & Admin Expenses', type: 'expense', level: 3, isGroup: false, balance: 2350 },
  ];

  // 2. Cost Centers (5 Medical Lab Cost Centers)
  const costCenters: CostCenter[] = [
    { id: 'cc_1', code: 'CC-HEM', nameAr: 'قسم أمراض الدم (Hematology)', nameEn: 'Hematology Department', departmentAr: 'أمراض الدم', budgetMonthly: 45000, actualSpent: 32400, active: true },
    { id: 'cc_2', code: 'CC-CHEM', nameAr: 'قسم الكيمياء الحيوية (Biochemistry)', nameEn: 'Biochemistry Department', departmentAr: 'الكيمياء الحيوية', budgetMonthly: 75000, actualSpent: 61800, active: true },
    { id: 'cc_3', code: 'CC-HORM', nameAr: 'قسم الهرمونات والمناعة (Immunoassay)', nameEn: 'Hormones & Immunology Dept', departmentAr: 'الهرمونات والمناعة', budgetMonthly: 90000, actualSpent: 74200, active: true },
    { id: 'cc_4', code: 'CC-MIC', nameAr: 'قسم الميكروبيولوجي والطفيليات', nameEn: 'Microbiology & Parasitology', departmentAr: 'الطفيليات والميكروبيولوجي', budgetMonthly: 25000, actualSpent: 16500, active: true },
    { id: 'cc_5', code: 'CC-ADM', nameAr: 'الإدارة والاستقبال وسحب العينات', nameEn: 'Reception, Phlebotomy & Admin', departmentAr: 'الإدارة العامة', budgetMonthly: 35000, actualSpent: 28900, active: true },
  ];

  // 3. Period Locks
  const periodLocks: PeriodClosingLock[] = [
    { id: 'pl_1', periodMonth: '2026-09', locked: true, closedBy: 'owner', closedAt: '2026-10-02 18:00', retainedEarningsTransferred: 38400, notes: 'إقفال شهر سبتمبر 2026 وترحيل الأرباح' },
    { id: 'pl_2', periodMonth: '2026-10', locked: false, closedBy: 'accountant', closedAt: '2026-11-01 15:30', retainedEarningsTransferred: 44200, notes: 'مفتوح للمراجعة الختامية' },
    { id: 'pl_3', periodMonth: '2026-11', locked: false, notes: 'الفترة المالية الجارية (نوفمبر 2026)' },
  ];

  // 4. 10 Medical Lab Suppliers
  const suppliers: Supplier[] = [
    { id: 'sup_1', code: 'SUP-001', nameAr: 'شركة روش دياجنوستيكس مصر', nameEn: 'Roche Diagnostics Egypt', taxNumber: '310-445-889', commercialRegister: 'CR-88210', contactPerson: 'م. سامح عبد اللطيف', phone: '01009911221', email: 'orders.egypt@roche-demo.com', address: 'القاهرة الجديدة - التجمع الخامس', paymentTermsDays: 30, creditLimit: 250000, currentBalance: 28500, rating: 5, active: true },
    { id: 'sup_2', code: 'SUP-002', nameAr: 'شركة سيسمكس الشرق الأوسط للكواشف', nameEn: 'Sysmex Middle East Reagents', taxNumber: '412-558-112', commercialRegister: 'CR-77319', contactPerson: 'د. هاني واصف', phone: '01009911222', email: 'supply@sysmex-demo.com', address: 'المهندسين - الجيزة', paymentTermsDays: 45, creditLimit: 180000, currentBalance: 16400, rating: 5, active: true },
    { id: 'sup_3', code: 'SUP-003', nameAr: 'شركة أبوت المختبرية (Abbott Labs)', nameEn: 'Abbott Laboratories Diagnostics', taxNumber: '519-221-904', commercialRegister: 'CR-66102', contactPerson: 'د. شيرين فؤاد', phone: '01009911223', email: 'me.diagnostics@abbott-demo.com', address: 'المعادي - القاهرة', paymentTermsDays: 30, creditLimit: 220000, currentBalance: 19200, rating: 5, active: true },
    { id: 'sup_4', code: 'SUP-004', nameAr: 'جرينر بيو-ون لأنابيب سحب الدم (Vacuette)', nameEn: 'Greiner Bio-One Vacuette Supply', taxNumber: '620-334-105', commercialRegister: 'CR-55190', contactPerson: 'أ. وائل الغندور', phone: '01009911224', email: 'sales@vacuette-demo.com', address: 'مدينة نصر - المنطقة الحرة', paymentTermsDays: 15, creditLimit: 90000, currentBalance: 8400, rating: 4, active: true },
    { id: 'sup_5', code: 'SUP-005', nameAr: 'شركة الجمهورية للأدوية والمستلزمات الطبية', nameEn: 'Al-Gomhouria Medical & Chemicals', taxNumber: '100-884-220', commercialRegister: 'CR-11044', contactPerson: 'أ. مجدي سليمان', phone: '01009911225', email: 'b2b@gomhouria-demo.com', address: 'الأميرية - القاهرة', paymentTermsDays: 30, creditLimit: 150000, currentBalance: 6220, rating: 4, active: true },
    { id: 'sup_6', code: 'SUP-006', nameAr: 'بيوميريو للمزارع والميكروبيولوجي', nameEn: 'BioMérieux Clinical Diagnostics', taxNumber: '744-119-302', commercialRegister: 'CR-99401', contactPerson: 'د. تامر عزمي', phone: '01009911226', email: 'support@biomerieux-demo.com', address: 'الدقي - الجيزة', paymentTermsDays: 30, creditLimit: 120000, currentBalance: 5400, rating: 5, active: true },
    { id: 'sup_7', code: 'SUP-007', nameAr: 'ميندراي للتجهيزات الطبية والمحاليل', nameEn: 'Mindray Medical Egypt', taxNumber: '815-902-411', commercialRegister: 'CR-43910', contactPerson: 'م. رامي شوقي', phone: '01009911227', email: 'reagents@mindray-demo.com', address: 'مصر الجديدة - القاهرة', paymentTermsDays: 45, creditLimit: 140000, currentBalance: 4800, rating: 4, active: true },
    { id: 'sup_8', code: 'SUP-008', nameAr: 'سيمنز هيلثينيرز (Siemens Healthineers)', nameEn: 'Siemens Healthineers Diagnostics', taxNumber: '901-772-618', commercialRegister: 'CR-30112', contactPerson: 'م. نهى زهران', phone: '01009911228', email: 'lab.care@siemens-demo.com', address: 'القرية الذكية - الجيزة', paymentTermsDays: 60, creditLimit: 300000, currentBalance: 3600, rating: 5, active: true },
    { id: 'sup_9', code: 'SUP-009', nameAr: 'بيكمان كولتر للتحاليل الآلية', nameEn: 'Beckman Coulter Life Sciences', taxNumber: '214-663-509', commercialRegister: 'CR-21890', contactPerson: 'د. عادل نصار', phone: '01009911229', email: 'orders@beckman-demo.com', address: 'الزمالك - القاهرة', paymentTermsDays: 30, creditLimit: 160000, currentBalance: 2200, rating: 4, active: true },
    { id: 'sup_10', code: 'SUP-010', nameAr: 'المتحدة للمطبوعات والباركود الطبي', nameEn: 'United Medical Barcode & Packaging', taxNumber: '318-501-771', commercialRegister: 'CR-19400', contactPerson: 'أ. حسن فرغلي', phone: '01009911230', email: 'print@unitedpack-demo.com', address: 'العبور - المنطقة الصناعية', paymentTermsDays: 15, creditLimit: 50000, currentBalance: 0, rating: 4, active: true },
  ];

  // 5. 50 Inventory Items (20 chemical, 20 consumable, 5 equipment, 5 packaging)
  const rawItems: Array<{
    code: string;
    nameAr: string;
    nameEn: string;
    category: InventoryCategory;
    subCategory: string;
    unit: InventoryItem['unit'];
    purchaseUnit: string;
    conversionFactor: number;
    storageTemp: InventoryItem['storageTemp'];
    minStock: number;
    maxStock: number;
    reorderPoint: number;
    reorderQty: number;
    currentStock: number;
    unitCost: number;
    costMethod: InventoryItem['costMethod'];
    supplierId: string;
    hazardClass?: InventoryItem['hazardClass'];
    expiryAfterOpeningDays?: number;
  }> = [
    // Key required items first (1..6)
    { code: 'CHM-001', nameAr: 'كاشف صورة الدم الكاملة CBC Diluent & Lyse', nameEn: 'Sysmex CBC Diluent & Lyse Kit', category: 'chemical', subCategory: 'أمراض الدم', unit: 'ml', purchaseUnit: 'Box (2000 ml)', conversionFactor: 2000, storageTemp: '15-25°C', minStock: 1000, maxStock: 10000, reorderPoint: 2000, reorderQty: 4000, currentStock: 4800, unitCost: 1.8, costMethod: 'FIFO', supplierId: 'sup_2', expiryAfterOpeningDays: 60 },
    { code: 'CON-001', nameAr: 'أنابيب سحب دم EDTA غطاء بنفسجي 3 مل', nameEn: 'Vacuette EDTA K3 Purple Tube 3mL', category: 'consumable', subCategory: 'أنابيب سحب الدم', unit: 'piece', purchaseUnit: 'Rack (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 300, maxStock: 3000, reorderPoint: 500, reorderQty: 1000, currentStock: 140, unitCost: 3.5, costMethod: 'FIFO', supplierId: 'sup_4' }, // Low stock (< minStock)
    { code: 'CHM-002', nameAr: 'كاشف الجلوكوز الأنزيمي (Glucose GOD-PAP)', nameEn: 'Glucose GOD-PAP Enzymatic Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (500 ml)', conversionFactor: 500, storageTemp: '2-8°C', minStock: 250, maxStock: 2500, reorderPoint: 500, reorderQty: 1000, currentStock: 650, unitCost: 2.4, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 30 }, // Includes expired lot
    { code: 'CON-002', nameAr: 'أطباق بتري معقمة 90 مم للمزارع', nameEn: 'Sterile Petri Dishes 90mm', category: 'consumable', subCategory: 'ميكروبيولوجي', unit: 'piece', purchaseUnit: 'Carton (500 pcs)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 200, maxStock: 2000, reorderPoint: 400, reorderQty: 500, currentStock: 1150, unitCost: 2.2, costMethod: 'AVG', supplierId: 'sup_6' }, // Sufficient stock
    { code: 'CON-003', nameAr: 'قفازات لاتكس/نيتريل طبية بدون بودرة (M)', nameEn: 'Powder-Free Nitrile Exam Gloves (M)', category: 'consumable', subCategory: 'معدات الوقاية PPE', unit: 'piece', purchaseUnit: 'Box (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 300, maxStock: 3000, reorderPoint: 600, reorderQty: 1000, currentStock: 520, unitCost: 1.9, costMethod: 'AVG', supplierId: 'sup_5' }, // Near reorder point (< 600)
    { code: 'CHM-003', nameAr: 'كاشف السكر التراكمي HbA1c التربيديمتري', nameEn: 'Tina-quant HbA1c Gen.3 Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'test', purchaseUnit: 'Cassette (100 tests)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 80, maxStock: 600, reorderPoint: 150, reorderQty: 200, currentStock: 240, unitCost: 38.0, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 28 },

    // Remaining Chemical Reagents (CHM-004 .. CHM-020)
    { code: 'CHM-004', nameAr: 'كاشف الكوليسترول الكلي (CHOL Reagent)', nameEn: 'Total Cholesterol Enzymatic Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (400 ml)', conversionFactor: 400, storageTemp: '2-8°C', minStock: 200, maxStock: 1600, reorderPoint: 350, reorderQty: 800, currentStock: 720, unitCost: 3.2, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 45 },
    { code: 'CHM-005', nameAr: 'كاشف الدهون الثلاثية (Triglycerides GPO)', nameEn: 'Triglycerides GPO-PAP Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (400 ml)', conversionFactor: 400, storageTemp: '2-8°C', minStock: 200, maxStock: 1600, reorderPoint: 350, reorderQty: 800, currentStock: 680, unitCost: 3.6, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 45 },
    { code: 'CHM-006', nameAr: 'كاشف إنزيم الكبد ALT (SGPT) الحركي', nameEn: 'ALT / SGPT UV Kinetic Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (250 ml)', conversionFactor: 250, storageTemp: '2-8°C', minStock: 150, maxStock: 1200, reorderPoint: 300, reorderQty: 500, currentStock: 490, unitCost: 3.1, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 30 },
    { code: 'CHM-007', nameAr: 'كاشف إنزيم الكبد AST (SGOT) الحركي', nameEn: 'AST / SGOT UV Kinetic Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (250 ml)', conversionFactor: 250, storageTemp: '2-8°C', minStock: 150, maxStock: 1200, reorderPoint: 300, reorderQty: 500, currentStock: 460, unitCost: 3.1, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 30 },
    { code: 'CHM-008', nameAr: 'كاشف الكرياتينين الحركي (Creatinine Jaffe)', nameEn: 'Creatinine Kinetic Jaffe Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (500 ml)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 250, maxStock: 2000, reorderPoint: 450, reorderQty: 1000, currentStock: 880, unitCost: 2.1, costMethod: 'FIFO', supplierId: 'sup_7', hazardClass: 'corrosive', expiryAfterOpeningDays: 60 },
    { code: 'CHM-009', nameAr: 'كاشف البولينا UV (Urea / BUN Reagent)', nameEn: 'Urea / BUN UV Enzymatic Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (500 ml)', conversionFactor: 500, storageTemp: '2-8°C', minStock: 200, maxStock: 1500, reorderPoint: 400, reorderQty: 500, currentStock: 610, unitCost: 2.5, costMethod: 'FIFO', supplierId: 'sup_7', expiryAfterOpeningDays: 30 },
    { code: 'CHM-010', nameAr: 'كاشف حمض اليوريك (Uric Acid Uricase)', nameEn: 'Uric Acid Enzymatic Reagent', category: 'chemical', subCategory: 'الكيمياء الحيوية', unit: 'ml', purchaseUnit: 'Kit (300 ml)', conversionFactor: 300, storageTemp: '2-8°C', minStock: 150, maxStock: 1200, reorderPoint: 280, reorderQty: 600, currentStock: 420, unitCost: 2.9, costMethod: 'FIFO', supplierId: 'sup_7', expiryAfterOpeningDays: 45 },
    { code: 'CHM-011', nameAr: 'كاشف هرمون الغدة الدرقية (Elecsys TSH)', nameEn: 'Elecsys TSH CLIA Immunoassay Kit', category: 'chemical', subCategory: 'الهرمونات والمناعة', unit: 'test', purchaseUnit: 'Pack (100 tests)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 60, maxStock: 500, reorderPoint: 100, reorderQty: 200, currentStock: 175, unitCost: 42.0, costMethod: 'FIFO', supplierId: 'sup_1', expiryAfterOpeningDays: 28 },
    { code: 'CHM-012', nameAr: 'كاشف فيتامين د الكلي (Architect 25-OH Vit D)', nameEn: 'Architect 25-OH Vitamin D Reagent', category: 'chemical', subCategory: 'الهرمونات والمناعة', unit: 'test', purchaseUnit: 'Pack (100 tests)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 50, maxStock: 400, reorderPoint: 90, reorderQty: 100, currentStock: 82, unitCost: 95.0, costMethod: 'FIFO', supplierId: 'sup_3', expiryAfterOpeningDays: 21 }, // Near reorder
    { code: 'CHM-013', nameAr: 'كاشف مخزون الحديد (Ferritin CLIA Kit)', nameEn: 'Ferritin Chemiluminescence Kit', category: 'chemical', subCategory: 'الهرمونات والمناعة', unit: 'test', purchaseUnit: 'Pack (100 tests)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 50, maxStock: 400, reorderPoint: 100, reorderQty: 100, currentStock: 155, unitCost: 52.0, costMethod: 'FIFO', supplierId: 'sup_3', expiryAfterOpeningDays: 28 },
    { code: 'CHM-014', nameAr: 'كاشف بروتين سي التفاعلي (CRP Latex/Turbidimetric)', nameEn: 'CRP Quantitative Immunoturbidimetric', category: 'chemical', subCategory: 'المناعة', unit: 'test', purchaseUnit: 'Kit (100 tests)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 50, maxStock: 400, reorderPoint: 90, reorderQty: 100, currentStock: 140, unitCost: 26.0, costMethod: 'FIFO', supplierId: 'sup_8', expiryAfterOpeningDays: 30 },
    { code: 'CHM-015', nameAr: 'كاشف سيولة الدم البروثرومبين (Thromborel S PT)', nameEn: 'Thromborel S Prothrombin Time Reagent', category: 'chemical', subCategory: 'أمراض الدم', unit: 'test', purchaseUnit: 'Box (10x4mL)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 60, maxStock: 500, reorderPoint: 100, reorderQty: 200, currentStock: 190, unitCost: 22.0, costMethod: 'FIFO', supplierId: 'sup_8', expiryAfterOpeningDays: 7 },
    { code: 'CHM-016', nameAr: 'كاشف إنزيم القلب تروبونين (hs-Troponin I)', nameEn: 'High-Sensitivity Troponin-I STAT Kit', category: 'chemical', subCategory: 'الهرمونات والمناعة', unit: 'test', purchaseUnit: 'Pack (50 tests)', conversionFactor: 50, storageTemp: '2-8°C', minStock: 30, maxStock: 200, reorderPoint: 50, reorderQty: 100, currentStock: 24, unitCost: 88.0, costMethod: 'FIFO', supplierId: 'sup_3', expiryAfterOpeningDays: 14 }, // Low stock
    { code: 'CHM-017', nameAr: 'محلول معايرة الكيمياء المتعدد (PreciControl ClinChem)', nameEn: 'PreciControl ClinChem Multi QC Serum', category: 'chemical', subCategory: 'محاليل الجودة QC', unit: 'ml', purchaseUnit: 'Box (20 ml)', conversionFactor: 20, storageTemp: '-20°C', minStock: 10, maxStock: 80, reorderPoint: 20, reorderQty: 40, currentStock: 35, unitCost: 65.0, costMethod: 'FIFO', supplierId: 'sup_1', hazardClass: 'biohazard', expiryAfterOpeningDays: 5 },
    { code: 'CHM-018', nameAr: 'كاشف الأجسام المضادة لفيروس سي (HCV ELISA)', nameEn: 'Murex Anti-HCV 4.0 ELISA Kit', category: 'chemical', subCategory: 'المناعة والفيروسات', unit: 'test', purchaseUnit: 'Kit (96 wells)', conversionFactor: 96, storageTemp: '2-8°C', minStock: 48, maxStock: 384, reorderPoint: 96, reorderQty: 192, currentStock: 192, unitCost: 29.0, costMethod: 'FIFO', supplierId: 'sup_3', hazardClass: 'biohazard', expiryAfterOpeningDays: 30 },
    { code: 'CHM-019', nameAr: 'ميديا أجار الدم وأجار ماكونكي للمزارع', nameEn: 'Blood Agar & MacConkey Agar Base', category: 'chemical', subCategory: 'ميكروبيولوجي', unit: 'g', purchaseUnit: 'Bottle (500 g)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 250, maxStock: 2000, reorderPoint: 500, reorderQty: 1000, currentStock: 850, unitCost: 3.4, costMethod: 'AVG', supplierId: 'sup_6', expiryAfterOpeningDays: 90 },
    { code: 'CHM-020', nameAr: 'كاشف دلالات الأورام الكلي (Total PSA CLIA)', nameEn: 'Total PSA Chemiluminescence Reagent', category: 'chemical', subCategory: 'الهرمونات والمناعة', unit: 'test', purchaseUnit: 'Pack (100 tests)', conversionFactor: 100, storageTemp: '2-8°C', minStock: 40, maxStock: 300, reorderPoint: 80, reorderQty: 100, currentStock: 115, unitCost: 64.0, costMethod: 'FIFO', supplierId: 'sup_9', expiryAfterOpeningDays: 28 },

    // Remaining Consumables (CON-004 .. CON-020)
    { code: 'CON-004', nameAr: 'أنابيب سحب دم جل فاصل غطاء أصفر 5 مل (SST)', nameEn: 'Vacuette Serum Gel SST Yellow Tube 5mL', category: 'consumable', subCategory: 'أنابيب سحب الدم', unit: 'piece', purchaseUnit: 'Rack (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 400, maxStock: 4000, reorderPoint: 800, reorderQty: 1500, currentStock: 1650, unitCost: 4.2, costMethod: 'FIFO', supplierId: 'sup_4' },
    { code: 'CON-005', nameAr: 'أنابيب سحب دم سادة غطاء أحمر 4 مل (Plain)', nameEn: 'Vacuette Plain Serum Red Tube 4mL', category: 'consumable', subCategory: 'أنابيب سحب الدم', unit: 'piece', purchaseUnit: 'Rack (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 300, maxStock: 3000, reorderPoint: 600, reorderQty: 1000, currentStock: 1120, unitCost: 3.1, costMethod: 'FIFO', supplierId: 'sup_4' },
    { code: 'CON-006', nameAr: 'أنابيب سترات الصوديوم غطاء أزرق للسيولة 2.7 مل', nameEn: 'Sodium Citrate 3.2% Coagulation Blue Tube', category: 'consumable', subCategory: 'أنابيب سحب الدم', unit: 'piece', purchaseUnit: 'Rack (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 200, maxStock: 2000, reorderPoint: 400, reorderQty: 800, currentStock: 640, unitCost: 3.8, costMethod: 'FIFO', supplierId: 'sup_4' },
    { code: 'CON-007', nameAr: 'أنابيب فلوريد الصوديوم غطاء رمادي للسكر', nameEn: 'Sodium Fluoride Glucose Gray Tube', category: 'consumable', subCategory: 'أنابيب سحب الدم', unit: 'piece', purchaseUnit: 'Rack (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 200, maxStock: 1500, reorderPoint: 350, reorderQty: 600, currentStock: 510, unitCost: 3.6, costMethod: 'FIFO', supplierId: 'sup_4' },
    { code: 'CON-008', nameAr: 'سرنجات طبية معقمة 5 سم (3 قطع)', nameEn: 'Sterile Disposable Syringes 5mL', category: 'consumable', subCategory: 'مستلزمات السحب', unit: 'piece', purchaseUnit: 'Box (200 pcs)', conversionFactor: 200, storageTemp: '15-25°C', minStock: 500, maxStock: 5000, reorderPoint: 1000, reorderQty: 2000, currentStock: 2300, unitCost: 2.0, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-009', nameAr: 'شكاكات سحب دم فراشة (Butterfly Needle 23G)', nameEn: 'Safety Winged Blood Collection Set 23G', category: 'consumable', subCategory: 'مستلزمات السحب', unit: 'piece', purchaseUnit: 'Box (100 pcs)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 150, maxStock: 1500, reorderPoint: 300, reorderQty: 500, currentStock: 420, unitCost: 6.5, costMethod: 'AVG', supplierId: 'sup_4' },
    { code: 'CON-010', nameAr: 'مسحات كحولية طبية معقمة 70% (Alcohol Swabs)', nameEn: 'Isopropyl Alcohol 70% Prep Pads', category: 'consumable', subCategory: 'مطهرات وتعقيم', unit: 'piece', purchaseUnit: 'Box (200 pcs)', conversionFactor: 200, storageTemp: '15-25°C', minStock: 600, maxStock: 6000, reorderPoint: 1200, reorderQty: 2000, currentStock: 3100, unitCost: 0.45, costMethod: 'AVG', supplierId: 'sup_5', hazardClass: 'flammable' },
    { code: 'CON-011', nameAr: 'أطراف ماصات صفراء 20-200 ميكرولتر (Yellow Tips)', nameEn: 'Micropipette Yellow Tips 20-200 µL', category: 'consumable', subCategory: 'بلاستيكيات المختبر', unit: 'piece', purchaseUnit: 'Bag (1000 pcs)', conversionFactor: 1000, storageTemp: '15-25°C', minStock: 1000, maxStock: 10000, reorderPoint: 2000, reorderQty: 4000, currentStock: 5400, unitCost: 0.35, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-012', nameAr: 'أطراف ماصات زرقاء 100-1000 ميكرولتر (Blue Tips)', nameEn: 'Micropipette Blue Tips 100-1000 µL', category: 'consumable', subCategory: 'بلاستيكيات المختبر', unit: 'piece', purchaseUnit: 'Bag (1000 pcs)', conversionFactor: 1000, storageTemp: '15-25°C', minStock: 1000, maxStock: 10000, reorderPoint: 2000, reorderQty: 4000, currentStock: 4800, unitCost: 0.4, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-013', nameAr: 'أكواب عينات بول وبراز معقمة بغطاء لولبي 60 مل', nameEn: 'Sterile Screw-Cap Urine/Stool Cups 60mL', category: 'consumable', subCategory: 'بلاستيكيات المختبر', unit: 'piece', purchaseUnit: 'Carton (500 pcs)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 300, maxStock: 3000, reorderPoint: 600, reorderQty: 1000, currentStock: 920, unitCost: 1.75, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-014', nameAr: 'شرائط فحص البول 10 بارامترات (Combur-10 Test)', nameEn: 'Combur-10 Urine Dipstick Strips', category: 'consumable', subCategory: 'الطفيليات والبول', unit: 'strip', purchaseUnit: 'Tube (100 strips)', conversionFactor: 100, storageTemp: '15-25°C', minStock: 100, maxStock: 1000, reorderPoint: 200, reorderQty: 400, currentStock: 340, unitCost: 4.5, costMethod: 'FIFO', supplierId: 'sup_1' },
    { code: 'CON-015', nameAr: 'شرائح ميكروسكوب زجاجية مصنفرة (72 شريحة)', nameEn: 'Frosted Glass Microscope Slides', category: 'consumable', subCategory: 'ميكروسكوبي', unit: 'piece', purchaseUnit: 'Box (72 pcs)', conversionFactor: 72, storageTemp: '15-25°C', minStock: 216, maxStock: 2160, reorderPoint: 432, reorderQty: 720, currentStock: 864, unitCost: 0.9, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-016', nameAr: 'أغطية شرائح ميكروسكوب (Cover Slips 22x22mm)', nameEn: 'Microscope Cover Glass 22x22mm', category: 'consumable', subCategory: 'ميكروسكوبي', unit: 'box', purchaseUnit: 'Pack (10 boxes)', conversionFactor: 10, storageTemp: '15-25°C', minStock: 10, maxStock: 100, reorderPoint: 20, reorderQty: 40, currentStock: 45, unitCost: 28.0, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-017', nameAr: 'كيوفيتات تفاعل لأجهزة الكيمياء والأوتوميشن', nameEn: 'Optical Reaction Cuvettes Segments', category: 'consumable', subCategory: 'بلاستيكيات المختبر', unit: 'piece', purchaseUnit: 'Box (500 pcs)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 300, maxStock: 3000, reorderPoint: 600, reorderQty: 1000, currentStock: 1250, unitCost: 1.6, costMethod: 'FIFO', supplierId: 'sup_1' },
    { code: 'CON-018', nameAr: 'أنابيب إبندورف لحفظ السيرم 1.5 مل', nameEn: 'Eppendorf Microcentrifuge Tubes 1.5mL', category: 'consumable', subCategory: 'بلاستيكيات المختبر', unit: 'piece', purchaseUnit: 'Bag (500 pcs)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 500, maxStock: 5000, reorderPoint: 1000, reorderQty: 2000, currentStock: 2100, unitCost: 0.65, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-019', nameAr: 'ماسكات طبية ثلاثية الطبقات (Surgical Masks)', nameEn: '3-Ply Medical Face Masks', category: 'consumable', subCategory: 'معدات الوقاية PPE', unit: 'piece', purchaseUnit: 'Box (50 pcs)', conversionFactor: 50, storageTemp: '15-25°C', minStock: 200, maxStock: 2000, reorderPoint: 400, reorderQty: 600, currentStock: 750, unitCost: 1.1, costMethod: 'AVG', supplierId: 'sup_5' },
    { code: 'CON-020', nameAr: 'لاصق طبي بعد السحب (Spot Plasters)', nameEn: 'Sterile Injection Spot Plasters', category: 'consumable', subCategory: 'مستلزمات السحب', unit: 'piece', purchaseUnit: 'Box (500 pcs)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 500, maxStock: 5000, reorderPoint: 1000, reorderQty: 2000, currentStock: 2800, unitCost: 0.3, costMethod: 'AVG', supplierId: 'sup_5' },

    // Equipment & Spare Parts (EQP-001 .. EQP-005)
    { code: 'EQP-001', nameAr: 'ماصة أوتوماتيكية متغيرة الحجم Eppendorf 10-100 µL', nameEn: 'Eppendorf Research Plus Pipette 10-100 µL', category: 'equipment', subCategory: 'أدوات قياس دقيقة', unit: 'piece', purchaseUnit: 'Unit', conversionFactor: 1, storageTemp: '15-25°C', minStock: 2, maxStock: 10, reorderPoint: 3, reorderQty: 3, currentStock: 5, unitCost: 4200, costMethod: 'FIFO', supplierId: 'sup_9' },
    { code: 'EQP-002', nameAr: 'ماصة أوتوماتيكية متغيرة الحجم Eppendorf 100-1000 µL', nameEn: 'Eppendorf Research Plus Pipette 100-1000 µL', category: 'equipment', subCategory: 'أدوات قياس دقيقة', unit: 'piece', purchaseUnit: 'Unit', conversionFactor: 1, storageTemp: '15-25°C', minStock: 2, maxStock: 10, reorderPoint: 3, reorderQty: 3, currentStock: 4, unitCost: 4200, costMethod: 'FIFO', supplierId: 'sup_9' },
    { code: 'EQP-003', nameAr: 'لمبة هالوجين ضوئية لجهاز الكيمياء الحيوية', nameEn: 'Photometer Halogen Lamp 12V/20W', category: 'equipment', subCategory: 'قطع غيار الأجهزة', unit: 'piece', purchaseUnit: 'Unit', conversionFactor: 1, storageTemp: '15-25°C', minStock: 2, maxStock: 8, reorderPoint: 2, reorderQty: 4, currentStock: 3, unitCost: 1450, costMethod: 'FIFO', supplierId: 'sup_7' },
    { code: 'EQP-004', nameAr: 'تورنيكيه طبي سريع الفك (Quick-Release Tourniquet)', nameEn: 'Quick-Release Buckle Tourniquet', category: 'equipment', subCategory: 'غرفة السحب', unit: 'piece', purchaseUnit: 'Pack (10 pcs)', conversionFactor: 10, storageTemp: '15-25°C', minStock: 10, maxStock: 50, reorderPoint: 15, reorderQty: 20, currentStock: 22, unitCost: 45, costMethod: 'AVG', supplierId: 'sup_4' },
    { code: 'EQP-005', nameAr: 'ميزان حرارة ديجيتال للثلاجات الطبية بإنذار', nameEn: 'Calibrated Fridge Data-Logger Thermometer', category: 'equipment', subCategory: 'مراقبة الجودة', unit: 'piece', purchaseUnit: 'Unit', conversionFactor: 1, storageTemp: '15-25°C', minStock: 3, maxStock: 12, reorderPoint: 4, reorderQty: 4, currentStock: 6, unitCost: 680, costMethod: 'FIFO', supplierId: 'sup_8' },

    // Packaging & Barcode Materials (PKG-001 .. PKG-005)
    { code: 'PKG-001', nameAr: 'بكر ملصقات باركود حراري لأنابيب العينات (38x25mm)', nameEn: 'Thermal Barcode Tube Labels Roll (1000 labels)', category: 'packaging', subCategory: 'الباركود والطباعة', unit: 'roll', purchaseUnit: 'Carton (10 rolls)', conversionFactor: 10, storageTemp: '15-25°C', minStock: 10, maxStock: 100, reorderPoint: 20, reorderQty: 30, currentStock: 34, unitCost: 95, costMethod: 'AVG', supplierId: 'sup_10' },
    { code: 'PKG-002', nameAr: 'بكر ورق طابعة إيصالات حراري 80 مم', nameEn: 'Thermal POS Receipt Paper Roll 80mm', category: 'packaging', subCategory: 'الباركود والطباعة', unit: 'roll', purchaseUnit: 'Box (50 rolls)', conversionFactor: 50, storageTemp: '15-25°C', minStock: 20, maxStock: 200, reorderPoint: 40, reorderQty: 50, currentStock: 65, unitCost: 24, costMethod: 'AVG', supplierId: 'sup_10' },
    { code: 'PKG-003', nameAr: 'أكياس نفايات طبية خطرة صفراء (Biohazard Bags)', nameEn: 'Autoclavable Biohazard Waste Bags 50L', category: 'packaging', subCategory: 'مكافحة العدوى', unit: 'piece', purchaseUnit: 'Roll (50 bags)', conversionFactor: 50, storageTemp: '15-25°C', minStock: 100, maxStock: 1000, reorderPoint: 200, reorderQty: 300, currentStock: 380, unitCost: 4.5, costMethod: 'AVG', supplierId: 'sup_10', hazardClass: 'biohazard' },
    { code: 'PKG-004', nameAr: 'صناديق أمان للتخلص من السنون والحواد (Safety Box 5L)', nameEn: 'Sharps Disposal Safety Container 5L', category: 'packaging', subCategory: 'مكافحة العدوى', unit: 'piece', purchaseUnit: 'Bundle (25 pcs)', conversionFactor: 25, storageTemp: '15-25°C', minStock: 20, maxStock: 150, reorderPoint: 35, reorderQty: 50, currentStock: 58, unitCost: 32, costMethod: 'AVG', supplierId: 'sup_10', hazardClass: 'biohazard' },
    { code: 'PKG-005', nameAr: 'أظرف مطبوعة لتسليم تقارير التحاليل للمرضى A4', nameEn: 'Branded Patient Result Envelopes A4', category: 'packaging', subCategory: 'مطبوعات المرضى', unit: 'piece', purchaseUnit: 'Box (500 pcs)', conversionFactor: 500, storageTemp: '15-25°C', minStock: 300, maxStock: 3000, reorderPoint: 600, reorderQty: 1000, currentStock: 1400, unitCost: 1.5, costMethod: 'AVG', supplierId: 'sup_10' },
  ];

  const inventoryItems: InventoryItem[] = rawItems.map((item, idx) => ({
    id: `itm_${idx + 1}`,
    code: item.code,
    barcode: `622300${String(1000 + idx + 1)}`,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    scientificName: item.category === 'chemical' ? `${item.nameEn} IVD Grade` : undefined,
    category: item.category,
    subCategory: item.subCategory,
    unit: item.unit,
    purchaseUnit: item.purchaseUnit,
    conversionFactor: item.conversionFactor,
    storageTemp: item.storageTemp,
    storageNotes:
      item.storageTemp === '2-8°C'
        ? 'يُحفظ في ثلاجة الكواشف الطبية المعايرة (2-8°C) بعيدًا عن التجميد'
        : item.storageTemp === '-20°C'
        ? 'يُحفظ في الفريزر الطبي (-20°C)'
        : 'يُحفظ في مخزن جاف مكيف بعيدًا عن أشعة الشمس المباشرة',
    hazardClass: item.hazardClass ?? 'none',
    msdsNumber: item.category === 'chemical' ? `MSDS-IVD-${202600 + idx}` : undefined,
    expiryAfterOpeningDays: item.expiryAfterOpeningDays,
    minStock: item.minStock,
    maxStock: item.maxStock,
    reorderPoint: item.reorderPoint,
    reorderQty: item.reorderQty,
    currentStock: item.currentStock,
    reservedStock: idx % 5 === 0 ? Math.round(item.currentStock * 0.05) : 0,
    availableStock:
      idx % 5 === 0
        ? item.currentStock - Math.round(item.currentStock * 0.05)
        : item.currentStock,
    costMethod: item.costMethod,
    unitCost: item.unitCost,
    lastPurchasePrice: item.unitCost,
    supplierId: item.supplierId,
    active: true,
    createdAt: '2026-09-01',
  }));

  // 6. 100 Inventory Lots (2 lots per item on average, with realistic expiry distributions)
  const inventoryLots: InventoryLot[] = [];
  for (let i = 0; i < inventoryItems.length; i++) {
    const item = inventoryItems[i];
    const sup = suppliers.find((s) => s.id === item.supplierId) ?? suppliers[0];
    const halfQty1 = Math.floor(item.currentStock * 0.45);
    const halfQty2 = item.currentStock - halfQty1;

    // Lot A (Older lot - some expired, some <30 days, some <90 days, some valid)
    let expDateA = '2027-03-15';
    let statusA: InventoryLot['status'] = 'active';
    if (item.code === 'CHM-001') {
      expDateA = '2027-03-15'; // Explicitly requested CBC Reagent expiry
    } else if (item.code === 'CHM-002' || i === 12 || i === 18) {
      expDateA = '2026-10-15'; // Expired lots for testing expired warning & disposal
      statusA = 'expired';
    } else if (i % 7 === 1) {
      expDateA = '2026-11-28'; // Expiring within 30 days (🟠)
    } else if (i % 5 === 2) {
      expDateA = '2027-01-15'; // Expiring within 90 days (🟡)
    } else {
      expDateA = `2027-0${(i % 6) + 3}-20`;
    }

    const openedDateA = item.expiryAfterOpeningDays ? '2026-11-01' : undefined;
    const effectiveExpA =
      openedDateA && item.expiryAfterOpeningDays
        ? new Date(new Date(openedDateA).getTime() + item.expiryAfterOpeningDays * 86400000)
            .toISOString()
            .slice(0, 10)
        : expDateA;

    inventoryLots.push({
      id: `lot_${i * 2 + 1}`,
      lotNumber: `LOT-26A-${String(1001 + i)}`,
      itemId: item.id,
      itemCode: item.code,
      itemNameAr: item.nameAr,
      itemNameEn: item.nameEn,
      supplierId: sup.id,
      supplierName: sup.nameAr,
      productionDate: '2026-01-15',
      expiryDate: expDateA,
      openedDate: openedDateA,
      effectiveExpiryDate: effectiveExpA < expDateA ? effectiveExpA : expDateA,
      receivedDate: '2026-09-15',
      initialQty: Math.max(halfQty1 + 50, 60),
      remainingQty: halfQty1,
      reservedQty: 0,
      unitCost: item.unitCost,
      storageLocation: item.storageTemp === '2-8°C' ? 'ثلاجة الكواشف R-01' : 'المخزن الرئيسي M-01',
      qcStatus: 'passed',
      qcTestedBy: 'chemist',
      qcDate: '2026-09-16',
      status: statusA,
    });

    // Lot B (Newer lot - always fresh and valid)
    inventoryLots.push({
      id: `lot_${i * 2 + 2}`,
      lotNumber: `LOT-26B-${String(2001 + i)}`,
      itemId: item.id,
      itemCode: item.code,
      itemNameAr: item.nameAr,
      itemNameEn: item.nameEn,
      supplierId: sup.id,
      supplierName: sup.nameAr,
      productionDate: '2026-06-01',
      expiryDate: `2027-0${((i + 2) % 5) + 5}-28`,
      effectiveExpiryDate: `2027-0${((i + 2) % 5) + 5}-28`,
      receivedDate: '2026-10-25',
      initialQty: Math.max(halfQty2 + 20, 40),
      remainingQty: halfQty2,
      reservedQty: item.reservedStock,
      unitCost: item.unitCost,
      storageLocation: item.storageTemp === '2-8°C' ? 'ثلاجة الكواشف R-02' : 'المخزن الرئيسي M-02',
      qcStatus: i === 15 ? 'pending' : 'passed',
      qcTestedBy: 'chemist',
      qcDate: '2026-10-26',
      status: 'active',
    });
  }

  // 7. 20 Test BOMs (Bill of Materials linking Lab Tests to Reagents & Consumables)
  const bomMappings: Array<{
    testId: string;
    testCode: string;
    testNameAr: string;
    testNameEn: string;
    reagentCode: string;
    reagentQty: number;
    tubeCode: string;
  }> = [
    { testId: 'tst_1', testCode: 'CBC', testNameAr: 'صورة دم كاملة', testNameEn: 'Complete Blood Count (CBC)', reagentCode: 'CHM-001', reagentQty: 15, tubeCode: 'CON-001' },
    { testId: 'tst_2', testCode: 'FBS', testNameAr: 'سكر صائم بالدم', testNameEn: 'Fasting Blood Sugar (FBS)', reagentCode: 'CHM-002', reagentQty: 2, tubeCode: 'CON-007' },
    { testId: 'tst_3', testCode: 'HBA1C', testNameAr: 'السكر التراكمي HbA1c', testNameEn: 'Glycated Hemoglobin (HbA1c)', reagentCode: 'CHM-003', reagentQty: 1, tubeCode: 'CON-001' },
    { testId: 'tst_4', testCode: 'LIPID', testNameAr: 'ملف الدهون الكامل', testNameEn: 'Complete Lipid Profile', reagentCode: 'CHM-004', reagentQty: 6, tubeCode: 'CON-004' },
    { testId: 'tst_5', testCode: 'ALT', testNameAr: 'إنزيم الكبد ALT (SGPT)', testNameEn: 'Alanine Aminotransferase (ALT)', reagentCode: 'CHM-006', reagentQty: 3, tubeCode: 'CON-005' },
    { testId: 'tst_6', testCode: 'AST', testNameAr: 'إنزيم الكبد AST (SGOT)', testNameEn: 'Aspartate Aminotransferase (AST)', reagentCode: 'CHM-007', reagentQty: 3, tubeCode: 'CON-005' },
    { testId: 'tst_7', testCode: 'BIL-T', testNameAr: 'الصفراء الكلية والمباشرة', testNameEn: 'Total & Direct Bilirubin', reagentCode: 'CHM-006', reagentQty: 4, tubeCode: 'CON-005' },
    { testId: 'tst_8', testCode: 'ALB', testNameAr: 'الألبومين بالدم', testNameEn: 'Serum Albumin', reagentCode: 'CHM-008', reagentQty: 3, tubeCode: 'CON-005' },
    { testId: 'tst_9', testCode: 'CREAT', testNameAr: 'الكرياتينين بالدم (وظائف كلى)', testNameEn: 'Serum Creatinine', reagentCode: 'CHM-008', reagentQty: 3, tubeCode: 'CON-005' },
    { testId: 'tst_10', testCode: 'UREA', testNameAr: 'البولينا بالدم', testNameEn: 'Blood Urea', reagentCode: 'CHM-009', reagentQty: 3, tubeCode: 'CON-005' },
    { testId: 'tst_11', testCode: 'UA', testNameAr: 'حمض اليوريك (النقرس)', testNameEn: 'Serum Uric Acid', reagentCode: 'CHM-010', reagentQty: 3, tubeCode: 'CON-005' },
    { testId: 'tst_12', testCode: 'TSH', testNameAr: 'هرمون الغدة الدرقية TSH', testNameEn: 'Thyroid Stimulating Hormone (TSH)', reagentCode: 'CHM-011', reagentQty: 1, tubeCode: 'CON-004' },
    { testId: 'tst_15', testCode: 'VIT-D', testNameAr: 'فيتامين د الكلي 25-OH', testNameEn: '25-Hydroxy Vitamin D', reagentCode: 'CHM-012', reagentQty: 1, tubeCode: 'CON-004' },
    { testId: 'tst_17', testCode: 'FERR', testNameAr: 'مخزون الحديد بالدم', testNameEn: 'Serum Ferritin', reagentCode: 'CHM-013', reagentQty: 1, tubeCode: 'CON-004' },
    { testId: 'tst_19', testCode: 'CRP', testNameAr: 'بروتين سي التفاعلي الكمي', testNameEn: 'C-Reactive Protein (Quantitative)', reagentCode: 'CHM-014', reagentQty: 1, tubeCode: 'CON-005' },
    { testId: 'tst_21', testCode: 'PT-INR', testNameAr: 'زمن وسيولة الدم PT & INR', testNameEn: 'Prothrombin Time & INR', reagentCode: 'CHM-015', reagentQty: 1, tubeCode: 'CON-006' },
    { testId: 'tst_24', testCode: 'TROP-I', testNameAr: 'إنزيم القلب عالي الحساسية Troponin-I', testNameEn: 'High-Sensitivity Troponin-I', reagentCode: 'CHM-016', reagentQty: 1, tubeCode: 'CON-004' },
    { testId: 'tst_25', testCode: 'PSA-T', testNameAr: 'دلالات أورام البروستاتا PSA', testNameEn: 'Total Prostate Specific Antigen (PSA)', reagentCode: 'CHM-020', reagentQty: 1, tubeCode: 'CON-004' },
    { testId: 'tst_32', testCode: 'HCV-AB', testNameAr: 'الأجسام المضادة لفيروس سي', testNameEn: 'HCV Antibodies (ELISA)', reagentCode: 'CHM-018', reagentQty: 1, tubeCode: 'CON-004' },
    { testId: 'tst_34', testCode: 'URINE', testNameAr: 'تحليل البول الكامل', testNameEn: 'Complete Urine Analysis', reagentCode: 'CON-014', reagentQty: 1, tubeCode: 'CON-013' },
  ];

  const itemByCode = new Map(inventoryItems.map((i) => [i.code, i]));
  const gloveItem = itemByCode.get('CON-003')!;
  const swabItem = itemByCode.get('CON-010')!;
  const tipItem = itemByCode.get('CON-011')!;

  const testBOMs: TestBOM[] = bomMappings.map((b, idx) => {
    const reagent = itemByCode.get(b.reagentCode) ?? inventoryItems[0];
    const tube = itemByCode.get(b.tubeCode) ?? inventoryItems[1];
    const items = [
      {
        itemId: reagent.id,
        itemCode: reagent.code,
        itemNameAr: reagent.nameAr,
        itemNameEn: reagent.nameEn,
        quantity: b.reagentQty,
        unit: reagent.unit,
        wastePercent: 5,
        unitCost: reagent.unitCost,
      },
      {
        itemId: tube.id,
        itemCode: tube.code,
        itemNameAr: tube.nameAr,
        itemNameEn: tube.nameEn,
        quantity: 1,
        unit: tube.unit,
        wastePercent: 2,
        unitCost: tube.unitCost,
      },
      {
        itemId: tipItem.id,
        itemCode: tipItem.code,
        itemNameAr: tipItem.nameAr,
        itemNameEn: tipItem.nameEn,
        quantity: 2,
        unit: tipItem.unit,
        wastePercent: 0,
        unitCost: tipItem.unitCost,
      },
      {
        itemId: gloveItem.id,
        itemCode: gloveItem.code,
        itemNameAr: gloveItem.nameAr,
        itemNameEn: gloveItem.nameEn,
        quantity: 2,
        unit: gloveItem.unit,
        wastePercent: 0,
        unitCost: gloveItem.unitCost,
      },
      {
        itemId: swabItem.id,
        itemCode: swabItem.code,
        itemNameAr: swabItem.nameAr,
        itemNameEn: swabItem.nameEn,
        quantity: 1,
        unit: swabItem.unit,
        wastePercent: 0,
        unitCost: swabItem.unitCost,
      },
    ];
    const totalMaterialCost =
      Math.round(
        items.reduce((sum, line) => sum + line.quantity * (1 + line.wastePercent / 100) * line.unitCost, 0) * 100
      ) / 100;

    return {
      id: `bom_${idx + 1}`,
      testId: b.testId,
      testCode: b.testCode,
      testNameAr: b.testNameAr,
      testNameEn: b.testNameEn,
      items,
      directMaterialCost: totalMaterialCost,
      laborCostEstimate: 8,
      overheadCostEstimate: 5,
    };
  });

  // 8. 12 Purchase Invoices (with lot numbers, multi-currency, and Receive Stock workflow)
  const purchaseInvoices: PurchaseInvoice[] = [];
  const erpJournalEntries: JournalEntry[] = [];

  for (let p = 1; p <= 12; p++) {
    const sup = suppliers[(p - 1) % suppliers.length];
    const lotA = inventoryLots[((p - 1) * 4) % inventoryLots.length];
    const lotB = inventoryLots[((p - 1) * 4 + 2) % inventoryLots.length];
    const itmA = inventoryItems.find((x) => x.id === lotA.itemId) ?? inventoryItems[0];
    const itmB = inventoryItems.find((x) => x.id === lotB.itemId) ?? inventoryItems[1];

    const currency: PurchaseInvoice['currency'] = p === 11 ? 'USD' : p === 12 ? 'EUR' : 'EGP';
    const exchangeRate = currency === 'USD' ? 49.5 : currency === 'EUR' ? 53.2 : 1;

    const qtyA = 100;
    const qtyB = 150;
    const lineTotalA = Math.round(qtyA * itmA.unitCost * 100) / 100;
    const lineTotalB = Math.round(qtyB * itmB.unitCost * 100) / 100;
    const subtotal = Math.round((lineTotalA + lineTotalB) * 100) / 100;
    const discountAmount = p % 3 === 0 ? 150 : 0;
    const afterDisc = subtotal - discountAmount;
    const taxRate = 14;
    const taxAmount = Math.round(afterDisc * 0.14 * 100) / 100;
    const netTotal = Math.round((afterDisc + taxAmount) * 100) / 100;

    // Leave Purchase Invoices 10, 11, 12 with stockReceived = false so user can click "استلام المخزون" live!
    const stockReceived = p <= 9;
    const status: PurchaseInvoice['status'] = p <= 6 ? 'paid' : p <= 9 ? 'partial' : 'unpaid';
    const paidAmount = status === 'paid' ? netTotal : status === 'partial' ? Math.round(netTotal * 0.5) : 0;
    const remainingAmount = Math.round((netTotal - paidAmount) * 100) / 100;
    const dateStr = `2026-11-${String((p % 9) + 1).padStart(2, '0')}`;
    const pinvId = `pinv_${p}`;
    const pinvNum = `PINV-2026-${String(400 + p)}`;

    purchaseInvoices.push({
      id: pinvId,
      invoiceNumber: pinvNum,
      supplierInvoiceNumber: `SUP-INV-${8800 + p}`,
      purchaseOrderNumber: `PO-2026-${200 + p}`,
      supplierId: sup.id,
      supplierName: sup.nameAr,
      date: dateStr,
      dueDate: '2026-12-10',
      currency,
      exchangeRate,
      items: [
        {
          id: `pi_line_${p}_1`,
          itemId: itmA.id,
          itemCode: itmA.code,
          itemNameAr: itmA.nameAr,
          itemNameEn: itmA.nameEn,
          lotNumber: stockReceived ? lotA.lotNumber : `LOT-NEW-26-${p}A`,
          productionDate: '2026-07-01',
          expiryDate: '2027-08-30',
          quantity: qtyA,
          unitPrice: itmA.unitCost,
          discountAmount: 0,
          taxRate: 14,
          taxAmount: Math.round(lineTotalA * 0.14 * 100) / 100,
          netTotal: Math.round(lineTotalA * 1.14 * 100) / 100,
          storageLocation: 'ثلاجة الكواشف R-01',
        },
        {
          id: `pi_line_${p}_2`,
          itemId: itmB.id,
          itemCode: itmB.code,
          itemNameAr: itmB.nameAr,
          itemNameEn: itmB.nameEn,
          lotNumber: stockReceived ? lotB.lotNumber : `LOT-NEW-26-${p}B`,
          productionDate: '2026-08-01',
          expiryDate: '2027-09-30',
          quantity: qtyB,
          unitPrice: itmB.unitCost,
          discountAmount: 0,
          taxRate: 14,
          taxAmount: Math.round(lineTotalB * 0.14 * 100) / 100,
          netTotal: Math.round(lineTotalB * 1.14 * 100) / 100,
          storageLocation: 'المخزن الرئيسي M-01',
        },
      ],
      subtotal,
      discountAmount,
      taxRate,
      taxAmount,
      shippingCost: 0,
      netTotal,
      paidAmount,
      remainingAmount,
      paymentMethod: p % 2 === 0 ? 'bank_transfer' : 'cash',
      status,
      stockReceived,
      createdBy: 'accountant',
      notes: stockReceived ? 'تم الفحص والاستلام المخزني ومطابقة شهادة التحليل COA' : 'بانتظار الاستلام المخزني وفحص الدفعات (اضغط استلام المخزون)',
    });

    if (stockReceived) {
      erpJournalEntries.push({
        id: `je_erp_pinv_${p}`,
        entryNumber: `JE-PINV-${String(5000 + p)}`,
        date: dateStr,
        entryType: 'auto',
        referenceType: 'purchase_invoice',
        referenceId: pinvId,
        status: 'posted',
        costCenter: 'CC-CHEM',
        descriptionAr: `فاتورة مشتريات واستلام مخزني ${pinvNum} - ${sup.nameAr}`,
        descriptionEn: `Purchase Invoice & Goods Receipt ${pinvNum} - ${sup.nameEn}`,
        lines: [
          { accountCode: '1.1.3.1', accountNameAr: 'مخزون الكواشف والمحاليل الكيميائية', accountNameEn: 'Chemical Reagents Inventory', debit: afterDisc, credit: 0 },
          { accountCode: '1.1.4.2', accountNameAr: 'ضريبة القيمة المضافة للمشتريات (مدخلات)', accountNameEn: 'VAT Input Tax Receivable', debit: taxAmount, credit: 0 },
          { accountCode: '2.1.1', accountNameAr: 'الموردون والدائنون التجاريون', accountNameEn: 'Suppliers & Accounts Payable', debit: 0, credit: netTotal },
        ],
        totalDebit: netTotal,
        totalCredit: netTotal,
        createdBy: 'accountant',
      });
    }
  }

  // 9. 200 Stock Movements across all 8 types
  const stockMovements: StockMovement[] = [];
  const movementTypes: StockMovementType[] = [
    'goods_receipt',
    'issue_to_test',
    'issue_to_test',
    'issue_to_test',
    'internal_transfer',
    'return_from_dept',
    'disposal',
    'adjustment',
    'transfer',
    'reservation',
  ];

  for (let m = 1; m <= 200; m++) {
    const mType = movementTypes[(m - 1) % movementTypes.length];
    const lot = inventoryLots[(m - 1) % inventoryLots.length];
    const item = inventoryItems.find((x) => x.id === lot.itemId) ?? inventoryItems[0];
    const isInbound = mType === 'goods_receipt' || mType === 'return_from_dept' || (mType === 'adjustment' && m % 2 === 0);
    const qty = mType === 'goods_receipt' ? 100 : mType === 'issue_to_test' ? 5 : 10;
    const prevBal = Math.max(20, item.currentStock - (isInbound ? 20 : -20));
    const newBal = isInbound ? prevBal + qty : Math.max(0, prevBal - qty);
    const totalCost = Math.round(qty * item.unitCost * 100) / 100;
    const dayStr = String(((m - 1) % 9) + 1).padStart(2, '0');
    const dateStr = `2026-11-${dayStr}`;

    stockMovements.push({
      id: `mov_${m}`,
      movementNumber: `MOV-2026-${String(1000 + m)}`,
      date: `${dateStr} ${String(8 + (m % 10)).padStart(2, '0')}:15`,
      type: mType,
      itemId: item.id,
      itemCode: item.code,
      itemNameAr: item.nameAr,
      itemNameEn: item.nameEn,
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      quantity: qty,
      previousBalance: prevBal,
      newBalance: newBal,
      unitCost: item.unitCost,
      totalCost,
      referenceType:
        mType === 'goods_receipt'
          ? 'purchase_invoice'
          : mType === 'issue_to_test'
          ? 'lab_request'
          : mType === 'disposal'
          ? 'disposal_order'
          : 'stock_taking',
      referenceId:
        mType === 'goods_receipt'
          ? `pinv_${(m % 9) + 1}`
          : mType === 'issue_to_test'
          ? `req_${(m % 50) + 1}`
          : `DOC-${100 + m}`,
      department: m % 2 === 0 ? 'الكيمياء الحيوية' : 'أمراض الدم',
      performedBy: mType === 'goods_receipt' ? 'accountant' : 'chemist',
      approvedBy: 'owner',
      journalEntryId: m <= 12 ? `je_erp_pinv_${m}` : undefined,
      notes:
        mType === 'goods_receipt'
          ? `استلام دفعة ${lot.lotNumber} بموجب فاتورة شراء`
          : mType === 'issue_to_test'
          ? `صرف آلي للتحاليل وفق معادلة BOM (FEFO)`
          : mType === 'disposal'
          ? `إتلاف كمية منتهية الصلاحية بموجب محضر رسمي`
          : `حركة مخزنية معتمدة (${mType})`,
    });
  }

  // 10. 8 Return / Credit / Debit Notes
  const returnNotes: ReturnNote[] = [
    {
      id: 'ret_1',
      noteNumber: 'SRN-2026-001',
      type: 'sales_return',
      originalInvoiceId: 'inv_3',
      originalInvoiceNumber: 'INV-2026-3003',
      partyId: 'pat_3',
      partyName: 'محمد عبد السلام',
      date: '2026-11-05',
      reason: 'إلغاء تحليل فيتامين د بناءً على رغبة المريض قبل سحب العينة',
      items: [{ descriptionAr: 'فيتامين د الكلي 25-OH', descriptionEn: '25-Hydroxy Vitamin D', quantity: 1, unitPrice: 550, taxAmount: 77, totalAmount: 627 }],
      subtotal: 550,
      taxAmount: 77,
      netTotal: 627,
      refundMethod: 'cash',
      status: 'approved',
      createdBy: 'accountant',
    },
    {
      id: 'ret_2',
      noteNumber: 'PRN-2026-001',
      type: 'purchase_return',
      originalInvoiceId: 'pinv_2',
      originalInvoiceNumber: 'PINV-2026-402',
      partyId: 'sup_2',
      partyName: 'شركة سيسمكس الشرق الأوسط للكواشف',
      date: '2026-11-06',
      reason: 'إرجاع عبوات كاشف لوجود خدش بالعبوة الخارجية أثناء الشحن',
      items: [{ itemId: 'itm_1', lotNumber: 'LOT-26A-1001', descriptionAr: 'كاشف صورة الدم الكاملة CBC', descriptionEn: 'Sysmex CBC Reagent', quantity: 100, unitPrice: 1.8, taxAmount: 25.2, totalAmount: 205.2 }],
      subtotal: 180,
      taxAmount: 25.2,
      netTotal: 205.2,
      refundMethod: 'account_credit',
      status: 'approved',
      createdBy: 'accountant',
    },
    {
      id: 'ret_3',
      noteNumber: 'CN-2026-001',
      type: 'credit_note',
      originalInvoiceId: 'inv_8',
      originalInvoiceNumber: 'INV-2026-3008',
      partyId: 'pat_8',
      partyName: 'ياسمين عادل فوزي',
      date: '2026-11-07',
      reason: 'إشعار دائن لتسوية خصم تعاقد نقابة المهندسين بأثر رجعي',
      items: [{ descriptionAr: 'تسوية خصم نقابي على الفاتورة INV-2026-3008', descriptionEn: 'Syndicate Contract Discount Adjustment', quantity: 1, unitPrice: 120, taxAmount: 16.8, totalAmount: 136.8 }],
      subtotal: 120,
      taxAmount: 16.8,
      netTotal: 136.8,
      refundMethod: 'account_credit',
      status: 'approved',
      createdBy: 'accountant',
    },
    {
      id: 'ret_4',
      noteNumber: 'DN-2026-001',
      type: 'debit_note',
      originalInvoiceId: 'pinv_4',
      originalInvoiceNumber: 'PINV-2026-404',
      partyId: 'sup_4',
      partyName: 'جرينر بيو-ون لأنابيب سحب الدم (Vacuette)',
      date: '2026-11-08',
      reason: 'إشعار مدين لخصم فرق سعر توريد أنابيب EDTA عن السعر المتعاقد عليه',
      items: [{ itemId: 'itm_2', descriptionAr: 'فرق سعر توريد أنابيب EDTA', descriptionEn: 'Price Variance Adjustment on EDTA Tubes', quantity: 200, unitPrice: 0.5, taxAmount: 14, totalAmount: 114 }],
      subtotal: 100,
      taxAmount: 14,
      netTotal: 114,
      refundMethod: 'account_credit',
      status: 'approved',
      createdBy: 'accountant',
    },
  ];

  // 11. Stock Taking Sessions (1 approved, 1 draft for interactive testing)
  const stockTakingSessions: StockTakingSession[] = [
    {
      id: 'st_1',
      sessionNumber: 'ST-2026-101',
      date: '2026-10-31',
      warehouseName: 'المخزن الرئيسي وثلاجة الكواشف R-01',
      status: 'approved',
      lines: inventoryItems.slice(0, 8).map((itm) => ({
        itemId: itm.id,
        itemCode: itm.code,
        itemNameAr: itm.nameAr,
        itemNameEn: itm.nameEn,
        bookQty: itm.currentStock,
        actualQty: itm.currentStock,
        varianceQty: 0,
        unitCost: itm.unitCost,
        varianceValue: 0,
      })),
      totalVarianceValue: 0,
      createdBy: 'chemist',
      approvedBy: 'owner',
      notes: 'جرد نهاية شهر أكتوبر 2026 - مطابق للرصيد الدفتري بالكامل',
    },
    {
      id: 'st_2',
      sessionNumber: 'ST-2026-102',
      date: '2026-11-09',
      warehouseName: 'جرد دوري مفاجئ - قسم أمراض الدم والكيمياء',
      status: 'draft',
      lines: inventoryItems.slice(0, 10).map((itm, idx) => {
        const diff = idx === 1 ? -10 : idx === 4 ? 5 : 0;
        const actual = Math.max(0, itm.currentStock + diff);
        return {
          itemId: itm.id,
          itemCode: itm.code,
          itemNameAr: itm.nameAr,
          itemNameEn: itm.nameEn,
          bookQty: itm.currentStock,
          actualQty: actual,
          varianceQty: diff,
          unitCost: itm.unitCost,
          varianceValue: Math.round(diff * itm.unitCost * 100) / 100,
          reason: diff !== 0 ? 'فروق عدّ أثناء الجرد الدوري (جاهز للاعتماد وتوليد قيد التسوية)' : undefined,
        };
      }),
      totalVarianceValue: Math.round((-10 * inventoryItems[1].unitCost + 5 * inventoryItems[4].unitCost) * 100) / 100,
      createdBy: 'chemist',
      notes: 'جلسة جرد مفتوحة جاهزة للاعتماد المباشر وتوليد قيود التسوية المخزنية والمحاسبية',
    },
  ];

  await db.transaction(
    'rw',
    [
      db.chartOfAccounts,
      db.costCenters,
      db.periodLocks,
      db.suppliers,
      db.inventoryItems,
      db.inventoryLots,
      db.testBOMs,
      db.purchaseInvoices,
      db.stockMovements,
      db.returnNotes,
      db.stockTakingSessions,
      db.journalEntries,
    ],
    async () => {
      await db.chartOfAccounts.bulkPut(hierarchicalAccounts);
      await db.costCenters.bulkPut(costCenters);
      await db.periodLocks.bulkPut(periodLocks);
      await db.suppliers.bulkPut(suppliers);
      await db.inventoryItems.bulkPut(inventoryItems);
      await db.inventoryLots.bulkPut(inventoryLots);
      await db.testBOMs.bulkPut(testBOMs);
      await db.purchaseInvoices.bulkPut(purchaseInvoices);
      await db.stockMovements.bulkPut(stockMovements);
      await db.returnNotes.bulkPut(returnNotes);
      await db.stockTakingSessions.bulkPut(stockTakingSessions);
      await db.journalEntries.bulkPut(erpJournalEntries);
    }
  );
}
