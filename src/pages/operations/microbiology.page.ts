import { authService } from '../../auth/auth.service';
import {
  closeModal,
  escapeHtml,
  openModal,
  renderPageHeader,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { patientsRepository, requestsRepository } from '../../repositories';
import { router } from '../../router';
import {
  buildQrVerificationFooterHtml,
  ensureEnterpriseSeedData,
  openWhatsAppDispatchModal,
} from '../../services/enterprise-lab.service';
import type {
  AntibioticCatalogItem,
  AntibioticSensitivityFlag,
  CultureAntibioticResult,
  CultureSensitivityRecord,
} from '../../types';
import { formatDate, generateId } from '../../utils/format';

interface OrganismPreset {
  code: string;
  nameEn: string;
  nameAr: string;
  gramStainAr: string;
  gramStainEn: string;
  defaultResistance: Array<'ESBL' | 'MRSA' | 'CRE' | 'VRE' | 'AmpC' | 'None'>;
  antibiotics: CultureAntibioticResult[];
}

const ORGANISM_PRESETS: OrganismPreset[] = [
  {
    code: 'ECOLI',
    nameEn: 'Escherichia coli',
    nameAr: 'إيشيريشيا كولاي (Escherichia coli)',
    gramStainAr: 'عصيات سالبة الجرام (Gram-Negative Bacilli)',
    gramStainEn: 'Gram-Negative Bacilli',
    defaultResistance: ['None'],
    antibiotics: [
      { antibioticCode: 'MEM', antibioticNameEn: 'Meropenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '<= 0.25 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'IPM', antibioticNameEn: 'Imipenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '<= 0.5 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'AK', antibioticNameEn: 'Amikacin', antibioticClass: 'Aminoglycosides', sensitivity: 'S', micValue: '2.0 µg/mL', clsiBreakpoint: 'S <= 16, R >= 64' },
      { antibioticCode: 'NIT', antibioticNameEn: 'Nitrofurantoin', antibioticClass: 'Nitrofurans', sensitivity: 'S', micValue: '16 µg/mL', clsiBreakpoint: 'S <= 32, R >= 128' },
      { antibioticCode: 'FOS', antibioticNameEn: 'Fosfomycin', antibioticClass: 'Fosfomycins', sensitivity: 'S', micValue: '8 µg/mL', clsiBreakpoint: 'S <= 64, R >= 256' },
      { antibioticCode: 'TZP', antibioticNameEn: 'Piperacillin-Tazobactam', antibioticClass: 'Beta-Lactam/Inhibitor', sensitivity: 'S', micValue: '4.0 µg/mL', clsiBreakpoint: 'S <= 8, R >= 32' },
      { antibioticCode: 'CRO', antibioticNameEn: 'Ceftriaxone', antibioticClass: 'Cephalosporins 3rd Gen', sensitivity: 'S', micValue: '0.5 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'CIP', antibioticNameEn: 'Ciprofloxacin', antibioticClass: 'Fluoroquinolones', sensitivity: 'I', micValue: '0.5 µg/mL', clsiBreakpoint: 'S <= 0.25, R >= 1' },
      { antibioticCode: 'AMC', antibioticNameEn: 'Amoxicillin-Clavulanate', antibioticClass: 'Penicillins', sensitivity: 'R', micValue: '>= 32 µg/mL', clsiBreakpoint: 'S <= 8, R >= 32' },
    ],
  },
  {
    code: 'ECOLI_ESBL',
    nameEn: 'Escherichia coli (ESBL Producer)',
    nameAr: 'إيشيريشيا كولاي منتجة لإنزيمات البيتا لاكتاماز (E. coli ESBL)',
    gramStainAr: 'عصيات سالبة الجرام (Gram-Negative Bacilli)',
    gramStainEn: 'Gram-Negative Bacilli',
    defaultResistance: ['ESBL'],
    antibiotics: [
      { antibioticCode: 'MEM', antibioticNameEn: 'Meropenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '<= 0.25 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'IPM', antibioticNameEn: 'Imipenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '<= 0.5 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'AK', antibioticNameEn: 'Amikacin', antibioticClass: 'Aminoglycosides', sensitivity: 'S', micValue: '2.0 µg/mL', clsiBreakpoint: 'S <= 16, R >= 64' },
      { antibioticCode: 'NIT', antibioticNameEn: 'Nitrofurantoin', antibioticClass: 'Nitrofurans', sensitivity: 'S', micValue: '16 µg/mL', clsiBreakpoint: 'S <= 32, R >= 128' },
      { antibioticCode: 'FOS', antibioticNameEn: 'Fosfomycin', antibioticClass: 'Fosfomycins', sensitivity: 'S', micValue: '8 µg/mL', clsiBreakpoint: 'S <= 64, R >= 256' },
      { antibioticCode: 'TZP', antibioticNameEn: 'Piperacillin-Tazobactam', antibioticClass: 'Beta-Lactam/Inhibitor', sensitivity: 'I', micValue: '16 µg/mL', clsiBreakpoint: 'S <= 8, R >= 32' },
      { antibioticCode: 'CRO', antibioticNameEn: 'Ceftriaxone', antibioticClass: 'Cephalosporins 3rd Gen', sensitivity: 'R', micValue: '>= 64 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'CIP', antibioticNameEn: 'Ciprofloxacin', antibioticClass: 'Fluoroquinolones', sensitivity: 'R', micValue: '>= 4 µg/mL', clsiBreakpoint: 'S <= 0.25, R >= 1' },
      { antibioticCode: 'AMC', antibioticNameEn: 'Amoxicillin-Clavulanate', antibioticClass: 'Penicillins', sensitivity: 'R', micValue: '>= 32 µg/mL', clsiBreakpoint: 'S <= 8, R >= 32' },
    ],
  },
  {
    code: 'KLEB',
    nameEn: 'Klebsiella pneumoniae',
    nameAr: 'كليبسيلا رئوية (Klebsiella pneumoniae)',
    gramStainAr: 'عصيات سالبة الجرام ذات محفظة (Capsulated Gram-Negative Bacilli)',
    gramStainEn: 'Capsulated Gram-Negative Bacilli',
    defaultResistance: ['None'],
    antibiotics: [
      { antibioticCode: 'MEM', antibioticNameEn: 'Meropenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '0.25 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'IPM', antibioticNameEn: 'Imipenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '0.5 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'AK', antibioticNameEn: 'Amikacin', antibioticClass: 'Aminoglycosides', sensitivity: 'S', micValue: '4.0 µg/mL', clsiBreakpoint: 'S <= 16, R >= 64' },
      { antibioticCode: 'TZP', antibioticNameEn: 'Piperacillin-Tazobactam', antibioticClass: 'Beta-Lactam/Inhibitor', sensitivity: 'S', micValue: '4.0 µg/mL', clsiBreakpoint: 'S <= 8, R >= 32' },
      { antibioticCode: 'CRO', antibioticNameEn: 'Ceftriaxone', antibioticClass: 'Cephalosporins 3rd Gen', sensitivity: 'S', micValue: '0.5 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'CIP', antibioticNameEn: 'Ciprofloxacin', antibioticClass: 'Fluoroquinolones', sensitivity: 'S', micValue: '0.12 µg/mL', clsiBreakpoint: 'S <= 0.25, R >= 1' },
      { antibioticCode: 'AMC', antibioticNameEn: 'Amoxicillin-Clavulanate', antibioticClass: 'Penicillins', sensitivity: 'I', micValue: '16 µg/mL', clsiBreakpoint: 'S <= 8, R >= 32' },
    ],
  },
  {
    code: 'SAUR_MRSA',
    nameEn: 'Staphylococcus aureus (MRSA)',
    nameAr: 'المكورات العنقودية الذهبية المقاومة للميثيسيلين (MRSA)',
    gramStainAr: 'مكورات موجبة الجرام في تجمعات عنقودية (Gram-Positive Cocci in Clusters)',
    gramStainEn: 'Gram-Positive Cocci in Clusters',
    defaultResistance: ['MRSA'],
    antibiotics: [
      { antibioticCode: 'VAN', antibioticNameEn: 'Vancomycin', antibioticClass: 'Glycopeptides', sensitivity: 'S', micValue: '1.0 µg/mL', clsiBreakpoint: 'S <= 2, R >= 16' },
      { antibioticCode: 'LZD', antibioticNameEn: 'Linezolid', antibioticClass: 'Oxazolidinones', sensitivity: 'S', micValue: '2.0 µg/mL', clsiBreakpoint: 'S <= 4, R >= 8' },
      { antibioticCode: 'SXT', antibioticNameEn: 'Trimethoprim-Sulfamethoxazole', antibioticClass: 'Folate Antagonists', sensitivity: 'S', micValue: '<= 0.5/9.5 µg/mL', clsiBreakpoint: 'S <= 2/38' },
      { antibioticCode: 'DOX', antibioticNameEn: 'Doxycycline', antibioticClass: 'Tetracyclines', sensitivity: 'S', micValue: '1.0 µg/mL', clsiBreakpoint: 'S <= 4, R >= 16' },
      { antibioticCode: 'CLI', antibioticNameEn: 'Clindamycin', antibioticClass: 'Lincosamides', sensitivity: 'I', micValue: '1.0 µg/mL', clsiBreakpoint: 'S <= 0.5, R >= 4' },
      { antibioticCode: 'FOX', antibioticNameEn: 'Cefoxitin (MRSA Screen)', antibioticClass: 'Cephamycins', sensitivity: 'R', micValue: '>= 8 µg/mL', clsiBreakpoint: 'S <= 4, R >= 8' },
      { antibioticCode: 'AMC', antibioticNameEn: 'Amoxicillin-Clavulanate', antibioticClass: 'Penicillins', sensitivity: 'R', micValue: '>= 32 µg/mL', clsiBreakpoint: 'MRSA Intrinsic R' },
      { antibioticCode: 'CRO', antibioticNameEn: 'Ceftriaxone', antibioticClass: 'Cephalosporins', sensitivity: 'R', micValue: '>= 64 µg/mL', clsiBreakpoint: 'MRSA Intrinsic R' },
    ],
  },
  {
    code: 'PAER',
    nameEn: 'Pseudomonas aeruginosa',
    nameAr: 'سودوموناس أيروجينوزا (Pseudomonas aeruginosa)',
    gramStainAr: 'عصيات سالبة الجرام غير مخمرة (Non-Fermenting Gram-Negative Bacilli)',
    gramStainEn: 'Non-Fermenting Gram-Negative Bacilli',
    defaultResistance: ['None'],
    antibiotics: [
      { antibioticCode: 'MEM', antibioticNameEn: 'Meropenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '0.5 µg/mL', clsiBreakpoint: 'S <= 2, R >= 8' },
      { antibioticCode: 'AK', antibioticNameEn: 'Amikacin', antibioticClass: 'Aminoglycosides', sensitivity: 'S', micValue: '4.0 µg/mL', clsiBreakpoint: 'S <= 16, R >= 64' },
      { antibioticCode: 'TZP', antibioticNameEn: 'Piperacillin-Tazobactam', antibioticClass: 'Beta-Lactam/Inhibitor', sensitivity: 'S', micValue: '8.0 µg/mL', clsiBreakpoint: 'S <= 16, R >= 128' },
      { antibioticCode: 'CIP', antibioticNameEn: 'Ciprofloxacin', antibioticClass: 'Fluoroquinolones', sensitivity: 'I', micValue: '0.5 µg/mL', clsiBreakpoint: 'S <= 0.25, R >= 1' },
      { antibioticCode: 'CRO', antibioticNameEn: 'Ceftriaxone', antibioticClass: 'Cephalosporins 3rd Gen', sensitivity: 'R', micValue: '>= 64 µg/mL', clsiBreakpoint: 'Intrinsic R' },
      { antibioticCode: 'AMC', antibioticNameEn: 'Amoxicillin-Clavulanate', antibioticClass: 'Penicillins', sensitivity: 'R', micValue: '>= 32 µg/mL', clsiBreakpoint: 'Intrinsic R' },
    ],
  },
  {
    code: 'SALM',
    nameEn: 'Salmonella enterica (H2S+)',
    nameAr: 'سالمونيلا معوية (Salmonella enterica)',
    gramStainAr: 'عصيات سالبة الجرام غير مخمرة للاكتوز (Gram-Negative Bacilli)',
    gramStainEn: 'Gram-Negative Bacilli (NLF, H2S+)',
    defaultResistance: ['None'],
    antibiotics: [
      { antibioticCode: 'CRO', antibioticNameEn: 'Ceftriaxone', antibioticClass: 'Cephalosporins 3rd Gen', sensitivity: 'S', micValue: '<= 0.25 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
      { antibioticCode: 'AZM', antibioticNameEn: 'Azithromycin', antibioticClass: 'Macrolides', sensitivity: 'S', micValue: '4.0 µg/mL', clsiBreakpoint: 'S <= 16, R >= 32' },
      { antibioticCode: 'CIP', antibioticNameEn: 'Ciprofloxacin', antibioticClass: 'Fluoroquinolones', sensitivity: 'S', micValue: '<= 0.06 µg/mL', clsiBreakpoint: 'S <= 0.06, R >= 1' },
      { antibioticCode: 'SXT', antibioticNameEn: 'Trimethoprim-Sulfamethoxazole', antibioticClass: 'Folate Antagonists', sensitivity: 'S', micValue: '<= 0.5/9.5 µg/mL', clsiBreakpoint: 'S <= 2/38' },
      { antibioticCode: 'MEM', antibioticNameEn: 'Meropenem', antibioticClass: 'Carbapenems', sensitivity: 'S', micValue: '<= 0.12 µg/mL', clsiBreakpoint: 'S <= 1, R >= 4' },
    ],
  },
];

export async function renderMicrobiologyPage(container: HTMLElement): Promise<void> {
  await ensureEnterpriseSeedData();

  let activeTab: 'cultures' | 'antibiotics' | 'antibiogram' = 'cultures';
  let searchQuery = '';
  let abSearchQuery = '';

  const render = async () => {
    const [cultures, patients, requests, antibioticsCatalog] = await Promise.all([
      db.cultureResults.toArray(),
      patientsRepository.getAll(),
      requestsRepository.getAllRequests(),
      db.antibioticsCatalog.toArray(),
    ]);

    const sortedAntibiotics = [...antibioticsCatalog].sort((a, b) =>
      a.nameEn.localeCompare(b.nameEn)
    );
    const filteredAntibiotics = sortedAntibiotics.filter((ab) => {
      const q = abSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        ab.code.toLowerCase().includes(q) ||
        ab.nameEn.toLowerCase().includes(q) ||
        ab.nameAr.toLowerCase().includes(q) ||
        ab.antibioticClass.toLowerCase().includes(q)
      );
    });

    const sortedCultures = cultures.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const filteredCultures = sortedCultures.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        c.reportNumber.toLowerCase().includes(q) ||
        c.patientName.toLowerCase().includes(q) ||
        c.organismNameEn.toLowerCase().includes(q) ||
        c.organismNameAr.toLowerCase().includes(q)
      );
    });

    // Build Cumulative Antibiogram Matrix (% Susceptible per Organism x Antibiotic)
    const positiveCultures = sortedCultures.filter((c) => c.growthStatus === 'positive_growth');
    const organismNames = Array.from(new Set(positiveCultures.map((c) => c.organismNameEn)));
    const allAntibiotics = Array.from(
      new Set(
        positiveCultures.flatMap((c) =>
          c.antibiotics.map((a) => `${a.antibioticCode}|${a.antibioticNameEn}`)
        )
      )
    ).map((pair: string) => {
      const [code, name] = pair.split('|');
      return { code, name };
    });

    container.innerHTML = `
      ${renderPageHeader(
        i18n.bi(
          '🦠 وحدة المزارع البكتيرية والحساسية (C&S + MIC) وجدول المضادات الحيوية',
          '🦠 Microbiology Culture & Sensitivity (CLSI/EUCAST MIC) & Antibiotics Catalog'
        ),
        i18n.bi(
          'عزل وتصنيف البكتيريا، إدارة جدول المضادات الحيوية في قاعدة البيانات، قياس التركيز المثبط الأدنى (MIC)، وإصدار خريطة الحساسية للأطباء',
          'Organism isolation, Antibiotics database catalog, CLSI/EUCAST MIC breakpoints, and cumulative empiric therapy antibiogram'
        ),
        `
          <div class="flex flex-wrap gap-2">
            <button id="micro-tab-cultures" class="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer ${
              activeTab === 'cultures'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }">
              🧫 ${i18n.bi('تقارير المزارع والحساسية (C&S + MIC)', 'Culture & Sensitivity Reports')}
            </button>
            <button id="micro-tab-antibiotics" class="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer ${
              activeTab === 'antibiotics'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }">
              💊 ${i18n.bi(`جدول المضادات الحيوية (${sortedAntibiotics.length})`, `Antibiotics DB (${sortedAntibiotics.length})`)}
            </button>
            <button id="micro-tab-antibiogram" class="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer ${
              activeTab === 'antibiogram'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }">
              📊 ${i18n.bi('خريطة مقاومة المضادات (Antibiogram)', 'Cumulative Antibiogram')}
            </button>
            <button id="micro-ai-plate-btn" class="rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-500 cursor-pointer shadow-xs">
              🤖 ${i18n.bi('فحص طبق المزرعة بالذكاء الاصطناعي', 'AI Culture Plate Recognition')}
            </button>
            <button id="micro-add-antibiotic-btn" class="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-600 cursor-pointer">
              + 💊 ${i18n.bi('إضافة مضاد حيوي للقاعدة', 'New Antibiotic')}
            </button>
            <button id="micro-new-btn" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              + ${i18n.bi('تسجيل مزرعة جديدة (C&S)', 'New Culture Report')}
            </button>
          </div>
        `
      )}

      <!-- Summary KPI Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div class="text-xs font-semibold text-slate-500">${i18n.bi('إجمالي المزارع المسجلة', 'Total Cultures')}</div>
          <div class="text-2xl font-extrabold text-slate-900 mt-1">${sortedCultures.length}</div>
          <div class="text-[11px] text-emerald-600 font-semibold mt-1">CLSI / EUCAST 2025 Standard</div>
        </div>
        <div class="rounded-xl border border-teal-200 bg-teal-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-teal-800">${i18n.bi('المضادات المسجلة بقاعدة البيانات', 'Antibiotics in Database Catalog')}</div>
          <div class="text-2xl font-extrabold text-teal-700 mt-1">${sortedAntibiotics.length}</div>
          <div class="text-[11px] text-teal-600 font-semibold mt-1">${i18n.bi('متاحة للاختيار المباشر في تقارير المزارع', 'Available for Culture Reports')}</div>
        </div>
        <div class="rounded-xl border border-rose-200 bg-rose-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-rose-800">${i18n.bi('سلالات مقاومة معزولة (ESBL / MRSA)', 'MDR / ESBL / MRSA Isolates')}</div>
          <div class="text-2xl font-extrabold text-rose-700 mt-1">
            ${
              sortedCultures.filter((c) =>
                c.resistanceMechanisms.some((m) => m !== 'None')
              ).length
            }
          </div>
          <div class="text-[11px] text-rose-600 font-semibold mt-1">${i18n.bi('تنبيه مكافحة العدوى مفعل', 'Infection Control Flagged')}</div>
        </div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-emerald-800">${i18n.bi('تقارير معتمدة وجاهزة للطباعة', 'Approved Reports')}</div>
          <div class="text-2xl font-extrabold text-emerald-700 mt-1">
            ${sortedCultures.filter((c) => c.status === 'approved').length}
          </div>
          <div class="text-[11px] text-emerald-700 font-semibold mt-1">${i18n.bi('مؤمنة برمز QR لمنع التزوير', 'QR Tamper-Evident Enabled')}</div>
        </div>
      </div>

      ${
        activeTab === 'cultures'
          ? `
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 mb-4">
          <input
            id="micro-search-input"
            type="text"
            value="${escapeHtml(searchQuery)}"
            placeholder="${i18n.bi('بحث برقم التقرير، اسم المريض، أو اسم البكتيريا المعزولة...', 'Search by report #, patient name, or isolated organism...')}"
            class="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
          />
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th class="px-4 py-3 text-start">${i18n.bi('رقم التقرير', 'Report #')}</th>
                  <th class="px-4 py-3 text-start">${i18n.bi('المريض والطبيب', 'Patient & Doctor')}</th>
                  <th class="px-4 py-3 text-start">${i18n.bi('نوع العينة والعد البكتيري', 'Specimen & Colony Count')}</th>
                  <th class="px-4 py-3 text-start">${i18n.bi('الكائن المجهري المعزول', 'Isolated Organism')}</th>
                  <th class="px-4 py-3 text-start">${i18n.bi('آليات المقاومة', 'Resistance')}</th>
                  <th class="px-4 py-3 text-start">${i18n.bi('أفضل مضاد حساس (S)', 'Top Susceptible (S)')}</th>
                  <th class="px-4 py-3 text-end">${i18n.bi('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${filteredCultures
                  .map((c) => {
                    const topS = c.antibiotics
                      .filter((a) => a.sensitivity === 'S')
                      .slice(0, 3)
                      .map((a) => `${a.antibioticNameEn} (${a.micValue})`)
                      .join(' ، ');
                    const hasMdr = c.resistanceMechanisms.some((m) => m !== 'None');
                    return `
                      <tr class="hover:bg-slate-50">
                        <td class="px-4 py-3 font-mono font-bold text-sky-700">
                          ${escapeHtml(c.reportNumber)}
                          <div class="text-[10px] text-slate-400 font-normal">${escapeHtml(formatDate(c.createdAt))}</div>
                        </td>
                        <td class="px-4 py-3">
                          <div class="font-bold text-slate-900">${escapeHtml(c.patientName)}</div>
                          <div class="text-[11px] text-slate-500">${escapeHtml(c.doctorName || '-')}</div>
                        </td>
                        <td class="px-4 py-3">
                          <div class="font-semibold text-slate-800">${escapeHtml(i18n.bi(c.specimenSourceAr, c.specimenSourceEn))}</div>
                          <div class="text-[11px] font-mono text-slate-500">${escapeHtml(c.colonyCount)}</div>
                        </td>
                        <td class="px-4 py-3">
                          ${
                            c.growthStatus === 'no_growth_48h'
                              ? `<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">${i18n.bi('لا يوجد نمو بكتيري بعد 48 ساعة', 'No Growth after 48h')}</span>`
                              : `<div class="font-bold text-slate-900 italic">${escapeHtml(c.organismNameEn)}</div>
                                 <div class="text-[11px] text-slate-600">${escapeHtml(c.organismNameAr)}</div>`
                          }
                        </td>
                        <td class="px-4 py-3">
                          ${
                            hasMdr
                              ? c.resistanceMechanisms
                                  .filter((m) => m !== 'None')
                                  .map(
                                    (m) =>
                                      `<span class="inline-block px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold text-[10px] me-1">${escapeHtml(m)}</span>`
                                  )
                                  .join('')
                              : `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">Wild-Type (No MDR)</span>`
                          }
                        </td>
                        <td class="px-4 py-3 font-mono text-[11px] text-emerald-700 font-semibold max-w-xs">
                          ${escapeHtml(topS || '-')}
                        </td>
                        <td class="px-4 py-3 text-end">
                          <div class="flex flex-wrap justify-end gap-1.5">
                            <button data-view-culture="${c.id}" class="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700 cursor-pointer">
                              🔍 ${i18n.bi('جدول MIC', 'MIC Panel')}
                            </button>
                            <button data-print-culture="${c.id}" class="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500 cursor-pointer">
                              🖨️ ${i18n.bi('طباعة A4', 'Print A4')}
                            </button>
                            <button data-wa-culture="${c.id}" class="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 cursor-pointer">
                              💬 واتساب
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : activeTab === 'antibiotics'
          ? `
        <!-- Antibiotics Database Catalog Tab -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 class="text-base font-extrabold text-slate-900">
                💊 ${i18n.bi('جدول وقاموس المضادات الحيوية القياسي في قاعدة البيانات (antibiotics_catalog)', 'Master Antibiotics Database Catalog (CLSI / EUCAST)')}
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                ${i18n.bi(
                  'أضف أو عدل المضادات الحيوية ونقاط القطع القياسية (CLSI Breakpoints) والتركيز المثبط الافتراضي (MIC) لتظهر فوراً في قوائم الاختيار داخل تقارير المزارع.',
                  'Add or edit antibiotics, default MIC values, and CLSI breakpoints to make them immediately selectable in all Culture & Sensitivity reports.'
                )}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <input
                id="ab-search-input"
                type="search"
                value="${escapeHtml(abSearchQuery)}"
                placeholder="${i18n.bi('🔍 بحث بكود أو اسم المضاد أو المجموعة الدوائية...', '🔍 Search code, name, or drug class...')}"
                class="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              />
              <button id="ab-create-btn" type="button" class="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-500 cursor-pointer">
                + ${i18n.bi('إضافة مضاد حيوي جديد', 'Add New Antibiotic')}
              </button>
            </div>
          </div>

          <div class="overflow-x-auto border border-slate-200 rounded-xl">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-900 text-white">
                <tr>
                  <th class="px-3 py-2.5 text-start">${i18n.bi('الكود (Code)', 'Code')}</th>
                  <th class="px-3 py-2.5 text-start">${i18n.bi('المضاد الحيوي (Antibiotic Name EN / AR)', 'Antibiotic Name')}</th>
                  <th class="px-3 py-2.5 text-start">${i18n.bi('المجموعة الدوائية (Class)', 'Drug Class')}</th>
                  <th class="px-3 py-2.5 text-start">${i18n.bi('الطيف البكتيري', 'Target Group')}</th>
                  <th class="px-3 py-2.5 text-start">${i18n.bi('التركيز الافتراضي (Default MIC)', 'Default MIC')}</th>
                  <th class="px-3 py-2.5 text-start">${i18n.bi('نقاط القطع القياسية (CLSI Breakpoints)', 'CLSI Breakpoints')}</th>
                  <th class="px-3 py-2.5 text-end">${i18n.bi('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${filteredAntibiotics
                  .map(
                    (ab) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-2.5 font-mono font-extrabold text-teal-700">${escapeHtml(ab.code)}</td>
                    <td class="px-3 py-2.5">
                      <div class="font-bold text-slate-900">${escapeHtml(ab.nameEn)}</div>
                      <div class="text-[11px] text-slate-500">${escapeHtml(ab.nameAr)}</div>
                    </td>
                    <td class="px-3 py-2.5 font-semibold text-slate-700">${escapeHtml(ab.antibioticClass)}</td>
                    <td class="px-3 py-2.5">
                      <span class="rounded-full bg-slate-100 border border-slate-300 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                        ${escapeHtml(ab.targetGroup)}
                      </span>
                    </td>
                    <td class="px-3 py-2.5 font-mono text-sky-700 font-semibold">${escapeHtml(ab.defaultMicValue)}</td>
                    <td class="px-3 py-2.5 font-mono text-slate-600">${escapeHtml(ab.clsiBreakpoint)}</td>
                    <td class="px-3 py-2.5 text-end">
                      <div class="flex flex-wrap justify-end gap-1.5">
                        <button type="button" data-edit-catalog-ab="${ab.id}" class="rounded border border-sky-600 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-50 cursor-pointer">
                          ✏️ ${i18n.bi('تعديل', 'Edit')}
                        </button>
                        <button type="button" data-del-catalog-ab="${ab.id}" class="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                          🗑️ ${i18n.bi('حذف', 'Delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : `
        <!-- Cumulative Antibiogram Matrix Tab -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 class="text-base font-extrabold text-slate-900">
                📊 ${i18n.bi('خريطة حساسية ومقاومة المضادات الحيوية التراكمية بالمعمل (Cumulative Antibiogram)', 'Hospital / Lab Cumulative Antibiogram (% Susceptible)')}
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">
                ${i18n.bi(
                  'تُستخدم هذه اللوحة الإحصائية لمساعدة الأطباء في اختيار المضاد الحيوي التجريبي الأمثل (Empiric Therapy) بناءً على نتائج العزلات الفعلية بالمعمل.',
                  'Statistical susceptibility matrix guiding referring physicians on optimal empiric antimicrobial therapy based on local lab isolates.'
                )}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">>= 80% خيار تجريبي ممتاز</span>
              <span class="px-2.5 py-1 rounded bg-amber-100 text-amber-800 text-xs font-bold">60-79% حذر / راجع MIC</span>
              <span class="px-2.5 py-1 rounded bg-rose-100 text-rose-800 text-xs font-bold">< 60% مقاومة عالية (تجنب)</span>
              <button id="print-antibiogram-btn" class="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer">
                🖨️ ${i18n.bi('طباعة نشرة Antibiogram للأطباء', 'Print Antibiogram Bulletin')}
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse border border-slate-200">
              <thead class="bg-slate-900 text-white">
                <tr>
                  <th class="p-2.5 text-start border border-slate-700">${i18n.bi('الميكروب المعزول / المضاد الحيوي', 'Organism / Antibiotic')}</th>
                  ${allAntibiotics
                    .map(
                      (ab) => `
                    <th class="p-2 text-center border border-slate-700 font-mono">
                      <div>${escapeHtml(ab.code)}</div>
                      <div class="text-[10px] font-normal text-slate-300">${escapeHtml(ab.name)}</div>
                    </th>
                  `
                    )
                    .join('')}
                </tr>
              </thead>
              <tbody>
                ${organismNames
                  .map((orgName) => {
                    const orgCultures = positiveCultures.filter((c) => c.organismNameEn === orgName);
                    return `
                      <tr class="hover:bg-slate-50">
                        <td class="p-2.5 border border-slate-200 font-bold text-slate-900 italic bg-slate-50">
                          ${escapeHtml(orgName)}
                          <span class="block text-[10px] font-normal not-italic text-slate-500">(${orgCultures.length} ${i18n.bi('عزلة', 'isolates')})</span>
                        </td>
                        ${allAntibiotics
                          .map((ab) => {
                            const tested = orgCultures
                              .flatMap((c) => c.antibiotics)
                              .filter((a) => a.antibioticCode === ab.code);
                            if (tested.length === 0) {
                              return `<td class="p-2 text-center border border-slate-200 text-slate-300 font-mono">N/T</td>`;
                            }
                            const sCount = tested.filter((a) => a.sensitivity === 'S').length;
                            const pct = Math.round((sCount / tested.length) * 100);
                            const cellCls =
                              pct >= 80
                                ? 'bg-emerald-100 text-emerald-900 font-extrabold'
                                : pct >= 60
                                ? 'bg-amber-100 text-amber-900 font-bold'
                                : 'bg-rose-100 text-rose-900 font-bold';
                            return `<td class="p-2 text-center border border-slate-200 font-mono ${cellCls}">${pct}% S</td>`;
                          })
                          .join('')}
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
      }
    `;

    document.getElementById('micro-tab-cultures')?.addEventListener('click', () => {
      activeTab = 'cultures';
      render();
    });

    document.getElementById('micro-tab-antibiotics')?.addEventListener('click', () => {
      activeTab = 'antibiotics';
      render();
    });

    document.getElementById('micro-tab-antibiogram')?.addEventListener('click', () => {
      activeTab = 'antibiogram';
      render();
    });

    document.getElementById('micro-search-input')?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      render();
    });

    const abSearchEl = document.getElementById('ab-search-input') as HTMLInputElement | null;
    abSearchEl?.addEventListener('input', () => {
      abSearchQuery = abSearchEl.value;
      const pos = abSearchEl.selectionStart || abSearchQuery.length;
      void render().then(() => {
        const nextEl = document.getElementById('ab-search-input') as HTMLInputElement | null;
        if (nextEl) {
          nextEl.focus();
          nextEl.setSelectionRange(pos, pos);
        }
      });
    });

    document.getElementById('micro-ai-plate-btn')?.addEventListener('click', () => {
      router.navigate('culturePlateAi');
    });

    const handleOpenNewAntibiotic = () => {
      openAntibioticCatalogFormModal(undefined, render);
    };
    document.getElementById('micro-add-antibiotic-btn')?.addEventListener('click', handleOpenNewAntibiotic);
    document.getElementById('ab-create-btn')?.addEventListener('click', handleOpenNewAntibiotic);

    container.querySelectorAll<HTMLButtonElement>('[data-edit-catalog-ab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-catalog-ab');
        const target = sortedAntibiotics.find((x) => x.id === id);
        if (target) openAntibioticCatalogFormModal(target, render);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-del-catalog-ab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-catalog-ab');
        if (!id) return;
        await db.antibioticsCatalog.delete(id);
        showToast(i18n.bi('تم حذف المضاد الحيوي من القاموس', 'Antibiotic deleted from catalog'), 'info');
        await render();
      });
    });

    document.getElementById('micro-new-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('add', 'microbiology'))) return;
      openNewCultureModal(patients, requests, sortedAntibiotics, render);
    });

    document.getElementById('print-antibiogram-btn')?.addEventListener('click', async () => {
      await printService.printA4(
        'Cumulative Antimicrobial Susceptibility Report (Antibiogram)',
        `<div dir="ltr" style="direction:ltr;text-align:left;font-size:12px;">
          <p style="margin-bottom:10px;">Cumulative Susceptibility Matrix (% Susceptible) for Isolated Bacterial Strains according to CLSI 2025 Guidelines:</p>
          ${container.querySelector('table')?.outerHTML || ''}
        </div>`,
        '',
        { forceEnglishLtr: true }
      );
    });

    container.querySelectorAll('[data-view-culture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-view-culture')!;
        const rec = sortedCultures.find((c) => c.id === id);
        if (rec) void openCultureDetailsModal(rec, render);
      });
    });

    container.querySelectorAll('[data-print-culture]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-print-culture')!;
        const rec = sortedCultures.find((c) => c.id === id);
        if (rec) await printCultureA4(rec);
      });
    });

    container.querySelectorAll('[data-wa-culture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-wa-culture')!;
        const rec = sortedCultures.find((c) => c.id === id);
        if (!rec) return;
        const pat = patients.find((p) => p.id === rec.patientId);
        const sList = rec.antibiotics
          .filter((a) => a.sensitivity === 'S')
          .map((a) => `✅ ${a.antibioticNameEn} (MIC: ${a.micValue})`)
          .join('\n');
        const msg = [
          `🏥 *${i18n.dict.appTitle} — تقرير مزرعة وحساسية (C&S + MIC)*`,
          `👤 *المريض:* ${rec.patientName}`,
          `🧾 *رقم التقرير:* ${rec.reportNumber}`,
          `🧪 *العينة:* ${rec.specimenSourceAr}`,
          `🦠 *الميكروب المعزول:* ${rec.organismNameEn}`,
          `📊 *العد البكتيري:* ${rec.colonyCount}`,
          ``,
          `💊 *المضادات الحيوية الفعالة (Susceptible - S):*`,
          sList || 'لا يوجد نمو بكتيري',
          ``,
          `📝 *التوصية الإكلينيكية:* ${rec.clinicalNotesAr}`,
        ].join('\n');

        openWhatsAppDispatchModal({
          recipientName: rec.patientName,
          phone: pat?.phone || '01000000000',
          titleAr: 'إرسال تقرير المزرعة والحساسية عبر واتساب',
          titleEn: 'Send Culture & Sensitivity Report via WhatsApp',
          messageBody: msg,
          referenceId: rec.id,
        });
      });
    });
  };

  await render();
}

function openAntibioticCatalogFormModal(
  existing: AntibioticCatalogItem | undefined,
  onSaved: () => void
): void {
  openModal({
    title: existing
      ? i18n.bi(`✏️ تعديل بيانات المضاد الحيوي: ${existing.nameEn}`, `✏️ Edit Antibiotic: ${existing.nameEn}`)
      : i18n.bi('💊 إضافة مضاد حيوي جديد إلى جدول قاعدة البيانات', '💊 Add New Antibiotic to Database Catalog'),
    size: 'lg',
    content: `
      <form id="ab-catalog-form" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('كود المضاد القياسي (Code) *', 'Antibiotic Code (e.g. MEM, CZA) *')}</label>
            <input id="ab-f-code" type="text" required value="${escapeHtml(existing?.code || '')}" placeholder="MEM / IPM / COL / CZA" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المجموعة الدوائية (Drug Class) *', 'Drug Class *')}</label>
            <input id="ab-f-class" type="text" required value="${escapeHtml(existing?.antibioticClass || 'Cephalosporins 3rd Gen')}" placeholder="Carbapenems / Aminoglycosides / Penicillins" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('اسم المضاد بالإنجليزية (English Name) *', 'English Name *')}</label>
            <input id="ab-f-name-en" type="text" required value="${escapeHtml(existing?.nameEn || '')}" placeholder="e.g. Ceftazidime-Avibactam" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('اسم المضاد بالعربية (Arabic Name)', 'Arabic Name')}</label>
            <input id="ab-f-name-ar" type="text" value="${escapeHtml(existing?.nameAr || '')}" placeholder="مثال: سيفتازيديم - أفيباكتام" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('التركيز المثبط الافتراضي (Default MIC)', 'Default MIC Value')}</label>
            <input id="ab-f-mic" type="text" value="${escapeHtml(existing?.defaultMicValue || '<= 0.5 µg/mL')}" placeholder="<= 0.5 µg/mL" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('نقاط القطع القياسية (CLSI Breakpoints)', 'CLSI Breakpoints')}</label>
            <input id="ab-f-bp" type="text" value="${escapeHtml(existing?.clsiBreakpoint || 'S <= 1, R >= 4')}" placeholder="S <= 1, R >= 4" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الطيف البكتيري المستهدف (Target Spectrum)', 'Target Spectrum')}</label>
            <select id="ab-f-target" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="Broad-Spectrum" ${existing?.targetGroup === 'Broad-Spectrum' ? 'selected' : ''}>Broad-Spectrum (واسع الطيف - موجب وسالب الجرام)</option>
              <option value="Gram-Negative" ${existing?.targetGroup === 'Gram-Negative' ? 'selected' : ''}>Gram-Negative (عصيات سالبة الجرام)</option>
              <option value="Gram-Positive" ${existing?.targetGroup === 'Gram-Positive' ? 'selected' : ''}>Gram-Positive (مكورات موجبة الجرام / MRSA)</option>
              <option value="Urinary-Specific" ${existing?.targetGroup === 'Urinary-Specific' ? 'selected' : ''}>Urinary-Specific (مطهر ومضاد مسالك بولية)</option>
            </select>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="ab-f-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-teal-600 px-5 py-2 text-xs font-bold text-white hover:bg-teal-500 cursor-pointer">
            💾 ${i18n.bi('حفظ المضاد الحيوي في قاعدة البيانات', 'Save Antibiotic to Database')}
          </button>
        </div>
      </form>
    `,
  });

  document.getElementById('ab-f-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ab-catalog-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = (document.getElementById('ab-f-code') as HTMLInputElement).value.trim().toUpperCase();
    const nameEn = (document.getElementById('ab-f-name-en') as HTMLInputElement).value.trim();
    const nameAr = (document.getElementById('ab-f-name-ar') as HTMLInputElement).value.trim() || nameEn;
    const antibioticClass = (document.getElementById('ab-f-class') as HTMLInputElement).value.trim();
    const defaultMicValue = (document.getElementById('ab-f-mic') as HTMLInputElement).value.trim() || '1.0 µg/mL';
    const clsiBreakpoint = (document.getElementById('ab-f-bp') as HTMLInputElement).value.trim() || 'S <= 2, R >= 8';
    const targetGroup = (document.getElementById('ab-f-target') as HTMLSelectElement).value as AntibioticCatalogItem['targetGroup'];

    if (!code || !nameEn) return;

    const record: AntibioticCatalogItem = {
      id: existing?.id || `AB-${code}-${Date.now().toString().slice(-4)}`,
      code,
      nameEn,
      nameAr,
      antibioticClass,
      defaultMicValue,
      clsiBreakpoint,
      targetGroup,
      active: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    await db.antibioticsCatalog.put(record);
    closeModal();
    showToast(
      i18n.bi(
        `✓ تم حفظ المضاد الحيوي (${nameEn} - ${code}) في قاعدة البيانات بنجاح`,
        `✓ Saved antibiotic (${nameEn} - ${code}) to database catalog`
      ),
      'success'
    );
    onSaved();
  });
}

async function openCultureDetailsModal(rec: CultureSensitivityRecord, onUpdated: () => void): Promise<void> {
  let catalog = (await db.antibioticsCatalog.toArray()).sort((a, b) =>
    a.nameEn.localeCompare(b.nameEn)
  );
  let showQuickCreateBox = false;

  const syncRowsFromDom = () => {
    rec.antibiotics.forEach((ab, idx) => {
      const codeEl = document.querySelector(`[data-edit-ab-select="${idx}"]`) as HTMLSelectElement | null;
      const clsEl = document.querySelector(`[data-edit-ab-class="${idx}"]`) as HTMLInputElement | null;
      const sEl = document.querySelector(`[data-edit-ab-sens="${idx}"]`) as HTMLSelectElement | null;
      const mEl = document.querySelector(`[data-edit-ab-mic="${idx}"]`) as HTMLInputElement | null;
      const bpEl = document.querySelector(`[data-edit-ab-bp="${idx}"]`) as HTMLInputElement | null;
      if (codeEl) {
        const picked = catalog.find((c) => c.code === codeEl.value);
        if (picked) {
          ab.antibioticCode = picked.code;
          ab.antibioticNameEn = picked.nameEn;
        }
      }
      if (clsEl) ab.antibioticClass = clsEl.value.trim();
      if (sEl) ab.sensitivity = sEl.value as AntibioticSensitivityFlag;
      if (mEl) ab.micValue = mEl.value.trim();
      if (bpEl) ab.clsiBreakpoint = bpEl.value.trim();
    });
  };

  const renderModalContent = () => {
    const firstCatalogItem = catalog[0];
    openModal({
      title: `${i18n.bi('تقرير مزرعة وحساسية تفصيلي (CLSI MIC):', 'Culture & Sensitivity MIC Report:')} ${rec.reportNumber}`,
      size: 'xl',
      content: `
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
            <div><span class="text-slate-500">${i18n.bi('المريض:', 'Patient:')}</span> <strong class="text-slate-900">${escapeHtml(rec.patientName)}</strong></div>
            <div><span class="text-slate-500">${i18n.bi('العينة:', 'Specimen:')}</span> <strong>${escapeHtml(i18n.bi(rec.specimenSourceAr, rec.specimenSourceEn))}</strong></div>
            <div><span class="text-slate-500">${i18n.bi('العد البكتيري:', 'Colony Count:')}</span> <strong class="font-mono text-sky-700">${escapeHtml(rec.colonyCount)}</strong></div>
            <div><span class="text-slate-500">${i18n.bi('صبغة جرام:', 'Gram Stain:')}</span> <strong>${escapeHtml(i18n.bi(rec.gramStainAr, rec.gramStainEn))}</strong></div>
            <div><span class="text-slate-500">${i18n.bi('خلايا الصديد (Pus Cells):', 'Pus Cells:')}</span> <strong>${escapeHtml(rec.pusCellsCount)}</strong></div>
            <div><span class="text-slate-500">${i18n.bi('الميكروب المعزول:', 'Isolated Organism:')}</span> <strong class="text-rose-700 italic">${escapeHtml(rec.organismNameEn)}</strong></div>
          </div>

          <!-- Select from Antibiotics DB Catalog or Add New Antibiotic to DB -->
          <div class="rounded-xl border-2 border-teal-500/80 bg-teal-50/50 p-3.5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs font-extrabold text-teal-950 flex items-center gap-1.5">
                <span>💊</span>
                <span>${i18n.bi('اختر مضاداً حيوياً من جدول قاعدة البيانات لإدراجه في تقرير المزرعة:', 'Select an Antibiotic from Database Catalog to Add to Report:')}</span>
              </div>
              <button type="button" id="cd-toggle-new-ab-box" class="rounded-lg bg-teal-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-teal-600 cursor-pointer">
                + ${i18n.bi('تعريف مضاد حيوي جديد في قاعدة البيانات وإضافته للتقرير', 'Define New Antibiotic in DB & Add')}
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div class="md:col-span-4">
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${i18n.bi('المضاد الحيوي من القاعدة', 'Antibiotic from DB Catalog')}</label>
                <select id="cd-pick-ab-code" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900">
                  ${catalog
                    .map(
                      (c) =>
                        `<option value="${escapeHtml(c.code)}">${escapeHtml(c.nameEn)} (${escapeHtml(c.code)}) — ${escapeHtml(c.antibioticClass)}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${i18n.bi('الحساسية (S/I/R)', 'Sensitivity')}</label>
                <select id="cd-pick-ab-sens" class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-extrabold text-emerald-800">
                  <option value="S">S (Susceptible - حساس)</option>
                  <option value="I">I (Intermediate - متوسط)</option>
                  <option value="R">R (Resistant - مقاوم)</option>
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${i18n.bi('التركيز المثبط (MIC)', 'MIC Value')}</label>
                <input id="cd-pick-ab-mic" type="text" value="${escapeHtml(firstCatalogItem?.defaultMicValue || '<= 0.5 µg/mL')}" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-[11px] font-bold text-slate-700 mb-1">${i18n.bi('نقاط القطع (CLSI)', 'CLSI Breakpoints')}</label>
                <input id="cd-pick-ab-bp" type="text" value="${escapeHtml(firstCatalogItem?.clsiBreakpoint || 'S <= 1, R >= 4')}" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono" />
              </div>
              <div class="md:col-span-2">
                <button type="button" id="cd-add-picked-ab-btn" class="w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-sky-700 cursor-pointer">
                  + ${i18n.bi('إدراج بالتقرير', 'Add to Report')}
                </button>
              </div>
            </div>

            ${
              showQuickCreateBox
                ? `
              <div class="mt-2 pt-3 border-t border-teal-300 bg-white rounded-xl p-3 border space-y-2.5">
                <div class="text-xs font-extrabold text-teal-900">
                  ✨ ${i18n.bi('إضافة مضاد حيوي جديد إلى جدول قاعدة البيانات (antibiotics_catalog) وإدراجه فوراً في هذا التقرير:', 'Create New Antibiotic in Database & Insert into Current Report:')}
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-2 items-end">
                  <div>
                    <label class="block text-[10px] font-bold text-slate-600 mb-0.5">${i18n.bi('الكود (Code) *', 'Code *')}</label>
                    <input id="cd-new-code" type="text" placeholder="e.g. CZA" class="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono uppercase" />
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-slate-600 mb-0.5">${i18n.bi('الاسم بالإنجليزية *', 'Name EN *')}</label>
                    <input id="cd-new-name-en" type="text" placeholder="Ceftazidime-Avibactam" class="w-full rounded border border-slate-300 px-2 py-1 text-xs font-bold" />
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-slate-600 mb-0.5">${i18n.bi('المجموعة الدوائية *', 'Drug Class *')}</label>
                    <input id="cd-new-class" type="text" value="Cephalosporins" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-slate-600 mb-0.5">${i18n.bi('التركيز (MIC)', 'MIC')}</label>
                    <input id="cd-new-mic" type="text" value="0.5 µg/mL" class="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono" />
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-slate-600 mb-0.5">${i18n.bi('معيار CLSI', 'CLSI Breakpoint')}</label>
                    <input id="cd-new-bp" type="text" value="S <= 1, R >= 4" class="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono" />
                  </div>
                  <div>
                    <button type="button" id="cd-save-new-ab-to-db-btn" class="w-full rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-500 cursor-pointer">
                      💾 ${i18n.bi('حفظ بالقاعدة وإدراج', 'Save & Insert')}
                    </button>
                  </div>
                </div>
              </div>
            `
                : ''
            }
          </div>

          <div class="overflow-x-auto border border-slate-200 rounded-xl">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-900 text-white">
                <tr>
                  <th class="px-3 py-2 text-start">${i18n.bi('المضاد الحيوي (Antibiotic)', 'Antibiotic')}</th>
                  <th class="px-3 py-2 text-start">${i18n.bi('المجموعة الدوائية', 'Class')}</th>
                  <th class="px-3 py-2 text-center">${i18n.bi('الحساسية (S / I / R)', 'Sensitivity')}</th>
                  <th class="px-3 py-2 text-start">${i18n.bi('التركيز المثبط الأدنى (MIC)', 'MIC Value')}</th>
                  <th class="px-3 py-2 text-start">${i18n.bi('نقاط القطع القياسية (CLSI Breakpoints)', 'CLSI Breakpoints')}</th>
                  <th class="px-2 py-2 text-center w-12">${i18n.bi('حذف', 'Remove')}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${rec.antibiotics
                  .map((ab, idx) => {
                    const badge =
                      ab.sensitivity === 'S'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : ab.sensitivity === 'I'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300';
                    const hasInCatalog = catalog.some((c) => c.code === ab.antibioticCode);
                    return `
                      <tr>
                        <td class="px-3 py-2">
                          <select data-edit-ab-select="${idx}" class="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900">
                            ${
                              !hasInCatalog
                                ? `<option value="${escapeHtml(ab.antibioticCode)}" selected>${escapeHtml(ab.antibioticNameEn)} (${escapeHtml(ab.antibioticCode)})</option>`
                                : ''
                            }
                            ${catalog
                              .map(
                                (c) =>
                                  `<option value="${escapeHtml(c.code)}" ${c.code === ab.antibioticCode ? 'selected' : ''}>${escapeHtml(c.nameEn)} (${escapeHtml(c.code)})</option>`
                              )
                              .join('')}
                          </select>
                        </td>
                        <td class="px-3 py-2">
                          <input data-edit-ab-class="${idx}" type="text" value="${escapeHtml(ab.antibioticClass)}" class="w-36 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700" />
                        </td>
                        <td class="px-3 py-2 text-center">
                          <select data-edit-ab-sens="${idx}" class="rounded border px-2 py-0.5 text-xs font-extrabold ${badge}">
                            <option value="S" ${ab.sensitivity === 'S' ? 'selected' : ''}>S (Susceptible - حساس)</option>
                            <option value="I" ${ab.sensitivity === 'I' ? 'selected' : ''}>I (Intermediate - متوسط)</option>
                            <option value="R" ${ab.sensitivity === 'R' ? 'selected' : ''}>R (Resistant - مقاوم)</option>
                          </select>
                        </td>
                        <td class="px-3 py-2 font-mono">
                          <input data-edit-ab-mic="${idx}" type="text" value="${escapeHtml(ab.micValue)}" class="w-32 rounded border border-slate-300 px-2 py-0.5 text-xs font-mono" />
                        </td>
                        <td class="px-3 py-2 font-mono">
                          <input data-edit-ab-bp="${idx}" type="text" value="${escapeHtml(ab.clsiBreakpoint)}" class="w-36 rounded border border-slate-200 px-2 py-0.5 text-xs font-mono text-slate-600" />
                        </td>
                        <td class="px-2 py-2 text-center">
                          <button type="button" data-remove-ab-row="${idx}" class="text-rose-600 hover:text-rose-800 font-extrabold cursor-pointer" title="${i18n.bi('حذف المضاد من التقرير', 'Remove antibiotic')}">✕</button>
                        </td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-950">
            <strong>${i18n.bi('التفسير الإكلينيكي وتوصيات العلاج:', 'Clinical Interpretation:')}</strong>
            <p class="mt-1">${escapeHtml(i18n.bi(rec.clinicalNotesAr, rec.clinicalNotesEn))}</p>
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button id="save-culture-edits-btn" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              💾 ${i18n.bi('حفظ تعديلات المضادات والحساسية و MIC', 'Save Antibiotics, MIC & Sensitivity Changes')}
            </button>
          </div>
        </div>
      `,
    });

    // When changing dropdown of catalog antibiotic to add, auto-populate MIC & Breakpoint
    const pickSelect = document.getElementById('cd-pick-ab-code') as HTMLSelectElement | null;
    const pickMic = document.getElementById('cd-pick-ab-mic') as HTMLInputElement | null;
    const pickBp = document.getElementById('cd-pick-ab-bp') as HTMLInputElement | null;
    pickSelect?.addEventListener('change', () => {
      const found = catalog.find((c) => c.code === pickSelect.value);
      if (found) {
        if (pickMic) pickMic.value = found.defaultMicValue;
        if (pickBp) pickBp.value = found.clsiBreakpoint;
      }
    });

    // When changing a row's antibiotic dropdown, auto-update its class, MIC, and breakpoint
    document.querySelectorAll<HTMLSelectElement>('[data-edit-ab-select]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.getAttribute('data-edit-ab-select'));
        const found = catalog.find((c) => c.code === sel.value);
        if (found && rec.antibiotics[idx]) {
          const clsInput = document.querySelector(`[data-edit-ab-class="${idx}"]`) as HTMLInputElement | null;
          const micInput = document.querySelector(`[data-edit-ab-mic="${idx}"]`) as HTMLInputElement | null;
          const bpInput = document.querySelector(`[data-edit-ab-bp="${idx}"]`) as HTMLInputElement | null;
          if (clsInput) clsInput.value = found.antibioticClass;
          if (micInput) micInput.value = found.defaultMicValue;
          if (bpInput) bpInput.value = found.clsiBreakpoint;
        }
      });
    });

    // Add selected antibiotic from catalog into current culture report
    document.getElementById('cd-add-picked-ab-btn')?.addEventListener('click', () => {
      syncRowsFromDom();
      const code = pickSelect?.value || '';
      const found = catalog.find((c) => c.code === code);
      if (!found) return;
      const sensEl = document.getElementById('cd-pick-ab-sens') as HTMLSelectElement | null;
      const sensitivity = (sensEl?.value || 'S') as AntibioticSensitivityFlag;
      const micValue = pickMic?.value.trim() || found.defaultMicValue;
      const clsiBreakpoint = pickBp?.value.trim() || found.clsiBreakpoint;

      rec.antibiotics.push({
        antibioticCode: found.code,
        antibioticNameEn: found.nameEn,
        antibioticClass: found.antibioticClass,
        sensitivity,
        micValue,
        clsiBreakpoint,
      });
      showToast(
        i18n.bi(
          `✓ تم إدراج المضاد الحيوي (${found.nameEn}) في تقرير المزرعة`,
          `✓ Added (${found.nameEn}) to culture report`
        ),
        'success'
      );
      renderModalContent();
    });

    // Toggle quick-create antibiotic in DB box
    document.getElementById('cd-toggle-new-ab-box')?.addEventListener('click', () => {
      syncRowsFromDom();
      showQuickCreateBox = !showQuickCreateBox;
      renderModalContent();
    });

    // Save brand-new antibiotic to DB and insert into current culture report
    document.getElementById('cd-save-new-ab-to-db-btn')?.addEventListener('click', async () => {
      syncRowsFromDom();
      const code = ((document.getElementById('cd-new-code') as HTMLInputElement | null)?.value || '').trim().toUpperCase();
      const nameEn = ((document.getElementById('cd-new-name-en') as HTMLInputElement | null)?.value || '').trim();
      const antibioticClass = ((document.getElementById('cd-new-class') as HTMLInputElement | null)?.value || 'Broad-Spectrum').trim();
      const defaultMicValue = ((document.getElementById('cd-new-mic') as HTMLInputElement | null)?.value || '0.5 µg/mL').trim();
      const clsiBreakpoint = ((document.getElementById('cd-new-bp') as HTMLInputElement | null)?.value || 'S <= 1, R >= 4').trim();

      if (!code || !nameEn) {
        showToast(
          i18n.bi('يرجى إدخال كود واسم المضاد الحيوي باللغة الإنجليزية', 'Please enter Antibiotic Code and English Name'),
          'warning'
        );
        return;
      }

      const newCatalogItem: AntibioticCatalogItem = {
        id: `AB-${code}-${Date.now().toString().slice(-4)}`,
        code,
        nameEn,
        nameAr: nameEn,
        antibioticClass,
        defaultMicValue,
        clsiBreakpoint,
        targetGroup: 'Broad-Spectrum',
        active: true,
        createdAt: new Date().toISOString(),
      };

      await db.antibioticsCatalog.put(newCatalogItem);
      catalog = (await db.antibioticsCatalog.toArray()).sort((a, b) =>
        a.nameEn.localeCompare(b.nameEn)
      );

      rec.antibiotics.push({
        antibioticCode: code,
        antibioticNameEn: nameEn,
        antibioticClass,
        sensitivity: 'S',
        micValue: defaultMicValue,
        clsiBreakpoint,
      });

      showQuickCreateBox = false;
      showToast(
        i18n.bi(
          `✓ تم حفظ المضاد (${nameEn}) في قاعدة البيانات وإضافته لتقرير المزرعة فوراً`,
          `✓ Saved (${nameEn}) to database and added to culture report`
        ),
        'success'
      );
      renderModalContent();
    });

    // Remove antibiotic row
    document.querySelectorAll<HTMLButtonElement>('[data-remove-ab-row]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncRowsFromDom();
        const idx = Number(btn.getAttribute('data-remove-ab-row'));
        if (!Number.isNaN(idx)) {
          rec.antibiotics.splice(idx, 1);
          renderModalContent();
        }
      });
    });

    // Save all changes to culture record
    document.getElementById('save-culture-edits-btn')?.addEventListener('click', async () => {
      syncRowsFromDom();
      await db.cultureResults.put(rec);
      closeModal();
      showToast(i18n.bi('تم تحديث جدول الحساسية و MIC بنجاح', 'Sensitivity & MIC panel updated'), 'success');
      onUpdated();
    });
  };

  renderModalContent();
}

function openNewCultureModal(
  patients: Array<{ id: string; name: string }>,
  requests: Array<{ id: string; requestNumber: string; patientId: string }>,
  antibioticsCatalog: AntibioticCatalogItem[],
  onSaved: () => void
): void {
  let workingAntibiotics: CultureAntibioticResult[] = ORGANISM_PRESETS[0].antibiotics.map((a) => ({
    ...a,
  }));

  const renderWorkingAntibioticsTable = () => {
    const tbody = document.getElementById('nc-ab-tbody');
    if (!tbody) return;
    tbody.innerHTML = workingAntibiotics
      .map(
        (ab, idx) => `
        <tr class="border-b border-slate-200">
          <td class="px-2.5 py-1.5 font-bold text-slate-900">${escapeHtml(ab.antibioticNameEn)} (${escapeHtml(ab.antibioticCode)})</td>
          <td class="px-2.5 py-1.5 text-slate-600">${escapeHtml(ab.antibioticClass)}</td>
          <td class="px-2.5 py-1.5">
            <select data-nc-ab-sens="${idx}" class="rounded border border-slate-300 px-2 py-0.5 text-xs font-bold">
              <option value="S" ${ab.sensitivity === 'S' ? 'selected' : ''}>S (Susceptible)</option>
              <option value="I" ${ab.sensitivity === 'I' ? 'selected' : ''}>I (Intermediate)</option>
              <option value="R" ${ab.sensitivity === 'R' ? 'selected' : ''}>R (Resistant)</option>
            </select>
          </td>
          <td class="px-2.5 py-1.5">
            <input data-nc-ab-mic="${idx}" type="text" value="${escapeHtml(ab.micValue)}" class="w-28 rounded border border-slate-300 px-2 py-0.5 text-xs font-mono" />
          </td>
          <td class="px-2.5 py-1.5 font-mono text-slate-500">${escapeHtml(ab.clsiBreakpoint)}</td>
          <td class="px-2 py-1.5 text-center">
            <button type="button" data-nc-del-ab="${idx}" class="text-rose-600 hover:text-rose-800 font-bold cursor-pointer">✕</button>
          </td>
        </tr>
      `
      )
      .join('');

    tbody.querySelectorAll<HTMLSelectElement>('[data-nc-ab-sens]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = Number(sel.getAttribute('data-nc-ab-sens'));
        if (workingAntibiotics[i]) workingAntibiotics[i].sensitivity = sel.value as AntibioticSensitivityFlag;
      });
    });
    tbody.querySelectorAll<HTMLInputElement>('[data-nc-ab-mic]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = Number(inp.getAttribute('data-nc-ab-mic'));
        if (workingAntibiotics[i]) workingAntibiotics[i].micValue = inp.value.trim();
      });
    });
    tbody.querySelectorAll<HTMLButtonElement>('[data-nc-del-ab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-nc-del-ab'));
        workingAntibiotics.splice(i, 1);
        renderWorkingAntibioticsTable();
      });
    });
  };

  openModal({
    title: i18n.bi('🧫 تسجيل مزرعة بكتيرية وحساسية جديدة (CLSI / EUCAST)', '🧫 New Culture & Sensitivity Report'),
    size: 'xl',
    content: `
      <form id="new-culture-form" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('المريض *', 'Patient *')}</label>
            <select id="nc-patient" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${patients.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('نوع العينة (Specimen) *', 'Specimen Type *')}</label>
            <select id="nc-specimen" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="urine">مزرعة بول (Mid-Stream Urine Culture)</option>
              <option value="blood">مزرعة دم (Blood Culture - Aerobic/Anaerobic)</option>
              <option value="pus_wound">مسحة صديد / جرح (Pus / Wound Swab)</option>
              <option value="sputum">مزرعة بصاق (Sputum Culture)</option>
              <option value="stool">مزرعة براز (Stool Culture)</option>
              <option value="csf">سائل نخاعي شوكي (CSF Culture)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الكائن المجهري المعزول (Isolated Organism) *', 'Isolated Organism *')}</label>
            <select id="nc-organism" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              ${ORGANISM_PRESETS.map((o) => `<option value="${o.code}">${escapeHtml(o.nameEn)} — ${escapeHtml(o.nameAr)}</option>`).join('')}
              <option value="NO_GROWTH">لا يوجد نمو بكتيري بعد 48 ساعة (No Growth after 48h)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('العد البكتيري (Colony Count)', 'Colony Count')}</label>
            <input id="nc-colony" type="text" value="> 100,000 CFU/mL (Significant Growth)" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('خلايا الصديد (Pus Cells)', 'Pus Cells')}</label>
            <input id="nc-pus" type="text" value="35 - 45 / HPF" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('الخلايا الطلائية (Epithelial Cells)', 'Epithelial Cells')}</label>
            <input id="nc-epi" type="text" value="3 - 5 / HPF" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <!-- Select & Add Antibiotics from DB Catalog -->
        <div id="nc-ab-section" class="rounded-xl border border-teal-300 bg-teal-50/40 p-3.5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs font-extrabold text-teal-950">
              💊 ${i18n.bi('قائمة المضادات الحيوية المختارة للتقرير (يمكنك الإضافة من جدول قاعدة البيانات):', 'Selected Antibiotics for Report (Pick from Database Catalog):')}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <select id="nc-add-ab-select" class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold">
                ${antibioticsCatalog
                  .map(
                    (c) =>
                      `<option value="${escapeHtml(c.code)}">${escapeHtml(c.nameEn)} (${escapeHtml(c.code)}) — ${escapeHtml(c.antibioticClass)}</option>`
                  )
                  .join('')}
              </select>
              <button type="button" id="nc-add-ab-btn" class="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-500 cursor-pointer">
                + ${i18n.bi('إضافة المضاد للتقرير', 'Add Antibiotic')}
              </button>
            </div>
          </div>

          <div class="overflow-x-auto bg-white rounded-lg border border-slate-200 max-h-56 overflow-y-auto">
            <table class="w-full text-xs text-start">
              <thead class="bg-slate-900 text-white sticky top-0">
                <tr>
                  <th class="px-2.5 py-2 text-start">${i18n.bi('المضاد الحيوي', 'Antibiotic')}</th>
                  <th class="px-2.5 py-2 text-start">${i18n.bi('المجموعة', 'Class')}</th>
                  <th class="px-2.5 py-2 text-start">${i18n.bi('الحساسية', 'Sensitivity')}</th>
                  <th class="px-2.5 py-2 text-start">MIC</th>
                  <th class="px-2.5 py-2 text-start">CLSI</th>
                  <th class="px-2 py-2 text-center w-10">✕</th>
                </tr>
              </thead>
              <tbody id="nc-ab-tbody"></tbody>
            </table>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">${i18n.bi('ملاحظات وتوصيات الأخصائي', 'Clinical Recommendations')}</label>
          <textarea id="nc-notes" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">يُنصح باختيار المضاد الحيوي ذو الحساسية (S) وأقل تركيز مثبط أدنى (MIC) مع مراعاة وظائف الكلى والكبد للمريض.</textarea>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" id="nc-cancel" class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer">${i18n.dict.actions.cancelBtn}</button>
          <button type="submit" class="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
            ✅ ${i18n.bi('حفظ المزرعة وتوليد جدول CLSI MIC', 'Save Culture & Generate MIC Panel')}
          </button>
        </div>
      </form>
    `,
  });

  renderWorkingAntibioticsTable();

  const orgSelect = document.getElementById('nc-organism') as HTMLSelectElement | null;
  orgSelect?.addEventListener('change', () => {
    const code = orgSelect.value;
    const abSection = document.getElementById('nc-ab-section');
    if (code === 'NO_GROWTH') {
      workingAntibiotics = [];
      if (abSection) abSection.classList.add('hidden');
    } else {
      if (abSection) abSection.classList.remove('hidden');
      const preset = ORGANISM_PRESETS.find((o) => o.code === code) || ORGANISM_PRESETS[0];
      workingAntibiotics = preset.antibiotics.map((a) => ({ ...a }));
      renderWorkingAntibioticsTable();
    }
  });

  document.getElementById('nc-add-ab-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('nc-add-ab-select') as HTMLSelectElement | null;
    if (!sel) return;
    const found = antibioticsCatalog.find((c) => c.code === sel.value);
    if (!found) return;
    workingAntibiotics.push({
      antibioticCode: found.code,
      antibioticNameEn: found.nameEn,
      antibioticClass: found.antibioticClass,
      sensitivity: 'S',
      micValue: found.defaultMicValue,
      clsiBreakpoint: found.clsiBreakpoint,
    });
    renderWorkingAntibioticsTable();
  });

  document.getElementById('nc-cancel')?.addEventListener('click', closeModal);
  document.getElementById('new-culture-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = (document.getElementById('nc-patient') as HTMLSelectElement).value;
    const pat = patients.find((p) => p.id === patientId);
    const specimenType = (document.getElementById('nc-specimen') as HTMLSelectElement).value as CultureSensitivityRecord['specimenType'];
    const orgCode = (document.getElementById('nc-organism') as HTMLSelectElement).value;
    const colony = (document.getElementById('nc-colony') as HTMLInputElement).value.trim();
    const pus = (document.getElementById('nc-pus') as HTMLInputElement).value.trim();
    const epi = (document.getElementById('nc-epi') as HTMLInputElement).value.trim();
    const notes = (document.getElementById('nc-notes') as HTMLTextAreaElement).value.trim();

    const preset = ORGANISM_PRESETS.find((o) => o.code === orgCode) || ORGANISM_PRESETS[0];
    const isNoGrowth = orgCode === 'NO_GROWTH';
    const matchedReq = requests.find((r) => r.patientId === patientId);
    const user = authService.getCurrentUser();

    const specimenLabels: Record<string, { ar: string; en: string }> = {
      urine: { ar: 'عينة بول وسط المجرى (Mid-Stream Urine)', en: 'Mid-Stream Urine (MSU)' },
      blood: { ar: 'مزرعة دم وريدي (Blood Culture)', en: 'Venous Blood Culture' },
      pus_wound: { ar: 'مسحة صديد / جرح (Pus / Wound Swab)', en: 'Pus / Wound Swab' },
      sputum: { ar: 'عينة بصاق صباحية (Morning Sputum)', en: 'Morning Sputum' },
      stool: { ar: 'عينة براز (Stool Culture)', en: 'Stool Culture' },
      csf: { ar: 'سائل نخاعي شوكي (CSF)', en: 'Cerebrospinal Fluid (CSF)' },
    };

    const newRec: CultureSensitivityRecord = {
      id: generateId('CULT'),
      reportNumber: `CS-2025-${Math.floor(100 + Math.random() * 899)}`,
      requestId: matchedReq?.id || 'REQ-MANUAL',
      requestNumber: matchedReq?.requestNumber || 'REQ-MANUAL',
      patientId,
      patientName: pat?.name || '-',
      specimenType,
      specimenSourceAr: specimenLabels[specimenType]?.ar || specimenType,
      specimenSourceEn: specimenLabels[specimenType]?.en || specimenType,
      growthStatus: isNoGrowth ? 'no_growth_48h' : 'positive_growth',
      colonyCount: isNoGrowth ? 'No Bacterial Growth after 48 Hours' : colony,
      incubationHours: 48,
      gramStainAr: isNoGrowth ? 'لا توجد بكتيريا بصبغة جرام' : preset.gramStainAr,
      gramStainEn: isNoGrowth ? 'No Bacteria Seen' : preset.gramStainEn,
      pusCellsCount: pus,
      epithelialCellsCount: epi,
      organismCode: orgCode,
      organismNameEn: isNoGrowth ? 'No Growth after 48h incubation' : preset.nameEn,
      organismNameAr: isNoGrowth ? 'لا يوجد نمو بكتيري بعد 48 ساعة من التحضين' : preset.nameAr,
      resistanceMechanisms: isNoGrowth ? ['None'] : [...preset.defaultResistance],
      standardGuideline: 'CLSI_2025',
      antibiotics: isNoGrowth ? [] : workingAntibiotics.map((a) => ({ ...a })),
      clinicalNotesAr: notes,
      clinicalNotesEn: notes,
      status: 'approved',
      enteredBy: user?.fullNameAr || 'Lab Specialist',
      approvedBy: user?.fullNameAr || 'Lab Director',
      createdAt: new Date().toISOString(),
    };

    await db.cultureResults.put(newRec);
    closeModal();
    showToast(i18n.bi('تم تسجيل تقرير المزرعة والحساسية بنجاح', 'Culture & Sensitivity report saved'), 'success');
    onSaved();
  });
}

async function printCultureA4(rec: CultureSensitivityRecord): Promise<void> {
  const abRows = rec.antibiotics
    .map(
      (a) => `
      <tr>
        <td><strong>${escapeHtml(a.antibioticNameEn)}</strong> (${escapeHtml(a.antibioticCode)})</td>
        <td>${escapeHtml(a.antibioticClass)}</td>
        <td style="font-weight:800;color:${a.sensitivity === 'S' ? '#047857' : a.sensitivity === 'I' ? '#b45309' : '#be123c'};">
          ${a.sensitivity === 'S' ? 'S (Susceptible)' : a.sensitivity === 'I' ? 'I (Intermediate)' : 'R (Resistant)'}
        </td>
        <td style="font-family:monospace;">${escapeHtml(a.micValue)}</td>
        <td style="font-family:monospace;color:#475569;">${escapeHtml(a.clsiBreakpoint)}</td>
      </tr>
    `
    )
    .join('');

  const qrFooter = buildQrVerificationFooterHtml({
    reportNumber: rec.reportNumber,
    patientName: rec.patientName,
    testName: `Culture & Sensitivity (${rec.organismNameEn})`,
    approvedAt: rec.createdAt,
  });

  const body = `
    <div dir="ltr" style="direction:ltr;text-align:left;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px;background:#f8fafc;padding:10px;border:1px solid #cbd5e1;border-radius:6px;">
        <div><strong>Patient:</strong> ${escapeHtml(rec.patientName)}</div>
        <div><strong>Report No:</strong> ${escapeHtml(rec.reportNumber)}</div>
        <div><strong>Specimen Source:</strong> ${escapeHtml(rec.specimenSourceAr)}</div>
        <div><strong>Report Date:</strong> ${escapeHtml(formatDate(rec.createdAt))}</div>
        <div><strong>Gram Stain:</strong> ${escapeHtml(rec.gramStainAr)}</div>
        <div><strong>Pus Cells (WBCs):</strong> ${escapeHtml(rec.pusCellsCount)}</div>
        <div style="grid-column:span 2;"><strong>Isolated Organism:</strong> <span style="color:#be123c;font-weight:800;">${escapeHtml(rec.organismNameEn)}</span> — <strong>Colony Count:</strong> ${escapeHtml(rec.colonyCount)}</div>
      </div>

      ${
        rec.antibiotics.length > 0
          ? `
        <table class="print-table" dir="ltr" style="direction:ltr;text-align:left;">
          <thead>
            <tr>
              <th>Antibiotic</th>
              <th>Antimicrobial Class</th>
              <th>Sensitivity</th>
              <th>MIC Value</th>
              <th>CLSI 2025 Breakpoint</th>
            </tr>
          </thead>
          <tbody>${abRows}</tbody>
        </table>
      `
          : `<div style="padding:16px;border:1px solid #10b981;background:#ecfdf5;border-radius:8px;font-weight:bold;color:#065f46;">No bacterial growth observed after 48 hours of aerobic incubation.</div>`
      }

      <div style="margin-top:12px;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:11.5px;">
        <strong>Clinical Interpretation & Notes:</strong> ${escapeHtml(rec.clinicalNotesAr)}
      </div>

      ${qrFooter}
    </div>
  `;

  await printService.printA4(
    'Microbiology Culture & Sensitivity (MIC) Report',
    body,
    `${rec.patientName} — ${rec.reportNumber}`,
    { forceEnglishLtr: true }
  );
}
