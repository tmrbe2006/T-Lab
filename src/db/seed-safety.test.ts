import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { seedDatabase } from './seed';

describe('Startup must preserve clinical data', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
  });

  afterAll(async () => {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    db.close();
  });

  it('does not destroy an existing patient when localStorage flags and users are missing', async () => {
    await db.patients.put({
      id: 'patient-existing-001',
      code: 'P0001',
      name: 'Existing Patient',
      nameEn: '',
      phone: '',
      gender: 'male',
      birthDate: '1990-01-01',
      age: 36,
      nationalId: '',
      address: '',
      notes: '',
      hasDefaultDiscount: false,
      defaultDiscountType: 'none',
      defaultDiscountValue: 0,
      active: true,
      createdAt: '2026-01-01',
    });
    await seedDatabase(false);
    expect(await db.patients.get('patient-existing-001')).toBeDefined();
    expect((await db.users.where('username').equals('developer').first())?.passwordHash).toBe('');
  });

  it('preserves customized permissions rather than silently resetting defaults', async () => {
    await db.permissions.put({
      id: 'Receptionist_patients',
      role: 'Receptionist',
      resource: 'patients',
      actions: {
        view: true, add: false, edit: false, delete: false, print: false,
        export: false, approve: false, cancel: false, discount: false,
        editPrices: false, closeDay: false, reopenResult: false,
        managePermissions: false, addPayment: false, payCommission: false,
        addJournalEntry: false,
      },
    });
    await seedDatabase(false);
    const saved = await db.permissions.get('Receptionist_patients');
    expect(saved?.actions.add).toBe(false);
    expect(saved?.actions.view).toBe(true);
  });
});
