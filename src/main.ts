import './styles/main.css';
import { MedicalLabApp } from './app';
import { authService } from './auth/auth.service';
import { SecretsConfig } from './config/secrets.config';
import { seedDatabase } from './db/seed';
import { mysqlSyncService } from './services/mysql-sync.service';

async function bootstrap(): Promise<void> {
  // Validate environment secrets configuration safely
  SecretsConfig.validateSecrets();

  // Clear any stale Service Worker caches so updated code and .env connections always run fresh
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {});
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Handled by VitePWA in dev mode
      });
    });
  }

  // The Windows 3127 pilot is MySQL-authoritative. Never create Dexie demo
  // data or pull MySQL into the browser as a second source of truth.
  if(window.location.port!=='3127'){
    await seedDatabase(false);
    await mysqlSyncService.autoSyncOnStartup();
  }
  await authService.init();

  const root = document.getElementById('app');
  if (root) {
    const app = new MedicalLabApp(root);
    await app.render();
  }
}

bootstrap();
