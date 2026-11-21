import { db } from '../db/database';
import { financeMySQLRows, inMySQLFinancePilot, requireMySQLFinancialWrite } from './mysql-finance.read';
import type { Account, CashboxSession, DailyClosing, Expense, JournalEntry } from '../types';

export const EGYPTIAN_STANDARD_ACCOUNTS: Account[] = [
  // ============================================================================
  // 1 - الأصول (Assets)
  // ============================================================================
  { id: 'eg_1', code: '1', nameAr: '1 - الأصول (Assets)', nameEn: 'Assets', type: 'asset', level: 1, isGroup: true, balance: 0 },

  // 11 - الأصول غير المتداولة / الثابتة (Non-Current / Fixed Assets)
  { id: 'eg_11', code: '11', parentCode: '1', nameAr: '11 - الأصول الثابتة (Fixed Assets)', nameEn: 'Fixed Assets', type: 'asset', level: 2, isGroup: true, balance: 0 },
  { id: 'eg_1101', code: '1101', parentCode: '11', nameAr: 'الأجهزة والمعدات الطبية والمعملية (Analyzers & Lab Equipment)', nameEn: 'Medical & Lab Analyzers', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1102', code: '1102', parentCode: '11', nameAr: 'الأثاث والتجهيزات المكتبية والعيادات', nameEn: 'Furniture & Fixtures', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1103', code: '1103', parentCode: '11', nameAr: 'أجهزة الحاسب الآلي والشبكات وبرامج الـ LIMS', nameEn: 'Computers, Networks & LIMS Software', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1104', code: '1104', parentCode: '11', nameAr: 'وسائل النقل والانتقال (سيارات السحب المنزلي)', nameEn: 'Vehicles & Home Visit Fleet', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1109', code: '1109', parentCode: '11', nameAr: 'مجمع إهلاك الأصول الثابتة (Accumulated Depreciation)', nameEn: 'Accumulated Depreciation', type: 'asset', level: 3, isGroup: false, balance: 0 },

  // 12 - الأصول المتداولة (Current Assets)
  { id: 'eg_12', code: '12', parentCode: '1', nameAr: '12 - الأصول المتداولة (Current Assets)', nameEn: 'Current Assets', type: 'asset', level: 2, isGroup: true, balance: 0 },
  { id: 'acc_1', code: '1201', parentCode: '12', nameAr: 'الخزينة النقدية الرئيسية بالمعمل (Main Cashbox)', nameEn: 'Main Cashbox (EGP)', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_2', code: '1202', parentCode: '12', nameAr: 'البنوك والحسابات الجارية (البنك الأهلي / بنك مصر / CIB)', nameEn: 'Banks & Current Accounts', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1203', code: '1203', parentCode: '12', nameAr: 'المحافظ الإلكترونية وإنستا باي ونقاط البيع (InstaPay / Vodafone Cash / POS)', nameEn: 'InstaPay, E-Wallets & POS', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_3', code: '1204', parentCode: '12', nameAr: 'العملاء والمرضى (ذمم مدينة للأفراد)', nameEn: 'Patients Accounts Receivable', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1205', code: '1205', parentCode: '12', nameAr: 'عملاء التعاقدات والنقابات وشركات التأمين الطبي', nameEn: 'Corporate & Syndicate Receivables', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1206', code: '1206', parentCode: '12', nameAr: 'مخزون الكواشف والمحاليل الطبية (Reagents Inventory)', nameEn: 'Reagents & Kits Inventory', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1207', code: '1207', parentCode: '12', nameAr: 'مخزون المستلزمات الطبية وأنابيب سحب الدم (Consumables)', nameEn: 'Tubes & Medical Disposables Inventory', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1208', code: '1208', parentCode: '12', nameAr: 'سلف وعهد الموظفين والعاملين', nameEn: 'Staff Advances & Petty Cash', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1209', code: '1209', parentCode: '12', nameAr: 'مصلحة الضرائب المصرية - ضريبة خصم وتحصيل تحت الحساب (1%)', nameEn: 'Withholding Tax Receivable (WHT)', type: 'asset', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_1210', code: '1210', parentCode: '12', nameAr: 'مصروفات مدفوعة مقدماً وتأمينات لدى الغير', nameEn: 'Prepaid Expenses & Deposits', type: 'asset', level: 3, isGroup: false, balance: 0 },

  // ============================================================================
  // 2 - الالتزامات / الخصوم (Liabilities)
  // ============================================================================
  { id: 'eg_2', code: '2', nameAr: '2 - الالتزامات والخصوم (Liabilities)', nameEn: 'Liabilities', type: 'liability', level: 1, isGroup: true, balance: 0 },
  { id: 'eg_21', code: '21', parentCode: '2', nameAr: '21 - الالتزامات المتداولة (Current Liabilities)', nameEn: 'Current Liabilities', type: 'liability', level: 2, isGroup: true, balance: 0 },
  { id: 'eg_2101', code: '2101', parentCode: '21', nameAr: 'الموردون والدائنون التجاريون (شركات الكواشف والمستلزمات)', nameEn: 'Suppliers & Accounts Payable', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_5', code: '2102', parentCode: '21', nameAr: 'ذمم وعمولات الأطباء المحولين المستحقة', nameEn: 'Referring Doctors Commissions Payable', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_2103', code: '2103', parentCode: '21', nameAr: 'أجور ومرتبات وحوافز مستحقة الدفع', nameEn: 'Accrued Salaries & Wages Payable', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_4', code: '2104', parentCode: '21', nameAr: 'مصلحة الضرائب المصرية - ضريبة القيمة المضافة المستحقة (14%)', nameEn: 'VAT Output Tax Payable (14%)', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_2105', code: '2105', parentCode: '21', nameAr: 'مصلحة الضرائب المصرية - ضريبة كسب العمل والمرتبات', nameEn: 'Payroll Tax Payable', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_2106', code: '2106', parentCode: '21', nameAr: 'الهيئة القومية للتأمين الاجتماعي (حصة المعمل والعاملين)', nameEn: 'Social Insurance Authority Payable', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_2107', code: '2107', parentCode: '21', nameAr: 'مصروفات مستحقة الدفع (إيجار / كهرباء / صيانة)', nameEn: 'Accrued Operating Expenses', type: 'liability', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_22', code: '22', parentCode: '2', nameAr: '22 - الالتزامات طويلة الأجل (قروض وتمويل أجهزة)', nameEn: 'Long-Term Liabilities & Equipment Loans', type: 'liability', level: 2, isGroup: true, balance: 0 },

  // ============================================================================
  // 3 - حقوق الملكية (Owner's Equity)
  // ============================================================================
  { id: 'eg_3', code: '3', nameAr: '3 - حقوق الملكية (Equity)', nameEn: 'Owners Equity', type: 'equity', level: 1, isGroup: true, balance: 0 },
  { id: 'eg_3101', code: '3101', parentCode: '3', nameAr: 'رأس المال العامل والمدفوع (Paid-in Capital)', nameEn: 'Paid-in Capital', type: 'equity', level: 2, isGroup: false, balance: 0 },
  { id: 'eg_3102', code: '3102', parentCode: '3', nameAr: 'جاري الشركاء / المسحوبات الشخصية', nameEn: 'Partners Current Account & Drawings', type: 'equity', level: 2, isGroup: false, balance: 0 },
  { id: 'eg_3103', code: '3103', parentCode: '3', nameAr: 'الأرباح المرحلة / المحتجزة (Retained Earnings)', nameEn: 'Retained Earnings', type: 'equity', level: 2, isGroup: false, balance: 0 },
  { id: 'eg_3104', code: '3104', parentCode: '3', nameAr: 'الاحتياطي القانوني والنظامي', nameEn: 'Statutory Legal Reserve', type: 'equity', level: 2, isGroup: false, balance: 0 },

  // ============================================================================
  // 4 - الإيرادات (Revenues)
  // ============================================================================
  { id: 'eg_4', code: '4', nameAr: '4 - الإيرادات (Revenues)', nameEn: 'Revenues', type: 'revenue', level: 1, isGroup: true, balance: 0 },
  { id: 'eg_41', code: '41', parentCode: '4', nameAr: '41 - إيرادات النشاط الطبي والمعمل', nameEn: 'Laboratory Operating Revenues', type: 'revenue', level: 2, isGroup: true, balance: 0 },
  { id: 'acc_6', code: '4101', parentCode: '41', nameAr: 'إيرادات التحاليل الطبية النقدية (Walk-in Patients)', nameEn: 'Cash Medical Tests Revenue', type: 'revenue', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_7', code: '4102', parentCode: '41', nameAr: 'إيرادات تحاليل التعاقدات والنقابات والتأمين الطبي', nameEn: 'Corporate & Insurance Contracts Revenue', type: 'revenue', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_4103', code: '4103', parentCode: '41', nameAr: 'إيرادات خدمات السحب المنزلي والطوارئ (Home Visits)', nameEn: 'Home Sample Collection Revenue', type: 'revenue', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_4104', code: '4104', parentCode: '41', nameAr: 'إيرادات تحاليل المعامل المحولة (Lab-to-Lab Referral)', nameEn: 'Lab-to-Lab Referral Revenue', type: 'revenue', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_4201', code: '4201', parentCode: '4', nameAr: 'مردودات ومسموحات وخصومات المبيعات', nameEn: 'Sales Returns & Discounts Allowed', type: 'revenue', level: 2, isGroup: false, balance: 0 },

  // ============================================================================
  // 5 - المصروفات والتكاليف (Expenses & COGS)
  // ============================================================================
  { id: 'eg_5', code: '5', nameAr: '5 - المصروفات والتكاليف (Expenses & COGS)', nameEn: 'Expenses & COGS', type: 'expense', level: 1, isGroup: true, balance: 0 },
  { id: 'eg_51', code: '51', parentCode: '5', nameAr: '51 - تكاليف التشغيل المباشرة للتحاليل (COGS)', nameEn: 'Direct Cost of Tests (COGS)', type: 'expense', level: 2, isGroup: true, balance: 0 },
  { id: 'acc_11', code: '5104', parentCode: '51', nameAr: 'تكلفة الكواشف والمحاليل الكيميائية والهرمونات المستهلكة', nameEn: 'Consumed Reagents & Kits Cost', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5108', code: '5108', parentCode: '51', nameAr: 'تكلفة المستلزمات الطبية والسرنجات وأنابيب السحب', nameEn: 'Consumed Tubes & Syringes Cost', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_8', code: '5101', parentCode: '51', nameAr: 'مصروف عمولات الأطباء المحولين', nameEn: 'Referring Doctors Commissions Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5109', code: '5109', parentCode: '51', nameAr: 'تكلفة التحاليل المرسلة لمعامل مرجعية خارجية (Outsourced Tests)', nameEn: 'Outsourced Reference Lab Tests Cost', type: 'expense', level: 3, isGroup: false, balance: 0 },

  { id: 'eg_52', code: '52', parentCode: '5', nameAr: '52 - المصروفات العمومية والإدارية والتشغيلية', nameEn: 'General, Admin & Operating Expenses', type: 'expense', level: 2, isGroup: true, balance: 0 },
  { id: 'acc_9', code: '5102', parentCode: '52', nameAr: 'مصروف الأجور والمرتبات والبدلات والمكافآت', nameEn: 'Salaries, Wages & Bonuses Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5201', code: '5201', parentCode: '52', nameAr: 'حصة المعمل في التأمينات الاجتماعية', nameEn: 'Employer Social Insurance Contribution', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_10', code: '5103', parentCode: '52', nameAr: 'مصروف الإيجار الشهري لمقر المعمل والفروع', nameEn: 'Laboratory Rent Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_12', code: '5105', parentCode: '52', nameAr: 'مصروف الكهرباء والمياه والغاز والمرافق', nameEn: 'Electricity, Water & Utilities Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5202', code: '5202', parentCode: '52', nameAr: 'مصروف الإنترنت والاتصالات ورسائل الواتساب والـ SMS', nameEn: 'Internet, Telecom & WhatsApp/SMS Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_13', code: '5106', parentCode: '52', nameAr: 'مصروف صيانة ومعايرة الأجهزة الطبية ومحاليل الكنترول', nameEn: 'Analyzer Maintenance, Calibration & QC Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'acc_14', code: '5107', parentCode: '52', nameAr: 'مصروف المطبوعات والقرطاسية وأظرف التقارير وورق الباركود', nameEn: 'Printing, Stationery & Barcode Labels Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5203', code: '5203', parentCode: '52', nameAr: 'مصروف النظافة والتعقيم والتخلص الآمن من النفايات الطبية الخطرة', nameEn: 'Sanitation & Biohazard Medical Waste Disposal', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5204', code: '5204', parentCode: '52', nameAr: 'مصروف الدعاية والتسويق الطبي والمطبوعات الإعلانية', nameEn: 'Marketing & Medical Advertising Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5205', code: '5205', parentCode: '52', nameAr: 'مصروف انتقالات مندوبي السحب المنزلي ونقل العينات', nameEn: 'Phlebotomy & Sample Transport Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5206', code: '5206', parentCode: '52', nameAr: 'مصروف تراخيص وزارة الصحة والعلاج الحر والرسوم النقابية', nameEn: 'Ministry of Health Licensing & Syndicate Fees', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5207', code: '5207', parentCode: '52', nameAr: 'المصروفات والعمولات البنكية ومصاريف نقاط البيع (POS)', nameEn: 'Bank Charges & POS Fees', type: 'expense', level: 3, isGroup: false, balance: 0 },
  { id: 'eg_5208', code: '5208', parentCode: '52', nameAr: 'مصروف إهلاك الأصول الثابتة والأجهزة', nameEn: 'Depreciation Expense', type: 'expense', level: 3, isGroup: false, balance: 0 },
];

export class AccountingRepository {
  async ensureEgyptianChartOfAccounts(forceRestore = false): Promise<Account[]> {
    if (inMySQLFinancePilot()) return (await financeMySQLRows<Account>('accounts')).sort((a,b)=>a.code.localeCompare(b.code));
    const existing = await db.chartOfAccounts.toArray();
    if (!forceRestore && existing.length >= 38) {
      return existing.sort((a, b) => a.code.localeCompare(b.code));
    }

    const existingByCode = new Map(existing.map((a) => [a.code, a]));
    const toPut: Account[] = [];

    for (const def of EGYPTIAN_STANDARD_ACCOUNTS) {
      const matched = existingByCode.get(def.code);
      if (!matched) {
        toPut.push({ ...def });
      } else if (forceRestore) {
        toPut.push({
          ...def,
          id: matched.id,
          balance: matched.balance,
        });
      }
    }

    if (toPut.length > 0) {
      await db.chartOfAccounts.bulkPut(toPut);
    }

    const updated = await db.chartOfAccounts.toArray();
    return updated.sort((a, b) => a.code.localeCompare(b.code));
  }

  async getAccounts(): Promise<Account[]> {
    return this.ensureEgyptianChartOfAccounts(false);
  }

  async saveAccount(account: Account): Promise<string> {
    requireMySQLFinancialWrite();
    return db.chartOfAccounts.put(account);
  }

  async deleteAccount(id: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.chartOfAccounts.delete(id);
  }

  async getJournalEntries(): Promise<JournalEntry[]> {
    const list = inMySQLFinancePilot() ? await financeMySQLRows<JournalEntry>('journalEntries') : await db.journalEntries.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveJournalEntry(entry: JournalEntry): Promise<string> {
    requireMySQLFinancialWrite();
    return db.journalEntries.put(entry);
  }

  async deleteJournalEntry(id: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.journalEntries.delete(id);
  }

  async getExpenses(): Promise<Expense[]> {
    const list = inMySQLFinancePilot() ? await financeMySQLRows<Expense>('expenses') : await db.expenses.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveExpense(expense: Expense): Promise<string> {
    requireMySQLFinancialWrite();
    return db.expenses.put(expense);
  }

  async deleteExpense(id: string): Promise<void> {
    requireMySQLFinancialWrite();
    await db.expenses.delete(id);
  }

  async getCashboxSessions(): Promise<CashboxSession[]> {
    return inMySQLFinancePilot() ? financeMySQLRows<CashboxSession>('cashbox') : db.cashboxSessions.toArray();
  }

  async getDailyClosings(): Promise<DailyClosing[]> {
    const list = inMySQLFinancePilot() ? await financeMySQLRows<DailyClosing>('dailyClosings') : await db.dailyClosings.toArray();
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveDailyClosing(closing: DailyClosing): Promise<string> {
    if(inMySQLFinancePilot()){
      // Browser-calculated figures are NOT posted. The server derives totals
      // directly from the current branch's MySQL invoices, receipts and expenses.
      const response=await fetch('/api/branch-pilot/finance/daily-close',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:'{}',
      });
      const body=await response.json() as {
        ok?:boolean;source?:string;closing?:DailyClosing;error?:string
      };
      if(!response.ok||body.ok!==true)throw new Error(body.error||'MYSQL_DAILY_CLOSE_FAILED');
      if(body.source!=='mysql'||!body.closing?.id)
        throw new Error('MYSQL_DAILY_CLOSE_INVALID_RESPONSE');
      return body.closing.id;
    }
    requireMySQLFinancialWrite();
    return db.dailyClosings.put(closing);
  }

  getDefaultParentCode(
    accounts: Account[],
    type: Account['type'],
    isGroup: boolean
  ): string {
    const rootMap: Record<Account['type'], string> = {
      asset: '1',
      liability: '2',
      equity: '3',
      revenue: '4',
      expense: '5',
    };
    const rootCode = rootMap[type] || '1';
    if (isGroup) {
      // Main group defaults to being under the Level 1 root of its type (e.g. '1' -> generates '13')
      const rootExists = accounts.some((a) => a.code === rootCode);
      return rootExists ? rootCode : '';
    }
    // Sub-account defaults to the first Level 2 group of that type (e.g., '11' or '12', '21', '31', '41', '51')
    const level2Groups = accounts
      .filter((a) => a.isGroup && a.type === type && a.code.length >= 2)
      .sort((a, b) => a.code.localeCompare(b.code));
    if (level2Groups.length > 0) {
      return level2Groups[0].code;
    }
    const anyGroup = accounts
      .filter((a) => a.isGroup && a.type === type)
      .sort((a, b) => a.code.localeCompare(b.code));
    return anyGroup.length > 0 ? anyGroup[0].code : rootCode;
  }

  generateNextAccountCode(
    accounts: Account[],
    type: Account['type'],
    isGroup: boolean,
    parentCode?: string
  ): string {
    const rootMap: Record<Account['type'], string> = {
      asset: '1',
      liability: '2',
      equity: '3',
      revenue: '4',
      expense: '5',
    };
    const existingCodes = new Set(accounts.map((a) => a.code.trim()));
    const cleanParent = (parentCode || '').trim();

    // Case 1: Root Level-1 Account (no parentCode and isGroup = true)
    if (!cleanParent && isGroup) {
      const preferredRoot = rootMap[type] || '1';
      if (!existingCodes.has(preferredRoot)) {
        return preferredRoot;
      }
      // If root '1' exists, generate next Level-2 group code under '1' (e.g. '13')
      let nextSubGroup = 1;
      while (existingCodes.has(`${preferredRoot}${nextSubGroup}`)) {
        nextSubGroup++;
      }
      return `${preferredRoot}${nextSubGroup}`;
    }

    const prefix = cleanParent || this.getDefaultParentCode(accounts, type, isGroup) || rootMap[type] || '1';

    // Case 2: Main Group under a 1-digit Root (e.g. parentCode = '1' -> '11', '12', '13')
    if (isGroup && prefix.length === 1) {
      const childGroups = accounts
        .filter(
          (a) =>
            (a.parentCode === prefix || (a.code.startsWith(prefix) && a.code.length === 2)) &&
            /^\d+$/.test(a.code)
        )
        .map((a) => Number(a.code));
      let nextCode = childGroups.length > 0 ? Math.max(...childGroups) + 1 : Number(`${prefix}1`);
      while (existingCodes.has(String(nextCode))) {
        nextCode++;
      }
      return String(nextCode);
    }

    // Case 3: Sub-account (or deeper group) under a parent prefix (e.g. '11' -> '1110', '12' -> '1211', '52' -> '5209')
    const basePrefix = prefix.length === 1 ? `${prefix}1` : prefix;
    const targetLength = Math.max(4, basePrefix.length + 2);
    const matchingNumericCodes = accounts
      .filter(
        (a) =>
          (a.parentCode === prefix || a.code.startsWith(basePrefix)) &&
          a.code.length === targetLength &&
          /^\d+$/.test(a.code)
      )
      .map((a) => Number(a.code));

    const padWidth = targetLength - basePrefix.length;
    let candidate =
      matchingNumericCodes.length > 0
        ? Math.max(...matchingNumericCodes) + 1
        : Number(`${basePrefix}${'1'.padStart(padWidth, '0')}`);

    while (existingCodes.has(String(candidate))) {
      candidate++;
    }
    return String(candidate);
  }
}

export const accountingRepository = new AccountingRepository();

