-- Non-destructive audit table for MySQL-only master-data mutations.
-- Run on a restored tlab_multibranch_pilot TEST database.
USE `tlab_multibranch_pilot`;
CREATE TABLE IF NOT EXISTS `mysql_store_mutation_audit` (
 `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 `store_name` VARCHAR(64) NOT NULL,
 `record_id` VARCHAR(64) NOT NULL,
 `branch_id` VARCHAR(64) NOT NULL,
 `actor_id` VARCHAR(64) NOT NULL,
 `action` VARCHAR(16) NOT NULL,
 `at_utc` DATETIME NOT NULL,
 PRIMARY KEY (`id`),
 KEY `idx_store_audit_branch` (`branch_id`,`store_name`,`at_utc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
