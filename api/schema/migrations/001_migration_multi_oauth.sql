-- 迁移脚本：多 OAuth 架构支持
-- 执行方式：
-- 本地开发：wrangler d1 execute joel-db --local --file=./schema/migrations/001_migration_multi_oauth.sql
-- 生产环境：wrangler d1 execute joel-db --file=./schema/migrations/001_migration_multi_oauth.sql
--
-- 注意：此迁移脚本会：
-- 1. 创建 oauth_accounts 表
-- 2. 将现有 users 表的 id 从 Google user ID 迁移为 UUID
-- 3. 为每个现有用户创建对应的 oauth_accounts 记录
--
-- 重要：在生产环境执行前，请先备份数据库！

-- Step 1: 创建 oauth_accounts 表
CREATE TABLE IF NOT EXISTS oauth_accounts (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	provider TEXT NOT NULL,              -- 'google' | 'qq'
	provider_user_id TEXT NOT NULL,      -- OAuth 提供商的用户 ID
	email TEXT,                          -- OAuth 账号的邮箱（可能为空）
	name TEXT,
	picture TEXT,
	access_token TEXT,
	refresh_token TEXT,
	token_expires_at TEXT,
	linked_at TEXT NOT NULL DEFAULT (datetime('now')),  -- 关联时间
	linked_method TEXT NOT NULL DEFAULT 'auto',          -- 'auto' | 'manual'
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE(provider, provider_user_id),
	FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Step 2: 创建索引
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user_id ON oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email ON oauth_accounts(email);

-- Step 3: 迁移现有用户数据
-- 注意：由于 SQLite 不支持直接修改主键，需要在应用层进行迁移
-- 此脚本只创建表结构，实际数据迁移需要通过应用层脚本完成
-- 详见：docs/multi-oauth-implementation-guide.md

-- 迁移说明：
-- 1. 现有 users 表的 id 是 Google user ID（字符串）
-- 2. 需要为每个用户生成新的 UUID
-- 3. 创建对应的 oauth_accounts 记录（provider='google'）
-- 4. 更新所有引用 users.id 的地方（如果有外键）
--
-- 由于 SQLite 的限制，建议使用应用层脚本进行迁移：
-- - 读取所有现有用户
-- - 为每个用户生成 UUID
-- - 创建新用户记录（临时表或直接更新）
-- - 创建 oauth_accounts 记录
-- - 更新相关数据


