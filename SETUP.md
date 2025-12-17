# Joel Google OAuth 配置指南

本文档说明如何配置 Google OAuth 和 Cloudflare D1 数据库。

## 一、Cloudflare 配置

### 1. 创建 D1 数据库

在 Cloudflare Dashboard 中创建 D1 数据库：

```bash
# 使用 Wrangler CLI 创建数据库
wrangler d1 create joel-db
```

创建成功后，会返回数据库 ID，格式类似：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### 2. 更新 wrangler.jsonc

将返回的数据库 ID 更新到 `wrangler.jsonc` 文件中的 `database_id` 字段：

```jsonc
"d1_databases": [
	{
		"binding": "DB",
		"database_name": "joel-db",
		"database_id": "你的数据库ID"  // 替换这里
	}
]
```

### 3. 初始化数据库表结构

在本地开发环境执行 SQL 创建表：

```bash
# 本地开发环境执行
wrangler d1 execute joel-db --local --file=./schema.sql

# 生产环境执行
wrangler d1 execute joel-db --file=./schema.sql
```

或者手动执行 SQL（SQL 语句在 `src/db/schema.ts` 的 `INIT_SQL` 常量中）：

```sql
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	picture TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### 4. 配置环境变量和 Secrets

#### 本地开发环境（.dev.vars 文件）

创建 `.dev.vars` 文件（不要提交到 Git）：

```bash
GOOGLE_CLIENT_ID=你的Google客户端ID
GOOGLE_CLIENT_SECRET=你的Google客户端密钥
BASE_URL=http://localhost:8787
```

#### 生产环境

使用 Wrangler CLI 设置 secrets：

```bash
# 设置 Google OAuth Client ID（环境变量）
wrangler secret put GOOGLE_CLIENT_ID

# 设置 Google OAuth Client Secret（敏感信息，使用 secret）
wrangler secret put GOOGLE_CLIENT_SECRET

# 设置 BASE_URL（环境变量，可选）
wrangler secret put BASE_URL
```

或者在 `wrangler.jsonc` 中添加 `vars` 配置（仅用于非敏感配置）：

```jsonc
"vars": {
	"GOOGLE_CLIENT_ID": "你的Google客户端ID",
	"BASE_URL": "https://你的域名.workers.dev"
}
```

## 二、Google Cloud Console 配置

### 1. 创建 OAuth 2.0 客户端 ID

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 **Google+ API** 或 **Google Identity API**
4. 进入 **API 和凭据** > **凭据**
5. 点击 **创建凭据** > **OAuth 客户端 ID**
6. 选择应用类型：**Web 应用**
7. 配置授权重定向 URI：
   - **本地开发**：`http://localhost:8787/auth/google/callback`
   - **生产环境**：`https://你的域名.workers.dev/auth/google/callback`
8. 创建后，保存 **客户端 ID** 和 **客户端密钥**

### 2. OAuth 同意屏幕配置

1. 在 Google Cloud Console 中，进入 **OAuth 同意屏幕**
2. 选择用户类型（内部或外部）
3. 填写应用信息：
   - 应用名称：Joel
   - 用户支持电子邮件
   - 开发者联系信息
4. 添加作用域：
   - `openid`
   - `email`
   - `profile`
5. 添加测试用户（如果应用处于测试模式）

## 三、部署和测试

### 1. 本地开发

```bash
# 启动开发服务器
npm run dev
```

访问 `http://localhost:8787` 测试登录功能。

### 2. 部署到生产环境

```bash
# 部署 Worker
npm run deploy
```

部署后，访问你的 Worker URL 测试登录功能。

## 四、验证清单

- [ ] D1 数据库已创建并配置
- [ ] 数据库表结构已初始化
- [ ] Google OAuth 客户端 ID 和密钥已配置
- [ ] Google OAuth 重定向 URI 已配置正确
- [ ] 本地开发环境变量已配置（.dev.vars）
- [ ] 生产环境 secrets 已设置
- [ ] 本地测试登录功能正常
- [ ] 生产环境登录功能正常

## 五、故障排查

### 问题：OAuth 回调失败

- 检查重定向 URI 是否与 Google Console 中配置的一致
- 检查 `BASE_URL` 环境变量是否正确
- 查看 Worker 日志中的错误信息

### 问题：数据库操作失败

- 确认 D1 数据库绑定配置正确
- 确认数据库表结构已创建
- 检查数据库权限设置

### 问题：会话无法保持

- 检查 Cookie 设置是否正确
- 确认 `HttpOnly` 和 `SameSite` 设置
- 生产环境需要 `Secure` 标志（HTTPS）

## 六、安全注意事项

1. **不要将 `.dev.vars` 文件提交到 Git**
2. **使用 Wrangler secrets 存储敏感信息**
3. **生产环境必须使用 HTTPS**
4. **定期轮换 OAuth 客户端密钥**
5. **限制 OAuth 同意屏幕的测试用户范围**

