-- T-Lab FINANCE READ-ONLY PILOT branch mapping (MySQL 5.5/8 compatible)
-- Execute ONLY on restored isolated test DB. Backup and verify before applying.
-- No deletion, table reset, or record content replacement.
USE `tlab_multibranch_pilot`;
CREATE TABLE IF NOT EXISTS `finance_record_branch_access` (
  `resource` VARCHAR(64) NOT NULL,
  `record_id` VARCHAR(64) NOT NULL,
  `branch_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `created_by` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`resource`,`record_id`,`branch_id`),
  KEY `idx_finance_resource_branch` (`resource`,`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
-- Pre-existing legacy records are only attributed to branch_main; never shared with new branches.
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'invoices', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `invoices` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'invoice_items', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `invoice_items` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'payments', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `payments` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'journal_entries', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `journal_entries` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'chart_of_accounts', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `chart_of_accounts` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'cashbox_sessions', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `cashbox_sessions` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'daily_closings', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `daily_closings` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'expenses', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `expenses` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'doctor_commissions', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `doctor_commissions` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'cost_centers', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `cost_centers` t;
INSERT IGNORE INTO `finance_record_branch_access` (`resource`,`record_id`,`branch_id`,`created_at`,`created_by`)
SELECT 'period_locks', t.`id`, 'branch_main', NOW(), 'legacy_migration' FROM `period_locks` t;
SELECT resource,branch_id,COUNT(*) AS records FROM finance_record_branch_access GROUP BY resource,branch_id;
