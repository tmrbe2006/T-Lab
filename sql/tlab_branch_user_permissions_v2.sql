-- T-Lab phase 3: additive user-specific branch permission matrix.
-- IMPORTANT: Backup the MySQL database first. Run on a restored TEST copy.
-- Does not delete or update any existing users, role permissions or clinical records.
-- This file intentionally targets the dedicated Windows pilot test schema.
USE `tlab_multibranch_pilot`;
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
