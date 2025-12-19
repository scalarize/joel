-- 迁移脚本：添加 is_banned 字段（标记用户是否被封禁）
-- 执行方式：
-- 本地开发：wrangler d1 execute joel-db --local --file=./migration_add_user_banned.sql
-- 生产环境：wrangler d1 execute joel-db --file=./migration_add_user_banned.sql
--
-- 说明：
-- 1. is_banned 字段为 INTEGER，0 表示未封禁，1 表示已封禁
-- 2. 封禁的用户无法登录系统
-- 3. 管理员可以通过管理界面封禁/解封用户

-- 添加 is_banned 字段（INTEGER，0 或 1）
-- 如果字段已存在，此语句会失败，但可以忽略
ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0;

-- 创建索引（可选）
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned) WHERE is_banned = 1;

