-- T-Lab Unified MySQL schema v11 | MySQL 5.5 and 8.0
-- 49 mapped tables + additive branch schema + RBAC + per-store access
-- + non-destructive mutation audit and QC analyzer tables.
--
-- IMPORTANT:
-- 1. Full backup before execution. MySQL DDL cannot be rolled back.
-- 2. On existing databases, CREATE TABLE IF NOT EXISTS cannot repair missing
--    columns. Check schema audit before applying it.
-- 3. This script preserves existing rows and does not import browser IndexedDB data.
-- 4. Existing records are mapped to branch_main by the v8 migration.
-- 5. Change the USE statement to match your *actual* MySQL schema.
-- 6. Run on restored copy and compare row counts before live use.
-- 7. No destructive DROP TABLE/TRUNCATE/DELETE of patient or finance rows.
--    The only DROP below is the helper PROCEDURE from additive v1.
USE `tlab_multibranch_pilot`;
SET NAMES utf8;

-- START INCLUDED sql/tlab_mysql_only_all_49_tables_create_safe.sql
-- T-Lab MySQL-only schema preparation: 49 mapped tables
-- MySQL 5.5 and 8.0.28 compatible. NO existing row is deleted, modified, or overwritten.
-- CREATE TABLE IF NOT EXISTS DOES NOT REPAIR missing columns on already existing tables.
-- First take a full verified backup; run on a restored TEST copy only.
-- For existing tables use /api/branch-pilot/storage-audit to identify missing columns.
-- DO NOT use legacy full SQL dump: it contains destructive DROP/TRUNCATE.

-- Target schema selected at top of unified migration.
SET NAMES utf8;

-- Dexie store: patients | MySQL: patients
CREATE TABLE IF NOT EXISTS `patients` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `gender` VARCHAR(16),
  `age` INT DEFAULT 0,
  `birth_date` VARCHAR(32),
  `phone` VARCHAR(64),
  `national_id` VARCHAR(64),
  `address` VARCHAR(255),
  `default_discount` DECIMAL(10,2) DEFAULT 0.00,
  `created_at` VARCHAR(32),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_patients_code (code),
  INDEX idx_patients_phone (phone),
  INDEX idx_patients_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: doctorSpecialties | MySQL: doctor_specialties
CREATE TABLE IF NOT EXISTS `doctor_specialties` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `notes` VARCHAR(255),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_doc_spec_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: doctors | MySQL: doctors
CREATE TABLE IF NOT EXISTS `doctors` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `specialty` VARCHAR(128),
  `phone` VARCHAR(64),
  `type` VARCHAR(32),
  `commission_rate` DECIMAL(10,2) DEFAULT 0.00,
  `commission_enabled` TINYINT(1) DEFAULT 1,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_doctors_code (code),
  INDEX idx_doctors_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: scientificDepartments | MySQL: scientific_departments
CREATE TABLE IF NOT EXISTS `scientific_departments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `notes` VARCHAR(255),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_sci_dept_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: sampleTubes | MySQL: sample_tubes
CREATE TABLE IF NOT EXISTS `sample_tubes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `cap_color` VARCHAR(64),
  `additive` VARCHAR(128),
  `notes` VARCHAR(255),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_sample_tubes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: tests | MySQL: lab_tests
CREATE TABLE IF NOT EXISTS `lab_tests` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `department` VARCHAR(128),
  `sample_type` VARCHAR(128),
  `tube_type` VARCHAR(128),
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `tat_hours` INT DEFAULT 24,
  `commission_eligible` TINYINT(1) DEFAULT 1,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_tests_code (code),
  INDEX idx_tests_dept (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: testParameters | MySQL: test_parameters
CREATE TABLE IF NOT EXISTS `test_parameters` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `test_id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(64),
  `name_ar` VARCHAR(191),
  `name_en` VARCHAR(191),
  `unit` VARCHAR(64),
  `normal_male_min` DECIMAL(12,4) DEFAULT 0,
  `normal_male_max` DECIMAL(12,4) DEFAULT 0,
  `normal_female_min` DECIMAL(12,4) DEFAULT 0,
  `normal_female_max` DECIMAL(12,4) DEFAULT 0,
  `normal_range_text` VARCHAR(255),
  `critical_low` DECIMAL(12,4) DEFAULT 0,
  `critical_high` DECIMAL(12,4) DEFAULT 0,
  `result_type` VARCHAR(32),
  `decimal_places` INT DEFAULT 1,
  `is_calculated` TINYINT(1) DEFAULT 0,
  `formula` VARCHAR(255),
  `formula_condition` VARCHAR(191),
  `sort_order` INT DEFAULT 1,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_test_params_test (test_id),
  INDEX idx_test_params_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: requests | MySQL: lab_requests
CREATE TABLE IF NOT EXISTS `lab_requests` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `request_number` VARCHAR(64) NOT NULL,
  `barcode` VARCHAR(64),
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64),
  `type` VARCHAR(32),
  `status` VARCHAR(32),
  `priority` VARCHAR(32),
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_req_number (request_number),
  INDEX idx_req_patient (patient_id),
  INDEX idx_req_status (status),
  INDEX idx_req_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: requestItems | MySQL: request_items
CREATE TABLE IF NOT EXISTS `request_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `request_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64) NOT NULL,
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_req_items_req (request_id),
  INDEX idx_req_items_test (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: samples | MySQL: samples
CREATE TABLE IF NOT EXISTS `samples` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `sample_code` VARCHAR(64) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `sample_type` VARCHAR(128),
  `status` VARCHAR(32),
  `collected_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_samples_code (sample_code),
  INDEX idx_samples_req (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: results | MySQL: lab_results
CREATE TABLE IF NOT EXISTS `lab_results` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `request_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32),
  `has_critical` TINYINT(1) DEFAULT 0,
  `approved_by` VARCHAR(64),
  `approved_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_results_req (request_id),
  INDEX idx_results_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: invoices | MySQL: invoices
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL,
  `request_id` VARCHAR(64),
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64),
  `date` VARCHAR(32),
  `subtotal` DECIMAL(14,2) DEFAULT 0.00,
  `discount_amount` DECIMAL(14,2) DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) DEFAULT 0.00,
  `net_total` DECIMAL(14,2) DEFAULT 0.00,
  `paid_amount` DECIMAL(14,2) DEFAULT 0.00,
  `remaining_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_inv_num (invoice_number),
  INDEX idx_inv_patient (patient_id),
  INDEX idx_inv_date (date),
  INDEX idx_inv_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: invoiceItems | MySQL: invoice_items
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64) NOT NULL,
  `test_name_ar` VARCHAR(191),
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `net_after_discount_tax` DECIMAL(12,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_inv_items_inv (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: payments | MySQL: payments
CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payment_number` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(14,2) DEFAULT 0.00,
  `method` VARCHAR(32),
  `date` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_pay_inv (invoice_id),
  INDEX idx_pay_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: expenses | MySQL: expenses
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `expense_number` VARCHAR(64) NOT NULL,
  `category` VARCHAR(128) NOT NULL,
  `amount` DECIMAL(14,2) DEFAULT 0.00,
  `date` VARCHAR(32),
  `notes` VARCHAR(255),
  `created_by` VARCHAR(64),
  `raw_json` LONGTEXT,
  INDEX idx_exp_date (date),
  INDEX idx_exp_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: commissions | MySQL: doctor_commissions
CREATE TABLE IF NOT EXISTS `doctor_commissions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `doctor_id` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `commission_rate` DECIMAL(10,2) DEFAULT 0.00,
  `commission_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `date` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_comm_doc (doctor_id),
  INDEX idx_comm_inv (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: inventoryItems | MySQL: inventory_items
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `barcode` VARCHAR(64),
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `category` VARCHAR(64),
  `current_stock` DECIMAL(14,3) DEFAULT 0.000,
  `min_stock_level` DECIMAL(14,3) DEFAULT 0.000,
  `average_cost` DECIMAL(14,2) DEFAULT 0.00,
  `supplier_id` VARCHAR(64),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_inv_item_code (code),
  INDEX idx_inv_item_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: inventoryLots | MySQL: inventory_lots
CREATE TABLE IF NOT EXISTS `inventory_lots` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `lot_number` VARCHAR(64) NOT NULL,
  `item_id` VARCHAR(64) NOT NULL,
  `expiry_date` VARCHAR(32),
  `initial_qty` DECIMAL(14,3) DEFAULT 0.000,
  `remaining_qty` DECIMAL(14,3) DEFAULT 0.000,
  `unit_cost` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `qc_status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_lots_item (item_id),
  INDEX idx_lots_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: stockMovements | MySQL: stock_movements
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `movement_number` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32),
  `item_id` VARCHAR(64) NOT NULL,
  `lot_id` VARCHAR(64),
  `quantity` DECIMAL(14,3) DEFAULT 0.000,
  `total_cost` DECIMAL(14,2) DEFAULT 0.00,
  `date` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_mov_item (item_id),
  INDEX idx_mov_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: testBOMs | MySQL: test_boms
CREATE TABLE IF NOT EXISTS `test_boms` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `test_id` VARCHAR(64) NOT NULL,
  `test_code` VARCHAR(64),
  `test_name_ar` VARCHAR(191),
  `direct_reagent_cost` DECIMAL(14,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_bom_test (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: stockTakingSessions | MySQL: stock_taking_sessions
CREATE TABLE IF NOT EXISTS `stock_taking_sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `session_number` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32),
  `warehouse` VARCHAR(128),
  `status` VARCHAR(32),
  `total_variance_value` DECIMAL(14,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_stock_take_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: suppliers | MySQL: suppliers
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `phone` VARCHAR(64),
  `tax_number` VARCHAR(64),
  `current_balance` DECIMAL(14,2) DEFAULT 0.00,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_sup_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: purchaseInvoices | MySQL: purchase_invoices
CREATE TABLE IF NOT EXISTS `purchase_invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL,
  `supplier_id` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32),
  `net_total` DECIMAL(14,2) DEFAULT 0.00,
  `paid_amount` DECIMAL(14,2) DEFAULT 0.00,
  `remaining_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_pur_sup (supplier_id),
  INDEX idx_pur_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: returnNotes | MySQL: return_notes
CREATE TABLE IF NOT EXISTS `return_notes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `note_number` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32),
  `original_invoice_id` VARCHAR(64),
  `date` VARCHAR(32),
  `net_return_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_ret_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: chartOfAccounts | MySQL: chart_of_accounts
CREATE TABLE IF NOT EXISTS `chart_of_accounts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `parent_code` VARCHAR(64),
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `type` VARCHAR(32),
  `balance` DECIMAL(16,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_coa_code (code),
  INDEX idx_coa_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: journalEntries | MySQL: journal_entries
CREATE TABLE IF NOT EXISTS `journal_entries` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `entry_number` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32),
  `description` VARCHAR(255),
  `reference_type` VARCHAR(64),
  `reference_id` VARCHAR(64),
  `total_debit` DECIMAL(16,2) DEFAULT 0.00,
  `total_credit` DECIMAL(16,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_je_num (entry_number),
  INDEX idx_je_date (date),
  INDEX idx_je_ref (reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: costCenters | MySQL: cost_centers
CREATE TABLE IF NOT EXISTS `cost_centers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191),
  `budget_monthly` DECIMAL(14,2) DEFAULT 0.00,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: periodLocks | MySQL: period_locks
CREATE TABLE IF NOT EXISTS `period_locks` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `period_month` VARCHAR(32) NOT NULL,
  `locked` TINYINT(1) DEFAULT 0,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: cashboxSessions | MySQL: cashbox_sessions
CREATE TABLE IF NOT EXISTS `cashbox_sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `opened_by` VARCHAR(64),
  `opened_at` VARCHAR(32),
  `opening_balance` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: dailyClosings | MySQL: daily_closings
CREATE TABLE IF NOT EXISTS `daily_closings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `date` VARCHAR(32) NOT NULL,
  `total_collected` DECIMAL(14,2) DEFAULT 0.00,
  `total_expenses` DECIMAL(14,2) DEFAULT 0.00,
  `net_cash` DECIMAL(14,2) DEFAULT 0.00,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: employees | MySQL: employees
CREATE TABLE IF NOT EXISTS `employees` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191),
  `role` VARCHAR(64),
  `department` VARCHAR(128),
  `salary` DECIMAL(12,2) DEFAULT 0.00,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: users | MySQL: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL,
  `full_name_ar` VARCHAR(191),
  `role` VARCHAR(64),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: roles | MySQL: roles
CREATE TABLE IF NOT EXISTS `roles` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL,
  `label_ar` VARCHAR(191),
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: permissions | MySQL: role_permissions
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `role` VARCHAR(64) NOT NULL,
  `resource` VARCHAR(64) NOT NULL,
  `can_view` TINYINT(1) DEFAULT 0,
  `can_create` TINYINT(1) DEFAULT 0,
  `can_edit` TINYINT(1) DEFAULT 0,
  `can_delete` TINYINT(1) DEFAULT 0,
  `raw_json` LONGTEXT,
  INDEX idx_perm_role (role, resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: settings | MySQL: lab_settings
CREATE TABLE IF NOT EXISTS `lab_settings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `lab_name_ar` VARCHAR(191),
  `lab_name_en` VARCHAR(191),
  `phone` VARCHAR(64),
  `currency` VARCHAR(16),
  `default_tax_rate` DECIMAL(8,2) DEFAULT 14.00,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: auditLogs | MySQL: audit_logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64),
  `username` VARCHAR(64),
  `role` VARCHAR(64),
  `screen` VARCHAR(64),
  `action` VARCHAR(191),
  `record_id` VARCHAR(64),
  `timestamp` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_audit_time (timestamp),
  INDEX idx_audit_screen (screen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: microscopyScans | MySQL: microscopy_scans
CREATE TABLE IF NOT EXISTS `microscopy_scans` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `scan_number` VARCHAR(64) NOT NULL,
  `modality` VARCHAR(32) NOT NULL,
  `engine_mode` VARCHAR(64),
  `patient_id` VARCHAR(64),
  `patient_name` VARCHAR(191),
  `request_id` VARCHAR(64),
  `stain_or_prep` VARCHAR(128),
  `magnification` VARCHAR(64),
  `overall_diagnosis_ar` VARCHAR(255),
  `analyzed_by` VARCHAR(64),
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_micro_scan_mod (modality),
  INDEX idx_micro_scan_pat (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: aiImageAnalyses | MySQL: ai_image_analyses
CREATE TABLE IF NOT EXISTS `ai_image_analyses` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `analysis_number` VARCHAR(64) NOT NULL,
  `modality` VARCHAR(32) NOT NULL,
  `engine_system_name_ar` VARCHAR(191),
  `patient_id` VARCHAR(64),
  `patient_name` VARCHAR(191),
  `request_id` VARCHAR(64),
  `overall_confidence` DECIMAL(6,2) DEFAULT 0.00,
  `requires_specialist_review` TINYINT(1) DEFAULT 0,
  `has_critical_alert` TINYINT(1) DEFAULT 0,
  `image_deleted` TINYINT(1) DEFAULT 0,
  `findings_count` INT DEFAULT 0,
  `status` VARCHAR(32),
  `analyzed_by` VARCHAR(64),
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_aia_num (analysis_number),
  INDEX idx_aia_mod (modality),
  INDEX idx_aia_pat (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: aiRecognitionFindings | MySQL: ai_recognition_findings
CREATE TABLE IF NOT EXISTS `ai_recognition_findings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `analysis_id` VARCHAR(64) NOT NULL,
  `analysis_number` VARCHAR(64),
  `modality` VARCHAR(32) NOT NULL,
  `group_key` VARCHAR(32) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191),
  `name_en` VARCHAR(191),
  `count_or_grade` VARCHAR(64),
  `confidence` DECIMAL(6,2) DEFAULT 0.00,
  `semantic_color` VARCHAR(16),
  `is_corrected` TINYINT(1) DEFAULT 0,
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_arf_analysis (analysis_id),
  INDEX idx_arf_group (group_key),
  INDEX idx_arf_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: aiCorrections | MySQL: ai_corrections
CREATE TABLE IF NOT EXISTS `ai_corrections` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `analysis_id` VARCHAR(64) NOT NULL,
  `finding_id` VARCHAR(64) NOT NULL,
  `modality` VARCHAR(32) NOT NULL,
  `group_key` VARCHAR(32),
  `original_code` VARCHAR(64),
  `original_name_ar` VARCHAR(191),
  `corrected_code` VARCHAR(64),
  `corrected_name_ar` VARCHAR(191),
  `corrected_count_or_grade` VARCHAR(64),
  `correction_reason` VARCHAR(255),
  `corrected_by` VARCHAR(64),
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_aic_analysis (analysis_id),
  INDEX idx_aic_mod (modality),
  INDEX idx_aic_orig (original_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: criticalValueLogs | MySQL: critical_value_logs
CREATE TABLE IF NOT EXISTS `critical_value_logs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `log_number` VARCHAR(64) NOT NULL,
  `result_id` VARCHAR(64) NOT NULL,
  `request_id` VARCHAR(64),
  `patient_id` VARCHAR(64),
  `patient_name` VARCHAR(191),
  `test_name_en` VARCHAR(191),
  `parameter_summary` VARCHAR(255),
  `recipient_type` VARCHAR(32),
  `recipient_name` VARCHAR(191),
  `recipient_phone` VARCHAR(64),
  `read_back_confirmed` TINYINT(1) DEFAULT 1,
  `notified_by` VARCHAR(64),
  `notified_at` VARCHAR(32),
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_crit_res (result_id),
  INDEX idx_crit_pat (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: cultureResults | MySQL: culture_results
CREATE TABLE IF NOT EXISTS `culture_results` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `report_number` VARCHAR(64) NOT NULL,
  `request_id` VARCHAR(64),
  `patient_id` VARCHAR(64),
  `patient_name` VARCHAR(191),
  `specimen_type` VARCHAR(64),
  `growth_status` VARCHAR(64),
  `colony_count` VARCHAR(64),
  `organism_code` VARCHAR(64),
  `organism_name_en` VARCHAR(191),
  `status` VARCHAR(32),
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_cult_org (organism_code),
  INDEX idx_cult_spec (specimen_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: antibioticsCatalog | MySQL: antibiotics_catalog
CREATE TABLE IF NOT EXISTS `antibiotics_catalog` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(32) NOT NULL,
  `name_en` VARCHAR(191) NOT NULL,
  `name_ar` VARCHAR(191),
  `antibiotic_class` VARCHAR(128),
  `default_mic_value` VARCHAR(64),
  `clsi_breakpoint` VARCHAR(128),
  `target_group` VARCHAR(64),
  `active` TINYINT(1) DEFAULT 1,
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_ab_code (code),
  INDEX idx_ab_class (antibiotic_class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: qcControlLots | MySQL: qc_control_lots
CREATE TABLE IF NOT EXISTS `qc_control_lots` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `lot_number` VARCHAR(64) NOT NULL,
  `analyzer_name` VARCHAR(191),
  `test_id` VARCHAR(64),
  `test_code` VARCHAR(64),
  `level` VARCHAR(64),
  `target_mean` DECIMAL(12,4) DEFAULT 0,
  `target_sd` DECIMAL(12,4) DEFAULT 0,
  `qc_locked` TINYINT(1) DEFAULT 0,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_qclot_test (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: qcRuns | MySQL: qc_runs
CREATE TABLE IF NOT EXISTS `qc_runs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `lot_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64),
  `level` VARCHAR(64),
  `run_date` VARCHAR(32),
  `measured_value` DECIMAL(12,4) DEFAULT 0,
  `z_score` DECIMAL(8,2) DEFAULT 0,
  `westgard_rule` VARCHAR(32),
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_qcrun_lot (lot_id),
  INDEX idx_qcrun_date (run_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: homeVisits | MySQL: home_visits
CREATE TABLE IF NOT EXISTS `home_visits` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `visit_number` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64),
  `patient_name` VARCHAR(191),
  `patient_phone` VARCHAR(64),
  `address` VARCHAR(255),
  `scheduled_date` VARCHAR(32),
  `phlebotomist_name` VARCHAR(191),
  `visit_fee` DECIMAL(12,2) DEFAULT 0,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_hv_date (scheduled_date),
  INDEX idx_hv_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: corporateContracts | MySQL: corporate_contracts
CREATE TABLE IF NOT EXISTS `corporate_contracts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `category` VARCHAR(64),
  `discount_percent` DECIMAL(8,2) DEFAULT 0,
  `patient_copay_percent` DECIMAL(8,2) DEFAULT 0,
  `company_coverage_percent` DECIMAL(8,2) DEFAULT 100,
  `credit_limit` DECIMAL(14,2) DEFAULT 0,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_contract_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: referenceLabPartners | MySQL: reference_lab_partners
CREATE TABLE IF NOT EXISTS `reference_lab_partners` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `contact_person` VARCHAR(191),
  `phone` VARCHAR(64),
  `address` VARCHAR(255),
  `default_discount_percent` DECIMAL(8,2) DEFAULT 0,
  `turnaround_hours` INT DEFAULT 0,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_ref_lab_partner_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Dexie store: labToLabDispatches | MySQL: lab_to_lab_dispatches
CREATE TABLE IF NOT EXISTS `lab_to_lab_dispatches` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `manifest_number` VARCHAR(64) NOT NULL,
  `sample_id` VARCHAR(64),
  `sample_code` VARCHAR(64),
  `request_id` VARCHAR(64),
  `request_number` VARCHAR(64),
  `patient_id` VARCHAR(64),
  `ref_lab_id` VARCHAR(64),
  `ref_lab_name` VARCHAR(191),
  `dispatch_date` VARCHAR(32),
  `status` VARCHAR(32),
  `b2b_cost` DECIMAL(12,2) DEFAULT 0,
  `patient_price` DECIMAL(12,2) DEFAULT 0,
  `created_by` VARCHAR(64),
  `raw_json` LONGTEXT,
  INDEX idx_lab_ref_dispatch_date (dispatch_date),
  INDEX idx_lab_ref_dispatch_patient (patient_id),
  INDEX idx_lab_ref_dispatch_ref_lab (ref_lab_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

SELECT COUNT(*) AS mapped_table_definitions FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (
  'patients',
  'doctor_specialties',
  'doctors',
  'scientific_departments',
  'sample_tubes',
  'lab_tests',
  'test_parameters',
  'lab_requests',
  'request_items',
  'samples',
  'lab_results',
  'invoices',
  'invoice_items',
  'payments',
  'expenses',
  'doctor_commissions',
  'inventory_items',
  'inventory_lots',
  'stock_movements',
  'test_boms',
  'stock_taking_sessions',
  'suppliers',
  'purchase_invoices',
  'return_notes',
  'chart_of_accounts',
  'journal_entries',
  'cost_centers',
  'period_locks',
  'cashbox_sessions',
  'daily_closings',
  'employees',
  'users',
  'roles',
  'role_permissions',
  'lab_settings',
  'audit_logs',
  'microscopy_scans',
  'ai_image_analyses',
  'ai_recognition_findings',
  'ai_corrections',
  'critical_value_logs',
  'culture_results',
  'antibiotics_catalog',
  'qc_control_lots',
  'qc_runs',
  'home_visits',
  'corporate_contracts',
  'reference_lab_partners',
  'lab_to_lab_dispatches'
);

-- END INCLUDED sql/tlab_mysql_only_all_49_tables_create_safe.sql

-- START INCLUDED sql/tlab_multibranch_additive_v1.sql
-- T-Lab v6.1.0 | Multi-branch expansion (phase 1: additive schema)
-- Target: the ORIGINAL tlab_db with all its existing records.
-- IMPORTANT: Take a verified full backup first. Test on a restored copy before production.
-- Compatible with MySQL 5.5 and MySQL 8.0.x; no DROP TABLE, TRUNCATE,
-- DELETE, REPLACE INTO or changes to existing primary keys.
-- CAUTION: MySQL DDL implicitly commits. Schema migration is not rollback-transactional.
-- The installer DOES NOT run this SQL automatically.
-- Target schema selected at top of unified migration.
SET NAMES utf8;

CREATE TABLE IF NOT EXISTS `branches` (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name_ar VARCHAR(191) NOT NULL,
  name_en VARCHAR(191) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(64) DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  is_main TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_branch_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `user_branches` (
  user_id VARCHAR(64) NOT NULL,
  branch_id VARCHAR(64) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, branch_id),
  KEY idx_user_branches_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_settings` (
  branch_id VARCHAR(64) NOT NULL PRIMARY KEY,
  display_name VARCHAR(191) DEFAULT NULL,
  logo_path VARCHAR(255) DEFAULT NULL,
  receipt_header TEXT,
  receipt_footer TEXT,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
  currency_code VARCHAR(8) NOT NULL DEFAULT 'EGP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_test_prices` (
  branch_id VARCHAR(64) NOT NULL,
  test_id VARCHAR(64) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (branch_id, test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_inventory` (
  branch_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  lot_id VARCHAR(64) NOT NULL DEFAULT '',
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(14,3) NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT NULL,
  PRIMARY KEY (branch_id, item_id, lot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_transfers` (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  source_branch_id VARCHAR(64) NOT NULL,
  destination_branch_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_by VARCHAR(64) DEFAULT NULL,
  approved_by VARCHAR(64) DEFAULT NULL,
  received_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL,
  approved_at DATETIME DEFAULT NULL,
  received_at DATETIME DEFAULT NULL,
  notes TEXT,
  KEY idx_transfer_source (source_branch_id),
  KEY idx_transfer_destination (destination_branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_transfer_items` (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  transfer_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  lot_id VARCHAR(64) DEFAULT NULL,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  KEY idx_transfer_items_transfer (transfer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_sequences` (
  branch_id VARCHAR(64) NOT NULL,
  sequence_name VARCHAR(64) NOT NULL,
  next_value BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (branch_id, sequence_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

CREATE TABLE IF NOT EXISTS `branch_migration_audit` (
  migration_id VARCHAR(64) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL,
  notes VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Register legacy records with the original main branch without changing IDs.
INSERT INTO branches (id, code, name_ar, name_en, active, is_main, created_at)
SELECT 'branch_main', 'BR-001', 'الفرع الرئيسي', 'Main Branch', 1, 1, NOW()
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id='branch_main');

-- Only add branch_id for tables which already exist and do not have it.
-- No ALTER is performed on missing tables (supports customized older installations).
DROP PROCEDURE IF EXISTS tlab_add_branch_column_v1;
DELIMITER $$
CREATE PROCEDURE tlab_add_branch_column_v1(IN p_table VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table)
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND COLUMN_NAME='branch_id') THEN
    SET @tlab_sql = CONCAT('ALTER TABLE `',p_table,'` ADD COLUMN `branch_id` VARCHAR(64) NOT NULL DEFAULT ''branch_main''');
    PREPARE stmt FROM @tlab_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND COLUMN_NAME='branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND INDEX_NAME='idx_tlab_branch') THEN
    SET @tlab_sql = CONCAT('ALTER TABLE `',p_table,'` ADD INDEX `idx_tlab_branch` (`branch_id`)');
    PREPARE stmt FROM @tlab_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL tlab_add_branch_column_v1('lab_requests');
CALL tlab_add_branch_column_v1('request_items');
CALL tlab_add_branch_column_v1('samples');
CALL tlab_add_branch_column_v1('lab_results');
CALL tlab_add_branch_column_v1('invoices');
CALL tlab_add_branch_column_v1('invoice_items');
CALL tlab_add_branch_column_v1('payments');
CALL tlab_add_branch_column_v1('expenses');
CALL tlab_add_branch_column_v1('doctor_commissions');
CALL tlab_add_branch_column_v1('inventory_lots');
CALL tlab_add_branch_column_v1('stock_movements');
CALL tlab_add_branch_column_v1('stock_taking_sessions');
CALL tlab_add_branch_column_v1('purchase_invoices');
CALL tlab_add_branch_column_v1('return_notes');
CALL tlab_add_branch_column_v1('journal_entries');
CALL tlab_add_branch_column_v1('cashbox_sessions');
CALL tlab_add_branch_column_v1('daily_closings');
CALL tlab_add_branch_column_v1('microscopy_scans');
CALL tlab_add_branch_column_v1('ai_image_analyses');
CALL tlab_add_branch_column_v1('ai_recognition_findings');
CALL tlab_add_branch_column_v1('ai_corrections');
CALL tlab_add_branch_column_v1('critical_value_logs');
CALL tlab_add_branch_column_v1('culture_results');
CALL tlab_add_branch_column_v1('qc_runs');
CALL tlab_add_branch_column_v1('home_visits');
CALL tlab_add_branch_column_v1('lab_to_lab_dispatches');

DROP PROCEDURE IF EXISTS tlab_add_branch_column_v1;

-- Existing users remain unchanged; access must be explicitly assigned by the administrator.
-- Assign ONLY the existing developer/owner users to the main branch if present.
INSERT INTO user_branches (user_id, branch_id, is_default)
SELECT id, 'branch_main', 1 FROM users
WHERE role IN ('Developer','Owner')
  AND id NOT IN (SELECT user_id FROM user_branches WHERE branch_id='branch_main');

INSERT INTO branch_migration_audit (migration_id, applied_at, notes)
SELECT 'multi_branch_schema_v1', NOW(), 'Additive first-stage migration; original rows preserved'
FROM DUAL WHERE NOT EXISTS
  (SELECT 1 FROM branch_migration_audit WHERE migration_id='multi_branch_schema_v1');

-- Verification (run and compare with your pre-migration backup counts).
SELECT DATABASE() AS schema_name, COUNT(*) AS branch_count FROM branches;
SELECT COUNT(*) AS tests_count FROM lab_tests;
SELECT COUNT(*) AS parameters_count FROM test_parameters;
SELECT COUNT(*) AS patients_count FROM patients;
SELECT COUNT(*) AS requests_count FROM lab_requests;
SELECT COUNT(*) AS invoices_count FROM invoices;
SELECT COUNT(*) AS main_requests_count FROM lab_requests WHERE branch_id='branch_main';

-- END INCLUDED sql/tlab_multibranch_additive_v1.sql

-- START INCLUDED sql/tlab_branch_user_permissions_v2.sql
-- T-Lab phase 3: additive user-specific branch permission matrix.
-- IMPORTANT: Backup the MySQL database first. Run on a restored TEST copy.
-- Does not delete or update any existing users, role permissions or clinical records.
-- This file intentionally targets the dedicated Windows pilot test schema.
-- Target schema selected at top of unified migration.
CREATE TABLE IF NOT EXISTS `user_branch_permissions` (
  `user_id` VARCHAR(64) NOT NULL,
  `branch_id` VARCHAR(64) NOT NULL,
  `resource` VARCHAR(64) NOT NULL,
  `actions_json` LONGTEXT NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `updated_by` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`user_id`, `branch_id`, `resource`),
  KEY `idx_ubp_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
SELECT COUNT(*) AS branch_permission_rows FROM `user_branch_permissions`;

-- END INCLUDED sql/tlab_branch_user_permissions_v2.sql

-- START INCLUDED sql/tlab_all_49_store_branch_access_v8.sql
-- T-Lab — all 49 MySQL store access links, additive migration ONLY.
-- IMPORTANT: Back up both MySQL AND browser IndexedDB first.
-- Run ONLY on a verified restored copy: tlab_multibranch_pilot.
-- Legacy records are explicitly assigned to branch_main; no auto-import.
-- Target schema selected at top of unified migration.
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

-- END INCLUDED sql/tlab_all_49_store_branch_access_v8.sql

-- START INCLUDED sql/tlab_main_mysql_repair_v10.sql
-- T-Lab production-main additive repair v10, compatible with MySQL 5.5 and 8.0.
-- BACK UP FIRST. Run on the SAME database configured in the app .env.
-- This script does not create fake data and never drops, truncates or deletes existing records.
-- MySQL DDL auto-commits: test on a restored copy before running against live data.
-- Select your actual database in Workbench BEFORE running this script.
SELECT DATABASE() AS selected_database;
-- The prerequisites are existing: users, branches, user_branches,
-- user_branch_permissions, mysql_store_branch_access and the 49 mapped tables.

CREATE TABLE IF NOT EXISTS tlab_mutation_audit_v10 (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id VARCHAR(64) NOT NULL,
 resource VARCHAR(64) NOT NULL,
 record_id VARCHAR(64) NOT NULL,
 branch_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 operation VARCHAR(16) NOT NULL,
 before_json LONGTEXT,
 after_json LONGTEXT,
 created_at DATETIME NOT NULL,
 UNIQUE KEY uq_mutation_event_v10 (event_id),
 KEY idx_mutation_resource_v10 (resource, record_id),
 KEY idx_mutation_branch_v10 (branch_id, created_at),
 CONSTRAINT fk_mutation_branch_v10 FOREIGN KEY (branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_mutation_actor_v10 FOREIGN KEY (actor_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- QC analyzer names are branch-scoped MySQL data, not localStorage.
CREATE TABLE IF NOT EXISTS tlab_qc_analyzers (
 branch_id VARCHAR(64) NOT NULL,
 name VARCHAR(191) NOT NULL,
 active TINYINT(1) NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY(branch_id,name),
 CONSTRAINT fk_qc_analyzers_branch FOREIGN KEY(branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Optional account password upgrades are performed by the application.
-- Do not rewrite legacy raw_json credentials in SQL or set shared defaults.
-- Referential-integrity audit before adding further FKs:
SELECT 'orphan_branch_map' AS check_name, COUNT(*) AS count
FROM mysql_store_branch_access m LEFT JOIN branches b ON b.id=m.branch_id
WHERE b.id IS NULL
UNION ALL
SELECT 'orphan_user_branch', COUNT(*)
FROM user_branches ub LEFT JOIN users u ON u.id=ub.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_user_branch_permissions', COUNT(*)
FROM user_branch_permissions bp LEFT JOIN users u ON u.id=bp.user_id
WHERE u.id IS NULL;
SELECT 'duplicate_usernames' AS check_name,username,COUNT(*) AS cnt
FROM users GROUP BY username HAVING COUNT(*)>1;
SELECT 'duplicate_contract_codes' AS check_name,code,COUNT(*) AS cnt
FROM corporate_contracts GROUP BY code HAVING COUNT(*)>1;
SELECT 'mapped' AS category,store_name,branch_id,COUNT(*) AS records
FROM mysql_store_branch_access
WHERE store_name IN ('corporateContracts','users','cultureResults','antibioticsCatalog','qcControlLots','qcRuns','homeVisits')
GROUP BY store_name,branch_id ORDER BY store_name,branch_id;
-- Deleting medically signed results or quality-control evidence is NOT safe.
-- App endpoints will soft-archive records, retaining their audit/history.

-- END INCLUDED sql/tlab_main_mysql_repair_v10.sql


-- START RELATIONAL FOREIGN KEYS (33)
-- T-Lab relationship integrity v11. MySQL 5.5 / 8.x.
-- Safe on existing data: does NOT alter or delete orphan rows.
-- Adds a foreign key ONLY when both columns are compatible and no orphans exist.
-- All skipped constraints are recorded for review in tlab_fk_migration_notes.
-- Backup before execution. MySQL ALTER TABLE commits and can lock tables.
CREATE TABLE IF NOT EXISTS tlab_fk_migration_notes (
 fk_name VARCHAR(64) NOT NULL PRIMARY KEY,
 child_table VARCHAR(64) NOT NULL,
 child_column VARCHAR(64) NOT NULL,
 parent_table VARCHAR(64) NOT NULL,
 status VARCHAR(40) NOT NULL,
 orphan_count BIGINT NOT NULL DEFAULT 0,
 checked_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

DROP PROCEDURE IF EXISTS tlab_try_add_fk_v11;
DELIMITER $$
CREATE PROCEDURE tlab_try_add_fk_v11(
 IN p_child VARCHAR(64),IN p_column VARCHAR(64),
 IN p_parent VARCHAR(64),IN p_fk VARCHAR(64)
)
BEGIN
 DECLARE v_ready INTEGER DEFAULT 0;
 DECLARE v_exists INTEGER DEFAULT 0;
 DECLARE v_status VARCHAR(40) DEFAULT 'not_checked';
 DECLARE v_orphans BIGINT DEFAULT 0;
 DECLARE v_child_type VARCHAR(128);
 DECLARE v_parent_type VARCHAR(128);
 DECLARE v_child_collation VARCHAR(64);
 DECLARE v_parent_collation VARCHAR(64);
 SELECT COUNT(*) INTO v_exists
 FROM information_schema.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=p_fk
   AND CONSTRAINT_TYPE='FOREIGN KEY';
 IF v_exists>0 THEN
   SET v_status='already_present';
 ELSE
   SELECT COUNT(*) INTO v_ready
   FROM information_schema.COLUMNS c
   JOIN information_schema.COLUMNS p
     ON p.TABLE_SCHEMA=c.TABLE_SCHEMA AND p.TABLE_NAME=p_parent
     AND p.COLUMN_NAME='id'
   JOIN information_schema.TABLES tc ON tc.TABLE_SCHEMA=c.TABLE_SCHEMA
     AND tc.TABLE_NAME=c.TABLE_NAME
   JOIN information_schema.TABLES tp ON tp.TABLE_SCHEMA=p.TABLE_SCHEMA
     AND tp.TABLE_NAME=p.TABLE_NAME
   WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=p_child
     AND c.COLUMN_NAME=p_column AND c.DATA_TYPE=p.DATA_TYPE
     AND c.CHARACTER_MAXIMUM_LENGTH=p.CHARACTER_MAXIMUM_LENGTH
     AND COALESCE(c.COLLATION_NAME,'')=COALESCE(p.COLLATION_NAME,'')
     AND tc.ENGINE='InnoDB' AND tp.ENGINE='InnoDB';
   IF v_ready=0 THEN
     SET v_status='missing_or_incompatible_columns';
   ELSE
     SET @tlab_orphans_v11=NULL;
     SET @tlab_stmt_v11=CONCAT('SELECT COUNT(*) INTO @tlab_orphans_v11 FROM `',
       p_child,'` c LEFT JOIN `',p_parent,
       '` p ON p.`id`=c.`',p_column,
       '` WHERE c.`',p_column,'` IS NOT NULL AND p.`id` IS NULL');
     PREPARE st FROM @tlab_stmt_v11;
     EXECUTE st;
     DEALLOCATE PREPARE st;
     SET v_orphans=COALESCE(@tlab_orphans_v11,0);
     IF v_orphans>0 THEN
       SET v_status='skipped_orphan_records';
     ELSE
       SET @tlab_stmt_v11=CONCAT('ALTER TABLE `',p_child,
         '` ADD CONSTRAINT `',p_fk,'` FOREIGN KEY (`',
         p_column,'`) REFERENCES `',p_parent,
         '` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT');
       PREPARE st FROM @tlab_stmt_v11;
       EXECUTE st;
       DEALLOCATE PREPARE st;
       SET v_status='created';
     END IF;
   END IF;
 END IF;
 INSERT INTO tlab_fk_migration_notes(fk_name,child_table,child_column,parent_table,status,orphan_count,checked_at)
 VALUES (p_fk,p_child,p_column,p_parent,v_status,v_orphans,NOW())
 ON DUPLICATE KEY UPDATE status=VALUES(status),orphan_count=VALUES(orphan_count),checked_at=NOW();
END$$
DELIMITER ;

CALL tlab_try_add_fk_v11('lab_requests','patient_id','patients','fk_tlab_req_patient');
CALL tlab_try_add_fk_v11('lab_requests','doctor_id','doctors','fk_tlab_req_doctor');
CALL tlab_try_add_fk_v11('request_items','request_id','lab_requests','fk_tlab_req_item_request');
CALL tlab_try_add_fk_v11('request_items','test_id','lab_tests','fk_tlab_req_item_test');
CALL tlab_try_add_fk_v11('samples','request_id','lab_requests','fk_tlab_sample_request');
CALL tlab_try_add_fk_v11('samples','patient_id','patients','fk_tlab_sample_patient');
CALL tlab_try_add_fk_v11('lab_results','request_id','lab_requests','fk_tlab_result_request');
CALL tlab_try_add_fk_v11('lab_results','patient_id','patients','fk_tlab_result_patient');
CALL tlab_try_add_fk_v11('lab_results','test_id','lab_tests','fk_tlab_result_test');
CALL tlab_try_add_fk_v11('invoices','patient_id','patients','fk_tlab_invoice_patient');
CALL tlab_try_add_fk_v11('invoices','request_id','lab_requests','fk_tlab_invoice_request');
CALL tlab_try_add_fk_v11('invoice_items','invoice_id','invoices','fk_tlab_line_invoice');
CALL tlab_try_add_fk_v11('invoice_items','test_id','lab_tests','fk_tlab_line_test');
CALL tlab_try_add_fk_v11('payments','invoice_id','invoices','fk_tlab_payment_invoice');
CALL tlab_try_add_fk_v11('payments','patient_id','patients','fk_tlab_payment_patient');
CALL tlab_try_add_fk_v11('inventory_lots','item_id','inventory_items','fk_tlab_lot_item');
CALL tlab_try_add_fk_v11('stock_movements','item_id','inventory_items','fk_tlab_stock_item');
CALL tlab_try_add_fk_v11('stock_movements','lot_id','inventory_lots','fk_tlab_stock_lot');
CALL tlab_try_add_fk_v11('purchase_invoices','supplier_id','suppliers','fk_tlab_purchase_supplier');
CALL tlab_try_add_fk_v11('doctor_commissions','doctor_id','doctors','fk_tlab_commission_doctor');
CALL tlab_try_add_fk_v11('doctor_commissions','invoice_id','invoices','fk_tlab_commission_invoice');
CALL tlab_try_add_fk_v11('home_visits','patient_id','patients','fk_tlab_home_patient');
CALL tlab_try_add_fk_v11('culture_results','patient_id','patients','fk_tlab_culture_patient');
CALL tlab_try_add_fk_v11('culture_results','request_id','lab_requests','fk_tlab_culture_request');
CALL tlab_try_add_fk_v11('qc_runs','lot_id','qc_control_lots','fk_tlab_qcrun_lot');
CALL tlab_try_add_fk_v11('critical_value_logs','result_id','lab_results','fk_tlab_critical_result');
CALL tlab_try_add_fk_v11('ai_recognition_findings','analysis_id','ai_image_analyses','fk_tlab_ai_findings_analysis');
CALL tlab_try_add_fk_v11('lab_to_lab_dispatches','ref_lab_id','reference_lab_partners','fk_tlab_dispatch_reflab');
CALL tlab_try_add_fk_v11('mysql_store_branch_access','branch_id','branches','fk_tlab_store_branch');
CALL tlab_try_add_fk_v11('user_branches','user_id','users','fk_tlab_userbranch_user');
CALL tlab_try_add_fk_v11('user_branches','branch_id','branches','fk_tlab_userbranch_branch');
CALL tlab_try_add_fk_v11('user_branch_permissions','user_id','users','fk_tlab_perm_user');
CALL tlab_try_add_fk_v11('user_branch_permissions','branch_id','branches','fk_tlab_perm_branch');
DROP PROCEDURE IF EXISTS tlab_try_add_fk_v11;
SELECT fk_name,status,orphan_count FROM tlab_fk_migration_notes ORDER BY fk_name;
-- Any skipped_orphan_records requires manual reconciliation using your actual
-- clinical/financial data, not fabricated test records.

-- END RELATIONAL FOREIGN KEYS

-- END COMPLETE SCHEMA MIGRATION
SELECT DATABASE() AS verified_database;
SELECT COUNT(*) AS total_table_count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();
