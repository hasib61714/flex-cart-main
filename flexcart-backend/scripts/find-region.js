'use strict';
const { Pool } = require('pg');
const REF = 'dldtplwkapttdvqhrenz';
const PASS_ENCODED = encodeURIComponent('Saiful123@#');
const PASS_RAW = 'Saiful123@#';

const REGIONS = ['ap-southeast-1','ap-south-1','us-east-1','eu-west-1','us-west-1','ap-northeast-1'];
const PORTS = [5432, 6543];

async function tryConnect(host, port, user, password) {
  const pool = new Pool({ host, port, user, password, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000, max: 1 });
  try {
    await pool.query('SELECT 1');
    await pool.end();
    return true;
  } catch(e) {
    await pool.end().catch(() => {});
    return e.message.split('\n')[0];
  }
}

async function main() {
  for (const region of REGIONS) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    for (const port of PORTS) {
      process.stdout.write(`Testing ${region}:${port} ... `);
      const r = await tryConnect(host, port, `postgres.${REF}`, PASS_RAW);
      if (r === true) {
        console.log('✅ CONNECTED!');
        console.log(`\nWORKING DATABASE_URL:\npostgresql://postgres.${REF}:${PASS_ENCODED}@${host}:${port}/postgres`);
        process.exit(0);
      }
      console.log(`❌ ${r}`);
    }
  }
  console.log('\nAll pooler tests failed. Trying direct IPv6 connection...');
  // Try direct connection via IPv6 literal
  const ipv6 = '2406:da18:167b:f900:317f:849e:616a:6743';
  const r = await tryConnect(ipv6, 5432, 'postgres', PASS_RAW);
  if (r === true) {
    console.log(`✅ IPv6 direct CONNECTED!`);
    console.log(`\nWORKING DATABASE_URL:\npostgresql://postgres:${PASS_ENCODED}@[${ipv6}]:5432/postgres`);
  } else {
    console.log(`❌ IPv6 direct: ${r}`);
    console.log('\nYour network has no IPv6 support. Please enable IPv4 on your Supabase project.');
    console.log('Go to: Supabase Dashboard > Settings > Database > Network Restrictions > Add IPv4 add-on');
  }
}
main();
