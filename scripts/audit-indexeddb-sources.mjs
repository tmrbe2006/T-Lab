/**
 * T-Lab migration audit. It does NOT delete or alter browser data.
 * Run: node scripts/audit-indexeddb-sources.mjs
 * Run --strict to make CI FAIL until every browser-authoritative data path
 * has been safely replaced with a branch-scoped MySQL backend.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const findings = [];
const excluded = new Set([
  'src/db/mysql-schema.ts',
  'src/db/database.ts',
]);
const directAccess = /\bdb\.(?:users|roles|permissions|employees|doctors|patients|tests|testParameters|requests|requestItems|samples|results|invoices|invoiceItems|payments|expenses|commissions|settings|auditLogs|chartOfAccounts|journalEntries|cashboxSessions|dailyClosings|inventoryItems|inventoryLots|stockMovements|testBOMs|stockTakingSessions|suppliers|purchaseInvoices|returnNotes|costCenters|periodLocks|doctorSpecialties|scientificDepartments|sampleTubes|microscopyScans|aiImageAnalyses|aiRecognitionFindings|aiCorrections|criticalValueLogs|cultureResults|qcControlLots|qcRuns|homeVisits|corporateContracts|antibioticsCatalog|labToLabDispatches|referenceLabPartners)\b|\bdb\.table\s*\(|\bdb\.transaction\s*\(|\bindexedDB\.|\bnew Dexie\b/g;

function walk(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const absolute=path.join(dir,entry.name);
    if (entry.isDirectory()) {
      if (entry.name!=='tests') walk(absolute);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const relative=path.relative(process.cwd(),absolute).replaceAll('\\','/');
    if (excluded.has(relative)) continue;
    const lines=fs.readFileSync(absolute,'utf8').split(/\r?\n/);
    lines.forEach((line,index)=>{
      if (directAccess.test(line)) findings.push({path:relative,line:index+1,snippet:line.trim().slice(0,145)});
      directAccess.lastIndex=0;
    });
  }
}
walk(root);
const paths=new Set(findings.map(x=>x.path));
console.log('T-Lab MySQL-only cutover check: '+findings.length+' direct IndexedDB/Dexie operations across '+paths.size+' source files');
for(const item of findings.slice(0,120))console.log(item.path+':'+item.line+' '+item.snippet);
if(findings.length>120)console.log('... '+(findings.length-120)+' additional references');
if(process.argv.includes('--strict') && findings.length) {
  console.error('BLOCKED: do not remove IndexedDB until each source has a verified MySQL replacement and safe data migration.');
  process.exitCode=1;
}
