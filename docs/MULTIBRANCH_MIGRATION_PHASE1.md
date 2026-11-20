# T-Lab multi-branch migration — additive phase 1 (2026-11-20)

## Scope and safety
- Existing database: `tlab_db`. The script `sql/tlab_multibranch_additive_v1.sql` is additive, not a replacement for the original database.
- Creates nine branch-related tables; adds `branch_id` and an index on 26 **existing** operational tables when the column does not exist.
- Existing operational rows default to `branch_main`. Original IDs, catalog, reference parameters, scientific departments, doctor specialties, users and transactions remain intact.
- Does **not** move or delete data, reset permissions, import demo data, or auto-run a migration during Windows installation.
- Does **not** yet isolate SQL queries/updates by branch or provide an authenticated branch admin screen. **DO NOT use separate live branches or real clinical data under a claim of branch isolation until that work is completed and security-tested.**
- Existing patients, medical tests, and doctor catalogs remain global. Branch-specific prices are stored in `branch_test_prices`. This migration does not backfill inventory quantities or financial cross-branch consolidation.
- Stored procedures used to add columns are temporary and removed afterward. MySQL DDL auto-commits.

## Mandatory backup and validation
1. Stop client writes and take full `mysqldump --single-transaction --routines --triggers --events --default-character-set=utf8 tlab_db > tlab_before_multibranch.sql` with your working MySQL credentials, **or** export using Workbench. Confirm backup can be restored to a separate test database. Store backup securely.
2. Record row counts for `patients`, `lab_tests`, `test_parameters`, `lab_requests`, `lab_results`, `invoices`, `users`, `role_permissions` before migration.
3. On a restored **test copy**, change `USE \`tlab_db\`;` at the top of the migration to the copied schema name, then execute the SQL using MySQL Workbench. Check all 9 new tables and 26 intended new columns (where corresponding tables exist), and compare all pre/post counts and sample records.
4. Only then schedule production migration with backup and no concurrent writes. The migration script is repeatable for the expected original schema; it does not overwrite custom prices or branch assignments.
5. If the schema already uses a different `branch_id` representation or the database has divergent custom tables, **do not execute** automatically: inspect schema changes manually.

## Rollback
Git code rollback: `backup/main-before-multibranch-20261120`. Database rollback: restore the verified pre-migration dump to a **new** schema and reconcile recent writes; do not blindly run a destructive reverse script. A backup of Git source is NOT a backup of your MySQL data.

## Planned subsequent phases (not yet delivered)
1. Server-side sessions and role/branch authorization on **every** SQL endpoint, deny-by-default.
2. Branch administration, branch assignment, selection and safe scoped business repositories.
3. Request -> sample -> result -> approval -> invoice -> cashbox integrated tests for each branch, then separate prices and stock movement.
4. Consolidated financial reports and controlled inter-branch transfers.
5. Offline write queues, conflict reconciliation, idempotent event processing, audit trail and installation-level real Windows tests.

## Branch administration pilot — phase 2 increment
- The original `main` program now contains a **Branch Administration / إدارة الفروع** menu, shown to Owner and Developer in the browser.
- In the dedicated Windows pilot only, the separate `/api/branch-pilot` endpoints are enabled for loopback users on the same computer. The API verifies an active Owner/Developer account from the existing MySQL `users` table using a short-lived HttpOnly session before permitting a branch creation or an assignment.
- The pilot can register a branch and assign an existing active user to it. It cannot yet assign clinical requests and financial documents to newly created branches from their respective screens.
- **The legacy MySQL bulk/sync/config APIs are disabled in this pilot mode**, because they have no trustworthy server-side branch authorization. Ordinary single-lab mode is not changed by that opt-in protection.
- To access this screen, execute the additive migration in a disposable database restored from your backup, then edit the Windows pilot's own `.env` to point to that test schema. The MySQL `users` table must contain the Owner/Developer account being used. The branch screen requires a second sign-in with that account.
- The existing SQL dump contains plaintext legacy passwords inside `raw_json`. They are NOT suitable for network-wide production authentication. The branch pilot API is restricted to loopback and must not be exposed through a reverse proxy or internet-facing deployment.
- Neither multi-branch data isolation for **every** clinical/financial write nor audit/financial reconciliation has been completed. This is still a pilot.
- The `server/branch-access.ts` module implements deny-by-default policy: only active branches assigned to staff may be accessed, administrator roles may manage all active branches, and cross-branch records must be rejected. `server/branch-service.ts` implements parameterized branch metadata management and verifies administrator roles. The patient/invoice repositories still need to be wired into an authenticated server-side branch context.
