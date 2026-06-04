import { Hono } from 'hono';
import type { Env } from './types';
import { authMiddleware } from './auth';
import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import accountRoutes from './routes/accounts';
import emailRoutes from './routes/emails';
import settingRoutes from './routes/settings';
import tempEmailRoutes from './routes/tempEmails';
import oauthRoutes from './routes/oauth';

const app = new Hono<{ Bindings: Env }>();

// Auth routes (no middleware)
app.route('/api/auth', authRoutes);

// OAuth callback (no auth middleware - handles redirect from Microsoft)
app.route('/api/oauth', oauthRoutes);

// Protected API routes
app.use('/api/*', authMiddleware());
app.route('/api/groups', groupRoutes);
app.route('/api/accounts', accountRoutes);
app.route('/api/accounts/:id/emails', emailRoutes);
app.route('/api/settings', settingRoutes);
app.route('/api/temp-emails', tempEmailRoutes);

export default app;
