-- T-Lab — all 49 MySQL store access links, additive migration ONLY.
-- IMPORTANT: Back up both MySQL AND browser IndexedDB first.
-- Run ONLY on a verified restored copy: tlab_multibranch_pilot.
-- Legacy records are explicitly assigned to branch_main; no auto-import.
USE `tlab_multibranch_pilot`;
CREATE TABLE IF NOT EXISTS `mysql_store_branch_access` (
 `store_name` VARCHAR(64) NOT NULL,
 `record_id` VARCHAR(64) NOT NULL,
 `branch_id` VARCHAR(64) NOT NULL,
 `created_at` DATETIME NOT NULL,
 `created_by` VARCHAR(64) NOT NULL,
 PRIMARY KEY (`store_name`,`record_id`,`branch_id`),
 KEY `idx_mysql_store_branch` (`store_name`,`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- patients -> patients
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'patients',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `patients` t;

-- doctorSpecialties -> doctor_specialties
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'doctorSpecialties',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `doctor_specialties` t;

-- doctors -> doctors
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'doctors',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `doctors` t;

-- scientificDepartments -> scientific_departments
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'scientificDepartments',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `scientific_departments` t;

-- sampleTubes -> sample_tubes
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'sampleTubes',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `sample_tubes` t;

-- tests -> lab_tests
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'tests',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `lab_tests` t;

-- testParameters -> test_parameters
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'testParameters',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `test_parameters` t;

-- requests -> lab_requests
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'requests',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `lab_requests` t;

-- requestItems -> request_items
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'requestItems',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `request_items` t;

-- samples -> samples
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'samples',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `samples` t;

-- results -> lab_results
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'results',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `lab_results` t;

-- invoices -> invoices
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'invoices',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `invoices` t;

-- invoiceItems -> invoice_items
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'invoiceItems',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `invoice_items` t;

-- payments -> payments
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'payments',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `payments` t;

-- expenses -> expenses
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'expenses',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `expenses` t;

-- commissions -> doctor_commissions
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'commissions',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `doctor_commissions` t;

-- inventoryItems -> inventory_items
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'inventoryItems',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `inventory_items` t;

-- inventoryLots -> inventory_lots
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'inventoryLots',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `inventory_lots` t;

-- stockMovements -> stock_movements
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'stockMovements',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `stock_movements` t;

-- testBOMs -> test_boms
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'testBOMs',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `test_boms` t;

-- stockTakingSessions -> stock_taking_sessions
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'stockTakingSessions',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `stock_taking_sessions` t;

-- suppliers -> suppliers
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'suppliers',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `suppliers` t;

-- purchaseInvoices -> purchase_invoices
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'purchaseInvoices',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `purchase_invoices` t;

-- returnNotes -> return_notes
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'returnNotes',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `return_notes` t;

-- chartOfAccounts -> chart_of_accounts
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'chartOfAccounts',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `chart_of_accounts` t;

-- journalEntries -> journal_entries
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'journalEntries',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `journal_entries` t;

-- costCenters -> cost_centers
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'costCenters',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `cost_centers` t;

-- periodLocks -> period_locks
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'periodLocks',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `period_locks` t;

-- cashboxSessions -> cashbox_sessions
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'cashboxSessions',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `cashbox_sessions` t;

-- dailyClosings -> daily_closings
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'dailyClosings',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `daily_closings` t;

-- employees -> employees
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'employees',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `employees` t;

-- users -> users
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'users',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `users` t;

-- roles -> roles
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'roles',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `roles` t;

-- permissions -> role_permissions
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'permissions',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `role_permissions` t;

-- settings -> lab_settings
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'settings',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `lab_settings` t;

-- auditLogs -> audit_logs
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'auditLogs',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `audit_logs` t;

-- microscopyScans -> microscopy_scans
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'microscopyScans',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `microscopy_scans` t;

-- aiImageAnalyses -> ai_image_analyses
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'aiImageAnalyses',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `ai_image_analyses` t;

-- aiRecognitionFindings -> ai_recognition_findings
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'aiRecognitionFindings',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `ai_recognition_findings` t;

-- aiCorrections -> ai_corrections
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'aiCorrections',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `ai_corrections` t;

-- criticalValueLogs -> critical_value_logs
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'criticalValueLogs',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `critical_value_logs` t;

-- cultureResults -> culture_results
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'cultureResults',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `culture_results` t;

-- antibioticsCatalog -> antibiotics_catalog
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'antibioticsCatalog',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `antibiotics_catalog` t;

-- qcControlLots -> qc_control_lots
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'qcControlLots',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `qc_control_lots` t;

-- qcRuns -> qc_runs
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'qcRuns',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `qc_runs` t;

-- homeVisits -> home_visits
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'homeVisits',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `home_visits` t;

-- corporateContracts -> corporate_contracts
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'corporateContracts',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `corporate_contracts` t;

-- referenceLabPartners -> reference_lab_partners
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'referenceLabPartners',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `reference_lab_partners` t;

-- labToLabDispatches -> lab_to_lab_dispatches
INSERT IGNORE INTO `mysql_store_branch_access`
 (`store_name`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'labToLabDispatches',t.`id`,'branch_main',NOW(),'legacy_migration'
FROM `lab_to_lab_dispatches` t;

SELECT store_name,branch_id,COUNT(*) AS mapped_records
FROM mysql_store_branch_access
GROUP BY store_name,branch_id ORDER BY store_name,branch_id;
