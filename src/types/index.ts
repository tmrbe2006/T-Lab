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
  | 'printing'
  | 'inventory'
  | 'purchases'
  | 'erpAccounting'
  | 'doctorSpecialties'
  | 'scientificDepartments'
  | 'sampleTubes'
  | 'aiHub'
  | 'bloodFilmAi'
  | 'urineMicroscopyAi'
  | 'stoolMicroscopyAi'
  | 'culturePlateAi'
  | 'microbiology'
  | 'qualityControl'
  | 'homeVisits'
  | 'corporateContracts';

export type MicroscopyModality =
  | 'blood_film'
  | 'urine_sediment'
  | 'stool_parasitology'
  | 'culture_plate';

export type VisionEngineMode =
  | 'tlab_ensemble_v4'
  | 'tlab_deepmorph'
  | 'tlab_qvision_hd'
  | 'tlab_optical_morphometric';

export type AiSemanticColor = 'green' | 'yellow' | 'red';

export type AiFindingGroupKey =
  // Blood Film Groups
  | 'rbc'
  | 'wbc'
  | 'platelets'
  | 'parasites'
  | 'artifacts'
  // Urine Microscopy Groups
  | 'cells'
  | 'casts'
  | 'crystals'
  | 'microorganisms'
  | 'others'
  // Stool Microscopy Groups
  | 'protozoa'
  | 'helminths'
  | 'larvae'
  // Culture Plate AI Groups
  | 'uropathogens'
  | 'enteric_pathogens'
  | 'blood_pus_cocci'
  | 'non_fermenters_fungi'
  | 'ast_resistance';

export interface MicroscopyDetectedItem {
  id?: string;
  code: string;
  groupKey?: AiFindingGroupKey;
  categoryAr: string;
  categoryEn: string;
  nameAr: string;
  nameEn: string;
  scientificName?: string;
  sizeMicrons?: string;
  stainColorAr?: string;
  associatedDiseasesAr?: string;
  differentialCriteriaAr?: string;
  differentialCriteriaEn?: string;
  confidenceTierAr?: string;
  confidenceTierEn?: string;
  countOrGrade: string;
  percentage?: number;
  confidence: number;
  severity: 'normal' | 'mild' | 'moderate' | 'critical';
  semanticColor?: AiSemanticColor;
  clinicalSignificanceAr: string;
  clinicalSignificanceEn: string;
  isCorrected?: boolean;
  boundingBoxes?: Array<{ x: number; y: number; w: number; h: number; label: string }>;
}

export interface MicroscopyScanRecord {
  id: string;
  scanNumber: string;
  modality: MicroscopyModality;
  engineMode: VisionEngineMode;
  patientId?: string;
  patientName?: string;
  requestId?: string;
  requestNumber?: string;
  stainOrPrep: string;
  magnification: string;
  sampleQualityAr: string;
  overallDiagnosisAr: string;
  overallDiagnosisEn: string;
  clinicalRecommendationsAr: string;
  clinicalRecommendationsEn?: string;
  inconsistencyWarningsAr?: string[];
  inconsistencyWarningsEn?: string[];
  requiresSpecialistReview?: boolean;
  hasCriticalAlert?: boolean;
  criticalAlertMessageAr?: string;
  criticalAlertMessageEn?: string;
  imageDeleted?: boolean;
  detectedItems: MicroscopyDetectedItem[];
  differentialSummary?: Record<string, number>;
  imageThumbnail?: string;
  analyzedBy: string;
  createdAt: string;
}

/**
 * 1. جدول تحليلات الصور (aiImageAnalyses)
 * يحتفظ بكل عملية تحليل صور مجهرية تم إجراؤها
 */
export interface AiImageAnalysisRecord {
  id: string;
  analysisNumber: string;
  modality: MicroscopyModality;
  engineMode: VisionEngineMode;
  engineSystemNameAr: string;
  engineSystemNameEn: string;
  patientId?: string;
  patientName?: string;
  requestId?: string;
  requestNumber?: string;
  stainOrPrep: string;
  magnification: string;
  contrastEnhanced: boolean;
  noiseReduced: boolean;
  overallConfidence: number;
  requiresSpecialistReview: boolean;
  hasCriticalAlert: boolean;
  criticalAlertMessageAr?: string;
  criticalAlertMessageEn?: string;
  inconsistencyWarningsAr: string[];
  inconsistencyWarningsEn: string[];
  clinicalInterpretationAr: string;
  clinicalInterpretationEn: string;
  recommendationsAr: string;
  recommendationsEn: string;
  imageDataUrl?: string;
  imageDeleted: boolean;
  findingsCount: number;
  status: 'completed' | 'reviewed' | 'corrected';
  analyzedBy: string;
  createdAt: string;
}

/**
 * 2. جدول نتائج التعرف (aiRecognitionFindings)
 * يحتفظ بكل نتيجة مكتشفة ومصنفة داخل التحليل
 */
export interface AiRecognitionFindingRecord {
  id: string;
  analysisId: string;
  analysisNumber: string;
  modality: MicroscopyModality;
  groupKey: AiFindingGroupKey;
  groupTitleAr: string;
  groupTitleEn: string;
  code: string;
  nameAr: string;
  nameEn: string;
  scientificName?: string;
  countOrGrade: string;
  confidence: number;
  severity: 'normal' | 'mild' | 'moderate' | 'critical';
  semanticColor: AiSemanticColor;
  clinicalSignificanceAr: string;
  clinicalSignificanceEn: string;
  isCorrected: boolean;
  boundingBoxes?: Array<{ x: number; y: number; w: number; h: number; label: string }>;
  createdAt: string;
}

/**
 * 3. جدول التصحيحات (aiCorrections)
 * يحتفظ بتصحيحات الأخصائيين لتدريب وتحسين دقة النظام تلقائيًا
 */
export interface AiUserCorrectionRecord {
  id: string;
  analysisId: string;
  findingId: string;
  modality: MicroscopyModality;
  groupKey: AiFindingGroupKey;
  originalCode: string;
  originalNameAr: string;
  originalNameEn: string;
  originalCountOrGrade: string;
  originalConfidence: number;
  correctedCode: string;
  correctedNameAr: string;
  correctedNameEn: string;
  correctedCountOrGrade: string;
  correctedSeverity: 'normal' | 'mild' | 'moderate' | 'critical';
  correctedSemanticColor: AiSemanticColor;
  correctionReason: string;
  chromaticSignature?: string;
  correctedBy: string;
  createdAt: string;
}

export interface DoctorSpecialty {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  notes?: string;
  active: boolean;
}

export interface ScientificDepartment {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  prefix?: string;
  notes?: string;
  active: boolean;
}

export interface SampleTube {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  capColor: string;
  additive: string;
  color?: string;
  sampleType?: string;
  notes?: string;
  active: boolean;
}

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
  nameEn?: string;
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
  isCalculated?: boolean;
  formula?: string;
  formulaCondition?: string;
  formulaNoteAr?: string;
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
  contractId?: string;
  contractName?: string;
  patientShareAmount?: number;
  companyShareAmount?: number;
  homeVisitFee?: number;
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
  contractId?: string;
  contractName?: string;
  patientShareAmount?: number;
  companyShareAmount?: number;
  homeVisitFee?: number;
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

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  balance: number;
  parentCode?: string;
  level?: number;
  isGroup?: boolean;
}

export interface JournalEntryLine {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  debit: number;
  credit: number;
  note?: string;
  description?: string;
  currency?: string;
  exchangeRate?: number;
  costCenter?: string;
  department?: string;
  itemId?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  entryType?: 'auto' | 'automatic' | 'manual' | 'adjustment' | 'closing' | 'reversal';
  referenceType:
    | 'invoice'
    | 'purchase_invoice'
    | 'payment'
    | 'supplier_payment'
    | 'expense'
    | 'stock_movement'
    | 'stock_issue'
    | 'stock_disposal'
    | 'stock_adjustment'
    | 'commission_accrual'
    | 'commission_payout'
    | 'return_note'
    | 'closing'
    | 'reversal'
    | 'manual';
  referenceId: string;
  referenceNumber?: string;
  costCenter?: string;
  descriptionAr: string;
  descriptionEn: string;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  status?: 'draft' | 'posted' | 'reversed';
  reversalEntryId?: string;
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

// ============================================================================
// Enterprise Global Laboratory Modules (ISO 15189, CLSI, Westgard, B2B, Dispatch)
// ============================================================================

export interface DeltaCheckAlert {
  parameterId: string;
  parameterNameAr: string;
  parameterNameEn: string;
  unit: string;
  previousValue: number;
  currentValue: number;
  deltaPercent: number;
  previousDate: string;
  hoursElapsed: number;
  thresholdPercent: number;
  severity: 'warning' | 'critical';
  messageAr: string;
  messageEn: string;
}

export interface CriticalValueLog {
  id: string;
  logNumber: string;
  resultId: string;
  requestId: string;
  patientId: string;
  patientName: string;
  testNameAr: string;
  testNameEn: string;
  criticalParametersSummary: string;
  notifiedPersonType: 'doctor' | 'patient' | 'nurse_icu';
  notifiedPersonName: string;
  notifiedPhone: string;
  notifiedAt: string;
  notifiedBy: string;
  readBackConfirmed: boolean;
  clinicalActionNotes: string;
  status: 'escalated_confirmed' | 'pending_retry';
}

export type AntibioticSensitivityFlag = 'S' | 'I' | 'R';

export interface CultureAntibioticResult {
  antibioticCode: string;
  antibioticNameEn: string;
  antibioticClass: string;
  sensitivity: AntibioticSensitivityFlag;
  micValue: string;
  clsiBreakpoint: string;
}

export interface CultureSensitivityRecord {
  id: string;
  reportNumber: string;
  requestId: string;
  requestNumber: string;
  patientId: string;
  patientName: string;
  doctorName?: string;
  specimenType: 'urine' | 'blood' | 'pus_wound' | 'stool' | 'sputum' | 'csf' | 'swab';
  specimenSourceAr: string;
  specimenSourceEn: string;
  growthStatus: 'positive_growth' | 'no_growth_48h' | 'mixed_flora';
  colonyCount: string;
  incubationHours: number;
  gramStainAr: string;
  gramStainEn: string;
  pusCellsCount: string;
  epithelialCellsCount: string;
  organismCode: string;
  organismNameEn: string;
  organismNameAr: string;
  resistanceMechanisms: Array<'ESBL' | 'MRSA' | 'CRE' | 'VRE' | 'AmpC' | 'None'>;
  standardGuideline: 'CLSI_2025' | 'EUCAST_2025';
  antibiotics: CultureAntibioticResult[];
  clinicalNotesAr: string;
  clinicalNotesEn: string;
  status: 'draft' | 'approved';
  enteredBy: string;
  approvedBy?: string;
  createdAt: string;
}

export type WestgardRuleCode = 'in_control' | '1_2s' | '1_3s' | '2_2s' | 'R_4s' | '4_1s';

export interface QcControlLot {
  id: string;
  lotNumber: string;
  analyzerName: string;
  department: string;
  testId: string;
  testCode: string;
  testNameAr: string;
  testNameEn: string;
  unit: string;
  level: 'Level 1 (Low)' | 'Level 2 (Normal)' | 'Level 3 (High)';
  targetMean: number;
  targetSd: number;
  expiryDate: string;
  qcLocked: boolean;
  active: boolean;
}

export interface QcRunRecord {
  id: string;
  lotId: string;
  lotNumber: string;
  testId: string;
  testCode: string;
  testNameEn: string;
  analyzerName: string;
  level: 'Level 1 (Low)' | 'Level 2 (Normal)' | 'Level 3 (High)';
  runDate: string;
  measuredValue: number;
  targetMean: number;
  targetSd: number;
  zScore: number;
  westgardRule: WestgardRuleCode;
  status: 'accepted' | 'warning' | 'rejected';
  correctiveAction?: string;
  operatorName: string;
}

export type HomeVisitStatus =
  | 'scheduled'
  | 'dispatched'
  | 'sample_collected'
  | 'delivered_to_lab'
  | 'cancelled';

export interface HomeVisitRecord {
  id: string;
  visitNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  address: string;
  landmark: string;
  gpsCoordinates?: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  phlebotomistId: string;
  phlebotomistName: string;
  phlebotomistPhone: string;
  requestedTestsSummary: string;
  visitFee: number;
  estimatedTestsTotal: number;
  fastingRequired: boolean;
  status: HomeVisitStatus;
  collectedAt?: string;
  deliveredAt?: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface CorporateContract {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: 'syndicate' | 'insurance' | 'corporate' | 'lab_to_lab';
  discountPercent: number;
  patientCoPayPercent: number; // e.g., 20 means patient pays 20% of net
  companyCoveragePercent: number; // e.g., 80 means company/insurance covers 80% of net
  creditLimit: number;
  currentBalance: number;
  contactPerson: string;
  phone: string;
  taxNumber?: string;
  active: boolean;
  notes: string;
}

export * from './erp.types';


