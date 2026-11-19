# T-Lab security migration — Phase 1b (draft, DO NOT DEPLOY)

This branch intentionally fails closed for API users except one server-authenticated Developer account. It is **not ready for everyday lab use**.

## Before testing

1. Take a full MySQL logical backup and verify restoration in a disposable MySQL 5.5 instance. Back up each browser's IndexedDB if it contains unsynchronized work.
2. Create a strong, unique server-only `TLAB_ADMIN_PASSWORD` in local `.env` (at least 16 characters); do not commit it. Do not reuse `dev123`.
3. Confirm MySQL credentials exist only in server `.env`. Restrict `.env` filesystem permissions and configure a least-privilege MySQL account. Existing `root` defaults are **not** recommended.
4. Start a **separate test instance** and open it from `http://localhost:<PORT>` for login. Never deploy this incomplete branch on a live patient network.
5. Log in using `developer` with your new `TLAB_ADMIN_PASSWORD`. All other staff accounts are deliberately disabled until server-side RBAC/individual accounts are implemented.
6. Run `npm run lint`, `npx vitest run server/api-security.test.ts src/guards/permission.guard.test.ts`, and `npm run build` before considering a merge.

## Expected behavior
- API access without valid HttpOnly session cookie: HTTP 401.
- Cross-origin browser request: HTTP 403.
- Wrong password: HTTP 401, throttled with HTTP 429 on repeated failures.
- `GET /api/mysql/env-config` no longer returns `password`.
- Browser submissions cannot select MySQL host/user/password/database (server-only .env).
- Browser can no longer write server `.env` via `/api/server/save-env`.
- Startup does not sync data before verifying the server session; an empty MySQL database does not trigger automatic upload of local demo records.

## Important remaining work (blocking production)
- Add server-managed individual staff accounts with salted password hashes, revocation, login audit trails and role-specific API permission checks (the server currently admits Developer only).
- Remove default credentials and demo users from production seed/SQL dumps, and migrate stored plaintext passwords.
- Enforce medical and financial authorization on EVERY DB write; replace browser-controlled sync with validated domain operations.
- Implement conflict-safe multi-device sync with durable queues, versioning and transactions. Current Dexie-to-MySQL sync is not safe for concurrent clinical work.
- Verify backup/restore, MySQL 5.5 compatibility, offline data privacy, and browser/session lifecycle with integration tests.
- Review patient data stored in IndexedDB and any already-exposed credentials; rotate secrets.

This step protects the API entry boundary but is intentionally incomplete. Keep the PR in **Draft** and **do not merge** until full migration and a green CI run.

## Phase 2: Server-side staff identities (November 19, 2026)

A separate `secure_auth_users` table is created in the configured MySQL 5.5 schema. It stores random IDs, unique usernames, active status, roles, version counters and salted scrypt hashes (no plaintext passwords). The server login issues an HttpOnly SameSite=Strict session cookie. Role/active/version are checked against MySQL on each authenticated staff request; changes immediately revoke prior sessions. Staff account CRUD is restricted to Developer on `/api/auth/staff` and the developer-only settings panel.

**This is account provisioning only, NOT clinical release.** Legacy data APIs are intentionally Developer-only and legacy background mutations are HTTP 423. Staff cannot use everyday laboratory screens yet. A successful staff login through `/api/auth/login` does not grant access to patient and financial records; this requires new server-authorized domain endpoints.

### Testing
- Run the existing GitHub CI workflow for full Vitest/Playwright checks and MySQL 5.5 integration tests.
- MySQL 5.5 tests create a staff account, verify scrypt salt and password validation, change role, deactivate and test live session invalidation and permissions.
- Never import older default demo passwords into `secure_auth_users`. Send each real employee a unique first-use password via an approved secure channel.
- The browser-based SQL dump generator intentionally does not export `secure_auth_users` (security-sensitive). Include this table in separately encrypted server-side `mysqldump` backups and verify a restore.
- Do not leave the historical source SQL dumps with demo credentials on any web-accessible production host.
- Set `TLAB_ENABLE_UNSAFE_BULK_IMPORT` and `TLAB_ENABLE_SNAPSHOT_PULL` unset/false in production. They exist only for explicitly controlled test-database migrations.
- The old Windows installer indiscriminately killed every Node.js process; this unsafe action was removed. Its generated stop script is deliberately nonfunctional until a dedicated service/PID-based shutdown command is implemented.

## Phase 3 — First protected clinical domain: patients (experimental)

Added `/api/v2/patients/:id` (GET/PATCH/DELETE) and `/api/v2/patients` (POST). The new API has the following properties:

- Uses the server-verified user identity, never a role supplied by the browser.
- Checks the `secure_role_permissions` table for `patients` and `view/add/edit/delete`, default-denying missing rows; Developer alone manages permissions through `GET/PUT /api/v2/permissions`.
- Uses new server-generated record IDs and client-visible version numbers; PATCH/DELETE require `version`, return HTTP 409 for stale updates, and serialize mutations using InnoDB `SELECT ... FOR UPDATE`.
- Changes patients and version records in the same MySQL transaction. Audit entries are written in the same transaction, recording actor, action, record ID and version (without patient medical details).
- DELETE performs soft-deactivation rather than irreversible destruction.
- Developer settings has an experimental permission grid for the patient domain.

**Important:** The old patient page continues to use Dexie/IndexedDB and is NOT connected to this API. Server-backed clinical screens must be migrated and regression tested before enabling real staff workflows. No direct browser password authentication and no automatic IndexedDB-to-MySQL raw writes may be restored. Medical images/clinical results, accounting, stock and offline queue need corresponding secure domains.

Testing: `server/mysql55.integration.test.ts` now exercises backend patient create/update/409 stale conflict/403 denial/permission change/audit on real MySQL 5.5. CI must be green before referencing it as verified.
