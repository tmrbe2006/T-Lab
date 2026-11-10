import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  buildCreateTableSQL,
  MYSQL_TABLES_CONFIG,
  type MySQLTableMapping,
} from './src/db/mysql-schema';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT_CONFIG_FILE = path.join(__dirname, 'port.config.json');

function resolveRequestedPort(): number {
  // 1. CLI arguments: e.g. `npm run dev -- 4000` or `npm run dev -- --port 4000`
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--port' || arg === '-p') && args[i + 1]) {
      const p = Number(args[i + 1]);
      if (Number.isInteger(p) && p >= 80 && p <= 65535) return p;
    }
    if (arg.startsWith('--port=')) {
      const p = Number(arg.split('=')[1]);
      if (Number.isInteger(p) && p >= 80 && p <= 65535) return p;
    }
    if (/^\d{2,5}$/.test(arg)) {
      const p = Number(arg);
      if (p >= 80 && p <= 65535) return p;
    }
  }

  // 2. Environment variable PORT
  if (process.env.PORT) {
    const envPort = Number(process.env.PORT);
    if (Number.isInteger(envPort) && envPort >= 80 && envPort <= 65535) return envPort;
  }

  // 3. Saved port.config.json (used when running locally on Windows/Server outside cloud container)
  if (process.cwd() !== '/app/applet') {
    try {
      if (fs.existsSync(PORT_CONFIG_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(PORT_CONFIG_FILE, 'utf-8'));
        const savedPort = Number(parsed?.port);
        if (Number.isInteger(savedPort) && savedPort >= 80 && savedPort <= 65535) {
          return savedPort;
        }
      }
    } catch {
      // ignore
    }
  }

  return 3000;
}

export interface MySQLConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

function resolveConfig(bodyConfig?: Partial<MySQLConnectionConfig>): MySQLConnectionConfig {
  return {
    host: bodyConfig?.host || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(bodyConfig?.port || process.env.MYSQL_PORT || 3306),
    user: bodyConfig?.user || process.env.MYSQL_USER || 'root',
    password:
      bodyConfig?.password !== undefined
        ? bodyConfig.password
        : process.env.MYSQL_PASSWORD || '',
    database: (bodyConfig?.database || process.env.MYSQL_DATABASE || 'tlab_db').replace(
      /[^a-zA-Z0-9_]/g,
      ''
    ),
  };
}

async function getMySQLConnection(
  cfg: MySQLConnectionConfig,
  withDatabase = true
): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: withDatabase ? cfg.database : undefined,
    charset: 'utf8_general_ci',
    multipleStatements: true,
    connectTimeout: 8000,
  });
}

async function ensureDatabaseAndSchema(cfg: MySQLConnectionConfig): Promise<{
  version: string;
  tablesCreated: number;
}> {
  const rootConn = await getMySQLConnection(cfg, false);
  try {
    const [verRows] = await rootConn.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
    const version = String(verRows?.[0]?.version || 'MySQL');

    await rootConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;`
    );
    await rootConn.query(`USE \`${cfg.database}\`;`);

    for (const mapping of MYSQL_TABLES_CONFIG) {
      const ddl = buildCreateTableSQL(mapping);
      await rootConn.query(ddl);
    }

    return { version, tablesCreated: MYSQL_TABLES_CONFIG.length };
  } finally {
    await rootConn.end();
  }
}

async function upsertRowInMySQL(
  conn: mysql.Connection,
  mapping: MySQLTableMapping,
  row: Record<string, unknown>
): Promise<void> {
  const colNames = [...mapping.columns.map((c) => `\`${c.name}\``), '`raw_json`'].join(', ');
  const placeholders = [...mapping.columns.map(() => '?'), '?'].join(', ');
  const values = [
    ...mapping.columns.map((c) => c.extract(row)),
    JSON.stringify(row),
  ];

  await conn.execute(
    `REPLACE INTO \`${mapping.mysqlTable}\` (${colNames}) VALUES (${placeholders})`,
    values
  );
}

async function startServer() {
  const app = express();
  const PORT = resolveRequestedPort();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // 0. Get & Save Preferred Local Server Port (port.config.json)
  app.get('/api/server/port-config', (_req, res) => {
    let savedPort = PORT;
    try {
      if (fs.existsSync(PORT_CONFIG_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(PORT_CONFIG_FILE, 'utf-8'));
        if (parsed?.port) savedPort = Number(parsed.port);
      }
    } catch {
      // ignore
    }
    res.json({ ok: true, activePort: PORT, savedPort });
  });

  app.post('/api/server/port-config', (req, res) => {
    const newPort = Number(req.body?.port);
    if (!Number.isInteger(newPort) || newPort < 80 || newPort > 65535) {
      res.status(400).json({ ok: false, error: 'رقم البورت يجب أن يكون بين 80 و 65535' });
      return;
    }
    try {
      fs.writeFileSync(PORT_CONFIG_FILE, JSON.stringify({ port: newPort }, null, 2), 'utf-8');
      res.json({ ok: true, savedPort: newPort, activePort: PORT });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 0.b Save Server & MySQL settings directly into .env file
  app.post('/api/server/save-env', (req, res) => {
    const appPort = Number(req.body?.appPort || PORT || 3000);
    const cfg = resolveConfig(req.body?.config);
    const autoSync = req.body?.config?.autoSync !== false;

    const envText = [
      '# ============================================================================',
      '# T-Lab Medical Laboratory & ERP System - Server & MySQL Configuration (.env)',
      '# إعدادات تشغيل السيرفر وربط قاعدة بيانات MySQL (5.5 / 8.0.28)',
      '# ============================================================================',
      '',
      '# 1. إعدادات سيرفر البرنامج (Application Server Settings)',
      `PORT=${appPort}`,
      'HOST=0.0.0.0',
      'NODE_ENV=development',
      '',
      '# 2. إعدادات سيرفر قاعدة بيانات MySQL (MySQL 5.5 / MySQL 8.0.28 Server Settings)',
      `MYSQL_HOST=${cfg.host}`,
      `MYSQL_PORT=${cfg.port}`,
      `MYSQL_USER=${cfg.user}`,
      `MYSQL_PASSWORD=${cfg.password || ''}`,
      `MYSQL_DATABASE=${cfg.database}`,
      'MYSQL_CHARSET=utf8_general_ci',
      'MYSQL_CONNECTION_TIMEOUT=8000',
      '',
      '# 3. إعدادات المزامنة التلقائية مع MySQL (Auto-Sync Settings)',
      `MYSQL_AUTO_SYNC=${autoSync ? 'true' : 'false'}`,
      '',
      '# 4. إعدادات إضافية اختيارية (Optional External Integrations)',
      `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
      `APP_URL=http://localhost:${appPort}`,
      '',
    ].join('\n');

    try {
      const envFilePath = path.join(__dirname, '.env');
      fs.writeFileSync(envFilePath, envText, 'utf-8');
      fs.writeFileSync(PORT_CONFIG_FILE, JSON.stringify({ port: appPort }, null, 2), 'utf-8');
      process.env.MYSQL_HOST = cfg.host;
      process.env.MYSQL_PORT = String(cfg.port);
      process.env.MYSQL_USER = cfg.user;
      process.env.MYSQL_PASSWORD = cfg.password || '';
      process.env.MYSQL_DATABASE = cfg.database;
      res.json({ ok: true, envText });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 0.c Download Inno Setup 6 Script (tlab-setup.iss)
  app.get('/api/server/inno-setup-script', (_req, res) => {
    try {
      const issPath = path.join(__dirname, 'tlab-setup.iss');
      if (fs.existsSync(issPath)) {
        const content = fs.readFileSync(issPath, 'utf-8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="tlab-setup.iss"');
        res.send(content);
        return;
      }
      res.status(404).send('; tlab-setup.iss not found');
    } catch (err: unknown) {
      res.status(500).send(err instanceof Error ? err.message : String(err));
    }
  });

  // 1. Test MySQL 5.5 / 8.0.28 Connection
  app.post('/api/mysql/test-connection', async (req, res) => {
    const cfg = resolveConfig(req.body?.config);
    try {
      const conn = await getMySQLConnection(cfg, false);
      const [verRows] = await conn.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
      const version = String(verRows?.[0]?.version || 'Unknown');

      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;`
      );
      await conn.query(`USE \`${cfg.database}\`;`);
      const [tableRows] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES');
      await conn.end();

      res.json({
        ok: true,
        version,
        database: cfg.database,
        host: cfg.host,
        port: cfg.port,
        existingTablesCount: Array.isArray(tableRows) ? tableRows.length : 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({
        ok: false,
        error: message,
      });
    }
  });

  // 2. Initialize all 29+ T-Lab Tables in MySQL 5.5 / 8.0.28
  app.post('/api/mysql/init-schema', async (req, res) => {
    const cfg = resolveConfig(req.body?.config);
    try {
      const info = await ensureDatabaseAndSchema(cfg);
      res.json({
        ok: true,
        ...info,
        database: cfg.database,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  // 3. Push All Data from T-Lab to MySQL Server
  app.post('/api/mysql/push-all', async (req, res) => {
    const cfg = resolveConfig(req.body?.config);
    const tablesData = (req.body?.data || {}) as Record<string, Record<string, unknown>[]>;

    try {
      const info = await ensureDatabaseAndSchema(cfg);
      const conn = await getMySQLConnection(cfg, true);
      let totalRowsSynced = 0;

      try {
        await conn.beginTransaction();
        for (const mapping of MYSQL_TABLES_CONFIG) {
          const rows = tablesData[mapping.dexieTable] || [];
          for (const row of rows) {
            if (!row || !row.id) continue;
            await upsertRowInMySQL(conn, mapping, row);
            totalRowsSynced++;
          }
        }
        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        throw txErr;
      } finally {
        await conn.end();
      }

      res.json({
        ok: true,
        version: info.version,
        database: cfg.database,
        tablesCount: info.tablesCreated,
        totalRowsSynced,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  // 4. Pull All Data from MySQL Server into T-Lab
  app.post('/api/mysql/pull-all', async (req, res) => {
    const cfg = resolveConfig(req.body?.config);
    try {
      await ensureDatabaseAndSchema(cfg);
      const conn = await getMySQLConnection(cfg, true);
      const resultData: Record<string, Record<string, unknown>[]> = {};
      let totalRowsPulled = 0;

      try {
        for (const mapping of MYSQL_TABLES_CONFIG) {
          const [rows] = await conn.query<mysql.RowDataPacket[]>(
            `SELECT * FROM \`${mapping.mysqlTable}\``
          );
          const parsedRows: Record<string, unknown>[] = [];
          for (const r of rows) {
            if (r.raw_json && typeof r.raw_json === 'string') {
              try {
                parsedRows.push(JSON.parse(r.raw_json));
                totalRowsPulled++;
                continue;
              } catch {
                // fallback to relational columns if raw_json was modified manually in MySQL Workbench
              }
            }
            parsedRows.push({ ...r });
            totalRowsPulled++;
          }
          resultData[mapping.dexieTable] = parsedRows;
        }
      } finally {
        await conn.end();
      }

      res.json({
        ok: true,
        database: cfg.database,
        totalRowsPulled,
        data: resultData,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  // 5. Real-Time Single Record Sync (Insert / Update / Delete)
  app.post('/api/mysql/sync-change', async (req, res) => {
    const cfg = resolveConfig(req.body?.config);
    const { dexieTable, operation, recordId, record } = req.body as {
      dexieTable: string;
      operation: 'upsert' | 'delete';
      recordId: string;
      record?: Record<string, unknown>;
    };

    const mapping = MYSQL_TABLES_CONFIG.find((m) => m.dexieTable === dexieTable);
    if (!mapping) {
      res.json({ ok: true, skipped: true });
      return;
    }

    try {
      const conn = await getMySQLConnection(cfg, true);
      try {
        if (operation === 'delete' && recordId) {
          await conn.execute(`DELETE FROM \`${mapping.mysqlTable}\` WHERE \`id\` = ?`, [
            String(recordId),
          ]);
        } else if (operation === 'upsert' && record && record.id) {
          await upsertRowInMySQL(conn, mapping, record);
        }
      } finally {
        await conn.end();
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  const http = await import('http');
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const startListening = (portToTry: number) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && portToTry < 3010) {
        console.warn(`⚠️ Port ${portToTry} is busy, trying port ${portToTry + 1}...`);
        httpServer.removeListener('error', onError);
        startListening(portToTry + 1);
      } else {
        console.error('Server failed to start:', err);
      }
    };

    httpServer.once('error', onError);
    httpServer.listen(portToTry, '0.0.0.0', () => {
      httpServer.removeListener('error', onError);
      console.log(`\n============================================================`);
      console.log(`✅ T-Lab Server (MySQL 5.5 / 8.0.28 Ready) is running!`);
      console.log(`🌐 Open in browser: http://localhost:${portToTry}`);
      console.log(`============================================================\n`);
    });
  };

  startListening(PORT);
}

startServer();
