# T-Lab — Windows 11 / MySQL 5.5 acceptance gate

> **DRAFT ONLY.** Do not deploy the security branch to a live medical laboratory. It currently permits the server Developer bootstrap account and intentionally blocks legacy multi-device writes pending safe domain APIs.

## 1. Non-destructive preparation

- Use a cloned or blank **test** schema, never `tlab_db` with live patients.
- Back up the original MySQL 5.5 database using `mysqldump --single-transaction --routines --triggers --events --default-character-set=utf8` and verify the dump restores into a different schema. Keep a separate copy of any browser IndexedDB unsynced data.
- Run on a separate Windows test PC or a second app port. Never expose MySQL port 3306 or the application port directly to the internet.
- Keep production credentials in server `.env`, not browsers. Set a unique `TLAB_ADMIN_PASSWORD` of 16+ characters. Do not share it.
- Avoid running a new installer that terminates every `node.exe` process. Current historical installer behavior still needs remediation.

## 2. Current automated checks (in GitHub Actions)

- TypeScript typechecking, complete Vitest suite, production Vite build
- HTTP session and permission regression tests
- Chromium browser entry/login/logout and 40 route render smoke tests, screenshots as GitHub Actions artifacts
- MySQL **5.5** container: all mapped `CREATE TABLE` statements and a rollback transaction

Passing these does **not** verify real analyzer interfaces, network partitions, barcode printers, E2E invoices or clinical validation.

## 3. Release-blocking manual acceptance scenarios

| Workflow | Expected result |
|---|---|
| Failed login / expired session | HTTP 401, no database API access |
| Receptionist attempts to approve result | Denied in UI AND server, audit entry |
| Technician tries to modify invoice | Denied in UI AND server |
| Doctor reviews urgent result | Critical alert, explicit clinical sign-off and immutable history |
| Same test request edited on two PCs | A conflict is detected, no silent overwrite |
| One PC disconnects during dispense / payment | A durable queue replays exactly once, no duplicate financial entry |
| Patient -> tests -> samples -> result -> approval -> PDF | All IDs, timestamps and actors linked correctly |
| New request -> invoice -> payment -> journal | Double-entry balances and no duplicate invoice |
| Reagent lot expires | FEFO excludes expired lots; stock never negative |
| MySQL server outage and recovery | No irreversible deletions or silent data replacement |
| MySQL backup / restoration | Counts and sample checksums match after restoring |
| Windows workstation / real printers | Barcode and A4/80mm print layouts correct |

## 4. Remaining critical work

1. Complete MySQL-backed staff identity, strong salted password hashes, role-scoped server APIs and individual logout/session revocation.
2. Replace direct IndexedDB background hooks with validated transactional server commands; support multi-user conflict detection, durable offline queue, audit and strict delete semantics.
3. Remove demo plaintext passwords from production seed and SQL files, rotate credentials; isolate locally cached patient data between staff sessions.
4. Execute true full clinical / finance E2E and negative authorization cases against a test MySQL 5.5 server.
5. Repair Windows installer to terminate only its own process, run production build rather than Vite development middleware, support startup without an administrative account.
6. User UAT: clinic workflow, local network topology, scanner and lab printers on the user's own Windows machine.

## Gate

Do not merge PR #1 or direct live staff to the branch until **all** blockers above pass.
