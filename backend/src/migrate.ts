import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

async function migrate(): Promise<void> {
  try {
    const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
    await pool.query(schema);
    console.log('Aura & Loom database schema is ready.');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error('Database schema initialization failed:', error);
  process.exitCode = 1;
});
