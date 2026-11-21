-- Doctor master branch mapping for finance/commission READ pilot.
-- Apply only to backed-up test schema tlab_multibranch_pilot.
USE `tlab_multibranch_pilot`;
CREATE TABLE IF NOT EXISTS `doctor_branch_access` (
  `doctor_id` VARCHAR(64) NOT NULL,
  `branch_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `created_by` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`doctor_id`,`branch_id`),
  KEY `idx_doctor_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
INSERT IGNORE INTO `doctor_branch_access` (`doctor_id`,`branch_id`,`created_at`,`created_by`)
SELECT d.id,'branch_main',NOW(),'legacy_migration' FROM `doctors` d;
SELECT COUNT(*) AS doctor_rows FROM `doctors`;
SELECT COUNT(*) AS doctor_main_branch_rows FROM `doctor_branch_access` WHERE branch_id='branch_main';
