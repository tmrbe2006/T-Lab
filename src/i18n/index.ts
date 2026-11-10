import { ar } from './ar';
import { en } from './en';
import type { Direction, Language } from '../types';

const LANG_STORAGE_KEY = 'medlab_lang';

class I18nService {
  private currentLang: Language = 'ar';
  private listeners: Array<(lang: Language) => void> = [];

  constructor() {
    const saved = localStorage.getItem(LANG_STORAGE_KEY) as Language | null;
    if (saved === 'ar' || saved === 'en') {
      this.currentLang = saved;
    } else {
      this.currentLang = 'ar';
      localStorage.setItem(LANG_STORAGE_KEY, 'ar');
    }
    this.applyDocumentDirection();
  }

  public getLang(): Language {
    return this.currentLang;
  }

  public getDirection(): Direction {
    return this.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  public setLang(lang: Language): void {
    this.currentLang = lang;
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    this.applyDocumentDirection();
    this.listeners.forEach((cb) => cb(lang));
  }

  public toggleLang(): Language {
    const next: Language = this.currentLang === 'ar' ? 'en' : 'ar';
    this.setLang(next);
    return next;
  }

  public get dict() {
    return this.currentLang === 'ar' ? ar : en;
  }

  public bi(arText: string, enText: string): string {
    return this.currentLang === 'ar' ? arText : enText;
  }

  public onChange(cb: (lang: Language) => void): void {
    this.listeners.push(cb);
  }

  private applyDocumentDirection(): void {
    const dir = this.getDirection();
    document.documentElement.lang = this.currentLang;
    document.documentElement.dir = dir;
  }
}

export const i18n = new I18nService();
