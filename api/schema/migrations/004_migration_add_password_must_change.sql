-- 迁移脚本：添加 password_must_change 字段（标记用户是否需要修改密码）
-- 执行方式：
-- 本地开发：wrangler d1 execute joel-db --local --file=./schema/migrations/004_migration_add_password_must_change.sql
-- 生产环境：wrangler d1 execute joel-db --file=./schema/migrations/004_migration_add_password_must_change.sql
--
-- 说明：
-- 1. 邀请用户时，password_must_change 设置为 1（true）
-- 2. 用户首次登录后必须修改密码才能访问其他功能
-- 3. 修改密码后，password_must_change 设置为 0（false）

-- 添加 password_must_change 字段（INTEGER，0 或 1）
-- 如果字段已存在，此语句会失败，但可以忽略
ALTER TABLE users ADD COLUMN password_must_change INTEGER DEFAULT 0;

-- 创建索引（可选）
CREATE INDEX IF NOT EXISTS idx_users_password_must_change ON users(password_must_change) WHERE password_must_change = 1;

