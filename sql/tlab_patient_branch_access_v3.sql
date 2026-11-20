-- T-Lab patient branch access migration — PILOT DATABASE ONLY
-- Back up and test on a restored copy before execution.
-- No DROP, DELETE, REPLACE, TRUNCATE, patient-row modifications or resets.
USE `tlab_multibranch_pilot`;
CREATE TABLE IF NOT EXISTS `patient_branch_access` (
  `patient_id` VARCHAR(64) NOT NULL,
  `branch_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `created_by` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`patient_id`, `branch_id`),
  KEY `idx_patient_branch_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Preserve legacy patient rows: existing patients are visible to the main
-- branch only; no implicit sharing with newly created branches.
INSERT IGNORE INTO `patient_branch_access` (`patient_id`, `branch_id`, `created_at`, `created_by`)
SELECT p.`id`, 'branch_main', NOW(), 'legacy_migration'
FROM `patients` p;

SELECT COUNT(*) AS patients_total FROM `patients`;
SELECT COUNT(*) AS patients_mapped_to_main FROM `patient_branch_access` WHERE `branch_id`='branch_main';
