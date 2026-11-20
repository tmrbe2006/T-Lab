# T-Lab — MySQL as the ONLY data source (migration specification)

## Target contract
All 49 existing IndexedDB/Dexie stores must become MySQL-backed. Reads, writes,
invoices, doctor payouts, ledger entries, patient records, laboratory results,
inventory, lookup catalogs, user permissions, configuration and logs must be
served by authenticated server APIs. The UI must never quietly fall back to
IndexedDB, mock data, or localStorage snapshots. Client storage may contain only
non-authoritative preferences such as UI theme.

**CURRENT STATUS: NOT COMPLETE.** The present Windows multi-branch pilot still
uses Dexie for major clinical and financial workflows. The MySQL connection
indicator is only a server health probe. DO NOT turn off or delete the existing
browser database until migration checks pass. A successful 49-table schema audit
does not imply all screens use MySQL.

## Safety snapshot
- Branch: `backup/main-before-mysql-only-migration-20261120` (saved before this work).
- The earlier patient and journal screenshots prove the pilot's MySQL tables
  can be empty even when browser data are present.
- From the MySQL panel in the Windows pilot, use **Backup all 49 browser stores**.
  The backup captures the existing records without seeding defaults,
  synchronizing, deleting or sending them to a remote server. The JSON file
  is highly confidential because it may contain health, financial and account
  information. Store encrypted and do not send it through email/chat.
- Back up MySQL separately, then test restoring both snapshots.
- Reject binary values that JSON would otherwise silently omit.
- Record checksums and compare row counts and identifiers before any import.

## Source-of-truth inventory
- `src/db/database.ts`: **49** registered Dexie stores.
- `src/db/mysql-schema.ts`: now **49** corresponding MySQL mappings.
- Newly mapped: `referenceLabPartners` and `labToLabDispatches`.
- Additive SQL: `sql/tlab_mysql_only_missing_tables_v4.sql` for the two
  missing relational tables. It targets the dedicated `tlab_multibranch_pilot`
  TEST database. It is not a general schema reset.
- `GET /api/branch-pilot/storage-audit`: Owner/Developer only; read-only
  table existence and exact MySQL row counts, with production readiness
  explicitly reported as false.
- Test: `src/tests/services/mysql-only-mapping-audit.test.ts` checks all 49
  stores and safe MySQL CREATE TABLE definitions.

## Required conversion order (do not skip cross-table dependencies)
1. **Backup and reconciled data migration**:
   - All 49 browser stores must be exported without mutation.
   - Read from the original database, including patient / physician records,
     test catalog, test parameters, invoices, payments, manual and automatic
     journal entries, doctor commissions, samples, test results, inventory,
     purchases, QC, microscopy and audit logs.
   - Compare by stable IDs, record counts, references, plus financial
     debit-credit and invoice-payment totals.
   - All imports must be dry-run previewed and conflict-safe. Never overwrite
     an existing MySQL record merely because IDs match; a human must reconcile
     conflicting field values. Preserve timestamps and provenance.
2. **Master tables and authentication**:
   - Users, roles, 38-screen-per-user-per-branch RBAC, scientific departments,
     tests, reference ranges, doctors, patients, contracts, partner labs.
   - Replace legacy plaintext password verification with a production-grade
     password hashing and session system before network exposure.
3. **Clinical transactions**:
   - Requests + request items, samples, results, approval workflows, critical
     results, home visits, microbiology, Lab-to-Lab dispatch and QC.
   - Each API must check the **server-verified selected branch and permission**.
4. **Financial transactions**:
   - Invoices, invoice items, payer claims, payments, commissions, chart of
     accounts, double-entry journals, expenses, cashbox and day closings.
   - Every document and associated ledger postings must commit in a single
     MySQL transaction. No hard deletion of posted documents; corrections
     require audit-preserving reversals.
5. **Inventory and procurement**:
   - Lots, movements, purchases, suppliers, returns, BOM, stock counts,
     branch transfers and balances. Use locking where concurrency matters.
6. **Support and media**:
   - Settings, audit log, AI microscopy, image attachments (binary storage),
     performance and reports. Do not JSON-serialize binary data silently.
7. **Strict MySQL-only cutover**:
   - Replace all direct `db.<store>`, `db.table(...)`, `Dexie`,
     `IndexedDB`, offline sync and test seeding paths in UI and services.
   - Run the complete acceptance matrix in **two simultaneous branches**, for
     two different staff permission sets, with server outage simulation.
   - With MySQL unreachable, writes MUST fail visibly; never continue locally.
   - Verify MySQL rows and counts in Workbench after each workflow.
   - Only after all checks pass, remove Dexie and the IndexedDB bootstrap from
     application dependencies. Do NOT delete historical browser data until
     verified restoration is documented.

## Acceptance criteria
- Same patient, invoice, result, payment and journal IDs/amounts appear in
  Workbench and in the app, including after browser cache/site data is cleared
  on a separate test profile.
- New records appear in MySQL immediately and do not require another user
  opening the app, a manual push button or page reload.
- Users cannot access records in branches to which they lack assignment.
- Staff rights differ by branch as configured by Owner/Developer.
- Every invoice's net total, allocations, collections, and posted journals
  balance to the cent; payables and reversals preserve their original entries.
- Backup/restore and non-destructive migration repeatedly pass tests on an
  isolated MySQL database.
- All 49 stores report matched imported row counts and no unresolved
  conflicts. Strict MySQL-only mode is explicitly enabled only after this.
