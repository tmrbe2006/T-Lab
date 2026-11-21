-- T-Lab relationship integrity v11. MySQL 5.5 / 8.x.
-- Safe on existing data: does NOT alter or delete orphan rows.
-- Adds a foreign key ONLY when both columns are compatible and no orphans exist.
-- All skipped constraints are recorded for review in tlab_fk_migration_notes.
-- Backup before execution. MySQL ALTER TABLE commits and can lock tables.
CREATE TABLE IF NOT EXISTS tlab_fk_migration_notes (
 fk_name VARCHAR(64) NOT NULL PRIMARY KEY,
 child_table VARCHAR(64) NOT NULL,
 child_column VARCHAR(64) NOT NULL,
 parent_table VARCHAR(64) NOT NULL,
 status VARCHAR(40) NOT NULL,
 orphan_count BIGINT NOT NULL DEFAULT 0,
 checked_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

DROP PROCEDURE IF EXISTS tlab_try_add_fk_v11;
DELIMITER $$
CREATE PROCEDURE tlab_try_add_fk_v11(
 IN p_child VARCHAR(64),IN p_column VARCHAR(64),
 IN p_parent VARCHAR(64),IN p_fk VARCHAR(64)
)
BEGIN
 DECLARE v_ready INTEGER DEFAULT 0;
 DECLARE v_exists INTEGER DEFAULT 0;
 DECLARE v_status VARCHAR(40) DEFAULT 'not_checked';
 DECLARE v_orphans BIGINT DEFAULT 0;
 DECLARE v_child_type VARCHAR(128);
 DECLARE v_parent_type VARCHAR(128);
 DECLARE v_child_collation VARCHAR(64);
 DECLARE v_parent_collation VARCHAR(64);
 SELECT COUNT(*) INTO v_exists
 FROM information_schema.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=p_fk
   AND CONSTRAINT_TYPE='FOREIGN KEY';
 IF v_exists>0 THEN
   SET v_status='already_present';
 ELSE
   SELECT COUNT(*) INTO v_ready
   FROM information_schema.COLUMNS c
   JOIN information_schema.COLUMNS p
     ON p.TABLE_SCHEMA=c.TABLE_SCHEMA AND p.TABLE_NAME=p_parent
     AND p.COLUMN_NAME='id'
   JOIN information_schema.TABLES tc ON tc.TABLE_SCHEMA=c.TABLE_SCHEMA
     AND tc.TABLE_NAME=c.TABLE_NAME
   JOIN information_schema.TABLES tp ON tp.TABLE_SCHEMA=p.TABLE_SCHEMA
     AND tp.TABLE_NAME=p.TABLE_NAME
   WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=p_child
     AND c.COLUMN_NAME=p_column AND c.DATA_TYPE=p.DATA_TYPE
     AND c.CHARACTER_MAXIMUM_LENGTH=p.CHARACTER_MAXIMUM_LENGTH
     AND COALESCE(c.COLLATION_NAME,'')=COALESCE(p.COLLATION_NAME,'')
     AND tc.ENGINE='InnoDB' AND tp.ENGINE='InnoDB';
   IF v_ready=0 THEN
     SET v_status='missing_or_incompatible_columns';
   ELSE
     SET @tlab_orphans_v11=NULL;
     SET @tlab_stmt_v11=CONCAT('SELECT COUNT(*) INTO @tlab_orphans_v11 FROM `',
       p_child,'` c LEFT JOIN `',p_parent,
       '` p ON p.`id`=c.`',p_column,
       '` WHERE c.`',p_column,'` IS NOT NULL AND p.`id` IS NULL');
     PREPARE st FROM @tlab_stmt_v11;
     EXECUTE st;
     DEALLOCATE PREPARE st;
     SET v_orphans=COALESCE(@tlab_orphans_v11,0);
     IF v_orphans>0 THEN
       SET v_status='skipped_orphan_records';
     ELSE
       SET @tlab_stmt_v11=CONCAT('ALTER TABLE `',p_child,
         '` ADD CONSTRAINT `',p_fk,'` FOREIGN KEY (`',
         p_column,'`) REFERENCES `',p_parent,
         '` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT');
       PREPARE st FROM @tlab_stmt_v11;
       EXECUTE st;
       DEALLOCATE PREPARE st;
       SET v_status='created';
     END IF;
   END IF;
 END IF;
 INSERT INTO tlab_fk_migration_notes(fk_name,child_table,child_column,parent_table,status,orphan_count,checked_at)
 VALUES (p_fk,p_child,p_column,p_parent,v_status,v_orphans,NOW())
 ON DUPLICATE KEY UPDATE status=VALUES(status),orphan_count=VALUES(orphan_count),checked_at=NOW();
END$$
DELIMITER ;

CALL tlab_try_add_fk_v11('lab_requests','patient_id','patients','fk_tlab_req_patient');
CALL tlab_try_add_fk_v11('lab_requests','doctor_id','doctors','fk_tlab_req_doctor');
CALL tlab_try_add_fk_v11('request_items','request_id','lab_requests','fk_tlab_req_item_request');
CALL tlab_try_add_fk_v11('request_items','test_id','lab_tests','fk_tlab_req_item_test');
CALL tlab_try_add_fk_v11('samples','request_id','lab_requests','fk_tlab_sample_request');
CALL tlab_try_add_fk_v11('samples','patient_id','patients','fk_tlab_sample_patient');
CALL tlab_try_add_fk_v11('lab_results','request_id','lab_requests','fk_tlab_result_request');
CALL tlab_try_add_fk_v11('lab_results','patient_id','patients','fk_tlab_result_patient');
CALL tlab_try_add_fk_v11('lab_results','test_id','lab_tests','fk_tlab_result_test');
CALL tlab_try_add_fk_v11('invoices','patient_id','patients','fk_tlab_invoice_patient');
CALL tlab_try_add_fk_v11('invoices','request_id','lab_requests','fk_tlab_invoice_request');
CALL tlab_try_add_fk_v11('invoice_items','invoice_id','invoices','fk_tlab_line_invoice');
CALL tlab_try_add_fk_v11('invoice_items','test_id','lab_tests','fk_tlab_line_test');
CALL tlab_try_add_fk_v11('payments','invoice_id','invoices','fk_tlab_payment_invoice');
CALL tlab_try_add_fk_v11('payments','patient_id','patients','fk_tlab_payment_patient');
CALL tlab_try_add_fk_v11('inventory_lots','item_id','inventory_items','fk_tlab_lot_item');
CALL tlab_try_add_fk_v11('stock_movements','item_id','inventory_items','fk_tlab_stock_item');
CALL tlab_try_add_fk_v11('stock_movements','lot_id','inventory_lots','fk_tlab_stock_lot');
CALL tlab_try_add_fk_v11('purchase_invoices','supplier_id','suppliers','fk_tlab_purchase_supplier');
CALL tlab_try_add_fk_v11('doctor_commissions','doctor_id','doctors','fk_tlab_commission_doctor');
CALL tlab_try_add_fk_v11('doctor_commissions','invoice_id','invoices','fk_tlab_commission_invoice');
CALL tlab_try_add_fk_v11('home_visits','patient_id','patients','fk_tlab_home_patient');
CALL tlab_try_add_fk_v11('culture_results','patient_id','patients','fk_tlab_culture_patient');
CALL tlab_try_add_fk_v11('culture_results','request_id','lab_requests','fk_tlab_culture_request');
CALL tlab_try_add_fk_v11('qc_runs','lot_id','qc_control_lots','fk_tlab_qcrun_lot');
CALL tlab_try_add_fk_v11('critical_value_logs','result_id','lab_results','fk_tlab_critical_result');
CALL tlab_try_add_fk_v11('ai_recognition_findings','analysis_id','ai_image_analyses','fk_tlab_ai_findings_analysis');
CALL tlab_try_add_fk_v11('lab_to_lab_dispatches','ref_lab_id','reference_lab_partners','fk_tlab_dispatch_reflab');
CALL tlab_try_add_fk_v11('mysql_store_branch_access','branch_id','branches','fk_tlab_store_branch');
CALL tlab_try_add_fk_v11('user_branches','user_id','users','fk_tlab_userbranch_user');
CALL tlab_try_add_fk_v11('user_branches','branch_id','branches','fk_tlab_userbranch_branch');
CALL tlab_try_add_fk_v11('user_branch_permissions','user_id','users','fk_tlab_perm_user');
CALL tlab_try_add_fk_v11('user_branch_permissions','branch_id','branches','fk_tlab_perm_branch');
DROP PROCEDURE IF EXISTS tlab_try_add_fk_v11;
SELECT fk_name,status,orphan_count FROM tlab_fk_migration_notes ORDER BY fk_name;
-- Any skipped_orphan_records requires manual reconciliation using your actual
-- clinical/financial data, not fabricated test records.
