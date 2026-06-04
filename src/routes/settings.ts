import { Hono } from 'hono';
import type { Env, SettingRow } from '../types';
import { query, run } from '../db';
import { ok, badRequest } from '../response';
import { hashPassword } from '../utils/crypto';
import { maskToken } from '../utils/validation';

const settings = new Hono<{ Bindings: Env }>();

// GET /api/settings
settings.get('/', async (c) => {
  const rows = await query<SettingRow>(c.env.DB, 'SELECT * FROM settings');
  const data: Record<string, string> = {};

  for (const row of rows) {
    // Mask sensitive values
    if (row.key === 'login_password_hash') {
      data['login_password'] = '******';
    } else if (row.key === 'gptmail_api_key') {
      data[row.key] = row.value ? maskToken(row.value) : '';
    } else {
      data[row.key] = row.value;
    }
  }

  return ok(data);
});

// PUT /api/settings
settings.put('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  const updated: string[] = [];
  const errors: string[] = [];

  // Update login password
  if (body.login_password) {
    const pwd = body.login_password.trim();
    if (pwd.length < 4) {
      errors.push('密码长度至少为 4 位');
    } else {
      const hashed = await hashPassword(pwd);
      await run(
        c.env.DB,
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('login_password_hash', ?, CURRENT_TIMESTAMP)`,
        [hashed]
      );
      updated.push('登录密码');
    }
  }

  // Update GPTMail API Key
  if (body.gptmail_api_key !== undefined) {
    await run(
      c.env.DB,
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gptmail_api_key', ?, CURRENT_TIMESTAMP)`,
      [body.gptmail_api_key.trim()]
    );
    updated.push('GPTMail API Key');
  }

  // Update site title
  if (body.site_title !== undefined) {
    await run(
      c.env.DB,
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('site_title', ?, CURRENT_TIMESTAMP)`,
      [body.site_title.trim()]
    );
    updated.push('站点标题');
  }

  if (errors.length > 0) return badRequest(errors.join('；'));
  if (updated.length === 0) return badRequest('没有需要更新的设置');

  return ok(null, `已更新：${updated.join(', ')}`);
});

export default settings;
