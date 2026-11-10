import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
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
  const PORT = Number(process.env.PORT || 3000);

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`T-Lab Server (with MySQL 5.5 / 8.0.28 Connector) running on http://localhost:${PORT}`);
  });
}

startServer();
