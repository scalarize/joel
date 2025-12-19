-- Joel 数据库初始化 SQL
-- 用户表

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL, -- 显示名称（用户可自定义覆盖）
	picture TEXT, -- 头像 URL（用户可自定义覆盖）
	last_login_at TEXT, -- 最后登录时间
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- 迁移：为现有表添加 last_login_at 字段（如果不存在）
-- 如果表已存在但没有该字段，执行以下 SQL：
-- ALTER TABLE users ADD COLUMN last_login_at TEXT;
-- CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

