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

  let activeTab: 'cultures' | 'antibiogram' = 'cultures';
  let searchQuery = '';

  const render = async () => {
    const [cultures, patients, requests] = await Promise.all([
      db.cultureResults.toArray(),
      patientsRepository.getAll(),
      requestsRepository.getAllRequests(),
    ]);

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
          '🦠 وحدة المزارع البكتيرية والحساسية (C&S + MIC) وخريطة المضادات التراكمية',
          '🦠 Microbiology Culture & Sensitivity (CLSI/EUCAST MIC) & Cumulative Antibiogram'
        ),
        i18n.bi(
          'عزل وتصنيف البكتيريا والفطريات، قياس التركيز المثبط الأدنى (MIC)، رصد سلالات المقاومة (ESBL / MRSA / CRE)، وإصدار خريطة الحساسية الإحصائية للأطباء',
          'Organism isolation, CLSI/EUCAST MIC breakpoints, resistance phenotypes (ESBL/MRSA/CRE), and cumulative empiric therapy antibiogram'
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
            <button id="micro-tab-antibiogram" class="rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer ${
              activeTab === 'antibiogram'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }">
              📊 ${i18n.bi('خريطة مقاومة المضادات بالمعمل (Antibiogram)', 'Cumulative Lab Antibiogram')}
            </button>
            <button id="micro-ai-plate-btn" class="rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-500 cursor-pointer shadow-xs">
              🤖 ${i18n.bi('فحص طبق المزرعة بالذكاء الاصطناعي', 'AI Culture Plate Recognition')}
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
        <div class="rounded-xl border border-sky-200 bg-sky-50/60 p-4 shadow-2xs">
          <div class="text-xs font-semibold text-sky-800">${i18n.bi('أكثر ميكروب معزول', 'Top Isolated Pathogen')}</div>
          <div class="text-base font-extrabold text-sky-950 mt-1 truncate">Escherichia coli</div>
          <div class="text-[11px] text-sky-700 font-semibold mt-1">${i18n.bi('حساسية Meropenem: 100%', 'Meropenem Susceptibility: 100%')}</div>
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

    document.getElementById('micro-tab-antibiogram')?.addEventListener('click', () => {
      activeTab = 'antibiogram';
      render();
    });

    document.getElementById('micro-search-input')?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      render();
    });

    document.getElementById('micro-ai-plate-btn')?.addEventListener('click', () => {
      router.navigate('culturePlateAi');
    });

    document.getElementById('micro-new-btn')?.addEventListener('click', async () => {
      if (!(await enforcePermission('add', 'microbiology'))) return;
      openNewCultureModal(patients, requests, render);
    });

    document.getElementById('print-antibiogram-btn')?.addEventListener('click', async () => {
      await printService.printA4(
        i18n.bi('النشرة الدورية لحساسية المضادات الحيوية (Cumulative Antibiogram)', 'Cumulative Antimicrobial Susceptibility Report (Antibiogram)'),
        `<div style="font-size:12px;">
          <p style="margin-bottom:10px;">تقرير إحصائي تراكمي لنسب حساسية السلالات البكتيرية المعزولة داخل المختبر (% Susceptible) طبقاً لمعايير CLSI 2025 الإكلينيكية:</p>
          ${container.querySelector('table')?.outerHTML || ''}
        </div>`
      );
    });

    container.querySelectorAll('[data-view-culture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-view-culture')!;
        const rec = sortedCultures.find((c) => c.id === id);
        if (rec) openCultureDetailsModal(rec, render);
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

function openCultureDetailsModal(rec: CultureSensitivityRecord, onUpdated: () => void): void {
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

        <div class="overflow-x-auto border border-slate-200 rounded-xl">
          <table class="w-full text-xs text-start">
            <thead class="bg-slate-900 text-white">
              <tr>
                <th class="px-3 py-2 text-start">${i18n.bi('المضاد الحيوي (Antibiotic)', 'Antibiotic')}</th>
                <th class="px-3 py-2 text-start">${i18n.bi('المجموعة الدوائية', 'Class')}</th>
                <th class="px-3 py-2 text-center">${i18n.bi('الحساسية (S / I / R)', 'Sensitivity')}</th>
                <th class="px-3 py-2 text-start">${i18n.bi('التركيز المثبط الأدنى (MIC)', 'MIC Value')}</th>
                <th class="px-3 py-2 text-start">${i18n.bi('نقاط القطع القياسية (CLSI Breakpoints)', 'CLSI Breakpoints')}</th>
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
                  return `
                    <tr>
                      <td class="px-3 py-2 font-bold text-slate-900">${escapeHtml(ab.antibioticNameEn)} (${escapeHtml(ab.antibioticCode)})</td>
                      <td class="px-3 py-2 text-slate-600">${escapeHtml(ab.antibioticClass)}</td>
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
                      <td class="px-3 py-2 font-mono text-slate-500">${escapeHtml(ab.clsiBreakpoint)}</td>
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
            💾 ${i18n.bi('حفظ تعديلات الحساسية و MIC', 'Save MIC & Sensitivity Changes')}
          </button>
        </div>
      </div>
    `,
  });

  document.getElementById('save-culture-edits-btn')?.addEventListener('click', async () => {
    rec.antibiotics.forEach((ab, idx) => {
      const sEl = document.querySelector(`[data-edit-ab-sens="${idx}"]`) as HTMLSelectElement | null;
      const mEl = document.querySelector(`[data-edit-ab-mic="${idx}"]`) as HTMLInputElement | null;
      if (sEl) ab.sensitivity = sEl.value as AntibioticSensitivityFlag;
      if (mEl) ab.micValue = mEl.value.trim();
    });
    await db.cultureResults.put(rec);
    closeModal();
    showToast(i18n.bi('تم تحديث جدول الحساسية و MIC بنجاح', 'Sensitivity & MIC panel updated'), 'success');
    onUpdated();
  });
}

function openNewCultureModal(
  patients: Array<{ id: string; name: string }>,
  requests: Array<{ id: string; requestNumber: string; patientId: string }>,
  onSaved: () => void
): void {
  openModal({
    title: i18n.bi('🧫 تسجيل مزرعة بكتيرية وحساسية جديدة (CLSI / EUCAST)', '🧫 New Culture & Sensitivity Report'),
    size: 'lg',
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
      antibiotics: isNoGrowth ? [] : preset.antibiotics.map((a) => ({ ...a })),
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
          ${a.sensitivity === 'S' ? 'S (Susceptible - حساس)' : a.sensitivity === 'I' ? 'I (Intermediate - متوسط)' : 'R (Resistant - مقاوم)'}
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
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px;background:#f8fafc;padding:10px;border:1px solid #cbd5e1;border-radius:6px;">
      <div><strong>المريض / Patient:</strong> ${escapeHtml(rec.patientName)}</div>
      <div><strong>رقم التقرير / Report No:</strong> ${escapeHtml(rec.reportNumber)}</div>
      <div><strong>نوع العينة / Specimen:</strong> ${escapeHtml(rec.specimenSourceAr)}</div>
      <div><strong>تاريخ التقرير / Date:</strong> ${escapeHtml(formatDate(rec.createdAt))}</div>
      <div><strong>صبغة جرام / Gram Stain:</strong> ${escapeHtml(rec.gramStainAr)}</div>
      <div><strong>خلايا الصديد / Pus Cells:</strong> ${escapeHtml(rec.pusCellsCount)}</div>
      <div style="grid-column:span 2;"><strong>الميكروب المعزول / Isolated Organism:</strong> <span style="color:#be123c;font-weight:800;">${escapeHtml(rec.organismNameEn)} (${escapeHtml(rec.organismNameAr)})</span> — <strong>Colony Count:</strong> ${escapeHtml(rec.colonyCount)}</div>
    </div>

    ${
      rec.antibiotics.length > 0
        ? `
      <table class="print-table">
        <thead>
          <tr>
            <th>المضاد الحيوي / Antibiotic</th>
            <th>المجموعة / Class</th>
            <th>الحساسية / Sensitivity</th>
            <th>التركيز المثبط / MIC</th>
            <th>معيار CLSI 2025</th>
          </tr>
        </thead>
        <tbody>${abRows}</tbody>
      </table>
    `
        : `<div style="padding:16px;border:1px solid #10b981;background:#ecfdf5;border-radius:8px;font-weight:bold;color:#065f46;">لا يوجد نمو بكتيري بعد 48 ساعة من التحضين (No Growth after 48h incubation).</div>`
    }

    <div style="margin-top:12px;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:11.5px;">
      <strong>التوصيات الإكلينيكية / Clinical Interpretation:</strong> ${escapeHtml(rec.clinicalNotesAr)}
    </div>

    ${qrFooter}
  `;

  await printService.printA4(
    i18n.bi('تقرير المزرعة البكتيرية والحساسية (Culture & Sensitivity + MIC Report)', 'Microbiology Culture & Sensitivity (MIC) Report'),
    body,
    `${rec.patientName} — ${rec.reportNumber}`
  );
}
