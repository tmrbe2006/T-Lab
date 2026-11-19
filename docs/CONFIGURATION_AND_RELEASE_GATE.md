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
