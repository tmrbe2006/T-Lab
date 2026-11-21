# T-Lab — all 49 stores MySQL cutover (isolated Windows evaluation)

**Status: READ-SIDE IMPLEMENTED IN BRANCH; PRODUCTION CUTOVER NOT APPROVED.**
This branch is a non-destructive implementation attempt, NOT a fully migrated application.

## What changed
- 49 exact mappings in `src/db/mysql-schema.ts`; all 49 have a corresponding
  `mysql_store_branch_access` association created by `sql/tlab_all_49_store_branch_access_v8.sql`.
- A server-only, authenticated `GET /api/branch-pilot/mysql-store/:store` supports
  every mapped table via a fixed whitelist, page sizes <=500, branch permissions and
  no API secrets/passwords in output.
- A browser transport fetches all MySQL pages and refuses local fallback.
- The port 3127 compatibility facade intercepts legacy `db.<store>` reads,
  including `toArray`, `get`, `where`, `count`, filters and ordering.
  Writes through this facade throw an explicit error. This prevents silently
  creating false clinical/financial records in browser IndexedDB.
- Startup no longer seeds or auto-syncs a secondary browser database in port 3127.
  Existing browser data are NOT deleted.
- Patients, doctors, visits and financial repositories have explicit MySQL read
  integration in the pilot. Unmigrated write operations are blocked.
- A verified browser JSON backup can be previewed and imported to a TEST MySQL
  schema using `scripts/import-browser-backup-to-mysql.ts`; conflicts block the import.
- The Windows installer build includes SQL, scripts and no-IndexedDB read tests.

## Required actions before any test

1. Make full recoverable MySQL and browser/IndexedDB backups. Browser backup is
   confidential medical/financial data. Store it encrypted and offline.
2. Restore MySQL to a separate database named `tlab_multibranch_pilot`.
3. Run existing schema SQL and branch permissions migrations. Then execute:
   `sql/tlab_all_49_store_branch_access_v8.sql`
4. Ensure `.env` points to that TEST database only. Do not expose the pilot
   HTTP server to the network.
5. Run from the repo or the installed pilot folder, using Node 22+ and tsx:

   Dry run (default, never writes):
   `node --import tsx --env-file=.env scripts/import-browser-backup-to-mysql.ts "C:\\secure\\backup.json"`

   Import only after independent backup and zero conflicts:
   `node --import tsx --env-file=.env scripts/import-browser-backup-to-mysql.ts "C:\\secure\\backup.json" --apply --confirm=IMPORT_INTO_TEST_DATABASE`

6. Reconcile patient IDs, test parameters, request/result IDs, invoice allocations,
   journal lines, doctor payouts, inventory balances and 49 table counts in Workbench.
7. Build the Windows pilot from
   `.github/workflows/windows-multibranch-phase1-exe.yml` and run it only
   against `tlab_multibranch_pilot`.
8. Validate multi-branch isolation, per-screen RBAC and unavailable MySQL errors.
   Run `npm run lint` and the complete Vitest/Windows installer checks.

## Important limitations / release blockers

- The legacy UI still contains many multi-table writes, including invoice posting,
  payment allocation, journal reversal, day closing, medical result approval,
  inventory receipts and doctor payout. Those are **not migrated**. The pilot
  blocks these local writes, and the affected screens may display errors rather
  than save. Do not issue clinical/financial documents from it.
- Generic read compatibility is not a complete Dexie API implementation;
  unsupported query chains require dedicated repository migration and testing.
- The import script does not reconcile semantic financial relationships: amount,
  debit/credit and reference checks must pass separately, against production-like
  test fixtures, before accepting an import.
- 49 tables created / mapped is not 49 transactional modules completed.
- No end-to-end MySQL integration or Windows EXE binary has been verified in this
  work. Do not merge this draft PR into main or distribute the installer as final.
- Auth uses legacy password verification in the local pilot and requires a
  production-grade credential migration before network access.

## Acceptance gate
Only label a release MySQL-only once every UI action reads/writes MySQL,
all 49 stores are reconciled, binary attachments are preserved, every branch
and role is enforced server-side, posted financial documents remain balanced,
and the Windows installer passes genuine MySQL integration tests with separate
browser profiles. Until then keep the primary release and original data intact.
