import { Hono } from 'hono';
import type { Env, AccountRow } from '../types';
import { first, run } from '../db';
import { ok, notFound, badRequest } from '../response';
import { getAccessToken, fetchEmails, fetchEmailDetail } from '../graph';

const emails = new Hono<{ Bindings: Env }>();

// Helper: get token and auto-save rotated refresh_token
async function getTokenAndRefresh(
  db: D1Database,
  acc: AccountRow
): Promise<{ token?: string; error?: string }> {
  const result = await getAccessToken(acc.client_id, acc.refresh_token);

  if (!result.token) {
    await run(db, 'UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['error', acc.id]);
    return { error: result.error?.message ?? 'Token acquisition failed' };
  }

  // Auto-save new refresh_token if Microsoft rotated it
  if (result.newRefreshToken && result.newRefreshToken !== acc.refresh_token) {
    await run(
      db,
      'UPDATE accounts SET refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [result.newRefreshToken, 'active', acc.id]
    );
  }

  return { token: result.token };
}

// GET /api/accounts/:id/emails
emails.get('/', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');

  if (acc.status === 'disabled') {
    return badRequest('该账号已停用');
  }

  const folder = c.req.query('folder') ?? 'inbox';
  const top = Math.min(parseInt(c.req.query('top') ?? '20', 10), 50);
  const skip = parseInt(c.req.query('skip') ?? '0', 10);
  const keyword = c.req.query('keyword');

  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) {
    return ok({ items: [], error: tokenResult.error }, 'Graph API 认证失败');
  }

  const result = await fetchEmails(tokenResult.token, { folder, top, skip, keyword });
  if (result.error) {
    return ok({ items: [], error: result.error.message }, '获取邮件失败');
  }

  const items = (result.items ?? []).map((e) => ({
    id: e.id,
    subject: e.subject ?? '(无主题)',
    from: {
      name: e.from?.emailAddress?.name ?? '',
      address: e.from?.emailAddress?.address ?? '未知',
    },
    receivedDateTime: e.receivedDateTime,
    bodyPreview: e.bodyPreview ?? '',
    isRead: e.isRead,
    hasAttachments: e.hasAttachments,
  }));

  return ok({ items, total: items.length });
});

// GET /api/accounts/:id/emails/:messageId
emails.get('/:messageId', async (c) => {
  const accountId = parseInt(c.req.param('id')!, 10);
  const messageId = c.req.param('messageId')!;

  const acc = await first<AccountRow>(c.env.DB, 'SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!acc) return notFound('账号不存在');

  const tokenResult = await getTokenAndRefresh(c.env.DB, acc);
  if (!tokenResult.token) {
    return badRequest('Graph API 认证失败');
  }

  const result = await fetchEmailDetail(tokenResult.token, messageId);
  if (result.error) {
    if (result.error.code === 'NOT_FOUND') return notFound('邮件不存在');
    return badRequest(result.error.message);
  }

  const e = result.item!;
  return ok({
    id: e.id,
    subject: e.subject ?? '(无主题)',
    from: {
      name: e.from?.emailAddress?.name ?? '',
      address: e.from?.emailAddress?.address ?? '未知',
    },
    toRecipients: (e.toRecipients ?? []).map((r) => ({
      name: r.emailAddress?.name ?? '',
      address: r.emailAddress?.address ?? '',
    })),
    ccRecipients: (e.ccRecipients ?? []).map((r) => ({
      name: r.emailAddress?.name ?? '',
      address: r.emailAddress?.address ?? '',
    })),
    receivedDateTime: e.receivedDateTime,
    body: e.body,
    bodyPreview: e.bodyPreview ?? '',
    isRead: e.isRead,
    hasAttachments: e.hasAttachments,
  });
});

export default emails;
