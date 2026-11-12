import { db } from '../db/database';
import type { DoctorSpecialty, SampleTube, ScientificDepartment } from '../types';

export const DEFAULT_DOCTOR_SPECIALTIES: DoctorSpecialty[] = [
  { id: 'spec_1', code: 'SPC-01', nameAr: 'باطنة عامة', nameEn: 'Internal Medicine', notes: 'أمراض الباطنة العامة والجهاز الهضمي', active: true },
  { id: 'spec_2', code: 'SPC-02', nameAr: 'باطنة وكلى', nameEn: 'Internal Medicine & Nephrology', notes: 'أمراض الباطنة والكلى', active: true },
  { id: 'spec_3', code: 'SPC-03', nameAr: 'أطفال وحديثي الولادة', nameEn: 'Pediatrics & Neonatology', notes: 'طب الأطفال وحديثي الولادة', active: true },
  { id: 'spec_4', code: 'SPC-04', nameAr: 'نساء وتوليد', nameEn: 'Obstetrics & Gynecology', notes: 'أمراض النساء والتوليد وتأخر الإنجاب', active: true },
  { id: 'spec_5', code: 'SPC-05', nameAr: 'قلب وأوعية دموية', nameEn: 'Cardiology', notes: 'أمراض القلب والأوعية الدموية', active: true },
  { id: 'spec_6', code: 'SPC-06', nameAr: 'غدد صماء وسكر', nameEn: 'Endocrinology & Diabetes', notes: 'أمراض الغدد الصماء والسكر', active: true },
  { id: 'spec_7', code: 'SPC-07', nameAr: 'كبد وجهاز هضمي', nameEn: 'Hepatology & Gastroenterology', notes: 'أمراض الكبد والجهاز الهضمي والمناظير', active: true },
  { id: 'spec_8', code: 'SPC-08', nameAr: 'جراحة عامة', nameEn: 'General Surgery', notes: 'الجراحة العامة وجراحة المناظير', active: true },
  { id: 'spec_9', code: 'SPC-09', nameAr: 'مسالك بولية وأمراض ذكورة', nameEn: 'Urology & Andrology', notes: 'المسالك البولية والتناسلية', active: true },
  { id: 'spec_10', code: 'SPC-10', nameAr: 'عظام ومفاصل وروماتيزم', nameEn: 'Orthopedics & Rheumatology', notes: 'جراحة العظام والمفاصل والروماتيزم', active: true },
  { id: 'spec_11', code: 'SPC-11', nameAr: 'أورام وأمراض دم', nameEn: 'Oncology & Hematology', notes: 'علاج الأورام وأمراض الدم', active: true },
  { id: 'spec_12', code: 'SPC-12', nameAr: 'صدرية وحساسية', nameEn: 'Pulmonology & Allergy', notes: 'الأمراض الصدرية والحساسية والمناعة', active: true },
];

export const DEFAULT_SCIENTIFIC_DEPARTMENTS: ScientificDepartment[] = [
  { id: 'dept_1', code: 'DEP-01', nameAr: 'الكيمياء الحيوية', nameEn: 'Clinical Biochemistry', notes: 'وظائف الكبد، الكلى، السكر، الدهون، الإنزيمات، والأملاح والمعادن', active: true },
  { id: 'dept_2', code: 'DEP-02', nameAr: 'أمراض الدم (Hematology)', nameEn: 'Hematology & Coagulation', notes: 'صورة الدم الكاملة CBC، سرعة الترسيب، السيولة والتجلط، والفصل الكهربائي للهيموجلوبين', active: true },
  { id: 'dept_3', code: 'DEP-03', nameAr: 'الهرمونات ودلالات الأورام', nameEn: 'Hormones, Endocrinology & Tumor Markers', notes: 'الغدة الدرقية، هرمونات الخصوبة، الغدة الكظرية، الفيتامينات، ودلالات الأورام', active: true },
  { id: 'dept_4', code: 'DEP-04', nameAr: 'المناعة والأمصال (Serology)', nameEn: 'Immunology, Serology & Virology', notes: 'الفيروسات الكبدية، الإيدز، TORCH، المناعة الذاتية، والروماتيزم والحساسية', active: true },
  { id: 'dept_5', code: 'DEP-05', nameAr: 'الميكروبيولوجي والمزارع', nameEn: 'Microbiology & Sensitivity Cultures', notes: 'مزارع البول، الدم، الصديد، البصاق، البراز، وحساسية المضادات الحيوية CLSI/MIC', active: true },
  { id: 'dept_6', code: 'DEP-06', nameAr: 'الطفيليات (Parasitology)', nameEn: 'Parasitology, Urinalysis & Stool', notes: 'تحليل البول الكامل، تحليل البراز، الدم الخفي، الكالبروتكتين، والسائل المنوي CASA', active: true },
  { id: 'dept_7', code: 'DEP-07', nameAr: 'البيولوجيا الجزيئية (PCR)', nameEn: 'Molecular Biology & Genetics (PCR)', notes: 'تحاليل الحمض النووي والـ PCR الكمي والنوعي للفيروسات وجينات التجلط', active: true },
  { id: 'dept_8', code: 'DEP-08', nameAr: 'السموم والأدوية العلاجية (TDM)', nameEn: 'Toxicology & Therapeutic Drug Monitoring', notes: 'قياس مستوى الأدوية بالدم (Digoxin, Valproate, Tacrolimus) وكشف السموم والمخدرات', active: true },
  { id: 'dept_9', code: 'DEP-09', nameAr: 'أمراض الذكورة والخصوبة', nameEn: 'Andrology & Fertility Diagnostics', notes: 'تحليل السائل المنوي المعملي بالكمبيوتر (WHO 6th Ed) وهرمونات الذكورة', active: true },
  { id: 'dept_10', code: 'DEP-10', nameAr: 'الباثولوجيا الخلوية والأنسجة', nameEn: 'Histopathology & Cytology', notes: 'فحص العينات النسيجية وسوائل الجسم (CSF, Pleural, Ascitic)', active: true },
];

export const DEFAULT_SAMPLE_TUBES: SampleTube[] = [
  { id: 'tube_1', code: 'TUB-01', nameAr: 'أنبوبة حمراء سادة (Plain Red)', nameEn: 'Plain Red Top Tube', capColor: 'أحمر (Red)', additive: 'منشط تجلط (Clot Activator)', notes: 'لسحب عينات السيرم (الكيمياء والهرمونات والأمصال والأدوية)', active: true },
  { id: 'tube_2', code: 'TUB-02', nameAr: 'أنبوبة صفراء جل (SST / Gel Yellow)', nameEn: 'SST Yellow Gel Tube', capColor: 'أصفرذهبي (Gold/Yellow)', additive: 'جل فاصل + منشط تجلط (Separator Gel)', notes: 'لسحب وفصل السيرم السريع (الكيمياء والمناعة والهرمونات ودلالات الأورام)', active: true },
  { id: 'tube_3', code: 'TUB-03', nameAr: 'أنبوبة بنفسجي (EDTA Lavender)', nameEn: 'EDTA Purple / Lavender Tube', capColor: 'بنفسجي (Purple)', additive: 'K2-EDTA / K3-EDTA', notes: 'لصورة الدم الكاملة CBC، السكر التراكمي HbA1c، الفصل الكهربائي، والـ PCR', active: true },
  { id: 'tube_4', code: 'TUB-04', nameAr: 'أنبوبة زرقاء للسيولة (Sodium Citrate Blue)', nameEn: 'Sodium Citrate 3.2% Light Blue Tube', capColor: 'أزرق فاتح (Light Blue)', additive: 'سترات الصوديوم 3.2% (1:9)', notes: 'لتحاليل السيولة والتجلط (PT, INR, aPTT, Fibrinogen, D-Dimer, Protein C/S)', active: true },
  { id: 'tube_5', code: 'TUB-05', nameAr: 'أنبوبة خضراء هيبارين (Heparin Green)', nameEn: 'Lithium / Sodium Heparin Green Tube', capColor: 'أخضر (Green)', additive: 'هيبارين الليثيوم أو الصوديوم (Heparin)', notes: 'لتحاليل البلازما العاجلة، إنزيم G6PD، الأمونيا، والكروموسومات', active: true },
  { id: 'tube_6', code: 'TUB-06', nameAr: 'أنبوبة رمادية للسكر (Sodium Fluoride Grey)', nameEn: 'Sodium Fluoride / Oxalate Grey Tube', capColor: 'رمادي (Grey)', additive: 'فلوريد الصوديوم + أوكسالات البوتاسيوم', notes: 'لتحاليل السكر الصائم والفاطر ومنحنى السكر OGTT واللاكتات', active: true },
  { id: 'tube_7', code: 'TUB-07', nameAr: 'أنبوبة سوداء للترسيب (ESR Black)', nameEn: 'ESR Sodium Citrate 3.8% Black Tube', capColor: 'أسود (Black)', additive: 'سترات الصوديوم 3.8% (1:4)', notes: 'مخصصة لتحليل سرعة الترسيب (ESR Westergren)', active: true },
  { id: 'tube_8', code: 'TUB-08', nameAr: 'كوب معقم للبول / البراز (Sterile Cup)', nameEn: 'Sterile Urine / Stool / Sputum Container', capColor: 'شفاف بغطاء أصفر/أحمر', additive: 'عبوة معقمة محكمة الغلق (Sterile)', notes: 'لتحاليل البول والبراز والبصاق والسائل المنوي والمزارع', active: true },
  { id: 'tube_9', code: 'TUB-09', nameAr: 'زجاجة مزرعة دم (Blood Culture Bottle)', nameEn: 'BACTEC / BacT/ALERT Blood Culture Bottle', capColor: 'ذهبي / بنفسجي', additive: 'مرق التربتيك الصويا + راتينج معادل للمضادات (SPS Broth)', notes: 'لمزارع الدم الهوائية واللاهوائية للكبار والأطفال', active: true },
  { id: 'tube_10', code: 'TUB-10', nameAr: 'مسحة معقمة بناقل (Amies / VTM Transport Swab)', nameEn: 'Sterile Transport Swab (Amies / VTM)', capColor: 'أزرق / أحمر', additive: 'وسط آيمز الجيلاتيني أو وسط ناقل للفيروسات', notes: 'لمسحات الحلق، الأنف، الجروح، الصديد، والمسحات المهبلية', active: true },
  { id: 'tube_11', code: 'TUB-11', nameAr: 'سرنجة غازات الدم المهيبرنة (Heparinized ABG Syringe)', nameEn: 'Pre-Heparinized Arterial Blood Gas Syringe', capColor: 'أخضر بغطاء محكم', additive: 'هيبارين الليثيوم المتوازن (Balanced Lithium Heparin)', notes: 'لغازات الدم الشرياني ABG والكالسيوم المتأين Ionized Ca', active: true },
];

export const lookupsRepository = {
  async getDoctorSpecialties(): Promise<DoctorSpecialty[]> {
    let rows = await db.doctorSpecialties.toArray();
    if (rows.length === 0) {
      await db.doctorSpecialties.bulkPut(DEFAULT_DOCTOR_SPECIALTIES);
      rows = [...DEFAULT_DOCTOR_SPECIALTIES];
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  },

  async saveDoctorSpecialty(record: DoctorSpecialty): Promise<void> {
    await db.doctorSpecialties.put(record);
  },

  async deleteDoctorSpecialty(id: string): Promise<void> {
    await db.doctorSpecialties.delete(id);
  },

  async getScientificDepartments(): Promise<ScientificDepartment[]> {
    let rows = await db.scientificDepartments.toArray();
    if (rows.length === 0) {
      await db.scientificDepartments.bulkPut(DEFAULT_SCIENTIFIC_DEPARTMENTS);
      rows = [...DEFAULT_SCIENTIFIC_DEPARTMENTS];
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  },

  async saveScientificDepartment(record: ScientificDepartment): Promise<void> {
    await db.scientificDepartments.put(record);
  },

  async deleteScientificDepartment(id: string): Promise<void> {
    await db.scientificDepartments.delete(id);
  },

  async getSampleTubes(): Promise<SampleTube[]> {
    let rows = await db.sampleTubes.toArray();
    if (rows.length === 0) {
      await db.sampleTubes.bulkPut(DEFAULT_SAMPLE_TUBES);
      rows = [...DEFAULT_SAMPLE_TUBES];
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  },

  async saveSampleTube(record: SampleTube): Promise<void> {
    await db.sampleTubes.put(record);
  },

  async deleteSampleTube(id: string): Promise<void> {
    await db.sampleTubes.delete(id);
  },
};
