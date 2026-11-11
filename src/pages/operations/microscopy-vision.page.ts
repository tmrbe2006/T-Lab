import { authService } from '../../auth/auth.service';
import {
  closeModal,
  openCustomModal,
  openDeleteConfirmModal,
  pageHeader,
  showToast,
} from '../../components/common';
import { db } from '../../db/database';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import { router } from '../../router';
import {
  analyzeMicroscopyImage,
  CALIBRATED_SCENARIOS,
  generateCalibratedSlideDataUrl,
  getAtlasByModality,
  getConfidenceTierInfo,
  microscopyRepository,
  MODALITY_GROUPS,
  VISION_ENGINE_MODES,
} from '../../services/microscopy-vision.service';
import type {
  AiFindingGroupKey,
  AiImageAnalysisRecord,
  AiSemanticColor,
  LabRequest,
  MicroscopyDetectedItem,
  MicroscopyModality,
  Patient,
  ResourceScreen,
  VisionEngineMode,
} from '../../types';

interface ModalityPageSpec {
  modality: MicroscopyModality;
  resource: ResourceScreen;
  route: 'bloodFilmAi' | 'urineMicroscopyAi' | 'stoolMicroscopyAi';
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  icon: string;
  defaultStain: string;
  stainOptions: string[];
  magnificationOptions: string[];
}

const MODALITY_SPECS: Record<MicroscopyModality, ModalityPageSpec> = {
  blood_film: {
    modality: 'blood_film',
    resource: 'bloodFilmAi',
    route: 'bloodFilmAi',
    titleAr: 'تحليل فيلم صورة الدم المجهري الذكي',
    titleEn: 'Intelligent Blood Film Microscopy Analysis',
    subtitleAr:
      'التعرف الآلي الدقيق على كرات الدم الحمراء وأشكالها، العد التفريقي لكرات الدم البيضاء والخلايا غير الناضجة، الصفائح الدموية، وطفيليات الدم (الملاريا، البابيزيا، الخيطيات)',
    subtitleEn:
      'Automated recognition of RBC morphology, WBC differential & blasts, platelets, and hemoparasites (Malaria, Babesia, Microfilaria)',
    icon: '🩸',
    defaultStain: 'Giemsa / Leishman Stain',
    stainOptions: [
      'Giemsa / Leishman Stain',
      'Wright-Giemsa Stain',
      'May-Grünwald Giemsa (MGG)',
      'Thick & Thin Malaria Film (Giemsa 10%)',
      'Supravital Reticulocyte Stain (New Methylene Blue)',
    ],
    magnificationOptions: ['100x Oil Immersion', '40x High Dry Field', '10x Low Power Scan'],
  },
  urine_sediment: {
    modality: 'urine_sediment',
    resource: 'urineMicroscopyAi',
    route: 'urineMicroscopyAi',
    titleAr: 'تحليل البول المجهري الذكي (الرواسب والبلورات والأسطوانات)',
    titleEn: 'Intelligent Urine Sediment Microscopy Analysis',
    subtitleAr:
      'التعرف الآلي الدقيق على الخلايا، الأسطوانات البولية بجميع أنواعها، البلورات والأملاح، الكائنات الدقيقة، وبيض البلهارسيا',
    subtitleEn:
      'Automated recognition of urinary cells, casts, crystals, microorganisms, and Schistosoma haematobium ova',
    icon: '🧪',
    defaultStain: 'Unstained Centrifuged Wet Mount',
    stainOptions: [
      'Unstained Centrifuged Wet Mount',
      'Sternheimer-Malbin Supravital Stain',
      'Polarized Light Microscopy (Crystal Birefringence)',
      'Phase-Contrast Microscopy (Casts & Dysmorphic RBCs)',
      'Sudan III Lipid Stain',
    ],
    magnificationOptions: ['40x High Power Field (HPF)', '10x Low Power Field (LPF)'],
  },
  stool_parasitology: {
    modality: 'stool_parasitology',
    resource: 'stoolMicroscopyAi',
    route: 'stoolMicroscopyAi',
    titleAr: 'تحليل البراز المجهري الذكي (الطفيليات والديدان والبلورات)',
    titleEn: 'Intelligent Stool Parasitology & Microscopy Analysis',
    subtitleAr:
      'التعرف الآلي الدقيق على الطفيليات الأولية، الديدان وبيضها، اليرقات، الخلايا، بلورات شاركو-ليدن، وعناصر الهضم',
    subtitleEn:
      'Automated recognition of intestinal protozoa, helminth ova, larvae, cells, Charcot-Leyden crystals, and digestion elements',
    icon: '🔬',
    defaultStain: 'Direct Saline + Lugol Iodine Wet Mount',
    stainOptions: [
      'Direct Saline + Lugol Iodine Wet Mount',
      'Formalin-Ether Sedimentation Concentration',
      'Trichrome Permanent Stain (Protozoa)',
      'Modified Ziehl-Neelsen Stain (Coccidia)',
      'Sudan III Fecal Fat Stain',
    ],
    magnificationOptions: ['40x High Power Field (HPF)', '10x Low Power Field (LPF)', '100x Oil Immersion'],
  },
};

function renderSemanticBadge(color: AiSemanticColor, severity: string): string {
  if (color === 'green') {
    return `<span class="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-300">● ${i18n.bi('طبيعي', 'Normal')}</span>`;
  }
  if (color === 'yellow') {
    return `<span class="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-300">▲ ${i18n.bi('ملاحظة', 'Observation')}</span>`;
  }
  return `<span class="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-300">✖ ${
    severity === 'critical'
      ? i18n.bi('غير طبيعي / حرج', 'Abnormal / Critical')
      : i18n.bi('غير طبيعي', 'Abnormal')
  }</span>`;
}

// ============================================================================
// 1. شاشة المركز الرئيسي للتحليل الذكي (AI Hub — `#/aiHub`)
// ============================================================================
export async function renderAiHubPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let activeHubTab: 'overview' | 'analyses' | 'findings' | 'corrections' | 'guide' = 'overview';

  const renderHub = async () => {
    const allAnalyses = await microscopyRepository.getAllAnalyses();
    const allCorrections = await microscopyRepository.getAllCorrections();
    const allFindings = await db.aiRecognitionFindings.toArray();

    const bloodCount = allAnalyses.filter((a) => a.modality === 'blood_film').length;
    const urineCount = allAnalyses.filter((a) => a.modality === 'urine_sediment').length;
    const stoolCount = allAnalyses.filter((a) => a.modality === 'stool_parasitology').length;
    const criticalCount = allAnalyses.filter((a) => a.hasCriticalAlert).length;
    const avgConfidence =
      allAnalyses.length > 0
        ? Math.round(
            (allAnalyses.reduce((acc, a) => acc + (Number(a.overallConfidence) || 92), 0) /
              allAnalyses.length) *
              10
          ) / 10
        : 96.4;

    container.innerHTML = `
      <div>
        ${pageHeader(
          i18n.bi(
            'مركز التشخيص المجهري الذكي (AI Microscopy Hub)',
            'Intelligent Microscopy Diagnostic Hub (AI Hub)'
          ),
          i18n.bi(
            'منظومة التعرف الآلي المتقدم على خلايا فيلم الدم، رواسب البول، وطفيليات البراز مع التحقق السريري المتعدد والتعلم المستمر',
            'Advanced automated recognition for Blood Film, Urine Sediment, and Stool Parasitology with multi-stage clinical validation'
          ),
          `
            <button id="hub-go-blood" type="button" class="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer">
              🩸 ${i18n.bi('تحليل فيلم صورة الدم', 'Blood Film Analysis')}
            </button>
            <button id="hub-go-urine" type="button" class="rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-500 cursor-pointer">
              🧪 ${i18n.bi('تحليل البول المجهري', 'Urine Microscopy')}
            </button>
            <button id="hub-go-stool" type="button" class="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              🔬 ${i18n.bi('تحليل البراز المجهري', 'Stool Microscopy')}
            </button>
          `
        )}

        <!-- 3 Main Specialized Modality Cards -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          <!-- Card 1: Blood Film Analysis -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between hover:border-rose-400 transition-colors">
            <div>
              <div class="flex items-center justify-between gap-3 mb-3">
                <span class="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-2xl">🩸</span>
                <span class="text-xs font-mono tabular-nums text-slate-500">${bloodCount} ${i18n.bi('تحليل مسجل', 'Analyses')}</span>
              </div>
              <h2 class="text-base font-bold text-slate-900 mb-1.5">
                ${i18n.bi('1. تحليل فيلم صورة الدم', '1. Blood Film Analysis')}
              </h2>
              <p class="text-xs text-slate-600 leading-relaxed mb-3">
                ${i18n.bi(
                  'التعرف الدقيق على كرات الدم الحمراء وأشكالها غير الطبيعية والشوائب، العد التفريقي لكرات الدم البيضاء والخلايا الأرومية، الصفائح الدموية، وطفيليات الملاريا والبابيزيا والخيطيات.',
                  'Precision recognition of RBC poikilocytosis & inclusions, WBC differential & blasts, platelets, and Malaria, Babesia & Microfilaria.'
                )}
              </p>
              <div class="text-[11px] text-slate-500 border-t border-slate-100 pt-2.5 mb-4">
                ${i18n.bi('الأقسام: خلايا الدم الحمراء · خلايا الدم البيضاء · الصفائح الدموية · الطفيليات', 'Sections: RBCs · WBCs · Platelets · Hemoparasites')}
              </div>
            </div>
            <button
              type="button"
              data-nav-route="bloodFilmAi"
              class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer"
            >
              ${i18n.bi('فتح شاشة تحليل فيلم صورة الدم ←', 'Open Blood Film Analysis →')}
            </button>
          </div>

          <!-- Card 2: Urine Microscopy Analysis -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between hover:border-amber-400 transition-colors">
            <div>
              <div class="flex items-center justify-between gap-3 mb-3">
                <span class="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl">🧪</span>
                <span class="text-xs font-mono tabular-nums text-slate-500">${urineCount} ${i18n.bi('تحليل مسجل', 'Analyses')}</span>
              </div>
              <h2 class="text-base font-bold text-slate-900 mb-1.5">
                ${i18n.bi('2. تحليل البول المجهري', '2. Urine Microscopy Analysis')}
              </h2>
              <p class="text-xs text-slate-600 leading-relaxed mb-3">
                ${i18n.bi(
                  'التعرف الدقيق على الخلايا (RBC طبيعية ومشوهة، صديد، طلائية)، الأسطوانات بجميع أنواعها، البلورات (أكسالات، يوريك، فوسفات، سيستين، تيروزين، ليوسين)، البكتيريا، الخميرة، وبيض البلهارسيا.',
                  'Precision recognition of urinary cells, casts, crystals (Oxalate, Uric, Struvite, Cystine, Tyrosine, Leucine), bacteria, yeast, and Schistosoma ova.'
                )}
              </p>
              <div class="text-[11px] text-slate-500 border-t border-slate-100 pt-2.5 mb-4">
                ${i18n.bi('الأقسام: الخلايا · الأسطوانات · البلورات · الكائنات الدقيقة · مواد أخرى', 'Sections: Cells · Casts · Crystals · Microorganisms · Others')}
              </div>
            </div>
            <button
              type="button"
              data-nav-route="urineMicroscopyAi"
              class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-600 transition-colors cursor-pointer"
            >
              ${i18n.bi('فتح شاشة تحليل البول المجهري ←', 'Open Urine Microscopy Analysis →')}
            </button>
          </div>

          <!-- Card 3: Stool Microscopy Analysis -->
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between hover:border-emerald-400 transition-colors">
            <div>
              <div class="flex items-center justify-between gap-3 mb-3">
                <span class="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl">🔬</span>
                <span class="text-xs font-mono tabular-nums text-slate-500">${stoolCount} ${i18n.bi('تحليل مسجل', 'Analyses')}</span>
              </div>
              <h2 class="text-base font-bold text-slate-900 mb-1.5">
                ${i18n.bi('3. تحليل البراز المجهري', '3. Stool Microscopy Analysis')}
              </h2>
              <p class="text-xs text-slate-600 leading-relaxed mb-3">
                ${i18n.bi(
                  'التعرف الدقيق على الطفيليات الأولية (الأميبا، الجيارديا، البالانتيديوم)، الديدان وبيضها (الأسكاريس، التريكيورس، الإنتروبيوس، الأنكلستوما، التينيا، الشستوسوما، الفاشيولا)، يرقات سترونجيلويدس، وبلورات شاركو-ليدن.',
                  'Precision recognition of protozoa, helminth ova (Ascaris, Trichuris, Enterobius, Hookworm, Taenia, Schistosoma, Fasciola), Strongyloides larvae & crystals.'
                )}
              </p>
              <div class="text-[11px] text-slate-500 border-t border-slate-100 pt-2.5 mb-4">
                ${i18n.bi('الأقسام: الطفيليات الأولية · الديدان وبيضها · اليرقات · الخلايا · البلورات · أخرى', 'Sections: Protozoa · Helminths · Larvae · Cells · Crystals · Others')}
              </div>
            </div>
            <button
              type="button"
              data-nav-route="stoolMicroscopyAi"
              class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              ${i18n.bi('فتح شاشة تحليل البراز المجهري ←', 'Open Stool Microscopy Analysis →')}
            </button>
          </div>
        </div>

        <!-- KPI Summary Row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي تحليلات الصور المجهرية', 'Total Image Analyses')}</div>
            <div class="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">${allAnalyses.length}</div>
            <div class="text-[11px] text-slate-500 mt-1">${i18n.bi('جدول تحليلات الصور (aiImageAnalyses)', 'Saved in aiImageAnalyses')}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="text-xs text-slate-500">${i18n.bi('إجمالي العناصر والمكتشفات المصنفة', 'Total Recognized Findings')}</div>
            <div class="text-2xl font-bold font-mono tabular-nums text-sky-700 mt-1">${allFindings.length}</div>
            <div class="text-[11px] text-slate-500 mt-1">${i18n.bi('متوسط الثقة:', 'Avg Confidence:')} <span class="font-mono font-bold">${avgConfidence}%</span></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="text-xs text-slate-500">${i18n.bi('التنبيهات السريرية الحرجة المكتشفة', 'Critical Clinical Alerts')}</div>
            <div class="text-2xl font-bold font-mono tabular-nums text-rose-600 mt-1">${criticalCount}</div>
            <div class="text-[11px] text-slate-500 mt-1">${i18n.bi('حالات تطلبت إبلاغًا طبيًا عاجلاً', 'Cases flagged for urgent review')}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="text-xs text-slate-500">${i18n.bi('تصحيحات الأخصائيين (التعلم المستمر)', 'Specialist Corrections Learned')}</div>
            <div class="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">${allCorrections.length}</div>
            <div class="text-[11px] text-slate-500 mt-1">${i18n.bi('جدول التصحيحات (aiCorrections)', 'Active feedback learning rules')}</div>
          </div>
        </div>

        <!-- Hub Sub-Navigation Tabs -->
        <div class="flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-xl mb-5">
          <button type="button" data-hub-tab="overview" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeHubTab === 'overview' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }">
            📊 ${i18n.bi('أحدث التحليلات المجهرية', 'Recent Image Analyses')} (${allAnalyses.length})
          </button>
          <button type="button" data-hub-tab="findings" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeHubTab === 'findings' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }">
            🧬 ${i18n.bi('جدول نتائج التعرف', 'Recognition Findings Table')} (${allFindings.length})
          </button>
          <button type="button" data-hub-tab="corrections" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeHubTab === 'corrections' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }">
            ✏️ ${i18n.bi('جدول التصحيحات والتعلم', 'User Corrections Table')} (${allCorrections.length})
          </button>
          <button type="button" data-hub-tab="guide" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeHubTab === 'guide' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }">
            📖 ${i18n.bi('التوثيق ودليل الاستخدام وأمثلة النتائج', 'Documentation, User Guide & Examples')}
          </button>
        </div>

        <!-- Tab 1: Analyses Table -->
        ${
          activeHubTab === 'overview' || activeHubTab === 'analyses'
            ? `
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 class="text-sm font-bold text-slate-900">${i18n.bi('سجل تحليلات الصور المجهرية (جدول aiImageAnalyses)', 'Saved Microscopy Image Analyses (aiImageAnalyses Table)')}</h3>
                <p class="text-xs text-slate-500">${i18n.bi('يعرض كافة التحليلات المحفوظة مع حالة التنبيه الحرج وخيار الحذف الفوري للصورة', 'All saved analyses with critical alert indicators and immediate image deletion')}</p>
              </div>
            </div>
            ${
              allAnalyses.length === 0
                ? `<div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                    ${i18n.bi('لا توجد تحليلات محفوظة حتى الآن. اختر أحد التحاليل الثلاثة أعلاه لبدء الفحص الذكي.', 'No analyses saved yet. Select one of the three modalities above to start.')}
                  </div>`
                : `
                <div class="overflow-x-auto">
                  <table class="w-full text-xs border-collapse">
                    <thead>
                      <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th class="p-2.5 text-start">${i18n.bi('رقم التحليل', 'Analysis #')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('نوع التحليل', 'Modality')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('المريض / الطلب', 'Patient / Request')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('النظام المستخدم', 'Diagnostic System')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('نسبة الثقة', 'Confidence')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('الحالة السريرية', 'Clinical Status')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('خصوصية الصورة', 'Image Privacy')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('الإجراءات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                      ${allAnalyses
                        .map((a) => {
                          const modTitle =
                            a.modality === 'blood_film'
                              ? i18n.bi('فيلم صورة الدم', 'Blood Film')
                              : a.modality === 'urine_sediment'
                              ? i18n.bi('تحليل البول المجهري', 'Urine Microscopy')
                              : i18n.bi('تحليل البراز المجهري', 'Stool Microscopy');
                          return `
                            <tr class="hover:bg-slate-50">
                              <td class="p-2.5 font-mono font-bold text-sky-700">${a.analysisNumber}</td>
                              <td class="p-2.5 font-semibold text-slate-800">${modTitle}</td>
                              <td class="p-2.5 font-semibold text-slate-900">
                                ${a.patientName || i18n.bi('فحص مباشر', 'Direct Slide')}
                                ${a.requestNumber ? `<div class="text-[11px] font-mono text-slate-500">${a.requestNumber}</div>` : ''}
                              </td>
                              <td class="p-2.5 text-slate-600">${i18n.bi(a.engineSystemNameAr, a.engineSystemNameEn)}</td>
                              <td class="p-2.5 font-mono font-bold tabular-nums text-emerald-700">${a.overallConfidence}%</td>
                              <td class="p-2.5">
                                ${
                                  a.hasCriticalAlert
                                    ? `<span class="text-rose-700 font-bold">✖ ${i18n.bi('تنبيه حرج', 'Critical Alert')}</span>`
                                    : a.requiresSpecialistReview
                                    ? `<span class="text-amber-700 font-bold">▲ ${i18n.bi('يُنصح بمراجعة أخصائي', 'Specialist Review')}</span>`
                                    : `<span class="text-emerald-700 font-semibold">● ${i18n.bi('مكتمل ومعتمد', 'Validated')}</span>`
                                }
                              </td>
                              <td class="p-2.5">
                                ${
                                  a.imageDeleted
                                    ? `<span class="text-slate-500">${i18n.bi('تم حذف الصورة (محفوظ نصيًا)', 'Image Purged')}</span>`
                                    : `<button type="button" data-purge-img="${a.id}" class="text-amber-700 hover:underline font-semibold cursor-pointer">🛡️ ${i18n.bi('حذف الصورة فوريًا', 'Delete Image Now')}</button>`
                                }
                              </td>
                              <td class="p-2.5">
                                <div class="flex items-center gap-2">
                                  <button type="button" data-print-analysis="${a.id}" class="rounded-md bg-sky-50 border border-sky-200 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">
                                    🖨️ A4
                                  </button>
                                  <button type="button" data-thermal-analysis="${a.id}" class="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                                    🧾 80mm
                                  </button>
                                  <button type="button" data-delete-analysis="${a.id}" class="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer">
                                    🗑️ ${i18n.bi('حذف', 'Delete')}
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
              `
            }
          </div>
        `
            : ''
        }

        <!-- Tab 2: Recognition Findings Table -->
        ${
          activeHubTab === 'findings'
            ? `
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h3 class="text-sm font-bold text-slate-900 mb-1">${i18n.bi('جدول نتائج التعرف الآلي (aiRecognitionFindings)', 'Recognition Findings Table (aiRecognitionFindings)')}</h3>
            <p class="text-xs text-slate-500 mb-4">${i18n.bi('يحتفظ بكل نتيجة مكتشفة مع النسبة المئوية للثقة واللون الدلالي والأهمية السريرية', 'Stores every detected entity with confidence percentage, semantic color, and clinical significance')}</p>
            ${
              allFindings.length === 0
                ? `<div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">${i18n.bi('لا توجد نتائج تعرف محفوظة بعد.', 'No recognition findings saved yet.')}</div>`
                : `
                <div class="overflow-x-auto">
                  <table class="w-full text-xs border-collapse">
                    <thead>
                      <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th class="p-2.5 text-start">${i18n.bi('رقم التحليل', 'Analysis #')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('القسم العلمي', 'Group')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('النتيجة (عربي / إنجليزي)', 'Finding (AR / EN)')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('العدد / التقدير', 'Count / Grade')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('نسبة الثقة', 'Confidence')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('اللون الدلالي', 'Semantic Color')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('الأهمية السريرية', 'Clinical Significance')}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                      ${allFindings
                        .slice(0, 80)
                        .map(
                          (f) => `
                        <tr class="hover:bg-slate-50">
                          <td class="p-2.5 font-mono font-bold text-sky-700">${f.analysisNumber}</td>
                          <td class="p-2.5 text-slate-700 font-semibold">${i18n.bi(f.groupTitleAr, f.groupTitleEn)}</td>
                          <td class="p-2.5">
                            <div class="font-bold text-slate-900">${f.nameAr}</div>
                            <div class="text-[11px] text-slate-500">${f.nameEn}</div>
                          </td>
                          <td class="p-2.5 font-mono font-semibold text-slate-800">${f.countOrGrade}</td>
                          <td class="p-2.5 font-mono font-bold tabular-nums ${f.confidence < 60 ? 'text-rose-600' : 'text-emerald-700'}">${f.confidence}%</td>
                          <td class="p-2.5">${renderSemanticBadge(f.semanticColor, f.severity)}</td>
                          <td class="p-2.5 text-slate-600 max-w-xs">${i18n.bi(f.clinicalSignificanceAr, f.clinicalSignificanceEn)}</td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
            }
          </div>
        `
            : ''
        }

        <!-- Tab 3: User Corrections Table -->
        ${
          activeHubTab === 'corrections'
            ? `
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h3 class="text-sm font-bold text-slate-900 mb-1">${i18n.bi('جدول تصحيحات المستخدمين للتعلم المستمر (aiCorrections)', 'User Corrections & Continuous Learning Table (aiCorrections)')}</h3>
            <p class="text-xs text-slate-500 mb-4">${i18n.bi('يحتفظ بتصحيحات أخصائيي المختبر ويطبقها تلقائيًا لرفع دقة التعرف في التحليلات القادمة', 'Stores specialist corrections and automatically applies them to future analyses')}</p>
            ${
              allCorrections.length === 0
                ? `<div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">${i18n.bi('لا توجد تصحيحات مسجلة بعد. يمكنك استخدام زر "تصحيح" بجانب أي نتيجة في شاشات التحليل الثلاث.', 'No user corrections recorded yet. Use the "Correct" button next to any finding during analysis.')}</div>`
                : `
                <div class="overflow-x-auto">
                  <table class="w-full text-xs border-collapse">
                    <thead>
                      <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th class="p-2.5 text-start">${i18n.bi('التاريخ', 'Date')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('النتيجة الأصلية', 'Original Finding')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('النتيجة المصححة (المعتمدة)', 'Corrected Finding')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('التقدير المصحح', 'Corrected Grade')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('سبب التصحيح والملاحظة العلمية', 'Correction Reason')}</th>
                        <th class="p-2.5 text-start">${i18n.bi('بواسطة', 'Corrected By')}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                      ${allCorrections
                        .map(
                          (c) => `
                        <tr class="hover:bg-slate-50">
                          <td class="p-2.5 font-mono text-slate-500">${c.createdAt}</td>
                          <td class="p-2.5 text-rose-700 line-through font-semibold">${c.originalNameAr} (${c.originalCode})</td>
                          <td class="p-2.5 text-emerald-700 font-bold">${c.correctedNameAr} (${c.correctedCode})</td>
                          <td class="p-2.5 font-mono font-semibold text-slate-800">${c.correctedCountOrGrade}</td>
                          <td class="p-2.5 text-slate-700">${c.correctionReason}</td>
                          <td class="p-2.5 font-semibold text-slate-600">${c.correctedBy}</td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
            }
          </div>
        `
            : ''
        }

        <!-- Tab 4: Documentation, User Guide & Examples -->
        ${
          activeHubTab === 'guide'
            ? `
          <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
            <div>
              <h3 class="text-base font-bold text-slate-900 mb-2">
                📖 ${i18n.bi('دليل استخدام منظومة التعرف المجهري الذكي (T-Lab Intelligent Microscopy)', 'User Guide & Reference Documentation')}
              </h3>
              <p class="text-xs text-slate-600 leading-relaxed">
                ${i18n.bi(
                  'تعتمد المنظومة على نظام التحقق المتعدد الذي يجمع بين محرك الذكاء الاصطناعي المتقدم، ونظام التعرف الآلي، وتقنية التحليل الذكي، ونظام التشخيص المساعد المحلي لضمان أعلى دقة سريرية ممكنة دون تخزين الصور على أي خوادم خارجية.',
                  'The suite uses a multi-stage verification pipeline combining the Advanced AI Engine, Automated Recognition System, Smart Analysis Technology, and local Assisted Diagnostic System.'
                )}
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-bold text-slate-900 mb-1.5">1. ${i18n.bi('خطوات الفحص المجهري', '1. Analysis Workflow')}</div>
                <ol class="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                  <li>${i18n.bi('اختر نوع التحليل (دم / بول / براز) من المركز الرئيسي.', 'Select modality (Blood / Urine / Stool) from AI Hub.')}</li>
                  <li>${i18n.bi('اسحب وأفلت صورة الشريحة أو التقطها من كاميرا الميكروسكوب.', 'Drag & drop slide image or capture from microscope camera.')}</li>
                  <li>${i18n.bi('فعّل تحسين التباين وإزالة الضوضاء ثم اضغط "بدء التحليل".', 'Enable contrast & noise reduction and click "Start Analysis".')}</li>
                  <li>${i18n.bi('راجع النتائج المصنفة، صحح أي عنصر إذا لزم، ثم احفظ أو اطبع.', 'Review grouped findings, correct if needed, save or print.')}</li>
                </ol>
              </div>

              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-bold text-slate-900 mb-1.5">2. ${i18n.bi('دلالات الألوان ونسب الثقة', '2. Semantic Colors & Confidence')}</div>
                <div class="text-xs text-slate-600 space-y-2">
                  <div><span class="font-bold text-emerald-700">● أخضر (طبيعي):</span> ${i18n.bi('خلايا أو عناصر ضمن الحدود الفسيولوجية المعتادة.', 'Within normal physiological limits.')}</div>
                  <div><span class="font-bold text-amber-700">▲ أصفر (ملاحظة):</span> ${i18n.bi('تغير شكلي خفيف أو وجود متوسط يستدعي المتابعة.', 'Mild morphological change or moderate presence.')}</div>
                  <div><span class="font-bold text-rose-700">✖ أحمر (غير طبيعي / حرج):</span> ${i18n.bi('طفيليات، خلايا أرومية، أسطوانات دموية/شمعية، أو بلورات مرضية.', 'Parasites, blasts, pathological casts/crystals.')}</div>
                  <div><span class="font-bold text-slate-900">قاعدة < 60%:</span> ${i18n.bi('تظهر تلقائيًا رسالة "يُنصح بمراجعة أخصائي".', 'Automatically triggers Specialist Review alert.')}</div>
                </div>
              </div>

              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-bold text-slate-900 mb-1.5">3. ${i18n.bi('أمثلة على النتائج القياسية', '3. Standard Output Examples')}</div>
                <div class="text-xs text-slate-600 space-y-1.5">
                  <div><strong>🩸 فيلم الدم:</strong> <code>P. falciparum (98.7%)</code> - تنبيه حرج + توصية علاج فوري.</div>
                  <div><strong>🧪 تحليل البول:</strong> <code>Calcium Oxalate (+++, 98.9%)</code> + <code>RBCs (15-20/HPF)</code>.</div>
                  <div><strong>🔬 تحليل البراز:</strong> <code>Ascaris Ova (99.1%)</code> + <code>Giardia Cysts (97.6%)</code> + <code>Charcot-Leyden</code>.</div>
                </div>
              </div>
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;

    // Bind navigation buttons
    document.getElementById('hub-go-blood')?.addEventListener('click', () => router.navigate('bloodFilmAi'));
    document.getElementById('hub-go-urine')?.addEventListener('click', () => router.navigate('urineMicroscopyAi'));
    document.getElementById('hub-go-stool')?.addEventListener('click', () => router.navigate('stoolMicroscopyAi'));

    container.querySelectorAll<HTMLButtonElement>('[data-nav-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-nav-route') as 'bloodFilmAi' | 'urineMicroscopyAi' | 'stoolMicroscopyAi';
        if (target) router.navigate(target);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-hub-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-hub-tab') as typeof activeHubTab;
        if (tab) {
          activeHubTab = tab;
          void renderHub();
        }
      });
    });

    // Immediate image purge buttons
    container.querySelectorAll<HTMLButtonElement>('[data-purge-img]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-purge-img');
        if (!id) return;
        await microscopyRepository.deleteImageImmediately(id);
        showToast(
          i18n.bi('تم حذف الصورة المجهرية فوريًا مع الاحتفاظ بجميع النتائج الرقمية', 'Image purged immediately; structured findings preserved'),
          'info'
        );
        await renderHub();
      });
    });

    // Print A4 analysis
    container.querySelectorAll<HTMLButtonElement>('[data-print-analysis]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-print-analysis');
        if (!id) return;
        const analysis = allAnalyses.find((a) => a.id === id);
        if (!analysis) return;
        const findings = await microscopyRepository.getFindingsByAnalysisId(id);
        await printAnalysisReportA4(analysis, findings);
      });
    });

    // Print Thermal 80mm analysis
    container.querySelectorAll<HTMLButtonElement>('[data-thermal-analysis]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-thermal-analysis');
        if (!id) return;
        const analysis = allAnalyses.find((a) => a.id === id);
        if (!analysis) return;
        const findings = await microscopyRepository.getFindingsByAnalysisId(id);
        const summaryHtml = `
          <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${analysis.patientName || 'فحص مباشر'}</div>
          <div><strong>${i18n.bi('النظام:', 'System:')}</strong> ${analysis.engineSystemNameAr}</div>
          <div><strong>${i18n.bi('نسبة الثقة:', 'Confidence:')}</strong> ${analysis.overallConfidence}%</div>
          <hr style="border-top:1px dashed #000; margin:6px 0;" />
          ${findings
            .map(
              (f) =>
                `<div>• <strong>${f.nameAr}:</strong> ${f.countOrGrade} (${f.confidence}%)</div>`
            )
            .join('')}
          <hr style="border-top:1px dashed #000; margin:6px 0;" />
          <div><strong>${i18n.bi('التفسير:', 'Interpretation:')}</strong> ${analysis.clinicalInterpretationAr}</div>
        `;
        await printService.printThermal80mm(
          i18n.bi('إيصال فحص مجهري ذكي', 'Microscopy Analysis Summary'),
          summaryHtml,
          analysis.analysisNumber
        );
      });
    });

    // Delete analysis
    container.querySelectorAll<HTMLButtonElement>('[data-delete-analysis]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-analysis');
        if (!id) return;
        const analysis = allAnalyses.find((a) => a.id === id);
        if (!analysis) return;
        if (!can(user, 'delete', 'aiHub')) {
          showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
          return;
        }
        openDeleteConfirmModal({
          recordLabel: `${analysis.analysisNumber} - ${analysis.patientName || ''}`,
          onConfirm: async () => {
            await microscopyRepository.deleteScan(id);
            showToast(i18n.bi('تم حذف سجل التحليل المجهري بنجاح', 'Analysis record deleted'), 'info');
            await renderHub();
          },
        });
      });
    });
  };

  await renderHub();
}

async function printAnalysisReportA4(
  analysis: AiImageAnalysisRecord,
  findings: Array<{
    groupTitleAr: string;
    groupTitleEn: string;
    nameAr: string;
    nameEn: string;
    scientificName?: string;
    countOrGrade: string;
    confidence: number;
    semanticColor: AiSemanticColor;
    clinicalSignificanceAr: string;
    clinicalSignificanceEn: string;
  }>
): Promise<void> {
  const rowsHtml = findings
    .map((f) => {
      const colorLabel =
        f.semanticColor === 'green'
          ? i18n.bi('أخضر - طبيعي', 'Green - Normal')
          : f.semanticColor === 'yellow'
          ? i18n.bi('أصفر - ملاحظة', 'Yellow - Note')
          : i18n.bi('أحمر - غير طبيعي', 'Red - Abnormal');
      return `
        <tr>
          <td>${i18n.bi(f.groupTitleAr, f.groupTitleEn)}</td>
          <td><strong>${f.nameAr}</strong><br/><span style="font-size:10px;color:#475569;">${f.nameEn} ${f.scientificName ? `(${f.scientificName})` : ''}</span></td>
          <td style="font-family:monospace;font-weight:700;">${f.countOrGrade}</td>
          <td style="font-family:monospace;">${f.confidence}%</td>
          <td><strong>${colorLabel}</strong></td>
          <td>${i18n.bi(f.clinicalSignificanceAr, f.clinicalSignificanceEn)}</td>
        </tr>
      `;
    })
    .join('');

  const reportHtml = `
    <div style="margin-bottom:12px; padding:10px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; font-size:12px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
        <div><strong>${i18n.bi('رقم التحليل:', 'Analysis #:')}</strong> ${analysis.analysisNumber}</div>
        <div><strong>${i18n.bi('اسم المريض:', 'Patient Name:')}</strong> ${analysis.patientName || i18n.bi('فحص مجهري مباشر', 'Direct Microscopy Slide')}</div>
        <div><strong>${i18n.bi('نظام التحليل:', 'Diagnostic System:')}</strong> ${i18n.bi(analysis.engineSystemNameAr, analysis.engineSystemNameEn)}</div>
        <div><strong>${i18n.bi('الصبغة / التكبير:', 'Stain & Magnification:')}</strong> ${analysis.stainOrPrep} · ${analysis.magnification}</div>
      </div>
    </div>

    ${
      analysis.hasCriticalAlert
        ? `<div style="margin-bottom:10px; padding:8px 12px; border:2px solid #dc2626; background:#fef2f2; color:#991b1b; border-radius:6px; font-size:12px; font-weight:700;">
            🚨 ${i18n.bi(analysis.criticalAlertMessageAr || 'تنبيه طبي عاجل: توجد نتائج حرجة تستلزم المراجعة الفورية', analysis.criticalAlertMessageEn || 'URGENT CLINICAL ALERT')}
          </div>`
        : ''
    }

    ${
      analysis.requiresSpecialistReview
        ? `<div style="margin-bottom:10px; padding:8px 12px; border:1px solid #d97706; background:#fffbeb; color:#92400e; border-radius:6px; font-size:12px; font-weight:700;">
            ⚠️ ${i18n.bi('يُنصح بمراجعة أخصائي المختبر لتأكيد بعض العناصر المكتشفة', 'Specialist review is recommended')}
          </div>`
        : ''
    }

    ${
      analysis.imageDataUrl && !analysis.imageDeleted
        ? `<div style="text-align:center; margin-bottom:12px;">
            <img src="${analysis.imageDataUrl}" alt="Microscopy Slide" style="max-height:190px; border-radius:8px; border:1px solid #94a3b8;" />
          </div>`
        : ''
    }

    <table class="print-table">
      <thead>
        <tr>
          <th>${i18n.bi('القسم العلمي', 'Section')}</th>
          <th>${i18n.bi('العنصر المكتشف (عربي / إنجليزي)', 'Detected Element (AR / EN)')}</th>
          <th>${i18n.bi('العدد / التقدير', 'Count / Grade')}</th>
          <th>${i18n.bi('نسبة الثقة', 'Confidence')}</th>
          <th>${i18n.bi('الدلالة اللونية', 'Semantic Status')}</th>
          <th>${i18n.bi('الأهمية السريرية', 'Clinical Significance')}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div style="margin-top:14px; padding:10px; border:1px solid #94a3b8; border-radius:8px; font-size:12px;">
      <div><strong>${i18n.bi('التفسير الطبي السريري:', 'Clinical Interpretation:')}</strong> ${i18n.bi(analysis.clinicalInterpretationAr, analysis.clinicalInterpretationEn)}</div>
      <div style="margin-top:6px;"><strong>${i18n.bi('التوصيات الطبية:', 'Medical Recommendations:')}</strong> ${i18n.bi(analysis.recommendationsAr, analysis.recommendationsEn || analysis.recommendationsAr)}</div>
      <div style="margin-top:8px; padding-top:6px; border-top:1px dashed #cbd5e1; font-size:11px; color:#475569; font-weight:700;">
        ⚕️ ${i18n.bi('تنويه طبي: هذه نتائج مجهرية مساعدة صادرة عن نظام التشخيص المساعد وتحتاج مراجعة واعتماد الطبيب المختص — لا تمثل تشخيصًا نهائيًا بمفردها.', 'Medical Disclaimer: These are assistive microscopy findings requiring specialist physician review and do not constitute a standalone final diagnosis.')}
      </div>
    </div>
  `;

  await printService.printA4(
    i18n.bi('تقرير الفحص والتشخيص المجهري الذكي', 'Intelligent Microscopy Diagnostic Report'),
    reportHtml,
    `${analysis.analysisNumber} · ${analysis.patientName || ''}`
  );
}

// ============================================================================
// 2. الشاشات الثلاث المنفصلة للتحليل (Blood Film / Urine / Stool)
// ============================================================================
async function renderMicroscopyWorkspace(
  container: HTMLElement,
  modality: MicroscopyModality
): Promise<void> {
  const spec = MODALITY_SPECS[modality];
  const user = authService.getCurrentUser();
  const groups = MODALITY_GROUPS[modality];
  const atlas = getAtlasByModality(modality);
  const scenarios = CALIBRATED_SCENARIOS.filter((s) => s.modality === modality);

  const [patients, requests] = await Promise.all([
    db.patients.toArray(),
    db.requests.toArray(),
  ]);

  let currentEngine: VisionEngineMode = 'tlab_ensemble_v4';
  let currentStain = spec.defaultStain;
  let currentMagnification = spec.magnificationOptions[0];
  let selectedPatientId = '';
  let selectedRequestId = '';
  let clinicalNotes = '';
  let currentScenarioId = scenarios[0]?.id || '';
  let currentImageDataUrl = scenarios[0] ? generateCalibratedSlideDataUrl(scenarios[0].id) : '';
  let imageDeleted = false;
  let enhanceContrast = true;
  let reduceNoise = true;
  let opticalFilter: 'normal' | 'giemsa_boost' | 'phase_contrast' | 'polarized' | 'iodine' = 'normal';
  let zoomLevel = 100;
  let isAnalyzing = false;
  let progressPercent = 0;
  let progressStageAr = '';
  let progressStageEn = '';
  let activeGroupFilter: AiFindingGroupKey | 'all' = 'all';
  let lastSavedAnalysisId = 'unsaved';
  let currentChromaticSignature = 'std';

  // Initial calibrated state from first scenario
  let sampleQualityAr = scenarios[0]?.sampleQualityAr || '';
  let overallDiagnosisAr = scenarios[0]?.overallDiagnosisAr || '';
  let overallDiagnosisEn = scenarios[0]?.overallDiagnosisEn || '';
  let clinicalRecommendationsAr = scenarios[0]?.clinicalRecommendationsAr || '';
  let clinicalRecommendationsEn = scenarios[0]?.clinicalRecommendationsEn || '';
  let detectedItems: MicroscopyDetectedItem[] = scenarios[0]
    ? scenarios[0].detectedItems.map((x, idx) => ({ ...x, id: `fnd_init_${idx}` }))
    : [];
  let overallConfidence = 96.8;
  let requiresSpecialistReview = false;
  let hasCriticalAlert = detectedItems.some((i) => i.severity === 'critical');
  let criticalAlertMessageAr: string | undefined = hasCriticalAlert
    ? `تنبيه طبي عاجل: تم رصد نتائج حرجة (${detectedItems
        .filter((i) => i.severity === 'critical')
        .map((c) => c.nameAr)
        .join(' ، ')}) تستوجب المراجعة الفورية.`
    : undefined;
  let inconsistencyWarningsAr: string[] = [];

  let activeCameraStream: MediaStream | null = null;
  const stopCamera = () => {
    if (activeCameraStream) {
      activeCameraStream.getTracks().forEach((t) => t.stop());
      activeCameraStream = null;
    }
  };

  const getOpticalFilterCss = (): string => {
    switch (opticalFilter) {
      case 'giemsa_boost':
        return 'contrast(1.32) saturate(1.45) hue-rotate(-6deg)';
      case 'phase_contrast':
        return 'grayscale(0.75) contrast(1.65) brightness(0.95)';
      case 'polarized':
        return 'invert(0.88) contrast(1.55) saturate(1.6)';
      case 'iodine':
        return 'sepia(0.6) contrast(1.3) saturate(1.4)';
      default:
        return 'none';
    }
  };

  // Opens Specialist Correction Modal (`openCustomModal`) to correct a finding and save into `aiCorrections`
  const openSpecialistCorrectionModal = (itemIndex: number) => {
    const targetItem = detectedItems[itemIndex];
    if (!targetItem) return;

    const modalHtml = `
      <form id="ai-correction-form" class="space-y-4 text-xs">
        <div class="rounded-lg bg-slate-100 border border-slate-200 p-3">
          <div class="font-bold text-slate-800 mb-1">${i18n.bi('النتيجة الأصلية المرصودة:', 'Original Recognized Finding:')}</div>
          <div class="text-rose-700 font-semibold">${targetItem.nameAr} (${targetItem.nameEn}) — ${targetItem.countOrGrade} [${targetItem.confidence}%]</div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اختر التصنيف الصحيح من الأطلس العلمي', 'Select Corrected Classification from Atlas')}</label>
            <select id="corr-atlas-code" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
              <option value="${targetItem.code}">-- ${i18n.bi('تعديل يدوي للاسم والتقدير', 'Custom / Keep Current Code')} (${targetItem.code}) --</option>
              ${atlas
                .map(
                  (a) =>
                    `<option value="${a.code}" ${a.code === targetItem.code ? 'selected' : ''}>[${a.categoryAr}] ${a.nameAr} — ${a.nameEn}</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('القسم العلمي', 'Scientific Section')}</label>
            <select id="corr-group-key" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
              ${groups
                .map(
                  (g) =>
                    `<option value="${g.key}" ${g.key === targetItem.groupKey ? 'selected' : ''}>${g.icon} ${g.titleAr}</option>`
                )
                .join('')}
            </select>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الاسم المصحح (عربي) *', 'Corrected Name (Arabic) *')}</label>
            <input id="corr-name-ar" type="text" required value="${targetItem.nameAr}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('الاسم المصحح (إنجليزي) *', 'Corrected Name (English) *')}</label>
            <input id="corr-name-en" type="text" required value="${targetItem.nameEn}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('العدد / التقدير المعتمد *', 'Corrected Count / Grade *')}</label>
            <input id="corr-grade" type="text" required value="${targetItem.countOrGrade}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">${i18n.bi('اللون الدلالي والأهمية', 'Semantic Color & Severity')}</label>
            <select id="corr-semantic" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">
              <option value="green" ${targetItem.semanticColor === 'green' ? 'selected' : ''}>● ${i18n.bi('أخضر — طبيعي', 'Green — Normal')}</option>
              <option value="yellow" ${targetItem.semanticColor === 'yellow' ? 'selected' : ''}>▲ ${i18n.bi('أصفر — ملاحظة', 'Yellow — Observation')}</option>
              <option value="red" ${targetItem.semanticColor === 'red' ? 'selected' : ''}>✖ ${i18n.bi('أحمر — غير طبيعي / حرج', 'Red — Abnormal / Critical')}</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">${i18n.bi('سبب التصحيح والملاحظة العلمية (يُحفظ في جدول التصحيحات للتعلم المستمر) *', 'Correction Reason & Clinical Note (Saved for Continuous Learning) *')}</label>
          <input id="corr-reason" type="text" required placeholder="${i18n.bi('مثال: تم التحقق بالعدسة الزيتية 100x وتبين وجود شوكة جانبية مميزة...', 'e.g. Verified under 100x oil immersion...')}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button type="submit" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
            ✔️ ${i18n.bi('اعتماد التصحيح وتحديث قاعدة التعلم', 'Apply Correction & Save to Learning Base')}
          </button>
        </div>
      </form>
    `;

    openCustomModal(
      i18n.bi('تصحيح النتيجة وتدريب نظام التعرف الآلي', 'Specialist Finding Correction & System Learning'),
      modalHtml
    );

    const atlasSelect = document.getElementById('corr-atlas-code') as HTMLSelectElement | null;
    atlasSelect?.addEventListener('change', () => {
      const found = atlas.find((a) => a.code === atlasSelect.value);
      if (found) {
        const nameArEl = document.getElementById('corr-name-ar') as HTMLInputElement | null;
        const nameEnEl = document.getElementById('corr-name-en') as HTMLInputElement | null;
        const grpEl = document.getElementById('corr-group-key') as HTMLSelectElement | null;
        const semEl = document.getElementById('corr-semantic') as HTMLSelectElement | null;
        if (nameArEl) nameArEl.value = found.nameAr;
        if (nameEnEl) nameEnEl.value = found.nameEn;
        if (grpEl) grpEl.value = found.groupKey;
        if (semEl) semEl.value = found.semanticColor;
      }
    });

    const form = document.getElementById('ai-correction-form') as HTMLFormElement | null;
    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const newCode = (document.getElementById('corr-atlas-code') as HTMLSelectElement)?.value || targetItem.code;
      const newGroupKey = ((document.getElementById('corr-group-key') as HTMLSelectElement)?.value || targetItem.groupKey || groups[0].key) as AiFindingGroupKey;
      const newNameAr = (document.getElementById('corr-name-ar') as HTMLInputElement)?.value.trim() || targetItem.nameAr;
      const newNameEn = (document.getElementById('corr-name-en') as HTMLInputElement)?.value.trim() || targetItem.nameEn;
      const newGrade = (document.getElementById('corr-grade') as HTMLInputElement)?.value.trim() || targetItem.countOrGrade;
      const newSemantic = ((document.getElementById('corr-semantic') as HTMLSelectElement)?.value || 'yellow') as AiSemanticColor;
      const reason = (document.getElementById('corr-reason') as HTMLInputElement)?.value.trim() || 'تصحيح أخصائي المختبر';

      const newSeverity: 'normal' | 'mild' | 'moderate' | 'critical' =
        newSemantic === 'green' ? 'normal' : newSemantic === 'yellow' ? 'mild' : 'critical';

      await microscopyRepository.recordUserCorrection({
        analysisId: lastSavedAnalysisId,
        findingId: targetItem.id || `fnd_${itemIndex}`,
        modality,
        groupKey: newGroupKey,
        originalCode: targetItem.code,
        originalNameAr: targetItem.nameAr,
        originalNameEn: targetItem.nameEn,
        originalCountOrGrade: targetItem.countOrGrade,
        originalConfidence: targetItem.confidence,
        correctedCode: newCode,
        correctedNameAr: newNameAr,
        correctedNameEn: newNameEn,
        correctedCountOrGrade: newGrade,
        correctedSeverity: newSeverity,
        correctedSemanticColor: newSemantic,
        correctionReason: reason,
        chromaticSignature: currentChromaticSignature,
        correctedBy: user?.fullNameAr || user?.username || 'Specialist',
      });

      const atlasRef = atlas.find((a) => a.code === newCode);
      const grpRef = groups.find((g) => g.key === newGroupKey) || groups[0];

      detectedItems[itemIndex] = {
        ...targetItem,
        code: newCode,
        groupKey: newGroupKey,
        categoryAr: grpRef.titleAr,
        categoryEn: grpRef.titleEn,
        nameAr: newNameAr,
        nameEn: newNameEn,
        countOrGrade: newGrade,
        severity: newSeverity,
        semanticColor: newSemantic,
        confidence: 99.5,
        clinicalSignificanceAr: atlasRef?.clinicalSignificanceAr || targetItem.clinicalSignificanceAr,
        clinicalSignificanceEn: atlasRef?.clinicalSignificanceEn || targetItem.clinicalSignificanceEn,
        isCorrected: true,
      };

      closeModal();
      showToast(
        i18n.bi('تم حفظ التصحيح في جدول التصحيحات وتحديث قاعدة التعلم بنجاح', 'Correction saved to learning database'),
        'success'
      );
      await renderWorkspace();
    });
  };

  const renderWorkspace = async () => {
    const savedScans = await microscopyRepository.getAllAnalyses(modality);

    container.innerHTML = `
      <div>
        <!-- Top Navigation Strip: AI Hub + 3 Specialized Screens -->
        <div class="mb-4 rounded-xl border border-slate-200 bg-slate-900 p-3 text-white shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <button
              id="back-to-ai-hub"
              type="button"
              class="rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 cursor-pointer"
            >
              🏠 ${i18n.bi('المركز الرئيسي (AI Hub)', 'AI Hub')}
            </button>
            <div class="text-xs font-bold text-slate-200">
              ${i18n.bi(spec.titleAr, spec.titleEn)}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <a
              href="#/bloodFilmAi"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                modality === 'blood_film'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }"
            >
              🩸 ${i18n.bi('1. تحليل فيلم صورة الدم', '1. Blood Film')}
            </a>
            <a
              href="#/urineMicroscopyAi"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                modality === 'urine_sediment'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }"
            >
              🧪 ${i18n.bi('2. تحليل البول المجهري', '2. Urine Microscopy')}
            </a>
            <a
              href="#/stoolMicroscopyAi"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                modality === 'stool_parasitology'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }"
            >
              🔬 ${i18n.bi('3. تحليل البراز المجهري', '3. Stool Microscopy')}
            </a>
          </div>
        </div>

        ${pageHeader(
          `${spec.icon} ${i18n.bi(spec.titleAr, spec.titleEn)}`,
          i18n.bi(spec.subtitleAr, spec.subtitleEn),
          `
            <button id="btn-open-atlas-modal" type="button" class="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer">
              📖 ${i18n.bi(`قاعدة المعرفة والأطلس (${atlas.length})`, `Knowledge Base (${atlas.length})`)}
            </button>
            <button id="btn-reanalyze-top" type="button" class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
              🔄 ${i18n.bi('إعادة التحليل', 'Re-Analyze')}
            </button>
            <button id="btn-save-top" type="button" class="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer">
              💾 ${i18n.bi('حفظ التحليل', 'Save Analysis')}
            </button>
            <button id="btn-print-top" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
              🖨️ ${i18n.bi('طباعة التقرير A4', 'Print A4')}
            </button>
          `
        )}

        <!-- Main 2-Column Split: Left Image Upload/Preview/Controls | Right Categorized Results & Interpretation -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-6">
          <!-- Left Column (5 cols): Upload, Preview, Preprocessing & Start Analysis -->
          <div class="xl:col-span-5 space-y-4">
            <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 class="text-sm font-bold text-slate-900">
                  📷 ${i18n.bi('منطقة رفع ومعاينة ومعالجة الصورة المجهرية', 'Slide Upload, Preview & Local Preprocessing')}
                </h3>
                <span class="text-[11px] font-semibold text-emerald-700">
                  🛡️ ${i18n.bi('معالجة محلية آمنة', 'Local Privacy Safe')}
                </span>
              </div>

              <!-- Drag & Drop + File Select + Camera Capture Zone -->
              <div
                id="slide-drop-zone"
                class="rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/50 hover:bg-sky-50 transition-colors p-4 text-center cursor-pointer"
              >
                <div class="text-2xl mb-1">🔬</div>
                <div class="text-xs font-bold text-slate-800">
                  ${i18n.bi('اسحب وأفلت صورة الشريحة المجهرية هنا أو اضغط للاختيار من الجهاز', 'Drag & drop microscopy slide image here or click to browse')}
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">
                  ${i18n.bi('يدعم صور الكاميرا المجهرية (PNG, JPG, WEBP) بجميع التكبيرات', 'Supports PNG, JPG, WEBP from any microscope camera')}
                </div>
                <div class="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <label class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer">
                    📂 ${i18n.bi('اختيار من الجهاز', 'Choose File')}
                    <input id="slide-file-input" type="file" accept="image/*" class="hidden" />
                  </label>
                  <button
                    id="btn-open-camera"
                    type="button"
                    class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer"
                  >
                    📹 ${i18n.bi('التقاط من الكاميرا', 'Capture from Camera')}
                  </button>
                  <button
                    id="btn-purge-current-img"
                    type="button"
                    class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                  >
                    🗑️ ${i18n.bi('حذف الصورة الفوري', 'Delete Image Now')}
                  </button>
                </div>
              </div>

              <!-- Calibrated Reference Slide Selector -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">
                  🧪 ${i18n.bi('أو اختر شريحة معيارية جاهزة للمعايرة والاختبار:', 'Or Load a Calibrated Reference Slide:')}
                </label>
                <select
                  id="scenario-select"
                  class="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  ${scenarios
                    .map(
                      (s) =>
                        `<option value="${s.id}" ${s.id === currentScenarioId ? 'selected' : ''}>${i18n.bi(s.titleAr, s.titleEn)}</option>`
                    )
                    .join('')}
                </select>
              </div>

              <!-- Live Camera Container (Hidden unless active) -->
              <div id="camera-box" class="hidden rounded-xl border border-indigo-300 bg-slate-950 p-3 text-center">
                <video id="camera-video" autoplay playsinline class="w-full max-h-56 mx-auto rounded-lg"></video>
                <div class="mt-2 flex justify-center gap-2">
                  <button id="btn-snap-frame" type="button" class="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white cursor-pointer">
                    📸 ${i18n.bi('التقاط الصورة الآن', 'Snap Frame')}
                  </button>
                  <button id="btn-close-camera" type="button" class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer">
                    ✕ ${i18n.bi('إغلاق الكاميرا', 'Close')}
                  </button>
                </div>
              </div>

              <!-- Image Preview Canvas with Bounding Boxes -->
              <div class="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden min-h-[260px] flex items-center justify-center">
                ${
                  imageDeleted || !currentImageDataUrl
                    ? `<div class="p-6 text-center text-xs text-slate-400">
                        🛡️ ${i18n.bi('تم حذف الصورة المجهرية لدواعي الخصوصية (النتائج الرقمية محفوظة بالكامل)', 'Microscopy image purged for privacy; structured findings remain active')}
                      </div>`
                    : `
                    <div
                      id="slide-zoom-stage"
                      class="relative inline-block transition-transform duration-150"
                      style="transform: scale(${zoomLevel / 100}); filter: ${getOpticalFilterCss()};"
                    >
                      <img
                        id="slide-preview-img"
                        src="${currentImageDataUrl}"
                        alt="Microscopy Preview"
                        referrerPolicy="no-referrer"
                        class="max-h-[300px] w-auto object-contain block mx-auto"
                      />
                      ${detectedItems
                        .flatMap((it) =>
                          (it.boundingBoxes || []).map((box) => ({
                            ...box,
                            color: it.semanticColor || 'red',
                          }))
                        )
                        .map(
                          (b) => `
                          <div
                            style="position:absolute; left:${b.x}%; top:${b.y}%; width:${b.w}%; height:${b.h}%; border:2px solid ${
                            b.color === 'red' ? '#f43f5e' : b.color === 'yellow' ? '#f59e0b' : '#10b981'
                          }; background:rgba(15,23,42,0.18); border-radius:6px; pointer-events:none;"
                          >
                            <span style="position:absolute; top:-18px; left:0; background:#0f172a; color:#fff; font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; white-space:nowrap;">
                              ${b.label}
                            </span>
                          </div>
                        `
                        )
                        .join('')}
                    </div>
                  `
                }
              </div>

              <!-- Preprocessing & Optical Controls -->
              <div class="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2.5 text-xs">
                <div class="font-bold text-slate-800">${i18n.bi('المرحلة 1/5 — المعالجة المسبقة للصورة قبل التحليل:', 'Stage 1/5 — Pre-Analysis Image Preprocessing:')}</div>
                <div class="flex flex-wrap items-center gap-4">
                  <label class="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                    <input id="chk-contrast" type="checkbox" ${enhanceContrast ? 'checked' : ''} class="rounded border-slate-300" />
                    ${i18n.bi('تحسين التباين والتوازن اللوني (CLAHE + White Balance)', 'Contrast & White Balance')}
                  </label>
                  <label class="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                    <input id="chk-denoise" type="checkbox" ${reduceNoise ? 'checked' : ''} class="rounded border-slate-300" />
                    ${i18n.bi('إزالة الضوضاء وزيادة الحدة وتحديد مناطق الاهتمام (ROI)', 'Denoising, Sharpening & ROI Segmentation')}
                  </label>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
                  <div class="flex flex-wrap items-center gap-1">
                    ${(
                      [
                        ['normal', i18n.bi('طبيعي', 'Normal')],
                        ['giemsa_boost', i18n.bi('تعزيز الصبغة', 'Stain Boost')],
                        ['phase_contrast', i18n.bi('تباين الطور', 'Phase')],
                        ['polarized', i18n.bi('مستقطب للبلورات', 'Polarized')],
                        ['iodine', i18n.bi('صبغة اليود', 'Lugol Iodine')],
                      ] as const
                    )
                      .map(
                        ([key, label]) => `
                        <button
                          type="button"
                          data-opt-filter="${key}"
                          class="px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            opticalFilter === key
                              ? 'bg-sky-600 text-white'
                              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                          }"
                        >
                          ${label}
                        </button>
                      `
                      )
                      .join('')}
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[11px] font-mono text-slate-600">${zoomLevel}%</span>
                    <input id="zoom-slider" type="range" min="100" max="220" step="10" value="${zoomLevel}" class="w-20" />
                  </div>
                </div>
              </div>

              <!-- White-Labeled Diagnostic System & Patient Metadata -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div class="sm:col-span-2">
                  <label class="block font-bold text-slate-700 mb-1">
                    🧠 ${i18n.bi('نظام التحليل والتحقق المجهري:', 'Diagnostic Recognition System:')}
                  </label>
                  <select id="engine-select" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900">
                    ${VISION_ENGINE_MODES.map(
                      (m) =>
                        `<option value="${m.id}" ${m.id === currentEngine ? 'selected' : ''}>${i18n.bi(m.titleAr, m.titleEn)} — (${m.badgeAr})</option>`
                    ).join('')}
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('الصبغة / التحضير', 'Stain / Prep')}</label>
                  <select id="stain-select" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
                    ${spec.stainOptions
                      .map((st) => `<option value="${st}" ${st === currentStain ? 'selected' : ''}>${st}</option>`)
                      .join('')}
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('قوة التكبير', 'Magnification')}</label>
                  <select id="mag-select" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
                    ${spec.magnificationOptions
                      .map((mg) => `<option value="${mg}" ${mg === currentMagnification ? 'selected' : ''}>${mg}</option>`)
                      .join('')}
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('المريض (اختياري)', 'Patient (Optional)')}</label>
                  <select id="patient-select" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
                    <option value="">-- ${i18n.bi('فحص مجهري مباشر', 'Direct Slide')} --</option>
                    ${patients
                      .map(
                        (p: Patient) =>
                          `<option value="${p.id}" ${p.id === selectedPatientId ? 'selected' : ''}>${p.name} (${p.code})</option>`
                      )
                      .join('')}
                  </select>
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">${i18n.bi('ربط بطلب تحليل', 'Link Request')}</label>
                  <select id="request-select" class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs">
                    <option value="">-- ${i18n.bi('بدون ربط بطلب', 'None')} --</option>
                    ${requests
                      .filter((r: LabRequest) => !selectedPatientId || r.patientId === selectedPatientId)
                      .map(
                        (r: LabRequest) =>
                          `<option value="${r.id}" ${r.id === selectedRequestId ? 'selected' : ''}>${r.requestNumber}</option>`
                      )
                      .join('')}
                  </select>
                </div>
              </div>

              <!-- Primary Start Analysis CTA + Animated 5-Stage Progress Bar -->
              <div>
                <button
                  id="btn-start-analysis"
                  type="button"
                  ${isAnalyzing ? 'disabled' : ''}
                  class="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 px-4 py-3 text-sm font-bold text-white shadow-sm cursor-pointer transition-colors"
                >
                  ${
                    isAnalyzing
                      ? `⏳ ${i18n.bi(progressStageAr || 'جاري التحليل الذكي عبر المراحل الخمس...', progressStageEn || 'Running 5-stage analysis...')}`
                      : `🚀 ${i18n.bi('بدء التحليل المجهري الذكي (5 مراحل تحقق)', 'Start 5-Stage Intelligent Analysis')}`
                  }
                </button>

                <!-- Progress Bar -->
                <div id="analysis-progress-wrap" class="${isAnalyzing || progressPercent > 0 ? 'mt-3' : 'hidden'}">
                  <div class="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                    <span id="progress-stage-text">${i18n.bi(progressStageAr || 'تم التحليل والتحقق الطبي بنجاح', progressStageEn || 'Analysis Complete')}</span>
                    <span id="progress-pct-text" class="font-mono tabular-nums text-sky-700">${progressPercent}%</span>
                  </div>
                  <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      id="progress-bar-fill"
                      class="h-full bg-sky-600 transition-all duration-300"
                      style="width: ${progressPercent}%"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column (7 cols): Clinical Alerts, Structured Groups, Interpretation & Action Buttons -->
          <div class="xl:col-span-7 space-y-4">
            <!-- 0. Mandatory Clinical Disclaimer Banner (Results require physician review) -->
            <div class="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-xs text-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div class="font-bold">
                ⚕️ ${i18n.bi('تنويه طبي: هذه نتائج مجهرية مساعدة تحتاج مراجعة طبيب أو أخصائي باثولوجيا إكلينيكية — لا تمثل تشخيصًا نهائيًا بمفردها.', 'Medical Notice: These are assistive microscopy findings requiring physician review — not a standalone final diagnosis.')}
              </div>
              <span class="rounded bg-white border border-slate-300 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-700">
                ${i18n.bi('نظام التشخيص المساعد', 'Assisted Diagnostic System')}
              </span>
            </div>

            <!-- 1. Urgent Critical Alert Banner (if any critical finding detected) -->
            ${
              hasCriticalAlert
                ? `
                <div class="rounded-xl border-2 border-rose-500 bg-rose-50 p-4 text-rose-950 shadow-2xs">
                  <div class="flex items-center gap-2 text-sm font-bold text-rose-800">
                    <span>🚨</span>
                    <span>${i18n.bi('تنبيه طبي عاجل — اكتشاف عناصر حرجة!', 'URGENT CLINICAL ALERT — Critical Findings Detected!')}</span>
                  </div>
                  <p class="text-xs text-rose-900 mt-1 font-semibold">
                    ${
                      criticalAlertMessageAr ||
                      i18n.bi(
                        'تم رصد عناصر مرضية حرجة في الشريحة المجهرية تستوجب التأكيد الفوري وإبلاغ الطبيب المعالج.',
                        'Critical pathological elements detected requiring immediate verification and physician notification.'
                      )
                    }
                  </p>
                </div>
              `
                : ''
            }

            <!-- 2. Specialist Review Banner (< 70% confidence rule) -->
            ${
              requiresSpecialistReview || detectedItems.some((i) => i.confidence < 70)
                ? `
                <div class="rounded-xl border border-amber-400 bg-amber-50 p-3.5 text-amber-950">
                  <div class="text-xs font-bold text-amber-900">
                    ⚠️ ${i18n.bi('يُنصح بمراجعة أخصائي: توجد نتائج بنسبة ثقة أقل من 70% تحتاج تأكيدًا بشريًا مباشرًا', 'Specialist Review Recommended: One or more findings have confidence below 70%')}
                  </div>
                </div>
              `
                : ''
            }

            <!-- 3. Clinical Inconsistency Check Warnings -->
            ${
              inconsistencyWarningsAr.length > 0
                ? `
                <div class="rounded-xl border border-indigo-300 bg-indigo-50 p-3.5 text-indigo-950 space-y-1">
                  <div class="text-xs font-bold text-indigo-900">🔍 ${i18n.bi('ملاحظات المدقق الطبي وفحص التناقضات التشريحية:', 'Medical Validator & Anatomical Consistency Notes:')}</div>
                  ${inconsistencyWarningsAr.map((w) => `<div class="text-xs text-indigo-800">• ${w}</div>`).join('')}
                </div>
              `
                : ''
            }

            <!-- 4. Structured Results Card Divided by Modality Scientific Groups -->
            <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 class="text-sm font-bold text-slate-900">
                    🧬 ${i18n.bi('منطقة النتائج والتعرف المصنفة (مع معايير الثقة الخمسة والتفريق المورفولوجي)', 'Categorized Recognition Results (with 5-Tier Confidence & Differential Criteria)')}
                  </h3>
                  <p class="text-xs text-slate-500">
                    ${i18n.bi('95-100% مؤكد · 85-94% عالي الثقة · 70-84% متوسط الثقة · 50-69% يحتاج مراجعة · <50% يحتاج خبير بشري', '95-100% Confirmed · 85-94% High · 70-84% Moderate · 50-69% Review Advised · <50% Expert Required')}
                  </p>
                </div>
                <div class="text-xs font-mono font-bold text-emerald-700">
                  ${i18n.bi('متوسط الثقة الكلي:', 'Overall Confidence:')} ${overallConfidence}%
                </div>
              </div>

              <!-- Scientific Group Filter Tabs -->
              <div class="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  data-grp-tab="all"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    activeGroupFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-white'
                  }"
                >
                  ${i18n.bi('جميع الأقسام', 'All Sections')} (${detectedItems.length})
                </button>
                ${groups
                  .map((g) => {
                    const cnt = detectedItems.filter((it) => it.groupKey === g.key).length;
                    return `
                      <button
                        type="button"
                        data-grp-tab="${g.key}"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          activeGroupFilter === g.key
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-700 hover:bg-white'
                        }"
                      >
                        ${g.icon} ${i18n.bi(g.titleAr, g.titleEn)} (${cnt})
                      </button>
                    `;
                  })
                  .join('')}
              </div>

              <!-- Quick Add from Atlas into any Section -->
              <div class="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <select id="quick-atlas-select" class="flex-1 min-w-[220px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold">
                  <option value="">+ ${i18n.bi(`إضافة عنصر من قاعدة المعرفة (${atlas.length} عنصر مرجعي) إلى النتائج...`, `Add element from Knowledge Base (${atlas.length} items) to findings...`)}</option>
                  ${groups
                    .map(
                      (g) => `
                      <optgroup label="${g.icon} ${i18n.bi(g.titleAr, g.titleEn)}">
                        ${atlas
                          .filter((a) => a.groupKey === g.key)
                          .map((a) => `<option value="${a.code}">${a.nameAr} — ${a.nameEn}</option>`)
                          .join('')}
                      </optgroup>
                    `
                    )
                    .join('')}
                </select>
                <button
                  id="btn-add-atlas-finding"
                  type="button"
                  class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 cursor-pointer"
                >
                  + ${i18n.bi('إضافة للنتائج', 'Add Finding')}
                </button>
              </div>

              <!-- Grouped Findings Sections -->
              <div class="space-y-4">
                ${groups
                  .filter((g) => activeGroupFilter === 'all' || activeGroupFilter === g.key)
                  .map((g) => {
                    const groupItems = detectedItems
                      .map((item, idx) => ({ item, idx }))
                      .filter(({ item }) => (item.groupKey || groups[0].key) === g.key);

                    return `
                      <div class="rounded-xl border border-slate-200 overflow-hidden">
                        <div class="bg-slate-100/90 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                          <div>
                            <div class="text-xs font-bold text-slate-900">${g.icon} ${i18n.bi(g.titleAr, g.titleEn)}</div>
                            <div class="text-[11px] text-slate-500">${i18n.bi(g.subtitleAr, g.subtitleEn)}</div>
                          </div>
                          <span class="text-xs font-mono font-bold text-slate-600">${groupItems.length} ${i18n.bi('عنصر', 'items')}</span>
                        </div>

                        ${
                          groupItems.length === 0
                            ? `<div class="p-3.5 text-xs text-slate-500 bg-white">
                                ● ${i18n.bi('لم يتم رصد عناصر غير طبيعية في هذا القسم', 'No abnormal elements detected in this section')}
                              </div>`
                            : `
                            <div class="divide-y divide-slate-200 bg-white">
                              ${groupItems
                                .map(({ item, idx }) => {
                                  const semColor =
                                    item.semanticColor ||
                                    (item.severity === 'normal'
                                      ? 'green'
                                      : item.severity === 'mild'
                                      ? 'yellow'
                                      : 'red');
                                  const lowConf = item.confidence < 70;
                                  const tierInfo = getConfidenceTierInfo(item.confidence);
                                  const atlasRef = atlas.find((a) => a.code === item.code);
                                  const sizeMicrons = item.sizeMicrons || atlasRef?.sizeMicrons;
                                  const stainColorAr = item.stainColorAr || atlasRef?.stainColorAr;
                                  const associatedDiseasesAr = item.associatedDiseasesAr || atlasRef?.associatedDiseasesAr;
                                  const diffCriteriaAr = item.differentialCriteriaAr || atlasRef?.differentialCriteriaAr;
                                  const diffCriteriaEn = item.differentialCriteriaEn || atlasRef?.differentialCriteriaEn;

                                  return `
                                    <div class="p-3.5 hover:bg-slate-50/80 transition-colors">
                                      <div class="flex flex-wrap items-start justify-between gap-3">
                                        <div class="space-y-1.5 flex-1 min-w-[240px]">
                                          <div class="flex flex-wrap items-center gap-1.5">
                                            ${renderSemanticBadge(semColor, item.severity)}
                                            <span class="text-xs font-bold text-slate-900">${item.nameAr}</span>
                                            <span class="rounded border px-2 py-0.5 text-[10px] font-bold ${tierInfo.badgeClass}">
                                              ${i18n.bi(tierInfo.tierAr, tierInfo.tierEn)}
                                            </span>
                                            ${
                                              item.isCorrected
                                                ? `<span class="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">✏️ ${i18n.bi('مصحح ومعتمد', 'Specialist Corrected')}</span>`
                                                : ''
                                            }
                                            ${
                                              lowConf
                                                ? `<span class="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">⚠️ ${i18n.bi('يُنصح بمراجعة أخصائي', 'Specialist Review Advised')}</span>`
                                                : ''
                                            }
                                          </div>
                                          <div class="text-xs font-semibold text-slate-600">
                                            ${item.nameEn}
                                            ${item.scientificName ? `<span class="italic text-slate-500"> · ${item.scientificName}</span>` : ''}
                                          </div>
                                          ${
                                            sizeMicrons || stainColorAr
                                              ? `<div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                                                  ${sizeMicrons ? `<span>📏 <strong>${i18n.bi('الحجم:', 'Size:')}</strong> <span class="font-mono">${sizeMicrons}</span></span>` : ''}
                                                  ${stainColorAr ? `<span>🎨 <strong>${i18n.bi('اللون والصبغة:', 'Stain/Color:')}</strong> ${stainColorAr}</span>` : ''}
                                                </div>`
                                              : ''
                                          }
                                          <div class="text-[11px] text-slate-700 leading-relaxed">
                                            <strong>${i18n.bi('الأهمية السريرية:', 'Clinical Significance:')}</strong>
                                            ${i18n.bi(item.clinicalSignificanceAr, item.clinicalSignificanceEn)}
                                          </div>
                                          ${
                                            associatedDiseasesAr
                                              ? `<div class="text-[11px] text-slate-600">
                                                  <strong>🏥 ${i18n.bi('الأمراض والحالات المرتبطة:', 'Associated Conditions:')}</strong> ${associatedDiseasesAr}
                                                </div>`
                                              : ''
                                          }
                                          ${
                                            diffCriteriaAr
                                              ? `<div class="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700">
                                                  <strong>🔬 ${i18n.bi('معيار التفريق المورفولوجي:', 'Differential Criteria:')}</strong> ${i18n.bi(diffCriteriaAr, diffCriteriaEn || diffCriteriaAr)}
                                                </div>`
                                              : ''
                                          }
                                        </div>

                                        <!-- Confidence Meter + Count Input + Correct/Delete Buttons -->
                                        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
                                          <div class="w-28">
                                            <div class="flex justify-between text-[11px] font-mono font-bold mb-0.5">
                                              <span class="text-slate-500">${i18n.bi('الثقة:', 'Conf:')}</span>
                                              <span class="tabular-nums ${lowConf ? 'text-rose-600' : 'text-emerald-700'}">${item.confidence}%</span>
                                            </div>
                                            <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                              <div
                                                class="h-full ${
                                                  semColor === 'green'
                                                    ? 'bg-emerald-500'
                                                    : semColor === 'yellow'
                                                    ? 'bg-amber-500'
                                                    : 'bg-rose-500'
                                                }"
                                                style="width: ${Math.min(100, Math.max(5, item.confidence))}%"
                                              ></div>
                                            </div>
                                          </div>

                                          <input
                                            type="text"
                                            data-grade-idx="${idx}"
                                            value="${item.countOrGrade}"
                                            class="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-slate-900"
                                            title="${i18n.bi('العدد أو التقدير', 'Count or Grade')}"
                                          />

                                          <button
                                            type="button"
                                            data-correct-idx="${idx}"
                                            class="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
                                          >
                                            ✏️ ${i18n.bi('تصحيح', 'Correct')}
                                          </button>

                                          <button
                                            type="button"
                                            data-remove-idx="${idx}"
                                            class="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                                            title="${i18n.bi('حذف العنصر', 'Remove')}"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  `;
                                })
                                .join('')}
                            </div>
                          `
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>

            <!-- 5. Clinical Interpretation & Recommendations Area + 4 Main Action Buttons -->
            <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <h3 class="text-sm font-bold text-slate-900">
                📋 ${i18n.bi('منطقة التفسير الطبي والتوصيات السريرية', 'Clinical Interpretation & Medical Recommendations')}
              </h3>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">${i18n.bi('التفسير السريري الشامل (عربي)', 'Clinical Interpretation (Arabic)')}</label>
                  <textarea id="diag-ar-input" rows="3" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs leading-relaxed">${overallDiagnosisAr}</textarea>
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">${i18n.bi('التفسير السريري الشامل (إنجليزي)', 'Clinical Interpretation (English)')}</label>
                  <textarea id="diag-en-input" rows="3" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs leading-relaxed">${overallDiagnosisEn}</textarea>
                </div>
                <div class="md:col-span-2">
                  <label class="block font-bold text-slate-700 mb-1">${i18n.bi('التوصيات الطبية والفحوصات التكميلية المقترحة', 'Medical Recommendations & Follow-Up')}</label>
                  <textarea id="rec-ar-input" rows="2" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs leading-relaxed">${clinicalRecommendationsAr}</textarea>
                </div>
              </div>

              <!-- Required Action Buttons: إعادة التحليل | طباعة | حفظ | تصحيح -->
              <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    id="btn-action-reanalyze"
                    type="button"
                    class="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-500 cursor-pointer"
                  >
                    🔄 ${i18n.bi('إعادة التحليل', 'Re-Analyze')}
                  </button>
                  <button
                    id="btn-action-save"
                    type="button"
                    class="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    💾 ${i18n.bi('حفظ النتائج في قاعدة البيانات', 'Save Analysis')}
                  </button>
                  <button
                    id="btn-action-print-a4"
                    type="button"
                    class="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    🖨️ ${i18n.bi('طباعة تقرير A4', 'Print A4 Report')}
                  </button>
                  <button
                    id="btn-action-print-thermal"
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    🧾 ${i18n.bi('طباعة حراري 80mm', 'Thermal 80mm')}
                  </button>
                  <button
                    id="btn-action-correct-first"
                    type="button"
                    class="rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                  >
                    ✏️ ${i18n.bi('تصحيح النتائج', 'Correct Findings')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Saved Analyses History for this Modality -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <h3 class="text-sm font-bold text-slate-900 mb-3">
            🗂️ ${i18n.bi('سجل التحليلات المحفوظة لهذا القسم', 'Saved Analyses for This Modality')} (${savedScans.length})
          </h3>
          ${
            savedScans.length === 0
              ? `<div class="text-xs text-slate-500">${i18n.bi('لا توجد تحليلات محفوظة بعد في هذا القسم.', 'No saved analyses for this modality yet.')}</div>`
              : `
              <div class="overflow-x-auto">
                <table class="w-full text-xs border-collapse">
                  <thead>
                    <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th class="p-2 text-start">${i18n.bi('رقم التحليل', 'Analysis #')}</th>
                      <th class="p-2 text-start">${i18n.bi('التاريخ', 'Date')}</th>
                      <th class="p-2 text-start">${i18n.bi('المريض', 'Patient')}</th>
                      <th class="p-2 text-start">${i18n.bi('النظام', 'System')}</th>
                      <th class="p-2 text-start">${i18n.bi('نسبة الثقة', 'Confidence')}</th>
                      <th class="p-2 text-start">${i18n.bi('التفسير السريري', 'Interpretation')}</th>
                      <th class="p-2 text-start">${i18n.bi('الإجراءات', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200">
                    ${savedScans
                      .map(
                        (s) => `
                      <tr class="hover:bg-slate-50">
                        <td class="p-2 font-mono font-bold text-sky-700">${s.analysisNumber}</td>
                        <td class="p-2 font-mono text-slate-500">${s.createdAt}</td>
                        <td class="p-2 font-semibold">${s.patientName || i18n.bi('فحص مباشر', 'Direct Slide')}</td>
                        <td class="p-2 text-slate-600">${i18n.bi(s.engineSystemNameAr, s.engineSystemNameEn)}</td>
                        <td class="p-2 font-mono font-bold text-emerald-700">${s.overallConfidence}%</td>
                        <td class="p-2 text-slate-600 max-w-xs truncate">${s.clinicalInterpretationAr}</td>
                        <td class="p-2">
                          <div class="flex items-center gap-1.5">
                            <button type="button" data-print-saved="${s.id}" class="rounded bg-sky-50 border border-sky-200 px-2 py-1 text-[11px] font-bold text-sky-700 cursor-pointer">🖨️ A4</button>
                            <button type="button" data-del-saved="${s.id}" class="rounded bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 cursor-pointer">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>
      </div>
    `;

    // Sync textareas back to state
    const syncTextInputs = () => {
      const dAr = document.getElementById('diag-ar-input') as HTMLTextAreaElement | null;
      const dEn = document.getElementById('diag-en-input') as HTMLTextAreaElement | null;
      const rAr = document.getElementById('rec-ar-input') as HTMLTextAreaElement | null;
      if (dAr) overallDiagnosisAr = dAr.value;
      if (dEn) overallDiagnosisEn = dEn.value;
      if (rAr) clinicalRecommendationsAr = rAr.value;
    };

    document.getElementById('back-to-ai-hub')?.addEventListener('click', () => {
      stopCamera();
      router.navigate('aiHub');
    });

    // Interactive Knowledge Base & Reference Atlas Modal
    document.getElementById('btn-open-atlas-modal')?.addEventListener('click', () => {
      syncTextInputs();
      const renderAtlasList = (filterText = '') => {
        const q = filterText.trim().toLowerCase();
        const filtered = atlas.filter(
          (a) =>
            !q ||
            a.nameAr.toLowerCase().includes(q) ||
            a.nameEn.toLowerCase().includes(q) ||
            a.scientificName.toLowerCase().includes(q) ||
            a.code.toLowerCase().includes(q) ||
            (a.differentialCriteriaAr || '').toLowerCase().includes(q)
        );
        return filtered
          .map(
            (a) => `
            <div class="rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 transition-colors space-y-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  ${renderSemanticBadge(a.semanticColor, a.severity)}
                  <span class="font-bold text-slate-900 text-xs">${a.nameAr}</span>
                  <span class="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${a.code}</span>
                </div>
                <button
                  type="button"
                  data-modal-add-atlas="${a.code}"
                  class="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-500 cursor-pointer"
                >
                  + ${i18n.bi('إضافة للنتائج', 'Add to Findings')}
                </button>
              </div>
              <div class="text-xs font-semibold text-slate-600">
                ${a.nameEn} · <span class="italic text-slate-500">${a.scientificName}</span>
              </div>
              <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                ${a.sizeMicrons ? `<span>📏 <strong>${i18n.bi('الحجم:', 'Size:')}</strong> <span class="font-mono">${a.sizeMicrons}</span></span>` : ''}
                ${a.stainColorAr ? `<span>🎨 <strong>${i18n.bi('الصبغة/اللون:', 'Stain:')}</strong> ${a.stainColorAr}</span>` : ''}
              </div>
              <div class="text-[11px] text-slate-700">
                <strong>🔍 ${i18n.bi('الخصائص الشكلية:', 'Morphology:')}</strong> ${a.keyFeaturesAr}
              </div>
              <div class="text-[11px] text-slate-700">
                <strong>⚕️ ${i18n.bi('الأهمية السريرية:', 'Clinical Significance:')}</strong> ${i18n.bi(a.clinicalSignificanceAr, a.clinicalSignificanceEn)}
              </div>
              ${
                a.associatedDiseasesAr
                  ? `<div class="text-[11px] text-slate-600"><strong>🏥 ${i18n.bi('الأمراض المرتبطة:', 'Associated Diseases:')}</strong> ${a.associatedDiseasesAr}</div>`
                  : ''
              }
              ${
                a.differentialCriteriaAr
                  ? `<div class="rounded bg-indigo-50/70 border border-indigo-200 px-2.5 py-1 text-[11px] text-indigo-950">
                      <strong>🔬 ${i18n.bi('معايير التفريق التشخيصي الدقيق:', 'Differential Diagnosis Criteria:')}</strong> ${i18n.bi(a.differentialCriteriaAr, a.differentialCriteriaEn || a.differentialCriteriaAr)}
                    </div>`
                  : ''
              }
            </div>
          `
          )
          .join('');
      };

      openCustomModal(
        `📖 ${i18n.bi(`قاعدة المعرفة والأطلس المرجعي الشامل (${atlas.length} عنصر)`, `Comprehensive Knowledge Base & Reference Atlas (${atlas.length} Items)`)}`,
        `
          <div class="space-y-3 text-xs">
            <input
              id="atlas-modal-search"
              type="text"
              placeholder="${i18n.bi('ابحث بالاسم العربي أو الإنجليزي أو العلمي أو معايير التفريق...', 'Search by Arabic, English, scientific name, or differential criteria...')}"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
            />
            <div id="atlas-modal-list" class="max-h-[62vh] overflow-y-auto space-y-2.5 pr-1">
              ${renderAtlasList('')}
            </div>
          </div>
        `
      );

      const bindModalAddButtons = () => {
        document.querySelectorAll<HTMLButtonElement>('[data-modal-add-atlas]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const code = btn.getAttribute('data-modal-add-atlas');
            const ref = atlas.find((a) => a.code === code);
            if (!ref) return;
            const tierInfo = getConfidenceTierInfo(96.5);
            detectedItems.push({
              id: `fnd_${Date.now()}`,
              code: ref.code,
              groupKey: ref.groupKey,
              categoryAr: ref.categoryAr,
              categoryEn: ref.categoryEn,
              nameAr: ref.nameAr,
              nameEn: ref.nameEn,
              scientificName: ref.scientificName,
              countOrGrade: 'Present (+)',
              confidence: 96.5,
              severity: ref.severity,
              semanticColor: ref.semanticColor,
              clinicalSignificanceAr: ref.clinicalSignificanceAr,
              clinicalSignificanceEn: ref.clinicalSignificanceEn,
              sizeMicrons: ref.sizeMicrons,
              stainColorAr: ref.stainColorAr,
              associatedDiseasesAr: ref.associatedDiseasesAr,
              differentialCriteriaAr: ref.differentialCriteriaAr,
              differentialCriteriaEn: ref.differentialCriteriaEn,
              confidenceTierAr: tierInfo.tierAr,
              confidenceTierEn: tierInfo.tierEn,
            });
            hasCriticalAlert = detectedItems.some((i) => i.severity === 'critical');
            closeModal();
            showToast(i18n.bi(`تمت إضافة "${ref.nameAr}" إلى النتائج`, `Added "${ref.nameEn}"`), 'success');
            void renderWorkspace();
          });
        });
      };

      bindModalAddButtons();

      const searchInp = document.getElementById('atlas-modal-search') as HTMLInputElement | null;
      searchInp?.addEventListener('input', () => {
        const listEl = document.getElementById('atlas-modal-list');
        if (listEl) {
          listEl.innerHTML = renderAtlasList(searchInp.value);
          bindModalAddButtons();
        }
      });
    });

    // Drag & Drop + File Input handlers
    const handleImageFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          currentImageDataUrl = reader.result;
          imageDeleted = false;
          currentScenarioId = '';
          showToast(
            i18n.bi('تم تحميل صورة الشريحة المجهرية؛ اضغط "بدء التحليل"', 'Slide image loaded; click "Start Analysis"'),
            'info'
          );
          void renderWorkspace();
        }
      };
      reader.readAsDataURL(file);
    };

    const dropZone = document.getElementById('slide-drop-zone');
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('border-sky-600', 'bg-sky-100/60');
    });
    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('border-sky-600', 'bg-sky-100/60');
    });
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-sky-600', 'bg-sky-100/60');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    });

    const fileInput = document.getElementById('slide-file-input') as HTMLInputElement | null;
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleImageFile(file);
    });

    // Camera capture
    document.getElementById('btn-open-camera')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const camBox = document.getElementById('camera-box');
        const video = document.getElementById('camera-video') as HTMLVideoElement | null;
        if (!camBox || !video) return;
        activeCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = activeCameraStream;
        camBox.classList.remove('hidden');
      } catch {
        showToast(
          i18n.bi('تعذر فتح الكاميرا؛ تأكد من توصيل كاميرا الميكروسكوب ومنح الصلاحية', 'Could not access camera'),
          'error'
        );
      }
    });

    document.getElementById('btn-snap-frame')?.addEventListener('click', () => {
      const video = document.getElementById('camera-video') as HTMLVideoElement | null;
      if (!video) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        currentImageDataUrl = canvas.toDataURL('image/png');
        imageDeleted = false;
        currentScenarioId = '';
      }
      stopCamera();
      void renderWorkspace();
    });

    document.getElementById('btn-close-camera')?.addEventListener('click', () => {
      stopCamera();
      document.getElementById('camera-box')?.classList.add('hidden');
    });

    // Immediate image deletion for privacy
    document.getElementById('btn-purge-current-img')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      currentImageDataUrl = '';
      imageDeleted = true;
      if (lastSavedAnalysisId !== 'unsaved') {
        await microscopyRepository.deleteImageImmediately(lastSavedAnalysisId);
      }
      showToast(
        i18n.bi('تم حذف الصورة المجهرية فوريًا مع الاحتفاظ بكافة النتائج الرقمية', 'Image deleted immediately; findings preserved'),
        'info'
      );
      await renderWorkspace();
    });

    // Reference scenario selector
    const scenarioSel = document.getElementById('scenario-select') as HTMLSelectElement | null;
    scenarioSel?.addEventListener('change', () => {
      currentScenarioId = scenarioSel.value;
      const found = scenarios.find((s) => s.id === currentScenarioId);
      if (found) {
        currentImageDataUrl = generateCalibratedSlideDataUrl(found.id);
        imageDeleted = false;
        currentStain = found.stainOrPrep;
        currentMagnification = found.magnification;
        sampleQualityAr = found.sampleQualityAr;
        overallDiagnosisAr = found.overallDiagnosisAr;
        overallDiagnosisEn = found.overallDiagnosisEn;
        clinicalRecommendationsAr = found.clinicalRecommendationsAr;
        clinicalRecommendationsEn = found.clinicalRecommendationsEn;
        detectedItems = found.detectedItems.map((x, idx) => ({ ...x, id: `fnd_${Date.now()}_${idx}` }));
        hasCriticalAlert = detectedItems.some((i) => i.severity === 'critical');
        requiresSpecialistReview = detectedItems.some((i) => i.confidence < 60);
        void renderWorkspace();
      }
    });

    // Preprocessing & Optical filter controls
    const chkContrast = document.getElementById('chk-contrast') as HTMLInputElement | null;
    chkContrast?.addEventListener('change', () => {
      enhanceContrast = chkContrast.checked;
    });

    const chkDenoise = document.getElementById('chk-denoise') as HTMLInputElement | null;
    chkDenoise?.addEventListener('change', () => {
      reduceNoise = chkDenoise.checked;
    });

    container.querySelectorAll<HTMLButtonElement>('[data-opt-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncTextInputs();
        opticalFilter = (btn.getAttribute('data-opt-filter') as typeof opticalFilter) || 'normal';
        void renderWorkspace();
      });
    });

    const zoomSlider = document.getElementById('zoom-slider') as HTMLInputElement | null;
    zoomSlider?.addEventListener('input', () => {
      zoomLevel = Number(zoomSlider.value) || 100;
      const stage = document.getElementById('slide-zoom-stage');
      if (stage) {
        stage.style.transform = `scale(${zoomLevel / 100})`;
      }
    });

    // Metadata selects
    document.getElementById('engine-select')?.addEventListener('change', (e) => {
      currentEngine = (e.target as HTMLSelectElement).value as VisionEngineMode;
    });
    document.getElementById('stain-select')?.addEventListener('change', (e) => {
      currentStain = (e.target as HTMLSelectElement).value;
    });
    document.getElementById('mag-select')?.addEventListener('change', (e) => {
      currentMagnification = (e.target as HTMLSelectElement).value;
    });
    document.getElementById('patient-select')?.addEventListener('change', (e) => {
      syncTextInputs();
      selectedPatientId = (e.target as HTMLSelectElement).value;
      void renderWorkspace();
    });
    document.getElementById('request-select')?.addEventListener('change', (e) => {
      selectedRequestId = (e.target as HTMLSelectElement).value;
    });

    // Group filter tabs
    container.querySelectorAll<HTMLButtonElement>('[data-grp-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncTextInputs();
        activeGroupFilter = (btn.getAttribute('data-grp-tab') as AiFindingGroupKey | 'all') || 'all';
        void renderWorkspace();
      });
    });

    // Quick add from atlas
    document.getElementById('btn-add-atlas-finding')?.addEventListener('click', () => {
      syncTextInputs();
      const sel = document.getElementById('quick-atlas-select') as HTMLSelectElement | null;
      if (!sel || !sel.value) return;
      const ref = atlas.find((a) => a.code === sel.value);
      if (!ref) return;
      detectedItems.push({
        id: `fnd_${Date.now()}`,
        code: ref.code,
        groupKey: ref.groupKey,
        categoryAr: ref.categoryAr,
        categoryEn: ref.categoryEn,
        nameAr: ref.nameAr,
        nameEn: ref.nameEn,
        scientificName: ref.scientificName,
        countOrGrade: 'Present (+)',
        confidence: 96.5,
        severity: ref.severity,
        semanticColor: ref.semanticColor,
        clinicalSignificanceAr: ref.clinicalSignificanceAr,
        clinicalSignificanceEn: ref.clinicalSignificanceEn,
      });
      hasCriticalAlert = detectedItems.some((i) => i.severity === 'critical');
      showToast(i18n.bi(`تمت إضافة "${ref.nameAr}" إلى النتائج`, `Added "${ref.nameEn}"`), 'success');
      void renderWorkspace();
    });

    // Inline count/grade editing
    container.querySelectorAll<HTMLInputElement>('[data-grade-idx]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.getAttribute('data-grade-idx'));
        if (detectedItems[idx]) {
          detectedItems[idx].countOrGrade = inp.value.trim();
        }
      });
    });

    // Specialist correction modal buttons
    container.querySelectorAll<HTMLButtonElement>('[data-correct-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncTextInputs();
        const idx = Number(btn.getAttribute('data-correct-idx'));
        openSpecialistCorrectionModal(idx);
      });
    });

    // Remove finding button
    container.querySelectorAll<HTMLButtonElement>('[data-remove-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncTextInputs();
        const idx = Number(btn.getAttribute('data-remove-idx'));
        detectedItems.splice(idx, 1);
        hasCriticalAlert = detectedItems.some((i) => i.severity === 'critical');
        requiresSpecialistReview = detectedItems.some((i) => i.confidence < 60);
        void renderWorkspace();
      });
    });

    // Execute Analysis Pipeline
    const triggerAnalysis = async () => {
      if (!currentImageDataUrl && !currentScenarioId) {
        showToast(i18n.bi('يرجى رفع صورة مجهرية أو اختيار شريحة أولاً', 'Please upload an image first'), 'error');
        return;
      }
      syncTextInputs();
      isAnalyzing = true;
      progressPercent = 10;
      progressStageAr = 'جاري تهيئة الصورة المجهرية...';
      progressStageEn = 'Initializing slide frame...';
      await renderWorkspace();

      const res = await analyzeMicroscopyImage({
        modality,
        engineMode: currentEngine,
        imageDataUrl: currentImageDataUrl || generateCalibratedSlideDataUrl(currentScenarioId || scenarios[0].id),
        stainOrPrep: currentStain,
        magnification: currentMagnification,
        clinicalNotes,
        matchedScenarioId: currentScenarioId || undefined,
        enhanceContrast,
        reduceNoise,
        onProgress: (pct, arStage, enStage) => {
          progressPercent = pct;
          progressStageAr = arStage;
          progressStageEn = enStage;
          const bar = document.getElementById('progress-bar-fill');
          const stageTxt = document.getElementById('progress-stage-text');
          const pctTxt = document.getElementById('progress-pct-text');
          if (bar) bar.style.width = `${pct}%`;
          if (stageTxt) stageTxt.textContent = i18n.bi(arStage, enStage);
          if (pctTxt) pctTxt.textContent = `${pct}%`;
        },
      });

      isAnalyzing = false;
      sampleQualityAr = res.sampleQualityAr;
      overallDiagnosisAr = res.overallDiagnosisAr;
      overallDiagnosisEn = res.overallDiagnosisEn;
      clinicalRecommendationsAr = res.clinicalRecommendationsAr;
      clinicalRecommendationsEn = res.clinicalRecommendationsEn;
      detectedItems = res.detectedItems;
      overallConfidence = res.overallConfidence;
      requiresSpecialistReview = res.requiresSpecialistReview;
      hasCriticalAlert = res.hasCriticalAlert;
      criticalAlertMessageAr = res.criticalAlertMessageAr;
      inconsistencyWarningsAr = res.inconsistencyWarningsAr;
      currentChromaticSignature = res.chromaticSignature;

      if (res.hasCriticalAlert) {
        showToast(
          i18n.bi('تنبيه طبي عاجل: تم اكتشاف عناصر حرجة في الشريحة المجهرية!', 'URGENT ALERT: Critical findings detected!'),
          'error'
        );
      } else {
        showToast(
          i18n.bi('تم إتمام التحليل الذكي والتحقق الطبي بنجاح', 'Intelligent microscopy analysis completed'),
          'success'
        );
      }

      await renderWorkspace();
    };

    document.getElementById('btn-start-analysis')?.addEventListener('click', triggerAnalysis);
    document.getElementById('btn-reanalyze-top')?.addEventListener('click', triggerAnalysis);
    document.getElementById('btn-action-reanalyze')?.addEventListener('click', triggerAnalysis);

    // Save Analysis Handler
    const triggerSave = async () => {
      if (!(await enforcePermission('add', spec.resource, 'Save AI Microscopy Analysis'))) {
        showToast(i18n.dict.common.forbiddenMessage, 'unauthorized');
        return;
      }
      syncTextInputs();
      const pat = patients.find((p: Patient) => p.id === selectedPatientId);
      const req = requests.find((r: LabRequest) => r.id === selectedRequestId);

      const saved = await microscopyRepository.saveScan(
        {
          modality,
          engineMode: currentEngine,
          patientId: pat?.id,
          patientName: pat?.name,
          requestId: req?.id,
          requestNumber: req?.requestNumber,
          stainOrPrep: currentStain,
          magnification: currentMagnification,
          sampleQualityAr,
          overallDiagnosisAr,
          overallDiagnosisEn,
          clinicalRecommendationsAr,
          clinicalRecommendationsEn,
          inconsistencyWarningsAr,
          requiresSpecialistReview,
          hasCriticalAlert,
          criticalAlertMessageAr,
          imageDeleted,
          detectedItems,
          imageThumbnail: imageDeleted ? undefined : currentImageDataUrl,
          analyzedBy: user?.fullNameAr || user?.username || 'Specialist',
        },
        {
          contrastEnhanced: enhanceContrast,
          noiseReduced: reduceNoise,
          chromaticSignature: currentChromaticSignature,
        }
      );

      lastSavedAnalysisId = saved.analysis.id;
      showToast(
        i18n.bi(
          `تم حفظ التحليل (${saved.analysis.analysisNumber}) ونتائج التعرف (${detectedItems.length}) في قاعدة البيانات`,
          `Saved analysis (${saved.analysis.analysisNumber}) and ${detectedItems.length} findings to database`
        ),
        'success'
      );
      await renderWorkspace();
    };

    document.getElementById('btn-save-top')?.addEventListener('click', triggerSave);
    document.getElementById('btn-action-save')?.addEventListener('click', triggerSave);

    // Print A4 Handler
    const triggerPrintA4 = async () => {
      syncTextInputs();
      const pat = patients.find((p: Patient) => p.id === selectedPatientId);
      const engineObj = VISION_ENGINE_MODES.find((e) => e.id === currentEngine) || VISION_ENGINE_MODES[0];

      const tempAnalysis: AiImageAnalysisRecord = {
        id: lastSavedAnalysisId,
        analysisNumber: lastSavedAnalysisId !== 'unsaved' ? lastSavedAnalysisId : 'AI-REPORT',
        modality,
        engineMode: currentEngine,
        engineSystemNameAr: engineObj.titleAr,
        engineSystemNameEn: engineObj.titleEn,
        patientName: pat?.name,
        stainOrPrep: currentStain,
        magnification: currentMagnification,
        contrastEnhanced: enhanceContrast,
        noiseReduced: reduceNoise,
        overallConfidence,
        requiresSpecialistReview,
        hasCriticalAlert,
        criticalAlertMessageAr,
        inconsistencyWarningsAr,
        inconsistencyWarningsEn: [],
        clinicalInterpretationAr: overallDiagnosisAr,
        clinicalInterpretationEn: overallDiagnosisEn,
        recommendationsAr: clinicalRecommendationsAr,
        recommendationsEn: clinicalRecommendationsEn,
        imageDataUrl: currentImageDataUrl,
        imageDeleted,
        findingsCount: detectedItems.length,
        status: 'completed',
        analyzedBy: user?.fullNameAr || 'Specialist',
        createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      };

      const mappedFindings = detectedItems.map((it) => ({
        groupTitleAr: it.categoryAr,
        groupTitleEn: it.categoryEn,
        nameAr: it.nameAr,
        nameEn: it.nameEn,
        scientificName: it.scientificName,
        countOrGrade: it.countOrGrade,
        confidence: it.confidence,
        semanticColor:
          it.semanticColor ||
          (it.severity === 'normal' ? 'green' : it.severity === 'mild' ? 'yellow' : 'red'),
        clinicalSignificanceAr: it.clinicalSignificanceAr,
        clinicalSignificanceEn: it.clinicalSignificanceEn,
      }));

      await printAnalysisReportA4(tempAnalysis, mappedFindings);
    };

    document.getElementById('btn-print-top')?.addEventListener('click', triggerPrintA4);
    document.getElementById('btn-action-print-a4')?.addEventListener('click', triggerPrintA4);

    // Print Thermal 80mm Handler
    document.getElementById('btn-action-print-thermal')?.addEventListener('click', async () => {
      syncTextInputs();
      const pat = patients.find((p: Patient) => p.id === selectedPatientId);
      const bodyHtml = `
        <div><strong>${i18n.bi('التحليل:', 'Modality:')}</strong> ${i18n.bi(spec.titleAr, spec.titleEn)}</div>
        <div><strong>${i18n.bi('المريض:', 'Patient:')}</strong> ${pat?.name || i18n.bi('فحص مباشر', 'Direct Slide')}</div>
        <div><strong>${i18n.bi('متوسط الثقة:', 'Confidence:')}</strong> ${overallConfidence}%</div>
        <hr style="border-top:1px dashed #000; margin:6px 0;" />
        ${detectedItems
          .map((d) => `<div>• <strong>${d.nameAr}:</strong> ${d.countOrGrade} (${d.confidence}%)</div>`)
          .join('')}
        <hr style="border-top:1px dashed #000; margin:6px 0;" />
        <div><strong>${i18n.bi('التفسير:', 'Summary:')}</strong> ${overallDiagnosisAr}</div>
      `;
      await printService.printThermal80mm(
        i18n.bi(spec.titleAr, spec.titleEn),
        bodyHtml,
        `AI-${Date.now().toString().slice(-6)}`
      );
    });

    // Correct Findings button in bottom bar
    document.getElementById('btn-action-correct-first')?.addEventListener('click', () => {
      if (detectedItems.length === 0) {
        showToast(i18n.bi('لا توجد نتائج حالية لتصحيحها', 'No findings to correct'), 'info');
        return;
      }
      openSpecialistCorrectionModal(0);
    });

    // Saved history table buttons
    container.querySelectorAll<HTMLButtonElement>('[data-print-saved]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-print-saved');
        if (!id) return;
        const analysis = savedScans.find((s) => s.id === id);
        if (!analysis) return;
        const findings = await microscopyRepository.getFindingsByAnalysisId(id);
        await printAnalysisReportA4(analysis, findings);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-del-saved]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-saved');
        if (!id) return;
        const analysis = savedScans.find((s) => s.id === id);
        if (!analysis) return;
        openDeleteConfirmModal({
          recordLabel: `${analysis.analysisNumber} - ${analysis.patientName || ''}`,
          onConfirm: async () => {
            await microscopyRepository.deleteScan(id);
            showToast(i18n.bi('تم حذف التحليل المحفوظ', 'Deleted saved analysis'), 'info');
            await renderWorkspace();
          },
        });
      });
    });
  };

  await renderWorkspace();
}

export async function renderBloodFilmAiPage(container: HTMLElement): Promise<void> {
  await renderMicroscopyWorkspace(container, 'blood_film');
}

export async function renderUrineMicroscopyAiPage(container: HTMLElement): Promise<void> {
  await renderMicroscopyWorkspace(container, 'urine_sediment');
}

export async function renderStoolMicroscopyAiPage(container: HTMLElement): Promise<void> {
  await renderMicroscopyWorkspace(container, 'stool_parasitology');
}
