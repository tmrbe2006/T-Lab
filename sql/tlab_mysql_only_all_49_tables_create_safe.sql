-- T-Lab MySQL-only schema preparation: 49 mapped tables
-- MySQL 5.5 and 8.0.28 compatible. NO existing row is deleted, modified, or overwritten.
-- CREATE TABLE IF NOT EXISTS DOES NOT REPAIR missing columns on already existing tables.
-- First take a full verified backup; run on a restored TEST copy only.
-- For existing tables use /api/branch-pilot/storage-audit to identify missing columns.
-- DO NOT use legacy full SQL dump: it contains destructive DROP/TRUNCATE.

USE `tlab_multibranch_pilot`;
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
