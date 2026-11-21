-- T-Lab: non-destructive home visits branch isolation, TEST COPY FIRST.
-- Run only after backing up the existing MySQL database and verifying the target.
USE `tlab_multibranch_pilot`;
CREATE TABLE IF NOT EXISTS `home_visit_branch_access` (
  `visit_id` VARCHAR(64) NOT NULL,
  `branch_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `created_by` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`visit_id`,`branch_id`),
  KEY `idx_home_visit_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
-- Existing legacy visits belong to branch_main only, not to all new branches.
INSERT IGNORE INTO `home_visit_branch_access` (`visit_id`,`branch_id`,`created_at`,`created_by`)
SELECT h.`id`, 'branch_main', NOW(), 'legacy_migration'
FROM `home_visits` h;
SELECT COUNT(*) AS mysql_home_visits FROM `home_visits`;
SELECT COUNT(*) AS mapped_main_visits FROM `home_visit_branch_access` WHERE branch_id='branch_main';
