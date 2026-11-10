import './styles/main.css';
import { MedicalLabApp } from './app';
import { authService } from './auth/auth.service';
import { seedDatabase } from './db/seed';

async function bootstrap(): Promise<void> {
  // Register Service Worker for PWA offline capability
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Handled by VitePWA in dev mode
      });
    });
  }

  // Seed IndexedDB with initial demo data (if empty) and initialize Auth session
  await seedDatabase(false);
  await authService.init();

  const root = document.getElementById('app');
  if (root) {
    const app = new MedicalLabApp(root);
    await app.render();
  }
}

bootstrap();
