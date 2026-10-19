-- =============================================================================
--  Student Clearance Management System - MySQL Schema
--  University of Ibadan | Osunlana Anjoolaoluwa Victor (230922)
--
--  Idempotent: safe to run repeatedly (CREATE IF NOT EXISTS / INSERT ... ON
--  DUPLICATE KEY UPDATE). Run via:  npm run db:init  (from /server)
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. USERS (students, section officers, admins)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(100) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('student','officer','admin') NOT NULL,
  matric_number  VARCHAR(20) UNIQUE DEFAULT NULL,   -- students only
  department     VARCHAR(100) DEFAULT NULL,
  faculty        VARCHAR(100) DEFAULT NULL,
  hall           VARCHAR(100) DEFAULT NULL,
  section_code   VARCHAR(50)  DEFAULT NULL,         -- officers only -> clearance_stages.code
  phone_number   VARCHAR(20)  DEFAULT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMP NULL DEFAULT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_section (section_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 2. CLEARANCE STAGES (master list - the 10 real UI stages)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clearance_stages (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  code                    VARCHAR(50) UNIQUE NOT NULL,
  stage_name              VARCHAR(100) NOT NULL,
  stage_order             INT NOT NULL,
  location                VARCHAR(150) DEFAULT NULL,
  description             TEXT DEFAULT NULL,
  estimated_duration_days INT NOT NULL DEFAULT 1,
  requires_payment        BOOLEAN NOT NULL DEFAULT FALSE,
  payment_amount          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_stage_order (stage_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 3. STAGE PREREQUISITES (DAG edges: stage_id depends on prerequisite_stage_id)
--    Normalized junction table so Admin can reconfigure the workflow at runtime.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage_prerequisites (
  stage_id              INT NOT NULL,
  prerequisite_stage_id INT NOT NULL,
  PRIMARY KEY (stage_id, prerequisite_stage_id),
  FOREIGN KEY (stage_id)              REFERENCES clearance_stages(id) ON DELETE CASCADE,
  FOREIGN KEY (prerequisite_stage_id) REFERENCES clearance_stages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 4. DOCUMENT TYPES (vault taxonomy - a doc is uploaded once, reused per stage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_types (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50) UNIQUE NOT NULL,
  label       VARCHAR(150) NOT NULL,
  description VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 5. STAGE REQUIREMENTS (which document types each stage demands)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage_requirements (
  stage_id         INT NOT NULL,
  document_type_id INT NOT NULL,
  is_mandatory     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (stage_id, document_type_id),
  FOREIGN KEY (stage_id)         REFERENCES clearance_stages(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 6. DOCUMENTS - the student's shared "document vault"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  student_id        INT NOT NULL,
  document_type_id  INT NOT NULL,
  file_url          VARCHAR(500) NOT NULL,          -- Cloudinary secure_url (or /uploads/... in local mode)
  storage_public_id VARCHAR(255) DEFAULT NULL,      -- Cloudinary public_id, for deletion
  original_name     VARCHAR(255) DEFAULT NULL,
  mime_type         VARCHAR(100) DEFAULT NULL,
  file_size         INT DEFAULT NULL,
  uploaded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id)       REFERENCES users(id)          ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id),
  INDEX idx_documents_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 7. CLEARANCE STATUS - one row per student per stage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clearance_status (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  student_id   INT NOT NULL,
  stage_id     INT NOT NULL,
  status       ENUM('not_started','pending','approved','rejected') NOT NULL DEFAULT 'not_started',
  officer_id   INT DEFAULT NULL,
  remarks      VARCHAR(500) DEFAULT NULL,
  submitted_at TIMESTAMP NULL DEFAULT NULL,
  reviewed_at  TIMESTAMP NULL DEFAULT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_stage (student_id, stage_id),
  FOREIGN KEY (student_id) REFERENCES users(id)            ON DELETE CASCADE,
  FOREIGN KEY (stage_id)   REFERENCES clearance_stages(id) ON DELETE CASCADE,
  FOREIGN KEY (officer_id) REFERENCES users(id)            ON DELETE SET NULL,
  INDEX idx_status_lookup (stage_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 8. SUBMISSION DOCUMENTS - links vault documents to a specific stage submission
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_documents (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  clearance_status_id INT NOT NULL,
  document_id         INT NOT NULL,
  attached_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_submission_doc (clearance_status_id, document_id),
  FOREIGN KEY (clearance_status_id) REFERENCES clearance_status(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id)         REFERENCES documents(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 9. PAYMENTS (Remita)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  student_id    INT NOT NULL,
  stage_id      INT DEFAULT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  reference     VARCHAR(100) UNIQUE NOT NULL,
  rrr           VARCHAR(30) DEFAULT NULL,
  status        ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  gateway       VARCHAR(30) NOT NULL DEFAULT 'remita',
  authorization_url VARCHAR(500) DEFAULT NULL,
  paid_at       TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id)            ON DELETE CASCADE,
  FOREIGN KEY (stage_id)   REFERENCES clearance_stages(id) ON DELETE SET NULL,
  INDEX idx_payments_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 10. CERTIFICATES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificates (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  student_id       INT NOT NULL,
  certificate_no   VARCHAR(60) UNIQUE NOT NULL,
  certificate_url  VARCHAR(500) DEFAULT NULL,
  verification_code VARCHAR(64) UNIQUE NOT NULL,
  generated_by     INT DEFAULT NULL,
  generated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 11. NOTIFICATIONS  (addresses the "no real-time notification" research gap)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(150) NOT NULL,
  message    VARCHAR(500) NOT NULL,
  channel    ENUM('in_app','sms','email') NOT NULL DEFAULT 'in_app',
  delivery_status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  stage_id   INT DEFAULT NULL,
  read_at    TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)            ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES clearance_stages(id) ON DELETE SET NULL,
  INDEX idx_notif_user (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 12. AUDIT LOGS (accountability - admin overrides, officer decisions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  actor_id    INT DEFAULT NULL,
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50) DEFAULT NULL,
  entity_id   INT DEFAULT NULL,
  details     JSON DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 13. SETTINGS (key/value; currently holds the clearance deadline)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) DEFAULT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 14. PASSWORD RESETS (only a SHA-256 of the emailed token is stored)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reset_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =============================================================================
--  REFERENCE DATA
-- =============================================================================

-- --- The 10 real University of Ibadan clearance stages -----------------------
INSERT INTO clearance_stages
  (id, code, stage_name, stage_order, location, description, estimated_duration_days, requires_payment, payment_amount)
VALUES
  (1,'library','Library Clearance',1,NULL,
   'First clearance stage. Online verification by Kenneth Dike Library (KDL). Upload your Library ID Card and ensure all library accounts are in good standing.',1,FALSE,0.00),
  (2,'hall','Caution and Hall Clearance',2,NULL,
   'Hostel and residential clearance. Online verification of accommodation records, caution deposit, and session fee receipts.',2,FALSE,0.00),
  (3,'clinic','University Health Services Clearance',3,NULL,
   'University Health Services clearance. Online verification of institutional health registration card and medical records.',1,FALSE,0.00),
  (4,'alumni','Alumni Association Clearance',4,NULL,
   'Alumni association clearance. Verification of alumni registration and dues payment receipt for digital graduation records.',1,TRUE,1000.00),
  (5,'department','Departmental Clearance',5,NULL,
   'Departmental verification confirming all academic coursework, project submission, and departmental dues are settled. You will need your departmental clearance slip for all subsequent stages.',2,FALSE,0.00),
  (6,'sports','Sports Council Clearance',6,NULL,
   'Sports Council online clearance verification. Verifies student sports disengagement and equipment clearance against approved prerequisite records.',1,FALSE,0.00),
  (7,'faculty','Faculty Clearance',7,NULL,
   'Verification at your Faculty Office (~30 minutes). Requires approved Departmental Clearance, Sports Clearance, KDL Library Clearance, Alumni Clearance, and Hall Clearance.',2,FALSE,0.00),
  (8,'lodgings','Lodgings Clearance',8,NULL,
   'Student Affairs residential disengagement verification. Confirms student lodging records and prerequisite clearances prior to Bursary review.',1,FALSE,0.00),
  (9,'bursar','Bursary Financial Clearance',9,NULL,
   'Comprehensive bursary and financial audit. Digital reconciliation of all academic session fees, convocation fee receipt, and prior section endorsements.',3,FALSE,0.00),
  (10,'student_affairs','Student Affairs Division Clearance (Final)',10,NULL,
   'Final institutional sign-off and clearance certificate issuance by the Student Affairs Division upon completion of all departmental, faculty, and central clearances.',2,FALSE,0.00)
ON DUPLICATE KEY UPDATE
  stage_name=VALUES(stage_name), stage_order=VALUES(stage_order), location=VALUES(location),
  description=VALUES(description), estimated_duration_days=VALUES(estimated_duration_days),
  requires_payment=VALUES(requires_payment), payment_amount=VALUES(payment_amount);

-- --- Stage dependency graph --------------------------------------------------
-- Stages 1,2,3,4,5 are entry points (no prerequisites) and may run in parallel.
INSERT IGNORE INTO stage_prerequisites (stage_id, prerequisite_stage_id) VALUES
  -- 6 Sports <- Library, Hall, Alumni
  (6,1),(6,2),(6,4),
  -- 7 Faculty <- Library, Hall, Alumni, Department, Sports
  (7,1),(7,2),(7,4),(7,5),(7,6),
  -- 8 Lodgings <- stages 1-7
  (8,1),(8,2),(8,3),(8,4),(8,5),(8,6),(8,7),
  -- 9 Bursar <- stages 1-8
  (9,1),(9,2),(9,3),(9,4),(9,5),(9,6),(9,7),(9,8),
  -- 10 Student Affairs <- stages 1-9
  (10,1),(10,2),(10,3),(10,4),(10,5),(10,6),(10,7),(10,8),(10,9);

-- --- Document vault taxonomy -------------------------------------------------
INSERT INTO document_types (id, code, label, description) VALUES
  (1,'kdl_id_card','KDL Library ID Card','Kenneth Dike Library identification card'),
  (2,'school_fee_receipts','School Fee Receipts (100L - Final Year)','All session fee receipts from 100L through final year'),
  (3,'passport_photo','Passport Photograph','Recent colour passport photograph'),
  (4,'school_id','School Identity Card','University of Ibadan student ID card'),
  (5,'off_campus_form','Off-Campus Form','Required for any academic session student resided off campus'),
  (6,'room_clearance','Room Clearance Form','Hall room clearance sign-off'),
  (7,'jaja_card','University Health Services Card','University Health Services medical registration card'),
  (8,'alumni_form','Alumni Registration Form','Completed and printed form from alumni.ui.edu.ng'),
  (9,'alumni_receipt','Alumni Payment Receipt (₦1,000)','Official payment receipt for alumni registration'),
  (10,'dept_signoff','Departmental Clearance Slip','Academic department clearance confirmation and dues sign-off'),
  (11,'graduation_fee_receipt','Graduation Fee Receipt','Official receipt for graduation / convocation fee'),
  (12,'statement_of_result','Statement of Result','Official university personal statement of result'),
  (13,'maintenance_clearance','Hall Maintenance Clearance','Stamped maintenance sign-off slip from hall maintenance unit'),
  (14,'library_clearance_slip','Library Clearance Slip','Stamped Kenneth Dike Library clearance form'),
  (15,'hall_clearance_slip','Hall Clearance Slip','Signed and stamped Hall of Residence clearance slip'),
  (16,'sports_clearance_slip','Sports Council Clearance Slip','Official Sports Council clearance sign-off'),
  (17,'faculty_clearance_slip','Faculty Clearance Slip','Signed and stamped clearance form from Faculty Office'),
  (18,'lodgings_clearance_slip','Lodgings Clearance Slip','Student Affairs Lodgings sign-off'),
  (19,'bursar_clearance_slip','Bursar Clearance Certificate','Official Bursary clearance certificate')
ON DUPLICATE KEY UPDATE label=VALUES(label), description=VALUES(description);

-- --- Which documents each stage requires -------------------------------------
INSERT IGNORE INTO stage_requirements (stage_id, document_type_id, is_mandatory) VALUES
  (1,1,TRUE),
  (2,2,TRUE),(2,6,TRUE),(2,3,TRUE),(2,4,TRUE),(2,13,TRUE),(2,5,FALSE),
  (3,7,TRUE),
  (4,9,TRUE),(4,8,TRUE),
  (5,10,TRUE),
  (6,4,TRUE),(6,15,TRUE),(6,9,TRUE),(6,14,TRUE),
  (7,10,TRUE),(7,16,TRUE),(7,14,TRUE),(7,9,TRUE),(7,15,TRUE),
  (8,4,TRUE),(8,15,TRUE),(8,18,TRUE),
  (9,7,TRUE),(9,3,TRUE),(9,11,TRUE),(9,9,TRUE),(9,15,TRUE),(9,13,TRUE),(9,16,TRUE),(9,2,TRUE),(9,17,TRUE),(9,10,TRUE),(9,18,TRUE),(9,14,TRUE),(9,12,TRUE),
  (10,19,TRUE),(10,11,TRUE),(10,7,TRUE),(10,9,TRUE),(10,16,TRUE),(10,15,TRUE),(10,14,TRUE),(10,2,TRUE),(10,10,TRUE),(10,17,TRUE),(10,18,TRUE),(10,12,TRUE);
