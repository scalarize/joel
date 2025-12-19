-- 迁移脚本：添加 last_login_at 字段
-- 执行方式：
-- 本地开发：wrangler d1 execute joel-db --local --file=./migration_add_last_login_at.sql
-- 生产环境：wrangler d1 execute joel-db --file=./migration_add_last_login_at.sql

-- 检查字段是否存在（SQLite 不支持 IF NOT EXISTS for ALTER TABLE）
-- 如果字段已存在，此语句会失败，但可以忽略

-- 添加 last_login_at 字段
ALTER TABLE users ADD COLUMN last_login_at TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

