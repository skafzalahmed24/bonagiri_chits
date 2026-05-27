const { sequelize } = require('./src/models');

const sql = `
-- 1. Create a Sample Company
INSERT INTO "companies" (
  "id", "company_name", "company_email", "company_password", 
  "company_id", "is_deleted_status", "createdAt", "updatedAt"
) VALUES (
  '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 'Swaraja Chits Pvt Ltd', 'admin@swaraja.com', 'pass123',
  'COMP-123456', 0, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- 2. Create Members
-- Subscriber Member (ID: 8)
INSERT INTO "member" (
  "id", "name", "member_id", "company_id", "other_info_user_code", 
  "other_info_user_password", "is_deleted_status", "group_status", "createdAt", "updatedAt"
) VALUES (
  8, 'Anuradha Reddy', 'MEM000008', '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 888888,
  'pass123', 0, 0, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Prize Winner Member (ID: 12, Priya Sharma)
INSERT INTO "member" (
  "id", "name", "member_id", "company_id", "other_info_user_code", 
  "other_info_user_password", "is_deleted_status", "group_status", "createdAt", "updatedAt"
) VALUES (
  12, 'Priya Sharma', '12', '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 121212,
  'pass123', 0, 0, NOW(), NOW()
) ON CONFLICT DO NOTHING;


-- 3. Create Chit Groups (Status: 1 = Active/Started)
-- Swaraja Chit
INSERT INTO "chits_groups" (
  "id", "group_name", "chit_series_term", "auction_type", "chit_amount", 
  "no_of_installments", "installment_amount", "chits_group_status", "running_status",
  "company_id", "is_deleted_status", "auction_date", "createdAt", "updatedAt"
) VALUES (
  '71a5b81e-df22-411a-8bb9-2d334589c933', 'Swaraja Chit', 1, 1, 100000.00,
  25, 5000.00, 1, 1,
  '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 0, CURRENT_DATE, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Silver Savings Chit
INSERT INTO "chits_groups" (
  "id", "group_name", "chit_series_term", "auction_type", "chit_amount", 
  "no_of_installments", "installment_amount", "chits_group_status", "running_status",
  "company_id", "is_deleted_status", "auction_date", "createdAt", "updatedAt"
) VALUES (
  'e2f8d38e-cf02-4ec0-b8d9-2d129759c8bb', 'Silver Savings Chit', 1, 1, 100000.00,
  15, 5000.00, 1, 1,
  '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 0, CURRENT_DATE, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Smart Saver Chit
INSERT INTO "chits_groups" (
  "id", "group_name", "chit_series_term", "auction_type", "chit_amount", 
  "no_of_installments", "installment_amount", "chits_group_status", "running_status",
  "company_id", "is_deleted_status", "auction_date", "createdAt", "updatedAt"
) VALUES (
  '3acf36ee-44f5-4b91-a748-3cf81c151cc7', 'Smart Saver Chit', 1, 1, 100000.00,
  15, 5000.00, 1, 1,
  '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 0, CURRENT_DATE, NOW(), NOW()
) ON CONFLICT DO NOTHING;


-- 4. Create Enrollments for Member 8
-- Enrolled in Swaraja Chit (Enrollment ID: 101)
INSERT INTO "enrollments" (
  "id", "company_id", "group_id", "group_position_number", "subscriber_id", 
  "delete_status", "createdAt", "updatedAt", "payment_mode_id", "intimation_card_id", "business_type_id", "area_id"
) VALUES (
  101, '82f8d38e-cf02-4ec0-b8d9-2d129759c864', '71a5b81e-df22-411a-8bb9-2d334589c933', 1, 8,
  0, NOW(), NOW(), 1, 1, 1, 1
) ON CONFLICT DO NOTHING;

-- Enrolled in Silver Savings Chit (Enrollment ID: 102)
INSERT INTO "enrollments" (
  "id", "company_id", "group_id", "group_position_number", "subscriber_id", 
  "delete_status", "createdAt", "updatedAt", "payment_mode_id", "intimation_card_id", "business_type_id", "area_id"
) VALUES (
  102, '82f8d38e-cf02-4ec0-b8d9-2d129759c864', 'e2f8d38e-cf02-4ec0-b8d9-2d129759c8bb', 2, 8,
  0, NOW(), NOW(), 1, 1, 1, 1
) ON CONFLICT DO NOTHING;

-- Enrolled in Smart Saver Chit (Enrollment ID: 103)
INSERT INTO "enrollments" (
  "id", "company_id", "group_id", "group_position_number", "subscriber_id", 
  "delete_status", "createdAt", "updatedAt", "payment_mode_id", "intimation_card_id", "business_type_id", "area_id"
) VALUES (
  103, '82f8d38e-cf02-4ec0-b8d9-2d129759c864', '3acf36ee-44f5-4b91-a748-3cf81c151cc7', 3, 8,
  0, NOW(), NOW(), 1, 1, 1, 1
) ON CONFLICT DO NOTHING;


-- 5. Create Unpaid Chits Installments for Member 8
-- Installment for Swaraja Chit (Clean due: ₹5,000)
INSERT INTO "chits_installments" (
  "id", "enrollment_id", "type", "installment_no", "due_date", 
  "over_due_days_count", "penalty_amount", "payable_amount", "createdAt", "updatedAt"
) VALUES (
  'c1a5b81e-df22-411a-8bb9-2d334589c9aa', 101, 1, 1, '2026-03-10',
  0, 0.00, 5000.00, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- Installment for Silver Savings Chit (Overdue: ₹2,500 due + ₹350 penalty)
INSERT INTO "chits_installments" (
  "id", "enrollment_id", "type", "installment_no", "due_date", 
  "over_due_days_count", "penalty_amount", "payable_amount", "createdAt", "updatedAt"
) VALUES (
  'e2f8d38e-cf02-4ec0-b8d9-2d129759c8bb', 102, 1, 1, '2026-03-15',
  5, 350.00, 2500.00, NOW(), NOW()
) ON CONFLICT DO NOTHING;


-- 6. Create Auction Record won by Priya Sharma
INSERT INTO "auctions" (
  "id", "company_id", "group_id", "ticket_number", "bidder_id", 
  "auction_number", "auction_date", "due_date", "next_auction_date", 
  "bid_amount", "gst_number_percentage", "pb_bo_proxy", "minutes_filing_date", 
  "installments", "chit_amount", "bid_loss", "bid_payable", 
  "company_commission", "gst_amount", "dividend_payable", "subscription_amount", 
  "dividend", "net_payable", "createdAt", "updatedAt"
) VALUES (
  '12f8d38e-cf02-4ec0-b8d9-2d129759c8ff', '82f8d38e-cf02-4ec0-b8d9-2d129759c864', '71a5b81e-df22-411a-8bb9-2d334589c933', 10, 12,
  10, '2026-05-20', '2026-05-25', '2026-06-20',
  65000.00, 18.00, 'PROXY', '2026-05-22',
  10, 100000.00, 35000.00, 65000.00,
  5000.00, 900.00, 29100.00, 5000.00,
  29100.00, 65000.00, NOW(), NOW()
) ON CONFLICT DO NOTHING;
`;

async function runSeed() {
  console.log('Starting seed operation in PostgreSQL database...');
  try {
    await sequelize.query(sql);
    console.log('Database successfully seeded with Swaraja and Silver Savings Chit dashboard test data!');
    process.exit(0);
  } catch (error) {
    console.error('Seed operation failed:', error);
    process.exit(1);
  }
}

runSeed();
