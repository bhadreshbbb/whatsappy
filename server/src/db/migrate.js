import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/whatscart',
  });

  try {
    console.log('Running migrations...');

    const migrationPath = path.join(__dirname, '../../database/migrations/ecommerce.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);
    
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
