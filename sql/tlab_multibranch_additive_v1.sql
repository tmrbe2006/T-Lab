-- T-Lab v6.1.0 | Multi-branch expansion (phase 1: additive schema)
-- Target: the ORIGINAL tlab_db with all its existing records.
-- IMPORTANT: Take a verified full backup first. Test on a restored copy before production.
-- Compatible with MySQL 5.5 and MySQL 8.0.x; no DROP TABLE, TRUNCATE,
-- DELETE, REPLACE INTO or changes to existing primary keys.
-- CAUTION: MySQL DDL implicitly commits. Schema migration is not rollback-transactional.
-- The installer DOES NOT run this SQL automatically.
USE `tlab_db`;
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
