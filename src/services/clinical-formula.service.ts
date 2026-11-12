import type { TestParameter } from '../types';

export interface ClinicalFormulaPreset {
  code: string;
  formula: string;
  formulaCondition?: string;
  formulaNoteAr: string;
  formulaNoteEn: string;
}

/**
 * International Clinical Laboratory Formula Registry (IFCC / CLSI / CAP / NCEP / CKD-EPI)
 * Maps parameter codes to their standard mathematical expressions and clinical validity rules.
 */
export const CLINICAL_FORMULA_PRESETS: Record<string, ClinicalFormulaPreset> = {
  // 1. Lipid Profile (NCEP ATP III & Friedewald Formula)
  VLDL: {
    code: 'VLDL',
    formula: 'TG / 5',
    formulaCondition: 'TG <= 400',
    formulaNoteAr: 'معادلة فريديوالد: الدهون الثلاثية ÷ 5 (بشرط TG ≤ 400 mg/dL)',
    formulaNoteEn: 'Friedewald VLDL = TG / 5 (Valid when TG <= 400 mg/dL)',
  },
  LDL: {
    code: 'LDL',
    formula: 'CHOL - HDL - (TG / 5)',
    formulaCondition: 'TG <= 400',
    formulaNoteAr: 'معادلة فريديوالد: الكوليسترول الكلي - HDL - (الدهون الثلاثية ÷ 5) [بشرط TG ≤ 400]',
    formulaNoteEn: 'Friedewald LDL = CHOL - HDL - (TG / 5) [Valid when TG <= 400 mg/dL]',
  },
  'NON-HDL': {
    code: 'NON-HDL',
    formula: 'CHOL - HDL',
    formulaNoteAr: 'الكوليسترول غير النافع = الكوليسترول الكلي - الكوليسترول النافع HDL',
    formulaNoteEn: 'Non-HDL Cholesterol = CHOL - HDL',
  },
  'CHOL-HDL-R': {
    code: 'CHOL-HDL-R',
    formula: 'CHOL / HDL',
    formulaCondition: 'HDL > 0',
    formulaNoteAr: 'معامل الخطورة الأول = الكوليسترول الكلي ÷ الكوليسترول النافع HDL',
    formulaNoteEn: 'Castelli Risk Index I = CHOL / HDL',
  },
  'LDL-HDL-R': {
    code: 'LDL-HDL-R',
    formula: 'LDL / HDL',
    formulaCondition: 'HDL > 0',
    formulaNoteAr: 'معامل تصلب الشرايين = الكوليسترول الضار LDL ÷ الكوليسترول النافع HDL',
    formulaNoteEn: 'Castelli Risk Index II = LDL / HDL',
  },

  // 2. Complete Blood Count (CBC - ICSH / WHO Indices & Absolute Counts)
  MCV: {
    code: 'MCV',
    formula: '(HCT * 10) / RBC',
    formulaCondition: 'RBC > 0',
    formulaNoteAr: 'متوسط حجم الكرة الحمراء = (الهيماتوكريت × 10) ÷ عدد كرات الدم الحمراء RBC',
    formulaNoteEn: 'MCV (fL) = (HCT * 10) / RBC',
  },
  MCH: {
    code: 'MCH',
    formula: '(HGB * 10) / RBC',
    formulaCondition: 'RBC > 0',
    formulaNoteAr: 'متوسط وزن هيموجلوبين الكرة = (الهيموجلوبين × 10) ÷ عدد كرات الدم الحمراء RBC',
    formulaNoteEn: 'MCH (pg) = (HGB * 10) / RBC',
  },
  MCHC: {
    code: 'MCHC',
    formula: '(HGB * 100) / HCT',
    formulaCondition: 'HCT > 0',
    formulaNoteAr: 'متوسط تركيز الهيموجلوبين بالكرة = (الهيموجلوبين × 100) ÷ الهيماتوكريت HCT',
    formulaNoteEn: 'MCHC (g/dL) = (HGB * 100) / HCT',
  },
  'PCT-PLT': {
    code: 'PCT-PLT',
    formula: '(PLT * MPV) / 10000',
    formulaNoteAr: 'نسبة الصفائح المكدسة (Plateletcrit %) = (PLT × MPV) ÷ 10000',
    formulaNoteEn: 'Plateletcrit (%) = (PLT * MPV) / 10000',
  },
  'NEUT-A': {
    code: 'NEUT-A',
    formula: 'WBC * ((NEUT_P + BAND_P) / 100)',
    formulaNoteAr: 'العدد المطلق للمتعادلة (ANC) = كرات الدم البيضاء WBC × (نسبة المتعادلة % ÷ 100)',
    formulaNoteEn: 'Absolute Neutrophil Count = WBC * ((NEUT% + BAND%) / 100)',
  },
  'LYMPH-A': {
    code: 'LYMPH-A',
    formula: 'WBC * (LYMPH_P / 100)',
    formulaNoteAr: 'العدد المطلق لليمفاوية (ALC) = كرات الدم البيضاء WBC × (نسبة الليمفاوية % ÷ 100)',
    formulaNoteEn: 'Absolute Lymphocyte Count = WBC * (LYMPH% / 100)',
  },
  'MONO-A': {
    code: 'MONO-A',
    formula: 'WBC * (MONO_P / 100)',
    formulaNoteAr: 'العدد المطلق للوحيدة (AMC) = كرات الدم البيضاء WBC × (نسبة الوحيدة % ÷ 100)',
    formulaNoteEn: 'Absolute Monocyte Count = WBC * (MONO% / 100)',
  },
  'EOS-A': {
    code: 'EOS-A',
    formula: 'WBC * (EOS_P / 100)',
    formulaNoteAr: 'العدد المطلق للحامضية (AEC) = كرات الدم البيضاء WBC × (نسبة الحامضية % ÷ 100)',
    formulaNoteEn: 'Absolute Eosinophil Count = WBC * (EOS% / 100)',
  },
  'BASO-A': {
    code: 'BASO-A',
    formula: 'WBC * (BASO_P / 100)',
    formulaNoteAr: 'العدد المطلق للقاعدية (ABC) = كرات الدم البيضاء WBC × (نسبة القاعدية % ÷ 100)',
    formulaNoteEn: 'Absolute Basophil Count = WBC * (BASO% / 100)',
  },

  // 3. Liver Function & Bilirubin & Proteins (IFCC)
  IBIL: {
    code: 'IBIL',
    formula: 'TBIL - DBIL',
    formulaNoteAr: 'الصفراء غير المباشرة = الصفراء الكلية - الصفراء المباشرة',
    formulaNoteEn: 'Indirect Bilirubin = Total Bilirubin - Direct Bilirubin',
  },
  'LFT-IBIL': {
    code: 'LFT-IBIL',
    formula: 'LFT_TBIL - LFT_DBIL',
    formulaNoteAr: 'الصفراء غير المباشرة = الصفراء الكلية - الصفراء المباشرة',
    formulaNoteEn: 'Indirect Bilirubin = Total Bilirubin - Direct Bilirubin',
  },
  'GLOB-S': {
    code: 'GLOB-S',
    formula: 'TP_S - ALB_S',
    formulaNoteAr: 'الجلوبيولين بالدم = البروتين الكلي - الألبومين',
    formulaNoteEn: 'Serum Globulin = Total Protein - Albumin',
  },
  'AG-RATIO': {
    code: 'AG-RATIO',
    formula: 'ALB_S / GLOB_S',
    formulaCondition: 'GLOB_S > 0',
    formulaNoteAr: 'نسبة الألبومين إلى الجلوبيولين = الألبومين ÷ الجلوبيولين',
    formulaNoteEn: 'A/G Ratio = Albumin / Globulin',
  },
  'LFT-GLOB': {
    code: 'LFT-GLOB',
    formula: 'LFT_TP - LFT_ALB',
    formulaNoteAr: 'الجلوبيولين بالدم = البروتين الكلي - الألبومين',
    formulaNoteEn: 'Serum Globulin = Total Protein - Albumin',
  },
  'LFT-AGR': {
    code: 'LFT-AGR',
    formula: 'LFT_ALB / LFT_GLOB',
    formulaCondition: 'LFT_GLOB > 0',
    formulaNoteAr: 'نسبة الألبومين إلى الجلوبيولين = الألبومين ÷ الجلوبيولين',
    formulaNoteEn: 'A/G Ratio = Albumin / Globulin',
  },

  // 4. Renal Function (CKD-EPI eGFR, BUN, BUN/Creatinine, ACR)
  'BUN-S': {
    code: 'BUN-S',
    formula: 'UREA_S / 2.1428',
    formulaNoteAr: 'نيتروجين يوريا الدم (BUN) = البولينا ÷ 2.14',
    formulaNoteEn: 'BUN = Serum Urea / 2.1428',
  },
  'KFT-BUN': {
    code: 'KFT-BUN',
    formula: 'KFT_UREA / 2.1428',
    formulaNoteAr: 'نيتروجين يوريا الدم (BUN) = البولينا ÷ 2.14',
    formulaNoteEn: 'BUN = Serum Urea / 2.1428',
  },
  'KFT-BUNCR': {
    code: 'KFT-BUNCR',
    formula: 'KFT_BUN / KFT_CREAT',
    formulaCondition: 'KFT_CREAT > 0',
    formulaNoteAr: 'نسبة BUN إلى الكرياتينين = BUN ÷ الكرياتينين',
    formulaNoteEn: 'BUN/Creatinine Ratio = BUN / Creatinine',
  },
  EGFR: {
    code: 'EGFR',
    formula: 'CKD_EPI(CREAT_S, AGE, IS_FEMALE)',
    formulaCondition: 'CREAT_S > 0',
    formulaNoteAr: 'معادلة CKD-EPI العالمية لحساب معدل الترشيح الكبيبي (تعتمد على الكرياتينين + العمر + النوع)',
    formulaNoteEn: 'CKD-EPI eGFR (mL/min/1.73m²) based on Creatinine, Age & Sex',
  },
  'KFT-EGFR': {
    code: 'KFT-EGFR',
    formula: 'CKD_EPI(KFT_CREAT, AGE, IS_FEMALE)',
    formulaCondition: 'KFT_CREAT > 0',
    formulaNoteAr: 'معادلة CKD-EPI العالمية لحساب معدل الترشيح الكبيبي (تعتمد على الكرياتينين + العمر + النوع)',
    formulaNoteEn: 'CKD-EPI eGFR (mL/min/1.73m²) based on Creatinine, Age & Sex',
  },
  'U-ACR': {
    code: 'U-ACR',
    formula: '(U_MALB * 100) / U_CREAT',
    formulaCondition: 'U_CREAT > 0',
    formulaNoteAr: 'نسبة الزلال المجهري للكرياتينين (mg/g) = (زلال البول mg/L × 100) ÷ كرياتينين البول mg/dL',
    formulaNoteEn: 'Urine ACR (mg/g) = (Urine Microalbumin * 100) / Urine Creatinine',
  },

  // 5. Diabetes & Insulin Resistance (HbA1c NGSP/IFCC, eAG, HOMA-IR)
  'HBA1C-IFCC': {
    code: 'HBA1C-IFCC',
    formula: '(10.93 * HBA1C_NGSP) - 23.5',
    formulaNoteAr: 'معادلة IFCC الدولية: (10.93 × نسبة السكر التراكمي %) - 23.5',
    formulaNoteEn: 'IFCC HbA1c (mmol/mol) = (10.93 * HbA1c%) - 23.5',
  },
  'EAG-MG': {
    code: 'EAG-MG',
    formula: '(28.7 * HBA1C_NGSP) - 46.7',
    formulaNoteAr: 'معادلة ADAG لمتوسط السكر التقديري (mg/dL) = (28.7 × HbA1c%) - 46.7',
    formulaNoteEn: 'ADAG Estimated Average Glucose (mg/dL) = (28.7 * HbA1c%) - 46.7',
  },
  'HOMAIR-IDX': {
    code: 'HOMAIR-IDX',
    formula: '(GLU_HOMA * INS_FAST) / 405',
    formulaNoteAr: 'معادلة مقاومة الإنسولين HOMA-IR = (السكر الصائم mg/dL × الإنسولين الصائم µIU/mL) ÷ 405',
    formulaNoteEn: 'HOMA-IR = (Fasting Glucose * Fasting Insulin) / 405',
  },

  // 6. Iron Profile, Calcium, Electrolytes, Coagulation, PSA
  UIBC: {
    code: 'UIBC',
    formula: 'TIBC - FE_SER',
    formulaNoteAr: 'السعة غير المشبعة لارتباط الحديد (UIBC) = السعة الكلية TIBC - الحديد بالدم',
    formulaNoteEn: 'UIBC = TIBC - Serum Iron',
  },
  TSAT: {
    code: 'TSAT',
    formula: '(FE_SER / TIBC) * 100',
    formulaCondition: 'TIBC > 0',
    formulaNoteAr: 'نسبة تشبع الترانسفيرين بالحديد (%) = (الحديد بالدم ÷ السعة الكلية TIBC) × 100',
    formulaNoteEn: 'Transferrin Saturation (%) = (Serum Iron / TIBC) * 100',
  },
  'CA-CORR': {
    code: 'CA-CORR',
    formula: 'CA_TOT + 0.8 * (4.0 - ALB_S)',
    formulaNoteAr: 'معادلة Payne للكالسيوم المصحح = الكالسيوم الكلي + 0.8 × (4.0 - الألبومين)',
    formulaNoteEn: 'Payne Corrected Calcium = Total Ca + 0.8 * (4.0 - Albumin)',
  },
  'ANION-GAP': {
    code: 'ANION-GAP',
    formula: '(NA_SER + K_SER) - (CL_SER + HCO3_SER)',
    formulaNoteAr: 'الفجوة الأنيونية = (الصوديوم + البوتاسيوم) - (الكلوريد + البيكربونات)',
    formulaNoteEn: 'Anion Gap = (Na + K) - (Cl + HCO3)',
  },
  'PSA-RATIO': {
    code: 'PSA-RATIO',
    formula: '(FPSA / TPSA) * 100',
    formulaCondition: 'TPSA > 0',
    formulaNoteAr: 'نسبة الـ PSA الحر إلى الكلي (%) = (Free PSA ÷ Total PSA) × 100',
    formulaNoteEn: 'Free/Total PSA Ratio (%) = (Free PSA / Total PSA) * 100',
  },
  INR: {
    code: 'INR',
    formula: 'POW(PT_SEC / PT_CTRL, 1.1)',
    formulaCondition: 'PT_CTRL > 0',
    formulaNoteAr: 'معدل السيولة العالمي INR = (زمن المريض ÷ زمن الكنترول) ^ ISI',
    formulaNoteEn: 'INR = (Patient PT / Control PT) ^ ISI',
  },
  'APTT-RATIO': {
    code: 'APTT-RATIO',
    formula: 'APTT_SEC / APTT_CTRL',
    formulaCondition: 'APTT_CTRL > 0',
    formulaNoteAr: 'معامل نسبة السيولة الجزئية = زمن المريض aPTT ÷ زمن الكنترول',
    formulaNoteEn: 'aPTT Ratio = Patient aPTT / Control aPTT',
  },
};

/**
 * Normalizes a parameter code into a valid JS identifier for formula evaluation
 * (e.g. `NEUT-P` -> `NEUT_P`)
 */
export function normalizeFormulaToken(code: string): string {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
}

/**
 * Returns default formula metadata if the parameter code is a known calculated parameter
 */
export function getDefaultFormulaMetadata(paramCode: string): {
  isCalculated: boolean;
  formula?: string;
  formulaCondition?: string;
  formulaNoteAr?: string;
} {
  const upper = String(paramCode || '').trim().toUpperCase();
  const preset = CLINICAL_FORMULA_PRESETS[upper];
  if (!preset) {
    return { isCalculated: false };
  }
  return {
    isCalculated: true,
    formula: preset.formula,
    formulaCondition: preset.formulaCondition,
    formulaNoteAr: preset.formulaNoteAr,
  };
}

/**
 * Computes CKD-EPI (2021 Race-Free) eGFR in mL/min/1.73m²
 */
export function computeCkdEpiEgfr(creatinineMgDl: number, age = 40, isFemale = false): number {
  if (!Number.isFinite(creatinineMgDl) || creatinineMgDl <= 0) return 0;
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const sexFactor = isFemale ? 1.012 : 1.0;
  const ratio = creatinineMgDl / kappa;
  const minPart = Math.pow(Math.min(ratio, 1), alpha);
  const maxPart = Math.pow(Math.max(ratio, 1), -1.2);
  const ageFactor = Math.pow(0.9938, Math.max(18, age || 40));
  return 142 * minPart * maxPart * ageFactor * sexFactor;
}

/**
 * Evaluates a parameter's formula safely given current numeric values in the form and patient context.
 */
export function evaluateParameterFormula(
  param: Pick<TestParameter, 'code' | 'formula' | 'formulaCondition' | 'decimalPlaces'>,
  rawValuesByCode: Record<string, number>,
  patientContext?: { age?: number; gender?: 'male' | 'female' }
): {
  computedValue: number | null;
  conditionViolated: boolean;
  warningMessageAr?: string;
  warningMessageEn?: string;
} {
  const formulaRaw = param.formula?.trim();
  if (!formulaRaw) {
    return { computedValue: null, conditionViolated: false };
  }

  // Build normalized scope map (supports both hyphenated and underscored codes)
  const scope: Record<string, number> = {
    AGE: Number(patientContext?.age || 35),
    IS_FEMALE: patientContext?.gender === 'female' ? 1 : 0,
    IS_MALE: patientContext?.gender === 'female' ? 0 : 1,
    ALB_S: 4.0, // Default normal albumin fallback for Corrected Calcium if Albumin isn't in same panel
    PT_CTRL: 12.0, // Default normal PT control fallback
  };

  for (const [k, v] of Object.entries(rawValuesByCode)) {
    if (Number.isFinite(v)) {
      scope[normalizeFormulaToken(k)] = v;
    }
  }

  const prepareExpr = (expr: string): string => {
    // Replace hyphenated parameter codes (e.g. CHOL-HDL-R or NEUT-P) only when flanked by letters/digits
    return expr
      .replace(/\b([A-Za-z0-9]+)-([A-Za-z0-9]+)(?:-([A-Za-z0-9]+))?\b/g, (match) =>
        normalizeFormulaToken(match)
      )
      .toUpperCase();
  };

  // 1. Check clinical condition if present (e.g. TG <= 400 for Friedewald LDL)
  if (param.formulaCondition?.trim()) {
    try {
      const condExpr = prepareExpr(param.formulaCondition.trim());
      const keys = Object.keys(scope);
      const vals = keys.map((k) => scope[k]);
      const condFn = new Function(...keys, `return Boolean(${condExpr});`);
      const passed = condFn(...vals);
      if (!passed) {
        const isTriglycerideLimit = condExpr.includes('TG') && condExpr.includes('400');
        return {
          computedValue: null,
          conditionViolated: true,
          warningMessageAr: isTriglycerideLimit
            ? '⚠️ الدهون الثلاثية (TG > 400 mg/dL): معادلة فريديوالد غير صالحة طبياً — يرجى إدخال Direct LDL المقاس كيميائياً.'
            : `⚠️ شرط المعادلة غير محقق (${param.formulaCondition}) — يرجى الإدخال اليدوي.`,
          warningMessageEn: isTriglycerideLimit
            ? '⚠️ TG > 400 mg/dL: Friedewald equation is clinically invalid — please enter Direct LDL.'
            : `⚠️ Formula condition (${param.formulaCondition}) not met — enter value manually.`,
        };
      }
    } catch {
      // ignore condition evaluation error if variable not yet entered
    }
  }

  // 2. Evaluate main formula expression
  try {
    const cleanExpr = prepareExpr(formulaRaw);
    const keys = [...Object.keys(scope), 'CKD_EPI', 'POW', 'MIN', 'MAX', 'ROUND', 'ABS'];
    const vals = [
      ...Object.keys(scope).map((k) => scope[k]),
      (cr: number, age: number, isFem: number) => computeCkdEpiEgfr(cr, age, Boolean(isFem)),
      Math.pow,
      Math.min,
      Math.max,
      Math.round,
      Math.abs,
    ];

    const evalFn = new Function(...keys, `return Number(${cleanExpr});`);
    const result = evalFn(...vals);

    if (typeof result !== 'number' || !Number.isFinite(result) || result < 0) {
      return { computedValue: null, conditionViolated: false };
    }

    const decimals = param.decimalPlaces ?? 1;
    const rounded = Number(result.toFixed(decimals));
    return {
      computedValue: rounded,
      conditionViolated: false,
    };
  } catch {
    return { computedValue: null, conditionViolated: false };
  }
}
