-- T-Lab / MySQL-only migration preparation
-- Compatible with MySQL 5.5 and MySQL 8.0.28.
-- Non-destructive: this script ONLY adds the two missing mapped tables.
-- Take a verified FULL backup, then run on a restored TEST copy first.
USE `tlab_multibranch_pilot`;

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
  INDEX `idx_ref_lab_partner_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

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
  INDEX `idx_lab_ref_dispatch_date` (`dispatch_date`),
  INDEX `idx_lab_ref_dispatch_patient` (`patient_id`),
  INDEX `idx_lab_ref_dispatch_ref_lab` (`ref_lab_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Read-only validation. No existing rows or tables are altered.
SELECT COUNT(*) AS reference_lab_partners_rows FROM `reference_lab_partners`;
SELECT COUNT(*) AS lab_to_lab_dispatches_rows FROM `lab_to_lab_dispatches`;
