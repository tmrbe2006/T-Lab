-- T-Lab MySQL repair v10. Safe ADDITIVE migration (MySQL 5.5/8).
-- Run ONLY after verified backup and restore to tlab_multibranch_pilot.
-- Requires 49-table schema, branches/users (v1), user_branch_permissions (v2),
-- mysql_store_branch_access (v8). Never run directly on production.
-- DDL commits implicitly; a transaction cannot undo this migration.
USE `tlab_multibranch_pilot`;
SET NAMES utf8;
-- Preflight checks: inspect the results and stop if preconditions are false.
SELECT DATABASE() AS schema_name;
SELECT 'patients' AS store,COUNT(*) AS n FROM patients
UNION ALL SELECT 'homeVisits',COUNT(*) FROM home_visits
UNION ALL SELECT 'cultureResults',COUNT(*) FROM culture_results
UNION ALL SELECT 'qcControlLots',COUNT(*) FROM qc_control_lots
UNION ALL SELECT 'qcRuns',COUNT(*) FROM qc_runs
UNION ALL SELECT 'corporateContracts',COUNT(*) FROM corporate_contracts
UNION ALL SELECT 'users',COUNT(*) FROM users;
SELECT ub.user_id,ub.branch_id FROM user_branches ub
 LEFT JOIN users u ON u.id=ub.user_id
 LEFT JOIN branches b ON b.id=ub.branch_id
 WHERE u.id IS NULL OR b.id IS NULL;
-- Runtime module retirement flags; API and UI MUST check these too.
CREATE TABLE IF NOT EXISTS tlab_module_settings (
 module_key VARCHAR(64) NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 1,
 retirement_status VARCHAR(24) NOT NULL DEFAULT 'active',
 updated_at DATETIME NOT NULL,
 updated_by VARCHAR(64) DEFAULT NULL,
 note VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
INSERT INTO tlab_module_settings
 (module_key,enabled,retirement_status,updated_at,updated_by,note)
VALUES
 ('homeVisits',0,'pending_retirement',NOW(),NULL,'Historical records retained'),
 ('microbiology',0,'pending_retirement',NOW(),NULL,'Culture results retained'),
 ('qualityControl',0,'pending_retirement',NOW(),NULL,'QC history retained'),
 ('corporateContracts',1,'active',NOW(),NULL,'MySQL CRUD must be server-checked'),
 ('users',1,'active',NOW(),NULL,'Password hash, server CRUD and soft delete'),
 ('permissions',1,'active',NOW(),NULL,'Roles distinct from per-user branch rights')
ON DUPLICATE KEY UPDATE
 enabled=VALUES(enabled),retirement_status=VALUES(retirement_status),
 updated_at=VALUES(updated_at),note=VALUES(note);
-- Append-only audit and relational FKs on NEW tables only.
CREATE TABLE IF NOT EXISTS tlab_mutation_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_key VARCHAR(64) NOT NULL,
 resource VARCHAR(64) NOT NULL,
 record_id VARCHAR(64) NOT NULL,
 branch_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 action_name VARCHAR(20) NOT NULL,
 old_json LONGTEXT,
 new_json LONGTEXT,
 recorded_at DATETIME NOT NULL,
 UNIQUE KEY uq_tlab_mutation_event (event_key),
 KEY idx_tlab_mutation_record (resource,record_id,recorded_at),
 CONSTRAINT fk_tlab_mutation_branch FOREIGN KEY(branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_mutation_actor FOREIGN KEY(actor_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
CREATE TABLE IF NOT EXISTS tlab_contract_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 contract_id VARCHAR(64) NOT NULL,
 branch_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 action_name VARCHAR(20) NOT NULL,
 happened_at DATETIME NOT NULL,
 before_json LONGTEXT,
 after_json LONGTEXT,
 KEY idx_tlab_contract_event (contract_id,happened_at),
 CONSTRAINT fk_tlab_ce_contract FOREIGN KEY(contract_id)
  REFERENCES corporate_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_ce_branch FOREIGN KEY(branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_ce_actor FOREIGN KEY(actor_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
CREATE TABLE IF NOT EXISTS tlab_user_account_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 subject_user_id VARCHAR(64) NOT NULL,
 actor_user_id VARCHAR(64) NOT NULL,
 branch_id VARCHAR(64) NOT NULL,
 action_name VARCHAR(20) NOT NULL,
 happened_at DATETIME NOT NULL,
 note VARCHAR(255) DEFAULT NULL,
 CONSTRAINT fk_tlab_ue_subject FOREIGN KEY(subject_user_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_ue_actor FOREIGN KEY(actor_user_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_ue_branch FOREIGN KEY(branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
CREATE TABLE IF NOT EXISTS tlab_permission_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 subject_user_id VARCHAR(64) NOT NULL,
 branch_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 resource VARCHAR(64) NOT NULL,
 before_actions LONGTEXT,
 after_actions LONGTEXT NOT NULL,
 changed_at DATETIME NOT NULL,
 KEY idx_tlab_permission_event (subject_user_id,branch_id,changed_at),
 CONSTRAINT fk_tlab_pe_subject FOREIGN KEY(subject_user_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_pe_actor FOREIGN KEY(actor_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tlab_pe_branch FOREIGN KEY(branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
-- No automatic branch reassignment. Check orphaned and duplicate records.
SELECT store_name,branch_id,COUNT(*) AS mapped_rows
 FROM mysql_store_branch_access
 WHERE store_name IN ('patients','homeVisits','cultureResults','qcControlLots',
 'qcRuns','corporateContracts','users','employees')
 GROUP BY store_name,branch_id ORDER BY store_name,branch_id;
SELECT username,COUNT(*) AS duplicates FROM users GROUP BY username HAVING COUNT(*)>1;
SELECT code,COUNT(*) AS duplicates FROM corporate_contracts GROUP BY code HAVING COUNT(*)>1;
SELECT module_key,enabled,retirement_status FROM tlab_module_settings ORDER BY module_key;
-- IMPORTANT: No DROP/TRUNCATE/DELETE. Do not erase signed clinical/QC history.
-- API must enforce module flags, branch membership, RBAC, and atomic CRUD.
