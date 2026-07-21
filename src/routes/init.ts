import { Hono } from 'hono';
import type { Env } from '../types';
import { ok, fail } from '../response';

// Database initialization endpoint (protected by JWT_SECRET)
// Used for dashboard deployment where wrangler CLI is not available
// URL: /api/init/:secret
const init = new Hono<{ Bindings: Env }>();

init.get('/:secret', async (c) => {
  try {
    // Verify JWT_SECRET
    const secret = c.req.param('secret');
    if (!c.env.JWT_SECRET || secret !== c.env.JWT_SECRET) {
      return fail('UNAUTHORIZED', '无效的初始化密钥', 401);
    }

    const db = c.env.DB;

    // Create tables using batch (D1 exec() has limitations with multi-statement)
    // Must match migrations/*.sql
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        color TEXT DEFAULT '#2563eb',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        client_id TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        password TEXT DEFAULT '',
        group_id INTEGER DEFAULT 1,
        remark TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS temp_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        source TEXT DEFAULT '',
        remark TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6366f1',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS account_tags (
        account_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (account_id, tag_id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_account_tags_tag ON account_tags(tag_id)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS push_state (
        account_id INTEGER PRIMARY KEY,
        last_pushed_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )`),
    ]);

    // Insert default group if not exists (match migration 0001_init.sql)
    const defaultGroup = await db.prepare('SELECT id FROM groups WHERE id = 1').first();
    if (!defaultGroup) {
      await db.prepare('INSERT INTO groups (id, name, description, color) VALUES (1, ?, ?, ?)').bind(
        '默认分组',
        '默认邮箱分组',
        '#2563eb'
      ).run();
    }

    // Insert default settings if not exists
    const defaultSettings = [
      { key: 'admin_password', value: '' },
      { key: 'token_refresh_enabled', value: 'false' },
      { key: 'token_refresh_interval', value: '1440' },
      { key: 'token_refresh_batch_size', value: '10' },
      { key: 'telegram_push_enabled', value: 'false' },
      { key: 'telegram_bot_token', value: '' },
      { key: 'telegram_chat_id', value: '' },
      { key: 'telegram_push_interval', value: '1' },
      { key: 'external_api_key', value: '' },
    ];

    for (const setting of defaultSettings) {
      const existing = await db.prepare('SELECT key FROM settings WHERE key = ?').first(setting.key);
      if (!existing) {
        await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind(setting.key, setting.value).run();
      }
    }

    return ok({
      message: '数据库初始化成功！',
      tables: ['settings', 'groups', 'accounts', 'temp_emails', 'tags', 'account_tags', 'push_state'],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Database initialization failed:', msg);
    return fail('INIT_FAILED', `数据库初始化失败：${msg}`, 500);
  }
});

export default init;