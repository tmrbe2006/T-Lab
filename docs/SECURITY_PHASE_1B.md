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
