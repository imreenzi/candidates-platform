import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'cache.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS search_cache (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    location TEXT NOT NULL,
    platforms TEXT NOT NULL,
    results TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS search_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    query TEXT NOT NULL,
    location TEXT NOT NULL,
    platforms TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    message TEXT DEFAULT '',
    results TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cache_query ON search_cache(query, location);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON search_jobs(status);
`);

const TTL_MS = parseInt(process.env.CACHE_TTL_HOURS || '24') * 60 * 60 * 1000;

function cacheKey(query, location, platforms) {
  return [query.toLowerCase().trim(), location.toLowerCase().trim(), [...platforms].sort().join(',')].join('|');
}

export function getCached(query, location, platforms) {
  const key = cacheKey(query, location, platforms);
  const now = Date.now();
  const row = db.prepare('SELECT results FROM search_cache WHERE id = ? AND expires_at > ?').get(key, now);
  return row ? JSON.parse(row.results) : null;
}

export function setCache(query, location, platforms, results) {
  const key = cacheKey(query, location, platforms);
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO search_cache (id, query, location, platforms, results, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(key, query, location, platforms.join(','), JSON.stringify(results), now, now + TTL_MS);
}

export function createJob(id, query, location, platforms) {
  db.prepare(`
    INSERT INTO search_jobs (id, status, query, location, platforms, created_at)
    VALUES (?, 'pending', ?, ?, ?, ?)
  `).run(id, query, location, platforms.join(','), Date.now());
}

export function updateJob(id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(fields);
  db.prepare(`UPDATE search_jobs SET ${sets} WHERE id = ?`).run(...vals, id);
}

export function getJob(id) {
  return db.prepare('SELECT * FROM search_jobs WHERE id = ?').get(id);
}
