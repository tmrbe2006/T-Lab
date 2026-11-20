import { describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { MYSQL_TABLES_CONFIG, buildCreateTableSQL } from '../../db/mysql-schema';

describe('MySQL-only migration mapping inventory', () => {
  it('covers every Dexie store with a unique MySQL table mapping', () => {
    const browserStores = db.tables.map(t => t.name).sort();
    const mappings = MYSQL_TABLES_CONFIG.map(m => m.dexieTable).sort();
    const mysqlTables = MYSQL_TABLES_CONFIG.map(m => m.mysqlTable);
    expect(browserStores).toHaveLength(49);
    expect(mappings).toEqual(browserStores);
    expect(new Set(mysqlTables).size).toBe(49);
    expect(mysqlTables).toContain('journal_entries');
    expect(mysqlTables).toContain('patients');
    expect(mysqlTables).toContain('reference_lab_partners');
    expect(mysqlTables).toContain('lab_to_lab_dispatches');
  });

  it('generates valid, additive MySQL 5.5/8 CREATE TABLE definitions', () => {
    for (const mapping of MYSQL_TABLES_CONFIG) {
      expect(mapping.mysqlTable).toMatch(/^[a-z][a-z0-9_]*$/);
      const sql = buildCreateTableSQL(mapping);
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
      expect(sql).toContain('`raw_json` LONGTEXT');
      expect(sql).toContain('ENGINE=InnoDB');
      expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE|REPLACE)\s+(?:TABLE|FROM|INTO)\b/i);
    }
  });
});
