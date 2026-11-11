import { db } from './database';
import { seedErpData } from './erp-seed';
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
  PermissionAction,
  RequestItem,
  ResourceScreen,
  Role,
  RoleName,
  RolePermission,
  Sample,
  TestParameter,
  User,
} from '../types';

import {
  DEFAULT_DOCTOR_SPECIALTIES,
  DEFAULT_SAMPLE_TUBES,
  DEFAULT_SCIENTIFIC_DEPARTMENTS,
} from '../repositories/lookups.repository';

export const ALL_RESOURCES: ResourceScreen[] = [
  'dashboard',
  'patients',
  'doctors',
  'doctorSpecialties',
  'employees',
  'users',
  'permissions',
  'tests',
  'scientificDepartments',
  'sampleTubes',
  'testParameters',
  'requests',
  'samples',
  'results',
  'aiHub',
  'bloodFilmAi',
  'urineMicroscopyAi',
  'stoolMicroscopyAi',
  'resultReview',
  'reports',
  'invoices',
  'payments',
  'accounts',
  'journalEntries',
  'cashbox',
  'expenses',
  'commissions',
  'settings',
  'printing',
  'inventory',
  'purchases',
  'erpAccounting',
];

export const ALL_ACTIONS: PermissionAction[] = [
  'view',
  'add',
  'edit',
  'delete',
  'print',
  'export',
  'approve',
  'cancel',
  'discount',
  'editPrices',
  'closeDay',
  'reopenResult',
  'managePermissions',
  'addPayment',
  'payCommission',
  'addJournalEntry',
];

function buildRolePermissions(): RolePermission[] {
  const roles: RoleName[] = ['Owner', 'Doctor', 'Chemist', 'Technician', 'Receptionist', 'Accountant'];
  const list: RolePermission[] = [];

  for (const role of roles) {
    for (const resource of ALL_RESOURCES) {
      const actions = {} as Record<PermissionAction, boolean>;
      for (const act of ALL_ACTIONS) {
        if (role === 'Owner') {
          actions[act] = true;
        } else if (role === 'Doctor') {
          const allowedScreens: ResourceScreen[] = [
            'dashboard',
            'patients',
            'doctors',
            'doctorSpecialties',
            'tests',
            'scientificDepartments',
            'sampleTubes',
            'testParameters',
            'requests',
            'results',
            'aiHub',
            'bloodFilmAi',
            'urineMicroscopyAi',
            'stoolMicroscopyAi',
            'resultReview',
            'reports',
            'printing',
          ];
          actions[act] =
            allowedScreens.includes(resource) &&
            ['view', 'add', 'edit', 'delete', 'print', 'approve', 'reopenResult'].includes(act);
        } else if (role === 'Chemist') {
          const allowedScreens: ResourceScreen[] = [
            'dashboard',
            'tests',
            'scientificDepartments',
            'sampleTubes',
            'testParameters',
            'requests',
            'samples',
            'results',
            'aiHub',
            'bloodFilmAi',
            'urineMicroscopyAi',
            'stoolMicroscopyAi',
            'resultReview',
            'printing',
            'inventory',
          ];
          actions[act] =
            allowedScreens.includes(resource) &&
            ['view', 'add', 'edit', 'delete', 'print', 'approve'].includes(act);
        } else if (role === 'Technician') {
          const allowedScreens: ResourceScreen[] = [
            'dashboard',
            'requests',
            'samples',
            'sampleTubes',
            'results',
            'aiHub',
            'bloodFilmAi',
            'urineMicroscopyAi',
            'stoolMicroscopyAi',
            'printing',
            'inventory',
          ];
          actions[act] =
            allowedScreens.includes(resource) &&
            ['view', 'add', 'edit', 'print'].includes(act);
        } else if (role === 'Receptionist') {
          const allowedScreens: ResourceScreen[] = [
            'dashboard',
            'patients',
            'doctors',
            'doctorSpecialties',
            'tests',
            'scientificDepartments',
            'sampleTubes',
            'requests',
            'samples',
            'invoices',
            'payments',
            'printing',
          ];
          actions[act] =
            allowedScreens.includes(resource) &&
            ['view', 'add', 'edit', 'delete', 'print', 'discount', 'addPayment'].includes(act);
        } else if (role === 'Accountant') {
          const allowedScreens: ResourceScreen[] = [
            'dashboard',
            'doctors',
            'doctorSpecialties',
            'invoices',
            'payments',
            'accounts',
            'journalEntries',
            'cashbox',
            'expenses',
            'commissions',
            'reports',
            'printing',
            'inventory',
            'purchases',
            'erpAccounting',
          ];
          actions[act] =
            allowedScreens.includes(resource) &&
            [
              'view',
              'add',
              'edit',
              'delete',
              'print',
              'export',
              'approve',
              'discount',
              'closeDay',
              'addPayment',
              'payCommission',
              'addJournalEntry',
            ].includes(act);
        }
      }
      list.push({
        id: `${role}_${resource}`,
        role,
        resource,
        actions,
      });
    }
  }
  return list;
}

export async function resetToEmptyExceptUsers(): Promise<void> {
  const existingUsers = await db.users.toArray();
  const existingRoles = await db.roles.toArray();
  const existingSettings = await db.settings.toArray();

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      if (table.name === 'users' || table.name === 'roles' || table.name === 'permissions' || table.name === 'settings') {
        continue;
      }
      await table.clear();
    }
  });

  if (existingUsers.length === 0) {
    await db.users.bulkPut([
      { id: 'usr_1', username: 'owner', passwordHash: 'owner123', fullNameAr: 'د. طارق المنشاوي (المالك)', fullNameEn: 'Dr. Tarek El-Menshawy (Owner)', role: 'Owner', employeeId: 'emp_1', active: true, createdAt: '2022-01-10' },
      { id: 'usr_2', username: 'doctor', passwordHash: 'doctor123', fullNameAr: 'د. سلمى عبد الرحمن', fullNameEn: 'Dr. Salma Abdelrahman', role: 'Doctor', employeeId: 'emp_2', active: true, createdAt: '2022-03-15' },
      { id: 'usr_3', username: 'chemist', passwordHash: 'chemist123', fullNameAr: 'ك. محمود الشافعي', fullNameEn: 'Mahmoud El-Shafei', role: 'Chemist', employeeId: 'emp_3', active: true, createdAt: '2023-01-20' },
      { id: 'usr_4', username: 'technician', passwordHash: 'tech123', fullNameAr: 'أحمد حسن فؤاد', fullNameEn: 'Ahmed Hassan Fouad', role: 'Technician', employeeId: 'emp_4', active: true, createdAt: '2023-05-01' },
      { id: 'usr_5', username: 'admin', passwordHash: 'admin123', fullNameAr: 'مريم عادل نصار', fullNameEn: 'Mariam Adel Nassar', role: 'Receptionist', employeeId: 'emp_5', active: true, createdAt: '2023-07-12' },
      { id: 'usr_6', username: 'accountant', passwordHash: 'accountant123', fullNameAr: 'خالد سعيد منصور', fullNameEn: 'Khaled Saeed Mansour', role: 'Accountant', employeeId: 'emp_6', active: true, createdAt: '2022-11-01' },
    ]);
  }
  if (existingRoles.length === 0) {
    await db.roles.bulkPut([
      { id: 'role_owner', name: 'Owner', titleAr: 'مالك المعمل', titleEn: 'Lab Owner', descriptionAr: 'صلاحيات كاملة لإدارة النظام والمالية والصلاحيات', descriptionEn: 'Full system, financial, and permission control' },
      { id: 'role_doctor', name: 'Doctor', titleAr: 'طبيب مختبر', titleEn: 'Lab Doctor', descriptionAr: 'مراجعة واعتماد النتائج الطبية والتقارير', descriptionEn: 'Medical review and final approval of lab results' },
      { id: 'role_chemist', name: 'Chemist', titleAr: 'كيميائي', titleEn: 'Biochemist', descriptionAr: 'إجراء التحاليل وإدخال ومراجعة النتائج', descriptionEn: 'Perform analyses and enter/verify test parameters' },
      { id: 'role_tech', name: 'Technician', titleAr: 'فني مختبر', titleEn: 'Lab Technician', descriptionAr: 'استقبال وسحب العينات وإدخال النتائج الأولية', descriptionEn: 'Sample collection, reception, and initial entry' },
      { id: 'role_reception', name: 'Receptionist', titleAr: 'إداري / استقبال', titleEn: 'Receptionist', descriptionAr: 'تسجيل المرضى والطلبات والفواتير والمدفوعات', descriptionEn: 'Patient registration, requests, invoicing, and receipts' },
      { id: 'role_accountant', name: 'Accountant', titleAr: 'محاسب', titleEn: 'Accountant', descriptionAr: 'إدارة الحسابات والقيود اليومية والصندوق وعمولات الأطباء', descriptionEn: 'Accounting, journal entries, cashbox, and doctor commissions' },
    ]);
  }
  await db.permissions.bulkPut(buildRolePermissions());
  await db.doctorSpecialties.bulkPut(DEFAULT_DOCTOR_SPECIALTIES);
  await db.scientificDepartments.bulkPut(DEFAULT_SCIENTIFIC_DEPARTMENTS);
  await db.sampleTubes.bulkPut(DEFAULT_SAMPLE_TUBES);
  if (existingSettings.length === 0) {
    await db.settings.put({
      id: 'default',
      labNameAr: 'مختبرات الشفاء التخصصية للتحاليل الطبية',
      labNameEn: 'Al-Shifa Specialized Medical Laboratories',
      branchNameAr: 'الفرع الرئيسي',
      branchNameEn: 'Main Branch',
      addressAr: 'القاهرة',
      addressEn: 'Cairo',
      phone: '19014',
      currency: 'EGP',
      defaultTaxRate: 14,
      defaultLanguage: 'ar',
      enableCriticalAlerts: true,
      commissionIncludesTax: true,
      commissionFromCollectedOnly: true,
      barcodeFormat: 'CODE128',
      printFooterAr: 'تقرير معتمد إلكترونيًا',
      printFooterEn: 'Electronically Validated Report',
    });
  }
  try {
    localStorage.setItem('tlab_clean_db_mode', 'true');
    localStorage.removeItem('tlab_demo_mode');
  } catch {
    // ignore
  }
}

export async function seedDatabase(forceReset = false): Promise<void> {
  if (forceReset) {
    try {
      localStorage.removeItem('tlab_clean_db_mode');
      localStorage.setItem('tlab_demo_mode', 'true');
    } catch {
      // ignore
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
  } else {
    const isDemoMode =
      typeof localStorage !== 'undefined' && localStorage.getItem('tlab_demo_mode') === 'true';
    if (!isDemoMode) {
      // Default to Empty Database (all tables empty except Users, Roles, Permissions, Settings)
      const isAlreadyClean =
        typeof localStorage !== 'undefined' && localStorage.getItem('tlab_clean_db_mode') === 'true';
      const existingUsers = await db.users.count();
      if (!isAlreadyClean || existingUsers === 0) {
        await resetToEmptyExceptUsers();
      } else {
        await db.permissions.bulkPut(buildRolePermissions());
      }
      return;
    }

    const existingUsers = await db.users.count();
    if (existingUsers > 0) {
      await db.permissions.bulkPut(buildRolePermissions());
      await seedErpData(false);
      return;
    }
  }

  const roles: Role[] = [
    { id: 'role_owner', name: 'Owner', titleAr: 'مالك المعمل', titleEn: 'Lab Owner', descriptionAr: 'صلاحيات كاملة لإدارة النظام والمالية والصلاحيات', descriptionEn: 'Full system, financial, and permission control' },
    { id: 'role_doctor', name: 'Doctor', titleAr: 'طبيب مختبر', titleEn: 'Lab Doctor', descriptionAr: 'مراجعة واعتماد النتائج الطبية والتقارير', descriptionEn: 'Medical review and final approval of lab results' },
    { id: 'role_chemist', name: 'Chemist', titleAr: 'كيميائي', titleEn: 'Biochemist', descriptionAr: 'إجراء التحاليل وإدخال ومراجعة النتائج', descriptionEn: 'Perform analyses and enter/verify test parameters' },
    { id: 'role_tech', name: 'Technician', titleAr: 'فني مختبر', titleEn: 'Lab Technician', descriptionAr: 'استقبال وسحب العينات وإدخال النتائج الأولية', descriptionEn: 'Sample collection, reception, and initial entry' },
    { id: 'role_reception', name: 'Receptionist', titleAr: 'إداري / استقبال', titleEn: 'Receptionist', descriptionAr: 'تسجيل المرضى والطلبات والفواتير والمدفوعات', descriptionEn: 'Patient registration, requests, invoicing, and receipts' },
    { id: 'role_accountant', name: 'Accountant', titleAr: 'محاسب', titleEn: 'Accountant', descriptionAr: 'إدارة الحسابات والقيود اليومية والصندوق وعمولات الأطباء', descriptionEn: 'Accounting, journal entries, cashbox, and doctor commissions' },
  ];

  const employees: Employee[] = [
    { id: 'emp_1', code: 'EMP-001', nameAr: 'د. طارق المنشاوي', nameEn: 'Dr. Tarek El-Menshawy', role: 'Owner', department: 'الإدارة العليا', phone: '01001112233', salary: 35000, active: true, joinedAt: '2022-01-10' },
    { id: 'emp_2', code: 'EMP-002', nameAr: 'د. سلمى عبد الرحمن', nameEn: 'Dr. Salma Abdelrahman', role: 'Doctor', department: 'الباثولوجيا الإكلينيكية', phone: '01002223344', salary: 22000, active: true, joinedAt: '2022-03-15' },
    { id: 'emp_3', code: 'EMP-003', nameAr: 'ك. محمود الشافعي', nameEn: 'Mahmoud El-Shafei', role: 'Chemist', department: 'الكيمياء الحيوية والهرمونات', phone: '01003334455', salary: 14000, active: true, joinedAt: '2023-01-20' },
    { id: 'emp_4', code: 'EMP-004', nameAr: 'أحمد حسن فؤاد', nameEn: 'Ahmed Hassan Fouad', role: 'Technician', department: 'سحب واستقبال العينات', phone: '01004445566', salary: 9500, active: true, joinedAt: '2023-05-01' },
    { id: 'emp_5', code: 'EMP-005', nameAr: 'مريم عادل نصار', nameEn: 'Mariam Adel Nassar', role: 'Receptionist', department: 'الاستقبال وخدمة المرضى', phone: '01005556677', salary: 8500, active: true, joinedAt: '2023-07-12' },
    { id: 'emp_6', code: 'EMP-006', nameAr: 'خالد سعيد منصور', nameEn: 'Khaled Saeed Mansour', role: 'Accountant', department: 'الإدارة المالية والمحاسبة', phone: '01006667788', salary: 15000, active: true, joinedAt: '2022-11-01' },
    { id: 'emp_7', code: 'EMP-007', nameAr: 'ك. نهى جمال الدين', nameEn: 'Noha Gamal El-Din', role: 'Chemist', department: 'أمراض الدم والمناعة', phone: '01007778899', salary: 13500, active: true, joinedAt: '2024-02-01' },
    { id: 'emp_8', code: 'EMP-008', nameAr: 'يوسف إبراهيم زكي', nameEn: 'Youssef Ibrahim Zaki', role: 'Technician', department: 'الميكروبيولوجي والطفيليات', phone: '01008889900', salary: 9000, active: true, joinedAt: '2024-04-15' },
  ];

  const users: User[] = [
    { id: 'usr_1', username: 'owner', passwordHash: 'owner123', fullNameAr: 'د. طارق المنشاوي (المالك)', fullNameEn: 'Dr. Tarek El-Menshawy (Owner)', role: 'Owner', employeeId: 'emp_1', active: true, createdAt: '2022-01-10' },
    { id: 'usr_2', username: 'doctor', passwordHash: 'doctor123', fullNameAr: 'د. سلمى عبد الرحمن', fullNameEn: 'Dr. Salma Abdelrahman', role: 'Doctor', employeeId: 'emp_2', active: true, createdAt: '2022-03-15' },
    { id: 'usr_3', username: 'chemist', passwordHash: 'chemist123', fullNameAr: 'ك. محمود الشافعي', fullNameEn: 'Mahmoud El-Shafei', role: 'Chemist', employeeId: 'emp_3', active: true, createdAt: '2023-01-20' },
    { id: 'usr_4', username: 'technician', passwordHash: 'tech123', fullNameAr: 'أحمد حسن فؤاد', fullNameEn: 'Ahmed Hassan Fouad', role: 'Technician', employeeId: 'emp_4', active: true, createdAt: '2023-05-01' },
    { id: 'usr_5', username: 'admin', passwordHash: 'admin123', fullNameAr: 'مريم عادل نصار', fullNameEn: 'Mariam Adel Nassar', role: 'Receptionist', employeeId: 'emp_5', active: true, createdAt: '2023-07-12' },
    { id: 'usr_6', username: 'accountant', passwordHash: 'accountant123', fullNameAr: 'خالد سعيد منصور', fullNameEn: 'Khaled Saeed Mansour', role: 'Accountant', employeeId: 'emp_6', active: true, createdAt: '2022-11-01' },
  ];

  const doctors: Doctor[] = [
    { id: 'doc_1', code: 'DOC-001', nameAr: 'أ.د. حسام الدين فاروق', nameEn: 'Prof. Hossam El-Din Farouk', specialty: 'باطنة وغدد صماء', phone: '01112223301', type: 'referred', commissionRate: 15, commissionEnabled: true, notes: 'استشاري الباطنة والسكر', active: true },
    { id: 'doc_2', code: 'DOC-002', nameAr: 'د. رانيا مصطفى كامل', nameEn: 'Dr. Rania Mostafa Kamel', specialty: 'نساء وتوليد', phone: '01112223302', type: 'referred', commissionRate: 20, commissionEnabled: true, notes: 'متابعة حمل وتحاليل هرمونات', active: true },
    { id: 'doc_3', code: 'DOC-003', nameAr: 'د. وائل عبد العزيز', nameEn: 'Dr. Wael Abdelaziz', specialty: 'قلب وأوعية دموية', phone: '01112223303', type: 'referred', commissionRate: 12, commissionEnabled: true, notes: 'تحاليل الدهون وإنزيمات القلب', active: true },
    { id: 'doc_4', code: 'DOC-004', nameAr: 'د. شريف النجار', nameEn: 'Dr. Sherif El-Naggar', specialty: 'أطفال وحديثي الولادة', phone: '01112223304', type: 'referred', commissionRate: 10, commissionEnabled: true, notes: 'مركز رعاية الطفل', active: true },
    { id: 'doc_5', code: 'DOC-005', nameAr: 'د. هالة صدقي محمود', nameEn: 'Dr. Hala Sedky Mahmoud', specialty: 'روماتيزم ومناعة', phone: '01112223305', type: 'contracted', commissionRate: 18, commissionEnabled: true, notes: 'تحاليل مناعية متخصصة', active: true },
    { id: 'doc_6', code: 'DOC-006', nameAr: 'د. أيمن الكيلاني', nameEn: 'Dr. Ayman El-Kilany', specialty: 'مسالك بولية وكلى', phone: '01112223306', type: 'referred', commissionRate: 15, commissionEnabled: true, notes: 'مزارع بول ووظائف كلى', active: true },
    { id: 'doc_7', code: 'DOC-007', nameAr: 'د. منى عبد اللطيف', nameEn: 'Dr. Mona Abdellatif', specialty: 'جهاز هضمي وكبد', phone: '01112223307', type: 'referred', commissionRate: 14, commissionEnabled: true, notes: 'تحاليل الفيروسات الكبدية', active: true },
    { id: 'doc_8', code: 'DOC-008', nameAr: 'د. كريم أبو العلا', nameEn: 'Dr. Karim Abou El-Ela', specialty: 'أورام وأمراض دم', phone: '01112223308', type: 'contracted', commissionRate: 20, commissionEnabled: true, notes: 'دلالات أورام شاملة', active: true },
    { id: 'doc_9', code: 'DOC-009', nameAr: 'د. سلمى عبد الرحمن (داخلي)', nameEn: 'Dr. Salma Abdelrahman (Internal)', specialty: 'باثولوجيا إكلينيكية', phone: '01112223309', type: 'internal', commissionRate: 0, commissionEnabled: false, notes: 'طبيب المعمل الداخلي', active: true },
    { id: 'doc_10', code: 'DOC-010', nameAr: 'د. مدحت شلبي الزيني', nameEn: 'Dr. Medhat Shalaby El-Zini', specialty: 'جراحة عامة', phone: '01112223310', type: 'referred', commissionRate: 10, commissionEnabled: true, notes: 'تحاليل ما قبل العمليات', active: true },
  ];

  const patientNames = [
    ['أحمد علي محمد', 'male', 38, 'percentage', 10],
    ['فاطمة الزهراء حسن', 'female', 29, 'fixed', 50],
    ['محمد عبد السلام', 'male', 54, 'none', 0],
    ['سارة محمود إبراهيم', 'female', 34, 'percentage', 15],
    ['عمر فاروق الجندي', 'male', 62, 'fixed', 100],
    ['نور الهدى طارق', 'female', 24, 'none', 0],
    ['حسين كمال الشاذلي', 'male', 47, 'percentage', 10],
    ['ياسمين عادل فوزي', 'female', 31, 'none', 0],
    ['عبد الله مصطفى زهران', 'male', 71, 'percentage', 20],
    ['دينا سمير عبد الوهاب', 'female', 42, 'fixed', 75],
    ['مصطفى السيد البدوي', 'male', 36, 'none', 0],
    ['آية الرحمن مجدي', 'female', 27, 'percentage', 10],
    ['إبراهيم خليل سليمان', 'male', 58, 'none', 0],
    ['هدى عبد المنعم', 'female', 65, 'percentage', 15],
    ['رامي نبيل شكري', 'male', 33, 'fixed', 50],
    ['شيماء حمدي العطار', 'female', 39, 'none', 0],
    ['خالد وليد توفيق', 'male', 45, 'percentage', 10],
    ['إيمان صبري الغندور', 'female', 50, 'none', 0],
    ['زياد تامر الحسيني', 'male', 19, 'none', 0],
    ['ليلى عبد العزيز مراد', 'female', 55, 'fixed', 60],
    ['ماجد رؤوف غالي', 'male', 49, 'percentage', 12],
    ['رشا كمال الديب', 'female', 37, 'none', 0],
    ['تامر حسني عبد الجواد', 'male', 41, 'none', 0],
    ['عبير فؤاد السعيد', 'female', 44, 'percentage', 10],
    ['سعيد صالح الدمرداش', 'male', 68, 'fixed', 80],
  ] as const;

  const patients: Patient[] = patientNames.map(([name, gender, age, discType, discVal], idx) => {
    const birthYear = 2026 - age;
    return {
      id: `pat_${idx + 1}`,
      code: `PAT-${String(idx + 1001)}`,
      name,
      phone: `0109${String(1000000 + idx * 13579).slice(0, 7)}`,
      gender,
      birthDate: `${birthYear}-05-${String((idx % 25) + 1).padStart(2, '0')}`,
      age,
      nationalId: `2${String(birthYear).slice(2)}05${String(100000000 + idx * 98765).slice(0, 9)}`,
      address: `القاهرة - مدينة نصر - شارع ${idx + 10}`,
      notes: discType !== 'none' ? 'عميل مميز بخصم افتراضي مسجل' : 'لا توجد ملاحظات خاصة',
      hasDefaultDiscount: discType !== 'none',
      defaultDiscountType: discType,
      defaultDiscountValue: discVal,
      active: true,
      createdAt: '2026-10-01',
    };
  });

  const rawTests: Array<[string, string, string, string, string, string, string, number, number, boolean]> = [
    ['CBC', 'صورة دم كاملة', 'Complete Blood Count (CBC)', 'أمراض الدم', 'Whole Blood', 'EDTA Purple', '2 Hours', 180, 45, true],
    ['FBS', 'سكر صائم بالدم', 'Fasting Blood Sugar (FBS)', 'الكيمياء الحيوية', 'Serum / Plasma', 'Fluoride Gray', '1 Hour', 90, 20, true],
    ['HBA1C', 'السكر التراكمي HbA1c', 'Glycated Hemoglobin (HbA1c)', 'الكيمياء الحيوية', 'Whole Blood', 'EDTA Purple', '3 Hours', 280, 75, true],
    ['LIPID', 'ملف الدهون الكامل', 'Complete Lipid Profile', 'الكيمياء الحيوية', 'Serum', 'Plain Red / Gel', '4 Hours', 380, 95, true],
    ['ALT', 'إنزيم الكبد ALT (SGPT)', 'Alanine Aminotransferase (ALT)', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 120, 30, true],
    ['AST', 'إنزيم الكبد AST (SGOT)', 'Aspartate Aminotransferase (AST)', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 120, 30, true],
    ['BIL-T', 'الصفراء الكلية والمباشرة', 'Total & Direct Bilirubin', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 150, 35, true],
    ['ALB', 'الألبومين بالدم', 'Serum Albumin', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 110, 25, true],
    ['CREAT', 'الكرياتينين بالدم (وظائف كلى)', 'Serum Creatinine', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 110, 25, true],
    ['UREA', 'البولينا بالدم', 'Blood Urea', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 110, 25, true],
    ['UA', 'حمض اليوريك (النقرس)', 'Serum Uric Acid', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '2 Hours', 120, 28, true],
    ['TSH', 'هرمون الغدة الدرقية TSH', 'Thyroid Stimulating Hormone (TSH)', 'الهرمونات', 'Serum', 'Gel Yellow', '6 Hours', 260, 70, true],
    ['FT3', 'هرمون الغدة الدرقية الحر FT3', 'Free Triiodothyronine (FT3)', 'الهرمونات', 'Serum', 'Gel Yellow', '6 Hours', 240, 65, true],
    ['FT4', 'هرمون الثيروكسين الحر FT4', 'Free Thyroxine (FT4)', 'الهرمونات', 'Serum', 'Gel Yellow', '6 Hours', 240, 65, true],
    ['VIT-D', 'فيتامين د الكلي 25-OH', '25-Hydroxy Vitamin D', 'الهرمونات', 'Serum', 'Gel Yellow', '12 Hours', 550, 160, true],
    ['VIT-B12', 'فيتامين ب12', 'Vitamin B12', 'الهرمونات', 'Serum', 'Gel Yellow', '12 Hours', 420, 120, true],
    ['FERR', 'مخزون الحديد بالدم', 'Serum Ferritin', 'الهرمونات', 'Serum', 'Gel Yellow', '6 Hours', 320, 85, true],
    ['IRON', 'الحديد الكلي بالدم', 'Serum Iron & TIBC', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '4 Hours', 220, 55, true],
    ['CRP', 'بروتين سي التفاعلي الكمي', 'C-Reactive Protein (Quantitative)', 'المناعة', 'Serum', 'Plain Red', '2 Hours', 190, 45, true],
    ['ESR', 'سرعة الترسيب', 'Erythrocyte Sedimentation Rate (ESR)', 'أمراض الدم', 'Whole Blood', 'Citrate Black', '2 Hours', 80, 15, false],
    ['PT-INR', 'زمن وسيولة الدم PT & INR', 'Prothrombin Time & INR', 'أمراض الدم', 'Plasma', 'Citrate Blue', '2 Hours', 160, 40, true],
    ['PTT', 'زمن التجلط الجزئي PTT', 'Activated Partial Thromboplastin Time', 'أمراض الدم', 'Plasma', 'Citrate Blue', '2 Hours', 160, 40, true],
    ['D-DIMER', 'تحليل التجلط D-Dimer', 'D-Dimer Quantitative', 'أمراض الدم', 'Plasma', 'Citrate Blue', '3 Hours', 450, 130, true],
    ['TROP-I', 'إنزيم القلب عالي الحساسية Troponin-I', 'High-Sensitivity Troponin-I', 'الكيمياء الحيوية', 'Serum', 'Heparin / Gel', '1 Hour', 480, 140, true],
    ['PSA-T', 'دلالات أورام البروستاتا PSA', 'Total Prostate Specific Antigen (PSA)', 'الهرمونات', 'Serum', 'Gel Yellow', '12 Hours', 390, 110, true],
    ['CA125', 'دلالات أورام المبيض CA-125', 'Cancer Antigen 125 (CA-125)', 'الهرمونات', 'Serum', 'Gel Yellow', '12 Hours', 420, 120, true],
    ['BHCG', 'اختبار الحمل الرقمي بالدم', 'Beta-hCG Quantitative', 'الهرمونات', 'Serum', 'Gel Yellow', '3 Hours', 250, 60, true],
    ['PRL', 'هرمون الحليب البرولاكتين', 'Serum Prolactin', 'الهرمونات', 'Serum', 'Gel Yellow', '6 Hours', 260, 70, true],
    ['CALC', 'الكالسيوم الكلي والمتأين', 'Total & Ionized Calcium', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '3 Hours', 180, 45, true],
    ['NA-K', 'الصوديوم والبوتاسيوم بالدم', 'Serum Electrolytes (Na & K)', 'الكيمياء الحيوية', 'Serum', 'Heparin Green', '2 Hours', 200, 50, true],
    ['MG', 'الماغنسيوم بالدم', 'Serum Magnesium', 'الكيمياء الحيوية', 'Serum', 'Plain Red', '3 Hours', 150, 35, true],
    ['HCV-AB', 'الأجسام المضادة لفيروس سي', 'HCV Antibodies (ELISA)', 'المناعة', 'Serum', 'Gel Yellow', '6 Hours', 220, 55, true],
    ['HBSAG', 'المستضد السطحي لفيروس بي', 'HBsAg (ELISA)', 'المناعة', 'Serum', 'Gel Yellow', '6 Hours', 220, 55, true],
    ['URINE', 'تحليل البول الكامل', 'Complete Urine Analysis', 'الطفيليات والميكروبيولوجي', 'Urine', 'Sterile Cup', '1 Hour', 90, 18, false],
    ['STOOL', 'تحليل البراز الكامل', 'Complete Stool Analysis', 'الطفيليات والميكروبيولوجي', 'Stool', 'Sterile Cup', '1 Hour', 90, 18, false],
  ];

  const tests: LabTest[] = rawTests.map(
    ([code, nameAr, nameEn, department, sampleType, tubeType, turnaroundTime, price, estimatedCost, commissionEligible], idx) => ({
      id: `tst_${idx + 1}`,
      code,
      nameAr,
      nameEn,
      department,
      sampleType,
      tubeType,
      turnaroundTime,
      price,
      estimatedCost,
      active: true,
      commissionEligible,
      notes: 'يُحفظ في درجة حرارة الغرفة القياسية ويفصل خلال ساعة',
    })
  );

  // Build test parameters: multi-parameter for CBC & Lipid Profile, plus standard parameters for all 35 tests
  const testParameters: TestParameter[] = [
    { id: 'prm_1', testId: 'tst_1', code: 'WBC', nameAr: 'كرات الدم البيضاء', nameEn: 'White Blood Cells (WBC)', unit: '10^3/µL', normalMaleMin: 4.0, normalMaleMax: 11.0, normalFemaleMin: 4.0, normalFemaleMax: 11.0, normalRangeText: '4.0 - 11.0', criticalLow: 2.0, criticalHigh: 30.0, resultType: 'numeric', decimalPlaces: 1, sortOrder: 1, active: true },
    { id: 'prm_2', testId: 'tst_1', code: 'RBC', nameAr: 'كرات الدم الحمراء', nameEn: 'Red Blood Cells (RBC)', unit: '10^6/µL', normalMaleMin: 4.5, normalMaleMax: 5.9, normalFemaleMin: 4.1, normalFemaleMax: 5.1, normalRangeText: 'M: 4.5-5.9 / F: 4.1-5.1', criticalLow: 2.5, criticalHigh: 7.5, resultType: 'numeric', decimalPlaces: 2, sortOrder: 2, active: true },
    { id: 'prm_3', testId: 'tst_1', code: 'HGB', nameAr: 'الهيموجلوبين', nameEn: 'Hemoglobin (Hb)', unit: 'g/dL', normalMaleMin: 13.5, normalMaleMax: 17.5, normalFemaleMin: 12.0, normalFemaleMax: 16.0, normalRangeText: 'M: 13.5-17.5 / F: 12.0-16.0', criticalLow: 7.0, criticalHigh: 20.0, resultType: 'numeric', decimalPlaces: 1, sortOrder: 3, active: true },
    { id: 'prm_4', testId: 'tst_1', code: 'HCT', nameAr: 'الهيماتوكريت (حجم الخلايا)', nameEn: 'Hematocrit (HCT)', unit: '%', normalMaleMin: 41.0, normalMaleMax: 50.0, normalFemaleMin: 36.0, normalFemaleMax: 44.0, normalRangeText: 'M: 41-50% / F: 36-44%', criticalLow: 20.0, criticalHigh: 60.0, resultType: 'numeric', decimalPlaces: 1, sortOrder: 4, active: true },
    { id: 'prm_5', testId: 'tst_1', code: 'PLT', nameAr: 'الصفائح الدموية', nameEn: 'Platelets Count', unit: '10^3/µL', normalMaleMin: 150, normalMaleMax: 450, normalFemaleMin: 150, normalFemaleMax: 450, normalRangeText: '150 - 450', criticalLow: 50, criticalHigh: 1000, resultType: 'numeric', decimalPlaces: 0, sortOrder: 5, active: true },
    { id: 'prm_6', testId: 'tst_4', code: 'CHOL', nameAr: 'الكوليسترول الكلي', nameEn: 'Total Cholesterol', unit: 'mg/dL', normalMaleMin: 120, normalMaleMax: 200, normalFemaleMin: 120, normalFemaleMax: 200, normalRangeText: '< 200 Desirable', criticalLow: 50, criticalHigh: 400, resultType: 'numeric', decimalPlaces: 0, sortOrder: 1, active: true },
    { id: 'prm_7', testId: 'tst_4', code: 'TG', nameAr: 'الدهون الثلاثية', nameEn: 'Triglycerides', unit: 'mg/dL', normalMaleMin: 40, normalMaleMax: 150, normalFemaleMin: 40, normalFemaleMax: 150, normalRangeText: '< 150 Normal', criticalLow: 20, criticalHigh: 500, resultType: 'numeric', decimalPlaces: 0, sortOrder: 2, active: true },
    { id: 'prm_8', testId: 'tst_4', code: 'HDL', nameAr: 'الكوليسترول النافع HDL', nameEn: 'HDL Cholesterol', unit: 'mg/dL', normalMaleMin: 40, normalMaleMax: 90, normalFemaleMin: 50, normalFemaleMax: 95, normalRangeText: '> 40 mg/dL', criticalLow: 20, criticalHigh: 150, resultType: 'numeric', decimalPlaces: 0, sortOrder: 3, active: true },
    { id: 'prm_9', testId: 'tst_4', code: 'LDL', nameAr: 'الكوليسترول الضار LDL', nameEn: 'LDL Cholesterol', unit: 'mg/dL', normalMaleMin: 50, normalMaleMax: 130, normalFemaleMin: 50, normalFemaleMax: 130, normalRangeText: '< 130 Normal', criticalLow: 20, criticalHigh: 300, resultType: 'numeric', decimalPlaces: 0, sortOrder: 4, active: true },
  ];

  // Add default parameter for remaining tests
  let prmCounter = 10;
  for (const t of tests) {
    if (t.id === 'tst_1' || t.id === 'tst_4') continue;
    testParameters.push({
      id: `prm_${prmCounter++}`,
      testId: t.id,
      code: `${t.code}-VAL`,
      nameAr: `نتيجة ${t.nameAr}`,
      nameEn: `${t.nameEn} Level`,
      unit: t.code === 'FBS' ? 'mg/dL' : t.code === 'HBA1C' ? '%' : t.code === 'CREAT' ? 'mg/dL' : t.code === 'TSH' ? 'µIU/mL' : 'U/L',
      normalMaleMin: t.code === 'FBS' ? 70 : t.code === 'HBA1C' ? 4.0 : t.code === 'CREAT' ? 0.7 : 0.5,
      normalMaleMax: t.code === 'FBS' ? 105 : t.code === 'HBA1C' ? 5.7 : t.code === 'CREAT' ? 1.3 : 45.0,
      normalFemaleMin: t.code === 'FBS' ? 70 : t.code === 'HBA1C' ? 4.0 : t.code === 'CREAT' ? 0.6 : 0.5,
      normalFemaleMax: t.code === 'FBS' ? 105 : t.code === 'HBA1C' ? 5.7 : t.code === 'CREAT' ? 1.1 : 45.0,
      normalRangeText: t.code === 'FBS' ? '70 - 105 mg/dL' : t.code === 'HBA1C' ? '4.0 - 5.7 %' : t.code === 'CREAT' ? '0.6 - 1.3 mg/dL' : '0.5 - 45.0',
      criticalLow: t.code === 'FBS' ? 45 : 0.1,
      criticalHigh: t.code === 'FBS' ? 400 : 250,
      resultType: 'numeric',
      decimalPlaces: 1,
      sortOrder: 1,
      active: true,
    });
  }

  // Generate 50 requests, 45 samples, 35 results, 40 invoices, 50 payments, commissions, and journal entries
  const requests: LabRequest[] = [];
  const requestItems: RequestItem[] = [];
  const samples: Sample[] = [];
  const results: LabResult[] = [];
  const invoices: Invoice[] = [];
  const invoiceItems: InvoiceItem[] = [];
  const payments: Payment[] = [];
  const commissions: DoctorCommission[] = [];
  const journalEntries: JournalEntry[] = [];

  const statuses: LabRequest['status'][] = [
    'approved',
    'approved',
    'awaiting_approval',
    'in_analysis',
    'sample_received',
    'awaiting_sample',
  ];

  let reqItemIdx = 1;
  let invItemIdx = 1;
  let payIdx = 1;
  let commIdx = 1;
  let jeIdx = 1;

  for (let i = 1; i <= 50; i++) {
    const pat = patients[(i - 1) % patients.length];
    const isReferred = i % 5 !== 0; // 80% referred, 20% internal
    const doc = isReferred ? doctors[(i - 1) % 8] : undefined;
    const t1 = tests[(i - 1) % tests.length];
    const t2 = tests[(i + 3) % tests.length];
    const selectedTests = [t1, t2];
    const subtotal = selectedTests.reduce((acc, item) => acc + item.price, 0);

    const discType = pat.hasDefaultDiscount ? pat.defaultDiscountType : 'none';
    const discVal = pat.hasDefaultDiscount ? pat.defaultDiscountValue : 0;
    const rawDiscAmount =
      discType === 'percentage'
        ? Math.round((subtotal * discVal) / 100)
        : discType === 'fixed'
        ? discVal
        : 0;
    const discountAmount = Math.min(subtotal, Math.max(0, rawDiscAmount));
    const afterDiscount = subtotal - discountAmount;
    const taxRate = 14;
    const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
    const netTotal = Math.round((afterDiscount + taxAmount) * 100) / 100;

    const reqId = `req_${i}`;
    const reqNum = `REQ-2026-${String(1000 + i)}`;
    const barcode = `BC${String(20260000 + i)}`;
    const status = statuses[(i - 1) % statuses.length];
    const dayStr = String(((i - 1) % 9) + 1).padStart(2, '0');
    const dateStr = `2026-11-${dayStr}`;

    requests.push({
      id: reqId,
      requestNumber: reqNum,
      barcode,
      patientId: pat.id,
      doctorId: doc?.id,
      type: isReferred ? 'referred' : 'internal',
      status,
      subtotal,
      discountType: discType,
      discountValue: discVal,
      discountAmount,
      taxRate,
      taxAmount,
      netTotal,
      createdBy: 'admin',
      createdAt: dateStr,
      notes: isReferred ? `محول من ${doc?.nameAr}` : 'طلب تحليل داخلي مباشر',
    });

    for (const st of selectedTests) {
      requestItems.push({
        id: `ri_${reqItemIdx++}`,
        requestId: reqId,
        testId: st.id,
        price: st.price,
        commissionEligible: st.commissionEligible,
      });
    }

    // Create 45 samples
    if (i <= 45) {
      const sampleStatuses: Sample['status'][] = [
        'received',
        'received',
        'received',
        'received',
        'hemolyzed',
        'insufficient',
      ];
      const smpStatus = sampleStatuses[(i - 1) % sampleStatuses.length];
      samples.push({
        id: `smp_${i}`,
        sampleCode: `SMP-${String(5000 + i)}`,
        requestId: reqId,
        patientId: pat.id,
        sampleType: t1.sampleType,
        tubeType: t1.tubeType,
        status: smpStatus,
        rejectionReason:
          smpStatus === 'hemolyzed'
            ? 'تحلل دموي واضح بالعينة - يلزم إعادة السحب'
            : smpStatus === 'insufficient'
            ? 'كمية العينة غير كافية لإجراء كافة البارامترات'
            : undefined,
        receivedAt: `${dateStr} 09:${String((i % 50) + 10).padStart(2, '0')}`,
        receivedBy: 'technician',
      });
    }

    // Create 35 results
    if (i <= 35) {
      const prms = testParameters.filter((p) => p.testId === t1.id);
      const isCrit = i % 7 === 0;
      const isHigh = i % 4 === 0 && !isCrit;
      const resStatus: LabResult['status'] =
        i <= 25 ? 'approved' : i <= 31 ? 'pending_review' : 'draft';

      const values = prms.map((p) => {
        const val = isCrit
          ? p.criticalHigh + 2
          : isHigh
          ? p.normalMaleMax + 1.5
          : Number(((p.normalMaleMin + p.normalMaleMax) / 2).toFixed(1));
        const flag: LabResult['values'][0]['flag'] = isCrit
          ? 'critical_high'
          : isHigh
          ? 'high'
          : 'normal';
        return {
          parameterId: p.id,
          parameterNameAr: p.nameAr,
          parameterNameEn: p.nameEn,
          value: val,
          unit: p.unit,
          normalRange: p.normalRangeText,
          flag,
        };
      });

      results.push({
        id: `res_${i}`,
        requestId: reqId,
        testId: t1.id,
        patientId: pat.id,
        status: resStatus,
        values,
        enteredBy: 'chemist',
        enteredAt: `${dateStr} 11:20`,
        approvedBy: resStatus === 'approved' ? 'doctor' : undefined,
        approvedAt: resStatus === 'approved' ? `${dateStr} 13:45` : undefined,
        notes: isCrit ? 'نتيجة حرجة تستوجب إبلاغ الطبيب المعالج فورًا' : 'تمت المراجعة وفق المعايير القياسية',
      });
    }

    // Create 40 invoices
    if (i <= 40) {
      const invId = `inv_${i}`;
      const invNum = `INV-2026-${String(3000 + i)}`;
      // Payment scenarios: 1..25 fully paid, 26..33 partial (50%), 34..40 unpaid
      const invStatus: Invoice['status'] =
        i <= 25 ? 'paid' : i <= 33 ? 'partial' : 'unpaid';
      const paidAmount =
        invStatus === 'paid'
          ? netTotal
          : invStatus === 'partial'
          ? Math.round((netTotal / 2) * 100) / 100
          : 0;
      const remainingAmount = Math.round((netTotal - paidAmount) * 100) / 100;
      const method: Invoice['paymentMethod'] =
        i % 3 === 0 ? 'card' : i % 5 === 0 ? 'bank_transfer' : 'cash';

      invoices.push({
        id: invId,
        invoiceNumber: invNum,
        requestId: reqId,
        patientId: pat.id,
        doctorId: doc?.id,
        requestType: isReferred ? 'referred' : 'internal',
        date: dateStr,
        subtotal,
        discountType: discType,
        discountValue: discVal,
        discountAmount,
        taxRate,
        taxAmount,
        netTotal,
        paidAmount,
        remainingAmount,
        paymentMethod: method,
        status: invStatus,
        notes: '',
        createdBy: 'admin',
      });

      let referredItemsNetSum = 0;
      for (const st of selectedTests) {
        const ratio = subtotal > 0 ? st.price / subtotal : 0;
        const itemNet = Math.round(netTotal * ratio * 100) / 100;
        if (isReferred && st.commissionEligible) {
          referredItemsNetSum += itemNet;
        }
        invoiceItems.push({
          id: `ii_${invItemIdx++}`,
          invoiceId: invId,
          testId: st.id,
          testNameAr: st.nameAr,
          testNameEn: st.nameEn,
          price: st.price,
          netAfterDiscountAndTax: itemNet,
          commissionEligible: st.commissionEligible,
        });
      }

      // Journal Entry for Invoice Issuance
      journalEntries.push({
        id: `je_${jeIdx++}`,
        entryNumber: `JE-${String(1000 + jeIdx)}`,
        date: dateStr,
        referenceType: 'invoice',
        referenceId: invId,
        descriptionAr: `إصدار فاتورة تحاليل رقم ${invNum}`,
        descriptionEn: `Issue Lab Invoice #${invNum}`,
        lines: [
          { accountCode: '1103', accountNameAr: 'ذمم العملاء / المرضى', accountNameEn: 'Accounts Receivable (Patients)', debit: netTotal, credit: 0 },
          { accountCode: '4101', accountNameAr: 'إيرادات التحاليل الطبية', accountNameEn: 'Medical Tests Revenue', debit: 0, credit: afterDiscount },
          { accountCode: '2101', accountNameAr: 'ضريبة القيمة المضافة المستحقة', accountNameEn: 'VAT Payable', debit: 0, credit: taxAmount },
        ],
        totalDebit: netTotal,
        totalCredit: netTotal,
        createdBy: 'accountant',
      });

      // Payments for paid and partial invoices (total ~50 payments)
      if (paidAmount > 0) {
        const payId = `pay_${payIdx}`;
        const payNum = `PAY-2026-${String(7000 + payIdx)}`;
        payIdx++;
        payments.push({
          id: payId,
          paymentNumber: payNum,
          invoiceId: invId,
          invoiceNumber: invNum,
          patientId: pat.id,
          date: dateStr,
          amount: paidAmount,
          method,
          createdBy: 'admin',
          status: 'active',
          notes: invStatus === 'paid' ? 'سداد كامل للفاتورة' : 'دفعة أولى تحت الحساب (50%)',
        });

        journalEntries.push({
          id: `je_${jeIdx++}`,
          entryNumber: `JE-${String(1000 + jeIdx)}`,
          date: dateStr,
          referenceType: 'payment',
          referenceId: payId,
          descriptionAr: `تحصيل دفعة ${payNum} للفاتورة ${invNum}`,
          descriptionEn: `Payment Receipt ${payNum} for Invoice ${invNum}`,
          lines: [
            {
              accountCode: method === 'cash' ? '1101' : '1102',
              accountNameAr: method === 'cash' ? 'الصندوق النقدي' : 'البنك / الشبكة',
              accountNameEn: method === 'cash' ? 'Cashbox' : 'Bank Account',
              debit: paidAmount,
              credit: 0,
            },
            {
              accountCode: '1103',
              accountNameAr: 'ذمم العملاء / المرضى',
              accountNameEn: 'Accounts Receivable (Patients)',
              debit: 0,
              credit: paidAmount,
            },
          ],
          totalDebit: paidAmount,
          totalCredit: paidAmount,
          createdBy: 'accountant',
        });
      }

      // Doctor Commission strictly for referred requests WITH a referring doctor AND paidAmount > 0
      if (isReferred && doc && doc.commissionEnabled && doc.commissionRate > 0 && paidAmount > 0 && referredItemsNetSum > 0) {
        const collectionRatio = netTotal > 0 ? paidAmount / netTotal : 0;
        const collectedReferredBasis = Math.round(referredItemsNetSum * collectionRatio * 100) / 100;
        const commAmount = Math.round(collectedReferredBasis * (doc.commissionRate / 100) * 100) / 100;
        const isPaidOut = commIdx <= 10;
        const commId = `com_${commIdx++}`;

        commissions.push({
          id: commId,
          doctorId: doc.id,
          invoiceId: invId,
          invoiceNumber: invNum,
          patientId: pat.id,
          date: dateStr,
          invoiceNetTotal: netTotal,
          referredItemsNet: referredItemsNetSum,
          collectedAmount: paidAmount,
          collectionRatio: Math.round(collectionRatio * 10000) / 10000,
          collectedReferredBasis,
          commissionRate: doc.commissionRate,
          commissionAmount: commAmount,
          paidAmount: isPaidOut ? commAmount : 0,
          remainingAmount: isPaidOut ? 0 : commAmount,
          status: isPaidOut ? 'paid' : 'accrued',
        });

        journalEntries.push({
          id: `je_${jeIdx++}`,
          entryNumber: `JE-${String(1000 + jeIdx)}`,
          date: dateStr,
          referenceType: 'commission_accrual',
          referenceId: commId,
          descriptionAr: `استحقاق عمولة طبيب (${doc.nameAr}) عن فاتورة ${invNum}`,
          descriptionEn: `Doctor Commission Accrual (${doc.nameEn}) for ${invNum}`,
          lines: [
            { accountCode: '5101', accountNameAr: 'مصروف عمولات الأطباء', accountNameEn: 'Doctor Commissions Expense', debit: commAmount, credit: 0 },
            { accountCode: '2102', accountNameAr: 'ذمم الأطباء المحولين', accountNameEn: 'Doctors Payable', debit: 0, credit: commAmount },
          ],
          totalDebit: commAmount,
          totalCredit: commAmount,
          createdBy: 'accountant',
        });
      }
    }
  }

  // Add extra split payments so total payments = 50
  while (payments.length < 50) {
    const idx = payments.length + 1;
    const targetInv = invoices[idx % 20];
    payments.push({
      id: `pay_${idx}`,
      paymentNumber: `PAY-2026-${String(7000 + idx)}`,
      invoiceId: targetInv.id,
      invoiceNumber: targetInv.invoiceNumber,
      patientId: targetInv.patientId,
      date: '2026-11-08',
      amount: 150,
      method: 'cash',
      createdBy: 'admin',
      status: 'active',
      notes: 'دفعة إضافية مسجلة في السجل المالي',
    });
  }

  // 20 Expenses
  const expenseCategories: Array<[string, string, number]> = [
    ['المحاليل والمستلزمات', '5104', 4200],
    ['الرواتب والأجور', '5102', 12500],
    ['الإيجار الشهري', '5103', 8000],
    ['الكهرباء والمياه', '5105', 1450],
    ['صيانة أجهزة التحليل', '5106', 2300],
    ['مستلزمات سحب عينات وأنابيب', '5104', 1850],
    ['مطبوعات وأحبار باركود', '5107', 650],
  ];

  const expenses: Expense[] = Array.from({ length: 20 }, (_, i) => {
    const [cat, code, baseAmt] = expenseCategories[i % expenseCategories.length];
    const amt = baseAmt + (i % 4) * 150;
    const expId = `exp_${i + 1}`;
    const expNum = `EXP-2026-${String(400 + i + 1)}`;
    const date = `2026-11-${String((i % 9) + 1).padStart(2, '0')}`;
    return {
      id: expId,
      expenseNumber: expNum,
      category: cat,
      accountCode: code,
      amount: amt,
      date,
      paidBy: 'accountant',
      paymentMethod: i % 3 === 0 ? 'bank_transfer' : 'cash',
      description: `${cat} - دفعة تشغيل رقم ${i + 1}`,
    };
  });

  const chartOfAccounts: Account[] = [
    { id: 'acc_1', code: '1101', nameAr: 'الصندوق النقدي الرئيسي', nameEn: 'Main Cashbox', type: 'asset', balance: 68400 },
    { id: 'acc_2', code: '1102', nameAr: 'البنك والحسابات الجارية', nameEn: 'Bank & POS Accounts', type: 'asset', balance: 112500 },
    { id: 'acc_3', code: '1103', nameAr: 'ذمم العملاء / المرضى الآجلين', nameEn: 'Accounts Receivable (Patients)', type: 'asset', balance: 8420 },
    { id: 'acc_4', code: '2101', nameAr: 'ضريبة القيمة المضافة المستحقة', nameEn: 'VAT Payable', type: 'liability', balance: 4860 },
    { id: 'acc_5', code: '2102', nameAr: 'ذمم الأطباء المحولين (عمولات مستحقة)', nameEn: 'Doctors Commissions Payable', type: 'liability', balance: 3920 },
    { id: 'acc_6', code: '4101', nameAr: 'إيرادات التحاليل الطبية', nameEn: 'Medical Lab Tests Revenue', type: 'revenue', balance: 96500 },
    { id: 'acc_7', code: '4102', nameAr: 'إيرادات السحب المنزلي وأخرى', nameEn: 'Home Visit & Other Revenue', type: 'revenue', balance: 4200 },
    { id: 'acc_8', code: '5101', nameAr: 'مصروف عمولات الأطباء', nameEn: 'Doctor Commissions Expense', type: 'expense', balance: 6450 },
    { id: 'acc_9', code: '5102', nameAr: 'مصروف الرواتب والأجور', nameEn: 'Salaries & Wages Expense', type: 'expense', balance: 25000 },
    { id: 'acc_10', code: '5103', nameAr: 'مصروف الإيجار', nameEn: 'Facility Rent Expense', type: 'expense', balance: 8000 },
    { id: 'acc_11', code: '5104', nameAr: 'مصروف المحاليل والمستلزمات الطبية', nameEn: 'Reagents & Consumables Expense', type: 'expense', balance: 14200 },
    { id: 'acc_12', code: '5105', nameAr: 'مصروف الكهرباء والمياه والمرافق', nameEn: 'Utilities (Power & Water)', type: 'expense', balance: 2900 },
    { id: 'acc_13', code: '5106', nameAr: 'مصروف صيانة ومعايرة الأجهزة', nameEn: 'Analyzer Calibration & Maintenance', type: 'expense', balance: 3600 },
    { id: 'acc_14', code: '5107', nameAr: 'مصروفات إدارية وعمومية أخرى', nameEn: 'General & Admin Expenses', type: 'expense', balance: 1950 },
  ];

  const cashboxSessions: CashboxSession[] = [
    {
      id: 'cb_1',
      openedAt: '2026-11-09 08:00',
      openingBalance: 15000,
      totalIn: 24600,
      totalOut: 4200,
      closingBalance: 35400,
      openedBy: 'accountant',
      status: 'open',
    },
  ];

  const dailyClosings: DailyClosing[] = [
    {
      id: 'dc_1',
      date: '2026-11-08',
      totalInvoices: 18450,
      totalCollectedCash: 12300,
      totalCollectedCard: 4150,
      totalCollectedBank: 2000,
      totalExpenses: 3100,
      netCashInBox: 9200,
      closedBy: 'accountant',
      closedAt: '2026-11-08 22:30',
      notes: 'تمت مطابقة النقدية الفعلية بالصندوق مع تقرير النظام بنجاح',
    },
  ];

  const settings: LabSettings = {
    id: 'default',
    labNameAr: 'مختبرات الشفاء التخصصية للتحاليل الطبية',
    labNameEn: 'Al-Shifa Specialized Medical Laboratories',
    branchNameAr: 'الفرع الرئيسي - مدينة نصر',
    branchNameEn: 'Main Branch - Nasr City',
    addressAr: '24 شارع عباس العقاد - مدينة نصر - القاهرة',
    addressEn: '24 Abbas El-Akkad St., Nasr City, Cairo',
    phone: '19014 / 01001112233',
    currency: 'EGP',
    defaultTaxRate: 14,
    defaultLanguage: 'ar',
    enableCriticalAlerts: true,
    commissionIncludesTax: true,
    commissionFromCollectedOnly: true,
    barcodeFormat: 'CODE128',
    printFooterAr: 'هذا التقرير معتمد إلكترونيًا من مختبرات الشفاء التخصصية - نتمنى لكم دوام الصحة والعافية',
    printFooterEn: 'This report is electronically validated by Al-Shifa Medical Laboratories.',
  };

  const auditLogs: AuditLog[] = [
    { id: 'aud_1', userId: 'usr_1', username: 'owner', role: 'Owner', action: 'تأسيس النظام وتحميل البيانات التجريبية', screen: 'settings', recordId: 'SYSTEM-INIT', timestamp: '2026-11-09 08:00:00', details: 'تم إنشاء 25 مريض، 35 تحليل، 50 طلب، 40 فاتورة، 50 دفعة' },
    { id: 'aud_2', userId: 'usr_2', username: 'doctor', role: 'Doctor', action: 'اعتماد نتيجة تحليل صورة دم كاملة', screen: 'resultReview', recordId: 'res_1', timestamp: '2026-11-09 09:15:22', details: 'اعتماد نهائي للمريض أحمد علي محمد' },
    { id: 'aud_3', userId: 'usr_6', username: 'accountant', role: 'Accountant', action: 'إغلاق يومية الصندوق', screen: 'cashbox', recordId: 'dc_1', timestamp: '2026-11-08 22:30:00', details: 'صافي النقدية 9200 ج.م' },
  ];

  const permissions = buildRolePermissions();

  await db.transaction('rw', db.tables, async () => {
    await db.roles.bulkPut(roles);
    await db.permissions.bulkPut(permissions);
    await db.employees.bulkPut(employees);
    await db.users.bulkPut(users);
    await db.doctorSpecialties.bulkPut(DEFAULT_DOCTOR_SPECIALTIES);
    await db.scientificDepartments.bulkPut(DEFAULT_SCIENTIFIC_DEPARTMENTS);
    await db.sampleTubes.bulkPut(DEFAULT_SAMPLE_TUBES);
    await db.doctors.bulkPut(doctors);
    await db.patients.bulkPut(patients);
    await db.tests.bulkPut(tests);
    await db.testParameters.bulkPut(testParameters);
    await db.requests.bulkPut(requests);
    await db.requestItems.bulkPut(requestItems);
    await db.samples.bulkPut(samples);
    await db.results.bulkPut(results);
    await db.invoices.bulkPut(invoices);
    await db.invoiceItems.bulkPut(invoiceItems);
    await db.payments.bulkPut(payments);
    await db.expenses.bulkPut(expenses);
    await db.commissions.bulkPut(commissions);
    await db.chartOfAccounts.bulkPut(chartOfAccounts);
    await db.journalEntries.bulkPut(journalEntries);
    await db.cashboxSessions.bulkPut(cashboxSessions);
    await db.dailyClosings.bulkPut(dailyClosings);
    await db.settings.put(settings);
    await db.auditLogs.bulkPut(auditLogs);
    await db.aiImageAnalyses.bulkPut([
      {
        id: 'aia_demo_1',
        analysisNumber: 'BF-AI-1001',
        modality: 'blood_film',
        engineMode: 'tlab_ensemble_v4',
        engineSystemNameAr: 'محرك الذكاء الاصطناعي المتقدم',
        engineSystemNameEn: 'Advanced AI Engine',
        patientId: 'pat_1',
        patientName: 'أحمد علي محمد',
        requestId: 'req_1',
        requestNumber: 'REQ-2026-1001',
        stainOrPrep: 'Giemsa Stain (10%)',
        magnification: '100x Oil Immersion',
        contrastEnhanced: true,
        noiseReduced: true,
        overallConfidence: 98.2,
        requiresSpecialistReview: false,
        hasCriticalAlert: true,
        criticalAlertMessageAr: 'تنبيه طبي عاجل: تم رصد طفيل الملاريا الخبيثة (Plasmodium falciparum) ويستلزم إبلاغ الطبيب المعالج فورًا.',
        criticalAlertMessageEn: 'URGENT CLINICAL ALERT: Plasmodium falciparum detected.',
        inconsistencyWarningsAr: [],
        inconsistencyWarningsEn: [],
        clinicalInterpretationAr: 'إصابة نشطة بطفيل الملاريا الخبيثة مع وجود أطوار حلقية وأمشاج هلالية ونقص خفيف بالصفائح.',
        clinicalInterpretationEn: 'Active Plasmodium falciparum infection with ring trophozoites and crescent gametocytes.',
        recommendationsAr: 'إبلاغ الطبيب المعالج فورًا لبدء البروتوكول العلاجي ومتابعة نسبة التطفل كل 12 ساعة.',
        recommendationsEn: 'Notify attending physician immediately for antimalarial therapy.',
        imageDeleted: true,
        findingsCount: 2,
        status: 'completed',
        analyzedBy: 'د. سلمى عبد الرحمن',
        createdAt: '2026-11-10 10:30',
      },
      {
        id: 'aia_demo_2',
        analysisNumber: 'UR-AI-1002',
        modality: 'urine_sediment',
        engineMode: 'tlab_deepmorph',
        engineSystemNameAr: 'نظام التعرف الآلي',
        engineSystemNameEn: 'Automated Recognition System',
        patientId: 'pat_2',
        patientName: 'فاطمة الزهراء حسن',
        requestId: 'req_2',
        requestNumber: 'REQ-2026-1002',
        stainOrPrep: 'Unstained Centrifuged Wet Mount',
        magnification: '40x High Power Field (HPF)',
        contrastEnhanced: true,
        noiseReduced: true,
        overallConfidence: 97.6,
        requiresSpecialistReview: false,
        hasCriticalAlert: false,
        inconsistencyWarningsAr: [],
        inconsistencyWarningsEn: [],
        clinicalInterpretationAr: 'وجود كثيف لبلورات أكسالات الكالسيوم الظرفية (+++) مع كرات دم حمراء (15-20/HPF).',
        clinicalInterpretationEn: 'Heavy Calcium Oxalate Dihydrate crystalluria (+++) with microscopic hematuria.',
        recommendationsAr: 'يُنصح بعمل موجات صوتية على المسالك البولية وزيادة شرب السوائل.',
        recommendationsEn: 'Renal ultrasound and increased hydration recommended.',
        imageDeleted: true,
        findingsCount: 2,
        status: 'completed',
        analyzedBy: 'ك. محمود الشافعي',
        createdAt: '2026-11-10 12:15',
      },
      {
        id: 'aia_demo_3',
        analysisNumber: 'ST-AI-1003',
        modality: 'stool_parasitology',
        engineMode: 'tlab_qvision_hd',
        engineSystemNameAr: 'تقنية التحليل الذكي',
        engineSystemNameEn: 'Smart Analysis Technology',
        patientId: 'pat_3',
        patientName: 'محمد عبد السلام',
        requestId: 'req_3',
        requestNumber: 'REQ-2026-1003',
        stainOrPrep: 'Direct Saline + Lugol Iodine Wet Mount',
        magnification: '40x High Power Field (HPF)',
        contrastEnhanced: true,
        noiseReduced: true,
        overallConfidence: 98.4,
        requiresSpecialistReview: false,
        hasCriticalAlert: true,
        criticalAlertMessageAr: 'تنبيه طبي عاجل: تم رصد بويضات الأسكارس وأكياس الجيارديا لامبليا.',
        criticalAlertMessageEn: 'URGENT ALERT: Ascaris ova and Giardia cysts detected.',
        inconsistencyWarningsAr: [],
        inconsistencyWarningsEn: [],
        clinicalInterpretationAr: 'عدوى طفيلية معوية مختلطة ببويضات الأسكارس المخصبة وأكياس الجيارديا وبلورات شاركو-ليدن.',
        clinicalInterpretationEn: 'Mixed intestinal parasitic infection with Ascaris ova, Giardia cysts, and Charcot-Leyden crystals.',
        recommendationsAr: 'بدء العلاج المضاد للديدان والأوليات وإعادة الفحص بعد أسبوعين.',
        recommendationsEn: 'Start antihelminthic and antiprotozoal therapy and repeat stool exam in 2 weeks.',
        imageDeleted: true,
        findingsCount: 2,
        status: 'corrected',
        analyzedBy: 'د. سلمى عبد الرحمن',
        createdAt: '2026-11-10 14:40',
      },
    ]);

    await db.aiRecognitionFindings.bulkPut([
      {
        id: 'arf_demo_1',
        analysisId: 'aia_demo_1',
        analysisNumber: 'BF-AI-1001',
        modality: 'blood_film',
        groupKey: 'parasites',
        groupTitleAr: 'الطفيليات الدموية (Blood Parasites)',
        groupTitleEn: 'Hemoparasites',
        code: 'PAR-MAL-FALC',
        nameAr: 'طفيل الملاريا الخبيثة (الطور الحلقي والمشيجي الهلالي)',
        nameEn: 'Plasmodium falciparum (Ring Trophozoites & Banana Gametocytes)',
        scientificName: 'Plasmodium falciparum',
        countOrGrade: 'Positive (Parasitemia 3.8%)',
        confidence: 98.7,
        severity: 'critical',
        semanticColor: 'red',
        clinicalSignificanceAr: 'عدوى ملاريا خبيثة نشطة تستوجب التدخل العلاجي الفوري',
        clinicalSignificanceEn: 'Active malignant tertian malaria requiring immediate clinical intervention',
        isCorrected: false,
        createdAt: '2026-11-10 10:30',
      },
      {
        id: 'arf_demo_2',
        analysisId: 'aia_demo_2',
        analysisNumber: 'UR-AI-1002',
        modality: 'urine_sediment',
        groupKey: 'crystals',
        groupTitleAr: 'البلورات والأملاح (Crystals)',
        groupTitleEn: 'Urinary Crystals',
        code: 'URN-CRY-CAOX-DI',
        nameAr: 'بلورات أكسالات الكالسيوم ثنائية التميؤ (الظرفية)',
        nameEn: 'Calcium Oxalate Dihydrate Crystals (Envelope)',
        scientificName: 'Weddellite',
        countOrGrade: '+++ Many (18-22 / HPF)',
        confidence: 98.9,
        severity: 'moderate',
        semanticColor: 'yellow',
        clinicalSignificanceAr: 'المكون الأساسي لحصوات الكالسيوم الكلوية',
        clinicalSignificanceEn: 'Primary constituent of calcium oxalate renal stones',
        isCorrected: false,
        createdAt: '2026-11-10 12:15',
      },
      {
        id: 'arf_demo_3',
        analysisId: 'aia_demo_3',
        analysisNumber: 'ST-AI-1003',
        modality: 'stool_parasitology',
        groupKey: 'helminths',
        groupTitleAr: 'الديدان وبيضها (Helminths & Ova)',
        groupTitleEn: 'Helminths & Ova',
        code: 'STL-HEL-ASCARIS',
        nameAr: 'بويضات دودة الأسكاريس (المخصبة ذات الغلاف المموج)',
        nameEn: 'Ascaris lumbricoides Fertilized Ova',
        scientificName: 'Ascaris lumbricoides',
        countOrGrade: 'Positive (6-8 Ova / LPF)',
        confidence: 99.1,
        severity: 'critical',
        semanticColor: 'red',
        clinicalSignificanceAr: 'عدوى ديدان الأسكاريس الأسطوانية النشطة',
        clinicalSignificanceEn: 'Active Ascariasis roundworm infection',
        isCorrected: true,
        createdAt: '2026-11-10 14:40',
      },
    ]);

    await db.aiCorrections.bulkPut([
      {
        id: 'aic_demo_1',
        analysisId: 'aia_demo_3',
        findingId: 'arf_demo_3',
        modality: 'stool_parasitology',
        groupKey: 'helminths',
        originalCode: 'STL-OTH-VEG',
        originalNameAr: 'ألياف وخلايا نباتية',
        originalNameEn: 'Vegetable Fibers & Plant Spirals',
        originalCountOrGrade: 'Few',
        originalConfidence: 64.5,
        correctedCode: 'STL-HEL-ASCARIS',
        correctedNameAr: 'بويضات دودة الأسكاريس (المخصبة وغير المخصبة)',
        correctedNameEn: 'Ascaris lumbricoides Ova (Fertilized Corticated & Unfertilized)',
        correctedCountOrGrade: 'Positive (6-8 Ova / LPF)',
        correctedSeverity: 'critical',
        correctedSemanticColor: 'red',
        correctionReason: 'تم التحقق بصبغة اليود على تكبير 40x وتبين أنها بويضة أسكارس منزوعة القشرة الخارجية (Decorticated Ascaris Ovum)',
        chromaticSignature: 'V12-P18-A44-E28',
        correctedBy: 'د. سلمى عبد الرحمن',
        createdAt: '2026-11-10 14:45',
      },
    ]);
  });

  await seedErpData(forceReset);
}
