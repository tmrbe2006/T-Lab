import { i18n } from '../i18n';
import { openCustomModal } from './modal';
import { showToast } from './toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

class PWAInstallManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstalled = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isInstalled =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredPrompt = e as BeforeInstallPromptEvent;
      });

      window.addEventListener('appinstalled', () => {
        this.isInstalled = true;
        this.deferredPrompt = null;
      });
    }
  }

  public isRunningStandalone(): boolean {
    return this.isInstalled;
  }

  public async triggerInstall(): Promise<void> {
    if (this.deferredPrompt) {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        this.isInstalled = true;
        this.deferredPrompt = null;
        showToast(i18n.bi('تم تثبيت التطبيق بنجاح على جهازك', 'Application installed successfully'), 'success');
      }
      return;
    }

    // Fallback instructions modal for iOS Safari / desktop browsers when prompt is not yet fired
    openCustomModal(
      i18n.bi('تثبيت نظام المعمل كتطبيق مستقل (PWA)', 'Install Medical Lab System (PWA)'),
      `
        <div class="space-y-3 text-sm text-slate-700">
          <p>${i18n.bi(
            'النظام مجهز بالكامل للعمل دون اتصال (Offline-First PWA) عبر Service Worker وقاعدة بيانات IndexedDB.',
            'This system is a full Offline-First PWA powered by Service Workers and IndexedDB.'
          )}</p>
          <div class="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
            <p class="font-bold text-slate-900">${i18n.bi('خطوات التثبيت المباشر:', 'Installation Instructions:')}</p>
            <p>1. ${i18n.bi('في متصفح Chrome أو Edge: اضغط على أيقونة التثبيت في شريط العنوان العلوى (Install MedLab Pro).', 'In Chrome / Edge: Click the Install icon in the browser address bar.')}</p>
            <p>2. ${i18n.bi('في أجهزة iPhone / iPad (Safari): اضغط على زر المشاركة (Share) ثم اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).', 'On iOS Safari: Tap Share in the toolbar, then select "Add to Home Screen".')}</p>
          </div>
        </div>
      `
    );
  }
}

export const pwaManager = new PWAInstallManager();
