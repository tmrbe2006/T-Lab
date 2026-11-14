import { GoogleGenAI, Type } from '@google/genai';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_FILE_PATH = path.join(__dirname, '.env');
const PORT_CONFIG_FILE = path.join(__dirname, 'port.config.json');

function reloadEnvFile(): void {
  try {
    if (fs.existsSync(ENV_FILE_PATH)) {
      dotenv.config({ path: ENV_FILE_PATH, override: true });
    } else {
      dotenv.config();
    }
  } catch {
    // ignore dotenv reload errors
  }
}

reloadEnvFile();

function resolveRequestedPort(): number {
  // Always use port 3000 inside the AI Studio preview container
  if (process.cwd() === '/app/applet') {
    return 3000;
  }

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

  // 2. Environment variable PORT from .env
  reloadEnvFile();
  if (process.env.PORT) {
    const envPort = Number(String(process.env.PORT).trim());
    if (Number.isInteger(envPort) && envPort >= 80 && envPort <= 65535) return envPort;
  }

  // 3. Saved port.config.json (used when running locally on Windows/Server outside cloud container)
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
  reloadEnvFile();
  const envHost = (process.env.MYSQL_HOST || '127.0.0.1').trim();
  const envPort = Number(String(process.env.MYSQL_PORT || '3306').trim()) || 3306;
  const envUser = (process.env.MYSQL_USER || 'root').trim();
  const envPassword = (process.env.MYSQL_PASSWORD || '').trim();
  const envDatabase = (process.env.MYSQL_DATABASE || 'tlab_db').trim();

  const bodyHost = typeof bodyConfig?.host === 'string' ? bodyConfig.host.trim() : '';
  const bodyPort = Number(bodyConfig?.port || 0);
  const bodyUser = typeof bodyConfig?.user === 'string' ? bodyConfig.user.trim() : '';
  const bodyPassword = typeof bodyConfig?.password === 'string' ? bodyConfig.password.trim() : '';
  const bodyDatabase = typeof bodyConfig?.database === 'string' ? bodyConfig.database.trim() : '';

  return {
    host: bodyHost || envHost || '127.0.0.1',
    port: bodyPort > 0 ? bodyPort : envPort,
    user: bodyUser || envUser || 'root',
    // Critical fix: do not let an empty browser localStorage password ("") override MYSQL_PASSWORD in .env
    password: bodyPassword !== '' ? bodyPassword : envPassword,
    database: (bodyDatabase || envDatabase || 'tlab_db').replace(/[^a-zA-Z0-9_]/g, ''),
  };
}

async function getMySQLConnection(
  cfg: MySQLConnectionConfig,
  withDatabase = true
): Promise<mysql.Connection> {
  const timeoutMs = Number(String(process.env.MYSQL_CONNECTION_TIMEOUT || '8000').trim()) || 8000;
  return mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: withDatabase ? cfg.database : undefined,
    charset: 'UTF8_GENERAL_CI',
    multipleStatements: true,
    connectTimeout: timeoutMs,
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

      // Ensure any newly added columns exist on pre-existing tables
      try {
        const [colRows] = await rootConn.query<mysql.RowDataPacket[]>(
          `SHOW COLUMNS FROM \`${mapping.mysqlTable}\``
        );
        const existingCols = new Set(
          (colRows || []).map((r) => String(r.Field || '').toLowerCase())
        );
        for (const col of mapping.columns) {
          if (!existingCols.has(col.name.toLowerCase())) {
            const cleanType = col.sqlType.replace(/PRIMARY KEY/gi, '').trim();
            await rootConn.query(
              `ALTER TABLE \`${mapping.mysqlTable}\` ADD COLUMN \`${col.name}\` ${cleanType}`
            );
          }
        }
        if (!existingCols.has('raw_json')) {
          await rootConn.query(
            `ALTER TABLE \`${mapping.mysqlTable}\` ADD COLUMN \`raw_json\` LONGTEXT`
          );
        }
      } catch {
        // ignore column check errors
      }
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

  // 0.d Return current .env MySQL configuration to the frontend
  app.get('/api/mysql/env-config', (_req, res) => {
    const cfg = resolveConfig();
    const autoSync =
      String(process.env.MYSQL_AUTO_SYNC || 'true').trim().toLowerCase() !== 'false';
    res.json({
      ok: true,
      config: {
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password || '',
        database: cfg.database,
        autoSync,
      },
    });
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

  // 6. White-Label Clinical Microscopy Vision Analyzer (Blood Film, Urine Sediment, Stool Parasitology)
  const modelQuotaCooldowns = new Map<string, number>();
  app.post('/api/microscopy/analyze', async (req, res) => {
    const {
      modality,
      imageBase64,
      mimeType = 'image/png',
      stainOrPrep = '',
      magnification = '40x HPF',
      clinicalNotes = '',
      morphometricHints = '',
    } = (req.body || {}) as {
      modality: 'blood_film' | 'urine_sediment' | 'stool_parasitology' | 'culture_plate';
      engineMode?: string;
      imageBase64: string;
      mimeType?: string;
      stainOrPrep?: string;
      magnification?: string;
      clinicalNotes?: string;
      morphometricHints?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ ok: false, error: 'Missing microscope image data' });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const modalityInstructions: Record<string, string> = {
      blood_film: `You are an expert Clinical Hematopathologist analyzing a Peripheral Blood Smear (فيلم صورة الدم).
Strictly forbid cross-modality anatomical contradictions (never report urine casts/crystals or stool ova in a blood film).
Classify every detected element into one of these exact groupKey values:
- "rbc": Red Blood Cells (Normocytic, Microcytic, Macrocytic, Normochromic, Hypochromic, Hyperchromic, Target cells/Codocytes, Sickle cells/Drepanocytes, Elliptocytes/Ovalocytes, Spherocytes, Teardrop/Dacrocytes, Acanthocytes/Spur cells [irregular 3-12 projections], Echinocytes/Burr cells [regular 10-30 short projections], Keratocytes/Bite/Helmet cells, Schistocytes/Fragmented RBCs, Stomatocytes, Rouleaux/Agglutination, Howell-Jolly bodies, Cabot rings, Basophilic stippling, Pappenheimer bodies).
- "wbc": White Blood Cells (Segmented Neutrophils, Band Neutrophils, Left Shift, Toxic Granulation, Döhle Bodies, Cytoplasmic Vacuolation, Hypersegmented Neutrophils [>=6 lobes], Pelger-Huët Anomaly, Chédiak-Higashi, Small Mature Lymphocytes, Large Granular Lymphocytes LGL, Atypical/Reactive Lymphocytes, Hairy Cells, Lymphoblasts, Mature Monocytes, Atypical Monocytes/Promonocytes, Mature Eosinophils, Atypical Eosinophils, Mature Basophils, Myeloblasts [check Auer rods], Promyelocytes, Myelocytes, Metamyelocytes, Plasma Cells, Megakaryocyte fragments, Smudge/Basket cells).
- "platelets": Platelets (Normal adequacy 7-20/HPF, Large/Giant Platelets >5µm, Microplatelets <1.5µm, Platelet Clumping/Satellitism, True Thrombocytopenia, Thrombocytosis).
- "parasites": Blood Parasites (Plasmodium falciparum [delicate rings, double chromatin dots, banana gametocytes], P. vivax & P. ovale [enlarged RBCs + Schüffner dots], P. malariae [band trophozoites + rosette schizonts], Babesia [Maltese cross tetrads without hemozoin], Microfilariae [Wuchereria bancrofti, Brugia malayi, Loa loa], Trypanosoma, Leishmania amastigotes).
- "artifacts": Smear Artifacts & Contaminants (Endothelial/Squamous Epithelial cells, Cryoglobulin/Crystal precipitates, Bacterial/Fungal overgrowth vs true bacteremia, Stain Precipitate).`,
      urine_sediment: `You are an expert Clinical Pathologist analyzing a Urine Sediment Wet Mount (فحص رواسب البول المجهري).
Strictly forbid cross-modality anatomical contradictions (never report intestinal stool ova like Ascaris/Trichuris/Taenia or blood smear elements in urine).
Classify every detected element into one of these exact groupKey values:
- "cells": Urinary Cells (Isomorphic RBCs [smooth 7µm discs], Dysmorphic RBCs [4 subtypes: Ring/Donut, Bleb/Acanthocyte G1 Mickey-Mouse ears, Mushroom, Star/Crenated], Ghost RBCs, Neutrophils/Pus Cells, Degenerated WBCs & Clumps, Glitter Cells, Urinary Monocytes/Histiocytes, Urinary Lymphocytes, Squamous Epithelial, Transitional/Urothelial [Superficial, Intermediate, Basal], Renal Tubular Epithelial RTE, Caudate Epithelial, Columnar Epithelial, Fatty Epithelial/Oval Fat Bodies).
- "casts": Urinary Casts (Hyaline, Coarse Granular [muddy brown], Fine Granular, RBC Casts, WBC Casts, RTE Epithelial Casts, Waxy Casts [broad, cracked edges, high refractive index], Fatty Casts [Maltese cross], Broad/Renal Failure Casts, Mixed Casts).
- "crystals": Urinary Crystals (Acidic pH<7: Calcium Oxalate Dihydrate [octahedral envelope] & Monohydrate [dumbbell/ovoid/spindle], Uric Acid [diamond/rhombic, rosette, barrel, needle], Amorphous Urates, Cystine [colorless hexagonal], Tyrosine [fine dark needle sheaves], Leucine [concentric oily spheres], Cholesterol [notched rectangular plates], Sulfonamides, Xanthine, Bilirubin; Alkaline pH>7: Triple Phosphate/Struvite [coffin-lid], Calcium Phosphate [stellar/rosette, needle, amorphous], Calcium Carbonate [tiny dumbbells/spheres], Ammonium Biurate [thornapple]; Drug Crystals: Ampicillin, Ceftriaxone, Acyclovir, Indinavir, Methotrexate).
- "microorganisms": Microorganisms & Parasites (Bacilli & Cocci Bacteria, Candida Budding Yeast & Pseudohyphae [do not lyse in acetic acid unlike RBCs], Trichomonas vaginalis, Schistosoma haematobium terminal-spine ova & S. mansoni lateral-spine spillover).
- "others": Other Elements & Artifacts (Spermatozoa, Mucus Threads, Cloth/Diaper Fibers [flat, sharp refractive edges unlike cylindrical casts], Free Lipid Droplets, Starch Granules [dimpled Y-hilum], Air Bubbles).`,
      stool_parasitology: `You are an expert Clinical Parasitologist analyzing a Stool Microscopy Wet Mount (فحص البراز المجهري).
Strictly forbid cross-modality anatomical contradictions (never report urinary casts or blood film cells in stool).
Classify every detected element into one of these exact groupKey values:
- "protozoa": Intestinal Protozoa (Entamoeba histolytica [trophozoite with ingested RBCs + central karyosome; 1-4 nuclei cyst with rounded chromatoid bars], E. coli [trophozoite with eccentric karyosome; large 1-8 nuclei cyst with splintered chromatoid bars], Endolimax nana [blot-like karyosome], Iodamoeba bütschlii [huge iodine-dark glycogen vacuole], Entamoeba hartmanni [<10µm], Giardia lamblia [pear-shaped owl-face trophozoite & oval 4-nuclei cyst], Chilomastix mesnili [lemon-shaped cyst with anterior knob], Dientamoeba fragilis, Balantidium coli [giant ciliated trophozoite & cyst with kidney macronucleus], Cryptosporidium oocysts [4-6µm], Cyclospora cayetanensis [8-10µm], Cystoisospora belli [25-30µm ellipsoidal], Sarcocystis, Microsporidia).
- "helminths": Helminths & Ova (Ascaris lumbricoides fertilized [mammillated golden-brown] & unfertilized [elongated 90µm], Trichuris trichiura [barrel-shaped with bipolar plugs], Enterobius vermicularis [flattened D-shaped], Ancylostoma duodenale & Necator americanus [thin transparent shell with 4-8 blastomeres], Toxocara spp., Schistosoma mansoni [lateral spine], S. haematobium [terminal spine], S. japonicum [minute lateral knob], Fasciola hepatica & Fasciolopsis buski [giant operculated 140µm], Paragonimus westermani, Clonorchis sinensis / Opisthorchis [small flask-shaped operculated with shoulders], Heterophyes heterophyes, Taenia saginata/solium [radially striated embryophore + 6-hooked oncosphere] & gravid proglottids, Hymenolepis nana [polar knobs WITH 4-8 polar filaments], Hymenolepis diminuta [NO polar filaments], Diphyllobothrium latum [operculated + abopercular knob], Dipylidium caninum egg packets).
- "larvae": Helminth Larvae (Strongyloides stercoralis rhabditiform larvae [short buccal cavity + prominent genital primordium] & filariform larvae, Trichinella spiralis).
- "cells": Cellular Elements (Fecal RBCs, Fecal WBCs/Pus Cells, Intestinal Epithelial Cells).
- "crystals": Fecal Crystals (Charcot-Leyden hexagonal bipyramidal compass-needle crystals, Hematoxylin/Fatty acid/Calcium oxalate crystals).
- "others": Digestion & Other Elements (Undigested striated muscle fibers [creatorrhea], Undigested starch granules [blue-black in iodine], Neutral fat globules [steatorrhea], Plant fibers/spirals/vegetable cells, Mucus strands, Food debris, Budding yeast/fungi, Enteric bacteria, Pollen/Spore artifacts).`,
      culture_plate: `You are an expert Clinical Microbiologist analyzing a Bacterial/Fungal Culture Petri Dish Plate or Kirby-Bauer AST Plate (فحص أطباق المزارع البكتيرية واختبارات الحساسية).
Identify the isolated bacterial or fungal species from colony morphology, pigmentation, hemolysis, lactose/mannitol/xylose/sucrose fermentation, and antibiotic inhibition zones across Urine Cultures, Stool Cultures, and Blood/Pus/Sputum Cultures.
Classify every detected element into one of these exact groupKey values:
- "uropathogens": Urinary Tract Culture Pathogens (Escherichia coli [CULT-URO-ECOLI: flat pink lactose-fermenting colonies on MacConkey, yellow opaque on CLED, metallic green sheen on EMB], Klebsiella pneumoniae [CULT-URO-KLEB: large dome-shaped mucoid pink colonies on MacConkey], Proteus mirabilis [CULT-URO-PROTEUS: concentric swarming on Blood Agar, pale NLF on MacConkey, blue-green translucent on CLED], Enterococcus faecalis [CULT-URO-ENTEROCOCCUS: pinpoint colonies, bile-esculin blackening], Staphylococcus saprophyticus [CULT-URO-SAPRO: Novobiocin resistant]).
- "enteric_pathogens": Stool & Enteric Culture Pathogens (Salmonella enterica/Typhi [CULT-ENT-SALMONELLA: red colonies with jet-black H2S centers on XLD, colorless with black center on SS agar], Shigella dysenteriae/sonnei [CULT-ENT-SHIGELLA: translucent red/pink colonies without black centers on XLD, green on Hektoen], Vibrio cholerae [CULT-ENT-VIBRIO: flat yellow sucrose-fermenting colonies on TCBS], Campylobacter jejuni [CULT-ENT-CAMPY: grey droplet/fried-egg colonies on Campy agar at 42C], E. coli O157:H7 [CULT-ENT-EHEC: colorless sorbitol-negative on SMAC]).
- "blood_pus_cocci": Blood, Pus & Wound Gram-Positive Cocci & Fastidious Isolates (Staphylococcus aureus & MRSA [CULT-COCCI-SAUREUS: golden-yellow colonies with clear Beta-hemolysis on Blood Agar, yellow halo on Mannitol Salt Agar MSA], Streptococcus pyogenes Group A [CULT-COCCI-SPYOGENES: pinpoint colonies with wide Beta-hemolysis, Bacitracin S], Streptococcus pneumoniae [CULT-COCCI-SPNEUMO: umbilicated draughtsman colonies with green Alpha-hemolysis, Optochin S], Streptococcus agalactiae Group B [CULT-COCCI-SAGALACTIAE: narrow Beta-hemolysis, arrowhead CAMP positive], Neisseria meningitidis / Haemophilus influenzae [CULT-COCCI-NEISSERIA: moist grey colonies on Chocolate Agar]).
- "non_fermenters_fungi": Non-Fermenters, Yeasts & Molds (Pseudomonas aeruginosa [CULT-NF-PSEUDOMONAS: flat spreading colonies with metallic sheen, grape odor, and blue-green pyocyanin pigment on Mueller-Hinton/Cetrimide], Acinetobacter baumannii [CULT-NF-ACINETO: smooth pale lavender NLF colonies on MacConkey, Oxidase negative], Candida albicans [CULT-FUNG-CANDIDA: creamy white pasty colonies on Sabouraud SDA, emerald-green on CHROMagar Candida], Aspergillus fumigatus [CULT-FUNG-ASPERGILLUS: smoky blue-green velvety mold with white margin]).
- "ast_resistance": Kirby-Bauer Disk Diffusion & Resistance Phenotypes (Susceptible Inhibition Zone [CULT-AST-SUSCEPTIBLE], ESBL Keyhole Double-Disk Synergy [CULT-AST-ESBL], MRSA Cefoxitin <=21mm Resistance [CULT-AST-MRSA], CRE Carbapenem Resistance [CULT-AST-CRE], Inducible Clindamycin D-Test [CULT-AST-DTEST]).`,
    };

    const systemPrompt = `${modalityInstructions[modality] || modalityInstructions.blood_film}
Stain/Preparation: ${stainOrPrep}. Magnification: ${magnification}.
Additional Context / Morphometric Features: ${clinicalNotes} ${morphometricHints}

Calibrate confidence scores strictly using the 5-Tier Clinical Confidence Scale:
- 95-100%: Confirmed Identification (تعرف مؤكد)
- 85-94%: High-Confidence Identification (تعرف عالي الثقة)
- 70-84%: Moderate-Confidence Identification (تعرف متوسط الثقة)
- 50-69%: Low Confidence - Specialist Review Recommended (تعرف منخفض الثقة - يُنصح بمراجعة أخصائي)
- < 50%: Uncertain - Requires Human Expert (غير مؤكد - يحتاج خبير بشري)

Return a strict JSON object with these exact keys:
- sampleQualityAr: Arabic description of slide staining, white balance, and focus quality.
- overallDiagnosisAr: Comprehensive Arabic clinical morphological interpretation (note that these are assistive microscopy findings requiring physician review).
- overallDiagnosisEn: Comprehensive English clinical morphological interpretation.
- clinicalRecommendationsAr: Actionable Arabic recommendations for follow-up or confirmatory tests.
- clinicalRecommendationsEn: Actionable English recommendations for follow-up or confirmatory tests.
- detectedItems: Array of detected morphological entities. Each item must have:
  - code: Atlas code if matching (e.g. "RBC-SICKLE", "URN-CRY-CAOX-DI", "STL-HEL-ASCARIS-FERT") or descriptive code
  - groupKey: Exact groupKey string from the modality instructions above
  - categoryAr: Group title in Arabic
  - categoryEn: Group title in English
  - nameAr: Precise Arabic name
  - nameEn: Precise English name
  - scientificName: Scientific/Latin name or morphological term
  - countOrGrade: Quantitative/semi-quantitative reading (e.g. "62%", "12-15 / HPF", "++ Moderate", "Seen (2 Ova / LPF)")
  - percentage: Numeric percentage if applicable (0-100)
  - confidence: Numeric confidence score (0 to 100)
  - severity: One of "normal", "mild", "moderate", "critical"
  - semanticColor: One of "green" (normal), "yellow" (note/mild), "red" (abnormal/critical)
  - clinicalSignificanceAr: Arabic explanation of clinical significance
  - clinicalSignificanceEn: English explanation of clinical significance
  - boundingBoxes: Array of 1 to 3 regions [{ "x": number (10-80), "y": number (10-80), "w": number (8-22), "h": number (8-22), "label": string }] indicating approximate percentage coordinates on the slide.`;

    let primaryResult: Record<string, unknown> | null = null;
    let verificationResult: Record<string, unknown> | null = null;

    // Stage 1: Primary Vision Engine with automatic multi-model quota failover
    if (process.env.GEMINI_API_KEY) {
      const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash'];
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          sampleQualityAr: { type: Type.STRING },
          overallDiagnosisAr: { type: Type.STRING },
          overallDiagnosisEn: { type: Type.STRING },
          clinicalRecommendationsAr: { type: Type.STRING },
          clinicalRecommendationsEn: { type: Type.STRING },
          detectedItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                groupKey: { type: Type.STRING },
                categoryAr: { type: Type.STRING },
                categoryEn: { type: Type.STRING },
                nameAr: { type: Type.STRING },
                nameEn: { type: Type.STRING },
                scientificName: { type: Type.STRING },
                countOrGrade: { type: Type.STRING },
                percentage: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER },
                severity: { type: Type.STRING },
                semanticColor: { type: Type.STRING },
                clinicalSignificanceAr: { type: Type.STRING },
                clinicalSignificanceEn: { type: Type.STRING },
                boundingBoxes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                      w: { type: Type.NUMBER },
                      h: { type: Type.NUMBER },
                      label: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        },
      };

      for (const modelName of candidateModels) {
        if (primaryResult) break;
        const cooldownUntil = modelQuotaCooldowns.get(modelName) || 0;
        if (Date.now() < cooldownUntil) continue;

        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/png',
                    data: cleanBase64,
                  },
                },
                {
                  text: systemPrompt,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema,
            },
          });

          const rawText = (response.text ?? '').trim();
          if (rawText) {
            primaryResult = JSON.parse(rawText);
          }
        } catch (gemErr) {
          const errMsg = gemErr instanceof Error ? gemErr.message : String(gemErr);
          if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
            // Put this model on cooldown for 15 minutes and transparently fall over to next model / stage
            modelQuotaCooldowns.set(modelName, Date.now() + 15 * 60 * 1000);
          }
        }
      }
    }

    // Stage 2: Secondary Verification Vision Engine
    try {
      const visionResp = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Verify and analyze this clinical microscopy slide and return the strict JSON report.' },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType || 'image/png'};base64,${cleanBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (visionResp.ok) {
        const visionJson = (await visionResp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = visionJson?.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && Array.isArray(parsed.detectedItems) && parsed.detectedItems.length > 0) {
            verificationResult = parsed;
          }
        }
      }
    } catch {
      // Verification fallback handled gracefully
    }

    // Stage 3: Merge & Cross-Verify Primary + Verification Results
    if (primaryResult && Array.isArray(primaryResult.detectedItems) && primaryResult.detectedItems.length > 0) {
      if (verificationResult && Array.isArray(verificationResult.detectedItems)) {
        const verItems = verificationResult.detectedItems as Array<Record<string, unknown>>;
        const mergedItems = (primaryResult.detectedItems as Array<Record<string, unknown>>).map((item) => {
          const match = verItems.find(
            (v) =>
              String(v.code || '').toUpperCase() === String(item.code || '').toUpperCase() ||
              String(v.nameEn || '').toLowerCase() === String(item.nameEn || '').toLowerCase()
          );
          if (match) {
            const c1 = Number(item.confidence) || 90;
            const c2 = Number(match.confidence) || 90;
            return {
              ...item,
              confidence: Math.min(99.6, Math.round(((c1 + c2) / 2 + 2.5) * 10) / 10),
            };
          }
          return item;
        });
        for (const vItem of verItems) {
          const exists = mergedItems.some(
            (m) => String(m.code || '').toUpperCase() === String(vItem.code || '').toUpperCase()
          );
          if (!exists && (Number(vItem.confidence) || 0) >= 75) {
            mergedItems.push(vItem);
          }
        }
        primaryResult.detectedItems = mergedItems;
      }
      res.json({ ok: true, result: primaryResult });
      return;
    }

    if (verificationResult && Array.isArray(verificationResult.detectedItems) && verificationResult.detectedItems.length > 0) {
      res.json({ ok: true, result: verificationResult });
      return;
    }

    res.json({ ok: false, useLocalMorphometricEngine: true });
  });

  const http = await import('http');
  const httpServer = http.createServer(app);

  const distPath = path.join(__dirname, 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const useStaticDist =
    process.env.NODE_ENV === 'production' &&
    process.cwd() !== '/app/applet' &&
    fs.existsSync(distIndexHtml);

  if (!useStaticDist) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexHtml);
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
