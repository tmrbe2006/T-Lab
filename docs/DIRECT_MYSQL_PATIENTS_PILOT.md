# T-Lab: Live MySQL patients — branch pilot

## What was broken
The green MySQL indicator checked whether the server could connect; the patient repository still used browser IndexedDB. These are different things.

## Implementation on main
- The patient screen on port 3127 now reads and writes through authenticated MySQL API endpoints. It never falls back to browser storage if MySQL fails.
- Patient listing is limited to the logged-in, selected, authorized branch. The API also checks patients screen permissions for non-admin users.
- Existing patient records are linked to branch_main. New branches do not receive access to those records automatically.
- Saving uses a MySQL transaction; removal is a guarded soft archive, not physical deletion of clinical records.
- The user interface distinguishes server connection status from MySQL patient records. Local browser request counts are not shown as if they were branch-scoped.

## Required migration (test database only)
1. Back up your MySQL database and verify you can restore it.
2. Confirm the pilot .env points to tlab_multibranch_pilot and the earlier branch/user permissions migration is applied.
3. Execute sql/tlab_patient_branch_access_v3.sql in MySQL Workbench against the pilot test schema. The script adds one new patient_branch_access table and maps existing patient IDs to branch_main. It does not delete or reset patient data.
4. Execute these verification queries:

```sql
USE tlab_multibranch_pilot;
SELECT COUNT(*) AS mysql_patients FROM patients;
SELECT COUNT(*) AS main_branch_patient_links FROM patient_branch_access WHERE branch_id='branch_main';
SELECT p.code, p.name, a.branch_id FROM patients p INNER JOIN patient_branch_access a ON a.patient_id = p.id LIMIT 20;
```

5. Restart the Windows pilot, log in, choose a permitted branch, and open Patients. Data must now come from MySQL, or an explicit error is shown.

## If MySQL has zero patients
This means the browser-only IndexedDB data were not yet imported. The migration does not invent missing records and does not automatically upload the browser data. Keep the original browser profile and data intact. Make a backup of browser records and compare patient IDs and codes against MySQL before an explicitly approved import.

## Pilot scope and safety
Only the Patients module is converted in this change. Requests, tests, invoices, results and finance may still use browser storage and are NOT yet fully branch-scoped in MySQL. Production use is not approved. Review the separate live-mysql-patients GitHub Actions integration test before using real clinical data.