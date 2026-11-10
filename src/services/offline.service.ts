// src/services/offline.service.ts
import { showToast } from '../components/toast';
import { SecretsConfig } from '../config/secrets.config';

export class OfflineService {
  static isOfflineMode(): boolean {
    return (
      localStorage.getItem('OFFLINE_MODE') === 'true' ||
      !navigator.onLine ||
      !SecretsConfig.getGeminiApiKey()
    );
  }

  static isExplicitOfflineForced(): boolean {
    return localStorage.getItem('OFFLINE_MODE') === 'true';
  }

  static enableOfflineMode(): void {
    localStorage.setItem('OFFLINE_MODE', 'true');
    showToast('تم تفعيل وضع عدم الاتصال - البيانات تجريبية فقط', 'info');
  }

  static disableOfflineMode(): void {
    localStorage.removeItem('OFFLINE_MODE');
    showToast('تم تعطيل وضع عدم الاتصال', 'info');
  }
}
