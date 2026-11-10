// src/config/secrets.config.ts

export class SecretsConfig {
  private static isDevelopment = import.meta.env.DEV;

  static getGeminiApiKey(): string | null {
    // في بيئة التطوير: من .env
    // في بيئة الإنتاج: من متغيرات الخادم
    const env = import.meta.env as Record<string, string | undefined>;
    const key = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
    if (
      !key ||
      key === 'your_gemini_api_key_here' ||
      key === 'MY_GEMINI_API_KEY'
    ) {
      console.warn('Gemini API key not configured');
      return null;
    }
    return key;
  }

  static validateSecrets(): void {
    const env = import.meta.env as Record<string, string | undefined>;
    if (this.isDevelopment) {
      console.log('Development mode: secrets loaded from .env');
    } else {
      // في الإنتاج، تحقق من وجود المتغيرات المطلوبة في حال تفعيل وضع الـ API الخلفي
      const required = ['DATABASE_URL', 'JWT_SECRET'];
      const missing = required.filter((key) => !env[key]);
      if (missing.length > 0) {
        // في وضع العمل المحلي دون اتصال (PWA / IndexedDB) نكتفي بتحذير أمني دون إيقاف الواجهة المحلية
        console.warn(
          `[SecretsConfig] Running in client-side local/offline mode. Backend secrets not set in browser bundle: ${missing.join(', ')}`
        );
      }
    }
  }
}
