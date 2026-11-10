-- ============================================================================
-- T-Lab Medical Laboratory & ERP System - EMPTY DATABASE (EXCEPT USERS TABLE)
-- اسكريبت قاعدة بيانات فارغة الجداول بالكامل ماعدا جدول المستخدمين (users)
-- Compatible with: MySQL 5.5, 5.6, 5.7, and MySQL 8.0.28+ (Community Server)
-- Generated At: 2026-11-10T17:09:32.116Z
-- Target Database: tlab_db
-- ============================================================================

SET NAMES utf8;
SET time_zone = "+00:00";
SET foreign_key_checks = 0;
SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";

CREATE DATABASE IF NOT EXISTS `tlab_db` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `tlab_db`;

-- --------------------------------------------------------
-- Table structure for table `patients` (المرضى (Patients))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `patients` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `gender` VARCHAR(16),
  `age` INT DEFAULT 0,
  `phone` VARCHAR(64),
  `national_id` VARCHAR(64),
  `address` VARCHAR(255),
  `default_discount` DECIMAL(10,2) DEFAULT 0.00,
  `created_at` VARCHAR(32),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_patients_code (code),
  INDEX idx_patients_phone (phone),
  INDEX idx_patients_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `patients`;

-- --------------------------------------------------------
-- Table structure for table `doctors` (الأطباء المحولون والداخليون (Doctors))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doctors` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `specialty` VARCHAR(128),
  `phone` VARCHAR(64),
  `type` VARCHAR(32),
  `commission_rate` DECIMAL(10,2) DEFAULT 0.00,
  `commission_enabled` TINYINT(1) DEFAULT 1,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_doctors_code (code),
  INDEX idx_doctors_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `doctors`;

-- --------------------------------------------------------
-- Table structure for table `lab_tests` (كتالوج التحاليل الطبية (Lab Tests))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lab_tests` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `department` VARCHAR(128),
  `sample_type` VARCHAR(128),
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `tat_hours` INT DEFAULT 24,
  `commission_eligible` TINYINT(1) DEFAULT 1,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_tests_code (code),
  INDEX idx_tests_dept (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `lab_tests`;

-- --------------------------------------------------------
-- Table structure for table `test_parameters` (بارامترات التحاليل والمعدلات الطبيعية (Test Parameters))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `test_parameters` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `test_id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(64),
  `name_ar` VARCHAR(191),
  `name_en` VARCHAR(191),
  `unit` VARCHAR(64),
  `normal_min` DECIMAL(12,4) DEFAULT 0,
  `normal_max` DECIMAL(12,4) DEFAULT 0,
  `sort_order` INT DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_test_params_test (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `test_parameters`;

-- --------------------------------------------------------
-- Table structure for table `lab_requests` (طلبات التحاليل (Lab Requests))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lab_requests` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `request_number` VARCHAR(64) NOT NULL,
  `barcode` VARCHAR(64),
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64),
  `type` VARCHAR(32),
  `status` VARCHAR(32),
  `priority` VARCHAR(32),
  `created_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_req_number (request_number),
  INDEX idx_req_patient (patient_id),
  INDEX idx_req_status (status),
  INDEX idx_req_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `lab_requests`;

-- --------------------------------------------------------
-- Table structure for table `request_items` (بنود طلبات التحاليل (Request Items))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `request_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `request_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64) NOT NULL,
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_req_items_req (request_id),
  INDEX idx_req_items_test (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `request_items`;

-- --------------------------------------------------------
-- Table structure for table `samples` (العينات والباركود (Samples))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `samples` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `sample_code` VARCHAR(64) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `sample_type` VARCHAR(128),
  `status` VARCHAR(32),
  `collected_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_samples_code (sample_code),
  INDEX idx_samples_req (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `samples`;

-- --------------------------------------------------------
-- Table structure for table `lab_results` (نتائج التحاليل الطبية (Lab Results))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lab_results` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `request_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32),
  `has_critical` TINYINT(1) DEFAULT 0,
  `approved_by` VARCHAR(64),
  `approved_at` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_results_req (request_id),
  INDEX idx_results_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `lab_results`;

-- --------------------------------------------------------
-- Table structure for table `invoices` (فواتير المرضى (Invoices))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL,
  `request_id` VARCHAR(64),
  `patient_id` VARCHAR(64) NOT NULL,
  `doctor_id` VARCHAR(64),
  `date` VARCHAR(32),
  `subtotal` DECIMAL(14,2) DEFAULT 0.00,
  `discount_amount` DECIMAL(14,2) DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) DEFAULT 0.00,
  `net_total` DECIMAL(14,2) DEFAULT 0.00,
  `paid_amount` DECIMAL(14,2) DEFAULT 0.00,
  `remaining_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_inv_num (invoice_number),
  INDEX idx_inv_patient (patient_id),
  INDEX idx_inv_date (date),
  INDEX idx_inv_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `invoices`;

-- --------------------------------------------------------
-- Table structure for table `invoice_items` (بنود الفواتير (Invoice Items))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_id` VARCHAR(64) NOT NULL,
  `test_id` VARCHAR(64) NOT NULL,
  `test_name_ar` VARCHAR(191),
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `net_after_discount_tax` DECIMAL(12,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_inv_items_inv (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `invoice_items`;

-- --------------------------------------------------------
-- Table structure for table `payments` (سندات القبض والمدفوعات (Payments))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payment_number` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(14,2) DEFAULT 0.00,
  `method` VARCHAR(32),
  `date` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_pay_inv (invoice_id),
  INDEX idx_pay_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `payments`;

-- --------------------------------------------------------
-- Table structure for table `expenses` (المصروفات (Expenses))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `expense_number` VARCHAR(64) NOT NULL,
  `category` VARCHAR(128) NOT NULL,
  `amount` DECIMAL(14,2) DEFAULT 0.00,
  `date` VARCHAR(32),
  `notes` VARCHAR(255),
  `created_by` VARCHAR(64),
  `raw_json` LONGTEXT,
  INDEX idx_exp_date (date),
  INDEX idx_exp_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `expenses`;

-- --------------------------------------------------------
-- Table structure for table `doctor_commissions` (عمولات الأطباء (Doctor Commissions))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doctor_commissions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `doctor_id` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) NOT NULL,
  `commission_rate` DECIMAL(10,2) DEFAULT 0.00,
  `commission_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `date` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_comm_doc (doctor_id),
  INDEX idx_comm_inv (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `doctor_commissions`;

-- --------------------------------------------------------
-- Table structure for table `inventory_items` (أصناف المخزون والكواشف (Inventory Items))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `barcode` VARCHAR(64),
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `category` VARCHAR(64),
  `current_stock` DECIMAL(14,3) DEFAULT 0.000,
  `min_stock_level` DECIMAL(14,3) DEFAULT 0.000,
  `average_cost` DECIMAL(14,2) DEFAULT 0.00,
  `supplier_id` VARCHAR(64),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_inv_item_code (code),
  INDEX idx_inv_item_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `inventory_items`;

-- --------------------------------------------------------
-- Table structure for table `inventory_lots` (التشغيلات وتواريخ الصلاحية (Inventory Lots / FEFO))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_lots` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `lot_number` VARCHAR(64) NOT NULL,
  `item_id` VARCHAR(64) NOT NULL,
  `expiry_date` VARCHAR(32),
  `initial_qty` DECIMAL(14,3) DEFAULT 0.000,
  `remaining_qty` DECIMAL(14,3) DEFAULT 0.000,
  `unit_cost` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `qc_status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_lots_item (item_id),
  INDEX idx_lots_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `inventory_lots`;

-- --------------------------------------------------------
-- Table structure for table `stock_movements` (حركات المخزون (Stock Movements))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `movement_number` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32),
  `item_id` VARCHAR(64) NOT NULL,
  `lot_id` VARCHAR(64),
  `quantity` DECIMAL(14,3) DEFAULT 0.000,
  `total_cost` DECIMAL(14,2) DEFAULT 0.00,
  `date` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_mov_item (item_id),
  INDEX idx_mov_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `stock_movements`;

-- --------------------------------------------------------
-- Table structure for table `test_boms` (قوائم استهلاك الكواشف للتحاليل (Test BOMs))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `test_boms` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `test_id` VARCHAR(64) NOT NULL,
  `test_code` VARCHAR(64),
  `test_name_ar` VARCHAR(191),
  `direct_reagent_cost` DECIMAL(14,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_bom_test (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `test_boms`;

-- --------------------------------------------------------
-- Table structure for table `stock_taking_sessions` (جلسات الجرد الدوري للمخزون (Stock Taking Sessions))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stock_taking_sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `session_number` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32),
  `warehouse` VARCHAR(128),
  `status` VARCHAR(32),
  `total_variance_value` DECIMAL(14,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_stock_take_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `stock_taking_sessions`;

-- --------------------------------------------------------
-- Table structure for table `suppliers` (الموردون والشركات (Suppliers))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `phone` VARCHAR(64),
  `tax_number` VARCHAR(64),
  `current_balance` DECIMAL(14,2) DEFAULT 0.00,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_sup_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `suppliers`;

-- --------------------------------------------------------
-- Table structure for table `purchase_invoices` (فواتير المشتريات والتوريد (Purchase Invoices))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `purchase_invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL,
  `supplier_id` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32),
  `net_total` DECIMAL(14,2) DEFAULT 0.00,
  `paid_amount` DECIMAL(14,2) DEFAULT 0.00,
  `remaining_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_pur_sup (supplier_id),
  INDEX idx_pur_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `purchase_invoices`;

-- --------------------------------------------------------
-- Table structure for table `return_notes` (إشعارات المرتجعات الدائنة والمدينة (Return Notes))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `return_notes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `note_number` VARCHAR(64) NOT NULL,
  `type` VARCHAR(32),
  `original_invoice_id` VARCHAR(64),
  `date` VARCHAR(32),
  `net_return_amount` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_ret_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `return_notes`;

-- --------------------------------------------------------
-- Table structure for table `chart_of_accounts` (شجرة الحسابات المحاسبية (Chart of Accounts))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chart_of_accounts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `parent_code` VARCHAR(64),
  `name_ar` VARCHAR(191) NOT NULL,
  `name_en` VARCHAR(191),
  `type` VARCHAR(32),
  `balance` DECIMAL(16,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_coa_code (code),
  INDEX idx_coa_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `chart_of_accounts`;

-- --------------------------------------------------------
-- Table structure for table `journal_entries` (قيود اليومية المحاسبية (Journal Entries))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journal_entries` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `entry_number` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32),
  `description` VARCHAR(255),
  `reference_type` VARCHAR(64),
  `reference_id` VARCHAR(64),
  `total_debit` DECIMAL(16,2) DEFAULT 0.00,
  `total_credit` DECIMAL(16,2) DEFAULT 0.00,
  `raw_json` LONGTEXT,
  INDEX idx_je_num (entry_number),
  INDEX idx_je_date (date),
  INDEX idx_je_ref (reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `journal_entries`;

-- --------------------------------------------------------
-- Table structure for table `cost_centers` (مراكز التكلفة (Cost Centers))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cost_centers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191),
  `budget_monthly` DECIMAL(14,2) DEFAULT 0.00,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `cost_centers`;

-- --------------------------------------------------------
-- Table structure for table `period_locks` (إقفال الفترات المحاسبية (Period Closing Locks))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `period_locks` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `period_month` VARCHAR(32) NOT NULL,
  `locked` TINYINT(1) DEFAULT 0,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `period_locks`;

-- --------------------------------------------------------
-- Table structure for table `cashbox_sessions` (ورديات الخزينة (Cashbox Sessions))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cashbox_sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `opened_by` VARCHAR(64),
  `opened_at` VARCHAR(32),
  `opening_balance` DECIMAL(14,2) DEFAULT 0.00,
  `status` VARCHAR(32),
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `cashbox_sessions`;

-- --------------------------------------------------------
-- Table structure for table `daily_closings` (التقفيل اليومي (Daily Closings))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_closings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `date` VARCHAR(32) NOT NULL,
  `total_collected` DECIMAL(14,2) DEFAULT 0.00,
  `total_expenses` DECIMAL(14,2) DEFAULT 0.00,
  `net_cash` DECIMAL(14,2) DEFAULT 0.00,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `daily_closings`;

-- --------------------------------------------------------
-- Table structure for table `employees` (الموظفون (Employees))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employees` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL,
  `name_ar` VARCHAR(191),
  `role` VARCHAR(64),
  `department` VARCHAR(128),
  `salary` DECIMAL(12,2) DEFAULT 0.00,
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `employees`;

-- --------------------------------------------------------
-- Table structure for table `users` (حسابات المستخدمين (Users))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL,
  `full_name_ar` VARCHAR(191),
  `role` VARCHAR(64),
  `active` TINYINT(1) DEFAULT 1,
  `raw_json` LONGTEXT,
  INDEX idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `users`;

-- Dumping data ONLY for table `users` (6 user accounts)
REPLACE INTO `users` (`id`, `username`, `full_name_ar`, `role`, `active`, `raw_json`) VALUES
('usr_1', 'owner', 'د. طارق المنشاوي (المالك)', 'Owner', 1, '{"id":"usr_1","username":"owner","passwordHash":"owner123","fullNameAr":"د. طارق المنشاوي (المالك)","fullNameEn":"Dr. Tarek El-Menshawy (Owner)","role":"Owner","employeeId":"emp_1","active":true,"createdAt":"2022-01-10"}'),
('usr_2', 'doctor', 'د. سلمى عبد الرحمن', 'Doctor', 1, '{"id":"usr_2","username":"doctor","passwordHash":"doctor123","fullNameAr":"د. سلمى عبد الرحمن","fullNameEn":"Dr. Salma Abdelrahman","role":"Doctor","employeeId":"emp_2","active":true,"createdAt":"2022-03-15"}'),
('usr_3', 'chemist', 'ك. محمود الشافعي', 'Chemist', 1, '{"id":"usr_3","username":"chemist","passwordHash":"chemist123","fullNameAr":"ك. محمود الشافعي","fullNameEn":"Mahmoud El-Shafei","role":"Chemist","employeeId":"emp_3","active":true,"createdAt":"2023-01-20"}'),
('usr_4', 'technician', 'أحمد حسن فؤاد', 'Technician', 1, '{"id":"usr_4","username":"technician","passwordHash":"tech123","fullNameAr":"أحمد حسن فؤاد","fullNameEn":"Ahmed Hassan Fouad","role":"Technician","employeeId":"emp_4","active":true,"createdAt":"2023-05-01"}'),
('usr_5', 'admin', 'مريم عادل نصار', 'Receptionist', 1, '{"id":"usr_5","username":"admin","passwordHash":"admin123","fullNameAr":"مريم عادل نصار","fullNameEn":"Mariam Adel Nassar","role":"Receptionist","employeeId":"emp_5","active":true,"createdAt":"2023-07-12"}'),
('usr_6', 'accountant', 'خالد سعيد منصور', 'Accountant', 1, '{"id":"usr_6","username":"accountant","passwordHash":"accountant123","fullNameAr":"خالد سعيد منصور","fullNameEn":"Khaled Saeed Mansour","role":"Accountant","employeeId":"emp_6","active":true,"createdAt":"2022-11-01"}');

-- --------------------------------------------------------
-- Table structure for table `roles` (الأدوار الوظيفية (Roles))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL,
  `label_ar` VARCHAR(191),
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `roles`;

-- --------------------------------------------------------
-- Table structure for table `role_permissions` (صلاحيات الأدوار (Role Permissions))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `role` VARCHAR(64) NOT NULL,
  `resource` VARCHAR(64) NOT NULL,
  `can_view` TINYINT(1) DEFAULT 0,
  `can_create` TINYINT(1) DEFAULT 0,
  `can_edit` TINYINT(1) DEFAULT 0,
  `can_delete` TINYINT(1) DEFAULT 0,
  `raw_json` LONGTEXT,
  INDEX idx_perm_role (role, resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `role_permissions`;

-- --------------------------------------------------------
-- Table structure for table `lab_settings` (إعدادات المعمل (Lab Settings))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lab_settings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `lab_name_ar` VARCHAR(191),
  `lab_name_en` VARCHAR(191),
  `phone` VARCHAR(64),
  `currency` VARCHAR(16),
  `default_tax_rate` DECIMAL(8,2) DEFAULT 14.00,
  `raw_json` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `lab_settings`;

-- --------------------------------------------------------
-- Table structure for table `audit_logs` (سجل المراجعة الأمني (Audit Logs))
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64),
  `username` VARCHAR(64),
  `role` VARCHAR(64),
  `screen` VARCHAR(64),
  `action` VARCHAR(191),
  `record_id` VARCHAR(64),
  `timestamp` VARCHAR(32),
  `raw_json` LONGTEXT,
  INDEX idx_audit_time (timestamp),
  INDEX idx_audit_screen (screen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
TRUNCATE TABLE `audit_logs`;

SET foreign_key_checks = 1;
-- End of T-Lab Empty Database (Users Only) SQL Script