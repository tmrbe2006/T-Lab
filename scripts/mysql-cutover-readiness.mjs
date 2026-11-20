/**
 * Safety gate for a MySQL-only T-Lab release. Read-only source inspection.
 * Prints human/CI status and writes a JSON report. Does not touch user data.
 * Usage: node scripts/mysql-cutover-readiness.mjs [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const inventory = [];
const findings = [];
const excludedDirs = new Set(['tests']);
const sourceExt = /\.(ts|tsx)$/;
const patterns = [
  ['dexie-import', /(?:from\s*['"][^'"]*\/db\/database['"]|from\s*['"](?:\.\.?\/)+database['"]|\bimport\s+[^;]*\bDexie\b)/g],
  ['direct-browser-db', /\bdb\.(?:users|roles|permissions|employees|doctors|patients|tests|testParameters|requests|requestItems|samples|results|invoices|invoiceItems|payments|expenses|commissions|settings|auditLogs|chartOfAccounts|journalEntries|cashboxSessions|dailyClosings|inventoryItems|inventoryLots|stockMovements|testBOMs|stockTakingSessions|suppliers|purchaseInvoices|returnNotes|costCenters|periodLocks|doctorSpecialties|scientificDepartments|sampleTubes|microscopyScans|aiImageAnalyses|aiRecognitionFindings|aiCorrections|criticalValueLogs|cultureResults|qcControlLots|qcRuns|homeVisits|corporateContracts|antibioticsCatalog|labToLabDispatches|referenceLabPartners)\b|\bdb\.(?:table|transaction)\s*\(/g],
  ['indexeddb-direct', /\bindexedDB\s*\.|\bnew\s+Dexie\b/g],
  ['browser-authoritative-sync', /\b(?:syncGlobalMedicalCatalog|mysqlSyncService\.pull|mysqlSyncService\.push)\s*\(/g],
];
const skipPaths = new Set(['src/db/database.ts','src/db/mysql-schema.ts']);
function walk(folder) {
  for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
    const absolute = path.join(folder,entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) walk(absolute);
      continue;
    }
    if (!sourceExt.test(entry.name)) continue;
    const rel=path.relative(process.cwd(),absolute).replaceAll('\\','/');
    if (skipPaths.has(rel)) continue;
    const lines=fs.readFileSync(absolute,'utf8').split(/\r?\n/);
    inventory.push(rel);
    for (let i=0;i<lines.length;i++) {
      for (const [kind,regex] of patterns) {
        regex.lastIndex=0;
        if (regex.test(lines[i])) findings.push({file:rel,line:i+1,kind,sample:lines[i].trim().slice(0,160)});
      }
    }
  }
}
walk(root);
const byFile=Object.groupBy ? Object.groupBy(findings,x=>x.file) :
  findings.reduce((acc,item)=>((acc[item.file]??=[]).push(item),acc),{});
const report={
  releaseReady: findings.length===0,
  scannedFiles:inventory.length,
  browserAuthoritativeReferences:findings.length,
  affectedFiles:Object.keys(byFile).length,
  findings,
  blockers:[
    'A zero-reference static scan is necessary but not sufficient: verify 49 MySQL-backed APIs, per-branch RBAC, all workflows and data reconciliation.',
    'Never delete IndexedDB or browser backups before verified patient, result, invoice, payment and journal migration.',
    'Server loss must fail visibly; no browser cache or mock records may appear as authoritative MySQL data.',
  ],
};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/mysql-cutover-readiness.json',JSON.stringify(report,null,2)+'\n');
console.log('T-Lab MySQL-only readiness:',report.releaseReady?'STATIC CHECK PASS':'BLOCKED');
console.log('Scanned:',inventory.length,'files | Browser-source references:',findings.length,'in',report.affectedFiles,'files');
for (const item of findings.slice(0,80)) console.log(item.file+':'+item.line+' ['+item.kind+'] '+item.sample);
if(findings.length>80) console.log('... '+(findings.length-80)+' more references in JSON report');
console.log('Report: reports/mysql-cutover-readiness.json');
if(process.argv.includes('--strict') && !report.releaseReady)process.exitCode=1;
