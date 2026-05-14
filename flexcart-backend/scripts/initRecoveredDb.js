const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const SOURCE_DB_NAME = process.env.DB_NAME || 'flexcart_db';
const TARGET_DB_NAME = process.env.DB_RECOVERED_NAME || 'flexcart_db_recovered';

const run = async () => {
  const sqlPath = path.join(__dirname, '..', 'models', 'database.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');

  if (!/CREATE DATABASE IF NOT EXISTS/i.test(sql) || !/USE\s+/i.test(sql)) {
    throw new Error('database.sql does not contain expected CREATE DATABASE / USE statements');
  }

  sql = sql.replace(/CREATE DATABASE IF NOT EXISTS\s+`?[^`\s;]+`?\s*;/i, `CREATE DATABASE IF NOT EXISTS \`${TARGET_DB_NAME}\`;`);
  sql = sql.replace(/USE\s+`?[^`\s;]+`?\s*;/i, `USE \`${TARGET_DB_NAME}\`;`);
  sql = sql.replace(/seller_reply_at\s+TIMESTAMP\s+DEFAULT\s+NULL/gi, 'seller_reply_at TIMESTAMP NULL DEFAULT NULL');
  sql = sql.replace(/INSERT\s+INTO[\s\S]*?;/gi, '');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    await connection.query(sql);
    console.log(`✅ Recovered database initialized: ${TARGET_DB_NAME}`);
    if (SOURCE_DB_NAME === TARGET_DB_NAME) {
      console.log('ℹ️ Target DB is same as current DB_NAME');
    } else {
      console.log(`ℹ️ Update DB_NAME in .env from ${SOURCE_DB_NAME} to ${TARGET_DB_NAME} and restart backend`);
    }
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error('❌ Failed to initialize recovered database');
  console.error(error.code || error.name, error.errno || '', error.sqlMessage || error.message);
  process.exit(1);
});