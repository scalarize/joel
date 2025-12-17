# 多 OAuth 提供商架构设计

## 概述

本文档描述如何将 Joel 从单一 Google OAuth 支持扩展为支持多个 OAuth 提供商（Google、GitHub、Microsoft 等），并实现不同平台的 OAuth 账号映射到同一个用户。

## 核心设计原则

1. **用户身份分离**：将用户主身份（User）与 OAuth 账号身份（OAuthAccount）分离
2. **Email 匹配策略**：通过 email 自动识别和关联同一用户的不同 OAuth 账号
3. **向后兼容**：保持现有 API 和数据结构尽可能不变，最小化迁移成本

## 数据库设计

### 1. `users` 表（主用户表）

存储用户的核心信息，使用内部生成的 UUID 作为主键。

```sql
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,                    -- 内部生成的 UUID（不再是 OAuth ID）
	email TEXT NOT NULL UNIQUE,             -- 主邮箱（用于关联不同 OAuth 账号）
	name TEXT NOT NULL,                     -- 显示名称（用户可自定义覆盖）
	picture TEXT,                           -- 头像 URL（用户可自定义覆盖）
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**变更说明**：
- `id` 从 OAuth user ID 改为内部 UUID
- `email` 保持 UNIQUE，用于识别同一用户

### 2. `oauth_accounts` 表（OAuth 账号关联表）

存储不同 OAuth 提供商的账号信息，关联到主用户。

```sql
CREATE TABLE IF NOT EXISTS oauth_accounts (
	id TEXT PRIMARY KEY,                    -- 内部生成的 UUID
	user_id TEXT NOT NULL,                  -- 关联到 users.id
	provider TEXT NOT NULL,                 -- OAuth 提供商：'google', 'github', 'microsoft' 等
	provider_user_id TEXT NOT NULL,         -- OAuth 提供商的用户 ID
	email TEXT NOT NULL,                    -- OAuth 账号的邮箱（可能与 users.email 不同）
	name TEXT,                              -- OAuth 提供的名称
	picture TEXT,                           -- OAuth 提供的头像
	access_token TEXT,                     -- 访问令牌（加密存储）
	refresh_token TEXT,                     -- 刷新令牌（加密存储）
	token_expires_at TEXT,                  -- 令牌过期时间
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE(provider, provider_user_id),    -- 同一提供商的同一账号只能关联一次
	FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user_id ON oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email ON oauth_accounts(email);
```

**字段说明**：
- `provider`: OAuth 提供商标识（'google', 'github', 'microsoft' 等）
- `provider_user_id`: 该提供商返回的用户唯一标识
- `email`: 该 OAuth 账号的邮箱（可能与主用户邮箱不同，例如用户有多个邮箱）
- `UNIQUE(provider, provider_user_id)`: 确保同一提供商的同一账号不会被重复关联

## 用户关联策略

### 策略 1：Email 自动匹配（推荐）

**流程**：
1. 用户使用 OAuth 提供商 A 登录
2. 系统检查是否存在相同 email 的用户
   - 如果存在：将 OAuth 账号关联到该用户
   - 如果不存在：创建新用户，并关联该 OAuth 账号
3. 用户使用 OAuth 提供商 B 登录（相同 email）
4. 系统找到已有用户，将新的 OAuth 账号关联到该用户

**优点**：
- 自动化，无需用户手动操作
- 符合用户直觉（同一邮箱 = 同一人）

**缺点**：
- 如果用户在不同 OAuth 提供商使用不同邮箱，无法自动关联
- 需要处理邮箱验证（某些 OAuth 提供商可能不验证邮箱）

### 策略 2：手动关联（可选扩展）

允许用户在个人设置中手动关联多个 OAuth 账号。

**实现**：
- 添加 `/api/profile/link-oauth` 端点
- 用户可以选择"添加账号"并授权新的 OAuth 提供商
- 系统验证后关联到当前用户

## 登录流程

### 当前流程（单 OAuth）

```
用户点击登录 → 跳转到 Google OAuth → Callback → 创建/更新用户 → 设置 Session
```

### 新流程（多 OAuth）

```
用户选择 OAuth 提供商 → 跳转到对应 OAuth → Callback → 
  1. 查找或创建 OAuth 账号记录
  2. 通过 email 查找或创建用户
  3. 关联 OAuth 账号到用户
  4. 设置 Session（使用 user.id）
```

## Session 管理

Session 中存储 `user_id`（主用户 ID），而不是 OAuth 账号 ID。

```typescript
interface SessionData {
	userId: string;      // users.id（UUID）
	email: string;       // 主邮箱
	name: string;        // 显示名称
}
```

## API 变更

### 保持不变的 API

- `GET /api/me` - 返回用户信息（基于 user_id）
- `GET /api/profile` - 返回用户资料
- `PUT /api/profile` - 更新用户资料
- `GET /api/logout` - 登出

### 新增 API

- `GET /api/auth/{provider}` - 通用 OAuth 授权入口
  - 例如：`/api/auth/google`, `/api/auth/github`
- `GET /api/auth/{provider}/callback` - OAuth 回调处理
- `GET /api/profile/oauth-accounts` - 获取用户关联的所有 OAuth 账号
- `POST /api/profile/unlink-oauth` - 解绑 OAuth 账号（需至少保留一个）

## 迁移方案

### 步骤 1：数据库迁移

1. 创建 `oauth_accounts` 表
2. 将现有 `users` 表的 `id` 从 Google user ID 迁移为 UUID
3. 为每个现有用户创建对应的 `oauth_accounts` 记录

### 步骤 2：代码迁移

1. 更新 `upsertUser` 逻辑，改为通过 email 查找或创建用户
2. 创建 `upsertOAuthAccount` 函数
3. 更新 OAuth callback 处理逻辑
4. 更新 Session 管理（使用新的 user.id）

### 步骤 3：向后兼容

- 保持现有 API 路径和响应格式
- 确保现有用户数据迁移后仍可正常登录

## 安全考虑

1. **Token 存储**：OAuth access_token 和 refresh_token 应加密存储
2. **邮箱验证**：优先使用已验证的邮箱进行关联
3. **账号解绑**：用户解绑 OAuth 账号时，需确保至少保留一个可用的 OAuth 账号
4. **CSRF 防护**：保持现有的 state 参数验证

## 扩展性

### 添加新的 OAuth 提供商

1. 在 `auth/` 目录下创建新的提供商模块（如 `github.ts`）
2. 实现标准的 OAuth 流程函数：
   - `generateAuthUrl()`
   - `exchangeCodeForToken()`
   - `getUserInfo()`
3. 在路由中添加对应的处理函数
4. 更新前端，添加新的登录按钮

### 支持自定义 OAuth 提供商

通过配置化的方式支持任意 OAuth 2.0 提供商。

## 示例场景

### 场景 1：用户首次用 Google 登录

1. 用户点击"使用 Google 登录"
2. 跳转到 Google OAuth
3. Callback 返回：`email: user@example.com`, `id: google_123`
4. 系统检查：不存在 `user@example.com` 的用户
5. 创建新用户：`user_id = uuid-1`, `email = user@example.com`
6. 创建 OAuth 账号：`provider = 'google'`, `provider_user_id = 'google_123'`, `user_id = uuid-1`
7. 设置 Session：`userId = uuid-1`

### 场景 2：同一用户用 GitHub 登录（相同邮箱）

1. 用户点击"使用 GitHub 登录"
2. 跳转到 GitHub OAuth
3. Callback 返回：`email: user@example.com`, `id: github_456`
4. 系统检查：存在 `user@example.com` 的用户（uuid-1）
5. 创建 OAuth 账号：`provider = 'github'`, `provider_user_id = 'github_456'`, `user_id = uuid-1`
6. 设置 Session：`userId = uuid-1`（与 Google 登录相同）

### 场景 3：用户再次用 Google 登录

1. 用户点击"使用 Google 登录"
2. Callback 返回：`email: user@example.com`, `id: google_123`
3. 系统检查：存在 `provider = 'google'` 且 `provider_user_id = 'google_123'` 的 OAuth 账号
4. 更新 OAuth 账号的 token 信息
5. 更新用户信息（name, picture）
6. 设置 Session：`userId = uuid-1`

## 实现优先级

### Phase 1：核心架构（必需）
- [ ] 数据库 Schema 迁移
- [ ] 用户关联逻辑（Email 匹配）
- [ ] OAuth 账号管理函数
- [ ] 更新 Google OAuth 流程

### Phase 2：多提供商支持（扩展）
- [ ] GitHub OAuth 支持
- [ ] Microsoft OAuth 支持
- [ ] 前端多登录选项

### Phase 3：高级功能（可选）
- [ ] 手动关联 OAuth 账号
- [ ] OAuth 账号解绑
- [ ] Token 自动刷新
- [ ] 账号合并工具

