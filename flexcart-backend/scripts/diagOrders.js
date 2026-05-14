/**
 * Diagnostic script: checks columns in orders + deliveries tables
 * and runs the getOrders query to surface the real error.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'flexcart_db',
  });

  // Check columns in orders table
  const [orderCols] = await pool.query('SHOW COLUMNS FROM orders');
  const orderColNames = orderCols.map(c => c.Field);
  console.log('orders columns:', orderColNames.join(', '));

  // Check columns in deliveries table
  const [delivCols] = await pool.query('SHOW COLUMNS FROM deliveries');
  const delivColNames = delivCols.map(c => c.Field);
  console.log('deliveries columns:', delivColNames.join(', '));

  // Flag missing columns
  const missingOrders = ['assigned_branch_id', 'assigned_branch_at'].filter(c => !orderColNames.includes(c));
  const missingDeliveries = ['from_branch_id', 'to_branch_id'].filter(c => !delivColNames.includes(c));

  if (missingOrders.length) console.log('MISSING from orders:', missingOrders);
  else console.log('orders: all required columns present');

  if (missingDeliveries.length) console.log('MISSING from deliveries:', missingDeliveries);
  else console.log('deliveries: all required columns present');

  // Try the actual query
  try {
    const [rows] = await pool.query(`
      SELECT o.id, o.order_number, o.total_amount, o.order_status as status,
             o.payment_status, o.payment_method,
             o.shipping_address, o.shipping_city, o.shipping_country,
             o.created_at, o.updated_at,
             o.assigned_branch_id, o.assigned_branch_at,
             ab.name as assigned_branch_name,
             u.username as customer_name, u.email as customer_email, u.phone as customer_phone,
             COUNT(oi.id) as item_count,
             d.id as delivery_id, d.status as delivery_status,
             d.delivery_boy_name, d.vehicle_plate,
             fb.name as from_branch_name, tb.name as to_branch_name
      FROM orders o
      LEFT JOIN users u         ON u.id  = o.user_id
      LEFT JOIN order_items oi  ON oi.order_id = o.id
      LEFT JOIN deliveries d    ON d.order_id  = o.id
      LEFT JOIN branches ab     ON ab.id = o.assigned_branch_id
      LEFT JOIN branches fb     ON fb.id = d.from_branch_id
      LEFT JOIN branches tb     ON tb.id = d.to_branch_id
      WHERE 1=1
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT 10 OFFSET 0
    `);
    console.log('Query OK, row count:', rows.length);
  } catch (e) {
    console.error('Query ERROR:', e.message);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
