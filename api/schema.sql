-- Joel 数据库初始化 SQL
-- 用户表

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL, -- 显示名称（用户可自定义覆盖）
	picture TEXT, -- 头像 URL（用户可自定义覆盖）
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

