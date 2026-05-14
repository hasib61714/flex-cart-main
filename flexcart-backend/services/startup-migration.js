const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');

async function safeQuery(sql, label) {
  try {
    await pool.query(sql);
    console.log(`[Migration] ✓ ${label}`);
  } catch (e) {
    // Ignore "already exists / already null / duplicate" type errors (MySQL 5.7 + 8.0 compatible)
    if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY'].includes(e.code)) {
      console.warn(`[Migration] ⚠ ${label}: ${e.message}`);
    }
  }
}

async function runStartupMigration() {
  try {
    console.log('[Migration] Running startup schema migration…');

    // ── orders: delivery_charge column ────────────────────────────────────
    await safeQuery(
      `ALTER TABLE orders ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00`,
      'orders.delivery_charge column'
    );

    // ── orders: allow NULL on shipping_address ─────────────────────────────
    await safeQuery(
      `ALTER TABLE orders MODIFY COLUMN shipping_address TEXT NULL DEFAULT NULL`,
      'orders.shipping_address → nullable'
    );

    // ── platform_settings: insert new delivery zone pricing ───────────────
    await safeQuery(
      `INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
         ('delivery_inside_dhaka',   '60.00',  'Base delivery charge inside Dhaka (BDT)'),
         ('delivery_outside_dhaka',  '120.00', 'Base delivery charge outside Dhaka (BDT)'),
         ('delivery_extra_per_item', '30.00',  'Additional charge per extra item beyond the first (BDT)')
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         description   = VALUES(description)`,
      'platform_settings: delivery zone keys upserted'
    );

    // ── platform_settings: remove obsolete packaging/routing keys ─────────
    await safeQuery(
      `DELETE FROM platform_settings WHERE setting_key IN (
         'cost_per_kg','cost_per_foot',
         'packaging_plastic','packaging_glass','packaging_fragile','packaging_standard',
         'route_branch_to_branch','route_branch_to_address'
       )`,
      'platform_settings: old packaging/routing keys removed'
    );

    // ── revenue_history table ─────────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS revenue_history (
         id               INT AUTO_INCREMENT PRIMARY KEY,
         order_id         INT NOT NULL,
         order_number     VARCHAR(50) NOT NULL,
         sale_date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         product_total    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         delivery_charge  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
         commission_rate  DECIMAL(5,2)  NOT NULL DEFAULT 5.00,
         commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         delivery_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
         source_type      ENUM('cart','buy_now') NOT NULL DEFAULT 'cart',
         FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
         INDEX idx_rh_order_id (order_id),
         INDEX idx_rh_sale_date (sale_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'revenue_history table'
    );

    // ── category_commissions table ────────────────────────────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS category_commissions (
         id                INT AUTO_INCREMENT PRIMARY KEY,
         category_id       INT NOT NULL,
         category_name     VARCHAR(100) NOT NULL DEFAULT '',
         commission_rate   DECIMAL(5,2) NOT NULL DEFAULT 5.00,
         updated_by_user_id INT DEFAULT NULL,
         updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_cc_category (category_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'category_commissions table'
    );

    // ── feedbacks: company_id + feedback_type + status ────────────────────
    await safeQuery(
      `ALTER TABLE feedbacks ADD COLUMN company_id INT DEFAULT NULL`,
      'feedbacks.company_id column'
    );
    await safeQuery(
      `ALTER TABLE feedbacks ADD COLUMN feedback_type ENUM('feedback','complaint') NOT NULL DEFAULT 'feedback'`,
      'feedbacks.feedback_type column'
    );
    await safeQuery(
      `ALTER TABLE feedbacks ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'open'`,
      'feedbacks.status column'
    );

    // ── products: is_cod_allowed ──────────────────────────────────────────
    await safeQuery(
      `ALTER TABLE products ADD COLUMN is_cod_allowed TINYINT(1) NOT NULL DEFAULT 0`,
      'products.is_cod_allowed column'
    );

    // ── users: plain_password for admin panel visibility ──────────────────
    await safeQuery(
      `ALTER TABLE users ADD COLUMN plain_password TEXT NULL DEFAULT NULL`,
      'users.plain_password column'
    );

    // ── product_requests: out-of-stock notification requests ──────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS product_requests (
         id           INT AUTO_INCREMENT PRIMARY KEY,
         user_id      INT NOT NULL,
         product_id   INT NOT NULL,
         is_notified  TINYINT(1) NOT NULL DEFAULT 0,
         notified_at  TIMESTAMP NULL DEFAULT NULL,
         created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uq_pr_user_product (user_id, product_id),
         INDEX idx_pr_product_id (product_id),
         INDEX idx_pr_notified (is_notified)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'product_requests table'
    );

    // ── password_reset_otps: OTP-based password recovery ─────────────────
    await safeQuery(
      `CREATE TABLE IF NOT EXISTS password_reset_otps (
         id               INT AUTO_INCREMENT PRIMARY KEY,
         user_id          INT NOT NULL,
         otp_code         VARCHAR(6) NOT NULL,
         reset_token      VARCHAR(64) NULL DEFAULT NULL,
         is_used          TINYINT(1) NOT NULL DEFAULT 0,
         is_verified      TINYINT(1) NOT NULL DEFAULT 0,
         expires_at       DATETIME NOT NULL,
         token_expires_at DATETIME NULL DEFAULT NULL,
         created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_pro_user  (user_id),
         INDEX idx_pro_token (reset_token)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      'password_reset_otps table'
    );

    console.log('[Migration] Startup migration complete.\n');

    // ── Seed default Super Admin (idempotent) ─────────────────────────────
    try {
      const SA_EMAIL = 'flexcart@gmail.com';
      const SA_USER  = 'SuperAdmin';
      const SA_PASS  = 'superadmin@123';
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? OR role = 'super_admin' LIMIT 1",
        [SA_EMAIL]
      );
      if (existing.length === 0) {
        const hash = await bcrypt.hash(SA_PASS, 12);
        await pool.query(
          `INSERT INTO users (username, email, password_hash, plain_password, role, is_verified, is_approved, status)
           VALUES (?, ?, ?, ?, 'super_admin', 1, 1, 'active')`,
          [SA_USER, SA_EMAIL, hash, SA_PASS]
        );
        console.log('[Migration] ✓ Default Super Admin created (flexcart@gmail.com)');
      }
    } catch (e) {
      console.warn('[Migration] ⚠ Super Admin seed:', e.message);
    }
  } catch (error) {
    console.error('[Migration] Fatal migration error:', error.message);
    // Non-fatal — server continues; log for manual review
  }
}

module.exports = { runStartupMigration };
