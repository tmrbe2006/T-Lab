# T-Lab branch-scoped MySQL finance migration — guarded READ pilot

## Current status
**Not ready for production. Not a complete MySQL-only conversion.**
This change gives the Windows pilot on port **3127** a server-verified MySQL read path for:
invoices, invoice items, payments, chart of accounts, journal entries, expenses,
cashbox sessions, daily closings and doctor commissions. Additional read-only
resources: cost centers and period locks. It does **not** migrate financial
transactions or replace all direct Dexie access in reports, ERP accounting,
commission payout and other services.

## Database migration, in this order
1. Back up the MySQL database and preserve the original browser IndexedDB profile.
2. Restore a verified copy into the **tlab_multibranch_pilot** test schema.
3. Apply the existing branch/user permission SQL migrations and all 49 table schemas.
4. Execute `sql/tlab_finance_branch_access_v6.sql` **only on that test copy**.
   It adds a branch association table and associates legacy records exclusively
   with `branch_main`. It does not import browser records.
5. Compare row counts and IDs of finance tables in MySQL Workbench. The
   empty MySQL table is **not** equivalent to the existing browser data.
6. Run the pilot, log in with an authorized app user, and select the correct branch.
7. Verify the authenticated `/api/branch-pilot/finance/invoices`,
   `payments`, `journalEntries`, `accounts`, `cashbox`,
   `dailyClosings`, `expenses` and `commissions` endpoints.
8. Run `/api/branch-pilot/finance-reconciliation` with a user authorized
   for invoices, payments and journal entries. This is a partial, read-only
   discrepancy report, not a full accounting audit.

## Safety behavior
- No browser fallback in pilot finance repositories when the server is down.
- Any unported repository write in pilot mode throws
  `MYSQL_FINANCE_WRITE_NOT_MIGRATED`, instead of silently changing Dexie.
- `financeTables` in the backend is a fixed whitelist; caller cannot supply
  table names. Read-only access requires a server session, active assigned
  branch and screen-specific view permission.
- Legacy records are mapped ONLY to the main branch; this is not an inference
  of an arbitrary historical branch.
- The EXE can still contain legacy local-storage code in other modules and
  is **not** certified as MySQL-only.
- Never delete IndexedDB, browser backups, or original SQL backups on the
  basis of successful table creation, green connection status, or this pilot.

## What must still be developed
- Verified one-way import and conflict-safe migration from all 49 browser stores.
- Transactional, server-authorized writes for invoices, receipts, allocations,
  commissions and full double-entry journals in one atomic transaction.
- Per-branch serial numbering, locking, reopening controls, no hard deletion
  of posted documents, auditable reversal entries and consistency rules.
- Replace direct Dexie operations across reports, ERP accounting, cashbox/day
  closing, home visit support services and the remaining modules.
- End-to-end tests against MySQL 5.5 and 8.0 (and concurrent branches) before
  releasing the Windows installer for real patients and financial records.
