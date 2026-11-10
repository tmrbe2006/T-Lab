import { i18n } from '../i18n';

export type ThemeMode = 'light' | 'dark';

export type SkinId =
  | 'clinical-blue'
  | 'emerald-care'
  | 'royal-indigo'
  | 'teal-precision'
  | 'amber-warm'
  | 'crimson-hema';

export interface SkinDefinition {
  id: SkinId;
  nameAr: string;
  nameEn: string;
  primaryHex: string;
  primaryHoverHex: string;
  headerBgHex: string;
  accentSoftBgHex: string;
}

export const AVAILABLE_SKINS: SkinDefinition[] = [
  {
    id: 'clinical-blue',
    nameAr: 'الأزرق الطبي الكلاسيكي',
    nameEn: 'Clinical Sky Blue',
    primaryHex: '#0284c7',
    primaryHoverHex: '#0369a1',
    headerBgHex: '#0f172a',
    accentSoftBgHex: '#e0f2fe',
  },
  {
    id: 'emerald-care',
    nameAr: 'الأخضر الزمردي الحيوي',
    nameEn: 'Bio-Emerald Care',
    primaryHex: '#059669',
    primaryHoverHex: '#047857',
    headerBgHex: '#064e3b',
    accentSoftBgHex: '#d1fae5',
  },
  {
    id: 'royal-indigo',
    nameAr: 'النيلي الملكي المتقدم',
    nameEn: 'Royal Indigo Lab',
    primaryHex: '#4f46e5',
    primaryHoverHex: '#4338ca',
    headerBgHex: '#1e1b4b',
    accentSoftBgHex: '#e0e7ff',
  },
  {
    id: 'teal-precision',
    nameAr: 'الفيروزي المعملي الدقيق',
    nameEn: 'Precision Teal',
    primaryHex: '#0d9488',
    primaryHoverHex: '#0f766e',
    headerBgHex: '#134e4a',
    accentSoftBgHex: '#ccfbf1',
  },
  {
    id: 'amber-warm',
    nameAr: 'الكهرماني التنفيذي',
    nameEn: 'Executive Amber',
    primaryHex: '#d97706',
    primaryHoverHex: '#b45309',
    headerBgHex: '#1c1917',
    accentSoftBgHex: '#fef3c7',
  },
  {
    id: 'crimson-hema',
    nameAr: 'الأحمر الهيماتولوجي',
    nameEn: 'Hematology Ruby',
    primaryHex: '#e11d48',
    primaryHoverHex: '#be123c',
    headerBgHex: '#4c0519',
    accentSoftBgHex: '#ffe4e6',
  },
];

const THEME_MODE_KEY = 'medlab_theme_mode';
const THEME_SKIN_KEY = 'medlab_theme_skin';

class ThemeService {
  private mode: ThemeMode = 'light';
  private skin: SkinId = 'clinical-blue';
  private listeners: Array<() => void> = [];

  constructor() {
    const savedMode = localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null;
    const savedSkin = localStorage.getItem(THEME_SKIN_KEY) as SkinId | null;

    if (savedMode === 'light' || savedMode === 'dark') {
      this.mode = savedMode;
    }
    if (savedSkin && AVAILABLE_SKINS.some((s) => s.id === savedSkin)) {
      this.skin = savedSkin;
    }
    this.applyToDOM();
  }

  public getMode(): ThemeMode {
    return this.mode;
  }

  public getSkin(): SkinId {
    return this.skin;
  }

  public getCurrentSkinDef(): SkinDefinition {
    return AVAILABLE_SKINS.find((s) => s.id === this.skin) || AVAILABLE_SKINS[0];
  }

  public setMode(mode: ThemeMode): void {
    this.mode = mode;
    localStorage.setItem(THEME_MODE_KEY, mode);
    this.applyToDOM();
    this.notify();
  }

  public toggleMode(): ThemeMode {
    const next: ThemeMode = this.mode === 'light' ? 'dark' : 'light';
    this.setMode(next);
    return next;
  }

  public setSkin(skin: SkinId): void {
    this.skin = skin;
    localStorage.setItem(THEME_SKIN_KEY, skin);
    this.applyToDOM();
    this.notify();
  }

  public onChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  public applyToDOM(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', this.mode === 'dark');
    root.setAttribute('data-theme', this.mode);
    root.setAttribute('data-skin', this.skin);

    const def = this.getCurrentSkinDef();
    root.style.setProperty('--skin-primary', def.primaryHex);
    root.style.setProperty('--skin-primary-hover', def.primaryHoverHex);
    root.style.setProperty('--skin-header-bg', def.headerBgHex);
    root.style.setProperty('--skin-accent-soft', def.accentSoftBgHex);
  }

  public renderThemeToolbarCompact(): string {
    const isDark = this.mode === 'dark';
    return `
      <div class="flex items-center gap-1.5">
        <select
          id="global-skin-select"
          title="${i18n.bi('اختر مظهر وثيم النظام (Skin)', 'Select App Skin')}"
          class="rounded-lg border border-white/20 bg-black/25 px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none cursor-pointer"
        >
          ${AVAILABLE_SKINS.map(
            (s) =>
              `<option value="${s.id}" ${this.skin === s.id ? 'selected' : ''} class="bg-slate-900 text-white">
                🎨 ${i18n.bi(s.nameAr, s.nameEn)}
              </option>`
          ).join('')}
        </select>
        <button
          id="global-mode-toggle"
          type="button"
          title="${i18n.bi('تبديل الوضع الليلي / النهاري', 'Toggle Light / Dark Mode')}"
          class="rounded-lg border border-white/20 bg-black/25 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10 whitespace-nowrap cursor-pointer"
        >
          ${isDark ? i18n.bi('☀ نهاري', '☀ Light') : i18n.bi('☾ ليلي', '☾ Dark')}
        </button>
      </div>
    `;
  }

  public bindToolbarEvents(): void {
    const skinSelect = document.getElementById('global-skin-select') as HTMLSelectElement | null;
    skinSelect?.addEventListener('change', () => {
      this.setSkin(skinSelect.value as SkinId);
    });

    const modeBtn = document.getElementById('global-mode-toggle');
    modeBtn?.addEventListener('click', () => {
      this.toggleMode();
    });
  }
}

export const themeService = new ThemeService();
