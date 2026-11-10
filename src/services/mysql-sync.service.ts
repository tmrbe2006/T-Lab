import { closeModal, openModal, showToast } from '../components/common';
import { db } from '../db/database';
import {
  buildFullMySQLDump,
  MYSQL_TABLES_CONFIG,
} from '../db/mysql-schema';
import { i18n } from '../i18n';
import { CacheService } from './cache.service';

export interface MySQLClientConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  autoSync: boolean;
}

const STORAGE_KEY = 'tlab_mysql_config_v1';

class MySQLSyncService {
  private hooksRegistered = false;
  private isPulling = false;

  public getConfig(): MySQLClientConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          host: parsed.host || '127.0.0.1',
          port: Number(parsed.port || 3306),
          user: parsed.user || 'root',
          password: parsed.password || '',
          database: parsed.database || 'tlab_db',
          autoSync: Boolean(parsed.autoSync),
        };
      }
    } catch {
      // ignore
    }
    return {
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'tlab_db',
      autoSync: false,
    };
  }

  public saveConfig(cfg: MySQLClientConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  /**
   * Collects all records from all Dexie tables mapped to MySQL
   */
  public async collectAllTablesData(): Promise<Record<string, Record<string, unknown>[]>> {
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const mapping of MYSQL_TABLES_CONFIG) {
      const table = db.table(mapping.dexieTable);
      if (table) {
        data[mapping.dexieTable] = await table.toArray();
      }
    }
    return data;
  }

  /**
   * Generates and downloads a 100% MySQL 5.5 & MySQL 8.0.28 compatible .sql file
   */
  public async downloadSQLDump(includeData = true): Promise<void> {
    const cfg = this.getConfig();
    const tablesData = includeData ? await this.collectAllTablesData() : {};
    const sqlContent = buildFullMySQLDump(cfg.database || 'tlab_db', tablesData, includeData);

    const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const datePart = new Date().toISOString().slice(0, 10);
    a.download = includeData
      ? `tlab_mysql55_80_full_${datePart}.sql`
      : `tlab_mysql55_80_schema_only_${datePart}.sql`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(
      includeData
        ? i18n.bi(
            'تم تنزيل ملف قاعدة بيانات MySQL الكامل (الهيكل + كافة البيانات) بنجاح',
            'Full MySQL 5.5 / 8.0.28 SQL Dump downloaded successfully'
          )
        : i18n.bi(
            'تم تنزيل ملف هيكل جداول MySQL (Schema Only) بنجاح',
            'MySQL Schema Only SQL file downloaded successfully'
          ),
      'success'
    );
  }

  public async testConnection(cfg: MySQLClientConfig): Promise<{
    ok: boolean;
    version?: string;
    existingTablesCount?: number;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/mysql/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async initSchemaOnServer(cfg: MySQLClientConfig): Promise<{
    ok: boolean;
    version?: string;
    tablesCreated?: number;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/mysql/init-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async pushAllToMySQL(cfg: MySQLClientConfig): Promise<{
    ok: boolean;
    totalRowsSynced?: number;
    tablesCount?: number;
    version?: string;
    error?: string;
  }> {
    try {
      const data = await this.collectAllTablesData();
      const res = await fetch('/api/mysql/push-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg, data }),
      });
      return await res.json();
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async pullAllFromMySQL(cfg: MySQLClientConfig): Promise<{
    ok: boolean;
    totalRowsPulled?: number;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/mysql/pull-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      });
      const json = await res.json();
      if (!json.ok || !json.data) {
        return { ok: false, error: json.error || 'Failed to pull data from MySQL' };
      }

      this.isPulling = true;
      try {
        for (const mapping of MYSQL_TABLES_CONFIG) {
          const rows = json.data[mapping.dexieTable];
          if (Array.isArray(rows) && rows.length > 0) {
            const table = db.table(mapping.dexieTable);
            await table.clear();
            await table.bulkPut(rows);
          }
        }
        CacheService.clear();
      } finally {
        this.isPulling = false;
      }

      return {
        ok: true,
        totalRowsPulled: json.totalRowsPulled || 0,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Registers real-time Dexie hooks so that any create/update/delete operation
   * in the app automatically syncs to the MySQL 5.5 / 8.0.28 server when autoSync is active.
   */
  public registerRealtimeHooks(): void {
    if (this.hooksRegistered) return;
    this.hooksRegistered = true;

    for (const mapping of MYSQL_TABLES_CONFIG) {
      const table = db.table(mapping.dexieTable);
      if (!table) continue;

      table.hook('creating', (_primKey, obj) => {
        if (this.isPulling) return;
        const cfg = this.getConfig();
        if (!cfg.autoSync) return;
        void this.syncSingleRecord(cfg, mapping.dexieTable, 'upsert', String(obj?.id || ''), obj);
      });

      table.hook('updating', (modifications, primKey, obj) => {
        if (this.isPulling) return;
        const cfg = this.getConfig();
        if (!cfg.autoSync) return;
        const merged = { ...obj, ...modifications };
        void this.syncSingleRecord(
          cfg,
          mapping.dexieTable,
          'upsert',
          String(primKey || merged.id || ''),
          merged
        );
      });

      table.hook('deleting', (primKey) => {
        if (this.isPulling) return;
        const cfg = this.getConfig();
        if (!cfg.autoSync) return;
        void this.syncSingleRecord(cfg, mapping.dexieTable, 'delete', String(primKey || ''));
      });
    }
  }

  private async syncSingleRecord(
    cfg: MySQLClientConfig,
    dexieTable: string,
    operation: 'upsert' | 'delete',
    recordId: string,
    record?: Record<string, unknown>
  ): Promise<void> {
    try {
      await fetch('/api/mysql/sync-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: cfg,
          dexieTable,
          operation,
          recordId,
          record,
        }),
      });
    } catch {
      // Silent background sync fallback
    }
  }

  /**
   * Renders the MySQL 5.5 / 8.0.28 Control Panel HTML (used in both Modal & Settings screen)
   */
  public renderControlPanelHTML(prefix = 'mysql-cp'): string {
    const cfg = this.getConfig();

    return `
      <div class="space-y-5 text-xs">
        <!-- Quick Download .SQL Dump Banner -->
        <div class="rounded-xl bg-gradient-to-r from-slate-900 to-sky-950 text-white p-5 border border-sky-800/60 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="rounded-md bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                  MySQL 5.5 & MySQL 8.0.28 Ready
                </span>
                <h3 class="text-sm font-bold text-white">
                  🗄️ ${i18n.bi('تنزيل قاعدة البيانات (.SQL) أو الربط المباشر بسيرفر MySQL', 'Download MySQL Database (.SQL) or Connect Live to MySQL Server')}
                </h3>
              </div>
              <p class="text-slate-300 text-[11px] leading-relaxed">
                ${i18n.bi(
                  'متوافق 100% مع MySQL 5.5 ومع mysql-installer-community-8.0.28.0 (InnoDB + UTF-8 بدون تعارض طول المفاتيح 767-byte). يضم 26 جدولاً لكافة أقسام المعمل والمخزون والمشتريات والحسابات.',
                  '100% compatible with both MySQL 5.5 and mysql-installer-community-8.0.28.0 (InnoDB + UTF-8). Includes all 26 relational tables and current records.'
                )}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                id="${prefix}-dl-full-sql"
                type="button"
                class="rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer shadow-xs"
              >
                ⬇ ${i18n.bi('تنزيل قاعدة البيانات كاملة (.SQL + البيانات)', 'Download Full Database (.SQL + Data)')}
              </button>
              <button
                id="${prefix}-dl-schema-sql"
                type="button"
                class="rounded-lg border border-white/25 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-white/20 cursor-pointer"
              >
                📄 ${i18n.bi('تنزيل هيكل الجداول فقط (Schema .SQL)', 'Download Schema Only (.SQL)')}
              </button>
            </div>
          </div>
        </div>

        <!-- Live MySQL Server Connection Settings -->
        <div class="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h4 class="text-sm font-bold text-slate-900">
                🔌 ${i18n.bi('إعدادات الاتصال المباشر بسيرفر MySQL (على جهازك أو السيرفر)', 'Live MySQL Server Connection (Local PC or Remote Server)')}
              </h4>
              <p class="text-[11px] text-slate-500">
                ${i18n.bi(
                  'أدخل بيانات سيرفر MySQL المثبت عبر mysql-installer-community-8.0.28.0 أو MySQL 5.5 لمزامنة الجداول والبيانات مباشرة:',
                  'Enter your MySQL 5.5 / 8.0.28 server credentials to initialize tables and sync data directly:'
                )}
              </p>
            </div>
            <span id="${prefix}-status-badge" class="rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold ${
              cfg.autoSync ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
            }">
              ${cfg.autoSync ? i18n.bi('المزامنة التلقائية: مفعلة', 'Auto-Sync: ON') : i18n.bi('الوضع: جاهز للربط', 'Status: Ready')}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Host (عنوان السيرفر)</label>
              <input
                id="${prefix}-host"
                type="text"
                value="${cfg.host}"
                placeholder="127.0.0.1"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Port (المنفذ)</label>
              <input
                id="${prefix}-port"
                type="number"
                value="${cfg.port}"
                placeholder="3306"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">User (اسم المستخدم)</label>
              <input
                id="${prefix}-user"
                type="text"
                value="${cfg.user}"
                placeholder="root"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Password (كلمة المرور)</label>
              <input
                id="${prefix}-password"
                type="password"
                value="${cfg.password || ''}"
                placeholder="••••••••"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Database (اسم القاعدة)</label>
              <input
                id="${prefix}-database"
                type="text"
                value="${cfg.database}"
                placeholder="tlab_db"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <label class="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                id="${prefix}-autosync"
                type="checkbox"
                ${cfg.autoSync ? 'checked' : ''}
                class="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span class="font-bold text-slate-800">
                ⚡ ${i18n.bi('حفظ ومزامنة أي إضافة أو تعديل أو حذف تلقائياً في سيرفر MySQL', 'Automatically sync every create/edit/delete action to MySQL Server')}
              </span>
            </label>

            <div class="flex flex-wrap items-center gap-2">
              <button
                id="${prefix}-save-cfg"
                type="button"
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                💾 ${i18n.bi('حفظ الإعدادات', 'Save Config')}
              </button>
              <button
                id="${prefix}-test-btn"
                type="button"
                class="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-700 cursor-pointer"
              >
                🔍 ${i18n.bi('1. اختبار الاتصال بالسيرفر', '1. Test Connection')}
              </button>
              <button
                id="${prefix}-push-btn"
                type="button"
                class="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
              >
                🚀 ${i18n.bi('2. إنشاء الجداول ورفع كافة البيانات إلى MySQL', '2. Create Tables & Push All Data to MySQL')}
              </button>
              <button
                id="${prefix}-pull-btn"
                type="button"
                class="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
              >
                📥 ${i18n.bi('3. سحب البيانات من سيرفر MySQL', '3. Pull Data from MySQL Server')}
              </button>
            </div>
          </div>

          <div id="${prefix}-result-box" class="hidden rounded-lg p-3 font-mono text-xs"></div>
        </div>

        <!-- Step-by-Step Guide for mysql-installer-community-8.0.28.0 & MySQL 5.5 -->
        <div class="rounded-xl bg-amber-50/80 border border-amber-200 p-4 space-y-2 text-slate-800">
          <div class="font-bold text-amber-900 text-xs">
            💡 ${i18n.bi('خطوات تشغيل قاعدة البيانات على جهازك باستخدام mysql-installer-community-8.0.28.0 أو MySQL 5.5:', 'How to set up mysql-installer-community-8.0.28.0 or MySQL 5.5 on your Windows PC / Server:')}
          </div>
          <ol class="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed text-slate-700">
            <li>
              <strong>${i18n.bi('الطريقة الأولى (استيراد ملف .SQL مباشرة):', 'Method 1 (Direct .SQL Import):')}</strong>
              ${i18n.bi(
                'اضغط زر «تنزيل قاعدة البيانات كاملة (.SQL + البيانات)» بالأعلى، ثم افتح MySQL Workbench 8.0 (الذي ينزل مع mysql-installer-community-8.0.28.0) ومن قائمة Server اختر Data Import ثم Import from Self-Contained File واختر الملف الذي قمت بتنزيله ثم اضغط Start Import.',
                'Click "Download Full Database (.SQL + Data)" above, open MySQL Workbench 8.0, go to Server -> Data Import -> Import from Self-Contained File, select the downloaded .sql file, and click Start Import.'
              )}
            </li>
            <li>
              <strong>${i18n.bi('الطريقة الثانية (الربط المباشر التلقائي من البرنامج):', 'Method 2 (Direct Live Connection):')}</strong>
              ${i18n.bi(
                'عند تشغيل البرنامج على جهازك بالأمر npm run dev، اكتب كلمة مرور الـ root التي اخترتها أثناء تثبيت mysql-installer-community-8.0.28.0، واضغط «1. اختبار الاتصال بالسيرفر» ثم «2. إنشاء الجداول ورفع كافة البيانات إلى MySQL»، وسيقوم البرنامج بإنشاء قاعدة البيانات tlab_db وجميع الـ 26 جدولاً ورفع البيانات تلقائياً!',
                'When running npm run dev on your machine, enter your MySQL root password above, click "1. Test Connection", then "2. Create Tables & Push All Data to MySQL".'
              )}
            </li>
            <li>
              <strong>${i18n.bi('ملاحظة هامة للتوافق بين MySQL 5.5 و MySQL 8.0.28:', 'Compatibility Note for MySQL 5.5 & 8.0.28:')}</strong>
              ${i18n.bi(
                'أثناء تثبيت mysql-installer-community-8.0.28.0 في خطوة Authentication Method يفضل اختيار (Use Legacy Authentication Method - Retain MySQL 5.x Compatibility) ليعمل مع كافة برامج MySQL 5.5 و 8.0 بدون أي مشاكل.',
                'During mysql-installer-community-8.0.28.0 setup under Authentication Method, select "Use Legacy Authentication Method (Retain MySQL 5.x Compatibility)" for seamless 5.5 & 8.0 support.'
              )}
            </li>
          </ol>
        </div>
      </div>
    `;
  }

  public bindControlPanelEvents(container: HTMLElement, prefix = 'mysql-cp'): void {
    const readFormConfig = (): MySQLClientConfig => {
      const host =
        (container.querySelector(`#${prefix}-host`) as HTMLInputElement | null)?.value.trim() ||
        '127.0.0.1';
      const port = Number(
        (container.querySelector(`#${prefix}-port`) as HTMLInputElement | null)?.value || 3306
      );
      const user =
        (container.querySelector(`#${prefix}-user`) as HTMLInputElement | null)?.value.trim() ||
        'root';
      const password =
        (container.querySelector(`#${prefix}-password`) as HTMLInputElement | null)?.value || '';
      const database =
        (
          container.querySelector(`#${prefix}-database`) as HTMLInputElement | null
        )?.value.trim() || 'tlab_db';
      const autoSync = Boolean(
        (container.querySelector(`#${prefix}-autosync`) as HTMLInputElement | null)?.checked
      );
      return { host, port, user, password, database, autoSync };
    };

    const showResult = (ok: boolean, msg: string) => {
      const box = container.querySelector(`#${prefix}-result-box`) as HTMLElement | null;
      if (!box) return;
      box.className = `rounded-lg p-3 font-mono text-xs ${
        ok
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
          : 'bg-rose-50 border border-rose-200 text-rose-900'
      }`;
      box.textContent = msg;
    };

    container.querySelector(`#${prefix}-dl-full-sql`)?.addEventListener('click', () => {
      const cfg = readFormConfig();
      this.saveConfig(cfg);
      void this.downloadSQLDump(true);
    });

    container.querySelector(`#${prefix}-dl-schema-sql`)?.addEventListener('click', () => {
      const cfg = readFormConfig();
      this.saveConfig(cfg);
      void this.downloadSQLDump(false);
    });

    container.querySelector(`#${prefix}-save-cfg`)?.addEventListener('click', () => {
      const cfg = readFormConfig();
      this.saveConfig(cfg);
      showResult(
        true,
        `✓ تم حفظ إعدادات الاتصال بنجاح (${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database})`
      );
      showToast(i18n.bi('تم حفظ إعدادات MySQL بنجاح', 'MySQL config saved'), 'success');
    });

    container.querySelector(`#${prefix}-test-btn`)?.addEventListener('click', async () => {
      const cfg = readFormConfig();
      this.saveConfig(cfg);
      showResult(true, '⏳ جاري اختبار الاتصال بسيرفر MySQL...');
      const res = await this.testConnection(cfg);
      if (res.ok) {
        showResult(
          true,
          `✓ متصل بنجاح! إصدار السيرفر: MySQL ${res.version} | القاعدة: ${cfg.database} | عدد الجداول الحالية: ${res.existingTablesCount}`
        );
        showToast(i18n.bi('تم الاتصال بسيرفر MySQL بنجاح', 'Connected to MySQL Server!'), 'success');
      } else {
        showResult(
          false,
          `✕ تعذر الاتصال بسيرفر MySQL (${cfg.host}:${cfg.port}): ${res.error || 'تأكد من تشغيل خدمة MySQL80 أو MySQL55 على جهازك'}`
        );
      }
    });

    container.querySelector(`#${prefix}-push-btn`)?.addEventListener('click', async () => {
      const cfg = readFormConfig();
      this.saveConfig(cfg);
      showResult(true, '⏳ جاري إنشاء الـ 26 جدولاً ورفع كافة البيانات إلى سيرفر MySQL...');
      const res = await this.pushAllToMySQL(cfg);
      if (res.ok) {
        showResult(
          true,
          `✓ تمت المزامنة الكاملة بنجاح! تم إنشاء/تحديث ${res.tablesCount} جدولاً ورفع ${res.totalRowsSynced} سجلاً إلى قاعدة بيانات (${cfg.database}) على MySQL ${res.version}`
        );
        showToast(
          i18n.bi(
            'تم رفع ومزامنة كافة البيانات إلى سيرفر MySQL بنجاح',
            'All data pushed to MySQL Server!'
          ),
          'success'
        );
      } else {
        showResult(
          false,
          `✕ فشل رفع البيانات إلى سيرفر MySQL: ${res.error || 'تأكد من تشغيل سيرفر MySQL على جهازك، أو استخدم زر (تنزيل قاعدة البيانات كاملة .SQL) لاستيرادها يدوياً.'}`
        );
      }
    });

    container.querySelector(`#${prefix}-pull-btn`)?.addEventListener('click', async () => {
      const cfg = readFormConfig();
      this.saveConfig(cfg);
      showResult(true, '⏳ جاري سحب كافة البيانات من سيرفر MySQL...');
      const res = await this.pullAllFromMySQL(cfg);
      if (res.ok) {
        showResult(
          true,
          `✓ تم سحب ${res.totalRowsPulled} سجلاً من قاعدة بيانات MySQL (${cfg.database}) وتحديث البرنامج بنجاح!`
        );
        showToast(
          i18n.bi('تم سحب البيانات من سيرفر MySQL بنجاح', 'Data pulled from MySQL Server!'),
          'success'
        );
      } else {
        showResult(false, `✕ تعذر سحب البيانات من سيرفر MySQL: ${res.error}`);
      }
    });
  }

  public openMySQLModal(): void {
    openModal(
      i18n.bi(
        '🗄️ إدارة قاعدة بيانات MySQL (5.5 / 8.0.28) وتنزيل ملف SQL',
        '🗄️ MySQL (5.5 / 8.0.28) Database Server & SQL Dump Manager'
      ),
      `
        <div id="mysql-modal-host">
          ${this.renderControlPanelHTML('mysql-modal')}
        </div>
        <div class="mt-4 flex justify-end border-t border-slate-200 pt-3">
          <button id="mysql-modal-close" type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
            ${i18n.dict.actions.cancel}
          </button>
        </div>
      `
    );

    const hostEl = document.getElementById('mysql-modal-host');
    if (hostEl) {
      this.bindControlPanelEvents(hostEl, 'mysql-modal');
    }
    document.getElementById('mysql-modal-close')?.addEventListener('click', () => closeModal());
  }
}

export const mysqlSyncService = new MySQLSyncService();
