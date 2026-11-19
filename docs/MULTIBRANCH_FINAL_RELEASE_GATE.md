# T-Lab — Multi-Branch Implementation & Final Release Gate

**Status:** Multi-branch foundations and an isolated **patient → preliminary laboratory order → specimen received** pilot. **NOT a final clinical or accounting release.**

## Implemented on the draft feature branch

- MySQL 5.5-compatible `secure_lab_branches` registry and `secure_staff_branch_grants` membership table. Developer creates branches and grants/revokes access; receptionists only see branches assigned to them, while Owner/Developer can inspect all.
- Dedicated branch-scoped patient tables `secure_branch_patients`, `secure_branch_patient_audit`, with version checks, row locking, branch-filtered CRUD and immutable audit events; **not** an unchecked `branchId` from the browser.
- Dedicated request/specimen tables `secure_branch_requests`, `secure_branch_request_items`, `secure_branch_samples`, `secure_branch_lab_audit`. Patient is looked up under the same branch, catalog tests must be active, request creation and sample receipt are atomic, and a sample cannot be received twice.
- `/api/v3/branches/:branchId/...` routes enforce current authenticated server user, role permissions and the user-to-branch grant for **every** operation. Branch identification in the URL is a query scope, **not authorization**.
- Developer settings include a branch registry and employee assignment UI. Staff login switches to branch-scoped patient/order/sample workspace whenever `TLAB_MULTIBRANCH_MODE=true`.
- `TLAB_MULTIBRANCH_MODE=true` *blocks all old /api/v2 clinical, stock and finance endpoints* which have not been scoped, even for Developer. Legacy raw SQL is blocked regardless of `TLAB_ENABLE_LEGACY_API`. Clinical clearance remains `false` in readiness.
- Real MySQL 5.5 integration covers grant/revoke, cross-branch patient isolation, version conflicts, an order for a patient in another branch, access to another branch's requests and sample intake, exactly-one specimen, and audit history.

## Testing multi-branch locally — synthetic data ONLY

1. Install the **T-Lab SANDBOX PILOT**, create fresh `tlab_local_test`, initialize empty tables and synthetic catalog. See `docs/WINDOWS_SANDBOX_TRIAL_AR.md`.
2. Set `TLAB_MULTIBRANCH_MODE=true` inside the SANDBOX installation's `.env`. Never do this to an actual lab database or installation. Keep `HOST=127.0.0.1`, `MYSQL_AUTO_SYNC=false`, `TLAB_ENABLE_LEGACY_API=false`.
3. Start the sandbox and sign in as `developer`. Open **Settings / إعدادات** → **إعداد الفروع وصلاحيات الموظفين**, register two branches and give separate sample employee accounts to each (create sample users under secure staff accounts first).
4. Sign in as the first branch's Receptionist. Only their branch should appear. Create a synthetic patient and draft order. Sign in as that branch's Technician/Chemist and receive a sample. Repeat in the second branch. A user from branch A must never see the patient, request or sample of branch B.
5. Clinical reference intervals, results, medical review/release, invoices, payments, stock, purchase orders, consolidated accounting and offline cross-branch sync are deliberately blocked in multi-branch mode.

## Mandatory engineering work before calling this 'Final'

1. **Clinical:** distinct branch-scoped result data, normal ranges by age/sex/specimen, signed critical-value escalation, independent qualified review and immutable approved PDF reports.
2. **Financial:** branch-specific invoices, collections, VAT and refunds, approved chart-of-accounts, closed fiscal periods, ledger postings, reconciliation and cross-branch consolidated statements; permissions and audit.
3. **Inventory:** branch-local lot stock/QC; stock transfers must have linked dispatch/receipt and prevent double movement, with branch cost valuation.
4. **Staff:** branch-specific duties, permissions, shifts, locations and cross-branch reassignment approvals.
5. **Prices/operations:** per-branch service prices, printers/labels, instruments, referrals, supplier accounts, contracts and accounting legal entities.
6. **Connectivity:** explicit architecture (central database vs per-branch server), secure TLS and tenant-specific credentials, tested offline queue / replay / idempotency / conflict recovery if network independence is required.
7. **Migration:** review and migrate each old IndexedDB/Dexie module to server-enforced branch-aware domain APIs; backup and audited migrations with zero data loss.
8. **Acceptance:** real Windows 11 installer execution, 2+ actual sites, user acceptance and security testing including unauthorized cross-branch requests, printer/barcode integration, disaster recovery, and formal lab director/accountant sign-off.

**No final claim or production release** until all gates pass. The existing `main` branch and lab database remain unchanged.
