/**
 * SSLCommerz payment callback controller.
 * These endpoints are called by SSLCommerz (no auth), so they must
 * only trust data that has been independently validated via the SSL API.
 */
const { pool } = require('../config/db');
const { validatePayment, FRONTEND_URL } = require('../services/sslService');

/**
 * SSLCommerz POSTs here on successful payment.
 * We validate the payment server-side before marking the order as paid.
 */
const paymentSuccess = async (req, res) => {
  try {
    const { tran_id, val_id, status, amount, currency } = req.body;

    if (!tran_id || !val_id) {
      return res.redirect(`${FRONTEND_URL}/payment/fail?reason=invalid_callback`);
    }

    // Verify with SSLCommerz API — never trust the POST body alone
    const validation = await validatePayment(val_id);

    const isValid =
      validation &&
      validation.status === 'VALID' &&
      validation.tran_id === tran_id &&
      parseFloat(validation.currency_amount) === parseFloat(amount);

    if (!isValid) {
      // Tampered or invalid — do not mark as paid
      return res.redirect(`${FRONTEND_URL}/payment/fail?reason=validation_failed`);
    }

    // Find order by ssl_tran_id
    const [rows] = await pool.query(
      'SELECT id, order_number, payment_status FROM orders WHERE ssl_tran_id = ? LIMIT 1',
      [tran_id]
    );

    if (!rows.length) {
      return res.redirect(`${FRONTEND_URL}/payment/fail?reason=order_not_found`);
    }

    const order = rows[0];

    // Idempotent — skip update if already paid
    if (order.payment_status !== 'paid') {
      await pool.query(
        `UPDATE orders SET payment_status = 'paid', ssl_val_id = ?, updated_at = NOW()
         WHERE id = ? AND payment_status = 'pending'`,
        [val_id, order.id]
      );

      // Log in ssl_transactions for audit trail
      await pool.query(
        `INSERT INTO ssl_transactions (order_id, tran_id, val_id, amount, currency, status, raw_response)
         VALUES (?, ?, ?, ?, ?, 'success', ?)
         ON DUPLICATE KEY UPDATE val_id = VALUES(val_id), status = 'success', updated_at = NOW()`,
        [order.id, tran_id, val_id, parseFloat(amount), currency || 'BDT', JSON.stringify(req.body)]
      );
    }

    return res.redirect(`${FRONTEND_URL}/payment/success?order=${order.order_number}`);
  } catch (error) {
    console.error('Payment success callback error:', error);
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=server_error`);
  }
};

/**
 * SSLCommerz POSTs here on payment failure.
 */
const paymentFail = async (req, res) => {
  try {
    const { tran_id } = req.body;
    if (tran_id) {
      // Log failure (non-blocking)
      pool.query(
        `INSERT INTO ssl_transactions (order_id, tran_id, val_id, amount, currency, status, raw_response)
         SELECT id, ?, '', 0, 'BDT', 'failed', ? FROM orders WHERE ssl_tran_id = ? LIMIT 1
         ON DUPLICATE KEY UPDATE status = 'failed', updated_at = NOW()`,
        [tran_id, JSON.stringify(req.body), tran_id]
      ).catch(() => {});
    }
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=payment_failed`);
  } catch {
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=payment_failed`);
  }
};

/**
 * SSLCommerz POSTs here when user cancels.
 */
const paymentCancel = async (req, res) => {
  return res.redirect(`${FRONTEND_URL}/payment/fail?reason=cancelled`);
};

/**
 * SSLCommerz IPN (server-to-server notification).
 * Must return 200 quickly. This is the most reliable payment confirmation.
 */
const paymentIPN = async (req, res) => {
  // Acknowledge immediately to avoid IPN retry storms
  res.status(200).json({ received: true });

  try {
    const { tran_id, val_id, status, amount, currency } = req.body;

    if (!tran_id || !val_id || status !== 'VALID') return;

    const validation = await validatePayment(val_id);

    const isValid =
      validation &&
      validation.status === 'VALID' &&
      validation.tran_id === tran_id;

    if (!isValid) return;

    const [rows] = await pool.query(
      'SELECT id, payment_status FROM orders WHERE ssl_tran_id = ? LIMIT 1',
      [tran_id]
    );

    if (!rows.length) return;
    const order = rows[0];

    if (order.payment_status !== 'paid') {
      await pool.query(
        `UPDATE orders SET payment_status = 'paid', ssl_val_id = ?, updated_at = NOW()
         WHERE id = ? AND payment_status = 'pending'`,
        [val_id, order.id]
      );

      await pool.query(
        `INSERT INTO ssl_transactions (order_id, tran_id, val_id, amount, currency, status, raw_response)
         VALUES (?, ?, ?, ?, ?, 'success', ?)
         ON DUPLICATE KEY UPDATE val_id = VALUES(val_id), status = 'success', updated_at = NOW()`,
        [order.id, tran_id, val_id, parseFloat(amount), currency || 'BDT', JSON.stringify(req.body)]
      );
    }
  } catch (error) {
    console.error('IPN processing error:', error);
  }
};

/**
 * Check payment status for a given order number (authenticated users only).
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT o.id, o.order_number, o.payment_status, o.payment_method, o.total_amount,
              o.ssl_tran_id, o.ssl_val_id, o.created_at
       FROM orders o
       WHERE o.order_number = ? AND o.user_id = ?
       LIMIT 1`,
      [orderNumber, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get payment status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { paymentSuccess, paymentFail, paymentCancel, paymentIPN, getPaymentStatus };
