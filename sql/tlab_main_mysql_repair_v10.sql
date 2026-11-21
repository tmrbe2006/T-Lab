-- T-Lab production-main additive repair v10, compatible with MySQL 5.5 and 8.0.
-- BACK UP FIRST. Run on the SAME database configured in the app .env.
-- This script does not create fake data and never drops, truncates or deletes existing records.
-- MySQL DDL auto-commits: test on a restored copy before running against live data.
-- Select your actual database in Workbench BEFORE running this script.
SELECT DATABASE() AS selected_database;
-- The prerequisites are existing: users, branches, user_branches,
-- user_branch_permissions, mysql_store_branch_access and the 49 mapped tables.

CREATE TABLE IF NOT EXISTS tlab_mutation_audit_v10 (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id VARCHAR(64) NOT NULL,
 resource VARCHAR(64) NOT NULL,
 record_id VARCHAR(64) NOT NULL,
 branch_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 operation VARCHAR(16) NOT NULL,
 before_json LONGTEXT,
 after_json LONGTEXT,
 created_at DATETIME NOT NULL,
 UNIQUE KEY uq_mutation_event_v10 (event_id),
 KEY idx_mutation_resource_v10 (resource, record_id),
 KEY idx_mutation_branch_v10 (branch_id, created_at),
 CONSTRAINT fk_mutation_branch_v10 FOREIGN KEY (branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_mutation_actor_v10 FOREIGN KEY (actor_id)
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- QC analyzer names are branch-scoped MySQL data, not localStorage.
CREATE TABLE IF NOT EXISTS tlab_qc_analyzers (
 branch_id VARCHAR(64) NOT NULL,
 name VARCHAR(191) NOT NULL,
 active TINYINT(1) NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY(branch_id,name),
 CONSTRAINT fk_qc_analyzers_branch FOREIGN KEY(branch_id)
  REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- Optional account password upgrades are performed by the application.
-- Do not rewrite legacy raw_json credentials in SQL or set shared defaults.
-- Referential-integrity audit before adding further FKs:
SELECT 'orphan_branch_map' AS check_name, COUNT(*) AS count
FROM mysql_store_branch_access m LEFT JOIN branches b ON b.id=m.branch_id
WHERE b.id IS NULL
UNION ALL
SELECT 'orphan_user_branch', COUNT(*)
FROM user_branches ub LEFT JOIN users u ON u.id=ub.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_user_branch_permissions', COUNT(*)
FROM user_branch_permissions bp LEFT JOIN users u ON u.id=bp.user_id
WHERE u.id IS NULL;
SELECT 'duplicate_usernames' AS check_name,username,COUNT(*) AS cnt
FROM users GROUP BY username HAVING COUNT(*)>1;
SELECT 'duplicate_contract_codes' AS check_name,code,COUNT(*) AS cnt
FROM corporate_contracts GROUP BY code HAVING COUNT(*)>1;
SELECT 'mapped' AS category,store_name,branch_id,COUNT(*) AS records
FROM mysql_store_branch_access
WHERE store_name IN ('corporateContracts','users','cultureResults','antibioticsCatalog','qcControlLots','qcRuns','homeVisits')
GROUP BY store_name,branch_id ORDER BY store_name,branch_id;
-- Deleting medically signed results or quality-control evidence is NOT safe.
-- App endpoints will soft-archive records, retaining their audit/history.
