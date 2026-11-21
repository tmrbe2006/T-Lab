# T-Lab — Main branch MySQL repair v10 (2026-11-21)

This code is committed directly on **main**, as requested. The existing 49-table
schema and branch associations must already exist. This update never deletes
the old browser database or existing clinical and finance records.

## Schema order
1. Back up the current MySQL database using Workbench Data Export or `mysqldump`.
   Export the existing browser IndexedDB separately if it still has records
   missing from MySQL.
2. Restore a copy to test before applying to the live schema.
3. Original schema: `sql/tlab_mysql_only_all_49_tables_create_safe.sql`.
   **Do not rerun it blindly on a database with customized tables.**
4. If not previously applied: branch support v1, user-branch permissions v2,
   and the 49-store mapping v8. Never map other-branch records automatically.
5. Execute `sql/tlab_main_mysql_repair_v10.sql` against the **database selected
   in MySQL Workbench**, or with the `mysql` CLI database argument. It adds
   `tlab_mutation_audit_v10` and `tlab_qc_analyzers`; no DROP/TRUNCATE/DELETE.
6. Confirm each new table appears in Workbench and that the original patient,
   invoice, users, culture, QC and visit row counts remain identical.

## Implemented on main (local Windows port 3127)
- MySQL CRUD for corporate contracts, culture results, antibiotic catalog,
  QC lots/runs, branch-specific QC analyzer names and user accounts.
- A confirmation modal for contract archival; historical contract invoices,
  culture results and QC evidence are not physically deleted.
- Existing home-visit and patient MySQL APIs now use v8
  `mysql_store_branch_access`, with selected-branch isolation.
- Username changes/creation and password changes go through the server.
  New passwords are scrypt-hashed; the pre-existing plaintext-legacy accounts
  still require a planned credential upgrade and must never be exposed online.
- Role templates in MySQL are managed by Developer, plus per-user branch
  overrides; both are server enforced. Protected role actions cannot be
  cleared just because their UI checkboxes are disabled.
- The Windows 3127 startup no longer creates demo IndexedDB records or
  runs browser/MySQL synchronization before login. Errors fail closed.
- MySQL mutation/audit log, branch checks and role checks are enforced
  before accepted writes.

## IMPORTANT: limitations still requiring dedicated workflows
This is not yet a complete transactionally-migrated 49-store application.
Posted invoice reversals, doctor commission reversal, inventory movements,
purchases, specimen processing and results approval, accounting posting
and several report flows still have legacy Dexie code. Never label an EXE
from this main branch final or deploy live clinical transactions without a
full end-to-end DB audit. The `mysql-only-readiness` action is intended to
flag this incomplete work. A green TypeScript build alone cannot certify it.

## Build Windows EXE with current repo tooling
Use Windows 11 x64, Node.js 22 and Inno Setup 6:

```powershell
git clone https://github.com/tmrbe2006/T-Lab.git
cd T-Lab
npm install --no-audit --no-fund
npm run lint
npx vitest run
npm run build
New-Item -ItemType Directory -Force installer/package | Out-Null
Copy-Item dist,src,server,node_modules -Destination installer/package -Recurse -Force
Copy-Item server.ts,package.json -Destination installer/package -Force
Copy-Item sql,docs -Destination installer/package -Recurse -Force
Copy-Item installer/launch-multibranch-pilot.cmd -Destination installer/package -Force
Copy-Item (Get-Command node.exe).Source -Destination installer/package/node.exe
if(Test-Path public){Copy-Item public -Destination installer/package -Recurse -Force}
& ./installer/build-icon.ps1
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" ./installer/multibranch-pilot.iss
```

EXE output: `installer/Output/T-Lab_MultiBranch_Phase4_Finance_Windows.exe`.
This is a setup EXE with bundled Node runtime, not an embedded MySQL server.
It must connect to the MySQL instance in its own `.env`.

## Verification
- Confirm session user/branch and GET /api/branch-pilot/staff-session.
- Read/write contract and user data on authorized main branch.
- Confirm unauthorized staff or wrong branch gets 403/409, not browser fallback.
- Test add/edit/archive after refresh, with MySQL Workbench verifying each row.
- Reconcile existing local/browser-only records before discarding their profile.
- Test cultures and QC including analyzer catalog, screenshots/attachment data,
  linked results and audit trails before production use.
- Execute workflow `.github/workflows/windows-multibranch-phase1-exe.yml`
  and inspect all failed checks; do not use an outdated artifact.
