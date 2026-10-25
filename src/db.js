import pg from 'pg';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
  }
  return pool;
}

export async function initDb() {
  const db = getPool();
  if (!db) {
    console.warn('DATABASE_URL is not set; running without persistent PostgreSQL storage.');
    return false;
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新しいチャット',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      run_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, id);
    CREATE TABLE IF NOT EXISTS app_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      task TEXT NOT NULL,
      result JSONB NOT NULL,
      zip_data BYTEA,
      zip_filename TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS app_runs_session_idx ON app_runs(session_id, created_at DESC);
  `);
  return true;
}

export async function ensureSession(id, title = '新しいチャット') {
  const db = getPool();
  if (!db) return;
  await db.query(`INSERT INTO app_sessions(id,title) VALUES($1,$2)
    ON CONFLICT(id) DO UPDATE SET updated_at=NOW()`, [id, title.slice(0, 120)]);
}

export async function addMessage({ sessionId, role, content, attachments = [], runId = null }) {
  const db = getPool();
  if (!db) return;
  await ensureSession(sessionId, role === 'user' ? content : '新しいチャット');
  await db.query(`INSERT INTO chat_messages(session_id,role,content,attachments,run_id)
    VALUES($1,$2,$3,$4::jsonb,$5)`, [sessionId, role, content, JSON.stringify(attachments), runId]);
  await db.query('UPDATE app_sessions SET updated_at=NOW() WHERE id=$1', [sessionId]);
}

export async function getMessages(sessionId, limit = 60) {
  const db = getPool();
  if (!db) return [];
  const result = await db.query(`SELECT m.role,m.content,m.attachments,m.run_id,m.created_at,
    (r.zip_data IS NOT NULL) AS has_zip FROM chat_messages m
    LEFT JOIN app_runs r ON r.id=m.run_id
    WHERE m.session_id=$1 ORDER BY m.id DESC LIMIT $2`, [sessionId, limit]);
  return result.rows.reverse();
}

export async function listSessions(limit = 30) {
  const db = getPool();
  if (!db) return [];
  const result = await db.query(`SELECT s.id,s.title,s.updated_at,
    (SELECT content FROM chat_messages m WHERE m.session_id=s.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM app_sessions s ORDER BY s.updated_at DESC LIMIT $1`, [limit]);
  return result.rows;
}

export async function saveRunRecord(run, zipBuffer = null) {
  const db = getPool();
  if (!db) return;
  await db.query(`INSERT INTO app_runs(id,session_id,status,task,result,zip_data,zip_filename)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)
    ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,result=EXCLUDED.result,
      zip_data=EXCLUDED.zip_data,zip_filename=EXCLUDED.zip_filename`, [
    run.id, run.sessionId ?? 'default', run.status, run.task,
    JSON.stringify(run), zipBuffer, zipBuffer ? `${run.id}.zip` : null,
  ]);
}

export async function getRunRecord(id) {
  const db = getPool();
  if (!db) return null;
  const result = await db.query('SELECT result,zip_data,zip_filename FROM app_runs WHERE id=$1', [id]);
  return result.rows[0] ?? null;
}

export async function closeDb() {
  if (pool) await pool.end();
}
