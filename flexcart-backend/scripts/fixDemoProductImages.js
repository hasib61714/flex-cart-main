require('dotenv').config();
const { pool } = require('../config/db');

const run = async () => {
  const [rows] = await pool.query(
    `SELECT id, name
     FROM products`
  );

  if (!rows.length) {
    console.log('No products found that need image fixes.');
    process.exit(0);
  }

  let updated = 0;
  for (const row of rows) {
    await pool.query(
      `UPDATE products
       SET image_url = ?, images = ?
       WHERE id = ?`,
      [null, null, row.id]
    );

    updated++;
    process.stdout.write(`\r  Updated ${updated}/${rows.length}: ${String(row.name || '').substring(0, 40)}`);
  }

  console.log(`\nDone! Cleared images for ${updated} products.`);
  process.exit(0);
};

run().catch((e) => {
  console.error('\nError:', e.message);
  process.exit(1);
});
