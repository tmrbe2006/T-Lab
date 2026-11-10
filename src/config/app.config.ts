export type DataSourceMode = 'local' | 'api';

export interface AppConfig {
  appNameAr: string;
  appNameEn: string;
  version: string;
  dataSource: DataSourceMode;
  apiBaseUrl: string;
  defaultLang: 'ar' | 'en';
  defaultCurrency: string;
  defaultTaxRate: number;
}

export const APP_CONFIG: AppConfig = {
  appNameAr: 'مختبرات الشفاء التخصصية للتحاليل الطبية',
  appNameEn: 'Al-Shifa Specialized Medical Laboratories',
  version: '1.0.0',
  dataSource: 'local', // Switchable to 'api' without changing UI or Services
  apiBaseUrl: '/api/v1',
  defaultLang: 'ar',
  defaultCurrency: 'EGP',
  defaultTaxRate: 14,
};
