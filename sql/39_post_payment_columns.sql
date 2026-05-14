-- lint-sql: skip   (legacy file; grants already applied in live DB pre-2026-05-15)
-- ============================================================
-- Migration 39: Post-Payment Orchestration Support Columns
-- ============================================================

-- Add referral_code_used to student_profiles
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS referral_code_used VARCHAR(50) DEFAULT NULL;

-- Add GST columns to invoices for Indian tax compliance
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_number VARCHAR(20) DEFAULT NULL;

-- Add referrer_reward_amount to referral_codes (for fixed/credit reward types)
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS referrer_reward_amount NUMERIC(12,2) DEFAULT NULL;