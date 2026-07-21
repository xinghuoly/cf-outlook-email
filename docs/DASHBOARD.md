# 界面部署教程（无需命令行）

本教程介绍如何通过 Cloudflare 仪表盘界面部署项目，**无需使用命令行工具**，适合不想暴露敏感信息（如 `database_id`）到 GitHub 的用户。

## 目录

- [前置准备](#前置准备)
- [第一步：创建 Cloudflare 账号](#第一步创建-cloudflare-账号)
- [第二步：创建 Worker 项目](#第二步创建-worker-项目)
- [第三步：设置环境变量](#第三步设置环境变量)
- [第四步：创建并绑定数据库](#第四步创建并绑定数据库)
- [第五步：初始化数据库](#第五步初始化数据库)
- [第六步：添加自定义域（可选）](#第六步添加自定义域可选)
- [第七步：测试部署](#第七步测试部署)
- [界面部署 vs 命令行部署](#界面部署-vs-命令行部署)
- [常见问题](#常见问题)

---

## 前置准备

你需要：

1. **一个 Cloudflare 账号**（免费注册：[dash.cloudflare.com](https://dash.cloudflare.com/)）
2. **一个 GitHub 账号**（用于 Fork 项目）

> 💡 界面部署完全不需要安装 Node.js、pnpm 或 Wrangler 命令行工具。

---

## 第一步：创建 Cloudflare 账号

1. 访问 [dash.cloudflare.com](https://dash.cloudflare.com/)
2. 点击 **Sign Up** 注册账号
3. 完成注册后登录

---

## 第二步：创建 Worker 项目

### 2.1 Fork 项目到你的 GitHub

1. 访问项目仓库：https://github.com/xinghuoly/cf-outlook-email
2. 点击右上角的 **Fork** 按钮，将项目 Fork 到你的 GitHub 账号

### 2.2 在 Cloudflare 创建 Worker

1. 登录 Cloudflare 仪表盘
2. 左侧菜单选择 **Workers & Pages**
3. 点击 **Create application**
4. 选择 **Workers** 标签页
5. 点 **Get started** 下的 **Create Worker**
6. 给 Worker 起个名字（如 `outlook-email`），点击 **Deploy**

> 此时会部署一个默认的 Hello World 页面，我们稍后会替换它。

> 💡 **说明**：项目中已包含 `wrangler.toml` 文件，包含了基本的构建配置。`database_id` 为空，需要在下一步绑定数据库时在 Cloudflare 仪表盘中配置。

---

## 第三步：设置环境变量

部署成功后，需要设置必要的环境变量（对应 `wrangler.toml` 中的配置）：

1. 在 Worker 详情页，点击 **Settings** 标签
2. 点击左侧 **Variables and Secrets**
3. 在 **Environment Variables** 部分，点击 **Add variable**

需要添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `ADMIN_PASSWORD` | 你的登录密码 | 管理员登录密码 |
| `COOKIE_SECRET` | 随机字符串（至少32位） | Cookie 加密密钥 |
| `JWT_SECRET` | 随机字符串（至少32位） | 数据库初始化密钥 |

> ⚠️ **重要**：`ADMIN_PASSWORD`、`COOKIE_SECRET` 和 `JWT_SECRET` 必须设为 **Secret** 类型（点击变量名右边的锁图标），而不是普通变量。

**如何生成密钥**：
- 在键盘上随机敲一串字符，如：`aK3mX9pQ2wE8rT6yU1iO4sD7fG0hJ5l`
- 或者使用在线密码生成器
- 建议每个密钥使用不同的值

可选变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GPTMAIL_API_KEY` | 你的 API Key | 临时邮箱功能（可选） |

---

## 第四步：创建并绑定数据库

### 4.1 创建 D1 数据库

1. 在 Cloudflare 仪表盘左侧菜单，点击 **Workers & Pages** → **D1 SQL databases**
2. 点击 **Create database**
3. 数据库名称填写 `outlook-email-db`
4. 选择一个离你用户最近的位置（如 Hong Kong 或 Tokyo）
5. 点击 **Create database**

创建成功后，**复制显示的 Database ID**（备用）。

### 4.2 绑定数据库到 Worker

1. 返回 Worker 详情页
2. 点击 **Settings** 标签
3. 点击左侧 **Bindings**
4. 在 **D1 Database Bindings** 部分，点击 **Add binding**
5. 填写：
   - Variable name: `DB`（必须是 DB）
   - D1 database: 选择刚才创建的 `outlook-email-db`
6. 点击 **Save**

---

## 第五步：初始化数据库

数据库绑定后，需要运行初始化脚本创建表结构。由于界面部署无法直接运行命令行，我们可以通过部署一个临时脚本来完成。

### 方法一：使用已部署的初始化端点（推荐）

项目已内置数据库初始化接口。部署后访问以下 URL 即可自动初始化（将 `你的JWT_SECRET` 替换为你在第三步设置的 `JWT_SECRET` 值）：

```
https://你的-worker-域名/api/init/你的JWT_SECRET
```

> ⚠️ 注意：首次访问时可能需要等待几秒，因为需要先完成部署。
> 
> 💡 `JWT_SECRET` 用于保护初始化端点，防止恶意访问。初始化完成后，建议在生产环境中删除此环境变量。

### 方法二：通过 Wrangler 控制台初始化（备用）

如果方法一不工作，可以在 Cloudflare 仪表盘的 **Workers & Pages** → 你的 Worker → **Logs &** → **Interactive Playground** 中执行：

```javascript
// 在 Playground 中执行以下代码（使用 prepare().run() 逐个执行）
const db = env.DB;

await db.prepare(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

await db.prepare(`CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#2563eb',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

await db.prepare(`CREATE TABLE IF NOT EXISTS accounts (
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
)`).run();

await db.prepare(`CREATE TABLE IF NOT EXISTS temp_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

await db.prepare(`CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

await db.prepare(`CREATE TABLE IF NOT EXISTS account_tags (
  account_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (account_id, tag_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
)`).run();

await db.prepare(`CREATE INDEX IF NOT EXISTS idx_account_tags_tag ON account_tags(tag_id)`).run();

await db.prepare(`CREATE TABLE IF NOT EXISTS push_state (
  account_id INTEGER PRIMARY KEY,
  last_pushed_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
)`).run();

// Insert default group if not exists
const defaultGroup = await db.prepare('SELECT id FROM groups WHERE id = 1').first();
if (!defaultGroup) {
  await db.prepare('INSERT INTO groups (id, name, description, color) VALUES (?, ?, ?, ?)').bind(
    1, '默认分组', '默认邮箱分组', '#2563eb'
  ).run();
}
```

---

## 第六步：添加自定义域（可选）

如果你想用自己的域名而不是 `workers.dev` 子域名：

1. 确保你的域名已添加到 Cloudflare（[域名接入教程](https://www.cloudflare.com/learning/dns/glossary/dns-domain-name/)）
2. 在 Worker 详情页，点击 **Settings** → **Domains & Routes**
3. 点击 **Add** → **Custom domain**
4. 输入你的域名（如 `mail.example.com`）
5. Cloudflare 会自动配置 DNS 记录和 SSL 证书

---

## 第七步：测试部署

1. 访问你的 Worker URL（`https://outlook-email.你的用户名.workers.dev` 或你的自定义域名）
2. 使用第三步设置的 `ADMIN_PASSWORD` 登录
3. 登录成功后，点击 **"+ 添加账号"** 添加你的 Outlook 邮箱

---

## 界面部署 vs 命令行部署

| 特性 | 界面部署 | 命令行部署 |
|------|----------|------------|
| 需要安装工具 | ❌ 不需要 | ✅ 需要 Node.js, pnpm |
| 敏感信息暴露 | ❌ 不会 | ⚠️ 可能（如 database_id） |
| 部署速度 | ⚠️ 较慢（需多次点击） | ✅ 快（一条命令） |
| 自动化部署 | ❌ 不支持 | ✅ 支持 |
| 更新项目 | ⚠️ 需手动重新部署 | ✅ `pnpm run deploy` |
| 适合人群 | 普通用户、隐私敏感用户 | 开发者 |

**选择建议**：
- 如果你是普通用户，只想用这个工具管理邮箱 → **界面部署**
- 如果你是开发者，需要频繁更新或自定义开发 → **命令行部署**

---

## 常见问题

### Q: 部署后访问报 500 错误

**原因**：通常是以下三种情况之一：

1. **数据库未初始化**：请确保执行了第五步的数据库初始化
2. **环境变量未设置**：检查 `ADMIN_PASSWORD` 和 `COOKIE_SECRET` 是否已设置
3. **数据库绑定错误**：确认变量名是 `DB`（大写），且选择了正确的数据库

### Q: 界面部署后如何更新项目？

当项目有新版本时：

1. 在 GitHub 上 Pull 你的 Fork
2. 在 Cloudflare 仪表盘，进入你的 Worker
3. 点击 **Create new version**
4. 选择 **Upload** 或连接 GitHub 自动部署

### Q: `COOKIE_SECRET` 怎么生成？

最简单的方法：在键盘上随机敲 32 位以上的字符，如：
```
aK3mX9pQ2wE8rT6yU1iO4sD7fG0hJ5l
```

### Q: 界面部署能否使用 Telegram 推送功能？

可以。在 Worker 详情页 → **Settings** → **Variables and Secrets** 中添加：

| 变量名 | 值 |
|--------|-----|
| `TELEGRAM_BOT_TOKEN` | 你的 Bot Token |
| `TELEGRAM_CHAT_ID` | 你的 Chat ID |

### Q: 数据库初始化报错怎么办？

如果自动初始化失败，可以在 Cloudflare 仪表盘的 **D1 SQL databases** 中手动执行 SQL：

1. 进入 `outlook-email-db` 数据库
2. 点击 **Console** 标签
3. 执行上述第五步中的 SQL 语句

---

## 下一步

- [添加邮箱账号](./GUIDE.md#第八步添加邮箱账号)
- [配置 Telegram 推送](./GUIDE.md#telegram-推送新邮件可选)
- [对外 API 使用](./API.md)