-- 迁移脚本：添加 password_hash 字段支持密码登录（邀请注册制）
-- 执行方式：
-- 本地开发：wrangler d1 execute joel-db --local --file=./schema/migrations/003_migration_add_password_hash.sql
-- 生产环境：wrangler d1 execute joel-db --file=./schema/migrations/003_migration_add_password_hash.sql
--
-- 注意：
-- 1. 此字段为可选字段，用户可以通过 OAuth 登录（不需要密码）
-- 2. 采用邀请注册制：只有管理员预先在 users 表中设置了 password_hash 的用户才能使用密码登录
-- 3. 管理员需要手动为新用户设置 password_hash（使用密码哈希工具生成）

-- 添加 password_hash 字段（用于存储密码的哈希值）
-- 如果字段已存在，此语句会失败，但可以忽略
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- 创建索引（可选，用于快速查找有密码的用户）
CREATE INDEX IF NOT EXISTS idx_users_password_hash ON users(password_hash) WHERE password_hash IS NOT NULL;

