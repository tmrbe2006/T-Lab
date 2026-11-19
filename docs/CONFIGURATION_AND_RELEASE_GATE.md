# T-Lab — Configuration and deployment gates (development branch)

**Important: DO NOT INSTALL this branch on a live laboratory.** The protected staff pilot does not yet implement the entire clinical/financial workflow. The full Developer interface still relies on legacy IndexedDB stores. Keep the Pull Request in Draft and do not merge to main until all release blockers are resolved.

## Implemented server configuration

- Database connection is configured only on the Node.js server through `.env`, not per browser. MySQL passwords are never returned by the API.
- The Developer password must be set using a unique `TLAB_ADMIN_PASSWORD` (minimum 16 characters). Staff accounts use salted scrypt password hashes and server-session revocation.
- The Developer settings page now exposes technical MySQL readiness and server-backed role/action permissions for patients, requests, samples, preliminary results, unissued quotations and stock movements.
- The technical readiness API reveals no database credentials or patient records. Its status is explicitly **not** clinical release approval.
- `NODE_ENV=production` and `--static-dist` serve the compiled production UI. Missing `dist/index.html` fails closed instead of starting Vite development silently.
- `TLAB_ALLOW_SCHEMA_BOOTSTRAP=false` is the production default. Production startup must not create or migrate tables by itself. `TLAB_ENABLE_UNSAFE_BULK_IMPORT=false` and `TLAB_ENABLE_SNAPSHOT_PULL=false` keep legacy raw synchronization blocked.

## Non-destructive Windows installer safeguards

The two historical Inno Setup scripts were hardened: no global termination of `node.exe`, no Everyone-Full folder permissions, no full/clean SQL import task, no automatic SQL migration, and no replacement of an existing `.env` during upgrades. First installs require a strong Developer password; MySQL root passwords no longer appear as wizard defaults.

**Remaining installer blockers:** The scripts still bootstrap from source and depend on Node.js/npm on client Windows machines. They are not a signed, managed Windows service package. Strong OS ACL isolation for `.env` and safe stop/restart via a dedicated service identity still need development and a real Windows 11 acceptance test. A successful compiler run is not a valid production acceptance.

## Encrypted MySQL backup — developer/admin operator only

These commands are for a **test** instance, never as the first operation on a live database.

Generate a unique encryption key using PowerShell (Windows 11):

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Store the resulting 44-character key safely **outside GitHub and away from the backup files**. Set it as the server-only `TLAB_BACKUP_KEY` environment variable. The backup process needs a compatible `mysqldump` client installed and a MySQL account with permissions to export the entire application schema, routines, triggers and events.

```powershell
$env:TLAB_BACKUP_KEY = '<the separately saved key>'
$env:TLAB_BACKUP_DIR = 'D:\T-Lab-Encrypted-Backups'
node scripts/backup-mysql.mjs
node scripts/verify-backup.mjs 'D:\T-Lab-Encrypted-Backups\<actual-name>.sql.gz.enc'
```

The archive uses gzip plus AES-256-GCM authenticated encryption, not an unencrypted JSON browser export. The tool also writes SHA-256 checksum metadata. The archive includes staff password hashes and patient data: keep both file and key private; prefer a BitLocker-protected volume and restricted directory ACLs. An encrypted backup without its key is not restorable.

### Restore verification without touching original tables

Only on a disposable **test** MySQL host/schema, with the correct backup key available:

```powershell
$env:TLAB_ALLOW_TEST_RESTORE = 'true'
$env:TLAB_RESTORE_TEST_DATABASE = 'tlab_validation_restore_check'
node scripts/restore-check.mjs 'D:\T-Lab-Encrypted-Backups\<actual-name>.sql.gz.enc'
```

The tool refuses if the new target schema already exists or if it matches the original. It streams decrypted SQL directly into the MySQL client; the plain SQL is not written to disk. It then compares table counts between source and destination. **Row counts do not prove medical correctness**: verify sample record checksums, foreign-key relationships, account login and prints separately. The target schema is retained for manual inspection; it is never automatically deleted. Never use the restore-test tool as a production restore procedure.

## Mandatory validation checklist before release

| Area | Gate |
|---|---|
| Login and staff rights | Denied UI and denied API for every prohibited operation; no production seed credentials |
| Patient and request | Version conflicts, record linkage, no silent overwrite, bounded lists and audit |
| Samples | Multi-tube/multi-specimen workflow, barcode, receiving QC and analyzer interfaces |
| Results | Verified sex/age reference ranges, critical thresholds, independent approval, corrections and release |
| Financial | Official invoice numbering, fiscal/tax rules, journal balancing, payment idempotency, reversals, reconciliation |
| Inventory | Purchase receipts, expiry/QC, FEFO split-lot issuance, units, returns, BOM and stocktaking |
| Offline | Durable outbox, per-employee session isolation, encrypted cache, idempotent replay and conflicts |
| Backup | Encrypted full database dump and verified restore of secure authentication/clinical/financial tables |
| Windows | Server service account, restricted ACLs, safe upgrade/rollback, real network/print/barcode tests |
| Acceptance | Full workflows on a restored **test clone** of local MySQL 5.5, never patient production for pilot |

## Automated CI evidence

- TypeScript, full unit regression suite, security tests, Vite build and Chromium login/route smoke.
- Real MySQL 5.5 integration for authenticated users, patient and laboratory workflows, preliminary results, unissued quotations and pilot stock issue.
- Node built-in tests for backup encryption/tamper detection and installer safeguards.
- A real MySQL 5.5 synthetic-database dump and **isolated restore check** run in GitHub Actions when the client tools are available.
- Windows runner syntax compilation of Inno Setup (not a patient-safe installer release).

Any failing check is a blocking finding, not permission to deploy. The original `main` and customer's local MySQL database are not modified by these development commits.

## Verified CI run — 19 November 2026

Run: https://github.com/tmrbe2006/T-Lab/actions/runs/44594991516

All three jobs passed:
1. `verify`: TypeScript check, security tests, full Vitest suite, backup cryptography and installer safety tests, Vite production build, static-dist server smoke, and Chromium route smoke.
2. `mysql55`: real MySQL 5.5 schema and clinical/financial/stock integration tests, encrypted full synthetic SQL dump using a matching MySQL 5.5 client, verified decryption/checksum, restoration into an **entirely new test database** and comparison of row counts, and Chromium staff workflow.
3. `windows-installer`: Inno Setup 6 compilation on Windows.

### Legacy MySQL client requirement

Newer MariaDB 11 dump tools are incompatible with MySQL 5.5 metadata; use the **matching MySQL 5.5 mysqldump client** or another independently verified client version for backups. The CI workflow uses a disposable `mysql:5.5` client container. The restore-check uses a compatible SQL client and never points at the original schema.

MySQL 5.5 does not support modern TLS reliably. Backup tooling permits non-TLS only over loopback by default. For a trusted private LAN that cannot support TLS, `TLAB_BACKUP_ALLOW_PLAINTEXT_LAN=true` is an explicit exceptional opt-in; do not use this across the public internet. Prefer isolating MySQL 5.5 on a trusted LAN and upgrading to a supported server before production.

### Production schema setup constraint

`NODE_ENV=production` now **will not bootstrap or alter database tables automatically** unless `TLAB_ALLOW_SCHEMA_BOOTSTRAP=true` is explicitly set. On a new installation, an administrator must first create and validate schema on a disposable cloned MySQL database after backup review. Revert this flag to false after the controlled migration. Until then, application operations requiring missing tables will fail closed; this behavior is intentional.

## Follow-on phase — quarantined receipts and conservative clinical preflight

The protected MySQL v2 stock receiving endpoint now accepts a strictly validated item, new lot number, expiry date, 0.001-precision quantity and idempotency key. It is transactional, actor-auditable through the receipt record, permits no arbitrary QC status and creates the lot in `quarantine / pending` with **zero available balance**. It deliberately does not create purchase invoices, stock asset accounting or authorize QC release. Only Owner/Chemist can receive by default; Receptionist is denied. The guarded, paginated quarantine list and staff panel allow users to see quarantined batches without releasing them.

The clinical review queue now provides a `clinical-preflight` endpoint and check button. It explicitly reports release blockers such as unverified age/specimen ranges, critical limits and escalation, instrument QC and independent sign-off. It always returns `releaseAllowed:false` because existing MySQL reference-range fields lack a versioned lab-approved clinical interval protocol. It cannot approve results or produce patient reports. Real clinical sign-off needs a laboratory medical director and instrument validation; a software test is not sufficient.

Both features are backed by MySQL 5.5 integration tests. A successful test of a pilot must not be interpreted as successful implementation of the missing end-to-end purchasing or clinical-approval workflows.

## Pilot result entry UI and tests

The Technician/Chemist staff pilot now uses a server-side lookup for an existing **sample-received** request's ordered tests and the active noncalculated parameters. It displays the exact test/parameter names and units from MySQL, validates the entire parameter set when creating a draft, and separates `Save unapproved draft` from `Submit for review`. The original author must submit; stale-version or duplicate submissions are rejected. There is no clinical normal-range inference, critical-value interpretation, signature, PDF report or patient release.

The MySQL 5.5 integration test checks that only authorized clinical staff can retrieve parameters of the ordered test; browser staff E2E includes a synthetic numeric parameter and tests draft entry and submission through the staff UI. Only a successful end-to-end CI run confirms that full browser workflow.

## Independent stock QC decision workflow — safety extension

Quarantined reagent receipts now have a separate, server-enforced `inventoryQc` permission (initially Owner and Developer only) and an immutable MySQL decision record. A reviewer cannot be the same employee who received the lot. A `pass` records review evidence and marks `qc_status=reviewed_pass`, **but keeps the lot quarantined with zero available balance**. A `fail` marks the lot rejected. Concurrent duplicate decisions are refused under InnoDB locks, while retrying the same idempotency key returns the original decision. The UI exposes the manual evidence form for Owner only.

**This is NOT certified QC approval or authorization to use the reagent.** Independent laboratory quality-system verification, evidence retention, supplier invoice/stock valuation reconciliation, an approved release procedure, and actual lab UAT remain required. The application deliberately has no automatic usable-stock release after QC review.

## Read-only inventory balance reconciliation

The protected `GET /api/v2/inventory/reconciliation?limit=25` endpoint checks a bounded page of item balances against *QC-released, non-expired, available* lots in MySQL 5.5. It separately highlights expired previously-released lots, differences and invalid quantities. It returns `readOnly:true`; it NEVER corrects stock, credits or debits quantities, posts a journal, or treats quarantined lots as available. Owner/Chemist/Accountant can view by default; database grants control the API independently from the UI.

The integrated MySQL test inserts an intentionally inconsistent item balance and asserts an explicit `quantity_mismatch` with a 5.000-unit discrepancy. Reconciliation is advisory until all pages, opening balances, units, rounding policy and physical stock counts are verified. No automatic inventory adjustment is approved.
